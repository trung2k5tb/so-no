# send-fcm — gửi thông báo Android qua Firebase Cloud Messaging

Function nhận một record có `user_id`, `title`, `body`, `data`, tìm FCM token của người dùng trong `push_subscriptions`, rồi gửi qua Firebase Cloud Messaging HTTP v1.

## Secrets của Supabase Edge Function

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBASE_PROJECT_ID` = `so-no-5e068`
- `FIREBASE_CLIENT_EMAIL` = service-account email của Firebase
- `FIREBASE_PRIVATE_KEY` = private key của service account
- `FCM_WEBHOOK_SECRET` = chuỗi bí mật tự đặt (khuyến nghị)

Không đưa Firebase Service Account JSON vào Android app.

## Database Webhook

Tạo webhook trên bảng `public.notifications`, event `INSERT`, gọi function `send-fcm`. Body dùng record mới. Nếu dùng `FCM_WEBHOOK_SECRET`, gửi header `x-fcm-webhook-secret` tương ứng.
