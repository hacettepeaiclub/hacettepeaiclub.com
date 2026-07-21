from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional  # <-- Optional eklendi

from database import get_session
from models import BoardMember
from security import get_current_user

router = APIRouter(
    prefix="/board-members",
    tags=["Board Members (Yönetim Kurulu)"]
)

# 1. Yeni Yönetim Kurulu Üyesi Ekleme (POST)
@router.post("/", response_model=BoardMember)
async def create_board_member(member: BoardMember, session: AsyncSession = Depends(get_session), current_user: str = Depends(get_current_user)):
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return member


# 2. Tüm Üyeleri Sıralı Getirme (GET) - Esnek Sayfalama
@router.get("/", response_model=List[BoardMember])
async def get_board_members(
        session: AsyncSession = Depends(get_session),
        skip: int = Query(0, description="Atlanacak kayıt sayısı"),
        limit: Optional[int] = Query(None,
                                     description="Getirilecek maksimum kayıt sayısı (Boş bırakılırsa tüm listeyi döner)")
):
    query = select(BoardMember).order_by(BoardMember.order_index).offset(skip)

    if limit is not None:
        query = query.limit(limit)

    result = await session.execute(query)
    return result.scalars().all()


# 3. Tek Bir Üyeyi ID ile Getirme (GET)
@router.get("/{member_id}", response_model=BoardMember)
async def get_board_member(member_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(BoardMember).where(BoardMember.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Yönetim kurulu üyesi bulunamadı")
    return member


# 4. Yönetim Kurulu Üyesi Güncelleme (PUT) - Sadece Yetkililer
@router.put("/{member_id}", response_model=BoardMember)
async def update_board_member(
        member_id: int,
        member_update: BoardMember,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(BoardMember).where(BoardMember.id == member_id))
    db_member = result.scalar_one_or_none()

    if not db_member:
        raise HTTPException(status_code=404, detail="Güncellenmek istenen üye bulunamadı.")

    update_data = member_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_member, key, value)

    session.add(db_member)
    await session.commit()
    await session.refresh(db_member)
    return db_member


# 5. Yönetim Kurulu Üyesi Silme (DELETE) - Sadece Yetkililer
@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_board_member(
        member_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(BoardMember).where(BoardMember.id == member_id))
    db_member = result.scalar_one_or_none()

    if not db_member:
        raise HTTPException(status_code=404, detail="Silinmek istenen üye bulunamadı.")

    await session.delete(db_member)
    await session.commit()
    return None