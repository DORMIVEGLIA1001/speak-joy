# Speak Joy Bug Map

## 1) Login fail / 401 / Method Not Allowed / password rong

### Triệu chứng thường gặp
- `{"detail":"Method Not Allowed"}` khi gọi login.
- `Validation failed` với `password` rỗng.
- Đăng nhập không vào được `/api-config`.

### Mở các file này trước
- Frontend UI submit:
  - `E:\test\speak joy\fe\features\auth\components\AuthDrawer.tsx`
- Frontend API route:
  - `E:\test\speak joy\fe\app\api\auth\login\route.ts`
- Frontend backend client:
  - `E:\test\speak joy\fe\lib\backend-auth.ts`
  - `E:\test\speak joy\fe\lib\backend.ts`
- Backend auth route + schema:
  - `E:\test\speak joy\be\app\api\routes\auth.py`
  - `E:\test\speak joy\be\app\schemas\auth.py`
- Session/cookie/redirect:
  - `E:\test\speak joy\fe\lib\session.ts`
  - `E:\test\speak joy\fe\proxy.ts`

### Check list sửa nhanh
1. Xác nhận FE gọi `POST /api/auth/login`.
2. Xác nhận payload có `email` và `password` không rỗng.
3. Xác nhận FE route login không đổi method.
4. Xác nhận BE có route `/api/auth/login` (POST), và fallback GET nếu cần tương thích client cũ.
5. Xác nhận cookie session được set sau login thành công.

### Lệnh verify
```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/health | Select-Object -ExpandProperty Content
Invoke-WebRequest -UseBasicParsing 'http://localhost:8000/api/auth/login' -Method POST -ContentType 'application/json' -Body '{"email":"parent@example.com","password":"Parent123!"}' | Select-Object -ExpandProperty Content
```

---

## 2) Topic complete lỗi 500

### Triệu chứng thường gặp
- `POST /api/topics/{topicId}/complete` trả `500`.

### Mở các file này trước
- `E:\test\speak joy\be\app\api\routes\topics.py`
- `E:\test\speak joy\be\app\repositories\topics_repository.py`

### Nguyên nhân đã gặp
- Ghi trực tiếp `dict` vào cột `jsonb` Postgres, cần wrap `Json(...)`.

### Checklist sửa nhanh
1. Kiểm tra payload metadata gửi xuống DB.
2. Kiểm tra chuyển đổi kiểu cho `json/jsonb` khi insert/update.
3. Kiểm tra transaction rollback nếu fail.

---

## 3) AI practice lỗi chấm điểm / fallback bất thường

### Triệu chứng thường gặp
- Có audio nhưng score là fallback không dùng LLM.
- Log báo gọi model sai hoặc 404/503.

### Mở các file này trước
- `E:\test\speak joy\be\ai_service\app.py`
- `E:\test\speak joy\be\.env.docker.supabase` (runtime local, có thể bị ignore git)
- `E:\test\speak joy\be\.env.docker.supabase.example`

### Checklist sửa nhanh
1. Kiểm tra provider đang dùng: `ASR_PROVIDER`, `TTS_PROVIDER`, `AI_PROVIDER`.
2. Kiểm tra model name đúng chính tả.
3. Kiểm tra key và base URL.
4. Nếu gặp lỗi transient (503), thêm retry có giới hạn.

### Lệnh verify
```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/health | Select-Object -ExpandProperty Content
```

---

## 4) Docker build fail / image quá nặng

### Triệu chứng thường gặp
- Build fail do import/file mismatch.
- Image backend quá nặng (torch/ffmpeg layer).

### Mở các file này trước
- Root compose:
  - `E:\test\speak joy\docker-compose.yml`
- Backend image:
  - `E:\test\speak joy\be\Dockerfile.fastapi`
  - `E:\test\speak joy\be\requirements.fastapi.txt`
  - `E:\test\speak joy\be\.dockerignore`
- Frontend image:
  - `E:\test\speak joy\fe\Dockerfile`
  - `E:\test\speak joy\fe\.dockerignore`

### Checklist sửa nhanh
1. Kiểm tra dependency thật sự cần cho runtime.
2. Loại bỏ package nặng không dùng trong prod.
3. Kiểm tra context build có copy file rác không.
4. Rebuild và đo lại size image.

### Lệnh verify
```powershell
docker compose up -d --build
docker compose ps
docker images
docker system df
```

---

## 5) Disk đầy do Docker

### Triệu chứng thường gặp
- Ổ D nhanh đầy đã prune image.

### Mở các vị trí này trước
- Thu mục data Docker:
  - `D:\DOCKER\DockerDesktopWSL\disk\docker_data.vhdx`

### Checklist sửa nhanh
1. Xem `docker system df` để biết reclaimable.
2. Chạy prune để dọn image/cache không dùng.
3. Kiểm tra file VHDX Docker có bị phồng to.
4. Nếu cần, compact VHDX / chuyển Docker data sang ổ rộng hơn.

### Lệnh verify
```powershell
docker system df
Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -eq 'D:' } | Select-Object DeviceID,Size,FreeSpace
```

---

## 6) Quy trình debug để xai lai

1. Tái hiện lỗi.
2. Bắt đúng endpoint + method + payload.
3. So route FE -> FE API route -> BE route.
4. Fix nho nhat, dung root-cause.
5. Verify bang request that.
6. Commit message ro rang, push ngay.

---

## 7) Quick smoke test sau mới fix

```powershell
# backend health
Invoke-WebRequest -UseBasicParsing http://localhost:8000/health | Select-Object -ExpandProperty Content

# frontend home/login
Invoke-WebRequest -UseBasicParsing http://localhost:3000/login | Select-Object -ExpandProperty StatusCode

# docker status
docker compose ps
```

