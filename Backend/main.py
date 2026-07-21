from routers import events, projects, sponsors, settings, board_members, announcements, auth, users, uploads  # <-- BURAYA uploads EKLEDİK
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from sqlmodel import SQLModel
from fastapi.staticfiles import StaticFiles

# Kendi yazdığımız dosyaları içeri aktarıyoruz
from database import engine
import models
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from security import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # print("Veritabanı tabloları kontrol ediliyor/oluşturuluyor...")
    # async with engine.begin() as conn:
    #     await conn.run_sync(SQLModel.metadata.create_all)
    # print("Tablolar hazır!")
    yield
    print("Uygulama kapanıyor...")

app = FastAPI(
    title="🚀 Hacettepe AI Club API",
    description="""
Hacettepe Üniversitesi Yapay Zeka Topluluğu resmi web sitesi için geliştirilmiş asenkron ve yüksek performanslı backend servisidir.

### 🔐 Güvenlik ve Yetkilendirme
* **Herkese Açık (Public) Rotalar:** `GET` istekleri (Etkinlik listeleme, duyurular, sponsorlar vb.) herkes tarafından görüntülenebilir.
* **Kilitli (Admin) Rotalar:** `POST`, `PUT` ve `DELETE` işlemleri sadece geçerli bir JWT Token (Giriş Bileti) ile yetkilendirilmiş adminler tarafından yapılabilir.
* **Hız Sınırı (Rate Limiting):** Kötü niyetli brute-force saldırılarını engellemek adına `/auth/login` endpoint'i dakikada en fazla 5 istek ile sınırlandırılmıştır.

### 📁 Medya / Uploads
* Görseller yüklendikten sonra `/static/uploads/` dizini altından doğrudan servis edilir.
""",
    version="1.1.0",
    contact={
        "name": "Hacettepe AI Club Tech Team",
        "email": "tech@hacettepeaiclub.com",
    },
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 1. Sistemsel Beklenmedik Hataları Yakalama (Python Exception - 500)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Burada hatayı terminale/log dosyasına yazdırıyoruz ki backend geliştirici görebilsin
    print(f"!!! CRITICAL ERROR !!!: {str(exc)}")

    # Frontend'e ise kibar ve standart bir JSON formatı dönüyoruz
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error_type": "InternalServerError",
            "message": "Sunucu tarafında beklenmedik bir hata oluştu. Teknik ekip bilgilendirildi.",
            "detail": str(exc) if app.debug else None  # Geliştirme aşamasındaysak detayı göster
        }
    )


# 2. FastAPI'nin Kendi HTTPException Hatalarını Yakalama (400, 401, 404 vb.)
from fastapi.exceptions import HTTPException as FastAPIHTTPException


@app.exception_handler(FastAPIHTTPException)
async def http_exception_handler(request: Request, exc: FastAPIHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error_type": "HTTPException",
            "message": exc.detail,
            "headers": exc.headers if hasattr(exc, "headers") else None
        }
    )

# Yüklenen resimleri /static adresi üzerinden tarayıcıya sunabilmek için bu satırı ekledik
app.mount("/static", StaticFiles(directory="static"), name="static")

# Frontend'in API'ye erişebilmesi için izin verilen adresler
#origins = [
#    "http://localhost:3000",  # React / Next.js
#    "http://localhost:5173",  # Vite
#    "*"                       # Geliştirme aşamasında her şeye izin ver
#]

origins = [
    "https://hacettepeaiclub.com",
    "https://www.hacettepeaiclub.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # GET, POST, PUT, DELETE vb. tüm metodlara izin ver
    allow_headers=["*"],  # Tüm isteklere (Header) izin ver
)

# Rotaları (Router) uygulamaya bağlama
app.include_router(events.router)
app.include_router(projects.router)
app.include_router(sponsors.router)
app.include_router(settings.router)
app.include_router(board_members.router)
app.include_router(announcements.router)
app.include_router(auth.router)
app.include_router(users.router)

app.include_router(uploads.router)  # <-- RESİM YÜKLEME ROTASINI BURAYA EKLEDİK

@app.get("/")
async def root():
    return {"message": "Hacettepe AI Club API", "status": "online", "docs": "/docs"}

