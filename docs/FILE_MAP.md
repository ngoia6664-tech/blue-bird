# Bản đồ file

| File | Làm gì |
|---|---|
| **Gốc** | |
| `firestore.rules` | Quyền truy cập: chỉ email trong danh sách được đọc/ghi `users/{uid}/…` |
| `firestore.indexes.json` | Index cho lịch sử phiên bản |
| `firebase.json` | Hosting (SPA rewrite, cache header cho `sw.js` / `assets`), cổng emulator |
| `vite.config.ts` | Build; `optimizeDeps` cho mammoth/docx/jszip |
| `public/sw.js`, `manifest.webmanifest`, `icon.svg` | PWA: service worker chỉ cache vỏ app cùng origin, không cache Firebase |
| **src/** | |
| `main.tsx` | Router (lazy route cho Đọc thử, Sổ tay, Cài đặt), đăng ký service worker ở bản production |
| `firebase.ts` | Khởi tạo Firebase, cache offline, nối emulator |
| `config.ts` | Hằng số: tên app, thời gian tự lưu, giới hạn kích thước |
| `types.ts` | Kiểu dữ liệu: Work, Chapter, ChapterContent, Version, BibleItem |
| `format.ts` | Đếm từ tiếng Việt, ước tính trang, định dạng ngày/số |
| **src/auth/** `AuthProvider.tsx` | Đăng nhập Google, kiểm tra quyền |
| **src/components/** | |
| `AppLayout.tsx` | Topbar, điều hướng, thanh "có bản cập nhật" |
| `Menu.tsx` | Menu ba chấm |
| `Modal.tsx` | Hộp thoại (`<dialog>`) và hàm `download()` |
| `Cover.tsx` | Ảnh bìa, nén ảnh |
| **src/data/** (Firestore) | |
| `refs.ts` | Đường dẫn collection/doc, `commit()`, `deviceId` |
| `works.ts` | Tác phẩm: lưu, thùng rác, xóa vĩnh viễn (kể cả Sổ tay) |
| `chapters.ts` | Chương: tạo (có thể kèm nội dung), sửa, đổi thứ tự |
| `contents.ts` | `loadContents` (tải nội dung nhiều chương), `rewriteChapter` (ghi có kiểm tra `rev` + snapshot) |
| `versions.ts` | Phiên bản: thêm, liệt kê, dọn bản tự động cũ |
| `bible.ts` | Sổ tay: thêm/sửa mục, quy tắc văn phong |
| `hooks.ts` | Hook React: `useWorks`, `useChapters`, `useBible`… |
| **src/sync/** (chống mất chữ) | |
| `drafts.ts` | Quy tắc gộp bản nháp, quyết định khi mở chương |
| `engine.ts` | Hàng đợi bản nháp IndexedDB, bản khẩn cấp localStorage, `flush()` |
| `push.ts` | Transaction đẩy bản nháp lên Firestore, phát hiện xung đột |
| **src/editor/** | |
| `extensions.ts` | Cấu hình Tiptap (gồm căn lề) |
| `ChapterPane.tsx` | Tải chương: bản server hay bản nháp trên máy; màn xung đột |
| `ChapterEditor.tsx` | Editor, toolbar, trạng thái lưu, phím tắt, khóa một tab |
| `findPlugin.ts` | Plugin ProseMirror tô sáng kết quả tìm, thay |
| `FindBar.tsx` | Thanh Ctrl+F / Ctrl+H |
| `GlobalSearch.tsx` | Tìm/thay toàn tác phẩm, báo cáo, hoàn tác |
| `VersionPanel.tsx` | Lịch sử phiên bản, bản chính thức |
| **src/search/** | |
| `find.ts` | Thuật toán tìm (gom theo cụm ký tự, NFC/NFD, hoa/thường, nguyên từ), lọc chương theo số |
| `doc.ts` | Tìm/thay trên tài liệu ProseMirror, kể cả ngoài editor |
| **src/doc/** | |
| `convert.ts` | TXT/MD ↔ JSON Tiptap, nhận tiêu đề chương, chia chương |
| `docx.ts` | Tạo DOCX (thư viện `docx`), đọc DOCX (`mammoth`) |
| `ImportDialog.tsx`, `ExportDialog.tsx` | Giao diện nhập/xuất |
| **src/backup/** | |
| `backup.ts` | Tạo/đọc/khôi phục ZIP (`manifest.json`, `schemaVersion`) |
| `BackupSection.tsx` | Thẻ sao lưu trong Cài đặt |
| **src/pages/** | |
| `Library.tsx` | Thư viện |
| `WorkForm.tsx` | Tạo/sửa tác phẩm |
| `Writer.tsx` | Màn Viết: danh sách chương, bảng thông tin, chế độ tập trung |
| `Reader.tsx` | Đọc thử |
| `Bible.tsx` | Sổ tay truyện |
| `Settings.tsx` | Tài khoản, đồng bộ, sao lưu |
| **src/styles/** | `tokens.css` (màu, font, khoảng cách), `app.css` |
| **Test** | |
| `src/**/*.test.ts` | Unit test (`npm test`) |
| `tests/` | Security Rules, đồng bộ, sao lưu (`npm run test:emu`) |
| `e2e/` | Playwright trên emulator (`npm run e2e`) |
