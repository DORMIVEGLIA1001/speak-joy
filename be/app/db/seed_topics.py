from __future__ import annotations

import json
import os
import re
from collections import OrderedDict
from pathlib import Path
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.extras import Json

from be.app.core.config import settings

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATASET_PATHS = (
    PROJECT_ROOT / "be" / "get_data" / "kids_english_dataset_10000_retopic.json",
    PROJECT_ROOT / "get_data" / "kids_english_dataset_10000_retopic.json",
)


def resolve_dataset_path() -> Path:
    for path in DATASET_PATHS:
        if path.exists():
            return path
    raise FileNotFoundError("Could not find kids_english_dataset_10000_retopic.json")


def slugify_topic_name(name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    normalized = normalized.strip("-")
    return normalized or "general-vocabulary"


def should_force_seed() -> bool:
    return os.getenv("TOPICS_SEED_FORCE", "").strip().lower() == "true"


def should_skip_seed(cursor: psycopg2.extensions.cursor, force_seed: bool) -> bool:
    if force_seed:
        return False

    cursor.execute("SELECT COUNT(*) AS total FROM topics")
    topics_total = int(cursor.fetchone()["total"])
    cursor.execute("SELECT COUNT(*) AS total FROM vocabulary_items")
    items_total = int(cursor.fetchone()["total"])
    return topics_total > 0 and items_total > 0


def load_dataset() -> list[dict[str, Any]]:
    dataset_path = resolve_dataset_path()
    with dataset_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError("Dataset payload must be a list.")
    return [item for item in payload if isinstance(item, dict)]


def extract_topics(dataset: list[dict[str, Any]]) -> OrderedDict[str, str]:
    topics: OrderedDict[str, str] = OrderedDict()
    for item in dataset:
        raw_name = str(item.get("topic") or "").strip()
        if not raw_name:
            continue
        slug = slugify_topic_name(raw_name)
        topics.setdefault(slug, raw_name)
    return topics


def truncate_topic_tables(cursor: psycopg2.extensions.cursor) -> None:
    cursor.execute(
        """
        TRUNCATE TABLE
            vocabulary_assets,
            vocabulary_questions,
            vocabulary_items,
            topics
        RESTART IDENTITY CASCADE
        """
    )


def insert_topics(
    cursor: psycopg2.extensions.cursor,
    topic_map: OrderedDict[str, str],
) -> dict[str, int]:
    for slug, name in topic_map.items():
        cursor.execute(
            """
            INSERT INTO topics (name, slug)
            VALUES (%s, %s)
            ON CONFLICT (slug)
            DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
            """,
            (name, slug),
        )

    cursor.execute("SELECT id, slug FROM topics")
    rows = cursor.fetchall()
    return {str(row["slug"]): int(row["id"]) for row in rows}


def insert_dataset_rows(
    cursor: psycopg2.extensions.cursor,
    dataset: list[dict[str, Any]],
    topic_ids_by_slug: dict[str, int],
) -> None:
    for item in dataset:
        topic_name = str(item.get("topic") or "").strip()
        word = str(item.get("word") or "").strip()
        if not topic_name or not word:
            continue

        topic_slug = slugify_topic_name(topic_name)
        topic_id = topic_ids_by_slug.get(topic_slug)
        if topic_id is None:
            continue

        raw_payload = dict(item)
        cursor.execute(
            """
            INSERT INTO vocabulary_items (
                topic_id,
                source_id,
                word,
                ipa,
                vietnamese,
                age_group,
                example,
                raw_payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                topic_id,
                str(item.get("id")) if item.get("id") is not None else None,
                word,
                str(item.get("ipa") or "").strip() or None,
                str(item.get("vietnamese") or "").strip() or None,
                str(item.get("age_group") or "").strip() or None,
                str(item.get("example") or "").strip() or None,
                Json(raw_payload),
            ),
        )
        vocabulary_item_id = int(cursor.fetchone()["id"])

        questions: list[tuple[int, str, str | None]] = []
        for order in range(1, 6):
            question_en = str(item.get(f"question{order}") or "").strip()
            if not question_en:
                continue
            question_vi = str(item.get(f"question{order}_vi") or "").strip() or None
            questions.append((order, question_en, question_vi))

        for order, question_en, question_vi in questions:
            cursor.execute(
                """
                INSERT INTO vocabulary_questions (
                    vocabulary_item_id,
                    question_order,
                    question_en,
                    question_vi
                )
                VALUES (%s, %s, %s, %s)
                """,
                (vocabulary_item_id, order, question_en, question_vi),
            )

        asset_urls = item.get("image_urls")
        if isinstance(asset_urls, list):
            for order, asset_url in enumerate(asset_urls, start=1):
                asset_value = str(asset_url or "").strip()
                if not asset_value:
                    continue
                cursor.execute(
                    """
                    INSERT INTO vocabulary_assets (
                        vocabulary_item_id,
                        asset_type,
                        asset_order,
                        asset_url
                    )
                    VALUES (%s, 'image', %s, %s)
                    """,
                    (vocabulary_item_id, order, asset_value),
                )


def seed_topics() -> None:
    dataset = load_dataset()
    force_seed = should_force_seed()

    with psycopg2.connect(settings.db_dsn, cursor_factory=RealDictCursor) as connection:
        with connection.cursor() as cursor:
            if should_skip_seed(cursor, force_seed):
                print("Topics seed skipped: topics and vocabulary_items already contain data.")
                return

            if force_seed:
                print("TOPICS_SEED_FORCE=true -> truncating existing topic tables before seed.")
                truncate_topic_tables(cursor)

            topic_map = extract_topics(dataset)
            topic_ids_by_slug = insert_topics(cursor, topic_map)
            insert_dataset_rows(cursor, dataset, topic_ids_by_slug)

    print(f"Topics seed completed. Imported {len(dataset)} vocabulary records.")


if __name__ == "__main__":
    seed_topics()
