from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_session
from models import Announcement
from security import get_current_user
from fastapi import status

router = APIRouter(
    prefix="/announcements",
    tags=["Announcements (Duyurular)"]
)

# 1. Yeni Duyuru Oluşturma (POST)
@router.post("/", response_model=Announcement)
async def create_announcement(announcement: Announcement, session: AsyncSession = Depends(get_session), current_user: str = Depends(get_current_user)):
    session.add(announcement)
    await session.commit()
    await session.refresh(announcement)
    return announcement

# 2. Tüm Duyuruları Yeniden Eskiye Sıralı Getirme (GET)
@router.get("/", response_model=List[Announcement])
async def get_announcements(
    session: AsyncSession = Depends(get_session),
    skip: int = Query(0, description="Atlanacak kayıt sayısı"),
    limit: int = Query(10, le=100, description="Getirilecek maksimum kayıt sayısı")
):
    result = await session.execute(
        select(Announcement)
        .order_by(Announcement.published_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()

# 3. Tek Bir Duyuruyu ID ile Getirme (GET)
@router.get("/{announcement_id}", response_model=Announcement)
async def get_announcement(announcement_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Announcement).where(Announcement.id == announcement_id))
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı")
    return announcement


# 4. Duyuru Güncelleme (PUT) - Sadece Yetkililer
@router.put("/{announcement_id}", response_model=Announcement)
async def update_announcement(
        announcement_id: int,
        announcement_update: Announcement,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(Announcement).where(Announcement.id == announcement_id))
    db_announcement = result.scalar_one_or_none()

    if not db_announcement:
        raise HTTPException(status_code=404, detail="Güncellenmek istenen duyuru bulunamadı.")

    # Sadece gönderilen alanları al (exclude_unset=True)
    update_data = announcement_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_announcement, key, value)

    session.add(db_announcement)
    await session.commit()
    await session.refresh(db_announcement)
    return db_announcement


# 5. Duyuru Silme (DELETE) - Sadece Yetkililer
@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
        announcement_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(Announcement).where(Announcement.id == announcement_id))
    db_announcement = result.scalar_one_or_none()

    if not db_announcement:
        raise HTTPException(status_code=404, detail="Silinmek istenen duyuru bulunamadı.")

    await session.delete(db_announcement)
    await session.commit()
    return None