import {referenceFiles} from "./reference.mjs";
import {generateGroundedReply, generationError} from "./generative.mjs";

const reviewedSources = new Map([
  ...JSON.parse(referenceFiles["co-ma-knowledge.json"]).sources.filter(item => item.status === "reviewed"),
  ...JSON.parse(referenceFiles["lua-man-ngap-sources.json"]).sources,
].map(item => [item.source_id,item]));
const assistantRates = new Map();
let assistantInFlight = 0;
const chatInstruction=`Trả lời sát câu hỏi cuối, không dùng một đoạn hướng dẫn chung cho mọi tình huống.
Nếu bà con đã cho số đo, cây, giai đoạn hoặc cách trồng thì sử dụng chúng, không hỏi lại dữ kiện đã có. Khi đổi cây hoặc sửa số đo, ưu tiên thông tin mới; không trộn tình huống cũ.
Với tình huống cần tư vấn: nêu Nhận định: ngắn gọn, rồi Việc nên làm: đánh số tối đa 4 việc theo ưu tiên. Mỗi việc nói rõ làm gì, ở đâu, vì sao và điều kiện áp dụng. Kết thúc bằng Cần kiểm tra thêm: nếu thiếu dữ kiện, và Khi cần hỗ trợ: khi có dấu hiệu đáng lo.
Với câu hỏi đơn giản hoặc yêu cầu tóm tắt, trả lời ngắn đúng yêu cầu, không ép đủ mọi mục. Với câu hỏi vì sao/nói kỹ hơn, giải thích thêm ngữ cảnh ngay trước đó.
Không chỉ lặp lại thông số hay nói “theo dõi sát”. Không đề xuất phun/bón thuốc, phân hay chế phẩm chỉ từ một triệu chứng hoặc số đo mặn/nước; cần căn cứ phù hợp và dữ kiện chẩn đoán. Nếu chưa đủ, đưa cách kiểm tra để ra quyết định thay vì tự chọn thuốc hoặc liều lượng.
Không gọi một số đo mặn đơn lẻ là an toàn, khá an toàn hay tương đối an toàn. Không biến số đo người dùng nêu thành ngưỡng khuyến cáo lấy nước. Không hướng dẫn giữ nguyên mực nước hiện tại/hiện có khi chưa đối chiếu giai đoạn lúa, chiều cao cây, khả năng thoát nước và nguồn cấp; kể cả câu điều kiện “nếu đủ giữ ẩm”. Khi chưa đủ căn cứ, hướng dẫn đánh giá khả năng thoát và chất lượng nguồn cấp trước khi điều chỉnh, không tự chọn mức giữ nước. Không chuyển sang bệnh cây khi bà con chỉ hỏi quản lý nước và chưa mô tả triệu chứng.
Chia đoạn bằng dòng trống, xuống dòng trước từng bước. Không tự đặt một giờ hoặc tần suất can thiệp mà căn cứ không nêu.`;

function assistantResponse(data,status=200,error=null,diagnostic=null) {
  return new Response(JSON.stringify({data,error}),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...(diagnostic ? {"X-Assistant-Rejection":diagnostic} : {})}});
}

function validPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).sort().join(",") !== "messages,sourceIds") return false;
  const {messages,sourceIds} = payload;
  return Array.isArray(messages) && messages.length > 0 && messages.length <= 9 &&
    messages.every((item,index) => item && typeof item === "object" && Object.keys(item).sort().join(",") === "role,text" &&
      item.role === (index % 2 ? "model" : "user") && typeof item.text === "string" && item.text.trim().length > 0 && item.text.length <= (index % 2 ? 4096 : 400)) &&
    messages.at(-1).role === "user" && Array.isArray(sourceIds) && sourceIds.length <= 4 &&
    new Set(sourceIds).size === sourceIds.length && sourceIds.every(id => typeof id === "string" && reviewedSources.has(id));
}

async function limitedBody(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  if (Number(request.headers.get("content-length") || 0) > 98_304) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const parts = []; let length = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 98_304) { await reader.cancel(); return null; }
    parts.push(value);
  }
  try { return JSON.parse(await new Blob(parts).text()); } catch { return null; }
}

export class assistantController {
  constructor(env,fetcher=fetch,userId=null) { this.env=env; this.fetcher=(...args)=>fetcher(...args); this.userId=userId; }

  async handle(request) {
    if (request.method !== "POST") return assistantResponse(null,405,"Dùng POST để hỏi Cò Mạ.");
    const payload = await limitedBody(request);
    if (!validPayload(payload)) return assistantResponse(null,400,"Câu hỏi hoặc nguồn tham khảo chưa hợp lệ.");
    const ip = this.userId || request.headers.get("cf-connecting-ip") || "unknown";
    const now = Date.now();
    for (const [item,rate] of assistantRates) if (rate.until < now) assistantRates.delete(item);
    const rate = assistantRates.get(ip) || {count:0,until:now+60_000};
    if (rate.count >= 12 || assistantInFlight >= 2 || assistantRates.size >= 5000) return assistantResponse(null,429,"Cò Mạ đang nhiều câu hỏi. Bà con thử lại sau một phút nha.");
    rate.count++; assistantRates.set(ip,rate); assistantInFlight++;
    try {
      const sources = payload.sourceIds.map(id => reviewedSources.get(id));
      return assistantResponse(await generateGroundedReply(this.env,this.fetcher,payload.messages,sources,chatInstruction,true,0,true,45000));
    } catch (failure) {
      return assistantResponse(null,failure instanceof generationError ? failure.status : 502,
        failure instanceof generationError ? failure.message : "Cò Mạ chưa nhận được câu trả lời hợp lệ. Bà con thử lại nha.");
    } finally { assistantInFlight--; }
  }
}
