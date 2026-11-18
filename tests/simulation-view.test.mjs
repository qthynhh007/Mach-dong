import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createContext,runInContext} from "node:vm";

const source = readFileSync(new URL("../src/static/simulation.js",import.meta.url),"utf8");
function classes(overrides = {}) {
  const context = createContext({AbortController,Response,TypeError,setTimeout,clearTimeout,...overrides});
  runInContext(source,context);
  return runInContext("({simulationApi,simulationView})",context);
}
function viewHarness(request) {
  const {simulationView} = classes();
  const view = Object.create(simulationView.prototype);
  Object.assign(view,{revision:0,result:null,form:{reportValidity:()=>true},api:{request},
    invalidate(){ this.revision++; this.activeRequest?.abort(); this.result = null; },
    inputs(requestAi){return {requestAi};}, setBusy(value){this.busy=value;},
    status(message,error){this.message=message; this.error=error;},
    renderResult(){this.rendered=true;},showPanel(panel){this.panel=panel;},
    byId(id){return {disabled:false,focus:()=>{this.focused=id;},scrollIntoView:()=>{this.scrolled=id;}};}
  });
  return view;
}

test("normal simulation opens the report without requiring an AI key",async()=> {
  const report = {ai:{status:"notRequested"}};
  const view = viewHarness(async(path,payload)=>{assert.equal(payload.requestAi,false); return report;});
  await view.run(false);
  assert.equal(view.result,report); assert.equal(view.rendered,true);
  assert.equal(view.panel,"reportPanel"); assert.equal(view.focused,"reportTitle");
  assert.equal(view.scrolled,"reportPanel"); assert.equal(view.busy,false);
});

test("a response for changed conditions cannot open a stale report",async()=> {
  let finish;
  const view = viewHarness(()=>new Promise(resolve=>{finish=resolve;}));
  const pending = view.run(false);
  view.invalidate(); finish({oldResult:true}); await pending;
  assert.equal(view.result,null); assert.equal(view.panel,undefined);
});

test("request failure leaves a visible error and no stale report",async()=> {
  const view = viewHarness(async()=>{throw new Error("Nguồn thời tiết không khả dụng");});
  view.result={oldResult:true}; await view.run(false);
  assert.equal(view.result,null); assert.equal(view.error,true);
  assert.match(view.message,/thời tiết/); assert.equal(view.busy,false);
  assert.equal(view.panel,undefined);
});

test("HTML server errors are translated instead of exposing a JSON parser failure",async()=> {
  const {simulationApi} = classes({fetch:async()=>new Response("<html>Unavailable</html>",{status:503})});
  await assert.rejects(()=>new simulationApi().request("/api/simulation"),/HTTP 503/);
});

test("a stalled request times out with an actionable message",async()=> {
  let expire;
  const {simulationApi} = classes({setTimeout:callback=>{expire=callback;return 1;},clearTimeout:()=>{},
    fetch:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(signal.reason)))});
  const pending = new simulationApi().request("/api/simulation");
  expire(); await assert.rejects(()=>pending,/phản hồi quá lâu/);
});

test("missing response data never creates a successful report",async()=> {
  const {simulationApi} = classes({fetch:async()=>Response.json({data:null,error:null})});
  await assert.rejects(()=>new simulationApi().request("/api/simulation"),/kết quả rỗng/);
});
