// ANSI-aware string utilities: strip, visible width (wide chars/emoji = 2, combining = 0), truncate, wrap.
export const ESC = "\x1b";
export const CSI = "\x1b[";
const ANSI_RE = /\x1b\[[0-9;?:<=>]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[PX^_][^\x1b]*\x1b\\|\x1b[@-Z\\-_]/g;
const ANSI_AT = /^(?:\x1b\[[0-9;?:<=>]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_])/;

export const strip = (s) => String(s).replace(ANSI_RE, "");

export function charWidth(cp) {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x20e3 || (cp >= 0xe0100 && cp <= 0xe01ef) || (cp >= 0x1f3fb && cp <= 0x1f3ff)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || cp === 0x2329 || cp === 0x232a || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) || (cp >= 0x1f900 && cp <= 0x1f9ff) || (cp >= 0x1fa70 && cp <= 0x1faff) || (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) return 2;
  return 1;
}

export function width(s) {
  let w = 0;
  for (const ch of strip(s)) w += charWidth(ch.codePointAt(0));
  return w;
}

/** Split into tokens: { ansi } or { ch, w }. */
function* tokens(s) {
  const str = String(s);
  let i = 0;
  while (i < str.length) {
    if (str[i] === "\x1b") {
      const m = ANSI_AT.exec(str.slice(i, i + 256));
      if (m) { yield { ansi: m[0] }; i += m[0].length; continue; }
    }
    const cp = str.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    yield { ch, w: charWidth(cp) };
    i += ch.length;
  }
}

/** Cut to `max` columns; adds an ellipsis when cut. Keeps ANSI codes, resets at the end if cut. */
export function truncate(s, max, ellipsis = "…") {
  if (max <= 0) return "";
  if (width(s) <= max) return s;
  let out = "", w = 0;
  const ew = width(ellipsis);
  for (const t of tokens(s)) {
    if (t.ansi) { out += t.ansi; continue; }
    if (w + t.w > max - ew) break;
    out += t.ch; w += t.w;
  }
  return out + ellipsis + (/\x1b\[/.test(out) ? "\x1b[0m" : "");
}

/** Pad (or cut) to exactly n columns. */
export function pad(s, n) {
  const w = width(s);
  return w >= n ? truncate(s, n, "") : s + " ".repeat(n - w);
}

/**
 * Word-wrap to `max` columns, preserving SGR state across lines. Returns string[].
 * Long words are hard-broken. `indent` is prefixed to continuation lines.
 */
export function wrap(s, max, { indent = "" } = {}) {
  const out = [];
  if (max < 4) max = 4;
  for (const para of String(s).split("\n")) {
    let line = "", lw = 0, active = "", word = "", ww = 0, wordStartActive = "";
    const iw = width(indent);
    const pushLine = () => { out.push(line + (active ? "\x1b[0m" : "")); line = (out.length ? indent : "") + active; lw = out.length ? iw : 0; };
    const flushWord = () => {
      if (!word) return;
      if (lw + ww > max && lw > (out.length ? iw : 0)) {
        line = line.replace(/ +$/, ""); pushLine();
        if (/^ +$/.test(strip(word))) { word = ""; ww = 0; return; }
      }
      if (ww > max - (out.length ? iw : 0)) {
        for (const t of tokens(word)) {
          if (t.ansi) { line += t.ansi; continue; }
          if (lw + t.w > max) pushLine();
          line += t.ch; lw += t.w;
        }
      } else { line += word; lw += ww; }
      word = ""; ww = 0;
    };
    for (const t of tokens(para)) {
      if (t.ansi) {
        if (/^\x1b\[0?m$/.test(t.ansi)) active = ""; else if (/^\x1b\[[\d;]*m$/.test(t.ansi)) active += t.ansi;
        word += t.ansi;
        continue;
      }
      if (t.ch === " ") { flushWord(); word = " "; ww = 1; flushWord(); continue; }
      word += t.ch; ww += t.w;
      void wordStartActive;
    }
    flushWord();
    out.push(line + (active ? "\x1b[0m" : ""));
  }
  return out;
}

export const cursorTo = (col) => `\x1b[${col + 1}G`;
export const up = (n) => (n > 0 ? `\x1b[${n}A` : "");
export const down = (n) => (n > 0 ? `\x1b[${n}B` : "");
export const CLEAR_LINE = "\x1b[2K";
export const CLEAR_EOL = "\x1b[K";
export const CLEAR_DOWN = "\x1b[J";
export const HIDE_CURSOR = "\x1b[?25l";
export const SHOW_CURSOR = "\x1b[?25h";
export const SYNC_START = "\x1b[?2026h";
export const SYNC_END = "\x1b[?2026l";
export const PASTE_ON = "\x1b[?2004h";
export const PASTE_OFF = "\x1b[?2004l";
export const link = (text, url, enabled = true) => (enabled ? `\x1b]8;;${url}\x07${text}\x1b]8;;\x07` : text);
