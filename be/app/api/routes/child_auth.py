from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from be.app.api.deps import require_auth, require_parent_auth
from be.app.core.config import settings
from be.app.schemas.child_auth import ChildCredentialUpsertRequest, ChildLoginRequest, ExitChildModeRequest
from be.app.services.auth_service import AuthError
from be.app.services.child_auth_service import (
    enter_child_mode,
    get_child_credential,
    resolve_child_mode,
    save_child_credential,
    verify_parent_password,
)

router = APIRouter()
CHILD_SESSION_COOKIE = "speakjoy-child-session"


def _error(error: Exception) -> JSONResponse:
    if isinstance(error, AuthError):
        return JSONResponse(status_code=error.status_code, content={"ok": False, "message": error.message})
    return JSONResponse(status_code=500, content={"ok": False, "message": "Internal server error"})


def _set_child_cookie(response: JSONResponse, token: str) -> JSONResponse:
    response.set_cookie(CHILD_SESSION_COOKIE, token, httponly=True, samesite="lax", secure=settings.auth_cookie_secure, domain=settings.auth_cookie_domain, path="/", max_age=60 * 60 * 12)
    return response


def _clear_child_cookie(response: JSONResponse) -> JSONResponse:
    response.set_cookie(CHILD_SESSION_COOKIE, "", httponly=True, samesite="lax", secure=settings.auth_cookie_secure, domain=settings.auth_cookie_domain, path="/", max_age=0)
    return response


@router.get("/status")
def child_mode_status(request: Request, parent=Depends(require_auth)):
    child = resolve_child_mode(request.cookies.get(CHILD_SESSION_COOKIE), parent)
    return {"ok": True, "active": child is not None, "child": child}


@router.get("/credentials/{child_id}")
def child_credential_detail(child_id: str, parent=Depends(require_parent_auth)):
    try:
        return {"ok": True, "credential": get_child_credential(parent, child_id)}
    except Exception as error:
        return _error(error)


@router.put("/credentials/{child_id}")
def child_credential_save(child_id: str, payload: ChildCredentialUpsertRequest, parent=Depends(require_parent_auth)):
    try:
        return {"ok": True, "credential": save_child_credential(parent, child_id, payload.username, payload.password)}
    except Exception as error:
        return _error(error)


@router.post("/login")
def child_login(payload: ChildLoginRequest, parent=Depends(require_parent_auth)):
    try:
        child, token = enter_child_mode(parent, payload.username, payload.password)
        return _set_child_cookie(JSONResponse(content={"ok": True, "child": child}), token)
    except Exception as error:
        return _error(error)


@router.post("/exit")
def child_exit(payload: ExitChildModeRequest, parent=Depends(require_auth)):
    try:
        verify_parent_password(parent, payload.password)
        return _clear_child_cookie(JSONResponse(content={"ok": True}))
    except Exception as error:
        return _error(error)
