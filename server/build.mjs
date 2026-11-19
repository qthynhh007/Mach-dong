import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = file => readFileSync(resolve(root,file),"utf8");
const catalog = JSON.parse(read("data/catalog.json"));
const history = JSON.parse(read("data/weather-history.json"));
const forumSeed = JSON.parse(read("data/forum-seed.json"));
if (history.rowCount !== history.locations.reduce((sum,location) => sum+location.rows.length,0)) throw new Error("History count mismatch");
const manifest = JSON.parse(read(".openai/hosting.json"));
if (!manifest.project_id) throw new Error("Missing Site ID");
const files = ["model.mjs","engine.mjs","weather.mjs","ai.mjs","auth.mjs","community.mjs","worker.mjs"];
const bundled = files.map(file => read(file).replace(/^import .*;\r?\n/gm,"").replace(/^export class /gm,"class ")).join("\n");
mkdirSync(resolve(root,"dist/server"),{recursive:true});
mkdirSync(resolve(root,"dist/.openai"),{recursive:true});
writeFileSync(resolve(root,"dist/server/index.js"),`const catalog = ${JSON.stringify(catalog)};\nconst history = ${JSON.stringify(history)};\nconst forumSeed = ${JSON.stringify(forumSeed)};\n${bundled}`);
copyFileSync(resolve(root,".openai/hosting.json"),resolve(root,"dist/.openai/hosting.json"));
console.log(`Built ${history.rowCount} weather rows and ${catalog.sources.length} sources.`);
