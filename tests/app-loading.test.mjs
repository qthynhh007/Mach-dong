import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

function loadingHarness(fetch) {
  const classes=new Set(),timers=new Map(),events={},elements=[];let id=0;
  const document={documentElement:{classList:{add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name))}},
    readyState:"loading",body:{append(){}},addEventListener:(name,fn)=>{events[name]=fn;},
    createElement:()=>{const element={hidden:false,setAttribute(){},append(){}};elements.push(element);return element;}};
  const window={fetch,addEventListener:(name,fn)=>{events[name]=fn;}};
  runInNewContext(readFileSync(new URL("../src/static/app-loading.js",import.meta.url),"utf8"),{
    document,window,URL,location:new URL("https://example.test/community"),
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key),
  });
  events.DOMContentLoaded();
  return {window,classes,events,indicator:elements[0],fire(ms){for(const [key,timer] of timers){if(timer.ms===ms){timers.delete(key);timer.fn();return true;}}return false;}};
}

test("the loading indicator waits for all requests, including failures",async()=>{
  let finishFirst,failSecond,calls=0;
  const env=loadingHarness(()=>++calls===1 ? new Promise(resolve=>{finishFirst=resolve;}) : new Promise((resolve,reject)=>{failSecond=reject;}));
  const first=env.window.fetch("/api/one"),second=env.window.fetch("/api/two");
  env.fire(180);assert.equal(env.classes.has("app-task-pending"),true);
  const response={status:200};finishFirst(response);assert.equal(await first,response);
  assert.equal(env.indicator.hidden,false);
  failSecond(new Error("Offline"));await assert.rejects(second,/Offline/);
  assert.equal(env.classes.has("app-task-pending"),false);assert.equal(env.indicator.hidden,true);
});

test("a fast request does not leave a loading indicator behind",async()=>{
  const env=loadingHarness(async()=>({ok:true}));
  await env.window.fetch("/api/quick");
  assert.equal(env.fire(180),false);assert.equal(env.indicator.hidden,true);
});

test("navigation loading clears after its safety timeout",()=>{
  const env=loadingHarness(async()=>({ok:true}));
  const link={href:"https://example.test/simulation",target:"",download:"",hasAttribute:()=>false};
  env.events.click({button:0,target:{closest:()=>link}});
  assert.equal(env.classes.has("app-navigating"),true);
  env.fire(8000);env.fire(8000);
  assert.equal(env.classes.has("app-navigating"),false);
});
