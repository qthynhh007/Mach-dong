import {referenceFiles} from "./reference.mjs";
import {generateGroundedReply, generationError} from "./generative.mjs";

const reviewedSources = new Map([
  ...JSON.parse(referenceFiles["co-ma-knowledge.json"]).sources.filter(item => item.status === "reviewed"),
  ...JSON.parse(referenceFiles["lua-man-ngap-sources.json"]).sources,
].map(item => [item.source_id,item]));
const assistantRates = new Map();
let assistantInFlight = 0;

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
  if (Number(request.headers.get("content-length") || 0) > 32_768) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const parts = []; let length = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 32_768) { await reader.cancel(); return null; }
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
      return assistantResponse(await generateGroundedReply(this.env,this.fetcher,payload.messages,sources,"",true,0,true));
    } catch (failure) {
      return assistantResponse(null,failure instanceof generationError ? failure.status : 502,
        failure instanceof generationError ? failure.message : "Cò Mạ chưa nhận được câu trả lời hợp lệ. Bà con thử lại nha.");
    } finally { assistantInFlight--; }
  }
}
