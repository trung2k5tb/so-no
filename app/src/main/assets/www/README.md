# Sổ Nợ — Web / Netlify

Bản này là **Web-only**, dùng Supabase + Email/Mật khẩu và deploy trực tiếp lên Netlify.

## Các thay đổi trong bản này
- Sidebar dọc, mở bằng nút ☰ trên mobile; không dùng bottom navigation.
- Tạo khoản nợ trực tiếp từ Trang chủ.
- Ngân hàng/công ty tài chính trong form khoản nợ dùng danh sách lựa chọn + tìm kiếm.
- Chi tiết khoản cho vay có **Ghi nhận đã trả**, **Cho vay thêm** và **Lịch sử**.
- Lịch sử ghi nhận khoản ban đầu `+`, trả tiền `-`, cho vay thêm `+`, kèm **Time + Date**.
- Kết bạn bằng email, thông báo và realtime.
- Hồ sơ có avatar, thông tin cá nhân và Supabase Storage.
- GPS chia sẻ trực tiếp giữa tài khoản Sổ Nợ; mã xác nhận khi tắt GPS.
- Nhạc nền SoundCloud: không còn “SoundCloud cá nhân”; có thêm **Mưa Ai Chờ - Tilo Remix - Nhạc Hot**.
- Nút **Lên nhạc** khởi tạo player ẩn và yêu cầu phát ngay; progress cập nhật realtime khi đang phát.
- Player SoundCloud ẩn hoàn toàn, chỉ có nút nhạc tròn + mini control.
- Mobile header dùng Safe Area; input/select/textarea từ 16px để tránh iOS tự zoom.
- Icon PWA/favicon/Apple Touch **không có viền đen**.
- Có splash khởi động dùng Safe Area để tên **Sổ Nợ** không đè lên thanh trạng thái.
- **Bỏ toàn bộ giao diện Tài khoản ngân hàng và VietQR** khỏi app.
- Menu có **App CTTC** và **App đen**.
- Admin có thể thêm/sửa/xóa từng ứng dụng với **Tên ứng dụng, Link giới thiệu, Chú thích**.
- Người dùng chỉ xem danh sách; bấm cả ô ứng dụng sẽ chuyển tới link Admin cấu hình.
- Tên ứng dụng được hiển thị **đậm và lớn hơn** chú thích.
- Có RLS cho danh sách app: chỉ tài khoản có `profiles.is_admin = true` mới được quản lý.

## 1. Supabase — chạy schema
Vào **Supabase → SQL Editor** và chạy toàn bộ `schema.sql`.

Schema có thêm:
- `profiles.is_admin`
- `app_links`
- lịch sử `debt_transactions` với loại `initial`, `payment`, `lend_more`
- backfill lịch sử ban đầu cho các khoản nợ cũ chưa có transaction.

> Nếu database đã chạy schema cũ, vẫn nên chạy lại toàn bộ `schema.sql`. Không cần xóa các bảng cũ.

### Cấp quyền Admin
Tài khoản Admin được cố định là `trungok885@gmail.com` và schema tự cấp `is_admin = true` cho tài khoản này sau khi đăng ký/đồng bộ profile. Không đặt service-role key trong frontend.

## 2. Authentication
Trong Supabase:
- Authentication → Providers → Email: bật Email.
- Khi thử nghiệm có thể tắt Confirm email để đăng ký xong vào app ngay.

## 3. config.js
Điền:

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xxxxxxxxx";
window.VAPID_PUBLIC_KEY = "";
```

Chỉ dùng Publishable key ở frontend. Không đưa service_role/secret key vào website.

## 4. Deploy Netlify
- Giải nén ZIP.
- Điền `config.js`.
- Netlify → Add new project → Deploy manually.
- Kéo thả thư mục dự án lên Netlify.

## 5. Ảnh đại diện
Bucket `avatars` được cấu hình trong schema, giới hạn 5MB, nhận JPG/PNG/WebP. Ảnh được lưu theo thư mục user ID.

## 6. GPS
GPS trên Web phụ thuộc quyền trình duyệt và trang đang hoạt động; không coi đây là background GPS 24/7 như ứng dụng native.

## 7. App CTTC / App đen
Hai mục nằm trong sidebar.

Admin nhập:
- Tên ứng dụng
- Link giới thiệu
- Chú thích

Danh sách được lưu trong `app_links` và được bảo vệ bằng RLS. Người dùng thường chỉ có quyền đọc các mục đang active.

## 8. Nhạc nền / SoundCloud
- Bỏ “SoundCloud cá nhân”.
- Có **Cánh Hoa Héo Tàn - Style Huy PT**.
- Có **Lao Tâm Khắc Xỉa - Hài Nhân**.
- Có **Mưa Ai Chờ - Tilo Remix - Nhạc Hot**.
- “Lên nhạc” gọi player sau khi widget READY và yêu cầu phát ngay.
- Progress/time được cập nhật liên tục khi đang phát.
- Không hiển thị iframe SoundCloud.

## 9. Mobile / PWA
- Header và splash dùng `safe-area-inset-top`.
- Không tự zoom khi focus form trên iPhone nhưng vẫn cho pinch-to-zoom.
- Icon không thêm viền đen.
- Service Worker tăng version cache để nhận bản cập nhật.

## 10. Tin nhắn / Bạn bè
- Trang **Bạn bè** không còn nút GPS.
- Mỗi bạn có **Nhắn tin** và **Xóa bạn**.
- Có **Gợi ý kết bạn**; chỉ hiện avatar + tên, không hiện email. Admin `trungok885@gmail.com` được ưu tiên đầu tiên và có nhãn **Admin**.
- Khung gợi ý hiển thị khoảng 5 người và có thanh cuộn để xem thêm.
- Menu có **Tin nhắn**.
- Danh sách Tin nhắn có tìm kiếm và nút **Sửa** để chọn/xóa cuộc trò chuyện, có xác nhận trước khi xóa.
- Trong chat có gửi chữ, ảnh và vị trí.
- Tin nhắn mình gửi nằm bên phải; tin nhắn bạn nằm bên trái và có avatar.
- Tin nhắn mình gửi có dấu `⋯` ở bên trái; chỉ có thể thu hồi trong 1 giờ. Supabase kiểm tra giới hạn 1 giờ phía server.

## 11. Dịch vụ ICLOUD
- Sidebar có **Dịch vụ ICLOUD**.
- Cấu trúc giống App CTTC / App đen.
- Admin có thể thêm **Tên, Link giới thiệu, Chú thích**.
- Người dùng thường chỉ xem danh sách; bấm vào ô sẽ mở link.

## 12. Quên mật khẩu
Supabase phải cho phép redirect về domain Netlify của bạn. Trong **Authentication → URL Configuration → Redirect URLs**, thêm URL website Sổ Nợ, ví dụ:

```text
https://ten-app-cua-ban.netlify.app/**
```

Luồng là: **Quên mật khẩu → email → bấm link → Đặt lại mật khẩu → Đổi mật khẩu**.

Bản web này hỗ trợ cả link Supabase dùng `code` (PKCE) và recovery hash.

## 13. Gửi hỗ trợ
Trong Trợ giúp chỉ hiện hai ô nhỏ:
- **Gmail** → `trungok885@gmail.com`
- **Zalo** → `0899829444`

Địa chỉ/số không hiển thị trực tiếp; chỉ mở khi người dùng bấm.

## 14. Chat Storage
Schema tạo bucket `chat-media` để lưu ảnh chat, tối đa 10MB/ảnh. Chỉ tài khoản đã đăng nhập mới được upload vào thư mục của chính tài khoản đó.
