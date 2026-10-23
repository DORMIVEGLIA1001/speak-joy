from dataclasses import dataclass
from datetime import datetime

from be.app.db.session import get_db_connection


@dataclass(slots=True)
class WebAuthnCredentialEntity:
    id: str
    user_id: str
    credential_id: bytes
    public_key: bytes
    sign_count: int
    label: str | None
    device_type: str | None
    backed_up: bool
    transports: list[str]
    last_used_at: datetime | None
    created_at: datetime
    updated_at: datetime


def _ensure_webauthn_table(cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS user_webauthn_credentials (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            credential_id BYTEA NOT NULL UNIQUE,
            public_key BYTEA NOT NULL,
            sign_count BIGINT NOT NULL DEFAULT 0,
            label VARCHAR(150),
            device_type VARCHAR(50),
            backed_up BOOLEAN NOT NULL DEFAULT FALSE,
            transports JSONB NOT NULL DEFAULT '[]'::jsonb,
            last_used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_webauthn_credentials_user_id
        ON user_webauthn_credentials(user_id, created_at DESC)
        """
    )


def _map_credential(row: dict | None) -> WebAuthnCredentialEntity | None:
    if row is None:
        return None

    return WebAuthnCredentialEntity(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        credential_id=bytes(row["credential_id"]),
        public_key=bytes(row["public_key"]),
        sign_count=int(row["sign_count"] or 0),
        label=row.get("label"),
        device_type=row.get("device_type"),
        backed_up=bool(row.get("backed_up", False)),
        transports=list(row.get("transports") or []),
        last_used_at=row.get("last_used_at"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_webauthn_credentials_for_user(user_id: str) -> list[WebAuthnCredentialEntity]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_webauthn_table(cursor)
            cursor.execute(
                """
                SELECT id, user_id, credential_id, public_key, sign_count, label,
                       device_type, backed_up, transports, last_used_at, created_at, updated_at
                FROM user_webauthn_credentials
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
            rows = cursor.fetchall() or []
            return [_map_credential(row) for row in rows if row is not None]


def find_webauthn_credential_for_user(user_id: str, credential_id: bytes) -> WebAuthnCredentialEntity | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_webauthn_table(cursor)
            cursor.execute(
                """
                SELECT id, user_id, credential_id, public_key, sign_count, label,
                       device_type, backed_up, transports, last_used_at, created_at, updated_at
                FROM user_webauthn_credentials
                WHERE user_id = %s AND credential_id = %s
                """,
                (user_id, psycopg2_binary(credential_id)),
            )
            return _map_credential(cursor.fetchone())


def create_webauthn_credential(
    *,
    user_id: str,
    credential_id: bytes,
    public_key: bytes,
    sign_count: int,
    label: str | None,
    device_type: str | None,
    backed_up: bool,
    transports: list[str] | None = None,
) -> WebAuthnCredentialEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_webauthn_table(cursor)
            cursor.execute(
                """
                INSERT INTO user_webauthn_credentials (
                    user_id, credential_id, public_key, sign_count, label,
                    device_type, backed_up, transports
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id, user_id, credential_id, public_key, sign_count, label,
                          device_type, backed_up, transports, last_used_at, created_at, updated_at
                """,
                (
                    user_id,
                    psycopg2_binary(credential_id),
                    psycopg2_binary(public_key),
                    sign_count,
                    label.strip() if label else None,
                    device_type,
                    backed_up,
                    json_list(transports or []),
                ),
            )
            return _map_credential(cursor.fetchone())  # type: ignore[return-value]


def update_webauthn_credential_usage(
    *,
    user_id: str,
    credential_id: bytes,
    sign_count: int,
    backed_up: bool,
    device_type: str | None = None,
) -> WebAuthnCredentialEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_webauthn_table(cursor)
            cursor.execute(
                """
                UPDATE user_webauthn_credentials
                SET sign_count = %s,
                    backed_up = %s,
                    device_type = COALESCE(%s, device_type),
                    last_used_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = %s AND credential_id = %s
                RETURNING id, user_id, credential_id, public_key, sign_count, label,
                          device_type, backed_up, transports, last_used_at, created_at, updated_at
                """,
                (
                    sign_count,
                    backed_up,
                    device_type,
                    user_id,
                    psycopg2_binary(credential_id),
                ),
            )
            return _map_credential(cursor.fetchone())  # type: ignore[return-value]


def delete_webauthn_credential(user_id: str, credential_id: bytes) -> bool:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_webauthn_table(cursor)
            cursor.execute(
                """
                DELETE FROM user_webauthn_credentials
                WHERE user_id = %s AND credential_id = %s
                """,
                (user_id, psycopg2_binary(credential_id)),
            )
            return cursor.rowcount > 0


def delete_all_webauthn_credentials_for_user(user_id: str) -> int:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_webauthn_table(cursor)
            cursor.execute(
                """
                DELETE FROM user_webauthn_credentials
                WHERE user_id = %s
                """,
                (user_id,),
            )
            return cursor.rowcount


def json_list(items: list[str]) -> str:
    import json

    return json.dumps(items)


def psycopg2_binary(value: bytes):
    from psycopg2 import Binary

    return Binary(value)
