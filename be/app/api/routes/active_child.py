from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from be.app.api.deps import require_auth
from be.app.schemas.children import SetActiveChildRequest
from be.app.services.active_child_service import (
    ActiveChildError,
    get_active_child_for_user,
    set_active_child_for_user,
)

router = APIRouter()


def _handle_error(error: Exception) -> JSONResponse:
    if isinstance(error, ActiveChildError):
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "status": "error", "message": error.message},
        )
    return JSONResponse(
        status_code=500,
        content={"ok": False, "status": "error", "message": "Internal server error"},
    )


@router.get("/active-child")
def get_active_child_route(user=Depends(require_auth)):
    try:
        active_child_id = get_active_child_for_user(user)
        return {
            "ok": True,
            "status": "success",
            "data": {"activeChildId": active_child_id},
            "activeChildId": active_child_id,
        }
    except Exception as error:
        return _handle_error(error)


@router.put("/active-child")
def set_active_child_route(payload: SetActiveChildRequest, user=Depends(require_auth)):
    try:
        active_child_id = set_active_child_for_user(user, payload.childId)
        return {
            "ok": True,
            "status": "success",
            "message": "Active child updated",
            "data": {"activeChildId": active_child_id},
            "activeChildId": active_child_id,
        }
    except Exception as error:
        return _handle_error(error)
