# Khắc Phục Lỗi Build Next.js

## 🔴 Lỗi

```
Error Message: Expected '{', got 'ident'
./lib/speakjoy-realtime.ts:10:13
Expected '{', got 'ident'
```

## 🔍 Nguyên Nhân

Đây là lỗi **cache của Next.js/Turbopack**, không phải lỗi code. File `speakjoy-realtime.ts` hoàn toàn hợp lệ nhưng Turbopack parser đang đọc version cũ từ cache.

## ✅ Giải Pháp

### Cách 1: Xóa Cache và Restart (Khuyến Nghị)

**Windows:**
```batch
cd fe
restart-dev.bat
```

**Hoặc thủ công:**
```batch
cd fe
rmdir /s /q .next
rmdir /s /q .next-ci
rmdir /s /q .next-ci-check
npm run dev
```

**Linux/Mac:**
```bash
cd fe
rm -rf .next .next-ci .next-ci-check
npm run dev
```

### Cách 2: Hard Refresh Browser

Sau khi restart dev server:
1. Mở trình duyệt
2. Nhấn `Ctrl + Shift + R` (Windows/Linux) hoặc `Cmd + Shift + R` (Mac)
3. Hoặc mở DevTools → Network tab → Check "Disable cache"

### Cách 3: Restart Toàn Bộ

```batch
# Dừng tất cả process (Ctrl+C)
cd fe
rmdir /s /q .next
rmdir /s /q node_modules\.cache
npm run dev
```

## 🧪 Kiểm Tra

Sau khi restart, bạn sẽ thấy:
```
✓ Ready in 3.2s
○ Compiling / ...
✓ Compiled / in 1.2s
```

Không còn lỗi `Expected '{', got 'ident'`

## 📋 Checklist

- [x] File `speakjoy-realtime.ts` đã được kiểm tra - không có lỗi syntax
- [x] Đã sửa port từ 8000 → 8001
- [ ] Đã xóa cache `.next`
- [ ] Đã restart dev server
- [ ] Đã hard refresh browser

## 🔧 Script Tiện Ích

Đã tạo file `fe/restart-dev.bat` để tự động:
1. Xóa tất cả cache
2. Restart dev server

**Sử dụng:**
```batch
cd fe
restart-dev.bat
```

## 💡 Lưu Ý

- Lỗi này thường xảy ra khi:
  - Sửa file TypeScript trong khi dev server đang chạy
  - Turbopack cache bị corrupt
  - Git pull code mới
  
- **Giải pháp:** Luôn xóa `.next` sau khi pull code hoặc sửa file quan trọng

## 🎯 Kết Quả Mong Đợi

Sau khi hoàn thành:
- ✅ Build thành công
- ✅ Không có lỗi TypeScript
- ✅ Frontend chạy trên `http://localhost:3000`
- ✅ WebSocket kết nối tới `ws://localhost:8001/ws/speakjoy`

## 📞 Nếu Vẫn Lỗi

Nếu sau khi xóa cache vẫn lỗi, thử:

1. **Kiểm tra Node.js version:**
   ```bash
   node --version  # Cần >= 18.17.0
   ```

2. **Reinstall dependencies:**
   ```bash
   cd fe
   rm -rf node_modules package-lock.json
   npm install
   npm run dev
   ```

3. **Kiểm tra file encoding:**
   - File phải là UTF-8
   - Không có BOM (Byte Order Mark)
   - Line endings: LF (không phải CRLF)

4. **Tạo issue mới** với thông tin:
   - Node.js version
   - npm version
   - OS version
   - Full error log

---

**Ngày tạo:** 2025-01-XX  
**Trạng thái:** ✅ Đã xác định nguyên nhân | ⏳ Chờ xóa cache và restart
