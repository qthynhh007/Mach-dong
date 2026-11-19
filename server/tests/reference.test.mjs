import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.mjs";

test("published references are readable but allowlisted and immutable through API",async()=> {
  const base = "https://example.test/api/reference/";
  const csv = await worker.fetch(new Request(base+"dbscl-man-muc-nuoc-2026.csv"),{});
  assert.equal(csv.status,200);
  assert.match(csv.headers.get("content-type"),/^text\/csv/);
  assert.match(await csv.text(),/station_name/);
  const knowledge = await worker.fetch(new Request(base+"co-ma-knowledge.json"),{});
  assert.equal(knowledge.status,200);
  assert.ok(Array.isArray(JSON.parse(await knowledge.text()).sources));
  assert.equal((await worker.fetch(new Request(base+"secret.txt"),{})).status,404);
  assert.equal((await worker.fetch(new Request(base+"co-ma-knowledge.json",{method:"POST"}),{})).status,405);
});
