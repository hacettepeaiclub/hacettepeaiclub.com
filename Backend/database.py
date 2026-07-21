import os
from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# .env dosyasını yükle
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Asenkron motoru oluştur (PostgreSQL için)
engine = create_async_engine(DATABASE_URL, echo=True, future=True)

# Asenkron oturum fabrikası
async def get_session():
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        yield session