"""
Tests for user service - user management and authentication.
"""
import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, timedelta
from backend.utils.datetime_utils import utcnow
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.services import user_service
from backend.database import models
from backend.database.models import VerificationCode

# db_session fixture is provided by conftest.py - using test_session as alias for compatibility
@pytest_asyncio.fixture
async def test_session(db_session):
    """Alias for db_session for backward compatibility with existing tests."""
    return db_session


@pytest.mark.asyncio
async def test_create_user(test_session):
    """Test creating a new user."""
    user_id = await user_service.create_user(
        session=test_session,
        phone_number="+15551234567",
        password_hash="hashed_password",
        email="test@example.com"
    )
    
    assert user_id > 0
    
    # Verify user was created
    user = await user_service.get_user_by_id(test_session, user_id)
    assert user is not None
    assert user["phone_number"] == "+15551234567"
    assert user["email"] == "test@example.com"
    assert user["is_verified"] is True


@pytest.mark.asyncio
async def test_create_user_duplicate_phone(test_session):
    """Test that creating a user with duplicate phone number fails."""
    # Create first user
    await user_service.create_user(
        session=test_session,
        phone_number="+15551234567",
        password_hash="hash1"
    )
    
    # Try to create duplicate
    with pytest.raises(ValueError, match="already registered"):
        await user_service.create_user(
            session=test_session,
            phone_number="+15551234567",
            password_hash="hash2"
        )


@pytest.mark.asyncio
async def test_get_user_by_phone(test_session):
    """Test getting user by phone number."""
    # Create user
    user_id = await user_service.create_user(
        session=test_session,
        phone_number="+15551234567",
        password_hash="hash"
    )
    
    # Get user
    user = await user_service.get_user_by_phone(test_session, "+15551234567")
    assert user is not None
    assert user["id"] == user_id
    
    # Non-existent user
    user = await user_service.get_user_by_phone(test_session, "+15559999999")
    assert user is None


@pytest.mark.asyncio
async def test_check_phone_exists(test_session):
    """Test checking if phone number exists."""
    # Create user
    await user_service.create_user(
        session=test_session,
        phone_number="+15551234567",
        password_hash="hash"
    )
    
    # Check exists
    assert await user_service.check_phone_exists(test_session, "+15551234567") is True
    assert await user_service.check_phone_exists(test_session, "+15559999999") is False


@pytest.mark.asyncio
async def test_create_verification_code(test_session):
    """Test creating a verification code."""
    success = await user_service.create_verification_code(
        session=test_session,
        phone_number="+15551234567",
        code="123456",
        password_hash="hashed_pass",
        name="Test User",
        email="test@example.com"
    )
    
    assert success is True
    
    # Verify code was created
    result = await test_session.execute(
        select(VerificationCode).where(VerificationCode.phone_number == "+15551234567")
    )
    vc = result.scalar_one_or_none()
    assert vc is not None
    assert vc.code == "123456"
    assert vc.password_hash == "hashed_pass"
    assert vc.name == "Test User"
    assert vc.used is False


@pytest.mark.asyncio
async def test_verify_and_mark_code_used(test_session):
    """Test verifying and marking a code as used."""
    # Create verification code
    await user_service.create_verification_code(
        session=test_session,
        phone_number="+15551234567",
        code="123456",
        password_hash="hashed_pass"
    )
    
    # Verify code
    signup_data = await user_service.verify_and_mark_code_used(
        session=test_session,
        phone_number="+15551234567",
        code="123456"
    )
    
    assert signup_data is not None
    assert signup_data["password_hash"] == "hashed_pass"
    
    # Code should now be marked as used
    result = await test_session.execute(
        select(VerificationCode).where(VerificationCode.phone_number == "+15551234567")
    )
    vc = result.scalar_one_or_none()
    assert vc is not None
    assert vc.used is True
    
    # Trying to verify again should return None
    signup_data2 = await user_service.verify_and_mark_code_used(
        session=test_session,
        phone_number="+15551234567",
        code="123456"
    )
    assert signup_data2 is None


@pytest.mark.asyncio
async def test_verify_code_wrong_code(test_session):
    """Test verifying with wrong code."""
    await user_service.create_verification_code(
        session=test_session,
        phone_number="+15551234567",
        code="123456"
    )
    
    # Wrong code
    signup_data = await user_service.verify_and_mark_code_used(
        session=test_session,
        phone_number="+15551234567",
        code="999999"
    )
    assert signup_data is None


@pytest.mark.asyncio
async def test_update_user_password(test_session):
    """Test updating user password."""
    # Create user
    user_id = await user_service.create_user(
        session=test_session,
        phone_number="+15551234567",
        password_hash="old_hash"
    )
    
    # Update password
    success = await user_service.update_user_password(
        session=test_session,
        user_id=user_id,
        password_hash="new_hash"
    )
    
    assert success is True
    
    # Verify password was updated
    user = await user_service.get_user_by_id(test_session, user_id)
    assert user["password_hash"] == "new_hash"


@pytest.mark.asyncio
async def test_create_refresh_token(test_session):
    """Test creating a refresh token."""
    # Create user first
    user_id = await user_service.create_user(
        session=test_session,
        phone_number="+15551234567",
        password_hash="hash"
    )
    
    expires_at = utcnow() + timedelta(days=7)
    
    success = await user_service.create_refresh_token(
        session=test_session,
        user_id=user_id,
        token="refresh_token_123",
        expires_at=expires_at
    )
    
    assert success is True
    
    # Verify token was created
    token = await user_service.get_refresh_token(test_session, "refresh_token_123")
    assert token is not None
    assert token["user_id"] == user_id


@pytest.mark.asyncio
async def test_delete_refresh_token(test_session):
    """Test deleting a refresh token."""
    # Create user and token
    user_id = await user_service.create_user(
        session=test_session,
        phone_number="+15551234567",
        password_hash="hash"
    )
    
    await user_service.create_refresh_token(
        session=test_session,
        user_id=user_id,
        token="refresh_token_123",
        expires_at=utcnow() + timedelta(days=7)
    )
    
    # Delete token
    success = await user_service.delete_refresh_token(test_session, "refresh_token_123")
    assert success is True
    
    # Verify token is gone
    token = await user_service.get_refresh_token(test_session, "refresh_token_123")
    assert token is None

