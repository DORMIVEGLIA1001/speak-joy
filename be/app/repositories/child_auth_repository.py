from be.app.db.session import get_db_connection


def upsert_child_credential(child_id: str, username: str, password_hash: str) -> dict:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO child_credentials (child_id, username, password_hash)
                VALUES (%s, %s, %s)
                ON CONFLICT (child_id) DO UPDATE
                SET username = EXCLUDED.username,
                    password_hash = EXCLUDED.password_hash,
                    is_active = TRUE,
                    updated_at = NOW()
                RETURNING child_id, username, is_active, last_login_at
                """,
                (child_id, username.strip().lower(), password_hash),
            )
            return cursor.fetchone()


def find_child_credential_for_parent(parent_id: str, username: str) -> dict | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT cc.child_id, cc.username, cc.password_hash, cc.is_active,
                       c.name, c.parent_user_id
                FROM child_credentials cc
                JOIN children c ON c.id = cc.child_id
                WHERE c.parent_user_id = %s AND LOWER(cc.username) = LOWER(%s)
                """,
                (parent_id, username.strip()),
            )
            return cursor.fetchone()


def find_child_credential_by_child_id(child_id: str) -> dict | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT child_id, username, is_active, last_login_at FROM child_credentials WHERE child_id = %s",
                (child_id,),
            )
            return cursor.fetchone()


def mark_child_login(child_id: str) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE child_credentials SET last_login_at = NOW() WHERE child_id = %s", (child_id,))
