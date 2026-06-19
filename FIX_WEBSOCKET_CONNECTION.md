# Khắc Phục Lỗi Kết Nối WebSocket SpeakJoy

## 🔴 Vấn Đề Phát Hiện

Frontend không thể kết nối với backend AI service vì **2 lý do**:

### 1. ❌ Sai Cổng (Port)
- **Frontend đang kết nối:** `ws://localhost:8000/ws/speakjoy`
- **Backend AI service đang chạy trên:** `ws://localhost:8001/ws/speakjoy`
- **Kết quả:** Connection refused

### 2. ❌ Backend Không Chạy
- Backend AI service chưa được khởi động
- Không có process nào đang lắng nghe trên port 8001

---

## ✅ Giải Pháp

### Bước 1: Đã Sửa Cổng Trong Frontend

Đã cập nhật 3 file sau để sử dụng đúng port **8001**:

1. ✅ `fe/lib/speakjoy-realtime.ts`
   ```typescript
   constructor(private wsUrl: string = 'ws://localhost:8001/ws/speakjoy') {}
   ```

2. ✅ `fe/hooks/useSpeakJoyCall.ts`
   ```typescript
   wsUrl = 'ws://localhost:8001/ws/speakjoy',
   ```

3. ✅ `fe/app/(dashboard)/SpeakJoy/page.tsx`
   ```typescript
   wsUrl: 'ws://localhost:8001/ws/speakjoy',
   ```

### Bước 2: Khởi Động Backend AI Service

**Mở terminal mới và chạy:**

```bash
cd be
python -m uvicorn ai_service.app:app --host 0.0.0.0 --port 8001 --reload
```

**Hoặc từ thư mục gốc:**

```bash
python -m uvicorn be.ai_service.app:app --host 0.0.0.0 --port 8001 --reload
```

### Bước 3: Kiểm Tra Backend Đã Chạy

Mở trình duyệt và truy cập:
```
http://localhost:8001/health
```

**Kết quả mong đợi:**
```json
{
  "status": "ok",
  "asr_ready": true,
  "asr_provider": "comfyui",
  "tts_ready": true,
  "tts_provider": "comfyui",
  "dataset_size": 1000,
  ...
}
```

### Bước 4: Khởi Động Lại Frontend

**Dừng frontend hiện tại (Ctrl+C) và khởi động lại:**

```bash
cd fe
npm run dev
```

**Lý do:** Frontend cần rebuild để áp dụng thay đổi port mới.

---

## 🧪 Kiểm Tra Kết Nối

### Test 1: Kiểm Tra Backend
```bash
curl http://localhost:8001/health
```

### Test 2: Kiểm Tra WebSocket
Mở Developer Console trong trình duyệt và chạy:

```javascript
const ws = new WebSocket('ws://localhost:8001/ws/speakjoy');
ws.onopen = () => console.log('✅ Connected!');
ws.onerror = (e) => console.error('❌ Error:', e);
ws.onclose = () => console.log('🔌 Closed');
```

**Kết quả mong đợi:** `✅ Connected!`

### Test 3: Kiểm Tra Trên UI
1. Truy cập: `http://localhost:3000/SpeakJoy`
2. Click nút "Start Call" (biểu tượng điện thoại)
3. Cho phép microphone
4. Nói thử: "Hello"
5. Kiểm tra console log

**Kết quả mong đợi:**
- Không có lỗi "WebSocket connection failed"
- Thấy log: `[SpeakJoy] WebSocket connected`
- Thấy log: `[SpeakJoy] Session started`

---

## 📋 Cấu Trúc Backend

Dự án có **2 backend services**:

### 1. Main Backend (Port 8000)
- **File:** `be/app/main.py`
- **Chức năng:** API chính (auth, topics, sessions, children)
- **Khởi động:**
  ```bash
  uvicorn be.app.main:app --host 0.0.0.0 --port 8000 --reload
  ```

### 2. AI Service Backend (Port 8001) ⭐
- **File:** `be/ai_service/app.py`
- **Chức năng:** ASR, TTS, LLM, WebSocket real-time
- **Khởi động:**
  ```bash
  python -m uvicorn be.ai_service.app:app --host 0.0.0.0 --port 8001 --reload
  ```

**⚠️ Quan trọng:** SpeakJoy WebSocket cần **AI Service Backend (port 8001)**, không phải Main Backend!

---

## 🔧 Script Khởi Động Nhanh

Tạo file `start-all.sh` (Linux/Mac) hoặc `start-all.bat` (Windows):

### Linux/Mac: `start-all.sh`
```bash
#!/bin/bash

# Start Main Backend
cd be
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
MAIN_PID=$!

# Start AI Service Backend
python -m uvicorn ai_service.app:app --host 0.0.0.0 --port 8001 --reload &
AI_PID=$!

# Start Frontend
cd ../fe
npm run dev &
FE_PID=$!

echo "✅ All services started!"
echo "Main Backend PID: $MAIN_PID"
echo "AI Service PID: $AI_PID"
echo "Frontend PID: $FE_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for Ctrl+C
trap "kill $MAIN_PID $AI_PID $FE_PID; exit" INT
wait
```

### Windows: `start-all.bat`
```batch
@echo off
echo Starting all services...

start "Main Backend" cmd /k "cd be && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
start "AI Service" cmd /k "cd be && python -m uvicorn ai_service.app:app --host 0.0.0.0 --port 8001 --reload"
start "Frontend" cmd /k "cd fe && npm run dev"

echo ✅ All services started in separate windows!
```

---

## 🐛 Troubleshooting

### Lỗi: "Address already in use"
**Nguyên nhân:** Port 8001 đã được sử dụng

**Giải pháp:**
```bash
# Linux/Mac
lsof -ti:8001 | xargs kill -9

# Windows
netstat -ano | findstr :8001
taskkill /PID <PID> /F
```

### Lỗi: "Module not found"
**Nguyên nhân:** Thiếu dependencies

**Giải pháp:**
```bash
cd be
pip install -r requirements.txt
```

### Lỗi: "CORS policy"
**Nguyên nhân:** Frontend chạy trên port khác 3000

**Giải pháp:** Thêm port vào `be/.env`:
```env
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
```

### Lỗi: "WebSocket connection failed" sau khi sửa
**Nguyên nhân:** Frontend chưa rebuild

**Giải pháp:**
```bash
cd fe
rm -rf .next
npm run dev
```

---

## 📊 Kiểm Tra Logs

### Backend AI Service Logs
Khi khởi động thành công, bạn sẽ thấy:
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     ✅ JSON dataset loaded: 1000 items from ...
INFO:     ComfyUI ASR ready: url=https://comfy.hungnm.top workflow=...
INFO:     ComfyUI TTS ready: url=https://comfy.hungnm.top workflow=...
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001
```

### Frontend Logs
Khi kết nối thành công, bạn sẽ thấy trong Console:
```
[SpeakJoy] WebSocket connected
[SpeakJoy] Received event: ready
[SpeakJoy] Session started: {...}
```

---

## ✅ Checklist Hoàn Thành

- [x] Sửa port trong `fe/lib/speakjoy-realtime.ts`
- [x] Sửa port trong `fe/hooks/useSpeakJoyCall.ts`
- [x] Sửa port trong `fe/app/(dashboard)/SpeakJoy/page.tsx`
- [ ] Khởi động Backend AI Service (port 8001)
- [ ] Khởi động Frontend (port 3000)
- [ ] Kiểm tra `/health` endpoint
- [ ] Test WebSocket connection
- [ ] Test voice recording

---

## 📝 Tóm Tắt

**Vấn đề:** Frontend kết nối sai port (8000 thay vì 8001) và backend không chạy

**Giải pháp:**
1. ✅ Đã sửa port trong 3 file frontend (8000 → 8001)
2. ⏳ Cần khởi động backend AI service: `python -m uvicorn be.ai_service.app:app --host 0.0.0.0 --port 8001 --reload`
3. ⏳ Cần restart frontend để áp dụng thay đổi

**Sau khi hoàn thành:** SpeakJoy WebSocket sẽ kết nối thành công! 🎉

---

**Ngày tạo:** 2025-01-XX  
**Trạng thái:** ✅ Đã sửa code | ⏳ Chờ khởi động backend
