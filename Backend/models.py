from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import UniqueConstraint
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
    # İndirim kategorisi mi? İşaretlenirse bu kategorideki kurumlar (anlaşmalı
    # kafeler vb.) ana sayfadaki sponsor bölümünün yanı sıra "Üye İndirimleri"
    # sayfasında da indirim oranlarıyla listelenir. Böylece indirim sayfası
    # sponsor bölümüyle otomatik senkron kalır; ayrı bir liste tutulmaz.
    is_discount: bool = Field(default=False)

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
    # Üyelere kasada uygulanan indirim. Serbest metin olduğu için "%15" kadar
    # "%10 (kahvede)" gibi değerler de yazılabilir. Yalnızca is_discount
    # işaretli bir kategorideki kayıtlarda anlam taşır.
    discount: Optional[str] = Field(default=None)
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

class Member(SQLModel, table=True):
    """Topluluk üye listesi; indirimler.html sayfasındaki üyelik doğrulaması
    bu tabloya bakar.

    Kaynak, topluluk yönetim sisteminden indirilen Excel dosyasıdır ve admin
    panelindeki "Üyeleri Güncelle" ekranından yüklenir. `nickname`, Excel'deki
    "Adı Soyadı" hücresinde adın ardından gelen kullanıcı adıdır; aynı zamanda
    Hacettepe e-postasının @ işaretinden önceki kısmıdır.

    Telefon numarası bilinçli olarak SAKLANMAZ: bu tablonun tek işi "bu
    kullanıcı adı aktif üye mi, adı ne" sorusunu yanıtlamaktır.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    nickname: str = Field(unique=True, index=True)
    full_name: str
    # "FAKÜLTE / PROGRAM" biçiminde sadeleştirilmiş bilgi; yalnızca admin
    # panelinde gösterilir, doğrulama yanıtında yer almaz.
    faculty: Optional[str] = Field(default=None)
    # Son yüklenen listede yer almayan üyeler silinmez, pasife alınır. Böylece
    # yanlış dosya yüklenirse doğru dosyayı tekrar yükleyip geri alınabilir.
    is_active: bool = Field(default=True)
    updated_at: datetime = Field(default_factory=datetime.now)

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

# ---------------------------------------------------------------------------
#  AI FEST'26 — katılımcı listesi, oturum yoklaması ve sahne çekilişi
#  (routers/aifest.py · göç: b5c8e2f4a1d7)
# ---------------------------------------------------------------------------
class FestParticipant(SQLModel, table=True):
    """AI FEST'26 kayıtlı katılımcısı.

    Kaynak, etkinlik kayıt sisteminden indirilen Excel dosyasıdır ve AI Fest
    yönetim panelinden (aifest.hacettepeaiclub.com/yonetim/) yüklenir.

    Gizlilik: TC / okul numarası düz metin SAKLANMAZ. Eşleşme, SECRET_KEY ile
    alınmış HMAC özeti (`id_hash`) üzerinden yapılır; yalnızca son 3 hane
    (çekilişte sahnede doğrulama için) tutulur. Telefonun da yalnızca son 4
    hanesi (yoklama doğrulaması için) saklanır.
    """
    __tablename__ = "fest_participant"

    id: Optional[int] = Field(default=None, primary_key=True)
    id_hash: str = Field(unique=True, index=True)
    id_tail: str
    full_name: str
    email: Optional[str] = Field(default=None)
    phone_last4: str
    # Excel'deki "Tip (Öğrenci/Misafir)" ve "Durum" (Asil/Yedek) sütunları
    participant_type: Optional[str] = Field(default=None)
    status: Optional[str] = Field(default=None)
    # Son yüklenen listede olmayanlar silinmez (yoklama kayıtları bağlı), pasife alınır.
    is_active: bool = Field(default=True)
    updated_at: datetime = Field(default_factory=datetime.now)


class FestSession(SQLModel, table=True):
    """Yoklama alınan bir oturum. ID'ler AI Fest sitesindeki program verisiyle
    (src/data/program.ts) aynıdır: d1-s1 … d2-s6.

    Saatler Europe/Istanbul yerel saati olarak, saat dilimi bilgisi olmadan saklanır.
    `mode`: auto (saate göre açılır/kapanır) · open (elle açık) · closed (elle kapalı)
    """
    __tablename__ = "fest_session"

    id: str = Field(primary_key=True)
    title: str
    starts_at: datetime
    ends_at: datetime
    code: str
    mode: str = Field(default="auto")
    order_index: int = Field(default=0)


class FestCheckIn(SQLModel, table=True):
    """Bir katılımcının bir oturuma verdiği yoklama (oturum başına bir kez)."""
    __tablename__ = "fest_checkin"
    __table_args__ = (UniqueConstraint("session_id", "participant_id", name="uq_fest_checkin_session_participant"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(foreign_key="fest_session.id", index=True, ondelete="CASCADE")
    participant_id: int = Field(foreign_key="fest_participant.id", index=True, ondelete="CASCADE")
    created_at: datetime = Field(default_factory=datetime.now)


class FestRaffleWinner(SQLModel, table=True):
    """Sahne çekilişi kazananı. İptal edilen kazanan silinmez, `is_void` olur."""
    __tablename__ = "fest_raffle_winner"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(foreign_key="fest_session.id", index=True, ondelete="CASCADE")
    participant_id: int = Field(foreign_key="fest_participant.id", ondelete="CASCADE")
    created_at: datetime = Field(default_factory=datetime.now)
    is_void: bool = Field(default=False)
