"""Readiness checks for production-facing provider configuration."""

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services.platform import email_service
from backend.services.social import message_write_policy


@pytest.fixture(autouse=True)
def enabled_message_controls(monkeypatch):
    async def enabled(_session):
        return {"direct_messages": "enabled", "league_chat": "enabled"}

    monkeypatch.setattr(message_write_policy, "readiness_statuses", enabled)


def test_readiness_allows_intentionally_disabled_email(monkeypatch):
    async def disabled(_session):
        return False

    monkeypatch.setattr(email_service, "is_enabled", disabled)

    response = TestClient(app).get("/api/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "checks": {
            "database": "ready",
            "email": "disabled",
            "direct_messages": "enabled",
            "league_chat": "enabled",
        },
    }


def test_readiness_rejects_enabled_email_without_provider_config(monkeypatch):
    async def enabled(_session):
        return True

    monkeypatch.setattr(email_service, "is_enabled", enabled)
    monkeypatch.setattr(email_service, "RESEND_API_KEY", None)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    response = TestClient(app).get("/api/ready")

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "status": "not_ready",
        "checks": {
            "database": "ready",
            "email": "misconfigured",
            "direct_messages": "enabled",
            "league_chat": "enabled",
        },
        "missing": ["RESEND_API_KEY"],
    }


def test_readiness_accepts_enabled_email_with_provider_config(monkeypatch):
    async def enabled(_session):
        return True

    monkeypatch.setattr(email_service, "is_enabled", enabled)
    monkeypatch.setenv("RESEND_API_KEY", "configured-for-test")

    response = TestClient(app).get("/api/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "checks": {
            "database": "ready",
            "email": "ready",
            "direct_messages": "enabled",
            "league_chat": "enabled",
        },
    }


def test_readiness_rejects_unverifiable_message_control(monkeypatch):
    async def disabled_email(_session):
        return False

    async def statuses(_session):
        return {"direct_messages": "misconfigured", "league_chat": "disabled"}

    monkeypatch.setattr(email_service, "is_enabled", disabled_email)
    monkeypatch.setattr(message_write_policy, "readiness_statuses", statuses)

    response = TestClient(app).get("/api/ready")

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "status": "not_ready",
        "checks": {
            "database": "ready",
            "email": "disabled",
            "direct_messages": "misconfigured",
            "league_chat": "disabled",
        },
        "missing": [
            "direct_message_writes_enabled or DIRECT_MESSAGE_WRITES_ENABLED"
        ],
    }


def test_readiness_accepts_intentionally_disabled_message_surfaces(monkeypatch):
    async def disabled_email(_session):
        return False

    async def statuses(_session):
        return {"direct_messages": "disabled", "league_chat": "disabled"}

    monkeypatch.setattr(email_service, "is_enabled", disabled_email)
    monkeypatch.setattr(message_write_policy, "readiness_statuses", statuses)

    response = TestClient(app).get("/api/ready")

    assert response.status_code == 200
    assert response.json()["checks"] == {
        "database": "ready",
        "email": "disabled",
        "direct_messages": "disabled",
        "league_chat": "disabled",
    }
