"""
Comprehensive unit tests for all API endpoints.
Tests ensure all routes work correctly with proper mocking of dependencies.
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
from backend.utils.datetime_utils import utcnow
from backend.api.main import app
from backend.api import auth_dependencies
from backend.services import auth_service, user_service, data_service, photo_match_service


# ============================================================================
# Test Fixtures and Helpers
# ============================================================================

def make_client_with_auth(monkeypatch, phone="+10000000000", user_id=1):
    """Helper to create authenticated test client."""
    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": phone}
    
    async def fake_get_user_by_id(session, uid):
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Test User",
            "email": "test@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z"
        }
    
    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    
    async def fake_get_setting(session, key: str):
        if key == "system_admin_phone_numbers":
            return phone
        return None
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
    
    return TestClient(app), {"Authorization": "Bearer dummy"}


# ============================================================================
# Auth Endpoints Tests
# ============================================================================

class TestAuthEndpoints:
    """Tests for authentication endpoints."""
    
    def test_signup_success(self, monkeypatch):
        """Test successful signup."""
        client = TestClient(app)
        
        async def fake_check_phone_exists(session, phone):
            return False
        
        async def fake_create_verification_code(session, **kwargs):
            return True
        
        monkeypatch.setattr(user_service, "check_phone_exists", fake_check_phone_exists, raising=True)
        monkeypatch.setattr(user_service, "create_verification_code", fake_create_verification_code, raising=True)
        
        # Mock normalize_phone_number to return valid phone
        def fake_normalize_phone_number(phone):
            return "+15551234567"
        
        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number, raising=True)
        
        # Password must have at least 8 chars and at least one number
        payload = {
            "phone_number": "+15551234567",
            "password": "testpass123",  # Has 11 chars and includes numbers
            "full_name": "Test User",
            "email": "test@example.com"
        }
        response = client.post("/api/auth/signup", json=payload)
        if response.status_code != 200:
            print(f"Error: {response.status_code}, {response.text}")
        assert response.status_code == 200, f"Response: {response.status_code} - {response.text}"
        assert response.json()["status"] == "success"
    
    def test_signup_duplicate_phone(self, monkeypatch):
        """Test signup with duplicate phone number."""
        client = TestClient(app)
        
        def fake_normalize_phone_number(phone):
            return "+15551234567"
        
        async def fake_check_phone_exists(session, phone):
            return True
        
        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number, raising=True)
        monkeypatch.setattr(user_service, "check_phone_exists", fake_check_phone_exists, raising=True)
        
        payload = {
            "phone_number": "+15551234567",
            "password": "testpass123",
            "full_name": "Test User"
        }
        response = client.post("/api/auth/signup", json=payload)
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()
    
    def test_signup_missing_full_name(self, monkeypatch):
        """Test signup without required full_name."""
        client = TestClient(app)
        
        def fake_normalize_phone_number(phone):
            return "+15551234567"
        
        async def fake_check_phone_exists(session, phone):
            return False
        
        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number, raising=True)
        monkeypatch.setattr(user_service, "check_phone_exists", fake_check_phone_exists, raising=True)
        
        payload = {
            "phone_number": "+15551234567",
            "password": "testpass123"
            # full_name is missing
        }
        response = client.post("/api/auth/signup", json=payload)
        # Pydantic validation returns 422, route validation returns 400
        assert response.status_code in (400, 422)
        detail = response.json()["detail"]
        if isinstance(detail, list):
            detail = str(detail)
        assert "full" in str(detail).lower() or "name" in str(detail).lower()
    
    def test_login_success(self, monkeypatch):
        """Test successful login."""
        client = TestClient(app)
        
        def fake_normalize_phone_number(phone):
            return "+15551234567"
        
        async def fake_get_user_by_phone(session, phone):
            return {
                "id": 1,
                "phone_number": phone,
                "password_hash": auth_service.hash_password("testpass123"),
                "is_verified": True
            }
        
        async def fake_create_refresh_token(session, user_id, token, expires_at):
            return True
        
        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True)
        monkeypatch.setattr(user_service, "create_refresh_token", fake_create_refresh_token, raising=True)
        
        payload = {
            "phone_number": "+15551234567",
            "password": "testpass123"
        }
        response = client.post("/api/auth/login", json=payload)
        assert response.status_code == 200
        assert "access_token" in response.json()
    
    def test_login_invalid_credentials(self, monkeypatch):
        """Test login with invalid credentials."""
        client = TestClient(app)
        
        def fake_normalize_phone_number(phone):
            return "+15551234567"
        
        async def fake_get_user_by_phone(session, phone):
            return {
                "id": 1,
                "phone_number": phone,
                "password_hash": auth_service.hash_password("wrongpass"),
                "is_verified": True
            }
        
        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True)
        
        payload = {
            "phone_number": "+15551234567",
            "password": "testpass123"
        }
        response = client.post("/api/auth/login", json=payload)
        assert response.status_code == 401
    
    def test_send_verification(self, monkeypatch):
        """Test sending verification code."""
        client = TestClient(app)
        
        def fake_normalize_phone_number(phone):
            return "+15551234567"
        
        async def fake_get_user_by_phone(session, phone):
            return {"id": 1, "phone_number": phone, "is_verified": True}
        
        async def fake_create_verification_code(session, **kwargs):
            return True
        
        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True)
        monkeypatch.setattr(user_service, "create_verification_code", fake_create_verification_code, raising=True)
        
        payload = {
            "phone_number": "+15551234567"
        }
        response = client.post("/api/auth/send-verification", json=payload)
        assert response.status_code == 200
        assert response.json()["status"] == "success"
    
    def test_verify_phone_success(self, monkeypatch):
        """Test successful phone verification."""
        client = TestClient(app)
        
        def fake_normalize_phone_number(phone):
            return "+15551234567"
        
        async def fake_get_user_by_phone(session, phone):
            return {"id": 1, "phone_number": phone, "failed_verification_attempts": 0}
        
        async def fake_verify_and_mark_code_used(session, phone, code):
            return {"password_hash": "hash", "name": "Test User"}
        
        async def fake_check_phone_exists(session, phone):
            return False
        
        async def fake_create_user(session, **kwargs):
            return 1
        
        async def fake_get_user_by_id(session, user_id):
            return {"id": user_id, "phone_number": "+15551234567", "is_verified": True}
        
        async def fake_upsert_user_player(session, user_id, **kwargs):
            return {"id": 1, "user_id": user_id, "full_name": "Test User"}
        
        async def fake_reset_failed_attempts(session, user_id):
            pass
        
        async def fake_create_refresh_token(session, user_id, token, expires_at):
            return True
        
        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True)
        monkeypatch.setattr(user_service, "verify_and_mark_code_used", fake_verify_and_mark_code_used, raising=True)
        monkeypatch.setattr(user_service, "check_phone_exists", fake_check_phone_exists, raising=True)
        monkeypatch.setattr(user_service, "create_user", fake_create_user, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
        monkeypatch.setattr(data_service, "upsert_user_player", fake_upsert_user_player, raising=True)
        monkeypatch.setattr(user_service, "reset_failed_attempts", fake_reset_failed_attempts, raising=True)
        monkeypatch.setattr(user_service, "create_refresh_token", fake_create_refresh_token, raising=True)
        
        payload = {
            "phone_number": "+15551234567",
            "code": "123456"
        }
        response = client.post("/api/auth/verify-phone", json=payload)
        assert response.status_code == 200
        assert "access_token" in response.json()
    
    def test_verify_phone_invalid_code(self, monkeypatch):
        """Test phone verification with invalid code."""
        client = TestClient(app)
        
        def fake_normalize_phone_number(phone):
            return "+15551234567"
        
        async def fake_get_user_by_phone(session, phone):
            return {"id": 1, "phone_number": phone, "failed_verification_attempts": 0}
        
        async def fake_verify_and_mark_code_used(session, phone, code):
            return None
        
        async def fake_increment_failed_attempts(session, phone):
            pass
        
        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True)
        monkeypatch.setattr(user_service, "verify_and_mark_code_used", fake_verify_and_mark_code_used, raising=True)
        monkeypatch.setattr(user_service, "increment_failed_attempts", fake_increment_failed_attempts, raising=True)
        
        payload = {
            "phone_number": "+15551234567",
            "code": "000000"
        }
        response = client.post("/api/auth/verify-phone", json=payload)
        assert response.status_code == 401
    
    def test_refresh_token_success(self, monkeypatch):
        """Test successful token refresh."""
        client = TestClient(app)
        
        async def fake_get_refresh_token(session, token):
            expires_at = (utcnow() + timedelta(days=7)).isoformat()
            return {
                "user_id": 1,
                "token": token,
                "expires_at": expires_at
            }
        
        async def fake_get_user_by_id(session, user_id):
            return {
                "id": user_id,
                "phone_number": "+15551234567",
                "is_verified": True
            }
        
        monkeypatch.setattr(user_service, "get_refresh_token", fake_get_refresh_token, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
        
        payload = {
            "refresh_token": "valid_token"
        }
        response = client.post("/api/auth/refresh", json=payload)
        assert response.status_code == 200
        assert "access_token" in response.json()
    
    def test_refresh_token_expired(self, monkeypatch):
        """Test refresh with expired token."""
        client = TestClient(app)
        
        async def fake_get_refresh_token(session, token):
            expires_at = (utcnow() - timedelta(days=1)).isoformat()
            return {
                "user_id": 1,
                "token": token,
                "expires_at": expires_at
            }
        
        async def fake_delete_refresh_token(session, token):
            return True
        
        monkeypatch.setattr(user_service, "get_refresh_token", fake_get_refresh_token, raising=True)
        monkeypatch.setattr(user_service, "delete_refresh_token", fake_delete_refresh_token, raising=True)
        
        payload = {
            "refresh_token": "expired_token"
        }
        response = client.post("/api/auth/refresh", json=payload)
        assert response.status_code == 401
    
    def test_check_phone(self, monkeypatch):
        """Test check phone endpoint."""
        client = TestClient(app)
        
        def fake_normalize_phone_number(phone):
            return "+15551234567"
        
        async def fake_get_user_by_phone(session, phone):
            return {"id": 1, "phone_number": phone, "is_verified": True}
        
        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True)
        
        response = client.get("/api/auth/check-phone?phone_number=+15551234567")
        if response.status_code != 200:
            print(f"Error: {response.status_code}, {response.text}")
        assert response.status_code == 200, f"Response: {response.status_code} - {response.text}"
        assert response.json()["exists"] is True
    
    def test_get_me(self, monkeypatch):
        """Test get current user endpoint."""
        client, headers = make_client_with_auth(monkeypatch)
        
        async def fake_get_user_by_id(session, user_id):
            return {
                "id": user_id,
                "phone_number": "+10000000000",
                "name": "Test User",
                "email": "test@example.com",
                "is_verified": True,
                "created_at": "2020-01-01T00:00:00Z"
            }
        
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
        
        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["phone_number"] == "+10000000000"


# ============================================================================
# League Endpoints Tests
# ============================================================================

class TestLeagueEndpoints:
    """Tests for league endpoints."""
    
    def test_create_league(self, monkeypatch):
        """Test creating a league."""
        client, headers = make_client_with_auth(monkeypatch, phone="+10000000001", user_id=2)
        
        async def fake_get_setting(session, key):
            return "+10000000000"  # Not admin
        
        async def fake_get_player_by_user_id(session, user_id):
            return {"id": 1, "user_id": user_id}
        
        async def fake_create_league(session, **kwargs):
            return {
                "id": 1,
                "name": "Test League",
                "description": "Test",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
        
        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True)
        monkeypatch.setattr(data_service, "create_league", fake_create_league, raising=True)
        
        payload = {
            "name": "Test League",
            "description": "Test",
            "is_open": True
        }
        response = client.post("/api/leagues", json=payload, headers=headers)
        assert response.status_code == 200
        assert response.json()["name"] == "Test League"
    
    def test_list_leagues(self, monkeypatch):
        """Test listing leagues."""
        client = TestClient(app)
        
        async def fake_list_leagues(session):
            return [{"id": 1, "name": "League 1"}, {"id": 2, "name": "League 2"}]
        
        monkeypatch.setattr(data_service, "list_leagues", fake_list_leagues, raising=True)
        
        response = client.get("/api/leagues")
        assert response.status_code == 200
        assert len(response.json()) == 2
    
    def test_get_league(self, monkeypatch):
        """Test getting a specific league."""
        client, headers = make_client_with_auth(monkeypatch)
        
        async def fake_get_league(session, league_id):
            return {
                "id": league_id,
                "name": "Test League",
                "description": None,
                "location_id": None,
                "is_open": True,
                "whatsapp_group_id": None,
                "gender": None,
                "level": None,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
        
        async def fake_has_league_role(session, user_id, league_id, role):
            return True
        
        monkeypatch.setattr(data_service, "get_league", fake_get_league, raising=True)
        monkeypatch.setattr(auth_dependencies, "_has_league_role", fake_has_league_role, raising=True)
        
        response = client.get("/api/leagues/1", headers=headers)
        assert response.status_code == 200
        assert response.json()["id"] == 1
    
    def test_update_league(self, monkeypatch):
        """Test updating a league."""
        client, headers = make_client_with_auth(monkeypatch)
        
        async def fake_get_league(session, league_id):
            return {"id": league_id, "name": "Old Name"}
        
        async def fake_update_league(session, **kwargs):
            return {
                "id": 1,
                "name": "Updated Name",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
        
        async def fake_has_league_role(session, user_id, league_id, role):
            return True
        
        # Mock the league admin check
        monkeypatch.setattr(auth_dependencies, "_has_league_role", fake_has_league_role, raising=True)
        monkeypatch.setattr(data_service, "get_league", fake_get_league, raising=True)
        monkeypatch.setattr(data_service, "update_league", fake_update_league, raising=True)
        
        payload = {"name": "Updated Name"}
        response = client.put("/api/leagues/1", json=payload, headers=headers)
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"
    
    def test_delete_league(self, monkeypatch):
        """Test deleting a league."""
        client, headers = make_client_with_auth(monkeypatch)
        
        async def fake_delete_league(session, league_id):
            return True
        
        async def fake_has_league_role(session, user_id, league_id, role):
            return True
        
        monkeypatch.setattr(auth_dependencies, "_has_league_role", fake_has_league_role, raising=True)
        monkeypatch.setattr(data_service, "delete_league", fake_delete_league, raising=True)
        
        response = client.delete("/api/leagues/1", headers=headers)
        assert response.status_code == 200


# ============================================================================
# Player Endpoints Tests
# ============================================================================

class TestPlayerEndpoints:
    """Tests for player endpoints."""
    
    # Removed test_list_players - simple database query doesn't need testing
    # The create/update player tests are more valuable
    
    def test_create_player(self, monkeypatch):
        """Test creating a player."""
        client, headers = make_client_with_auth(monkeypatch)
        
        async def fake_get_or_create_player(session, name):
            return 1
        
        monkeypatch.setattr(data_service, "get_or_create_player", fake_get_or_create_player, raising=True)
        
        payload = {"name": "New Player"}
        response = client.post("/api/players", json=payload, headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "success"
    
    def test_get_player_stats(self, monkeypatch):
        """Test getting player statistics by player ID."""
        client = TestClient(app)

        async def fake_get_player_stats_by_id(session, player_id):
            return {
                "player_id": player_id,
                "total_games": 10,
                "wins": 7,
                "losses": 3,
                "win_rate": 70.0,
                "current_elo": 1250
            }

        monkeypatch.setattr(data_service, "get_player_stats_by_id", fake_get_player_stats_by_id, raising=True)

        response = client.get("/api/players/123/stats")
        assert response.status_code == 200
        assert response.json()["player_id"] == 123
    
    def test_get_user_player(self, monkeypatch):
        """Test getting current user's player profile."""
        client, headers = make_client_with_auth(monkeypatch)
        
        async def fake_get_player_by_user_id_with_stats(session, user_id):
            return {
                "id": 1,
                "user_id": user_id,
                "full_name": "Test User",
                "level": "Open",
                "gender": "male",
                "nickname": None,
                "date_of_birth": None,
                "height": None,
                "preferred_side": None,
                "location_id": None,
                "stats": {
                    "current_rating": 1200.0,
                    "total_games": 0,
                    "total_wins": 0,
                }
            }
        
        monkeypatch.setattr(data_service, "get_player_by_user_id_with_stats", fake_get_player_by_user_id_with_stats, raising=True)
        
        response = client.get("/api/users/me/player", headers=headers)
        assert response.status_code == 200
        assert response.json() is not None
        assert response.json()["full_name"] == "Test User"
    
    def test_update_user_player(self, monkeypatch):
        """Test updating user's player profile."""
        client, headers = make_client_with_auth(monkeypatch)
        
        async def fake_upsert_user_player(session, user_id, **kwargs):
            return {
                "id": 1,
                "user_id": user_id,
                "full_name": kwargs.get("full_name", "Test User"),
                "level": kwargs.get("level", "Open"),
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
        
        monkeypatch.setattr(data_service, "upsert_user_player", fake_upsert_user_player, raising=True)
        
        payload = {
            "full_name": "Updated Name",
            "level": "AA"
        }
        response = client.put("/api/users/me/player", json=payload, headers=headers)
        assert response.status_code == 200
        assert response.json()["full_name"] == "Updated Name"


# ============================================================================
# Match Endpoints Tests
# ============================================================================

class TestMatchEndpoints:
    """Tests for match endpoints."""
    
    # Removed test_list_matches - redundant with test_query_matches

    def test_create_match_no_session_no_league_creates_non_league_session(self, monkeypatch):
        """Test POST /api/matches with no session_id or league_id creates non-league session and match."""
        client, headers = make_client_with_auth(monkeypatch, user_id=1)

        created_sessions = []

        async def fake_create_session(session, date, name=None, court_id=None, created_by=None):
            created_sessions.append({"date": date, "created_by": created_by})
            return {
                "id": 999,
                "date": date,
                "name": "Test Session",
                "status": "ACTIVE",
                "code": "ABC123",
                "season_id": None,
                "court_id": court_id,
                "created_by": created_by,
            }

        async def fake_get_player_by_user_id(session, user_id):
            return {"id": 1, "user_id": user_id, "full_name": "Test Player"}

        async def fake_create_match_async(session, match_request, session_id, date):
            return 1001

        monkeypatch.setattr(data_service, "create_session", fake_create_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True)
        monkeypatch.setattr(data_service, "create_match_async", fake_create_match_async, raising=True)

        payload = {
            "team1_player1_id": 1,
            "team1_player2_id": 2,
            "team2_player1_id": 3,
            "team2_player2_id": 4,
            "team1_score": 21,
            "team2_score": 19,
        }
        response = client.post("/api/matches", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        assert data.get("match_id") == 1001
        assert data.get("session_id") == 999
        assert len(created_sessions) == 1
        assert created_sessions[0]["created_by"] == 1
    
    def test_query_matches(self, monkeypatch):
        """Test querying matches."""
        client = TestClient(app)
        
        async def fake_query_matches(session, body, user=None):
            return [{"id": 1, "team1_score": 21, "team2_score": 19}]
        
        monkeypatch.setattr(data_service, "query_matches", fake_query_matches, raising=True)
        
        payload = {"limit": 10}
        response = client.post("/api/matches/search", json=payload)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_get_elo_timeline(self, monkeypatch):
        """Test getting ELO timeline."""
        client = TestClient(app)
        
        async def fake_get_elo_timeline(session):
            return [
                {"player": "Player 1", "date": "2024-01-01", "elo": 1200},
                {"player": "Player 1", "date": "2024-01-02", "elo": 1220}
            ]
        
        monkeypatch.setattr(data_service, "get_elo_timeline", fake_get_elo_timeline, raising=True)
        
        response = client.get("/api/elo-timeline")
        assert response.status_code == 200
        assert len(response.json()) == 2


# ============================================================================
# Rankings and Stats Endpoints Tests
# ============================================================================

class TestStatsEndpoints:
    """Tests for statistics and rankings endpoints."""
    
    def test_get_rankings(self, monkeypatch):
        """Test getting player rankings."""
        client = TestClient(app)
        
        async def fake_get_rankings(session, body=None):
            return [
                {"Name": "Player 1", "Points": 30, "ELO": 1300},
                {"Name": "Player 2", "Points": 25, "ELO": 1250}
            ]
        
        monkeypatch.setattr(data_service, "get_rankings", fake_get_rankings, raising=True)
        
        # Rankings endpoint is POST, not GET
        response = client.post("/api/rankings", json={})
        assert response.status_code == 200
        assert len(response.json()) == 2
    
    def test_recalculate_stats(self, monkeypatch):
        """Test recalculating statistics."""
        from backend.api import routes
        
        client, headers = make_client_with_auth(monkeypatch)
        
        # Mock the stats queue
        class FakeQueue:
            async def enqueue_calculation(self, session, calc_type, season_id=None):
                return 123
        
        fake_queue = FakeQueue()
        # Patch in the routes module namespace since get_stats_queue is imported at the top
        monkeypatch.setattr(routes, "get_stats_queue", lambda: fake_queue, raising=True)
        
        response = client.post("/api/calculate", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "queued"
        assert "job_id" in response.json()
        assert response.json()["job_id"] == 123


# ============================================================================
# Session Endpoints Tests
# ============================================================================

class TestSessionEndpoints:
    """Tests for session endpoints.

    Note: Session API endpoints are tested more thoroughly in test_data_service_crud.py
    which tests the underlying data_service functions. These route tests verify
    basic endpoint availability and auth requirements.
    """

    def test_get_open_sessions_requires_auth(self):
        """Test that open sessions endpoint requires authentication."""
        client = TestClient(app)
        response = client.get("/api/sessions/open")
        assert response.status_code == 403

    def test_get_session_by_code_requires_auth(self):
        """Test that session by code endpoint requires authentication."""
        client = TestClient(app)
        response = client.get("/api/sessions/by-code/ABC12345")
        assert response.status_code == 403

    def test_create_session_requires_auth(self):
        """Test that create session endpoint requires authentication."""
        client = TestClient(app)
        response = client.post("/api/sessions", json={"name": "Test"})
        assert response.status_code == 403

    def test_join_session_requires_auth(self):
        """Test that join session endpoint requires authentication."""
        client = TestClient(app)
        response = client.post("/api/sessions/join", json={"code": "ABC12345"})
        assert response.status_code == 403

    def test_get_session_participants_requires_auth(self):
        """Test that session participants endpoint requires authentication."""
        client = TestClient(app)
        response = client.get("/api/sessions/1/participants")
        assert response.status_code == 403


# ============================================================================
# Settings Endpoints Tests
# ============================================================================

class TestSettingsEndpoints:
    """Tests for settings endpoints."""
    
    def test_get_setting(self, monkeypatch):
        """Test getting a setting."""
        client, headers = make_client_with_auth(monkeypatch)
        
        async def fake_get_setting(session, key):
            if key == "test_key":
                return "test_value"
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            return None
        
        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        
        response = client.get("/api/settings/test_key", headers=headers)
        assert response.status_code == 200
        assert response.json()["value"] == "test_value"
    
    def test_set_setting(self, monkeypatch):
        """Test setting a setting."""
        client, headers = make_client_with_auth(monkeypatch)
        
        _store = {}
        
        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            return _store.get(key)
        
        async def fake_set_setting(session, key, value):
            _store[key] = value
        
        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        monkeypatch.setattr(data_service, "set_setting", fake_set_setting, raising=True)
        
        payload = {"value": "new_value"}
        response = client.put("/api/settings/test_key", json=payload, headers=headers)
        assert response.status_code == 200
        assert response.json()["success"] is True


# ============================================================================
# Photo Job Stream (SSE) Endpoint Tests
# ============================================================================

class TestPhotoJobStreamEndpoint:
    """Tests for GET .../photo-jobs/{job_id}/stream SSE endpoint."""

    def test_stream_requires_auth(self):
        """Stream endpoint returns 403 without auth (HTTPBearer auto_error)."""
        client = TestClient(app)
        response = client.get("/api/leagues/1/matches/photo-jobs/1/stream")
        assert response.status_code == 403

    def test_stream_404_unknown_job(self, monkeypatch):
        """Stream endpoint returns 404 when job not found."""
        client, headers = make_client_with_auth(monkeypatch)

        async def fake_get_photo_match_job(session, job_id):
            return None

        async def fake_has_league_role(session, user_id, league_id, role):
            return True

        monkeypatch.setattr(photo_match_service, "get_photo_match_job", fake_get_photo_match_job, raising=True)
        monkeypatch.setattr(auth_dependencies, "_has_league_role", fake_has_league_role, raising=True)

        response = client.get("/api/leagues/1/matches/photo-jobs/999/stream", headers=headers)
        assert response.status_code == 404

    def test_stream_200_partial_then_done(self, monkeypatch):
        """Stream endpoint returns 200 and SSE events (partial, then done)."""
        client, headers = make_client_with_auth(monkeypatch)
        mock_job = type("Job", (), {"id": 1, "league_id": 1, "session_id": "s1"})()

        async def fake_get_photo_match_job(session, job_id):
            return mock_job

        async def fake_stream_events(job_id, league_id, session_id, **kwargs):
            yield ("partial", {"partial_matches": [{"t1": [], "t2": [], "s": "21-19"}]})
            yield ("done", {"status": "COMPLETED", "result": {"matches": []}})

        async def fake_has_league_role(session, user_id, league_id, role):
            return True

        monkeypatch.setattr(photo_match_service, "get_photo_match_job", fake_get_photo_match_job, raising=True)
        monkeypatch.setattr(photo_match_service, "stream_photo_job_events", fake_stream_events, raising=True)
        monkeypatch.setattr(auth_dependencies, "_has_league_role", fake_has_league_role, raising=True)

        response = client.get("/api/leagues/1/matches/photo-jobs/1/stream", headers=headers)
        assert response.status_code == 200
        assert response.headers.get("content-type", "").startswith("text/event-stream")
        body = response.text
        assert "event: partial" in body
        assert "event: done" in body
        assert "partial_matches" in body


# ============================================================================
# Health Endpoint Tests
# ============================================================================

class TestHealthEndpoint:
    """Tests for health check endpoint."""
    
    def test_health_check(self):
        """Test health check endpoint."""
        client = TestClient(app)
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
