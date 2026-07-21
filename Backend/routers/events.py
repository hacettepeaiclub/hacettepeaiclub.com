from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_session
from models import Event
from security import get_current_user
from datetime import datetime
from fastapi import HTTPException
# Router'ı oluşturma
router = APIRouter(
    prefix="/events",
    tags=["Events (Etkinlikler)"]
)

# 1. Yeni Etkinlik Oluşturma (POST)

@router.post("/", response_model=Event)
async def create_event(
        event: Event,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    # 1. Tarih dönüşümü
    if isinstance(event.date, str):
        event.date = datetime.strptime(event.date.split("T")[0], "%Y-%m-%d")

    # 2. Slug üretimi
    if not event.slug:
        event.slug = event.title.lower().replace(" ", "-")

    # 3. Description (Açıklama) boşsa otomatik doldur
    if not event.description:
        event.description = f"{event.title} etkinliği hakkında detaylar yakında paylaşılacak."

    # 4. Content (İçerik) boşsa otomatik doldur (buna da kızabilir)
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
    limit: int = Query(10, le=100, description="Getirilecek maksimum kayıt sayısı (Maks: 100)")
):
    # offset(skip): Belirtilen sayı kadar kaydı atlar
    # limit(limit): Kalan kayıtlardan belirtilen sayı kadarını getirir
    result = await session.execute(
        select(Event)
        .order_by(Event.date.desc())  # En yeni etkinlikler önce gelsin
        .offset(skip)
        .limit(limit)
    )
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

    # Yeni gelen verileri mevcut etkinliğin üzerine yaz
    event_dict = event_data.model_dump(exclude_unset=True)
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