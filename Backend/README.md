# ai-club-backend

Hacettepe AI Club Web Sitesi Backend Servisi (FastAPI + SQLModel + PostgreSQL).

## Kurulum

```bash
pip install -r requirements.txt
cp .env.example .env    # DATABASE_URL ve SECRET_KEY doldurulmalı
```

## Veritabanı Göçleri (Migrations)

Kod her güncellendiğinde, sunucuyu başlatmadan **önce** göçleri uygulayın:

```bash
alembic upgrade head
```

> **Önemli:** `c1a7f4b9d201` numaralı göç şunları ekler:
> - `stakeholder` tablosu (AI FEST'26 Paydaş Toplulukları)
> - `event.end_date` — çok günlü etkinlikler için bitiş tarihi
> - `event.order_index` ve `announcement.order_index` — admin panelinden elle sıralama
>
> Bu göç uygulanmazsa takvimde çoklu gün ve sıralama özellikleri çalışmaz.

## Çalıştırma

```bash
uvicorn main:app --reload
```

API dokümantasyonu: http://127.0.0.1:8000/docs

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
