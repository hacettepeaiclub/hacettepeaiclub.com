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
    response = await async_client.get("/")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "online"
    assert body["message"] == "Hacettepe AI Club API"


# 2. TEST: Yeni paydaş (stakeholder) rotası kayıtlı mı?
@pytest.mark.asyncio
async def test_stakeholders_route_registered(async_client: AsyncClient):
    schema = await async_client.get("/openapi.json")
    assert schema.status_code == 200
    assert "/stakeholders/" in schema.json()["paths"]


# 3. TEST: Etkinlik şemasında çoklu gün ve sıralama alanları var mı?
@pytest.mark.asyncio
async def test_event_schema_has_new_fields(async_client: AsyncClient):
    schema = await async_client.get("/openapi.json")
    event_props = schema.json()["components"]["schemas"]["Event"]["properties"]
    assert "end_date" in event_props
    assert "order_index" in event_props


# 4. TEST: Duyuruda sıralama alanı var mı?
@pytest.mark.asyncio
async def test_announcement_schema_has_order_index(async_client: AsyncClient):
    schema = await async_client.get("/openapi.json")
    props = schema.json()["components"]["schemas"]["Announcement"]["properties"]
    assert "order_index" in props


# 5. TEST: Yetkisiz kullanıcı içerik ekleyemez
@pytest.mark.asyncio
async def test_create_requires_auth(async_client: AsyncClient):
    response = await async_client.post("/stakeholders/", json={
        "name": "Test Topluluk",
        "logo_url": "fa-solid fa-users",
    })
    assert response.status_code == 401
