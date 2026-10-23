import os

from fastapi import FastAPI
from fastapi import HTTPException as FastAPIHTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from contextlib import asynccontextmanager

from be.app.api.routes.active_child import router as active_child_router
from be.app.api.routes.auth import router as auth_router
from be.app.api.routes.children import router as children_router
from be.app.api.routes.child_auth import router as child_auth_router
from be.app.api.routes.health import router as health_router
from be.app.api.routes.recordings import router as recordings_router
from be.app.api.routes.roleplay import router as roleplay_router
from be.app.api.routes.sessions import router as sessions_router
from be.app.api.routes.settings import router as settings_router
from be.app.api.routes.topics import router as topics_router
from be.app.api.routes.webauthn import router as webauthn_router
from be.app.core.config import settings
from be.app.services.auth_service import AuthError

ENABLE_BACKEND_AI = os.getenv("ENABLE_BACKEND_AI", "").strip().lower() in {"1", "true", "yes", "on"}

ai_app = None
ai_lifespan = None

if ENABLE_BACKEND_AI:
    from be.ai_service.app import app as ai_app
    from be.ai_service.app import lifespan as ai_lifespan


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run the post-initial-schema DDL once here instead of on every query. These ALTER/CREATE
    # statements are idempotent (IF NOT EXISTS); running them per-request took catalog locks on
    # the hot path (see notes.md 3.B.4). Best-effort: a failure must not block startup, since the
    # columns usually already exist and the repositories tolerate their absence gracefully.
    import logging

    _startup_logger = logging.getLogger(__name__)
    try:
        from be.app.repositories.auth_repository import ensure_auth_schema
        from be.app.repositories.children_repository import ensure_children_schema

        ensure_auth_schema()
        ensure_children_schema()
    except Exception as error:  # pragma: no cover - startup best effort
        _startup_logger.warning("Startup schema ensure skipped: %s", error)

    # Warm the IPA scoring engines (Allosaurus model + espeak-ng) off the main thread so
    # the first free-talk request doesn't eat the ~5-6s cold start. Runs in the background;
    # the server accepts traffic immediately and scoring stays lazily-loadable if this races.
    import threading

    from be.app.services.ipa_scoring_service import warmup as _ipa_warmup

    threading.Thread(target=_ipa_warmup, name="ipa-warmup", daemon=True).start()

    if ai_lifespan and ai_app:
        async with ai_lifespan(ai_app):
            yield
        return

    yield


app = FastAPI(
    title="Speak Joy Backend",
    version="1.0.0",
    author="Minh Hoang",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(children_router, prefix="/api/children", tags=["children"])
app.include_router(child_auth_router, prefix="/api/child-auth", tags=["child-auth"])
app.include_router(sessions_router, prefix="/api/sessions", tags=["sessions"])
app.include_router(settings_router, prefix="/api", tags=["settings"])
app.include_router(topics_router, prefix="/api/topics", tags=["topics"])
app.include_router(recordings_router, prefix="/api/recordings", tags=["recordings"])
app.include_router(roleplay_router, prefix="/api/roleplay", tags=["roleplay"])
app.include_router(webauthn_router, prefix="/api", tags=["webauthn"])
app.include_router(active_child_router, prefix="/api", tags=["active-child"])

if ai_app:
    app.mount("/api/ai", ai_app)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_: FastAPI, error: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={
            "ok": False,
            "status": "error",
            "message": "Validation failed",
            "issues": error.errors(),
        },
    )


@app.exception_handler(FastAPIHTTPException)
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_: FastAPI, error: StarletteHTTPException):
    detail = getattr(error, "detail", "Request failed")
    if isinstance(detail, dict):
        payload = detail
    else:
        payload = {
            "ok": False,
            "status": "error",
            "message": str(detail),
        }
    return JSONResponse(status_code=getattr(error, "status_code", 500), content=payload)


@app.exception_handler(AuthError)
async def auth_exception_handler(_: FastAPI, error: AuthError):
    return JSONResponse(
        status_code=error.status_code,
        content={
            "ok": False,
            "status": "error",
            "message": error.message,
        },
    )
