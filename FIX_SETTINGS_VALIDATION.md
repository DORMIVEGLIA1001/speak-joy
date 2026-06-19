# Fix Settings Validation Connection Issues

## Vấn đề
Chức năng kiểm tra kết nối AI trong phần Settings hoạt động tốt ở local nhưng bị lỗi khi deploy lên production.

## Nguyên nhân
1. **Thiếu `trust_env` parameter**: Code không sử dụng cấu hình proxy từ environment variables
2. **Timeout quá ngắn**: Timeout 20s có thể không đủ cho production environment có network chậm hơn
3. **Thiếu logging**: Khó debug khi có lỗi xảy ra ở production
4. **Error handling chưa đủ chi tiết**: Không phân biệt được giữa timeout, connection error và các lỗi khác

## Giải pháp đã áp dụng

### 1. Thêm HTTPX Trust Environment
- Thêm biến môi trường `HTTPX_TRUST_ENV` để control việc sử dụng proxy settings
- Thêm `trust_env=HTTPX_TRUST_ENV` vào tất cả httpx.Client instances
- Mặc định `false` cho local, có thể set `true` cho production nếu cần proxy

### 2. Tăng Timeout
- Tăng timeout từ 20s lên 30s (có thể config qua `VALIDATION_TIMEOUT_SECONDS`)
- Timeout có thể điều chỉnh cho từng môi trường khác nhau

### 3. Thêm Comprehensive Error Handling
- Bắt riêng `httpx.TimeoutException` → trả về error message rõ ràng về timeout
- Bắt riêng `httpx.ConnectError` → trả về error message về connection issue
- Phân loại error types chính xác hơn (timeout, connection, auth, model, url)

### 4. Thêm Logging
- Log validation start với provider và model info
- Log chi tiết các lỗi xảy ra (timeout, connection, API errors)
- Log thành công với latency
- Giúp debug dễ dàng hơn khi có vấn đề

## Files đã thay đổi

### Backend
1. **be/app/services/settings_service.py**
   - Import `logging` và `os`
   - Thêm constants: `HTTPX_TRUST_ENV`, `VALIDATION_TIMEOUT`
   - Cập nhật `_validate_with_gemini()` với error handling và logging
   - Cập nhật `_validate_with_openai_compatible()` với error handling và logging
   - Cập nhật `_validate_with_claude()` với error handling và logging
   - Cập nhật `_classify_validation_error()` để xử lý timeout/connection errors
   - Thêm logging vào `validate_parent_ai_settings_for_user()`

### Environment Files
2. **be/.env**
   - Thêm `VALIDATION_TIMEOUT_SECONDS=30`

3. **be/.env.docker.supabase**
   - Thêm `VALIDATION_TIMEOUT_SECONDS=30`

4. **be/.env.docker.supabase.example**
   - Thêm `VALIDATION_TIMEOUT_SECONDS=30`

## Cách test

### Local Testing
```bash
# 1. Start backend
cd be
source .venv/bin/activate  # hoặc .venv\Scripts\activate trên Windows
uvicorn be.app.main:app --reload --port 8080

# 2. Start frontend
cd fe
npm run dev

# 3. Test validation trong Settings tab
```

### Production Testing
```bash
# 1. Build và deploy
docker-compose up --build

# 2. Check logs để xem validation details
docker-compose logs -f api

# 3. Test validation từ UI
```

## Biến môi trường mới

### VALIDATION_TIMEOUT_SECONDS
- **Mô tả**: Thời gian timeout (giây) cho API validation requests
- **Mặc định**: 30.0
- **Recommended values**:
  - Local: 20-30
  - Production (good network): 30-45
  - Production (slow network): 45-60

### HTTPX_TRUST_ENV
- **Mô tả**: Cho phép httpx sử dụng environment variables cho proxy (HTTP_PROXY, HTTPS_PROXY)
- **Mặc định**: false
- **Khi nào set true**: Khi production environment có corporate proxy hoặc cần route qua proxy

## Expected Improvements

1. **Better error messages**: User sẽ thấy message rõ ràng hơn về nguyên nhân lỗi
2. **Network resilience**: Timeout cao hơn giúp xử lý được network chậm
3. **Proxy support**: Production environments có proxy sẽ hoạt động được
4. **Better debugging**: Logs chi tiết giúp debug nhanh hơn khi có issue

## Monitoring

Sau khi deploy, monitor các điểm sau:
1. Check backend logs cho validation attempts và errors
2. Monitor validation latency (có trong logs)
3. Track error types để identify patterns
4. Nếu vẫn còn lỗi, có thể tăng `VALIDATION_TIMEOUT_SECONDS` thêm

## Rollback Plan

Nếu cần rollback:
1. Git revert commit này
2. Hoặc set `VALIDATION_TIMEOUT_SECONDS=20` trong env file
3. Restart service

## Next Steps

Nếu vẫn còn issues sau khi áp dụng fix:
1. Check backend logs để xem exact error messages
2. Verify network connectivity từ production container ra internet
3. Check xem có firewall/security group blocking outbound connections không
4. Test manual API call từ production container:
   ```bash
   docker exec -it <container> python -c "import httpx; print(httpx.get('https://generativelanguage.googleapis.com'))"
   ```
