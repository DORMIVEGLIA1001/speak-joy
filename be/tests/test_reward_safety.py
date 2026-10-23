import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from be.app.schemas.sessions import EndSessionRequest, SessionTranscriptMessage
from be.app.services.sessions_service import SessionsError, create_session_for_user, end_session_for_user
from be.app.services.topics_service import complete_topic_lesson_service


def _session(status: str = "active") -> dict:
    now = datetime.now(timezone.utc)
    return {
        "id": "session-1",
        "user_id": "user-1",
        "child_id": "child-1",
        "topic_id": None,
        "status": status,
        "started_at": now,
        "ended_at": now if status == "completed" else None,
        "turn_count": 0,
        "overall_score": None,
        "summary": None,
        "conversation_transcript": None,
        "recording_url": None,
    }


class RewardSafetyTests(unittest.TestCase):
    def test_learning_session_requires_a_child(self) -> None:
        with self.assertRaises(SessionsError) as raised:
            create_session_for_user(SimpleNamespace(id="user-1"), payload=SimpleNamespace(childId=None, topicId=None))

        self.assertEqual(raised.exception.status_code, 400)

    def test_session_reward_ignores_client_counters(self) -> None:
        payload = EndSessionRequest(
            mouthCount=10_000,
            earnedXp=100_000,
            overallScore=100,
            transcript=[
                SessionTranscriptMessage(role="user", content="hello"),
                SessionTranscriptMessage(role="assistant", content="hi"),
                SessionTranscriptMessage(role="user", content="goodbye"),
            ],
        )
        completed = {**_session("completed"), "turn_count": 2}

        with (
            patch("be.app.services.sessions_service.find_session_for_user", return_value=_session()),
            patch("be.app.services.sessions_service.complete_session_with_reward", return_value=completed) as save,
        ):
            end_session_for_user(SimpleNamespace(id="user-1"), "session-1", payload)

        self.assertEqual(save.call_args.kwargs["mouth_count"], 2)
        self.assertEqual(save.call_args.kwargs["earned_xp"], 10)
        self.assertEqual(save.call_args.kwargs["overall_score"], 10)

    def test_completed_session_retry_does_not_apply_reward(self) -> None:
        with (
            patch("be.app.services.sessions_service.find_session_for_user", return_value=_session("completed")),
            patch("be.app.services.sessions_service.complete_session_with_reward") as save,
        ):
            end_session_for_user(SimpleNamespace(id="user-1"), "session-1", EndSessionRequest())

        save.assert_not_called()

    def test_topic_reward_is_selected_by_server(self) -> None:
        child = SimpleNamespace(
            id="child-1",
            parent_user_id="user-1",
            last_practice_date=None,
            current_streak_days=0,
            longest_streak_days=0,
        )
        topic = {"id": 1, "slug": "colors", "vocabulary_count": 5}

        with (
            patch("be.app.services.topics_service.find_child_by_id", return_value=child),
            patch("be.app.services.topics_service.find_topic_by_slug_or_id", return_value=topic),
            patch("be.app.services.topics_service.complete_topic_lesson", return_value=True) as save,
            patch("be.app.services.topics_service.find_child_daily_activity", return_value={"pronunciations_count": 1}),
            patch("be.app.services.topics_service.count_completed_lessons", return_value=1),
        ):
            result = complete_topic_lesson_service(
                user=SimpleNamespace(id="user-1", role="parent"),
                topic_id="colors",
                child_id="child-1",
                lesson_key="colors-lesson-1",
                mouth_count_raw=999,
                score_raw=100,
            )

        self.assertEqual(save.call_args.kwargs["mouth_count"], 1)
        self.assertEqual(save.call_args.kwargs["earned_xp"], 20)
        self.assertEqual(result["earnedXp"], 20)


if __name__ == "__main__":
    unittest.main()
