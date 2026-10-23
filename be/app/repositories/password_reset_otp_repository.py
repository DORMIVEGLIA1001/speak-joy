from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from be.app.db.session import get_db_connection


@dataclass
class PasswordResetOtpEntity:
    id: str
    user_id: str
    email: str
    otp_hash: str
    expires_at: datetime
    attempt_count: int
    max_attempts: int
    resend_count: int
    max_resends: int
    last_sent_at: datetime
    verified_at: datetime | None
    consumed_at: datetime | None
    grant_token_hash: str | None
    grant_expires_at: datetime | None
    created_at: datetime


def _ensure_password_reset_otps_table(cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_otps (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL,
            otp_hash VARCHAR(64) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 5,
            resend_count INTEGER NOT NULL DEFAULT 0,
            max_resends INTEGER NOT NULL DEFAULT 3,
            last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            verified_at TIMESTAMPTZ,
            consumed_at TIMESTAMPTZ,
            grant_token_hash VARCHAR(64),
            grant_expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cursor.execute(
        """
        ALTER TABLE password_reset_otps
            ADD COLUMN IF NOT EXISTS resend_count INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS max_resends INTEGER NOT NULL DEFAULT 3,
            ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email_created
            ON password_reset_otps(email, created_at DESC)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user_created
            ON password_reset_otps(user_id, created_at DESC)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_password_reset_otps_grant_hash
            ON password_reset_otps(grant_token_hash)
        """
    )


def _row_to_entity(row) -> PasswordResetOtpEntity:
    return PasswordResetOtpEntity(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        email=str(row["email"]),
        otp_hash=str(row["otp_hash"]),
        expires_at=row["expires_at"],
        attempt_count=int(row["attempt_count"]),
        max_attempts=int(row["max_attempts"]),
        resend_count=int(row["resend_count"]),
        max_resends=int(row["max_resends"]),
        last_sent_at=row["last_sent_at"],
        verified_at=row["verified_at"],
        consumed_at=row["consumed_at"],
        grant_token_hash=row["grant_token_hash"],
        grant_expires_at=row["grant_expires_at"],
        created_at=row["created_at"],
    )


def create_password_reset_otp(*, user_id: str, email: str, otp_hash: str, expires_at: datetime, max_attempts: int, max_resends: int, resend_count: int = 0) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_password_reset_otps_table(cursor)
            cursor.execute(
                """
                UPDATE password_reset_otps
                SET consumed_at = NOW()
                WHERE user_id = %s AND consumed_at IS NULL
                """,
                (user_id,),
            )
            cursor.execute(
                """
                INSERT INTO password_reset_otps (user_id, email, otp_hash, expires_at, max_attempts, max_resends, resend_count, last_sent_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                """,
                (user_id, email, otp_hash, expires_at, max_attempts, max_resends, resend_count),
            )


def find_latest_active_password_reset_otp(email: str) -> PasswordResetOtpEntity | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_password_reset_otps_table(cursor)
            cursor.execute(
                """
                SELECT *
                FROM password_reset_otps
                WHERE email = %s
                  AND verified_at IS NULL
                  AND consumed_at IS NULL
                  AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (email,),
            )
            row = cursor.fetchone()
            return _row_to_entity(row) if row else None


def increment_password_reset_otp_attempt(otp_id: str) -> int:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_password_reset_otps_table(cursor)
            cursor.execute(
                """
                UPDATE password_reset_otps
                SET attempt_count = attempt_count + 1
                WHERE id = %s
                RETURNING attempt_count
                """,
                (otp_id,),
            )
            row = cursor.fetchone()
            return int(row["attempt_count"]) if row else 0


def count_recent_password_reset_otp_requests(email: str, *, within_minutes: int) -> int:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_password_reset_otps_table(cursor)
            cursor.execute(
                """
                SELECT COUNT(*) AS total
                FROM password_reset_otps
                WHERE email = %s
                  AND created_at > NOW() - (%s * INTERVAL '1 minute')
                """,
                (email, within_minutes),
            )
            row = cursor.fetchone()
            return int(row["total"]) if row else 0


def mark_password_reset_otp_verified(*, otp_id: str, grant_token_hash: str, grant_expires_at: datetime) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_password_reset_otps_table(cursor)
            cursor.execute(
                """
                UPDATE password_reset_otps
                SET verified_at = NOW(),
                    grant_token_hash = %s,
                    grant_expires_at = %s
                WHERE id = %s
                """,
                (grant_token_hash, grant_expires_at, otp_id),
            )


def consume_password_reset_grant(grant_token_hash: str) -> tuple[str, str] | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_password_reset_otps_table(cursor)
            cursor.execute(
                """
                UPDATE password_reset_otps
                SET consumed_at = NOW()
                WHERE grant_token_hash = %s
                  AND verified_at IS NOT NULL
                  AND consumed_at IS NULL
                  AND grant_expires_at IS NOT NULL
                  AND grant_expires_at > NOW()
                RETURNING user_id, email
                """,
                (grant_token_hash,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return str(row["user_id"]), str(row["email"])


def invalidate_all_password_reset_otps_for_user(user_id: str) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_password_reset_otps_table(cursor)
            cursor.execute(
                """
                UPDATE password_reset_otps
                SET consumed_at = NOW()
                WHERE user_id = %s AND consumed_at IS NULL
                """,
                (user_id,),
            )
