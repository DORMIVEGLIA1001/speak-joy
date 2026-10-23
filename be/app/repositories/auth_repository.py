from dataclasses import dataclass
from datetime import datetime

from be.app.db.session import get_db_connection
from be.app.schemas.auth import UserRole


@dataclass(slots=True)
class UserEntity:
    id: str
    email: str
    username: str | None
    password_hash: str | None
    display_name: str
    role: UserRole
    is_active: bool
    auth_provider: str
    provider_user_id: str | None
    avatar_url: str | None
    email_verified: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


def _ensure_social_auth_columns(cursor) -> None:
    cursor.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local',
        ADD COLUMN IF NOT EXISTS provider_user_id TEXT,
        ADD COLUMN IF NOT EXISTS avatar_url TEXT,
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE
        """
    )
    cursor.execute("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")
    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS users_auth_provider_provider_user_id_idx
        ON users (auth_provider, provider_user_id)
        WHERE provider_user_id IS NOT NULL
        """
    )


def ensure_auth_schema() -> None:
    """Run the users-table DDL once at startup instead of on every query.

    Previously each find_user_* call ran the ALTER/CREATE INDEX above, taking catalog
    locks on the hot path. This runs it a single time from the app lifespan; the
    statements are idempotent (IF NOT EXISTS) so re-running across restarts is safe.
    """
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_social_auth_columns(cursor)


def _map_user(row: dict | None) -> UserEntity | None:
    if row is None:
        return None

    return UserEntity(
        id=str(row["id"]),
        email=row["email"],
        username=row["username"],
        password_hash=row["password_hash"],
        display_name=row["display_name"] or "",
        role=row["role"],
        is_active=row["is_active"],
        auth_provider=row.get("auth_provider", "local") or "local",
        provider_user_id=row.get("provider_user_id"),
        avatar_url=row.get("avatar_url"),
        email_verified=bool(row.get("email_verified", False)),
        last_login_at=row["last_login_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def find_user_by_email(email: str) -> UserEntity | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, email, username, password_hash, display_name, role, is_active,
                       auth_provider, provider_user_id, avatar_url, email_verified,
                       last_login_at, created_at, updated_at
                FROM users
                WHERE email = %s
                """,
                (email.strip().lower(),),
            )
            return _map_user(cursor.fetchone())


def find_user_by_username(username: str) -> UserEntity | None:
    normalized = username.strip()
    if not normalized:
        return None

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, email, username, password_hash, display_name, role, is_active,
                       auth_provider, provider_user_id, avatar_url, email_verified,
                       last_login_at, created_at, updated_at
                FROM users
                WHERE username = %s
                """,
                (normalized,),
            )
            return _map_user(cursor.fetchone())


def find_user_by_id(user_id: str) -> UserEntity | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, email, username, password_hash, display_name, role, is_active,
                       auth_provider, provider_user_id, avatar_url, email_verified,
                       last_login_at, created_at, updated_at
                FROM users
                WHERE id = %s
                """,
                (user_id,),
            )
            return _map_user(cursor.fetchone())


def update_local_user_account(user_id: str, *, email: str, display_name: str, password_hash: str | None) -> UserEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users
                SET email = %s,
                    display_name = %s,
                    password_hash = COALESCE(%s, password_hash),
                    updated_at = NOW()
                WHERE id = %s AND auth_provider = 'local'
                RETURNING id, email, username, password_hash, display_name, role, is_active,
                          auth_provider, provider_user_id, avatar_url, email_verified,
                          last_login_at, created_at, updated_at
                """,
                (email.strip().lower(), display_name.strip(), password_hash, user_id),
            )
            row = cursor.fetchone()
            if row is None:
                raise ValueError("Local account not found")
            return _map_user(row)  # type: ignore[return-value]


def find_user_by_provider(auth_provider: str, provider_user_id: str) -> UserEntity | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, email, username, password_hash, display_name, role, is_active,
                       auth_provider, provider_user_id, avatar_url, email_verified,
                       last_login_at, created_at, updated_at
                FROM users
                WHERE auth_provider = %s AND provider_user_id = %s
                """,
                (auth_provider.strip().lower(), provider_user_id.strip()),
            )
            return _map_user(cursor.fetchone())


def create_user(*, email: str, username: str | None, password_hash: str, display_name: str, role: UserRole) -> UserEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (
                    email, username, password_hash, display_name, role, auth_provider, email_verified
                )
                VALUES (%s, %s, %s, %s, %s, 'local', TRUE)
                RETURNING id, email, username, password_hash, display_name, role, is_active,
                          auth_provider, provider_user_id, avatar_url, email_verified,
                          last_login_at, created_at, updated_at
                """,
                (
                    email.strip().lower(),
                    username.strip() if username else None,
                    password_hash,
                    display_name.strip(),
                    role,
                ),
            )
            return _map_user(cursor.fetchone())  # type: ignore[return-value]


def create_social_user(
    *,
    email: str,
    display_name: str,
    role: UserRole,
    auth_provider: str,
    provider_user_id: str,
    avatar_url: str | None,
    email_verified: bool,
) -> UserEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (
                    email, username, password_hash, display_name, role, is_active,
                    auth_provider, provider_user_id, avatar_url, email_verified
                )
                VALUES (%s, NULL, NULL, %s, %s, TRUE, %s, %s, %s, %s)
                RETURNING id, email, username, password_hash, display_name, role, is_active,
                          auth_provider, provider_user_id, avatar_url, email_verified,
                          last_login_at, created_at, updated_at
                """,
                (
                    email.strip().lower(),
                    display_name.strip(),
                    role,
                    auth_provider.strip().lower(),
                    provider_user_id.strip(),
                    avatar_url.strip() if avatar_url else None,
                    email_verified,
                ),
            )
            return _map_user(cursor.fetchone())  # type: ignore[return-value]


def link_user_social_identity(
    *,
    user_id: str,
    auth_provider: str,
    provider_user_id: str,
    avatar_url: str | None,
    email_verified: bool,
) -> UserEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users
                SET auth_provider = %s,
                    provider_user_id = %s,
                    avatar_url = COALESCE(%s, avatar_url),
                    email_verified = email_verified OR %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING id, email, username, password_hash, display_name, role, is_active,
                          auth_provider, provider_user_id, avatar_url, email_verified,
                          last_login_at, created_at, updated_at
                """,
                (
                    auth_provider.strip().lower(),
                    provider_user_id.strip(),
                    avatar_url.strip() if avatar_url else None,
                    email_verified,
                    user_id,
                ),
            )
            return _map_user(cursor.fetchone())  # type: ignore[return-value]


def _ensure_active_child_column(cursor) -> None:
    cursor.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS active_child_id UUID REFERENCES children(id) ON DELETE SET NULL
        """
    )


def get_active_child_id(user_id: str) -> str | None:
    """Return the currently selected Active_Child id for a parent, or ``None``.

    Rows written before the ``active_child_id`` column existed (or where no
    child has been selected) default safely to ``None`` (Requirement 7.6, 10.3).
    """
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_active_child_column(cursor)
            cursor.execute(
                "SELECT active_child_id FROM users WHERE id = %s",
                (user_id,),
            )
            row = cursor.fetchone()
            if row is None:
                return None
            value = row.get("active_child_id")
            return str(value) if value is not None else None


def set_active_child_id(user_id: str, child_id: str | None) -> bool:
    """Set the Active_Child for a parent, validating ownership first.

    - ``child_id=None`` clears the selection and always succeeds.
    - Otherwise the update only applies when ``child_id`` belongs to ``user_id``.

    Returns ``True`` when the state was changed (or cleared), ``False`` when the
    child does not belong to the user so the caller can surface a 403/400 and
    leave state untouched (Requirement 7.2, 7.6).
    """
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_active_child_column(cursor)
            if child_id is None:
                cursor.execute(
                    """
                    UPDATE users
                    SET active_child_id = NULL,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (user_id,),
                )
                return cursor.rowcount > 0
            cursor.execute(
                """
                UPDATE users
                SET active_child_id = %s,
                    updated_at = NOW()
                WHERE id = %s
                  AND EXISTS (
                      SELECT 1 FROM children WHERE id = %s AND parent_user_id = %s
                  )
                """,
                (child_id, user_id, child_id, user_id),
            )
            return cursor.rowcount > 0


def update_last_login_at(user_id: str) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users
                SET last_login_at = NOW(), updated_at = NOW()
                WHERE id = %s
                """,
                (user_id,),
            )


def update_user_account(
    *,
    user_id: str,
    email: str | None = None,
    display_name: str | None = None,
    password_hash: str | None = None,
) -> UserEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users
                SET email = COALESCE(%s, email),
                    display_name = COALESCE(%s, display_name),
                    password_hash = COALESCE(%s, password_hash),
                    updated_at = NOW()
                WHERE id = %s
                RETURNING id, email, username, password_hash, display_name, role, is_active,
                          auth_provider, provider_user_id, avatar_url, email_verified,
                          last_login_at, created_at, updated_at
                """,
                (
                    email.strip().lower() if email else None,
                    display_name.strip() if display_name else None,
                    password_hash,
                    user_id,
                ),
            )
            return _map_user(cursor.fetchone())  # type: ignore[return-value]


def upsert_demo_user(*, email: str, password_hash: str, display_name: str, role: UserRole) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (
                    email, username, password_hash, display_name, role, is_active, auth_provider, email_verified
                )
                VALUES (%s, NULL, %s, %s, %s, TRUE, 'local', TRUE)
                ON CONFLICT (email)
                DO UPDATE SET
                    password_hash = EXCLUDED.password_hash,
                    display_name = EXCLUDED.display_name,
                    role = EXCLUDED.role,
                    is_active = TRUE,
                    auth_provider = 'local',
                    email_verified = TRUE,
                    updated_at = NOW()
                """,
                (email.strip().lower(), password_hash, display_name.strip(), role),
            )
