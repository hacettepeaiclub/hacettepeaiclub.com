from fastapi import APIRouter, Depends, HTTPException, status, Request # <-- Request eklendi
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from database import get_session
from models import User
from security import verify_password, create_access_token, limiter # <-- limiter eklendi

router = APIRouter(
    prefix="/auth",
    tags=["Authentication (Kimlik Doğrulama)"]
)

@router.post("/login")
@limiter.limit("5/minute") # <-- YENİ: Dakikada en fazla 5 istek kuralı!
async def login(
        request: Request, # <-- YENİ: slowapi'nin IP'yi okuyabilmesi için request objesi zorunludur
        form_data: OAuth2PasswordRequestForm = Depends(),
        session: AsyncSession = Depends(get_session)
):
    result = await session.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya şifre hatalı",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}