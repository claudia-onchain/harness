// Sessions: one JSONL file per session in ~/.lumen/sessions/<id>.jsonl.
//   {"t":"meta", id, title, created, cwd, persona, model}
//   {"t":"msg", msg}        a model-history message (OpenAI shape, may carry provider raw blocks)
//   {"t":"item", item}      a timeline item for UIs (user, assistant, tool, thinking, error, notice)
// Resume replays msgs; export renders items to Markdown or HTML.
import { appendFileSync, readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { P, ensureHome } from "./paths.js";
import { id as newId } from "./util.js";

const valid = (id) => /^[A-Za-z0-9_-]{1,80}$/.test(String(id || ""));
const fileOf = (id) => join(P.sessions, `${id}.jsonl`);

export function createSession(meta = {}) {
  ensureHome();
  const id = newId("s_");
  const m = { t: "meta", id, title: meta.title || "New session", created: new Date().toISOString(), ...meta, id };
  appendFileSync(fileOf(id), JSON.stringify(m) + "\n");
  return id;
}

export function appendRecord(id, rec) {
  if (!valid(id)) return;
  try { appendFileSync(fileOf(id), JSON.stringify(rec) + "\n"); } catch { /* disk full etc. */ }
}

export const appendMessage = (id, msg) => appendRecord(id, { t: "msg", msg });
export const appendItem = (id, item) => appendRecord(id, { t: "item", item: { ts: Date.now(), ...item } });
export const setTitle = (id, title) => appendRecord(id, { t: "title", title: String(title).slice(0, 120) });

export function loadSession(id) {
  if (!valid(id) || !existsSync(fileOf(id))) return null;
  const out = { id, title: "Session", meta: {}, messages: [], items: [] };
  for (const line of readFileSync(fileOf(id), "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.t === "meta") { out.meta = r; out.title = r.title || out.title; }
    else if (r.t === "title") out.title = r.title;
    else if (r.t === "msg") out.messages.push(r.msg);
    else if (r.t === "item") out.items.push(r.item);
    else if (r.t === "reset") { out.messages = r.keep || []; }
  }
  return out;
}

export function listSessions(limit = 50) {
  ensureHome();
  const files = readdirSync(P.sessions).filter((f) => f.endsWith(".jsonl"));
  const rows = files.map((f) => {
    const id = f.slice(0, -6);
    const st = statSync(join(P.sessions, f));
    let title = "Session", messages = 0;
    try {
      const text = readFileSync(join(P.sessions, f), "utf8");
      for (const line of text.split("\n")) {
        if (line.startsWith('{"t":"meta"') || line.startsWith('{"t":"title"')) { try { const r = JSON.parse(line); title = r.title || title; } catch { /* skip */ } }
        else if (line.startsWith('{"t":"item"') && /"type":"(user|assistant)"/.test(line)) messages++;
      }
    } catch { /* unreadable */ }
    return { id, title, updated: st.mtime.toISOString(), messages };
  });
  return rows.sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, limit);
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function exportSession(id, format = "md") {
  const s = loadSession(id);
  if (!s) throw new Error(`No session ${id}`);
  if (format === "html") {
    const rows = s.items.map((it) => {
      if (it.type === "user") return `<div class="u"><b>You</b><pre>${esc(it.text)}</pre></div>`;
      if (it.type === "assistant") return `<div class="a"><b>Lumen</b><pre>${esc(it.text)}</pre></div>`;
      if (it.type === "tool") return `<div class="t ${it.ok === false ? "bad" : ""}"><code>${esc(it.name)}</code> ${esc(it.summary || "")}</div>`;
      if (it.type === "error") return `<div class="t bad">${esc(it.text)}</div>`;
      return "";
    }).join("\n");
    return `<!doctype html><meta charset="utf-8"><title>${esc(s.title)}</title><style>body{background:#07080c;color:#e8ecf4;font:15px/1.5 ui-sans-serif,system-ui;max-width:860px;margin:40px auto;padding:0 16px}pre{white-space:pre-wrap;font:inherit;margin:4px 0}.u,.a{border:1px solid #1c2030;background:#0e1016;border-radius:10px;padding:10px 14px;margin:12px 0}.u b{color:#22d3ee}.a b{color:#7c5cff}.t{color:#8a93a6;font-size:13px;margin:4px 0 4px 14px}.bad{color:#f43f5e}code{color:#34d399}</style><h1>${esc(s.title)}</h1>${rows}`;
  }
  const lines = [`# ${s.title}`, "", `_Exported from Lumen · ${new Date().toISOString()}_`, ""];
  for (const it of s.items) {
    if (it.type === "user") lines.push(`## You`, "", it.text, "");
    else if (it.type === "assistant") lines.push(`## Lumen`, "", it.text, "");
    else if (it.type === "tool") lines.push(`> \`${it.name}\` ${it.ok === false ? "✗" : "✓"} ${it.summary || ""}`, "");
    else if (it.type === "error") lines.push(`> **Error:** ${it.text}`, "");
  }
  return lines.join("\n");
}

export function writeExport(id, format, outPath) {
  writeFileSync(outPath, exportSession(id, format));
  return outPath;
}
