from datetime import date, datetime

from be.app.db.session import get_db_connection
from psycopg2.extras import Json

from be.app.repositories.children_repository import _clone_ai_usage


def list_topics() -> list[dict]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT t.id, t.name, t.slug, COUNT(vi.id) AS vocabulary_count
                FROM topics t
                LEFT JOIN vocabulary_items vi ON vi.topic_id = t.id
                GROUP BY t.id, t.name, t.slug
                ORDER BY t.id ASC
                """
            )
            return cursor.fetchall()


def find_topic_by_slug_or_id(topic_id: str) -> dict | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            if topic_id.isdigit():
                cursor.execute(
                    """
                    SELECT t.id, t.name, t.slug, COUNT(vi.id) AS vocabulary_count
                    FROM topics t
                    LEFT JOIN vocabulary_items vi ON vi.topic_id = t.id
                    WHERE t.slug = %s OR t.id = %s
                    GROUP BY t.id, t.name, t.slug
                    LIMIT 1
                    """,
                    (topic_id, int(topic_id)),
                )
            else:
                cursor.execute(
                    """
                    SELECT t.id, t.name, t.slug, COUNT(vi.id) AS vocabulary_count
                    FROM topics t
                    LEFT JOIN vocabulary_items vi ON vi.topic_id = t.id
                    WHERE t.slug = %s
                    GROUP BY t.id, t.name, t.slug
                    LIMIT 1
                    """,
                    (topic_id,),
                )
            return cursor.fetchone()


def list_topic_vocabulary_items(topic_db_id: int) -> list[dict]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, source_id, word, ipa, vietnamese, age_group, example, raw_payload
                FROM vocabulary_items
                WHERE topic_id = %s
                ORDER BY age_group ASC NULLS LAST, word ASC
                """,
                (topic_db_id,),
            )
            items = cursor.fetchall()
            for item in items:
                cursor.execute(
                    """
                    SELECT id, question_order, question_en, question_vi
                    FROM vocabulary_questions
                    WHERE vocabulary_item_id = %s
                    ORDER BY question_order ASC
                    LIMIT 2
                    """,
                    (item["id"],),
                )
                item["vocabulary_questions"] = cursor.fetchall()

                cursor.execute(
                    """
                    SELECT id, asset_type, asset_order, asset_url
                    FROM vocabulary_assets
                    WHERE vocabulary_item_id = %s
                    ORDER BY asset_order ASC
                    LIMIT 2
                    """,
                    (item["id"],),
                )
                item["vocabulary_assets"] = cursor.fetchall()

            return items


def count_completed_lessons(child_id: str, topic_db_id: int) -> int:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*) AS total
                FROM lesson_progress
                WHERE child_id = %s AND topic_id = %s AND status = 'completed'
                """,
                (child_id, topic_db_id),
            )
            row = cursor.fetchone()
            return int(row["total"])


def list_completed_topic_progress(topic_ids: list[int], child_id: str) -> dict[str, int]:
    if not topic_ids:
        return {}

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT topic_id, COUNT(*) AS total
                FROM lesson_progress
                WHERE child_id = %s
                  AND status = 'completed'
                  AND topic_id = ANY(%s)
                GROUP BY topic_id
                """,
                (child_id, topic_ids),
            )
            return {str(row["topic_id"]): int(row["total"]) for row in cursor.fetchall() if row["topic_id"] is not None}


def find_child_daily_activity(child_id: str, activity_date: date) -> dict | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT pronunciations_count
                FROM child_daily_activity
                WHERE child_id = %s AND activity_date = %s
                """,
                (child_id, activity_date),
            )
            return cursor.fetchone()


def find_existing_lesson_progress(child_id: str, lesson_key: str) -> dict | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, status
                FROM lesson_progress
                WHERE child_id = %s AND lesson_key = %s
                """,
                (child_id, lesson_key),
            )
            return cursor.fetchone()


def complete_topic_lesson(
    *,
    child_id: str,
    topic_db_id: int,
    lesson_key: str,
    mouth_count: int,
    score: int,
    earned_xp: int,
    activity_date: date,
    current_streak_days: int,
    longest_streak_days: int,
) -> bool:
    now = datetime.utcnow()
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT ai_usage FROM children WHERE id = %s FOR UPDATE",
                (child_id,),
            )
            child_row = cursor.fetchone()
            if child_row is None:
                return False

            cursor.execute(
                """
                SELECT status
                FROM lesson_progress
                WHERE child_id = %s AND lesson_key = %s
                FOR UPDATE
                """,
                (child_id, lesson_key),
            )
            existing_progress = cursor.fetchone()
            if existing_progress is not None and existing_progress["status"] == "completed":
                return False

            current_usage = _clone_ai_usage(child_row.get("ai_usage") if child_row else None)
            next_usage = {
                **current_usage,
                "experiencePoints": current_usage["experiencePoints"] + earned_xp,
                "mouthCountTotal": current_usage["mouthCountTotal"] + mouth_count,
                "lastSessionMouthCount": mouth_count,
                "lastSessionEarnedXp": earned_xp,
            }

            cursor.execute(
                """
                INSERT INTO lesson_progress (
                    child_id, topic_id, lesson_key, lesson_title, status,
                    pronunciation_attempts, score, completed_at, last_practiced_at, metadata
                )
                VALUES (%s, %s, %s, %s, 'completed', %s, %s, %s, %s, %s)
                ON CONFLICT (child_id, lesson_key)
                DO UPDATE SET
                    status = 'completed',
                    topic_id = EXCLUDED.topic_id,
                    pronunciation_attempts = lesson_progress.pronunciation_attempts + EXCLUDED.pronunciation_attempts,
                    score = EXCLUDED.score,
                    completed_at = EXCLUDED.completed_at,
                    last_practiced_at = EXCLUDED.last_practiced_at,
                    updated_at = NOW(),
                    metadata = EXCLUDED.metadata
                """,
                (
                    child_id,
                    topic_db_id,
                    lesson_key,
                    lesson_key,
                    mouth_count,
                    score,
                    now,
                    now,
                    Json({"mouthCount": mouth_count, "completedBy": "kidbot"}),
                ),
            )

            cursor.execute(
                """
                UPDATE children
                SET total_pronunciations = total_pronunciations + %s,
                    total_completed_lessons = total_completed_lessons + %s,
                    ai_usage = %s,
                    current_streak_days = %s,
                    longest_streak_days = %s,
                    last_practice_date = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    mouth_count,
                    1,
                    Json(next_usage),
                    current_streak_days,
                    longest_streak_days,
                    activity_date,
                    child_id,
                ),
            )

            cursor.execute(
                """
                INSERT INTO child_daily_activity (
                    child_id, activity_date, sessions_count, pronunciations_count, lessons_completed_count
                )
                VALUES (%s, %s, 1, %s, %s)
                ON CONFLICT (child_id, activity_date)
                DO UPDATE SET
                    sessions_count = child_daily_activity.sessions_count + 1,
                    pronunciations_count = child_daily_activity.pronunciations_count + EXCLUDED.pronunciations_count,
                    lessons_completed_count = child_daily_activity.lessons_completed_count + EXCLUDED.lessons_completed_count,
                    updated_at = NOW()
                """,
                (child_id, activity_date, mouth_count, 1),
            )
            return True
