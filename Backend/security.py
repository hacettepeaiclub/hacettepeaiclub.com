from slowapi import Limiter
from slowapi.util import get_remote_address

# Kullanıcıların IP adresine göre istek sınırı koyacak olan nesnemiz
limiter = Limiter(key_func=get_remote_address)

import os
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, status

# .env dosyasındaki ayarları yükle
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "super_gizli_anahtar_yedek")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))


# 1. Şifreyi Maskeleme (Hash)
def get_password_hash(password: str) -> str:
    # Şifreyi şifrelenmiş (hash'lenmiş) bir metne çevirir
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed_password.decode('utf-8')


# 2. Şifre Doğrulama
def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Kullanıcının girdiği şifre ile veritabanındaki maskelenmiş şifreyi karşılaştırır
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


# 3. Giriş Bileti (Token) Üretme
def create_access_token(data: dict):
    to_encode = data.copy()
    # Biletin son kullanma tarihini ayarla (Bizimki 60 dakika)
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})

    # Token'ı oluştur ve şifrele
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Swagger UI'daki kilit mekanizmasını (Authorize) aktif eden ayar
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Kapılarda durup gelenin biletini (Token) kontrol edecek olan fonksiyon
def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Geçersiz veya süresi dolmuş giriş bileti.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Biletin sahte olup olmadığını ve süresini kontrol et
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        return email
    except jwt.InvalidTokenError:
        raise credentials_exception