// Skills loader (Agent Skills format: <slug>/SKILL.md with name + description frontmatter).
//   base   skills/base/*/SKILL.md (shipped)
//   chain  skills/chain-templates/*.md rendered for every mainnet in the registry -> slug `${chain.id}-${template}`
//   user   ~/.lumen/skills, ~/.agents/skills, ~/.claude/skills, ./.agents/skills, ./.claude/skills
// Only name + description reach the system prompt; bodies load on demand through skill_load / skill_file.
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { skillsDir, P } from "../core/paths.js";
import { parseFrontmatter as fallbackParse } from "../core/frontmatter.js";
import { mainnets } from "../chains/registry.js";

let libPromise = null;
/** skills/lib.mjs (builder B). Falls back to a minimal implementation if it's missing. */
export function skillsLib() {
  libPromise ||= import(pathToFileURL(join(skillsDir, "lib.mjs")).href).catch(() => ({
    parseFrontmatter: fallbackParse,
    renderTemplate: (t) => t,
    listBaseSkills: () => [],
    renderChainSkills: () => [],
    fallback: true,
  }));
  return libPromise;
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

function listFiles(dir, max = 60) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 3 || out.length >= max) return;
    for (const f of readdirSync(d)) {
      if (f.startsWith(".") || f === "node_modules") continue;
      const p = join(d, f);
      if (isDir(p)) walk(p, depth + 1);
      else if (f !== "SKILL.md") out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  try { walk(dir, 0); } catch { /* unreadable */ }
  return out;
}

export function userSkillDirs(cwd = process.cwd()) {
  const h = homedir();
  return [P.skills, join(h, ".agents", "skills"), join(h, ".claude", "skills"), join(cwd, ".agents", "skills"), join(cwd, ".claude", "skills")]
    .filter((d, i, a) => a.indexOf(d) === i);
}

const meta = (data, k) => data?.metadata?.[k] ?? data?.[k];

export class Skills {
  constructor() { this.base = []; this.chainTemplates = []; this.chain = []; this.user = []; this.bySlug = new Map(); this.lib = null; }

  async load({ cwd = process.cwd() } = {}) {
    const lib = (this.lib = await skillsLib());
    this.base = lib.listBaseSkills(skillsDir).map((s) => ({
      slug: s.slug, name: s.data?.name || s.slug, title: meta(s.data, "title") || s.slug, description: String(s.data?.description || "").trim(),
      category: meta(s.data, "category") || "general", source: "base", dir: s.dir, markdown: s.markdown,
    }));
    this.chain = lib.renderChainSkills(skillsDir, mainnets()).map((s) => {
      const { data } = lib.parseFrontmatter(s.markdown);
      return { slug: s.slug, name: s.name || s.slug, title: meta(data, "title") || s.slug, description: String(data?.description || "").trim(), category: "chain", source: "chain", chain: s.chain, template: s.template, markdown: s.markdown };
    });
    this.chainTemplates = [...new Set(this.chain.map((s) => s.template))];
    this.user = [];
    const seen = new Set([...this.base, ...this.chain].map((s) => s.slug));
    for (const dir of userSkillDirs(cwd)) {
      if (!isDir(dir)) continue;
      for (const slug of readdirSync(dir).sort()) {
        const sdir = join(dir, slug), file = join(sdir, "SKILL.md");
        if (!existsSync(file) || seen.has(slug)) continue;
        try {
          const markdown = readFileSync(file, "utf8");
          const { data } = lib.parseFrontmatter(markdown);
          this.user.push({ slug, name: data?.name || slug, title: meta(data, "title") || slug, description: String(data?.description || "").trim(), category: meta(data, "category") || "user", source: "user", dir: sdir, markdown, origin: dir });
          seen.add(slug);
        } catch { /* skip unreadable */ }
      }
    }
    this.bySlug = new Map([...this.base, ...this.chain, ...this.user].map((s) => [s.slug, s]));
    return this;
  }

  get counts() { return { base: this.base.length, chain: this.chain.length, user: this.user.length, templates: this.chainTemplates.length }; }
  get all() { return [...this.base, ...this.chain, ...this.user]; }
  get(slug) { return this.bySlug.get(String(slug || "").replace(/^skill:/, "")) || null; }

  /** Filtered listing (contract shape) — chain narrows chain skills, q matches slug/title/description. */
  list({ chain, q, source } = {}) {
    let rows = this.all;
    if (chain) rows = rows.filter((s) => s.source !== "chain" || s.chain === chain);
    if (source) rows = rows.filter((s) => s.source === source);
    if (q) {
      const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.map((s) => ({ s, score: terms.reduce((a, t) => a + (s.slug.includes(t) ? 3 : 0) + (s.title.toLowerCase().includes(t) ? 2 : 0) + (s.description.toLowerCase().includes(t) ? 1 : 0), 0) }))
        .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.s);
    }
    return rows.map(({ slug, name, title, description, category, source: src, chain: ch }) => ({ slug, name, title, description, category, source: src, ...(ch ? { chain: ch } : {}) }));
  }

  files(slug) { const s = this.get(slug); return s?.dir ? listFiles(s.dir) : []; }

  /** Read a supporting file of a skill (path must stay inside the skill folder). */
  file(slug, path) {
    const s = this.get(slug);
    if (!s) throw new Error(`No skill "${slug}".`);
    if (!s.dir) throw new Error(`${slug} is a rendered chain skill with no extra files.`);
    const full = resolve(s.dir, String(path || ""));
    if (!full.startsWith(resolve(s.dir) + sep)) throw new Error("Path escapes the skill folder.");
    return readFileSync(full, "utf8");
  }

  /** System-prompt index: base + user skills, chain skills for the active chain only. */
  promptIndex(chainId = "ethereum") {
    const line = (s) => `- ${s.slug}: ${s.description.replace(/\s+/g, " ").slice(0, 300)}`;
    const chainSkills = this.chain.filter((s) => s.chain === chainId);
    return [
      ...this.base.map(line),
      ...this.user.map(line),
      ...(chainSkills.length ? [`Chain skills for ${chainId}:`, ...chainSkills.map(line)] : []),
      `(${this.chain.length - chainSkills.length} more chain skills for other chains: call skill_list with {"chain":"<id>"} to see them.)`,
    ].join("\n");
  }

  /** Write rendered skills to a folder (<dir>/<slug>/SKILL.md). */
  exportTo(dir, { chain } = {}) {
    const rows = this.all.filter((s) => s.source !== "chain" || !chain || s.chain === chain);
    for (const s of rows) {
      const d = join(dir, s.slug);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "SKILL.md"), s.markdown);
    }
    return rows.length;
  }
}

let shared = null;
export async function loadSkills(opts) { shared = await new Skills().load(opts); return shared; }
export const getSkills = () => shared;
