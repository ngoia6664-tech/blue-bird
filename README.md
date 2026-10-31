# Novel Studio

Ứng dụng viết tiểu thuyết cá nhân: thư viện tác phẩm, trình soạn thảo từng chương, tự lưu, đồng bộ giữa máy tính và điện thoại qua tài khoản Google, lịch sử phiên bản và thùng rác.

Công nghệ: React + Vite + TypeScript, Firebase (Authentication, Cloud Firestore, Hosting), Tiptap (editor).
Firebase dùng gói **Spark (miễn phí)**, không cần thẻ thanh toán.

> Tiến độ, test đã chạy và việc còn dở: xem [HANDOFF.md](HANDOFF.md).

---

## 1. Cần cài trên máy

| Phần mềm | Phiên bản | Dùng để |
|---|---|---|
| [Node.js](https://nodejs.org) | 20 trở lên | Chạy và build app |
| [Git](https://git-scm.com) | bất kỳ | Đẩy code lên GitHub |
| [Java](https://adoptium.net) | 11 trở lên | Chỉ cần để chạy Firebase Emulator (test trên máy) |

Firebase CLI **không cần cài riêng**: dự án đã có sẵn, gọi bằng `npx firebase …`.

Cài thư viện của dự án (chạy một lần, và mỗi khi `package.json` thay đổi):

```powershell
cd "D:\blue bird"
npm install
```

---

## 2. Chạy thử trên máy (không cần project Firebase thật)

Cách này dùng **Firebase Emulator**: một bản Firebase giả chạy trên máy. Dữ liệu sẽ mất khi tắt emulator, nên bạn không lo làm hỏng dữ liệu thật.

Mở **2 cửa sổ terminal**:

```powershell
# Terminal 1: bật Firebase giả (đợi tới dòng "All emulators ready")
npm run emulators

# Terminal 2: bật app
npm run dev:emu
```

Mở http://localhost:5173 rồi bấm **Đăng nhập bằng Google**. Emulator hiện một trang đăng nhập giả: chọn *Add new account* và nhập email `ngoia6664@gmail.com`, hoặc một email có trong danh sách ở mục 5.2.

---

## 3. Kiểm tra trước khi đẩy code

```powershell
npm run typecheck   # kiểm tra kiểu TypeScript
npm test            # unit test (vài giây)
npm run test:emu    # test Security Rules + đồng bộ, tự bật emulator
npm run e2e         # test end-to-end trên trình duyệt, tự bật emulator + app
```

Lần đầu chạy `npm run e2e`, cần tải trình duyệt test: `npx playwright install chromium`.

---

## 4. Đẩy code lên GitHub

Repository: https://github.com/ngoia6664-tech/blue-bird

### 4.1. Một lần đầu tiên

```powershell
cd "D:\blue bird"

# 1. Khai báo tên/email cho Git (nếu chưa từng làm trên máy này)
git config --global user.name "Tên của bạn"
git config --global user.email "email-github-cua-ban@example.com"

# 2. Kiểm tra file bí mật KHÔNG nằm trong danh sách sẽ đẩy lên
git status
#    Không được thấy .env.local trong danh sách. File này đã nằm trong .gitignore.

# 3. Tạo commit đầu tiên
git add .
git commit -m "Novel Studio: phase 1"

# 4. Đổi tên nhánh thành main và nối với GitHub
git branch -M main
git remote add origin https://github.com/ngoia6664-tech/blue-bird.git

# 5. Đẩy lên
git push -u origin main
```

**Đăng nhập GitHub khi push:** GitHub không nhận mật khẩu tài khoản qua dòng lệnh. Git for Windows sẽ mở cửa sổ trình duyệt để bạn đăng nhập (Git Credential Manager). Bấm đồng ý là xong, các lần sau không phải đăng nhập lại.

**Nếu bước 5 báo lỗi `rejected … fetch first`:** repo trên GitHub đã có sẵn file (ví dụ README tạo lúc lập repo). Gộp hai lịch sử lại rồi push:

```powershell
git pull origin main --allow-unrelated-histories
# Nếu báo xung đột ở README.md: mở file, giữ nội dung muốn giữ, rồi:
#   git add README.md
#   git commit -m "Gộp README"
git push -u origin main
```

### 4.2. Những lần sau

```powershell
git add .
git commit -m "Mô tả ngắn thay đổi"
git push
```

### 4.3. Lưu ý về quyền riêng tư

- `firestore.rules` chứa **email được phép đăng nhập**. Nếu repo để **Public**, ai cũng đọc được email đó. App vẫn an toàn, vì biết email không đủ để đăng nhập, nhưng bạn nên để repo ở chế độ **Private** (GitHub → Settings → General → Danger Zone → Change visibility).
- Cấu hình Firebase trong `.env.local` không phải mật khẩu (bảo mật nằm ở Security Rules), nhưng vẫn để ngoài Git cho gọn.
- **Tuyệt đối không** commit file service account (`*-firebase-adminsdk-*.json`). App này không cần loại file đó.

---

## 5. Tạo project Firebase thật

Làm tại https://console.firebase.google.com, đăng nhập bằng tài khoản Google của bạn.

### 5.1. Tạo project và bật dịch vụ

1. **Create a project** → đặt tên (ví dụ `novel-studio`) → có thể tắt Google Analytics → **Create**.
   - Ghi lại **Project ID** (dạng `novel-studio-ab12c`). Bạn sẽ cần nó ở bước sau.
   - Giữ gói **Spark**. Nếu console gợi ý nâng cấp **Blaze**, hãy bỏ qua: app này không cần.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**.
   - Chọn *Project support email* là email của bạn → **Save**.
3. **Build → Firestore Database → Create database**:
   - Location: **`asia-southeast1` (Singapore)**. Không đổi được sau khi tạo.
   - Chọn **Start in production mode**. Rules thật sẽ được deploy ở bước 6.
4. **Project settings (bánh răng) → General → Your apps → biểu tượng `</>` (Web)**:
   - Đặt tên app, **không** tick Firebase Hosting ở đây → **Register app**.
   - Copy các giá trị trong `firebaseConfig`.
5. Trong thư mục dự án, tạo file `.env.local` (copy từ `.env.example`) rồi điền:

```ini
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=novel-studio-ab12c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=novel-studio-ab12c
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
```

### 5.2. Ai được phép dùng app

Mở `firestore.rules` và sửa danh sách email:

```
function allowed() {
  return request.auth.token.email in ['ngoia6664@gmail.com', 'email-nguoi-viet@gmail.com'];
}
```

Phải là địa chỉ Gmail/Google viết thường, đúng như khi đăng nhập. Sửa xong thì deploy lại (mục 6) mới có hiệu lực.

Chạy app với Firebase thật trên máy: `npm run dev` rồi mở http://localhost:5173.

---

## 6. Deploy lên mạng (Firebase Hosting)

### 6.1. Một lần đầu tiên

```powershell
cd "D:\blue bird"

# 1. Đăng nhập Firebase CLI (mở trình duyệt)
npx firebase login

# 2. Chọn project vừa tạo, đặt alias là "default"
npx firebase use --add
#    → chọn novel-studio-ab12c → alias: default
#    Lệnh này tạo file .firebaserc (commit file này được).

# 3. Build và deploy app + Security Rules + index
npm run deploy
```

Xong, app chạy tại:

- `https://<project-id>.web.app`
- `https://<project-id>.firebaseapp.com`

Hai domain này đã được Firebase cho phép đăng nhập Google sẵn.

> Lần deploy đầu, index cho **Lịch sử phiên bản** cần vài phút để Firebase tạo. Trong lúc đó, việc dọn bớt snapshot cũ có thể báo lỗi. Việc viết và lưu không bị ảnh hưởng.

### 6.2. Cập nhật app sau khi sửa code

```powershell
npm run typecheck; npm test     # kiểm tra trước
npm run deploy                  # build + deploy lại
git add .; git commit -m "..."; git push
```

### 6.3. Dùng trên điện thoại

Mở `https://<project-id>.web.app` bằng Chrome hoặc Safari, đăng nhập cùng tài khoản Google, và dữ liệu sẽ đồng bộ với máy tính.

Nút "cài ứng dụng" (PWA) sẽ có ở Phase 3. Hiện tại bạn có thể dùng *Thêm vào màn hình chính* của trình duyệt.

---

## 7. Gặp lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| Màn hình **"Không có quyền truy cập"** | Email chưa có trong `firestore.rules`, hoặc chưa deploy rules | Thêm email (mục 5.2) → `npm run deploy` |
| `auth/unauthorized-domain` khi đăng nhập | Mở app từ domain lạ (domain riêng, IP LAN…) | Firebase Console → Authentication → Settings → **Authorized domains** → thêm domain |
| Popup đăng nhập không hiện | Trình duyệt chặn popup | App tự chuyển sang chuyển hướng trang. Nếu vẫn không được, cho phép popup cho trang này |
| `The query requires an index` | Index của lịch sử phiên bản chưa tạo xong | Đợi vài phút sau lần deploy đầu |
| `npm run emulators` báo thiếu Java | Chưa cài Java | Cài Java 11+ (mục 1) |
| Trạng thái **"Đã lưu trên máy · chờ có mạng"** | Đang offline | Cứ viết tiếp. Có mạng app sẽ tự đồng bộ. **Đừng xóa dữ liệu trình duyệt** khi còn thay đổi chưa đồng bộ |

---

## 8. Cấu trúc thư mục

```
src/
  auth/        đăng nhập Google, kiểm tra quyền
  components/  khung app (topbar), menu, ảnh bìa
  data/        đọc/ghi Firestore: tác phẩm, chương, phiên bản
  sync/        bản nháp cục bộ (IndexedDB) + đồng bộ có kiểm tra xung đột
  editor/      trình soạn thảo chương, lịch sử phiên bản
  pages/       Thư viện, Tạo/sửa tác phẩm, Viết, Cài đặt
  styles/      tokens.css (màu, font, khoảng cách) + app.css
firestore.rules   quyền truy cập dữ liệu (phần bảo mật chính)
tests/            test Security Rules + đồng bộ (chạy trên emulator)
e2e/              test end-to-end (Playwright)
```

Muốn đổi màu, font hoặc bo góc cho toàn app, chỉ cần sửa `src/styles/tokens.css`. Muốn đổi tên app, sửa `APP_NAME` trong `src/config.ts`.
