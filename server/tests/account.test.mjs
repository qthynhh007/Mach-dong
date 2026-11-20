import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {accountController} from "../auth.mjs";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const migration of ["0000_cloud_accounts.sql","0001_cloud_community.sql","0002_community_search.sql"])
    sqlite.exec(readFileSync(new URL(`../drizzle/${migration}`,import.meta.url),"utf8").replaceAll("--> statement-breakpoint", ""));
  return {
    prepare(sql) { return {
      bind(...params) { const statement = sqlite.prepare(sql);
        return {first:async()=>statement.get(...params) || null,
          all:async()=>({results:statement.all(...params)}),
          run:async()=>{const result=statement.run(...params);return {meta:{changes:result.changes}};}};
      }
    }; },
    async batch(statements) { sqlite.exec("BEGIN"); try { const results=[];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec("COMMIT"); return results;
    } catch(error) {sqlite.exec("ROLLBACK");throw error;} },
    raw:sqlite
  };
}

async function call(api,path,body,token,csrf) {
  const headers={};
  if (body !== undefined) headers["Content-Type"]="application/json";
  if (token) headers.Authorization=`Bearer ${token}`;
  if (csrf) headers["X-CSRF-Token"]=csrf;
  const request=new Request(`https://example.test${path}`,{method:body === undefined ? "GET":"POST",headers,
    body:body === undefined ? undefined : JSON.stringify(body)});
  const response=await api.handle(request);
  return {status:response.status,...await response.json()};
}

test("central accounts persist only password hashes and enforce session ownership",async()=>{
  const db=database(), api=new accountController({DB:db});
  const input={name:"Nông hộ A",username:"farmer_a",email:"a@example.test",phone:"+84912345678",
    password:"long-password-for-test",wallet_type:"EXTERNAL",wallet_address:"0x"+"1".repeat(40)};
  const register=await call(api,"/api/account/register",input);
  assert.equal(register.status,201);
  assert.equal(register.data.user.email_verified,false);
  assert.equal(register.data.user.role,"FARMER");
  const stored=db.raw.prepare("SELECT password_hash,password_salt,password_iterations FROM accounts").get();
  assert.notEqual(stored.password_hash,input.password);
  assert.equal(stored.password_hash.length,64);
  assert.equal(stored.password_iterations,600000);
  assert.equal((await call(api,"/api/account/login",{identifier:input.username,password:"wrong-password"})).status,401);
  const login=await call(api,"/api/account/login",{identifier:input.email,password:input.password});
  assert.equal(login.status,200);
  const token=login.data.session_token, csrf=login.data.csrf_token;
  assert.equal((await call(api,"/api/account/session",undefined,token)).data.user.user_id,register.data.user.user_id);
  assert.equal((await call(api,"/api/account/field-profile",undefined,token)).data.address,"");
  assert.equal((await call(api,"/api/account/field-profile",{address:"Long Hữu",cultivar:"OM5451",area:"1.2 ha",hydrology_station:"Ba Tri"},token,csrf)).data.address,"Long Hữu");
  assert.equal((await call(api,"/api/account/field-profile",undefined,token)).data.cultivar,"OM5451");
  assert.equal((await call(api,"/api/account/field-profile",{address:"Khác",cultivar:"",area:"",hydrology_station:""},token,"bad")).status,403);
  assert.equal((await call(api,"/api/account/profile",{name:"Updated"},token,"bad")).status,403);
  assert.equal((await call(api,"/api/account/profile",{name:"Updated"},token,csrf)).data.user.name,"Updated");
  const exchange=await call(api,"/api/account/exchange-credits",{direction:"AVAX_TO_CREDIT",amount:1},token,csrf);
  assert.equal(exchange.status,200);
  assert.equal(exchange.data.user.simulation_credits,103);
  assert.equal(exchange.data.user.avax_balance,1.5);
  const denied=await call(api,"/api/account/exchange-credits",{direction:"AVAX_TO_CREDIT",amount:10},token,csrf);
  assert.equal(denied.status,400);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM account_transactions").get().count,1);
  assert.equal((await call(api,"/api/account/logout",{},token,csrf)).status,200);
  assert.equal((await call(api,"/api/account/session",undefined,token)).status,401);
});

test("avatars live in cloud object storage and require the account session and CSRF", async()=>{
  const objects = new Map();
  const bucket = {
    async put(key, value) { objects.set(key, value); },
    async get(key) { const value=objects.get(key); return value ? {arrayBuffer:async()=>value.buffer} : null; },
  };
  const api = new accountController({DB:database(),BUCKET:bucket});
  const first = await call(api,"/api/account/register",{name:"Avatar A",username:"avatar_a",email:"avatar-a@example.test",phone:"+84912345678",password:"test-avatar-password"});
  const second = await call(api,"/api/account/register",{name:"Avatar B",username:"avatar_b",email:"avatar-b@example.test",phone:"+84912345679",password:"test-avatar-password"});
  const token=first.data.session_token, csrf=first.data.csrf_token;
  const image=readFileSync(new URL("fixtures/forum-photo.jpg",import.meta.url)).toString("base64");
  assert.equal((await call(api,"/api/account/avatar",{image},token,"bad")).status,403);
  assert.equal(objects.size,0);
  assert.equal((await call(api,"/api/account/avatar",{image},token,csrf)).status,200);
  assert.equal((await call(api,"/api/account/avatar",undefined,token)).data.image,image);
  assert.equal((await call(api,"/api/account/avatar",undefined,second.data.session_token)).data.image,null);
  assert.equal((await call(api,"/api/account/avatar",{image:"invalid"},token,csrf)).status,400);
  assert.equal((await call(api,"/api/account/avatar")).status,401);
});
