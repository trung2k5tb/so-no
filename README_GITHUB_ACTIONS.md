# Sổ Nợ — GitHub Actions tự build APK

Project này được chuẩn bị để build Android App Bundle (`.aab`) trên GitHub, không cần cài Android Studio trên máy.

## 1. Đưa project lên GitHub

Tạo một repository mới, ví dụ `so-no`, rồi upload **toàn bộ nội dung của thư mục `android_project`** vào repository.

Cấu trúc phải có:

```text
.github/workflows/build-aab.yml
app/
build.gradle
gradle.properties
settings.gradle
```

## 2. Thêm GitHub Secrets

Vào:

`Repository → Settings → Secrets and variables → Actions → New repository secret`

Bắt buộc:

- `SUPABASE_URL` — dạng `https://xxxxx.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` — key bắt đầu bằng `sb_publishable_...`

Tuỳ chọn:

- `VAPID_PUBLIC_KEY` — chỉ cần nếu bạn vẫn dùng Web Push trên trình duyệt; Android FCM không cần secret này.

Để tạo bản **ký phát hành có thể đưa lên Google Play**, thêm 4 secret:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

### Tạo ANDROID_KEYSTORE_BASE64

Trên máy của bạn, chuyển file keystore sang Base64. Trên macOS/Linux:

```bash
base64 -i sono-release-key.jks | pbcopy
```

Trên Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("sono-release-key.jks")) | Set-Clipboard
```

Dán kết quả vào `ANDROID_KEYSTORE_BASE64`.

**Không commit file `.jks` vào GitHub.**

## 3. Chạy build

Vào tab `Actions` → `Build Sổ Nợ APK` → `Run workflow`.

Sau khi chạy xong:

`Actions → workflow run → Artifacts → so-no-release-aab`

Tải artifact về và lấy:

```text
app-release.aab
```

## 4. Signed vs unsigned

Nếu đủ 4 secret ký app, workflow tạo **signed APK**.

Nếu chưa có các secret ký app, workflow vẫn build được APK để kiểm tra, nhưng đó là **unsigned APK và không thể dùng trực tiếp để phát hành Google Play**.

## 5. Bảo mật

- Chỉ dùng Supabase Publishable Key trong app.
- Không đưa Supabase service-role key vào repository hoặc GitHub Secrets của workflow build frontend.
- Không commit keystore.
- Giữ backup keystore và mật khẩu ở nơi an toàn; mất khóa ký có thể làm việc cập nhật app sau này gặp vấn đề.

## 6. Firebase Cloud Messaging (thông báo ngoài app)

Đã tích hợp Firebase Cloud Messaging cho Android. Thêm GitHub Secret:

- `GOOGLE_SERVICES_JSON_BASE64` — nội dung file `google-services.json` được mã hóa Base64.

Android sẽ lấy FCM token, gửi token vào `push_subscriptions` của Supabase và nhận thông báo khi app ở nền/đã đóng.

Không đưa Firebase Service Account JSON vào APK. Service Account chỉ dùng phía server/Edge Function để gửi FCM.


## APK trực tiếp
Workflow luôn tạo APK có thể cài: nếu đã cấu hình keystore thì tạo release APK đã ký; nếu chưa có thì tự tạo debug APK đã ký bằng debug keystore của Android. Không còn xuất APK unsigned.

### Đăng ký tài khoản
Bản hiện tại chỉ chờ Supabase Auth trả kết quả đăng ký, không gọi `profiles.upsert` trước khi người dùng có session. Điều này tránh tình trạng nút **Đang tạo tài khoản...** bị treo khi Supabase bật email confirmation/RLS. Có timeout 20 giây và thông báo tiếng Việt khi máy chủ phản hồi quá lâu.
