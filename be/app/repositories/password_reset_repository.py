from datetime import datetime

from be.app.db.session import get_db_connection


def create_reset_token(user_id: str, token_hash: str, expires_at: datetime) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = %s AND used_at IS NULL", (user_id,))
            cursor.execute("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, %s)", (user_id, token_hash, expires_at))


def consume_reset_token(token_hash: str) -> str | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE password_reset_tokens
                SET used_at = NOW()
                WHERE token_hash = %s AND used_at IS NULL AND expires_at > NOW()
                RETURNING user_id
                """,
                (token_hash,),
            )
            row = cursor.fetchone()
            return str(row["user_id"]) if row else None


def replace_user_password(user_id: str, password_hash: str) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s AND auth_provider = 'local'", (password_hash, user_id))
