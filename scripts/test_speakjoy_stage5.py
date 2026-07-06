from __future__ import annotations

import asyncio
import math
import struct
import wave
from pathlib import Path

from be.ai_service.speakjoy import (
    LlmQuotaExceeded,
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
    raise LlmQuotaExceeded("quota exhausted")
    yield ""


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
    timing_stages = {
        payload.get("stage")
        for event_type, payload in events
        if event_type == "ack" and payload.get("kind") == "timing_mark"
    }
    assert asr_final_count == 1, f"expected 1 asr_final, got {asr_final_count}"
    assert llm_started_count == 1, f"expected 1 llm_started, got {llm_started_count}"
    for stage in {
        "asr_first_partial",
        "asr_final",
        "llm_started",
        "llm_first_token",
        "llm_final",
        "tts_first_text_ready",
        "tts_first_chunk_ready",
    }:
        assert stage in timing_stages, f"expected timing mark {stage}, got {sorted(timing_stages)}"
    print("PASS quiet sentence: 1 asr_final, 1 llm_started, timing marks present")


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
    silence_stats = _analyze_wav_signal(str(silence_path))
    assert silence_stats.duration_seconds >= 1.0, f"expected >=1s duration, got {silence_stats.duration_seconds}"
    assert silence_stats.rms < MIN_TRIMMED_RMS, f"expected silence RMS < threshold, got {silence_stats.rms}"

    low_noise_path = workspace_temp / "low_noise.wav"
    noise_samples = [int(120 * math.sin(index / 8.0)) for index in range(16000)]
    _write_wav(low_noise_path, noise_samples)
    low_noise_stats = _analyze_wav_signal(str(low_noise_path))
    assert low_noise_stats.rms < MIN_TRIMMED_RMS, f"expected low-noise RMS < threshold, got {low_noise_stats.rms}"

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
    llm_started_modes = [
        payload.get("mode")
        for event_type, payload in first_events + second_events
        if event_type == "llm_started"
    ]
    assert llm_started_modes == ["remote", "fallback"], f"expected remote then fallback, got {llm_started_modes}"
    cooldown_events = [
        payload
        for event_type, payload in first_events
        if event_type == "ack" and payload.get("kind") == "llm_cooldown_started"
    ]
    assert cooldown_events, "expected llm_cooldown_started ack after quota failure"
    print("PASS quota cooldown: remote miss enters cooldown, next turn uses fallback mode")


def test_frontend_turn_taking_guards() -> None:
    realtime_text = Path(r"E:\test\speak joy\fe\lib\speakjoy-realtime.ts").read_text(encoding="utf-8")
    hook_text = Path(r"E:\test\speak joy\fe\hooks\useSpeakJoyCall.ts").read_text(encoding="utf-8")

    assert "private isTtsActive = false;" in realtime_text
    assert "private timingMarksByGeneration = new Map<number, Record<string, number>>();" in realtime_text
    assert "this.handleTimingMark(event.payload);" in realtime_text
    assert "console.info('[SpeakJoy Timing] Summary:" in realtime_text
    assert "if (this.isTtsActive) {" in realtime_text
    assert "this.isTtsActive = true;" in realtime_text
    assert "this.isTtsActive = false;" in realtime_text
    assert "const TTS_POST_PLAYBACK_COOLDOWN_MS = 700;" in hook_text
    print("PASS frontend turn-taking guards: TTS active lock, timing summary, and 700ms cooldown are present")


async def main() -> None:
    await test_quiet_sentence()
    test_background_noise_gate()
    await test_quota_cooldown()
    test_frontend_turn_taking_guards()
    print("ALL STAGE 5 CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
