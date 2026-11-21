import { createServer } from "node:http";
import { Readable } from "node:stream";
import {simulationController} from "./worker.mjs";
import {localStorageBindings} from "./local-store.mjs";
import {resolve} from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.MACH_DONG_LOCAL_API_PORT || 8787);
const origin = `http://${host}:${port}`;
const env={...process.env,...localStorageBindings(resolve(process.env.MACH_DONG_LOCAL_STATE || "data/local-preview"))};
const authRateMultiplier=Number(process.env.MACH_DONG_LOCAL_AUTH_RATE_MULTIPLIER || 10);
if(!Number.isInteger(authRateMultiplier) || authRateMultiplier < 1 || authRateMultiplier > 20) throw new Error("Local auth rate multiplier must be an integer from 1 to 20");
env.LOCAL_AUTH_RATE_LIMIT_MULTIPLIER=authRateMultiplier;
const localMail=!env.AUTH_EMAIL_API_KEY;
const mailCodes=new Map();
if(localMail){env.AUTH_EMAIL_API_KEY="local-only-mock";env.AUTH_FROM_EMAIL="Mạch Đồng <admin@machdong.example>";}
const transport=async(url,options)=>{
  if(localMail && url === "https://api.resend.com/emails") {
    const mail=JSON.parse(options.body);mailCodes.set(mail.to[0],mail.text.match(/\b\d{6}\b/)[0]);
    return Response.json({id:"local-mock-email"});
  }
  const response=await fetch(url,options);
  if(url.startsWith("https://generativelanguage.googleapis.com/") && !response.ok){
    const body=await response.clone().json().catch(()=>({}));
    console.error("Local Gemini diagnostic",JSON.stringify({status:response.status,reason:String(body.error?.message || "").replaceAll(env.GEMINI_API_KEY || "[no-key]","[redacted]").slice(0,350)}));
  }
  return response;
};
if(process.env.MACH_DONG_LOCAL_USER_PASSWORD && !await env.DB.prepare("SELECT 1 FROM accounts WHERE username=?").bind("nongho").first()){
  const api=new simulationController(env,transport);
  const request=(path,body)=>new Request(origin+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const email="nongho@machdong.example";
  if(!localMail) throw new Error("Automatic local signup requires the explicitly simulated mailbox");
  await api.handle(request("/api/account/send-otp",{email}));
  const response=await api.handle(request("/api/account/register",{username:"nongho",name:"Nông hộ Mạch Đồng",email,phone:"0900000000",
    password:process.env.MACH_DONG_LOCAL_USER_PASSWORD,otp_code:mailCodes.get(email)}));
  if(response.status!==201) throw new Error("Local user setup failed");
}

const server = createServer(async (incoming, outgoing) => {
  if (incoming.headers.host !== `${host}:${port}`) {
    outgoing.writeHead(421);
    outgoing.end();
    return;
  }
  try {
    if(incoming.url === "/__local/health") {
      outgoing.writeHead(200,{"Content-Type":"application/json"});
      outgoing.end(JSON.stringify({instance:env.MACH_DONG_LOCAL_INSTANCE,pid:process.pid}));
      return;
    }
    const method = incoming.method;
    const request = new Request(origin + incoming.url, {
      method,
      headers: incoming.headers,
      ...(method === "GET" || method === "HEAD"
        ? {}
        : { body: Readable.toWeb(incoming), duplex: "half" }),
    });
    let response;
    try {response = await new simulationController(env,transport).handle(request);}
    catch {response = Response.json({data:null,error:"Dịch vụ cục bộ tạm thời không khả dụng."},{status:503});}
    const rejection=response.headers.get("X-Assistant-Rejection");
    if(rejection) console.error("Local assistant validation",JSON.stringify({reason:rejection}));
    if(localMail && incoming.url === "/api/account/send-otp" && response.ok){
      const body=await response.json();
      response=Response.json({...body,data:{...body.data,smtp_sent:false,dev_otp_code:mailCodes.get(body.data.email),isSimulated:true}});
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (outgoing.headersSent) {
      outgoing.destroy();
      return;
    }
    outgoing.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    outgoing.end(JSON.stringify({ data: null, error: "Yêu cầu dữ liệu không hợp lệ." }));
  }
});
server.listen(port, host, () => console.log(`Mạch Đồng · máy chủ mô phỏng ${origin}`));
