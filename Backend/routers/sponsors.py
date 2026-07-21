from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional  # <-- Optional eklendi

from database import get_session
from models import Sponsor
from security import get_current_user

router = APIRouter(
    prefix="/sponsors",
    tags=["Sponsors (Sponsorlar)"]
)

@router.post("/", response_model=Sponsor)
async def create_sponsor(
    sponsor: Sponsor,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user)):
    session.add(sponsor)
    await session.commit()
    await session.refresh(sponsor)
    return sponsor


@router.get("/", response_model=List[Sponsor])
async def get_sponsors(
        session: AsyncSession = Depends(get_session),
        skip: int = Query(0, description="Atlanacak kayıt sayısı"),
        limit: Optional[int] = Query(None,
                                     description="Getirilecek maksimum kayıt sayısı (Boş bırakılırsa tüm listeyi döner)")
):
    query = select(Sponsor).order_by(Sponsor.order_index).offset(skip)

    if limit is not None:
        query = query.limit(limit)

    result = await session.execute(query)
    return result.scalars().all()


# 3. Sponsor Güncelleme (PUT) - Sadece Yetkililer
@router.put("/{sponsor_id}", response_model=Sponsor)
async def update_sponsor(
        sponsor_id: int,
        sponsor_update: Sponsor,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(Sponsor).where(Sponsor.id == sponsor_id))
    db_sponsor = result.scalar_one_or_none()

    if not db_sponsor:
        raise HTTPException(status_code=404, detail="Güncellenmek istenen sponsor bulunamadı.")

    update_data = sponsor_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_sponsor, key, value)

    session.add(db_sponsor)
    await session.commit()
    await session.refresh(db_sponsor)
    return db_sponsor


# 4. Sponsor Silme (DELETE) - Sadece Yetkililer
@router.delete("/{sponsor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sponsor(
        sponsor_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(Sponsor).where(Sponsor.id == sponsor_id))
    db_sponsor = result.scalar_one_or_none()

    if not db_sponsor:
        raise HTTPException(status_code=404, detail="Silinmek istenen sponsor bulunamadı.")

    await session.delete(db_sponsor)
    await session.commit()
    return None