# Kế hoạch backend Trợ lý Cò Mạ

## Phạm vi demo

Bà con mở `/assistant` để hỏi cách trồng, đất và dinh dưỡng, sâu bệnh, mặn và ngập cho lúa, rau màu và cây ăn trái. Cò Mạ nhớ tối đa bốn lượt hỏi đáp gần nhất và gắn liên kết tới tài liệu đã dùng.

Luồng đi từ `assistant.js` → Flask `POST /api/assistant/chat` → `assistant_service.py` → `assistant_sources.py`. Tra cứu số liệu lịch sử theo trạm và ca giả lập dùng CSV cục bộ. Câu hỏi canh tác gọi `ai_client.py` với căn cứ đã chọn và khóa Gemini. Trình duyệt giữ lịch sử trong bộ nhớ của tab. F5 hoặc “Bắt đầu lại” xóa lịch sử đó.

## Hợp đồng API

`POST /api/assistant/chat` nhận `Content-Type: application/json`. Trường `history` có thể bỏ qua ở câu hỏi đầu tiên.

```json
{
  "message": "Tui đo được 2,8 g/L ở cống. Giờ cần đo gì thêm?",
  "history": [
    {"role": "user", "text": "Lúa đang làm đòng, tui lo bị mặn."},
    {"role": "model", "text": "Bà con đo mặn ở đâu và được bao nhiêu g/L?"}
  ]
}
```

`message` dài 1–400 ký tự sau khi bỏ khoảng trắng đầu cuối. `history` chứa tối đa 8 tin, theo từng cặp `user`, `model`. Tin từ Cò Mạ dài tối đa 4.096 ký tự. Máy chủ giới hạn body ở 128 KiB.

```json
{
  "data": {
    "reply": "Bà con đo độ mặn ngay tại ruộng, ghi giờ đo và đơn vị của máy nha.",
    "sources": [{
      "source_id": "VU-2022",
      "title": "Vũ Thị Xuân Nhường và cộng sự (2022)",
      "url": "https://vie.vjas.vn/index.php/vjasvn/article/view/1042"
    }]
  },
  "error": null
}
```

Khi có lỗi, trả `{"data":null,"error":"Thông báo cho người dùng"}`.

| HTTP | Trường hợp |
|---|---|
| 200 | Có câu trả lời |
| 400 | JSON hoặc lịch sử sai định dạng, câu hỏi trống hay vượt giới hạn |
| 413 | Nội dung gửi quá lớn |
| 422 | Gemini từ chối tạo câu trả lời |
| 429 | Hết hạn mức Gemini |
| 502 | Lỗi kết nối, phản hồi thiếu nội dung hoặc trích mã nguồn ngoài phần căn cứ đã gửi |
| 503 | Máy chủ chưa cấu hình khóa Gemini hoặc các model được gọi đang quá tải |
| 504 | Gemini hết thời gian chờ |

Server gửi `systemInstruction` và `contents` có căn cứ lên `POST /v1beta/models/gemini-3.5-flash:generateContent`. Khóa `GEMINI_API_KEY` đọc từ biến môi trường hoặc `.env.local` và gửi qua header `x-goog-api-key`. Client dùng mức suy luận `LOW`, giới hạn 2.048 token đầu ra và schema JSON cho `reply`, `source_ids`. [REST generateContent](https://aistudio.google.com/api-reference/generate-content/generate-content)

Trình duyệt chờ tối đa 180 giây và cho phép dừng chờ hoặc gửi lại câu hỏi. Server cấp tối đa 150 giây thời gian chờ cho Gemini 3.5 Flash. Nếu model quá tải, hết thời gian chờ hoặc trả phản hồi chưa hoàn chỉnh, server gọi Gemini 3.1 Flash-Lite một lần trong thời gian còn lại, giữ cùng câu hỏi, lịch sử và căn cứ. [Tài liệu Gemini 3.1 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite)

## Thứ tự triển khai

### 1. Nghiệm thu chat cục bộ

1. Tạo khóa cho dự án demo, cấu hình theo [README](../README.md#bật-gemini-cho-cò-mạ) và khởi động lại Flask.
2. Thử một câu về mặn và một câu hỏi nối tiếp chỉ có nghĩa khi đọc được câu trước. Ví dụ “Lúa ngày 48 đang làm đòng” rồi “Nếu mặn 2,8 g/L đo ở cống thì Cò cần thêm gì?”.
3. Kiểm tra Cò hỏi lại nơi đo, đơn vị hoặc thông tin còn thiếu. Với câu hỏi tỷ lệ cây sống, kiểm tra Cò yêu cầu số đếm trên ô mẫu. Bấm “Bắt đầu lại” và gửi câu mới để kiểm tra ngữ cảnh đã được xóa.
4. Chạy `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`. Bộ test giả lập upstream để kiểm tra request, nội dung hiển thị, payload sai, thiếu cấu hình và hạn mức. Ghi riêng kết quả của lần gọi Google bằng khóa thật.

### 2. Chuẩn bị cho bản demo dùng chung

1. Chốt môi trường chạy và ai được dùng chat. Nếu có đăng nhập thật, xác thực phía Flask theo tài khoản. Nếu phục vụ khách trong hackathon, quản lý quyền vào bản demo và áp hạn mức tại máy chủ hoặc reverse proxy trước khi mở ra Internet. Route chat trên bản cục bộ hiện nhận yêu cầu khách khi đã có khóa.
2. Đặt giới hạn theo người dùng hoặc phiên đã xác thực và giới hạn tổng cho cả dự án. Dùng chung bộ đếm giữa các instance nếu triển khai nhiều worker hoặc máy chủ. Chốt con số theo quota của key demo và số người dùng dự kiến.
3. Ghi mã trạng thái nội bộ, độ trễ và kết quả gọi Gemini để phân biệt lỗi cấu hình, hết hạn mức và timeout. Giữ khóa và nội dung chat ngoài log theo mặc định. Xác nhận trạng thái khi thiếu khóa và hết quota trước buổi demo.
4. Đạt nghiệm thu khi người được phép có thể gửi hai câu liên tiếp, yêu cầu vượt hạn mức được chặn trước khi gọi Google và các lỗi trả được JSON với thông báo tiếng Việt.

### 3. Thêm ngữ cảnh sau khi chat cơ bản chạy ổn

1. Ưu tiên nút “Hỏi Cò về kết quả này” trong mô phỏng. Server lấy đầu vào đã xác thực hoặc kết quả được chọn rồi truyền ngữ cảnh theo cấu trúc gồm giai đoạn, ngày sau gieo, độ mặn, đơn vị, loại điểm đo, độ sâu nước và CHI. Kiểm tra quyền đọc nếu kết quả gắn với tài khoản.
2. Giữ luật mô phỏng trong `simulation_service.py`. Cò Mạ diễn giải đầu ra và yêu cầu dữ liệu bổ sung. Kiểm thử riêng rằng CHI vẫn là điểm sức khỏe trên thang 100, ví dụ được gắn nhãn giả lập và số đo cống vẫn mang đúng loại điểm đo.
3. Khi thêm số đo riêng theo tài khoản hoặc nguồn thời tiết mới, xác định quyền đọc, loại điểm đo và kỳ số liệu trước khi đưa vào căn cứ. Lưu hội thoại sau khi đã chốt tài khoản, thời hạn lưu và hành vi xóa.

## Prompt bàn giao cho AI

```text
Làm việc trong K:\Unihack\Mach-dong trên nhánh feature/AIAssistant.
Đọc K:\Unihack\CONVENTIONS.md, AGENTS.md, README.md, docs/architecture.md
và docs/assistant-backend.md trước khi sửa. Kiểm tra git status để biết
những thay đổi đang có và bảo toàn thay đổi của người dùng.

Mục tiêu là hoàn thiện backend hỏi đáp Cò Mạ qua Flask với Gemini 3.5 Flash.
Đọc luồng /assistant và POST /api/assistant/chat hiện tại cùng các test
trước khi cài đặt thêm. Chọn bước đầu tiên chưa đạt trong kế hoạch.

Giữ controller ở vai trò kiểm tra request và trả {data, error}.
Đặt prompt nông nghiệp trong assistant_service.py và lời gọi Google
trong ai_client.py. Đọc GEMINI_API_KEY phía server. Dữ liệu mô phỏng
mang nhãn giả lập. Giữ đúng loại điểm đo và đơn vị gốc.

Kiểm tra câu hỏi đầu tiên, câu hỏi nối tiếp, tra số liệu cục bộ,
thiếu khóa, payload sai, hết hạn mức và đặt lại cuộc trò chuyện.
Dùng upstream giả lập trong test tự động. Nếu có khóa demo được cấu hình,
thử một cuộc hội thoại ngắn bằng dữ liệu mẫu rồi ghi kết quả.

Nếu task là chạy chung, triển khai kiểm soát truy cập, hạn mức và log
theo mục 2 trước khi công khai route. Nếu task là đọc mô phỏng, làm
mục 3 và giữ engine thuần. Báo rõ tệp đã sửa, test đã chạy và điểm
còn chờ người dùng chốt.
```
