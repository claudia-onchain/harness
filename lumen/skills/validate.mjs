#!/usr/bin/env node
// Validates every base skill and every chain template rendered against each registry mainnet.
//
//   node skills/validate.mjs            report, exit 1 on any error
//   node skills/validate.mjs --strict   warnings count as errors
//   node skills/validate.mjs --json     machine-readable summary
//   node skills/validate.mjs --quiet    only the summary lines
import { listBaseSkills, listChainTemplates, renderChainSkills, validateSkill, loadMainnets, CATEGORY_IDS, SKILLS_DIR } from "./lib.mjs";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const json = args.has("--json");
const quiet = args.has("--quiet");

const problems = []; // { where, level, msg }
const add = (where, level, msg, template) => problems.push({ where, level, msg, template });

// ── base skills ──
const base = listBaseSkills(SKILLS_DIR);
const names = new Map();
const byCategory = Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0]));
for (const s of base) {
  const res = validateSkill(s.markdown, { expectedName: s.slug, kind: "base" });
  for (const e of res.errors) add(`base/${s.slug}`, "error", e);
  for (const w of res.warnings) add(`base/${s.slug}`, "warn", w);
  const cat = res.data?.metadata?.category;
  if (cat === "chain") add(`base/${s.slug}`, "error", 'base skills cannot use category "chain"');
  if (cat in byCategory) byCategory[cat]++;
  if (names.has(s.slug)) add(`base/${s.slug}`, "error", "duplicate name");
  names.set(s.slug, `base/${s.slug}`);
}

// Related links must point at real skills (base slugs or chain template slugs).
const templates = listChainTemplates(SKILLS_DIR);
const templateSlugs = new Set(templates.map((t) => t.slug));
for (const s of base) {
  const rel = s.body.split(/\n## /).find((sec) => /^related/i.test(sec));
  if (!rel) continue;
  for (const m of rel.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)*)`/g)) {
    const slug = m[1];
    if (!names.has(slug) && !templateSlugs.has(slug) && !/^lumen$/.test(slug)) add(`base/${s.slug}`, "warn", `Related references unknown skill "${slug}"`);
  }
}

// Tool-call examples (`snake_name {`) must use tools that exist in Lumen's registry.
export const TOOL_ALLOWLIST = new Set([
  "get_balance", "get_price", "token_info", "chain_status", "gas", "tx_lookup", "address_activity", "resolve_address",
  "contract_abi", "read_contract", "nfts", "chainlink_feeds", "swap_quote", "execute_swap", "bridge_quote", "simulate_tx",
  "send_tx", "send_native", "send_token", "rpc_call", "defi_tvl", "defi_yields", "claudia_coin",
  "web_search", "web_fetch", "read_file", "write_file", "edit_file", "bash", "ask_user", "todo", "skill_load", "delegate",
  "memory_save", "memory_search", "generate_image", "generate_video", "generate_speech", "generate_music", "generate_sfx",
  "media_status", "screen_open", "screen_windows", "screen_show", "screen_capture", "screen_ui", "dashboard",
]);
function checkToolCalls(where, text) {
  for (const m of text.matchAll(/(?<![\w.$/-])([a-z][a-z0-9]*(?:_[a-z0-9]+)+) \{\s*["}]/g)) {
    if (!TOOL_ALLOWLIST.has(m[1])) add(where, "warn", `tool-call example uses unknown tool "${m[1]}"`);
  }
}
for (const s of base) checkToolCalls(`base/${s.slug}`, s.markdown);

// ── chain templates ──
const chains = await loadMainnets();
for (const t of templates) {
  if (!/^\{\{chain\.id\}\}-/.test((t.text.match(/^name:\s*"?([^"\n]+)"?/m) ?? [])[1] ?? "")) add(`chain-templates/${t.slug}.md`, "error", 'frontmatter name must start with "{{chain.id}}-"');
}
const rendered = renderChainSkills(SKILLS_DIR, chains);
for (const r of rendered) {
  const res = validateSkill(r.markdown, { expectedName: r.slug, kind: "chain", minLines: 50, maxLines: 150 });
  for (const e of res.errors) add(`chain/${r.slug}`, "error", e, r.template);
  for (const w of res.warnings) add(`chain/${r.slug}`, "warn", w, r.template);
  if (res.data?.metadata?.category && res.data.metadata.category !== "chain") add(`chain/${r.slug}`, "error", 'chain skills must use category "chain"');
  if (names.has(r.slug)) add(`chain/${r.slug}`, "error", `name collides with ${names.get(r.slug)}`);
  for (const m of r.markdown.matchAll(/(?<![\w.$/-])([a-z][a-z0-9]*(?:_[a-z0-9]+)+) \{\s*["}]/g)) {
    if (!TOOL_ALLOWLIST.has(m[1])) add(`chain/${r.slug}`, "warn", `tool-call example uses unknown tool "${m[1]}"`, r.template);
  }
  names.set(r.slug, `chain/${r.slug}`);
}

const errors = problems.filter((p) => p.level === "error");
const warnings = problems.filter((p) => p.level === "warn");
const failed = errors.length > 0 || (strict && warnings.length > 0);

if (json) {
  console.log(JSON.stringify({ base: base.length, byCategory, chainTemplates: templates.length, chains: chains.length, rendered: rendered.length, errors, warnings }, null, 2));
} else {
  if (!quiet) {
    // Collapse identical messages across many rendered chain skills.
    const groups = new Map();
    for (const p of problems) {
      const key = p.template ? `${p.level}|chain-templates/${p.template}.md|${p.msg.replace(/^\d+ lines/, "N lines")}` : `${p.level}|${p.where}|${p.msg}`;
      const g = groups.get(key) ?? { ...p, where: p.template ? `chain-templates/${p.template}.md` : p.where, count: 0 };
      g.count++;
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const tag = g.level === "error" ? "ERROR" : "warn ";
      console.log(`${tag} ${g.where}${g.count > 1 ? ` (x${g.count})` : ""}: ${g.msg}`);
    }
  }
  console.log(`base skills:      ${base.length}  (${Object.entries(byCategory).filter(([k]) => k !== "chain").map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`chain templates:  ${templates.length}`);
  console.log(`mainnet chains:   ${chains.length}`);
  console.log(`rendered:         ${rendered.length} chain skills`);
  console.log(`total skills:     ${base.length + rendered.length}`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)${failed ? " — FAILED" : " — ok"}`);
}
process.exit(failed ? 1 : 0);
