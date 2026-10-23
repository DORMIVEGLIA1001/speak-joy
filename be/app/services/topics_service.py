from datetime import datetime
import re
from zoneinfo import ZoneInfo

from be.app.repositories.children_repository import find_child_by_id
from be.app.repositories.topics_repository import (
    complete_topic_lesson,
    count_completed_lessons,
    find_child_daily_activity,
    find_topic_by_slug_or_id,
    list_completed_topic_progress,
    list_topic_vocabulary_items,
    list_topics,
)
from be.app.schemas.auth import PublicUser


APP_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")

LESSON_XP_BY_KEY = {
    "family-lesson-1": 10,
    "animals-lesson-1": 15,
    "colors-lesson-1": 20,
    "food-lesson-1": 20,
    "family-lesson-2": 20,
    "alphabet-lesson-1": 15,
    "alphabet-lesson-2": 15,
    "alphabet-lesson-3": 15,
}
DEFAULT_LESSON_XP = 10


class TopicsError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def _infer_tone_by_slug(slug: str) -> str:
    if "food" in slug:
        return "sun"
    if "color" in slug:
        return "leaf"
    if "family" in slug:
        return "peach"
    return "sky"


def _infer_description_by_slug(slug: str, name: str) -> str:
    if "animal" in slug:
        return "Luyện gọi tên các con vật quen thuộc."
    if "food" in slug:
        return "Giới thiệu các món ăn gần gũi với bé."
    if "color" in slug:
        return "Nhận biết màu sắc qua ví dụ dễ nhớ."
    if "family" in slug:
        return "Giới thiệu các thành viên trong gia đình."
    if "earth" in slug:
        return "Khơi gợi sự tò mò của trẻ về Trái Đất và thiên nhiên."
    if "body_parts" in slug:
        return "Khám phá và gọi tên các bộ phận cơ thể."
    return f"Chủ đề {name} dành cho bé luyện nói từng bước."


def _to_topic_dto(topic: dict) -> dict:
    total = int(topic["vocabulary_count"])
    return {
        "id": topic["slug"],
        "topicId": str(topic["id"]),
        "name": topic["name"],
        "vietnameseName": topic["name"],
        "slug": topic["slug"],
        "description": _infer_description_by_slug(topic["slug"], topic["name"]),
        "tone": _infer_tone_by_slug(topic["slug"]),
        "lessonCount": total,
    }


def _to_progress_value(completed_lessons: int, total_lessons: int) -> int:
    if total_lessons <= 0:
        return 0
    return max(0, min(100, round((completed_lessons / total_lessons) * 100)))


def _ensure_child_belongs_to_user(child_id: str, user: PublicUser) -> None:
    child = find_child_by_id(child_id)
    if child is None or child.parent_user_id != user.id:
        raise TopicsError(403, "You do not have access to this child")


def list_topics_service(child_id: str | None, user: PublicUser | None) -> list[dict]:
    if child_id and user is None:
        raise TopicsError(401, "Missing Authorization header")
    if child_id and user is not None:
        _ensure_child_belongs_to_user(child_id, user)

    topics = list_topics()
    topic_ids = [int(topic["id"]) for topic in topics]
    completed_map = list_completed_topic_progress(topic_ids, child_id) if child_id else {}

    result = []
    for topic in topics:
        dto = _to_topic_dto(topic)
        total_lessons = int(topic["vocabulary_count"])
        completed_lessons = int(completed_map.get(str(topic["id"]), 0))
        result.append(
            {
                **dto,
                "completedLessons": completed_lessons,
                "totalLessons": total_lessons,
                "progress": _to_progress_value(completed_lessons, total_lessons),
            }
        )
    return result


def get_topic_detail_service(topic_id: str) -> dict:
    topic = find_topic_by_slug_or_id(topic_id)
    if topic is None:
        raise TopicsError(404, "Topic not found")

    items = list_topic_vocabulary_items(int(topic["id"]))
    return {
        **_to_topic_dto(topic),
        "vocabularyItems": [
            {
                "id": str(item["id"]),
                "sourceId": item["source_id"],
                "word": item["word"],
                "ipa": item["ipa"],
                "vietnamese": item["vietnamese"],
                "ageGroup": item["age_group"],
                "example": item["example"],
                "rawPayload": item["raw_payload"],
                "questions": [
                    {
                        "id": str(question["id"]),
                        "order": question["question_order"],
                        "questionEn": question["question_en"],
                        "questionVi": question["question_vi"],
                    }
                    for question in item["vocabulary_questions"]
                ],
                "assets": [
                    {
                        "id": str(asset["id"]),
                        "type": asset["asset_type"],
                        "order": asset["asset_order"],
                        "url": asset["asset_url"],
                    }
                    for asset in item["vocabulary_assets"]
                ],
            }
            for item in items
        ],
    }


def complete_topic_lesson_service(
    *,
    user: PublicUser,
    topic_id: str,
    child_id: str,
    lesson_key: str,
    mouth_count_raw: int | float,
    score_raw: int | float,
) -> dict:
    if not topic_id or not child_id or not lesson_key:
        raise TopicsError(400, "Missing topicId, childId, or lessonKey")

    _ensure_child_belongs_to_user(child_id, user)
    topic = find_topic_by_slug_or_id(topic_id)
    if topic is None:
        raise TopicsError(404, "Topic not found")

    child = find_child_by_id(child_id)
    if child is None:
        raise TopicsError(404, "Child not found")

    lesson_match = re.fullmatch(r"([a-z0-9_-]+)-lesson-([1-9][0-9]*)", lesson_key)
    if lesson_match is None or lesson_match.group(1) != topic["slug"]:
        raise TopicsError(400, "Invalid lessonKey for this topic")

    lesson_number = int(lesson_match.group(2))
    total_lessons = int(topic["vocabulary_count"])
    if lesson_number > total_lessons:
        raise TopicsError(400, "Lesson does not exist in this topic")

    # A completed lesson contains one required speaking exercise. Reward values
    # are owned by the server; client counters are accepted only for API compatibility.
    mouth_count = 1
    score = max(0, min(100, round(float(score_raw))))
    earned_xp = LESSON_XP_BY_KEY.get(lesson_key, DEFAULT_LESSON_XP)
    activity_date = datetime.now(APP_TIMEZONE).date()

    last_practice_date = child.last_practice_date
    current_streak_days = max(0, child.current_streak_days)
    longest_streak_days = max(0, child.longest_streak_days)

    if last_practice_date is None:
      next_current = 1
    else:
      day_diff = (activity_date - last_practice_date).days
      if day_diff == 1:
          next_current = current_streak_days + 1
      elif day_diff > 1:
          next_current = 1
      else:
          next_current = current_streak_days

    next_longest = max(longest_streak_days, max(1, next_current))

    completion_applied = complete_topic_lesson(
        child_id=child_id,
        topic_db_id=int(topic["id"]),
        lesson_key=lesson_key,
        mouth_count=mouth_count,
        score=score,
        earned_xp=earned_xp,
        activity_date=activity_date,
        current_streak_days=max(1, next_current),
        longest_streak_days=next_longest,
    )

    today_activity = find_child_daily_activity(child_id, activity_date)
    completed_lessons = count_completed_lessons(child_id, int(topic["id"]))
    progress = _to_progress_value(completed_lessons, total_lessons)

    return {
        "topicId": topic["slug"],
        "lessonKey": lesson_key,
        "mouthCount": mouth_count if completion_applied else 0,
        "earnedXp": earned_xp if completion_applied else 0,
        "alreadyCompleted": not completion_applied,
        "mouthCountToday": int(today_activity["pronunciations_count"]) if today_activity else 0,
        "streakDays": max(1, next_current),
        "longestStreakDays": next_longest,
        "completedLessons": completed_lessons,
        "totalLessons": total_lessons,
        "progress": progress,
    }
