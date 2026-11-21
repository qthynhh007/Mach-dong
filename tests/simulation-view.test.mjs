import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createContext,runInContext} from "node:vm";
import {sceneState} from "../src/static/simulation-scene.js";

const source = readFileSync(new URL("../src/static/simulation.js",import.meta.url),"utf8");
function classes(overrides = {}) {
  const context = createContext({AbortController,Response,TypeError,setTimeout,clearTimeout,...overrides});
  runInContext(source.replace('if (typeof document !== "undefined") new simulationView();',''),context);
  return runInContext("({simulationApi,simulationView,adviceWaitController})",context);
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

test("the field requires an observed stage and keeps canal salinity separate", () => {
  const {simulationView} = classes();
  const view = Object.create(simulationView.prototype);
  const fields = {
    locationId: {value: "location"}, stage: {value: "", options: [
      {value: "seedling", dataset: {throughDay: "15"}},
      {value: "tillering", dataset: {throughDay: "42"}},
      {value: "panicle", dataset: {throughDay: "65"}},
    ]}, salinitySite: {value: "fieldWater"},
    dayAfterSowing: {value: "48"}, exposureDays: {value: "7"}, salinityGl: {value: "2.8"},
    canalSalinityGl: {valueAsNumber: 8.1}, waterDepthCm: {value: "-4.5"}, tempMaxC: {value: "28.5"},
    plantHeightCm: {value: ""}, rootZoneEcDsM: {value: ""},
    ecIsSeasonAverage: {checked: false}, useWeather: {checked: false},
  };
  view.fieldPreview = true;
  view.field = name => fields[name];

  const fieldInputs = view.inputs(false);
  assert.equal(fieldInputs.salinityGl, 2.8);
  assert.equal(fieldInputs.waterDepthCm, 0);
  assert.equal(fieldInputs.stage, ""); // Days after sowing must not invent the observed growth stage.
  assert.equal(fieldInputs.rootZoneEcDsM, null);

  fields.salinitySite.value = "canalWater";
  fields.stage.value = "flowering";
  const canalInputs = view.inputs(false);
  assert.equal(canalInputs.salinitySite, "canalWater");
  assert.equal(canalInputs.salinityGl, 8.1);
  assert.equal(canalInputs.stage, "flowering");
  assert.equal(fields.salinityGl.value, "2.8");
});

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

test("new field scene uses verified cloud flags, not water salinity to invent damage",()=> {
  const state = sceneState({inputs:{stage:"seedling",salinityGl:20},scene:{}});
  assert.equal(state.stage,"Mạ non");
  assert.equal(state.signals.tip_burn,0);
  assert.equal(state.signals.water_cover,0);
  const warning = sceneState({inputs:{stage:"flowering"},scene:{heatConcern:true,submerged:true}});
  assert.equal(warning.stage,"Trổ bông");
  assert.ok(warning.signals.leaf_roll > 0);
  assert.equal(warning.signals.water_cover,1);
});

test("editing a scenario clears scene warnings and preserves the selected stage",()=> {
  const state = sceneState(null,"ripening");
  assert.equal(state.stage,"Chín vàng");
  assert.equal(state.signals.tip_burn,0);
  assert.equal(state.signals.leaf_roll,0);
  assert.equal(state.signals.water_cover,0);
});

test("a weather deep link loads the forecast after the location catalog becomes ready",async()=> {
  const {simulationView}=classes({Option:class {constructor(text,value){this.text=text;this.value=value;}}});
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id)) elements.set(id,{value:"can-tho",disabled:true,replaceChildren(){},add(){},hidden:false});
    return elements.get(id);
  };
  const view=Object.create(simulationView.prototype);
  Object.assign(view,{tabs:[{getAttribute:()=>"true",dataset:{panel:"weatherPanel"}}],
    byId:element,setBusy(){},status(){},renderSources(){},setText(){},number:String,
    api:{request:async()=>({locations:[{name:"Cần Thơ",id:"can-tho"}],varieties:[{}],history:{},reviewedAt:"test"})},
    loadWeather:async()=>{view.weatherCalls=(view.weatherCalls || 0)+1;}});
  await view.loadCatalog();
  assert.equal(view.weatherCalls,1); assert.equal(element("loadWeather").disabled,false);
  assert.equal(element("weatherLocation").disabled,false);
});

test("a catalog failure leaves the weather button available for a retry",async()=> {
  const {simulationView}=classes(); const view=Object.create(simulationView.prototype);
  const button={disabled:true};
  Object.assign(view,{byId:id=>id==="loadWeather" ? button : {},setBusy(){},status(){},setText(){},api:{request:async()=>{throw new Error("Mất mạng");}}});
  await view.loadCatalog();
  assert.equal(view.catalog,null); assert.equal(button.disabled,false);
});

test("late weather results cannot overwrite a newly selected location",async()=> {
  const {simulationView}=classes(); const view=Object.create(simulationView.prototype);
  const elements={loadWeather:{},weatherMeta:{},weatherLocation:{value:"can-tho"}};
  const pending=[]; const rendered=[];
  Object.assign(view,{catalog:{},byId:id=>elements[id],field:()=>({value:"can-tho"}),number:String,
    api:{request:(url)=>new Promise(resolve=>pending.push({url,resolve}))},rows:(id,rows)=>rendered.push(rows)});
  const first=view.loadWeather(); elements.weatherLocation.value="tra-vinh";
  const second=view.loadWeather();
  const result=locationId=>({locationId,sourceId:"open-meteo",rows:[{date:locationId}],retrievedAt:"2026-11-20",license:"test"});
  pending[1].resolve(result("tra-vinh")); await second;
  pending[0].resolve(result("can-tho")); await first;
  assert.match(pending[1].url,/tra-vinh/); assert.equal(rendered.length,1);
  assert.equal(rendered[0][0][0],"tra-vinh"); assert.equal(elements.loadWeather.disabled,false);
});

test("advice for an edited scenario never appears as current advice",async()=> {
  const events=[]; const {simulationView}=classes({document:{dispatchEvent:event=>events.push(event)},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}});
  const view=Object.create(simulationView.prototype); const text={}; let finish;
  Object.assign(view,{result:{inputs:{salinityGl:2.8}},revision:0,startAdviceWait(){},byId:()=>({setAttribute(){},classList:{remove(){},add(){},toggle(){}}}),setText:(id,value)=>{text[id]=value;},
    api:{request:()=>new Promise(resolve=>{finish=resolve;})}});
  const waiting=view.explainReport(); view.revision++; view.adviceRequest.abort();
  finish({reply:"Old advice",sources:[]}); await waiting;
  assert.notEqual(text.reportExplanation,"Old advice");
  assert.equal(events.some(event=>event.detail?.reply==="Old advice"),false);
});

test("advice separates the four sections and keeps decimal measurements intact",()=> {
  const {simulationView}=classes(); const view=Object.create(simulationView.prototype);
  const parts=view.adviceParts("Chào bà con. Điều kiện đáng chú ý: Mặn 2.8 g/L, nước 42.5 cm. Việc nên làm: 1. Đo lại nước ruộng. 2. Theo dõi lá lúa. Cần đo thêm: Chiều cao cây. Khi nào cần nhờ cán bộ nông nghiệp: Khi lúa héo kéo dài.");
  assert.equal(parts.length,5);
  assert.equal(parts[1].body,"Mặn 2.8 g/L, nước 42.5 cm.");
  assert.equal(parts[2].steps.length,2);
  assert.equal(parts[4].heading,"Khi nào cần nhờ cán bộ nông nghiệp");
});

test("advice without standard headings preserves each paragraph",()=> {
  const {simulationView}=classes(); const view=Object.create(simulationView.prototype);
  const parts=view.adviceParts("Quan sát tại ruộng.\n\nChưa đủ dữ liệu để kết luận.");
  assert.equal(parts.length,1);
  assert.equal(parts[0].body,"Quan sát tại ruộng.\n\nChưa đủ dữ liệu để kết luận.");
});

test("sample advice is unavailable before 4 minutes 30 seconds",()=> {
  const {adviceWaitController}=classes(); let now=0,callback,expired=0;
  const timer=new adviceWaitController(()=>{},()=>expired++,{now:()=>now,schedule:fn=>{callback=fn;return 1;},cancel(){}});
  timer.start(); assert.equal(expired,0);
  now=269999;callback();assert.equal(expired,0);
  now=270000;callback();assert.equal(expired,1);
  callback();assert.equal(expired,1);
});

test("successful advice or a cancelled scenario prevents later sample advice",()=> {
  const {adviceWaitController}=classes(); let now=0,callback,expired=0;
  const timer=new adviceWaitController(()=>{},()=>expired++,{now:()=>now,schedule:fn=>{callback=fn;return 1;},cancel(){}});
  timer.start();timer.stop();now=300000;callback();assert.equal(expired,0);
});

test("retrying before the deadline does not restart the 4 minute 30 second wait",()=> {
  const {adviceWaitController}=classes(); let now=0,callback,expired=0;
  const timer=new adviceWaitController(()=>{},()=>expired++,{now:()=>now,schedule:fn=>{callback=fn;return 1;},cancel(){}});
  timer.start();now=200000;timer.start();assert.equal(timer.startedAt,0);
  now=270000;callback();assert.equal(expired,1);
});

test("an early API failure shows the error without returning canned advice",async()=> {
  const {simulationView}=classes({document:{dispatchEvent(){}},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}});
  const view=Object.create(simulationView.prototype);const text={};let started=false,answered=false;
  Object.assign(view,{result:{inputs:{}},revision:0,startAdviceWait(){started=true;},setAdviceAnswer(){answered=true;},
    byId:()=>({setAttribute(){},classList:{remove(){},add(){}}}),setText:(id,value)=>{text[id]=value;},api:{request:async()=>{throw new Error("AI tạm thời quá tải.");}}});
  await view.explainReport();assert.equal(started,true);assert.equal(answered,false);assert.match(text.reportExplanationStatus,/thử lại/);
});

test("opening the advice dialog reuses the actual API answer",async()=> {
  let detail;const {simulationView}=classes({document:{dispatchEvent:event=>{detail=event.detail;}},CustomEvent:class{constructor(type,options){this.detail=options.detail;}}});
  const view=Object.create(simulationView.prototype);view.adviceAnswer={reply:"Phân tích riêng từ API",isFallback:false};
  view.api={request:()=>assert.fail("Opening a dialog must not request AI again")};
  await view.explainReport(true);assert.equal(detail,view.adviceAnswer);
});
