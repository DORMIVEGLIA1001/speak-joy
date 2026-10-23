"""Business logic for the role-play speaking mode (notes 14/7 · mục 3).

Two responsibilities:
1. DTO the scenario/script/line rows for the frontend (list + detail), mirroring the
   camelCase shape used by topics_service.
2. Score a child's spoken attempt: fetch the chosen line's target option, hand the
   audio to the offline IPA scorer, and return per-word green/red data.
"""

from __future__ import annotations

from be.app.repositories.roleplay_repository import (
    get_line_by_id,
    get_scenario_detail,
    list_scenarios,
)
from be.app.services.ipa_scoring_service import (
    IpaScoringError,
    score_free_utterance,
    score_utterance,
)


class RolePlayError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def _to_scenario_dto(row: dict) -> dict:
    return {
        "id": row["slug"],
        "scenarioId": str(row["id"]),
        "slug": row["slug"],
        "titleEn": row["title_en"],
        "titleVi": row["title_vi"],
        "personaEn": row.get("persona_en"),
        "personaVi": row.get("persona_vi"),
        "emoji": row.get("emoji"),
        "greetingEn": row.get("greeting_en"),
        "greetingVi": row.get("greeting_vi"),
        "ageMin": row.get("age_min"),
        "ageMax": row.get("age_max"),
        "scriptCount": int(row.get("script_count", 0) or 0),
    }


def _to_line_dto(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "order": row["line_order"],
        "aiPromptEn": row["ai_prompt_en"],
        "aiPromptVi": row.get("ai_prompt_vi"),
        "options": row.get("options") or [],
    }


def _to_script_dto(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "slug": row["slug"],
        "order": row["script_order"],
        "titleEn": row.get("title_en"),
        "titleVi": row.get("title_vi"),
        "lines": [_to_line_dto(line) for line in row.get("lines", [])],
    }


def list_scenarios_service(age: int | None) -> list[dict]:
    rows = list_scenarios(age)
    return [_to_scenario_dto(row) for row in rows]


def get_scenario_detail_service(slug: str) -> dict:
    scenario = get_scenario_detail(slug)
    if scenario is None:
        raise RolePlayError(404, "Scenario not found")
    return {
        **_to_scenario_dto(scenario),
        "scripts": [_to_script_dto(script) for script in scenario.get("scripts", [])],
    }


def _target_words_and_ipa(option_text: str, option_ipa: str) -> tuple[list[str], list[str]]:
    """Split an answer option into per-word text + IPA, aligned by position.

    The stored `ipa` is space-separated per word; if a token is missing we pad with an
    empty string so the two lists stay the same length as the word list.
    """
    words = [w for w in option_text.replace(",", " ").replace(".", " ").split() if w]
    ipa_tokens = [t for t in (option_ipa or "").split() if t]
    per_word = [ipa_tokens[i] if i < len(ipa_tokens) else "" for i in range(len(words))]
    return words, per_word


def _find_option(line: dict, option_index: int | None, option_text: str | None) -> dict:
    options = line.get("options") or []
    if not options:
        raise RolePlayError(422, "This line has no answer options")
    if option_index is not None and 0 <= option_index < len(options):
        return options[option_index]
    if option_text:
        target = option_text.strip().lower()
        for option in options:
            if str(option.get("text", "")).strip().lower() == target:
                return option
    raise RolePlayError(400, "Could not match the chosen answer option")


def score_line_attempt(
    line_id_raw: str,
    audio_bytes: bytes,
    option_index: int | None,
    option_text: str | None,
    lang_id: str = "eng",
) -> dict:
    """Grade the child's recorded attempt at one chosen answer option."""
    try:
        line_id = int(line_id_raw)
    except (TypeError, ValueError) as error:
        raise RolePlayError(400, "Invalid line id") from error

    line = get_line_by_id(line_id)
    if line is None:
        raise RolePlayError(404, "Line not found")

    option = _find_option(line, option_index, option_text)
    words, per_word_ipa = _target_words_and_ipa(
        str(option.get("text", "")), str(option.get("ipa", ""))
    )
    if not words:
        raise RolePlayError(422, "Chosen option has no text to score")

    try:
        result = score_utterance(words, per_word_ipa, audio_bytes, lang_id)
    except IpaScoringError as error:
        # Surface the scorer's own status (503 engine down, 400 bad audio…) unchanged.
        raise RolePlayError(error.status_code, error.message) from error

    result["targetText"] = option.get("text", "")
    return result


def score_free_attempt(
    transcript: str,
    audio_bytes: bytes,
    lang_id: str = "eng",
) -> dict:
    """Grade a free-talk recording against the child's own spoken words.

    Free talk has no scripted line, so there's no stored target IPA. We treat the
    browser's speech-recognition transcript as the intended sentence and let the IPA
    service phonemize it to build the target on the fly.
    """
    if not (transcript or "").strip():
        raise RolePlayError(400, "No transcript to score")
    try:
        return score_free_utterance(transcript, audio_bytes, lang_id)
    except IpaScoringError as error:
        raise RolePlayError(error.status_code, error.message) from error
