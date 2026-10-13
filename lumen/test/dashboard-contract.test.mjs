// Static checks that the dashboard implements the takeover contract in docs/CONTRACT.md (no browser needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "dashboard/src");

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
const source = existsSync(SRC) ? walk(SRC).map((p) => readFileSync(p, "utf8")).join("\n") : "";
const contract = readFileSync(join(ROOT, "docs/CONTRACT.md"), "utf8");

test("every UiCommand named in CONTRACT.md is registered by a studio", { skip: !source && "dashboard sources not present" }, () => {
  const section = contract.slice(contract.indexOf("`UiCommand`"), contract.indexOf("### Server → dashboard"));
  const names = [...section.matchAll(/^- `([a-z]+\.[A-Za-z]+)/gm)].map((m) => m[1]);
  assert.ok(names.length >= 10, "expected the contract to list UiCommands");
  for (const n of names) {
    if (n === "nav.go") { assert.ok(source.includes('"nav.go"'), "nav.go"); continue; }
    assert.ok(source.includes(`name: "${n}"`), `dashboard does not register UiCommand ${n}`);
  }
});

test("every takeover op from the contract is handled", { skip: !source && "dashboard sources not present" }, () => {
  for (const op of ["takeover_start", "takeover_end", "move", "click", "type", "drag", "highlight", "scroll", "command", "navigate", "snapshot"]) {
    assert.ok(source.includes(`case "${op}":`), `runner does not handle op ${op}`);
  }
  for (const t of ["ui_hello", "ui_result", "user_took_over", "data-agent-id"]) assert.ok(source.includes(t), `missing ${t}`);
});

test("dashboard speaks the server → dashboard message types", { skip: !source && "dashboard sources not present" }, () => {
  for (const t of ["ready", "user", "thinking", "delta", "tool_start", "tool_end", "turn_done", "error", "approval_request", "media_job", "notice", "agent_status", "ui"]) {
    assert.ok(source.includes(`case "${t}":`), `agent store does not handle ${t}`);
  }
});

test("dashboard package pins the researched library versions", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "dashboard/package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal(deps.tone, "15.1.22");
  assert.equal(deps["wavesurfer.js"], "8.0.2");
  assert.equal(deps.konva, "10.8.0");
  assert.equal(deps["react-konva"], "19.3.0");
  assert.equal(deps["@ffmpeg/ffmpeg"], "0.12.15");
  assert.equal(deps["@ffmpeg/core"], "0.12.10");
  assert.ok(pkg.scripts.build.includes("tsc --noEmit"));
});
