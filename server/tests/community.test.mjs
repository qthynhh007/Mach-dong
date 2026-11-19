import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {communityController} from "../community.mjs";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const migration of ["0000_cloud_accounts.sql","0001_cloud_community.sql","0002_community_search.sql"])
    sqlite.exec(readFileSync(new URL(`../drizzle/${migration}`,import.meta.url),"utf8").replaceAll("--> statement-breakpoint",""));
  const prepare = (sql,params = []) => ({
    bind(...values) { return prepare(sql,values); },
    async first() { return sqlite.prepare(sql).get(...params) || null; },
    async all() { return {results:sqlite.prepare(sql).all(...params)}; },
    async run() { const value = sqlite.prepare(sql).run(...params); return {meta:{changes:value.changes}}; }
  });
  return {prepare,async batch(statements) {
    sqlite.exec("BEGIN");
    try { const result=[]; for (const statement of statements) result.push(await statement.run()); sqlite.exec("COMMIT"); return result; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },raw:sqlite};
}

function account(db,id) {
  const token = id.repeat(64),csrf = `csrf-${id}`;
  db.raw.prepare("INSERT INTO accounts(user_id,username,name,email,phone,password_hash,password_salt,password_iterations,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(id,`farmer_${id}`,`Nông hộ ${id}`,`${id}@example.test`,"+84912345678","hash","salt",600000,1);
  db.raw.prepare("INSERT INTO account_sessions(token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)")
    .run(createHash("sha256").update(token).digest("hex"),id,csrf,Math.floor(Date.now()/1000)+3600,1);
  return {token,csrf};
}

async function call(api,path,method = "GET",body,account) {
  const headers = {};
  if (account) { headers.Authorization = `Bearer ${account.token}`; headers["X-CSRF-Token"] = account.csrf; }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await api.handle(new Request(`https://example.test${path}`,{method,headers,body:body === undefined ? undefined : JSON.stringify(body)}));
  return {status:response.status,...await response.json()};
}

test("forum persists centrally across two sessions and checks ownership",async () => {
  const db = database(),objects = new Map(),bucket = {
    async put(key,value) { objects.set(key,value); },
    async get(key) { const value = objects.get(key); return value ? {body:value} : null; }
  };
  const first = account(db,"a"),second = account(db,"b");
  const apiA = new communityController({DB:db,BUCKET:bucket});
  const apiB = new communityController({DB:db,BUCKET:bucket});
  const seededSearch = await call(apiA,"/api/community/posts?q=muong","GET");
  assert.ok(seededSearch.data.total > 0);
  const input = {title:"Ruộng lúa OM5451",body:"Cần hỏi về mực nước ruộng",topic:"water",cultivar:"OM5451",stage:"Đẻ nhánh",photos:[],requestId:"request-a-123"};
  assert.equal((await call(apiA,"/api/community/posts","POST",input)).status,401);
  const made = await call(apiA,"/api/community/posts","POST",input,first);
  assert.equal(made.status,201);
  const id = made.data.id;
  assert.equal((await call(apiA,"/api/community/posts","POST",input,first)).data.id,id);
  const list = await call(apiB,"/api/community/posts?pageSize=30","GET",undefined,second);
  assert.equal(list.data.items.some(post => post.id === id),true);
  assert.equal((await call(apiB,"/api/community/posts?q=lua%20om5451","GET",undefined,second)).data.items.some(post => post.id === id),true);
  assert.equal((await call(apiB,`/api/community/posts/${id}`,"PATCH",{...input,version:1},second)).status,403);
  const reply = await call(apiB,`/api/community/posts/${id}/replies`,"POST",{body:"Hãy đo tại ruộng",requestId:"reply-b-123"},second);
  assert.equal(reply.status,201);
  const voted = await call(apiA,`/api/community/posts/${id}/replies/${reply.data.id}/vote`,"PUT",{active:true},first);
  assert.equal(voted.data.score,1);
  const accepted = await call(apiA,`/api/community/posts/${id}/accepted-reply`,"PUT",{replyId:reply.data.id,version:1},first);
  assert.equal(accepted.data.acceptedReplyId,reply.data.id);
  const detail = await call(apiB,`/api/community/posts/${id}`,"GET",undefined,second);
  assert.equal(detail.data.replies[0].isAccepted,true);
  const draft = await call(apiA,"/api/community/draft","PUT",{...input,title:"Bản nháp",version:0},first);
  assert.equal(draft.data.version,1);
  assert.equal((await call(apiB,"/api/community/draft","GET",undefined,second)).data.payload,null);
  assert.equal((await call(apiA,"/api/community/draft","GET",undefined,first)).data.payload.title,"Bản nháp");
  assert.equal((await call(apiA,`/api/community/posts/${id}`,"DELETE",{version:2},first)).data.deleted,true);
  assert.equal((await call(apiB,`/api/community/posts/${id}`,"GET",undefined,second)).status,404);
});

test("forum photos are stored in R2 rather than the D1 post row",async () => {
  const db = database(),objects = new Map(),bucket = {
    async put(key,value) { objects.set(key,value); },
    async get(key) { const value = objects.get(key); return value ? {body:value} : null; }
  },member = account(db,"c"),api = new communityController({DB:db,BUCKET:bucket});
  const image = readFileSync(new URL("./fixtures/forum-photo.jpg",import.meta.url));
  const input = {title:"Ảnh ruộng",body:"Quan sát tại ruộng",topic:"field-alert",cultivar:"OM5451",stage:"Mạ non",photos:[`data:image/jpeg;base64,${image.toString("base64")}`],requestId:"photo-c-123"};
  const made = await call(api,"/api/community/posts","POST",input,member);
  assert.equal(made.status,201);
  assert.match(made.data.photos[0],/^https:\/\/example\.test\/api\/community\/photos\/[0-9a-f-]{36}$/);
  assert.equal(db.raw.prepare("SELECT photos FROM community_posts WHERE id=?").get(made.data.id).photos.includes("base64"),false);
  assert.equal(objects.size,1);
  const response = await api.handle(new Request(made.data.photos[0]));
  assert.equal(response.headers.get("content-type"),"image/jpeg");
  assert.equal((await response.arrayBuffer()).byteLength,image.length);
});
