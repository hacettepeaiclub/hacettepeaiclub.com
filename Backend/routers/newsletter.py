from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from pydantic import BaseModel, EmailStr

from database import get_session
from models import NewsletterSubscriber
from security import get_current_user

router = APIRouter(
    prefix="/newsletter",
    tags=["Newsletter (E-Bülten)"]
)


# Arayüzden gelecek verinin formatı
class SubscribeRequest(BaseModel):
    email: EmailStr


# 1. Herkese açık abone olma rotası
@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe_newsletter(
        data: SubscribeRequest,
        session: AsyncSession = Depends(get_session)
):
    # Bu e-posta daha önce kayıt olmuş mu kontrol edelim
    result = await session.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.email == data.email))
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten bültene kayıtlı.")

    # Yeni aboneyi veritabanına ekle
    new_sub = NewsletterSubscriber(email=data.email)
    session.add(new_sub)
    await session.commit()

    return {"message": "Bültene başarıyla abone oldunuz!"}


# 2. Sadece Adminlerin görebileceği abone listesi
@router.get("/", response_model=List[NewsletterSubscriber])
async def get_subscribers(
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)  # Sadece adminler
):
    result = await session.execute(select(NewsletterSubscriber).order_by(NewsletterSubscriber.subscribed_at.desc()))
    return result.scalars().all()

# 3. Abone Silme (DELETE) - Sadece Adminler
@router.delete("/{subscriber_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscriber(
        subscriber_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)  # Sadece adminler silebilir
):
    result = await session.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.id == subscriber_id))
    sub = result.scalar_one_or_none()

    if not sub:
        raise HTTPException(status_code=404, detail="Silinmek istenen abone bulunamadı.")

    await session.delete(sub)
    await session.commit()
    return None