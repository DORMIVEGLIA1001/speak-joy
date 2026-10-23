import base64
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import jwt
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import options_to_json
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from be.app.core.config import settings
from be.app.repositories.auth_repository import find_user_by_id
from be.app.repositories.webauthn_repository import (
    WebAuthnCredentialEntity,
    create_webauthn_credential,
    delete_all_webauthn_credentials_for_user,
    delete_webauthn_credential,
    find_webauthn_credential_for_user,
    list_webauthn_credentials_for_user,
    update_webauthn_credential_usage,
)
from be.app.schemas.auth import PublicUser


class WebAuthnError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


CHALLENGE_TOKEN_EXPIRES_MINUTES = 10
RP_NAME = "Speak Joy"


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _resolve_request_context(
    *,
    request_origin: str | None,
    request_host: str | None,
    request_proto: str | None,
) -> tuple[str, str]:
    origin = (request_origin or "").strip().rstrip("/")
    host = (request_host or "").strip()
    proto = (request_proto or "").strip() or "https"

    if origin:
        parsed_origin = urlparse(origin)
        if parsed_origin.hostname:
            return parsed_origin.hostname, origin

    if host:
        parsed_host = urlparse(f"{proto}://{host}")
        if parsed_host.hostname:
            return parsed_host.hostname, f"{proto}://{host}"

    parsed_default = urlparse(settings.frontend_base_url.rstrip("/"))
    if not parsed_default.hostname:
        raise WebAuthnError(500, "FRONTEND_BASE_URL must include a valid hostname for passkeys")
    return parsed_default.hostname, settings.frontend_base_url.rstrip("/")


def _challenge_state_token(*, user_id: str, challenge: bytes, action: str, rp_id: str, origin: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "challenge": _b64url_encode(challenge),
        "action": action,
        "rp_id": rp_id,
        "origin": origin,
        "iat": now,
        "exp": now + timedelta(minutes=CHALLENGE_TOKEN_EXPIRES_MINUTES),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _decode_challenge_state_token(*, token: str, expected_user_id: str, expected_action: str) -> tuple[bytes, str, str]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as error:
        raise WebAuthnError(400, "WebAuthn challenge is invalid or expired") from error

    if payload.get("sub") != expected_user_id or payload.get("action") != expected_action:
        raise WebAuthnError(400, "WebAuthn challenge does not match the current user")

    challenge = payload.get("challenge")
    if not isinstance(challenge, str) or not challenge:
        raise WebAuthnError(400, "WebAuthn challenge payload is missing")

    rp_id = payload.get("rp_id")
    origin = payload.get("origin")
    if not isinstance(rp_id, str) or not rp_id:
        raise WebAuthnError(400, "WebAuthn RP ID payload is missing")
    if not isinstance(origin, str) or not origin:
        raise WebAuthnError(400, "WebAuthn origin payload is missing")

    return _b64url_decode(challenge), rp_id, origin


def _serialize_credential(credential: WebAuthnCredentialEntity) -> dict:
    return {
        "id": credential.id,
        "credentialId": _b64url_encode(credential.credential_id),
        "label": credential.label or "Passkey của phụ huynh",
        "deviceType": credential.device_type or "unknown",
        "backedUp": credential.backed_up,
        "transports": credential.transports,
        "lastUsedAt": credential.last_used_at.isoformat() if credential.last_used_at else None,
        "createdAt": credential.created_at.isoformat(),
    }


def get_webauthn_summary_for_user(user: PublicUser) -> dict:
    credentials = list_webauthn_credentials_for_user(user.id)
    return {
        "hasPasskey": len(credentials) > 0,
        "count": len(credentials),
        "credentials": [_serialize_credential(credential) for credential in credentials],
    }


def begin_passkey_registration_for_user(
    user: PublicUser,
    *,
    request_origin: str | None,
    request_host: str | None,
    request_proto: str | None,
) -> dict:
    fresh_user = find_user_by_id(user.id)
    if fresh_user is None:
        raise WebAuthnError(404, "User not found")

    rp_id, origin = _resolve_request_context(
        request_origin=request_origin,
        request_host=request_host,
        request_proto=request_proto,
    )
    existing_credentials = list_webauthn_credentials_for_user(user.id)
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=RP_NAME,
        user_id=user.id.encode("utf-8"),
        user_name=fresh_user.email,
        user_display_name=fresh_user.display_name or fresh_user.email,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=credential.credential_id, transports=None)
            for credential in existing_credentials
        ] or None,
    )
    options_json = json.loads(options_to_json(options))
    state_token = _challenge_state_token(
        user_id=user.id,
        challenge=options.challenge,
        action="register",
        rp_id=rp_id,
        origin=origin,
    )
    return {"options": options_json, "stateToken": state_token}


def finish_passkey_registration_for_user(
    user: PublicUser,
    *,
    credential: dict,
    state_token: str,
    label: str | None = None,
) -> dict:
    expected_challenge, rp_id, origin = _decode_challenge_state_token(
        token=state_token,
        expected_user_id=user.id,
        expected_action="register",
    )
    try:
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=True,
        )
    except Exception as error:
        raise WebAuthnError(400, f"Passkey registration could not be verified: {error}") from error

    created = create_webauthn_credential(
        user_id=user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        label=label,
        device_type=verification.credential_device_type.value if verification.credential_device_type else None,
        backed_up=verification.credential_backed_up,
        transports=list((credential.get("response") or {}).get("transports") or []),
    )
    return {
        "credential": _serialize_credential(created),
        "summary": get_webauthn_summary_for_user(user),
    }


def begin_passkey_authentication_for_user(
    user: PublicUser,
    *,
    request_origin: str | None,
    request_host: str | None,
    request_proto: str | None,
) -> dict:
    credentials = list_webauthn_credentials_for_user(user.id)
    if not credentials:
        raise WebAuthnError(400, "No passkey is registered for this parent account")

    rp_id, origin = _resolve_request_context(
        request_origin=request_origin,
        request_host=request_host,
        request_proto=request_proto,
    )
    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=credential.credential_id, transports=None)
            for credential in credentials
        ],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    options_json = json.loads(options_to_json(options))
    state_token = _challenge_state_token(
        user_id=user.id,
        challenge=options.challenge,
        action="authenticate",
        rp_id=rp_id,
        origin=origin,
    )
    return {"options": options_json, "stateToken": state_token}


def finish_passkey_authentication_for_user(
    user: PublicUser,
    *,
    credential: dict,
    state_token: str,
) -> dict:
    expected_challenge, rp_id, origin = _decode_challenge_state_token(
        token=state_token,
        expected_user_id=user.id,
        expected_action="authenticate",
    )

    credential_id_raw = credential.get("id")
    if not isinstance(credential_id_raw, str) or not credential_id_raw:
        raise WebAuthnError(400, "Credential ID is missing from authentication response")

    stored_credential = find_webauthn_credential_for_user(user.id, _b64url_decode(credential_id_raw))
    if stored_credential is None:
        raise WebAuthnError(404, "This passkey is not linked to the current parent account")

    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=stored_credential.public_key,
            credential_current_sign_count=stored_credential.sign_count,
            require_user_verification=True,
        )
    except Exception as error:
        raise WebAuthnError(400, f"Passkey authentication could not be verified: {error}") from error

    updated = update_webauthn_credential_usage(
        user_id=user.id,
        credential_id=verification.credential_id,
        sign_count=verification.new_sign_count,
        backed_up=verification.credential_backed_up,
        device_type=verification.credential_device_type.value if verification.credential_device_type else None,
    )
    return {
        "verified": True,
        "credential": _serialize_credential(updated),
        "summary": get_webauthn_summary_for_user(user),
    }


def remove_passkey_for_user(user: PublicUser, credential_id: str) -> dict:
    deleted = delete_webauthn_credential(user.id, _b64url_decode(credential_id))
    if not deleted:
        raise WebAuthnError(404, "Passkey not found")
    return get_webauthn_summary_for_user(user)


def remove_all_passkeys_for_user(user: PublicUser) -> dict:
    delete_all_webauthn_credentials_for_user(user.id)
    return get_webauthn_summary_for_user(user)
