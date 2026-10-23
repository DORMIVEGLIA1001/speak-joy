from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:  # pragma: no cover - Python < 3.9 fallback
    ZoneInfo = None  # type: ignore[assignment]

    class ZoneInfoNotFoundError(Exception):
        pass

from be.app.repositories.auth_repository import (
    get_active_child_id,
    set_active_child_id,
)
from be.app.repositories.children_repository import (
    ChildEntity,
    UserAiConfigEntity,
    add_child_ipa_favorite,
    add_child_letter_favorite,
    create_child,
    delete_child,
    find_active_ai_config_by_user_id,
    find_active_ai_secret_config_by_user_id,
    find_child_by_id,
    find_children_by_parent_id,
    get_child_ai_usage,
    get_global_leaderboard,
    increment_child_usage,
    list_child_ipa_favorites,
    list_child_letter_favorites,
    remove_child_ipa_favorite,
    remove_child_letter_favorite,
    set_child_avatar,
    set_child_usage_limit,
    update_child,
    upsert_ai_config,
    find_game_records_by_child_id,
    upsert_game_records_by_child_id,
    find_all_game_flashcards,
    find_all_game_stories,
    add_reward_to_child,
)
try:
    from be.app.repositories.sessions_repository import get_completed_session_stats_by_child_ids
except Exception:  # pragma: no cover - backward-compatible hotfix for partial deploys
    def get_completed_session_stats_by_child_ids(child_ids: list[str]) -> dict[str, dict]:
        return {
            child_id: {
                "completedSessions": 0,
                "lastSessionAt": None,
                "activityDates": [],
            }
            for child_id in child_ids
        }
from be.app.schemas.auth import PublicUser
from be.app.schemas.children import ChildProfileRequest, UpdateChildProfileRequest

DEFAULT_MONTHLY_TOKEN_LIMIT = 20_000
def _resolve_app_timezone():
    if ZoneInfo is not None:
        for timezone_name in ("Asia/Ho_Chi_Minh", "Asia/Saigon"):
            try:
                return ZoneInfo(timezone_name)
            except ZoneInfoNotFoundError:
                continue
            except Exception:
                break
    return timezone(timedelta(hours=7))


APP_TIMEZONE = _resolve_app_timezone()
STARTER_XP_MAX = 10000
MOVER_XP_MAX = 20000


class ChildrenError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def _current_year() -> int:
    return datetime.now(APP_TIMEZONE).year


def _age_to_birth_year(age: int) -> int:
    return _current_year() - age


def _birth_year_to_age(birth_year: int | None) -> int:
    return _current_year() - birth_year if birth_year else 0


def _game_word_levels_for_child_age(age: int) -> list[str] | None:
    if 4 <= age < 6:
        return ["kids"]
    if age == 6:
        return ["kids", "A1"]
    return None


def _xp_to_level(experience_points: int) -> str:
    if experience_points < STARTER_XP_MAX:
        return "starter"
    if experience_points < MOVER_XP_MAX:
        return "mover"
    return "explorer"


def _mask_last4(value: str | None) -> str:
    return f"******-{value}" if value else ""


def _format_last_practice_date(value) -> str:
    if not value:
        return ""
    if hasattr(value, "astimezone"):
        return value.astimezone(APP_TIMEZONE).strftime("%Y-%m-%d")
    return str(value)[:10]


def _compute_current_streak_days(activity_dates: list[date], today: date) -> int:
    if not activity_dates:
        return 0

    ordered = sorted(set(activity_dates), reverse=True)
    latest_activity = ordered[0]
    if (today - latest_activity).days > 1:
        return 0

    streak = 1
    previous = latest_activity
    for current in ordered[1:]:
        if (previous - current).days == 1:
            streak += 1
            previous = current
            continue
        break

    return streak


def _compute_longest_streak_days(activity_dates: list[date]) -> int:
    if not activity_dates:
        return 0

    ordered = sorted(activity_dates)
    longest = 1
    current = 1

    for previous, current_date in zip(ordered, ordered[1:]):
        if (current_date - previous).days == 1:
            current += 1
        else:
            current = 1
        longest = max(longest, current)

    return longest


def _build_session_stats_map(child_ids: list[str]) -> dict[str, dict]:
    today = datetime.now(APP_TIMEZONE).date()
    raw_stats = get_completed_session_stats_by_child_ids(child_ids)
    session_stats: dict[str, dict] = {}

    for child_id in child_ids:
        child_raw_stats = raw_stats.get(child_id, {})
        activity_dates = child_raw_stats.get("activityDates", [])
        session_stats[child_id] = {
            "completedSessions": int(child_raw_stats.get("completedSessions", 0) or 0),
            "lastSessionAt": child_raw_stats.get("lastSessionAt"),
            "currentStreakDays": _compute_current_streak_days(activity_dates, today),
            "longestStreakDays": _compute_longest_streak_days(activity_dates),
            "activityDates": activity_dates,
        }

    return session_stats


def _to_student_profile(
    child: ChildEntity,
    ai_config: UserAiConfigEntity | None,
    session_stats: dict | None = None,
) -> dict:
    age = _birth_year_to_age(child.birth_year)
    child_ai_usage = child.ai_usage if isinstance(child.ai_usage, dict) else {}
    experience_points = int(child_ai_usage.get("experiencePoints", 0) or 0)
    mouth_count_total = max(
        int(child_ai_usage.get("mouthCountTotal", 0) or 0),
        int(child.total_pronunciations or 0),
    )
    completed_sessions = int((session_stats or {}).get("completedSessions", 0) or 0)
    
    # Fallback to legacy calculated XP if experience_points is 0 but child has progress
    if experience_points == 0:
        experience_points = completed_sessions * 10 + child.total_completed_lessons * 20 + child.current_streak_days * 5

    # Calculate active streak dynamically from the child's stored last_practice_date and sessions
    today = datetime.now(APP_TIMEZONE).date()
    last_practice = child.last_practice_date
    current_streak = max(0, child.current_streak_days or 0)
    session_streak = int((session_stats or {}).get("currentStreakDays", 0) or 0)
    
    db_streak = 0
    if last_practice is not None:
        day_diff = (today - last_practice).days
        if day_diff <= 1:
            db_streak = current_streak
            
    active_streak = max(db_streak, session_streak)
    longest_streak_days = max(
        max(0, child.longest_streak_days or 0),
        int((session_stats or {}).get("longestStreakDays", 0) or 0)
    )
    last_session_at = (session_stats or {}).get("lastSessionAt")
    is_active = completed_sessions > 0 or experience_points > 0 or mouth_count_total > 0
    activity_dates = (session_stats or {}).get("activityDates", [])
    activity_dates_str = [
        d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10]
        for d in activity_dates
    ]

    return {
        "id": child.id,
        "parentId": child.parent_user_id,
        "name": child.name,
        "age": age,
        "level": _xp_to_level(experience_points),
        "status": "active" if is_active else "new",
        "sessionsCompleted": completed_sessions,
        "latestScore": 0,
        "topicsCompleted": child.total_completed_lessons,
        "streakDays": active_streak,
        "weeklyGoal": 5,
        "weeklyCompleted": 0,
        "totalMinutes": 0,
        "badgesEarned": completed_sessions,
        "attendanceRate": 100 if active_streak > 0 else 0,
        "lastSessionAt": _format_last_practice_date(last_session_at),
        "learningGoal": child.notes or "Mỗi ngày 1 buổi ngắn để giữ nhịp học.",
        "nextFocus": "Tiếp tục luyện nói và trò chuyện tự nhiên cùng Sunny.",
        "experiencePoints": experience_points,
        "mouthCountTotal": mouth_count_total,
        "lastSessionMouthCount": int(child_ai_usage.get("lastSessionMouthCount", 0) or 0),
        "lastSessionEarnedXp": int(child_ai_usage.get("lastSessionEarnedXp", 0) or 0),
        "longestStreakDays": longest_streak_days,
        "apiKeyMasked": _mask_last4(ai_config.api_key_last4 if ai_config else None),
        "baseUrl": ai_config.base_url if ai_config else "https://generativelanguage.googleapis.com/v1beta",
        "modelName": ai_config.model_name if ai_config else "gemini-2.5-flash",
        "llmProvider": ai_config.llm_provider if ai_config else "gemini",
        "useEnvAsrTts": ai_config.use_env_asr_tts if ai_config else False,
        "avatarUrl": child.avatar_url,
        "activityDates": activity_dates_str,
    }


def _resolve_usage(child: ChildEntity, ai_config) -> tuple[int, int | None]:
    """Resolve the usage pair returned for a child.

    Prefer the per-child usage stored in ``children.ai_usage``. When the child
    has no usage of its own yet (``usageCount == 0`` and ``usageLimit is None``),
    fall back to the per-user AI config values so existing parents keep their
    previously configured count/limit until per-child usage is set.
    """
    child_usage = child.ai_usage if isinstance(child.ai_usage, dict) else {}
    child_count = child_usage.get("usageCount", 0)
    child_limit = child_usage.get("usageLimit", None)

    has_child_usage = bool(child_count) or child_limit is not None
    if has_child_usage:
        return child_count, child_limit

    if ai_config is not None:
        return ai_config.usage_count, ai_config.usage_limit

    return 0, DEFAULT_MONTHLY_TOKEN_LIMIT


def _to_runtime_config(child: ChildEntity, ai_config) -> dict:
    usage_count, usage_limit = _resolve_usage(child, ai_config)
    return {
        "childId": child.id,
        "provider": ai_config.provider if ai_config else "siliconflow",
        "llmProvider": ai_config.llm_provider if ai_config else "gemini",
        "baseUrl": ai_config.base_url if ai_config else "https://generativelanguage.googleapis.com/v1beta",
        "modelName": ai_config.model_name if ai_config else "gemini-2.5-flash",
        "apiKey": ai_config.api_key if ai_config else "",
        "asrApiKey": ai_config.asr_api_key if ai_config else "",
        "ttsApiKey": ai_config.tts_api_key if ai_config else "",
        "apiKeyMasked": _mask_last4(ai_config.api_key_last4 if ai_config else None),
        "usageCount": usage_count,
        "usageLimit": usage_limit,
        "useEnvAsrTts": ai_config.use_env_asr_tts if ai_config else False,
    }


def _ensure_child_access(user: PublicUser, child_id: str) -> ChildEntity:
    child = find_child_by_id(child_id)
    if child is None:
        raise ChildrenError(404, "Child not found")
    if user.role != "admin" and child.parent_user_id != user.id:
        raise ChildrenError(403, "You do not have access to this child")
    return child


def list_children_for_user(user: PublicUser) -> list[dict]:
    ai_config = find_active_ai_config_by_user_id(user.id)
    children = find_children_by_parent_id(user.id)
    session_stats_map = _build_session_stats_map([child.id for child in children])
    return [_to_student_profile(child, ai_config, session_stats_map.get(child.id)) for child in children]


def get_child_for_user(user: PublicUser, child_id: str) -> dict:
    child = _ensure_child_access(user, child_id)
    ai_config = find_active_ai_config_by_user_id(child.parent_user_id)
    session_stats_map = _build_session_stats_map([child.id])
    return _to_student_profile(child, ai_config, session_stats_map.get(child.id))


def list_letter_favorites_for_child(user: PublicUser, child_id: str) -> list[str]:
    child = _ensure_child_access(user, child_id)
    return list_child_letter_favorites(child.id)


def set_letter_favorite_for_child(user: PublicUser, child_id: str, letter: str, favorite: bool) -> list[str]:
    child = _ensure_child_access(user, child_id)
    normalized = (letter or "").strip().upper()
    if len(normalized) != 1 or not normalized.isascii() or not normalized.isalpha():
        raise ChildrenError(400, "Letter must be one character from A to Z")
    if favorite:
        add_child_letter_favorite(child.id, normalized)
    else:
        remove_child_letter_favorite(child.id, normalized)
    return list_child_letter_favorites(child.id)


def list_ipa_favorites_for_child(user: PublicUser, child_id: str) -> list[str]:
    child = _ensure_child_access(user, child_id)
    return list_child_ipa_favorites(child.id)


def set_ipa_favorite_for_child(user: PublicUser, child_id: str, sound: str, favorite: bool) -> list[str]:
    child = _ensure_child_access(user, child_id)
    normalized = (sound or "").strip()
    if len(normalized) < 2 or len(normalized) > 24:
        raise ChildrenError(400, "IPA sound key is invalid")
    if favorite:
        add_child_ipa_favorite(child.id, normalized)
    else:
        remove_child_ipa_favorite(child.id, normalized)
    return list_child_ipa_favorites(child.id)


def add_child_for_user(user_id: str, payload: ChildProfileRequest) -> dict:
    ai_config = find_active_ai_config_by_user_id(user_id)
    child = create_child(
        parent_user_id=user_id,
        name=payload.name,
        birth_year=_age_to_birth_year(payload.age),
        english_level="starter",
        notes=payload.learningGoal,
    )
    session_stats_map = _build_session_stats_map([child.id])
    return _to_student_profile(child, ai_config, session_stats_map.get(child.id))


def update_child_for_user(user: PublicUser, child_id: str, payload: UpdateChildProfileRequest) -> dict:
    child = _ensure_child_access(user, child_id)
    should_update_ai = any(
        [
            payload.apiKey is not None,
            payload.llmApiKey is not None,
            payload.baseUrl is not None,
            payload.modelName is not None,
            payload.llmProvider is not None,
            payload.useEnvAsrTts is not None,
        ]
    )
    try:
        ai_config = (
            upsert_ai_config(
                user_id=child.parent_user_id,
                api_key=payload.llmApiKey or payload.apiKey,
                base_url=payload.baseUrl,
                model_name=payload.modelName,
                llm_provider=payload.llmProvider,
                use_env_asr_tts=payload.useEnvAsrTts,
            )
            if should_update_ai
            else find_active_ai_config_by_user_id(child.parent_user_id)
        )
    except ValueError as error:
        raise ChildrenError(400, str(error)) from error

    updated = update_child(
        child.id,
        name=payload.name,
        birth_year=_age_to_birth_year(payload.age) if payload.age is not None else None,
        english_level=None,
        notes=payload.learningGoal,
    )
    if payload.usageLimit is not None:
        set_child_usage_limit(child.id, payload.usageLimit or None)

    session_stats_map = _build_session_stats_map([updated.id])
    return _to_student_profile(updated, ai_config, session_stats_map.get(updated.id))


def increment_child_usage_for_user(user: PublicUser, child_id: str, amount: int = 1) -> dict:
    child = _ensure_child_access(user, child_id)
    new_count = increment_child_usage(child.id, amount)
    _, usage_limit = get_child_ai_usage(child.id)
    return {"childId": child.id, "usageCount": new_count, "usageLimit": usage_limit}

def set_child_avatar_for_user(user: PublicUser, child_id: str, avatar_url: str | None) -> dict:
    child = _ensure_child_access(user, child_id)
    ai_config = find_active_ai_config_by_user_id(child.parent_user_id)
    updated = set_child_avatar(child.id, avatar_url)
    session_stats_map = _build_session_stats_map([updated.id])
    return _to_student_profile(updated, ai_config, session_stats_map.get(updated.id))


def delete_child_for_user(user: PublicUser, child_id: str) -> dict:
    child = _ensure_child_access(user, child_id)
    parent_user_id = child.parent_user_id
    ai_config = find_active_ai_config_by_user_id(parent_user_id)
    was_active = get_active_child_id(parent_user_id) == child.id
    deleted = delete_child(child.id)

    if was_active:
        remaining = find_children_by_parent_id(parent_user_id)
        next_child_id = remaining[0].id if remaining else None
        set_active_child_id(parent_user_id, next_child_id)

    return _to_student_profile(deleted, ai_config, None)


def get_child_ai_runtime_config_for_user(user: PublicUser, child_id: str) -> dict:
    child = _ensure_child_access(user, child_id)
    ai_config = find_active_ai_secret_config_by_user_id(child.parent_user_id)
    return _to_runtime_config(child, ai_config)


def list_daily_missions_for_child(user: PublicUser, child_id: str) -> list[dict]:
    child = _ensure_child_access(user, child_id)
    session_stats = _build_session_stats_map([child.id]).get(child.id, {})
    child_ai_usage = child.ai_usage if isinstance(child.ai_usage, dict) else {}

    completed_sessions = int(session_stats.get("completedSessions", 0) or 0)
    streak_days = int(session_stats.get("currentStreakDays", 0) or 0)
    last_session_mouth_count = int(child_ai_usage.get("lastSessionMouthCount", 0) or 0)

    return [
        {
            "id": "start-a-chat",
            "title": "Bắt đầu một cuộc trò chuyện",
            "detail": "Hoàn thành ít nhất một buổi chat hoặc gọi với Sunny.",
            "progress": min(completed_sessions, 1),
            "total": 1,
            "reward": "+10",
            "status": "done" if completed_sessions >= 1 else "active",
        },
        {
            "id": "speak-3-times",
            "title": "Nói ít nhất 3 lần",
            "detail": "Mở miệng luyện nói ít nhất 3 lượt trong buổi gần nhất.",
            "progress": min(last_session_mouth_count, 3),
            "total": 3,
            "reward": "+20",
            "status": "done" if last_session_mouth_count >= 3 else "active",
        },
        {
            "id": "keep-streak",
            "title": "Giữ chuỗi học",
            "detail": "Quay lại học đều để duy trì đà nói chuyện bằng tiếng Anh.",
            "progress": min(streak_days, 1),
            "total": 1,
            "reward": "+30",
            "status": "done" if streak_days >= 1 else "active",
        },
    ]


def get_leaderboard(limit: int = 50) -> list[dict]:
    raw_board = get_global_leaderboard(limit)
    colors = ["#ffc800", "#ff4b4b", "#1cb0f6", "#84d8ff", "#58cc02", "#ff9600", "#ce82ff", "#ff8888", "#2b70c9"]

    result = []
    for rank, entry in enumerate(raw_board, start=1):
        color_index = sum(ord(char) for char in entry["id"]) % len(colors)
        result.append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "score": entry["xp"],
                "avatarUrl": entry["avatar_url"],
                "avatarColor": colors[color_index],
                "rank": rank,
                "isCurrentPlayer": False,
            }
        )
    return result


def get_game_records_for_child(user: PublicUser, child_id: str) -> dict:
    child = _ensure_child_access(user, child_id)
    return find_game_records_by_child_id(child.id)


def update_game_records_for_child(
    user: PublicUser,
    child_id: str,
    tf_streak: int | None = None,
    word_chain_score: int | None = None,
    flashcard_match_time: int | None = None,
    stories_completed: int | None = None,
    blocks_score: int | None = None,
    blast_score: int | None = None,
) -> dict:
    child = _ensure_child_access(user, child_id)
    return upsert_game_records_by_child_id(
        child.id,
        true_false_streak=tf_streak,
        word_chain_score=word_chain_score,
        flashcard_match_time=flashcard_match_time,
        stories_completed=stories_completed,
        blocks_score=blocks_score,
        blast_score=blast_score,
    )


def get_game_flashcards_for_child(user: PublicUser, child_id: str) -> list[dict]:
    child = _ensure_child_access(user, child_id)
    age = _birth_year_to_age(child.birth_year)
    return find_all_game_flashcards(_game_word_levels_for_child_age(age))


def get_game_stories_for_child(user: PublicUser, child_id: str) -> list[dict]:
    _ensure_child_access(user, child_id)
    return find_all_game_stories()


def add_child_reward_service(
    user: PublicUser,
    child_id: str,
    earned_xp: int,
    mouth_count: int,
) -> dict:
    child = _ensure_child_access(user, child_id)
    
    # Calculate streak
    today = datetime.now(APP_TIMEZONE).date()
    last_practice_date = child.last_practice_date
    current_streak_days = max(0, child.current_streak_days or 0)
    longest_streak_days = max(0, child.longest_streak_days or 0)

    if last_practice_date is None:
        next_current = 1
    else:
        day_diff = (today - last_practice_date).days
        if day_diff == 1:
            next_current = current_streak_days + 1
        elif day_diff > 1:
            next_current = 1
        else:
            next_current = current_streak_days

    next_longest = max(longest_streak_days, next_current)

    updated_child = add_reward_to_child(
        child_id=child.id,
        earned_xp=earned_xp,
        mouth_count=mouth_count,
        activity_date=today,
        current_streak_days=max(1, next_current),
        longest_streak_days=next_longest,
    )
    
    ai_config = find_active_ai_config_by_user_id(updated_child.parent_user_id)
    session_stats_map = _build_session_stats_map([updated_child.id])
    return _to_student_profile(updated_child, ai_config, session_stats_map.get(updated_child.id))
