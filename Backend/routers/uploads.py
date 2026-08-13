import os
import uuid

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status

from security import get_current_user

router = APIRouter(
    prefix="/uploads",
    tags=["Uploads (Dosya/Resim Yükleme)"]
)

# Resimlerin kaydedileceği ana klasör
UPLOAD_DIR = "static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# İzin verilen dosya uzantıları (frontend'deki ALLOWED_IMAGE_EXTENSIONS ile aynı olmalı)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# Tek dosya için üst sınır (frontend'deki MAX_IMAGE_SIZE_MB ile aynı olmalı)
MAX_FILE_SIZE_MB = 8
MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024


@router.post("/image", status_code=status.HTTP_201_CREATED)
async def upload_image(
        file: UploadFile = File(...),
        current_user: str = Depends(get_current_user)  # Sadece giriş yapmış yetkililer yükleyebilir
):
    # 1. Dosya adı gerçekten geldi mi?
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dosya adı okunamadı. Lütfen dosyayı tekrar seçin."
        )

    # 2. Dosya uzantısını kontrol et
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Geçersiz dosya formatı ({file_ext or 'uzantısız'}). "
                   f"İzin verilenler: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    # 3. İçeriği oku ve boyutu doğrula
    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Yüklenen dosya boş."
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Dosya çok büyük ({len(content) / 1024 / 1024:.1f} MB). "
                   f"En fazla {MAX_FILE_SIZE_MB} MB yükleyebilirsiniz."
        )

    # 4. Benzersiz bir dosya adı oluştur (kullanıcıdan gelen ad hiç kullanılmaz)
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # 5. Dosyayı diske yaz
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(content)
    except OSError as exc:
        print(f"!!! UPLOAD ERROR !!!: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dosya sunucuya kaydedilemedi. Disk alanı veya klasör izinlerini kontrol edin."
        )

    # 6. Frontend'in erişebileceği URL adresini geri dön
    # Örn: /static/uploads/benzersiz-isim.png
    return {
        "message": "Resim başarıyla yüklendi.",
        "url": f"/static/uploads/{unique_filename}"
    }
