from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_session
from models import SiteSetting
from security import get_current_user

router = APIRouter(
    prefix="/settings",
    tags=["Site Settings (Site Ayarları)"]
)

@router.post("/", response_model=SiteSetting)
async def create_setting(setting: SiteSetting, session: AsyncSession = Depends(get_session), current_user: str = Depends(get_current_user)):
    session.add(setting)
    await session.commit()
    await session.refresh(setting)
    return setting

@router.get("/", response_model=List[SiteSetting])
async def get_settings(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(SiteSetting))
    return result.scalars().all()


# 3. Ayar Güncelleme (PUT) - Sadece Yetkililer
@router.put("/{setting_id}", response_model=SiteSetting)
async def update_setting(
        setting_id: int,
        setting_update: SiteSetting,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(SiteSetting).where(SiteSetting.id == setting_id))
    db_setting = result.scalar_one_or_none()

    if not db_setting:
        raise HTTPException(status_code=404, detail="Güncellenmek istenen ayar bulunamadı.")

    update_data = setting_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_setting, key, value)

    session.add(db_setting)
    await session.commit()
    await session.refresh(db_setting)
    return db_setting