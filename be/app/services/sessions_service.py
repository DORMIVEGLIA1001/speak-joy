from decimal import Decimal

from be.app.repositories.children_repository import find_child_by_id
from be.app.repositories.sessions_repository import (
    complete_session_with_reward,
    create_session,
    delete_session_for_user,
    find_session_for_user,
    list_sessions_by_child,
    list_sessions_by_user,
)
from be.app.schemas.auth import PublicUser
from be.app.schemas.sessions import CreateSessionRequest, EndSessionRequest


class SessionsError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def _count_user_turns(transcript: list[dict] | None) -> int:
    if not transcript:
        return 0
    return sum(1 for message in transcript if message.get("role") == "user")


def _has_session_progress(mouth_count: int, earned_xp: int) -> bool:
    return max(0, int(mouth_count or 0)) > 0 or max(0, int(earned_xp or 0)) > 0


def _to_session_dto(session: dict) -> dict:
    overall_score = session.get("overall_score")
    conversation_transcript = session.get("conversation_transcript")
    return {
        "id": session["id"],
        "userId": session["user_id"],
        "childId": session["child_id"],
        "topicId": str(session["topic_id"]) if session["topic_id"] is not None else None,
        "status": session["status"],
        "startedAt": session["started_at"].isoformat(),
        "endedAt": session["ended_at"].isoformat() if session["ended_at"] is not None else None,
        "turnCount": session["turn_count"],
        "overallScore": str(overall_score) if overall_score is not None else None,
        "summary": session["summary"],
        "conversationTranscript": conversation_transcript if isinstance(conversation_transcript, list) else None,
        "recordingUrl": session.get("recording_url"),
    }


def _ensure_child_belongs_to_user(child_id: str, user_id: str) -> None:
    child = find_child_by_id(child_id)
    if child is None or child.parent_user_id != user_id:
        raise SessionsError(403, "You do not have access to this child")


def list_sessions(user: PublicUser) -> list[dict]:
    return [_to_session_dto(session) for session in list_sessions_by_user(user.id)]


def list_sessions_for_child(user: PublicUser, child_id: str, limit: int = 5) -> list[dict]:
    _ensure_child_belongs_to_user(child_id, user.id)
    safe_limit = max(1, min(int(limit or 5), 30))  # allow up to 30 sessions
    return [_to_session_dto(session) for session in list_sessions_by_child(user.id, child_id, safe_limit)]


def create_session_for_user(user: PublicUser, payload: CreateSessionRequest) -> dict:
    if not payload.childId:
        raise SessionsError(400, "A child is required to create a learning session")

    _ensure_child_belongs_to_user(payload.childId, user.id)

    session = create_session(
        user_id=user.id,
        child_id=payload.childId,
        topic_id=payload.topicId,
    )
    return _to_session_dto(session)


def get_session_for_user(user: PublicUser, session_id: str) -> dict:
    session = find_session_for_user(session_id, user.id)
    if session is None:
        raise SessionsError(404, "Session not found")
    return _to_session_dto(session)


def end_session_for_user(user: PublicUser, session_id: str, payload: EndSessionRequest) -> dict:
    session = find_session_for_user(session_id, user.id)
    if session is None:
        raise SessionsError(404, "Session not found")

    # Ending a session is idempotent. A network retry returns the stored result
    # without applying its reward a second time.
    if session["status"] == "completed":
        return _to_session_dto(session)

    transcript = [message.model_dump() for message in payload.transcript] if payload.transcript else None
    trusted_mouth_count = min(_count_user_turns(transcript), 100)
    trusted_earned_xp = trusted_mouth_count * 5
    trusted_overall_score = min(200, trusted_mouth_count * 5)

    if not _has_session_progress(trusted_mouth_count, trusted_earned_xp):
        delete_session_for_user(session_id, user.id)
        discarded_session = dict(session)
        discarded_session["status"] = "discarded"
        discarded_session["ended_at"] = None
        discarded_session["turn_count"] = 0
        discarded_session["overall_score"] = None
        discarded_session["summary"] = payload.summary or session.get("summary")
        discarded_session["conversation_transcript"] = None
        discarded_session["recording_url"] = None
        return _to_session_dto(discarded_session)

    updated = complete_session_with_reward(
        session_id=session_id,
        overall_score=trusted_overall_score,
        summary=payload.summary,
        transcript=transcript,
        turn_count=_count_user_turns(transcript) if transcript is not None else None,
        mouth_count=trusted_mouth_count,
        earned_xp=trusted_earned_xp,
    )
    if updated is None:
        raise SessionsError(409, "Session is no longer active")
    return _to_session_dto(updated)
