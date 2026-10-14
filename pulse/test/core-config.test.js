import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpHome } from "./helpers.js";
import { ensureHome, getConfig, updateConfig, resetConfigCache, getKeys, mask, P, DEFAULTS, pulseHome } from "../src/core/config.js";

test("ensureHome creates PULSE_HOME and logs with mode 0700", (t) => {
  const home = tmpHome(t);
  assert.equal(pulseHome(), home);
  ensureHome();
  assert.ok(existsSync(P.logs));
  assert.equal((statSync(home).mode & 0o777).toString(8), "700");
});

test("config: defaults, deep-merge patch, persistence", (t) => {
  tmpHome(t); resetConfigCache();
  const c = getConfig();
  assert.equal(c.model.scan, "grok-4.3");
  assert.equal(c.model.judge, "grok-4.7");
  assert.equal(c.caps.runUsd, 0.4);
  assert.equal(c.caps.dayUsd, 5);
  assert.equal(c.telegram.chatId, null);
  assert.equal(c.http.port, 4800);
  const next = updateConfig({ caps: { dayUsd: 9 }, telegram: { chatId: "123" } });
  assert.equal(next.caps.dayUsd, 9);
  assert.equal(next.caps.runUsd, 0.4, "untouched sibling keeps its default");
  assert.equal(next.telegram.chatId, "123");
  const disk = JSON.parse(readFileSync(P.config, "utf8"));
  assert.deepEqual(disk, { caps: { dayUsd: 9 }, telegram: { chatId: "123" } }, "only the user layer is written");
  resetConfigCache();
  assert.equal(getConfig().caps.dayUsd, 9);
  assert.equal(DEFAULTS.caps.dayUsd, 5, "defaults are not mutated");
});

test("keys: set/get/delete/list, 0600, masking, env override and aliases", (t) => {
  tmpHome(t);
  const env = {};
  const keys = getKeys({ env });
  assert.equal(keys.get("xai"), null);
  assert.equal(keys.has("xai"), false);
  keys.set("grok", "xai-abcdefghijklmnop1234");
  assert.equal(keys.get("xai"), "xai-abcdefghijklmnop1234", "alias grok -> xai");
  assert.equal((statSync(P.keys).mode & 0o777).toString(8), "600");
  keys.set("telegram", "123456:ABCDEFGHIJKLMNOP");
  const list = keys.list();
  const xai = list.find((k) => k.id === "xai");
  assert.equal(xai.set, true);
  assert.equal(xai.masked, "xai-…1234");
  assert.equal(xai.source, "file");
  assert.ok(!JSON.stringify(list).includes("abcdefghijklmnop"), "list never leaks full values");
  assert.equal(list.find((k) => k.id === "http").set, false);
  env.XAI_API_KEY = "xai-fromenv00000000zzzz";
  assert.equal(keys.get("xai"), "xai-fromenv00000000zzzz");
  assert.equal(keys.list().find((k) => k.id === "xai").source, "env");
  delete env.XAI_API_KEY;
  assert.equal(keys.delete("xai"), true);
  assert.equal(keys.get("xai"), null);
  assert.equal(keys.delete("xai"), false);
  assert.throws(() => keys.set("xai", "  "), /empty/);
  assert.equal(mask("short"), "…••••");
  assert.equal(mask("123456:ABCDEFGHIJKLMNOP"), "1234…MNOP");
  assert.equal(mask(""), "");
  assert.equal(join(P.home, "keys.json"), keys.file);
});
