import test from "node:test";
import assert from "node:assert/strict";
import {simulationController} from "../worker.mjs";

const url = "https://example.test/api/assistant/generate";
const payload = {messages:[{role:"user",text:"Cà chua trồng ngoài đất cần kiểm tra gì?"}],sourceIds:["KN-TOMATO-PLANT"]};
const ask = (body,fetcher,ip="198.51.100.5") => new simulationController({GROQ_API_KEY:"test-only"},fetcher).handle(new Request(url,{method:"POST",headers:{"Content-Type":"application/json","CF-Connecting-IP":ip},body:JSON.stringify(body)}));

test("Cò Mạ lets AI select sources but constructs all prose from reviewed material",async()=> {
  let sent;
  const fetcher = async function(endpoint,options) {
    assert.equal(this,undefined);
    sent = {endpoint,options};
    return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify({source_ids:["KN-TOMATO-PLANT"]})}}]});
  };
  const response = await ask(payload,fetcher);
  assert.equal(response.status,200);
  const result = (await response.json()).data;
  assert.deepEqual(result.source_ids,["KN-TOMATO-PLANT"]);
  assert.match(result.reply,/Tài liệu hướng dẫn trồng cà chua/);
  assert.equal(sent.endpoint,"https://api.groq.com/openai/v1/chat/completions");
  assert.match(sent.options.headers.Authorization,/^Bearer /);
  assert.match(sent.options.body,/KN-TOMATO-PLANT/);
  assert.equal((await ask({...payload,sourceIds:["unknown"]},fetcher,"198.51.100.6")).status,400);
  const badFetcher = async()=>Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify({reply:"Bón 900 kg/ha ngay.",source_ids:["KN-TOMATO-PLANT"]})}}]});
  assert.equal((await ask(payload,badFetcher,"198.51.100.7")).status,502);
});
