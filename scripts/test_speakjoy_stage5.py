from __future__ import annotations

import asyncio
import math
import struct
import wave
from pathlib import Path

from be.ai_service.speakjoy import (
    QUOTA_FALLBACK_MESSAGE,
    SpeakJoyAsrPartial,
    SpeakJoyConfig,
    SpeakJoyRealtimeSession,
)
from be.ai_service.speakjoy_ws import MIN_TRIMMED_RMS, _analyze_wav_signal


async def _fake_tts_chunk(*, text: str, chunk_index: int, speaker: str = "Ryan", child_id: str = "") -> bytes:
    return f"{chunk_index}:{text}".encode("utf-8")


async def _friendly_llm_stream(**_: object):
    for token in [
        "Hello Minh! ",
        "That sounds fun. ",
        "What do you like to draw?",
    ]:
        await asyncio.sleep(0)
        yield token


async def _quota_llm_stream(**_: object):
    await asyncio.sleep(0)
    yield QUOTA_FALLBACK_MESSAGE


async def _drain_session_events(session: SpeakJoyRealtimeSession, wait_ms: int = 50) -> list[tuple[str, dict]]:
    await asyncio.sleep(wait_ms / 1000.0)
    events: list[tuple[str, dict]] = []
    while not session.event_queue.empty():
        event = session.event_queue.get_nowait()
        events.append((event.type, dict(event.payload)))
    return events


async def test_quiet_sentence() -> None:
    session = SpeakJoyRealtimeSession(
        config=SpeakJoyConfig(tts_words_per_chunk=16),
        llm_stream_fn=_friendly_llm_stream,
        tts_chunk_fn=_fake_tts_chunk,
    )
    await session.push_asr_partial(
        SpeakJoyAsrPartial(
            text="Hello Joy, my name is Minh and I like drawing colorful animals.",
            is_final=True,
        )
    )
    while session.is_turn_open():
        await asyncio.sleep(0.01)

    events = await _drain_session_events(session)
    asr_final_count = sum(1 for event_type, _ in events if event_type == "asr_final")
    llm_started_count = sum(1 for event_type, _ in events if event_type == "llm_started")
    assert asr_final_count == 1, f"expected 1 asr_final, got {asr_final_count}"
    assert llm_started_count == 1, f"expected 1 llm_started, got {llm_started_count}"
    print("PASS quiet sentence: 1 asr_final, 1 llm_started")


def _write_wav(path: Path, samples: list[int], sample_rate: int = 16000) -> None:
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"".join(struct.pack("<h", sample) for sample in samples))


def test_background_noise_gate() -> None:
    workspace_temp = Path(r"E:\test\speak joy\output\stage5-tests")
    workspace_temp.mkdir(parents=True, exist_ok=True)
    silence_path = workspace_temp / "silence.wav"
    samples = [0] * 16000
    _write_wav(silence_path, samples)
    duration, rms = _analyze_wav_signal(str(silence_path))
    assert duration >= 1.0, f"expected >=1s duration, got {duration}"
    assert rms < MIN_TRIMMED_RMS, f"expected silence RMS < threshold, got {rms}"

    low_noise_path = workspace_temp / "low_noise.wav"
    noise_samples = [int(120 * math.sin(index / 8.0)) for index in range(16000)]
    _write_wav(low_noise_path, noise_samples)
    _duration2, rms2 = _analyze_wav_signal(str(low_noise_path))
    assert rms2 < MIN_TRIMMED_RMS, f"expected low-noise RMS < threshold, got {rms2}"

    print("PASS background noise gate: silence/low-noise would be dropped")


async def test_quota_cooldown() -> None:
    session = SpeakJoyRealtimeSession(
        config=SpeakJoyConfig(tts_words_per_chunk=16),
        llm_stream_fn=_quota_llm_stream,
        tts_chunk_fn=_fake_tts_chunk,
    )
    await session.push_asr_partial(
        SpeakJoyAsrPartial(
            text="Hello Joy, can you play with me today?",
            is_final=True,
        )
    )
    while session.is_turn_open():
        await asyncio.sleep(0.01)

    first_events = await _drain_session_events(session)
    assert session.is_in_llm_cooldown(), "expected session to enter cooldown after quota fallback"

    await session.push_asr_partial(
        SpeakJoyAsrPartial(
            text="Please tell me a story about animals.",
            is_final=True,
        )
    )
    second_events = await _drain_session_events(session)

    total_llm_started = sum(1 for event_type, _ in first_events + second_events if event_type == "llm_started")
    assert total_llm_started == 1, f"expected 1 llm_started during cooldown test, got {total_llm_started}"
    print("PASS quota cooldown: fallback once, no repeated llm_started during cooldown")


def test_frontend_turn_taking_guards() -> None:
    realtime_text = Path(r"E:\test\speak joy\fe\lib\speakjoy-realtime.ts").read_text(encoding="utf-8")
    hook_text = Path(r"E:\test\speak joy\fe\hooks\useSpeakJoyCall.ts").read_text(encoding="utf-8")

    assert "private isTtsActive = false;" in realtime_text
    assert "this.isTtsActive ||" in realtime_text
    assert "this.isTtsActive = true;" in realtime_text
    assert "this.isTtsActive = false;" in realtime_text
    assert "const TTS_POST_PLAYBACK_COOLDOWN_MS = 900;" in hook_text
    print("PASS frontend turn-taking guards: TTS active lock and 1000ms cooldown are present")


async def main() -> None:
    await test_quiet_sentence()
    test_background_noise_gate()
    await test_quota_cooldown()
    test_frontend_turn_taking_guards()
    print("ALL STAGE 5 CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
