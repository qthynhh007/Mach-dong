import {readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";

const directory=fileURLToPath(new URL("../src/static/",import.meta.url));
const files=readdirSync(directory,{recursive:true}).filter(name=>name.endsWith(".js"));
let failed=false;
for(const name of files){
  const result=spawnSync(process.execPath,["--check",resolve(directory,name)],{encoding:"utf8"});
  if(result.status!==0){failed=true;process.stderr.write(result.stderr || `Could not check ${name}\n`);}
}
if(failed) process.exitCode=1;
else console.log(`Checked syntax for ${files.length} client JavaScript files.`);
