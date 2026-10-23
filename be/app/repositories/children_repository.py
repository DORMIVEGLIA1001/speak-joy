import base64
import logging
import os
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from psycopg2.extras import Json

from be.app.core.config import settings
from be.app.db.session import get_db_connection

logger = logging.getLogger(__name__)
DEFAULT_MONTHLY_TOKEN_LIMIT = 20_000

# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------
# New writes use MASTER_SECRET + scrypt + a per-record salt to derive a
# Fernet key. Older rows remain readable in their legacy formats.
# ---------------------------------------------------------------------------

def _get_fernet() -> Fernet | None:
    key = settings.encryption_key
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except Exception:
        logger.warning(
            "ENCRYPTION_KEY is set but invalid. "
            "Run: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
        return None


_fernet: Fernet | None = _get_fernet()
_master_secret = settings.master_secret

if _master_secret:
    logger.info("MASTER_SECRET is configured. New API keys will use scrypt + per-record salt.")
elif _fernet is not None:
    logger.warning(
        "MASTER_SECRET is not configured. New API keys will fall back to legacy ENCRYPTION_KEY-based Fernet."
    )
else:
    logger.warning(
        "MASTER_SECRET and ENCRYPTION_KEY are both missing. Existing secrets may still be readable, "
        "but new API keys cannot be stored securely until one is configured."
    )

Provider = Literal["siliconflow", "openai", "custom"]
LlmProvider = Literal["gemini", "openai", "claude", "qwen"]


@dataclass(slots=True)
class ChildEntity:
    id: str
    parent_user_id: str
    name: str
    birth_year: int | None
    english_level: str | None
    native_language: str
    notes: str | None
    current_streak_days: int
    longest_streak_days: int
    last_practice_date: date | None
    total_pronunciations: int
    total_completed_lessons: int
    created_at: datetime
    updated_at: datetime
    avatar_url: str | None
    ai_usage: dict


@dataclass(slots=True)
class UserAiConfigEntity:
    id: str
    user_id: str
    provider: Provider
    base_url: str
    model_name: str
    api_key_last4: str | None
    is_active: bool
    llm_provider: LlmProvider
    asr_api_key_last4: str | None
    tts_api_key_last4: str | None
    use_env_asr_tts: bool
    usage_count: int
    usage_limit: int


@dataclass(slots=True)
class UserAiSecretConfigEntity(UserAiConfigEntity):
    api_key: str
    asr_api_key: str
    tts_api_key: str


# Prefixes stored in DB to distinguish encryption formats.
_KDF_FERNET_PREFIX = "kdf-fernet:v1:"
_FERNET_PREFIX = "fernet:"


def _derive_fernet_from_master_secret(master_secret: str, salt: bytes) -> Fernet:
    kdf = Scrypt(
        salt=salt,
        length=32,
        n=2**14,
        r=8,
        p=1,
    )
    derived_key = base64.urlsafe_b64encode(kdf.derive(master_secret.encode("utf-8")))
    return Fernet(derived_key)


def _decode_api_key(value: str | None) -> str:
    """Decrypt an API key from DB storage.

    Supports two formats:
    - ``fernet:<token>`` — Fernet-encrypted (preferred)
    - bare base64 — legacy fallback for rows written before encryption was added
    """
    if not value:
        return ""
    if value.startswith(_KDF_FERNET_PREFIX):
        payload = value[len(_KDF_FERNET_PREFIX):]
        try:
            salt_b64, token = payload.split(":", 1)
        except ValueError:
            logger.error("Failed to decrypt API key: invalid kdf-fernet payload.")
            return ""
        if not _master_secret:
            logger.error("Cannot decrypt API key: MASTER_SECRET is not set.")
            return ""
        try:
            fernet = _derive_fernet_from_master_secret(
                _master_secret,
                base64.urlsafe_b64decode(salt_b64.encode("utf-8")),
            )
            return fernet.decrypt(token.encode()).decode("utf-8")
        except (InvalidToken, ValueError):
            logger.error("Failed to decrypt API key: scrypt-derived token is invalid or MASTER_SECRET changed.")
            return ""
    if value.startswith(_FERNET_PREFIX):
        token = value[len(_FERNET_PREFIX):]
        if _fernet is None:
            logger.error("Cannot decrypt API key: ENCRYPTION_KEY is not set.")
            return ""
        try:
            return _fernet.decrypt(token.encode()).decode("utf-8")
        except InvalidToken:
            logger.error("Failed to decrypt API key — token is invalid or key has changed.")
            return ""
    # Legacy base64 path — transparently readable, will be re-encrypted on next save
    try:
        return base64.b64decode(value).decode("utf-8")
    except Exception:
        return ""


def _encode_api_key(value: str | None) -> str | None:
    """Encrypt an API key for DB storage.

    Uses Fernet when ENCRYPTION_KEY is configured, falls back to base64 otherwise.
    """
    if not value:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if _master_secret:
        salt = os.urandom(16)
        salt_b64 = base64.urlsafe_b64encode(salt).decode("utf-8")
        token = _derive_fernet_from_master_secret(_master_secret, salt).encrypt(trimmed.encode()).decode("utf-8")
        return f"{_KDF_FERNET_PREFIX}{salt_b64}:{token}"
    if _fernet is not None:
        token = _fernet.encrypt(trimmed.encode()).decode("utf-8")
        return f"{_FERNET_PREFIX}{token}"
    raise ValueError("MASTER_SECRET or ENCRYPTION_KEY is required to store API keys securely.")


def _parse_extra_settings(value: dict | None) -> dict:
    if not isinstance(value, dict):
        return {}
    return value


def _normalize_usage_stats(usage_count: int, usage_limit: int) -> tuple[int, int]:
    safe_count = max(0, usage_count)
    safe_limit = max(1, usage_limit)

    # Legacy builds stored "usage" as response count with very small monthly limits
    # such as 100/500. Token-based usage needs a realistic token budget instead.
    if safe_limit < 5_000:
        return 0, DEFAULT_MONTHLY_TOKEN_LIMIT

    return safe_count, safe_limit


def _parse_ai_usage(value: dict | None) -> dict:
    """Normalize the per-child ``ai_usage`` JSONB column into a safe shape.

    Older rows may be missing the column entirely, store ``NULL``, or hold an
    empty ``{}`` default. In every case we return a dict that always contains
    ``usageCount`` (int ≥ 0) and ``usageLimit`` (int | None; ``None`` = unlimited)
    so callers never need to guard against missing keys.
    """
    raw = value if isinstance(value, dict) else {}

    raw_count = raw.get("usageCount", 0)
    try:
        usage_count = max(0, int(raw_count or 0))
    except (TypeError, ValueError):
        usage_count = 0

    raw_limit = raw.get("usageLimit", None)
    if raw_limit is None:
        usage_limit: int | None = None
    else:
        try:
            usage_limit = int(raw_limit)
        except (TypeError, ValueError):
            usage_limit = None

    raw_experience_points = raw.get("experiencePoints", 0)
    try:
        experience_points = max(0, int(raw_experience_points or 0))
    except (TypeError, ValueError):
        experience_points = 0

    raw_mouth_count_total = raw.get("mouthCountTotal", 0)
    try:
        mouth_count_total = max(0, int(raw_mouth_count_total or 0))
    except (TypeError, ValueError):
        mouth_count_total = 0

    raw_last_session_mouth_count = raw.get("lastSessionMouthCount", 0)
    try:
        last_session_mouth_count = max(0, int(raw_last_session_mouth_count or 0))
    except (TypeError, ValueError):
        last_session_mouth_count = 0

    raw_last_session_earned_xp = raw.get("lastSessionEarnedXp", 0)
    try:
        last_session_earned_xp = max(0, int(raw_last_session_earned_xp or 0))
    except (TypeError, ValueError):
        last_session_earned_xp = 0

    return {
        "usageCount": usage_count,
        "usageLimit": usage_limit,
        "experiencePoints": experience_points,
        "mouthCountTotal": mouth_count_total,
        "lastSessionMouthCount": last_session_mouth_count,
        "lastSessionEarnedXp": last_session_earned_xp,
    }


def _clone_ai_usage(value: dict | None) -> dict:
    """Return a fully-normalized mutable copy of a child's ai_usage payload."""
    return dict(_parse_ai_usage(value))


def _map_child(row: dict | None) -> ChildEntity | None:
    if row is None:
        return None
    return ChildEntity(
        id=row["id"],
        parent_user_id=row["parent_user_id"],
        name=row["name"],
        birth_year=row["birth_year"],
        english_level=row["english_level"],
        native_language=row["native_language"],
        notes=row["notes"],
        current_streak_days=row["current_streak_days"],
        longest_streak_days=row["longest_streak_days"],
        last_practice_date=row["last_practice_date"],
        total_pronunciations=row["total_pronunciations"],
        total_completed_lessons=row["total_completed_lessons"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        avatar_url=row.get("avatar_url"),
        ai_usage=_parse_ai_usage(row.get("ai_usage")),
    )


def _map_ai_config(row: dict | None) -> UserAiConfigEntity | None:
    if row is None:
        return None
    extra = _parse_extra_settings(row.get("extra_settings"))
    normalized_usage_count, normalized_usage_limit = _normalize_usage_stats(
        int(extra.get("usageCount", 0) or 0),
        int(extra.get("usageLimit", DEFAULT_MONTHLY_TOKEN_LIMIT) or DEFAULT_MONTHLY_TOKEN_LIMIT),
    )
    return UserAiConfigEntity(
        id=row["id"],
        user_id=row["user_id"],
        provider=row["provider"],
        base_url=row["base_url"],
        model_name=row["model_name"],
        api_key_last4=row["api_key_last4"],
        is_active=row["is_active"],
        llm_provider=extra.get("llmProvider", "gemini"),
        asr_api_key_last4=extra.get("asrApiKeyLast4"),
        tts_api_key_last4=extra.get("ttsApiKeyLast4"),
        use_env_asr_tts=bool(extra.get("useEnvAsrTts", False)),
        usage_count=normalized_usage_count,
        usage_limit=normalized_usage_limit,
    )


def _ensure_children_columns(cursor) -> None:
    """Ensure avatar_url and ai_usage columns exist on the children table.

    These columns were added after the initial schema. Running ADD COLUMN IF NOT EXISTS
    is idempotent and fast when the column already exists (no lock escalation).
    """
    cursor.execute(
        """
        ALTER TABLE children
            ADD COLUMN IF NOT EXISTS avatar_url TEXT,
            ADD COLUMN IF NOT EXISTS ai_usage JSONB NOT NULL DEFAULT '{}'::jsonb
        """
    )


def ensure_children_schema() -> None:
    """Run the children-table DDL once at startup instead of on every read.

    Previously every children read ran ADD COLUMN IF NOT EXISTS on the hot path, taking
    catalog locks. This runs it a single time from the app lifespan; the statements are
    idempotent so re-running across restarts is safe.
    """
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_children_columns(cursor)


def find_children_by_parent_id(parent_user_id: str) -> list[ChildEntity]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, parent_user_id, name, birth_year, english_level, native_language, notes,
                       current_streak_days, longest_streak_days, last_practice_date,
                       total_pronunciations, total_completed_lessons, created_at, updated_at,
                       avatar_url, ai_usage
                FROM children
                WHERE parent_user_id = %s
                ORDER BY created_at ASC
                """,
                (parent_user_id,),
            )
            return [_map_child(row) for row in cursor.fetchall() if row is not None]


def find_child_by_id(child_id: str) -> ChildEntity | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, parent_user_id, name, birth_year, english_level, native_language, notes,
                       current_streak_days, longest_streak_days, last_practice_date,
                       total_pronunciations, total_completed_lessons, created_at, updated_at,
                       avatar_url, ai_usage
                FROM children
                WHERE id = %s
                """,
                (child_id,),
            )
            return _map_child(cursor.fetchone())


def check_child_name_exists(
    parent_user_id: str, 
    name: str, 
    exclude_child_id: str | None = None
) -> bool:
    """Check if a child with the given name (case-insensitive, trimmed) exists for the parent.
    
    Args:
        parent_user_id: The parent's user ID
        name: The child's name to check
        exclude_child_id: Optional child ID to exclude (for update scenarios)
    
    Returns:
        True if a duplicate name exists, False otherwise
    """
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            if exclude_child_id:
                cursor.execute(
                    """
                    SELECT COUNT(*) 
                    FROM children 
                    WHERE parent_user_id = %s 
                      AND LOWER(TRIM(name)) = LOWER(TRIM(%s))
                      AND id != %s
                    """,
                    (parent_user_id, name, exclude_child_id)
                )
            else:
                cursor.execute(
                    """
                    SELECT COUNT(*) 
                    FROM children 
                    WHERE parent_user_id = %s 
                      AND LOWER(TRIM(name)) = LOWER(TRIM(%s))
                    """,
                    (parent_user_id, name)
                )
            return cursor.fetchone()[0] > 0


def create_child(*, parent_user_id: str, name: str, birth_year: int, english_level: str, notes: str | None) -> ChildEntity:
    # Check for duplicate name before creating
    if check_child_name_exists(parent_user_id, name):
        from be.app.services.children_service import ChildrenError
        raise ChildrenError(
            400,
            f"A child with name '{name.strip()}' already exists. Please choose a different name."
        )
    
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO children (parent_user_id, name, birth_year, english_level, notes)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, parent_user_id, name, birth_year, english_level, native_language, notes,
                          current_streak_days, longest_streak_days, last_practice_date,
                          total_pronunciations, total_completed_lessons, created_at, updated_at,
                          avatar_url, ai_usage
                """,
                (parent_user_id, name, birth_year, english_level, notes),
            )
            return _map_child(cursor.fetchone())  # type: ignore[return-value]

def update_child(child_id: str, *, name: str | None = None, birth_year: int | None = None, english_level: str | None = None, notes: str | None = None, avatar_url: str | None = None) -> ChildEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            # If updating name, get parent_user_id first to check for duplicates
            if name is not None:
                cursor.execute("SELECT parent_user_id FROM children WHERE id = %s", (child_id,))
                row = cursor.fetchone()
                if row:
                    parent_user_id = row[0]
                    # Check for duplicate name
                    if check_child_name_exists(parent_user_id, name, exclude_child_id=child_id):
                        from be.app.services.children_service import ChildrenError
                        raise ChildrenError(
                            400,
                            f"A child with name '{name.strip()}' already exists. Please choose a different name."
                        )
            
            cursor.execute(
                """
                UPDATE children
                SET
                    name = COALESCE(%s, name),
                    birth_year = COALESCE(%s, birth_year),
                    english_level = COALESCE(%s, english_level),
                    notes = COALESCE(%s, notes),
                    avatar_url = COALESCE(%s, avatar_url),
                    updated_at = NOW()
                WHERE id = %s
                RETURNING id, parent_user_id, name, birth_year, english_level, native_language, notes,
                          current_streak_days, longest_streak_days, last_practice_date,
                          total_pronunciations, total_completed_lessons, created_at, updated_at,
                          avatar_url, ai_usage
                """,
                (name, birth_year, english_level, notes, avatar_url, child_id),
            )
            return _map_child(cursor.fetchone())  # type: ignore[return-value]


def set_child_avatar(child_id: str, avatar_url: str | None) -> ChildEntity:
    """Set (or clear) the avatar URL for a child.

    Passing ``avatar_url=None`` explicitly clears the stored avatar so callers
    can revert a child to the default icon (Requirement 6.6). Unlike
    :func:`update_child`, this writes the value directly instead of using
    ``COALESCE`` so ``None`` means "no avatar" rather than "keep existing".
    """
    normalized = avatar_url.strip() if isinstance(avatar_url, str) else None
    if normalized == "":
        normalized = None
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE children
                SET avatar_url = %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING id, parent_user_id, name, birth_year, english_level, native_language, notes,
                          current_streak_days, longest_streak_days, last_practice_date,
                          total_pronunciations, total_completed_lessons, created_at, updated_at,
                          avatar_url, ai_usage
                """,
                (normalized, child_id),
            )
            return _map_child(cursor.fetchone())  # type: ignore[return-value]


def delete_child(child_id: str) -> ChildEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM children
                WHERE id = %s
                RETURNING id, parent_user_id, name, birth_year, english_level, native_language, notes,
                          current_streak_days, longest_streak_days, last_practice_date,
                          total_pronunciations, total_completed_lessons, created_at, updated_at
                """,
                (child_id,),
            )
            return _map_child(cursor.fetchone())  # type: ignore[return-value]


def get_child_ai_usage(child_id: str) -> tuple[int, int | None]:
    """Return the per-child AI usage as ``(usageCount, usageLimit)``.

    ``usageLimit`` is ``None`` when no limit is set (unlimited). Rows missing
    the ``ai_usage`` column or holding ``NULL``/``{}`` default safely to
    ``(0, None)`` via :func:`_parse_ai_usage`.
    """
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT ai_usage FROM children WHERE id = %s",
                (child_id,),
            )
            row = cursor.fetchone()
            usage = _parse_ai_usage(row.get("ai_usage")) if row is not None else {"usageCount": 0, "usageLimit": None}
            return usage["usageCount"], usage["usageLimit"]


def set_child_usage_limit(child_id: str, usage_limit: int | None) -> None:
    """Set the per-child usage limit. ``None`` means unlimited.

    Preserves the existing ``usageCount`` and only updates the limit.
    """
    normalized_limit: int | None = None
    if usage_limit is not None:
        try:
            normalized_limit = max(0, int(usage_limit))
        except (TypeError, ValueError):
            normalized_limit = None

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT ai_usage FROM children WHERE id = %s",
                (child_id,),
            )
            row = cursor.fetchone()
            current = _clone_ai_usage(row.get("ai_usage")) if row is not None else _clone_ai_usage(None)
            new_usage = {**current, "usageLimit": normalized_limit}
            cursor.execute(
                """
                UPDATE children
                SET ai_usage = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (Json(new_usage), child_id),
            )


def increment_child_usage(child_id: str, amount: int) -> int:
    """Accumulate the per-child ``usageCount`` by ``amount`` and return the new value.

    Usage accumulates without any periodic reset. The result is always
    ``>= 0`` and, for ``amount >= 0``, monotonically non-decreasing relative to
    the previous count. The ``usageLimit`` is left untouched.
    """
    try:
        delta = int(amount)
    except (TypeError, ValueError):
        delta = 0

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT ai_usage FROM children WHERE id = %s",
                (child_id,),
            )
            row = cursor.fetchone()
            current = _clone_ai_usage(row.get("ai_usage")) if row is not None else _clone_ai_usage(None)
            new_count = max(0, current["usageCount"] + delta)
            new_usage = {**current, "usageCount": new_count}
            cursor.execute(
                """
                UPDATE children
                SET ai_usage = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (Json(new_usage), child_id),
            )
            return new_count

def find_active_ai_config_by_user_id(user_id: str) -> UserAiConfigEntity | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, user_id, provider, base_url, model_name, api_key_last4, is_active, extra_settings
                FROM user_ai_configs
                WHERE user_id = %s AND is_active = true
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (user_id,),
            )
            return _map_ai_config(cursor.fetchone())


def find_active_ai_secret_config_by_user_id(user_id: str) -> UserAiSecretConfigEntity | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, user_id, provider, base_url, model_name, api_key_last4, is_active, extra_settings, api_key_encrypted
                FROM user_ai_configs
                WHERE user_id = %s AND is_active = true
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (user_id,),
            )
            row = cursor.fetchone()
            mapped = _map_ai_config(row)
            if mapped is None:
                return None
            extra = _parse_extra_settings(row.get("extra_settings"))
            return UserAiSecretConfigEntity(
                id=mapped.id,
                user_id=mapped.user_id,
                provider=mapped.provider,
                base_url=mapped.base_url,
                model_name=mapped.model_name,
                api_key_last4=mapped.api_key_last4,
                is_active=mapped.is_active,
                llm_provider=mapped.llm_provider,
                asr_api_key_last4=mapped.asr_api_key_last4,
                tts_api_key_last4=mapped.tts_api_key_last4,
                use_env_asr_tts=mapped.use_env_asr_tts,
                usage_count=mapped.usage_count,
                usage_limit=mapped.usage_limit,
                api_key=_decode_api_key(row.get("api_key_encrypted")),
                asr_api_key=_decode_api_key(extra.get("asrApiKeyEncrypted")),
                tts_api_key=_decode_api_key(extra.get("ttsApiKeyEncrypted")),
            )


def list_child_letter_favorites(child_id: str) -> list[str]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT letter_key
                FROM child_letter_favorites
                WHERE child_id = %s
                ORDER BY created_at ASC, letter_key ASC
                """,
                (child_id,),
            )
            return [row["letter_key"] for row in cursor.fetchall()]


def add_child_letter_favorite(child_id: str, letter_key: str) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO child_letter_favorites (child_id, letter_key)
                VALUES (%s, %s)
                ON CONFLICT (child_id, letter_key) DO NOTHING
                """,
                (child_id, letter_key),
            )


def remove_child_letter_favorite(child_id: str, letter_key: str) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM child_letter_favorites WHERE child_id = %s AND letter_key = %s",
                (child_id, letter_key),
            )


def list_child_ipa_favorites(child_id: str) -> list[str]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT sound_key
                FROM child_ipa_favorites
                WHERE child_id = %s
                ORDER BY created_at ASC, sound_key ASC
                """,
                (child_id,),
            )
            return [row["sound_key"] for row in cursor.fetchall()]


def add_child_ipa_favorite(child_id: str, sound_key: str) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO child_ipa_favorites (child_id, sound_key)
                VALUES (%s, %s)
                ON CONFLICT (child_id, sound_key) DO NOTHING
                """,
                (child_id, sound_key),
            )


def remove_child_ipa_favorite(child_id: str, sound_key: str) -> None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM child_ipa_favorites WHERE child_id = %s AND sound_key = %s",
                (child_id, sound_key),
            )


def upsert_ai_config(
    *,
    user_id: str,
    api_key: str | None,
    base_url: str | None,
    model_name: str | None,
    llm_provider: LlmProvider | None,
    use_env_asr_tts: bool | None,
    usage_count: int | None = None,
    usage_limit: int | None = None,
    clear_api_key: bool = False,
) -> UserAiConfigEntity:
    normalized_llm_provider = llm_provider or "gemini"
    provider: Provider = "openai" if normalized_llm_provider in {"openai", "qwen"} else "custom"
    default_base_url = {
        "gemini": "https://generativelanguage.googleapis.com/v1beta",
        "openai": "https://api.openai.com/v1",
        "claude": "https://api.anthropic.com",
        "qwen": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    }.get(normalized_llm_provider, "https://api.openai.com/v1")
    default_model_name = {
        "gemini": "gemini-2.5-flash",
        "openai": "gpt-4o-mini",
        "claude": "claude-3-5-haiku-latest",
        "qwen": "qwen-plus",
    }.get(normalized_llm_provider, "gpt-4o-mini")

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, user_id, provider, base_url, model_name, api_key_last4, is_active, extra_settings, api_key_encrypted
                FROM user_ai_configs
                WHERE user_id = %s AND is_active = true
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (user_id,),
            )
            current = cursor.fetchone()
            current_extra = _parse_extra_settings(current.get("extra_settings")) if current else {}
            current_api_key = _decode_api_key(current.get("api_key_encrypted")) if current else ""
            next_api_key = "" if clear_api_key else ((api_key or "").strip() or current_api_key)

            extra_settings = {
                "llmProvider": llm_provider or current_extra.get("llmProvider") or "gemini",
                "asrApiKeyEncrypted": None,
                "asrApiKeyLast4": None,
                "ttsApiKeyEncrypted": None,
                "ttsApiKeyLast4": None,
                "useEnvAsrTts": (
                    use_env_asr_tts
                    if use_env_asr_tts is not None
                    else bool(current_extra.get("useEnvAsrTts", False))
                ),
                "usageCount": usage_count if usage_count is not None else int(current_extra.get("usageCount", 0) or 0),
                "usageLimit": (
                    usage_limit
                    if usage_limit is not None
                    else int(
                        current_extra.get("usageLimit", DEFAULT_MONTHLY_TOKEN_LIMIT) or DEFAULT_MONTHLY_TOKEN_LIMIT
                    )
                ),
            }

            if current:
                cursor.execute(
                    """
                    UPDATE user_ai_configs
                    SET provider = %s,
                        base_url = %s,
                        model_name = %s,
                        api_key_encrypted = %s,
                        api_key_last4 = %s,
                        is_active = true,
                        extra_settings = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    RETURNING id, user_id, provider, base_url, model_name, api_key_last4, is_active, extra_settings
                    """,
                    (
                        provider,
                        base_url or current["base_url"],
                        model_name or current["model_name"],
                        _encode_api_key(next_api_key),
                        next_api_key[-4:] if next_api_key else current["api_key_last4"],
                        Json(extra_settings),
                        current["id"],
                    ),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO user_ai_configs (
                        user_id, provider, base_url, model_name, api_key_encrypted, api_key_last4, is_active, extra_settings
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, true, %s)
                    RETURNING id, user_id, provider, base_url, model_name, api_key_last4, is_active, extra_settings
                    """,
                    (
                        user_id,
                        provider,
                        base_url or default_base_url,
                        model_name or default_model_name,
                        _encode_api_key(next_api_key),
                        next_api_key[-4:] if next_api_key else None,
                        Json(extra_settings),
                    ),
                )

            return _map_ai_config(cursor.fetchone())  # type: ignore[return-value]


def get_global_leaderboard(limit: int = 50) -> list[dict]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name, avatar_url, COALESCE((ai_usage->>'experiencePoints')::int, 0) AS xp
                FROM children
                WHERE COALESCE((ai_usage->>'experiencePoints')::int, 0) >= 0
                ORDER BY xp DESC
                LIMIT %s
                """,
                (limit,),
            )
            return [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "avatar_url": row["avatar_url"],
                    "xp": row["xp"]
                }
                for row in cursor.fetchall()
                if row is not None
            ]


def find_game_records_by_child_id(child_id: str) -> dict:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    CASE WHEN record_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                        THEN true_false_high_streak ELSE 0 END AS true_false_high_streak,
                    CASE WHEN record_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                        THEN word_chain_high_score ELSE 0 END AS word_chain_high_score,
                    CASE WHEN record_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                        THEN flashcard_match_best_time ELSE 0 END AS flashcard_match_best_time,
                    CASE WHEN record_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                        THEN stories_completed_count ELSE 0 END AS stories_completed_count,
                    CASE WHEN record_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                        THEN blocks_high_score ELSE 0 END AS blocks_high_score,
                    CASE WHEN record_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                        THEN blast_high_score ELSE 0 END AS blast_high_score,
                    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS record_date
                FROM child_game_records
                WHERE child_id = %s
                """,
                (child_id,),
            )
            row = cursor.fetchone()
            if row is None:
                return {
                    "trueFalseHighScore": 0,
                    "wordChainHighScore": 0,
                    "flashcardMatchBestTime": 0,
                    "storiesCompletedCount": 0,
                    "blocksHighScore": 0,
                    "blastHighScore": 0,
                    "recordDate": None,
                }
            return {
                "trueFalseHighScore": row["true_false_high_streak"],
                "wordChainHighScore": row["word_chain_high_score"],
                "flashcardMatchBestTime": row["flashcard_match_best_time"],
                "storiesCompletedCount": row["stories_completed_count"],
                "blocksHighScore": row["blocks_high_score"],
                "blastHighScore": row["blast_high_score"],
                "recordDate": row["record_date"].isoformat(),
            }


def upsert_game_records_by_child_id(
    child_id: str,
    true_false_streak: int | None = None,
    word_chain_score: int | None = None,
    flashcard_match_time: int | None = None,
    stories_completed: int | None = None,
    blocks_score: int | None = None,
    blast_score: int | None = None,
) -> dict:
    today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT true_false_high_streak, word_chain_high_score,
                       flashcard_match_best_time, stories_completed_count, blocks_high_score, blast_high_score,
                       record_date
                FROM child_game_records
                WHERE child_id = %s
                """,
                (child_id,),
            )
            row = cursor.fetchone()
            
            is_today = bool(row and row["record_date"] == today)
            curr_tf = row["true_false_high_streak"] if is_today else 0
            curr_wc = row["word_chain_high_score"] if is_today else 0
            curr_fm = row["flashcard_match_best_time"] if is_today else 0
            curr_st = row["stories_completed_count"] if is_today else 0
            curr_blocks = row["blocks_high_score"] if is_today else 0
            curr_blast = row["blast_high_score"] if is_today else 0

            new_tf = max(curr_tf, true_false_streak) if true_false_streak is not None else curr_tf
            new_wc = max(curr_wc, word_chain_score) if word_chain_score is not None else curr_wc
            
            new_fm = curr_fm
            if flashcard_match_time is not None and flashcard_match_time > 0:
                if curr_fm == 0 or flashcard_match_time < curr_fm:
                    new_fm = flashcard_match_time
            
            new_st = stories_completed if stories_completed is not None else curr_st
            new_blocks = max(curr_blocks, blocks_score) if blocks_score is not None else curr_blocks
            new_blast = max(curr_blast, blast_score) if blast_score is not None else curr_blast

            cursor.execute(
                """
                INSERT INTO child_game_records (
                    child_id, true_false_high_streak, word_chain_high_score,
                    flashcard_match_best_time, stories_completed_count, blocks_high_score, blast_high_score, record_date
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (child_id) DO UPDATE
                SET true_false_high_streak = EXCLUDED.true_false_high_streak,
                    word_chain_high_score = EXCLUDED.word_chain_high_score,
                    flashcard_match_best_time = EXCLUDED.flashcard_match_best_time,
                    stories_completed_count = EXCLUDED.stories_completed_count,
                    blocks_high_score = EXCLUDED.blocks_high_score,
                    blast_high_score = EXCLUDED.blast_high_score,
                    record_date = EXCLUDED.record_date,
                    updated_at = NOW()
                """,
                (child_id, new_tf, new_wc, new_fm, new_st, new_blocks, new_blast, today),
            )
            
            return {
                "trueFalseHighScore": new_tf,
                "wordChainHighScore": new_wc,
                "flashcardMatchBestTime": new_fm,
                "storiesCompletedCount": new_st,
                "blocksHighScore": new_blocks,
                "blastHighScore": new_blast,
                "recordDate": today.isoformat(),
            }


def find_all_game_stories() -> list[dict]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, title_en, title_vi, text_en, text_vi, template, blanks,
                       story_type, dialogue
                FROM game_stories
                ORDER BY id ASC
                """
            )
            return [
                {
                    "id": row["id"],
                    "titleEn": row["title_en"],
                    "titleVi": row["title_vi"],
                    "textEn": row["text_en"],
                    "textVi": row["text_vi"],
                    "template": row["template"],
                    "blanks": row["blanks"],
                    "storyType": row["story_type"],
                    "dialogue": row["dialogue"],
                }
                for row in cursor.fetchall()
            ]


def add_reward_to_child(
    *,
    child_id: str,
    earned_xp: int,
    mouth_count: int,
    activity_date: date,
    current_streak_days: int,
    longest_streak_days: int,
) -> ChildEntity:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT ai_usage FROM children WHERE id = %s FOR UPDATE",
                (child_id,),
            )
            row = cursor.fetchone()
            current = _clone_ai_usage(row.get("ai_usage")) if row is not None else _clone_ai_usage(None)
            next_usage = {
                **current,
                "experiencePoints": current["experiencePoints"] + earned_xp,
                "mouthCountTotal": current["mouthCountTotal"] + mouth_count,
                "lastSessionMouthCount": mouth_count,
                "lastSessionEarnedXp": earned_xp,
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
                RETURNING id, parent_user_id, name, birth_year, english_level, native_language, notes,
                          current_streak_days, longest_streak_days, last_practice_date,
                          total_pronunciations, total_completed_lessons, created_at, updated_at,
                          avatar_url, ai_usage
                """,
                (Json(next_usage), mouth_count, current_streak_days, longest_streak_days, activity_date, child_id),
            )
            updated_child_row = cursor.fetchone()

            cursor.execute(
                """
                INSERT INTO child_daily_activity (
                    child_id, activity_date, sessions_count, pronunciations_count, lessons_completed_count
                )
                VALUES (%s, %s, 1, %s, 0)
                ON CONFLICT (child_id, activity_date)
                DO UPDATE SET
                    sessions_count = child_daily_activity.sessions_count + 1,
                    pronunciations_count = child_daily_activity.pronunciations_count + EXCLUDED.pronunciations_count,
                    updated_at = NOW()
                """,
                (child_id, activity_date, mouth_count),
            )

            return _map_child(updated_child_row)  # type: ignore[return-value]


def find_all_game_flashcards(levels: list[str] | None = None) -> list[dict]:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            level_filter = [level for level in (levels or []) if level]
            where_clause = "WHERE level = ANY(%s)" if level_filter else ""
            params = (level_filter,) if level_filter else ()
            cursor.execute(
                f"""
                SELECT id, word, ipa, vietnamese, icon AS emoji, category, level, definition, example, example_translation
                FROM words
                {where_clause}
                ORDER BY level ASC NULLS LAST, category ASC NULLS LAST, word ASC
                """,
                params,
            )
            return [
                {
                    "id": str(row["id"]),
                    "word": row["word"],
                    "ipa": row["ipa"] or "",
                    "vietnamese": row["vietnamese"],
                    "emoji": row["emoji"] or "📝",
                    "category": row["category"] or "General",
                    "level": row["level"] or "A1",
                    "age_group": "preschool" if (row["level"] or "A1") in {"kids", "A1", "A2"} else "primary",
                    "definition": row["definition"] or "",
                    "example": row["example"] or "",
                    "exampleTranslation": row["example_translation"] or "",
                }
                for row in cursor.fetchall()
            ]
