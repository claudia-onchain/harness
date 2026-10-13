// Brand tokens (shared with the dashboard) rendered at the terminal's colour depth, plus Unicode/ASCII symbols.
export const TOKENS = {
  bg: "#07080c", panel: "#0e1016", line: "#1c2030", text: "#e8ecf4", muted: "#8a93a6",
  accent: "#7c5cff", accent2: "#22d3ee", ok: "#34d399", warn: "#fbbf24", bad: "#f43f5e",
  user: "#141826", code: "#0b0d13",
};

const ANSI16 = { bg: 40, panel: 40, line: 90, text: 97, muted: 90, accent: 95, accent2: 96, ok: 92, warn: 93, bad: 91, user: 40, code: 40 };

export const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export function rgbTo256(r, g, b) {
  if (r === g && g === b) { if (r < 8) return 16; if (r > 248) return 231; return Math.round(((r - 8) / 247) * 24) + 232; }
  const q = (v) => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function rgb16(r, g, b) {
  const bright = Math.max(r, g, b) > 170;
  const idx = (r > 110 ? 1 : 0) + (g > 110 ? 2 : 0) + (b > 110 ? 4 : 0);
  return (bright ? 90 : 30) + idx;
}

const SYM_UNI = {
  prompt: "❯", bullet: "•", check: "✓", cross: "✗", warn: "!", dot: "●", ring: "○", arrow: "→", tool: "◆", think: "∴", bar: "▎", block: "█", half: "▀", sparkle: "✦", ellipsis: "…", sep: "·",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], pulse: ["∙", "•", "●", "•"],
  box: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" }, hr: "─", todo: { pending: "○", active: "◐", done: "●" },
  sel: "›", up: "↑", down: "↓",
};
const SYM_ASCII = {
  prompt: ">", bullet: "*", check: "v", cross: "x", warn: "!", dot: "*", ring: "o", arrow: "->", tool: "*", think: "~", bar: "|", block: "#", half: "#", sparkle: "*", ellipsis: "...", sep: "|",
  spinner: ["|", "/", "-", "\\"], pulse: [".", "o", "O", "o"],
  box: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" }, hr: "-", todo: { pending: "[ ]", active: "[>]", done: "[x]" },
  sel: ">", up: "^", down: "v",
};

export function createTheme(term) {
  const level = term.color;
  const sgr = (open, close) => (level === 0 ? (s) => String(s) : (s) => `\x1b[${open}m${s}\x1b[${close}m`);
  const fgHex = (hex) => {
    if (level === 0) return (s) => String(s);
    const [r, g, b] = hexToRgb(hex);
    const code = level === 3 ? `38;2;${r};${g};${b}` : level === 2 ? `38;5;${rgbTo256(r, g, b)}` : String(rgb16(r, g, b));
    return (s) => `\x1b[${code}m${s}\x1b[39m`;
  };
  const bgHex = (hex) => {
    if (level < 2) return (s) => String(s);
    const [r, g, b] = hexToRgb(hex);
    const code = level === 3 ? `48;2;${r};${g};${b}` : `48;5;${rgbTo256(r, g, b)}`;
    return (s) => `\x1b[${code}m${s}\x1b[49m`;
  };
  const tok = (name) => (level === 1 ? sgr(ANSI16[name], 39) : fgHex(TOKENS[name]));
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  /** Per-character gradient between two hex colours; `shift` animates it. */
  const gradient = (s, from = TOKENS.accent, to = TOKENS.accent2, shift = 0) => {
    if (level < 2) return tok("accent")(s);
    const chars = Array.from(String(s));
    const A = hexToRgb(from), B = hexToRgb(to);
    const n = Math.max(1, chars.length - 1);
    return chars.map((c, i) => {
      if (c === " ") return c;
      let t = ((i / n) + shift) % 2; if (t > 1) t = 2 - t;
      const r = lerp(A[0], B[0], t), g = lerp(A[1], B[1], t), b = lerp(A[2], B[2], t);
      return level === 3 ? `\x1b[38;2;${r};${g};${b}m${c}` : `\x1b[38;5;${rgbTo256(r, g, b)}m${c}`;
    }).join("") + "\x1b[39m";
  };
  const mix = (hexA, hexB, t) => { const A = hexToRgb(hexA), B = hexToRgb(hexB); return "#" + [0, 1, 2].map((i) => lerp(A[i], B[i], t).toString(16).padStart(2, "0")).join(""); };
  return {
    term, level, sym: term.unicode ? SYM_UNI : SYM_ASCII,
    bold: sgr(1, 22), dim: sgr(2, 22), italic: sgr(3, 23), ul: sgr(4, 24), inverse: sgr(7, 27), strike: sgr(9, 29),
    text: tok("text"), muted: tok("muted"), accent: tok("accent"), accent2: tok("accent2"), ok: tok("ok"), warn: tok("warn"), bad: tok("bad"), line: tok("line"),
    hex: fgHex, bgHex, gradient, mix,
    panelBg: bgHex(TOKENS.panel), userBg: bgHex(TOKENS.user), codeBg: bgHex(TOKENS.code),
    thinkingColor: (lvl) => ({ off: TOKENS.line, low: "#3b4a6b", medium: TOKENS.accent, high: "#a78bfa", xhigh: TOKENS.accent2 }[lvl] || TOKENS.line),
  };
}
