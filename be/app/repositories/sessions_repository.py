import json
from collections import defaultdict
from datetime import date, datetime

from psycopg2.extras import Json

from be.app.repositories.children_repository import _clone_ai_usage
from be.app.db.session import get_db_connection


def list_sessions_by_user(user_id: str) -> list[dict]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, user_id, child_id, topic_id, status, started_at, ended_at,
                       turn_count, overall_score, summary, conversation_transcript, recording_url
                FROM learning_sessions
                WHERE user_id = %s
                ORDER BY started_at DESC
                LIMIT 50
                """,
                (user_id,),
            )
            return cursor.fetchall()


def list_sessions_by_child(user_id: str, child_id: str, limit: int = 5) -> list[dict]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, user_id, child_id, topic_id, status, started_at, ended_at,
                       turn_count, overall_score, summary, conversation_transcript, recording_url
                FROM learning_sessions
                WHERE user_id = %s AND child_id = %s
                  AND status = 'completed'
                ORDER BY started_at DESC
                LIMIT %s
                """,
                (user_id, child_id, limit),
            )
            return cursor.fetchall()


def get_completed_session_stats_by_child_ids(child_ids: list[str]) -> dict[str, dict]:
    if not child_ids:
        return {}

    stats: dict[str, dict] = {
        child_id: {
            "completedSessions": 0,
            "lastSessionAt": None,
            "activityDates": [],
        }
        for child_id in child_ids
    }

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT child_id,
                       COUNT(*)::int AS completed_sessions,
                       MAX(COALESCE(ended_at, started_at)) AS last_session_at
                FROM learning_sessions
                WHERE child_id = ANY(%s::uuid[])
                  AND status = 'completed'
                GROUP BY child_id
                """,
                (child_ids,),
            )
            for row in cursor.fetchall():
                child_id = str(row["child_id"])
                if child_id in stats:
                    stats[child_id]["completedSessions"] += int(row["completed_sessions"] or 0)
                    stats[child_id]["lastSessionAt"] = row["last_session_at"]

            cursor.execute(
                """
                SELECT child_id,
                       COUNT(*)::int AS completed_lessons,
                       MAX(completed_at) AS last_lesson_at
                FROM lesson_progress
                WHERE child_id = ANY(%s::uuid[])
                  AND status = 'completed'
                GROUP BY child_id
                """,
                (child_ids,),
            )
            for row in cursor.fetchall():
                child_id = str(row["child_id"])
                if child_id in stats:
                    stats[child_id]["completedSessions"] += int(row["completed_lessons"] or 0)
                    last_lesson = row["last_lesson_at"]
                    current_last = stats[child_id]["lastSessionAt"]
                    if last_lesson:
                        if not current_last or last_lesson > current_last:
                            stats[child_id]["lastSessionAt"] = last_lesson

            # Query combined activity dates from speaking, lessons and games
            cursor.execute(
                """
                SELECT child_id, activity_date FROM (
                    SELECT child_id,
                           (COALESCE(ended_at, started_at) AT TIME ZONE 'Asia/Saigon')::date AS activity_date
                    FROM learning_sessions
                    WHERE child_id = ANY(%s::uuid[])
                      AND status = 'completed'
                    
                    UNION
                    
                    SELECT child_id,
                           (completed_at AT TIME ZONE 'Asia/Saigon')::date AS activity_date
                    FROM lesson_progress
                    WHERE child_id = ANY(%s::uuid[])
                      AND status = 'completed'

                    UNION
                    
                    SELECT child_id,
                           record_date AS activity_date
                    FROM child_game_records
                    WHERE child_id = ANY(%s::uuid[])
                ) AS combined
                GROUP BY child_id, activity_date
                ORDER BY child_id ASC, activity_date DESC
                """,
                (child_ids, child_ids, child_ids),
            )
            grouped_dates: dict[str, list[date]] = defaultdict(list)
            for row in cursor.fetchall():
                child_id = str(row["child_id"])
                activity_date = row["activity_date"]
                if child_id in stats and isinstance(activity_date, date):
                    grouped_dates[child_id].append(activity_date)

    for child_id, dates in grouped_dates.items():
        stats[child_id]["activityDates"] = dates

    return stats


def find_session_for_user(session_id: str, user_id: str) -> dict | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, user_id, child_id, topic_id, status, started_at, ended_at,
                       turn_count, overall_score, summary, conversation_transcript, recording_url
                FROM learning_sessions
                WHERE id = %s AND user_id = %s
                """,
                (session_id, user_id),
            )
            return cursor.fetchone()


def create_session(*, user_id: str, child_id: str | None, topic_id: int | None) -> dict:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO learning_sessions (user_id, child_id, topic_id, status)
                VALUES (%s, %s, %s, 'active')
                RETURNING id, user_id, child_id, topic_id, status, started_at, ended_at,
                          turn_count, overall_score, summary, conversation_transcript, recording_url
                """,
                (user_id, child_id, topic_id),
            )
            return cursor.fetchone()


def complete_session(
    *,
    session_id: str,
    overall_score: float | None,
    summary: str | None,
    transcript: list[dict] | None = None,
) -> dict:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE learning_sessions
                SET status = 'completed',
                    ended_at = %s,
                    overall_score = COALESCE(%s, overall_score),
                    summary = COALESCE(%s, summary),
                    conversation_transcript = COALESCE(%s::jsonb, conversation_transcript),
                    updated_at = NOW()
                WHERE id = %s
                RETURNING id, user_id, child_id, topic_id, status, started_at, ended_at,
                          turn_count, overall_score, summary, conversation_transcript, recording_url
                """,
                (
                    datetime.utcnow(),
                    overall_score,
                    summary,
                    json.dumps(transcript) if transcript is not None else None,
                    session_id,
                ),
            )
            return cursor.fetchone()


def delete_session_for_user(session_id: str, user_id: str) -> dict | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM learning_sessions
                WHERE id = %s AND user_id = %s
                RETURNING id, user_id, child_id, topic_id, status, started_at, ended_at,
                          turn_count, overall_score, summary, conversation_transcript, recording_url
                """,
                (session_id, user_id),
            )
            return cursor.fetchone()


def complete_session_with_reward(
    *,
    session_id: str,
    overall_score: float | None,
    summary: str | None,
    transcript: list[dict] | None = None,
    turn_count: int | None = None,
    mouth_count: int = 0,
    earned_xp: int = 0,
) -> dict | None:
    safe_turn_count = None if turn_count is None else max(0, int(turn_count or 0))
    safe_mouth_count = max(0, int(mouth_count or 0))
    safe_earned_xp = max(0, int(earned_xp or 0))

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, user_id, child_id, topic_id, status, started_at, ended_at,
                       turn_count, overall_score, summary, conversation_transcript, recording_url
                FROM learning_sessions
                WHERE id = %s
                FOR UPDATE
                """,
                (session_id,),
            )
            existing_session = cursor.fetchone()
            if existing_session is None:
                return None
            if existing_session["status"] != "active":
                return existing_session

            child_id = existing_session["child_id"] if existing_session is not None else None

            cursor.execute(
                """
                UPDATE learning_sessions
                SET status = 'completed',
                    ended_at = %s,
                    turn_count = %s,
                    overall_score = COALESCE(%s, overall_score),
                    summary = COALESCE(%s, summary),
                    conversation_transcript = COALESCE(%s::jsonb, conversation_transcript),
                    updated_at = NOW()
                WHERE id = %s AND status = 'active'
                RETURNING id, user_id, child_id, topic_id, status, started_at, ended_at,
                          turn_count, overall_score, summary, conversation_transcript, recording_url
                """,
                (
                    datetime.utcnow(),
                    safe_turn_count,
                    overall_score,
                    summary,
                    json.dumps(transcript) if transcript is not None else None,
                    session_id,
                ),
            )
            updated_session = cursor.fetchone()

            if child_id is not None and (safe_mouth_count > 0 or safe_earned_xp > 0):
                cursor.execute(
                    """
                    SELECT ai_usage, current_streak_days, longest_streak_days, last_practice_date
                    FROM children
                    WHERE id = %s
                    FOR UPDATE
                    """,
                    (child_id,),
                )
                row = cursor.fetchone()
                current = _clone_ai_usage(row.get("ai_usage")) if row is not None else _clone_ai_usage(None)
                
                activity_date = date.today()
                last_practice_date = row["last_practice_date"] if row else None
                current_streak_days = max(0, row["current_streak_days"]) if row and row["current_streak_days"] is not None else 0
                longest_streak_days = max(0, row["longest_streak_days"]) if row and row["longest_streak_days"] is not None else 0

                if last_practice_date is None:
                    next_current = 1
                else:
                    day_diff = (activity_date - last_practice_date).days
                    if day_diff == 1:
                        next_current = current_streak_days + 1
                    elif day_diff > 1:
                        next_current = 1
                    else:
                        next_current = current_streak_days

                next_longest = max(longest_streak_days, max(1, next_current))

                next_usage = {
                    **current,
                    "experiencePoints": current["experiencePoints"] + safe_earned_xp,
                    "mouthCountTotal": current["mouthCountTotal"] + safe_mouth_count,
                    "lastSessionMouthCount": safe_mouth_count,
                    "lastSessionEarnedXp": safe_earned_xp,
                }
                cursor.execute(
                    """
                    UPDATE children
                    SET ai_usage = %s,
                        total_pronunciations = total_pronunciations + %s,
                        current_streak_days = %s,
                        longest_streak_days = %s,
                        last_practice_date = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (Json(next_usage), safe_mouth_count, max(1, next_current), next_longest, activity_date, child_id),
                )

            return updated_session


def update_session_recording_url(*, session_id: str, recording_url: str) -> dict | None:
    """Update a session with the recording URL after upload to Supabase Storage."""
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE learning_sessions
                SET recording_url = %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING id, child_id, recording_url
                """,
                (recording_url, session_id),
            )
            return cursor.fetchone()


def get_sessions_with_recordings(child_id: str, limit: int = 3) -> list[dict]:
    """Get the most recent sessions that have recordings for a child."""
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, child_id, status, started_at, ended_at,
                       turn_count, overall_score, recording_url
                FROM learning_sessions
                WHERE child_id = %s AND recording_url IS NOT NULL
                ORDER BY started_at DESC
                LIMIT %s
                """,
                (child_id, limit),
            )
            return cursor.fetchall()
