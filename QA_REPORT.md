# Kết quả QA Novel Studio — 31/10/2026

## Kết luận

**Chưa nên phát hành để lưu bản thảo quan trọng:** đã tái hiện hai lỗi ghi đè thay đổi khi dùng nhiều tab hoặc nhiều thiết bị. Các luồng thông thường hoạt động trong phạm vi đã kiểm tra.

Cả hai lỗi đã xuất hiện lại trong lần chạy xác nhận riêng, không chỉ ở lần phát hiện ban đầu.

Đây là phiên kiểm thử và bổ sung test hồi quy; không sửa mã nghiệp vụ, không deploy và không xóa vĩnh viễn dữ liệu có sẵn của người dùng. Các tác phẩm do test tạo được giữ lại trong emulator, có tên bắt đầu bằng `QA ` hoặc `Truyện reload`, `Truyện chuyển chương`, `Truyện offline`, `Truyện xung đột`, `Truyện thùng rác`.

## Môi trường và phạm vi

- Đọc README, HANDOFF và mã các luồng dữ liệu/editor liên quan.
- Kiểm tra trực tiếp giao diện Edge tại `http://localhost:5173`: trình soạn thảo, thư viện, cài đặt và trạng thái đồng bộ.
- Kiểm thử tự động bằng Chromium desktop và thiết bị Pixel 7 giả lập, Firebase Auth/Firestore Emulator.
- Các ca bảo mật và transaction chạy trong project `demo-novel-qa`, tách namespace khỏi dữ liệu `demo-novel-studio` đang mở trên máy. Không chạy lệnh xóa toàn bộ dữ liệu project của người dùng.
- Các test E2E bổ sung ở `e2e/qa.spec.ts` và `e2e/qa-chapters.spec.ts`.

## Kết quả kiểm tra

| Nhóm | Kết quả |
|---|---|
| TypeScript | Đạt |
| Unit test sẵn có | 17/17 đạt |
| Security Rules | 5/5 đạt |
| Transaction đồng bộ | 5/5 đạt |
| E2E sẵn có | 7/7 đạt trên lần chạy hoàn chỉnh với `.qa/baseline.config.ts` |
| Các ca QA bổ sung, tổng hợp qua các lần chạy | 7 đạt, 2 lỗi sản phẩm |
| Build production | Đạt; có cảnh báo kích thước bundle |

Các ca QA bổ sung đã đạt:

1. Tên tác phẩm bắt buộc, giới hạn 200 ký tự; lưu metadata; tìm theo tên khác; lọc trạng thái; mở lại form sửa.
2. Lưu phiên bản thủ công, xem trước, khôi phục; nội dung bị thay được giữ trong phiên bản trước khôi phục.
3. Định dạng đậm tiếng Việt được giữ sau reload trên desktop.
4. Định dạng và bố cục vùng viết trên Pixel 7 giả lập; không tràn ngang trang trong ca này. Đã xem ảnh chụp.
5. Upload, thay, gỡ ảnh bìa; từ chối file không phải ảnh; lưu và mở lại.
6. Nhân bản nội dung chương, chuyển thứ tự, đưa vào thùng rác, khôi phục; tiêu đề/nội dung còn sau reload; không có `pageerror` trong luồng này.
7. Reload ngay sau nhập, trước thời gian debounce autosave, giữ nội dung qua ba lần thử.

E2E sẵn có xác nhận thêm: autosave, đếm từ tiếng Việt, chuyển chương khi chưa lưu, viết offline rồi online, đọc từ thiết bị thứ hai, xử lý xung đột nội dung và giữ bản còn lại trong lịch sử, chặn tài khoản lạ, thùng rác/khôi phục tác phẩm trên desktop và mobile giả lập.

Một lỗi selector của test mới (`getByLabel` với nhãn select) đã được sửa sang `getByRole('combobox', ...)` rồi chạy lại đạt. Một lần cấu hình sai host `127.0.0.1:5173` bị từ chối kết nối đã được sửa sang `localhost:5173`. Hai trường hợp này không được tính là lỗi sản phẩm.

## QA-01 — Tab chờ quyền chỉnh sửa ghi đè bản mới bằng bản cũ

**Mức độ: nghiêm trọng. Ưu tiên: P1, chặn phát hành.**

Các bước tái hiện:

1. Tab A mở chương, nhập `Bản gốc.` và chờ trạng thái Đã đồng bộ.
2. Mở cùng chương ở tab B, cùng browser context. B đọc được bản gốc và bị khóa chỉnh sửa đúng thiết kế.
3. A thay nội dung bằng `Bản mới đã lưu từ tab một.`, chờ Đã đồng bộ.
4. Đóng A. B được mở khóa nhưng vẫn hiển thị `Bản gốc.`.
5. B viết thêm ` Viết tiếp ở tab hai.`, chờ Đã đồng bộ và reload.

**Thực tế:** nội dung đã lưu là `Bản gốc. Viết tiếp ở tab hai.`. Phần sửa ở A biến mất khỏi nội dung hiện tại; không có màn hình đối chiếu xung đột.

**Mong đợi:** khi nhận quyền chỉnh sửa, B phải tải/đối chiếu bản mới trước khi cho nhập; không được đồng bộ bản dựa trên nội dung cũ như thể đã dựa trên revision mới.

Vị trí cần xem:

- `src/editor/ChapterEditor.tsx:121`: callback nhận Web Lock chỉ gọi `setLocked(false)`.
- `src/editor/ChapterEditor.tsx:165`: thông báo bản mới bỏ qua thay đổi từ cùng `deviceId`, vốn được chia sẻ giữa các tab.
- `src/sync/drafts.ts:28`: bản nháp có thể lấy `baseRev` mới từ IndexedDB trong khi editor vẫn giữ nội dung cũ, khiến kiểm tra revision chấp nhận ghi đè.

Bằng chứng:

- [Ảnh nội dung sau ghi đè](.qa/results/qa-QA-second-tab-refreshes-06db1-when-editing-lock-transfers-desktop/test-failed-1.png)
- [Trace tái hiện](.qa/results/qa-QA-second-tab-refreshes-06db1-when-editing-lock-transfers-desktop/trace.zip)
- Test: `QA second tab refreshes chapter content when editing lock transfers` trong `e2e/qa.spec.ts`.

## QA-02 — Đóng bảng thông tin ghi đè ghi chú đã lưu từ thiết bị khác

**Mức độ: cao. Ưu tiên: P1.**

Các bước tái hiện:

1. Thiết bị A mở một chương có ghi chú ban đầu trống.
2. A nhập `Ghi chú ban đầu từ máy một`, rời ô để lưu; giữ bảng thông tin mở.
3. Thiết bị B, browser context riêng, mở cùng chương và xác nhận thấy ghi chú của A.
4. B đổi thành `Ghi chú từ máy thứ hai`, rời ô, reload và xác nhận bản mới đã lưu.
5. A mở Lịch sử phiên bản, làm bảng thông tin bị unmount, dù không nhập thêm gì vào ghi chú.
6. B reload.

**Thực tế:** ghi chú quay về `Ghi chú ban đầu từ máy một`.

**Mong đợi:** đóng bảng đã lưu không được ghi lại nội dung cũ; dữ liệu từ thiết bị khác phải được giữ hoặc có cơ chế phát hiện xung đột.

Vị trí cần xem: `src/pages/Writer.tsx:291–292`. Cleanup effect với dependency rỗng giữ `chapter.note` của lần mount; khi unmount nó có thể coi ghi chú đã lưu là thay đổi chưa lưu và ghi lại giá trị cũ. Ghi chú dùng ghi metadata trực tiếp nên không qua cơ chế kiểm tra revision của nội dung chương.

Bằng chứng:

- [Ảnh ghi chú bị trả về bản cũ](.qa/results/qa-QA-remote-quick-note-is-842e0-previously-saved-info-panel-desktop/test-failed-2.png)
- [Trace tái hiện](.qa/results/qa-QA-remote-quick-note-is-842e0-previously-saved-info-panel-desktop/trace.zip)
- Test: `QA remote quick note is not overwritten by leaving a previously saved info panel` trong `e2e/qa.spec.ts`.

## Quan sát hiệu năng

Build tạo JavaScript khoảng **1.432,57 kB**, gzip **440,93 kB**, có cảnh báo chunk lớn hơn 500 kB. Đây là điểm cần đo thêm trên mạng chậm/điện thoại; chưa có số liệu để kết luận thời gian tải không đạt. Có thể xem xét tải editor và các màn ít dùng theo nhu cầu.

## Chưa được xác nhận trong phiên này

- OAuth Google thật và luồng popup bị chặn/redirect: các test xác thực dùng emulator.
- Điện thoại thật, Safari/iOS, bàn phím ảo và bộ gõ tiếng Việt thực tế. Nhập tiếng Việt bằng automation không chứng minh luồng IME.
- Đồng bộ qua Firebase production và Security Rules/index đang deploy thực tế.
- Xóa vĩnh viễn: không thực hiện thao tác không thể hoàn tác trên dữ liệu phiên người dùng.
- Kiểm toán accessibility đầy đủ bằng screen reader/bàn phím; tải lớn, giới hạn quota, lỗi ổ đĩa/IndexedDB, ngắt mạng kéo dài, đóng cưỡng bức trình duyệt và bảo mật toàn diện.
- Find/Replace, chế độ đọc, nhập/xuất, backup và PWA thuộc các phase sau theo HANDOFF/README; không tính là thiếu chức năng Phase 1.

## Chạy lại

Khi Auth/Firestore Emulator và `npm run dev:emu` đang chạy tại localhost:5173:

```powershell
npm.cmd run typecheck
npm.cmd test
npx.cmd playwright test --config .qa/baseline.config.ts
npx.cmd playwright test --config .qa/playwright.config.ts
```

Bộ QA hiện cố ý có hai test đỏ để phát hiện QA-01 và QA-02 cho đến khi được sửa. Các test này tạo dữ liệu mới, không xóa tác phẩm có sẵn.

Kiểm tra rules/sync trong namespace riêng khi emulator cổng 8080/9099 đang chạy:

```powershell
npx.cmd vitest run --config .qa/vitest.config.ts .qa/rules.test.ts
npx.cmd vitest run --config .qa/vitest.config.ts tests/push.test.ts
```

Chạy rules trước để nạp quy tắc cho project thử `demo-novel-qa`. Không thay bằng `npm run test:emu` khi cần giữ dữ liệu emulator `demo-novel-studio`: test rules gốc có bước dọn toàn bộ project thử mặc định trước mỗi ca.
