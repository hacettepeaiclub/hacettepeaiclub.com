import os
import uuid
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from fastapi.staticfiles import StaticFiles
from security import get_current_user

router = APIRouter(
    prefix="/uploads",
    tags=["Uploads (Dosya/Resim Yükleme)"]
)

# Resimlerin kaydedileceği ana klasör
UPLOAD_DIR = "static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# İzin verilen dosya uzantıları
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@router.post("/image", status_code=status.HTTP_201_CREATED)
async def upload_image(
        file: UploadFile = File(...),
        current_user: str = Depends(get_current_user)  # Sadece giriş yapmış yetkililer yükleyebilir
):
    # 1. Dosya uzantısını kontrol et
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Geçersiz dosya formatı. İzin verilenler: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # 2. Benzersiz bir dosya adı oluştur
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # 3. Dosyayı diske yaz
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dosya kaydedilirken bir hata oluştu."
        )

    # 4. Frontend'in erişebileceği URL adresini geri dön
    # Örn: http://localhost:8000/static/uploads/benzersiz-isim.png
    file_url = f"/static/uploads/{unique_filename}"
    return {
        "message": "Resim başarıyla yüklendi.",
        "url": file_url
    }