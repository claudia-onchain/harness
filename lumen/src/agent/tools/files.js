// File tools scoped to the working directory plus config.addDirs.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, relative, dirname, join, sep, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { obj, str, num, bool } from "./registry.js";
import { wrap } from "../../core/untrusted.js";

const IGNORE = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "coverage", ".venv", "__pycache__", ".DS_Store"]);

export function roots(ctx) {
  return [ctx.cwd, ...(ctx.config.addDirs || [])].map((d) => resolve(String(d).replace(/^~(?=$|\/)/, homedir())));
}

export function scoped(ctx, p) {
  const raw = String(p || ".").replace(/^~(?=$|\/)/, homedir());
  const full = isAbsolute(raw) ? resolve(raw) : resolve(ctx.cwd, raw);
  const ok = roots(ctx).some((r) => full === r || full.startsWith(r + sep));
  if (!ok) throw new Error(`${p} is outside the working directory. Allowed: ${roots(ctx).join(", ")} (add more with config addDirs or /add-dir).`);
  return full;
}

const rel = (ctx, p) => relative(ctx.cwd, p) || ".";

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Glob -> RegExp (supports **, *, ?, {a,b}). */
export function globToRegex(glob) {
  let re = "";
  const g = String(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") { if (g[i + 1] === "*") { re += g[i + 2] === "/" ? "(?:.*/)?" : ".*"; i += g[i + 2] === "/" ? 2 : 1; } else re += "[^/]*"; }
    else if (c === "?") re += "[^/]";
    else if (c === "{") { const end = g.indexOf("}", i); re += `(?:${g.slice(i + 1, end).split(",").map((x) => x.replace(/[.+^$()|[\]\\]/g, "\\$&")).join("|")})`; i = end; }
    else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function* walk(dir, { max = 20000 } = {}) {
  let count = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (IGNORE.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) { yield p; if (++count >= max) return; }
    }
  }
}

export function fileTools() {
  return [
    {
      name: "read_file", group: "Files", label: "Read file", safe: true,
      description: "Read a text file (optionally a line range). Paths are relative to the working directory.",
      parameters: obj({ path: str("File path"), offset: num("First line (1-based)"), limit: num("Max lines (default 400)") }, ["path"]),
      run(a, ctx) {
        const p = scoped(ctx, a.path);
        const buf = readFileSync(p);
        if (isBinary(buf)) return { text: `${rel(ctx, p)} is binary (${buf.length} bytes).`, summary: "binary file" };
        const lines = buf.toString("utf8").split("\n");
        const start = Math.max(1, Number(a.offset) || 1), lim = Math.min(2000, Number(a.limit) || 400);
        const slice = lines.slice(start - 1, start - 1 + lim).map((l, i) => `${String(start + i).padStart(5)}  ${l}`).join("\n");
        const more = start - 1 + lim < lines.length ? `\n… ${lines.length - (start - 1 + lim)} more lines (use offset)` : "";
        return { text: wrap("file", slice + more, { from: rel(ctx, p) }), summary: `${rel(ctx, p)} · ${lines.length} lines` };
      },
    },
    {
      name: "write_file", group: "Files", label: "Write file", approval: "write",
      description: "Create or overwrite a text file with the given content.",
      parameters: obj({ path: str("File path"), content: str("Full file content") }, ["path", "content"]),
      approvalTitle: (a) => a.path,
      preview: (a) => `${a.path}\n${"─".repeat(40)}\n${String(a.content).slice(0, 1500)}${String(a.content).length > 1500 ? "\n…" : ""}`,
      run(a, ctx) {
        const p = scoped(ctx, a.path);
        const existed = existsSync(p);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, String(a.content ?? ""));
        return { text: `${existed ? "Overwrote" : "Created"} ${rel(ctx, p)} (${Buffer.byteLength(String(a.content ?? ""))} bytes).`, summary: `${existed ? "updated" : "created"} ${rel(ctx, p)}` };
      },
    },
    {
      name: "edit_file", group: "Files", label: "Edit file", approval: "write",
      description: "Replace an exact string in a file. old_string must match exactly once unless replace_all is true.",
      parameters: obj({ path: str("File path"), old_string: str("Exact text to replace"), new_string: str("Replacement"), replace_all: bool("Replace every occurrence") }, ["path", "old_string", "new_string"]),
      approvalTitle: (a) => a.path,
      preview: (a) => `${a.path}\n- ${String(a.old_string).split("\n").join("\n- ").slice(0, 1200)}\n+ ${String(a.new_string).split("\n").join("\n+ ").slice(0, 1200)}`,
      run(a, ctx) {
        const p = scoped(ctx, a.path);
        const text = readFileSync(p, "utf8");
        const n = text.split(a.old_string).length - 1;
        if (!a.old_string) throw new Error("old_string is empty.");
        if (n === 0) throw new Error("old_string was not found. Read the file again and copy the exact text.");
        if (n > 1 && !a.replace_all) throw new Error(`old_string matches ${n} times. Add more context or set replace_all.`);
        const out = a.replace_all ? text.split(a.old_string).join(a.new_string) : text.replace(a.old_string, () => a.new_string);
        writeFileSync(p, out);
        const diff = `- ${String(a.old_string).split("\n").slice(0, 6).join("\n- ")}\n+ ${String(a.new_string).split("\n").slice(0, 6).join("\n+ ")}`;
        return { text: `Edited ${rel(ctx, p)} (${a.replace_all ? n : 1} replacement${n > 1 && a.replace_all ? "s" : ""}).\n${diff}`, summary: `edited ${rel(ctx, p)}` };
      },
    },
    {
      name: "list_dir", group: "Files", label: "List folder", safe: true,
      description: "List a folder's entries (dirs end with /).",
      parameters: obj({ path: str("Folder (default .)") }),
      run(a, ctx) {
        const p = scoped(ctx, a.path || ".");
        const items = readdirSync(p, { withFileTypes: true }).filter((e) => !IGNORE.has(e.name)).sort((x, y) => (y.isDirectory() - x.isDirectory()) || x.name.localeCompare(y.name));
        const lines = items.slice(0, 400).map((e) => (e.isDirectory() ? `${e.name}/` : `${e.name}  ${statSync(join(p, e.name)).size}b`));
        return { text: lines.join("\n") || "(empty)", summary: `${rel(ctx, p)} · ${items.length} entries` };
      },
    },
    {
      name: "glob", group: "Files", label: "Find files", safe: true,
      description: "Find files by glob pattern, e.g. **/*.ts or src/**/index.{js,mjs}.",
      parameters: obj({ pattern: str("Glob pattern"), path: str("Search root (default .)") }, ["pattern"]),
      run(a, ctx) {
        const root = scoped(ctx, a.path || ".");
        const re = globToRegex(a.pattern.includes("/") ? a.pattern : `**/${a.pattern}`);
        const hits = [];
        for (const f of walk(root)) { const r = relative(root, f).split(sep).join("/"); if (re.test(r)) hits.push(r); if (hits.length >= 300) break; }
        return { text: hits.join("\n") || "No files match.", summary: `${hits.length} files` };
      },
    },
    {
      name: "grep", group: "Files", label: "Search text", safe: true,
      description: "Search file contents with a regular expression. Returns path:line: text.",
      parameters: obj({ pattern: str("Regex (JavaScript syntax)"), path: str("Search root (default .)"), glob: str("Only files matching this glob"), ignore_case: bool("Case-insensitive") }, ["pattern"]),
      run(a, ctx) {
        const root = scoped(ctx, a.path || ".");
        const re = new RegExp(a.pattern, a.ignore_case ? "i" : "");
        const only = a.glob ? globToRegex(a.glob.includes("/") ? a.glob : `**/${a.glob}`) : null;
        const hits = [];
        for (const f of walk(root)) {
          const r = relative(root, f).split(sep).join("/");
          if (only && !only.test(r)) continue;
          let buf;
          try { if (statSync(f).size > 2_000_000) continue; buf = readFileSync(f); } catch { continue; }
          if (isBinary(buf)) continue;
          buf.toString("utf8").split("\n").forEach((line, i) => { if (hits.length < 200 && re.test(line)) hits.push(`${r}:${i + 1}: ${line.slice(0, 240)}`); });
          if (hits.length >= 200) break;
        }
        return { text: hits.length ? wrap("file", hits.join("\n")) : "No matches.", summary: `${hits.length} matches` };
      },
    },
  ];
}
