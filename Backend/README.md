# ai-club-backend

Hacettepe AI Club Web Sitesi Backend Servisi (FastAPI + SQLModel + PostgreSQL).

## Kurulum

```bash
pip install -r requirements.txt
cp .env.example .env    # DATABASE_URL ve SECRET_KEY doldurulmalı
```

## Sunucuda Güncelleme (Docker)

Proje Docker ile çalışır; bağımlılıklar **konteynerin içindedir**. Bu yüzden
`alembic` komutu host makinede değil, konteyner içinde çalıştırılmalıdır.

```bash
cd ~/hacettepeaiclub.com/Backend

git pull
docker compose build web          # yeni kod imaja girsin
docker compose up -d              # konteyneri yeniden başlat

docker compose exec web alembic upgrade head   # göçleri uygula
```

> Host'ta doğrudan `alembic upgrade head` çalıştırmayın:
> sistem Python'unda `dotenv`/`sqlmodel` kurulu değildir ve `.env` içindeki
> `db:5432` adresi yalnızca Docker ağı içinden çözülebilir.

### Göç sırası önemli mi?

Hayır. Uygulama açılışta `SQLModel.metadata.create_all()` çalıştırdığı için
`stakeholder` tablosu konteyner ilk başladığında zaten oluşabilir. `c1a7f4b9d201`
göçü bu duruma karşı "varsa atla" mantığıyla yazılmıştır; hangi sırada
çalışırsa çalışsın hata vermez.

`c1a7f4b9d201` göçünün eklediği alanlar:

- `stakeholder` tablosu (AI FEST'26 Paydaş Toplulukları)
- `event.end_date` — çok günlü etkinlikler için bitiş tarihi
- `event.order_index` ve `announcement.order_index` — admin panelinden elle sıralama

Bu göç uygulanmazsa çoklu gün ve sıralama özellikleri çalışmaz.

## Yerel Geliştirme (Docker'sız)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload
```

API dokümantasyonu: http://127.0.0.1:8000/docs

## Sorun Giderme

| Hata | Sebep | Çözüm |
|---|---|---|
| `ModuleNotFoundError: No module named 'dotenv'` | Komut konteyner dışında, sistem Python'uyla çalıştırıldı | `docker compose exec web alembic upgrade head` |
| `could not translate host name "db"` | `db` adresi yalnızca Docker ağında geçerli | Komutu konteyner içinde çalıştırın |
| `relation "stakeholder" already exists` | Eski (idempotent olmayan) göç sürümü | Bu depodaki güncel göç dosyasını kullanın |

## Testler

```bash
pytest
```

## Rotalar

| Kaynak | Yol | Not |
|---|---|---|
| Etkinlikler / Takvim | `/events` | `event_type` alanı slayt (`Slider`) ve yarışma kartlarını (`YarismaKarti`) da ayırır |
| Projeler | `/projects` | |
| Duyurular | `/announcements` | Detaylar `content` alanında JSON olarak tutulur |
| Yönetim Kurulu | `/board-members` | |
| İş Birlikleri | `/sponsors` | |
| AI FEST Paydaşları | `/stakeholders` | |
| E-Bülten | `/newsletter` | |
| Kimlik Doğrulama | `/auth`, `/users` | |
| Görsel Yükleme | `/uploads/image` | |

`GET` istekleri herkese açıktır; `POST`, `PUT` ve `DELETE` için JWT gerekir.
