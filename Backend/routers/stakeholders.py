from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from database import get_session
from models import Stakeholder
from security import get_current_user

router = APIRouter(
    prefix="/stakeholders",
    tags=["Stakeholders (AI FEST Paydaşları)"]
)


# 1. Yeni Paydaş Ekleme (POST) - Sadece Yetkililer
@router.post("/", response_model=Stakeholder)
async def create_stakeholder(
        stakeholder: Stakeholder,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    session.add(stakeholder)
    await session.commit()
    await session.refresh(stakeholder)
    return stakeholder


# 2. Tüm Paydaşları Sıralı Getirme (GET)
@router.get("/", response_model=List[Stakeholder])
async def get_stakeholders(
        session: AsyncSession = Depends(get_session),
        skip: int = Query(0, description="Atlanacak kayıt sayısı"),
        limit: Optional[int] = Query(None,
                                     description="Getirilecek maksimum kayıt sayısı (Boş bırakılırsa tüm listeyi döner)")
):
    query = select(Stakeholder).order_by(Stakeholder.order_index, Stakeholder.id).offset(skip)

    if limit is not None:
        query = query.limit(limit)

    result = await session.execute(query)
    return result.scalars().all()


# 3. Tek Bir Paydaşı ID ile Getirme (GET)
@router.get("/{stakeholder_id}", response_model=Stakeholder)
async def get_stakeholder(stakeholder_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Stakeholder).where(Stakeholder.id == stakeholder_id))
    stakeholder = result.scalar_one_or_none()
    if not stakeholder:
        raise HTTPException(status_code=404, detail="Paydaş bulunamadı")
    return stakeholder


# 4. Paydaş Güncelleme (PUT) - Sadece Yetkililer
@router.put("/{stakeholder_id}", response_model=Stakeholder)
async def update_stakeholder(
        stakeholder_id: int,
        stakeholder_update: Stakeholder,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(Stakeholder).where(Stakeholder.id == stakeholder_id))
    db_stakeholder = result.scalar_one_or_none()

    if not db_stakeholder:
        raise HTTPException(status_code=404, detail="Güncellenmek istenen paydaş bulunamadı.")

    update_data = stakeholder_update.model_dump(exclude_unset=True, exclude={"id"})
    for key, value in update_data.items():
        setattr(db_stakeholder, key, value)

    session.add(db_stakeholder)
    await session.commit()
    await session.refresh(db_stakeholder)
    return db_stakeholder


# 5. Paydaş Silme (DELETE) - Sadece Yetkililer
@router.delete("/{stakeholder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stakeholder(
        stakeholder_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(Stakeholder).where(Stakeholder.id == stakeholder_id))
    db_stakeholder = result.scalar_one_or_none()

    if not db_stakeholder:
        raise HTTPException(status_code=404, detail="Silinmek istenen paydaş bulunamadı.")

    await session.delete(db_stakeholder)
    await session.commit()
    return None
