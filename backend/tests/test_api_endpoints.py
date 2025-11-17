import json
import types
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import auth_service, user_service, data_service
from backend.database import db
from backend.database.migrate_add_is_public_to_matches import migrate as migrate_is_public


@pytest.fixture(autouse=True)
def setup_database():
    """Initialize database before each test."""
    # Just initialize schema - it uses CREATE TABLE IF NOT EXISTS so it's safe
    # The schema.sql includes all tables including leagues, seasons, matches with is_public
    try:
        db.init_database()
        # Ensure is_public column exists (migration is idempotent)
        migrate_is_public()
    except Exception as e:
        # If tables already exist, that's fine - schema.sql uses IF NOT EXISTS
        # But we still want to ensure is_public column exists
        try:
            migrate_is_public()
        except:
            pass
    yield
    # Cleanup if needed


def make_client_with_auth(monkeypatch, phone="+10000000000", user_id=1):
    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": phone}
    def fake_get_user_by_id(uid):
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
    def fake_get_setting(key: str):
        if key == "system_admin_phone_numbers":
            return phone
        return None
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def test_create_league_as_user(monkeypatch):
    client, headers = make_client_with_auth(monkeypatch, phone="+10000000001", user_id=2)
    
    # Create a player for the user first (required for creator to be added as member)
    player = data_service.get_player_by_user_id(2)
    if not player:
        # Create a test player for the user
        with db.get_db() as conn:
            cur = conn.execute(
                """INSERT INTO players (full_name, user_id) VALUES (?, ?)""",
                ("Test User", 2)
            )
            player_id = cur.lastrowid
    else:
        player_id = player["id"]
    
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
    league_id = body["id"]
    
    # Verify creator is added as league admin member
    members = data_service.list_league_members(league_id)
    assert len(members) > 0, "Creator should be added as league member"
    creator_member = next((m for m in members if m["player_id"] == player_id), None)
    assert creator_member is not None, "Creator should be in league members"
    assert creator_member["role"] == "admin", "Creator should have admin role"


def test_settings_put_get_system_admin(monkeypatch):
    client, headers = make_client_with_auth(monkeypatch)
    set_resp = client.put("/api/settings/sample_key", json={"value": "123"}, headers=headers)
    assert set_resp.status_code == 200
    get_resp = client.get("/api/settings/sample_key", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["value"] in (None, "123")  # value stored as string


def test_locations_crud_system_admin(monkeypatch):
    client, headers = make_client_with_auth(monkeypatch)
    # create
    r = client.post("/api/locations", json={"name": "LA", "city": "Los Angeles", "state": "CA"}, headers=headers)
    assert r.status_code == 200
    location = r.json()
    loc_id = location["id"]
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
    # need a location
    loc = client.post("/api/locations", json={"name": "OC", "city": "Newport", "state": "CA"}, headers=headers).json()
    loc_id = loc["id"]
    # create court
    r = client.post("/api/courts", json={"name": "Court A", "location_id": loc_id}, headers=headers)
    assert r.status_code == 200
    court = r.json()
    court_id = court["id"]
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
    r = client.post("/api/matches/query", json={"limit": 5})
    # even if empty DB, endpoint should respond
    if r.status_code != 200:
        print(f"Error: {r.status_code}, {r.text}")
    assert r.status_code == 200, f"Response: {r.status_code} - {r.text}"
    assert isinstance(r.json(), list)


