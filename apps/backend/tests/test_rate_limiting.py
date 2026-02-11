"""
Tests for per-phone-number rate limiting on password reset endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from backend.api.main import app
from backend.services import auth_service, user_service, rate_limiting_service


@pytest.fixture(autouse=True)
def clear_rate_limit_storage():
    """Clear rate limit storage before each test to ensure clean state."""
    rate_limiting_service.reset_phone_rate_limit_storage()
    yield
    rate_limiting_service.reset_phone_rate_limit_storage()


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_user_service(monkeypatch):
    """Mock user service functions for password reset tests."""

    # Mock normalize_phone_number - just pass through, or normalize to E.164 format
    def fake_normalize_phone_number(phone, default_region="US"):
        # Simple normalization - add + if missing and ensure it starts with country code
        phone_clean = (
            phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        )
        if phone_clean.startswith("+"):
            return phone_clean
        elif phone_clean.startswith("1") and len(phone_clean) == 11:
            return "+" + phone_clean
        elif len(phone_clean) == 10:
            return "+1" + phone_clean
        return phone_clean  # Return as-is if we can't normalize

    # Mock get_user_by_phone - return a user for testing
    async def fake_get_user_by_phone(session, phone_number):
        normalized = fake_normalize_phone_number(phone_number)
        return {
            "id": 1,
            "phone_number": normalized,
            "email": None,
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
            "failed_attempts": 0,
            "locked_until": None,
        }

    # Mock create_verification_code - always succeeds
    async def fake_create_verification_code(session, phone_number, code):
        return True

    # Mock send_sms_verification - always succeeds (disable actual SMS)
    async def fake_send_sms_verification(session, phone_number, code):
        return True

    # Mock is_account_locked - never locked
    def fake_is_account_locked(user):
        return False

    # Mock generate_verification_code - return a dummy code
    def fake_generate_verification_code():
        return "123456"

    # Mock increment_failed_attempts - always succeeds
    async def fake_increment_failed_attempts(session, phone_number):
        return False  # Return False (not locked)

    # Mock reset_failed_attempts - always succeeds
    async def fake_reset_failed_attempts(session, user_id):
        pass

    monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize_phone_number)
    monkeypatch.setattr(user_service, "get_user_by_phone", fake_get_user_by_phone)
    monkeypatch.setattr(user_service, "create_verification_code", fake_create_verification_code)
    monkeypatch.setattr(auth_service, "send_sms_verification", fake_send_sms_verification)
    monkeypatch.setattr(user_service, "is_account_locked", fake_is_account_locked)
    monkeypatch.setattr(
        auth_service, "generate_verification_code", fake_generate_verification_code
    )
    monkeypatch.setattr(user_service, "increment_failed_attempts", fake_increment_failed_attempts)
    monkeypatch.setattr(user_service, "reset_failed_attempts", fake_reset_failed_attempts)

    return {
        "get_user_by_phone": fake_get_user_by_phone,
        "create_verification_code": fake_create_verification_code,
        "send_sms_verification": fake_send_sms_verification,
        "is_account_locked": fake_is_account_locked,
    }


def test_reset_password_different_phone_numbers_separate_limits(client, mock_user_service):
    """
    Test that different phone numbers have separate rate limit buckets.
    Phone number 1 should be able to make requests even if phone number 2 hits the limit.
    """
    phone1 = "+15551111111"
    phone2 = "+15552222222"

    # Make 10 requests with phone1 (should all succeed)
    for i in range(10):
        response = client.post("/api/auth/reset-password", json={"phone_number": phone1})
        assert response.status_code == 200, f"Request {i + 1} with phone1 failed: {response.text}"

    # Make 10 requests with phone2 (should all succeed - separate bucket)
    for i in range(10):
        response = client.post("/api/auth/reset-password", json={"phone_number": phone2})
        assert response.status_code == 200, f"Request {i + 1} with phone2 failed: {response.text}"

    # Phone1 should still be able to make one more request (limit is 10/minute)
    # Actually, phone1 already made 10, so the 11th should be rate limited
    response = client.post("/api/auth/reset-password", json={"phone_number": phone1})
    assert response.status_code == 429, "Phone1 should be rate limited after 10 requests"

    # But phone2 should still be able to make one more (separate bucket)
    response = client.post("/api/auth/reset-password", json={"phone_number": phone2})
    assert response.status_code == 429, "Phone2 should also be rate limited after 10 requests"


def test_reset_password_same_phone_number_rate_limited(client, mock_user_service):
    """
    Test that the same phone number hits rate limit after 10 requests per minute.
    """
    phone = "+15551111111"

    # Make 10 requests (should all succeed)
    for i in range(10):
        response = client.post("/api/auth/reset-password", json={"phone_number": phone})
        assert response.status_code == 200, f"Request {i + 1} failed: {response.text}"

    # 11th request should be rate limited
    response = client.post("/api/auth/reset-password", json={"phone_number": phone})
    assert response.status_code == 429, "Should be rate limited after 10 requests"
    assert "rate limit" in response.json()["detail"].lower()


def test_reset_password_verify_different_phone_numbers_separate_limits(client, mock_user_service):
    """
    Test that reset-password-verify endpoint also has per-phone-number rate limiting.
    """
    phone1 = "+15551111111"
    phone2 = "+15552222222"

    # Mock verify_and_mark_code_used to always fail (so we can test rate limiting without code verification)
    async def fake_verify_and_mark_code_used(session, phone_number, code):
        return None  # Always fail verification

    with patch.object(user_service, "verify_and_mark_code_used", fake_verify_and_mark_code_used):
        # Make 10 requests with phone1 (should all fail with 401, not 429)
        for i in range(10):
            response = client.post(
                "/api/auth/reset-password-verify", json={"phone_number": phone1, "code": "0000"}
            )
            # Should fail with invalid code, not rate limit
            assert response.status_code == 401, f"Request {i + 1} should fail with invalid code"

        # Make 10 requests with phone2 (should also fail with 401, not 429)
        for i in range(10):
            response = client.post(
                "/api/auth/reset-password-verify", json={"phone_number": phone2, "code": "0000"}
            )
            assert response.status_code == 401, f"Request {i + 1} should fail with invalid code"

        # Now make 11th request with phone1 - should still fail with 401 (rate limit allows it, code is wrong)
        response = client.post(
            "/api/auth/reset-password-verify", json={"phone_number": phone1, "code": "0000"}
        )
        # This should be rate limited now (11th request)
        assert response.status_code == 429, "Should be rate limited after 10 requests"


def test_reset_password_verify_rate_limited(client, mock_user_service):
    """
    Test that reset-password-verify endpoint rate limits after 10 requests per minute.
    """
    phone = "+15551111111"

    # Mock verify_and_mark_code_used to always return None (invalid code)
    async def fake_verify_and_mark_code_used(session, phone_number, code):
        return None

    with patch.object(user_service, "verify_and_mark_code_used", fake_verify_and_mark_code_used):
        # Make 10 requests (should all fail with 401 - invalid code)
        for i in range(10):
            response = client.post(
                "/api/auth/reset-password-verify", json={"phone_number": phone, "code": "0000"}
            )
            assert response.status_code == 401, f"Request {i + 1} should fail with invalid code"

        # 11th request should be rate limited
        response = client.post(
            "/api/auth/reset-password-verify", json={"phone_number": phone, "code": "0000"}
        )
        assert response.status_code == 429, "Should be rate limited after 10 requests"


def test_reset_password_normalized_phone_numbers(client, mock_user_service):
    """
    Test that phone numbers are normalized consistently for rate limiting.
    Different formats of the same phone number should share the same rate limit bucket.
    """
    # Different formats of the same phone number
    phone_formats = ["+15551111111", "15551111111", "(555) 111-1111", "5551111111"]

    # All formats should normalize to the same phone number and share rate limit
    # Make requests with different formats until we hit the limit
    request_count = 0
    for format_variant in phone_formats * 3:  # Try each format 3 times = 12 requests
        response = client.post("/api/auth/reset-password", json={"phone_number": format_variant})
        request_count += 1
        if request_count <= 10:
            assert response.status_code == 200, (
                f"Request {request_count} with format {format_variant} should succeed"
            )
        else:
            # After 10 requests, should be rate limited regardless of format
            assert response.status_code == 429, (
                f"Request {request_count} should be rate limited (same phone number)"
            )
            break


def test_reset_password_rate_limit_error_message(client, mock_user_service):
    """
    Test that rate limit error message is clear and informative.
    """
    phone = "+15551111111"

    # Make 10 requests to hit the limit
    for i in range(10):
        client.post("/api/auth/reset-password", json={"phone_number": phone})

    # 11th request should return 429 with clear error message
    response = client.post("/api/auth/reset-password", json={"phone_number": phone})

    assert response.status_code == 429
    error_detail = response.json()["detail"]
    assert "rate limit" in error_detail.lower()
    assert "10/minute" in error_detail or "per phone number" in error_detail.lower()
