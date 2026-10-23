from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode

import httpx
import jwt

from be.app.core.config import settings
from be.app.core.security import create_access_token
from be.app.repositories.auth_repository import (
    UserEntity,
    create_social_user,
    find_user_by_email,
    find_user_by_provider,
    link_user_social_identity,
    update_last_login_at,
)
from be.app.schemas.auth import AuthResult, PublicUser
from be.app.services.auth_service import AuthError

OAuthProvider = Literal["google", "facebook"]
OAUTH_STATE_EXP_MINUTES = 10
FACEBOOK_API_VERSION = "v22.0"


@dataclass(slots=True)
class OAuthIdentity:
    provider: OAuthProvider
    provider_user_id: str
    email: str
    display_name: str
    avatar_url: str | None
    email_verified: bool


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _ensure_provider_configured(provider: OAuthProvider) -> None:
    if provider == "google":
        if not settings.google_client_id or not settings.google_client_secret or not settings.google_redirect_uri:
            raise AuthError(500, "Google OAuth is not configured")
        return

    if not settings.facebook_app_id or not settings.facebook_app_secret or not settings.facebook_redirect_uri:
        raise AuthError(500, "Facebook OAuth is not configured")


def _normalize_redirect_uri(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None


def _resolve_redirect_uri(provider: OAuthProvider, request_host: str | None = None, request_proto: str | None = None) -> str:
    configured = settings.google_redirect_uri if provider == "google" else settings.facebook_redirect_uri

    host = (request_host or "").strip()
    proto = (request_proto or "").strip() or "http"
    if host:
        path = f"/api/auth/{provider}/callback"
        return f"{proto}://{host}{path}"

    normalized = _normalize_redirect_uri(configured)
    if not normalized:
        raise AuthError(500, f"{provider.title()} OAuth redirect URI is not configured")
    return normalized


def _encode_state(provider: OAuthProvider, next_path: str | None, redirect_uri: str) -> str:
    now = datetime.now(timezone.utc)
    safe_next = next_path if next_path and next_path.startswith("/") else settings.auth_success_redirect_path
    payload = {
        "kind": "oauth_state",
        "provider": provider,
        "next": safe_next,
        "redirect_uri": redirect_uri,
        "iat": now,
        "exp": now + timedelta(minutes=OAUTH_STATE_EXP_MINUTES),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _decode_state(expected_provider: OAuthProvider, state: str) -> tuple[str, str]:
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as error:
        raise AuthError(400, "Invalid OAuth state") from error

    if payload.get("kind") != "oauth_state" or payload.get("provider") != expected_provider:
        raise AuthError(400, "Invalid OAuth state")

    next_path = payload.get("next")
    redirect_uri = payload.get("redirect_uri")
    if not isinstance(redirect_uri, str) or not redirect_uri.strip():
        raise AuthError(400, "Invalid OAuth state")

    if isinstance(next_path, str) and next_path.startswith("/"):
        return next_path, redirect_uri

    return settings.auth_success_redirect_path, redirect_uri


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


def build_oauth_start_url(
    provider: OAuthProvider,
    next_path: str | None = None,
    request_host: str | None = None,
    request_proto: str | None = None,
) -> str:
    _ensure_provider_configured(provider)
    redirect_uri = _resolve_redirect_uri(provider, request_host, request_proto)
    state = _encode_state(provider, next_path, redirect_uri)

    if provider == "google":
        query = urlencode(
            {
                "client_id": settings.google_client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "access_type": "offline",
                "prompt": "select_account",
            }
        )
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    query = urlencode(
        {
            "client_id": settings.facebook_app_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "email,public_profile",
            "state": state,
        }
    )
    return f"https://www.facebook.com/{FACEBOOK_API_VERSION}/dialog/oauth?{query}"


def build_oauth_success_redirect(next_path: str) -> str:
    safe_path = next_path if next_path.startswith("/") else settings.auth_success_redirect_path
    return f"{settings.frontend_base_url.rstrip('/')}{safe_path}"


def build_oauth_error_redirect(message: str) -> str:
    query = urlencode({"error": message})
    return f"{settings.oauth_error_redirect_url}?{query}"


def finish_oauth_login(provider: OAuthProvider, code: str, state: str) -> tuple[AuthResult, str]:
    _ensure_provider_configured(provider)
    next_path, redirect_uri = _decode_state(provider, state)
    identity = _fetch_identity(provider, code, redirect_uri)
    user = _upsert_oauth_user(identity)
    _ensure_active_user(user)
    update_last_login_at(user.id)
    return _to_auth_result(user), next_path


def _upsert_oauth_user(identity: OAuthIdentity) -> UserEntity:
    existing_provider_user = find_user_by_provider(identity.provider, identity.provider_user_id)
    if existing_provider_user is not None:
        return link_user_social_identity(
            user_id=existing_provider_user.id,
            auth_provider=identity.provider,
            provider_user_id=identity.provider_user_id,
            avatar_url=identity.avatar_url,
            email_verified=identity.email_verified,
        )

    # Only auto-link a social login to a pre-existing account when the provider asserts
    # the email is verified. Otherwise an attacker who creates an unverified account at
    # the provider with a victim's email could take over the victim's account on callback.
    # See notes.md 3.B.6.
    existing_email_user = find_user_by_email(_normalize_email(identity.email))
    if existing_email_user is not None:
        if not identity.email_verified:
            raise AuthError(
                409,
                "An account with this email already exists. Sign in with your password, "
                "or verify your email with the provider before linking.",
            )
        return link_user_social_identity(
            user_id=existing_email_user.id,
            auth_provider=identity.provider,
            provider_user_id=identity.provider_user_id,
            avatar_url=identity.avatar_url,
            email_verified=identity.email_verified,
        )

    return create_social_user(
        email=_normalize_email(identity.email),
        display_name=identity.display_name,
        role="parent",
        auth_provider=identity.provider,
        provider_user_id=identity.provider_user_id,
        avatar_url=identity.avatar_url,
        email_verified=identity.email_verified,
    )


def _fetch_identity(provider: OAuthProvider, code: str, redirect_uri: str) -> OAuthIdentity:
    if provider == "google":
        return _fetch_google_identity(code, redirect_uri)
    return _fetch_facebook_identity(code, redirect_uri)


def _fetch_google_identity(code: str, redirect_uri: str) -> OAuthIdentity:
    token_response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        },
        timeout=15.0,
    )
    token_response.raise_for_status()
    access_token = token_response.json().get("access_token")
    if not access_token:
        raise AuthError(400, "Google OAuth token exchange failed")

    userinfo_response = httpx.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15.0,
    )
    userinfo_response.raise_for_status()
    data = userinfo_response.json()

    email = data.get("email")
    subject = data.get("sub")
    if not isinstance(email, str) or not isinstance(subject, str):
        raise AuthError(400, "Google account did not return a usable profile")

    return OAuthIdentity(
        provider="google",
        provider_user_id=subject,
        email=email,
        display_name=(data.get("name") or email.split("@")[0]).strip(),
        avatar_url=data.get("picture"),
        email_verified=bool(data.get("email_verified", False)),
    )


def _fetch_facebook_identity(code: str, redirect_uri: str) -> OAuthIdentity:
    token_response = httpx.get(
        f"https://graph.facebook.com/{FACEBOOK_API_VERSION}/oauth/access_token",
        params={
            "client_id": settings.facebook_app_id,
            "client_secret": settings.facebook_app_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        },
        timeout=15.0,
    )
    token_response.raise_for_status()
    access_token = token_response.json().get("access_token")
    if not access_token:
        raise AuthError(400, "Facebook OAuth token exchange failed")

    profile_response = httpx.get(
        f"https://graph.facebook.com/{FACEBOOK_API_VERSION}/me",
        params={
            "fields": "id,name,email,picture.type(large),verified",
            "access_token": access_token,
        },
        timeout=15.0,
    )
    profile_response.raise_for_status()
    data = profile_response.json()

    email = data.get("email")
    subject = data.get("id")
    if not isinstance(email, str) or not isinstance(subject, str):
        raise AuthError(400, "Facebook account did not return an email address")

    picture_data = data.get("picture", {}).get("data", {})
    avatar_url = picture_data.get("url") if isinstance(picture_data, dict) else None

    return OAuthIdentity(
        provider="facebook",
        provider_user_id=subject,
        email=email,
        display_name=(data.get("name") or email.split("@")[0]).strip(),
        avatar_url=avatar_url if isinstance(avatar_url, str) else None,
        email_verified=bool(data.get("verified", False)),
    )
