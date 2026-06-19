# Speak Joy Feature Map

## 1) Auth (đăng nhập / đăng ký / session)

- UI auth:
  - `E:\test\speak joy\fe\app\(auth)\login\page.tsx`
  - `E:\test\speak joy\fe\app\(auth)\register\page.tsx`
  - `E:\test\speak joy\fe\features\auth\components\AuthDrawer.tsx`
- FE API route:
  - `E:\test\speak joy\fe\app\api\auth\login\route.ts`
  - `E:\test\speak joy\fe\app\api\auth\register\route.ts`
  - `E:\test\speak joy\fe\app\api\auth\logout\route.ts`
- FE auth/session helpers:
  - `E:\test\speak joy\fe\lib\backend-auth.ts`
  - `E:\test\speak joy\fe\lib\session.ts`
  - `E:\test\speak joy\fe\proxy.ts`
- BE route + schema + service:
  - `E:\test\speak joy\be\app\api\routes\auth.py`
  - `E:\test\speak joy\be\app\schemas\auth.py`
  - `E:\test\speak joy\be\app\services\auth_service.py`
  - `E:\test\speak joy\be\app\repositories\auth_repository.py`

---

## 2) Parent dashboard / API config / child manager

- UI pages:
  - `E:\test\speak joy\fe\app\(dashboard)\api-config\page.tsx`
  - `E:\test\speak joy\fe\app\(dashboard)\parent-settings\page.tsx`
- Components:
  - `E:\test\speak joy\fe\features\parent-settings\components\AiConfigPanel.tsx`
  - `E:\test\speak joy\fe\features\parent-settings\components\ChildManager.tsx`
- FE data loaders:
  - `E:\test\speak joy\fe\lib\backend-family.ts`
  - `E:\test\speak joy\fe\lib\backend-history.ts`
- BE routes:
  - `E:\test\speak joy\be\app\api\routes\children.py`
  - `E:\test\speak joy\be\app\api\routes\sessions.py`

---

## 3) Topics / complete lesson / progress

- UI pages:
  - `E:\test\speak joy\fe\app\(dashboard)\topics\page.tsx`
  - `E:\test\speak joy\fe\app\(dashboard)\topics\[topicId]\page.tsx`
- FE API route:
  - `E:\test\speak joy\fe\app\api\topics\[topicId]\complete\route.ts`
- BE routes + repository:
  - `E:\test\speak joy\be\app\api\routes\topics.py`
  - `E:\test\speak joy\be\app\repositories\topics_repository.py`

---

## 4) Voice practice (POST path)

- UI:
  - `E:\test\speak joy\fe\features\practice\components\VoicePracticePanel.tsx`
- FE helper:
  - `E:\test\speak joy\fe\lib\ai-practice.ts`
- FE API proxy:
  - `E:\test\speak joy\fe\app\api\ai\practice\route.ts`
- BE AI endpoint:
  - `E:\test\speak joy\be\ai_service\app.py` (`/practice/audio`)

---

## 5) Voice practice realtime (WebSocket path)

- UI caller:
  - `E:\test\speak joy\fe\features\practice\components\VoicePracticePanel.tsx`
- FE WS helper:
  - `E:\test\speak joy\fe\lib\ai-practice.ts` (`submitPracticeAudioRealtime`)
- BE WS endpoint:
  - `E:\test\speak joy\be\ai_service\app.py` (`/practice/stream`)

---

## 6) Kid-bot page flow

- Main page:
  - `E:\test\speak joy\fe\app\(dashboard)\kid-bot\page.tsx`
- Main component:
  - `E:\test\speak joy\fe\features\kid-bot\components\KidBotPractice.tsx`
- Floating bot:
  - `E:\test\speak joy\fe\features\kid-bot\components\FloatingKidBot.tsx`
- Shared practice helper:
  - `E:\test\speak joy\fe\lib\ai-practice.ts`
- BE AI:
  - `E:\test\speak joy\be\ai_service\app.py`

---

## 7) Common layout / navigation / guards

- Layout:
  - `E:\test\speak joy\fe\app\(auth)\layout.tsx`
  - `E:\test\speak joy\fe\app\(dashboard)\layout.tsx`
- Header/nav:
  - `E:\test\speak joy\fe\components\layout\DashboardHeader.tsx`
- Route guard:
  - `E:\test\speak joy\fe\proxy.ts`

---

## 8) Deploy, env, Docker

- Root compose:
  - `E:\test\speak joy\docker-compose.yml`
- Backend container:
  - `E:\test\speak joy\be\Dockerfile.fastapi`
  - `E:\test\speak joy\be\requirements.fastapi.txt`
  - `E:\test\speak joy\be\.dockerignore`
  - `E:\test\speak joy\be\.env.docker.supabase`
  - `E:\test\speak joy\be\.env.docker.supabase.example`
- Frontend container:
  - `E:\test\speak joy\fe\Dockerfile`
  - `E:\test\speak joy\fe\.dockerignore`
  - `E:\test\speak joy\fe\.env.docker`

---

## 9) Quyền tắc tìm file nhanh khi thêm tính năng

1. Tìm UI entrypoint trong `fe/app/.../page.tsx`.
2. Tìm component chính trong `fe/features/...`.
3. Tìm hàm gọi API trong `fe/lib/...` hoặc `fe/app/api/.../route.ts`.
4. Tìm backend route trong `be/app/api/routes/...` hoặc `be/ai_service/app.py`.
5. Tìm service/repository/schema backend để xử lý logic và DB.

---

## 10) Lệnh gợi ý để trace nhanh

```powershell
# Tìm endpoint trong FE
Get-ChildItem E:\test\speak joy\fe -Recurse -File | Select-String -Pattern "/api/auth/login|/api/ai/practice|/api/topics"

# Tim route trong BE
Get-ChildItem E:\test\speak joy\be -Recurse -File | Select-String -Pattern "@router|@app.post|@app.websocket|/practice/stream|/api/auth"
```
# ý tưởng về voice practice realtime
## TTS:
- ý tưởng: ai sẽ sinh ra chữ trước sau đó mới đọc theo sau
- ai đọc chữ theo từng từ, chữ sẽ được hiển thị trên màn hình của bé trước sau đó ai sẽ đọc dần theo sau để giảm độ trễ


## ARS:
- trẻ nói tới đâu ai sẽ ghi nhận tới đó (latency thấp)
- sau khi trẻ nói xong thì ai sẽ trả lời (có thể sinh trc hoặc sinh sau tùy vào độ khó)
- lời nói của trẻ sẽ được chuyển dần về chữ và hiển thị trên màn hình, sau đó ai bắt đầu xử lý luôn từng từ để đưa ra phản hồi
- chỉ gửi qua LLM khi phát hiện khoảng dừng khoảng 500ms

# ý tưởng về cách trả lời của AI

## TTS:
- sẽ chia thành nhiều đoạn nhỏ (chunk)
- mỗi chunk sau khi sinh ra sẽ được đưa vào buffer để phát luôn
- sau khi chunk được phát xong thì sẽ được loại bỏ khỏi buffer

## LLM:
- ai sẽ đóng vai trò xử lí ngôn ngữ ngay khi ars chuyển những từ đầu tiên vào và thực hiện trả lời sớm, sinh ra text dần và đưa ra màn hình từng từ sinh được trước sau đó cho tts nói theo sau.