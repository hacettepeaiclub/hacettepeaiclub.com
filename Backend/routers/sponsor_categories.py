from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_session
from models import SponsorCategory
from security import get_current_user

router = APIRouter(
    prefix="/sponsor-categories",
    tags=["Sponsor Categories (Sponsor Türleri)"]
)


# 1. Yeni Kategori Ekleme (POST) - Sadece Yetkililer
@router.post("/", response_model=SponsorCategory)
async def create_sponsor_category(
        category: SponsorCategory,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)):
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


# 2. Tüm Kategorileri Sıralı Getirme (GET) - Herkese Açık
@router.get("/", response_model=List[SponsorCategory])
async def get_sponsor_categories(session: AsyncSession = Depends(get_session)):
    query = select(SponsorCategory).order_by(SponsorCategory.order_index, SponsorCategory.id)
    result = await session.execute(query)
    return result.scalars().all()


# 3. Kategori Güncelleme (PUT) - Sadece Yetkililer
@router.put("/{category_id}", response_model=SponsorCategory)
async def update_sponsor_category(
        category_id: int,
        category_update: SponsorCategory,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)):
    result = await session.execute(select(SponsorCategory).where(SponsorCategory.id == category_id))
    db_category = result.scalar_one_or_none()

    if not db_category:
        raise HTTPException(status_code=404, detail="Güncellenmek istenen kategori bulunamadı.")

    update_data = category_update.model_dump(exclude_unset=True, exclude={"id"})
    for key, value in update_data.items():
        setattr(db_category, key, value)

    session.add(db_category)
    await session.commit()
    await session.refresh(db_category)
    return db_category


# 4. Kategori Silme (DELETE) - Sadece Yetkililer
# Not: Bu kategoriye bağlı sponsorlar silinmez; category_id alanları NULL
# olur (bkz. models.py -> ondelete="SET NULL") ve site üzerinde "Diğer"
# grubunda gösterilmeye devam eder.
@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sponsor_category(
        category_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)):
    result = await session.execute(select(SponsorCategory).where(SponsorCategory.id == category_id))
    db_category = result.scalar_one_or_none()

    if not db_category:
        raise HTTPException(status_code=404, detail="Silinmek istenen kategori bulunamadı.")

    await session.delete(db_category)
    await session.commit()
    return None
