"""Deliberate, non-secret public Apple authentication error contract."""

from fastapi import HTTPException


APPLE_AUTH_ERRORS = {
    "APPLE_AUTH_CONFIG": (
        503,
        "Apple sign-in is temporarily unavailable. Please use another sign-in method or try again later.",
    ),
    "APPLE_AUTH_PROVIDER": (
        503,
        "Apple could not complete sign-in. Please try again in a moment.",
    ),
    "APPLE_AUTH_RETRY": (
        401,
        "Apple authorization expired or could not be verified. Please start Apple sign-in again.",
    ),
    "APPLE_AUTH_CONFLICT": (
        409,
        "An account with this email already exists. Sign in with your original method, then connect Apple in Settings.",
    ),
    "APPLE_AUTH_ELIGIBILITY": (
        403,
        "Please start from Sign Up and complete the age check before creating your account.",
    ),
}


class SafeAppleAuthError(HTTPException):
    """Only registered messages may pass through the generic 5xx sanitizer."""

    def __init__(self, code: str):
        status, message = APPLE_AUTH_ERRORS[code]
        super().__init__(status_code=status, detail={"code": code, "message": message})
