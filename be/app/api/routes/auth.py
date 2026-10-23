from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import ValidationError

from be.app.api.deps import require_auth, require_parent_auth
from be.app.core.config import settings
from be.app.core.rate_limit import enforce_rate_limit
from be.app.schemas.auth import (
    AccountUpdateRequest,
    CompleteForgotPasswordResetRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyForgotPasswordOtpRequest,
)
from be.app.services.auth_service import (
    AuthError,
    complete_password_reset,
    login,
    register,
    request_password_reset_otp,
    reset_password,
    update_local_account,
    verify_password_reset_otp,
)
from be.app.services.oauth_service import (
    build_oauth_error_redirect,
    build_oauth_start_url,
    build_oauth_success_redirect,
    finish_oauth_login,
)

router = APIRouter()
AUTH_SESSION_COOKIE = "speakjoy-session"
ACTIVE_STUDENT_COOKIE = "speakjoy-active-student"
CHILD_SESSION_COOKIE = "speakjoy-child-session"


@router.put("/account")
def update_account_route(payload: AccountUpdateRequest, user=Depends(require_parent_auth)):
    try:
        updated = update_local_account(user, display_name=payload.displayName, email=payload.email, current_password=payload.currentPassword, new_password=payload.newPassword)
        return {"ok": True, "user": updated.model_dump()}
    except Exception as error:
        return _handle_error(error)


@router.post("/forgot-password")
def forgot_password_route(payload: ForgotPasswordRequest):
    try:
        reset_state = request_password_reset_otp(payload.email)
    except Exception as error:
        return _handle_error(error)
    delivery = "email" if settings.smtp_configured else ("console" if settings.node_env.lower() != "production" else "unavailable")
    return {
        "ok": True,
        "delivery": delivery,
        "message": "If the email belongs to a local account, a reset code has been prepared.",
        **reset_state,
    }


@router.post("/forgot-password/verify-otp")
def verify_forgot_password_otp_route(payload: VerifyForgotPasswordOtpRequest):
    try:
        grant_token = verify_password_reset_otp(payload.email, payload.otp)
        return {"ok": True, "grantToken": grant_token}
    except Exception as error:
        return _handle_error(error)


@router.post("/forgot-password/complete")
def complete_forgot_password_route(payload: CompleteForgotPasswordResetRequest):
    try:
        complete_password_reset(payload.grantToken, payload.newPassword)
        return {"ok": True, "message": "Password updated"}
    except Exception as error:
        return _handle_error(error)


@router.post("/reset-password")
def reset_password_route(payload: ResetPasswordRequest):
    try:
        reset_password(payload.token, payload.newPassword)
        return {"ok": True, "message": "Password updated"}
    except Exception as error:
        return _handle_error(error)


def _attach_auth_session(response: JSONResponse, access_token: str) -> JSONResponse:
    response.set_cookie(
        AUTH_SESSION_COOKIE,
        access_token,
        httponly=True,
        samesite="lax",
        secure=settings.auth_cookie_secure,
        domain=settings.auth_cookie_domain,
        path="/",
        max_age=60 * 60 * 24 * 7,
    )
    return response


def _clear_auth_session(response: JSONResponse) -> JSONResponse:
    response.set_cookie(
        AUTH_SESSION_COOKIE,
        "",
        httponly=True,
        samesite="lax",
        secure=settings.auth_cookie_secure,
        domain=settings.auth_cookie_domain,
        path="/",
        max_age=0,
    )
    response.set_cookie(
        ACTIVE_STUDENT_COOKIE,
        "",
        httponly=False,
        samesite="lax",
        secure=settings.auth_cookie_secure,
        domain=settings.auth_cookie_domain,
        path="/",
        max_age=0,
    )
    response.set_cookie(
        CHILD_SESSION_COOKIE,
        "",
        httponly=True,
        samesite="lax",
        secure=settings.auth_cookie_secure,
        domain=settings.auth_cookie_domain,
        path="/",
        max_age=0,
    )
    return response


def _attach_auth_session_redirect(response: RedirectResponse, access_token: str) -> RedirectResponse:
    response.set_cookie(
        AUTH_SESSION_COOKIE,
        access_token,
        httponly=True,
        samesite="lax",
        secure=settings.auth_cookie_secure,
        domain=settings.auth_cookie_domain,
        path="/",
        max_age=60 * 60 * 24 * 7,
    )
    return response


def _handle_error(error: Exception) -> JSONResponse:
    if isinstance(error, ValidationError):
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "status": "error",
                "message": "Validation failed",
                "issues": error.errors(),
            },
        )

    if isinstance(error, AuthError):
        return JSONResponse(
            status_code=error.status_code,
            content={
                "ok": False,
                "status": "error",
                "message": error.message,
            },
        )

    if isinstance(error, HTTPException):
        return JSONResponse(
            status_code=error.status_code,
            content={
                "ok": False,
                "status": "error",
                "message": error.detail,
            },
        )

    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "status": "error",
            "message": "Internal server error",
        },
    )


@router.post("/register")
def register_route(payload: RegisterRequest, request: Request):
    try:
        enforce_rate_limit(request, scope="register")
        result = register(payload)
        response = JSONResponse(
            status_code=201,
            content={
                "ok": True,
                "status": "success",
                "message": "Registered successfully",
                "data": result.model_dump(),
                "user": result.user.model_dump(),
                "accessToken": result.accessToken,
            },
        )
        return _attach_auth_session(response, result.accessToken)
    except Exception as error:
        return _handle_error(error)


@router.post("/login")
def login_route(payload: LoginRequest, request: Request):
    try:
        enforce_rate_limit(request, scope="login")
        result = login(payload)
        response = JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "status": "success",
                "message": "Logged in successfully",
                "data": result.model_dump(),
                "user": result.user.model_dump(),
                "accessToken": result.accessToken,
            },
        )
        return _attach_auth_session(response, result.accessToken)
    except Exception as error:
        return _handle_error(error)


@router.post("/logout")
def logout_route():
    response = JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "status": "success",
            "message": "Logged out successfully",
        },
    )
    return _clear_auth_session(response)


@router.get("/login")
def login_route_get():
    """
    GET /login is not supported. Passwords must never be sent via query string
    (they appear in server logs, browser history, and proxy access logs).
    Use POST /login instead.
    """
    return JSONResponse(
        status_code=405,
        content={
            "ok": False,
            "status": "error",
            "message": "Method Not Allowed. Use POST /auth/login with a JSON body.",
        },
    )


@router.get("/me")
def me_route(user=Depends(require_auth)):
    try:
        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "status": "success",
                "data": {"user": user.model_dump()},
                "user": user.model_dump(),
            },
        )
    except Exception as error:
        return _handle_error(error)


@router.get("/google/start")
def google_oauth_start(request: Request, next: str | None = Query(default=None)):
    try:
        return RedirectResponse(
            build_oauth_start_url(
                "google",
                next,
                request_host=request.headers.get("x-forwarded-host") or request.headers.get("host"),
                request_proto=request.headers.get("x-forwarded-proto") or request.url.scheme,
            )
        )
    except Exception as error:
        return RedirectResponse(build_oauth_error_redirect(str(error)))


@router.get("/facebook/start")
def facebook_oauth_start(request: Request, next: str | None = Query(default=None)):
    try:
        return RedirectResponse(
            build_oauth_start_url(
                "facebook",
                next,
                request_host=request.headers.get("x-forwarded-host") or request.headers.get("host"),
                request_proto=request.headers.get("x-forwarded-proto") or request.url.scheme,
            )
        )
    except Exception as error:
        return RedirectResponse(build_oauth_error_redirect(str(error)))


@router.get("/google/callback")
def google_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        return RedirectResponse(build_oauth_error_redirect(error))
    if not code or not state:
        return RedirectResponse(build_oauth_error_redirect("Missing Google OAuth code or state"))

    try:
        result, next_path = finish_oauth_login("google", code, state)
        response = RedirectResponse(build_oauth_success_redirect(next_path))
        return _attach_auth_session_redirect(response, result.accessToken)
    except Exception as auth_error:
        return RedirectResponse(build_oauth_error_redirect(str(auth_error)))


@router.get("/facebook/callback")
def facebook_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        return RedirectResponse(build_oauth_error_redirect(error))
    if not code or not state:
        return RedirectResponse(build_oauth_error_redirect("Missing Facebook OAuth code or state"))

    try:
        result, next_path = finish_oauth_login("facebook", code, state)
        response = RedirectResponse(build_oauth_success_redirect(next_path))
        return _attach_auth_session_redirect(response, result.accessToken)
    except Exception as auth_error:
        return RedirectResponse(build_oauth_error_redirect(str(auth_error)))
