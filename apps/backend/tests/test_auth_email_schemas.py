"""Pydantic schema tests for email-variant authentication requests.

Covers:
- SignupRequest accepts email-only (phone_number optional)
- SignupRequest accepts phone-only (legacy behaviour preserved)
- SignupRequest rejects payloads missing both phone and email
- EmailVerifyRequest: email + code required
- ResetPasswordEmailRequest: email required
- ResetPasswordEmailVerifyRequest: email + code required
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.models.schemas import (
    SignupRequest,
    EmailVerifyRequest,
    ResetPasswordEmailRequest,
    ResetPasswordEmailVerifyRequest,
)


class TestSignupRequestEmailOrPhone:
    """Signup accepts either phone or email (at least one required)."""

    def test_email_only_is_valid(self) -> None:
        req = SignupRequest(
            email="alice@example.com",
            password="Password123",
            first_name="Alice",
            last_name="Example",
        )
        assert req.email == "alice@example.com"
        assert req.phone_number is None
        assert req.full_name == "Alice Example"

    def test_phone_only_is_valid(self) -> None:
        req = SignupRequest(
            phone_number="+15551234567",
            password="Password123",
            first_name="Bob",
            last_name="Builder",
        )
        assert req.phone_number == "+15551234567"
        assert req.email is None

    def test_phone_and_email_both_allowed(self) -> None:
        req = SignupRequest(
            phone_number="+15551234567",
            email="bob@example.com",
            password="Password123",
            first_name="Bob",
            last_name="Builder",
        )
        assert req.phone_number == "+15551234567"
        assert req.email == "bob@example.com"

    def test_both_missing_rejected(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            SignupRequest(
                password="Password123",
                first_name="Alice",
                last_name="Example",
            )
        assert "phone_number" in str(exc_info.value) or "email" in str(exc_info.value)

    def test_name_still_required(self) -> None:
        with pytest.raises(ValidationError):
            SignupRequest(email="alice@example.com", password="Password123")


class TestEmailVerifyRequest:
    def test_valid(self) -> None:
        req = EmailVerifyRequest(email="alice@example.com", code="123456")
        assert req.email == "alice@example.com"
        assert req.code == "123456"

    def test_missing_email_rejected(self) -> None:
        with pytest.raises(ValidationError):
            EmailVerifyRequest(code="123456")

    def test_missing_code_rejected(self) -> None:
        with pytest.raises(ValidationError):
            EmailVerifyRequest(email="alice@example.com")


class TestResetPasswordEmailRequest:
    def test_valid(self) -> None:
        req = ResetPasswordEmailRequest(email="alice@example.com")
        assert req.email == "alice@example.com"

    def test_missing_email_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ResetPasswordEmailRequest()


class TestResetPasswordEmailVerifyRequest:
    def test_valid(self) -> None:
        req = ResetPasswordEmailVerifyRequest(email="alice@example.com", code="654321")
        assert req.email == "alice@example.com"
        assert req.code == "654321"

    def test_missing_code_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ResetPasswordEmailVerifyRequest(email="alice@example.com")
