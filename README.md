# Hacettepe AI Club — Web Sitesi

Hacettepe Üniversitesi Yapay Zeka Topluluğu'nun resmi web sitesi. Statik bir frontend ile asenkron bir FastAPI backend'inden oluşan, konum bazlı içerik yönetimi (etkinlikler, duyurular, sponsorlar, yönetim kurulu, projeler) sunan tam bir sistemdir.

🔗 **Canlı site:** [hacettepeaiclub.com](https://hacettepeaiclub.com)

---

## 📦 Proje Yapısı

```
.
├── Frontend/          Statik site (HTML / CSS / vanilla JS)
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js          # Genel site mantığı
│   │   ├── admin.js         # Yönetim paneli mantığı
│   │   ├── contact.js       # İletişim formu (EmailJS entegrasyonu)
│   │   └── neural-bg.js     # Arka plan animasyonu
│   └── assets/               # Görseller, logolar, takım fotoğrafları
│
└── Backend/           FastAPI tabanlı REST API
    ├── main.py                # Uygulama giriş noktası
    ├── models.py               # SQLModel veritabanı modelleri
    ├── database.py             # Async DB bağlantısı
    ├── security.py             # JWT, bcrypt, rate limiting
    ├── routers/                 # Endpoint'ler (events, projects, sponsors, ...)
    ├── migrations/               # Alembic migration'ları
    ├── Dockerfile
    └── docker-compose.yml
```

---

## 🛠️ Teknoloji Yığını

**Frontend**
- Düz HTML/CSS/JavaScript (framework yok, build adımı gerektirmez)

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — asenkron Python web framework'ü
- [SQLModel](https://sqlmodel.tiangolo.com/) + [SQLAlchemy](https://www.sqlalchemy.org/) (async) — ORM
- PostgreSQL 15 — veritabanı
- [Alembic](https://alembic.sqlalchemy.org/) — veritabanı migration yönetimi
- JWT (PyJWT) + bcrypt — kimlik doğrulama ve şifreleme
- [slowapi](https://github.com/laurentS/slowapi) — rate limiting (brute-force koruması)
- Docker & Docker Compose — konteynerleştirme

---

## 🚀 Kurulum (Yerel Geliştirme)

### Ön koşullar
- Docker & Docker Compose
- Git

### Adımlar

```bash
git clone https://github.com/<kullanici-adi>/hacettepeaiclub.com.git
cd hacettepeaiclub.com/Backend
cp .env.example .env
```

`.env` dosyasını kendi değerlerinizle doldurun:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=guclu_bir_sifre
POSTGRES_DB=hacettepe_ai_db
DATABASE_URL=postgresql+asyncpg://postgres:guclu_bir_sifre@db:5432/hacettepe_ai_db
SECRET_KEY=openssl rand -hex 32 ile üretilmiş rastgele bir değer
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

Ardından:

```bash
docker compose up -d --build
```

### ⚠️ İlk kurulum: veritabanı tabloları ve migration

Projedeki ilk Alembic migration'ı (`ilk_kurulum`) sıfır bir veritabanında tek başına çalışmaz — çünkü tabloları oluşturmak yerine zaten var olduklarını varsayıp üzerlerinde değişiklik yapar. Bu yüzden **sıfır bir veritabanında** ilk kurulumda şu sırayı izleyin:

```bash
# 1) Tabloları SQLModel üzerinden oluştur
docker compose exec web python -c "
import asyncio
from database import engine
from sqlmodel import SQLModel
import models

async def create():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

asyncio.run(create())
"

# 2) Alembic'e migration geçmişinin zaten uygulandığını bildir
docker compose exec web alembic stamp head
```

Bundan sonra yeni bir migration eklemek isterseniz normal Alembic akışını (`alembic revision --autogenerate -m "..."` → `alembic upgrade head`) kullanabilirsiniz, bu sorun sadece ilk kurulumda yaşanır.

### İlk admin kullanıcısını oluşturma

`/users/register` endpoint'i zaten giriş yapmış bir admin gerektirdiği için, **ilk** admin kullanıcısını elle oluşturmanız gerekir:

```bash
docker compose exec web python
```

```python
import asyncio
from sqlmodel.ext.asyncio.session import AsyncSession
from database import engine
from security import get_password_hash
from models import User

async def create_first_admin():
    async with AsyncSession(engine) as session:
        admin = User(
            email="admin@hacettepeaiclub.com",
            password_hash=get_password_hash("guclu-bir-sifre"),
            full_name="Site Yöneticisi",
            role="Admin",
        )
        session.add(admin)
        await session.commit()

asyncio.run(create_first_admin())
exit()
```

Bundan sonraki adminleri, bu hesapla giriş yapıp `/users/register` endpoint'i üzerinden ekleyebilirsiniz.

### Doğrulama

```bash
curl http://localhost:8000/docs   # Swagger UI dönmeli
```

Frontend'i ayrıca statik bir sunucudan (örn. Nginx, VS Code Live Server, `python -m http.server`) açabilirsiniz.

---

## 🌐 Canlıya Alma (Deployment)

Proje şu anda kendi barındırdığımız bir VPS üzerinde, Docker + Nginx Proxy Manager ile canlıda çalışıyor:

- **Frontend** → statik bir Nginx container'ından servis ediliyor, `hacettepeaiclub.com` ve `www.hacettepeaiclub.com` domain'lerine bağlı
- **Backend** → `api.hacettepeaiclub.com` subdomain'i üzerinden servis ediliyor
- SSL sertifikaları Nginx Proxy Manager üzerinden Let's Encrypt ile otomatik alınıyor
- CORS ayarı yalnızca `hacettepeaiclub.com` ve `www.hacettepeaiclub.com` origin'lerine izin verecek şekilde kısıtlanmış durumda (`Backend/main.py` içindeki `origins` listesi)

Canlıya alırken `Frontend/js/admin.js` içindeki `API_URL` değişkeninin doğru backend adresine (`https://api.hacettepeaiclub.com`) işaret ettiğinden emin olun.

---

## 🔐 Güvenlik Notları

- `docker-compose.yml` içindeki veritabanı şifresini asla açık (plaintext) yazmayın — `.env` dosyasından `${POSTGRES_PASSWORD}` şeklinde okutun
- PostgreSQL portu (`5432`) internete açık bırakılmamalı; sadece container'lar arası ağdan erişilebilir olmalı
- `.env` dosyası `.gitignore` içinde olmalı, asla repoya commit edilmemeli
- `/auth/login` endpoint'i dakikada 5 istekle sınırlandırılmıştır (brute-force koruması)
- Prod ortamda `origins` listesinde `"*"` **kullanılmamalı**, yalnızca gerçek domain'ler tanımlanmalı

---

## 🧪 Testler

```bash
cd Backend
docker compose exec web pytest
```

---

## 🤝 Katkıda Bulunma

1. Bu repoyu fork'layın
2. Yeni bir branch açın (`git checkout -b ozellik/yeni-ozellik`)
3. Değişikliklerinizi commit'leyin
4. Branch'inizi push'layın ve bir Pull Request açın

Sorular ve öneriler için: **hacettepeyapayzeka@gmail.com**
Geliştirenler: Metin Bera Süslü & M. Furkan Taşatan

---

## 📄 Lisans

Bu proje Hacettepe Üniversitesi Yapay Zeka Topluluğu'na aittir. Kullanım ve dağıtım şartları için topluluk yönetimiyle iletişime geçin.
