# Hướng Dẫn Bàn Giao Deploy Dự Án Speak Joy

Tài liệu này dùng để gửi cho đồng nghiệp hoặc đội vận hành để hỗ trợ setup và deploy dự án `speak joy` lên server công ty.

## 1. Tổng quan hệ thống

Dự án hiện chạy bằng Docker Compose và chỉ còn 2 service:

- `be`: backend FastAPI, chạy cổng `8000`
- `fe`: frontend Next.js, chạy cổng `3000`

Lưu ý:

- Phần AI đã được gộp vào backend `be`
- Database không chạy local trong compose, hiện dùng kết nối ngoài qua biến môi trường

Hiện tại backend `be` đã gồm:

- auth
- children
- topics
- sessions
- AI routes tại `/api/ai`

## 2. Điều cần biết khi deploy

Hiện hệ thống chỉ có 1 backend server thật là `be`.

Phần AI nói chuyện với trẻ không còn là container riêng mà nằm bên trong backend `be`.

Frontend public ra ngoài cho người dùng, còn frontend sẽ gọi backend qua `/api`.

## 3. Những gì cần được bàn giao trước khi deploy

Người deploy cần được cung cấp:

### 1. Repo Git hoặc source code

SSH:git@git.chainz.tech:chainhub/speak-joy-fe.git
HTTPS:https://git.chainz.tech/chainhub/speak-joy-fe.git

SSH:git@git.chainz.tech:chainhub/speak-joy-be.git
HTTPS:https://git.chainz.tech/chainhub/speak-joy-be.git

### 2. File env backend thật

PORT=8000
NODE_ENV=development

AI_PROVIDER=gemini
AI_BASE_URL=https://aistudio.google.com/
AI_MODEL=gemini-2.5-flash
AI_API_KEY=
QWEN_LLM_API_KEY=
QWEN_LLM_MODEL=qwen-flash
QWEN_LLM_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1

JWT_SECRET=

DIRECT_URL=postgresql://postgres.xdzjytxsqalgiuyckncn:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres

DATABASE_URL=postgresql://postgres.xdzjytxsqalgiuyckncn:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true

ASR_PROVIDER=comfyui
ASR_API_MODEL=qwen3-asr-flash
COMFYUI_URL=https://comfy.hungnm.top
COMFYUI_AUTH_USER=chainz
COMFYUI_AUTH_PASSWORD=ch@inz
COMFYUI_ASR_WORKFLOW=./be/ai_service/workflows/qwen3_asr_comfyui_api.json
COMFYUI_ASR_TIMEOUT_SECONDS=120
COMFYUI_ASR_POLL_INTERVAL_SECONDS=0.5


TTS_API_MODEL=qwen3-tts-flash-realtime

TTS_PROVIDER=comfyui
COMFYUI_TTS_WORKFLOW=./be/ai_service/workflows/qwen3_tts_comfyui_api.json
COMFYUI_TTS_TIMEOUT_SECONDS=180
COMFYUI_TTS_SPEAKER=Ryan
COMFYUI_TTS_MODEL_CHOICE=0.6B
COMFYUI_TTS_DEVICE=cuda
COMFYUI_TTS_PRECISION=bf16
COMFYUI_TTS_LANGUAGE=English

HTTPX_TRUST_ENV=false
KIDBOT_MAX_TOPICS_PER_SESSION=3
KIDBOT_MAX_WORDS_PER_TOPIC=15
KIDBOT_SESSION_TTL_SECONDS=21600


- Danh sách domain được phép trong `CORS_ORIGINS`:
 `http://localhost:3000,http://192.168.1.10:3000`

- Các API key hoặc thông tin AI đang dùng:
  - Gemini API Key: ``
  - Dashscope API Key (ASR/TTS): `sk-` / `sk-`

- Nếu dùng ComfyUI thì cần:
  - URL: `https://comfy.hungnm.top`
  - tài khoản: User `chainz` / Password `ch@inz`
  - workflow liên quan: 
    - ASR: `./be/ai_service/workflows/qwen3_asr_comfyui_api.json`
    - TTS: `./be/ai_service/workflows/qwen3_tts_comfyui_api.json`

## 4. Chuẩn bị file env backend

Backend đang dùng file:

- `be/.env.docker.supabase`

PORT=8000
NODE_ENV=development

AI_PROVIDER=gemini
AI_BASE_URL=https://aistudio.google.com/
AI_MODEL=gemini-2.5-flash
AI_API_KEY=
QWEN_LLM_API_KEY=
QWEN_LLM_MODEL=qwen-flash
QWEN_LLM_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1

JWT_SECRET=

DIRECT_URL=postgresql://postgres.xdzjytxsqalgiuyckncn:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres

DATABASE_URL=postgresql://postgres.xdzjytxsqalgiuyckncn:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true

ASR_PROVIDER=comfyui
ASR_API_MODEL=qwen3-asr-flash
COMFYUI_URL=https://comfy.hungnm.top
COMFYUI_AUTH_USER=chainz
COMFYUI_AUTH_PASSWORD=ch@inz
COMFYUI_ASR_WORKFLOW=./be/ai_service/workflows/qwen3_asr_comfyui_api.json
COMFYUI_ASR_TIMEOUT_SECONDS=120
COMFYUI_ASR_POLL_INTERVAL_SECONDS=0.5


TTS_API_MODEL=qwen3-tts-flash-realtime

TTS_PROVIDER=comfyui
COMFYUI_TTS_WORKFLOW=./be/ai_service/workflows/qwen3_tts_comfyui_api.json
COMFYUI_TTS_TIMEOUT_SECONDS=180
COMFYUI_TTS_SPEAKER=Ryan
COMFYUI_TTS_MODEL_CHOICE=0.6B
COMFYUI_TTS_DEVICE=cuda
COMFYUI_TTS_PRECISION=bf16
COMFYUI_TTS_LANGUAGE=English

HTTPX_TRUST_ENV=false
KIDBOT_MAX_TOPICS_PER_SESSION=3
KIDBOT_MAX_WORDS_PER_TOPIC=15
KIDBOT_SESSION_TTL_SECONDS=21600

Trong file này cần có tối thiểu:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- các biến AI nếu hệ thống đang dùng

## 5. Kiểm tra file env frontend

Frontend đang dùng file:

- `fe/.env.docker`

Giá trị hiện tại nên là:

```env
BACKEND_URL=http://be:8000
NEXT_PUBLIC_BACKEND_URL=/api
AUTH_COOKIE_SECURE=true
```

Kiểm tra container:

```bash
docker ps
```

Xem log:

```bash
docker logs -f speak-joy-be
docker logs -f speak-joy-fe
```

Test health backend:

```bash
curl http://127.0.0.1:8000/health
```

Kỳ vọng:

```json
{"status":"ok","service":"be-python"}
```

Test health AI:

```bash
curl http://127.0.0.1:8000/api/ai/health
```

Test frontend:

```bash
curl http://127.0.0.1:3000
```

Hoặc mở trình duyệt vào frontend qua IP hoặc domain.

## 6. Cách update phiên bản mới

Khi có code mới:

```bash
git pull
docker compose up -d --build
```

## 7. Các điểm cần lưu ý

- Backend thật duy nhất là `be`
- AI nằm trong `be`, không phải server riêng
- Nếu deploy qua domain công ty thì nên để frontend public, backend có thể chỉ chạy nội bộ
- Nếu cần reverse proxy thì có thể đặt Nginx hoặc hệ thống proxy của công ty phía trước frontend

## 8. Tóm tắt ngắn 

Đây là dự án Docker Compose gồm 2 service:

- `be`: FastAPI backend, port `8000`
- `fe`: Next.js frontend, port `3000`

Deploy bằng:

```bash
docker compose up -d --build
```

Kiểm tra bằng:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/ai/health
docker ps
```

Nếu `be` và `fe` đều chạy, health backend OK, health AI OK thì coi như deploy cơ bản thành công.
