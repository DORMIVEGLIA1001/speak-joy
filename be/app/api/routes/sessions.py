from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from be.app.api.deps import require_auth
from be.app.schemas.sessions import CreateSessionRequest, EndSessionRequest
from be.app.services.sessions_service import (
    SessionsError,
    create_session_for_user,
    end_session_for_user,
    get_session_for_user,
    list_sessions,
)

router = APIRouter()


def _handle_error(error: Exception) -> JSONResponse:
    if isinstance(error, SessionsError):
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "status": "error", "message": error.message},
        )
    return JSONResponse(
        status_code=500,
        content={"ok": False, "status": "error", "message": "Internal server error"},
    )


@router.get("")
def list_sessions_route(user=Depends(require_auth)):
    try:
        sessions = list_sessions(user)
        return {"ok": True, "status": "success", "data": {"sessions": sessions}}
    except Exception as error:
        return _handle_error(error)


@router.post("")
def create_session_route(payload: CreateSessionRequest, user=Depends(require_auth)):
    try:
        session = create_session_for_user(user, payload)
        return JSONResponse(
            status_code=201,
            content={"ok": True, "status": "success", "data": {"session": session}},
        )
    except Exception as error:
        return _handle_error(error)


@router.get("/{session_id}")
def get_session_route(session_id: str, user=Depends(require_auth)):
    try:
        session = get_session_for_user(user, session_id)
        return {"ok": True, "status": "success", "data": {"session": session}}
    except Exception as error:
        return _handle_error(error)


@router.post("/{session_id}/end")
def end_session_route(session_id: str, payload: EndSessionRequest, user=Depends(require_auth)):
    try:
        session = end_session_for_user(user, session_id, payload)
        return {"ok": True, "status": "success", "data": {"session": session}}
    except Exception as error:
        return _handle_error(error)
