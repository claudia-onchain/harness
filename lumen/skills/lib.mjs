// Lumen skills library. Dependency-free, Node >= 22, ESM.
//
// Shared by the CLI skill loader (src/skills/), skills/validate.mjs and the tests.
//
//   parseFrontmatter(text)            -> { data, body, errors }
//   renderTemplate(text, chain)       -> string
//   listBaseSkills(root)              -> [{ slug, dir, path, markdown, data, body }]
//   listChainTemplates(root)          -> [{ slug, path, text }]
//   renderChainSkills(root, chains)   -> [{ slug, chain, template, name, markdown }]
//   validateSkill(markdown, opts?)    -> { ok, errors, warnings }
//
// `root` may be the skills/ directory itself or the repo root that contains skills/.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));

export const CATEGORIES = [
  { id: "crypto-core", title: "Crypto core", summary: "Wallets, research, safety, swaps, bridges, oracles and dev flow across every chain." },
  { id: "build", title: "Build", summary: "Research, code, debug, test, automate, deploy and run agents." },
  { id: "create", title: "Create", summary: "Images, photo, video, music, audio and social content in the Lumen studios." },
  { id: "lumen", title: "Lumen", summary: "Using Lumen itself: keys, models, personas, dashboard, takeover, plugins and safety." },
  { id: "chain", title: "Chain", summary: "Per-chain skills rendered from skills/chain-templates for every mainnet." },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const LEVELS = ["beginner", "intermediate", "advanced"];

/** H2 headings every skill needs (matched case-insensitively by prefix). */
export const REQUIRED_SECTIONS = ["When to use", "Steps", "Check before you finish", "Pitfalls", "Related"];
export const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REQUIRED_META = ["title", "category", "level", "tags", "version", "updated"];

export const SECRET_RULES = [
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, "looks like an Anthropic API key"],
  [/\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{24,}/, "looks like an sk- secret key"],
  [/(?<![0-9a-zA-Z])0x[0-9a-fA-F]{64}(?![0-9a-zA-Z])/, "64-hex string (possible private key)"],
  [/(?<![A-Za-z0-9])[1-9A-HJ-NP-Za-km-z]{87,88}(?![A-Za-z0-9])/, "88-char base58 string (possible Solana secret key)"],
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, "private key block"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "looks like a Google API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "looks like a GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "looks like an AWS access key id"],
];

// ─── Frontmatter ────────────────────────────────────────────────────────────────────────────────
// YAML subset: `key: scalar` (plain, "double", 'single'), block scalars (> >- | |-), and one level of
// nested `key:` maps (e.g. metadata). Comments and blank lines are skipped.

function unquote(raw) {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s
      .slice(1, -1)
      .replace(/\\(["\\/nt])/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  // strip trailing comment on plain scalars
  const hash = s.search(/\s#/);
  return hash >= 0 ? s.slice(0, hash).trimEnd() : s;
}

function blockScalar(indicator, lines) {
  const nonEmpty = lines.filter((l) => l.trim());
  const ind = nonEmpty.length ? Math.min(...nonEmpty.map((l) => l.length - l.trimStart().length)) : 0;
  const ls = lines.map((l) => l.slice(ind));
  let text;
  if (indicator.startsWith("|")) text = ls.join("\n");
  else {
    text = "";
    for (const l of ls) {
      if (l === "") text += "\n";
      else text += (text && !text.endsWith("\n") ? " " : "") + l;
    }
  }
  if (indicator.endsWith("-")) return text.replace(/\n+$/, "");
  if (indicator.endsWith("+")) return `${text}\n`;
  return `${text.replace(/\n+$/, "")}\n`;
}

/** Split `---` frontmatter from the body and parse it. Returns { data, body, errors }. */
export function parseFrontmatter(text) {
  const src = String(text ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const errors = [];
  if (!src.startsWith("---\n")) return { data: {}, body: src, errors: ["missing frontmatter (file must start with ---)"] };
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: src, errors: ["frontmatter has no closing ---"] };
  const fm = src.slice(4, end + 1);
  const nl = src.indexOf("\n", end + 4);
  const body = nl === -1 ? "" : src.slice(nl + 1);
  const lines = fm.split("\n");
  const data = {};

  const readIndented = (start) => {
    const out = [];
    let i = start;
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === "") { out.push(""); continue; }
      if (!/^\s/.test(l)) break;
      out.push(l);
    }
    while (out.length && out[out.length - 1] === "") { out.pop(); }
    return { block: out, next: start + out.length };
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trimStart().startsWith("#")) { i++; continue; }
    const m = /^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/.exec(raw);
    if (!m) { errors.push(`cannot parse frontmatter line: ${raw.slice(0, 60)}`); i++; continue; }
    const key = m[1];
    const rest = (m[2] ?? "").trim();
    if (key in data) errors.push(`duplicate key "${key}"`);
    if (rest === "") {
      const { block, next } = readIndented(i + 1);
      const map = {};
      for (let k = 0; k < block.length; k++) {
        const l = block[k];
        if (!l.trim() || l.trim().startsWith("#")) continue;
        const cm = /^\s+([A-Za-z0-9_.-]+):(?:[ \t]+(.*))?$/.exec(l);
        if (!cm) { errors.push(`cannot parse "${key}" entry: ${l.trim().slice(0, 50)}`); continue; }
        const v = (cm[2] ?? "").trim();
        if (/^[|>][-+]?$/.test(v)) {
          // block scalar inside the nested map: lines more indented than this child
          const childInd = l.length - l.trimStart().length;
          const sub = [];
          let j = k + 1;
          for (; j < block.length; j++) {
            const s = block[j];
            if (s.trim() && s.length - s.trimStart().length <= childInd) break;
            sub.push(s);
          }
          map[cm[1]] = blockScalar(v, sub);
          k = j - 1;
        } else map[cm[1]] = unquote(v);
      }
      data[key] = map;
      i = next;
    } else if (/^[|>][-+]?$/.test(rest)) {
      const { block, next } = readIndented(i + 1);
      data[key] = blockScalar(rest, block);
      i = next;
    } else {
      data[key] = unquote(rest);
      i++;
    }
  }
  return { data, body, errors };
}

// ─── Templates ──────────────────────────────────────────────────────────────────────────────────
// {{chain.path.to.field}}  value substitution (missing -> "", arrays joined with ", ")
// {{#name}}…{{/name}}      section, rendered when the condition is true
// {{^name}}…{{/name}}      inverted section
// Conditions: evm, solana, other (neither evm nor solana), testnet, mainnet, chainlink, a family name
// (bitcoin, sui, aptos, tron, starknet), any truthy chain field (alchemy, llama, ...) or a chain tag (l2, zk, op-stack ...).

const FAMILIES = new Set(["evm", "solana", "bitcoin", "sui", "aptos", "tron", "starknet"]);

function sectionTrue(name, chain) {
  const c = chain ?? {};
  if (name === "evm" || name === "solana") return c.family === name;
  if (name === "other") return c.family !== "evm" && c.family !== "solana";
  if (name === "testnet") return Boolean(c.testnet);
  if (name === "mainnet") return !c.testnet;
  if (FAMILIES.has(name)) return c.family === name;
  if (Object.prototype.hasOwnProperty.call(c, name)) {
    const v = c[name];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  }
  return Array.isArray(c.tags) && c.tags.includes(name);
}

function lookup(path, chain) {
  const parts = path.split(".");
  if (parts[0] !== "chain") return undefined;
  let v = chain;
  for (const p of parts.slice(1)) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

function fmtValue(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(fmtValue).join(", ");
  if (typeof v === "object") return "";
  return String(v);
}

/** Render a chain template. Section tags alone on a line remove that whole line. */
export function renderTemplate(text, chain) {
  let src = String(text ?? "").replace(/\r\n?/g, "\n");
  // Standalone section tags: a line containing only section tags (and spaces) collapses to just the tags.
  src = src.replace(/^[ \t]*((?:\{\{[#^/][\w-]+\}\}[ \t]*)+)(\n|$)/gm, (_, tags) => tags.replace(/[ \t]+/g, ""));

  const tagRe = /\{\{([#^/])([\w-]+)\}\}/g;
  let out = "";
  let last = 0;
  const stack = []; // { name, visible }
  let visible = true;
  for (let m; (m = tagRe.exec(src)); ) {
    if (visible) out += src.slice(last, m.index);
    last = m.index + m[0].length;
    const [, kind, name] = m;
    if (kind === "/") {
      // close the nearest open section with this name
      let idx = -1;
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name === name) { idx = k; break; }
      if (idx === -1) continue; // stray close tag: drop it
      stack.length = idx;
      visible = stack.length ? stack[stack.length - 1].visible : true;
    } else {
      const cond = sectionTrue(name, chain);
      const vis = visible && (kind === "#" ? cond : !cond);
      stack.push({ name, visible: vis });
      visible = vis;
    }
  }
  if (visible) out += src.slice(last);
  return out.replace(/\{\{\s*(chain(?:\.[\w-]+)+)\s*\}\}/g, (_, p) => fmtValue(lookup(p, chain)));
}

// ─── Discovery ──────────────────────────────────────────────────────────────────────────────────

function skillsRoot(root) {
  const r = resolve(root ?? SKILLS_DIR);
  if (existsSync(join(r, "base")) || existsSync(join(r, "chain-templates"))) return r;
  if (existsSync(join(r, "skills"))) return join(r, "skills");
  return r;
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** Every skills/base/<slug>/SKILL.md, sorted by slug. */
export function listBaseSkills(root) {
  const base = join(skillsRoot(root), "base");
  if (!isDir(base)) return [];
  const out = [];
  for (const slug of readdirSync(base).sort()) {
    const dir = join(base, slug);
    const path = join(dir, "SKILL.md");
    if (slug.startsWith(".") || !isDir(dir) || !existsSync(path)) continue;
    const markdown = readFileSync(path, "utf8");
    const { data, body } = parseFrontmatter(markdown);
    out.push({ slug, dir, path, markdown, data, body });
  }
  return out;
}

/** Every skills/chain-templates/<slug>.md, sorted by slug. */
export function listChainTemplates(root) {
  const dir = join(skillsRoot(root), "chain-templates");
  if (!isDir(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith(".") && f.toLowerCase() !== "readme.md")
    .sort()
    .map((f) => ({ slug: f.slice(0, -3), path: join(dir, f), text: readFileSync(join(dir, f), "utf8") }));
}

/** Render every chain template for every chain. slug = "<chain.id>-<template>". */
export function renderChainSkills(root, chains) {
  const templates = listChainTemplates(root);
  const out = [];
  for (const chain of chains ?? []) {
    for (const t of templates) {
      const markdown = renderTemplate(t.text, chain);
      const { data } = parseFrontmatter(markdown);
      out.push({ slug: `${chain.id}-${t.slug}`, chain: chain.id, template: t.slug, name: data.name ?? `${chain.id}-${t.slug}`, markdown });
    }
  }
  return out;
}

/** Convenience: mainnet chains from the shared registry (src/chains/registry.js). */
export async function loadMainnets() {
  const mod = await import(new URL("../src/chains/registry.js", import.meta.url).href);
  return mod.mainnets();
}

// ─── Validation ─────────────────────────────────────────────────────────────────────────────────

/**
 * Validate one SKILL.md. opts: { expectedName, minLines, maxLines, kind: "base"|"chain" }.
 * Returns { ok, errors: string[], warnings: string[], data }.
 */
export function validateSkill(markdown, opts = {}) {
  const errors = [];
  const warnings = [];
  const { data, body, errors: fmErrors } = parseFrontmatter(markdown);
  for (const e of fmErrors) errors.push(`frontmatter: ${e}`);

  const name = typeof data.name === "string" ? data.name : "";
  if (!name) errors.push("name is required");
  else {
    if (name.length > 64) errors.push(`name is ${name.length} chars (max 64)`);
    if (!NAME_RE.test(name)) errors.push(`name "${name}" must be a-z0-9 with single hyphens`);
    if (opts.expectedName && name !== opts.expectedName) errors.push(`name "${name}" must equal "${opts.expectedName}"`);
  }
  const desc = typeof data.description === "string" ? data.description.trim() : "";
  if (!desc) errors.push("description is required");
  else {
    if (desc.length > 1024) errors.push(`description is ${desc.length} chars (max 1024)`);
    if (/<\/?[A-Za-z][^>]*>/.test(desc)) errors.push("description must not contain HTML/XML tags");
    if (!/\b(use|when)\b/i.test(desc)) warnings.push('description should say when to use it ("Use when ...")');
  }
  if (data.license !== "MIT") errors.push('license must be "MIT"');
  const meta = data.metadata;
  if (!meta || typeof meta !== "object") errors.push("metadata block is required");
  else {
    for (const k of REQUIRED_META) if (!meta[k]) errors.push(`metadata.${k} is required`);
    if (meta.category && !CATEGORY_IDS.includes(meta.category)) errors.push(`metadata.category "${meta.category}" is not one of ${CATEGORY_IDS.join(", ")}`);
    if (meta.level && !LEVELS.includes(meta.level)) warnings.push(`metadata.level "${meta.level}" should be ${LEVELS.join("/")}`);
    if (meta.version && !/^\d+\.\d+\.\d+$/.test(meta.version)) errors.push("metadata.version must be semver");
    if (meta.updated && !/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) errors.push("metadata.updated must be YYYY-MM-DD");
  }

  // body structure
  const lines = body.split("\n");
  if (!lines.some((l) => /^# \S/.test(l))) errors.push("body needs a '# Title' heading");
  const h2 = lines.filter((l) => /^## /.test(l)).map((l) => l.slice(3).trim().toLowerCase());
  for (const s of REQUIRED_SECTIONS) if (!h2.some((h) => h.startsWith(s.toLowerCase()))) errors.push(`missing section "## ${s}"`);
  const stepsIdx = lines.findIndex((l) => /^## steps/i.test(l));
  if (stepsIdx >= 0) {
    const after = lines.slice(stepsIdx + 1);
    const endIdx = after.findIndex((l) => /^## /.test(l));
    const steps = after.slice(0, endIdx === -1 ? undefined : endIdx);
    if (!steps.some((l) => /^\d+\.\s/.test(l))) errors.push("## Steps must contain a numbered list");
  }

  // leftovers and secrets (whole file)
  const all = String(markdown);
  if (/\{\{|\}\}/.test(all)) errors.push("leftover template tags {{ }}");
  all.split("\n").forEach((line, k) => {
    for (const [re, msg] of SECRET_RULES) if (re.test(line)) errors.push(`line ${k + 1}: ${msg}`);
    if (/\b(TODO|TBD|FIXME)\b/.test(line)) warnings.push(`line ${k + 1}: placeholder marker`);
  });

  const n = all.split("\n").length;
  const min = opts.minLines ?? (opts.kind === "base" ? 50 : 0);
  const max = opts.maxLines ?? (opts.kind === "base" ? 170 : 400);
  if (min && n < min) warnings.push(`${n} lines (expected >= ${min})`);
  if (max && n > max) warnings.push(`${n} lines (expected <= ${max})`);
  return { ok: errors.length === 0, errors, warnings, data };
}
