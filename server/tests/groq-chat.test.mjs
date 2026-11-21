import test from "node:test";
import assert from "node:assert/strict";
import {simulationController} from "../worker.mjs";
import {adviseScenario} from "../advice.mjs";
import {generateGroundedReply} from "../generative.mjs";
import {simulationEngine} from "../engine.mjs";
import {simulationInput} from "../model.mjs";
import catalog from "../data/catalog.json" with {type:"json"};
import {sessionEnv,sessionHeaders} from "./fixtures/session.mjs";

const env={...sessionEnv,AI_PROVIDER:"groq",GROQ_API_KEY:"groq-test-only"};
const groq=answer=>Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(answer)}}]});
const answer={reply:"Bà con kiểm tra nguồn nước cấp và đo tại ruộng trước khi điều chỉnh nha.",source_ids:[]};
const inputs=simulationInput.parse({varietyId:"OM5451",locationId:"can-tho",stage:"panicle",dayAfterSowing:48,
  salinityGl:2.8,salinitySite:"fieldWater",waterDepthCm:4.5,plantHeightCm:null,tempMaxC:28.5,
  rootZoneEcDsM:null,ecIsSeasonAverage:false,exposureDays:7,useWeather:false,requestAi:false},catalog);

test("Groq-only chat preserves conversation and sends the key only to Groq",async()=> {
  const messages=[{role:"user",text:"Lúa đang làm đòng, cần đo gì?"},{role:"model",text:answer.reply},{role:"user",text:"Vì sao cần đo ở ruộng?"}];
  const response=await new simulationController(env,async(url,options)=>{
    assert.equal(url,"https://api.groq.com/openai/v1/chat/completions");
    assert.equal(options.headers.Authorization,"Bearer groq-test-only");
    assert.equal(options.headers["x-goog-api-key"],undefined);
    const body=JSON.parse(options.body);
    assert.equal(body.model,"openai/gpt-oss-20b");
    assert.equal(body.response_format.json_schema.strict,true);
    assert.deepEqual(body.messages.slice(1).map(item=>item.role),["user","assistant","user"]);
    assert.equal(body.messages.at(-1).content,messages.at(-1).text);
    return groq(answer);
  }).handle(new Request("https://example.test/api/assistant/generate",{method:"POST",headers:{...sessionHeaders,"Content-Type":"application/json"},body:JSON.stringify({messages,sourceIds:[]})}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).data.provider,"Groq");
});

test("the assistant route keeps its 45-second timeout and retries one Groq timeout",async()=> {
  const original=AbortSignal.timeout;
  const timeouts=[];
  let calls=0;
  AbortSignal.timeout=ms=>{timeouts.push(ms);return original(ms);};
  try {
    const response=await new simulationController(env,async()=>{
      calls++;
      if(calls===1) throw new DOMException("test timeout","TimeoutError");
      return groq(answer);
    }).handle(new Request("https://example.test/api/assistant/generate",{method:"POST",headers:{...sessionHeaders,"Content-Type":"application/json"},body:JSON.stringify({messages:[{role:"user",text:"Cần đo gì trước khi lấy nước?"}],sourceIds:[]})}));
    assert.equal(response.status,200);
    assert.equal(calls,2);
    assert.deepEqual(timeouts,[45000,45000]);
  } finally {AbortSignal.timeout=original;}
});

test("Groq is preferred when both keys exist and an explicitly selected missing Groq key fails closed",async()=> {
  const reply=await generateGroundedReply({GROQ_API_KEY:"groq-test-only",GEMINI_API_KEY:"must-not-use"},async url=>{
    assert.equal(url,"https://api.groq.com/openai/v1/chat/completions");return groq(answer);
  },[{role:"user",text:"Cần đo gì?"}],[],"",false,0,true);
  assert.equal(reply.provider,"Groq");
  await assert.rejects(()=>generateGroundedReply({AI_PROVIDER:"groq",GEMINI_API_KEY:"must-not-use"},()=>assert.fail("No cross-provider fallback"),[{role:"user",text:"Cần đo gì?"}],[]),error=>error.status===503);
});

test("Groq scenario advice preserves source allowlist and the deterministic input snapshot",async()=> {
  const result=new simulationEngine(catalog).evaluate(inputs);
  const before=JSON.stringify(result);
  const advice=await adviseScenario(env,async(url,options)=>{
    assert.equal(url,"https://api.groq.com/openai/v1/chat/completions");
    const body=JSON.parse(options.body);
    assert.match(body.messages.at(-1).content,/"salinityGl":2.8/);
    assert.match(body.messages.at(-1).content,/"salinitySite":"fieldWater"/);
    return groq({...answer,source_ids:[result.sources[0].id]});
  },result);
  assert.equal(advice.provider,"Groq");
  assert.deepEqual(advice.inputSnapshot,inputs);
  assert.equal(advice.isFallback,false);
  assert.equal(JSON.stringify(result),before);
});

test("scenario advice bounds output tokens and omits repeated daily rows without a forecast",async()=> {
  const result=new simulationEngine(catalog).evaluate(inputs);
  await adviseScenario(env,async(url,options)=>{
    const body=JSON.parse(options.body);
    assert.ok(body.max_completion_tokens<=2048,"Bound the reply budget to avoid reserving excessive Groq quota");
    const context=JSON.parse(body.messages.at(-1).content.split('\n').slice(1).join('\n'));
    assert.equal(context.dailyScenario,null);
    assert.equal(context.valuesWithUnits.waterDepth,'4.5 cm');
    return groq(answer);
  },result);
  assert.equal(result.dailyScenario.length,7);
});

test("health reports the selected provider instead of mistaking a Gemini key for Groq readiness",async()=> {
  for(const configured of [false,true]) {
    const response=await new simulationController({AI_PROVIDER:"groq",GEMINI_API_KEY:"unused",...(configured?{GROQ_API_KEY:"test-only"}:{})}).handle(new Request("https://example.test/api/health"));
    const data=(await response.json()).data;
    assert.equal(data.aiProvider,"groq");
    assert.deepEqual(data.aiFeatures,{chat:configured,scenarioAdvice:configured});
  }
});

test("Groq retries one invalid answer on Groq and never falls back to Gemini",async()=> {
  let calls=0;
  const reply=await generateGroundedReply({...env,GEMINI_API_KEY:"must-not-use"},async(url,options)=>{
    calls++;assert.equal(url,"https://api.groq.com/openai/v1/chat/completions");
    if(calls===2) assert.match(JSON.parse(options.body).messages[0].content,/LƯU Ý KHI SOẠN LẠI/);
    return groq(calls===1?{...answer,source_ids:["invented"]}:answer);
  },[{role:"user",text:"Cần đo gì?"}],[],"",false,0,true);
  assert.equal(calls,2);assert.equal(reply.provider,"Groq");assert.equal(reply.fallbackUsed,true);
});

test("Groq overload is retried once but quota errors stop without switching providers",async()=> {
  for(const status of [503,429]) {
    let calls=0;
    await assert.rejects(()=>generateGroundedReply({...env,GEMINI_API_KEY:"must-not-use"},async url=>{
      calls++;assert.equal(url,"https://api.groq.com/openai/v1/chat/completions");return new Response("",{status});
    },[{role:"user",text:"Cần đo gì?"}],[],"",false,0,true),error=>error.status===status);
    assert.equal(calls,status===503?2:1);
  }
});
