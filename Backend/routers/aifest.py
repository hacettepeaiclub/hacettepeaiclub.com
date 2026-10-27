"""AI FEST'26 — katılımcı listesi, oturum yoklaması ve sahne çekilişi.

Akış:
  1. Admin, etkinlik kayıt sisteminden indirdiği katılımcı Excel'ini AI Fest
     yönetim panelinden (`/yonetim/`) `POST /aifest/participants/import` ile
     yükler. Liste tam senkronize edilir (members.py ile aynı mantık).
  2. Katılımcı, AI Fest sitesindeki Program Akışı'ndan "Yoklama Ver" der:
     `POST /aifest/checkin` → TC/okul no + telefonun son 4 hanesi + salondaki
     ekranda gösterilen oturum kodu.
  3. Sahnede `/cekilis/` sayfası, seçilen oturuma yoklama verenler arasından
     çekiliş yapar ve kazananı `POST /aifest/raffle/{oturum}/winners` ile kaydeder.
  4. `GET /aifest/export` yoklama ve çekiliş sonuçlarını Excel olarak indirir.

Gizlilik notu: TC / okul numarası düz metin saklanmaz (HMAC özeti + son 3 hane),
telefonun yalnızca son 4 hanesi tutulur. Katılımcıya hiçbir zaman liste
dökülmez; yoklama yanıtı yalnızca kişinin ilk adını içerir. Listeleme, çekiliş
ve dışa aktarma rotaları JWT ister.
"""

import hashlib
import hmac
import io
import re
import secrets
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import (APIRouter, Depends, File, HTTPException, Request,
                     UploadFile, status)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from database import get_session
from models import FestCheckIn, FestParticipant, FestRaffleWinner, FestSession
from routers.members import ALLOWED_EXTENSIONS, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, tr_lower, tr_title
from security import SECRET_KEY, get_current_user, limiter

router = APIRouter(
    prefix="/aifest",
    tags=["AI FEST'26 (Yoklama / Çekiliş)"]
)

TIMEZONE = ZoneInfo("Europe/Istanbul")

#: Kodlu oturumlar "auto" modda başlangıçtan bu kadar önce açılır…
OPEN_BEFORE = timedelta(minutes=10)
#: …ve bitişten bu kadar sonra kapanır.
CLOSE_AFTER = timedelta(minutes=20)

#: Yalnızca bu "Durum" değerlerindeki kayıtlar yoklama verebilir (küçük harf).
#: Boş küme = listedeki herkes. Örn. sadece asiller için: {"asil"}
ALLOWED_STATUSES: set = set()

#: Aynı katılımcı için art arda yanlış oturum kodu denemesi sınırı.
MAX_CODE_FAILURES = 10
CODE_LOCK_SECONDS = 10 * 60

#: Program — AI Fest sitesindeki src/data/program.ts ile aynı ID'ler.
#: Saat ve kodlar ilk kullanımda veritabanına yazılır; sonrasında yönetim
#: panelinden değiştirilir (buradaki değerler yalnızca başlangıç değeridir).
FEST_SESSIONS = [
    ("d1-s1", "2026-11-03", "10:00", "10:45", "1. Gün · 1. Oturum — Merve Benlikaş Demirbağ (Ford Otosan)"),
    ("d1-s2", "2026-11-03", "11:00", "11:45", "1. Gün · 2. Oturum — Bahar Serçin Halefoğlu (ALSE Data)"),
    ("d1-s3", "2026-11-03", "12:30", "13:15", "1. Gün · 3. Oturum — TUSAŞ Oturumu"),
    ("d1-s4", "2026-11-03", "13:30", "14:15", "1. Gün · 4. Oturum — Dr. Fatih Hattatoğlu (Wise Maple)"),
    ("d1-s5", "2026-11-03", "14:45", "15:30", "1. Gün · 5. Oturum — Burak Tunca (PayTR)"),
    ("d1-s6", "2026-11-03", "15:45", "16:30", "1. Gün · 6. Oturum"),
    ("d2-s1", "2026-11-04", "10:00", "10:45", "2. Gün · 1. Oturum — Çağdaş Hakan Aladağ"),
    ("d2-s2", "2026-11-04", "11:00", "11:45", "2. Gün · 2. Oturum — Ata Seren & Azra Melis Ertan (HAVELSAN & Trendyol)"),
    ("d2-s3", "2026-11-04", "12:30", "13:15", "2. Gün · 3. Oturum — ASELSAN Oturumu"),
    ("d2-s4", "2026-11-04", "13:30", "14:15", "2. Gün · 4. Oturum — Ege Mert Gülderen (DeePix)"),
    ("d2-s5", "2026-11-04", "14:45", "15:30", "2. Gün · 5. Oturum — Aytaç Mestçi (MarkeFront)"),
    ("d2-s6", "2026-11-04", "15:45", "16:30", "2. Gün · 6. Oturum"),
]

SESSION_MODES = {"auto", "open", "closed"}
CODE_PATTERN = re.compile(r"^\d{4,6}$")


# ---------------------------------------------------------------------------
#  Yardımcılar
# ---------------------------------------------------------------------------
def now_local() -> datetime:
    """Europe/Istanbul yerel saati (oturum saatleri de bu biçimde saklanır)."""
    return datetime.now(TIMEZONE).replace(tzinfo=None)


def digits(value) -> str:
    """Hücre/girdi değerindeki rakamlar. Excel'de sayı olarak tutulan
    numaralar float gelebilir (5527980835.0); ondalık kısım atılır."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return re.sub(r"\D", "", str(value))


def hash_id(id_number: str) -> str:
    """TC / okul numarasının HMAC-SHA256 özeti.

    DİKKAT: SECRET_KEY değişirse özetler de değişir; etkinlik süresince
    değiştirmeyin (değişirse Excel'i tekrar yüklemek gerekir).
    """
    return hmac.new(SECRET_KEY.encode(), id_number.encode(), hashlib.sha256).hexdigest()


def first_name(full_name: str) -> str:
    return (full_name or "").split(" ")[0]


def random_code() -> str:
    return f"{secrets.randbelow(9000) + 1000}"


async def ensure_sessions(session: AsyncSession) -> None:
    """Programdaki oturumlar veritabanında yoksa (rastgele kodla) oluşturur."""
    existing = set((await session.execute(select(FestSession.id))).scalars().all())
    missing = [s for s in FEST_SESSIONS if s[0] not in existing]
    if not missing:
        return

    for order, (sid, day, start, end, title) in enumerate(FEST_SESSIONS):
        if sid in existing:
            continue
        session.add(FestSession(
            id=sid,
            title=title,
            starts_at=datetime.fromisoformat(f"{day}T{start}"),
            ends_at=datetime.fromisoformat(f"{day}T{end}"),
            code=random_code(),
            mode="auto",
            order_index=order,
        ))
    try:
        await session.commit()
    except IntegrityError:
        # Eşzamanlı iki istek aynı anda oluşturmaya çalıştıysa sorun değil.
        await session.rollback()


def session_is_open(fest_session: FestSession, now: datetime) -> Optional[str]:
    """Yoklama açıksa None, kapalıysa kullanıcıya gösterilecek gerekçe."""
    if fest_session.mode == "closed":
        return "Bu oturumun yoklaması kapalı."
    if fest_session.mode == "open":
        return None
    if now < fest_session.starts_at - OPEN_BEFORE:
        return "Bu oturumun yoklaması henüz açılmadı."
    if now > fest_session.ends_at + CLOSE_AFTER:
        return "Bu oturumun yoklama süresi doldu."
    return None


# Yanlış kod denemeleri (katılımcı başına). Tek süreçli uvicorn için yeterli;
# kampüs Wi-Fi'ında yüzlerce kişi aynı IP'den çıktığı için IP bazlı sıkı sınır
# konamıyor, kaba kuvvet bu sayaçla engelleniyor.
_code_failures: Dict[int, List[float]] = {}


def _recent_failures(participant_id: int) -> List[float]:
    cutoff = time.monotonic() - CODE_LOCK_SECONDS
    attempts = [t for t in _code_failures.get(participant_id, []) if t > cutoff]
    _code_failures[participant_id] = attempts
    return attempts


# ---------------------------------------------------------------------------
#  Excel ayrıştırma
# ---------------------------------------------------------------------------
def _cell_text(value) -> str:
    return "" if value is None else str(value).strip()


def _locate_header(rows: List[list]) -> tuple:
    """Başlık satırını ve sütunları bulur. Sütun sırası değişebilir; ilk 10
    satırda "Ad Soyad" ve "TC / Okul No" başlıkları aranır."""
    for index, row in enumerate(rows[:10]):
        labels = {pos: tr_lower(_cell_text(cell)) for pos, cell in enumerate(row)}

        def find(*needles):
            return next((pos for pos, text in labels.items() if any(n in text for n in needles)), None)

        columns = {
            "name": find("ad soyad", "adı soyadı"),
            "id": find("okul no", "tc"),
            "phone": find("gsm", "telefon"),
            "email": find("email", "e-posta", "eposta"),
            "type": find("tip"),
            "status": find("durum"),
        }
        if columns["name"] is not None and columns["id"] is not None:
            if columns["phone"] is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail='Excel dosyasında "GSM" sütunu bulunamadı. '
                           'Yoklama doğrulaması telefonun son 4 hanesiyle yapıldığı için zorunludur.'
                )
            return index, columns

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail='Excel dosyasında "Ad Soyad" ve "TC / Okul No" başlıklı sütunlar bulunamadı. '
               'Lütfen kayıt sisteminden indirdiğiniz katılımcı listesini değiştirmeden yükleyin.'
    )


def parse_participant_workbook(content: bytes) -> tuple:
    """Katılımcı Excel'ini kayıtlara çevirir. @return (kayıtlar, özet)"""
    import openpyxl

    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    except Exception as exc:
        print(f"!!! AIFEST IMPORT PARSE ERROR !!!: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Excel dosyası okunamadı. Dosya bozuk olabilir ya da .xlsx biçiminde değil."
        )

    try:
        sheet = workbook.worksheets[0]
        rows = [list(row) for row in sheet.iter_rows(values_only=True)]
    finally:
        workbook.close()

    header_index, col = _locate_header(rows)

    def cell(row, key):
        position = col[key]
        return row[position] if position is not None and position < len(row) else None

    records: Dict[str, dict] = {}
    summary = {"file_rows": 0, "skipped_empty": 0, "skipped_invalid": 0, "duplicates": 0}

    for row in rows[header_index + 1:]:
        full_name = _cell_text(cell(row, "name"))
        if not full_name:
            summary["skipped_empty"] += 1
            continue
        summary["file_rows"] += 1

        id_number = digits(cell(row, "id"))
        phone = digits(cell(row, "phone"))
        if len(id_number) < 5 or len(phone) < 4:
            summary["skipped_invalid"] += 1
            continue

        if id_number in records:
            summary["duplicates"] += 1
            continue

        records[id_number] = {
            "id_hash": hash_id(id_number),
            "id_tail": id_number[-3:],
            "full_name": tr_title(full_name),
            "email": _cell_text(cell(row, "email")).lower() or None,
            "phone_last4": phone[-4:],
            "participant_type": _cell_text(cell(row, "type")) or None,
            "status": _cell_text(cell(row, "status")) or None,
        }

    return list(records.values()), summary


# ---------------------------------------------------------------------------
#  Katılımcı listesi (admin)
# ---------------------------------------------------------------------------
@router.post("/participants/import")
async def import_participants(
        file: UploadFile = File(...),
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    """Katılımcı Excel'ini yükler ve listeyi TAM senkronize eder. Dosyada
    olmayanlar silinmez (yoklamaları bağlı), pasife alınır."""
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
        raise HTTPException(status_code=413, detail=f"Dosya çok büyük. En fazla {MAX_FILE_SIZE_MB} MB yükleyebilirsiniz.")

    records, summary = parse_participant_workbook(content)
    if not records:
        raise HTTPException(
            status_code=400,
            detail="Dosyada geçerli katılımcı satırı bulunamadı; liste değiştirilmedi."
        )

    existing = {p.id_hash: p for p in (await session.execute(select(FestParticipant))).scalars().all()}
    now = datetime.now()
    added = updated = deactivated = 0

    for record in records:
        participant = existing.get(record["id_hash"])
        if participant is None:
            session.add(FestParticipant(**record, is_active=True, updated_at=now))
            added += 1
            continue

        changed = not participant.is_active or any(getattr(participant, k) != v for k, v in record.items())
        if changed:
            for key, value in record.items():
                setattr(participant, key, value)
            participant.is_active = True
            participant.updated_at = now
            session.add(participant)
            updated += 1

    incoming = {record["id_hash"] for record in records}
    for id_hash, participant in existing.items():
        if id_hash not in incoming and participant.is_active:
            participant.is_active = False
            participant.updated_at = now
            session.add(participant)
            deactivated += 1

    await session.commit()

    return {
        "message": f"{len(records)} katılımcı işlendi.",
        "parsed": len(records),
        "added": added,
        "updated": updated,
        "deactivated": deactivated,
        **summary,
    }


@router.get("/stats")
async def fest_stats(
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    """Yönetim paneli özeti: katılımcı sayıları ve oturum başına yoklama."""
    await ensure_sessions(session)

    active = await session.scalar(
        select(func.count()).select_from(FestParticipant).where(FestParticipant.is_active == True)  # noqa: E712
    )
    total = await session.scalar(select(func.count()).select_from(FestParticipant))
    last_updated = await session.scalar(select(func.max(FestParticipant.updated_at)))
    unique_attendees = await session.scalar(select(func.count(func.distinct(FestCheckIn.participant_id))))

    return {
        "participants_active": active or 0,
        "participants_total": total or 0,
        "last_updated": last_updated,
        "unique_attendees": unique_attendees or 0,
    }


# ---------------------------------------------------------------------------
#  Oturumlar (admin)
# ---------------------------------------------------------------------------
class SessionUpdate(BaseModel):
    code: Optional[str] = None
    mode: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


@router.get("/sessions")
async def list_sessions(
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    """Oturumlar, kodları ve yoklama sayıları — yalnızca yetkililer."""
    await ensure_sessions(session)

    counts = dict((await session.execute(
        select(FestCheckIn.session_id, func.count()).group_by(FestCheckIn.session_id)
    )).all())
    sessions = (await session.execute(select(FestSession).order_by(FestSession.order_index))).scalars().all()
    now = now_local()

    return [
        {
            "id": s.id,
            "title": s.title,
            "starts_at": s.starts_at,
            "ends_at": s.ends_at,
            "code": s.code,
            "mode": s.mode,
            "is_open": session_is_open(s, now) is None,
            "checkin_count": counts.get(s.id, 0),
        }
        for s in sessions
    ]


@router.put("/sessions/{session_id}")
async def update_session(
        session_id: str,
        data: SessionUpdate,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    await ensure_sessions(session)
    fest_session = await session.get(FestSession, session_id)
    if not fest_session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı.")

    if data.code is not None:
        if not CODE_PATTERN.match(data.code):
            raise HTTPException(status_code=400, detail="Oturum kodu 4-6 haneli bir sayı olmalı.")
        fest_session.code = data.code
    if data.mode is not None:
        if data.mode not in SESSION_MODES:
            raise HTTPException(status_code=400, detail="Geçersiz mod. auto / open / closed olmalı.")
        fest_session.mode = data.mode
    if data.starts_at is not None:
        fest_session.starts_at = data.starts_at.replace(tzinfo=None)
    if data.ends_at is not None:
        fest_session.ends_at = data.ends_at.replace(tzinfo=None)
    if fest_session.ends_at <= fest_session.starts_at:
        raise HTTPException(status_code=400, detail="Bitiş saati başlangıçtan sonra olmalı.")

    session.add(fest_session)
    await session.commit()
    return {"message": "Oturum güncellendi."}


# ---------------------------------------------------------------------------
#  Yoklama (herkese açık)
# ---------------------------------------------------------------------------
class CheckInRequest(BaseModel):
    session_id: str = Field(max_length=20)
    id_number: str = Field(max_length=20)
    phone_last4: str = Field(max_length=4)
    code: str = Field(max_length=6)


NOT_FOUND_MESSAGE = "Kayıt bulunamadı. TC / okul numaranı ve telefonunun son 4 hanesini kontrol et."


@router.post("/checkin")
# Kampüs Wi-Fi'ında salondaki herkes aynı IP'den çıkabildiği için cömert bir
# sınır; asıl koruma telefon + kod doğrulaması ve yanlış kod sayacıdır.
@limiter.limit("600/minute")
async def check_in(
        request: Request,
        data: CheckInRequest,
        session: AsyncSession = Depends(get_session)
):
    id_number = digits(data.id_number)
    phone_last4 = digits(data.phone_last4)
    code = digits(data.code)
    if not id_number or len(phone_last4) != 4 or not code:
        raise HTTPException(status_code=400, detail="Lütfen tüm alanları doldur.")

    await ensure_sessions(session)
    fest_session = await session.get(FestSession, data.session_id)
    if not fest_session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı.")

    closed_reason = session_is_open(fest_session, now_local())
    if closed_reason:
        raise HTTPException(status_code=403, detail=closed_reason)

    participant = (await session.execute(
        select(FestParticipant).where(
            FestParticipant.id_hash == hash_id(id_number),
            FestParticipant.is_active == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    # Numara yok / telefon tutmuyor → aynı mesaj: liste taranamasın.
    if not participant or not hmac.compare_digest(participant.phone_last4, phone_last4):
        raise HTTPException(status_code=404, detail=NOT_FOUND_MESSAGE)

    if ALLOWED_STATUSES and tr_lower(participant.status or "") not in ALLOWED_STATUSES:
        raise HTTPException(status_code=403, detail="Kaydın bu etkinlik için onaylı görünmüyor. Lütfen görevlilere başvur.")

    failures = _recent_failures(participant.id)
    if len(failures) >= MAX_CODE_FAILURES:
        raise HTTPException(status_code=429, detail="Çok fazla hatalı kod denemesi. Biraz sonra tekrar dene.")
    if not hmac.compare_digest(fest_session.code, code):
        failures.append(time.monotonic())
        raise HTTPException(status_code=400, detail="Oturum kodu hatalı. Salondaki ekranı kontrol et.")

    already = await session.scalar(
        select(FestCheckIn.id).where(
            FestCheckIn.session_id == fest_session.id,
            FestCheckIn.participant_id == participant.id,
        )
    )
    if not already:
        session.add(FestCheckIn(session_id=fest_session.id, participant_id=participant.id))
        try:
            await session.commit()
        except IntegrityError:
            # Aynı anda iki kez gönderildi; ilk kayıt yeterli.
            await session.rollback()
            already = True

    return {"first_name": first_name(participant.full_name), "already_checked_in": bool(already)}


# ---------------------------------------------------------------------------
#  Çekiliş (admin)
# ---------------------------------------------------------------------------
class WinnerCreate(BaseModel):
    participant_id: int


async def _active_winners(session: AsyncSession) -> List[dict]:
    rows = (await session.execute(
        select(FestRaffleWinner, FestParticipant)
        .join(FestParticipant, FestParticipant.id == FestRaffleWinner.participant_id)
        .where(FestRaffleWinner.is_void == False)  # noqa: E712
        .order_by(FestRaffleWinner.created_at)
    )).all()
    return [
        {
            "id": winner.id,
            "session_id": winner.session_id,
            "participant_id": participant.id,
            "full_name": participant.full_name,
            "id_tail": participant.id_tail,
            "created_at": winner.created_at,
        }
        for winner, participant in rows
    ]


@router.get("/raffle/{session_id}")
async def raffle_pool(
        session_id: str,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    """Oturuma yoklama verenler + tüm etkinlikteki geçerli kazananlar."""
    await ensure_sessions(session)
    if not await session.get(FestSession, session_id):
        raise HTTPException(status_code=404, detail="Oturum bulunamadı.")

    rows = (await session.execute(
        select(FestParticipant)
        .join(FestCheckIn, FestCheckIn.participant_id == FestParticipant.id)
        .where(FestCheckIn.session_id == session_id)
        .order_by(FestCheckIn.created_at)
    )).scalars().all()

    return {
        "attendees": [{"participant_id": p.id, "full_name": p.full_name, "id_tail": p.id_tail} for p in rows],
        "winners": await _active_winners(session),
    }


@router.post("/raffle/{session_id}/winners")
async def record_winner(
        session_id: str,
        data: WinnerCreate,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    checked_in = await session.scalar(
        select(FestCheckIn.id).where(
            FestCheckIn.session_id == session_id,
            FestCheckIn.participant_id == data.participant_id,
        )
    )
    if not checked_in:
        raise HTTPException(status_code=400, detail="Bu kişi bu oturumun yoklama listesinde yok.")

    winner = FestRaffleWinner(session_id=session_id, participant_id=data.participant_id)
    session.add(winner)
    await session.commit()
    await session.refresh(winner)
    return {"id": winner.id, "message": "Kazanan kaydedildi."}


@router.get("/raffle-winners")
async def list_winners(
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    return await _active_winners(session)


@router.post("/raffle-winners/{winner_id}/void")
async def void_winner(
        winner_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    """Kazananı iptal eder (kişi tekrar çekilişe girebilir). Kayıt silinmez."""
    winner = await session.get(FestRaffleWinner, winner_id)
    if not winner:
        raise HTTPException(status_code=404, detail="Kazanan kaydı bulunamadı.")
    winner.is_void = True
    session.add(winner)
    await session.commit()
    return {"message": "Kazanan iptal edildi."}


# ---------------------------------------------------------------------------
#  Excel dışa aktarma (admin)
# ---------------------------------------------------------------------------
@router.get("/export")
async def export_attendance(
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    """Yoklama + çekiliş sonuçları (.xlsx). Sayfalar: Özet, Yoklama, Çekiliş."""
    import openpyxl
    from openpyxl.styles import Font

    await ensure_sessions(session)
    sessions = (await session.execute(select(FestSession).order_by(FestSession.order_index))).scalars().all()
    titles = {s.id: s.title for s in sessions}

    checkins = (await session.execute(
        select(FestCheckIn, FestParticipant)
        .join(FestParticipant, FestParticipant.id == FestCheckIn.participant_id)
        .order_by(FestCheckIn.created_at)
    )).all()
    winners = (await session.execute(
        select(FestRaffleWinner, FestParticipant)
        .join(FestParticipant, FestParticipant.id == FestRaffleWinner.participant_id)
        .order_by(FestRaffleWinner.created_at)
    )).all()

    workbook = openpyxl.Workbook()

    summary = workbook.active
    summary.title = "Özet"
    summary.append(["Oturum ID", "Oturum", "Başlangıç", "Yoklama Sayısı"])
    per_session: Dict[str, int] = {}
    for checkin, _ in checkins:
        per_session[checkin.session_id] = per_session.get(checkin.session_id, 0) + 1
    for s in sessions:
        summary.append([s.id, s.title, s.starts_at.strftime("%d.%m.%Y %H:%M"), per_session.get(s.id, 0)])
    summary.append([])
    summary.append(["", "Farklı katılımcı sayısı", "", len({p.id for _, p in checkins})])

    attendance = workbook.create_sheet("Yoklama")
    attendance.append(["Zaman", "Oturum ID", "Oturum", "Ad Soyad", "Email", "Tip", "Durum", "No (son 3)"])
    for checkin, p in checkins:
        attendance.append([checkin.created_at.strftime("%d.%m.%Y %H:%M:%S"), checkin.session_id,
                           titles.get(checkin.session_id, ""), p.full_name, p.email, p.participant_type,
                           p.status, p.id_tail])

    raffle = workbook.create_sheet("Çekiliş")
    raffle.append(["Zaman", "Oturum ID", "Oturum", "Ad Soyad", "Email", "No (son 3)", "Durum"])
    for winner, p in winners:
        raffle.append([winner.created_at.strftime("%d.%m.%Y %H:%M:%S"), winner.session_id,
                       titles.get(winner.session_id, ""), p.full_name, p.email, p.id_tail,
                       "İptal" if winner.is_void else "Geçerli"])

    for sheet in workbook.worksheets:
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        sheet.freeze_panes = "A2"
        for column in sheet.columns:
            width = max((len(str(c.value)) for c in column if c.value is not None), default=8)
            sheet.column_dimensions[column[0].column_letter].width = min(width + 2, 60)

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    filename = f"aifest26_yoklama_{now_local():%Y%m%d_%H%M}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
