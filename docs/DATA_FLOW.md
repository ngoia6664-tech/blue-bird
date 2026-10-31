# Luồng dữ liệu

## Cấu trúc Firestore

```
users/{uid}/
  works/{workId}                    thông tin tác phẩm, tổng số từ
    chapters/{chapterId}            nhãn, tên, thứ tự, trạng thái, ghi chú, canonVersionId
      versions/{versionId}          snapshot nội dung (auto, manual, pre-restore, pre-replace, pre-import, canon…)
    contents/{chapterId}            json + text + rev (số phiên bản tăng dần)
    bible/{itemId}                  mục Sổ tay; bible/style = quy tắc văn phong
  covers/{workId}                   ảnh bìa đã nén
```

`firestore.rules` chỉ cho email trong danh sách đọc/ghi dưới `users/{uid}` của chính họ.

## Lưu chữ khi đang viết

```
gõ phím → (LOCAL_SAVE_DELAY_MS) → saveDraft → IndexedDB (hàng đợi bản nháp)
                                             └→ flush() → push.ts: transaction
                                                   rev server == baseRev ? ghi, rev+1 : đánh dấu xung đột
```

1. Editor ghi bản nháp vào IndexedDB trước. Trạng thái: "Đã lưu trên máy".
2. `flush()` đẩy từng bản nháp lên bằng transaction (dùng `navigator.locks` để mỗi lúc chỉ một tab đẩy). Một bản nháp chỉ được đánh dấu đã đồng bộ khi server xác nhận. Trạng thái: "Đã đồng bộ lên cloud".
3. Khi tab bị ẩn, `pagehide` hoặc `beforeunload`, app ghi thêm một bản khẩn cấp đồng bộ vào localStorage. `ChapterPane` gộp bản này lại ở lần mở chương sau (`recoverEmergency`).
4. Offline: bản nháp nằm chờ trong IndexedDB. Khi có mạng (sự kiện `online`, hoặc mỗi 30 giây) app đẩy lại.

## Mở chương

`ChapterPane` đọc bản nháp trên máy và bản trên server, rồi `decideOnOpen` chọn:

- **bản server**: không có bản nháp mới hơn;
- **bản nháp**: bản trên máy chưa đồng bộ và dựa trên đúng `rev` hiện tại;
- **xung đột**: máy khác đã ghi rev mới hơn trong lúc máy này có bản chưa đồng bộ. Người dùng chọn bản nào; bản không chọn được lưu vào lịch sử.

Nhiều tab: mỗi chương có một khóa (`navigator.locks`). Tab không giữ khóa chỉ đọc được. Khi nhận khóa, tab đó kiểm tra lại server và bản nháp, rồi tải lại nếu nội dung đang hiển thị đã cũ.

## Thay hàng loạt toàn tác phẩm

1. Lưu ngay bản đang gõ, gọi `flush()`, quét lại nội dung mới nhất (`loadContents`).
2. Bỏ qua chương còn bản nháp chưa đồng bộ.
3. Với mỗi chương, `rewriteChapter` chạy một transaction:
   - kiểm tra `rev` vẫn như lúc quét;
   - ghi một phiên bản `pre-replace`;
   - ghi nội dung mới với `rev + 1`;
   - cập nhật số từ.

   Chương nào lỗi thì dừng ở đó và báo cáo.
4. Hoàn tác cũng dùng `rewriteChapter`: chương đã bị sửa tiếp sau đó sẽ được bỏ qua, không bị ghi đè.

## Sao lưu / khôi phục

- File ZIP gồm `manifest.json` (có `schemaVersion`) và `works/{id}/` với các file `work.json`, `chapters.json`, `bible.json`, `contents/*.json`, `versions/*.json` (tùy chọn). Nội dung lấy từ bản nháp chưa đồng bộ được gắn cờ `local`.
- Khi khôi phục, mọi id được tạo mới. Doc tác phẩm được ghi **sau cùng**, nên tác phẩm khôi phục dở dang không bao giờ hiện ra. Nếu lỗi giữa chừng, các doc đã ghi bị xóa. Dữ liệu đang có không bao giờ bị ghi đè.

## Nhập / xuất

- Nhập: DOCX đi qua `mammoth` thành HTML, TXT/MD đi qua `convert.ts`; sau đó `generateJSON` (lọc theo schema Tiptap) rồi tới `createChapter` (kèm nội dung, rev 1).
- Xuất: JSON chuyển thành TXT/MD (`convert.ts`) hoặc DOCX (`docx.ts`), một file hoặc ZIP (`jszip`).
