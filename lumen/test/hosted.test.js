import { test } from "node:test";
import assert from "node:assert/strict";
import { hostedConfig, hostedHostOk } from "../src/server/hosted.js";
import { createGuards } from "../src/server/http.js";

const req = (headers) => ({ headers });

test("hosted mode is off unless LUMEN_HOSTED or REPL_ID is set", () => {
  assert.equal(hostedConfig({}), null);
  assert.ok(hostedConfig({ LUMEN_HOSTED: "1" }));
  assert.ok(hostedConfig({ REPL_ID: "x" }));
});

test("hosted guards accept the Replit domain directly and via X-Forwarded-Host, and reject others", () => {
  const cfg = hostedConfig({ REPL_ID: "x", REPLIT_DEV_DOMAIN: "abc.kirk.replit.dev" });
  assert.ok(hostedHostOk(cfg, "abc.kirk.replit.dev:443"));
  assert.ok(!hostedHostOk(cfg, "evil.com"));
  const g = createGuards(4747, "t".repeat(32), cfg);
  assert.ok(g.hostOk(req({ host: "abc.kirk.replit.dev" })));
  assert.ok(g.hostOk(req({ host: "0.0.0.0:4747", "x-forwarded-host": "abc.kirk.replit.dev" })));
  assert.ok(!g.hostOk(req({ host: "0.0.0.0:4747", "x-forwarded-host": "evil.com" })));
  assert.ok(g.originOk(req({ host: "abc.kirk.replit.dev", origin: "https://abc.kirk.replit.dev" })));
  assert.ok(!g.originOk(req({ host: "abc.kirk.replit.dev", origin: "https://other.replit.dev" })));
  assert.match(g.cookie(), /Secure; SameSite=None/);
});

test("local guards stay strict: no forwarded hosts, SameSite=Strict", () => {
  const g = createGuards(4747, "t".repeat(32), null);
  assert.ok(!g.hostOk(req({ host: "0.0.0.0:4747", "x-forwarded-host": "abc.kirk.replit.dev" })));
  assert.ok(!g.originOk(req({ host: "127.0.0.1:4747", origin: "https://abc.kirk.replit.dev" })));
  assert.match(g.cookie(), /SameSite=Strict/);
});
