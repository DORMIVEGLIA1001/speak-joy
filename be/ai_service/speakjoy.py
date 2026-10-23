from __future__ import annotations

import asyncio
import logging
import re
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Literal, Protocol


WORD_PATTERN = re.compile(r"\S+")
SENTENCE_BOUNDARY_PATTERN = re.compile(r"(?<=[.!?])\s+")
CLAUSE_BOUNDARY_PATTERN = re.compile(r"(?<=[,;:])\s+")
DEFAULT_PAUSE_MS = 400
DEFAULT_TTS_WORDS_PER_CHUNK = 5
LLM_429_BASE_COOLDOWN_SECONDS = 20.0
LLM_429_MAX_COOLDOWN_SECONDS = 90.0
RAPID_FOLLOWUP_WINDOW_SECONDS = 2.5
RAPID_FOLLOWUP_MAX_WORDS = 3
TURN_RATE_WINDOW_SECONDS = 12.0
MAX_TURNS_PER_WINDOW = 4
MAX_RECENT_HISTORY_MESSAGES = 6
MAX_MEMORY_SNIPPETS = 3
MIN_ADAPTIVE_PAUSE_MS = 350
SHORT_UTTERANCE_EXTRA_PAUSE_MS = 500
MEDIUM_UTTERANCE_EXTRA_PAUSE_MS = 260
CONTINUATION_EXTRA_PAUSE_MS = 320
TERMINAL_PUNCTUATION_PAUSE_REDUCTION_MS = 140
COALESCE_WINDOW_MS = 350
COALESCE_MAX_WORDS = 6
COALESCE_CONTINUATION_WORDS = {
    "and",
    "but",
    "because",
    "so",
    "then",
    "when",
    "if",
    "that",
    "to",
    "with",
    "for",
    "after",
    "before",
}
MIN_STREAMING_CLAUSE_WORDS = 3
MIN_STREAMING_FORCE_FLUSH_WORDS = 5
MIN_UI_STREAMING_CLAUSE_WORDS = 3
MIN_UI_STREAMING_FORCE_FLUSH_WORDS = 5
SHORT_TRANSCRIPT_ALLOWLIST = {
    "thank you",
    "hello joy",
    "goodbye joy",
    "play with me",
    "help me",
    "i'm ready",
    "i am ready",
}
LOW_INFORMATION_TRANSCRIPTS = {
    "the",
    "yeah",
    "oh",
    "uh",
    "um",
    "hmm",
    "what",
    "okay",
    "ok",
    "oh yeah",
    "uh huh",
    "huh",
}

logger = logging.getLogger(__name__)


class LlmQuotaExceeded(RuntimeError):
    pass


@dataclass(slots=True, frozen=True)
class LlmStrategy:
    label: str
    provider: str
    api_key: str
    model_name: str
    base_url: str = ""


class LlmReplyFn(Protocol):
    async def __call__(
        self,
        *,
        message: str,
        history: list[dict[str, str]],
        child_age: int,
        child_name: str,
        topic_name: str,
        vocabulary: list[str],
    ) -> str: ...


class LlmTokenStreamFn(Protocol):
    async def __call__(
        self,
        *,
        message: str,
        history: list[dict[str, str]],
        child_age: int,
        child_name: str,
        topic_name: str,
        vocabulary: list[str],
    ) -> AsyncGenerator[str, None]: ...


class TtsChunkFn(Protocol):
    async def __call__(
        self,
        *,
        text: str,
        chunk_index: int,
        speaker: str = "Ryan",
        child_id: str = "",
    ) -> bytes: ...


@dataclass(slots=True)
class RealtimeTranscriptState:
    partial_text: str = ""
    committed_text: str = ""
    last_partial_at: float = 0.0
    last_commit_at: float = 0.0

    def update_partial(self, text: str, now: float | None = None) -> None:
        self.partial_text = _normalize_space(text)
        self.last_partial_at = now or time.monotonic()

    def commit_current(self, now: float | None = None) -> str:
        text = _normalize_space(self.partial_text)
        self.committed_text = text
        self.last_commit_at = now or time.monotonic()
        self.partial_text = ""
        return text

    def idle_for_ms(self, now: float | None = None) -> float:
        if self.last_partial_at <= 0:
            return 0.0
        return max(0.0, ((now or time.monotonic()) - self.last_partial_at) * 1000.0)


@dataclass(slots=True)
class TtsPlaybackBuffer:
    pending_chunks: list["SpeakJoyTtsChunk"] = field(default_factory=list)
    next_chunk_index: int = 0

    def push(self, chunk: "SpeakJoyTtsChunk") -> None:
        self.pending_chunks.append(chunk)

    def mark_played(self, chunk_index: int) -> None:
        self.pending_chunks = [chunk for chunk in self.pending_chunks if chunk.chunk_index != chunk_index]


@dataclass(slots=True)
class SpeakJoyConfig:
    child_age: int = 7
    child_name: str = "friend"
    child_id: str = ""
    topic_name: str = ""
    vocabulary: list[str] = field(default_factory=list)
    speaker: str = "Ryan"
    pause_after_ms: int = DEFAULT_PAUSE_MS
    tts_words_per_chunk: int = DEFAULT_TTS_WORDS_PER_CHUNK
    llm_provider: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = ""


@dataclass(slots=True)
class SpeakJoyAsrPartial:
    text: str
    is_final: bool = False
    received_at: float = field(default_factory=time.monotonic)


@dataclass(slots=True)
class SpeakJoyTtsChunk:
    chunk_index: int
    text: str
    audio_bytes: bytes


@dataclass(slots=True)
class SpeakJoyEvent:
    type: Literal[
        "asr_partial",
        "asr_final",
        "llm_started",
        "llm_token",
        "llm_final",
        "tts_text_ready",
        "tts_chunk_ready",
        "tts_chunk_played",
        "turn_closed",
        "session_state",
        "assistant_interrupted",
        "ack",
        "error",
    ]
    payload: dict[str, Any]


@dataclass(slots=True)
class SpeakJoySessionState:
    status: Literal["idle", "listening", "thinking", "speaking", "interrupted", "closed"] = "idle"
    turn_id: int | None = None
    generation_id: int | None = None


@dataclass(slots=True)
class SpeakJoyTurnTelemetry:
    input_started_at: float = 0.0
    asr_first_partial_at: float = 0.0
    asr_final_at: float = 0.0
    llm_started_at: float = 0.0
    llm_first_token_at: float = 0.0
    llm_final_at: float = 0.0
    tts_first_text_ready_at: float = 0.0
    tts_first_chunk_ready_at: float = 0.0

    def reset(self) -> None:
        self.input_started_at = 0.0
        self.asr_first_partial_at = 0.0
        self.asr_final_at = 0.0
        self.llm_started_at = 0.0
        self.llm_first_token_at = 0.0
        self.llm_final_at = 0.0
        self.tts_first_text_ready_at = 0.0
        self.tts_first_chunk_ready_at = 0.0


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _split_tts_chunks(text: str, words_per_chunk: int) -> list[str]:
    normalized = _normalize_space(text)
    if not normalized:
        return []

    sentence_parts = [part.strip() for part in SENTENCE_BOUNDARY_PATTERN.split(normalized) if part.strip()]
    if not sentence_parts:
        sentence_parts = [normalized]

    chunks: list[str] = []
    for sentence in sentence_parts:
        sentence_words = WORD_PATTERN.findall(sentence)
        if len(sentence_words) <= words_per_chunk + 4:
            chunks.append(sentence)
            continue

        clause_parts = [part.strip() for part in CLAUSE_BOUNDARY_PATTERN.split(sentence) if part.strip()]
        if len(clause_parts) > 1:
            for clause in clause_parts:
                clause_words = WORD_PATTERN.findall(clause)
                if len(clause_words) <= words_per_chunk + 4:
                    chunks.append(clause)
                else:
                    chunks.extend(
                        " ".join(clause_words[index:index + words_per_chunk])
                        for index in range(0, len(clause_words), words_per_chunk)
                    )
            continue

        chunks.extend(
            " ".join(sentence_words[index:index + words_per_chunk])
            for index in range(0, len(sentence_words), words_per_chunk)
        )

    return _merge_small_tts_tail(chunks, words_per_chunk)


def _merge_small_tts_tail(chunks: list[str], words_per_chunk: int) -> list[str]:
    if len(chunks) < 2:
        return chunks

    merged: list[str] = []
    min_tail_words = max(4, words_per_chunk // 2)

    for chunk in chunks:
        current = _normalize_space(chunk)
        if not current:
            continue

        current_words = WORD_PATTERN.findall(current)
        if merged and len(current_words) < min_tail_words:
            previous = merged.pop()
            merged.append(_normalize_space(f"{previous} {current}"))
            continue

        merged.append(current)

    if len(merged) >= 2:
        last_words = WORD_PATTERN.findall(merged[-1])
        previous_words = WORD_PATTERN.findall(merged[-2])
        if len(last_words) < min_tail_words and len(previous_words) + len(last_words) <= words_per_chunk + min_tail_words:
            tail = merged.pop()
            merged[-1] = _normalize_space(f"{merged[-1]} {tail}")

    return merged


def _safe_sentence_prefix(text: str) -> str:
    normalized = _normalize_space(text)
    if not normalized:
        return ""

    sentence_parts = [part.strip() for part in SENTENCE_BOUNDARY_PATTERN.split(normalized) if part.strip()]
    if sentence_parts:
        return sentence_parts[0]
    return normalized


def _safe_clause_prefix(text: str) -> str:
    normalized = _normalize_space(text)
    if not normalized:
        return ""

    clause_parts = [part.strip() for part in CLAUSE_BOUNDARY_PATTERN.split(normalized) if part.strip()]
    if clause_parts:
        return clause_parts[0]
    return normalized


def _should_reject_short_transcript(text: str) -> bool:
    normalized = _normalize_space(text).lower()
    if not normalized:
        return True

    normalized_alpha = re.sub(r"[^a-z0-9\s']", " ", normalized)
    normalized_alpha = re.sub(r"\s+", " ", normalized_alpha).strip()

    if normalized_alpha in SHORT_TRANSCRIPT_ALLOWLIST:
        return False

    words = [word for word in re.findall(r"[a-z0-9']+", normalized_alpha) if word]
    return len(words) < 2


def _is_low_information_transcript(text: str) -> bool:
    normalized = _normalize_space(text).lower()
    if not normalized:
        return True

    normalized_alpha = re.sub(r"[^a-z0-9\s']", " ", normalized)
    normalized_alpha = re.sub(r"\s+", " ", normalized_alpha).strip()
    if normalized_alpha in SHORT_TRANSCRIPT_ALLOWLIST:
        return False

    if normalized_alpha in LOW_INFORMATION_TRANSCRIPTS:
        return True

    words = [word for word in re.findall(r"[a-z0-9']+", normalized_alpha) if word]
    if len(words) <= 2 and all(word in LOW_INFORMATION_TRANSCRIPTS for word in words):
        return True

    return False


def _count_transcript_words(text: str) -> int:
    normalized = _normalize_space(text).lower()
    normalized_alpha = re.sub(r"[^a-z0-9\s']", " ", normalized)
    words = [word for word in re.findall(r"[a-z0-9']+", normalized_alpha) if word]
    return len(words)


def _ends_with_terminal_punctuation(text: str) -> bool:
    normalized = _normalize_space(text)
    return bool(normalized) and normalized[-1] in ".?!"


def _last_transcript_word(text: str) -> str:
    words = re.findall(r"[a-z0-9']+", _normalize_space(text).lower())
    return words[-1] if words else ""


def _looks_like_continuation_fragment(text: str) -> bool:
    normalized = _normalize_space(text)
    if not normalized:
        return False
    if _ends_with_terminal_punctuation(normalized):
        return False
    last_word = _last_transcript_word(normalized)
    if last_word in COALESCE_CONTINUATION_WORDS:
        return True
    word_count = _count_transcript_words(normalized)
    return 0 < word_count <= 5


def _adaptive_pause_ms(text: str, base_pause_ms: int) -> int:
    normalized = _normalize_space(text)
    if not normalized:
        return max(MIN_ADAPTIVE_PAUSE_MS, base_pause_ms)

    word_count = _count_transcript_words(normalized)
    adaptive = max(base_pause_ms, MIN_ADAPTIVE_PAUSE_MS)

    if word_count <= 2:
        adaptive += SHORT_UTTERANCE_EXTRA_PAUSE_MS
    elif word_count <= 6:
        adaptive += MEDIUM_UTTERANCE_EXTRA_PAUSE_MS

    if _looks_like_continuation_fragment(normalized):
        adaptive += CONTINUATION_EXTRA_PAUSE_MS

    if _ends_with_terminal_punctuation(normalized) and word_count >= 4:
        adaptive = max(MIN_ADAPTIVE_PAUSE_MS, adaptive - TERMINAL_PUNCTUATION_PAUSE_REDUCTION_MS)

    return adaptive


def _merge_utterance_fragments(left: str, right: str) -> str:
    first = _normalize_space(left)
    second = _normalize_space(right)
    if not first:
        return second
    if not second:
        return first
    if first.endswith(("-", "/", ",")):
        return _normalize_space(f"{first} {second}")
    if _ends_with_terminal_punctuation(first):
        return _normalize_space(f"{first} {second}")
    return _normalize_space(f"{first} {second}")


def _history_label_for_role(role: str) -> str:
    if role == "user":
        return "Child"
    if role == "bot":
        return "Joy"
    return "Memory"


def _build_history_summary(history: list[dict[str, str]]) -> str:
    informative_messages: list[str] = []
    seen: set[str] = set()
    for item in reversed(history):
        if item.get("role") != "user":
            continue
        content = _normalize_space(item.get("content", ""))
        if _count_transcript_words(content) < 4:
            continue
        key = content.lower()
        if key in seen:
            continue
        seen.add(key)
        informative_messages.append(content)
        if len(informative_messages) >= MAX_MEMORY_SNIPPETS:
            break

    if not informative_messages:
        return ""

    informative_messages.reverse()
    return "Earlier in the chat, the child talked about: " + " | ".join(informative_messages) + "."


def _build_local_fallback_reply(*, message: str, child_name: str, history: list[dict[str, str]]) -> str:
    normalized = _normalize_space(message)
    lowered = normalized.lower()

    topic_rules: list[tuple[set[str], tuple[str, str]]] = [
        ({"food", "eat", "rice", "pizza", "cake", "apple"}, ("Yummy, that sounds like a tasty food.", "What food do you want to try next?")),
        ({"game", "play", "chess", "soccer", "football", "toy"}, ("That sounds like a fun game.", "How do you like to play it?")),
        ({"draw", "drawing", "art", "paint", "picture"}, ("Wow, art is a wonderful way to show ideas.", "What do you like to draw most?")),
        ({"school", "class", "teacher", "friend", "study"}, ("School can be full of interesting things.", "What was your favorite part?")),
        ({"dog", "cat", "animal", "bird", "fish"}, ("Animals can be so fun to talk about.", "Which animal do you like best?")),
        ({"mom", "dad", "family", "brother", "sister"}, ("Your family sounds important to you.", "What do you like to do together?")),
    ]

    for keywords, response in topic_rules:
        if any(keyword in lowered for keyword in keywords):
            return " ".join(response)

    if lowered.startswith(("i like", "i love", "my favorite")):
        return "That sounds great to me. What do you like most about it?"

    if "?" in normalized:
        return f"That's a good question, {child_name}. What do you think first?"

    previous_user_topics = [
        item.get("content", "")
        for item in reversed(history)
        if item.get("role") == "user" and item.get("content", "").strip()
    ]
    if len(previous_user_topics) >= 2 and previous_user_topics[0] != previous_user_topics[1]:
        return "You have so many fun ideas to share. Which one do you want to talk about more?"

    return f"That sounds interesting, {child_name}. Can you tell me a little more?"


async def default_freestyle_llm_reply(
    *,
    message: str,
    history: list[dict[str, str]],
    child_age: int,
    child_name: str,
    topic_name: str,
    vocabulary: list[str],
) -> str:
    from be.ai_service.app import (
        AI_API_KEY,
        AI_PROVIDER,
        DEFAULT_AI_MODEL,
        _build_freestyle_system_prompt,
        _build_topic_chat_system_prompt,
        _chat_with_history,
    )

    system_prompt = (
        _build_topic_chat_system_prompt(
            child_age=child_age,
            child_name=child_name,
            topic_name=topic_name,
            vocabulary=vocabulary,
        )
        if topic_name.strip() and vocabulary
        else _build_freestyle_system_prompt(child_age=child_age, child_name=child_name)
    )

    chat_history = list(history)
    chat_history.append({"role": "user", "content": message})
    return await _chat_with_history(
        messages=chat_history,
        system_prompt=system_prompt,
        provider=AI_PROVIDER,
        api_key=AI_API_KEY,
        model_name=DEFAULT_AI_MODEL,
    )


async def default_freestyle_llm_stream(
    *,
    message: str,
    history: list[dict[str, str]],
    child_age: int,
    child_name: str,
    topic_name: str,
    vocabulary: list[str],
) -> AsyncGenerator[str, None]:
    from be.ai_service.app import (
        AI_API_KEY,
        AI_PROVIDER,
        DEFAULT_AI_MODEL,
        _build_freestyle_system_prompt,
        _build_topic_chat_system_prompt,
        _is_quota_error,
        _normalize_freestyle_reply,
        _stream_llm,
    )

    system_prompt = (
        _build_topic_chat_system_prompt(
            child_age=child_age,
            child_name=child_name,
            topic_name=topic_name,
            vocabulary=vocabulary,
        )
        if topic_name.strip() and vocabulary
        else _build_freestyle_system_prompt(child_age=child_age, child_name=child_name)
    )

    recent = history[-10:] + [{"role": "user", "content": message}]
    history_lines = [
        f"{'Child' if item.get('role') == 'user' else 'Joy'}: {item.get('content', '').strip()}"
        for item in recent
        if item.get("content", "").strip()
    ]
    prompt = (
        f"{system_prompt}\n\n"
        f"--- Conversation so far ---\n"
        f"{chr(10).join(history_lines)}\n\n"
        f"Now reply as Joy (max 2 sentences, end with a question):\nJoy:"
    )

    collected: list[str] = []
    try:
        async for token in _stream_llm(
            provider=AI_PROVIDER,
            api_key=AI_API_KEY,
            prompt=prompt,
            max_tokens=200,
            model_name=DEFAULT_AI_MODEL,
        ):
            collected.append(token)
            yield token
    except Exception as error:
        if not _is_quota_error(error):
            raise
        raise LlmQuotaExceeded("LLM quota exceeded") from error

    normalized = _normalize_freestyle_reply("".join(collected))
    if normalized != "".join(collected).strip():
        # Emit the normalized tail only if the model stream ended in a form that
        # needs cleanup. This keeps the UI mostly incremental while preserving the
        # post-processor guarantees used in the rest of the service.
        tail = normalized[len(_normalize_space("".join(collected))):].strip()
        if tail:
            yield f" {tail}"


async def default_tts_chunk(
    *,
    text: str,
    chunk_index: int,
    speaker: str = "Ryan",
    child_id: str = "",
) -> bytes:
    from be.ai_service.app import synthesize_tts

    audio_bytes, _sample_rate = await synthesize_tts(
        text=text,
        speaker=speaker or "Ryan",
        language="English",
        instruct=(
            "Speak in a warm, natural, friendly way for a child learning English. "
            "Use smooth pacing, short natural pauses, and avoid sounding robotic."
        ),
    )
    return audio_bytes


class SpeakJoyRealtimeSession:
    """
    Realtime coordinator for low-latency child conversation.

    Core ideas implemented here:
    - ASR pushes partial text continuously into the session.
    - The session only closes a child turn after ~500 ms of silence.
    - LLM can start as soon as the turn is closed, and streams text token-by-token.
    - TTS does not wait for the full paragraph. It buffers short text chunks and
      emits them immediately so the client can show text first, then play speech.

    The class is intentionally transport-agnostic. A websocket endpoint can feed
    ASR partials into `push_asr_partial()` and stream `SpeakJoyEvent` values from
    `events()`.
    """

    def __init__(
        self,
        *,
        config: SpeakJoyConfig | None = None,
        llm_reply_fn: LlmReplyFn | None = None,
        llm_stream_fn: LlmTokenStreamFn | None = None,
        tts_chunk_fn: TtsChunkFn | None = None,
    ) -> None:
        self.config = config or SpeakJoyConfig()
        self.llm_reply_fn = llm_reply_fn or default_freestyle_llm_reply
        self.llm_stream_fn = llm_stream_fn or default_freestyle_llm_stream
        self.tts_chunk_fn = tts_chunk_fn or default_tts_chunk

        self.transcript = RealtimeTranscriptState()
        self.tts_buffer = TtsPlaybackBuffer()
        self.history: list[dict[str, str]] = []
        self.event_queue: asyncio.Queue[SpeakJoyEvent] = asyncio.Queue()
        self._pause_task: asyncio.Task[None] | None = None
        self._reply_task: asyncio.Task[None] | None = None
        self._closed = False
        self._turn_sequence = 0
        self._generation_sequence = 0
        self._active_turn_id: int | None = None
        self._reply_turn_id: int | None = None
        self._active_generation_id: int | None = None
        self._llm_cooldown_until = 0.0
        self._quota_backoff_level = 0
        self._last_user_turn_at = 0.0
        self._last_user_message = ""
        self._recent_turn_timestamps: deque[float] = deque()
        self._coalesce_task: asyncio.Task[None] | None = None
        self._tts_tasks: set[asyncio.Task[None]] = set()
        self._pending_user_fragment = ""
        self._pending_user_fragment_reason = ""
        self._pending_user_fragment_at = 0.0
        self._state = SpeakJoySessionState()
        self._telemetry = SpeakJoyTurnTelemetry()

    async def close(self) -> None:
        if self._closed:
            return

        for task in (self._pause_task, self._reply_task, self._coalesce_task, *self._tts_tasks):
            if task and not task.done():
                task.cancel()
        await self._set_session_state("closed")
        await self._emit("turn_closed", {"reason": "session_closed"})
        self._closed = True

    async def interrupt_current_turn(self, *, reason: str = "client_interrupt") -> None:
        interrupted_generation_id = self._active_generation_id
        interrupted_turn_id = self._active_turn_id

        for task in (self._pause_task, self._reply_task, self._coalesce_task, *self._tts_tasks):
            if task and not task.done():
                task.cancel()

        self._pause_task = None
        self._reply_task = None
        self._coalesce_task = None
        self._tts_tasks.clear()
        self._clear_pending_user_fragment()
        self.transcript.partial_text = ""
        self.tts_buffer.pending_chunks.clear()

        await self._set_session_state("interrupted", turn_id=interrupted_turn_id, generation_id=interrupted_generation_id)
        await self._emit(
            "assistant_interrupted",
            {
                "reason": reason,
                "turn_id": interrupted_turn_id,
                "generation_id": interrupted_generation_id,
            },
        )
        self._active_turn_id = None
        self._reply_turn_id = None
        self._active_generation_id = None
        await self._set_session_state("idle")

    async def events(self) -> AsyncGenerator[SpeakJoyEvent, None]:
        while True:
            event = await self.event_queue.get()
            yield event
            if event.type == "turn_closed" and event.payload.get("reason") == "session_closed":
                return

    async def push_asr_partial(self, partial: SpeakJoyAsrPartial) -> None:
        if self._closed:
            return

        if self._is_turn_blocked():
            return

        if partial.text and not self.transcript.partial_text and not self._pending_user_fragment:
            self._telemetry.reset()

        if partial.text and self._telemetry.input_started_at <= 0:
            self._telemetry.input_started_at = partial.received_at

        if partial.text and self._telemetry.asr_first_partial_at <= 0:
            self._telemetry.asr_first_partial_at = time.monotonic()
            await self._emit_timing_mark(
                "asr_first_partial",
                received_at=partial.received_at,
            )

        await self._set_session_state("listening", turn_id=self._active_turn_id, generation_id=self._active_generation_id)
        self.transcript.update_partial(partial.text, partial.received_at)
        await self._emit(
            "asr_partial",
            {
                "text": self.transcript.partial_text,
                "words": WORD_PATTERN.findall(self.transcript.partial_text),
                "received_at": partial.received_at,
            },
        )

        if partial.is_final:
            await self._finalize_child_turn(reason="asr_final")
            return

        self._schedule_pause_detector()

    def _schedule_pause_detector(self) -> None:
        if self._pause_task and not self._pause_task.done():
            self._pause_task.cancel()
        self._pause_task = asyncio.create_task(self._await_pause_then_finalize())

    async def _await_pause_then_finalize(self) -> None:
        try:
            target_pause_ms = _adaptive_pause_ms(self.transcript.partial_text, self.config.pause_after_ms)
            await asyncio.sleep(target_pause_ms / 1000.0)
            if self.transcript.idle_for_ms() >= target_pause_ms:
                await self._finalize_child_turn(reason="pause_detected")
        except asyncio.CancelledError:
            return

    def _prune_recent_turn_timestamps(self, now: float) -> None:
        while self._recent_turn_timestamps and now - self._recent_turn_timestamps[0] > TURN_RATE_WINDOW_SECONDS:
            self._recent_turn_timestamps.popleft()

    def _is_turn_rate_limited(self, now: float) -> bool:
        self._prune_recent_turn_timestamps(now)
        return len(self._recent_turn_timestamps) >= MAX_TURNS_PER_WINDOW

    def _build_compact_history(self) -> tuple[list[dict[str, str]], str]:
        prior_history = list(self.history[:-1])
        if len(prior_history) <= MAX_RECENT_HISTORY_MESSAGES:
            return prior_history, ""

        compact_history = prior_history[-MAX_RECENT_HISTORY_MESSAGES:]
        summary = _build_history_summary(prior_history[:-MAX_RECENT_HISTORY_MESSAGES])
        return compact_history, summary

    def _build_llm_strategies(self) -> list[LlmStrategy]:
        from be.ai_service.app import build_llm_strategy_chain

        strategies: list[LlmStrategy] = []
        config_provider = (self.config.llm_provider or "").strip()
        config_model = (self.config.llm_model or "").strip()
        config_api_key = (self.config.llm_api_key or "").strip()
        if config_provider and config_model and config_api_key:
            strategies.append(
                LlmStrategy(
                    label="session",
                    provider=config_provider,
                    api_key=config_api_key,
                    model_name=config_model,
                    base_url=(self.config.llm_base_url or "").strip(),
                )
            )

        for raw in build_llm_strategy_chain():
            provider = (raw.get("provider") or "").strip()
            model_name = (raw.get("model_name") or "").strip()
            api_key = (raw.get("api_key") or "").strip()
            if not provider or not model_name or not api_key:
                continue
            if any(
                existing.provider == provider
                and existing.model_name == model_name
                and existing.base_url == (raw.get("base_url") or "").strip()
                and existing.api_key == api_key
                for existing in strategies
            ):
                continue
            strategies.append(
                LlmStrategy(
                    label=(raw.get("label") or "provider").strip(),
                    provider=provider,
                    api_key=api_key,
                    model_name=model_name,
                    base_url=(raw.get("base_url") or "").strip(),
                )
            )
        return strategies

    def _clear_pending_user_fragment(self) -> None:
        self._pending_user_fragment = ""
        self._pending_user_fragment_reason = ""
        self._pending_user_fragment_at = 0.0
        current_task = asyncio.current_task()
        if self._coalesce_task and self._coalesce_task is not current_task and not self._coalesce_task.done():
            self._coalesce_task.cancel()
        self._coalesce_task = None

    def _should_hold_for_coalesce(self, message: str, reason: str) -> bool:
        if _is_low_information_transcript(message):
            return False
        word_count = _count_transcript_words(message)
        if word_count == 0:
            return False
        if _ends_with_terminal_punctuation(message) and word_count >= 4:
            return False
        if reason == "pause_detected" and word_count <= COALESCE_MAX_WORDS:
            return True
        return _looks_like_continuation_fragment(message) and word_count <= COALESCE_MAX_WORDS

    async def _await_coalesce_then_process(self) -> None:
        try:
            await asyncio.sleep(COALESCE_WINDOW_MS / 1000.0)
            pending_message = self._pending_user_fragment
            pending_reason = self._pending_user_fragment_reason or "coalesced"
            self._clear_pending_user_fragment()
            if pending_message:
                await self._process_child_turn_message(pending_message, reason=pending_reason)
        except asyncio.CancelledError:
            return

    async def _stage_pending_user_fragment(self, message: str, reason: str, *, merged: bool) -> None:
        self._pending_user_fragment = message
        self._pending_user_fragment_reason = reason
        self._pending_user_fragment_at = time.monotonic()
        if self._coalesce_task and not self._coalesce_task.done():
            self._coalesce_task.cancel()
        self._coalesce_task = asyncio.create_task(self._await_coalesce_then_process())
        await self._emit(
            "ack",
            {
                "kind": "partial_turn_buffered",
                "merged": merged,
                "text": message,
                "window_ms": COALESCE_WINDOW_MS,
            },
        )

    async def _finalize_child_turn(self, *, reason: str) -> None:
        if self.is_turn_open():
            return

        message = self.transcript.commit_current()
        if not message:
            return

        if self._pending_user_fragment:
            message = _merge_utterance_fragments(self._pending_user_fragment, message)
            self._clear_pending_user_fragment()
            if self._should_hold_for_coalesce(message, reason):
                await self._stage_pending_user_fragment(message, "coalesced", merged=True)
                return
            await self._process_child_turn_message(message, reason="coalesced")
            return

        if self._should_hold_for_coalesce(message, reason):
            await self._stage_pending_user_fragment(message, reason, merged=False)
            return

        await self._process_child_turn_message(message, reason=reason)

    async def _process_child_turn_message(self, message: str, *, reason: str) -> None:
        if not message:
            return

        if _should_reject_short_transcript(message):
            await self._emit(
                "error",
                {"message": "I only heard a very short phrase. Please say a full sentence."},
            )
            return

        if _is_low_information_transcript(message):
            await self._emit(
                "error",
                {"message": "I only heard a short sound like yeah or oh. Please say a full idea."},
            )
            return

        now = time.monotonic()
        gap_since_last_turn = now - self._last_user_turn_at
        if (
            self._last_user_turn_at > 0
            and gap_since_last_turn < RAPID_FOLLOWUP_WINDOW_SECONDS
            and _count_transcript_words(message) <= RAPID_FOLLOWUP_MAX_WORDS
        ):
            await self._emit(
                "ack",
                {
                    "kind": "rapid_followup_ignored",
                    "seconds_since_last_turn": round(gap_since_last_turn, 2),
                    "text": message,
                },
            )
            await self._emit(
                "error",
                {"message": "Please tell me a little more so I can answer better."},
            )
            return

        if self._is_turn_rate_limited(now):
            await self._emit(
                "ack",
                {
                    "kind": "turn_rate_limited",
                    "window_seconds": TURN_RATE_WINDOW_SECONDS,
                    "max_turns": MAX_TURNS_PER_WINDOW,
                    "text": message,
                },
            )
            await self._emit(
                "error",
                {"message": "Let's go one idea at a time. Please say one full thought."},
            )
            return

        self._turn_sequence += 1
        turn_id = self._turn_sequence
        self._active_turn_id = turn_id
        self._last_user_turn_at = now
        self._last_user_message = message
        self._recent_turn_timestamps.append(now)

        self.history.append({"role": "user", "content": message})
        self._telemetry.asr_final_at = time.monotonic()
        await self._emit(
            "asr_final",
            {
                "text": message,
                "reason": reason,
                "turn_id": turn_id,
            },
        )
        await self._emit_timing_mark(
            "asr_final",
            turn_id=turn_id,
            reason=reason,
            text=message,
        )

        self._reply_turn_id = turn_id
        await self._set_session_state("thinking", turn_id=turn_id, generation_id=self._active_generation_id)
        self._reply_task = asyncio.create_task(self._run_ai_reply(message, turn_id))

    async def _run_ai_reply(self, message: str, turn_id: int) -> None:
        llm_mode = "remote"
        if self.is_in_llm_cooldown():
            llm_mode = "fallback"

        self._generation_sequence += 1
        generation_id = self._generation_sequence
        self._active_generation_id = generation_id
        self._telemetry.llm_started_at = time.monotonic()
        await self._set_session_state("thinking", turn_id=turn_id, generation_id=generation_id)
        await self._emit(
            "llm_started",
            {
                "message": message,
                "turn_id": turn_id,
                "generation_id": generation_id,
                "mode": llm_mode,
            },
        )
        await self._emit_timing_mark(
            "llm_started",
            turn_id=turn_id,
            generation_id=generation_id,
            mode=llm_mode,
        )

        try:
            try:
                if llm_mode == "fallback":
                    reply_text = await self._stream_local_fallback_reply(message, generation_id=generation_id)
                else:
                    reply_text = await self._stream_reply_text(message, generation_id=generation_id)
                    self._quota_backoff_level = 0
            except asyncio.CancelledError:
                return
            except LlmQuotaExceeded:
                self._quota_backoff_level += 1
                cooldown_seconds = min(
                    LLM_429_MAX_COOLDOWN_SECONDS,
                    LLM_429_BASE_COOLDOWN_SECONDS * (2 ** max(0, self._quota_backoff_level - 1)),
                )
                self._llm_cooldown_until = time.monotonic() + cooldown_seconds
                await self._emit(
                    "ack",
                    {
                        "kind": "llm_cooldown_started",
                        "seconds": int(cooldown_seconds),
                        "turn_id": turn_id,
                    },
                )
                reply_text = await self._stream_local_fallback_reply(message, generation_id=generation_id)
            except Exception as error:  # pragma: no cover - defensive coordinator
                await self._emit("error", {"message": str(error)})
                return

            final_reply = _normalize_space(reply_text)
            if not final_reply:
                return

            self.history.append({"role": "bot", "content": final_reply})
            self._telemetry.llm_final_at = time.monotonic()
            await self._emit(
                "llm_final",
                {
                    "text": final_reply,
                    "turn_id": turn_id,
                    "generation_id": generation_id,
                },
            )
            await self._emit_timing_mark(
                "llm_final",
                turn_id=turn_id,
                generation_id=generation_id,
                chars=len(final_reply),
            )
        finally:
            self._reply_turn_id = None
            self._active_turn_id = None
            self._active_generation_id = None
            if not self._closed:
                await self._set_session_state("idle")

    async def _stream_local_fallback_reply(self, message: str, *, generation_id: int) -> str:
        reply_text = _build_local_fallback_reply(
            message=message,
            child_name=self.config.child_name,
            history=self.history,
        )
        await self._mark_llm_first_token(generation_id=generation_id)
        await self._emit("llm_token", {"token": reply_text, "text": reply_text, "generation_id": generation_id})
        self.tts_buffer.next_chunk_index = await self._enqueue_tts_chunks(
            reply_text,
            self.tts_buffer.next_chunk_index,
            generation_id=generation_id,
        )
        return reply_text

    async def _stream_reply_text(self, message: str, *, generation_id: int) -> str:
        if self.llm_stream_fn is not default_freestyle_llm_stream:
            return await self._stream_reply_text_with_custom_stream(message, generation_id=generation_id)
        return await self._stream_reply_text_with_strategies(message, generation_id=generation_id)

    async def _stream_reply_text_with_custom_stream(self, message: str, *, generation_id: int) -> str:
        built_text = ""
        emitted_ui_text = ""
        pending_ui_text = ""
        pending_tts_text = ""
        chunk_index = self.tts_buffer.next_chunk_index
        compact_history, history_summary = self._build_compact_history()
        if history_summary:
            await self._emit(
                "ack",
                {
                    "kind": "history_trimmed",
                    "summary": history_summary,
                    "recent_messages": len(compact_history),
                },
            )

        async for token in self.llm_stream_fn(
            message=message,
            history=compact_history,
            child_age=self.config.child_age,
            child_name=self.config.child_name,
            topic_name=self.config.topic_name,
            vocabulary=self.config.vocabulary,
        ):
            built_text += token
            pending_ui_text += token
            pending_tts_text += token
            await self._mark_llm_first_token(generation_id=generation_id)

            ready_ui_prefix, pending_ui_text = self._extract_ui_ready_prefix(pending_ui_text)
            if ready_ui_prefix:
                emitted_ui_text = _normalize_space(f"{emitted_ui_text} {ready_ui_prefix}")
                await self._emit(
                    "llm_token",
                    {"token": ready_ui_prefix, "text": emitted_ui_text, "generation_id": generation_id},
                )

            ready_prefix, pending_tts_text = self._extract_tts_ready_prefix(pending_tts_text)
            if ready_prefix:
                chunk_index = await self._enqueue_single_tts_chunk(
                    ready_prefix,
                    chunk_index,
                    generation_id=generation_id,
                )

        if pending_ui_text.strip():
            emitted_ui_text = _normalize_space(f"{emitted_ui_text} {pending_ui_text}")
            await self._emit(
                "llm_token",
                {"token": pending_ui_text.strip(), "text": emitted_ui_text, "generation_id": generation_id},
            )

        if pending_tts_text.strip():
            chunk_index = await self._enqueue_single_tts_chunk(
                pending_tts_text,
                chunk_index,
                generation_id=generation_id,
            )

        self.tts_buffer.next_chunk_index = chunk_index
        return built_text

    async def _stream_reply_text_with_strategies(self, message: str, *, generation_id: int) -> str:
        from be.ai_service.app import (
            _build_freestyle_system_prompt,
            _build_topic_chat_system_prompt,
            _is_quota_error,
            _normalize_freestyle_reply,
            _stream_llm,
        )

        compact_history, history_summary = self._build_compact_history()
        if history_summary:
            await self._emit(
                "ack",
                {
                    "kind": "history_trimmed",
                    "summary": history_summary,
                    "recent_messages": len(compact_history),
                },
            )

        system_prompt = (
            _build_topic_chat_system_prompt(
                child_age=self.config.child_age,
                child_name=self.config.child_name,
                topic_name=self.config.topic_name,
                vocabulary=self.config.vocabulary,
            )
            if self.config.topic_name.strip() and self.config.vocabulary
            else _build_freestyle_system_prompt(
                child_age=self.config.child_age,
                child_name=self.config.child_name,
            )
        )

        history_lines: list[str] = []
        if history_summary:
            history_lines.append(f"Memory: {history_summary}")
        history_lines.extend(
            f"{_history_label_for_role(item.get('role', ''))}: {item.get('content', '').strip()}"
            for item in compact_history + [{"role": "user", "content": message}]
            if item.get("content", "").strip()
        )
        prompt = (
            f"{system_prompt}\n\n"
            f"--- Conversation so far ---\n"
            f"{chr(10).join(history_lines)}\n\n"
            f"Now reply as Joy (max 2 sentences, end with a question):\nJoy:"
        )

        strategies = self._build_llm_strategies()
        if not strategies:
            raise RuntimeError("No usable LLM strategy configured for SpeakJoy.")

        last_quota_error: LlmQuotaExceeded | None = None
        for strategy in strategies:
            await self._emit(
                "ack",
                {
                    "kind": "llm_strategy_selected",
                    "label": strategy.label,
                    "provider": strategy.provider,
                    "model": strategy.model_name,
                },
            )

            built_text = ""
            emitted_ui_text = ""
            pending_ui_text = ""
            pending_tts_text = ""
            chunk_index = self.tts_buffer.next_chunk_index
            collected_tokens: list[str] = []

            try:
                async for token in _stream_llm(
                    provider=strategy.provider,
                    api_key=strategy.api_key,
                    prompt=prompt,
                    max_tokens=200,
                    model_name=strategy.model_name,
                    base_url=strategy.base_url,
                ):
                    collected_tokens.append(token)
                    built_text += token
                    pending_ui_text += token
                    pending_tts_text += token
                    await self._mark_llm_first_token(
                        generation_id=generation_id,
                        provider=strategy.provider,
                        model=strategy.model_name,
                        strategy_label=strategy.label,
                    )

                    ready_ui_prefix, pending_ui_text = self._extract_ui_ready_prefix(pending_ui_text)
                    if ready_ui_prefix:
                        emitted_ui_text = _normalize_space(f"{emitted_ui_text} {ready_ui_prefix}")
                        await self._emit(
                            "llm_token",
                            {"token": ready_ui_prefix, "text": emitted_ui_text, "generation_id": generation_id},
                        )

                    ready_prefix, pending_tts_text = self._extract_tts_ready_prefix(pending_tts_text)
                    if ready_prefix:
                        chunk_index = await self._enqueue_single_tts_chunk(
                            ready_prefix,
                            chunk_index,
                            generation_id=generation_id,
                        )

                normalized = _normalize_freestyle_reply("".join(collected_tokens))
                if normalized != _normalize_space("".join(collected_tokens)):
                    tail = normalized[len(_normalize_space("".join(collected_tokens))) :].strip()
                    if tail:
                        built_text += f" {tail}"
                        pending_ui_text += f" {tail}"
                        pending_tts_text += f" {tail}"

                if pending_ui_text.strip():
                    emitted_ui_text = _normalize_space(f"{emitted_ui_text} {pending_ui_text}")
                    await self._emit(
                        "llm_token",
                        {"token": pending_ui_text.strip(), "text": emitted_ui_text, "generation_id": generation_id},
                    )

                if pending_tts_text.strip():
                    chunk_index = await self._enqueue_single_tts_chunk(
                        pending_tts_text,
                        chunk_index,
                        generation_id=generation_id,
                    )

                self.tts_buffer.next_chunk_index = chunk_index
                return built_text
            except Exception as error:
                if _is_quota_error(error):
                    last_quota_error = LlmQuotaExceeded(f"{strategy.label} quota exceeded")
                    await self._emit(
                        "ack",
                        {
                            "kind": "llm_strategy_quota_exceeded",
                            "label": strategy.label,
                            "provider": strategy.provider,
                            "model": strategy.model_name,
                        },
                    )
                    continue
                raise

        raise last_quota_error or LlmQuotaExceeded("All LLM strategies exhausted")

    def _extract_tts_ready_prefix(self, text: str) -> tuple[str, str]:
        normalized = _normalize_space(text)
        if not normalized:
            return "", ""

        if normalized.endswith((".", "?", "!")):
            return normalized, ""

        sentence_prefix = _safe_sentence_prefix(normalized)
        if sentence_prefix and sentence_prefix != normalized:
            remainder = normalized[len(sentence_prefix):].strip()
            return sentence_prefix, remainder

        clause_prefix = _safe_clause_prefix(normalized)
        if clause_prefix and clause_prefix != normalized:
            clause_words = WORD_PATTERN.findall(clause_prefix)
            if len(clause_words) >= max(MIN_STREAMING_CLAUSE_WORDS, self.config.tts_words_per_chunk // 2):
                remainder = normalized[len(clause_prefix):].strip()
                return clause_prefix, remainder

        words = WORD_PATTERN.findall(normalized)
        if len(words) < max(MIN_STREAMING_FORCE_FLUSH_WORDS, self.config.tts_words_per_chunk + 2):
            return "", normalized

        cut_words = words[: max(self.config.tts_words_per_chunk, MIN_STREAMING_CLAUSE_WORDS)]
        ready = " ".join(cut_words)
        remaining_words = words[len(cut_words) :]
        return ready, " ".join(remaining_words)

    def _extract_ui_ready_prefix(self, text: str) -> tuple[str, str]:
        normalized = _normalize_space(text)
        if not normalized:
            return "", ""

        words = WORD_PATTERN.findall(normalized)
        if normalized.endswith((".", "?", "!")):
            return normalized, ""

        sentence_prefix = _safe_sentence_prefix(normalized)
        if sentence_prefix and sentence_prefix != normalized:
            remainder = normalized[len(sentence_prefix):].strip()
            return sentence_prefix, remainder

        clause_prefix = _safe_clause_prefix(normalized)
        if clause_prefix and clause_prefix != normalized:
            clause_words = WORD_PATTERN.findall(clause_prefix)
            if len(clause_words) >= MIN_UI_STREAMING_CLAUSE_WORDS and len(words) >= MIN_UI_STREAMING_FORCE_FLUSH_WORDS:
                remainder = normalized[len(clause_prefix):].strip()
                return clause_prefix, remainder

        if len(words) < MIN_UI_STREAMING_FORCE_FLUSH_WORDS:
            return "", normalized

        ready_words = words[:MIN_UI_STREAMING_FORCE_FLUSH_WORDS]
        return " ".join(ready_words), " ".join(words[len(ready_words):])

    def _track_tts_task(self, task: asyncio.Task[None]) -> None:
        self._tts_tasks.add(task)

        def _remove_task(completed: asyncio.Task[None]) -> None:
            self._tts_tasks.discard(completed)

        task.add_done_callback(_remove_task)

    async def _synthesize_and_emit_tts_chunk(self, chunk_text: str, chunk_index: int, *, generation_id: int) -> None:
        try:
            audio_bytes = await self.tts_chunk_fn(
                text=chunk_text,
                chunk_index=chunk_index,
                speaker=self.config.speaker,
                child_id=self.config.child_id,
            )
        except asyncio.CancelledError:
            return
        except Exception as error:
            if not self._closed:
                await self._emit("error", {"message": str(error)})
            return

        if self._closed:
            return

        chunk = SpeakJoyTtsChunk(
            chunk_index=chunk_index,
            text=chunk_text,
            audio_bytes=audio_bytes,
        )
        self.tts_buffer.push(chunk)
        if self._telemetry.tts_first_chunk_ready_at <= 0:
            self._telemetry.tts_first_chunk_ready_at = time.monotonic()
            await self._emit_timing_mark(
                "tts_first_chunk_ready",
                generation_id=generation_id,
                chunk_index=chunk_index,
                chars=len(chunk_text),
                audio_bytes=len(audio_bytes),
            )
            self._log_turn_latency_summary(generation_id=generation_id)
        await self._emit(
            "tts_chunk_ready",
            {
                "chunk_index": chunk.chunk_index,
                "text": chunk.text,
                "audio_bytes": chunk.audio_bytes,
                "generation_id": generation_id,
            },
        )

    async def _enqueue_single_tts_chunk(self, text: str, chunk_index: int, *, generation_id: int) -> int:
        chunk_text = _normalize_space(text)
        if not chunk_text:
            return chunk_index

        await self._set_session_state("speaking", turn_id=self._active_turn_id, generation_id=generation_id)
        if self._telemetry.tts_first_text_ready_at <= 0:
            self._telemetry.tts_first_text_ready_at = time.monotonic()
            await self._emit_timing_mark(
                "tts_first_text_ready",
                generation_id=generation_id,
                chunk_index=chunk_index,
                chars=len(chunk_text),
            )
        await self._emit(
            "tts_text_ready",
            {
                "chunk_index": chunk_index,
                "text": chunk_text,
                "generation_id": generation_id,
            },
        )
        task = asyncio.create_task(
            self._synthesize_and_emit_tts_chunk(
                chunk_text,
                chunk_index,
                generation_id=generation_id,
            )
        )
        self._track_tts_task(task)
        return chunk_index + 1

    async def _enqueue_tts_chunks(self, text: str, start_chunk_index: int, *, generation_id: int) -> int:
        next_index = start_chunk_index
        for chunk_text in _split_tts_chunks(text, self.config.tts_words_per_chunk):
            next_index = await self._enqueue_single_tts_chunk(
                chunk_text,
                next_index,
                generation_id=generation_id,
            )
        return next_index

    async def mark_tts_chunk_played(self, chunk_index: int) -> None:
        self.tts_buffer.mark_played(chunk_index)
        await self._emit("tts_chunk_played", {"chunk_index": chunk_index})

    async def send_assistant_message(
        self,
        text: str,
        *,
        mode: str = "system",
        source_message: str = "__system__",
    ) -> None:
        """
        Push a server-originated assistant message through the same event/TTS
        pipeline used by normal LLM replies.

        This keeps greetings and future system nudges on a single code path,
        instead of bypassing the session and duplicating WebSocket behavior.
        """
        normalized = _normalize_space(text)
        if not normalized or self._closed:
            return

        self._telemetry.reset()
        self._telemetry.input_started_at = time.monotonic()
        self._telemetry.asr_final_at = self._telemetry.input_started_at
        self._generation_sequence += 1
        generation_id = self._generation_sequence
        self._active_generation_id = generation_id
        self._telemetry.llm_started_at = time.monotonic()
        await self._set_session_state("thinking", generation_id=generation_id)
        await self._emit(
            "llm_started",
            {
                "message": source_message,
                "generation_id": generation_id,
                "mode": mode,
            },
        )
        await self._emit_timing_mark(
            "llm_started",
            generation_id=generation_id,
            mode=mode,
            source_message=source_message,
        )
        await self._mark_llm_first_token(generation_id=generation_id)
        await self._emit(
            "llm_token",
            {
                "token": normalized,
                "text": normalized,
                "generation_id": generation_id,
            },
        )
        self.history.append({"role": "bot", "content": normalized})
        self._telemetry.llm_final_at = time.monotonic()
        await self._emit(
            "llm_final",
            {
                "text": normalized,
                "generation_id": generation_id,
            },
        )
        await self._emit_timing_mark(
            "llm_final",
            generation_id=generation_id,
            chars=len(normalized),
        )
        self.tts_buffer.next_chunk_index = await self._enqueue_tts_chunks(
            normalized,
            self.tts_buffer.next_chunk_index,
            generation_id=generation_id,
        )
        self._active_generation_id = None
        if not self._closed:
            await self._set_session_state("idle")

    async def generate_reply_after_text_commit(self, message: str) -> str:
        """
        Simpler non-stream fallback for hard turns.

        This path is useful when the child says something complex and you want to
        wait until the whole utterance is stable before generating the answer.
        """
        reply = await self.llm_reply_fn(
            message=message,
            history=self.history,
            child_age=self.config.child_age,
            child_name=self.config.child_name,
            topic_name=self.config.topic_name,
            vocabulary=self.config.vocabulary,
        )
        self.history.append({"role": "bot", "content": reply})
        return reply

    def is_turn_open(self) -> bool:
        return self._reply_task is not None and not self._reply_task.done()

    def is_in_llm_cooldown(self) -> bool:
        return time.monotonic() < self._llm_cooldown_until

    def llm_cooldown_remaining(self) -> float:
        return max(0.0, self._llm_cooldown_until - time.monotonic())

    def _is_turn_blocked(self) -> bool:
        return self.is_turn_open()

    async def _mark_llm_first_token(self, *, generation_id: int, **extra: Any) -> None:
        if self._telemetry.llm_first_token_at > 0:
            return
        self._telemetry.llm_first_token_at = time.monotonic()
        await self._emit_timing_mark(
            "llm_first_token",
            generation_id=generation_id,
            **extra,
        )

    async def _emit_timing_mark(self, stage: str, **extra: Any) -> None:
        now = time.monotonic()
        payload: dict[str, Any] = {
            "kind": "timing_mark",
            "stage": stage,
            "at_monotonic": round(now, 6),
        }

        if self._telemetry.input_started_at > 0:
            payload["since_input_start_ms"] = round((now - self._telemetry.input_started_at) * 1000, 1)
        if self._telemetry.asr_final_at > 0 and stage != "asr_final":
            payload["since_asr_final_ms"] = round((now - self._telemetry.asr_final_at) * 1000, 1)
        if self._telemetry.llm_started_at > 0 and stage not in {"asr_first_partial", "asr_final", "llm_started"}:
            payload["since_llm_started_ms"] = round((now - self._telemetry.llm_started_at) * 1000, 1)
        if self._telemetry.llm_first_token_at > 0 and stage not in {"asr_first_partial", "asr_final", "llm_started", "llm_first_token"}:
            payload["since_llm_first_token_ms"] = round((now - self._telemetry.llm_first_token_at) * 1000, 1)
        if self._telemetry.tts_first_text_ready_at > 0 and stage == "tts_first_chunk_ready":
            payload["since_tts_text_ready_ms"] = round((now - self._telemetry.tts_first_text_ready_at) * 1000, 1)

        payload.update(extra)
        await self._emit("ack", payload)

    def _log_turn_latency_summary(self, *, generation_id: int) -> None:
        metrics: list[str] = []

        def add_metric(label: str, start: float, end: float) -> None:
            if start > 0 and end > 0 and end >= start:
                metrics.append(f"{label}={((end - start) * 1000):.1f}ms")

        add_metric("asr_first_partial", self._telemetry.input_started_at, self._telemetry.asr_first_partial_at)
        add_metric("asr_to_llm_start", self._telemetry.asr_final_at, self._telemetry.llm_started_at)
        add_metric("llm_first_token", self._telemetry.llm_started_at, self._telemetry.llm_first_token_at)
        add_metric("llm_total", self._telemetry.llm_started_at, self._telemetry.llm_final_at)
        add_metric("tts_text_ready", self._telemetry.llm_started_at, self._telemetry.tts_first_text_ready_at)
        add_metric("tts_first_audio", self._telemetry.llm_started_at, self._telemetry.tts_first_chunk_ready_at)
        add_metric("tts_synthesis_first_chunk", self._telemetry.tts_first_text_ready_at, self._telemetry.tts_first_chunk_ready_at)
        add_metric("end_to_end_first_audio", self._telemetry.input_started_at, self._telemetry.tts_first_chunk_ready_at)

        if metrics:
            logger.info(
                "[SpeakJoy Timing] generation_id=%s %s",
                generation_id,
                " ".join(metrics),
            )

    async def _emit(self, event_type: SpeakJoyEvent["type"], payload: dict[str, Any]) -> None:
        await self.event_queue.put(SpeakJoyEvent(type=event_type, payload=payload))

    async def _set_session_state(
        self,
        status: Literal["idle", "listening", "thinking", "speaking", "interrupted", "closed"],
        *,
        turn_id: int | None = None,
        generation_id: int | None = None,
    ) -> None:
        next_turn_id = self._active_turn_id if turn_id is None else turn_id
        next_generation_id = self._active_generation_id if generation_id is None else generation_id
        previous = (self._state.status, self._state.turn_id, self._state.generation_id)
        current = (status, next_turn_id, next_generation_id)
        if previous == current:
            return
        self._state = SpeakJoySessionState(
            status=status,
            turn_id=next_turn_id,
            generation_id=next_generation_id,
        )
        await self._emit(
            "session_state",
            {
                "status": status,
                "turn_id": next_turn_id,
                "generation_id": next_generation_id,
            },
        )
