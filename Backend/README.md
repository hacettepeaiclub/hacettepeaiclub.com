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
| İş Birlikleri | `/sponsors`, `/sponsor-categories` | `is_discount` işaretli bir kategorideki kayıtlar, `discount` oranlarıyla `indirimler.html` sayfasında da listelenir |
| AI FEST Paydaşları | `/stakeholders` | |
| E-Bülten | `/newsletter` | |
| Üye Listesi | `/members` | `POST /members/verify` herkese açıktır (dakikada 30 istek) ve yalnızca "aktif üye mi + ad soyad" döner; listeleme ve Excel yükleme JWT ister |
| AI FEST'26 Yoklama / Çekiliş | `/aifest` | `POST /aifest/checkin` herkese açıktır; katılımcı Excel'i, oturum kodları, çekiliş ve dışa aktarma JWT ister |
| Kimlik Doğrulama | `/auth`, `/users` | |
| Görsel Yükleme | `/uploads/image` | |

`GET` istekleri herkese açıktır; `POST`, `PUT` ve `DELETE` için JWT gerekir.
Tek istisna `POST /members/verify`: indirim sayfasındaki üyelik sorgusu olduğu
için herkese açıktır, ancak hız sınırı vardır ve liste dökümüne izin vermez.

## Üye listesi (indirim sayfası)

Admin panelindeki **Üyeleri Güncelle** ekranından, topluluk yönetim sisteminden
indirilen Excel (.xlsx) dosyası yüklenir. "Adı Soyadı" hücresinde addan sonra
gelen kullanıcı adı, Hacettepe e-postasının `@` işaretinden önceki kısmı olarak
kullanılır:

```
ABDULKADİR CEZLAN        abdulkadircezlan25
                         └─ abdulkadircezlan25@hacettepe.edu.tr ile doğrulanır
```

Yükleme listeyi **tam senkronize** eder: dosyada olmayan üyeler silinmez,
`is_active = false` yapılır. Bu yüzden yanlış dosya yüklenirse doğru dosyayı
tekrar yüklemek eski hâle döndürür. Telefon numarası sütunu hiç okunmaz.

## AI FEST'26 — oturum yoklaması ve çekiliş

`routers/aifest.py` · tablolar: `fest_participant`, `fest_session`, `fest_checkin`,
`fest_raffle_winner` (göç: `b5c8e2f4a1d7`). Arayüz AI Fest sitesindedir
(`aifest.hacettepeaiclub.com` reposu: `/yonetim/`, `/cekilis/`, ana sayfada *Yoklama Ver*);
giriş bu sitenin admin hesaplarıyla yapılır.

- **Excel:** Etkinlik kayıt sisteminin katılımcı listesi değiştirilmeden yüklenir
  (`Ad Soyad`, `TC / Okul No`, `GSM` zorunlu; `Email`, `Tip`, `Durum` okunur). Tam senkronize
  edilir; dosyada olmayanlar pasife alınır, yoklamaları korunur.
- **Gizlilik:** TC/okul no düz metin saklanmaz (`SECRET_KEY` ile HMAC + son 3 hane), telefonun
  yalnızca son 4 hanesi tutulur. ⚠️ Etkinlik süresince `SECRET_KEY` değiştirilmemeli; değişirse
  Excel tekrar yüklenmeli.
- **Oturumlar:** `FEST_SESSIONS` listesinden ilk istekte rastgele 4 haneli kodla oluşturulur
  (ID'ler AI Fest sitesindeki `src/data/program.ts` ile aynı). `auto` modda yoklama başlangıçtan
  10 dk önce açılır, bitişten 20 dk sonra kapanır; `open` / `closed` elle zorlar.
- **Kaba kuvvet:** Salondaki herkes aynı IP'den çıkabildiği için IP sınırı cömerttir (600/dk);
  aynı katılımcı için 10 yanlış koddan sonra 10 dk kilit (bellekte, tek uvicorn süreci varsayımı).
- **CORS:** `main.py` içinde `https://aifest.hacettepeaiclub.com`, GitHub Pages kopyası ve
  geliştirme adresleri izinlidir.

