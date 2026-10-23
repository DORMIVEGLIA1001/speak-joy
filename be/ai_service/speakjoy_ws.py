"""
WebSocket endpoint for SpeakJoy real-time conversation.

Handles bidirectional WebSocket communication for voice conversation
with streaming ASR, LLM tokens, and TTS audio chunks.
"""

import asyncio
import audioop
import base64
import json
import logging
import os
import tempfile
import time
import wave
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from be.ai_service.streaming_asr import (
    BufferedStreamingASRSession,
    StreamingAsrConfig,
    create_streaming_asr_session,
)
from be.ai_service.speakjoy import (
    SpeakJoyAsrPartial,
    SpeakJoyConfig,
    SpeakJoyRealtimeSession,
)
from be.ai_service.turn_manager import SpeakJoyTurnManager
from be.ai_service.vad import BasicVoiceActivityDetector, VadObservation

logger = logging.getLogger(__name__)
MIN_VOICE_DURATION_SECONDS = 0.7
MIN_TRIMMED_RMS = int(os.getenv("SPEAKJOY_MIN_TRIMMED_RMS", "200"))
MIN_SIGNAL_PEAK = int(os.getenv("SPEAKJOY_MIN_SIGNAL_PEAK", "450"))
MIN_ACTIVE_RATIO = float(os.getenv("SPEAKJOY_MIN_ACTIVE_RATIO", "0.15"))
MIN_ACTIVE_WINDOWS = int(os.getenv("SPEAKJOY_MIN_ACTIVE_WINDOWS", "3"))
LOW_ACTIVITY_SOFT_RMS = int(os.getenv("SPEAKJOY_LOW_ACTIVITY_SOFT_RMS", "320"))
SPEAKJOY_STREAMING_ASR_PROVIDER = os.getenv("SPEAKJOY_STREAMING_ASR_PROVIDER", "auto").strip().lower()
SPEAKJOY_MIN_SPEECH_MS = int(os.getenv("SPEAKJOY_MIN_SPEECH_MS", "300"))
SPEAKJOY_PAUSE_FINALIZE_MS = int(os.getenv("SPEAKJOY_PAUSE_FINALIZE_MS", "380"))
SPEAKJOY_SILENCE_FINALIZE_MS = int(os.getenv("SPEAKJOY_SILENCE_FINALIZE_MS", "600"))
SPEAKJOY_REARM_SILENCE_MS = int(os.getenv("SPEAKJOY_REARM_SILENCE_MS", "1100"))


@dataclass(slots=True, frozen=True)
class AudioSignalStats:
    duration_seconds: float
    rms: int
    peak: int
    active_ratio: float
    active_windows: int
    total_windows: int


@dataclass(slots=True)
class BufferedAudioTurn:
    chunks: list[bytes]
    frame_count: int = 0
    frame_bytes: int = 0

    def append_frame(self, audio_bytes: bytes) -> None:
        self.frame_count += 1
        self.frame_bytes += len(audio_bytes)

    def append_chunk(self, audio_bytes: bytes) -> None:
        self.chunks.append(audio_bytes)

    def clear(self) -> None:
        self.chunks.clear()
        self.frame_count = 0
        self.frame_bytes = 0


def _analyze_wav_signal(wav_path: str) -> AudioSignalStats:
    with wave.open(wav_path, "rb") as wav_file:
        frame_rate = max(1, wav_file.getframerate())
        frame_count = wav_file.getnframes()
        sample_width = wav_file.getsampwidth()
        channels = max(1, wav_file.getnchannels())
        frames = wav_file.readframes(frame_count)

    duration_seconds = frame_count / float(frame_rate)
    rms = audioop.rms(frames, sample_width) if frames else 0
    peak = audioop.max(frames, sample_width) if frames else 0

    bytes_per_window = max(1, int(frame_rate * sample_width * channels * 0.02))
    window_rms_values: list[int] = []
    for index in range(0, len(frames), bytes_per_window):
        window = frames[index:index + bytes_per_window]
        if not window:
            continue
        window_rms_values.append(audioop.rms(window, sample_width))

    total_windows = len(window_rms_values)
    active_threshold = max(180, int(rms * 0.5))
    active_windows = sum(1 for value in window_rms_values if value >= active_threshold)
    active_ratio = (active_windows / float(total_windows)) if total_windows else 0.0
    return AudioSignalStats(
        duration_seconds=duration_seconds,
        rms=rms,
        peak=peak,
        active_ratio=active_ratio,
        active_windows=active_windows,
        total_windows=total_windows,
    )


async def _process_audio_buffer(audio_buffer: list[bytes]) -> tuple[str, float]:
    """
    Process accumulated audio chunks through ASR.
    
    Returns:
        tuple: (transcript, duration_seconds)
    """
    if not audio_buffer:
        return "", 0.0
    
    full_audio = b"".join(audio_buffer)
    source_path = None
    wav_path = None
    try:
        from be.ai_service.app import (
            ASR_TRIM_MIN_VOICE_MS,
            ASR_TRIM_PADDING_MS,
            ASR_TRIM_THRESHOLD,
            _decode_audio_upload_to_wav,
            _trim_silence_wav,
            transcribe_audio_path,
        )

        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_file:
            temp_file.write(full_audio)
            source_path = temp_file.name

        wav_path = _decode_audio_upload_to_wav(full_audio, "speakjoy.webm", "audio/webm")
        wav_path = _trim_silence_wav(
            wav_path,
            threshold=ASR_TRIM_THRESHOLD,
            min_voice_ms=ASR_TRIM_MIN_VOICE_MS,
            padding_ms=ASR_TRIM_PADDING_MS,
        )

        signal = _analyze_wav_signal(wav_path)
        duration_seconds = signal.duration_seconds
        rms = signal.rms
        if signal.duration_seconds < MIN_VOICE_DURATION_SECONDS:
            raise ValueError("Recording is too short. Please speak clearly for at least 1 second and try again.")
        # Shorter low-latency turns can have modest peaks while still being
        # intelligible. Only reject the turn as too soft when both measures
        # are low.
        if signal.rms < MIN_TRIMMED_RMS and signal.peak < MIN_SIGNAL_PEAK:
            raise ValueError("Audio is too soft. Please move closer to the microphone and speak more clearly.")
        if (
            signal.active_ratio < MIN_ACTIVE_RATIO
            and signal.active_windows < MIN_ACTIVE_WINDOWS
            and signal.rms < LOW_ACTIVITY_SOFT_RMS
        ):
            raise ValueError("I mostly heard background noise or breathing. Please say one full idea clearly.")
        duration_seconds = max(duration_seconds, MIN_VOICE_DURATION_SECONDS)
        rms = max(signal.rms, MIN_TRIMMED_RMS)
        if duration_seconds < MIN_VOICE_DURATION_SECONDS:
            raise ValueError("File ghi âm quá ngắn. Hãy nói liền mạch ít nhất 1 giây và thử lại.")
        if rms < MIN_TRIMMED_RMS:
            raise ValueError("Âm thanh quá nhỏ hoặc bị nhiễu nền. Hãy đến gần micro và nói rõ hơn.")

        transcript = ""
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                transcript = await transcribe_audio_path(wav_path, "audio/wav")
                break
            except Exception as error:
                last_error = error
                logger.warning("[SpeakJoy WS] ASR attempt %s failed: %s", attempt + 1, error)
                if attempt == 0:
                    await asyncio.sleep(0.35)
        if not transcript and last_error:
            raise last_error

        return transcript.strip(), duration_seconds
        
    except Exception as error:
        logger.error("[SpeakJoy WS] ASR processing error: %s", error)
        raise
    finally:
        if source_path:
            try:
                os.unlink(source_path)
            except OSError:
                pass
        if wav_path:
            try:
                os.unlink(wav_path)
            except OSError:
                pass


async def websocket_speakjoy_realtime(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time SpeakJoy conversation.
    
    Protocol:
    - Client sends: { "type": "config", "payload": {...} } to initialize
    - Client sends: { "type": "audio_chunk", "data": "<base64>" } for audio
    - Client sends: { "type": "audio_final" } to signal end of speech
    - Client sends: { "type": "chunk_played", "chunk_index": N } after playing TTS
    - Client sends: { "type": "ping" } for keepalive
    - Client sends: { "type": "close" } to end session
    
    - Server sends: { "type": "ready", "message": "..." }
    - Server sends: { "type": "session_started", "payload": {...} }
    - Server sends: { "type": "asr_partial", "payload": {"text": "..."} }
    - Server sends: { "type": "asr_final", "payload": {"text": "..."} }
    - Server sends: { "type": "llm_started", "payload": {...} }
    - Server sends: { "type": "llm_token", "payload": {"token": "...", "text": "..."} }
    - Server sends: { "type": "llm_final", "payload": {"text": "..."} }
    - Server sends: { "type": "tts_text_ready", "payload": {"chunk_index": N, "text": "..."} }
    - Server sends: { "type": "tts_chunk_ready", "payload": {"chunk_index": N, "text": "...", "audio_base64": "..."} }
    - Server sends: { "type": "error", "payload": {"message": "..."} }
    - Server sends: { "type": "pong" } in response to ping
    """
    await websocket.accept()
    print("[SpeakJoy WS] === CLIENT CONNECTED ===")
    logger.info("[SpeakJoy WS] Client connected")
    
    session: SpeakJoyRealtimeSession | None = None
    buffered_turn = BufferedAudioTurn(chunks=[])
    streaming_asr = create_streaming_asr_session(
        StreamingAsrConfig(
            provider=SPEAKJOY_STREAMING_ASR_PROVIDER or "auto",
            language="en",
            sample_rate_hz=16000,
            channels=1,
        ),
        finalize_fn=_process_audio_buffer,
    )
    is_buffered_asr = isinstance(streaming_asr, BufferedStreamingASRSession)
    logger.info(
        "[SpeakJoy WS] Streaming ASR initialized: requested=%s buffered=%s session=%s",
        SPEAKJOY_STREAMING_ASR_PROVIDER or "auto",
        is_buffered_asr,
        type(streaming_asr).__name__,
    )
    vad = BasicVoiceActivityDetector()
    turn_manager = SpeakJoyTurnManager(
        min_speech_ms=SPEAKJOY_MIN_SPEECH_MS,
        pause_finalize_ms=SPEAKJOY_PAUSE_FINALIZE_MS,
        silence_finalize_ms=SPEAKJOY_SILENCE_FINALIZE_MS,
        rearm_silence_ms=SPEAKJOY_REARM_SILENCE_MS,
    )
    logger.info(
        "[SpeakJoy WS] Turn manager thresholds: min_speech_ms=%s pause_finalize_ms=%s silence_finalize_ms=%s rearm_silence_ms=%s",
        SPEAKJOY_MIN_SPEECH_MS,
        SPEAKJOY_PAUSE_FINALIZE_MS,
        SPEAKJOY_SILENCE_FINALIZE_MS,
        SPEAKJOY_REARM_SILENCE_MS,
    )
    
    try:
        # Send ready message
        await websocket.send_json({
            "type": "ready",
            "message": "SpeakJoy WebSocket ready. Send config to start."
        })
        
        # Create event streaming task
        event_task: asyncio.Task | None = None
        asr_event_task: asyncio.Task | None = None
        
        async def stream_events():
            """Stream events from session to WebSocket"""
            if not session:
                return
                
            try:
                async for event in session.events():
                    payload = dict(event.payload)
                    if event.type == "ack" and payload.get("kind") == "timing_mark":
                        logger.info(
                            "[SpeakJoy WS] timing stage=%s since_input=%sms since_asr_final=%sms since_llm_started=%sms since_llm_first_token=%sms",
                            payload.get("stage"),
                            payload.get("since_input_start_ms"),
                            payload.get("since_asr_final_ms"),
                            payload.get("since_llm_started_ms"),
                            payload.get("since_llm_first_token_ms"),
                        )
                    
                    # Convert audio bytes to base64 for TTS chunks
                    if event.type == "tts_chunk_ready" and "audio_bytes" in payload:
                        audio_bytes = payload.pop("audio_bytes")
                        payload["audio_base64"] = base64.b64encode(audio_bytes).decode("ascii")
                    
                    await websocket.send_json({
                        "type": event.type,
                        "payload": payload
                    })
                    
                    if event.type == "turn_closed" and event.payload.get("reason") == "session_closed":
                        break
            except Exception as error:
                logger.error("[SpeakJoy WS] Event streaming error: %s", error)

        async def stream_asr_events() -> None:
            try:
                async for event in streaming_asr.events():
                    if not session:
                        continue

                    if event.type == "partial_transcript":
                        await session.push_asr_partial(
                            SpeakJoyAsrPartial(
                                text=event.text,
                                is_final=False,
                                received_at=time.monotonic(),
                            )
                        )
                    elif event.type == "final_transcript":
                        await session.push_asr_partial(
                            SpeakJoyAsrPartial(
                                text=event.text,
                                is_final=True,
                                received_at=time.monotonic(),
                            )
                        )
                    elif event.type == "error":
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": event.text or "Streaming ASR failed."}
                        })
            except Exception as error:
                logger.error("[SpeakJoy WS] ASR event streaming error: %s", error)

        await streaming_asr.start()
        asr_event_task = asyncio.create_task(stream_asr_events())

        async def finalize_buffered_turn(reason: str) -> None:
            has_pending_audio = bool(buffered_turn.chunks) if is_buffered_asr else buffered_turn.frame_count > 0
            if not session or not has_pending_audio:
                return

            print(f"[SpeakJoy WS] === FINALIZING TURN ({reason}), buffer: {len(buffered_turn.chunks)} chunks ===")
            await websocket.send_json({
                "type": "ack",
                "payload": {
                    "kind": "audio_final_processing",
                    "reason": reason,
                    "chunks": len(buffered_turn.chunks),
                    "frame_count": buffered_turn.frame_count,
                    "frame_bytes": buffered_turn.frame_bytes,
                }
            })
            try:
                transcript = ""
                duration = 0.0
                if is_buffered_asr:
                    transcript, duration = await streaming_asr.finalize()
                else:
                    await streaming_asr.end_input()
                buffered_turn.clear()
                turn_manager.reset()

                if is_buffered_asr:
                    if transcript:
                        logger.info("[SpeakJoy WS] ASR transcript: %s (%.1fs)", transcript, duration)
                    else:
                        logger.warning("[SpeakJoy WS] Empty transcript from ASR")
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Could not understand speech. Please try again."}
                        })
            except ValueError as error:
                logger.warning("[SpeakJoy WS] ASR validation error: %s", error)
                await websocket.send_json({
                    "type": "error",
                    "payload": {"message": str(error)}
                })
                buffered_turn.clear()
                if is_buffered_asr:
                    streaming_asr.clear()
                turn_manager.reset()
            except Exception as error:
                logger.error("[SpeakJoy WS] ASR processing failed: %s", error)
                await websocket.send_json({
                    "type": "error",
                    "payload": {"message": "Speech recognition failed. Please try again."}
                })
                buffered_turn.clear()
                if is_buffered_asr:
                    streaming_asr.clear()
                turn_manager.reset()
        
        # Main message loop
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                msg_type = message.get("type")
                
                if msg_type == "config":
                    # Initialize session with config
                    config_data = message.get("payload", {})
                    config = SpeakJoyConfig(
                        child_age=config_data.get("child_age", 7),
                        child_name=config_data.get("child_name", "friend"),
                        child_id=config_data.get("child_id", ""),
                        topic_name=config_data.get("topic_name", ""),
                        vocabulary=config_data.get("vocabulary", []),
                        speaker=config_data.get("speaker", "Ryan"),
                        pause_after_ms=config_data.get("pause_after_ms", 500),
                        tts_words_per_chunk=config_data.get("tts_words_per_chunk", 16),
                        llm_provider=config_data.get("llm_provider", ""),
                        llm_api_key=config_data.get("llm_api_key", ""),
                        llm_model=config_data.get("llm_model", ""),
                        llm_base_url=config_data.get("llm_base_url", ""),
                    )
                    
                    session = SpeakJoyRealtimeSession(config=config)
                    
                    # Start event streaming task
                    event_task = asyncio.create_task(stream_events())
                    
                    await websocket.send_json({
                        "type": "session_started",
                        "payload": {
                            "child_name": config.child_name,
                            "child_age": config.child_age,
                            "topic_name": config.topic_name
                        }
                    })
                    logger.info("[SpeakJoy WS] Session started for %s", config.child_name)
                    
                    # AI proactively greets the child through the same session
                    # pipeline as normal replies, so greeting latency and
                    # behavior are no longer a special-case WebSocket branch.
                    greeting = f"Hi {config.child_name}! I'm Joy! Are you ready to learn and have fun together?"
                    if config.topic_name:
                        greeting = f"Hi {config.child_name}! I'm Joy! Let's practice {config.topic_name} together. Are you ready?"

                    asyncio.create_task(
                        session.send_assistant_message(
                            greeting,
                            mode="greeting",
                            source_message="__greeting__",
                        )
                    )
                
                elif msg_type == "audio_frame":
                    if not session:
                        continue

                    audio_base64 = message.get("data", "")
                    if audio_base64:
                        try:
                            audio_bytes = base64.b64decode(audio_base64)
                            buffered_turn.append_frame(audio_bytes)
                            if not is_buffered_asr:
                                await streaming_asr.push_audio(
                                    audio_bytes,
                                    timestamp_ms=int(message.get("timestamp_ms") or time.time() * 1000),
                                )
                            timestamp_ms = int(message.get("timestamp_ms") or time.time() * 1000)
                            rms = float(message.get("rms") or 0.0)
                            peak = float(message.get("peak") or 0.0)
                            snapshot = vad.observe(
                                VadObservation(
                                    timestamp_ms=timestamp_ms,
                                    rms=rms,
                                    peak=peak,
                                )
                            )
                            if snapshot.changed:
                                await websocket.send_json(
                                    {
                                        "type": "vad_state",
                                        "payload": {
                                            "status": snapshot.status,
                                            "rms": snapshot.rms,
                                            "peak": snapshot.peak,
                                            "speech_ms": snapshot.speech_ms,
                                            "silence_ms": snapshot.silence_ms,
                                        },
                                    }
                                )
                            decision = turn_manager.observe(
                                snapshot,
                                has_buffered_audio=bool(buffered_turn.chunks) if is_buffered_asr else buffered_turn.frame_count > 0,
                                turn_open=session.is_turn_open(),
                            )
                            if decision.should_finalize and (
                                bool(buffered_turn.chunks) if is_buffered_asr else buffered_turn.frame_count > 0
                            ):
                                await finalize_buffered_turn(decision.reason)
                        except Exception as error:
                            logger.error("[SpeakJoy WS] Audio frame decode error: %s", error)

                elif msg_type == "audio_chunk":
                    # Receive audio chunk from client
                    if not session:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"message": "Session not initialized. Send config first."}
                        })
                        continue

                    if session.is_turn_open():
                        await websocket.send_json({
                            "type": "ack",
                            "payload": {
                                "kind": "audio_chunk_ignored",
                                "reason": "turn_busy",
                            }
                        })
                        continue
                    
                    audio_base64 = message.get("data", "")
                    if audio_base64:
                        try:
                            audio_bytes = base64.b64decode(audio_base64)
                            buffered_turn.append_chunk(audio_bytes)
                            if is_buffered_asr:
                                await streaming_asr.push_audio(audio_bytes)
                            await websocket.send_json({
                                "type": "ack",
                                "payload": {
                                    "kind": "audio_chunk_buffered",
                                    "bytes": len(audio_bytes),
                                    "chunks": len(buffered_turn.chunks),
                                    "frame_count": buffered_turn.frame_count,
                                    "buffered_bytes": streaming_asr.total_bytes if is_buffered_asr else None,
                                }
                            })
                            print(f"[SpeakJoy WS] Audio chunk received: {len(audio_bytes)} bytes, buffer size: {len(buffered_turn.chunks)}")
                        except Exception as error:
                            logger.error("[SpeakJoy WS] Audio decode error: %s", error)
                
                elif msg_type == "audio_final":
                    # End of speech - process accumulated audio
                    if not session:
                        continue

                    if session.is_turn_open():
                        buffered_turn.clear()
                        await websocket.send_json({
                            "type": "ack",
                            "payload": {"kind": "audio_final_ignored", "reason": "turn_busy"}
                        })
                        continue
                    
                    print(f"[SpeakJoy WS] === AUDIO_FINAL received, buffer: {len(buffered_turn.chunks)} chunks ===")
                    if bool(buffered_turn.chunks) if is_buffered_asr else buffered_turn.frame_count > 0:
                        await finalize_buffered_turn("audio_final")

                elif msg_type == "interrupt_assistant":
                    if session:
                        await session.interrupt_current_turn(reason="client_interrupt")

                elif msg_type == "chunk_played":
                    # Client finished playing a TTS chunk
                    if session:
                        chunk_index = message.get("chunk_index", 0)
                        await session.mark_tts_chunk_played(chunk_index)
                
                elif msg_type == "ping":
                    # Keepalive ping
                    await websocket.send_json({"type": "pong"})
                
                elif msg_type == "close":
                    # Client requested close
                    logger.info("[SpeakJoy WS] Client requested close")
                    break
                
                else:
                    logger.warning("[SpeakJoy WS] Unknown message type: %s", msg_type)
                    await websocket.send_json({
                        "type": "error",
                        "payload": {"message": f"Unknown message type: {msg_type}"}
                    })
            
            except WebSocketDisconnect:
                logger.info("[SpeakJoy WS] Client disconnected")
                break
            except json.JSONDecodeError as error:
                logger.error("[SpeakJoy WS] JSON decode error: %s", error)
                await websocket.send_json({
                    "type": "error",
                    "payload": {"message": "Invalid JSON"}
                })
            except Exception as error:
                logger.error("[SpeakJoy WS] Error: %s", error)
                await websocket.send_json({
                    "type": "error",
                    "payload": {"message": str(error)}
                })
    
    finally:
        # Cleanup
        if session:
            await session.close()
        if event_task and not event_task.done():
            event_task.cancel()
            try:
                await event_task
            except asyncio.CancelledError:
                pass
        if asr_event_task and not asr_event_task.done():
            asr_event_task.cancel()
            try:
                await asr_event_task
            except asyncio.CancelledError:
                pass
        await streaming_asr.close()
        
        logger.info("[SpeakJoy WS] Connection closed")


