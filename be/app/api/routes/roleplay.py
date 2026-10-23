from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from be.app.api.deps import optional_auth, require_auth
from be.app.core.config import settings
from be.app.services.roleplay_service import (
    RolePlayError,
    get_scenario_detail_service,
    list_scenarios_service,
    score_free_attempt,
    score_line_attempt,
)

router = APIRouter()

MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB — a few seconds of 16 kHz mono WAV is tiny


def _handle_error(error: Exception) -> JSONResponse:
    if isinstance(error, RolePlayError):
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "status": "error", "message": error.message},
        )
    return JSONResponse(
        status_code=500,
        content={"ok": False, "status": "error", "message": "Internal server error"},
    )


@router.get("/scenarios")
def list_scenarios_route(
    childAge: int | None = Query(default=None),
    user=Depends(optional_auth),
):
    try:
        scenarios = list_scenarios_service(childAge)
        return {"ok": True, "status": "success", "data": {"scenarios": scenarios}}
    except Exception as error:
        return _handle_error(error)


@router.get("/scenarios/{slug}")
def get_scenario_route(slug: str, user=Depends(optional_auth)):
    try:
        scenario = get_scenario_detail_service(slug)
        return {"ok": True, "status": "success", "data": {"scenario": scenario}}
    except Exception as error:
        return _handle_error(error)


@router.post("/score-ipa")
async def score_ipa_route(
    audio: UploadFile = File(...),
    lineId: str = Form(...),
    optionIndex: int | None = Form(default=None),
    optionText: str | None = Form(default=None),
    user=Depends(require_auth),
):
    """Grade a recorded attempt at one answer option.

    Audio must be 16 kHz mono WAV (encoded in-browser) since the offline Allosaurus
    engine reads WAV and the server has no ffmpeg to transcode.
    """
    try:
        audio_bytes = await audio.read()
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise RolePlayError(413, "Audio too large")
        # Allosaurus recognition + the Needleman-Wunsch alignment are CPU-bound and take
        # seconds; run them in the threadpool so a scoring request doesn't block the event
        # loop (and every other request) while it churns. See notes.md 3.B.5.
        result = await run_in_threadpool(
            score_line_attempt,
            line_id_raw=lineId,
            audio_bytes=audio_bytes,
            option_index=optionIndex,
            option_text=optionText,
            lang_id=settings.allosaurus_lang_id,
        )
        return {"ok": True, "status": "success", "data": result}
    except Exception as error:
        return _handle_error(error)


@router.post("/score-freetalk")
async def score_freetalk_route(
    audio: UploadFile = File(...),
    transcript: str = Form(...),
    user=Depends(require_auth),
):
    """Grade a free-talk recording against IPA synthesised from its own transcript.

    Free talk has no pre-stored target sentence, so we phonemize the browser's speech-
    recognition transcript to build the target IPA and grade pronunciation against that.
    Audio must be 16 kHz mono WAV (encoded in-browser) — same constraint as /score-ipa.
    """
    try:
        audio_bytes = await audio.read()
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise RolePlayError(413, "Audio too large")
        result = await run_in_threadpool(
            score_free_attempt,
            transcript=transcript,
            audio_bytes=audio_bytes,
            lang_id=settings.allosaurus_lang_id,
        )
        return {"ok": True, "status": "success", "data": result}
    except Exception as error:
        return _handle_error(error)
