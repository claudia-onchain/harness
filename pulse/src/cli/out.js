// Tiny ANSI helper shared by the CLI and the logger. No dependencies: colours only when the target
// stream is a TTY and NO_COLOR is unset, so piped output stays clean.
export function colours(stream = process.stdout) {
  const on = !process.env.NO_COLOR && !!stream?.isTTY && process.env.TERM !== "dumb";
  const c = (open, close) => (s) => (on ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
  return {
    on,
    bold: c(1, 22), dim: c(2, 22), italic: c(3, 23),
    red: c(31, 39), green: c(32, 39), yellow: c(33, 39), blue: c(34, 39), magenta: c(35, 39), cyan: c(36, 39), grey: c(90, 39),
  };
}

export const C = colours(process.stdout);
export const SYM = { ok: "✓", bad: "✗", warn: "!", dot: "•", arrow: "→" };

export const say = (s = "") => process.stdout.write(s + "\n");
export const err = (s = "") => process.stderr.write(s + "\n");

export function heading(title, sub = "") {
  say(`${C.bold(C.cyan(title))}${sub ? "  " + C.dim(sub) : ""}`);
}

export const ok = (s) => say(`${C.green(SYM.ok)} ${s}`);
export const warn = (s) => err(`${C.yellow(SYM.warn)} ${s}`);

export function fail(msg, code = 1) {
  err(`${C.red(SYM.bad)} ${msg}`);
  process.exitCode = code;
}

/** Two-column key/value block. */
export function kv(rows, { indent = "  " } = {}) {
  const w = Math.max(0, ...rows.map(([k]) => String(k).length));
  for (const [k, v] of rows) say(`${indent}${C.dim(String(k).padEnd(w))}  ${v == null || v === "" ? C.dim("—") : v}`);
}

/** Plain table that fits the terminal width; long cells are truncated with an ellipsis. */
export function table(rows, headers, { maxCol = 48, indent = "  " } = {}) {
  const all = headers ? [headers, ...rows] : rows;
  if (!all.length) return;
  const cols = process.stdout.columns || 120;
  const n = Math.max(...all.map((r) => r.length));
  const w = Array.from({ length: n }, (_, i) => Math.min(maxCol, Math.max(...all.map((r) => String(r[i] ?? "").length))));
  while (w.reduce((a, b) => a + b + 2, indent.length) > cols && Math.max(...w) > 8) w[w.indexOf(Math.max(...w))]--;
  const cut = (s, m) => (s.length > m ? s.slice(0, Math.max(0, m - 1)) + "…" : s);
  const line = (r, paint = (s) => s) => indent + r.map((c, i) => paint(cut(String(c ?? ""), w[i]).padEnd(w[i]))).join("  ");
  if (headers) say(line(headers, C.dim));
  for (const r of rows) say(line(r));
}

export const usd = (n, d = 4) => `$${Number(n || 0).toFixed(d)}`;
export const when = (iso) => (iso ? String(iso).replace("T", " ").replace(/\.\d+Z$/, "Z") : "—");
