#!/usr/bin/env node
// Renders the README's look: an animated hero banner, one card per feature, a Telegram "in use" demo, a "how a watch
// run works" flow and an install demo, all as dependency-free SVGs in assets/. Same input → same bytes.
// Style is Lumen's (near-black panels, condensed headlines, monospace labels, CSS keyframes, no motion under
// prefers-reduced-motion) in Pulse's own coral/amber, with a heartbeat line for a mark.
//
//   node scripts/render-assets.mjs            # writes assets/*.svg and splices the card grid into README.md
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const C = { bg: "#08080b", panel: "#111015", line: "#211d24", border: "#332b33", muted: "#998f96", sub: "#c4bcc0", text: "#f2ecee", coral: "#ff5f4a", amber: "#ffb43d", peach: "#ffd2b8", tg: "#17212b", tgIn: "#182533", tgOut: "#2b5278" };
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono','DejaVu Sans Mono',monospace";
const COND = "'Barlow Condensed','Roboto Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
const RISE = ".r{animation:rise 900ms cubic-bezier(.2,.8,.2,1) both}.r2{animation-delay:120ms}.r3{animation-delay:240ms}.r4{animation-delay:360ms}@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}";
// The heartbeat: a dash that runs along the trace, then rests.
const BEAT = (len = 100, ms = 2400) => `.hb{stroke-dasharray:${len};animation:hb ${ms}ms cubic-bezier(.4,0,.2,1) infinite}@keyframes hb{0%{stroke-dashoffset:${len}}55%,100%{stroke-dashoffset:0}}.hd{animation:hd ${ms}ms ease-out infinite}@keyframes hd{0%,50%{opacity:.25;r:4}58%{opacity:1;r:6.5}100%{opacity:.25;r:4}}`;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mono = (size, extra = "") => `font-family:${MONO};font-size:${size}px${extra}`;
const cond = (size) => `font-family:${COND};font-weight:700;font-size:${size}px`;
const sans = (size, extra = "") => `font-family:${SANS};font-size:${size}px${extra}`;
const pct = (n) => `${Math.max(0, Math.min(100, n)).toFixed(2)}%`;
const clip = (s, max) => (s.length <= max ? s : s.slice(0, max - 1).replace(/[\s,;:—-]+$/, "") + "…");

function wrap(text, max, lines = 2) {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const out = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = clip(kept[lines - 1], max);
    return kept;
  }
  return out;
}

const frame = (w, h, id, title, desc, style, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-t ${id}-d">
<title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(desc)}</desc>
<style>${style}${REDUCED}</style>
<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.coral}"/><stop offset="1" stop-color="${C.amber}"/></linearGradient></defs>
<rect width="${w}" height="${h}" rx="10" fill="${C.bg}"/>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" stroke="${C.border}"/>
${inner}
</svg>
`;

/** The Pulse mark: a rounded square with a heartbeat trace and an amber dot where the beat lands. */
const TRACE = "M10 36h12l5-10 7 22 7-30 6 18h7";
const mark = (x, y, size, id) => `<g transform="translate(${x} ${y}) scale(${size / 64})"><rect width="64" height="64" rx="16" fill="${C.panel}" stroke="${C.line}"/><path d="${TRACE}" fill="none" stroke="${C.line}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path class="hb" d="${TRACE}" pathLength="100" fill="none" stroke="url(#${id}-g)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle class="hd" cx="54" cy="36" r="4" fill="${C.amber}"/></g>`;

// ---------------------------------------------------------------------------------------------------------------
// Features: what the README cards show. Each has a kicker, title, summary, the rows its "how it works" panel ticks
// through, and a footer with the commands involved. Every row is something Pulse does today.

export const FEATURES = [
  { id: "live-x", href: "how-a-watch-run-works", kicker: "LIVE X SEARCH", title: "Live X, bounded", summary: "Each scan passes a UTC date window, handle allow and deny lists and max_turns, because x_search bills per post fetched. Only posts Grok cited count.", rows: ["--handles solana,jupiterexchange", "Window: the last run's day → tomorrow, UTC", "max_turns 2 caps the search loop", "Uncited and already-seen posts are dropped"], foot: "pulse watch add … --every 15m" },
  { id: "judge", href: "how-a-watch-run-works", kicker: "TWO MODELS", title: "One scans, one judges", summary: "grok-4.3 scans X with its 1M context; grok-4.7 judges at low effort with no tools and a strict JSON schema. Most scans should not alert.", rows: ["grok-4.3 + x_search finds the posts", "grok-4.7 decides: alert, severity, headline", "It can only cite URLs the scan returned", "A story already sent is never re-alerted"], foot: "config.model.scan · config.model.judge" },
  { id: "receipts", href: "receipts", kicker: "RECEIPTS", title: "Every dollar, from xAI", summary: "Caps are enforced from the cost_in_usd_ticks xAI returns on every response, so a cap is a real cap and pulse cost shows the real spend.", rows: ["--cap 0.40 per run", "Day caps per routine and overall", "A run that crosses its cap stops, keeps what it has", "pulse cost --today"], foot: "pulse cost · --days 7 · --routine <id>" },
  { id: "why", href: "use", kicker: "REPLAY", title: "Ask why, get the posts", summary: "Every Grok response is stored. pulse why replays an alert down to the posts that triggered it, the prices, the judgement and what it cost.", rows: ["Every response kept in SQLite", "pulse why al_x7k2…", "/why <id> works in Telegram too", "Posts, scores and cost on one screen"], foot: "pulse why <alertId>" },
  { id: "visuals", href: "how-a-watch-run-works", kicker: "GROK IMAGINE", title: "A card on every alert", summary: "Each alert gets a Grok Imagine image built from its headline, severity and symbols; high alerts can add a 6-second video brief.", rows: ["16:9 image on every alert", "--video adds a 6 s brief on high", "A budget stop still sends the text", "The card rides along in Telegram"], foot: "pulse watch add … --video" },
  { id: "telegram", href: "in-telegram", kicker: "CHANNELS", title: "Telegram, CLI and HTTP", summary: "A Telegram bot with commands and plain-text questions, the CLI, and a local HTTP server with a webhook trigger for anything else.", rows: ["/watch /brief /why /cost /pause /resume", "Any other message is a question", "POST /run/:id triggers a routine", "pulse serve runs HTTP on its own"], foot: "pulse run · pulse serve" },
  { id: "briefs", href: "use", kicker: "BRIEFS", title: "A brief at 07:30", summary: "Scheduled briefs combine x_search with web_search across your topics and arrive as one readable message at the time you set, in UTC.", rows: ["--topics \"AI agents, SOL, BTC ETF flows\"", "x_search and web_search together", "Delivered on schedule, UTC", "About $0.30–0.50 for three topics"], foot: "pulse brief add Morning --at 07:30" },
  { id: "ask", href: "use", kicker: "ASK", title: "Ask X anything, now", summary: "A one-off question with live X and web search behind it, capped like everything else. From the terminal or as a Telegram message.", rows: ["pulse ask \"what is CT saying about $SOL?\"", "Live X + web search", "Budget-capped like a routine", "Same answer path in Telegram"], foot: "pulse ask \"…\"" },
  { id: "zero", href: "develop", kicker: "ZERO DEPENDENCIES", title: "Node 22.13+, nothing else", summary: "The Responses API over HTTP, SSE and a hand-rolled WebSocket, node:sqlite for memory, and a full mock of api.x.ai for offline tests.", rows: ["\"dependencies\": {}", "node:sqlite for routines, runs and alerts", "86 offline tests against the mock", "CI on Node 22 and 24, Linux and macOS"], foot: "npm test · npm run mock" },
  { id: "safety", href: "safety", kicker: "SAFETY", title: "Pulse reads", summary: "It never trades, never posts publicly without your approval, and treats everything a tool returns as data, never as instructions.", rows: ["No wallet, no trades", "Public posts wait for an approval", "Post text is fenced as untrusted data", "Alerts are information, not advice"], foot: "approvals expire after 15 min" },
];

export function cardSvg(f) {
  const W = 600, H = 340;
  const titleLines = wrap(f.title.toUpperCase(), 34, 2);
  const tY = 74;
  const barY = tY + (titleLines.length - 1) * 32 + 16;
  const sumLines = wrap(f.summary, 74, titleLines.length > 1 ? 2 : 3);
  const T = 9000, row0 = 226, rowH = 20;
  const start = (i) => 10 + i * 17;
  let css = `${RISE}.lp{animation:lp ${T}ms linear infinite}@keyframes lp{0%,92%{opacity:1}97%,100%{opacity:0}}`;
  let rows = "";
  f.rows.slice(0, 4).forEach((s, i) => {
    const a = start(i), b = a + 7, y = row0 + i * rowH;
    css += `.s${i}{animation:s${i} ${T}ms linear infinite}@keyframes s${i}{0%,${pct(a)}{opacity:0;transform:translateX(-6px)}${pct(a + 2)},100%{opacity:1;transform:none}}`;
    css += `.k${i}{animation:k${i} ${T}ms linear infinite}@keyframes k${i}{0%,${pct(b)}{opacity:0}${pct(b + 1)},100%{opacity:1}}`;
    rows += `<g class="s${i}"><rect x="40" y="${y - 11}" width="13" height="13" rx="3" fill="none" stroke="${C.border}"/><text x="64" y="${y}" fill="${C.text}" style="${mono(12)}">${esc(clip(s, 62))}</text></g>`;
    rows += `<g class="k${i}"><rect x="40" y="${y - 11}" width="13" height="13" rx="3" fill="${C.coral}"/><path d="M43 ${y - 4.5} l2.6 2.6 l4.6 -5" fill="none" stroke="${C.bg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  });
  const inner = `<g class="r"><text x="28" y="40" fill="${C.amber}" style="${mono(11, ";letter-spacing:.14em")}">${esc(f.kicker)}</text>
<text x="${W - 28}" y="40" text-anchor="end" fill="${C.muted}" style="${mono(11, ";letter-spacing:.12em")}">PULSE</text></g>
<g class="r r2">${titleLines.map((l, i) => `<text x="27" y="${tY + i * 32}" fill="${C.text}" style="${cond(30)}">${esc(l)}</text>`).join("")}</g>
<rect class="r r2" x="28" y="${barY}" width="40" height="3" fill="url(#card-${f.id}-g)"/>
<g class="r r3">${sumLines.map((l, i) => `<text x="28" y="${barY + 26 + i * 19}" fill="${C.sub}" style="${sans(14)}">${esc(l)}</text>`).join("")}</g>
<rect x="24" y="186" width="${W - 48}" height="${H - 186 - 40}" rx="6" fill="${C.panel}" stroke="${C.line}"/>
<text x="40" y="204" fill="${C.muted}" style="${mono(9.5, ";letter-spacing:.14em")}">HOW IT WORKS</text>
<g class="lp">${rows}</g>
<text x="28" y="${H - 16}" fill="${C.muted}" style="${mono(10.5)}">${esc(clip(f.foot, 64))}</text>
<text x="${W - 28}" y="${H - 16}" text-anchor="end" fill="${C.muted}" style="${mono(10.5)}">${esc(f.id)}</text>`;
  return frame(W, H, `card-${f.id}`, `${f.title} — Pulse`, `${f.summary} ${f.rows.join("; ")}.`, css, inner);
}

export function bannerSvg() {
  const cmds = ['pulse watch add "Solana" --symbols SOL --every 15m', "pulse run", 'pulse ask "what is CT saying about $SOL?"', "pulse why al_x7k2…", "pulse cost --today", 'pulse brief add "Morning" --at 07:30', "pulse doctor"];
  const T = cmds.length * 1800, per = 100 / cmds.length;
  let css = RISE + BEAT() + `.cur{animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}`;
  cmds.forEach((_, i) => {
    const a = i * per, b = a + per;
    css += `.n${i}{${i ? "opacity:0;" : ""}animation:n${i} ${T}ms linear infinite}@keyframes n${i}{0%,${pct(a)}{opacity:0}${pct(a + 1)},${pct(b - 2)}{opacity:1}${pct(b - 1)},100%{opacity:0}}`;
  });
  // A faint ECG line across the bottom edge, beating in time with the mark.
  const ecg = "M0 290h126l8-10 10 16 10-30 10 22 6-6h650l8-10 10 16 10-30 10 22 6-6h320";
  css += `.ecg{stroke-dasharray:1000;animation:ecg 4800ms linear infinite}@keyframes ecg{0%{stroke-dashoffset:1000}100%{stroke-dashoffset:0}}`;
  const inner = `<path d="${ecg}" fill="none" stroke="${C.line}" stroke-width="2"/><path class="ecg" d="${ecg}" pathLength="1000" fill="none" stroke="url(#hero-g)" stroke-width="2" opacity=".55"/>
${mark(56, 40, 200, "hero")}
<g class="r"><text x="300" y="86" fill="${C.muted}" style="${mono(15, ";letter-spacing:.14em")}">PULSE · v${esc(pkg.version)} · GROK-NATIVE</text></g>
<g class="r r2"><text x="296" y="156" fill="${C.text}" style="${cond(56)}">A WATCHER FOR THINGS THAT MOVE</text></g>
<rect x="300" y="176" width="56" height="3" fill="url(#hero-g)"/>
<g class="r r3"><text x="300" y="210" fill="${C.sub}" style="${sans(18)}">Live X search · a two-model judge · Grok Imagine cards · Telegram alerts · exact cost receipts</text></g>
<g class="r r4"><text x="300" y="248" fill="${C.muted}" style="${mono(14)}">$</text>${cmds.map((c, i) => `<text class="n${i}" x="318" y="248" fill="${C.amber}" style="${mono(14)}">${esc(c)}</text>`).join("")}</g>
<text x="1144" y="256" text-anchor="end" fill="${C.muted}" style="${mono(13, ";letter-spacing:.12em")}">NODE ≥ 22.13 · MIT</text>`;
  return frame(1200, 300, "hero", `Pulse ${pkg.version}: a Grok-native harness for things that move`, pkg.description, css, inner);
}

export function flowSvg() {
  const nodes = [
    ["WINDOW", "last run's day →", "tomorrow, UTC"],
    ["SCAN", "grok-4.3 + x_search,", "cited posts only"],
    ["JUDGE", "grok-4.7, no tools:", "alert or not"],
    ["CARD", "Grok Imagine image,", "video on high"],
    ["SEND", "Telegram + stored", "for pulse why"],
  ];
  const T = 7500, w = 196, gap = 30, x0 = 46, y = 92;
  let css = `.e{animation:flow 1.6s linear infinite}@keyframes flow{to{stroke-dashoffset:-20}}`;
  let out = "";
  nodes.forEach(([h, a, b], i) => {
    const x = x0 + i * (w + gap), s = i * 20, e = s + 20;
    css += `.h${i}{opacity:0;animation:h${i} ${T}ms linear infinite}@keyframes h${i}{0%,${pct(s)}{opacity:0}${pct(s + 2)},${pct(e)}{opacity:1}${pct(e + 2)},100%{opacity:0}}`;
    out += `<rect x="${x}" y="${y}" width="${w}" height="120" rx="8" fill="${C.panel}" stroke="${C.border}"/><rect class="h${i}" x="${x}" y="${y}" width="${w}" height="120" rx="8" fill="none" stroke="${C.amber}" stroke-width="1.5"/>`;
    out += `<text x="${x + 18}" y="${y + 30}" fill="${C.muted}" style="${mono(10.5, ";letter-spacing:.12em")}">0${i + 1}</text><text x="${x + 18}" y="${y + 58}" fill="${C.text}" style="${cond(21)}">${esc(h)}</text>`;
    out += `<text x="${x + 18}" y="${y + 84}" fill="${C.sub}" style="${sans(13)}">${esc(a)}</text><text x="${x + 18}" y="${y + 102}" fill="${C.sub}" style="${sans(13)}">${esc(b)}</text>`;
    if (i < nodes.length - 1) out += `<path class="e" d="M${x + w + 2} ${y + 60} L${x + w + gap - 2} ${y + 60}" fill="none" stroke="${C.coral}" stroke-width="1.5" stroke-dasharray="4 6"/>`;
  });
  const inner = `<text x="46" y="44" fill="${C.muted}" style="${mono(11, ";letter-spacing:.14em")}">PULSE</text><text x="46" y="72" fill="${C.text}" style="${cond(26)}">HOW A WATCH RUN WORKS</text>
${out}
<text x="46" y="250" fill="${C.muted}" style="${mono(11)}">The budget is checked after every response. A run that crosses its cap stops there, and still delivers what it has.</text>`;
  return frame(1200, 270, "flow", "How a watch run works", "Window, scan with grok-4.3 and x_search, judge with grok-4.7, render a Grok Imagine card, send to Telegram and store for pulse why.", css, inner);
}

export function installSvg() {
  const lines = [
    ["$ ", "git clone https://github.com/claudia-onchain/harness.git && cd harness/pulse", C.text],
    ["$ ", "npm link && pulse init", C.text],
    ["✓ ", "~/.pulse ready · xai key tested live", C.amber],
    ["$ ", "pulse keys set telegram 123456:ABC…", C.text],
    ["$ ", 'pulse watch add "Solana" --symbols SOL --keywords solana --every 15m --cap 0.40', C.text],
    ["$ ", "pulse run", C.text],
  ];
  const T = 12000, cw = 7.8;
  let css = `.lp{animation:lp ${T}ms linear infinite}@keyframes lp{0%,94%{opacity:1}98%,100%{opacity:0}}@media (prefers-reduced-motion:reduce){.cv{display:none}}`;
  let out = "", t = 4;
  lines.forEach(([p, raw, fill], i) => {
    const text = clip(raw, 98), y = 76 + i * 28, len = text.length, dur = Math.min(18, len * 0.22), a = t, b = t + dur;
    css += `.p${i}{animation:p${i} ${T}ms linear infinite}@keyframes p${i}{0%,${pct(a)}{opacity:0}${pct(a + 0.1)},100%{opacity:1}}`;
    css += `.c${i}{animation:c${i} ${T}ms linear infinite}@keyframes c${i}{0%,${pct(a)}{transform:translateX(0);animation-timing-function:steps(${len},end)}${pct(b)},100%{transform:translateX(${(len * cw).toFixed(1)}px)}}`;
    out += `<g class="p${i}"><text x="24" y="${y}" fill="${fill === C.amber ? C.amber : C.muted}" style="${mono(13, ";white-space:pre")}">${esc(p)}</text><text x="44" y="${y}" fill="${fill}" style="${mono(13, ";white-space:pre")}">${esc(text)}</text><rect class="cv c${i}" x="44" y="${y - 15}" width="${len * cw + 12}" height="21" fill="${C.bg}"/></g>`;
    t = b + 4;
  });
  const inner = `<rect x="1" y="1" width="818" height="32" rx="9" fill="${C.panel}"/><rect y="32" width="820" height="1" fill="${C.line}"/>
<circle cx="18" cy="17" r="5" fill="${C.border}"/><circle cx="34" cy="17" r="5" fill="${C.border}"/><circle cx="50" cy="17" r="5" fill="${C.border}"/>
<text x="410" y="21" text-anchor="middle" fill="${C.muted}" style="${mono(11.5)}">install pulse · Node 22.13+</text>
<g class="lp">${out}</g>`;
  return frame(820, 252, "install", "Install Pulse", "Clone, link the pulse command, init and test the xAI key, add a Telegram bot, add a Solana watch, run.", css, inner);
}

/**
 * Pulse in use: a Telegram chat where a sample alert lands (card, caption, prices, cited posts), then /why and /cost
 * are answered. Handles and numbers are illustrative, and the corner says so.
 */
export function telegramSvg() {
  const W = 820, H = 640, T = 16000;
  // [startPct, element]; each element fades and rises in at its start, and everything resets together at the end.
  const steps = [];
  let css = `.lp{animation:lp ${T}ms linear infinite}@keyframes lp{0%,95%{opacity:1}98.5%,100%{opacity:0}}` + BEAT(100, 1600);
  const show = (cls, at) => { css += `.${cls}{animation:${cls} ${T}ms cubic-bezier(.2,.8,.2,1) infinite}@keyframes ${cls}{0%,${pct(at)}{opacity:0;transform:translateY(10px)}${pct(at + 2.5)},100%{opacity:1;transform:none}}`; };

  // Typing dots before the alert.
  css += `.ty{animation:ty ${T}ms linear infinite}@keyframes ty{0%,2%{opacity:0}3%,11%{opacity:1}12%,100%{opacity:0}}.d1,.d2,.d3{animation:dt 900ms ease-in-out infinite}.d2{animation-delay:150ms}.d3{animation-delay:300ms}@keyframes dt{0%,100%{opacity:.3}50%{opacity:1}}`;

  // The alert bubble: Imagine card on top, caption under it.
  const bx = 28, bw = 470, by = 72;
  show("a1", 12);
  const card = `<g class="a1"><rect x="${bx}" y="${by}" width="${bw}" height="310" rx="14" fill="${C.tgIn}"/>
<rect x="${bx + 6}" y="${by + 6}" width="${bw - 12}" height="128" rx="10" fill="url(#tg-card)"/>
<path d="M${bx + 6} ${by + 104} l70 -26 l50 14 l84 -44 l64 30 l58 -12 l132 -34 v102 h-${bw - 12} z" fill="${C.bg}" opacity=".28"/>
<text x="${bx + 24}" y="${by + 36}" fill="${C.bg}" style="${mono(10.5, ";letter-spacing:.14em;font-weight:700")}">SOL · MEDIUM</text>
<text x="${bx + 22}" y="${by + 70}" fill="${C.bg}" style="${cond(30)}">SOLANA DEX VOLUME</text>
<text x="${bx + 22}" y="${by + 100}" fill="${C.bg}" style="${cond(30)}">HITS A 7-MONTH HIGH</text>
<text x="${bx + bw - 18}" y="${by + 124}" text-anchor="end" fill="${C.bg}" style="${mono(9.5, ";letter-spacing:.12em")}">GROK IMAGINE</text>
<circle cx="${bx + 22}" cy="${by + 160}" r="6" fill="${C.amber}"/>
<text x="${bx + 36}" y="${by + 165}" fill="${C.text}" style="${sans(15, ";font-weight:700")}">Solana DEX volume hits a 7-month high</text>
<text x="${bx + 16}" y="${by + 190}" fill="${C.sub}" style="${sans(13)}">24h DEX volume crossed a record as a large holder moved SOL</text>
<text x="${bx + 16}" y="${by + 208}" fill="${C.sub}" style="${sans(13)}">from an exchange into staking. Price and chatter agree.</text>
<rect x="${bx + 14}" y="${by + 220}" width="230" height="22" rx="4" fill="${C.tg}"/>
<text x="${bx + 22}" y="${by + 236}" fill="${C.peach}" style="${mono(12)}">SOL $172.40 +6.1% ▁▃▄▆█</text>
<text x="${bx + 16}" y="${by + 262}" fill="${C.sub}" style="${mono(11.5)}">sentiment ▰▰▰▰▱ +0.62 · velocity 71%</text>
<text x="${bx + 16}" y="${by + 284}" fill="#6ab3f3" style="${sans(13)}">• @dex_stats <tspan fill="${C.sub}">— 24h volume record</tspan>  • @whale_watch <tspan fill="${C.sub}">— moved to staking</tspan></text>
<text x="${bx + 16}" y="${by + 302}" fill="${C.muted}" style="${mono(11.5, ";font-style:italic")}">pulse why al_x7k2</text>
<text x="${bx + bw - 14}" y="${by + 302}" text-anchor="end" fill="${C.muted}" style="${sans(11)}">07:42</text></g>`;

  // You: /why
  show("u1", 34);
  const u1 = `<g class="u1"><rect x="${W - 28 - 170}" y="400" width="170" height="38" rx="14" fill="${C.tgOut}"/><text x="${W - 44 - 154 + 8}" y="424" fill="${C.text}" style="${mono(13)}">/why al_x7k2</text><text x="${W - 40}" y="432" text-anchor="end" fill="#a8c7e6" style="${sans(10)}">07:43 ✓✓</text></g>`;

  // Pulse: the why
  show("a2", 44);
  const a2 = `<g class="a2"><rect x="${bx}" y="450" width="${bw}" height="92" rx="14" fill="${C.tgIn}"/>
<text x="${bx + 16}" y="474" fill="${C.text}" style="${sans(13.5, ";font-weight:700")}">Solana DEX volume hits a 7-month high <tspan fill="${C.muted}" style="font-weight:400">[medium]</tspan></text>
<text x="${bx + 16}" y="496" fill="#6ab3f3" style="${sans(12.5)}">• @dex_stats <tspan fill="${C.sub}">— 24h DEX volume crossed a record</tspan></text>
<text x="${bx + 16}" y="514" fill="#6ab3f3" style="${sans(12.5)}">• @whale_watch <tspan fill="${C.sub}">— exchange withdrawal, then staked</tspan></text>
<text x="${bx + 16}" y="533" fill="${C.muted}" style="${mono(11, ";font-style:italic")}">scan + judge + image · $0.0412</text></g>`;

  // You: /cost, Pulse: spend
  show("u2", 60);
  const u2 = `<g class="u2"><rect x="${W - 28 - 110}" y="554" width="110" height="34" rx="14" fill="${C.tgOut}"/><text x="${W - 28 - 96}" y="576" fill="${C.text}" style="${mono(13)}">/cost</text><text x="${W - 40}" y="582" text-anchor="end" fill="#a8c7e6" style="${sans(10)}">✓✓</text></g>`;
  show("a3", 68);
  const a3 = `<g class="a3"><rect x="${bx}" y="596" width="300" height="30" rx="12" fill="${C.tgIn}"/><text x="${bx + 16}" y="616" fill="${C.text}" style="${sans(13)}"><tspan style="font-weight:700">Spend</tspan> today $0.31 of $5 cap</text></g>`;

  const inner = `<defs><linearGradient id="tg-card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.coral}"/><stop offset="1" stop-color="${C.amber}"/></linearGradient></defs>
<rect x="1" y="1" width="${W - 2}" height="54" rx="9" fill="${C.tg}"/><rect y="55" width="${W}" height="1" fill="#0e1621"/>
${mark(20, 9, 38, "tg")}
<text x="70" y="27" fill="${C.text}" style="${sans(15, ";font-weight:700")}">Pulse</text><text x="70" y="45" fill="#6d7f8f" style="${sans(12)}">bot · watching Solana every 15m</text>
<text x="${W - 22}" y="34" text-anchor="end" fill="${C.muted}" style="${mono(10, ";letter-spacing:.14em")}">SAMPLE ALERT</text>
<rect y="56" width="${W}" height="${H - 57}" fill="#0e1621"/>
<g class="lp">
<g class="ty"><rect x="${bx}" y="${by}" width="64" height="34" rx="14" fill="${C.tgIn}"/><circle class="d1" cx="${bx + 20}" cy="${by + 17}" r="3.5" fill="${C.muted}"/><circle class="d2" cx="${bx + 32}" cy="${by + 17}" r="3.5" fill="${C.muted}"/><circle class="d3" cx="${bx + 44}" cy="${by + 17}" r="3.5" fill="${C.muted}"/></g>
${card}
${u1}
${a2}
${u2}
${a3}
</g>`;
  return frame(W, H, "tg", "Pulse in Telegram", "A sample alert arrives with a Grok Imagine card, prices, sentiment and cited posts; /why replays the posts and cost; /cost shows today's spend against the cap.", css, inner);
}

/** The README card grid, two per row. */
export function cardGrid() {
  const cells = FEATURES.map((f) => `<td width="50%" valign="top"><a href="#${f.href}"><img src="assets/cards/${f.id}.svg" alt="${esc(`${f.title}: ${f.summary}`)}" width="100%"></a></td>`);
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>\n${cells[i]}\n${cells[i + 1] ?? '<td width="50%"></td>'}\n</tr>`);
  return `<table>\n${rows.join("\n")}\n</table>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = join(root, "assets");
  mkdirSync(join(out, "cards"), { recursive: true });
  const files = { "banner.svg": bannerSvg(), "how-it-works.svg": flowSvg(), "install.svg": installSvg(), "telegram.svg": telegramSvg() };
  for (const f of FEATURES) files[`cards/${f.id}.svg`] = cardSvg(f);
  for (const [name, svg] of Object.entries(files)) writeFileSync(join(out, name), svg);
  // Splice the grid into README.md between the markers so the cards and the features list never drift.
  const readmePath = join(root, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const grid = `<!-- cards:start (generated by scripts/render-assets.mjs — edit FEATURES there, not this table) -->\n${cardGrid()}\n<!-- cards:end -->`;
  const next = /<!-- cards:start[\s\S]*?<!-- cards:end -->/.test(readme) ? readme.replace(/<!-- cards:start[\s\S]*?<!-- cards:end -->/, grid) : readme;
  if (next !== readme) writeFileSync(readmePath, next);
  console.log(`✓ ${Object.keys(files).length} SVGs → assets/${next !== readme ? " · README card grid updated" : ""}`);
}
