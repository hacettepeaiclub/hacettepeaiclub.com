"""Topluluk üye listesi ve indirim sayfasındaki üyelik doğrulaması.

Akış:
  1. Admin, topluluk yönetim sisteminden indirdiği Excel dosyasını
     `POST /members/import` ile yükler. Liste tam senkronize edilir.
  2. Ziyaretçi, indirimler.html sayfasında Hacettepe e-postasını girer;
     `POST /members/verify` yalnızca "aktif üye mi" ve "adı ne" bilgisini döner.

Gizlilik notu: Excel'deki telefon numarası sütunu hiç okunmaz ve saklanmaz.
Doğrulama rotası yalnızca tam eşleşen bir kullanıcı adı için ad-soyad döndürür;
liste hiçbir şekilde herkese açık olarak dökülemez (listeleme rotaları JWT ister).
"""

import io
import re
from datetime import datetime
from typing import List, Optional

from fastapi import (APIRouter, Depends, File, HTTPException, Query, Request,
                     UploadFile, status)
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from database import get_session
from models import Member
from security import get_current_user, limiter

router = APIRouter(
    prefix="/members",
    tags=["Members (Üye Listesi / İndirim Doğrulama)"]
)

#: Üye e-postalarının zorunlu alan adı.
MEMBER_EMAIL_DOMAIN = "hacettepe.edu.tr"

#: Excel'de "Adı Soyadı" hücresi "AD SOYAD<çok boşluk>nickname" biçimindedir.
NAME_NICK_SEPARATOR = re.compile(r"\s{2,}")

#: Hacettepe e-posta kullanıcı adlarında görülen karakterler.
NICKNAME_PATTERN = re.compile(r"^[a-z0-9._-]{2,64}$")

#: Yalnızca bu durumdaki başvurular üye sayılır (Excel'deki "Durum" sütunu).
APPROVED_STATUS = "onaylı"

ALLOWED_EXTENSIONS = {".xlsx", ".xlsm"}
MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

# ---------------------------------------------------------------------------
#  Türkçe büyük/küçük harf yardımcıları
# ---------------------------------------------------------------------------
# Python'un .lower() / .title() metotları Türkçe'ye duyarsızdır: "I" → "i"
# (olması gereken "ı") ve "İ" → "i̇" (birleşen noktalı, bozuk). Bu yüzden iki
# harf elle eşlenir, kalanı standart metotlara bırakılır.
_TR_TO_LOWER = str.maketrans({"I": "ı", "İ": "i"})
_TR_TO_UPPER = str.maketrans({"i": "İ", "ı": "I"})


def tr_lower(text: str) -> str:
    """Türkçe kurallarıyla küçük harfe çevirir (I→ı, İ→i)."""
    return text.translate(_TR_TO_LOWER).lower()


def tr_title(text: str) -> str:
    """'ABDULKADİR CEZLAN' → 'Abdulkadir Cezlan'.

    Excel'den gelen adlar tamamı büyük harf olduğu için sayfada bağırıyor;
    gösterime uygun hâle getirilir.
    """
    return " ".join(
        word[:1].translate(_TR_TO_UPPER).upper() + word[1:]
        for word in tr_lower(text).split()
    )


# ---------------------------------------------------------------------------
#  E-posta → kullanıcı adı
# ---------------------------------------------------------------------------
def nickname_from_email(raw: str) -> str:
    """Girilen e-postadan (ya da yalın kullanıcı adından) nickname çıkarır.

    Kullanıcı telefonda "@hacettepe.edu.tr" kısmını yazmak zorunda kalmasın
    diye yalın kullanıcı adı da kabul edilir.

    DİKKAT: Burada tr_lower() KULLANILMAZ. E-posta adresleri ASCII'dir ve
    Türkçe kuralı "I" harfini "ı" yapar; telefon klavyesi adresi büyük harfle
    başlattığında ya da kullanıcı tamamını büyük yazdığında
    "ABDULKADIRCEZLAN25" → "abdulkadırcezlan25" olup eşleşme kaçardı.
    """
    value = (raw or "").strip().lower()

    if "@" in value:
        local, _, domain = value.partition("@")
        if domain != MEMBER_EMAIL_DOMAIN and not domain.endswith("." + MEMBER_EMAIL_DOMAIN):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Lütfen @{MEMBER_EMAIL_DOMAIN} uzantılı e-posta adresinizi girin."
            )
        value = local

    if not NICKNAME_PATTERN.match(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="E-posta adresi okunamadı. Örnek: adsoyad26@hacettepe.edu.tr"
        )

    return value


# ---------------------------------------------------------------------------
#  Excel ayrıştırma
# ---------------------------------------------------------------------------
def _cell_text(value) -> str:
    return "" if value is None else str(value).strip()


def _locate_header(rows: List[list]) -> tuple:
    """Başlık satırını ve ihtiyaç duyulan sütun indekslerini bulur.

    Dosyanın ilk satırı başlık değil (dosya adı yazıyor) ve sütun sırası
    değişebilir; bu yüzden başlık sabit bir satır numarası varsayılmaz,
    ilk 10 satırda "Adı Soyadı" hücresi aranır.
    """
    for index, row in enumerate(rows[:10]):
        labels = {position: tr_lower(_cell_text(cell)) for position, cell in enumerate(row)}

        name_column = next((pos for pos, text in labels.items() if text in ("adı soyadı", "ad soyad")), None)
        if name_column is None:
            continue

        faculty_column = next((pos for pos, text in labels.items() if "fakülte" in text or "program" in text), None)
        status_column = next((pos for pos, text in labels.items() if "durum" in text), None)
        return index, name_column, faculty_column, status_column

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail='Excel dosyasında "Adı Soyadı" başlıklı sütun bulunamadı. '
               'Lütfen topluluk sisteminden indirdiğiniz dosyayı değiştirmeden yükleyin.'
    )


def parse_member_workbook(content: bytes) -> tuple:
    """Excel içeriğini (nickname, ad, fakülte) kayıtlarına çevirir.

    @return (kayıtlar, özet) — özet: satır sayısı ve atlama gerekçeleri.
    """
    try:
        import openpyxl
    except ImportError:  # pragma: no cover - kurulum eksikse anlaşılır mesaj
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sunucuda openpyxl kurulu değil. requirements.txt kurulumunu tekrarlayın."
        )

    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    except Exception as exc:
        print(f"!!! MEMBER IMPORT PARSE ERROR !!!: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Excel dosyası okunamadı. Dosya bozuk olabilir ya da .xlsx biçiminde değil."
        )

    try:
        sheet = workbook.worksheets[0]
        rows = [list(row) for row in sheet.iter_rows(values_only=True)]
    finally:
        workbook.close()

    header_index, name_column, faculty_column, status_column = _locate_header(rows)

    records = {}
    summary = {
        "file_rows": 0,
        "skipped_empty": 0,
        "skipped_no_nickname": 0,
        "skipped_not_approved": 0,
        "duplicates": 0,
    }

    for row in rows[header_index + 1:]:
        raw_name = _cell_text(row[name_column]) if name_column < len(row) else ""
        if not raw_name:
            summary["skipped_empty"] += 1
            continue

        summary["file_rows"] += 1

        # Durum sütunu varsa yalnızca onaylı başvurular alınır.
        if status_column is not None and status_column < len(row):
            row_status = tr_lower(_cell_text(row[status_column]))
            if row_status and row_status != APPROVED_STATUS:
                summary["skipped_not_approved"] += 1
                continue

        # "AD SOYAD<çok boşluk>nickname" → son parça kullanıcı adı, kalanı ad.
        # Ad içinde de çift boşluk olabileceği için son parça esas alınır.
        parts = [part for part in NAME_NICK_SEPARATOR.split(raw_name) if part]
        if len(parts) < 2:
            summary["skipped_no_nickname"] += 1
            continue

        # Kullanıcı adı bir e-posta yerel kısmıdır: ASCII küçültme (bkz.
        # nickname_from_email içindeki uyarı). Ad ise Türkçe kurallarıyla.
        nickname = parts[-1].strip().lower()
        full_name = tr_title(" ".join(parts[:-1]))

        if not NICKNAME_PATTERN.match(nickname) or not full_name:
            summary["skipped_no_nickname"] += 1
            continue

        faculty = None
        if faculty_column is not None and faculty_column < len(row):
            raw_faculty = _cell_text(row[faculty_column])
            if raw_faculty:
                # "FAKÜLTE (310)<çok boşluk>PROGRAM (357)" → "FAKÜLTE (310) / PROGRAM (357)"
                faculty = " / ".join(part for part in NAME_NICK_SEPARATOR.split(raw_faculty) if part)

        # Çift kayıtlar (çift anadal vb.) tek üyeye indirilir; ilk satır esastır.
        if nickname in records:
            summary["duplicates"] += 1
            continue

        records[nickname] = {"nickname": nickname, "full_name": full_name, "faculty": faculty}

    return list(records.values()), summary


# ---------------------------------------------------------------------------
#  Rotalar
# ---------------------------------------------------------------------------
class VerifyRequest(BaseModel):
    email: str


@router.post("/verify")
# Liste dökümünü engellemek için IP başına sınır. Kampüs Wi-Fi'ında birden fazla
# öğrenci aynı IP'den çıkabildiği için makul bir üst değer seçilmiştir.
@limiter.limit("30/minute")
async def verify_member(
        request: Request,
        data: VerifyRequest,
        session: AsyncSession = Depends(get_session)
):
    """Girilen e-posta aktif bir üyeye ait mi? Yanıt yalnızca ad-soyad içerir."""
    nickname = nickname_from_email(data.email)

    result = await session.execute(
        select(Member).where(Member.nickname == nickname, Member.is_active == True)  # noqa: E712
    )
    member = result.scalar_one_or_none()

    if not member:
        return {"is_member": False, "full_name": None}

    return {"is_member": True, "full_name": member.full_name, "nickname": member.nickname}


@router.post("/import")
async def import_members(
        file: UploadFile = File(...),
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    """Excel dosyasını yükleyip üye listesini TAM senkronize eder.

    Dosyada bulunan üyeler eklenir/güncellenir, dosyada bulunmayanlar pasife
    alınır (silinmez). Yanlış dosya yüklenirse doğru dosyayı tekrar yüklemek
    eski hâle döndürür.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Dosya adı okunamadı. Lütfen dosyayı tekrar seçin.")

    extension = ("." + file.filename.rsplit(".", 1)[-1].lower()) if "." in file.filename else ""
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Geçersiz dosya formatı ({extension or 'uzantısız'}). "
                   f"İzin verilenler: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Yüklenen dosya boş.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Dosya çok büyük ({len(content) / 1024 / 1024:.1f} MB). "
                   f"En fazla {MAX_FILE_SIZE_MB} MB yükleyebilirsiniz."
        )

    records, summary = parse_member_workbook(content)

    # Boş bir liste tüm üyeleri pasife alırdı; bu neredeyse her zaman yanlış
    # dosya yüklendiği anlamına gelir, bu yüzden hiç dokunmadan reddedilir.
    if not records:
        raise HTTPException(
            status_code=400,
            detail="Dosyada geçerli üye satırı bulunamadı; liste değiştirilmedi. "
                   'Her satırın "Adı Soyadı" hücresinde addan sonra kullanıcı adı olmalı.'
        )

    result = await session.execute(select(Member))
    existing = {member.nickname: member for member in result.scalars().all()}

    now = datetime.now()
    added = updated = deactivated = 0

    for record in records:
        member = existing.get(record["nickname"])
        if member is None:
            session.add(Member(
                nickname=record["nickname"],
                full_name=record["full_name"],
                faculty=record["faculty"],
                is_active=True,
                updated_at=now,
            ))
            added += 1
            continue

        if (member.full_name != record["full_name"]
                or member.faculty != record["faculty"]
                or not member.is_active):
            updated += 1

        member.full_name = record["full_name"]
        member.faculty = record["faculty"]
        member.is_active = True
        member.updated_at = now
        session.add(member)

    incoming = {record["nickname"] for record in records}
    for nickname, member in existing.items():
        if nickname not in incoming and member.is_active:
            member.is_active = False
            member.updated_at = now
            session.add(member)
            deactivated += 1

    await session.commit()

    active_total = await session.scalar(
        select(func.count()).select_from(Member).where(Member.is_active == True)  # noqa: E712
    )

    return {
        "message": f"{len(records)} üye işlendi.",
        "parsed": len(records),
        "added": added,
        "updated": updated,
        "deactivated": deactivated,
        "active_total": active_total,
        **summary,
    }


@router.get("/stats")
async def member_stats(
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    """Admin panelindeki özet kutusu için üye sayıları ve son güncelleme."""
    total = await session.scalar(select(func.count()).select_from(Member))
    active = await session.scalar(
        select(func.count()).select_from(Member).where(Member.is_active == True)  # noqa: E712
    )
    last_updated = await session.scalar(select(func.max(Member.updated_at)))

    return {"total": total or 0, "active": active or 0, "last_updated": last_updated}


@router.get("/", response_model=List[Member])
async def list_members(
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user),
        q: Optional[str] = Query(None, description="Ad ya da kullanıcı adında arama"),
        limit: int = Query(50, le=200, description="Getirilecek maksimum kayıt sayısı")
):
    """Üye listesi — yalnızca yetkililer. Arama, admin panelindeki kontrol için."""
    query = select(Member).order_by(Member.full_name)

    if q:
        pattern = f"%{tr_lower(q)}%"
        query = query.where(
            func.lower(Member.full_name).like(pattern) | Member.nickname.like(pattern)
        )

    result = await session.execute(query.limit(limit))
    return result.scalars().all()
