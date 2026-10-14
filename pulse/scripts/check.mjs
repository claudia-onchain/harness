#!/usr/bin/env node
// npm run check: `node --check` every JS file outside node_modules. No dependencies.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(name)) files.push(p);
  }
})(root);
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) { bad++; process.stderr.write(`✗ ${f}\n${r.stderr}`); }
}
console.log(bad ? `✗ ${bad} file(s) failed node --check` : `✓ node --check: ${files.length}/${files.length} files`);
process.exit(bad ? 1 : 0);
