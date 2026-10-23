from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from be.app.api.deps import optional_auth, require_auth
from be.app.schemas.topics import CompleteTopicLessonRequest
from be.app.services.topics_service import (
    TopicsError,
    complete_topic_lesson_service,
    get_topic_detail_service,
    list_topics_service,
)

router = APIRouter()


def _handle_error(error: Exception) -> JSONResponse:
    if isinstance(error, TopicsError):
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "status": "error", "message": error.message},
        )
    return JSONResponse(
        status_code=500,
        content={"ok": False, "status": "error", "message": "Internal server error"},
    )


@router.get("")
def list_topics_route(childId: str | None = Query(default=None), user=Depends(optional_auth)):
    try:
        topics = list_topics_service(childId, user)
        return {"ok": True, "status": "success", "data": {"topics": topics}}
    except Exception as error:
        return _handle_error(error)


@router.get("/{topic_id}")
def get_topic_detail_route(topic_id: str):
    try:
        topic = get_topic_detail_service(topic_id)
        return {"ok": True, "status": "success", "data": {"topic": topic}}
    except Exception as error:
        return _handle_error(error)


@router.post("/{topic_id}/complete")
def complete_topic_route(topic_id: str, payload: CompleteTopicLessonRequest, user=Depends(require_auth)):
    try:
        data = complete_topic_lesson_service(
            user=user,
            topic_id=topic_id,
            child_id=payload.childId,
            lesson_key=payload.lessonKey,
            mouth_count_raw=payload.mouthCount,
            score_raw=payload.score,
        )
        return {"ok": True, "status": "success", "data": data}
    except Exception as error:
        return _handle_error(error)
