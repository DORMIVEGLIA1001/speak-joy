import time

from be.app.db.session import get_db_connection


def get_database_health() -> dict[str, int | str]:
    started_at = time.perf_counter()
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()

    return {
        "status": "ok",
        "latencyMs": round((time.perf_counter() - started_at) * 1000),
    }
