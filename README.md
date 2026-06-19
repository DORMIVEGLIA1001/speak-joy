# Speak Joy Code Structure

Tai lieu nay mo ta nhanh cau truc code hien tai cua du an `speak joy`.

## Tong quan

- Thu muc goc dung de dieu phoi ca frontend, backend, Docker, tai lieu va script.
- `be/` la backend Python/FastAPI, ket noi Supabase/Postgres va chua AI service cho KidBot.
- `fe/` la frontend Next.js App Router.
- Thu muc goc khong phai la mot Git repo duy nhat.
- `be/` va `fe/` dang la 2 repo rieng.

## Cau truc thu muc goc

```text
E:\test\speak joy
|-- be/                       Backend FastAPI + AI service
|-- fe/                       Frontend Next.js
|-- docs/                     Tai lieu bo sung
|-- scripts/                  Script ho tro o muc du an
|-- docker-compose.yml        Chay frontend + backend bang Docker
|-- package.json              Script/phu tro o muc root
|-- SYSTEM_FLOW.md            Mo ta luong he thong
|-- speak_joy_system_design.md
```

## Backend `be/`

```text
be/
|-- app/                      API FastAPI chinh
|   |-- api/
|   |   |-- deps.py           Auth dependency, inject current user
|   |   `-- routes/           Route auth, children, health, sessions, topics
|   |-- core/                 Cau hinh va helper core
|   |-- db/                   Ket noi Postgres/Supabase
|   |-- repositories/         Truy van DB truc tiep
|   |-- schemas/              Pydantic schema request/response
|   `-- services/             Business logic
|-- ai_service/               ASR, TTS, LLM scoring, KidBot practice flow
|-- ai/                       Tai nguyen/ma lien quan AI cu va du lieu bo tro
|-- get_data/                 Dataset JSON cho tu vung
|-- scripts/                  Script ho tro backend
|-- Dockerfile.fastapi        Docker image cho backend
|-- requirements.fastapi.txt  Dependency Python
|-- .env.example              Mau env local
`-- .env.docker.supabase.example
```

### Vai tro cac lop trong `be/app`

- `api/routes/`: nhan request HTTP va tra response JSON.
- `services/`: xu ly logic nghiep vu, validate va ket hop repository.
- `repositories/`: chua SQL truy cap bang `psycopg2`.
- `schemas/`: model Pydantic cho auth, topics, children, sessions.
- `db/session.py`: mo/commit/rollback ket noi Postgres.

### Route backend chinh

- `auth.py`: dang ky, dang nhap, lay thong tin user.
- `children.py`: CRUD ho so tre va cau hinh AI theo tre.
- `sessions.py`: lich su/session hoc tap.
- `topics.py`: danh sach chu de, chi tiet chu de, complete lesson.
- `health.py`: health check va proxy sang AI service.

### `be/ai_service`

Day la phan xu ly AI rieng cho:

- ASR: nghe audio tre doc.
- TTS: tao audio phan hoi.
- LLM scoring: cham diem va sinh feedback.
- KidBot limits: gioi han session/topic/word.
- ComfyUI integration: ASR/TTS qua workflow.

File quan trong nhat:

- [app.py](E:/test/speak joy/be/ai_service/app.py:1): entrypoint cua AI service.

## Frontend `fe/`

```text
fe/
|-- app/                      App Router pages + API routes
|   |-- (auth)/               Man hinh dang nhap/dang ky
|   |-- (dashboard)/          Dashboard, topics, kid-bot, practice, streak
|   |-- api/                  Route handler proxy sang backend
|   `-- bubbleChat/           Floating chat UI
|-- features/                 Chia theo domain UI/business
|   |-- auth/
|   |-- dashboard/
|   |-- kid-bot/
|   |-- practice/
|   |-- streak/
|   `-- topics/
|-- lib/                      Goi backend, session, helper UI
|-- components/               Thanh phan dung chung
|-- hooks/                    React hooks
|-- public/                   Static assets
|-- store/                    Client state
|-- types/                    TypeScript types
|-- Dockerfile                Docker image cho frontend
`-- README.md                 Tai lieu rieng cua frontend
```

### Vai tro chinh trong `fe/app`

- `app/api/`: proxy request tu browser sang backend, giu auth/session o server side.
- `app/(dashboard)/kid-bot/`: man hinh hoc voi KidBot.
- `app/(dashboard)/topics/`: danh sach va chi tiet chu de.
- `app/(dashboard)/practice/`: flow luyen noi.
- `app/bubbleChat/`: floating widget/chat experience.

### Thu muc `fe/features`

- `kid-bot/`: UI va logic chinh cho KidBot practice.
- `topics/`: card, detail, lesson list cua chu de.
- `dashboard/`: home/dashboard widgets.
- `auth/`: form va flow xac thuc.
- `practice/`, `streak/`: man hinh ho tro sau buoi hoc.

### Thu muc `fe/lib`

Noi day chua cac ham goi backend va helper dung chung:

- `backend.ts`: xac dinh backend URL.
- `backend-topics.ts`: lay topic/word set tu backend.
- `backend-family.ts`: lay thong tin child, AI config.
- `backend-sessions.ts`, `backend-history.ts`: lich su session.
- `ai-practice.ts`: gui audio tu frontend len API practice.
- `session.ts`: doc access token va active student.

## Docker va runtime

- Root [docker-compose.yml](E:/test/speak joy/docker-compose.yml:1) dang chay 2 service:
- `be`: build tu `be/Dockerfile.fastapi`
- `fe`: build tu `fe/Dockerfile`

Mac dinh hien tai:

- Backend chay FastAPI/Python.
- Frontend chay Next.js.
- Database dung Supabase/Postgres.
- ASR/TTS production dang di qua ComfyUI.
- LLM scoring co the dung Gemini/OpenAI/Qwen/Claude tuy theo env va API key.

## File cau hinh quan trong

- [docker-compose.yml](E:/test/speak joy/docker-compose.yml:1): dieu phoi container.
- [be/.env.example](E:/test/speak joy/be/.env.example:1): env local backend.
- [be/.env.docker.supabase.example](E:/test/speak joy/be/.env.docker.supabase.example:1): env mau khi chay Docker voi Supabase.
- [fe/.env.docker](E:/test/speak joy/fe/.env.docker:1): env frontend khi chay Docker.
- [SYSTEM_FLOW.md](E:/test/speak joy/SYSTEM_FLOW.md:1): mo ta luong tong the.

## Luu y khi lam viec

- Thu muc goc khong commit duoc nhu mot repo duy nhat.
- Neu sua backend thi commit trong repo `be/`.
- Neu sua frontend thi commit trong repo `fe/`.
- Khong nen dua file tam nhu `tmp_*.py`, `tmp_*.wav` vao commit.
uvicorn be.app.main:app --host 0.0.0.0 --port 8000 --reload
python -m uvicorn be.ai_service.app:app --host 0.0.0.0 --port 8001 --reload
