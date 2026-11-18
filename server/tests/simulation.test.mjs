import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../data/catalog.json" with {type:"json"};
import history from "../data/weather-history.json" with {type:"json"};
import {simulationInput} from "../model.mjs";
import {simulationEngine} from "../engine.mjs";
import {weatherClient} from "../weather.mjs";
import {aiClient} from "../ai.mjs";
import worker from "../worker.mjs";

const base = {varietyId:"OM5451",locationId:"can-tho",stage:"panicle",dayAfterSowing:48,
  salinityGl:2.8,salinitySite:"fieldWater",waterDepthCm:4.5,plantHeightCm:null,
  tempMaxC:28.5,rootZoneEcDsM:null,ecIsSeasonAverage:false,exposureDays:7,useWeather:false,requestAi:false};
const evaluate = overrides => new simulationEngine(catalog).evaluate(simulationInput.parse({...base,...overrides},catalog));

test("never turns a g/L measurement into field yield or survival",()=> {
  const result = evaluate({salinityGl:8,salinitySite:"canalWater"});
  assert.deepEqual(result.metrics,{relativeYieldReferencePct:null,fieldYieldTonnesHa:null,survivalRatePct:null,chi:null});
  assert.ok(result.missingInputs.some(item=>item.id === "rootZoneEc"));
});
test("FAO calculation uses root-zone soil-water EC, not canal salinity",()=> {
  const result = evaluate({rootZoneEcDsM:5,ecIsSeasonAverage:true,salinityGl:0});
  assert.equal(result.metrics.relativeYieldReferencePct,76);
  assert.equal(evaluate({rootZoneEcDsM:3,ecIsSeasonAverage:true}).metrics.relativeYieldReferencePct,100);
  assert.equal(evaluate({rootZoneEcDsM:20,ecIsSeasonAverage:true}).metrics.relativeYieldReferencePct,0);
});
test("seedlings and spot EC measurements cannot use seasonal adult rice response",()=> {
  assert.equal(evaluate({rootZoneEcDsM:5,ecIsSeasonAverage:false}).metrics.relativeYieldReferencePct,null);
  assert.equal(evaluate({rootZoneEcDsM:5,ecIsSeasonAverage:true,stage:"seedling"}).metrics.relativeYieldReferencePct,null);
});
test("heat warning requires flowering and threshold, gives no sterility percent",()=> {
  assert.equal(evaluate({tempMaxC:38}).scene.heatConcern,false);
  assert.equal(evaluate({tempMaxC:35,stage:"flowering"}).scene.heatConcern,true);
  assert.equal(evaluate({tempMaxC:34.9,stage:"flowering"}).scene.heatConcern,false);
});
test("flood scene requires measured plant height, never promises SUB1 tolerance",()=> {
  assert.equal(evaluate({waterDepthCm:100}).scene.submerged,false);
  assert.equal(evaluate({waterDepthCm:80,plantHeightCm:80}).scene.submerged,true);
  assert.equal(evaluate({waterDepthCm:80,plantHeightCm:80}).metrics.survivalRatePct,null);
});
test("engine is deterministic and evidence IDs resolve to real catalog sources",()=> {
  const result = evaluate({stage:"seedling",plantHeightCm:4});
  assert.deepEqual(result,evaluate({stage:"seedling",plantHeightCm:4}));
  for (const item of result.evidence) for (const id of item.sourceIds) assert.ok(catalog.sources.some(source=>source.id===id),id);
});
test("validation rejects nonfinite, booleans, unknown fields, and unverified cultivar",()=> {
  for (const overrides of [{tempMaxC:NaN},{tempMaxC:Infinity},{salinityGl:true},{exposureDays:1.5},{stage:"__proto__"},{varietyId:"ST25"},{locationId:"unknown"},{apiKey:"secret"},{useWeather:"true"}]) {
    assert.throws(()=>simulationInput.parse({...base,...overrides},catalog));
  }
});
test("missing forecast days remain missing, never copy manual temperature",()=> {
  const inputs = simulationInput.parse({...base,stage:"flowering",useWeather:true,tempMaxC:45},catalog);
  const result = new simulationEngine(catalog).evaluate(inputs,{sourceId:"open-meteo",rows:[{date:"2026-11-18",tempMaxC:31}]});
  assert.equal(result.dailyScenario[1].tempMaxC,null);
  assert.equal(result.dailyScenario[1].heatConcern,null);
  assert.equal(result.scene.heatConcern,false);
});
test("daily scenarios keep salinity and water fixed, do not accumulate invented damage",()=> {
  const result = evaluate({exposureDays:30});
  assert.equal(result.dailyScenario.length,7);
  assert.ok(result.dailyScenario.every(row=>row.salinityGl===2.8 && row.waterDepthCm===4.5));
});
test("no Gemini credential is a visible state, not a fake AI success",async()=> {
  const ai = await new aiClient({},()=>assert.fail("No network call allowed")).explain(evaluate({}));
  assert.equal(ai.status,"notConfigured");
});
test("Gemini may only select existing evidence; fabricated number/citation rejected",async()=> {
  const fetcher = async()=>Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({priorityEvidenceIds:["fabricated"],missingInputIds:[],yield:8})}]}}]});
  const ai = await new aiClient({GEMINI_API_KEY:"test-only"},fetcher).explain(evaluate({}));
  assert.equal(ai.status,"rejectedOrUnavailable");
  assert.equal(ai.yield,undefined);
});
test("Gemini accepted output contains only validated IDs and never changes predictions",async()=> {
  const result = evaluate({}); const original = JSON.stringify(result.metrics);
  const fetcher = async function(url,request) {
    assert.equal(this,undefined,"Do not bind the transport to the client instance");
    assert.match(url,/generativelanguage.googleapis.com/); assert.equal(request.headers["x-goog-api-key"],"test-only");
    return Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({priorityEvidenceIds:["missing-ec"],missingInputIds:["rootZoneEc"]})}]}}]});
  };
  const ai = await new aiClient({GEMINI_API_KEY:"test-only"},fetcher).explain(result);
  assert.equal(ai.status,"ready"); assert.equal(JSON.stringify(result.metrics),original);
});
test("quota errors are explicit and preserve deterministic result",async()=> {
  assert.equal((await new aiClient({GEMINI_API_KEY:"test-only"},async()=>new Response("",{status:429})).explain(evaluate({}))).status,"quotaExceeded");
});
test("weather validates units and does not coerce null to zero",async()=> {
  const response = {daily_units:{temperature_2m_max:"°C",temperature_2m_min:"°C",precipitation_sum:"mm",et0_fao_evapotranspiration:"mm",shortwave_radiation_sum:"MJ/m²"},daily:{time:["2026-11-18"],temperature_2m_max:[null],temperature_2m_min:[24],precipitation_sum:[null],et0_fao_evapotranspiration:[2],shortwave_radiation_sum:[10]}};
  const client = new weatherClient(catalog,async function() {
    assert.equal(this,undefined,"Do not bind the transport to the client instance");
    return Response.json(response);
  });
  assert.equal((await client.forecast("can-tho")).rows[0].rainMm,null);
  response.daily_units.temperature_2m_max = "°F";
  await assert.rejects(()=>client.forecast("can-tho"));
});
test("historical bundle is complete with attribution and original missing values",()=> {
  assert.equal(history.rowCount,2920); assert.equal(history.locations.length,8);
  for (const location of history.locations) {
    assert.equal(location.rows.length,365); assert.ok(location.sourceUrl.startsWith("https://power.larc.nasa.gov/"));
    assert.match(location.rawSha256,/^[a-f0-9]{64}$/);
    assert.equal(location.rows[0].date,"2025-01-01");
    assert.ok(location.rows.every(row=>Object.values(row).every(value=>value!==-999)));
  }
});
test("API rejects malformed and oversized requests with JSON errors",async()=> {
  for (const [body,status] of [["bad",400],["x".repeat(8200),413]]) {
    const response = await worker.fetch(new Request("https://example.test/api/simulation",{method:"POST",headers:{"Content-Type":"application/json"},body}),{});
    assert.equal(response.status,status); assert.equal((await response.json()).data,null);
  }
});
test("API evaluates requested input and missing-key AI state end to end",async()=> {
  const response = await worker.fetch(new Request("https://example.test/api/simulation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...base,requestAi:true})}),{});
  assert.equal(response.status,200);
  const result = (await response.json()).data;
  assert.equal(result.ai.status,"notConfigured"); assert.equal(result.inputs.salinityGl,2.8);
});
