import test from "node:test";
import assert from "node:assert/strict";
import {simulationController} from "../worker.mjs";
import {sessionEnv,sessionHeaders} from "./fixtures/session.mjs";
import {generateGroundedReply} from "../generative.mjs";
import {adviseScenario} from "../advice.mjs";
import catalog from "../data/catalog.json" with {type:"json"};
import {simulationEngine} from "../engine.mjs";
import {simulationInput} from "../model.mjs";

const payload = {messages:[{role:"user",text:"Cà chua trồng ngoài đất cần kiểm tra gì?"}],sourceIds:["KN-TOMATO-PLANT"]};
const answer = {reply:"Bà con kiểm tra khả năng thoát nước của đất trước khi trồng cà chua nha.",source_ids:payload.sourceIds};
const gemini = value=>Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(value)}]}}]});
const ask = (body,fetcher,headers=sessionHeaders) => new simulationController({...sessionEnv,GEMINI_API_KEY:"test-only"},fetcher).handle(new Request("https://example.test/api/assistant/generate",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)}));

test("Cò Mạ generates relevant replies with five consecutive turns",async()=> {
  let sent; const history=[];
  for (let turn=0;turn<5;turn++) {
    const message=turn ? "Vì sao cần kiểm tra như vậy?" : payload.messages[0].text;
    const response=await ask({...payload,messages:[...history,{role:"user",text:message}]},async function(url,options) {
      assert.equal(this,undefined); sent={url,body:JSON.parse(options.body)};
      return gemini({...answer,reply:turn ? "Đất cần thoát nước để rễ cà chua có điều kiện phát triển, bà con đối chiếu tình trạng đất nha." : answer.reply});
    });
    assert.equal(response.status,200); const result=(await response.json()).data;
    assert.deepEqual(result.source_ids,payload.sourceIds);
    assert.equal(sent.body.contents.at(-1).parts[0].text,message);
    assert.equal(sent.body.contents.length,turn*2+1);
    assert.match(sent.url,/generativelanguage.googleapis.com/);
    history.push({role:"user",text:message},{role:"model",text:result.reply});
  }
});

test("unknown sources and unsupported prescriptions are rejected",async()=> {
  assert.equal((await ask({...payload,sourceIds:["fake"]},()=>assert.fail())).status,400);
  for (const bad of [{...answer,source_ids:["fake"]},{...answer,reply:"Bón 900 kg/ha ngay."},{source_ids:payload.sourceIds}])
    assert.equal((await ask(payload,async()=>gemini(bad))).status,502);
});

test("absolute crop safety promises are rejected even with valid source IDs",async()=> {
  const messages=[{role:"user",text:"Độ mặn tại ruộng là 0,5 g/L."}];
  const sources=[{source_id:"rice",finding_vi:"Cần đo tại ruộng và đối chiếu điều kiện canh tác."}];
  await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:"Độ mặn 0,5 g/L hiện tại là an toàn, bảo đảm an toàn tuyệt đối.",source_ids:["rice"]}),messages,sources),error=>error.status===502);
});

test("cautious wording about insufficient evidence is allowed",async()=> {
  const result=await generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:"Chưa đủ dữ liệu để bảo đảm an toàn tuyệt đối. Bà con đo thêm tại ruộng nha.",source_ids:["rice"]}),[{role:"user",text:"Có nên lấy nước?"}],[{source_id:"rice",finding_vi:"Cần đo tại ruộng."}]);
  assert.match(result.reply,/Chưa đủ dữ liệu/);
});

test("cloud routes require a session and CSRF before calling AI",async()=> {
  assert.equal((await ask(payload,()=>assert.fail(),{})).status,401);
  assert.equal((await ask(payload,()=>assert.fail(),{...sessionHeaders,"X-CSRF-Token":"bad"})).status,403);
});

test("Gemini configuration, quota and timeout failures are explicit",async()=> {
  const sources=[{source_id:"source",finding_vi:"Kiểm tra đất."}];
  await assert.rejects(()=>generateGroundedReply({},()=>assert.fail(),payload.messages,sources,"",true),error=>error.status===503);
  await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>new Response("",{status:429}),payload.messages,sources),error=>error.status===429);
  await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>{throw new DOMException("timeout","TimeoutError");},payload.messages,sources),error=>error.status===504);
});

test("temporary Gemini overload retries once on another Gemini model with the same evidence",async()=> {
  const sent=[];
  const result=await generateGroundedReply({GEMINI_API_KEY:"test-only"},async(url,options)=>{
    sent.push({url,body:JSON.parse(options.body)});
    return sent.length===1 ? new Response("",{status:503}) : gemini(answer);
  },payload.messages,[{source_id:payload.sourceIds[0],finding_vi:"Kiểm tra đất."}]);
  assert.equal(sent.length,2);assert.match(sent[1].url,/gemini-2.5-flash/);
  assert.deepEqual(sent[0].body.contents,sent[1].body.contents);
  assert.equal(result.fallbackUsed,true);
});

test("scenario advice sends exact conditions to Gemini and preserves engine output",async()=> {
  const inputs=simulationInput.parse({varietyId:"OM5451",locationId:"can-tho",stage:"flowering",dayAfterSowing:65,salinityGl:2.8,
    salinitySite:"canalWater",waterDepthCm:4.5,plantHeightCm:null,tempMaxC:36,rootZoneEcDsM:null,ecIsSeasonAverage:false,exposureDays:7,useWeather:false,requestAi:false},catalog);
  const result=new simulationEngine(catalog).evaluate(inputs); const before=JSON.stringify(result);
  const advice=await adviseScenario({GEMINI_API_KEY:"test-only",GROQ_API_KEY:"should-not-use"},async(url,options)=>{
    assert.match(url,/generativelanguage.googleapis.com/); const body=JSON.parse(options.body);
    const context=body.contents[0].parts[0].text;
    assert.match(context,/"salinitySite":"canalWater"/); assert.match(context,/"tempMaxC":36/);
    return gemini({reply:"Kịch bản có mực nước 4,5 cm và nhiệt độ 36°C. Lúa đang trổ bông và cần theo dõi nóng. Mặn ở kênh chưa phản ánh nước ruộng. Bà con đo tại ruộng rồi đối chiếu thêm nha.",source_ids:["irri-heat","ctu-om5451"]});
  },result);
  assert.equal(advice.provider,"Gemini"); assert.equal(advice.isSimulated,true);
  assert.equal(JSON.stringify(result),before); assert.deepEqual(advice.inputSnapshot,inputs);
});
