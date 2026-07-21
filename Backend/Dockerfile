# Resmi Python 3.13 imajını kullan (hafif versiyon)
FROM python:3.13-slim

# Çalışma dizinini ayarla
WORKDIR /app

# İşletim sistemi seviyesindeki bağımlılıkları kur (PostgreSQL adaptörü için gerekebilir)
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Gereksinim dosyasını kopyala ve kütüphaneleri kur
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Projenin geri kalan tüm dosyalarını kopyala
COPY . .

# FastAPI'nin çalışacağı portu dışarı aç
EXPOSE 8000

# Uygulamayı Uvicorn ile başlat
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]