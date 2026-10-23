"""
API routes for call recordings — upload to Supabase Storage.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

try:
    from supabase import Client, create_client
except Exception:  # pragma: no cover - optional local dependency
    Client = Any  # type: ignore[assignment]
    create_client = None

from be.app.api.deps import require_auth
from be.app.repositories.sessions_repository import (
    get_sessions_with_recordings,
    update_session_recording_url,
)
from be.app.schemas.auth import PublicUser
from be.app.services.children_service import ChildrenError, _ensure_child_access

router = APIRouter()


def _verify_child_owner(user: PublicUser, child_id: str) -> None:
    """Ensure the authenticated caller owns this child, else raise HTTP 403/404.

    Recordings are a child's private call audio: without this check any caller could
    upload into, overwrite, or read back any child's recordings by guessing child_id.
    """
    try:
        _ensure_child_access(user, child_id)
    except ChildrenError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://xdzjytxsqalgiuyckncn.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
STORAGE_BUCKET = os.getenv("RECORDINGS_BUCKET", "recordings")
MAX_RECORDINGS_PER_CHILD = 10
MAX_FILE_SIZE_MB = 25


def _get_supabase() -> Client:
    if create_client is None:
        raise HTTPException(
            status_code=503,
            detail="supabase package is not installed. Recording storage is unavailable in this environment.",
        )
    if not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_SERVICE_KEY not configured. Cannot upload recordings.",
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


@router.post("/upload")
async def upload_recording(
    audio: UploadFile = File(...),
    child_id: str = Form(...),
    duration_seconds: int = Form(0),
    session_id: str = Form(""),
    user: PublicUser = Depends(require_auth),
):
    """
    Upload a call recording to Supabase Storage.

    - Stores in bucket: recordings/{child_id}/{timestamp}_{session_id}.webm
    - Keeps only the 10 most recent recordings per child
    - Returns the public URL of the uploaded file
    """
    if not child_id.strip():
        raise HTTPException(status_code=400, detail="child_id is required")

    _verify_child_owner(user, child_id.strip())

    # Read file
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file")
    
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({file_size_mb:.1f}MB). Max is {MAX_FILE_SIZE_MB}MB.",
        )

    supabase = _get_supabase()

    # Generate file path
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    file_id = session_id.strip() or str(uuid.uuid4())[:8]
    file_path = f"{child_id}/{timestamp}_{file_id}.webm"

    # Upload to Supabase Storage
    try:
        result = supabase.storage.from_(STORAGE_BUCKET).upload(
            path=file_path,
            file=content,
            file_options={
                "content-type": audio.content_type or "audio/webm",
                "upsert": "true",
            },
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload to storage: {error}",
        )

    # Get public URL
    public_url = supabase.storage.from_(STORAGE_BUCKET).get_public_url(file_path)

    # Save recording_url to session in DB (if session_id provided)
    if session_id.strip():
        try:
            update_session_recording_url(
                session_id=session_id.strip(),
                recording_url=public_url,
            )
        except Exception as db_error:
            # Don't fail upload if DB update fails
            print(f"[Recordings] DB update warning: {db_error}")

    # Cleanup old recordings (keep only MAX_RECORDINGS_PER_CHILD)
    try:
        await _cleanup_old_recordings(supabase, child_id)
    except Exception as error:
        # Don't fail the upload if cleanup fails
        print(f"[Recordings] Cleanup warning: {error}")

    return {
        "ok": True,
        "recording_url": public_url,
        "file_path": file_path,
        "duration_seconds": duration_seconds,
        "size_bytes": len(content),
    }


@router.get("/{child_id}/history")
async def get_call_history(child_id: str, user: PublicUser = Depends(require_auth)):
    """
    Get the 10 most recent call recordings for a child.
    First tries DB (sessions with recording_url), falls back to Supabase Storage listing.
    """
    if not child_id.strip():
        raise HTTPException(status_code=400, detail="child_id is required")

    _verify_child_owner(user, child_id.strip())

    # Try DB first (has more metadata like duration, timestamps)
    try:
        db_sessions = get_sessions_with_recordings(child_id, limit=MAX_RECORDINGS_PER_CHILD)
        if db_sessions:
            recordings = []
            for session in db_sessions:
                recordings.append({
                    "id": session.get("id", ""),
                    "name": f"Cuộc gọi {session.get('started_at', '')}",
                    "url": session.get("recording_url", ""),
                    "created_at": str(session.get("started_at", "")),
                    "ended_at": str(session.get("ended_at", "")),
                    "turn_count": session.get("turn_count", 0),
                    "size": 0,
                })
            return {"recordings": recordings}
    except Exception as db_error:
        print(f"[Recordings] DB query fallback: {db_error}")

    # Fallback: list from Supabase Storage directly
    supabase = _get_supabase()

    try:
        files = supabase.storage.from_(STORAGE_BUCKET).list(
            path=child_id,
            options={"limit": 10, "sortBy": {"column": "created_at", "order": "desc"}},
        )

        recordings = []
        for file_info in files[:MAX_RECORDINGS_PER_CHILD]:
            file_path = f"{child_id}/{file_info['name']}"
            public_url = supabase.storage.from_(STORAGE_BUCKET).get_public_url(file_path)
            
            recordings.append({
                "id": file_info.get("id", file_info["name"]),
                "name": file_info["name"],
                "url": public_url,
                "created_at": file_info.get("created_at", ""),
                "size": file_info.get("metadata", {}).get("size", 0),
            })

        return {"recordings": recordings}

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list recordings: {error}",
        )


async def _cleanup_old_recordings(supabase: Client, child_id: str) -> None:
    """Remove recordings beyond the MAX limit for a child (both Storage and DB)."""
    try:
        files = supabase.storage.from_(STORAGE_BUCKET).list(
            path=child_id,
            options={"limit": 50, "sortBy": {"column": "created_at", "order": "desc"}},
        )

        if len(files) > MAX_RECORDINGS_PER_CHILD:
            files_to_delete = files[MAX_RECORDINGS_PER_CHILD:]
            paths_to_delete = [f"{child_id}/{f['name']}" for f in files_to_delete]
            supabase.storage.from_(STORAGE_BUCKET).remove(paths_to_delete)
            print(f"[Recordings] Cleaned up {len(paths_to_delete)} old recordings for {child_id}")

            # Also clear recording_url in DB for old sessions
            from be.app.db.session import get_db_connection
            try:
                with get_db_connection() as connection:
                    with connection.cursor() as cursor:
                        # Get sessions that have recording_url but are beyond the limit
                        cursor.execute(
                            """
                            UPDATE learning_sessions
                            SET recording_url = NULL
                            WHERE child_id = %s
                              AND recording_url IS NOT NULL
                              AND id NOT IN (
                                SELECT id FROM learning_sessions
                                WHERE child_id = %s AND recording_url IS NOT NULL
                                ORDER BY started_at DESC
                                LIMIT %s
                              )
                            """,
                            (child_id, child_id, MAX_RECORDINGS_PER_CHILD),
                        )
            except Exception as db_error:
                print(f"[Recordings] DB cleanup warning: {db_error}")

    except Exception as error:
        print(f"[Recordings] Cleanup error: {error}")
