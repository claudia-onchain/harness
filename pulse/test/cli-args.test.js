import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, parseDuration, parseClock, parseList } from "../src/cli/args.js";

test("parseArgs: positionals, --key value, --key=value, --flag, -p, negative values, --", () => {
  const { flags, pos } = parseArgs(["watch", "add", "SOL", "--handles", "a,b", "--every=15m", "--video", "--chat", "-1001234", "--cap", "0.4", "-m", "grok-4.3", "--json", "--", "--literal"]);
  assert.deepEqual(pos, ["watch", "add", "SOL", "--literal"]);
  assert.equal(flags.handles, "a,b");
  assert.equal(flags.every, "15m");
  assert.equal(flags.video, true);
  assert.equal(flags.chat, "-1001234", "negative chat ids are values, not flags");
  assert.equal(flags.cap, "0.4");
  assert.equal(flags.model, "grok-4.3");
  assert.equal(flags.json, true);
});

test("parseArgs: trailing flag without value, booleans before positionals, --no-x, -h", () => {
  const a = parseArgs(["cost", "--today", "--routine", "rt_1", "--days"]);
  assert.equal(a.flags.today, true);
  assert.equal(a.flags.routine, "rt_1");
  assert.equal(a.flags.days, true);
  const b = parseArgs(["--once", "rt_1", "run"]);
  assert.equal(b.flags.once, "rt_1");
  assert.deepEqual(b.pos, ["run"]);
  assert.equal(parseArgs(["-h"]).flags.help, true);
  assert.equal(parseArgs(["--no-color", "x"]).flags["no-color"], true);
  assert.equal(parseArgs(["--help", "watch"]).pos[0], "watch");
});

test("parseDuration / parseClock / parseList", () => {
  assert.equal(parseDuration("15m"), 15);
  assert.equal(parseDuration("15"), 15);
  assert.equal(parseDuration("2h"), 120);
  assert.equal(parseDuration("90s"), 1.5);
  assert.equal(parseDuration("1d"), 1440);
  assert.equal(parseDuration("0m"), null);
  assert.equal(parseDuration("soon"), null);
  assert.equal(parseClock("07:30"), "07:30");
  assert.equal(parseClock("7:30"), "07:30");
  assert.equal(parseClock("0730"), "07:30");
  assert.equal(parseClock("24:00"), null);
  assert.equal(parseClock("x"), null);
  assert.deepEqual(parseList("a, b ,,c,a"), ["a", "b", "c"]);
  assert.deepEqual(parseList(["x", " y "]), ["x", "y"]);
  assert.deepEqual(parseList(undefined), []);
});
