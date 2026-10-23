import logging
import os
from datetime import datetime, timezone, date
from typing import Any
from be.app.db.session import get_db_connection

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse

try:
    from supabase import Client, create_client
except Exception:  # pragma: no cover - optional local dependency
    Client = Any  # type: ignore[assignment]
    create_client = None

from be.app.api.deps import require_auth, require_parent_auth
from be.app.schemas.children import (
    ChildProfileRequest,
    UpdateChildProfileRequest,
    SaveGameRecordsRequest,
    RewardRequest,
)
from be.app.schemas.settings import UsageIncrementRequest
from be.app.services.children_service import (
    ChildrenError,
    add_child_for_user,
    delete_child_for_user,
    get_child_for_user,
    get_child_ai_runtime_config_for_user,
    increment_child_usage_for_user,
    list_ipa_favorites_for_child,
    list_children_for_user,
    list_letter_favorites_for_child,
    list_daily_missions_for_child,
    set_child_avatar_for_user,
    set_ipa_favorite_for_child,
    set_letter_favorite_for_child,
    update_child_for_user,
    get_leaderboard,
    get_game_records_for_child,
    update_game_records_for_child,
    get_game_flashcards_for_child,
    get_game_stories_for_child,
    add_child_reward_service,
)
from be.app.services.sessions_service import SessionsError, list_sessions_for_child

router = APIRouter()
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://xdzjytxsqalgiuyckncn.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
AVATAR_BUCKET = os.getenv("AVATAR_BUCKET", "avatar")
MAX_AVATAR_SIZE_MB = 5
# Maps an accepted content type to the file extension stored in Storage.
_ALLOWED_AVATAR_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
_ALLOWED_AVATAR_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


def _get_supabase() -> Client:
    if create_client is None:
        raise HTTPException(
            status_code=503,
            detail="supabase package is not installed. Avatar storage is unavailable in this environment.",
        )
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_SERVICE_KEY not configured. Cannot upload avatars.",
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def _resolve_avatar_extension(file: UploadFile) -> str:
    """Pick a safe file extension for an avatar from its content type/filename.

    Accepts only jpg/jpeg/png/webp. Raises HTTP 400 with a clear message when
    the format is not supported (Req 6.5).
    """
    content_type = (file.content_type or "").lower().strip()
    if content_type in _ALLOWED_AVATAR_TYPES:
        return _ALLOWED_AVATAR_TYPES[content_type]

    filename = (file.filename or "").lower()
    if "." in filename:
        ext = filename.rsplit(".", 1)[1]
        if ext in _ALLOWED_AVATAR_EXTENSIONS:
            return "jpg" if ext == "jpeg" else ext

    raise HTTPException(
        status_code=400,
        detail="Unsupported image format. Allowed formats: jpg, png, webp.",
    )


def _handle_error(error: Exception) -> JSONResponse:
    if isinstance(error, ChildrenError):
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "status": "error", "message": error.message},
        )
    if isinstance(error, SessionsError):
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "status": "error", "message": error.message},
        )
    logger.exception("Unexpected children API error")
    return JSONResponse(
        status_code=500,
        content={"ok": False, "status": "error", "message": "Internal server error"},
    )


@router.get("")
def list_children_route(user=Depends(require_auth)):
    try:
        children = list_children_for_user(user)
        return {"ok": True, "status": "success", "data": {"children": children}, "children": children}
    except Exception as error:
        return _handle_error(error)


@router.get("/leaderboard")
def get_global_leaderboard_route(limit: int = Query(default=50, ge=1, le=100)):
    try:
        leaderboard = get_leaderboard(limit)
        return {"ok": True, "status": "success", "data": {"leaderboard": leaderboard}, "leaderboard": leaderboard}
    except Exception as error:
        return _handle_error(error)


@router.post("")
def create_child_route(payload: ChildProfileRequest, user=Depends(require_parent_auth)):
    try:
        child = add_child_for_user(user.id, payload)
        return JSONResponse(
            status_code=201,
            content={"ok": True, "status": "success", "message": "Child created", "data": {"child": child}, "child": child},
        )
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}")
def get_child_route(child_id: str, user=Depends(require_auth)):
    try:
        child = get_child_for_user(user, child_id)
        return {"ok": True, "status": "success", "data": {"child": child}, "child": child}
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}/ai-config")
def get_child_ai_config_route(child_id: str, user=Depends(require_auth)):
    try:
        ai_config = get_child_ai_runtime_config_for_user(user, child_id)
        return {"ok": True, "status": "success", "data": {"aiConfig": ai_config}, "aiConfig": ai_config}
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}/missions")
def list_child_missions_route(child_id: str, user=Depends(require_auth)):
    try:
        missions = list_daily_missions_for_child(user, child_id)
        return {"ok": True, "status": "success", "data": {"missions": missions}, "missions": missions}
    except Exception as error:
        return _handle_error(error)


@router.patch("/{child_id}")
def update_child_route(child_id: str, payload: UpdateChildProfileRequest, user=Depends(require_parent_auth)):
    try:
        child = update_child_for_user(user, child_id, payload)
        return {"ok": True, "status": "success", "message": "Child updated", "data": {"child": child}, "child": child}
    except Exception as error:
        return _handle_error(error)


@router.post("/{child_id}/usage/increment")
def increment_child_usage_route(
    child_id: str, payload: UsageIncrementRequest | None = None, user=Depends(require_auth)
):
    try:
        amount = payload.amount if payload is not None else 1
        usage = increment_child_usage_for_user(user, child_id, amount)
        return {"ok": True, "status": "success", "data": {"usage": usage}, "usage": usage}
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}/letter-favorites")
def list_child_letter_favorites_route(child_id: str, user=Depends(require_auth)):
    try:
        letters = list_letter_favorites_for_child(user, child_id)
        return {"ok": True, "status": "success", "data": {"letters": letters}, "letters": letters}
    except Exception as error:
        return _handle_error(error)


@router.put("/{child_id}/letter-favorites/{letter}")
def set_child_letter_favorite_route(
    child_id: str,
    letter: str,
    favorite: bool = Body(default=True, embed=True),
    user=Depends(require_auth),
):
    try:
        letters = set_letter_favorite_for_child(user, child_id, letter, favorite)
        return {"ok": True, "status": "success", "data": {"letters": letters}, "letters": letters}
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}/ipa-favorites")
def list_child_ipa_favorites_route(child_id: str, user=Depends(require_auth)):
    try:
        sounds = list_ipa_favorites_for_child(user, child_id)
        return {"ok": True, "status": "success", "data": {"sounds": sounds}, "sounds": sounds}
    except Exception as error:
        return _handle_error(error)


@router.put("/{child_id}/ipa-favorites")
def set_child_ipa_favorite_route(
    child_id: str,
    sound: str = Body(..., embed=True),
    favorite: bool = Body(default=True, embed=True),
    user=Depends(require_auth),
):
    try:
        sounds = set_ipa_favorite_for_child(user, child_id, sound, favorite)
        return {"ok": True, "status": "success", "data": {"sounds": sounds}, "sounds": sounds}
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}/sessions")
def list_child_sessions_route(
    child_id: str,
    limit: int = Query(default=5, ge=1, le=30),
    user=Depends(require_auth),
):
    try:
        sessions = list_sessions_for_child(user, child_id, limit)
        return {"ok": True, "status": "success", "data": {"sessions": sessions}, "sessions": sessions}
    except Exception as error:
        return _handle_error(error)


@router.post("/{child_id}/avatar")
async def upload_child_avatar_route(
    child_id: str, file: UploadFile = File(...), user=Depends(require_parent_auth)
):
    """Upload an avatar image for a child and persist its public URL.

    Validates ownership before any upload, restricts to jpg/png/webp at most
    5MB, stores the file at ``{child_id}/{timestamp}.{ext}`` in the ``avatar``
    bucket (env ``AVATAR_BUCKET``), and saves the public URL into
    ``children.avatar_url`` (Req 6.4/6.5). Storage/config failures return clear
    error responses without affecting other operations.
    """
    try:
        # Validate ownership BEFORE doing any upload work.
        get_child_for_user(user, child_id)

        extension = _resolve_avatar_extension(file)

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty image file")

        file_size_mb = len(content) / (1024 * 1024)
        if file_size_mb > MAX_AVATAR_SIZE_MB:
            raise HTTPException(
                status_code=400,
                detail=f"File too large ({file_size_mb:.1f}MB). Max is {MAX_AVATAR_SIZE_MB}MB.",
            )

        supabase = _get_supabase()

        # Ensure the bucket exists
        try:
            buckets = supabase.storage.list_buckets()
            bucket_names = [b.name for b in buckets]
            if AVATAR_BUCKET not in bucket_names:
                supabase.storage.create_bucket(AVATAR_BUCKET, options={"public": True})
        except Exception as bucket_err:
            logger.warning(f"Could not verify or create bucket {AVATAR_BUCKET}: {bucket_err}")

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        file_path = f"{child_id}/{timestamp}.{extension}"

        try:
            supabase.storage.from_(AVATAR_BUCKET).upload(
                path=file_path,
                file=content,
                file_options={
                    "content-type": file.content_type or f"image/{extension}",
                    "upsert": "true",
                },
            )
        except Exception as storage_error:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload avatar to storage: {storage_error}",
            )

        public_url = supabase.storage.from_(AVATAR_BUCKET).get_public_url(file_path)

        set_child_avatar_for_user(user, child_id, public_url)

        return {
            "ok": True,
            "status": "success",
            "data": {"avatarUrl": public_url},
            "avatarUrl": public_url,
        }
    except HTTPException as http_error:
        return JSONResponse(
            status_code=http_error.status_code,
            content={"ok": False, "status": "error", "message": str(http_error.detail)},
        )
    except Exception as error:
        return _handle_error(error)


@router.delete("/{child_id}")
def delete_child_route(child_id: str, user=Depends(require_parent_auth)):
    try:
        child = delete_child_for_user(user, child_id)
        return {"ok": True, "status": "success", "message": "Child deleted", "data": {"child": child}, "child": child}
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}/game-records")
def get_child_game_records_route(child_id: str, user=Depends(require_auth)):
    try:
        records = get_game_records_for_child(user, child_id)
        return {"ok": True, "status": "success", "data": records}
    except Exception as error:
        return _handle_error(error)


@router.post("/{child_id}/game-records")
def update_child_game_records_route(
    child_id: str,
    payload: SaveGameRecordsRequest,
    user=Depends(require_auth),
):
    try:
        records = update_game_records_for_child(
            user,
            child_id,
            tf_streak=payload.trueFalseHighScore,
            word_chain_score=payload.wordChainHighScore,
            flashcard_match_time=payload.flashcardMatchBestTime,
            stories_completed=payload.storiesCompletedCount,
            blocks_score=payload.blocksHighScore,
            blast_score=payload.blastHighScore,
        )
        return {"ok": True, "status": "success", "data": records}
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}/game-flashcards")
def get_child_game_flashcards_route(child_id: str, user=Depends(require_auth)):
    try:
        flashcards = get_game_flashcards_for_child(user, child_id)
        return {"ok": True, "status": "success", "data": flashcards}
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}/game-stories")
def get_child_game_stories_route(child_id: str, user=Depends(require_auth)):
    try:
        stories = get_game_stories_for_child(user, child_id)
        return {"ok": True, "status": "success", "data": stories}
    except Exception as error:
        return _handle_error(error)

@router.post("/{child_id}/reward")
def reward_for_child(child_id: str, payload: RewardRequest, user=Depends(require_auth)):
    try:
        child = add_child_reward_service(user, child_id, payload.xp, payload.mouthCount)
        return {"ok": True, "status": "success", "data": {"child": child}, "child": child}
    except Exception as error:
        return _handle_error(error)


@router.get("/{child_id}/session-stats")
def get_child_session_stats_route(child_id: str, user=Depends(require_auth)):
    try:
        get_child_for_user(user, child_id)
        
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT 
                        (started_at AT TIME ZONE 'Asia/Saigon')::date AS local_date,
                        COUNT(*)::int AS session_count,
                        SUM(turn_count)::int AS total_turns,
                        AVG(overall_score)::float AS avg_score
                    FROM learning_sessions
                    WHERE child_id = %s AND status = 'completed'
                    GROUP BY local_date
                    ORDER BY local_date DESC
                    LIMIT 30
                    """,
                    (child_id,),
                )
                rows = cursor.fetchall()
                
                # Fetch overall average score of all completed sessions directly to avoid mathematically incorrect averaging of averages
                cursor.execute(
                    """
                    SELECT AVG(overall_score)::float AS overall_avg
                    FROM learning_sessions
                    WHERE child_id = %s AND status = 'completed' AND overall_score IS NOT NULL
                    """,
                    (child_id,),
                )
                overall_row = cursor.fetchone()
                overall_avg = overall_row["overall_avg"] if overall_row and overall_row["overall_avg"] is not None else 0.0
                
        daily_stats = []
        for r in rows:
            daily_stats.append({
                "date": r["local_date"].isoformat() if isinstance(r["local_date"], date) else str(r["local_date"]),
                "sessions": r["session_count"] or 0,
                "turns": r["total_turns"] or 0,
                "score": r["avg_score"] or 0.0
            })
            
        total_sessions = sum(s["sessions"] for s in daily_stats)
        total_turns = sum(s["turns"] for s in daily_stats)

        return {
            "ok": True,
            "status": "success",
            "data": {
                "totalSessions": total_sessions,
                "totalTurns": total_turns,
                "averageScore": overall_avg,
                "dailyStats": daily_stats
            }
        }
    except Exception as error:
        return _handle_error(error)

