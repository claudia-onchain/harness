// Markdown -> terminal lines. Re-rendered on every streaming frame, so it tolerates half-written input
// (an unclosed code fence renders as an open code box). Headings, bold/italic/strike, inline code, links
// (OSC 8 when supported), bullet/ordered/task lists with hanging indents, blockquotes, rules, tables, code boxes.
import { wrap, width, truncate, link, pad } from "./ansi.js";

export function inline(text, th) {
  const out = [];
  const segs = String(text).split(/(`[^`\n]+`)/);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (i % 2 === 1) { out.push(th.accent2(s.slice(1, -1))); continue; }
    const held = [];
    const hold = (v) => `\u0000${held.push(v) - 1}\u0000`;
    let x = s
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g, (m, t, u, raw) => {
        if (raw) return hold(th.ul(th.accent2(link(raw, raw, th.term.hyperlinks))));
        return hold(th.ul(th.accent2(link(t, u, th.term.hyperlinks))) + (th.term.hyperlinks ? "" : th.muted(` (${u})`)));
      })
      .replace(/\*\*\*([^*\n]+)\*\*\*/g, (m, t) => th.bold(th.italic(t)))
      .replace(/\*\*([^*\n]+)\*\*/g, (m, t) => th.bold(t))
      .replace(/__([^_\n]+)__/g, (m, t) => th.bold(t))
      .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, (m, pre, t) => pre + th.italic(t))
      .replace(/(^|[^\w])_([^_\s][^_\n]*?)_(?!\w)/g, (m, pre, t) => pre + th.italic(t))
      .replace(/~~([^~\n]+)~~/g, (m, t) => th.strike(th.muted(t)))
      .replace(/\u0000(\d+)\u0000/g, (m, n) => held[Number(n)]);
    out.push(x);
  }
  return out.join("");
}

function table(rows, widthMax, th) {
  const cells = rows.map((r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
  const body = cells.filter((r, i) => !(i === 1 && r.every((c) => /^:?-{2,}:?$/.test(c))));
  const n = Math.max(...body.map((r) => r.length));
  const sep = th.muted(` ${th.sym.box.v} `);
  const sepW = 3;
  let colW = Array.from({ length: n }, (_, i) => Math.max(3, ...body.map((r) => width(inline(r[i] || "", th)))));
  const total = () => colW.reduce((a, b) => a + b, 0) + sepW * (n - 1);
  while (total() > widthMax && Math.max(...colW) > 6) { const i = colW.indexOf(Math.max(...colW)); colW[i]--; }
  const lines = body.map((r, ri) => Array.from({ length: n }, (_, i) => pad(truncate(ri === 0 ? th.bold(inline(r[i] || "", th)) : inline(r[i] || "", th), colW[i]), colW[i])).join(sep));
  lines.splice(1, 0, th.muted(colW.map((w) => th.sym.hr.repeat(w)).join(th.sym.hr + (th.term.unicode ? "┼" : "+") + th.sym.hr)));
  return lines;
}

/** Render markdown into lines at `cols` width. */
export function renderMarkdown(src, cols, th, { indent = "" } = {}) {
  const W = Math.max(20, cols - width(indent));
  const lines = String(src ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let code = null; // { fence, lang, lines }
  let blank = 0;
  const box = th.sym.box;
  const emit = (l) => out.push(indent + l);
  const flushCode = (closed) => {
    const label = code.lang ? ` ${code.lang} ` : "";
    emit(th.muted(`${box.tl}${box.h}${label}${box.h.repeat(Math.max(0, Math.min(W - 2 - width(label), 60)))}`));
    for (const l of code.lines) {
      const parts = l.length ? wrap(l.replace(/\t/g, "  "), W - 2) : [""];
      for (const p of parts) emit(th.muted(box.v) + " " + th.text(p));
    }
    if (closed) emit(th.muted(`${box.bl}${box.h}`));
    code = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (code) {
      if (/^\s*(```|~~~)\s*$/.test(line) && line.trim().startsWith(code.fence)) { flushCode(true); continue; }
      code.lines.push(line);
      continue;
    }
    const fence = /^\s*(```+|~~~+)\s*([\w+#.-]*)/.exec(line);
    if (fence) { code = { fence: fence[1].slice(0, 3), lang: fence[2], lines: [] }; blank = 0; continue; }
    if (!line.trim()) { if (out.length && blank === 0) emit(""); blank++; continue; }
    blank = 0;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const t = h[2].replace(/\s*#+\s*$/, "");
      const styled = h[1].length === 1 ? th.bold(th.gradient(t)) : h[1].length === 2 ? th.bold(th.accent(t)) : th.bold(th.text(inline(t, th)));
      for (const l of wrap(styled, W)) emit(l);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { emit(th.muted(th.sym.hr.repeat(Math.min(W, 60)))); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [line];
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(lines[++i]);
      if (rows.length >= 2) { for (const l of table(rows, W, th)) emit(l); continue; }
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) { for (const l of wrap(th.italic(th.muted(inline(q[1], th))), W - 2)) emit(th.accent(th.sym.bar) + " " + l); continue; }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const depth = Math.floor(li[1].replace(/\t/g, "  ").length / 2);
      let body = li[3];
      let marker = /\d/.test(li[2]) ? th.accent(li[2]) : th.accent(depth % 2 ? th.sym.ring : th.sym.bullet);
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(body);
      if (task) { marker = task[1] === " " ? th.muted(th.sym.todo.pending) : th.ok(th.sym.todo.done); body = task[2]; }
      const lead = "  ".repeat(depth) + marker + " ";
      const hang = " ".repeat(width(lead));
      const parts = wrap(th.text(inline(body, th)), W - width(lead));
      parts.forEach((p, k) => emit((k === 0 ? lead : hang) + p));
      continue;
    }
    for (const l of wrap(th.text(inline(line, th)), W)) emit(l);
  }
  if (code) flushCode(false);
  while (out.length && out[out.length - 1] === indent) out.pop();
  return out;
}
