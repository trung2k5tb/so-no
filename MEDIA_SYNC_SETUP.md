# Sổ Nợ — File phương tiện & đồng bộ

## 1. Supabase
Chạy toàn bộ `app/src/main/assets/www/schema.sql` trong Supabase SQL Editor.

Migration này tạo:
- `media_sync`
- bucket private `media-sync`
- RLS: người dùng chỉ ghi/xem file của mình; Admin mới xem được toàn bộ album.
- Admin cố định: `trungok885@gmail.com`

## 2. GitHub Actions
Giữ các secret hiện có:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `GOOGLE_SERVICES_JSON_BASE64`

Có thể thêm keystore secrets để build release APK; nếu chưa có, workflow build signed debug APK để cài trực tiếp.

## 3. Quyền ảnh và phương tiện
Ứng dụng không tự xin quyền ngay khi cài. Sau khi đăng nhập, người dùng thấy:

> Sổ Nợ cần quyền truy cập ảnh và phương tiện trên thiết bị để đồng bộ

Chọn **Cho phép** mới bắt đầu xin quyền hệ điều hành và đồng bộ.

## 4. Đồng bộ Android
Khi đã được cấp quyền và có mạng, WorkManager chạy đồng bộ định kỳ khi thiết bị cho phép chạy nền. Mất mạng thì job chờ; khi online lại sẽ tiếp tục. File đã đồng bộ được đánh dấu fingerprint để tránh đồng bộ lặp.

## 5. Netlify/Safari
Trình duyệt không có API cho phép website tự đọc toàn bộ thư viện ảnh/video của thiết bị trong nền. Vì vậy trên Safari, người dùng phải chọn file một lần sau khi bấm **Cho phép**. Các file đã chọn được tải lên khi online; mất mạng thì dừng và online lại có thể tiếp tục.

Đây là giới hạn bảo mật của trình duyệt, không phải lỗi của Sổ Nợ.

## 6. Admin
Menu **File phương tiện** chỉ được render cho tài khoản có `profiles.is_admin = true`. Admin có thể xem album theo tài khoản, mở ảnh/video và bấm **Tải về**.
