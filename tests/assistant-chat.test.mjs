import test from "node:test";
import assert from "node:assert/strict";
import {AssistantSession} from "../src/static/assistant-session.js";
import {parseCoMaReply,renderCoMaReply,safeAssistantSources} from "../src/static/co-ma-reply.js";

test("chat advice separates sections and steps without splitting decimal measurements",()=>{
  const parts=parseCoMaReply("Nhận định: Mặn ruộng 2.8 g/L, nước 4.5 cm. Việc nên làm: 1. Kiểm tra nguồn cấp. 2. Quan sát bông lúa. Cần kiểm tra thêm: Độ mặn nước vào.");
  assert.equal(parts.length,3);assert.match(parts[0].text,/2\.8 g\/L/);assert.equal(parts[1].items.length,2);
});
test("a short answer preserves paragraphs without adding unnecessary sections",()=>{
  const parts=parseCoMaReply("Cà phê cần có thời gian khô.\n\nKhi có mưa, nụ hoa phát triển.");
  assert.equal(parts.length,1);assert.equal(parts[0].heading,"");assert.match(parts[0].text,/\n\n/);
});
test("malformed or unsafe citations cannot break the answer",()=>{
  assert.deepEqual(safeAssistantSources([null,{url:"javascript:alert(1)",title:"bad"},{url:"https://[bad",title:"bad"},{url:"/community/samples/rice",title:"Rice"},{url:"https://example.org/docs",title:"Docs"},{url:"https://example.org/docs",title:"Duplicate"}],"https://example.test"),[
    {url:"https://example.test/community/samples/rice",title:"Rice"},{url:"https://example.org/docs",title:"Docs"},
  ]);
  assert.deepEqual(safeAssistantSources({},"https://example.test"),[]);
});
test("generated markup stays literal text instead of executable HTML",()=>{
  const texts=[];const document={createElement:tag=>({tag,append(){},set textContent(value){texts.push(value);}})};
  renderCoMaReply(document,{append(){}},"Nhận định: <script>alert(1)</script>");
  assert.equal(texts.includes("<script>alert(1)</script>"),true);
});
test("a cancelled reply cannot change history or close a newer request",()=>{
  const chat=new AssistantSession();const first=chat.begin();chat.cancel();const next=chat.begin();
  assert.equal(first.signal.aborted,true);assert.equal(chat.commit(first,"Old","Late reply"),false);
  chat.finish(first);assert.equal(chat.request,next);assert.equal(chat.commit(next,"New","Current reply"),true);
  chat.finish(next);assert.equal(chat.history.length,2);
});
test("history retains complete pairs and logout prevents further writes",()=>{
  const chat=new AssistantSession(8);
  for(let turn=0;turn<7;turn++){const request=chat.begin();assert.equal(chat.begin(),null);chat.commit(request,String(turn),"Reply");chat.finish(request);}
  assert.equal(chat.history.length,8);assert.equal(chat.history[0].text,"3");
  const pending=chat.begin();chat.end();assert.equal(pending.signal.aborted,true);
  assert.equal(chat.history.length,0);assert.equal(chat.begin(),null);assert.equal(chat.commit(pending,"Late","Late"),false);
});
test("resetting the conversation aborts the pending turn and clears context",()=>{
  const chat=new AssistantSession();const request=chat.begin();chat.commit(request,"Rice","First reply");
  chat.reset();assert.equal(request.signal.aborted,true);assert.equal(chat.history.length,0);assert.notEqual(chat.begin(),null);
});
