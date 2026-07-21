from fastapi import APIRouter, Depends, HTTPException, Query, status 
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_session
from models import Project
from security import get_current_user
from fastapi import status

router = APIRouter(
    prefix="/projects",
    tags=["Projects (Projeler)"]
)

# 1. Yeni Proje Oluşturma (POST)
@router.post("/", response_model=Project)
async def create_project(project: Project, session: AsyncSession = Depends(get_session), current_user: str = Depends(get_current_user)):
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project

# 2. Tüm Projeleri Getirme (GET)
@router.get("/", response_model=List[Project])
async def get_projects(
    session: AsyncSession = Depends(get_session),
    skip: int = Query(0, description="Atlanacak kayıt sayısı"),
    limit: int = Query(10, le=100, description="Getirilecek maksimum kayıt sayısı")
):
    result = await session.execute(
        select(Project)
        .order_by(Project.id.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()
# 3. Tek Bir Projeyi ID ile Getirme (GET)
@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Proje bulunamadı")
    return project


# 4. Proje Güncelleme (PUT) - Sadece Yetkililer
@router.put("/{project_id}", response_model=Project)
async def update_project(
        project_id: int,
        project_update: Project,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(Project).where(Project.id == project_id))
    db_project = result.scalar_one_or_none()

    if not db_project:
        raise HTTPException(status_code=404, detail="Güncellenmek istenen proje bulunamadı.")

    update_data = project_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)

    session.add(db_project)
    await session.commit()
    await session.refresh(db_project)
    return db_project


# 5. Proje Silme (DELETE) - Sadece Yetkililer
@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
        project_id: int,
        session: AsyncSession = Depends(get_session),
        current_user: str = Depends(get_current_user)
):
    result = await session.execute(select(Project).where(Project.id == project_id))
    db_project = result.scalar_one_or_none()

    if not db_project:
        raise HTTPException(status_code=404, detail="Silinmek istenen proje bulunamadı.")

    await session.delete(db_project)
    await session.commit()
    return None