import test from "node:test";
import assert from "node:assert/strict";
import {simulationController} from "../worker.mjs";

test("Windows download comes from cloud file storage",async()=> {
  const seen=[];
  const env={BUCKET:{get:async key=>{seen.push(key);return {body:new Blob(["exe"]).stream(),size:3,httpEtag:'"example"'};}}};
  const controller=new simulationController(env);
  const url="https://example.test/downloads/MachDong.exe";
  const response=await controller.handle(new Request(url));
  assert.equal(response.status,200);
  assert.equal(response.headers.get("content-disposition"),"attachment; filename=MachDong.exe");
  assert.equal(await response.text(),"exe");
  assert.deepEqual(seen,["releases/MachDong-v0.1.1.exe"]);
  const head=await controller.handle(new Request(url,{method:"HEAD"}));
  assert.equal(head.status,200);
  assert.equal(await head.text(),"");
  assert.equal((await controller.handle(new Request(url,{method:"POST"}))).status,405);
  assert.equal((await new simulationController({BUCKET:{get:async()=>null}}).handle(new Request(url))).status,404);
});
