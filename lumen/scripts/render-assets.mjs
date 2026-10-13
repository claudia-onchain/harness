#!/usr/bin/env node
// Renders the README's look: an animated hero banner, one card per feature, a "how a turn works" flow and an install
// demo, all as dependency-free SVGs in assets/. Same input → same bytes, so re-running never dirties the tree.
// Style follows the Lumen dashboard: near-black panels, violet/cyan accents, condensed headlines, monospace labels,
// CSS keyframe animation, and no motion under prefers-reduced-motion.
//
//   node scripts/render-assets.mjs            # writes assets/*.svg and prints the README card grid
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const C = { bg: "#07080c", panel: "#0e1016", line: "#1c2030", border: "#2a3045", muted: "#8a93a6", sub: "#b7bdcc", text: "#e8ecf4", violet: "#7c5cff", cyan: "#22d3ee", lilac: "#c9bcff" };
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono','DejaVu Sans Mono',monospace";
const COND = "'Barlow Condensed','Roboto Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
const RISE = ".r{animation:rise 900ms cubic-bezier(.2,.8,.2,1) both}.r2{animation-delay:120ms}.r3{animation-delay:240ms}.r4{animation-delay:360ms}@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}";

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
<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient></defs>
<rect width="${w}" height="${h}" rx="10" fill="${C.bg}"/>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" stroke="${C.border}"/>
${inner}
</svg>
`;

/** The Lumen mark: a rounded square with an "L" stroke and a cyan dot, like dashboard/public/lumen.svg. */
const mark = (x, y, size, id) => `<g transform="translate(${x} ${y}) scale(${size / 64})"><rect width="64" height="64" rx="16" fill="${C.panel}" stroke="${C.line}"/><path d="M22 16v28h20" fill="none" stroke="url(#${id}-g)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="44" cy="20" r="5" fill="${C.cyan}"/></g>`;

// ---------------------------------------------------------------------------------------------------------------
// Features: what the README cards show. Each has a kicker, title, summary, the rows its "how it works" panel ticks
// through, and a footer with the commands or keys involved.

export const FEATURES = [
  { id: "chat", href: "in-the-chat", kicker: "TERMINAL", title: "A chat that stays out of your way", summary: "Flicker-free streaming Markdown, collapsible thinking, tool cards, a multi-line editor with history, an @ file picker, a / palette and !shell.", rows: ["Streams Markdown as the model writes", "Shift+Tab sets the thinking level", "@ attaches files, ! runs shell commands", "Enter while busy queues a steering message"], foot: "lumen · lumen -p \"…\" · echo … | lumen" },
  { id: "models", href: "keys", kicker: "BRING YOUR OWN KEYS", title: "Any model, your keys", summary: "Anthropic, OpenAI, xAI (Grok), OpenRouter, Gemini, Ollama, LM Studio or any OpenAI-compatible endpoint. Keys stay in ~/.lumen, mode 0600, optionally encrypted.", rows: ["lumen keys set anthropic sk-ant-…", "Tested live before it's saved", "Ctrl+P cycles models mid-chat", "mock:echo runs with no key at all"], foot: "lumen keys · --model provider:model" },
  { id: "chains", href: "chains", kicker: "CRYPTO", title: "45 chains, read first", summary: "Balances, prices, transactions, contracts, NFTs, TVL and yields, swap and bridge quotes across EVM, Solana, Bitcoin, Sui, Aptos, TRON and Starknet.", rows: ["Chainlink feeds read on-chain, staleness checked", "Alchemy when you have a key, public RPCs otherwise", "0x, Jupiter and LI.FI quotes", "Sends need simulation, caps and your yes"], foot: "lumen price · balance · tx · chain" },
  { id: "media", href: "commands", kicker: "STUDIO", title: "Images, video, speech and music", summary: "One command or one chat message. OpenRouter alone covers most of it; fal, ElevenLabs, OpenAI, xAI and @useclaudia/media add the rest.", rows: ["lumen gen image \"a neon fox\" --aspect 16:9", "Estimated cost shown before spending", "Results land in the Media library", "Photo, Video, Music and Audio studios in the dashboard"], foot: "lumen gen image|video|speech|music" },
  { id: "show", href: "screen-show-me-macos", kicker: "MACOS", title: "“Show me where it is”", summary: "Lumen opens the app, finds its window and draws glowing, click-through boxes, circles and arrows on top of it. They pulse and fade on their own.", rows: ["Opens or activates the app", "Finds the window bounds", "Draws markers on a transparent overlay", "Takes a screenshot for vision when asked"], foot: "lumen show Safari · lumen windows" },
  { id: "dashboard", href: "dashboard", kicker: "LOCAL WEB STUDIO", title: "A dashboard that shares your agent", summary: "Chat, Image, Photo, Video, Music, Audio, Chains, Wallet, Skills, Plugins, Keys and Settings on 127.0.0.1, behind a one-time token link.", rows: ["Same agent as the terminal, live in both", "Agent takeover with a visible ghost cursor", "Approvals answered in either place", "Host and Origin checked, cookie on every route"], foot: "lumen dashboard · lumen serve" },
  { id: "skills", href: "skills", kicker: "AGENT SKILLS", title: "101 skills, 900 more per chain", summary: "Only names and descriptions sit in the prompt; the agent loads a skill when a task matches. Your own skills from ~/.claude/skills and ~/.agents/skills are picked up too.", rows: ["20 chain templates rendered for every mainnet", "/skill:<slug> runs one directly", "skills/README.md documents the format", "lumen skills export <dir> for other agents"], foot: "lumen skills · /skill:base-swaps" },
  { id: "safety", href: "safety", kicker: "SAFETY", title: "Money needs a human", summary: "Chain tools are read-only by default. A send or swap passes four gates, and neither --yes nor the agent can skip them.", rows: ["A configured wallet key", "A successful simulation", "Per-transaction and per-day USD caps", "You type “send” on mainnet"], foot: "wallet.maxUsdPerTx $25 · maxUsdPerDay $100" },
  { id: "plugins", href: "plugins", kicker: "EXTEND", title: "Plugins for tools and the dashboard", summary: "Drop a JS module in ~/.lumen/plugins to add tools and slash commands; put an ES module under plugins/dashboard/<id>/ to add a studio panel.", rows: ["export default { name, tools, commands }", "Tools get a JSON schema and a run()", "Dashboard plugins load from /api/plugins/<id>", "lumen plugins lists what's active"], foot: "~/.lumen/plugins/*.js" },
  { id: "hosted", href: "run-on-replit", kicker: "HOSTED", title: "Runs on Replit too", summary: "Import the repo and press Run: the dashboard builds on first start, binds to 0.0.0.0 behind a token, and takes keys from Secrets.", rows: ["npm run replit builds then serves", "Replit domains allowed, others get 403", "LUMEN_DASHBOARD_TOKEN or a generated one", "Data stays in .lumen/ inside the Repl"], foot: ".replit · npm run replit" },
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
    rows += `<g class="k${i}"><rect x="40" y="${y - 11}" width="13" height="13" rx="3" fill="${C.violet}"/><path d="M43 ${y - 4.5} l2.6 2.6 l4.6 -5" fill="none" stroke="${C.bg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  });
  const inner = `<g class="r"><text x="28" y="40" fill="${C.cyan}" style="${mono(11, ";letter-spacing:.14em")}">${esc(f.kicker)}</text>
<text x="${W - 28}" y="40" text-anchor="end" fill="${C.muted}" style="${mono(11, ";letter-spacing:.12em")}">LUMEN</text></g>
<g class="r r2">${titleLines.map((l, i) => `<text x="27" y="${tY + i * 32}" fill="${C.text}" style="${cond(30)}">${esc(l)}</text>`).join("")}</g>
<rect class="r r2" x="28" y="${barY}" width="40" height="3" fill="url(#card-${f.id}-g)"/>
<g class="r r3">${sumLines.map((l, i) => `<text x="28" y="${barY + 26 + i * 19}" fill="${C.sub}" style="${sans(14)}">${esc(l)}</text>`).join("")}</g>
<rect x="24" y="186" width="${W - 48}" height="${H - 186 - 40}" rx="6" fill="${C.panel}" stroke="${C.line}"/>
<text x="40" y="204" fill="${C.muted}" style="${mono(9.5, ";letter-spacing:.14em")}">HOW IT WORKS</text>
<g class="lp">${rows}</g>
<text x="28" y="${H - 16}" fill="${C.muted}" style="${mono(10.5)}">${esc(clip(f.foot, 64))}</text>
<text x="${W - 28}" y="${H - 16}" text-anchor="end" fill="${C.muted}" style="${mono(10.5)}">${esc(f.id)}</text>`;
  return frame(W, H, `card-${f.id}`, `${f.title} — Lumen`, `${f.summary} ${f.rows.join("; ")}.`, css, inner);
}

export function bannerSvg() {
  const cmds = ["lumen", 'lumen -p "what\'s ETH on base?"', "lumen price ETH --chain base", 'lumen gen image "a neon fox" --aspect 16:9', 'lumen show "Figma"', "lumen dashboard", "lumen skills --chain solana", "lumen keys set openrouter sk-or-…"];
  const T = cmds.length * 1800, per = 100 / cmds.length;
  let css = RISE + `.cur{animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}`;
  cmds.forEach((_, i) => {
    const a = i * per, b = a + per;
    css += `.n${i}{opacity:0;animation:n${i} ${T}ms linear infinite}@keyframes n${i}{0%,${pct(a)}{opacity:0}${pct(a + 1)},${pct(b - 2)}{opacity:1}${pct(b - 1)},100%{opacity:0}}`;
  });
  const inner = `${mark(56, 50, 200, "hero")}
<g class="r"><text x="300" y="92" fill="${C.muted}" style="${mono(15, ";letter-spacing:.14em")}">LUMEN · v${esc(pkg.version)} · BRING YOUR OWN KEYS</text></g>
<g class="r r2"><text x="296" y="164" fill="${C.text}" style="${cond(56)}">A TERMINAL AGENT WITH A STUDIO</text></g>
<rect x="300" y="184" width="56" height="3" fill="url(#hero-g)"/>
<g class="r r3"><text x="300" y="220" fill="${C.sub}" style="${sans(18)}">Any model · 45 chains · image, video, speech and music · “show me” on macOS · a dashboard it can drive</text></g>
<g class="r r4"><text x="300" y="258" fill="${C.muted}" style="${mono(14)}">$</text>${cmds.map((c, i) => `<text class="n${i}" x="318" y="258" fill="${C.cyan}" style="${mono(14)}">${esc(c)}</text>`).join("")}</g>
<text x="1144" y="266" text-anchor="end" fill="${C.muted}" style="${mono(13, ";letter-spacing:.12em")}">NODE ≥ 22 · MIT</text>`;
  return frame(1200, 300, "hero", `Lumen ${pkg.version}: a bring-your-own-keys terminal agent`, pkg.description, css, inner);
}

export function flowSvg() {
  const nodes = [
    ["YOU ASK", "“swap 0.1 ETH to", "USDC on base”"],
    ["MODEL PLANS", "your provider, your", "key, your persona"],
    ["TOOLS RUN", "chains · media · files", "shell · screen · skills"],
    ["GATES CHECK", "simulation, USD caps,", "approval prompt"],
    ["YOU DECIDE", "type “send”, or not;", "answer streams back"],
  ];
  const T = 7500, w = 196, gap = 30, x0 = 46, y = 92;
  let css = `.e{animation:flow 1.6s linear infinite}@keyframes flow{to{stroke-dashoffset:-20}}`;
  let out = "";
  nodes.forEach(([h, a, b], i) => {
    const x = x0 + i * (w + gap), s = i * 20, e = s + 20;
    css += `.h${i}{opacity:0;animation:h${i} ${T}ms linear infinite}@keyframes h${i}{0%,${pct(s)}{opacity:0}${pct(s + 2)},${pct(e)}{opacity:1}${pct(e + 2)},100%{opacity:0}}`;
    out += `<rect x="${x}" y="${y}" width="${w}" height="120" rx="8" fill="${C.panel}" stroke="${C.border}"/><rect class="h${i}" x="${x}" y="${y}" width="${w}" height="120" rx="8" fill="none" stroke="${C.cyan}" stroke-width="1.5"/>`;
    out += `<text x="${x + 18}" y="${y + 30}" fill="${C.muted}" style="${mono(10.5, ";letter-spacing:.12em")}">0${i + 1}</text><text x="${x + 18}" y="${y + 58}" fill="${C.text}" style="${cond(21)}">${esc(h)}</text>`;
    out += `<text x="${x + 18}" y="${y + 84}" fill="${C.sub}" style="${sans(13)}">${esc(a)}</text><text x="${x + 18}" y="${y + 102}" fill="${C.sub}" style="${sans(13)}">${esc(b)}</text>`;
    if (i < nodes.length - 1) out += `<path class="e" d="M${x + w + 2} ${y + 60} L${x + w + gap - 2} ${y + 60}" fill="none" stroke="${C.violet}" stroke-width="1.5" stroke-dasharray="4 6"/>`;
  });
  const inner = `<text x="46" y="44" fill="${C.muted}" style="${mono(11, ";letter-spacing:.14em")}">LUMEN</text><text x="46" y="72" fill="${C.text}" style="${cond(26)}">HOW A TURN WORKS</text>
${out}
<text x="46" y="250" fill="${C.muted}" style="${mono(11)}">Reads never ask. File writes and shell ask unless you say --yes. Anything that moves money asks every time, and the agent can't answer for you.</text>`;
  return frame(1200, 270, "flow", "How a turn works", "You ask; the model plans with your key; tools run; the money gates check simulation, caps and approval; you decide.", css, inner);
}

export function installSvg() {
  const lines = [
    ["$ ", "git clone https://github.com/claudia-onchain/harness.git && cd harness/lumen", C.text],
    ["$ ", "npm install && npm run build && npm link", C.text],
    ["$ ", "lumen keys set anthropic sk-ant-…", C.text],
    ["✓ ", "anthropic key saved · tested live · default model claude-opus-5-5", C.cyan],
    ["$ ", "lumen", C.text],
  ];
  const T = 11000, cw = 7.8;
  let css = `.lp{animation:lp ${T}ms linear infinite}@keyframes lp{0%,94%{opacity:1}98%,100%{opacity:0}}`;
  let out = "", t = 4;
  lines.forEach(([p, raw, fill], i) => {
    const text = clip(raw, 98), y = 76 + i * 28, len = text.length, dur = Math.min(20, len * 0.26), a = t, b = t + dur;
    css += `.p${i}{animation:p${i} ${T}ms linear infinite}@keyframes p${i}{0%,${pct(a)}{opacity:0}${pct(a + 0.1)},100%{opacity:1}}`;
    css += `.c${i}{animation:c${i} ${T}ms linear infinite}@keyframes c${i}{0%,${pct(a)}{transform:translateX(0);animation-timing-function:steps(${len},end)}${pct(b)},100%{transform:translateX(${(len * cw).toFixed(1)}px)}}`;
    out += `<g class="p${i}"><text x="24" y="${y}" fill="${i === 3 ? C.cyan : C.muted}" style="${mono(13, ";white-space:pre")}">${esc(p)}</text><text x="44" y="${y}" fill="${fill}" style="${mono(13, ";white-space:pre")}">${esc(text)}</text><rect class="c${i}" x="44" y="${y - 15}" width="${len * cw + 12}" height="21" fill="${C.bg}"/></g>`;
    t = b + 5;
  });
  const inner = `<rect x="1" y="1" width="818" height="32" rx="9" fill="${C.panel}"/><rect y="32" width="820" height="1" fill="${C.line}"/>
<circle cx="18" cy="17" r="5" fill="${C.border}"/><circle cx="34" cy="17" r="5" fill="${C.border}"/><circle cx="50" cy="17" r="5" fill="${C.border}"/>
<text x="410" y="21" text-anchor="middle" fill="${C.muted}" style="${mono(11.5)}">install lumen · Node 22+</text>
<g class="lp">${out}</g>`;
  return frame(820, 224, "install", "Install Lumen", "Clone, npm install, build the dashboard, link the lumen command, add a key, run.", css, inner);
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
  const files = { "banner.svg": bannerSvg(), "how-it-works.svg": flowSvg(), "install.svg": installSvg() };
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
