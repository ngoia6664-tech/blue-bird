# HANDOFF — Novel Studio (tạm dừng 31/10/2026)

Trạng thái: **Phase 1 xong phần lớn**, đã build và test. Chưa có commit nào.

## 1. Đã hoàn thành

| Khu vực | File chính | Ghi chú |
|---|---|---|
| Cấu hình | `package.json`, `vite.config.ts`, `tsconfig.json`, `firebase.json`, `.env.emulator`, `.env.example` | React 19, Vite 8, TS 7, Firebase 13, Tiptap 3, React Router 8 |
| Bảo mật | `firestore.rules`, `firestore.indexes.json` | Chỉ email trong danh sách được đọc/ghi `users/{uid}/…` |
| Firebase | `src/firebase.ts` | Có cache offline; tự nối emulator khi `VITE_USE_EMULATOR=true` |
| Đăng nhập | `src/auth/AuthProvider.tsx`, `src/components/AppLayout.tsx` | Google popup (tự chuyển sang redirect nếu popup bị chặn), màn "Không có quyền truy cập" |
| Dữ liệu | `src/data/refs.ts`, `works.ts`, `chapters.ts`, `versions.ts`, `hooks.ts` | Mỗi chương 1 doc metadata + 1 doc nội dung; thùng rác; xóa vĩnh viễn |
| An toàn bản thảo | `src/sync/drafts.ts`, `src/sync/engine.ts`, `src/sync/push.ts` | IndexedDB lưu trước, đồng bộ sau; transaction kiểm tra `rev`; phát hiện xung đột; snapshot tự động 10 phút/lần, giữ 20 bản |
| Thư viện | `src/pages/Library.tsx`, `src/components/Cover.tsx`, `Menu.tsx` | Gần đây, hành động nhanh, grid bìa, tìm/lọc/sắp xếp, thùng rác |
| Tạo/sửa tác phẩm | `src/pages/WorkForm.tsx` | Ảnh bìa nén còn khoảng 150 KB, lưu trong Firestore (không dùng Storage) |
| Writer | `src/pages/Writer.tsx`, `src/editor/ChapterPane.tsx`, `ChapterEditor.tsx`, `VersionPanel.tsx`, `extensions.ts` | 3 cột, drawer trên mobile; chuyển chương; sắp xếp/nhân bản/thùng rác chương; toolbar; số từ/trang ước tính; xử lý xung đột; lịch sử phiên bản (xem, lưu thủ công, khôi phục) |
| Cài đặt | `src/pages/Settings.tsx` | Tài khoản, trạng thái đồng bộ, nút "Đồng bộ ngay" |
| Giao diện | `src/styles/tokens.css`, `app.css` | Design tokens, responsive |

### Cập nhật 31/10/2026 (tối): làm mới giao diện

- `src/styles/tokens.css` và `app.css` viết lại:
  - Nền giấy ngà có quầng sáng nhẹ, topbar kính mờ, tab dạng pill.
  - Nút chính có gradient và vệt sáng khi rê chuột; thẻ tác phẩm nổi lên khi rê chuột và hiện lần lượt khi mở trang.
  - Vùng viết là trang giấy trên desktop, toàn màn hình trên điện thoại.
  - Tôn trọng chế độ giảm chuyển động (`prefers-reduced-motion`).
- **Sửa lỗi font tiếng Việt:** Georgia thiếu chữ có hai dấu chồng ("gốc" hiển thị thành "gô ́c"). Đổi sang Literata (vùng viết) và Be Vietnam Pro (giao diện), đóng gói qua `@fontsource`, nạp trong `src/main.tsx`.
- `src/components/Cover.tsx`: bìa mặc định có màu riêng theo tên truyện, hiện cả tên truyện.
- `src/pages/Library.tsx`: thêm lời chào theo giờ và thống kê (số tác phẩm, chương, từ).
- Sửa hai lỗi bố cục mobile (thẻ "gần đây" tràn màn hình, chữ trong ô thống kê bị bẻ dòng). Bỏ animation hiện dần ở màn hình đăng nhập, vì trong Chromium headless nó bị kẹt ở trạng thái ẩn.
- Kiểm tra lại: build đạt, 17/17 unit, 7/7 e2e.

### Cập nhật: icon và README

- Thêm icon (lucide) cho:
  - các mục menu: sửa, thùng rác, khôi phục, xóa vĩnh viễn, chuyển lên/xuống, nhân bản;
  - các nút: lưu, hủy, đăng nhập/xuất, đồng bộ, lịch sử, lưu/khôi phục phiên bản, giải quyết xung đột;
  - các thông báo trong editor.

  `MenuItem` có thêm trường `icon`. Nút "Mở" trên thẻ tác phẩm đổi thành "Viết tiếp".
- `README.md`: cài đặt, chạy bằng emulator, test, đẩy lên GitHub, tạo project Firebase, deploy, xử lý lỗi thường gặp.
- `.gitignore` thêm `tsconfig.tsbuildinfo`.
- Kiểm tra lại: build đạt, 17/17 unit, 7/7 e2e.

## 2. Thay đổi chưa commit

Tất cả file trong repo đều **chưa commit**: đã chạy `git init` nhưng chưa có commit nào. Chạy `git status` để xem danh sách.

`tsconfig.tsbuildinfo` là file sinh tự động, nên thêm vào `.gitignore` trước khi commit.

## 3. Test đã chạy (lần chạy cuối, cả ba đều pass)

| Lệnh | Nội dung | Kết quả |
|---|---|---|
| `npm test` | Đếm từ tiếng Việt (gồm NFD), quy tắc merge bản nháp và quyết định xung đột | 17/17 pass |
| `npm run test:emu` | Security Rules (chủ sở hữu được phép; tài khoản lạ, email chưa xác minh, uid khác, chưa đăng nhập đều bị chặn); transaction đồng bộ (ghi, từ chối ghi đè, chống đẩy trùng, snapshot, chương quá lớn) | 10/10 pass |
| `npm run e2e` | Viết → autosave → đồng bộ → reload; chuyển chương khi chưa lưu; offline rồi online, thiết bị 2 thấy nội dung; 2 thiết bị gây xung đột → chọn bản → bản kia nằm trong lịch sử; tài khoản lạ bị chặn; thùng rác/khôi phục (desktop và mobile giả lập Pixel 7) | 7/7 pass |
| `npm run build`, `npm run typecheck` | | Đạt. Cảnh báo bundle 1,4 MB (gzip 439 KB), chưa xử lý |

Lỗi đã sửa trong quá trình test:

- Hai component cùng `key`.
- `scrollIntoView()` trả về Promise trên Chrome mới, làm crash effect.
- Trạng thái "Đã đồng bộ" không cập nhật sau khi khôi phục bản nháp.
- Tab trên mobile không có tên cho trình đọc màn hình.

**Chưa kiểm chứng:**

- Chưa thử trên điện thoại thật, chưa thử bàn phím ảo.
- Chưa đăng nhập Google thật (mới chỉ dùng emulator).
- Đã chụp màn hình desktop/mobile vào thư mục scratchpad của phiên nhưng **chưa xem lại**.

## 4. Đang làm dở

- Đang ở bước kiểm tra giao diện bằng ảnh chụp. Chưa sửa gì sau bước đó.
- **Chưa viết tài liệu cho Owner:** README, FILE_MAP, DATA_FLOW, FIREBASE_SETUP, TESTING.
- **Phase 1 còn thiếu:** chưa có test riêng cho upload/thay ảnh bìa (code đã có, chỉ chưa có e2e).

## 5. Cách tiếp tục

```powershell
cd "D:\blue bird"
npm install                      # nếu node_modules bị thiếu
npm test                         # unit
npm run test:emu                 # rules + sync (cần Java, đã có)
npm run e2e                      # tự bật emulator + Vite ở cổng 5174
```

Chạy app trên máy (không cần project Firebase thật):

```powershell
npm run emulators                # terminal 1
npm run dev:emu                  # terminal 2 → http://localhost:5173
```

Ở chế độ emulator, nút "Đăng nhập bằng Google" mở trang đăng nhập giả của emulator. Nhập email `ngoia6664@gmail.com` để được phép vào.

Việc tiếp theo theo thứ tự:

1. Xem ảnh chụp giao diện desktop/mobile, chỉnh CSS nếu cần.
2. Viết 5 tài liệu cho Owner (ngắn gọn).
3. Thêm `tsconfig.tsbuildinfo` vào `.gitignore`. Commit khi Owner yêu cầu.
4. Bắt đầu Phase 2: Find/Replace, chế độ đọc, nhập/xuất, backup.

## 6. Việc Owner cần xử lý

1. **Email được phép:** `firestore.rules` hiện chỉ có `ngoia6664@gmail.com`. Thêm email Google của người viết vào danh sách đó, đồng thời sửa `OWNER_EMAIL` trong `tests/rules.test.ts` nếu đổi email đầu tiên.
2. **Tạo project Firebase** trên gói **Spark**:
   - Bật Authentication với nhà cung cấp Google.
   - Tạo Firestore ở production mode, region `asia-southeast1`.
   - Thêm một Web app, copy config vào `.env.local` (mẫu ở `.env.example`).
3. **Deploy:** `npx firebase login`, `npx firebase use <project-id>`, rồi `npm run deploy`. Lệnh deploy đẩy cả rules và index. Index của `versions` cần vài phút để build.
4. **Duyệt việc commit:** chưa có commit nào. Cho biết khi nào muốn commit.
5. npm đã chặn install script của `protobufjs` và `re2` (thuộc firebase-tools). Emulator vẫn chạy bình thường nên chưa cần làm gì.
