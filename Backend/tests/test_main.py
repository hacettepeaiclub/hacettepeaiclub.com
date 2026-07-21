import pytest
from httpx import AsyncClient, ASGITransport
from main import app


# Her testten önce sanal bir sunucu ayağa kaldırır
@pytest.fixture
async def async_client():
    async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


# 1. TEST: Ana Sayfa (Root) Çalışıyor mu?
@pytest.mark.asyncio
async def test_read_main(async_client: AsyncClient):
    # Sanki bir tarayıcıdan giriyormuşuz gibi sahte bir GET isteği atıyoruz
    response = await async_client.get("/")

    # Beklentilerimiz (Assertions)
    assert response.status_code == 200
    assert response.json() == {
        "message": "Hacettepe AI Club API'a Hoş Geldiniz! Asenkron sistem tıkır tıkır çalışıyor. Maşallah!"}