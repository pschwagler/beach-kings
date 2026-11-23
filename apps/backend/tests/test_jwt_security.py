"""Signature, algorithm-confusion, and expiry regressions for JWT migration."""

from datetime import timedelta

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from backend.services.auth import jwt_service as jwt
from backend.services.auth.jwt_service import JWTError
from backend.utils.datetime_utils import utcnow

SECRET = "test-only-secret-at-least-thirty-two-bytes"


def test_existing_hmac_tokens_round_trip():
    claims = {"sub": "42", "exp": utcnow() + timedelta(minutes=5)}
    token = jwt.encode(claims, SECRET, algorithm="HS256")
    assert jwt.decode(token, SECRET, algorithms=["HS256"])["sub"] == "42"
    with pytest.raises(JWTError):
        jwt.decode(token, SECRET + "wrong", algorithms=["HS256"])


def test_expired_tokens_are_rejected():
    token = jwt.encode({"sub": "42", "exp": utcnow() - timedelta(seconds=10)}, SECRET, "HS256")
    with pytest.raises(jwt.ExpiredSignatureError):
        jwt.decode(token, SECRET, algorithms=["HS256"])


def test_asymmetric_public_key_cannot_be_used_as_hmac_secret():
    public = rsa.generate_private_key(public_exponent=65537, key_size=2048).public_key()
    der = public.public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    # An attacker can create this HMAC using a publicly available DER key.
    import base64
    import hashlib
    import hmac

    header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b"=")
    payload = base64.urlsafe_b64encode(b'{"sub":"42"}').rstrip(b"=")
    message = header + b"." + payload
    signature = base64.urlsafe_b64encode(hmac.new(der, message, hashlib.sha256).digest()).rstrip(
        b"="
    )
    token = (message + b"." + signature).decode()
    with pytest.raises(JWTError):
        jwt.decode(token, der, algorithms=["RS256"])
