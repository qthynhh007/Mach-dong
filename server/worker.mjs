import catalog from "./data/catalog.json" with {type:"json"};
import history from "./data/weather-history.json" with {type:"json"};
import {simulationError, simulationInput} from "./model.mjs";
import {simulationEngine} from "./engine.mjs";
import {weatherClient} from "./weather.mjs";
import {aiClient} from "./ai.mjs";
import {accountController} from "./auth.mjs";
import {communityController} from "./community.mjs";
import {assistantController} from "./assistant.mjs";
import {referenceFiles} from "./reference.mjs";

const weatherCache = new Map();
const aiRates = new Map();
let aiInFlight = 0;

function jsonResponse(data, status = 200, error = null) {
  return new Response(JSON.stringify({data,error}),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

async function getWeather(locationId, fetcher) {
  const cached = weatherCache.get(locationId);
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok"}).format(new Date());
  if (cached && cached.expiresAt > Date.now() && cached.value.rows[0]?.date === today) return cached.value;
  const value = await new weatherClient(catalog,fetcher).forecast(locationId);
  weatherCache.set(locationId,{value,expiresAt:Date.now()+3_600_000});
  return value;
}

export class simulationController {
  constructor(env, fetcher = fetch) { this.env = env; this.fetcher = fetcher; }
  async handle(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/account/")) return new accountController(this.env,this.fetcher).handle(request);
    if (url.pathname.startsWith("/api/community/")) return new communityController(this.env).handle(request);
    if (url.pathname === "/api/assistant/generate") return new assistantController(this.env,this.fetcher).handle(request);
    if (url.pathname === "/downloads/MachDong.exe") {
      if (request.method !== "GET" && request.method !== "HEAD") return jsonResponse(null,405,"Chỉ hỗ trợ tải tệp.");
      const file = await this.env.BUCKET.get("releases/MachDong-v0.1.1.exe");
      if (!file) return jsonResponse(null,404,"Chưa có bản Windows để tải.");
      return new Response(request.method === "HEAD" ? null : file.body,{headers:{
        "Content-Type":"application/vnd.microsoft.portable-executable",
        "Content-Disposition":"attachment; filename=MachDong.exe",
        "Content-Length":String(file.size),
        "Cache-Control":"public, max-age=3600",
        "X-Content-Type-Options":"nosniff",
        ...(file.httpEtag ? {ETag:file.httpEtag} : {}),
      }});
    }
    if (url.pathname.startsWith("/api/reference/")) {
      const name = url.pathname.slice("/api/reference/".length);
      if (request.method !== "GET" && request.method !== "HEAD") return jsonResponse(null,405,"Chỉ hỗ trợ đọc dữ liệu tham chiếu.");
      if (!Object.hasOwn(referenceFiles,name)) return jsonResponse(null,404,"Không tìm thấy dữ liệu tham chiếu.");
      return new Response(request.method === "HEAD" ? null : referenceFiles[name],{headers:{"Content-Type":name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json; charset=utf-8","Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}});
    }
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Mạch Đồng · Dữ liệu mô phỏng</title><style>body{font:17px system-ui;background:#f4f7f4;color:#163d2b;max-width:850px;margin:8vh auto;padding:24px;line-height:1.7}a{color:#166849}section{background:white;padding:25px;border-radius:20px;margin:20px 0}code{font-size:14px}</style><h1>Mạch Đồng · Dữ liệu mô phỏng lúa</h1><p>API dùng chung cho ứng dụng. Dữ liệu có nguồn, đơn vị và phiên bản; không suy diễn tỷ lệ cây sống khi thiếu dữ liệu kiểm định.</p><section><h2>${catalog.version}</h2><p>${history.rowCount} dòng thời tiết NASA POWER năm ${history.year} tại ${catalog.locations.length} địa điểm đại diện ĐBSCL. Dữ liệu ô lưới, không phải số đo ruộng.</p><p><a href="/api/catalog">Danh mục nguồn và đặc tính OM5451</a> · <a href="/api/datasets/weather-history">Tải dữ liệu lịch sử JSON</a> · <a href="/api/weather?locationId=can-tho">Dự báo Cần Thơ</a> · <a href="/api/health">Trạng thái dịch vụ</a></p></section><section><h2>Giới hạn rõ ràng</h2><p>Mô hình tham chiếu FAO tính ảnh hưởng mặn theo EC nước đất vùng rễ, chưa hiệu chuẩn OM5451. AI chỉ chọn các bằng chứng đã xác minh để giải thích; không tự tạo con số.</p><p>Nguồn: <a href="https://power.larc.nasa.gov/">NASA POWER</a>, <a href="https://open-meteo.com/">Open-Meteo (CC BY 4.0)</a>, FAO, IRRI, Viện Lúa ĐBSCL và các nghiên cứu gốc. API Open-Meteo miễn phí cho mục đích phi thương mại.</p></section></html>`,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      const aiProvider = this.env.AI_PROVIDER || (this.env.GROQ_API_KEY ? "groq" : "gemini");
      const aiConfigured = Boolean(aiProvider === "groq" ? this.env.GROQ_API_KEY : aiProvider === "gemini" && this.env.GEMINI_API_KEY);
      return jsonResponse({status:"ok",dataVersion:catalog.version,aiProvider,aiConfigured,inferenceLocation:"cloud",historyRows:history.rowCount});
    }
    if (request.method === "GET" && url.pathname === "/api/catalog") return jsonResponse({...catalog,history:{version:history.version,year:history.year,rowCount:history.rowCount,retrievedAt:history.retrievedAt,downloadPath:"/api/datasets/weather-history"}});
    if (request.method === "GET" && url.pathname === "/api/datasets/weather-history") return jsonResponse(history);
    if (request.method === "GET" && url.pathname === "/api/weather") return jsonResponse(await getWeather(url.searchParams.get("locationId"),this.fetcher));
    if (url.pathname === "/api/simulation") {
      if (request.method !== "POST") return jsonResponse(null,405,"Dùng POST để gửi kịch bản.");
      if (!request.headers.get("content-type")?.startsWith("application/json")) return jsonResponse(null,415,"Yêu cầu JSON.");
      if (Number(request.headers.get("content-length") || 0) > 8192) return jsonResponse(null,413,"Kịch bản quá lớn.");
      const reader = request.body?.getReader();
      if (!reader) throw new simulationError("Thiếu kịch bản.");
      const parts = []; let length = 0;
      while (true) {
        const {done,value} = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > 8192) { await reader.cancel(); throw new simulationError("Kịch bản quá lớn.",413); }
        parts.push(value);
      }
      let payload;
      try { payload = JSON.parse(await new Blob(parts).text()); } catch { throw new simulationError("JSON không hợp lệ."); }
      const inputs = simulationInput.parse(payload,catalog);
      // Fail closed if the explicitly requested weather source is unavailable.
      const weather = inputs.useWeather ? await getWeather(inputs.locationId,this.fetcher) : null;
      const result = new simulationEngine(catalog).evaluate(inputs,weather);
      result.ai = {status:"notRequested",message:"Có thể nhờ AI chọn các bằng chứng cần chú ý."};
      if (inputs.requestAi) {
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const now = Date.now();
        for (const [key,item] of aiRates) if (item.until < now) aiRates.delete(key);
        const rate = aiRates.get(ip) || {count:0,until:now+60_000};
        if (rate.count >= 3 || aiInFlight >= 2 || aiRates.size >= 5000) {
          result.ai = {status:"rateLimited",message:"Đã đạt giới hạn yêu cầu AI tạm thời. Kết quả mô phỏng vẫn dùng được."};
        } else {
          rate.count++; aiRates.set(ip,rate); aiInFlight++;
          try { result.ai = await new aiClient(this.env,this.fetcher).explain(result); } finally { aiInFlight--; }
        }
      }
      return jsonResponse(result);
    }
    return jsonResponse(null,404,"Không tìm thấy tài nguyên.");
  }
}

export default {async fetch(request,env) {
  try { return await new simulationController(env).handle(request); }
  catch (error) {
    if (!(error instanceof simulationError)) console.error("Simulation service failure",{route:new URL(request.url).pathname,type:error.name,message:error.message});
    return jsonResponse(null,error instanceof simulationError ? error.status : 503,error instanceof simulationError ? error.message : "Dịch vụ tạm thời không khả dụng. Không có kết quả thay thế giả lập.");
  }
}};
