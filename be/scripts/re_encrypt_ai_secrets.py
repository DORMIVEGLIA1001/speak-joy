from __future__ import annotations

from copy import deepcopy

from psycopg2.extras import Json

from be.app.db.session import get_db_connection
from be.app.repositories.children_repository import (
    _KDF_FERNET_PREFIX,
    _decode_api_key,
    _encode_api_key,
)


def _needs_re_encrypt(value: str | None) -> bool:
    if not value:
        return False
    return not value.startswith(_KDF_FERNET_PREFIX)


def main() -> None:
    scanned_rows = 0
    updated_rows = 0
    updated_fields = 0

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, api_key_encrypted, extra_settings
                FROM user_ai_configs
                ORDER BY updated_at DESC
                """
            )
            rows = cursor.fetchall()

            for row in rows:
                scanned_rows += 1
                row_id = row["id"]
                extra_settings = deepcopy(row.get("extra_settings") or {})
                if not isinstance(extra_settings, dict):
                    extra_settings = {}

                changed = False
                api_key_encrypted = row.get("api_key_encrypted")
                next_api_key_encrypted = api_key_encrypted

                if _needs_re_encrypt(api_key_encrypted):
                    decoded = _decode_api_key(api_key_encrypted)
                    if decoded:
                        next_api_key_encrypted = _encode_api_key(decoded)
                        changed = next_api_key_encrypted != api_key_encrypted
                        if changed:
                            updated_fields += 1

                for field_name in ("asrApiKeyEncrypted", "ttsApiKeyEncrypted"):
                    current_value = extra_settings.get(field_name)
                    if not _needs_re_encrypt(current_value):
                        continue
                    decoded = _decode_api_key(current_value)
                    if not decoded:
                        continue
                    next_value = _encode_api_key(decoded)
                    if next_value != current_value:
                        extra_settings[field_name] = next_value
                        changed = True
                        updated_fields += 1

                if not changed:
                    continue

                cursor.execute(
                    """
                    UPDATE user_ai_configs
                    SET api_key_encrypted = %s,
                        extra_settings = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        next_api_key_encrypted,
                        Json(extra_settings),
                        row_id,
                    ),
                )
                updated_rows += 1

    print(f"Scanned rows: {scanned_rows}")
    print(f"Updated rows: {updated_rows}")
    print(f"Updated encrypted fields: {updated_fields}")


if __name__ == "__main__":
    main()
