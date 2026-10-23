from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from be.app.api.deps import require_auth
from be.app.schemas.webauthn import (
    WebAuthnDeleteCredentialRequest,
    WebAuthnVerifyAuthenticationRequest,
    WebAuthnVerifyRegistrationRequest,
)
from be.app.services.webauthn_service import (
    WebAuthnError,
    begin_passkey_authentication_for_user,
    begin_passkey_registration_for_user,
    finish_passkey_authentication_for_user,
    finish_passkey_registration_for_user,
    get_webauthn_summary_for_user,
    remove_all_passkeys_for_user,
    remove_passkey_for_user,
)

router = APIRouter()


def _handle_error(error: Exception) -> JSONResponse:
    if isinstance(error, WebAuthnError):
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "status": "error", "message": error.message},
        )
    return JSONResponse(
        status_code=500,
        content={"ok": False, "status": "error", "message": "Internal server error"},
    )


@router.get("/webauthn/credentials")
def list_passkeys_route(user=Depends(require_auth)):
    try:
        summary = get_webauthn_summary_for_user(user)
        return {"ok": True, "status": "success", "data": summary, **summary}
    except Exception as error:
        return _handle_error(error)


@router.post("/webauthn/register/options")
def register_passkey_options_route(request: Request, user=Depends(require_auth)):
    try:
        data = begin_passkey_registration_for_user(
            user,
            request_origin=request.headers.get("origin"),
            request_host=request.headers.get("x-forwarded-host") or request.headers.get("host"),
            request_proto=request.headers.get("x-forwarded-proto") or request.url.scheme,
        )
        return {"ok": True, "status": "success", "data": data, **data}
    except Exception as error:
        return _handle_error(error)


@router.post("/webauthn/register/verify")
def register_passkey_verify_route(payload: WebAuthnVerifyRegistrationRequest, user=Depends(require_auth)):
    try:
        data = finish_passkey_registration_for_user(
            user,
            credential=payload.credential,
            state_token=payload.stateToken,
            label=payload.label,
        )
        return {
            "ok": True,
            "status": "success",
            "message": "Passkey registered",
            "data": data,
            **data,
        }
    except Exception as error:
        return _handle_error(error)


@router.post("/webauthn/authenticate/options")
def authenticate_passkey_options_route(request: Request, user=Depends(require_auth)):
    try:
        data = begin_passkey_authentication_for_user(
            user,
            request_origin=request.headers.get("origin"),
            request_host=request.headers.get("x-forwarded-host") or request.headers.get("host"),
            request_proto=request.headers.get("x-forwarded-proto") or request.url.scheme,
        )
        return {"ok": True, "status": "success", "data": data, **data}
    except Exception as error:
        return _handle_error(error)


@router.post("/webauthn/authenticate/verify")
def authenticate_passkey_verify_route(payload: WebAuthnVerifyAuthenticationRequest, user=Depends(require_auth)):
    try:
        data = finish_passkey_authentication_for_user(
            user,
            credential=payload.credential,
            state_token=payload.stateToken,
        )
        return {
            "ok": True,
            "status": "success",
            "message": "Passkey verified",
            "data": data,
            **data,
        }
    except Exception as error:
        return _handle_error(error)


@router.delete("/webauthn/credentials")
def delete_all_passkeys_route(user=Depends(require_auth)):
    try:
        summary = remove_all_passkeys_for_user(user)
        return {
            "ok": True,
            "status": "success",
            "message": "All passkeys removed",
            "data": summary,
            **summary,
        }
    except Exception as error:
        return _handle_error(error)


@router.post("/webauthn/credentials/delete")
def delete_one_passkey_route(payload: WebAuthnDeleteCredentialRequest, user=Depends(require_auth)):
    try:
        summary = remove_passkey_for_user(user, payload.credentialId)
        return {
            "ok": True,
            "status": "success",
            "message": "Passkey removed",
            "data": summary,
            **summary,
        }
    except Exception as error:
        return _handle_error(error)
