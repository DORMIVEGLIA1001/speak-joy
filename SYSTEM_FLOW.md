# Sơ Đồ Luồng Hoạt Động Speak Joy

Tài liệu này mô tả luồng hoạt động chính của hệ thống Speak Joy dựa trên cấu trúc hiện tại của dự án.

## Ảnh Sơ Đồ

![Sơ đồ tổng quan hệ thống](./docs/diagrams/system-flow-overview.svg)

![Sơ đồ luồng luyện nói](./docs/diagrams/practice-flow.svg)

![Sơ đồ luồng dữ liệu chính](./docs/diagrams/data-flow.svg)

## 1. Tổng Quan Hệ Thống

```mermaid
flowchart TD
    U[Phụ huynh hoặc bé] --> FE[Frontend Next.js]

    FE --> AUTH[Đăng ký / Đăng nhập]
    FE --> CHILD[Quản lý hồ sơ bé]
    FE --> TOPIC[Chọn chủ đề / bài học]
    FE --> PRACTICE[Màn hình luyện nói]

    AUTH --> BE[Backend Express API]
    CHILD --> BE
    TOPIC --> BE

    BE --> DB[(PostgreSQL / Supabase)]
    BE --> JWT[JWT Access Token]

    PRACTICE --> MIC[Trình duyệt ghi âm bằng MediaRecorder]
    MIC --> PROXY[Next.js API: /api/ai/practice]
    PROXY --> CONFIG[Lấy AI config của bé nếu có token và active student]
    CONFIG --> BE
    PROXY --> AI[Python FastAPI AI Service: /practice/audio]

    AI --> ASR[ASR: local Qwen hoặc DashScope]
    AI --> SCORE[Chấm điểm phát âm: phoneme / LLM / fast score]
    AI --> LLM[LLM feedback: Gemini / OpenAI-compatible / Claude / Qwen]
    AI --> TTS[TTS: local Qwen hoặc DashScope]
    AI --> VOCAB[(Vocabulary từ Supabase hoặc JSON dataset)]

    ASR --> RESULT[Kết quả: transcript, score, feedback, correction, audio_base64]
    SCORE --> RESULT
    LLM --> RESULT
    TTS --> RESULT

    RESULT --> PROXY
    PROXY --> PRACTICE
    PRACTICE --> UI[Hiển thị điểm, transcript, nhận xét và phát audio phản hồi]
```

## 2. Luồng Luyện Nói

```mermaid
sequenceDiagram
    participant User as Bé / Phụ huynh
    participant FE as Frontend Next.js
    participant Proxy as /api/ai/practice
    participant BE as Express Backend
    participant AI as FastAPI AI Service
    participant DB as PostgreSQL / Supabase
    participant Models as ASR / LLM / TTS

    User->>FE: Chọn chủ đề và câu cần luyện
    FE->>BE: Lấy topics / sessions / child profile
    BE->>DB: Truy vấn dữ liệu
    DB-->>BE: Trả dữ liệu
    BE-->>FE: Trả danh sách bài học / hồ sơ

    User->>FE: Bấm Start và nói vào micro
    FE->>FE: Ghi âm, đổi audio sang WAV nếu cần
    FE->>Proxy: POST FormData audio + target_text + topic + provider

    Proxy->>BE: Lấy AI runtime config của bé
    BE->>DB: Đọc cấu hình API key / model / baseUrl
    DB-->>BE: Trả config
    BE-->>Proxy: Trả AI config

    Proxy->>AI: POST /practice/audio
    AI->>Models: ASR chuyển audio thành transcript
    AI->>Models: Chấm phát âm bằng phoneme / LLM / fast score
    AI->>Models: Sinh lời phản hồi bằng TTS
    AI-->>Proxy: transcript + score + feedback + audio_base64
    Proxy-->>FE: JSON kết quả
    FE-->>User: Hiển thị điểm, nhận xét, phát lại audio của bé và Joy
```

## 3. Luồng Dữ Liệu Chính

```mermaid
flowchart LR
    subgraph Frontend["Frontend - fe"]
        Pages[Pages: login, topics, practice, parent settings]
        Components[Practice components: VoicePracticePanel, RecordButton, Feedback]
        ApiProxy[Route handler: app/api/ai/practice]
    end

    subgraph Backend["Backend - be"]
        Auth[Auth module]
        Children[Children module]
        Topics[Topics module]
        Sessions[Sessions module]
        Middleware[Auth middleware]
    end

    subgraph Database["Database"]
        Users[(users)]
        ChildrenTable[(children)]
        AiConfigs[(user_ai_configs)]
        TopicsTable[(topics)]
        Vocabulary[(vocabulary_items)]
        SessionsTable[(learning_sessions)]
        Interactions[(session_interactions)]
        Media[(media_assets)]
    end

    subgraph AIService["AI Service - be/ai_service"]
        PracticeAudio[/POST /practice/audio/]
        ASR[Speech to text]
        Scoring[Pronunciation scoring]
        Feedback[LLM feedback]
        Speech[TTS audio response]
    end

    Pages --> Components
    Components --> ApiProxy
    Pages --> Auth
    Pages --> Children
    Pages --> Topics
    Pages --> Sessions

    Auth --> Middleware
    Children --> Middleware
    Sessions --> Middleware

    Auth --> Users
    Children --> ChildrenTable
    Children --> AiConfigs
    Topics --> TopicsTable
    Topics --> Vocabulary
    Sessions --> SessionsTable
    Sessions --> Interactions
    Sessions --> Media

    ApiProxy --> Children
    ApiProxy --> PracticeAudio
    PracticeAudio --> ASR
    PracticeAudio --> Scoring
    PracticeAudio --> Feedback
    PracticeAudio --> Speech
    PracticeAudio --> Vocabulary
```

## 4. Các Thành Phần Chính

- Frontend: ứng dụng Next.js trong thư mục `fe`, phụ trách giao diện, ghi âm, gọi API và hiển thị kết quả luyện nói.
- Backend: Express API trong thư mục `be/src`, phụ trách xác thực, hồ sơ bé, chủ đề, phiên học và kết nối database.
- Database: PostgreSQL / Supabase, được mô tả trong `be/prisma/schema.prisma`.
- AI Service: FastAPI trong `be/ai_service`, phụ trách nhận audio, ASR, chấm phát âm, gọi LLM và tạo audio phản hồi.
- Next.js AI Proxy: route `fe/app/api/ai/practice/route.ts`, dùng để bổ sung AI config của bé trước khi gọi AI service.

## 5. File Tham Chiếu

- `be/src/app.ts`: định nghĩa route backend chính.
- `be/src/modules/auth`: đăng ký, đăng nhập và lấy thông tin user.
- `be/src/modules/children`: quản lý hồ sơ bé và AI runtime config.
- `be/src/modules/topics`: danh sách chủ đề và hoàn thành bài học.
- `be/src/modules/sessions`: tạo, đọc và kết thúc phiên học.
- `be/prisma/schema.prisma`: cấu trúc database.
- `fe/lib/ai-practice.ts`: đóng gói audio và gửi request luyện nói.
- `fe/app/api/ai/practice/route.ts`: proxy request từ frontend sang AI service.
- `be/ai_service/app.py`: xử lý `/practice/audio`, ASR, scoring, LLM feedback và TTS.
docker logs speakjoy-tunnel | findstr trycloudflare.com
