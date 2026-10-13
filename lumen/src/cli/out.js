// Styled output for one-shot commands (non-TUI).
import { detectTerm } from "../tui/term.js";
import { createTheme } from "../tui/theme.js";
import { width, pad, truncate } from "../tui/ansi.js";
import { createInterface } from "node:readline";

let th = null;
export function theme(flags = {}) {
  if (!th || flags.noColor !== undefined) th = createTheme(detectTerm({ noColor: !!(flags["no-color"] || flags.noColor), ascii: !!flags.ascii }));
  return th;
}

export const say = (s = "") => process.stdout.write(s + "\n");
export const err = (s = "") => process.stderr.write(s + "\n");

export function heading(t, sub = "") {
  const T = theme();
  say(`${T.bold(T.gradient(`${T.sym.tool} ${t}`))}${sub ? "  " + T.muted(sub) : ""}`);
}

export function kv(rows, { indent = "  " } = {}) {
  const T = theme();
  const w = Math.max(...rows.map(([k]) => width(k)));
  for (const [k, v] of rows) say(`${indent}${T.muted(pad(k, w))}  ${v ?? T.muted("—")}`);
}

export function table(rows, headers, { maxCol = 48 } = {}) {
  const T = theme();
  const all = headers ? [headers, ...rows] : rows;
  const cols = process.stdout.columns || 120;
  const n = Math.max(...all.map((r) => r.length));
  const w = Array.from({ length: n }, (_, i) => Math.min(maxCol, Math.max(...all.map((r) => width(String(r[i] ?? ""))))));
  while (w.reduce((a, b) => a + b + 2, 0) > cols && Math.max(...w) > 8) w[w.indexOf(Math.max(...w))]--;
  if (headers) say("  " + headers.map((h, i) => T.muted(pad(truncate(String(h), w[i]), w[i]))).join("  "));
  for (const r of rows) say("  " + r.map((c, i) => pad(truncate(String(c ?? ""), w[i]), w[i])).join("  "));
}

/** Spinner on stderr while a promise runs (only on a TTY). */
export async function spin(label, p) {
  const T = theme();
  if (!process.stderr.isTTY) return p;
  let i = 0;
  const t = setInterval(() => process.stderr.write(`\r${T.accent(T.sym.spinner[i++ % T.sym.spinner.length])} ${T.muted(label)}\x1b[K`), 80);
  try { return await p; } finally { clearInterval(t); process.stderr.write("\r\x1b[K"); }
}

export function fail(msg, code = 1) {
  const T = theme();
  err(`${T.bad(T.sym.cross)} ${msg}`);
  process.exitCode = code;
}

/** Ask a question on the terminal (stderr prompt). hidden=true masks input. */
export function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve(null);
    if (!hidden) {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      rl.question(question, (a) => { rl.close(); resolve(a); });
      return;
    }
    process.stderr.write(question);
    const stdin = process.stdin;
    let buf = "";
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    const onData = (d) => {
      for (const ch of d) {
        if (ch === "\r" || ch === "\n") { stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData); process.stderr.write("\n"); return resolve(buf); }
        if (ch === "\x03") { stdin.setRawMode(false); stdin.off("data", onData); process.stderr.write("\n"); return resolve(null); }
        if (ch === "\x7f") { if (buf) { buf = buf.slice(0, -1); process.stderr.write("\b \b"); } continue; }
        buf += ch; process.stderr.write("•");
      }
    };
    stdin.on("data", onData);
  });
}

/** Attach a terminal approval handler to a runtime's approvals bus (for -p, gen, etc.). */
export function attachTerminalApprovals(approvals, { yes = false } = {}) {
  if (!process.stdin.isTTY && !yes) return () => {};
  const detach = approvals.attach();
  const T = theme();
  const queue = [];
  let busy = false;
  const next = async () => {
    if (busy || !queue.length) return;
    busy = true;
    const a = queue.shift();
    if (yes && a.kind !== "tx" && a.kind !== "question") { approvals.resolve(a.id, { approve: true }); busy = false; return next(); }
    if (!process.stdin.isTTY) { approvals.resolve(a.id, { approve: false, reason: "no_ui" }); busy = false; return next(); }
    err("");
    err(`${a.kind === "tx" ? T.warn(T.sym.warn) : T.accent(T.sym.tool)} ${T.bold(a.title)}`);
    if (a.detail) for (const l of a.detail.split("\n")) err(`  ${T.muted(l)}`);
    let ans;
    if (a.kind === "question") { if (a.options?.length) a.options.forEach((o, i) => err(`  ${i + 1}. ${o}`)); const r = await prompt(T.accent2(`${T.sym.prompt} `)); ans = { approve: r != null, answer: a.options?.[Number(r) - 1] ?? r }; }
    else if (a.confirmText) { const r = await prompt(T.warn(`Type "${a.confirmText}" to approve: `)); ans = { approve: true, answer: r }; }
    else { const r = await prompt(`${T.muted("Approve? [y/N] ")}`); ans = { approve: /^y(es)?$/i.test(String(r || "").trim()) }; }
    approvals.resolve(a.id, ans);
    busy = false;
    next();
  };
  const onReq = (a) => { queue.push(a); next(); };
  approvals.on("request", onReq);
  return () => { approvals.off("request", onReq); detach(); };
}
