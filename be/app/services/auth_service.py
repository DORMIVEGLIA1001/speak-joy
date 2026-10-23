from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets
from jwt import InvalidTokenError

from be.app.core.security import create_access_token, decode_access_token, hash_password, password_session_version, verify_password
from be.app.core.config import settings
from be.app.core.otp import (
    OTP_EXPIRES_MINUTES,
    OTP_MAX_ATTEMPTS,
    OTP_MAX_RESENDS_PER_REQUEST,
    OTP_MAX_SENDS_PER_HOUR,
    OTP_RESEND_COOLDOWN_SECONDS,
    RESET_GRANT_EXPIRES_MINUTES,
    create_password_reset_grant,
    decode_password_reset_grant,
    generate_numeric_otp,
    hash_otp,
)
from be.app.repositories.auth_repository import (
    UserEntity,
    create_user,
    find_user_by_email,
    find_user_by_id,
    find_user_by_username,
    update_local_user_account,
    upsert_demo_user,
    update_last_login_at,
)
from be.app.schemas.auth import AuthResult, LoginRequest, PublicUser, RegisterRequest, UserRole
from be.app.repositories.password_reset_repository import create_reset_token, consume_reset_token, replace_user_password
from be.app.repositories.password_reset_otp_repository import (
    count_recent_password_reset_otp_requests,
    create_password_reset_otp,
    consume_password_reset_grant,
    find_latest_active_password_reset_otp,
    increment_password_reset_otp_attempt,
    invalidate_all_password_reset_otps_for_user,
    mark_password_reset_otp_verified,
)
from be.app.services.email_service import send_password_reset_email, send_password_reset_otp_email


class AuthError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _normalize_optional_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _is_email_identifier(value: str) -> bool:
    return "@" in value


def _to_public_user(user: UserEntity) -> PublicUser:
    return PublicUser(
        id=user.id,
        name=user.display_name,
        email=user.email,
        username=user.username,
        fullName=user.display_name,
        displayName=user.display_name,
        role=user.role,
        authProvider=user.auth_provider,
        avatarUrl=user.avatar_url,
        emailVerified=user.email_verified,
    )


def _to_auth_result(user: UserEntity) -> AuthResult:
    return AuthResult(
        user=_to_public_user(user),
        accessToken=create_access_token(subject=user.id, email=user.email, role=user.role, password_hash=user.password_hash),
    )


def _ensure_active_user(user: UserEntity) -> None:
    if not user.is_active:
       raise AuthError(403, "User is inactive")
        
def _find_user_for_login(data: LoginRequest) -> UserEntity | None:
    if data.email:
        return find_user_by_email(_normalize_email(data.email))

    if data.username:
        return find_user_by_username(data.username)

    identifier = _normalize_optional_identifier(data.identifier)
    if not identifier:
        return None

    return find_user_by_email(_normalize_email(identifier)) if _is_email_identifier(identifier) else find_user_by_username(identifier)


def _demo_users_enabled() -> bool:
    """Demo/admin seed accounts are a DEV convenience only.

    They upsert well-known credentials (including a real `admin` role that bypasses
    per-child ownership checks). Seeding them in production would hand anyone who reads
    the source a guaranteed-existing admin login, so we only seed outside production —
    and allow an explicit opt-out via SEED_DEMO_USERS=0 even in dev.
    """
    if (settings.node_env or "").strip().lower() == "production":
        return False
    return (os.getenv("SEED_DEMO_USERS", "1").strip().lower() not in ("0", "false", "no"))


def _ensure_demo_users() -> None:
    if not _demo_users_enabled():
        return
    demo_users = [
        {
            "email": "parent@example.com",
            "password": "Parent123!",
            "display_name": "Demo Parent",
            "role": "parent",
        },
        {
            "email": "admin@example.com",
            "password": "Admin123!",
            "display_name": "Demo Admin",
            "role": "admin",
        },
    ]

    for demo_user in demo_users:
        try:
            upsert_demo_user(
                email=demo_user["email"],
                password_hash=hash_password(demo_user["password"]),
                display_name=demo_user["display_name"],
                role=demo_user["role"],  # type: ignore[arg-type]
            )
        except Exception:
            continue


def register(data: RegisterRequest) -> AuthResult:
    email = _normalize_email(data.email)
    username = _normalize_optional_identifier(data.username)

    if find_user_by_email(email):
        raise AuthError(409, "Email already exists")

    if username and find_user_by_username(username):
        raise AuthError(409, "Username already exists")

    try:
        user = create_user(
            email=email,
            username=username,
            password_hash=hash_password(data.password),
            display_name=data.displayName or "",
            role=data.role,
        )
    except Exception as error:
        message = str(error).lower()
        if "email" in message and "unique" in message:
            raise AuthError(409, "Email already exists") from error
        if "username" in message and "unique" in message:
            raise AuthError(409, "Username already exists") from error
        raise

    return _to_auth_result(user)


def login(data: LoginRequest) -> AuthResult:
    _ensure_demo_users()
    user = _find_user_for_login(data)
    if user is None or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise AuthError(401, "Invalid email or password")

    _ensure_active_user(user)
    update_last_login_at(user.id)
    return _to_auth_result(user)


def me_from_access_token(access_token: str) -> PublicUser:
    try:
        payload = decode_access_token(access_token)
    except InvalidTokenError as error:
        raise AuthError(401, "Invalid or expired access token") from error

    subject = payload.get("sub")
    role = payload.get("role")
    email = payload.get("email")

    if not isinstance(subject, str) or not isinstance(role, str) or not isinstance(email, str):
        raise AuthError(401, "Invalid access token payload")

    if role not in ("parent", "admin"):
        raise AuthError(401, "Invalid access token payload")

    user = find_user_by_id(subject)
    if user is None:
        raise AuthError(401, "User not found")

    if not hmac.compare_digest(
        str(payload.get("session_version") or ""),
        password_session_version(user.password_hash, user.id),
    ):
        raise AuthError(401, "Session expired. Please sign in again")

    _ensure_active_user(user)
    return _to_public_user(user)


def update_local_account(user: PublicUser, *, display_name: str, email: str, current_password: str, new_password: str | None) -> PublicUser:
    entity = find_user_by_id(user.id)
    if entity is None or entity.auth_provider != "local":
        raise AuthError(400, "Only local accounts can be edited here")
    if not entity.password_hash or not verify_password(current_password, entity.password_hash):
        raise AuthError(401, "Current password is incorrect")
    normalized_email = _normalize_email(email)
    if "@" not in normalized_email:
        raise AuthError(400, "Email is invalid")
    existing = find_user_by_email(normalized_email)
    if existing and existing.id != user.id:
        raise AuthError(409, "Email already exists")
    updated = update_local_user_account(user.id, email=normalized_email, display_name=display_name, password_hash=hash_password(new_password) if new_password else None)
    return _to_public_user(updated)


def request_password_reset(email: str) -> None:
    user = find_user_by_email(_normalize_email(email))
    if user is None or user.auth_provider != "local":
        return
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    create_reset_token(user.id, token_hash, datetime.now(timezone.utc) + timedelta(minutes=30))
    reset_url = f"{settings.frontend_base_url.rstrip('/')}?resetToken={raw_token}"
    send_password_reset_email(user.email, reset_url)


def _seconds_until_resend_allowed(active_request) -> int:
    elapsed = (datetime.now(timezone.utc) - active_request.last_sent_at).total_seconds()
    return max(0, OTP_RESEND_COOLDOWN_SECONDS - int(elapsed))


def request_password_reset_otp(email: str) -> dict[str, int]:
    normalized_email = _normalize_email(email)
    user = find_user_by_email(normalized_email)
    if user is None or user.auth_provider != "local":
        return {
            "cooldownSeconds": OTP_RESEND_COOLDOWN_SECONDS,
            "resendRemaining": OTP_MAX_RESENDS_PER_REQUEST,
        }

    active_request = find_latest_active_password_reset_otp(normalized_email)
    if active_request is not None:
        cooldown_remaining = _seconds_until_resend_allowed(active_request)
        if cooldown_remaining > 0:
            raise AuthError(429, f"Please wait {cooldown_remaining} seconds before requesting another code")
        if active_request.resend_count >= active_request.max_resends:
            raise AuthError(429, "You have reached the resend limit. Please try again later")

    recent_request_count = count_recent_password_reset_otp_requests(normalized_email, within_minutes=60)
    if recent_request_count >= OTP_MAX_SENDS_PER_HOUR:
        raise AuthError(429, "Too many reset code requests. Please try again in about an hour")

    otp = generate_numeric_otp()
    resend_count = (active_request.resend_count + 1) if active_request is not None else 0
    create_password_reset_otp(
        user_id=user.id,
        email=user.email,
        otp_hash=hash_otp(user.email, otp),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRES_MINUTES),
        max_attempts=OTP_MAX_ATTEMPTS,
        max_resends=OTP_MAX_RESENDS_PER_REQUEST,
        resend_count=resend_count,
    )
    send_password_reset_otp_email(user.email, otp)
    return {
        "cooldownSeconds": OTP_RESEND_COOLDOWN_SECONDS,
        "resendRemaining": max(OTP_MAX_RESENDS_PER_REQUEST - resend_count, 0),
    }


def verify_password_reset_otp(email: str, otp: str) -> str:
    normalized_email = _normalize_email(email)
    active_request = find_latest_active_password_reset_otp(normalized_email)
    if active_request is None:
        raise AuthError(400, "OTP is invalid or expired")

    next_attempt_count = increment_password_reset_otp_attempt(active_request.id)
    if next_attempt_count > active_request.max_attempts:
        raise AuthError(400, "OTP has expired. Please request a new code")

    if not hmac.compare_digest(active_request.otp_hash, hash_otp(normalized_email, otp)):
        remaining = max(active_request.max_attempts - next_attempt_count, 0)
        if remaining <= 0:
            raise AuthError(400, "OTP has expired. Please request a new code")
        raise AuthError(400, f"OTP is incorrect. {remaining} attempt(s) remaining")

    grant_token = create_password_reset_grant(
        user_id=active_request.user_id,
        email=normalized_email,
        reset_request_id=active_request.id,
    )
    grant_hash = hashlib.sha256(grant_token.encode("utf-8")).hexdigest()
    mark_password_reset_otp_verified(
        otp_id=active_request.id,
        grant_token_hash=grant_hash,
        grant_expires_at=datetime.now(timezone.utc) + timedelta(minutes=RESET_GRANT_EXPIRES_MINUTES),
    )
    return grant_token


def complete_password_reset(grant_token: str, new_password: str) -> None:
    try:
        grant_payload = decode_password_reset_grant(grant_token)
    except ValueError as error:
        raise AuthError(400, str(error)) from error

    grant_hash = hashlib.sha256(grant_token.encode("utf-8")).hexdigest()
    consumed = consume_password_reset_grant(grant_hash)
    if consumed is None:
        raise AuthError(400, "Reset session is invalid or expired")

    user_id, email = consumed
    if user_id != grant_payload["sub"] or email != grant_payload["email"]:
        raise AuthError(400, "Reset session is invalid or expired")

    replace_user_password(user_id, hash_password(new_password))
    invalidate_all_password_reset_otps_for_user(user_id)


def reset_password(token: str, new_password: str) -> None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    user_id = consume_reset_token(token_hash)
    if user_id is None:
        raise AuthError(400, "Reset link is invalid or expired")
    replace_user_password(user_id, hash_password(new_password))
