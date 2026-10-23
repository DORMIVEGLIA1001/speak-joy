from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets

import jwt
from jwt import InvalidTokenError

from be.app.core.config import settings

OTP_EXPIRES_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
RESET_GRANT_EXPIRES_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_RESENDS_PER_REQUEST = 3
OTP_MAX_SENDS_PER_HOUR = 5


def generate_numeric_otp(length: int = 6) -> str:
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def _otp_secret() -> bytes:
    base_secret = settings.master_secret or settings.jwt_secret
    return base_secret.encode("utf-8")


def hash_otp(email: str, otp: str) -> str:
    normalized_email = email.strip().lower()
    payload = f"{normalized_email}:{otp}".encode("utf-8")
    return hmac.new(_otp_secret(), payload, hashlib.sha256).hexdigest()


def create_password_reset_grant(*, user_id: str, email: str, reset_request_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email.strip().lower(),
        "purpose": "password-reset",
        "reset_request_id": reset_request_id,
        "iat": now,
        "exp": now + timedelta(minutes=RESET_GRANT_EXPIRES_MINUTES),
        "jti": secrets.token_urlsafe(12),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_password_reset_grant(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except InvalidTokenError as error:
        raise ValueError("Reset session is invalid or expired") from error

    if payload.get("purpose") != "password-reset":
        raise ValueError("Reset session is invalid or expired")

    if not isinstance(payload.get("sub"), str) or not isinstance(payload.get("email"), str) or not isinstance(payload.get("reset_request_id"), str):
        raise ValueError("Reset session is invalid or expired")

    return payload
