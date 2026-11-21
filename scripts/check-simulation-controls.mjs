import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";

const origin="http://127.0.0.1:5000";
const profile=mkdtempSync(join(tmpdir(),"mach-dong-controls-"));
const browser=spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",[
  "--headless=new","--incognito","--disable-gpu","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank",
],{windowsHide:true,stdio:"ignore"});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket,nextId=0;const pending=new Map(),errors=[];
function send(method,params={}) {
  return new Promise((resolve,reject)=>{
    const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(new Error("Timeout: "+method));},15000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function until(expression,timeout=12000) {
  for(let i=0;i<Math.ceil(timeout/200);i++){if(await evaluate(expression))return;await delay(200);}
  throw new Error("Condition not reached: "+expression);
}
try {
  let port;
  for(let i=0;i<60;i++) {
    try{port=Number(readFileSync(join(profile,"DevToolsActivePort"),"utf8").split("\n")[0]);break;}catch{await delay(100);}
  }
  assert.ok(port,"Chrome started");
  const tabs=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  socket=new WebSocket(tabs.find(tab=>tab.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  socket.addEventListener("message",event=>{
    const message=JSON.parse(event.data);
    if(message.method==="Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const call=pending.get(message.id);if(!call)return;
    clearTimeout(call.timer);pending.delete(message.id);message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result);
  });
  await send("Page.enable");await send("Runtime.enable");
  const controlsOnly=process.env.MACH_DONG_QA_BLOCK_SCENE === "1";
  const realAdvice=process.env.MACH_DONG_QA_REAL_ADVICE === "1";
  const errorAdvice=process.env.MACH_DONG_QA_ADVICE_ERROR === "1";
  if(controlsOnly) {await send("Network.enable");await send("Network.setBlockedURLs",{urls:["*/simulation-scene.js*"]});}
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  if(process.env.MACH_DONG_QA_REGISTER_ONLY === "1") {
    await send("Page.navigate",{url:origin+"/register"});await until("document.readyState==='complete'");
    await evaluate("document.fonts.ready.then(()=>true)");
    mkdirSync(resolve("../output"),{recursive:true});
    for(const [width,height] of [[1366,768],[1440,900],[390,844]]) {
      await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});
      await delay(300);
      const metrics=await evaluate("({height:innerHeight,pageHeight:document.documentElement.scrollHeight,width:innerWidth,pageWidth:document.documentElement.scrollWidth,buttonBottom:document.querySelector('#registerForm button[type=submit]').getBoundingClientRect().bottom,requiredVisible:[...document.querySelectorAll('#registerForm [required]')].every(input=>input.getBoundingClientRect().height>0),walletClosed:!document.getElementById('walletOptions').open})");
      console.log(JSON.stringify({register:{width,height,...metrics}}));
      assert.equal(metrics.requiredVisible,true,"Required registration fields are visible");
      assert.equal(metrics.walletClosed,true,"Optional wallet details start collapsed");
      assert.ok(metrics.pageWidth<=width+1,"Registration has no horizontal overflow");
      if(width>960) {assert.ok(metrics.pageHeight<=height+1,"Desktop registration fits one viewport");assert.ok(metrics.buttonBottom<height,"Submit is visible without scrolling");}
      writeFileSync(resolve("../output/register-"+width+"x"+height+".png"),Buffer.from((await send("Page.captureScreenshot",{format:"png"})).data,"base64"));
    }
    await evaluate("document.getElementById('walletOptions').open=true;document.querySelector('[name=wallet_mode][value=EXTERNAL]').click()");
    assert.equal(await evaluate("document.getElementById('walletAddressInput').getBoundingClientRect().height>0"),true,"Existing-wallet option remains usable");
    await evaluate("document.querySelector('[name=wallet_mode][value=AUTO_EMAIL]').click()");
    assert.deepEqual(errors,[],"Registration has no browser errors");
    console.log(JSON.stringify({status:"passed",mode:"compact-registration"}));
  } else {
  await send("Page.navigate",{url:origin+"/login"});await until("document.readyState==='complete'");
  assert.ok(process.env.MACH_DONG_QA_PASSWORD,"Provide QA password through the environment");
  const credentials=JSON.stringify({identifier:process.env.MACH_DONG_QA_USER || "nongho",password:process.env.MACH_DONG_QA_PASSWORD});
  const login=await evaluate("(async()=>{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify("+credentials+")});return response.status;})()");
  assert.equal(login,200,"Local test login");
  await send("Page.addScriptToEvaluateOnNewDocument",{source:
    "const originalFetch=window.fetch;window.fetch=(url,options)=>{"+
    "if(String(url)==='/api/simulation/advice') {window.qaAdviceRequests=(window.qaAdviceRequests || 0)+1;window.qaAdvicePayload=JSON.parse(options.body);"+
    (errorAdvice ? "return new Promise(resolve=>setTimeout(()=>resolve(Response.json({data:null,error:'Dịch vụ tư vấn đang tạm hết lượt xử lý. Bà con vui lòng thử lại sau.'},{status:429})),500));" : realAdvice ? "return originalFetch(url,options);" : "return new Promise((resolve,reject)=>{window.qaAdviceResolve=resolve;"+
    "options.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});"+
    "});")+"}return originalFetch(url,options);};"});
  await send("Page.navigate",{url:origin+"/simulation"});
  await until("document.readyState==='complete' && document.getElementById('runSimulation') && !document.getElementById('runSimulation').disabled");
  await evaluate("document.getElementById('inputSalinity').focus()");
  await send("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
  await send("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
  const slider=await evaluate("({value:document.getElementById('inputSalinity').value,label:document.getElementById('valSalinity').textContent})");
  console.log(JSON.stringify({slider,errors}));
  assert.equal(slider.label,Number(slider.value).toLocaleString("vi-VN")+" g/L","Slider label updates");
  for(const [inputId,outputId,unit] of [["inputWater","valWater","cm"],["inputStage","valStage","ngày"],["inputTemp","valTemp","°C"]]) {
    await evaluate("document.getElementById("+JSON.stringify(inputId)+").focus()");
    await send("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
    await send("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
    const control=await evaluate("({value:document.getElementById("+JSON.stringify(inputId)+").value,label:document.getElementById("+JSON.stringify(outputId)+").textContent})");
    assert.equal(control.label,(inputId==="inputWater" && Number(control.value)>0 ? "+" : "")+Number(control.value).toLocaleString("vi-VN")+" "+unit,inputId+" label updates");
  }
  const track=await evaluate("(()=>{const input=document.getElementById('inputWater');input.scrollIntoView({block:'center'});const box=input.getBoundingClientRect();return {x:box.left+10+(box.width-20)*(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min)),end:box.left+box.width*.55,y:box.top+box.height/2,before:input.value};})()");
  await send("Input.dispatchMouseEvent",{type:"mousePressed",x:track.x,y:track.y,button:"left",buttons:1,clickCount:1});
  for(let step=1;step<=8;step++) await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:track.x+(track.end-track.x)*step/8,y:track.y,buttons:1});
  await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:track.end,y:track.y,button:"left",buttons:0,clickCount:1});
  const dragged=await evaluate("({value:document.getElementById('inputWater').value,label:document.getElementById('valWater').textContent})");
  assert.notEqual(dragged.value,track.before,"Mouse drag changes the water depth");
  assert.equal(dragged.label,"+"+Number(dragged.value).toLocaleString("vi-VN")+" cm","Mouse drag updates the visible measurement");
  console.log(JSON.stringify({dragged}));
  mkdirSync(resolve("../output"),{recursive:true});
  await evaluate("document.getElementById('scenarioForm').scrollIntoView({block:'start'})");
  writeFileSync(resolve("../output/simulation-controls-values.png"),Buffer.from((await send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  writeFileSync(resolve("../output/mach-dong-brand.png"),Buffer.from((await send("Page.captureScreenshot",{format:"png",clip:{x:0,y:await evaluate("window.scrollY"),width:232,height:64,scale:2}})).data,"base64"));
  if(!controlsOnly) {
  await evaluate("document.querySelector('[name=stage]').value='panicle';document.querySelector('[name=stage]').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('scenarioForm').requestSubmit()");
  await until("!document.getElementById('explainReport').disabled");
  await evaluate("document.getElementById('explainReport').click()");
  await until("Boolean(window.qaAdvicePayload)");
  await delay(2200);
  const waiting=await evaluate("({report:document.getElementById('reportAdviceElapsed').textContent,preview:document.getElementById('previewAdviceElapsed').textContent,hidden:document.getElementById('reportAdviceWait').hidden,payload:window.qaAdvicePayload})");
  console.log(JSON.stringify({waiting,errors}));
  if(errorAdvice) {
    assert.equal(waiting.hidden,true,"A failed request must not look pending");
    assert.equal(await evaluate("document.getElementById('reportAdviceCard').getAttribute('aria-busy')"),"false");
    await evaluate("document.getElementById('open-advice').click()");await delay(800);
    assert.equal(await evaluate("document.getElementById('previewAdviceWait').hidden"),true,"The dialog must not show a fake clock after 429");
    assert.equal(await evaluate("window.qaAdviceRequests"),1,"Opening the failed advice does not retry automatically");
    assert.equal(await evaluate("document.querySelector('[data-retry-advice]').hidden"),false,"Retry is available inside the dialog");
    await evaluate("document.querySelector('[data-retry-advice]').click()");await delay(800);
    assert.equal(await evaluate("window.qaAdviceRequests"),2,"An explicit click retries exactly once");
    writeFileSync(resolve("../output/co-ma-advice-error-state.png"),Buffer.from((await send("Page.captureScreenshot",{format:"png"})).data,"base64"));
    await evaluate("document.getElementById('sim-advice-dialog').close()");
  } else {
  assert.match(waiting.report,/0:0[2-9]/,"Report elapsed clock advances");
  assert.equal(waiting.preview,waiting.report,"Dialog elapsed clock stays in sync");
  if(realAdvice) {
    await until("document.getElementById('reportExplanation').textContent.length>100 || document.getElementById('reportAdviceCard').classList.contains('is-error')",270000);
    const advice=await evaluate("({reply:document.getElementById('reportExplanation').textContent,error:document.getElementById('reportAdviceCard').classList.contains('is-error'),status:document.getElementById('reportExplanationStatus').textContent,waiting:!document.getElementById('reportAdviceWait').hidden})");
    console.log(JSON.stringify({realAdvice:advice}));
    assert.equal(advice.error,false,advice.status);assert.equal(advice.waiting,false,"Real reply finishes the pending state");
    assert.ok(advice.reply.length>100,"Actual API advice is visible");
  }
  await evaluate("document.getElementById('open-advice').click()");
  const output=resolve(realAdvice ? "../output/co-ma-advice-real-ui.png" : "../output/simulation-controls-fixed.png");mkdirSync(resolve("../output"),{recursive:true});
  writeFileSync(output,Buffer.from((await send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  if(!realAdvice) {
  await evaluate("document.getElementById('previewAdviceCancel').click()");
  assert.equal(await evaluate("document.getElementById('reportAdviceWait').hidden && document.getElementById('previewAdviceWait').hidden"),true,"Stop hides both pending cards");
  await evaluate("document.getElementById('sim-advice-dialog').close();document.getElementById('explainReport').click()");
  await delay(1100);
  await evaluate("document.getElementById('editScenario').click();document.getElementById('inputSalinity').focus()");
  await send("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
  await send("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
  const changed=await evaluate("({value:document.getElementById('inputSalinity').value,label:document.getElementById('valSalinity').textContent,waiting:!document.getElementById('reportAdviceWait').hidden,disabled:document.getElementById('explainReport').disabled})");
  assert.equal(changed.label,Number(changed.value).toLocaleString("vi-VN")+" g/L","Slider updates during pending advice");
  assert.equal(changed.waiting,false,"Editing parameters cancels the previous advice clock");
  assert.equal(changed.disabled,true,"Previous advice cannot be requested for edited parameters");
  } else await evaluate("document.getElementById('sim-advice-dialog').close()");
  }
  }
  await evaluate("document.getElementById('btnReset').click()");
  assert.equal(await evaluate("document.getElementById('valWater').textContent"),"+4,5 cm","Reset synchronizes the water label");
  await evaluate("document.getElementById('lowerSalt').click()");
  assert.equal(await evaluate("document.getElementById('valSalinity').textContent"),"1 g/L","Quick salinity action updates the label");
  assert.deepEqual(errors,[],"No uncaught browser exceptions");
  console.log(JSON.stringify({status:"passed",mode:errorAdvice ? "error-ui" : realAdvice ? "real-api" : controlsOnly ? "drawing-module-blocked" : "full",output:resolve("../output")}));
  }
} catch(error) {
  console.error(JSON.stringify({message:error.message,errors}));
  throw error;
} finally {
  if(socket?.readyState===1 && process.env.MACH_DONG_QA_REGISTER_ONLY !== "1") {
    try {await evaluate("fetch('/api/auth/logout',{method:'POST',headers:{'X-CSRF-Token':document.querySelector('meta[name=csrf-token]')?.content || ''}}).then(()=>true)");}catch{}
    socket.close();
  }
  if(socket?.readyState===1) socket.close();
  browser.kill();
}
