# SpeakJoy Freestyle Conversation — Tài liệu kỹ thuật chi tiết

## Tổng quan

Tính năng luyện nói freestyle cho phép trẻ trò chuyện tự do bằng tiếng Anh với nhân vật AI "Joy" (🦁) thông qua giọng nói realtime. Hệ thống sử dụng pipeline WebSocket: **Microphone → Audio Chunks → ASR → LLM (streaming) → TTS (chunked) → Audio Playback**.

---

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                     │
│                                                              │
│  SpeakJoy/page.tsx ──► useSpeakJoyCall.ts ──► speakjoy-realtime.ts
│       (UI)                (React Hook)         (WebSocket Client)
│                                                      │
│  TipsPanel.tsx    HistoryPanel.tsx    useSessionHistory.ts    │
│  (Tips bên trái)  (Lịch sử bên phải)  (Fetch sessions)      │
└──────────────────────────────────┬───────────────────────────┘
                                   │ WebSocket (ws://host:8000/api/ai/ws/speakjoy)
┌──────────────────────────────────▼───────────────────────────┐
│                        BACKEND (FastAPI)                       │
│                                                              │
│  speakjoy_ws.py ──► speakjoy.py (SpeakJoyRealtimeSession)    │
│  (WS endpoint)      (AI logic, turn management)              │
│       │                    │                                  │
│       ▼                    ▼                                  │
│  ASR Pipeline         LLM (Gemini)         TTS (ComfyUI)     │
│  (ComfyUI/Qwen3)     (streaming tokens)   (chunked audio)   │
└──────────────────────────────────────────────────────────────┘
```

---

## Luồng cuộc gọi (Call Flow)

### 1. Bắt đầu cuộc gọi

1. User bấm nút ☎️ → `handleStartCall()` → `useSpeakJoyCall.startCall()`
2. Kiểm tra quyền microphone (`getUserMedia`)
3. Tạo `SpeakJoyRealtimeClient`, kết nối WebSocket
4. Gửi message `config` với: child_age, child_name, topic_name, vocabulary, speaker, pause_after_ms, tts_words_per_chunk
5. Server tạo `SpeakJoyRealtimeSession`, gửi `session_started`
6. Server gửi lời chào proactive qua LLM events + TTS audio
7. Frontend đặt timer 12s fallback để bắt đầu ghi âm nếu greeting không đến

### 2. Ghi âm & gửi audio (Client → Server)

- Ghi âm theo segment ~4.2 giây bằng MediaRecorder (webm/opus)
- Khi segment kết thúc: validate duration (≥1.4s) và size (≥22KB)
- Gửi base64 `audio_chunk` + `audio_final`
- Đặt `awaitingTurnResolution = true` để chặn ghi âm chồng chéo

### 3. Xử lý ASR (Server)

- Decode webm → WAV, trim silence
- Validate: duration ≥1.1s, RMS ≥300 (đủ to)
- Retry transcription tối đa 2 lần
- Push `SpeakJoyAsrPartial(is_final=True)` vào session
- Session validate thêm:
  - Reject transcript ngắn (<2 từ)
  - Reject low-information ("yeah", "um", "oh")
  - Reject rapid follow-up (<2.5s kể từ turn trước, ≤3 từ)

### 4. Sinh phản hồi LLM (Server)

- Emit `llm_started` (mode: "remote" hoặc "fallback")
- Nếu đang cooldown (429 quota): dùng local fallback rules (keyword-based)
- Nếu không: stream tokens từ remote LLM (Gemini)
- Khi tokens đến, extract TTS-ready prefixes tại ranh giới câu/mệnh đề
- Emit `llm_token` cho mỗi token, `llm_final` khi hoàn tất

### 5. Sinh TTS (Server — song song với LLM streaming)

- Chia text thành chunks (~16 từ) tại ranh giới câu/mệnh đề
- Mỗi chunk: gọi `synthesize_tts` → emit `tts_text_ready` rồi `tts_chunk_ready` với audio_base64
- Client queue audio chunks và phát tuần tự với prebuffering

### 6. Phát audio (Client)

- Prebuffer ≥2 chunks hoặc ≥140KB trước khi bắt đầu phát
- Phát chunks tuần tự qua HTMLAudioElement
- Mỗi chunk kết thúc: gửi `chunk_played` về server, phát chunk tiếp
- Khi tất cả chunks xong: `onTtsPlaybackComplete` → idle → schedule ghi âm lại sau 1.3s cooldown

### 7. Kết thúc cuộc gọi

- Gửi `close` message, đóng WebSocket, dừng ghi âm, clear state

---

## WebSocket Protocol

### Client → Server

| Message Type | Payload | Mô tả |
|---|---|---|
| `config` | `{ child_age, child_name, topic_name, vocabulary, speaker, pause_after_ms, tts_words_per_chunk }` | Khởi tạo session |
| `audio_chunk` | `{ data: "<base64>" }` | Gửi audio chunk |
| `audio_final` | — | Báo hiệu kết thúc speech |
| `chunk_played` | `{ chunk_index: N }` | Báo đã phát xong TTS chunk |
| `ping` | — | Keepalive |
| `close` | — | Kết thúc session |

### Server → Client

| Message Type | Payload | Mô tả |
|---|---|---|
| `ready` | `{ message }` | Server sẵn sàng |
| `session_started` | `{ child_name, child_age, topic_name }` | Session đã khởi tạo |
| `asr_partial` | `{ text }` | Transcript tạm thời |
| `asr_final` | `{ text, reason, turn_id }` | Transcript cuối cùng |
| `llm_started` | `{ message, turn_id, mode }` | LLM bắt đầu sinh text |
| `llm_token` | `{ token, text }` | Token mới từ LLM |
| `llm_final` | `{ text }` | LLM hoàn tất |
| `tts_text_ready` | `{ chunk_index, text }` | Text chunk sẵn sàng cho TTS |
| `tts_chunk_ready` | `{ chunk_index, text, audio_base64 }` | Audio chunk sẵn sàng |
| `error` | `{ message }` | Lỗi |
| `ack` | `{ kind, ... }` | Xác nhận nhận được |
| `pong` | — | Phản hồi ping |

---

## State Machine (ActivityStatus)

```
         ┌──────────────────────────────────────────┐
         │                                          │
         ▼                                          │
    ┌─────────┐    startRecording    ┌───────────┐  │
    │  idle   │ ──────────────────► │ listening │  │
    └─────────┘                      └───────────┘  │
         ▲                                │         │
         │                     onAsrFinal │         │
         │                                ▼         │
         │                         ┌──────────┐    │
         │    onTtsPlaybackComplete│ thinking │    │
         │◄────────────────────────└──────────┘    │
         │                                │         │
         │                  onTtsChunkReady│         │
         │                                ▼         │
         │                         ┌──────────┐    │
         └─────────────────────────│ speaking │────┘
                                   └──────────┘
```

| State | Ý nghĩa | Trigger |
|---|---|---|
| `idle` | Sẵn sàng, chờ | Sau TTS playback + cooldown 1.3s |
| `listening` | Đang ghi âm | startRecording thành công |
| `thinking` | ASR xong, LLM đang sinh | onAsrFinal / onLlmStarted |
| `speaking` | TTS đang phát | onTtsChunkReady |

---

## Xử lý lỗi & Recovery

| Lỗi | Xử lý |
|---|---|
| Microphone bị chặn | Hiển thị lỗi, transition về idle |
| Audio quá ngắn/nhỏ | Server gửi error mô tả, client tự restart recording sau 900ms |
| 429/Quota exceeded | Cooldown 20-90s (exponential backoff), chuyển sang fallback mode, hiện countdown |
| ASR thất bại | Retry 1 lần (delay 350ms), rồi gửi error |
| WebSocket disconnect | Auto-reconnect tối đa 3 lần (delay 1s, 2s, 3s) |
| Transcript low-information | Yêu cầu nói thêm, restart recording |

---

## Cấu hình (SpeakJoyConfig)

| Tham số | Mặc định | Mô tả |
|---|---|---|
| `child_age` | 7 | Tuổi trẻ (ảnh hưởng prompt LLM) |
| `child_name` | "friend" | Tên trẻ |
| `topic_name` | "" | Chủ đề (nếu có) |
| `vocabulary` | [] | Từ vựng mục tiêu |
| `speaker` | "Ryan" | Giọng TTS (Ryan, Serena, Aiden, Vivian) |
| `pause_after_ms` | 500 (server) / 800 (hook) | Thời gian im lặng trước khi kết thúc turn |
| `tts_words_per_chunk` | 16 | Số từ mỗi TTS chunk |

---

## UI Components

### Trang chính (`SpeakJoy/page.tsx`)

**Idle state (3 cột):**
- Trái: TipsPanel (mẹo, có thể dismiss)
- Giữa: Nhân vật Joy (🦁) + nút gọi ☎️ + chọn giọng
- Phải: HistoryPanel (lịch sử sessions, collapsible)

**Active call (full-screen overlay):**
- Header: nút TRỞ VỀ, tên "Nói cùng Joy", timer, chọn giọng
- Character: thu nhỏ khi chat bắt đầu, animation theo status
- Status badge: 🎤 Đang nghe / 🤔 Đang suy nghĩ / 💬 Đang nói / Sẵn sàng
- Streaming text: hiển thị text AI đang sinh (gradient hồng+vàng+xanh lá)
- Partial transcript: hiển thị text user đang nói (xanh emerald)
- Chat messages: bóng chat gradient (AI: hồng→vàng→xanh lá, User: tím→xanh dương→đỏ)
- Suggestions: hiện sau 3s im lặng

### TipsPanel

- 2 tips mặc định: yên tĩnh, thử nghiệm
- Dismiss bằng nút X, fade-out animation
- Collapse khi tất cả dismissed

### HistoryPanel

- Fixed ở rìa phải màn hình
- Nút mũi tên toggle mở/đóng
- Hiển thị sessions grouped by date ("Hôm nay", "Hôm qua")
- Mỗi entry: icon robot, timestamp HH:mm:ss, số tin nhắn, thời lượng MM:SS

---

## Local Fallback Mode

Khi LLM quota bị exceeded (429), hệ thống chuyển sang fallback mode:
- Dùng keyword-based rules để sinh phản hồi
- Các topic rules: food, game, art, school, animals, family
- Pattern matching: "I like...", câu hỏi, câu ngắn
- Hiển thị badge "Joy đang ở chế độ dự phòng" trên UI
- Tự động quay lại remote mode khi cooldown hết

---

## Danh sách file

### Frontend
- `fe/app/(dashboard)/SpeakJoy/page.tsx` — Trang chính UI
- `fe/hooks/useSpeakJoyCall.ts` — React hook quản lý call state
- `fe/lib/speakjoy-realtime.ts` — WebSocket client class
- `fe/components/speakjoy/TipsPanel.tsx` — Panel tips
- `fe/components/speakjoy/HistoryPanel.tsx` — Panel lịch sử
- `fe/hooks/useSessionHistory.ts` — Hook fetch sessions
- `fe/lib/call-prep-utils.ts` — Utility functions
- `fe/types/call-prep.ts` — TypeScript types

### Backend
- `be/ai_service/speakjoy_ws.py` — WebSocket endpoint
- `be/ai_service/speakjoy.py` — AI session logic, turn management, TTS chunking
- `be/ai_service/app.py` — FastAPI app (mount WS, ASR, TTS, LLM functions)
- `be/ai_service/comfy_asr_client.py` — ComfyUI ASR client
- `be/ai_service/comfy_tts_client.py` — ComfyUI TTS client

---

## Hằng số quan trọng

| Hằng số | Giá trị | Vị trí | Mô tả |
|---|---|---|---|
| `RECORDING_SEGMENT_MS` | 4200 | speakjoy-realtime.ts | Thời gian mỗi segment ghi âm |
| `MIN_AUDIO_SEGMENT_BYTES` | 22000 | speakjoy-realtime.ts | Kích thước tối thiểu audio segment |
| `MIN_LISTEN_WINDOW_MS` | 1400 | speakjoy-realtime.ts | Thời gian ghi âm tối thiểu |
| `TTS_PREBUFFER_CHUNKS` | 2 | speakjoy-realtime.ts | Số chunks buffer trước khi phát |
| `TTS_MIN_START_BUFFER_BYTES` | 140000 | speakjoy-realtime.ts | Bytes tối thiểu trước khi phát |
| `TTS_POST_PLAYBACK_COOLDOWN_MS` | 1300 | useSpeakJoyCall.ts | Cooldown sau khi TTS phát xong |
| `MIN_VOICE_DURATION_SECONDS` | 1.1 | speakjoy_ws.py | Thời lượng audio tối thiểu |
| `MIN_TRIMMED_RMS` | 300 | speakjoy_ws.py | RMS tối thiểu (chống nhiễu) |
| `LLM_429_BASE_COOLDOWN_SECONDS` | 20.0 | speakjoy.py | Cooldown cơ bản khi quota exceeded |
| `LLM_429_MAX_COOLDOWN_SECONDS` | 90.0 | speakjoy.py | Cooldown tối đa |
| `RAPID_FOLLOWUP_WINDOW_SECONDS` | 2.5 | speakjoy.py | Cửa sổ chống rapid follow-up |
