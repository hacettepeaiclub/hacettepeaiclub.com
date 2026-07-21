from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from pydantic import BaseModel

from database import get_session
from models import User
from schemas import UserResponse
from security import get_password_hash, get_current_user
from fastapi import status

router = APIRouter(prefix="/users", tags=["Users"])


# İstek Şeması
class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str = "Admin Kullanıcı"


@router.post("/register", response_model=UserResponse)
async def create_admin(
        user_data: UserCreate,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)  # Sadece giriş yapmış adminler yeni admin ekleyebilir
):
    # Kullanıcı var mı kontrolü
    result = await session.execute(select(User).where(User.email == user_data.username))
    existing_user = result.scalars().first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten sistemde kayıtlı.")

    # Şifreyi Hashle
    hashed_password = get_password_hash(user_data.password)

    # Veritabanına kaydet
    new_user = User(
        email=user_data.username,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role="Admin"
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return new_user


@router.get("/", response_model=List[UserResponse])
async def get_admins(
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)  # Sadece adminler listeyi görebilir
):
    result = await session.execute(select(User))
    users = result.scalars().all()
    return users


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin(
        user_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(User).where(User.id == user_id))
    user_to_delete = result.scalars().first()

    if not user_to_delete:
        raise HTTPException(status_code=404, detail="Admin bulunamadı.")

    # Kendi kendini silmeyi engelleme (opsiyonel ama önerilir)
    if user_to_delete.email == current_user:
        raise HTTPException(status_code=400, detail="Kendi admin hesabınızı silemezsiniz.")

    await session.delete(user_to_delete)
    await session.commit()
    return None


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin(
        user_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(User).where(User.id == user_id))
    user_to_delete = result.scalars().first()

    if not user_to_delete:
        raise HTTPException(status_code=404, detail="Admin bulunamadı.")

    # Kendi kendini silmeyi engelleme
    if user_to_delete.email == current_user:
        raise HTTPException(status_code=400, detail="Kendi admin hesabınızı silemezsiniz.")

    await session.delete(user_to_delete)
    await session.commit()
    return None