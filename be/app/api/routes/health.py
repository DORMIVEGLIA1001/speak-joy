from fastapi import APIRouter
from fastapi.responses import JSONResponse

from be.app.db.health import get_database_health

router = APIRouter()


@router.get("/")
def root():
    return {
        "status": "ok",
        "service": "be-python",
        "routes": [
            "/health",
            "/health/db",
            "/auth/register",
            "/auth/login",
            "/auth/me",
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/me",
            "/api/children",
            "/api/children/:childId/missions",
            "/api/topics",
            "/api/sessions",
            "/api/ai/health",
            "/api/ai/practice/audio",
        ],
    }


@router.get("/health")
def health():
    return {
        "status": "ok",
        "service": "be-python",
    }


@router.get("/health/db")
def health_db():
    try:
        database = get_database_health()
        return {
            "status": "ok",
            "database": database,
        }
    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(error),
            },
        )



