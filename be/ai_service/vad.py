from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


VadStatus = Literal["silence", "speech", "pause"]


@dataclass(slots=True)
class VadObservation:
    timestamp_ms: int
    rms: float
    peak: float


@dataclass(slots=True)
class VadSnapshot:
    status: VadStatus
    rms: float
    peak: float
    speech_ms: int
    silence_ms: int
    changed: bool


class BasicVoiceActivityDetector:
    def __init__(
        self,
        *,
        speech_rms_threshold: float = 0.045,
        speech_peak_threshold: float = 0.1,
        pause_after_ms: int = 450,
    ) -> None:
        self.speech_rms_threshold = speech_rms_threshold
        self.speech_peak_threshold = speech_peak_threshold
        self.pause_after_ms = pause_after_ms
        self._status: VadStatus = "silence"
        self._last_timestamp_ms = 0
        self._speech_ms = 0
        self._silence_ms = 0

    def observe(self, observation: VadObservation) -> VadSnapshot:
        delta_ms = 0
        if self._last_timestamp_ms > 0:
            delta_ms = max(0, observation.timestamp_ms - self._last_timestamp_ms)
        self._last_timestamp_ms = observation.timestamp_ms

        is_speaking = (
            observation.rms >= self.speech_rms_threshold
            or observation.peak >= self.speech_peak_threshold
        )

        changed = False
        if is_speaking:
            self._speech_ms += delta_ms
            self._silence_ms = 0
            if self._status != "speech":
                self._status = "speech"
                changed = True
        else:
            self._silence_ms += delta_ms
            if self._status == "speech" and self._silence_ms >= self.pause_after_ms:
                self._status = "pause"
                changed = True
            elif self._status == "pause" and self._silence_ms >= self.pause_after_ms * 2:
                self._status = "silence"
                changed = True

        return VadSnapshot(
            status=self._status,
            rms=observation.rms,
            peak=observation.peak,
            speech_ms=self._speech_ms,
            silence_ms=self._silence_ms,
            changed=changed,
        )
