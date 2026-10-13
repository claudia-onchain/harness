#!/usr/bin/env node
// npm run build: install + build the dashboard (dashboard/dist), tolerating a missing dashboard folder.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
if (!existsSync(join(root, "dashboard", "package.json"))) {
  console.log("dashboard/ not found: nothing to build (the CLI works without it; the server shows a placeholder page).");
  process.exit(0);
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const step = (args) => {
  console.log(`$ npm ${args.join(" ")}`);
  const r = spawnSync(npm, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
// `ci` on CI for a lockfile-exact install; `install` locally so an existing dashboard/node_modules is reused.
step(["--prefix", "dashboard", process.env.CI && existsSync(join(root, "dashboard", "package-lock.json")) ? "ci" : "install", "--no-audit", "--no-fund"]);
step(["--prefix", "dashboard", "run", "build"]);
console.log("✓ dashboard built → dashboard/dist");
