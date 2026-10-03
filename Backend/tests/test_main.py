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

# 6. TEST: Üye doğrulama rotası kayıtlı mı?
@pytest.mark.asyncio
async def test_members_routes_registered(async_client: AsyncClient):
    schema = await async_client.get("/openapi.json")
    paths = schema.json()["paths"]
    assert "/members/verify" in paths
    assert "/members/import" in paths


# 7. TEST: Üye listesi yetkisiz kullanıcıya açılmıyor
@pytest.mark.asyncio
async def test_member_list_requires_auth(async_client: AsyncClient):
    assert (await async_client.get("/members/")).status_code == 401
    assert (await async_client.get("/members/stats")).status_code == 401
    assert (await async_client.post("/members/import")).status_code == 401


# 8. TEST: Excel'deki "AD SOYAD<çok boşluk>nickname" hücresi doğru ayrışıyor
def test_excel_name_nickname_parsing():
    import io
    import openpyxl
    from routers.members import parse_member_workbook

    separator = " " * 40
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(["Topluluk_Uye_Listesi"])
    sheet.append(["Adı Soyadı", "GSM", "Başvuru Tarihi", "Fakülte/Program", "Durum"])
    sheet.append([f"ABDULKADİR CEZLAN{separator}abdulkadircezlan25", 5070000000,
                  "24.06.2026 15:38", f"BİLİŞİM ENSTİTÜSÜ{separator}Bilişim Sistemleri", "Onaylı"])
    sheet.append([f"ZEYNEP AÇIKGÖZ{separator}zeynepacikgoz", 5070000001,
                  "21.02.2026 10:54", f"EĞİTİM FAKÜLTESİ{separator}SINIF ÖĞRETMENLİĞİ", "Onaylı"])
    # Aynı kişi iki kez (çift anadal) → tek kayda inmeli
    sheet.append([f"ZEYNEP AÇIKGÖZ{separator}zeynepacikgoz", 5070000001,
                  "21.02.2026 10:54", f"FEN FAKÜLTESİ{separator}FİZİK", "Onaylı"])
    # Onaylı olmayan başvuru → alınmamalı
    sheet.append([f"REDDEDİLEN KİŞİ{separator}reddedilen26", 5070000002,
                  "01.10.2026 10:00", f"FEN FAKÜLTESİ{separator}FİZİK", "Reddedildi"])

    buffer = io.BytesIO()
    workbook.save(buffer)

    records, summary = parse_member_workbook(buffer.getvalue())
    by_nickname = {record["nickname"]: record for record in records}

    assert set(by_nickname) == {"abdulkadircezlan25", "zeynepacikgoz"}
    assert summary["duplicates"] == 1
    assert summary["skipped_not_approved"] == 1
    # Tamamı büyük harfli ad, Türkçe kurallarıyla düzeltiliyor (I→ı, İ→i)
    assert by_nickname["abdulkadircezlan25"]["full_name"] == "Abdulkadir Cezlan"
    assert by_nickname["zeynepacikgoz"]["full_name"] == "Zeynep Açıkgöz"


# 9. TEST: E-posta normalleştirme ASCII kuralıyla yapılıyor
# ("ABDULKADIRCEZLAN25" Türkçe kuralla küçültülse "abdulkadırcezlan25" olurdu)
def test_nickname_from_email_normalisation():
    from fastapi import HTTPException
    from routers.members import nickname_from_email

    assert nickname_from_email("abdulkadircezlan25@hacettepe.edu.tr") == "abdulkadircezlan25"
    assert nickname_from_email("ABDULKADIRCEZLAN25@HACETTEPE.EDU.TR") == "abdulkadircezlan25"
    assert nickname_from_email("  Seyma.Fidan@hacettepe.edu.tr ") == "seyma.fidan"
    # Alan adı yazılmasa da kabul edilir (telefonda yazmak zor)
    assert nickname_from_email("adinaltas") == "adinaltas"
    # Hacettepe dışı adresler ve bozuk girdiler reddedilir
    for bad in ["birisi@gmail.com", "", "@hacettepe.edu.tr", "x@hacettepe.edu.tr.evil.com"]:
        with pytest.raises(HTTPException):
            nickname_from_email(bad)
