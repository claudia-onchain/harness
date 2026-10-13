// Pure render functions for transcript items and live widgets. Each returns string[] for a given width.
import { wrap, width, truncate, pad, strip } from "./ansi.js";
import { renderMarkdown } from "./markdown.js";
import { fmtTokens, fmtUsd } from "../core/util.js";
import { homedir } from "node:os";

export const spinnerFrame = (th, t = Date.now()) => th.sym.spinner[Math.floor(t / 80) % th.sym.spinner.length];

/** Shimmering word: a bright band moving across muted text. */
export function shimmer(th, text, t = Date.now()) {
  if (th.level < 2) return th.accent(text);
  const chars = Array.from(text);
  const pos = ((t / 70) % (chars.length + 8)) - 4;
  return chars.map((c, i) => {
    const d = Math.abs(i - pos);
    const k = Math.max(0, 1 - d / 3);
    return th.hex(th.mix("#6b5bd6", "#e8ecf4", k))(c);
  }).join("");
}

export function userItem(item, cols, th) {
  const lines = wrap(item.text, cols - 4);
  const out = [""];
  lines.forEach((l, i) => {
    const body = (i === 0 ? th.accent2(th.sym.prompt) : " ") + " " + th.text(l);
    out.push(th.userBg(pad(" " + body, cols)));
  });
  if (item.images) out.push(th.muted(`  ${th.sym.sparkle} ${item.images} image(s) attached`));
  if (item.source && item.source !== "cli" && item.source !== "steer") out.push(th.muted(`  via ${item.source}`));
  if (item.source === "steer") out.splice(1, 0, th.muted("  steering"));
  return out;
}

export function assistantItem(item, cols, th) {
  const md = renderMarkdown(item.text || "", cols - 2, th, { indent: "  " });
  return ["", ...md];
}

export function thinkingItem(item, cols, th, { show, live, t }) {
  const words = (item.text.match(/\S+/g) || []).length;
  if (!show) {
    if (live) {
      const last = item.text.replace(/\s+/g, " ").trim().slice(-Math.max(10, cols - 30));
      return [`  ${th.muted(th.sym.think)} ${shimmer(th, "Thinking", t)} ${th.dim(th.muted(truncate(last, cols - 16)))}`];
    }
    return [`  ${th.muted(`${th.sym.think} Thought · ${words} words · Ctrl+T to show`)}`];
  }
  const body = wrap(item.text.trim(), cols - 6).map((l) => `  ${th.muted(th.sym.box.v)} ${th.italic(th.muted(l))}`);
  return [`  ${th.muted(`${th.sym.think} Thinking${live ? "…" : ` · ${words} words`}`)}`, ...body];
}

export function argsLine(args) {
  if (!args || typeof args !== "object") return "";
  return Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => {
    let s = typeof v === "string" ? v : JSON.stringify(v);
    s = s.replace(/\s+/g, " ");
    return `${k}=${s.length > 48 ? s.slice(0, 47) + "…" : s}`;
  }).join(" ");
}

export function toolItem(item, cols, th, { expanded, t }) {
  const icon = item.status === "pending" ? th.accent(spinnerFrame(th, t)) : item.status === "ok" ? th.ok(th.sym.check) : th.bad(th.sym.cross);
  const label = th.bold(item.status === "error" ? th.bad(item.label) : th.text(item.label));
  const secs = item.status === "pending" && t - item.startedAt > 1500 ? th.muted(` ${((t - item.startedAt) / 1000).toFixed(1)}s`) : "";
  const helper = item.helper ? th.muted(`[${item.helper}] `) : "";
  let head = `  ${icon} ${helper}${label} ${th.muted(argsLine(item.args))}`;
  head = truncate(head, cols - (item.summary ? Math.min(50, width(item.summary) + 4) : 0) - width(secs)) + secs;
  if (item.summary) head += " " + (item.status === "error" ? th.bad(`${th.sym.arrow} ${item.summary}`) : th.muted(`${th.sym.arrow} ${item.summary}`));
  const out = [truncate(head, cols)];
  if (expanded && item.result) {
    const raw = String(item.result).split("\n").slice(0, 40);
    for (const l of raw) for (const w of wrap(l, cols - 8)) out.push(`    ${th.muted(th.sym.box.v)} ${th.muted(w)}`);
    if (String(item.result).split("\n").length > 40) out.push(`    ${th.muted(th.sym.box.v)} ${th.muted("…")}`);
  }
  return out;
}

export function noticeItem(item, cols, th) {
  const color = item.level === "warn" ? th.warn : item.level === "ok" ? th.ok : th.muted;
  const icon = item.level === "warn" ? th.sym.warn : item.level === "ok" ? th.sym.check : th.sym.dot;
  return wrap(item.text, cols - 4).map((l, i) => `  ${i === 0 ? color(icon) : " "} ${color(l)}`);
}

export function errorItem(item, cols, th) {
  return ["", ...wrap(item.text, cols - 4).map((l, i) => `  ${i === 0 ? th.bad(th.sym.cross) : " "} ${th.bad(l)}`)];
}

export function systemItem(item, cols, th) {
  return ["", ...item.lines.flatMap((l) => (width(l) > cols - 2 ? wrap(l, cols - 2) : [l]).map((x) => "  " + x))];
}

export function shellItem(item, cols, th) {
  const out = ["", `  ${th.accent2("$")} ${th.bold(item.command)}`];
  for (const l of String(item.output || "").replace(/\s+$/, "").split("\n").slice(-60)) for (const w of wrap(l, cols - 6)) out.push(`  ${th.muted(th.sym.box.v)} ${th.text(w)}`);
  if (item.code !== undefined) out.push(`  ${item.code === 0 ? th.ok(th.sym.check) : th.bad(th.sym.cross)} ${th.muted(`exit ${item.code}${item.sent ? " · sent to Lumen" : ""}`)}`);
  else out.push(`  ${th.accent(spinnerFrame(th))} ${th.muted("running…")}`);
  return out;
}

export function todoWidget(items, cols, th) {
  if (!items?.length) return [];
  const done = items.filter((x) => x.status === "done").length;
  const out = [`  ${th.muted(`Tasks ${done}/${items.length}`)}`];
  for (const x of items.slice(0, 10)) {
    const mark = x.status === "done" ? th.ok(th.sym.todo.done) : x.status === "active" ? th.accent(th.sym.todo.active) : th.muted(th.sym.todo.pending);
    out.push(truncate(`  ${mark} ${x.status === "done" ? th.strike(th.muted(x.text)) : x.status === "active" ? th.bold(th.text(x.text)) : th.text(x.text)}`, cols));
  }
  return out;
}

export function shortCwd(cwd) {
  const h = homedir();
  let p = cwd.startsWith(h) ? "~" + cwd.slice(h.length) : cwd;
  const parts = p.split("/");
  if (parts.length > 4) p = [parts[0], "…", ...parts.slice(-2)].join("/");
  return p;
}

/** Footer: cwd · persona · model · ctx% · tokens · $cost · chain · activity. Drops low-priority parts to fit. */
export function footer(th, cols, s) {
  const sep = th.muted(` ${th.sym.sep} `);
  const act = s.activity
    ? `${th.accent(spinnerFrame(th, s.t))} ${shimmer(th, s.activity, s.t)}${s.elapsed ? th.muted(` ${s.elapsed}`) : ""}`
    : `${th.ok(th.sym.dot)} ${th.muted("ready")}`;
  const ctxColor = s.ctxPct >= 85 ? th.bad : s.ctxPct >= 60 ? th.warn : th.muted;
  const parts = [
    { p: 3, s: th.muted(shortCwd(s.cwd)) },
    { p: 2, s: th.accent2(s.persona) },
    { p: 1, s: th.text(s.model) },
    { p: 4, s: ctxColor(`ctx ${s.ctxPct}%`) },
    { p: 5, s: th.muted(`${fmtTokens(s.tokens)} tok`) },
    { p: 4, s: th.muted(s.cost == null ? "$?" : `${s.priced ? "" : "≥"}${fmtUsd(s.cost)}`) },
    { p: 3, s: th.muted(`${th.term.unicode ? "⛓" : "chain"} ${s.chain}`) },
    ...(s.yolo ? [{ p: 2, s: th.warn("yolo") }] : []),
    ...(s.queued ? [{ p: 1, s: th.warn(`${s.queued} queued`) }] : []),
  ];
  const right = act;
  let list = parts.slice();
  const total = () => width(list.map((x) => x.s).join(sep)) + width(right) + 3;
  while (total() > cols && list.length > 1) {
    const worst = list.reduce((a, b, i) => (b.p > list[a].p ? i : a), 0);
    list.splice(worst, 1);
  }
  const left = " " + list.map((x) => x.s).join(sep);
  const gap = Math.max(1, cols - width(left) - width(right) - 1);
  return [truncate(left + " ".repeat(gap) + right, cols)];
}

/** Box with a title, used for approvals and pickers. */
export function box(th, cols, title, body, color = th.accent) {
  const b = th.sym.box;
  const inner = cols - 4;
  const t = title ? ` ${title} ` : "";
  const out = [color(`${b.tl}${b.h}`) + th.bold(truncate(t, inner - 2)) + color(b.h.repeat(Math.max(0, inner - width(t) - 1)) + b.tr)];
  for (const l of body) out.push(color(b.v) + " " + pad(l, inner) + " " + color(b.v));
  out.push(color(`${b.bl}${b.h.repeat(inner + 2)}${b.br}`));
  return out;
}

/** Selectable list widget. state: { title, items: [{label, detail?}], index, filter, hint } */
export function selectList(th, cols, st, rowsAvail = 12) {
  const items = filtered(st);
  const n = Math.max(3, Math.min(rowsAvail, 12));
  const top = Math.max(0, Math.min(st.index - Math.floor(n / 2), items.length - n));
  const body = [];
  if (st.filter) body.push(th.muted(`filter: ${st.filter}`));
  items.slice(top, top + n).forEach((it, k) => {
    const i = top + k;
    const sel = i === st.index;
    const label = sel ? th.bold(th.accent2(`${th.sym.sel} ${it.label}`)) : `  ${th.text(it.label)}`;
    body.push(truncate(label + (it.detail ? "  " + th.muted(it.detail) : ""), cols - 6));
  });
  if (!items.length) body.push(th.muted("  no matches"));
  body.push(th.muted(st.hint || `${th.sym.up}${th.sym.down} move · Enter select · Esc cancel · type to filter`));
  return box(th, cols, st.title, body, th.accent);
}

export function filtered(st) {
  if (!st.filter) return st.items;
  const f = st.filter.toLowerCase();
  return st.items.filter((x) => `${x.label} ${x.detail || ""}`.toLowerCase().includes(f));
}

export function approvalBox(th, cols, a, input) {
  const body = [];
  for (const l of String(a.detail || "").split("\n").slice(0, 18)) for (const w of wrap(l, cols - 8)) body.push(th.text(w));
  if (body.length) body.push("");
  const color = a.kind === "tx" ? th.warn : a.kind === "question" ? th.accent2 : th.accent;
  if (a.kind === "question") {
    (a.options || []).forEach((o, i) => body.push(i === input.index ? th.bold(th.accent2(`${th.sym.sel} ${i + 1}. ${o}`)) : th.text(`  ${i + 1}. ${o}`)));
    body.push(th.muted(`${a.options?.length ? "↑↓/number to pick · " : ""}type an answer · Enter send · Esc skip`));
    if (input.text || !a.options?.length) body.push(th.accent2(`${th.sym.prompt} `) + th.text(input.text) + th.inverse(" "));
  } else if (a.confirmText) {
    body.push(th.warn(`Type "${a.confirmText}" and press Enter to approve · Esc to decline`));
    body.push(th.accent2(`${th.sym.prompt} `) + th.text(input.text) + th.inverse(" "));
  } else {
    body.push(`${th.ok("[y]")} ${th.text("approve")}   ${th.bad("[n]")} ${th.text("decline")}${a.kind === "tx" ? "" : `   ${th.muted(`[a] allow all ${a.kind} this session`)}`}`);
  }
  const title = a.kind === "question" ? `Question: ${a.title}` : a.kind === "tx" ? `Approve transaction: ${a.title}` : `Approve: ${a.title}`;
  return box(th, cols, truncate(title, cols - 8), body, color);
}

export { strip };
