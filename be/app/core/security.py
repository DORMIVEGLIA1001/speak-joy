from datetime import datetime, timedelta, timezone
import hashlib

import bcrypt
import jwt

from be.app.core.config import settings

ACCESS_TOKEN_EXPIRES_DAYS = 7


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def password_session_version(password_hash: str | None, user_id: str | None = None) -> str:
    # Local accounts derive their session_version from the password hash, so changing
    # the password bumps the version and invalidates old tokens. Social accounts have no
    # password_hash; falling back to a shared literal ("social-account") gave EVERY social
    # user the same version — a single leaked token couldn't be distinguished per user and
    # the version could never differ between accounts. Seed the fallback with the user id
    # so each social account gets a distinct (still deterministic) version. See notes 3.B.16.
    seed = password_hash or (f"social-account:{user_id}" if user_id else "social-account")
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:20]


def create_access_token(*, subject: str, email: str, role: str, password_hash: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "email": email,
        "role": role,
        "session_version": password_session_version(password_hash, subject),
        "iat": now,
        "exp": now + timedelta(days=ACCESS_TOKEN_EXPIRES_DAYS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_child_mode_token(*, parent_id: str, child_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": child_id,
        "parent_sub": parent_id,
        "actor": "child",
        "iat": now,
        "exp": now + timedelta(hours=12),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
