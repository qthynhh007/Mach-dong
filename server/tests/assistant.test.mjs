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

test("questions outside the files call Gemini without inventing citations",async()=> {
  let sent;
  const response=await ask({messages:[{role:"user",text:"Vì sao cây thanh long cần trụ đỡ?"}],sourceIds:[]},async(url,options)=>{
    sent=JSON.parse(options.body); assert.match(url,/generativelanguage.googleapis.com/);
    return gemini({reply:"Thanh long có thân leo nên cần trụ để nâng đỡ tán, giúp cây nhận ánh sáng và thuận tiện chăm sóc.",source_ids:[]});
  });
  assert.equal(response.status,200);
  const data=(await response.json()).data;
  assert.equal(data.answer_basis,"general_knowledge"); assert.deepEqual(data.source_ids,[]);
  assert.match(sent.systemInstruction.parts[0].text,/kiến thức chung/);
});

test("four long Vietnamese answers still allow the next conversation turn",async()=> {
  const messages=[];
  for(let i=0;i<4;i++) messages.push({role:"user",text:"Lúa đang làm đòng, cần kiểm tra gì?"},{role:"model",text:"ắ".repeat(4000)});
  messages.push({role:"user",text:"Tóm tắt những việc nên làm."});
  const response=await ask({...payload,messages},async()=>gemini(answer));
  assert.equal(response.status,200);
});

test("scenario generation still rejects an unsupported answer without citations",async()=> {
  await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:"Cây cần có trụ đỡ.",source_ids:[]}),payload.messages,[]),error=>error.status===502);
});

test("general knowledge remains available with irrelevant documents and a model retry",async()=> {
  let calls=0;
  const result=await generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>{
    calls++;
    return calls===1 ? new Response("",{status:503}) : gemini({reply:"Thanh long có thân leo và cần trụ nâng đỡ. Đây là kiến thức chung từ AI.",source_ids:[]});
  },[{role:"user",text:"Thanh long cần trụ vì sao?"}],[{source_id:"tomato",finding_vi:"Cà chua cần thoát nước."}],"",true,0,true);
  assert.equal(calls,2); assert.equal(result.answer_basis,"general_knowledge");
  assert.deepEqual(result.source_ids,[]); assert.equal(result.fallbackUsed,true);
});

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

test("a single salinity reading cannot be called fairly safe",async()=> {
  const messages=[{role:"user",text:"Tôi đo mặn ruộng 0,5 g/L."}],sources=[{source_id:"rice",finding_vi:"Cần đo nguồn cấp và đối chiếu điều kiện ruộng."}];
  for(const qualifier of ["mức khá","tương đối","mức hoàn toàn","mức mặn thấp và"]) {
    await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:`Độ mặn 0,5 g/L tại ruộng là ${qualifier} an toàn cho lúa đang trổ bông.`,source_ids:["rice"]}),messages,sources),error=>error.status===502);
  }
});

test("a cautious sentence may quote a decimal salinity reading",async()=> {
  const result=await generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:"Chưa đủ dữ liệu để kết luận mức 0.5 g/L tại ruộng là mức khá an toàn. Bà con đo nguồn cấp trước nha.",source_ids:["rice"]}),[{role:"user",text:"Mặn ruộng 0.5 g/L."}],[{source_id:"rice",finding_vi:"Đo tại ruộng."}]);
  assert.match(result.reply,/Chưa đủ dữ liệu/);
});

test("cloud routes require a session and CSRF before calling AI",async()=> {
  assert.equal((await ask(payload,()=>assert.fail(),{})).status,401);
  assert.equal((await ask(payload,()=>assert.fail(),{...sessionHeaders,"X-CSRF-Token":"bad"})).status,403);
});

test("a measured water depth is not evidence for maintaining that depth",async()=> {
  const messages=[{role:"user",text:"Nước ruộng đang sâu 36 cm, cây cao 90 cm."}],sources=[{source_id:"rice",finding_vi:"Đối chiếu giai đoạn cây và khả năng thoát nước."}];
  for(const reply of ["Duy trì mực nước hiện tại (36 cm) để bảo vệ lúa.","Nếu mực nước 36 cm vẫn đủ giữ ẩm, bà con nên giữ nguyên mực nước hiện tại.","Giữ mực nước hiện có để bảo vệ bộ rễ."]) {
    await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>gemini({reply,source_ids:["rice"]}),messages,sources,"",true,0,true),error=>error.status===502);
  }
});

test("a rejected recommendation is regenerated with specific corrective guidance",async()=> {
  let calls=0;
  const result=await generateGroundedReply({GEMINI_API_KEY:"test-only"},async(url,options)=>{
    calls++;
    if(calls===1) return gemini({reply:"Giữ mực nước 36 cm để làm lớp đệm nhiệt.",source_ids:["rice"]});
    assert.match(JSON.parse(options.body).systemInstruction.parts[0].text,/không lấy số đo hiện tại làm mức khuyến cáo/);
    return gemini({reply:"Đối chiếu chiều cao cây và khả năng thoát nước trước khi điều chỉnh nước; tránh lấy thêm nước chưa đo mặn.",source_ids:["rice"]});
  },[{role:"user",text:"Nước sâu 36 cm."}],[{source_id:"rice",finding_vi:"Đối chiếu giai đoạn cây và khả năng thoát nước."}],"",true,0,true);
  assert.equal(calls,2);assert.equal(result.fallbackUsed,true);
});

test("Gemini configuration, quota and timeout failures are explicit",async()=> {
  const sources=[{source_id:"source",finding_vi:"Kiểm tra đất."}];
  await assert.rejects(()=>generateGroundedReply({},()=>assert.fail(),payload.messages,sources,"",true),error=>error.status===503);
  await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>new Response("",{status:429}),payload.messages,sources),error=>error.status===429);
  await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>{throw new DOMException("timeout","TimeoutError");},payload.messages,sources),error=>error.status===504);
});

test("default retry uses the working primary model instead of an unavailable legacy model",async()=> {
  const sent=[];
  const result=await generateGroundedReply({GEMINI_API_KEY:"test-only"},async(url,options)=>{
    sent.push({url,body:JSON.parse(options.body)});
    return sent.length===1 ? new Response("",{status:503}) : gemini(answer);
  },payload.messages,[{source_id:payload.sourceIds[0],finding_vi:"Kiểm tra đất."}]);
  assert.equal(sent.length,2);assert.match(sent[1].url,/gemini-3.5-flash/);
  assert.deepEqual(sent[0].body.contents,sent[1].body.contents);
  assert.equal(result.fallbackUsed,true);
});

test("Gemini retries one transient failure even when fallback is the same model",async()=> {
  let calls=0;
  const result=await generateGroundedReply({GEMINI_API_KEY:"test-only",GEMINI_MODEL:"gemini-2.5-flash",GEMINI_FALLBACK_MODEL:"gemini-2.5-flash"},async()=>{
    calls++;
    return calls===1 ? new Response("",{status:503}) : gemini(answer);
  },payload.messages,[{source_id:payload.sourceIds[0],finding_vi:"Kiểm tra đất."}]);
  assert.equal(calls,2);assert.equal(result.fallbackUsed,true);
});

test("repeated Gemini overload stops after one retry and quota errors are not retried",async()=> {
  for(const status of [503,429]) {
    let calls=0;
    await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only"},async()=>{calls++;return new Response("",{status});},payload.messages,[]),error=>error.status===status);
    assert.equal(calls,status===503 ? 2 : 1);
  }
});

test("an explicitly enabled alternate model handles quota without retrying the exhausted model",async()=> {
  const sent=[];
  const result=await generateGroundedReply({GEMINI_API_KEY:"test-only",GEMINI_FALLBACK_MODEL:"gemini-3.1-flash-lite",GEMINI_QUOTA_FALLBACK:"1"},async(url,options)=>{
    sent.push({url,body:JSON.parse(options.body)});
    return sent.length===1 ? new Response("",{status:429}) : gemini(answer);
  },payload.messages,[{source_id:payload.sourceIds[0],finding_vi:"Kiểm tra đất."}]);
  assert.equal(sent.length,2);assert.match(sent[1].url,/gemini-3.1-flash-lite/);
  assert.deepEqual(sent[0].body.contents,sent[1].body.contents);assert.equal(result.fallbackUsed,true);
});

test("quota fallback remains bounded and requires an enabled distinct model",async()=> {
  for(const options of [{},{GEMINI_FALLBACK_MODEL:"gemini-3.1-flash-lite"},{GEMINI_QUOTA_FALLBACK:"1"},{GEMINI_QUOTA_FALLBACK:"1",GEMINI_FALLBACK_MODEL:"gemini-3.1-flash-lite"}]) {
    let calls=0;
    await assert.rejects(()=>generateGroundedReply({GEMINI_API_KEY:"test-only",...options},async()=>{calls++;return new Response("",{status:429});},payload.messages,[]),error=>error.status===429);
    assert.equal(calls,options.GEMINI_QUOTA_FALLBACK && options.GEMINI_FALLBACK_MODEL ? 2 : 1);
  }
});

test("scenario advice prioritizes Groq when configured and falls back to Gemini",async()=> {
  const inputs=simulationInput.parse({varietyId:"OM5451",locationId:"can-tho",stage:"flowering",dayAfterSowing:65,salinityGl:2.8,
    salinitySite:"canalWater",waterDepthCm:4.5,plantHeightCm:null,tempMaxC:36,rootZoneEcDsM:null,ecIsSeasonAverage:false,exposureDays:7,useWeather:false,requestAi:false},catalog);
  const result=new simulationEngine(catalog).evaluate(inputs); const before=JSON.stringify(result);
  const advice=await adviseScenario({GROQ_API_KEY:"test-groq",GEMINI_API_KEY:"should-not-use"},async(url,options)=>{
    assert.equal(url,"https://api.groq.com/openai/v1/chat/completions"); const body=JSON.parse(options.body);
    const context=body.messages.find(m=>m.role==="user").content;
    assert.match(context,/"salinitySite":"canalWater"/); assert.match(context,/"tempMaxC":36/);
    return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify({reply:"Kịch bản có mực nước 4,5 cm và nhiệt độ 36°C. Lúa đang trổ bông và cần theo dõi nóng. Mặn ở kênh chưa phản ánh nước ruộng. Bà con đo tại ruộng rồi đối chiếu thêm nha.",source_ids:["irri-heat","ctu-om5451"]})}}]});
  },result);
  assert.equal(advice.provider,"Groq"); assert.equal(advice.isSimulated,true);
  assert.equal(advice.isFallback,false);
  assert.equal(JSON.stringify(result),before); assert.deepEqual(advice.inputSnapshot,inputs);
  const general=await adviseScenario({GEMINI_API_KEY:"test-only"},async(url,options)=>{
    const instruction=JSON.parse(options.body).systemInstruction.parts[0].text;
    assert.match(instruction,/Mỗi việc nói rõ bà con làm gì/);
    return gemini({reply:"Việc nên làm: 1. Kiểm tra nguồn cấp trước khi lấy nước vào ruộng, không bơm thêm khi chưa biết nguồn đó có mặn. Đây là nguyên lý chăm sóc từ kiến thức chung.",source_ids:[]});
  },result);
  assert.equal(general.answer_basis,"general_knowledge");assert.equal(general.isFallback,false);
  await assert.rejects(()=>adviseScenario({GEMINI_API_KEY:"test-only"},async()=>new Response("",{status:503}),result),error=>error.status===503);
  await assert.rejects(()=>adviseScenario({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:"Việc nên làm: Có thể phun bổ sung phân bón lá chứa canxi để cây chịu mặn tốt hơn.",source_ids:["ctu-om5451"]}),result),error=>error.status===502);
  const cautious=await adviseScenario({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:"Việc nên làm: Không tự ý phun phân hoặc thuốc chỉ từ các số đo mô phỏng. Bà con kiểm tra nguồn cấp và bông lúa trước nha.",source_ids:["ctu-om5451"]}),result);
  assert.match(cautious.reply,/Không tự ý/);
});

test("scenario advice may repeat the measured plant height without inventing a quantity",async()=> {
  const inputs=simulationInput.parse({varietyId:"OM5451",locationId:"can-tho",stage:"flowering",dayAfterSowing:75,salinityGl:4.2,salinitySite:"fieldWater",waterDepthCm:36,plantHeightCm:90,tempMaxC:35,rootZoneEcDsM:null,ecIsSeasonAverage:false,exposureDays:7,useWeather:false,requestAi:false},catalog);
  const result=new simulationEngine(catalog).evaluate(inputs);
  const advice=await adviseScenario({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:"Điều kiện đáng chú ý: Đây là kịch bản giả lập, nước 36 cm và cây cao 90 cm. Việc nên làm: Đo nguồn cấp trước khi điều chỉnh nước. Cần đo thêm: Mặn nguồn cấp. Khi nào cần nhờ cán bộ nông nghiệp: Khi lúa héo bất thường.",source_ids:["ctu-om5451"]}),result);
  assert.match(advice.reply,/90 cm/);
  await assert.rejects(()=>adviseScenario({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:"Cây cao 91 cm.",source_ids:["ctu-om5451"]}),result),error=>error.status===502);
});

test("scenario advice does not reject warnings against self-prescribing fertilizer",async()=> {
  const inputs=simulationInput.parse({varietyId:"OM5451",locationId:"can-tho",stage:"panicle",dayAfterSowing:48,salinityGl:2.8,salinitySite:"fieldWater",waterDepthCm:4.5,plantHeightCm:null,tempMaxC:28.5,rootZoneEcDsM:null,ecIsSeasonAverage:false,exposureDays:7,useWeather:false,requestAi:false},catalog);
  for(const prefix of ["Không nên tự ý","Chưa nên tự ý","Tránh tự ý"]) {
    const advice=await adviseScenario({GEMINI_API_KEY:"test-only"},async()=>gemini({reply:prefix+" bón phân chỉ từ số đo mặn. Bà con kiểm tra nguồn nước trước.",source_ids:["ctu-om5451"]}),new simulationEngine(catalog).evaluate(inputs));
    assert.match(advice.reply,/bón phân/);
  }
});

test("unsafe scenario prescriptions get one corrective generation attempt",async()=> {
  const inputs=simulationInput.parse({varietyId:"OM5451",locationId:"can-tho",stage:"panicle",dayAfterSowing:48,salinityGl:2.8,salinitySite:"fieldWater",waterDepthCm:4.5,plantHeightCm:null,tempMaxC:28.5,rootZoneEcDsM:null,ecIsSeasonAverage:false,exposureDays:7,useWeather:false,requestAi:false},catalog);
  let calls=0;
  const advice=await adviseScenario({GEMINI_API_KEY:"test-only"},async(url,options)=>{
    calls++;
    if(calls===1)return gemini({reply:"Bón phân để lúa chịu mặn tốt hơn.",source_ids:["ctu-om5451"]});
    assert.match(JSON.parse(options.body).systemInstruction.parts[0].text,/Không đề xuất phun\/bón\/rải/);
    return gemini({reply:"Đo mặn nguồn cấp và ruộng riêng trước khi quyết định lấy nước. Chưa nên tự ý bón phân khi thiếu dữ kiện.",source_ids:["ctu-om5451"]});
  },new simulationEngine(catalog).evaluate(inputs));
  assert.equal(calls,2);assert.equal(advice.isFallback,false);assert.equal(advice.fallbackUsed,true);
});
