# Kế hoạch sửa chức năng Mạch Đồng

Lập ngày 20/11/2026, cập nhật theo phạm vi đã chốt ngày 21/11/2026.

**Phạm vi:** hoàn thiện bản cục bộ tại `Mach-dong/`, chưa phát hành lên cloud. Bắt buộc đăng nhập để dùng ứng dụng. MVP ẩn tab Duyệt dữ liệu với mọi vai trò, chưa triển khai hàng chờ duyệt CSV. Tài khoản dùng để nghiệm thu là nông hộ thường, không giữ quyền admin. Không ghi mật khẩu hoặc API key vào tài liệu.

Các đường dẫn dưới đây tính từ `Mach-dong/`. Ứng dụng đang dùng Flask + Worker; không chuyển sang Next.js/Supabase trong lần sửa này.

## 1. Bắt buộc đăng nhập

**Nguyên nhân:** trước đây chỉ `/` chuyển khách sang `/login`; các trang và API vẫn có thể mở trực tiếp.

- Tập trung kiểm tra phiên tại `src/controllers/session_guard.py` và đăng ký ở `src/main.py`.
- Đăng nhập thường chỉ dùng tên tài khoản/email/số điện thoại và mật khẩu, không gửi hoặc kiểm tra OTP. Tab Quên mật khẩu luôn hiển thị và dùng luồng khôi phục riêng.
- Công khai trang đăng nhập/đăng ký, API gửi mã/khôi phục/đăng nhập và tài nguyên cần thiết. Các trang làm việc chuyển khách sang đăng nhập; API trả 401 theo `{ data, error }`.
- Kiểm tra CSRF cho thao tác ghi; dùng cùng token tài khoản cho diễn đàn và các phần còn lại.
- Chuyển tiếp phiên sang Worker và kiểm tra ở cloud trước khi cấp dữ liệu hoặc gọi AI. Giữ phân quyền tác giả của diễn đàn.
- Trở lại đường dẫn nội bộ sau đăng nhập; không chấp nhận `next` trỏ ra ngoài ứng dụng.
- Phiên hết hạn dẫn về đăng nhập, xóa nội dung chat đang giữ; trang riêng tư không được cache. Lỗi kho tài khoản trả 503, không coi là phiên khách.

**Tệp chính:** `src/main.py`, `src/controllers/session_guard.py`, `src/controllers/auth_controller.py`, `src/services/cloud_session.py`, các cloud client, `server/worker.mjs`, `src/static/workspace-session.js`.

**Nghiệm thu:** URL/API trực tiếp bị chặn khi chưa đăng nhập; đăng nhập, đăng xuất, hết phiên, CSRF sai, kho tài khoản mất kết nối và chuyển hướng sai đều có test.

## 2. Gửi và nhập mã xác nhận email

**Nguyên nhân:** template ẩn nút và ô OTP khi dịch vụ email chưa cấu hình; Worker còn bỏ qua xác minh trong trường hợp này.

- Luôn hiển thị nút gửi mã và ô 6 chữ số trên màn đăng ký. Email chiếm trọn hàng; SĐT và ô OTP ngắn ở hàng dưới. Không có placeholder “6 chữ số”.
- Nút Đăng nhập/Đăng ký ở bên phải header; bỏ menu Danh mục, giữ điều hướng tới các trang làm việc.
- Có trạng thái gửi, gửi lại sau 60 giây và thông báo lỗi. Đổi email xóa mã đang nhập.
- Worker bắt buộc xác minh OTP trước khi tạo tài khoản. Thiếu cấu hình mail trả lỗi dịch vụ, không tự bỏ bước xác nhận.
- Giữ mã có hạn dùng, giới hạn số lần sai, gắn với đúng email và tiêu thụ một lần bằng cập nhật có điều kiện.
- Kiểm tra tài khoản trùng trước khi tiêu thụ mã. Không trả mã thử nghiệm trong dịch vụ production.

**Cấu hình production:** `AUTH_EMAIL_API_KEY`, `AUTH_FROM_EMAIL`. Bản chạy cục bộ có hộp thư giả lập khi thiếu cấu hình này; giao diện phải ghi `[Giả lập cục bộ]` và nói rõ chưa gửi email thật.

**Tệp chính:** `src/views/auth/register.html`, `src/static/auth.js`, `server/auth.mjs`, `server/local.mjs`.

**Nghiệm thu:** mã thiếu/sai/hết hạn/đã dùng/khác email đều không đăng ký được; thiếu dịch vụ email không tạo tài khoản. Kiểm thử mail transport giả tách biệt với việc gửi email thật.

## 3. Hội thoại Cò Mạ nhiều lượt

**Nguyên nhân:** Worker cũ chỉ dùng AI chọn mã nguồn rồi ghép nguyên đoạn tài liệu, nên câu trả lời lặp và ít sát câu hỏi. Lỗi upstream có thể khiến người dùng tưởng chỉ hỏi được một lượt.

- Cho AI soạn lời đáp theo câu hỏi hiện tại và lịch sử, với căn cứ đã được chọn đúng cây và ngữ cảnh.
- Giữ cửa sổ lịch sử bốn cặp hỏi đáp, gửi được nhiều lượt liên tiếp; dữ kiện mới của người dùng được ưu tiên.
- Kiểm tra trạng thái gửi, dừng chờ, gửi lại và bắt đầu lại. Lỗi một lượt không khóa câu tiếp theo.
- Trả lời bằng tiếng Việt, đi thẳng vào tình huống: nhận định, lý do, việc cần làm và điều cần hỏi thêm.
- Kiểm tra schema, mã nguồn, văn bản rỗng/quá dài và những định lượng không có trong dữ kiện/căn cứ. Khi không có nguồn thì chỉ hỏi làm rõ, không đưa khẳng định kỹ thuật.
- Không tự đổi mặn kênh thành mặn ruộng hoặc g/L thành EC đất/nước. Không bịa liều phân/thuốc, tỷ lệ sống, năng suất hay chẩn đoán chắc chắn.

**Tệp chính:** `server/generative.mjs`, `server/assistant.mjs`, `src/services/assistant_service.py`, `src/services/cloud_assistant_service.py`, `src/static/assistant.js`.

**Nghiệm thu:** năm lượt liên tiếp, câu hỏi nối tiếp, đổi thông số/chủ đề, nguồn giả, định lượng không có căn cứ và lỗi API được kiểm tra. Kiểm tra nội dung thực tế bên cạnh test cấu trúc; citation hợp lệ không tự chứng minh mọi câu AI viết đều đúng.

## 4. Gemini tư vấn theo thông số ruộng

- Tạo `POST /api/simulation/advice`, tách khỏi việc chạy mô phỏng.
- Khi người dùng yêu cầu, gửi snapshot giống lúa, địa điểm, giai đoạn quan sát, ngày sau gieo, thời gian phơi nhiễm, mặn và nơi đo, mực nước, nhiệt độ, EC vùng rễ nếu có và lựa chọn dùng dự báo.
- Server validate lại đầu vào, tính lại kết quả xác định và gửi cùng căn cứ tới Gemini. Không tin điểm/rủi ro client tự gửi.
- Nếu dùng dự báo, tái sử dụng dữ liệu dự báo đã lấy cho kịch bản; hết hiệu lực thì yêu cầu chạy lại, không âm thầm thay dữ liệu khi tư vấn.
- Lời đáp có điều kiện đáng chú ý, việc nên làm cùng lý do/điều kiện áp dụng, thông tin cần đo thêm và lúc nên nhờ cán bộ nông nghiệp.
- Hiển thị nguồn và giới hạn của mô phỏng. Dữ liệu mang `isSimulated: true`; Gemini nằm ngoài engine thuần và không sửa các chỉ số đã tính.
- Khóa ở server; hạn mức theo tài khoản. Mặc định `gemini-3.1-flash-lite`; khi quá tải hoặc timeout, thử `gemini-2.5-flash` đúng một lần. Hai lần có tổng thời gian chờ phù hợp với proxy; không thử vòng lặp vô hạn.
- Bỏ phản hồi nếu người dùng đổi thông số trong lúc chờ. Kéo slider không tự gọi AI.

**Tệp chính:** `server/advice.mjs`, `server/generative.mjs`, `server/worker.mjs`, `src/services/simulation_service.py`, controller và giao diện mô phỏng.

**Cấu hình:** `GEMINI_API_KEY`, tùy chọn `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`. Schema và mã nguồn được kiểm tra theo [hướng dẫn structured output của Gemini](https://aistudio.google.com/docs/structured-output). Cần tiếp tục duyệt chuyên môn trước khi dùng lời khuyên ngoài phạm vi demo.

## 5. Dự báo thời tiết

**Điểm cần sửa:** nút bị phụ thuộc danh mục; mở thẳng tab không tự tải dự báo sau khi danh mục sẵn sàng, còn lỗi danh mục dễ để nút bị khóa.

- Tải dự báo sau khi danh mục sẵn sàng nếu đang mở tab thời tiết.
- Đặt bộ chọn địa điểm ngay trong tab, đồng bộ với địa điểm kịch bản; không yêu cầu điền đủ mô phỏng mới xem dự báo.
- Nút có thể thử lại sau lỗi danh mục hoặc dự báo. Chỉ khóa trong lúc tải.
- Đổi địa điểm hủy/bỏ kết quả cũ; hiển thị nguồn, thời gian cập nhật và đơn vị.
- Dữ liệu ô lưới, lịch sử và giả lập phải có nhãn phân biệt.

**Tệp chính:** `src/static/simulation.js`, `src/views/simulation/report-panels.html`, `src/static/simulation-reading.css`.

**Nghiệm thu:** mở thẳng URL tab, tải lần đầu, đổi địa điểm, lỗi danh mục, dự báo chậm và phản hồi đến sai thứ tự. Đã thử dữ liệu Open-Meteo thật qua bản cục bộ.

## 6. Phạm vi MVP của kho CSV và điều hướng

- Bỏ bốn bộ mẫu trong ảnh khỏi danh mục và URL tải: Độ mặn tại ruộng, Mực nước ruộng, Nhiệt độ tại ruộng, Độ pH tại ruộng.
- Giữ các bộ dữ liệu còn lại và nguồn tham chiếu phục vụ mô phỏng/Cò Mạ.
- Ẩn tab Duyệt dữ liệu với cả admin lẫn người dùng, gồm bản xem trước điều hướng React.
- Không đăng ký trang placeholder `/admin`; URL trực tiếp trả 404.
- Chưa xây dựng hàng chờ, xác thực hay duyệt đăng CSV. Tải tệp hiện chỉ dùng để xem trước, phải ghi đúng chức năng này.

**Tệp chính:** `src/services/csv_library.py`, `src/views/shared/workspace-links.html`, `src/views/shared/header.html`, `src/main.py`, `ui-preview/components/shell-preview.tsx`.

## 7. Thiết kế lại ví

- Thẻ ví xanh có đường may, chốt và chip minh họa; ưu tiên số điểm, chủ ví và số dư AVAX.
- Đưa địa chỉ dài, thông tin mạng, quy đổi và lịch sử vào các mục mở rộng.
- Có sao chép địa chỉ, liên kết biên nhận và trạng thái thao tác rõ ràng.
- Giữ nhãn số dư/quy đổi giả lập; phân biệt giao dịch thật trên Fuji.
- Dùng SVG có kích thước cố định, chừa khoảng cho icon trong ô nhập, không để icon che chữ.
- Giữ thẻ hồ sơ, đổi ảnh đại diện và các chức năng tài khoản hiện có.

**Tệp chính:** `src/views/auth/wallet.html`, `src/views/auth/profile-summary.html`, `src/views/auth/profile.html`, `src/static/wallet.css`, `src/static/account.js`.

## 8. Chính tả và câu chữ

- Rà các màn đăng nhập/đăng ký, hồ sơ, ví, diễn đàn, mô phỏng, thời tiết, trợ lý và thông báo JavaScript.
- Thống nhất cách viết hoa tiêu đề, nhãn email, tên đăng nhập, khóa riêng tư; thay tiếng Anh không cần thiết trên giao diện. Không thay tên biến khi chỉnh câu chữ.
- Đã sửa lỗi cú pháp trong `requestEmailOtp` làm form đăng nhập không chạy. Form tài khoản dùng POST để thông tin không rơi vào query string khi JavaScript lỗi. Bổ sung `npm run check:js` kiểm tra toàn bộ 12 tệp JavaScript client.
- Sửa câu còn mô tả bản xem thử dù chức năng đã hoạt động; không gọi dữ liệu tham chiếu là dữ liệu thời gian thực.
- Giữ nguyên tên nguồn, đơn vị và nội dung bài của người dùng; không sửa nội dung công bố chỉ để đồng nhất câu chữ giao diện.

## 9. Chạy và nghiệm thu cục bộ

```powershell
cd K:\Unihack\Mach-dong
.\.venv\Scripts\python.exe scripts/run-local.py
```

Mở `http://127.0.0.1:5000`. Bản này dùng adapter D1/R2 riêng tại `data/local-preview/`, không ghi vào dữ liệu cloud. Mật khẩu chỉ lưu dưới dạng hash. Tài khoản nghiệm thu có tên đăng nhập `nongho`, vai trò `FARMER`; mật khẩu bàn giao riêng trong chat. Không còn tài khoản admin trong kho thử này.

Khi chạy lần đầu ở một checkout mới, có thể đặt `MACH_DONG_LOCAL_USER_PASSWORD` trong môi trường để tạo người dùng thường cho bản cục bộ; không ghi giá trị vào source. Nếu đã có tài khoản, launcher không đổi mật khẩu.

Launcher chỉ nghe loopback và xác nhận đúng instance API, tránh dùng nhầm tiến trình cũ. Cấu hình production không tự chuyển sang kho cục bộ khi cloud lỗi.

### Kiểm tra tự động

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --test server/tests/*.test.mjs tests/simulation-view.test.mjs
node scripts/check-client-js.mjs
node server/build.mjs
node --check server/dist/server/index.js
cd ui-preview
node node_modules/typescript/bin/tsc --noEmit
```

Đã đạt: 77 test Python, 48 test JavaScript và kiểm tra kiểu của bản xem trước React. Build Worker và kiểm tra cú pháp Worker đã đạt. Đã thử đăng nhập `nongho` bằng mật khẩu, khôi phục mật khẩu mở đúng form, gửi OTP qua hộp thư cục bộ, Cò Mạ nhiều lượt và dự báo Open-Meteo thật. Gemini có thể quá tải tạm thời; đã kiểm tra thử lại sau lỗi. Bug kiểm soát truy cập đã có test tái hiện trước khi sửa; test cũ cho phép khách dùng app được đổi sang phiên đăng nhập thật trong fixture.

### Kiểm tra giao diện và dịch vụ thật

- Đăng nhập/đăng xuất, truy cập URL trực tiếp, hồ sơ nông hộ và ví gọn; mở các mục chi tiết, kiểm tra icon ở màn hình rộng.
- Đăng ký có nút gửi và ô nhập mã; hộp thư cục bộ gắn nhãn giả lập. **Chưa nghiệm thu gửi email thật** vì chưa có cấu hình dịch vụ mail.
- Chat nhiều lượt, lời khuyên theo snapshot và dự báo Open-Meteo; kiểm tra khi upstream quá tải, hủy yêu cầu và thử lại.
- Ghi kết quả quan sát trong bàn giao; không coi một lần thử gọi dịch vụ thành công là bảo đảm tính sẵn sàng hoặc độ đúng tuyệt đối.

**Không phát hành cloud trong đợt này theo lựa chọn của người dùng.** Khi được yêu cầu phát hành sau này, cần truy cập đúng dự án Sites, cấu hình mail và triển khai đồng bộ backend với client để phiên được chuyển tiếp đúng.

### Bổ sung khung lời khuyên Cò Mạ

- Đặt lời khuyên AI bên dưới các mục đối chiếu điều kiện tại ruộng trong cửa sổ chi tiết; dùng chung thẻ tư vấn với tab báo cáo.
- Tách lời chào và bốn mục: Điều kiện đáng chú ý, Việc nên làm, Cần đo thêm, Khi nào cần nhờ cán bộ nông nghiệp. Tách từng việc thành danh sách; giữ nguyên số đo thập phân.
- Thẻ có thông số kịch bản, nguồn tham khảo thu gọn, trạng thái đang tải/lỗi và ghi chú phạm vi áp dụng. Tạo nội dung bằng textContent để không thực thi HTML từ lời đáp.
- Hai kiểm thử tách đoạn mới đã đạt. Cần kiểm tra hình ảnh thực tế của thẻ mới trong cửa sổ chi tiết và tab báo cáo, sau đó lưu ảnh nghiệm thu; phiên kiểm tra trình duyệt gần nhất bị hết thời gian chờ.
- Tệp chính: `src/views/simulation/co-ma-advice.html`, `src/static/co-ma-advice.css`, `src/static/simulation.js`, `src/static/simulation-demo.js`.
