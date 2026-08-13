import re
import unicodedata
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import Event
from security import get_current_user

# Router'ı oluşturma
router = APIRouter(
    prefix="/events",
    tags=["Events (Etkinlikler)"]
)


def slugify(value: str) -> str:
    """Türkçe karakterleri sadeleştirip URL dostu bir slug üretir."""
    replacements = {
        "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g",
        "ü": "u", "Ü": "u", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c",
    }
    for src, dst in replacements.items():
        value = value.replace(src, dst)
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "etkinlik"


async def build_unique_slug(session: AsyncSession, base: str, exclude_id: Optional[int] = None) -> str:
    """Aynı isimde ikinci bir kayıt eklenirken slug çakışmasını (500 hatası) önler."""
    slug = slugify(base)
    candidate = slug
    counter = 2
    while True:
        query = select(Event).where(Event.slug == candidate)
        if exclude_id is not None:
            query = query.where(Event.id != exclude_id)
        result = await session.execute(query)
        if result.scalar_one_or_none() is None:
            return candidate
        candidate = f"{slug}-{counter}"
        counter += 1


def coerce_date(value):
    """Frontend'den '2026-05-01' veya ISO formatında gelen tarihi datetime'a çevirir."""
    if value is None or isinstance(value, datetime):
        return value
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        return datetime.strptime(cleaned.split("T")[0], "%Y-%m-%d")
    return value


# 1. Yeni Etkinlik Oluşturma (POST)
@router.post("/", response_model=Event)
async def create_event(
        event: Event,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    # 1. Tarih dönüşümü
    event.date = coerce_date(event.date)
    event.end_date = coerce_date(event.end_date)

    # Bitiş tarihi başlangıçtan önce olamaz
    if event.end_date and event.date and event.end_date < event.date:
        raise HTTPException(status_code=400, detail="Bitiş tarihi başlangıç tarihinden önce olamaz.")

    # Tek günlük etkinliklerde bitiş tarihini boş bırakıyoruz
    if event.end_date and event.date and event.end_date == event.date:
        event.end_date = None

    # 2. Slug üretimi (çakışmaya karşı benzersizleştirilir)
    event.slug = await build_unique_slug(session, event.slug or event.title)

    # 3. Description (Açıklama) boşsa otomatik doldur
    if not event.description:
        event.description = f"{event.title} etkinliği hakkında detaylar yakında paylaşılacak."

    # 4. Content (İçerik) boşsa otomatik doldur
    if not event.content:
        event.content = "-"

    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


# 2. Tüm Etkinlikleri Getirme (GET)
@router.get("/", response_model=List[Event])
async def get_events(
    session: AsyncSession = Depends(get_session),
    skip: int = Query(0, description="Atlanacak kayıt sayısı (Örn: 2. sayfa için 10)"),
    limit: Optional[int] = Query(None, le=100,
                                  description="Getirilecek maksimum kayıt sayısı (Boş bırakılırsa tüm listeyi döner)")
):
    # Önce admin panelinden verilen elle sıralama, eşitlikte en yeni tarih önce gelir
    query = (
        select(Event)
        .order_by(Event.order_index, Event.date.desc(), Event.id.desc())
        .offset(skip)
    )

    if limit is not None:
        query = query.limit(limit)

    result = await session.execute(query)
    events = result.scalars().all()
    return events


# 3. Tek Bir Etkinliği ID ile Getirme (GET)
@router.get("/{event_id}", response_model=Event)
async def get_event(event_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    return event


# 4. Etkinlik Güncelleme (PUT)
@router.put("/{event_id}", response_model=Event)
async def update_event(
    event_id: int,
    event_data: Event,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user)):

    # Önce güncellenecek etkinliği bul
    result = await session.execute(select(Event).where(Event.id == event_id))
    db_event = result.scalar_one_or_none()

    if not db_event:
        raise HTTPException(status_code=404, detail="Güncellenecek etkinlik bulunamadı")

    # Yeni gelen verileri mevcut etkinliğin üzerine yaz ("id" asla ezilmez)
    event_dict = event_data.model_dump(exclude_unset=True, exclude={"id"})

    if "date" in event_dict:
        event_dict["date"] = coerce_date(event_dict["date"])
    if "end_date" in event_dict:
        event_dict["end_date"] = coerce_date(event_dict["end_date"])

    new_start = event_dict.get("date", db_event.date)
    new_end = event_dict.get("end_date", db_event.end_date)
    if new_end and new_start and new_end < new_start:
        raise HTTPException(status_code=400, detail="Bitiş tarihi başlangıç tarihinden önce olamaz.")
    if new_end and new_start and new_end == new_start:
        event_dict["end_date"] = None

    # Slug gönderildiyse benzersizliğini garantile
    if event_dict.get("slug"):
        event_dict["slug"] = await build_unique_slug(session, event_dict["slug"], exclude_id=event_id)
    else:
        event_dict.pop("slug", None)

    for key, value in event_dict.items():
        setattr(db_event, key, value)

    session.add(db_event)
    await session.commit()
    await session.refresh(db_event)
    return db_event


# 5. Etkinlik Silme (DELETE)
@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user)):

    # Önce silinecek etkinliği bul
    result = await session.execute(select(Event).where(Event.id == event_id))
    db_event = result.scalar_one_or_none()

    if not db_event:
        raise HTTPException(status_code=404, detail="Silinecek etkinlik bulunamadı")

    # Veritabanından kalıcı olarak sil
    await session.delete(db_event)
    await session.commit()
    return {"message": "Etkinlik başarıyla silindi"}
