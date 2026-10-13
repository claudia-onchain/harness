// Offline tests for skills/lib.mjs: frontmatter parsing, template rendering and skill counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, renderTemplate, listBaseSkills, listChainTemplates, renderChainSkills, validateSkill, loadMainnets, NAME_RE } from "../skills/lib.mjs";

const evm = { id: "base", name: "Base", family: "evm", chainId: 8453, native: { symbol: "ETH", decimals: 18 }, alchemy: "base-mainnet", publicRpc: ["https://a", "https://b"], chainlink: "ethereum-mainnet-base-1", llama: "base", tags: ["l2", "op-stack"], testnet: false };
const sol = { id: "solana", name: "Solana", family: "solana", chainId: null, native: { symbol: "SOL", decimals: 9 }, chainlink: "solana-mainnet", tags: ["l1"], testnet: false };
const btc = { id: "bitcoin", name: "Bitcoin", family: "bitcoin", chainId: null, native: { symbol: "BTC", decimals: 8 }, chainlink: null, llama: "bitcoin", tags: ["l1", "utxo"], testnet: false };

test("parseFrontmatter: scalars, quotes, block scalars and nested metadata", () => {
  const md = [
    "---",
    "name: my-skill",
    'description: "Says \\"hi\\": when asked"',
    "summary: >",
    "  folded line one",
    "  line two",
    "notes: |-",
    "  keep",
    "  lines",
    "license: MIT",
    "metadata:",
    '  title: "A: B"',
    "  tags: a, b, c",
    "  version: '1.0.0'",
    "---",
    "# Body",
  ].join("\n");
  const { data, body, errors } = parseFrontmatter(md);
  assert.deepEqual(errors, []);
  assert.equal(data.name, "my-skill");
  assert.equal(data.description, 'Says "hi": when asked');
  assert.equal(data.summary, "folded line one line two\n");
  assert.equal(data.notes, "keep\nlines");
  assert.equal(data.metadata.title, "A: B");
  assert.equal(data.metadata.tags, "a, b, c");
  assert.equal(data.metadata.version, "1.0.0");
  assert.equal(body, "# Body");
});

test("parseFrontmatter: missing frontmatter is reported", () => {
  const r = parseFrontmatter("# just a body");
  assert.equal(r.errors.length, 1);
  assert.equal(r.body, "# just a body");
});

test("renderTemplate: substitution, arrays, missing values", () => {
  assert.equal(renderTemplate("{{chain.name}} {{chain.chainId}} {{chain.native.symbol}}", evm), "Base 8453 ETH");
  assert.equal(renderTemplate("{{chain.tags}}|{{chain.publicRpc.1}}|{{chain.nope.deep}}", evm), "l2, op-stack|https://b|");
});

test("renderTemplate: family sections and other", () => {
  const t = "{{#evm}}E{{/evm}}{{#solana}}S{{/solana}}{{#other}}O{{/other}}{{#bitcoin}}B{{/bitcoin}}";
  assert.equal(renderTemplate(t, evm), "E");
  assert.equal(renderTemplate(t, sol), "S");
  assert.equal(renderTemplate(t, btc), "OB");
});

test("renderTemplate: chainlink, inverted, tags and nesting", () => {
  const t = "{{#chainlink}}feed {{chain.chainlink}}{{/chainlink}}{{^chainlink}}dex{{/chainlink}}";
  assert.equal(renderTemplate(t, evm), "feed ethereum-mainnet-base-1");
  assert.equal(renderTemplate(t, btc), "dex");
  assert.equal(renderTemplate("{{#evm}}{{#op-stack}}OP{{/op-stack}}{{^l2}}L1{{/l2}}{{/evm}}", evm), "OP");
  assert.equal(renderTemplate("{{#evm}}{{#chainlink}}x{{/chainlink}}{{/evm}}", sol), "");
  assert.equal(renderTemplate("{{#testnet}}T{{/testnet}}{{#mainnet}}M{{/mainnet}}", evm), "M");
});

test("renderTemplate: lines holding only section tags disappear", () => {
  const t = "a\n{{#evm}}\nevm line\n{{/evm}}\n{{#solana}}\nsol line\n{{/solana}}\nb\n";
  assert.equal(renderTemplate(t, evm), "a\nevm line\nb\n");
  assert.equal(renderTemplate(t, sol), "a\nsol line\nb\n");
  assert.equal(renderTemplate(t, btc), "a\nb\n");
});

test("validateSkill catches structure, leftovers and secrets", () => {
  const good = `---\nname: ok-skill\ndescription: "Does a thing. Use when asked."\nlicense: MIT\nmetadata:\n  title: "Ok"\n  category: "build"\n  level: "beginner"\n  tags: "x"\n  version: "1.0.0"\n  updated: "2026-10-13"\n---\n\n# Ok\n\n## When to use\n- x\n\n## Steps\n\n1. **Do.** it\n\n## Check before you finish\n- [ ] y\n\n## Pitfalls\n- z\n\n## Related\n- \`rug-check\`\n`;
  assert.equal(validateSkill(good, { expectedName: "ok-skill" }).ok, true);
  assert.equal(validateSkill(good, { expectedName: "other" }).ok, false);
  assert.equal(validateSkill(good.replace("## Pitfalls", "## Gotchas")).ok, false);
  assert.equal(validateSkill(good.replace("- z", "- {{chain.name}}")).ok, false);
  assert.equal(validateSkill(good.replace("- z", `- key 0x${"ab".repeat(32)}`)).ok, false);
  assert.equal(validateSkill(good.replace("- z", "- sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).ok, false);
});

test("ships at least 100 base skills, all valid, with unique names", () => {
  const base = listBaseSkills();
  assert.ok(base.length >= 100, `expected >= 100 base skills, got ${base.length}`);
  const names = new Set();
  for (const s of base) {
    const r = validateSkill(s.markdown, { expectedName: s.slug, kind: "base" });
    assert.deepEqual(r.errors, [], `${s.slug}: ${r.errors.join("; ")}`);
    assert.ok(NAME_RE.test(s.slug));
    assert.ok(!names.has(s.slug));
    names.add(s.slug);
  }
});

test("20 chain templates render for every mainnet without errors", async () => {
  const templates = listChainTemplates();
  assert.equal(templates.length, 20);
  const chains = await loadMainnets();
  assert.ok(chains.length >= 40);
  const rendered = renderChainSkills(undefined, chains);
  assert.equal(rendered.length, templates.length * chains.length);
  const names = new Set(listBaseSkills().map((s) => s.slug));
  for (const r of rendered) {
    const v = validateSkill(r.markdown, { expectedName: r.slug, kind: "chain" });
    assert.deepEqual(v.errors, [], `${r.slug}: ${v.errors.join("; ")}`);
    assert.ok(!names.has(r.slug), `duplicate name ${r.slug}`);
    names.add(r.slug);
  }
});
