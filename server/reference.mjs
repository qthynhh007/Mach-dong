import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const referenceNames = ["co-ma-knowledge.json","lua-man-ngap-sources.json","forum-source-posts.json","dbscl-man-muc-nuoc-2026.csv","long-huu-man-ngap-demo.csv","long-huu-man-ruong.csv","ba-tri-muc-nuoc.csv","go-cong-nhiet-do.csv","cu-lao-dung-do-ph.csv"];
export const referenceFiles = Object.fromEntries(referenceNames.map(name => [name,readFileSync(resolve(import.meta.dirname,"data/reference",name),"utf8")]));
