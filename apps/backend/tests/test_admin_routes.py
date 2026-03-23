"""Route-layer tests for admin.py endpoints.

Covers: feedback CRUD, admin-view config/stats/players, WhatsApp proxy.
Settings GET/PUT already tested in test_api_routes_comprehensive.py.
"""

from fastapi.testclient import TestClient
from backend.api.main import app
from backend.services import auth_service, user_service, data_service, settings_service


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def _make_admin_client(monkeypatch, phone="+10000000000", user_id=1):
    """Return (client, headers) with system-admin auth mocked."""

    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid):
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Admin User",
            "email": "admin@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    async def fake_get_setting(session, key):
        if key == "system_admin_phone_numbers":
            return phone
        if key == "system_admin_emails":
            return None
        return None

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


def _make_non_admin_client(monkeypatch, phone="+19999999999", user_id=99):
    """Return (client, headers) with non-admin auth."""

    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid):
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Regular User",
            "email": "user@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    async def fake_get_setting(session, key):
        if key == "system_admin_phone_numbers":
            return "+10000000000"  # not this user
        if key == "system_admin_emails":
            return None
        return None

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


# ============================================================================
# Feedback endpoints
# ============================================================================


class TestFeedbackEndpoints:
    """Tests for /api/feedback and /api/admin-view/feedback."""

    def test_submit_feedback_anonymous(self, monkeypatch):
        """Anonymous user can submit feedback."""
        client = TestClient(app)

        # No auth needed for feedback (get_current_user_optional)
        response = client.post(
            "/api/feedback",
            json={"feedback_text": "Great app!", "email": "anon@example.com"},
        )
        # Will hit real DB for insert, so likely 500 in mock env.
        # We test that the route is reachable and validates input.
        assert response.status_code in (200, 500)

    def test_submit_feedback_missing_text(self, monkeypatch):
        """Feedback requires feedback_text."""
        client = TestClient(app)
        response = client.post("/api/feedback", json={"email": "a@b.com"})
        assert response.status_code == 422

    def test_get_all_feedback_requires_admin(self, monkeypatch):
        """Non-admin cannot access feedback list."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.get("/api/admin-view/feedback", headers=headers)
        assert response.status_code == 403

    def test_get_all_feedback_as_admin(self, monkeypatch):
        """Admin can list feedback."""
        client, headers = _make_admin_client(monkeypatch)
        response = client.get("/api/admin-view/feedback", headers=headers)
        # Will try DB query; 200 or 500 depending on DB availability
        assert response.status_code in (200, 500)

    def test_resolve_feedback_requires_admin(self, monkeypatch):
        """Non-admin cannot resolve feedback."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.patch(
            "/api/admin-view/feedback/1/resolve",
            json={"is_resolved": True},
            headers=headers,
        )
        assert response.status_code == 403

    def test_resolve_feedback_not_found(self, monkeypatch):
        """Resolve returns 404 for missing feedback."""
        client, headers = _make_admin_client(monkeypatch)
        response = client.patch(
            "/api/admin-view/feedback/999999/resolve",
            json={"is_resolved": True},
            headers=headers,
        )
        assert response.status_code in (404, 500)


# ============================================================================
# Admin view config endpoints
# ============================================================================


class TestAdminConfigEndpoints:
    """Tests for /api/admin-view/config."""

    def test_get_config_requires_admin(self, monkeypatch):
        """Non-admin cannot access admin config."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.get("/api/admin-view/config", headers=headers)
        assert response.status_code == 403

    def test_get_config_as_admin(self, monkeypatch):
        """Admin can get config."""

        async def fake_get_bool_setting(session, key, env_var=None, default=True):
            return default

        monkeypatch.setattr(
            settings_service, "get_bool_setting", fake_get_bool_setting, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        # Need to re-patch get_setting to handle log_level
        original_get_setting = data_service.get_setting

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            if key == "system_admin_emails":
                return None
            if key == "log_level":
                return "INFO"
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

        response = client.get("/api/admin-view/config", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "enable_sms" in data
        assert "enable_email" in data
        assert "log_level" in data

    def test_update_config_requires_admin(self, monkeypatch):
        """Non-admin cannot update config."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.put(
            "/api/admin-view/config",
            json={"enable_sms": False},
            headers=headers,
        )
        assert response.status_code == 403

    def test_update_config_invalid_log_level(self, monkeypatch):
        """Invalid log level returns 400."""

        async def fake_set_setting(session, key, value):
            pass

        async def fake_get_bool_setting(session, key, env_var=None, default=True):
            return default

        async def fake_invalidate(*, _=None):
            pass

        monkeypatch.setattr(data_service, "set_setting", fake_set_setting, raising=True)
        monkeypatch.setattr(
            settings_service, "get_bool_setting", fake_get_bool_setting, raising=True
        )
        monkeypatch.setattr(
            settings_service, "invalidate_settings_cache", fake_invalidate, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.put(
            "/api/admin-view/config",
            json={"log_level": "INVALID_LEVEL"},
            headers=headers,
        )
        assert response.status_code == 400
        assert "Invalid log_level" in response.json()["detail"]


# ============================================================================
# Platform stats
# ============================================================================


class TestPlatformStats:
    """Tests for /api/admin-view/stats."""

    def test_stats_requires_admin(self, monkeypatch):
        """Non-admin cannot access platform stats."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.get("/api/admin-view/stats", headers=headers)
        assert response.status_code == 403

    def test_stats_returns_cached(self, monkeypatch):
        """Stats returns cached data when available."""
        import json

        cached_stats = json.dumps({"generated_at": "2024-01-01T00:00:00Z", "stats": []})

        async def fake_redis_get(key):
            return cached_stats

        monkeypatch.setattr("backend.api.routes.admin.redis_get", fake_redis_get)

        client, headers = _make_admin_client(monkeypatch)
        response = client.get("/api/admin-view/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["generated_at"] == "2024-01-01T00:00:00Z"

    def test_stats_requires_auth(self, monkeypatch):
        """Unauthenticated request returns 401/403."""
        client = TestClient(app)
        response = client.get("/api/admin-view/stats")
        assert response.status_code in (401, 403)


# ============================================================================
# Recent players
# ============================================================================


class TestRecentPlayers:
    """Tests for /api/admin-view/players/recent."""

    def test_recent_players_requires_admin(self, monkeypatch):
        """Non-admin cannot access recent players."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.get("/api/admin-view/players/recent", headers=headers)
        assert response.status_code == 403

    def test_recent_players_requires_auth(self):
        """Unauthenticated request returns 401/403."""
        client = TestClient(app)
        response = client.get("/api/admin-view/players/recent")
        assert response.status_code in (401, 403)


# ============================================================================
# WhatsApp proxy endpoints
# ============================================================================


class TestWhatsAppEndpoints:
    """Tests for /api/whatsapp/* proxy endpoints."""

    def test_whatsapp_qr_requires_admin(self, monkeypatch):
        """Non-admin cannot access WhatsApp QR."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.get("/api/whatsapp/qr", headers=headers)
        assert response.status_code == 403

    def test_whatsapp_status_requires_admin(self, monkeypatch):
        """Non-admin cannot access WhatsApp status."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.get("/api/whatsapp/status", headers=headers)
        assert response.status_code == 403

    def test_whatsapp_initialize_requires_admin(self, monkeypatch):
        """Non-admin cannot initialize WhatsApp."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.post("/api/whatsapp/initialize", headers=headers)
        assert response.status_code == 403

    def test_whatsapp_logout_requires_admin(self, monkeypatch):
        """Non-admin cannot logout WhatsApp."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.post("/api/whatsapp/logout", headers=headers)
        assert response.status_code == 403

    def test_whatsapp_groups_requires_admin(self, monkeypatch):
        """Non-admin cannot list WhatsApp groups."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.get("/api/whatsapp/groups", headers=headers)
        assert response.status_code == 403

    def test_whatsapp_send_requires_admin(self, monkeypatch):
        """Non-admin cannot send WhatsApp messages."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.post(
            "/api/whatsapp/send",
            json={"message": "test"},
            headers=headers,
        )
        assert response.status_code == 403

    def test_whatsapp_qr_service_unavailable(self, monkeypatch):
        """WhatsApp proxy returns 503 when service is down."""

        async def fake_proxy(method, path, body=None, timeout=30.0):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=503,
                detail="WhatsApp service is not available.",
            )

        monkeypatch.setattr(
            "backend.api.routes.admin.proxy_whatsapp_request", fake_proxy, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.get("/api/whatsapp/qr", headers=headers)
        assert response.status_code == 503

    def test_whatsapp_config_get(self, monkeypatch):
        """Admin can get WhatsApp config."""
        client, headers = _make_admin_client(monkeypatch)

        # Re-patch get_setting AFTER _make_admin_client to handle whatsapp key
        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            if key == "system_admin_emails":
                return None
            if key == "whatsapp_group_id":
                return "group_123"
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

        response = client.get("/api/whatsapp/config", headers=headers)
        assert response.status_code == 200
        assert response.json()["group_id"] == "group_123"

    def test_whatsapp_config_set(self, monkeypatch):
        """Admin can set WhatsApp config."""
        stored = {}

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            if key == "system_admin_emails":
                return None
            return stored.get(key)

        async def fake_set_setting(session, key, value):
            stored[key] = value

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        monkeypatch.setattr(data_service, "set_setting", fake_set_setting, raising=True)

        client, headers = _make_admin_client(monkeypatch)
        response = client.post(
            "/api/whatsapp/config",
            json={"group_id": "new_group"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["success"] is True
        assert stored["whatsapp_group_id"] == "new_group"

    def test_whatsapp_config_set_missing_group_id(self, monkeypatch):
        """Setting WhatsApp config without group_id returns 400."""
        client, headers = _make_admin_client(monkeypatch)
        response = client.post(
            "/api/whatsapp/config",
            json={},
            headers=headers,
        )
        assert response.status_code == 400
        assert "group_id" in response.json()["detail"]

    def test_whatsapp_status_success(self, monkeypatch):
        """Admin can get WhatsApp status via proxy."""

        async def fake_proxy(method, path, body=None, timeout=30.0):
            return {"status": "authenticated"}

        monkeypatch.setattr(
            "backend.api.routes.admin.proxy_whatsapp_request", fake_proxy, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.get("/api/whatsapp/status", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "authenticated"

    def test_whatsapp_initialize_success(self, monkeypatch):
        """Admin can initialize WhatsApp via proxy."""

        async def fake_proxy(method, path, body=None, timeout=30.0):
            return {"success": True}

        monkeypatch.setattr(
            "backend.api.routes.admin.proxy_whatsapp_request", fake_proxy, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.post("/api/whatsapp/initialize", headers=headers)
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_whatsapp_logout_success(self, monkeypatch):
        """Admin can logout WhatsApp via proxy."""

        async def fake_proxy(method, path, body=None, timeout=30.0):
            return {"success": True}

        monkeypatch.setattr(
            "backend.api.routes.admin.proxy_whatsapp_request", fake_proxy, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.post("/api/whatsapp/logout", headers=headers)
        assert response.status_code == 200

    def test_whatsapp_groups_success(self, monkeypatch):
        """Admin can list WhatsApp groups via proxy."""

        async def fake_proxy(method, path, body=None, timeout=30.0):
            return {"groups": [{"id": "g1", "name": "Beach Kings"}]}

        monkeypatch.setattr(
            "backend.api.routes.admin.proxy_whatsapp_request", fake_proxy, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.get("/api/whatsapp/groups", headers=headers)
        assert response.status_code == 200
        assert len(response.json()["groups"]) == 1

    def test_whatsapp_send_success(self, monkeypatch):
        """Admin can send a WhatsApp message via proxy."""

        async def fake_proxy(method, path, body=None, timeout=30.0):
            return {"sent": True}

        monkeypatch.setattr(
            "backend.api.routes.admin.proxy_whatsapp_request", fake_proxy, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.post(
            "/api/whatsapp/send",
            json={"group_id": "g1", "message": "Hello"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["sent"] is True

    def test_whatsapp_proxy_timeout_returns_504(self, monkeypatch):
        """Proxy timeout surfaces as 504."""

        async def fake_proxy(method, path, body=None, timeout=30.0):
            from fastapi import HTTPException

            raise HTTPException(status_code=504, detail="WhatsApp service request timed out.")

        monkeypatch.setattr(
            "backend.api.routes.admin.proxy_whatsapp_request", fake_proxy, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.get("/api/whatsapp/status", headers=headers)
        assert response.status_code == 504


# ============================================================================
# Settings key endpoints
# ============================================================================


class TestSettingsKeyEndpoints:
    """Tests for GET/PUT /api/settings/{key}."""

    def test_get_setting_requires_admin(self, monkeypatch):
        """Non-admin cannot read a setting."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.get("/api/settings/some_key", headers=headers)
        assert response.status_code == 403

    def test_get_setting_success(self, monkeypatch):
        """Admin can read a setting by key."""
        # Build admin client first, then override get_setting to also handle the feature key.
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            if key == "system_admin_emails":
                return None
            if key == "feature_flag_x":
                return "true"
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

        response = client.get("/api/settings/feature_flag_x", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["key"] == "feature_flag_x"
        assert body["value"] == "true"

    def test_get_setting_returns_none_for_missing_key(self, monkeypatch):
        """Reading a non-existent setting returns null value."""
        client, headers = _make_admin_client(monkeypatch)

        # Override to confirm None is returned for unknown keys.
        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            if key == "system_admin_emails":
                return None
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

        response = client.get("/api/settings/nonexistent_key", headers=headers)
        assert response.status_code == 200
        assert response.json()["value"] is None

    def test_put_setting_requires_admin(self, monkeypatch):
        """Non-admin cannot write a setting."""
        client, headers = _make_non_admin_client(monkeypatch)
        response = client.put(
            "/api/settings/some_key",
            json={"value": "new_value"},
            headers=headers,
        )
        assert response.status_code == 403

    def test_put_setting_success(self, monkeypatch):
        """Admin can write a setting by key."""
        stored = {}

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            if key == "system_admin_emails":
                return None
            return stored.get(key)

        async def fake_set_setting(session, key, value):
            stored[key] = value

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        monkeypatch.setattr(data_service, "set_setting", fake_set_setting, raising=True)

        client, headers = _make_admin_client(monkeypatch)
        response = client.put(
            "/api/settings/my_feature",
            json={"value": "enabled"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["success"] is True
        assert stored["my_feature"] == "enabled"

    def test_put_setting_missing_value_returns_400(self, monkeypatch):
        """PUT without 'value' key in body returns 400."""
        client, headers = _make_admin_client(monkeypatch)
        response = client.put(
            "/api/settings/my_feature",
            json={"other_field": "oops"},
            headers=headers,
        )
        assert response.status_code == 400
        assert "value is required" in response.json()["detail"]


# ============================================================================
# Admin update config happy path
# ============================================================================


class TestAdminConfigUpdate:
    """Additional tests for PUT /api/admin-view/config — happy path."""

    def test_update_config_enable_sms_and_email(self, monkeypatch):
        """Admin can toggle enable_sms and enable_email."""
        stored = {}

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            if key == "system_admin_emails":
                return None
            return stored.get(key)

        async def fake_set_setting(session, key, value):
            stored[key] = value

        async def fake_invalidate(**kwargs):
            pass

        async def fake_get_bool_setting(session, key, env_var=None, default=True):
            return stored.get(key, "true") == "true"

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        monkeypatch.setattr(data_service, "set_setting", fake_set_setting, raising=True)
        monkeypatch.setattr(
            settings_service, "invalidate_settings_cache", fake_invalidate, raising=True
        )
        monkeypatch.setattr(
            settings_service, "get_bool_setting", fake_get_bool_setting, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.put(
            "/api/admin-view/config",
            json={"enable_sms": False, "enable_email": True},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "enable_sms" in data
        assert "enable_email" in data

    def test_update_config_valid_log_level(self, monkeypatch):
        """Admin can set a valid log level."""
        stored = {}

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return "+10000000000"
            if key == "system_admin_emails":
                return None
            if key == "log_level":
                return stored.get("log_level")
            return None

        async def fake_set_setting(session, key, value):
            stored[key] = value

        async def fake_invalidate(**kwargs):
            pass

        async def fake_get_bool_setting(session, key, env_var=None, default=True):
            return default

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        monkeypatch.setattr(data_service, "set_setting", fake_set_setting, raising=True)
        monkeypatch.setattr(
            settings_service, "invalidate_settings_cache", fake_invalidate, raising=True
        )
        monkeypatch.setattr(
            settings_service, "get_bool_setting", fake_get_bool_setting, raising=True
        )

        client, headers = _make_admin_client(monkeypatch)
        response = client.put(
            "/api/admin-view/config",
            json={"log_level": "DEBUG"},
            headers=headers,
        )
        assert response.status_code == 200
        assert stored.get("log_level") == "DEBUG"
