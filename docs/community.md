# Module Cộng đồng — diễn đàn hỏi đáp

Module dùng giao diện diễn đàn đã có ở `/forum`. Kho CSV tại `/community` được giữ nguyên. Chạy từ thư mục dự án:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe main.py
```

Mở http://127.0.0.1:5000/forum. Bài viết được lưu trên Site công khai của nhóm, nên các máy dùng cùng diễn đàn. Máy cần Internet để đăng hoặc xem bài.

## Các lớp và trách nhiệm

| Tầng | File/lớp | Trách nhiệm |
|---|---|---|
| View | `src/views/forum/` và `src/static/forum.js` | Giữ bố cục cũ, nhận thao tác, hiển thị kết quả API bằng `textContent` |
| View OOP | `communityApi`, `communityView`, `communityFeedView`, `communityComposeView`, `communityDetailView` | Gửi HTTP, danh sách, soạn bài, chi tiết và cây trả lời |
| Controller | `src/controllers/community_controller.py` / `communityController` | Đọc request/session, xác thực CSRF, gọi service, trả HTML hoặc `{data, error}` |
| Service | `src/services/cloud_community_service.py` / `CloudCommunityService` | Gửi yêu cầu HTTPS và chuyển lỗi máy chủ về giao diện |
| Model cloud | `server/community.mjs` / `communityController` | Kiểm tra phiên, quyền, nội dung, ảnh, phiên bản; truy vấn D1 và lưu ảnh R2 |
| Model thử nghiệm | `src/models/community.py` / `communityModel`, `communityStore` | SQLite chỉ chạy trong bộ kiểm thử cục bộ |
| Khởi tạo | `src/main.py` / `createApp` | Tạo model/service theo từng app, đăng ký controller; `create_app` là alias tương thích |

Luồng phát hành: **View → Flask Controller → CloudCommunityService → Worker Controller → D1/R2**, kết quả đi ngược về View. Worker là ranh giới tin cậy: không lấy danh tính tác giả từ JSON của trình duyệt. `communityService` và `communityModel` vẫn kiểm tra hành vi trong bộ thử cục bộ.

`forum_controller.py` chỉ xuất Blueprint `forum` từ `communityController` để các liên kết `url_for('forum.index')` đang có tiếp tục hoạt động. `forum_service.py` hiện chỉ chứa danh mục chủ đề và dữ liệu mẫu ban đầu.

## Chức năng và quy tắc

- Bài viết: tạo, xem, sửa, xóa; chủ đề, giống lúa, giai đoạn, tiêu đề tối đa 120 ký tự và nội dung tối đa 5.000 ký tự. Chỉ tác giả được sửa/xóa. Xóa bài xóa cả chuỗi trao đổi và lượt hữu ích liên quan.
- Ảnh: chọn/kéo thả JPG, PNG, WebP tối đa 5 MB mỗi tệp, tối đa 4 ảnh. Trình duyệt thu nhỏ thành JPEG tối đa 800 px; ảnh đi qua API và lưu vào R2. D1 chỉ lưu URL ảnh, không lưu chuỗi base64.
- Bản nháp: riêng cho từng thành viên, lưu bằng nút “Lưu bản nháp”, tự khôi phục khi mở `/forum/new`; hỗ trợ xóa. Bản nháp cho bài mới, không dùng chung với màn hình sửa bài. Trang cảnh báo trước khi rời đi nếu có thay đổi chưa lưu.
- Hỏi đáp: trả lời trực tiếp bài hoặc trả lời một câu trước đó, tối đa 5 cấp lồng. Chỉ cho phép nối các câu trả lời trong cùng bài. Nội dung tối đa 5.000 ký tự.
- Sửa/xóa câu trả lời: chỉ tác giả. Xóa mềm, giữ vị trí trong cây để không mất các trao đổi bên dưới; nội dung bị xóa không còn được trả về.
- Hữu ích: bài và câu trả lời đều có nút đánh dấu/bỏ đánh dấu. Mỗi thành viên chỉ có một lượt cho mỗi nội dung, không tự bình chọn; `PUT` lặp lại không cộng thêm.
- Giải đáp: chủ bài chọn tối đa một câu trả lời trực tiếp. Có thể đổi hoặc bỏ chọn. Câu được chọn xuất hiện đầu chuỗi. Nếu câu đó bị tác giả xóa, trạng thái giải đáp được bỏ.
- Tìm kiếm: tiêu đề, nội dung, tác giả, địa phương và giống lúa; không phân biệt hoa/thường hoặc dấu tiếng Việt. Bộ lọc chủ đề, chưa có câu trả lời trực tiếp, đã giải đáp, bài của tôi. Sắp xếp mới nhất/cũ nhất/hữu ích nhất; phân trang mặc định 10, tối đa 30 bài.
- Chống ghi đè: sửa/xóa bài, sửa/xóa câu trả lời, chọn giải đáp và thay đổi bản nháp phải gửi `version` đang đọc. Trả `409` nếu dữ liệu đã đổi ở cửa sổ khác. Bản nháp giữ số phiên bản tăng cả khi xóa để cửa sổ cũ không ghi đè bản mới.
- Chống gửi trùng: tạo bài/câu trả lời có `requestId` do View sinh. Gửi lại cùng mã với cùng thành viên trả về nội dung đã tạo; khi tạo nội dung khác phải dùng mã mới.
- Cập nhật thảo luận bằng nút “Tải trao đổi mới”. Chưa dùng WebSocket hoặc đồng bộ thời gian thực.

Bài mẫu và số lượt hữu ích mẫu có nhãn “Dữ liệu mẫu”. Chỉ seed một lần khi tạo kho dữ liệu; không khôi phục bài mẫu đã xóa. Bài người dùng mới không được gắn nhãn giả lập. Lượt hữu ích và câu được chọn là phản hồi cộng đồng, không phải phê duyệt chất lượng dữ liệu hay cấp simulation credits.

## Nối phần đăng nhập của Tân

Trong bản phát hành, khách chưa đăng nhập chỉ xem bài; thao tác ghi cần tài khoản cloud. Danh tính tác giả và CSRF được Worker xác minh bằng phiên tài khoản. Các ví dụ cấu hình bên dưới chỉ dành cho thử nghiệm SQLite độc lập.

Cách đơn giản: sau khi phần đăng nhập đã kiểm tra tài khoản thành công, đặt session **ở phía server**:

```python
from flask import session

session.clear()
session["userId"] = user.id
session["displayName"] = user.displayName
session["location"] = user.location
```

Controller tạo định danh nội bộ `user:<userId>`. Khi đăng xuất gọi `session.clear()`. Tải lại trang diễn đàn sau đăng nhập/đăng xuất để nhận danh tính và CSRF mới. Luồng `/login` và `/register` của Mạch Đồng dùng cookie phiên riêng và được diễn đàn nhận diện mặc định.

Nếu dùng Flask-Login hoặc cơ chế khác, truyền callback đọc người dùng đã xác thực:

```python
from src.main import createApp
from src.models.community import communityMember

def resolveCommunityMember() -> communityMember | None:
    # Lấy currentUser từ hệ thống đăng nhập đã xác thực của nhóm.
    currentUser = authService.getCurrentUser()
    if currentUser is None:
        return None
    return communityMember(
        id="user:" + str(currentUser.id),
        displayName=currentUser.displayName,
        location=currentUser.location,
    )

app = createApp({
    "COMMUNITY_IDENTITY_PROVIDER": resolveCommunityMember,
    "COMMUNITY_ALLOW_GUESTS": False,
})
```

`authService` trong ví dụ là service đăng nhập do Tân cung cấp. Callback được gọi trong request, phải trả về `communityMember` hoặc `None`. Khi có callback, controller không dùng adapter session mặc định. Tắt khách bằng cấu hình trên hoặc biến môi trường `COMMUNITY_ALLOW_GUESTS=0`: khách vẫn đọc được diễn đàn, thao tác ghi trả `401`.

## Cấu hình và lưu trữ

| Cấu hình | Mặc định | Ý nghĩa |
|---|---|---|
| `COMMUNITY_API_URL` | Site Mạch Đồng | HTTPS đến kho diễn đàn cloud; bắt buộc trong bản phát hành |
| `COMMUNITY_DATABASE` | `data/community.sqlite3` | Chỉ dùng khi kiểm thử với `COMMUNITY_API_URL=""` |
| `COMMUNITY_ALLOW_GUESTS` | `False` | Chỉ dùng khi kiểm thử SQLite độc lập |
| `COMMUNITY_SEED_SAMPLES` | `True` | Đặt `False` trong `createApp({...})` nếu muốn cơ sở dữ liệu mới trống |
| `COMMUNITY_IDENTITY_PROVIDER` | `None` | Mặc định dùng phiên Mạch Đồng hoặc danh tính từ Flask session. Có thể truyền callback riêng |
| `SECRET_KEY` | Biến môi trường hoặc khóa tự sinh cục bộ | Khóa ký session; khóa cục bộ lưu tại `.community-secret` cạnh tệp SQLite |

Trên cloud, D1 có các bảng `community_members`, `community_posts`, `community_replies`, `community_post_votes`, `community_reply_votes`, `community_drafts`, `community_metadata`. R2 giữ ảnh. Ràng buộc duy nhất ngăn trùng lượt hữu ích và `requestId`.

Tệp SQLite thử nghiệm và khóa phiên không được đưa vào Git. Khi chạy HTTPS, đặt `SESSION_COOKIE_SECURE=True`. `HttpOnly` và `SameSite=Lax` đã bật. Diễn đàn cloud chưa có kiểm duyệt nội dung hay giới hạn tốc độ theo tài khoản; cần bổ sung trước khi mở rộng lượng người dùng lớn.

## API

Tiền tố `/api/community`. Mọi phản hồi có dạng `{ "data": ..., "error": null }` hoặc `{ "data": null, "error": "Thông báo tiếng Việt" }`. Các yêu cầu ghi dùng JSON và header `X-CSRF-Token` lấy từ `GET /session`; gửi cookie cùng request. API CSV xem trước hiện có vẫn dùng multipart.

| Phương thức | Đường dẫn | Nội dung |
|---|---|---|
| GET | `/session` | Thành viên hiện tại, CSRF, danh mục chủ đề |
| GET | `/posts` | Danh sách; query `q`, `topic`, `sort`, `status`, `mine=1`, `page`, `pageSize` |
| POST | `/posts` | `title`, `body`, `topic`, `cultivar`, `stage`, `photos`, `requestId`; `draftVersion` để xóa đúng bản nháp đã đăng |
| GET | `/posts/<postId>` | `post` và danh sách `replies` có `parentId`; View dựng cây |
| PATCH | `/posts/<postId>` | Toàn bộ trường bài viết và `version` |
| DELETE | `/posts/<postId>` | `version` |
| PUT | `/posts/<postId>/vote` | `active: true/false` |
| POST | `/posts/<postId>/replies` | `body`, `parentId` tùy chọn, `requestId` |
| PATCH | `/posts/<postId>/replies/<replyId>` | `body`, `version` |
| DELETE | `/posts/<postId>/replies/<replyId>` | `version` |
| PUT | `/posts/<postId>/replies/<replyId>/vote` | `active: true/false` |
| PUT | `/posts/<postId>/accepted-reply` | `replyId` hoặc `null` để bỏ chọn, `version` của bài |
| GET | `/draft` | `payload`, `version`, thời gian lưu nếu có |
| PUT | `/draft` | Trường bài viết và `version`; cho phép tiêu đề/nội dung rỗng |
| DELETE | `/draft` | `version`; phản hồi trả phiên bản mới |

`sort`: `newest`, `oldest`, `helpful`. `status`: rỗng, `unanswered`, `solved`. ID bài và câu trả lời là UUID; ID bài mẫu giữ nguyên. `201` khi tạo, `400` khi dữ liệu sai, `401` khi thiếu đăng nhập, `403` khi không có quyền/CSRF sai, `404` khi không tìm thấy, `409` khi phiên bản cũ, `413` khi quá dung lượng, `415` khi không gửi JSON.

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --check src/static/forum.js
```

`tests/test_community.py` dùng các tệp SQLite tạm và nhiều test client, kiểm tra lưu bền, quyền tác giả, ảnh lỗi, CSRF, tìm kiếm/phân trang, bản nháp riêng, trả lời chéo bài, xóa mềm, chọn giải đáp, chống gửi trùng và ghi đồng thời. Các kiểm thử CSV, mô phỏng và render màn hình cũ vẫn chạy cùng bộ kiểm thử.
