"""Readiness checks for production-facing provider configuration."""

import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.api.main import app, lifespan
from backend.api.routes.calc import readiness_check
from backend.services import auth_delivery_service, auth_service, moderation_worker
from backend.services.platform import email_service
from backend.services.social import message_write_policy


@pytest.fixture(autouse=True)
def enabled_message_controls(monkeypatch):
    async def enabled(_session):
        return {"direct_messages": "enabled", "league_chat": "enabled"}

    monkeypatch.setattr(message_write_policy, "readiness_statuses", enabled)


def readiness_failure_detail():
    with pytest.raises(HTTPException) as captured:
        asyncio.run(readiness_check(session=None))
    assert captured.value.status_code == 503
    return captured.value.detail


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

    assert readiness_failure_detail() == {
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

    assert readiness_failure_detail() == {
        "status": "not_ready",
        "checks": {
            "database": "ready",
            "email": "disabled",
            "direct_messages": "misconfigured",
            "league_chat": "disabled",
        },
        "missing": ["direct_message_writes_enabled or DIRECT_MESSAGE_WRITES_ENABLED"],
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


def test_production_readiness_requires_auth_delivery_heartbeat(monkeypatch):
    async def disabled_email(_session):
        return False

    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(email_service, "is_enabled", disabled_email)
    monkeypatch.setattr(auth_service, "is_sms_enabled", disabled_email)
    monkeypatch.setattr(auth_delivery_service, "delivery_enabled", lambda: True)
    monkeypatch.setattr(
        auth_delivery_service,
        "heartbeat_is_fresh",
        AsyncMock(return_value=False),
    )

    detail = readiness_failure_detail()

    assert detail["checks"]["auth_delivery"] == "unavailable"


def configure_other_production_checks(monkeypatch):
    async def disabled(_session):
        return False

    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "secure-test-secret-at-least-32-bytes")
    monkeypatch.setattr(email_service, "is_enabled", disabled)
    monkeypatch.setattr(auth_service, "is_sms_enabled", disabled)
    monkeypatch.setattr(auth_delivery_service, "delivery_enabled", lambda: True)
    auth_heartbeat = AsyncMock(return_value=True)
    monkeypatch.setattr(
        auth_delivery_service,
        "heartbeat_is_fresh",
        auth_heartbeat,
    )
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "configured-for-test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "configured-for-test")
    monkeypatch.setenv("AWS_S3_BUCKET", "configured-for-test")
    monkeypatch.setenv("AWS_MODERATION_EVIDENCE_BUCKET", "configured-for-test")
    monkeypatch.setenv("RELEASE_READINESS_GENERATION", "release-test-generation")
    return auth_heartbeat


def test_production_readiness_rejects_invalid_moderation_config(monkeypatch):
    configure_other_production_checks(monkeypatch)
    monkeypatch.setattr(
        moderation_worker,
        "worker_configuration_issues",
        lambda: ["moderation worker configuration"],
    )

    detail = readiness_failure_detail()
    assert detail["checks"]["moderation_worker"] == "misconfigured"
    assert detail["missing"] == ["moderation worker configuration"]
    assert "configured-for-test" not in str(detail)


def test_production_readiness_requires_moderation_evidence_bucket(monkeypatch):
    configure_other_production_checks(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "provider-test-value")
    monkeypatch.setenv("MODERATION_ALERTS_ENABLED", "true")
    monkeypatch.setenv("RESEND_API_KEY", "mail-test-value")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "alerts@example.test")
    monkeypatch.setenv("MODERATION_ALERT_EMAIL", "reviewer@example.test")
    monkeypatch.delenv("AWS_MODERATION_EVIDENCE_BUCKET")

    detail = readiness_failure_detail()

    assert detail["checks"]["moderation_worker"] == "misconfigured"
    assert detail["missing"] == ["moderation worker configuration"]


def test_deployed_readiness_rejects_placeholder_jwt_secret(monkeypatch):
    configure_other_production_checks(monkeypatch)
    monkeypatch.setenv("JWT_SECRET_KEY", "change-me-in-production")
    monkeypatch.setattr(moderation_worker, "worker_configuration_issues", lambda: [])
    monkeypatch.setattr(
        moderation_worker,
        "heartbeat_is_fresh",
        AsyncMock(return_value=True),
    )

    detail = readiness_failure_detail()

    assert detail["checks"]["auth_security"] == "misconfigured"
    assert "JWT_SECRET_KEY" in detail["missing"]
    assert "change-me-in-production" not in str(detail)


def test_deployed_readiness_rejects_short_jwt_secret(monkeypatch):
    configure_other_production_checks(monkeypatch)
    monkeypatch.setenv("JWT_SECRET_KEY", "short-secret")
    monkeypatch.setattr(moderation_worker, "worker_configuration_issues", lambda: [])
    monkeypatch.setattr(
        moderation_worker,
        "heartbeat_is_fresh",
        AsyncMock(return_value=True),
    )

    detail = readiness_failure_detail()

    assert detail["checks"]["auth_security"] == "misconfigured"
    assert detail["missing"] == ["JWT_SECRET_KEY"]


@pytest.mark.asyncio
async def test_deployed_startup_rejects_placeholder_jwt_secret(monkeypatch):
    monkeypatch.setenv("ENV", "staging")
    monkeypatch.setenv("JWT_SECRET_KEY", "change-me-in-production")

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        async with lifespan(app):
            pytest.fail("unsafe startup unexpectedly succeeded")


@pytest.mark.asyncio
async def test_deployed_startup_rejects_short_jwt_secret(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "short-secret")

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        async with lifespan(app):
            pytest.fail("weak startup unexpectedly succeeded")


def test_production_readiness_rejects_stale_moderation_heartbeat(monkeypatch):
    configure_other_production_checks(monkeypatch)
    monkeypatch.setattr(moderation_worker, "worker_configuration_issues", lambda: [])
    monkeypatch.setattr(
        moderation_worker,
        "heartbeat_is_fresh",
        AsyncMock(return_value=False),
    )

    detail = readiness_failure_detail()
    assert detail["checks"]["moderation_worker"] == "unavailable"
    assert detail["missing"] == ["moderation worker heartbeat"]


def test_production_readiness_rejects_missing_media_configuration(monkeypatch):
    configure_other_production_checks(monkeypatch)
    monkeypatch.delenv("AWS_ACCESS_KEY_ID")
    monkeypatch.delenv("AWS_SECRET_ACCESS_KEY")
    monkeypatch.delenv("AWS_S3_BUCKET")
    monkeypatch.setattr(moderation_worker, "worker_configuration_issues", lambda: [])
    monkeypatch.setattr(
        moderation_worker,
        "heartbeat_is_fresh",
        AsyncMock(return_value=True),
    )

    detail = readiness_failure_detail()
    assert detail["checks"]["media_storage"] == "misconfigured"
    assert detail["missing"] == [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_S3_BUCKET",
    ]


@pytest.mark.parametrize("environment", sorted(moderation_worker.FAIL_CLOSED_ENVS))
def test_deployed_readiness_accepts_healthy_moderation_and_media(monkeypatch, environment):
    auth_heartbeat = configure_other_production_checks(monkeypatch)
    monkeypatch.setenv("ENV", environment)
    monkeypatch.setattr(moderation_worker, "worker_configuration_issues", lambda: [])
    heartbeat = AsyncMock(return_value=True)
    monkeypatch.setattr(
        moderation_worker,
        "heartbeat_is_fresh",
        heartbeat,
    )

    response = TestClient(app).get("/api/ready")

    assert response.status_code == 200
    auth_heartbeat.assert_awaited_once_with("release-test-generation")
    heartbeat.assert_awaited_once_with("release-test-generation")
    assert response.json()["checks"] == {
        "database": "ready",
        "email": "disabled",
        "auth_security": "ready",
        "auth_delivery": "ready",
        "sms": "disabled",
        "media_storage": "ready",
        "moderation_worker": "ready",
        "direct_messages": "enabled",
        "league_chat": "enabled",
    }
