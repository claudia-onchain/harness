import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tempHome } from "./helpers.js";

tempHome();
const { Skills } = await import("../src/skills/index.js");
const { mainnets } = await import("../src/chains/registry.js");
const { skillsDir } = await import("../src/core/paths.js");

const haveB = existsSync(join(skillsDir, "lib.mjs")) && existsSync(join(skillsDir, "base"));

test("skills loader: ≥100 base skills and templates × mainnets chain skills", { skip: !haveB && "skills/ not written yet" }, async () => {
  const sk = await new Skills().load({ cwd: "/nonexistent-dir-for-test" });
  const c = sk.counts;
  assert.ok(c.base >= 100, `base skills: ${c.base}`);
  assert.equal(c.chain, c.templates * mainnets().length);
  assert.ok(c.templates >= 1);
  const ex = sk.chain.find((s) => s.chain === "base");
  assert.ok(ex.slug.startsWith("base-"));
  assert.ok(!/\{\{/.test(ex.markdown), "templates are fully rendered");
  const idx = sk.promptIndex("base");
  assert.ok(idx.includes(ex.slug));
  assert.ok(!idx.includes(`- solana-${ex.template}:`), "other chains' skills are not in the prompt index");
  assert.ok(sk.list({ q: "swap" }).length > 0);
});

test("skills loader: rejects path traversal in skill_file", { skip: !haveB && "skills/ not written yet" }, async () => {
  const sk = await new Skills().load({ cwd: "/nonexistent-dir-for-test" });
  const s = sk.base[0];
  assert.throws(() => sk.file(s.slug, "../../package.json"), /escapes/);
});
