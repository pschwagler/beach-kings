import json
import types
import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import auth_service, user_service, data_service
from backend.database import db


@pytest.fixture(autouse=True)
def setup_database():
    """Initialize database before each test."""
    # Note: init_database is now async, but TestClient handles async routes
    # The database should already be initialized from the application startup
    # For these tests, we'll rely on the actual database connection
    yield
    # Cleanup if needed


def make_client_with_auth(monkeypatch, phone="+10000000000", user_id=1):
    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": phone}
    
    async def fake_get_user_by_id(session, uid):
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Test Admin",
            "email": "test@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z"
        }
    
    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    # Make caller a system admin
    async def fake_get_setting(session, key: str):
        if key == "system_admin_phone_numbers":
            return phone
        return None
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def test_create_league_as_user(monkeypatch):
    client, headers = make_client_with_auth(monkeypatch, phone="+10000000001", user_id=2)
    
    # Mock get_setting for system admin check (not admin in this test)
    async def fake_get_setting_for_league(session, key):
        if key == "system_admin_phone_numbers":
            return "+10000000000"  # Different phone, so user is not admin
        return None
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting_for_league, raising=True)
    
    # Mock get_player_by_user_id to return a player
    async def fake_get_player_by_user_id(session, user_id):
        return {"id": 1, "user_id": user_id, "full_name": "Test User"}
    monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True)
    
    # Mock create_league to avoid database schema issues
    async def fake_create_league(session, name, description, location_id, is_open, whatsapp_group_id, creator_user_id, gender=None, level=None, **kwargs):
        return {
            "id": 1,
            "name": name,
            "description": description,
            "location_id": location_id,
            "is_open": is_open,
            "whatsapp_group_id": whatsapp_group_id,
            "gender": gender,
            "level": level,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
    monkeypatch.setattr(data_service, "create_league", fake_create_league, raising=True)
    
    # Mock list_league_members to return the creator as admin
    async def fake_list_league_members(session, league_id):
        return [{
            "id": 1,
            "league_id": league_id,
            "player_id": 1,
            "role": "admin",
            "player_name": "Test User"
        }]
    monkeypatch.setattr(data_service, "list_league_members", fake_list_league_members, raising=True)
    
    payload = {
        "name": "Test League",
        "description": "Desc",
        "location_id": None,
        "is_open": True,
        "whatsapp_group_id": None
    }
    r = client.post("/api/leagues", json=payload, headers=headers)
    if r.status_code != 200:
        print(f"Error: {r.status_code}, {r.text}")
    assert r.status_code == 200, f"Response: {r.status_code} - {r.text}"
    body = r.json()
    assert body["name"] == "Test League"


def test_settings_put_get_system_admin(monkeypatch):
    client, headers = make_client_with_auth(monkeypatch, phone="+10000000000")
    
    # Mock set_setting and get_setting to use a simple store
    _settings_store = {}
    async def fake_set_setting(session, key, value):
        _settings_store[key] = value
    async def fake_get_setting_for_settings(session, key):
        # First check if it's system_admin_phone_numbers for auth check
        if key == "system_admin_phone_numbers":
            return "+10000000000"
        # Otherwise return from store
        return _settings_store.get(key)
    monkeypatch.setattr(data_service, "set_setting", fake_set_setting, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting_for_settings, raising=True)
    
    set_resp = client.put("/api/settings/sample_key", json={"value": "123"}, headers=headers)
    assert set_resp.status_code == 200
    get_resp = client.get("/api/settings/sample_key", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["value"] == "123"  # value stored as string


def test_locations_crud_system_admin(monkeypatch):
    client, headers = make_client_with_auth(monkeypatch)
    
    loc_id = "1"
    # Mock location operations
    async def fake_create_location(session, location_id, name, city=None, state=None, **kwargs):
        return {"id": location_id, "name": name, "city": city, "state": state}
    async def fake_list_locations(session):
        return [{"id": loc_id, "name": "LA", "city": "Los Angeles", "state": "CA"}]
    async def fake_update_location(session, location_id, **kwargs):
        return {"id": location_id, "name": "LA", "city": "LA", "state": "CA"}
    async def fake_delete_location(session, location_id):
        return True
    
    monkeypatch.setattr(data_service, "create_location", fake_create_location, raising=True)
    monkeypatch.setattr(data_service, "list_locations", fake_list_locations, raising=True)
    monkeypatch.setattr(data_service, "update_location", fake_update_location, raising=True)
    monkeypatch.setattr(data_service, "delete_location", fake_delete_location, raising=True)
    
    # create
    r = client.post("/api/locations", json={"id": loc_id, "name": "LA", "city": "Los Angeles", "state": "CA"}, headers=headers)
    assert r.status_code == 200
    location = r.json()
    assert location["id"] == loc_id
    # list
    r = client.get("/api/locations")
    assert r.status_code == 200
    assert any(l["id"] == loc_id for l in r.json())
    # update
    r = client.put(f"/api/locations/{loc_id}", json={"city": "LA"}, headers=headers)
    assert r.status_code == 200
    # delete
    r = client.delete(f"/api/locations/{loc_id}", headers=headers)
    assert r.status_code == 200


def test_courts_crud_system_admin(monkeypatch):
    client, headers = make_client_with_auth(monkeypatch)
    
    loc_id = "1"
    court_id = 1
    # Mock location and court operations
    async def fake_create_location(session, location_id, name, city=None, state=None, **kwargs):
        return {"id": location_id, "name": name, "city": city, "state": state}
    async def fake_create_court(session, name, location_id, **kwargs):
        return {"id": court_id, "name": name, "location_id": location_id}
    async def fake_list_courts(session, location_id):
        return [{"id": court_id, "name": "Court A", "location_id": location_id}]
    async def fake_update_court(session, court_id, **kwargs):
        return {"id": court_id, "name": "Court A", "location_id": loc_id, "address": "123 Beach"}
    async def fake_delete_court(session, court_id):
        return True
    
    monkeypatch.setattr(data_service, "create_location", fake_create_location, raising=True)
    monkeypatch.setattr(data_service, "create_court", fake_create_court, raising=True)
    monkeypatch.setattr(data_service, "list_courts", fake_list_courts, raising=True)
    monkeypatch.setattr(data_service, "update_court", fake_update_court, raising=True)
    monkeypatch.setattr(data_service, "delete_court", fake_delete_court, raising=True)
    
    # need a location
    loc = client.post("/api/locations", json={"id": loc_id, "name": "OC", "city": "Newport", "state": "CA"}, headers=headers).json()
    assert loc["id"] == loc_id
    # create court
    r = client.post("/api/courts", json={"name": "Court A", "location_id": loc_id}, headers=headers)
    assert r.status_code == 200
    court = r.json()
    assert court["id"] == court_id
    # list courts
    r = client.get(f"/api/courts?location_id={loc_id}")
    assert r.status_code == 200
    # update court
    r = client.put(f"/api/courts/{court_id}", json={"address": "123 Beach"}, headers=headers)
    assert r.status_code == 200
    # delete court
    r = client.delete(f"/api/courts/{court_id}", headers=headers)
    assert r.status_code == 200


def test_matches_query_public(monkeypatch):
    # no auth provided; should still work for submitted-only public view
    client = TestClient(app)
    
    async def fake_query_matches(session, body, user=None):
        return []
    
    monkeypatch.setattr(data_service, "query_matches", fake_query_matches, raising=True)
    
    r = client.post("/api/matches/search", json={"limit": 5})
    # even if empty DB, endpoint should respond
    if r.status_code != 200:
        print(f"Error: {r.status_code}, {r.text}")
    assert r.status_code == 200, f"Response: {r.status_code} - {r.text}"
    assert isinstance(r.json(), list)


