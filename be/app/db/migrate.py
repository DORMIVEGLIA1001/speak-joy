from pathlib import Path

import psycopg2

from be.app.core.config import settings


def run_migrations() -> None:
    schema_path = Path(__file__).with_name("schema.sql")
    schema_sql = schema_path.read_text(encoding="utf-8")

    with psycopg2.connect(settings.db_dsn) as connection:
        with connection.cursor() as cursor:
            cursor.execute(schema_sql)

    print("Database schema is up to date")


if __name__ == "__main__":
    run_migrations()
