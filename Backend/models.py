from typing import Optional
from sqlmodel import SQLModel, Field
from datetime import datetime, timezone

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
    full_name: str
    role: str = Field(default="Member")  # Örn: Admin, Member, Core-Team
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.now)

class BoardMember(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    full_name: str
    role: str
    period: str  # Örn: "2025-2026"
    image_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    order_index: int = Field(default=0)

class Event(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    slug: str = Field(unique=True, index=True)
    description: str
    content: str
    date: datetime
    end_date: Optional[datetime] = Field(default=None)  # Çok günlü etkinliklerde bitiş tarihi
    location: str
    image_url: Optional[str] = None
    registration_link: Optional[str] = None
    is_active: bool = Field(default=True)
    event_type: str = Field(default="Etkinlik")  # Seçenekler: "Etkinlik", "Yarışma", "Eğitim"
    instructor: Optional[str] = Field(default=None)  # Sadece eğitimlerde dolacak, diğerlerinde null kalabilir
    order_index: int = Field(default=0)  # Admin panelinden elle sıralama için

class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str
    github_url: Optional[str] = None
    demo_url: Optional[str] = None
    image_url: Optional[str] = None
    tags: Optional[str] = None
    is_featured: bool = Field(default=False)

class Announcement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    slug: str = Field(unique=True, index=True)
    summary: str
    content: str
    published_at: datetime = Field(default_factory=datetime.now)
    author_id: Optional[int] = Field(
        default=None,
        foreign_key="user.id",
        ondelete="SET NULL")
    is_active: bool = Field(default=True)
    order_index: int = Field(default=0)  # Admin panelinden elle sıralama için

class SponsorCategory(SQLModel, table=True):
    """Sponsor türleri: Dönem Sponsoru, bir etkinliğin sponsoru, Gençlik Yetenek
    Partneri, Mekan Sponsoru vb. Admin panelinden serbestçe eklenip
    sıralanabilir; sabit bir liste değildir."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    order_index: int = Field(default=0)

class Sponsor(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    logo_url: str
    website_url: Optional[str] = None
    # Tür: hangi SponsorCategory altında gösterileceği. Kategorisi silinirse
    # ya da hiç seçilmezse "Diğer" grubunda gösterilir (NULL kalabilir).
    category_id: Optional[int] = Field(
        default=None,
        foreign_key="sponsorcategory.id",
        ondelete="SET NULL")
    # Seviye: Altın, Platin, Gümüş vb. Sabit bir liste değil, serbest metin.
    tier: str = Field(default="")
    # Tür/seviye belirlenmese bile logonun altına yazılabilecek serbest not.
    caption: Optional[str] = Field(default=None)
    order_index: int = Field(default=0)
    is_active: bool = Field(default=True)

class Stakeholder(SQLModel, table=True):
    """AI FEST'26 Paydaş Topluluklarımız."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    logo_url: str
    website_url: Optional[str] = None
    order_index: int = Field(default=0)
    is_active: bool = Field(default=True)

class SiteSetting(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)
    value: str
    description: Optional[str] = None

class ContactMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    surname: str
    phone: Optional[str] = Field(default=None)
    email: str
    message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NewsletterSubscriber(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    subscribed_at: datetime = Field(default_factory=datetime.now)