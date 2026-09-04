"""Auth models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    CheckConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class VerificationCode(Base):
    """SMS or email verification codes with signup data.

    Exactly one of ``phone_number`` or ``email`` must be set on a given row:
    SMS-based flows key on phone_number; email-based flows key on email.
    """

    __tablename__ = "verification_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phone_number = Column(String, nullable=True)
    code = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)  # ISO timestamp
    used = Column(Boolean, default=False, nullable=False)
    password_hash = Column(String, nullable=True)
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    age_group = Column(String(20), nullable=True)
    eligibility_country = Column(String(2), nullable=True)
    eligibility_region = Column(String(2), nullable=True)
    age_assurance_source = Column(String(40), nullable=True)
    age_declaration_source = Column(String(40), nullable=True)
    guardian_consent = Column(Boolean, nullable=True)
    age_assured_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_verification_codes_phone", "phone_number"),
        Index("idx_verification_codes_email", "email"),
        Index("idx_verification_codes_expires", "expires_at"),
    )


class RefreshToken(Base):
    """Keyed refresh-token digests for token rotation."""

    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, nullable=False, unique=True)
    session_version = Column(Integer, nullable=False, server_default="0")
    expires_at = Column(String, nullable=False)  # ISO timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="refresh_tokens")

    __table_args__ = (
        Index("idx_refresh_tokens_user", "user_id"),
        Index("idx_refresh_tokens_token", "token"),
        Index("idx_refresh_tokens_expires", "expires_at"),
    )


class PasswordResetToken(Base):
    """Keyed password-reset-token digests after verification."""

    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, nullable=False, unique=True)
    expires_at = Column(String, nullable=False)  # ISO timestamp
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="password_reset_tokens")

    __table_args__ = (
        Index("idx_password_reset_tokens_user", "user_id"),
        Index("idx_password_reset_tokens_token", "token"),
        Index("idx_password_reset_tokens_expires", "expires_at"),
    )


class AuthDeliveryJob(Base):
    """Durable email/SMS verification-code delivery without duplicated PII."""

    __tablename__ = "auth_delivery_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    verification_code_id = Column(
        Integer,
        ForeignKey("verification_codes.id", ondelete="CASCADE"),
        nullable=True,
    )
    channel = Column(String(10), nullable=False)
    purpose = Column(String(30), nullable=False)
    idempotency_key = Column(String(255), nullable=False, unique=True)
    status = Column(String(20), nullable=False, server_default="pending")
    attempts = Column(Integer, nullable=False, server_default="0")
    available_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    last_error_code = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint("channel IN ('sms', 'email')", name="ck_auth_delivery_channel"),
        CheckConstraint(
            "purpose IN ('signup', 'login', 'password_reset', 'phone_add')",
            name="ck_auth_delivery_purpose",
        ),
        CheckConstraint(
            "status IN ('pending', 'processing', 'delivered', 'failed', 'canceled')",
            name="ck_auth_delivery_status",
        ),
        Index("idx_auth_delivery_claim", "status", "available_at"),
        Index("idx_auth_delivery_terminal", "status", "updated_at"),
    )


class AppleCredential(Base):
    """Encrypted Apple refresh token retained only until account deletion."""

    __tablename__ = "apple_credentials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    refresh_token_ciphertext = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AppleRevocationJob(Base):
    """Durable Apple credential revocation requested by permanent deletion."""

    __tablename__ = "apple_revocation_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    refresh_token_ciphertext = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, server_default="pending")
    attempts = Column(Integer, nullable=False, server_default="0")
    available_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed')",
            name="ck_apple_revocation_jobs_status",
        ),
        Index("idx_apple_revocation_jobs_claim", "status", "available_at"),
    )
