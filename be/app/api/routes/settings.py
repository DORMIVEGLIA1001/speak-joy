from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from be.app.api.deps import require_parent_auth
from be.app.schemas.settings import (
    ParentGatePasswordVerifyRequest,
    ParentSettingsUpdateRequest,
    ParentSettingsValidateRequest,
    UsageIncrementRequest,
)
from be.app.services.settings_service import (
    SettingsError,
    get_parent_settings_for_user,
    increment_parent_ai_usage_for_user,
    update_parent_settings_for_user,
    validate_parent_ai_settings_for_user,
    verify_parent_gate_password_for_user,
)

router = APIRouter()


def _handle_error(error: Exception) -> JSONResponse:
    if isinstance(error, SettingsError):
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "status": "error", "message": error.message},
        )
    return JSONResponse(
        status_code=500,
        content={"ok": False, "status": "error", "message": "Internal server error"},
    )


@router.get("/parent-settings")
def get_parent_settings_route(user=Depends(require_parent_auth)):
    try:
        settings_payload = get_parent_settings_for_user(user)
        return {"ok": True, "status": "success", "data": settings_payload, **settings_payload}
    except Exception as error:
        return _handle_error(error)


@router.put("/parent-settings")
def update_parent_settings_route(payload: ParentSettingsUpdateRequest, user=Depends(require_parent_auth)):
    try:
        settings_payload = update_parent_settings_for_user(user, payload)
        return {
            "ok": True,
            "status": "success",
            "message": "Parent settings updated",
            "data": settings_payload,
            **settings_payload,
        }
    except Exception as error:
        return _handle_error(error)


@router.post("/parent-settings/usage/increment")
def increment_parent_settings_usage_route(payload: UsageIncrementRequest, user=Depends(require_parent_auth)):
    try:
        settings_payload = increment_parent_ai_usage_for_user(user, payload.amount)
        return {
            "ok": True,
            "status": "success",
            "message": "Usage updated",
            "data": settings_payload,
            **settings_payload,
        }
    except Exception as error:
        return _handle_error(error)


@router.post("/parent-gate/verify-password")
def verify_parent_gate_password_route(payload: ParentGatePasswordVerifyRequest, user=Depends(require_parent_auth)):
    try:
        result = verify_parent_gate_password_for_user(user, payload.password)
        return {
            "ok": True,
            "status": "success",
            "message": "Parent password verified",
            "data": result,
            **result,
        }
    except Exception as error:
        return _handle_error(error)


@router.post("/parent-settings/validate")
def validate_parent_settings_route(payload: ParentSettingsValidateRequest, user=Depends(require_parent_auth)):
    try:
        result = validate_parent_ai_settings_for_user(user, payload)
        return {
            "ok": True,
            "status": "success" if result.get("connected") else "error",
            "message": "AI connection verified" if result.get("connected") else result.get("message", "AI connection failed"),
            "data": result,
            **result,
        }
    except Exception as error:
        return _handle_error(error)
