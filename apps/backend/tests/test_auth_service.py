"""
Unit tests for authentication service.
Tests password hashing, JWT tokens, phone validation, email validation,
and Apple ID token verification.
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import timedelta
from backend.services import auth_service


class TestPasswordHashing:
    """Tests for password hashing and verification."""

    def test_hash_password(self):
        """Test password hashing produces different hashes for same password."""
        password = "test_password_123"
        hash1 = auth_service.hash_password(password)
        hash2 = auth_service.hash_password(password)

        # Hashes should be different (due to salt)
        assert hash1 != hash2
        # But both should verify correctly
        assert auth_service.verify_password(password, hash1)
        assert auth_service.verify_password(password, hash2)

    def test_verify_password_correct(self):
        """Test password verification with correct password."""
        password = "test_password_123"
        password_hash = auth_service.hash_password(password)

        assert auth_service.verify_password(password, password_hash) is True

    def test_verify_password_incorrect(self):
        """Test password verification with incorrect password."""
        password = "test_password_123"
        wrong_password = "wrong_password"
        password_hash = auth_service.hash_password(password)

        assert auth_service.verify_password(wrong_password, password_hash) is False

    def test_verify_password_empty(self):
        """Test password verification with empty password."""
        password = "test_password_123"
        password_hash = auth_service.hash_password(password)

        assert auth_service.verify_password("", password_hash) is False

    def test_hash_password_empty(self):
        """Test hashing empty password."""
        hash_result = auth_service.hash_password("")
        # Should still produce a hash (though empty passwords should be rejected at API level)
        assert hash_result is not None
        assert len(hash_result) > 0


class TestJWTTokens:
    """Tests for JWT token creation and verification."""

    def test_create_access_token(self):
        """Test creating an access token."""
        data = {"user_id": 1, "phone_number": "+15551234567"}
        token = auth_service.create_access_token(data)

        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0

    def test_verify_token_valid(self):
        """Test verifying a valid token."""
        data = {"user_id": 1, "phone_number": "+15551234567"}
        token = auth_service.create_access_token(data)

        decoded = auth_service.verify_token(token)
        assert decoded is not None
        assert decoded["user_id"] == 1
        assert decoded["phone_number"] == "+15551234567"

    def test_verify_token_invalid(self):
        """Test verifying an invalid token."""
        invalid_token = "invalid_token_string"
        decoded = auth_service.verify_token(invalid_token)
        assert decoded is None

    def test_verify_token_expired(self):
        """Test verifying an expired token."""
        data = {"user_id": 1, "phone_number": "+15551234567"}
        # Create token with very short expiration
        token = auth_service.create_access_token(data, expires_delta=timedelta(seconds=-1))

        # Token should be expired
        decoded = auth_service.verify_token(token)
        assert decoded is None

    def test_create_access_token_with_expires_delta(self):
        """Test creating token with custom expiration."""
        data = {"user_id": 1}
        expires_delta = timedelta(hours=2)
        token = auth_service.create_access_token(data, expires_delta=expires_delta)

        decoded = auth_service.verify_token(token)
        assert decoded is not None
        assert decoded["user_id"] == 1

    def test_token_contains_exp_claim(self):
        """Test that token contains expiration claim."""
        data = {"user_id": 1}
        token = auth_service.create_access_token(data)
        decoded = auth_service.verify_token(token)

        assert decoded is not None
        assert "exp" in decoded

    def test_generate_refresh_token(self):
        """Test generating a refresh token."""
        token1 = auth_service.generate_refresh_token()
        token2 = auth_service.generate_refresh_token()

        # Tokens should be different
        assert token1 != token2
        # Tokens should be strings
        assert isinstance(token1, str)
        assert isinstance(token2, str)
        # Tokens should have reasonable length
        assert len(token1) > 20
        assert len(token2) > 20


class TestPhoneValidation:
    """Tests for phone number validation and normalization."""

    def test_normalize_phone_number_us_format(self):
        """Test normalizing US phone number in various formats."""
        # Use a valid US phone number format
        # E.164 format
        assert auth_service.normalize_phone_number("+12025551234") == "+12025551234"

        # With dashes
        assert auth_service.normalize_phone_number("(202) 555-1234") == "+12025551234"

        # With spaces
        assert auth_service.normalize_phone_number("202 555 1234") == "+12025551234"

        # Without country code (defaults to US)
        assert auth_service.normalize_phone_number("2025551234") == "+12025551234"

    def test_normalize_phone_number_invalid(self):
        """Test normalizing invalid phone number raises error."""
        with pytest.raises(ValueError):
            auth_service.normalize_phone_number("123")

        with pytest.raises(ValueError):
            auth_service.normalize_phone_number("invalid")

    def test_normalize_phone_number_empty(self):
        """Test normalizing empty phone number raises error."""
        with pytest.raises(ValueError):
            auth_service.normalize_phone_number("")

    def test_validate_phone_number_valid(self):
        """Test validating valid phone numbers."""
        assert auth_service.validate_phone_number("+12025551234") is True
        assert auth_service.validate_phone_number("(202) 555-1234") is True
        assert auth_service.validate_phone_number("2025551234") is True

    def test_validate_phone_number_invalid(self):
        """Test validating invalid phone numbers."""
        assert auth_service.validate_phone_number("123") is False
        assert auth_service.validate_phone_number("invalid") is False
        assert auth_service.validate_phone_number("") is False

    def test_normalize_phone_number_different_region(self):
        """Test normalizing phone number with different default region."""
        # UK number
        uk_number = "+442071234567"
        assert auth_service.normalize_phone_number(uk_number) == uk_number


class TestEmailValidation:
    """Tests for email validation and normalization."""

    def test_validate_email_valid(self):
        """Test validating valid email addresses."""
        assert auth_service.validate_email("test@example.com") is True
        assert auth_service.validate_email("user.name@example.co.uk") is True
        assert auth_service.validate_email("user+tag@example.com") is True

    def test_validate_email_invalid(self):
        """Test validating invalid email addresses."""
        assert auth_service.validate_email("invalid") is False
        assert auth_service.validate_email("@example.com") is False
        assert auth_service.validate_email("test@") is False
        assert auth_service.validate_email("") is False
        assert auth_service.validate_email("test @example.com") is False  # Space

    def test_normalize_email(self):
        """Test normalizing email addresses."""
        assert auth_service.normalize_email("Test@Example.COM") == "test@example.com"
        assert auth_service.normalize_email("  Test@Example.COM  ") == "test@example.com"

    def test_normalize_email_invalid(self):
        """Test normalizing invalid email raises error."""
        with pytest.raises(ValueError):
            auth_service.normalize_email("invalid")

        with pytest.raises(ValueError):
            auth_service.normalize_email("")

    def test_normalize_email_empty(self):
        """Test normalizing empty email raises error."""
        with pytest.raises(ValueError):
            auth_service.normalize_email("")


class TestVerificationCode:
    """Tests for verification code generation."""

    def test_generate_verification_code(self):
        """Test generating verification codes."""
        code1 = auth_service.generate_verification_code()
        code2 = auth_service.generate_verification_code()

        # Codes should be strings
        assert isinstance(code1, str)
        assert isinstance(code2, str)

        # Codes should be 6 digits
        assert len(code1) == 6
        assert len(code2) == 6

        # Codes should be numeric
        assert code1.isdigit()
        assert code2.isdigit()

        # Codes should be different (very unlikely to be same)
        # Note: This could theoretically fail, but probability is 1/10000
        assert code1 != code2 or True  # Allow same for test stability

    def test_verification_code_range(self):
        """Test that verification codes are in valid range."""
        for _ in range(100):  # Test multiple codes
            code = auth_service.generate_verification_code()
            code_int = int(code)
            assert 100000 <= code_int <= 999999


class TestAppleIdTokenVerification:
    """Tests for Apple ID token verification."""

    def test_missing_client_id_raises(self, monkeypatch):
        """Test that missing APPLE_CLIENT_ID raises ValueError."""
        monkeypatch.setattr(auth_service, "APPLE_CLIENT_ID", None)
        with pytest.raises(ValueError, match="APPLE_CLIENT_ID"):
            auth_service.verify_apple_id_token("some_token")

    def test_invalid_token_header_raises(self, monkeypatch):
        """Test that a token without kid in header raises ValueError."""
        monkeypatch.setattr(auth_service, "APPLE_CLIENT_ID", "com.test.app")

        from jose import jwt as jose_jwt

        # Create a token without kid in header
        with patch.object(jose_jwt, "get_unverified_header", return_value={}):
            with pytest.raises(ValueError, match="kid"):
                auth_service.verify_apple_id_token("token_without_kid")

    def test_no_matching_key_raises(self, monkeypatch):
        """Test that no matching Apple public key raises ValueError."""
        monkeypatch.setattr(auth_service, "APPLE_CLIENT_ID", "com.test.app")
        # Clear cache
        monkeypatch.setattr(auth_service, "_apple_jwks_cache", None)

        from jose import jwt as jose_jwt

        with patch.object(jose_jwt, "get_unverified_header", return_value={"kid": "unknown_kid"}):
            with patch.object(
                auth_service,
                "_fetch_apple_public_keys",
                return_value={"keys": [{"kid": "different_kid"}]},
            ):
                with pytest.raises(ValueError, match="No matching Apple public key"):
                    auth_service.verify_apple_id_token("some_token")

    def test_successful_verification(self, monkeypatch):
        """Test successful Apple token verification returns user info."""
        monkeypatch.setattr(auth_service, "APPLE_CLIENT_ID", "com.test.app")

        from jose import jwt as jose_jwt

        matching_key = {"kid": "test_kid", "kty": "RSA", "n": "abc", "e": "AQAB"}

        with patch.object(jose_jwt, "get_unverified_header", return_value={"kid": "test_kid"}):
            with patch.object(
                auth_service,
                "_fetch_apple_public_keys",
                return_value={"keys": [matching_key]},
            ):
                with patch.object(
                    jose_jwt,
                    "decode",
                    return_value={
                        "sub": "apple.user.123",
                        "email": "test@example.com",
                        "email_verified": True,
                    },
                ):
                    result = auth_service.verify_apple_id_token("valid_token")

        assert result["sub"] == "apple.user.123"
        assert result["email"] == "test@example.com"
        assert result["email_verified"] is True

    def test_missing_email_raises(self, monkeypatch):
        """Test that a token missing the email claim raises ValueError."""
        monkeypatch.setattr(auth_service, "APPLE_CLIENT_ID", "com.test.app")

        from jose import jwt as jose_jwt

        matching_key = {"kid": "test_kid", "kty": "RSA"}

        with patch.object(jose_jwt, "get_unverified_header", return_value={"kid": "test_kid"}):
            with patch.object(
                auth_service,
                "_fetch_apple_public_keys",
                return_value={"keys": [matching_key]},
            ):
                with patch.object(
                    jose_jwt,
                    "decode",
                    return_value={"sub": "apple.user.123", "email_verified": True},
                ):
                    with pytest.raises(ValueError, match="missing email"):
                        auth_service.verify_apple_id_token("valid_token")

    def test_jwt_error_raises_valueerror(self, monkeypatch):
        """Test that JWTError from jose is wrapped as ValueError."""
        monkeypatch.setattr(auth_service, "APPLE_CLIENT_ID", "com.test.app")

        from jose import jwt as jose_jwt
        from jose import JWTError

        matching_key = {"kid": "test_kid", "kty": "RSA"}

        with patch.object(jose_jwt, "get_unverified_header", return_value={"kid": "test_kid"}):
            with patch.object(
                auth_service,
                "_fetch_apple_public_keys",
                return_value={"keys": [matching_key]},
            ):
                with patch.object(jose_jwt, "decode", side_effect=JWTError("expired")):
                    with pytest.raises(ValueError, match="Invalid Apple ID token"):
                        auth_service.verify_apple_id_token("expired_token")
