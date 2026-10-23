from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Awaitable, Callable, Literal, Protocol

from be.ai_service.qwen3_asr_runtime import Qwen3RuntimeConfig, get_qwen3_runtime


AsrEventType = Literal[
    "session_started",
    "speech_started",
    "partial_transcript",
    "final_transcript",
    "speech_ended",
    "session_closed",
    "error",
]


@dataclass(slots=True)
class AsrEvent:
    type: AsrEventType
    text: str = ""
    confidence: float | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    is_final: bool = False
    raw: dict[str, Any] | None = None


@dataclass(slots=True)
class StreamingAsrConfig:
    provider: str = "auto"
    api_key: str = ""
    base_url: str = ""
    model_name: str = ""
    language: str | None = None
    sample_rate_hz: int = 16_000
    channels: int = 1
    partial_results: bool = True
    endpointing_ms: int = 700
    max_buffer_ms: int = 30_000


class StreamingASRSession(Protocol):
    async def start(self) -> None: ...
    async def push_audio(self, pcm16: bytes, *, timestamp_ms: int | None = None) -> None: ...
    async def end_input(self) -> None: ...
    async def events(self) -> AsyncIterator[AsrEvent]: ...
    async def close(self) -> None: ...


FinalizeFn = Callable[[list[bytes]], Awaitable[tuple[str, float]]]


class BaseStreamingASRSession:
    """
    Base implementation for realtime-capable ASR adapters.

    Concrete providers should:
    - open their transport in `start()`
    - accept PCM frames in `push_audio()`
    - emit normalized `AsrEvent` values through `_emit()`
    - close all resources in `close()`
    """

    def __init__(self, config: StreamingAsrConfig) -> None:
        self.config = config
        self._events: asyncio.Queue[AsrEvent] = asyncio.Queue()
        self._started = False
        self._closed = False

    async def start(self) -> None:
        self._started = True
        await self._emit(AsrEvent(type="session_started"))

    async def push_audio(self, pcm16: bytes, *, timestamp_ms: int | None = None) -> None:
        raise NotImplementedError

    async def end_input(self) -> None:
        return

    async def events(self) -> AsyncIterator[AsrEvent]:
        while True:
            event = await self._events.get()
            yield event
            if event.type in {"session_closed", "error"} and self._closed:
                return

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self._emit(AsrEvent(type="session_closed"))

    async def _emit(self, event: AsrEvent) -> None:
        await self._events.put(event)


class MockRealtimeASRSession(BaseStreamingASRSession):
    """
    Development skeleton for a realtime provider adapter.

    This does not perform real transcription. It exists so `SpeakJoy` can be wired
    against the realtime interface before a vendor-specific transport is added.
    """

    def __init__(self, config: StreamingAsrConfig) -> None:
        super().__init__(config)
        self._received_bytes = 0
        self._speech_started = False

    async def push_audio(self, pcm16: bytes, *, timestamp_ms: int | None = None) -> None:
        if not self._started or self._closed:
            return

        if pcm16 and not self._speech_started:
            self._speech_started = True
            await self._emit(AsrEvent(type="speech_started", start_ms=timestamp_ms))

        self._received_bytes += len(pcm16)

    async def end_input(self) -> None:
        if self._closed:
            return
        await self._emit(AsrEvent(type="speech_ended"))


@dataclass(slots=True)
class BufferedStreamingASRSession:
    """
    Backward-compatible adapter for the current finalize-at-end pipeline.

    It also implements the new realtime session shape, so websocket/session code
    can gradually migrate without breaking today's buffered ASR flow.
    """

    finalize_fn: FinalizeFn
    config: StreamingAsrConfig = field(default_factory=StreamingAsrConfig)
    chunks: list[bytes] = field(default_factory=list)
    total_bytes: int = 0
    _event_queue: asyncio.Queue[AsrEvent] = field(default_factory=asyncio.Queue, init=False, repr=False)
    _started: bool = field(default=False, init=False, repr=False)
    _closed: bool = field(default=False, init=False, repr=False)

    async def start(self) -> None:
        self._started = True
        await self._emit(AsrEvent(type="session_started"))

    async def push_audio(self, pcm16: bytes, *, timestamp_ms: int | None = None) -> None:
        await self.push_chunk(pcm16)

    async def end_input(self) -> None:
        return

    async def events(self) -> AsyncIterator[AsrEvent]:
        while True:
            event = await self._event_queue.get()
            yield event
            if event.type in {"session_closed", "error"} and self._closed:
                return

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self._emit(AsrEvent(type="session_closed"))

    async def push_chunk(self, audio_bytes: bytes) -> None:
        self.chunks.append(audio_bytes)
        self.total_bytes += len(audio_bytes)

    async def finalize(self) -> tuple[str, float]:
        if not self.chunks:
            return "", 0.0
        transcript, duration = await self.finalize_fn(self.chunks)
        if transcript:
            await self._emit(
                AsrEvent(
                    type="final_transcript",
                    text=transcript,
                    is_final=True,
                    raw={"duration_seconds": duration},
                )
            )
        self.clear()
        return transcript, duration

    def clear(self) -> None:
        self.chunks.clear()
        self.total_bytes = 0

    async def _emit(self, event: AsrEvent) -> None:
        await self._event_queue.put(event)


def create_streaming_asr_session(
    config: StreamingAsrConfig,
    *,
    finalize_fn: FinalizeFn | None = None,
) -> StreamingASRSession:
    provider = _resolve_streaming_asr_provider(config)

    if provider in {"buffered", "legacy", "fallback"}:
        if finalize_fn is None:
            raise ValueError("finalize_fn is required for buffered ASR sessions")
        return BufferedStreamingASRSession(finalize_fn=finalize_fn, config=config)

    if provider in {"mock", "mock_realtime"}:
        return MockRealtimeASRSession(config)

    if provider in {"qwen3_rolling", "qwen3-pseudo-stream"}:
        from be.ai_service.qwen3_rolling_asr import Qwen3RollingChunkASRSession

        runtime = get_qwen3_runtime(
            Qwen3RuntimeConfig(
                model_name=config.model_name,
                language=config.language,
                sample_rate_hz=config.sample_rate_hz,
                channels=config.channels,
                api_key=config.api_key,
                prefer_api=True,
            )
        )
        return Qwen3RollingChunkASRSession(config, runtime=runtime)

    raise ValueError(f"Unsupported streaming ASR provider: {config.provider}")


def _resolve_streaming_asr_provider(config: StreamingAsrConfig) -> str:
    requested = (config.provider or "auto").strip().lower()

    if requested in {"auto", "default", "realtime"}:
        if _should_prefer_qwen3_rolling(config):
            return "qwen3_rolling"
        return "buffered"

    return requested


def _should_prefer_qwen3_rolling(config: StreamingAsrConfig) -> bool:
    try:
        from be.ai_service.app import ASR_API_KEY, ASR_PROVIDER, asr_is_ready, first_api_key

        effective_api_key = first_api_key(config.api_key, ASR_API_KEY)
        if not asr_is_ready(effective_api_key):
            return False

        provider = (ASR_PROVIDER or "").strip().lower()
        if provider == "dashscope":
            return True

        return bool(effective_api_key)
    except Exception:
        return False
