from __future__ import annotations

import asyncio
from dataclasses import dataclass

from be.ai_service.qwen3_asr_runtime import Qwen3ASRRuntime
from be.ai_service.streaming_asr import AsrEvent, BaseStreamingASRSession, StreamingAsrConfig


@dataclass(slots=True)
class RollingWindowPolicy:
    window_ms: int = 1600
    stride_ms: int = 700
    overlap_ms: int = 900
    min_audio_ms: int = 900
    partial_min_word_delta: int = 1
    partial_emit_debounce_ms: int = 250
    final_min_audio_ms: int = 1000


class Qwen3RollingChunkASRSession(BaseStreamingASRSession):
    """
    Pseudo-streaming ASR session built on repeated rolling-window transcription.

    This is intended for deployments that must keep using Qwen3-ASR even though the
    provider does not expose native realtime partial transcripts.
    """

    def __init__(
        self,
        config: StreamingAsrConfig,
        *,
        runtime: Qwen3ASRRuntime,
        policy: RollingWindowPolicy | None = None,
    ) -> None:
        super().__init__(config)
        self.runtime = runtime
        self.policy = policy or RollingWindowPolicy()
        self.audio_buffer = bytearray()
        self.utterance_start_offset_bytes = 0
        self.last_partial_text = ""
        self.last_final_text = ""
        self.last_partial_emitted_at_ms = 0
        self.last_decode_buffer_size = 0
        self.decode_task: asyncio.Task[None] | None = None
        self.decode_pending = False
        self.finalizing = False
        self.speech_active = False

    async def push_audio(self, pcm16: bytes, *, timestamp_ms: int | None = None) -> None:
        if not self._started or self._closed or not pcm16:
            return

        self.audio_buffer.extend(pcm16)
        if not self.speech_active:
            self.speech_active = True
            await self._emit(AsrEvent(type="speech_started", start_ms=timestamp_ms))

        if self._should_schedule_partial_decode():
            self._schedule_partial_decode(timestamp_ms=timestamp_ms)

    async def end_input(self) -> None:
        if self._closed or self.finalizing:
            return

        self.finalizing = True
        try:
            if self.decode_task and not self.decode_task.done():
                self.decode_task.cancel()
                try:
                    await self.decode_task
                except asyncio.CancelledError:
                    pass
            await self._run_final_decode()
        finally:
            self.finalizing = False
            self.decode_pending = False
            self.decode_task = None

    async def close(self) -> None:
        if self.decode_task and not self.decode_task.done():
            self.decode_task.cancel()
            try:
                await self.decode_task
            except asyncio.CancelledError:
                pass
        await super().close()

    def _should_schedule_partial_decode(self) -> bool:
        current_size = len(self.audio_buffer) - self.utterance_start_offset_bytes
        if current_size <= 0:
            return False
        if current_size < self._ms_to_bytes(self.policy.min_audio_ms):
            return False
        if current_size - self.last_decode_buffer_size < self._ms_to_bytes(self.policy.stride_ms):
            return False
        return True

    def _schedule_partial_decode(self, *, timestamp_ms: int | None = None) -> None:
        if self.decode_task and not self.decode_task.done():
            self.decode_pending = True
            return
        self.decode_task = asyncio.create_task(self._run_partial_decode(timestamp_ms=timestamp_ms))

    async def _run_partial_decode(self, *, timestamp_ms: int | None = None) -> None:
        try:
            window = self._slice_recent_window()
            if not window:
                return
            transcript = await self.runtime.transcribe_pcm16(
                window,
                sample_rate_hz=self.config.sample_rate_hz,
                language=self.config.language,
            )
            normalized = self._normalize_transcript(transcript)
            now_ms = timestamp_ms or 0
            if self._should_emit_partial(self.last_partial_text, normalized, now_ms=now_ms):
                self.last_partial_text = normalized
                self.last_partial_emitted_at_ms = now_ms
                await self._emit(
                    AsrEvent(
                        type="partial_transcript",
                        text=normalized,
                        is_final=False,
                    )
                )
            self.last_decode_buffer_size = len(self.audio_buffer) - self.utterance_start_offset_bytes
        except asyncio.CancelledError:
            raise
        except Exception as error:
            await self._emit(AsrEvent(type="error", text=str(error)))
        finally:
            if self.decode_pending and not self.finalizing and not self._closed:
                self.decode_pending = False
                self.decode_task = asyncio.create_task(self._run_partial_decode(timestamp_ms=timestamp_ms))
            else:
                self.decode_task = None

    async def _run_final_decode(self) -> None:
        utterance = self._slice_full_utterance()
        if len(utterance) < self._ms_to_bytes(self.policy.final_min_audio_ms):
            self._reset_utterance_state()
            await self._emit(AsrEvent(type="speech_ended"))
            return

        transcript = await self.runtime.transcribe_pcm16(
            utterance,
            sample_rate_hz=self.config.sample_rate_hz,
            language=self.config.language,
        )
        normalized = self._normalize_transcript(transcript)
        if normalized:
            self.last_final_text = normalized
            await self._emit(
                AsrEvent(
                    type="final_transcript",
                    text=normalized,
                    is_final=True,
                )
            )
        await self._emit(AsrEvent(type="speech_ended"))
        self._reset_utterance_state()

    def _slice_recent_window(self) -> bytes:
        utterance = self._slice_full_utterance()
        if not utterance:
            return b""
        window_bytes = self._ms_to_bytes(self.policy.window_ms)
        if len(utterance) <= window_bytes:
            return utterance
        return utterance[-window_bytes:]

    def _slice_full_utterance(self) -> bytes:
        return bytes(self.audio_buffer[self.utterance_start_offset_bytes :])

    def _reset_utterance_state(self) -> None:
        self.audio_buffer.clear()
        self.utterance_start_offset_bytes = 0
        self.last_partial_text = ""
        self.last_decode_buffer_size = 0
        self.speech_active = False

    def _ms_to_bytes(self, ms: int) -> int:
        samples = int(self.config.sample_rate_hz * (ms / 1000.0))
        bytes_per_sample = 2 * max(1, self.config.channels)
        return samples * bytes_per_sample

    def _normalize_transcript(self, text: str) -> str:
        return " ".join((text or "").strip().split())

    def _should_emit_partial(self, previous: str, current: str, *, now_ms: int) -> bool:
        if not current:
            return False
        if current == previous:
            return False
        if now_ms and self.last_partial_emitted_at_ms:
            if now_ms - self.last_partial_emitted_at_ms < self.policy.partial_emit_debounce_ms:
                return False
        if not previous:
            return True

        previous_words = previous.split()
        current_words = current.split()
        if current.startswith(previous):
            return len(current_words) - len(previous_words) >= self.policy.partial_min_word_delta
        return True
