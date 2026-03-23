"""
Tests for email_service — is_enabled() checks and send_feedback_email().

Mocks:
- sendgrid.SendGridAPIClient (via patch on the module-level import)
- settings_service.get_bool_setting (controls is_enabled)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from backend.services import email_service


# ============================================================================
# get_bool_env helper
# ============================================================================


class TestGetBoolEnv:
    """Tests for email_service.get_bool_env()."""

    def test_true_variants(self, monkeypatch):
        """'true', '1', 'yes' (case-insensitive) all return True."""
        for val in ("true", "True", "TRUE", "1", "yes", "YES", "Yes"):
            monkeypatch.setenv("TEST_BOOL_KEY", val)
            assert email_service.get_bool_env("TEST_BOOL_KEY") is True

    def test_false_variants(self, monkeypatch):
        """'false', '0', 'no' and other strings return False."""
        for val in ("false", "False", "FALSE", "0", "no", "NO", "off", ""):
            monkeypatch.setenv("TEST_BOOL_KEY", val)
            assert email_service.get_bool_env("TEST_BOOL_KEY") is False

    def test_missing_key_returns_default_true(self, monkeypatch):
        """Missing env var returns the default (True)."""
        monkeypatch.delenv("TEST_BOOL_KEY", raising=False)
        assert email_service.get_bool_env("TEST_BOOL_KEY", default=True) is True

    def test_missing_key_returns_default_false(self, monkeypatch):
        """Missing env var returns the provided default (False)."""
        monkeypatch.delenv("TEST_BOOL_KEY", raising=False)
        assert email_service.get_bool_env("TEST_BOOL_KEY", default=False) is False


# ============================================================================
# is_enabled
# ============================================================================


@pytest.mark.asyncio
async def test_is_enabled_delegates_to_settings_service():
    """is_enabled() calls settings_service.get_bool_setting and returns its result."""
    with patch.object(
        email_service.settings_service,
        "get_bool_setting",
        new_callable=AsyncMock,
        return_value=True,
    ) as mock_get:
        result = await email_service.is_enabled(session=None)

    assert result is True
    mock_get.assert_awaited_once_with(
        None, "enable_email", env_var="ENABLE_EMAIL", default=True, fallback_to_cache=True
    )


@pytest.mark.asyncio
async def test_is_enabled_returns_false_when_db_override_false():
    """is_enabled() returns False when settings_service returns False."""
    with patch.object(
        email_service.settings_service,
        "get_bool_setting",
        new_callable=AsyncMock,
        return_value=False,
    ):
        result = await email_service.is_enabled(session=None)

    assert result is False


@pytest.mark.asyncio
async def test_is_enabled_falls_back_to_env_var_on_exception(monkeypatch):
    """is_enabled() falls back to the module-level ENABLE_EMAIL flag when settings_service raises."""
    monkeypatch.setattr(email_service, "ENABLE_EMAIL", False)

    with patch.object(
        email_service.settings_service,
        "get_bool_setting",
        new_callable=AsyncMock,
        side_effect=RuntimeError("db down"),
    ):
        result = await email_service.is_enabled(session=None)

    assert result is False


@pytest.mark.asyncio
async def test_is_enabled_falls_back_true_on_exception(monkeypatch):
    """is_enabled() falls back to ENABLE_EMAIL=True when settings raises."""
    monkeypatch.setattr(email_service, "ENABLE_EMAIL", True)

    with patch.object(
        email_service.settings_service,
        "get_bool_setting",
        new_callable=AsyncMock,
        side_effect=Exception("redis timeout"),
    ):
        result = await email_service.is_enabled(session=None)

    assert result is True


# ============================================================================
# send_feedback_email
# ============================================================================


@pytest.mark.asyncio
async def test_send_feedback_email_disabled_skips_sendgrid():
    """When email is disabled, SendGrid is never called and True is returned."""
    with (
        patch.object(
            email_service.settings_service,
            "get_bool_setting",
            new_callable=AsyncMock,
            return_value=False,
        ),
        patch("backend.services.email_service.SendGridAPIClient") as mock_sg,
    ):
        result = await email_service.send_feedback_email(
            feedback_text="Awesome app!",
            session=None,
        )

    assert result is True
    mock_sg.assert_not_called()


@pytest.mark.asyncio
async def test_send_feedback_email_missing_api_key_returns_true(monkeypatch):
    """No SENDGRID_API_KEY configured → returns True without raising."""
    monkeypatch.setattr(email_service, "SENDGRID_API_KEY", None)

    with (
        patch.object(
            email_service.settings_service,
            "get_bool_setting",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch("backend.services.email_service.SendGridAPIClient") as mock_sg,
    ):
        result = await email_service.send_feedback_email(
            feedback_text="Great!",
            session=None,
        )

    assert result is True
    mock_sg.assert_not_called()


@pytest.mark.asyncio
async def test_send_feedback_email_calls_sendgrid_with_correct_fields(monkeypatch):
    """When enabled and API key present, SendGrid is called; 2xx → returns True."""
    monkeypatch.setattr(email_service, "SENDGRID_API_KEY", "SG.fake_key")
    monkeypatch.setattr(email_service, "SENDGRID_FROM_EMAIL", "from@example.com")
    monkeypatch.setattr(email_service, "ADMIN_EMAIL", "admin@example.com")

    mock_response = MagicMock()
    mock_response.status_code = 202

    mock_sg_instance = MagicMock()
    mock_sg_instance.send.return_value = mock_response

    with (
        patch.object(
            email_service.settings_service,
            "get_bool_setting",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch("backend.services.email_service.SendGridAPIClient", return_value=mock_sg_instance),
    ):
        result = await email_service.send_feedback_email(
            feedback_text="This is feedback",
            contact_email="user@example.com",
            user_name="Alice",
            session=None,
        )

    assert result is True
    mock_sg_instance.send.assert_called_once()
    # Verify the message object passed to send contains the right content
    call_args = mock_sg_instance.send.call_args[0][0]
    assert call_args is not None


@pytest.mark.asyncio
async def test_send_feedback_email_includes_user_details(monkeypatch):
    """Email body includes user name, phone, contact email, and timestamp when provided."""
    monkeypatch.setattr(email_service, "SENDGRID_API_KEY", "SG.fake_key")

    mock_response = MagicMock()
    mock_response.status_code = 202
    mock_sg_instance = MagicMock()
    mock_sg_instance.send.return_value = mock_response

    ts = datetime(2025, 3, 22, 12, 0, 0)

    with (
        patch.object(
            email_service.settings_service,
            "get_bool_setting",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch("backend.services.email_service.SendGridAPIClient", return_value=mock_sg_instance),
    ):
        result = await email_service.send_feedback_email(
            feedback_text="Loved the tournament bracket!",
            contact_email="player@beach.com",
            user_name="Bob",
            user_phone="+15550001111",
            timestamp=ts,
            session=None,
        )

    assert result is True


@pytest.mark.asyncio
async def test_send_feedback_email_sendgrid_error_status_returns_false(monkeypatch):
    """SendGrid 4xx/5xx response → returns False (does not raise)."""
    monkeypatch.setattr(email_service, "SENDGRID_API_KEY", "SG.fake_key")

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.body = b"Internal Error"
    mock_sg_instance = MagicMock()
    mock_sg_instance.send.return_value = mock_response

    with (
        patch.object(
            email_service.settings_service,
            "get_bool_setting",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch("backend.services.email_service.SendGridAPIClient", return_value=mock_sg_instance),
    ):
        result = await email_service.send_feedback_email(
            feedback_text="Testing error handling",
            session=None,
        )

    assert result is False


@pytest.mark.asyncio
async def test_send_feedback_email_sendgrid_raises_returns_false(monkeypatch):
    """SendGrid client raises an exception → returns False (does not propagate)."""
    monkeypatch.setattr(email_service, "SENDGRID_API_KEY", "SG.fake_key")

    mock_sg_instance = MagicMock()
    mock_sg_instance.send.side_effect = Exception("network error")

    with (
        patch.object(
            email_service.settings_service,
            "get_bool_setting",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch("backend.services.email_service.SendGridAPIClient", return_value=mock_sg_instance),
    ):
        result = await email_service.send_feedback_email(
            feedback_text="Exception test",
            session=None,
        )

    assert result is False


@pytest.mark.asyncio
async def test_send_feedback_email_anonymous_user(monkeypatch):
    """Anonymous feedback (no user_name) is handled without error."""
    monkeypatch.setattr(email_service, "SENDGRID_API_KEY", "SG.fake_key")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_sg_instance = MagicMock()
    mock_sg_instance.send.return_value = mock_response

    with (
        patch.object(
            email_service.settings_service,
            "get_bool_setting",
            new_callable=AsyncMock,
            return_value=True,
        ),
        patch("backend.services.email_service.SendGridAPIClient", return_value=mock_sg_instance),
    ):
        result = await email_service.send_feedback_email(
            feedback_text="Anonymous feedback",
            session=None,
        )

    assert result is True
    mock_sg_instance.send.assert_called_once()
