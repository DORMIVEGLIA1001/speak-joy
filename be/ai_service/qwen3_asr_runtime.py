from __future__ import annotations

import io
import wave
from dataclasses import dataclass


@dataclass(slots=True)
class Qwen3RuntimeConfig:
    model_name: str = ""
    language: str | None = None
    sample_rate_hz: int = 16_000
    channels: int = 1
    prefer_api: bool = False
    api_key: str = ""


class Qwen3ASRRuntime:
    """
    Thin runtime abstraction for Qwen3 ASR inference.

    This class intentionally does not bind to a specific model-loading strategy yet.
    It exists so rolling streaming sessions can depend on a stable runtime interface
    instead of reaching directly into workflow/node code.
    """

    def __init__(self, config: Qwen3RuntimeConfig | None = None) -> None:
        self.config = config or Qwen3RuntimeConfig()

    async def transcribe_pcm16(
        self,
        pcm16: bytes,
        *,
        sample_rate_hz: int,
        language: str | None = None,
    ) -> str:
        """
        Transcribe PCM16 mono audio using the backend's configured Qwen/ASR path.

        For low-latency rolling ASR, keep the audio in memory and avoid temp-file
        round trips when the provider can accept raw bytes directly.
        """
        if not pcm16:
            return ""

        # Lazy import avoids circular import at module load time.
        from be.ai_service.app import transcribe_audio_bytes

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(max(1, self.config.channels))
            wav_file.setsampwidth(2)  # PCM16
            wav_file.setframerate(sample_rate_hz or self.config.sample_rate_hz)
            wav_file.writeframes(pcm16)

        transcript = await transcribe_audio_bytes(
            wav_buffer.getvalue(),
            content_type="audio/wav",
            api_key=self.config.api_key,
            prefer_api=self.config.prefer_api,
            audio_name="qwen3_stream.wav",
        )
        return (transcript or "").strip()


def get_qwen3_runtime(config: Qwen3RuntimeConfig | None = None) -> Qwen3ASRRuntime:
    return Qwen3ASRRuntime(config=config)
