// Boot animation: a block-letter LUMEN wordmark revealed by a scanline, lit by a diagonal light sweep over a
// violet→cyan gradient with a few drifting particles, then a live checklist (spinners → ✓ / ! / ✗).
// ~1.4 s, any key skips the animation; skipped entirely when not a TTY or LUMEN_NO_BOOT=1.
import { truncate } from "./ansi.js";
import { TOKENS, hexToRgb } from "./theme.js";
import { spinnerFrame } from "./components.js";

const FONT = {
  L: ["#    ", "#    ", "#    ", "#    ", "#####"],
  U: ["#   #", "#   #", "#   #", "#   #", " ### "],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
  E: ["#####", "#    ", "#### ", "#    ", "#####"],
  N: ["#   #", "##  #", "# # #", "#  ##", "#   #"],
};
const WORD = "LUMEN";
export const MARK = (() => {
  const rows = Array.from({ length: 5 }, () => "");
  for (const [i, ch] of [...WORD].entries()) for (let r = 0; r < 5; r++) rows[r] += FONT[ch][r] + (i < WORD.length - 1 ? " " : "");
  return rows; // 29 px wide; each px is 2 columns
})();

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function pixelColor(th, x, y, t, sweepX, revealed) {
  const W = MARK[0].length;
  const A = hexToRgb(TOKENS.accent), B = hexToRgb(TOKENS.accent2);
  let k = (x / (W - 1) + Math.sin(t / 900) * 0.15);
  k = Math.max(0, Math.min(1, k));
  let rgb = [lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)];
  const d = Math.abs(x - (sweepX - y * 1.2));
  const boost = Math.max(0, 1 - d / 3.2);
  if (boost) rgb = rgb.map((v) => lerp(v, 255, boost * 0.85));
  if (!revealed) rgb = rgb.map((v) => Math.round(v * 0.18));
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Render the wordmark at time t (ms). final=true renders the settled look. */
export function renderMark(th, t, { final = false, particles = [] } = {}) {
  const W = MARK[0].length;
  const px = th.term.unicode ? "██" : "##";
  const dur = 1100;
  const sweepX = final ? -99 : ((t / dur) * (W + 16)) - 8;
  const lines = [];
  for (let y = -1; y < 6; y++) {
    let line = "";
    for (let x = -2; x < W + 2; x++) {
      const on = y >= 0 && y < 5 && x >= 0 && x < W && MARK[y][x] === "#";
      const revealed = final || t > y * 90 + 60;
      if (on) {
        if (th.level === 0) line += px;
        else line += th.hex(pixelColor(th, x, y, t, sweepX, revealed))(px);
      } else {
        const p = !final && particles.find((q) => Math.round(q.x) === x && Math.round(q.y) === y);
        if (p) line += th.hex(p.color)(p.glyph) + " ";
        else line += "  ";
      }
    }
    lines.push("  " + line);
  }
  // scanline: a faint bright row moving down during reveal
  return lines;
}

function makeParticles(th) {
  const glyphs = th.term.unicode ? ["✦", "·", "⋆", "∙", "✧"] : ["*", ".", "+", "."];
  const W = MARK[0].length;
  return Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * (W + 4) - 2, y: -1 + Math.random() * 7, vx: 0.012 + Math.random() * 0.02, vy: -0.003 - Math.random() * 0.006, glyph: glyphs[i % glyphs.length], color: i % 2 ? TOKENS.accent2 : "#a78bfa" }));
}

const ICON = (th, st, t) => (st === "pending" ? th.accent(spinnerFrame(th, t)) : st === "ok" ? th.ok(th.sym.check) : st === "warn" ? th.warn(th.sym.warn) : st === "skip" ? th.muted("-") : th.bad(th.sym.cross));

export function checklistLines(th, checks, t, cols) {
  return checks.map((c) => truncate(`  ${ICON(th, c.status, t)} ${th.muted(c.label.padEnd(10))} ${c.status === "pending" ? th.muted(c.pendingText || "checking…") : c.status === "ok" ? th.text(c.text) : c.status === "warn" ? th.warn(c.text) : c.status === "skip" ? th.muted(c.text) : th.bad(c.text)}`, cols));
}

/**
 * Play the boot sequence on `screen`. checks: [{ label, run: () => Promise<{status, text}> }].
 * Resolves with the final header lines (committed by the caller) and the check results.
 */
export async function playBoot({ screen, th, keys, checks, version, maxMs = 2600, tagline }) {
  const t0 = Date.now();
  const particles = makeParticles(th);
  const state = checks.map((c) => ({ label: c.label, status: "pending", text: "", pendingText: c.pendingText }));
  let skipped = false;
  const onKey = () => { skipped = true; };
  keys?.on("key", onKey);
  checks.forEach((c, i) => {
    Promise.resolve().then(c.run).then((r) => Object.assign(state[i], r || { status: "ok", text: "" }), (e) => Object.assign(state[i], { status: "fail", text: e.message }));
  });
  const { cols } = screen.size();
  const narrow = cols < 66;
  const tag = th.muted(tagline || "bring-your-own-keys agent · chains · media · screen");
  const ver = th.muted(`v${version}`);
  const head = (t, final) => narrow
    ? ["", `  ${th.bold(th.gradient("◆ LUMEN", TOKENS.accent, TOKENS.accent2, final ? 0 : (t / 1400)))}  ${ver}`, `  ${tag}`, ""]
    : [...renderMark(th, t, { final, particles }), `  ${tag}  ${ver}`, ""];
  await new Promise((resolve) => {
    const tick = () => {
      const t = Date.now() - t0;
      for (const p of particles) { p.x += p.vx * 33; p.y += p.vy * 33; if (p.x > MARK[0].length + 2) p.x = -2; if (p.y < -1) p.y = 5.5; }
      const animDone = skipped || t > 1300;
      const shown = state.filter((_, i) => skipped || t > 500 + i * 70);
      const allDone = state.every((s) => s.status !== "pending");
      screen.frame([...head(t, animDone), ...checklistLines(th, shown, t, cols)], null);
      if ((animDone && allDone && shown.length === state.length) || t > maxMs || (skipped && t > Math.min(maxMs, 700) && shown.length === state.length && allDone)) return resolve();
      if (skipped && t > 900) return resolve();
      setTimeout(tick, 33);
    };
    tick();
  });
  keys?.off("key", onKey);
  for (const s of state) if (s.status === "pending") Object.assign(s, { status: "skip", text: "still checking (continues in background)" });
  const t = Date.now() - t0;
  const lines = [...head(t, true), ...checklistLines(th, state, t, cols)];
  return { lines, results: state };
}
