"""Auth models."""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, model_validator


class LoginRequest(BaseModel):
    """Request to login with password. Accepts either phone_number or email."""

    phone_number: Optional[str] = None
    email: Optional[str] = None
    password: str

    @model_validator(mode="after")
    def validate_phone_or_email(self):
        """Ensure either phone_number or email is provided."""
        if not self.phone_number and not self.email:
            raise ValueError("Either phone_number or email must be provided")
        if self.phone_number and self.email:
            raise ValueError("Provide either phone_number or email, not both")
        return self


class SMSLoginRequest(BaseModel):
    """Request to login with SMS verification code."""

    phone_number: str
    code: str


class VerifyPhoneRequest(BaseModel):
    """Request to verify phone number with code."""

    phone_number: str
    code: str


class EmailVerifyRequest(BaseModel):
    """Request to verify email address with code (signup flow)."""

    email: str
    code: str


class CheckPhoneRequest(BaseModel):
    """Request to check if phone number exists."""

    phone_number: str


class PhoneAddRequest(BaseModel):
    """Request to start the one-time add-phone OTP flow for an authenticated user."""

    phone_number: str


class PhoneAddVerify(BaseModel):
    """Verify the add-phone OTP and attach the number to the current user."""

    phone_number: str
    code: str


class GoogleAuthRequest(BaseModel):
    """Request to authenticate with Google ID token."""

    id_token: str


class AppleAuthRequest(BaseModel):
    """Request to authenticate with Apple ID token."""

    id_token: str
    authorization_code: Optional[str] = None


class LinkProviderRequest(BaseModel):
    """Request body for linking an OAuth provider to an authenticated account."""

    id_token: str
    authorization_code: Optional[str] = None


class AuthResponse(BaseModel):
    """Authentication response with JWT token."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    phone_number: Optional[str] = None
    is_verified: bool
    auth_provider: str = "phone"
    profile_complete: Optional[bool] = None
    is_new_user: bool = False


class RefreshTokenRequest(BaseModel):
    """Request to refresh access token."""

    refresh_token: str


class RefreshTokenResponse(BaseModel):
    """Response with new access and rotated refresh token."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class CheckPhoneResponse(BaseModel):
    """Response for phone number check."""

    exists: bool
    is_verified: bool


class ResetPasswordRequest(BaseModel):
    """Request to initiate password reset."""

    phone_number: str


class ResetPasswordVerifyRequest(BaseModel):
    """Request to verify code and get reset token."""

    phone_number: str
    code: str


class ResetPasswordEmailRequest(BaseModel):
    """Request to initiate password reset via email."""

    email: str


class ResetPasswordEmailVerifyRequest(BaseModel):
    """Request to verify email reset code and get reset token."""

    email: str
    code: str


class ResetPasswordConfirmRequest(BaseModel):
    """Request to confirm password reset with token and new password."""

    reset_token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    """Request to change the authenticated user's password."""

    current_password: str
    new_password: str


class ChangePasswordResponse(BaseModel):
    """Response after a successful password change."""

    status: str
    password_changed_at: str


class UserResponse(BaseModel):
    """User information response."""

    id: int
    phone_number: Optional[str] = None
    email: Optional[str] = None
    is_verified: bool
    auth_provider: str = "phone"
    has_password: bool = True
    deletion_scheduled_at: Optional[str] = None
    created_at: str
    profile_is_private: bool = False
    show_game_history: bool = False
    google_connected: bool = False
    apple_connected: bool = False
    moderation_status: Literal["active", "suspended", "banned"] = "active"
    moderation_expires_at: Optional[datetime] = None
    moderation_case_id: Optional[int] = None
    interaction_restricted_until: Optional[datetime] = None
    interaction_restriction_case_id: Optional[int] = None


class UserUpdate(BaseModel):
    """Request to update user profile."""

    email: Optional[str] = None
    profile_is_private: Optional[bool] = None
    show_game_history: Optional[bool] = None
