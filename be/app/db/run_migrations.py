"""Apply one-off SQL migrations exactly once, tracking them in `schema_migrations`.

`migrate.py` (schema.sql) creates the base tables/functions and is safe to run on
every deploy. This runner applies the incremental `migrations/*.sql` files, recording
each applied filename so it is skipped on subsequent deploys. Every migration file is
written to be idempotent, so even the first run against an already-populated database
is safe.
"""

from pathlib import Path

import psycopg2

from be.app.core.config import settings

MIGRATIONS_DIR = Path(__file__).with_name("migrations")

# Applied in this order. schema.sql (run by migrate.py) already creates the base
# tables/functions these depend on, so any dependency-safe order works here.
MIGRATION_FILES = (
    "add_social_auth_columns.sql",
    "add_recording_url.sql",
    "add_conversation_transcript.sql",
    "add_child_profile_fields.sql",
    "add_child_credentials.sql",
    "add_password_reset_tokens.sql",
    "add_password_reset_otps.sql",
    "alter_password_reset_otps_add_resend_controls.sql",
    "add_child_letter_favorites.sql",
    "add_child_ipa_favorites.sql",
    "create_child_game_records.sql",
    "add_blocks_high_score.sql",
    "add_blast_high_score.sql",
    "add_data_words.sql",
    "insert_words.sql",
    "add_4-6_kids.sql",
    "normalize_4_6_kids_level.sql",
    "add_stories.sql",
    "fix_kids_words_encoding.sql",
    "add_roleplay_scenarios.sql",
    "add_unique_child_name.sql",
)


def _ensure_tracking_table(cursor: psycopg2.extensions.cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def _applied_filenames(cursor: psycopg2.extensions.cursor) -> set[str]:
    cursor.execute("SELECT filename FROM schema_migrations")
    return {row[0] for row in cursor.fetchall()}


def run_migrations() -> None:
    connection = psycopg2.connect(settings.db_dsn)
    connection.set_client_encoding('UTF8')
    try:
        with connection.cursor() as cursor:
            _ensure_tracking_table(cursor)
            applied = _applied_filenames(cursor)
        connection.commit()

        for filename in MIGRATION_FILES:
            if filename in applied:
                print(f"skip   {filename} (already applied)")
                continue

            sql = (MIGRATIONS_DIR / filename).read_text(encoding="utf-8-sig")
            with connection.cursor() as cursor:
                cursor.execute(sql)
                cursor.execute(
                    "INSERT INTO schema_migrations (filename) VALUES (%s) "
                    "ON CONFLICT (filename) DO NOTHING",
                    (filename,),
                )
            connection.commit()
            print(f"apply  {filename}")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    print("Migrations are up to date")


if __name__ == "__main__":
    run_migrations()
