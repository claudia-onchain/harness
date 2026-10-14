import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpHome } from "./helpers.js";
import { createLogger, LEVELS } from "../src/core/log.js";

const lines = (f) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("writes JSONL under PULSE_HOME/logs, honours level, child context, errors", (t) => {
  const home = tmpHome(t);
  const log = createLogger({ level: "info", clock: () => new Date("2026-10-14T10:00:00Z") });
  log.debug("hidden");
  log.info("hello", { a: 1 });
  const child = log.child({ routine: "rt_1" });
  child.warn("careful", { posts: 3 });
  child.child({ run: "run_1" }).error("boom", new Error("bad"));
  assert.equal(log.file, join(home, "logs", "pulse.log"));
  const ls = lines(log.file);
  assert.equal(ls.length, 3);
  assert.deepEqual(ls[0], { ts: "2026-10-14T10:00:00.000Z", level: "info", msg: "hello", a: 1 });
  assert.equal(ls[1].routine, "rt_1");
  assert.equal(ls[1].posts, 3);
  assert.equal(ls[2].run, "run_1");
  assert.equal(ls[2].routine, "rt_1");
  assert.equal(ls[2].err.message, "bad");
  assert.ok(ls[2].err.stack);
  log.setLevel("debug");
  log.debug("now visible");
  assert.equal(lines(log.file).length, 4);
  assert.equal(LEVELS.warn > LEVELS.info, true);
});

test("rotates once past maxBytes", (t) => {
  tmpHome(t);
  const log = createLogger({ maxBytes: 300 });
  for (let i = 0; i < 10; i++) log.info("x".repeat(60), { i });
  assert.ok(existsSync(log.file + ".1"), "rotated file exists");
  const cur = lines(log.file);
  assert.ok(cur.length < 10 && cur.length > 0);
  assert.equal(cur.at(-1).i, 9);
});

test("console mirroring writes a coloured-or-plain line to the given stream", (t) => {
  tmpHome(t);
  const out = [];
  const stream = { isTTY: false, write: (s) => out.push(s) };
  const log = createLogger({ console: true, stream, clock: () => new Date("2026-10-14T10:11:12Z") });
  log.info("hi", { k: "v", n: 2 });
  log.error("bad", new Error("x"));
  assert.equal(out.length, 2);
  assert.ok(out[0].startsWith("10:11:12 info  hi k=v n=2"), out[0]);
  assert.ok(!out[0].includes("\x1b["), "no ANSI without a TTY");
  assert.match(out[1], /bad[\s\S]*Error: x/);
});
