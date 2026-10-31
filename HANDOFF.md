# HANDOFF — Novel Studio (01/11/2026)

Phase 1 và Phase 2 đã xong. Tài liệu cho người viết: [docs/USER_GUIDE.md](docs/USER_GUIDE.md). Cho người phát triển: [docs/FILE_MAP.md](docs/FILE_MAP.md), [docs/DATA_FLOW.md](docs/DATA_FLOW.md).

## Bảng nghiệm thu

| Chức năng | Đã triển khai | Có UI | Đã test | Ghi chú |
|---|---|---|---|---|
| Tự lưu, trạng thái lưu tách bạch (máy / cloud / lỗi) | ✅ | ✅ | unit + e2e | Có bản khẩn cấp localStorage khi đóng tab; trình duyệt hỏi lại khi rời trang lúc chưa lưu xong |
| Xung đột nhiều thiết bị | ✅ | ✅ | e2e | Bản không chọn được lưu vào lịch sử |
| Nhiều tab cùng chương | ✅ | ✅ | e2e | Tab thứ hai chỉ đọc; khi nhận quyền sửa sẽ tải lại bản mới nhất |
| Lịch sử phiên bản: lưu thủ công, trước khi thay/nhập/khôi phục | ✅ | ✅ | e2e | |
| Bản chính thức (canon) | ✅ | ✅ | e2e | |
| Ctrl+F tìm trong chương (NFC/NFD, hoa/thường, nguyên từ) | ✅ | ✅ | unit + e2e | |
| Ctrl+H thay một / thay tất cả, hoàn tác | ✅ | ✅ | unit + e2e | Giữ định dạng chữ |
| Tìm / thay toàn tác phẩm | ✅ | ✅ | emulator + e2e | Kiểm tra `rev`, snapshot từng chương, báo cáo, hoàn tác |
| Chế độ đọc | ✅ | ✅ | e2e | Số trang chỉ là ước tính |
| Nhập TXT / MD / DOCX, chia chương | ✅ | ✅ | unit + e2e | Ảnh trong DOCX bị bỏ (app có báo) |
| Xuất TXT / MD / DOCX, ZIP, khoảng chương | ✅ | ✅ | unit + e2e | |
| Sao lưu / khôi phục ZIP | ✅ | ✅ | emulator + e2e | Không ghi đè; chỉ gồm bản nháp chưa đồng bộ của máy này |
| Sổ tay truyện (6 tab, quan hệ, liên kết chương) | ✅ | ✅ | e2e + rules | |
| Chế độ tập trung | ✅ | ✅ | e2e | |
| Danh sách chương: tìm theo số, nhóm 50, lọc trạng thái, chèn sau | ✅ | ✅ | unit + e2e | |
| Căn lề trái / giữa / phải / đều | ✅ | ✅ | e2e | Xuất DOCX giữ căn lề |
| Chữ nghiêng rõ ràng | ✅ | ✅ | xem bằng mắt | `font-synthesis: none`; nghiêng trong trích dẫn chuyển thành chữ đứng |
| Icon có `aria-label` + `title` | ✅ | ✅ | e2e (tìm theo tên) | |
| Responsive / mobile | ✅ | ✅ | e2e Pixel 7 giả lập | Chưa thử máy thật |
| PWA | ✅ | ✅ | Bản build: offline vẫn mở được vỏ app | Icon chỉ có SVG |
| Thống kê tác phẩm | ✅ | ✅ | e2e | Chưa có thống kê theo ngày / mục tiêu |
| Security Rules cho dữ liệu mới | ✅ | – | emulator | |

## Test (lần chạy cuối)

| Lệnh | Kết quả |
|---|---|
| `npm run build` (gồm typecheck) | Đạt. Cảnh báo bundle lớn đã có từ trước |
| `npm test` | 42/42 |
| `npm run test:emu` | 17/17 |
| `npm run e2e` | 29 đạt, 1 bỏ qua (test chỉ dành cho mobile) |

## Còn lại / rủi ro

- **Chưa làm:**
  - thống kê số từ theo ngày, mục tiêu số từ;
  - phân trang thật trong chế độ đọc;
  - chế độ in;
  - icon PNG cho iPhone.
- **Chưa test:**
  - mất mạng giữa lúc thay hàng loạt;
  - sao lưu tác phẩm rất lớn (100+ chương);
  - điện thoại thật và bàn phím ảo;
  - đăng nhập Google thật.
- Ghi chú nhanh lưu khi rời ô (blur). Nếu đóng tab **ngay lập tức** sau khi gõ, ghi chú có thể chưa kịp lưu.
- `firestore.rules` hiện cho phép 2 email: `ngoia6664@gmail.com`, `lquynhnhu9726@gmail.com`.
