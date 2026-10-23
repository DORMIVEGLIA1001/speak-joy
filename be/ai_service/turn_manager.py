from __future__ import annotations

from dataclasses import dataclass

from be.ai_service.vad import VadSnapshot, VadStatus


@dataclass(slots=True, frozen=True)
class TurnManagerDecision:
    should_finalize: bool = False
    reason: str = ""


class SpeakJoyTurnManager:
    """
    Coordinates turn finalization from VAD snapshots.

    The current provider stack still returns ASR text only after finalization,
    so this manager focuses on deciding *when* to finalize a buffered turn
    early from pause/silence instead of waiting purely for an explicit
    `audio_final` from the client.
    """

    def __init__(
        self,
        *,
        min_speech_ms: int = 650,
        pause_finalize_ms: int = 700,
        silence_finalize_ms: int = 1100,
        rearm_silence_ms: int = 1600,
    ) -> None:
        self.min_speech_ms = min_speech_ms
        self.pause_finalize_ms = pause_finalize_ms
        self.silence_finalize_ms = silence_finalize_ms
        self.rearm_silence_ms = rearm_silence_ms
        self._armed = False
        self._finalized = False
        self._last_status: VadStatus = "silence"

    def reset(self) -> None:
        self._armed = False
        self._finalized = False
        self._last_status = "silence"

    def observe(
        self,
        snapshot: VadSnapshot,
        *,
        has_buffered_audio: bool,
        turn_open: bool,
    ) -> TurnManagerDecision:
        self._last_status = snapshot.status

        if turn_open or not has_buffered_audio:
            return TurnManagerDecision()

        if snapshot.status == "speech":
            if snapshot.speech_ms >= self.min_speech_ms:
                self._armed = True
            self._finalized = False
            return TurnManagerDecision()

        if not self._armed or self._finalized:
            if snapshot.status == "silence" and snapshot.silence_ms >= self.rearm_silence_ms:
                self.reset()
            return TurnManagerDecision()

        if snapshot.status == "pause" and snapshot.silence_ms >= self.pause_finalize_ms:
            self._finalized = True
            return TurnManagerDecision(should_finalize=True, reason="vad_pause")

        if snapshot.status == "silence" and snapshot.silence_ms >= self.silence_finalize_ms:
            self._finalized = True
            return TurnManagerDecision(should_finalize=True, reason="vad_silence")

        return TurnManagerDecision()
