# Triển khai AI dùng chung — mở local không nhập API key

## Mục tiêu

Giám khảo tải mã nguồn, cài Python, chạy script và đăng nhập tài khoản Mạch Đồng. Giao diện/CSS được phục vụ tại localhost. Chat và tư vấn đi từ Flask local qua HTTPS tới backend của nhóm; backend giữ Groq key và gọi nhà cung cấp. Máy người dùng không có key của nhóm.

## Luồng và cấu hình

`Trình duyệt → Flask localhost → backend Mạch Đồng → Groq → backend → Flask → trình duyệt`.

- `python main.py` / `scripts/run-local.ps1` mặc định chọn `shared`; không cần `.env.local` hoặc Node.js.
- Cả AUTH, COMMUNITY, REFERENCE, ASSISTANT, SIMULATION dùng cùng HTTPS origin để phiên tài khoản được xác minh nhất quán. Không ghép token tài khoản SQLite cục bộ vào API cloud.
- `shared_app_config` đặt cả khóa Groq/Gemini trong Flask thành chuỗi rỗng, kể cả máy phát triển đang có key trong môi trường. Khóa không được gửi qua HTTP từ máy local.
- Backend mặc định: `https://mach-dong-rice-data.artfulmica6.chatgpt.site`; Site ID giữ nguyên `appgprj_6afcfbe9375c8191af0a348ebb094ff8`.
- `MACH_DONG_SHARED_API_URL` chỉ dành cho đổi origin khi vận hành; bắt buộc HTTPS, không chứa tài khoản/mật khẩu/query/path.
- `MACH_DONG_BACKEND_MODE=local` vẫn cho phép phát triển full-local như trước, cần Node.js và key riêng; người chấm không dùng chế độ này.

## Quyền và trạng thái triển khai

Mã nguồn backend đã chuẩn bị cho Site cũ. Lượt kiểm tra quyền ngày 21/11/2026: `get_site` đọc được metadata công khai, nhưng `create_source_repository_write_credential` và `get_environment_variables` trả `NOT_FOUND / Sites project not found`. Tài khoản kết nối hiện tại chưa có quyền sửa nguồn/secret. Người dùng chọn **cấp quyền backend cũ**, không tạo backend công khai mới.

**Chưa được coi là triển khai thành công** cho đến khi nhận credential, push nguồn Sites, deploy saved version và thử hai API thật từ bản local không có key. Health cũ chỉ có `aiConfigured` cho Groq chọn bằng chứng, không chứng minh chat/tư vấn mới sẵn sàng.

## Các bước dành cho người vận hành backend

1. Chủ Site cấp quyền editor cho tài khoản Sites đang kết nối Codex. Giữ nguyên audience, D1 và R2; không thay Site ID.
2. Mở nguồn bằng Sites source workflow với write credential mới, đồng bộ các tệp `server/` từ branch GitHub vào checkout Sites. Không copy `.git`, `.env*` chứa secret, `dist` cũ hoặc dữ liệu người dùng.
3. Đặt `AI_PROVIDER=groq`, runtime secret `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-20b` trên Sites. Nếu đã có Groq key thì giữ nguyên secret đó. Model này hỗ trợ JSON Schema strict theo [tài liệu Groq](https://console.groq.com/docs/structured-outputs). Khóa phải có quyền model/còn hạn mức. Không cần Gemini key khi chọn Groq, không tự chuyển sang Gemini nếu Groq lỗi. Không ghi khóa vào GitHub, hosting manifest, JavaScript hay EXE. Giữ các secret tài khoản/email hiện có.
4. Chạy `node --test tests/*.test.mjs`, `node build.mjs`; kiểm tra cú pháp `dist/server/index.js`. Workflow đẩy nguồn chính xác và đóng gói archive; lưu version từ SHA đã push rồi deploy version đó.
5. Chờ deployment `succeeded`. Kiểm tra `/api/health`: `apiRevision=shared-ai-v1`, `aiProvider=groq`, `aiFeatures.chat=true`, `aiFeatures.scenarioAdvice=true`. Health dùng khóa của provider đã chọn, không trả khóa và không khẳng định Groq còn hạn mức.
6. Chạy bản clone không có `.env.local`/Gemini key. Đăng nhập tài khoản cloud, thử chat và câu hỏi tiếp nối; chạy mô phỏng rồi nhấn Nhờ Cò Mạ tư vấn. Chỉ nghiệm thu khi hai lời gọi thật HTTP 200, lời đáp hiện trên UI, nguồn hợp lệ và snapshot khớp điều kiện.
7. Ghi lại version/SHA/deployment và kết quả thật vào tài liệu này. Sau đó push branch GitHub để máy giám khảo nhận đủ bản sửa.

## Giới hạn và xử lý lỗi

Backend hiện xác minh phiên tài khoản/CSRF trước khi gọi AI, giới hạn độ dài/payload, số lượt mỗi người và số lời gọi đồng thời trong mỗi Worker isolate, tối đa một lần retry trên cùng provider cho lỗi tạm thời hoặc lời đáp không hợp lệ. Groq trả 429 thì dừng, không retry hoặc chuyển sang Gemini. Đây không phải quota bền vững toàn cục. Không cam kết dùng không giới hạn; giữ khóa có hạn mức phù hợp cho demo. Hết quota, sai key, mất Internet hoặc phiên hết hạn phải trả lỗi thật; không dựng phản hồi thành công giả.

Máy mới dùng tài khoản cloud được nhóm cấp hoặc tự đăng ký qua dịch vụ email nếu đã cấu hình. Tài khoản full-local cũ không được tự động chuyển sang cloud. Không phát hành tài khoản dùng chung với mật khẩu cứng trong Git.

## Kiểm tra ở máy giám khảo

### Kết quả đã kiểm tra trước khi cấp quyền cloud

- Bản sao 372 tệp nguồn, không có `.env.local` hoặc dữ liệu người dùng; xóa Gemini/Groq key khỏi môi trường và để PATH rỗng để không tìm thấy Node: `python main.py` vẫn mở giao diện local.
- Trang đăng nhập HTTP 200, CSS/phông/ảnh đúng, không tràn ngang, không có ô nhập API key.
- `--check` trả mã 1 và thông báo backend cũ chưa hỗ trợ chat/tư vấn mới, đúng với trạng thái deployment hiện tại.
- Kiểm thử tích hợp Flask chuyển cả chat và advice qua HTTPS cùng session/CSRF, không gửi provider key và không gọi Gemini trực tiếp trên máy người dùng.
- Python: 90 tests qua. Backend Node/frontend: 88 tests qua; Worker build và kiểm tra cú pháp thành công. Cú pháp 15 JavaScript trình duyệt qua. Không phát hiện secret cục bộ trong các tệp thay đổi.

Những kết quả này xác minh mã nguồn và giao diện không cần key; **chưa xác minh cloud end-to-end sau triển khai**. Người dùng xác nhận chưa cấp quyền xong, nên chưa thể cập nhật Site hiện có.

### Cập nhật chuyển Groq

Đã loại đường gọi Gemini khỏi Worker của cả chat, tư vấn và chọn bằng chứng. Cả ba chỉ đọc `GROQ_API_KEY`/`GROQ_MODEL`, kể cả khi còn biến Gemini cũ trong môi trường. Kiểm thử Groq-only xác minh endpoint, bearer header, hội thoại, schema, source allowlist, snapshot không bị sửa, retry có giới hạn và không chuyển provider. Các bài kiểm tra này dùng phản hồi giả của provider; môi trường local chưa có `GROQ_API_KEY`, nên chưa gọi Groq thật trong lượt cập nhật này. Hướng dẫn để AI của Tín triển khai: [Bàn giao backend Groq](ban-giao-ai-backend-tin-groq.md).

### Lệnh kiểm tra

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1 -Check
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1
```

`-Check` thất bại nếu backend vẫn là bản cũ/chưa có cấu hình cho hai tính năng. Không yêu cầu giám khảo nhập key để vượt kiểm tra. Hướng dẫn đầy đủ: [chạy local](chay-local-giam-khao.md).
