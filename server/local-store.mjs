// Explicit local development storage; production always uses hosted D1/R2.
import {DatabaseSync} from "node:sqlite";
import {mkdirSync,readFileSync,readdirSync,existsSync,writeFileSync,statSync} from "node:fs";
import {resolve,dirname,sep} from "node:path";
import {fileURLToPath} from "node:url";

export function localStorageBindings(stateDirectory) {
  mkdirSync(stateDirectory,{recursive:true});
  const sqlite=new DatabaseSync(resolve(stateDirectory,"cloud.sqlite3"));
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec("CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)");
  const migrationDirectory=fileURLToPath(new URL("./drizzle/",import.meta.url));
  for (const name of readdirSync(migrationDirectory).filter(name=>name.endsWith(".sql")).sort()) {
    if (!sqlite.prepare("SELECT 1 FROM local_migrations WHERE name=?").get(name)) {
      sqlite.exec("BEGIN");
      try { sqlite.exec(readFileSync(resolve(migrationDirectory,name),"utf8").replaceAll("--> statement-breakpoint","")); sqlite.prepare("INSERT INTO local_migrations(name) VALUES(?)").run(name); sqlite.exec("COMMIT"); }
      catch(error) {sqlite.exec("ROLLBACK");throw error;}
    }
  }
  const prepare=(sql,params=[])=>({bind:(...values)=>prepare(sql,values),
    first:async()=>sqlite.prepare(sql).get(...params) || null,
    all:async()=>({results:sqlite.prepare(sql).all(...params)}),
    run:async()=>({meta:{changes:sqlite.prepare(sql).run(...params).changes}})});
  const DB={prepare,async batch(statements) {
    sqlite.exec("BEGIN");try {const results=[];for(const statement of statements) results.push(await statement.run());sqlite.exec("COMMIT");return results;}
    catch(error){sqlite.exec("ROLLBACK");throw error;}
  }};
  const root=resolve(stateDirectory,"files");
  const pathFor=key=>{const path=resolve(root,key);if(!path.startsWith(root+sep))throw new Error("Invalid storage path");return path;};
  const BUCKET={async put(key,value){const path=pathFor(key);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,Buffer.from(value));},
    async get(key){const path=pathFor(key);if(!existsSync(path))return null;const data=readFileSync(path);return {body:data,size:statSync(path).size,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}};
  return {DB,BUCKET};
}
