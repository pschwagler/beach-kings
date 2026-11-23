"""JWT operations backed by PyJWT, including Apple's access-token binding."""

import base64
import hashlib
import hmac

import jwt as _jwt
from jwt import ExpiredSignatureError as ExpiredSignatureError
from jwt import PyJWTError as JWTError

get_unverified_header = _jwt.get_unverified_header


def get_unverified_claims(token: str) -> dict:
    """Read claims only to select an allowlisted audience before verification."""
    return _jwt.decode(token, options={"verify_signature": False})


def _access_token_hash(access_token: str) -> str:
    try:
        digest = hashlib.sha256(access_token.encode("ascii")).digest()
    except UnicodeEncodeError as exc:
        raise JWTError("Invalid access token") from exc
    return base64.urlsafe_b64encode(digest[:16]).rstrip(b"=").decode("ascii")


def encode(payload: dict, key, algorithm: str, *, headers=None, access_token=None) -> str:
    claims = dict(payload)
    if access_token is not None:
        if algorithm != "RS256":
            raise JWTError("Access-token binding requires RS256")
        claims["at_hash"] = _access_token_hash(access_token)
    return _jwt.encode(claims, key, algorithm=algorithm, headers=headers)


def decode(token: str, key, *, algorithms: list[str], access_token=None, **kwargs) -> dict:
    if isinstance(key, dict):
        if algorithms != ["RS256"] or key.get("kty") != "RSA":
            raise JWTError("Unexpected signing key type")
        key = _jwt.PyJWK.from_dict(key, algorithm="RS256").key
    claims = _jwt.decode(token, key, algorithms=algorithms, **kwargs)
    if "at_hash" in claims:
        if algorithms != ["RS256"] or not isinstance(access_token, str):
            raise JWTError("Missing access-token binding")
        expected = _access_token_hash(access_token)
        if not isinstance(claims["at_hash"], str) or not hmac.compare_digest(
            claims["at_hash"], expected
        ):
            raise JWTError("Invalid access-token binding")
    return claims
