import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET = 25 * 1024;
const files = readdirSync("dist").filter((f) => f.endsWith(".js"));
const total = files.reduce((n, f) => n + gzipSync(readFileSync(`dist/${f}`)).length, 0);
console.log(`dist/*.js min+gzip: ${(total / 1024).toFixed(2)} KB (budget ${BUDGET / 1024} KB)`);
if (total > BUDGET) process.exit(1);
