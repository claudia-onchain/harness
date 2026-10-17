#!/usr/bin/env node
// Renders Paylink's README banner as a dependency-free SVG in assets/, in the same family as Lumen's and Pulse's:
// near-black panel, condensed headline, monospace labels, CSS keyframes, no motion under prefers-reduced-motion.
// Paylink is not built yet, so the banner only says what is true: the name, and that it is coming.
//
//   node scripts/render-assets.mjs            # writes assets/banner.svg
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");

const C = { bg: "#07090a", panel: "#0e1312", line: "#1a2422", border: "#283632", muted: "#8a9a95", sub: "#b8c6c1", text: "#ebf3f0", green: "#22c55e", mint: "#5eead4" };
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono','DejaVu Sans Mono',monospace";
const COND = "'Barlow Condensed','Roboto Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
const RISE = ".r{animation:rise 900ms cubic-bezier(.2,.8,.2,1) both}.r2{animation-delay:120ms}.r3{animation-delay:240ms}.r4{animation-delay:360ms}@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}";

const mono = (size, extra = "") => `font-family:${MONO};font-size:${size}px${extra}`;
const cond = (size) => `font-family:${COND};font-weight:700;font-size:${size}px`;
const sans = (size, extra = "") => `font-family:${SANS};font-size:${size}px${extra}`;

/** The Paylink mark: two rounded links joining, with a light that travels along them. */
const LINKS = "M30 22h-6a10 10 0 0 0 0 20h6M34 42h6a10 10 0 0 0 0-20h-6M25 32h14";
const mark = (x, y, size, id) => `<g transform="translate(${x} ${y}) scale(${size / 64})"><rect width="64" height="64" rx="16" fill="${C.panel}" stroke="${C.line}"/><path d="${LINKS}" fill="none" stroke="${C.line}" stroke-width="5" stroke-linecap="round"/><path class="lk" d="${LINKS}" pathLength="100" fill="none" stroke="url(#${id}-g)" stroke-width="5" stroke-linecap="round"/><circle class="dot" cx="48" cy="14" r="4.5" fill="${C.mint}"/></g>`;

export function bannerSvg() {
  const css = RISE +
    `.lk{stroke-dasharray:100;animation:lk 3200ms cubic-bezier(.4,0,.2,1) infinite}@keyframes lk{0%{stroke-dashoffset:100}50%,80%{stroke-dashoffset:0}100%{stroke-dashoffset:-100}}` +
    `.dot{animation:dot 1600ms ease-in-out infinite}@keyframes dot{0%,100%{opacity:.35}50%{opacity:1}}` +
    `.soon{animation:soon 2400ms ease-in-out infinite}@keyframes soon{0%,100%{opacity:.55}50%{opacity:1}}`;
  const inner = `${mark(56, 50, 200, "hero")}
<g class="r"><text x="300" y="92" fill="${C.muted}" style="${mono(15, ";letter-spacing:.14em")}">PAYLINK · A CLAUDIA HARNESS</text></g>
<g class="r r2"><text x="296" y="164" fill="${C.text}" style="${cond(64)}">PAYLINK</text></g>
<rect x="300" y="184" width="56" height="3" fill="url(#hero-g)"/>
<g class="r r3"><text x="300" y="220" fill="${C.sub}" style="${sans(18)}">The next harness from Claudia, built in the open next to Lumen and Pulse.</text></g>
<g class="r r4"><rect x="300" y="238" width="154" height="30" rx="15" fill="none" stroke="${C.green}"/><circle class="soon" cx="318" cy="253" r="4" fill="${C.green}"/><text class="soon" x="330" y="258" fill="${C.green}" style="${mono(13, ";letter-spacing:.14em")}">COMING SOON</text></g>
<text x="1144" y="266" text-anchor="end" fill="${C.muted}" style="${mono(13, ";letter-spacing:.12em")}">MIT</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300" viewBox="0 0 1200 300" role="img" aria-labelledby="hero-t hero-d">
<title id="hero-t">Paylink: coming soon</title><desc id="hero-d">Paylink is the next harness from Claudia, built next to Lumen and Pulse.</desc>
<style>${css}${REDUCED}</style>
<defs><linearGradient id="hero-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.green}"/><stop offset="1" stop-color="${C.mint}"/></linearGradient></defs>
<rect width="1200" height="300" rx="10" fill="${C.bg}"/>
<rect x=".5" y=".5" width="1199" height="299" rx="10" fill="none" stroke="${C.border}"/>
${inner}
</svg>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = join(root, "assets");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "banner.svg"), bannerSvg());
  console.log("✓ banner.svg → assets/");
}
