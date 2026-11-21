# Yêu cầu cho AI phụ trách backend của Tín — đồng bộ Cò Mạ và mô phỏng bằng Groq

## Mục tiêu và quyền thực hiện

Hãy sửa và triển khai backend Mạch Đồng hiện có để **trợ lý Cò Mạ, tư vấn kịch bản mô phỏng và AI chọn bằng chứng cùng dùng Groq**. Người dùng tải mã nguồn, chạy giao diện local, đăng nhập và dùng hai tính năng mà không nhập API key. Không dùng Gemini và không đưa khóa bí mật vào GitHub, mã trình duyệt hoặc EXE.

Người dùng đã xác nhận backend của Tín chính là:

- URL: `https://mach-dong-rice-data.artfulmica6.chatgpt.site`
- Sites project ID: `appgprj_6afcfbe9375c8191af0a348ebb094ff8`
- Repository: `https://github.com/qthynhh007/Mach-dong`
- Branch bàn giao: `codex/shared-ai-no-key`
- Nguồn backend ở `server/`; manifest ở `server/.openai/hosting.json`.

Hãy dùng tài khoản sở hữu hoặc có quyền editor trên Site này. Môi trường của AI phía frontend chỉ đọc được metadata công khai; thao tác lấy write credential/cấu hình secret trả `Sites project not found`, nên chưa thể tự deploy. Không tạo Site mới hoặc thay URL mà chưa thống nhất với frontend.

## Việc đã chuẩn bị trên branch

- Frontend Flask mặc định chạy giao diện local và dùng cùng HTTPS origin cho AUTH, COMMUNITY, REFERENCE, ASSISTANT, SIMULATION. Không cần Node.js/API key trên máy giám khảo trong chế độ shared.
- `src/services/shared_runtime.py` xóa khóa provider khỏi cấu hình Flask đang phục vụ, giữ một backend origin duy nhất. Phiên tài khoản cloud được chuyển qua Bearer token và CSRF.
- `server/assistant.mjs`: chat chuyển sang Groq qua `generateGroundedReply`.
- `server/advice.mjs`: tư vấn dùng cùng hàm Groq, tính mô phỏng/căn cứ trên server trước khi tư vấn.
- `server/generative.mjs`: chỉ gọi `https://api.groq.com/openai/v1/chat/completions`; dùng JSON Schema strict, nguồn cho phép và tối đa một lần retry trên cùng provider. Đã bỏ đường gọi Gemini.
- `server/ai.mjs`: phần AI chọn bằng chứng trong mô phỏng cũng chỉ dùng Groq.
- `server/worker.mjs`: health khai báo đúng Groq và trạng thái hai tính năng.
- Đã có tests cho Groq-only, hội thoại tiếp nối, bảo toàn snapshot, chặn nguồn bịa, lỗi quota, retry và không quay về Gemini.

Kiểm tra trên bản bàn giao: **94 tests Node/backend/frontend qua**, 9 tests Python liên quan khởi động/proxy qua, Worker build và syntax check qua. Build Worker không chứa `generativelanguage.googleapis.com`; không phát hiện secret local trong các tệp thay đổi. Các test provider dùng phản hồi giả, **chưa gọi Groq thật và chưa deploy cloud** vì môi trường frontend không có Groq key/quyền Sites.

Đọc `CONVENTIONS.md`, `AGENTS.md`, `docs/architecture.md` và code hiện tại trước khi sửa. Nhận toàn bộ bản mới nhất của branch; không lấy riêng một tệp rồi bỏ các module đi cùng. Giữ các sửa CSS và giao diện hiện có.

## Cấu hình trên server của Tín

Đặt runtime variables của **Site hiện tại**:

```dotenv
AI_PROVIDER=groq
GROQ_MODEL=openai/gpt-oss-20b
```

Đặt `GROQ_API_KEY` thành **secret** trong cấu hình server, dùng khóa hợp lệ/còn hạn mức. Nếu Site đã có secret Groq thì giữ lại và xác minh nó còn dùng được. Không cần gửi khóa cho người dùng cuối hoặc AI frontend. Không bật lại Gemini để xử lý lỗi Groq. Giữ các secret tài khoản/email đang hoạt động.

`openai/gpt-oss-20b` hỗ trợ strict JSON Schema theo [tài liệu Groq](https://console.groq.com/docs/structured-outputs). Cả ba tính năng phải dùng cùng `GROQ_MODEL` từ môi trường; không đặt model riêng trong từng route.

## Hợp đồng API cần giữ khớp frontend

### 1. Trợ lý Cò Mạ

Trình duyệt gọi Flask local `POST /api/assistant/chat`; Flask gửi lên backend của Tín:

```http
POST /api/assistant/generate
Authorization: Bearer <phiên tài khoản Mạch Đồng>
X-CSRF-Token: <CSRF của phiên>
Content-Type: application/json
```

```json
{
  "messages": [
    {"role": "user", "text": "Lúa đang làm đòng, cần kiểm tra gì trước khi lấy nước?"},
    {"role": "model", "text": "Bà con cần đo mặn tại nguồn cấp và trong ruộng riêng nha."},
    {"role": "user", "text": "Vì sao cần đo cả hai nơi?"}
  ],
  "sourceIds": []
}
```

Giữ tên `messages`, `sourceIds`, `role`, `text`. Lịch sử dùng `user`/`model`; khi gọi Groq, chuyển `model` thành `assistant`. Xác minh tối đa 9 lượt, thứ tự luân phiên và lượt cuối là user, câu hỏi tối đa 400 ký tự, câu trả lời trong lịch sử tối đa 4096, tối đa 4 nguồn trong thư viện đã duyệt.

Phản hồi thành công phải có cấu trúc:

```json
{
  "data": {
    "reply": "Bà con đo riêng để đối chiếu nguồn cấp với điều kiện thực tế trong ruộng.",
    "source_ids": [],
    "provider": "Groq",
    "model": "openai/gpt-oss-20b"
  },
  "error": null
}
```

`reply` là văn bản thuần tối đa 4096 ký tự. `source_ids` chỉ chứa nguồn có trong `sourceIds` của request. Cho phép kiến thức chung khi thiếu tài liệu nhưng phải ghi rõ, không tự tạo URL/nguồn. Không trả reasoning nội bộ của model cho người dùng.

### 2. Tư vấn mô phỏng

Flask local gửi thẳng kịch bản đến `POST /api/simulation/advice` trên backend, với Bearer/CSRF như trên:

```json
{
  "varietyId": "OM5451",
  "locationId": "can-tho",
  "stage": "panicle",
  "dayAfterSowing": 48,
  "salinityGl": 2.8,
  "salinitySite": "fieldWater",
  "waterDepthCm": 4.5,
  "plantHeightCm": null,
  "tempMaxC": 28.5,
  "rootZoneEcDsM": null,
  "ecIsSeasonAverage": false,
  "exposureDays": 7,
  "useWeather": false,
  "requestAi": false
}
```

Validate bằng `simulationInput`, chạy engine deterministic phía server, rồi gửi kết quả/căn cứ đó cho Groq. Giữ nguyên các trường phản hồi mà UI dùng: `reply`, `provider`, `model`, `sources`, `source_ids`, `inputSnapshot`, `engineVersion`, `isSimulated: true`, `isFallback: false`, `limitation`. `inputSnapshot` phải khớp kịch bản đã chuẩn hóa. Không để AI tự sửa kết quả engine hoặc biến mặn kênh thành mặn ruộng.

Lời tư vấn cần bốn mục: **Điều kiện đáng chú ý**, **Việc nên làm**, **Cần đo thêm**, **Khi nào cần nhờ cán bộ nông nghiệp**. Dùng lời thật từ Groq, không lấy câu trả lời mẫu để báo thành công. Với `useWeather=true`, frontend chạy mô phỏng có dự báo trước; nếu cache dự báo thiếu/hết hạn thì giữ lỗi 409 yêu cầu chạy lại.

`POST /api/simulation` vẫn lập báo cáo deterministic khi không gọi AI; `requestAi=true` chỉ nhờ Groq chọn các evidence ID đã có, không sinh số liệu dự đoán mới.

### 3. Health

`GET /api/health` công khai phải trả envelope `{data,error}` với:

```json
{
  "data": {
    "status": "ok",
    "apiRevision": "shared-ai-v1",
    "aiProvider": "groq",
    "aiConfigured": true,
    "aiFeatures": {"chat": true, "scenarioAdvice": true}
  },
  "error": null
}
```

Có thể giữ metadata khác hiện có. Không trả key, token hoặc secret. Health chỉ xác nhận cấu hình; phải gọi hai API thật mới xác nhận Groq còn quyền/hạn mức.

## Triển khai

1. Nhận mã mới nhất từ `codex/shared-ai-no-key` và đọc diff. Giữ Site ID, audience, dữ liệu D1/R2 và tài khoản hiện có.
2. Lấy write credential bằng Sites trong tài khoản có quyền; mở checkout nguồn của chính Site bằng workflow nguồn Sites. Đồng bộ nguồn `server/` vào checkout, không copy `.git`, secret, dữ liệu người dùng hoặc `dist` cũ. Nếu có migration D1 còn thiếu thì kiểm tra và áp dụng đúng migration; không xóa/reseed dữ liệu đang dùng.
3. Cấu hình secret Groq trên server như trên.
4. Tại thư mục backend chạy:

```bash
node --test tests/*.test.mjs
node build.mjs
node --check dist/server/index.js
```

5. Đẩy nguồn chính xác lên source repository của Site, đóng gói build output bằng workflow Sites, lưu version từ đúng SHA đã push rồi deploy version đó. Chờ trạng thái `succeeded`. Chỉ build local hoặc push GitHub chưa phải deploy cloud.

## Tiêu chí nghiệm thu bắt buộc

- Health live báo Groq, `shared-ai-v1` và cả hai `aiFeatures=true`.
- Checkout mới không có `.env.local`, không có Groq/Gemini key: mở giao diện local và đăng nhập bằng tài khoản cloud hợp lệ. Không dùng token từ tài khoản SQLite full-local của máy khác.
- Gửi câu hỏi chat thật và một câu hỏi tiếp nối: HTTP 200, lời đáp sát ngữ cảnh, nguồn hợp lệ, UI hiển thị được.
- Nhập kịch bản mẫu trên, chạy báo cáo rồi nhấn Nhờ Cò Mạ tư vấn: HTTP 200, `provider=Groq`, snapshot khớp, các mục tư vấn hiển thị đúng.
- Thử nguồn mặn `canalWater`: lời đáp không tự gọi đó là mặn ruộng.
- Thiếu/sai phiên → 401, sai CSRF → 403; thiếu Groq key → không báo AI thành công; Groq 429 → trả lỗi quota, không gọi Gemini. Lời đáp không hợp lệ được retry tối đa một lần trên Groq rồi báo lỗi thật.
- Không có request tới `generativelanguage.googleapis.com` trong hai luồng. Không có provider key trong GitHub/build client/log/phản hồi HTTP.
- Mở lại CSV, diễn đàn, hồ sơ để bảo đảm cập nhật backend không làm hỏng các API cũ.

## Báo cáo khi bàn giao lại

Ghi rõ branch/commit nguồn, saved version, deployment ID, URL live, thời điểm kiểm tra, kết quả health, mã HTTP của chat/tư vấn thật và kết quả kiểm thử từ máy không có key. Không ghi key, mật khẩu, Bearer token hoặc CSRF vào báo cáo. Nếu còn thiếu quyền/secret/quota, báo chính xác phần chặn; không xác nhận hoàn tất chỉ dựa trên tests dùng phản hồi giả.
