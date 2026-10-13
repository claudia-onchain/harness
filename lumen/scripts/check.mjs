#!/usr/bin/env node
// npm run check: `node --check` every .js/.mjs outside node_modules and dashboard, then the skill validator
// (skills/validate.mjs) and the dashboard typecheck when those exist.
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const SKIP = new Set(["node_modules", "dashboard", ".git", "dist", "coverage"]);
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    if (SKIP.has(f) || f.startsWith(".")) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(f)) files.push(p);
  }
})(root);

let failed = 0;
const run = (label, cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });
  if (r.status !== 0) { failed++; process.stdout.write(`✗ ${label}\n${r.stdout || ""}${r.stderr || ""}\n`); return false; }
  return true;
};

let syntaxOk = 0;
for (const f of files) {
  // JXA scripts (native/macos) are JavaScript for osascript: syntax-check them too, they're plain JS.
  if (run(`node --check ${relative(root, f)}`, process.execPath, ["--check", f])) syntaxOk++;
}
console.log(`${syntaxOk === files.length ? "✓" : "✗"} node --check: ${syntaxOk}/${files.length} files`);

if (existsSync(join(root, "skills", "validate.mjs"))) {
  if (run("skills/validate.mjs", process.execPath, [join(root, "skills", "validate.mjs")])) console.log("✓ skills/validate.mjs");
} else console.log("- skills/validate.mjs not present (skipped)");

const dpkg = join(root, "dashboard", "package.json");
if (existsSync(dpkg)) {
  const pkg = JSON.parse(readFileSync(dpkg, "utf8"));
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  if (!existsSync(join(root, "dashboard", "node_modules"))) console.log("- dashboard typecheck skipped (run npm run build first to install dashboard deps)");
  else if (pkg.scripts?.typecheck) { if (run("dashboard typecheck", npm, ["--prefix", "dashboard", "run", "typecheck"], { shell: process.platform === "win32" })) console.log("✓ dashboard typecheck"); }
  else if (existsSync(join(root, "dashboard", "tsconfig.json"))) { if (run("dashboard tsc --noEmit", npm, ["--prefix", "dashboard", "exec", "--", "tsc", "--noEmit", "-p", "."], { shell: process.platform === "win32" })) console.log("✓ dashboard tsc --noEmit"); }
} else console.log("- dashboard/ not present (typecheck skipped)");

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll checks passed.");
