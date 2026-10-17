#!/usr/bin/env node
// Renders the README's look: an animated hero banner, one card per feature, a checkout "in use" demo, a "how a
// payment works" flow, the shopkeeper chat and an MCP terminal, all as dependency-free SVGs in assets/.
// Same input → same bytes. Style is Lumen's and Pulse's (near-black panels, condensed headlines, monospace labels,
// CSS keyframes, no motion under prefers-reduced-motion) in Paylink's own green and mint, with two joining links for
// a mark. Every card row is something the docs in this folder describe; sample names and numbers are labelled.
//
//   node scripts/render-assets.mjs            # writes assets/*.svg and splices the card grid into README.md
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");

const C = { bg: "#07090a", panel: "#0e1312", line: "#1a2422", border: "#283632", muted: "#8a9a95", sub: "#b8c6c1", text: "#ebf3f0", green: "#22c55e", mint: "#5eead4", amber: "#fbbf24" };
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono','DejaVu Sans Mono',monospace";
const COND = "'Barlow Condensed','Roboto Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
const RISE = ".r{animation:rise 900ms cubic-bezier(.2,.8,.2,1) both}.r2{animation-delay:120ms}.r3{animation-delay:240ms}.r4{animation-delay:360ms}@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}";
// The mark's light: a dash that runs along both links, rests joined, then leaves.
const LINK = (ms = 3200) => `.lk{stroke-dasharray:100;animation:lk ${ms}ms cubic-bezier(.4,0,.2,1) infinite}@keyframes lk{0%{stroke-dashoffset:100}50%,80%{stroke-dashoffset:0}100%{stroke-dashoffset:-100}}.dot{animation:dot 1600ms ease-in-out infinite}@keyframes dot{0%,100%{opacity:.35}50%{opacity:1}}`;

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
<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.green}"/><stop offset="1" stop-color="${C.mint}"/></linearGradient></defs>
<rect width="${w}" height="${h}" rx="10" fill="${C.bg}"/>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" stroke="${C.border}"/>
${inner}
</svg>
`;

/** The Paylink mark: two rounded links joining, with a light that travels along them. */
const LINKS = "M30 22h-6a10 10 0 0 0 0 20h6M34 42h6a10 10 0 0 0 0-20h-6M25 32h14";
const mark = (x, y, size, id) => `<g transform="translate(${x} ${y}) scale(${size / 64})"><rect width="64" height="64" rx="16" fill="${C.panel}" stroke="${C.line}"/><path d="${LINKS}" fill="none" stroke="${C.line}" stroke-width="5" stroke-linecap="round"/><path class="lk" d="${LINKS}" pathLength="100" fill="none" stroke="url(#${id}-g)" stroke-width="5" stroke-linecap="round"/><circle class="dot" cx="48" cy="14" r="4.5" fill="${C.mint}"/></g>`;

// ---------------------------------------------------------------------------------------------------------------
// Features: what the README cards show. Each has a kicker, title, summary, the rows its "how it works" panel ticks
// through, a footer with the route or call involved, and the doc it links to.

export const FEATURES = [
  { id: "terminal", href: "use-cases.md#1-in-person-payments-terminal", kicker: "TERMINAL", title: "A till on any screen", summary: "Key in an amount, turn the screen around and the customer scans a QR code with any wallet. The screen follows the payment live until it is final.", rows: ["Charge $4.50 · Flat white", "QR opens the hosted checkout", "Processing → succeeded, live on screen", "New sale for the next customer"], foot: "/app/terminal" },
  { id: "links", href: "use-cases.md#2-payment-links", kicker: "PAYMENT LINKS", title: "A checkout at a short URL", summary: "Fixed price, catalog items with quantities, or pay what you want. Share the URL or its QR code; every customer who opens it gets their own payment.", rows: ["amount_type: fixed · items · custom", "Collect the customer's email and name", "Limit the coins, stop after N payments", "No code, paid any number of times"], foot: "POST /v1/payment_links · /l/:code" },
  { id: "invoices", href: "use-cases.md#3-invoices-with-reminders", kicker: "INVOICES", title: "Invoices that chase themselves", summary: "Gapless numbers, tax, a hosted page to pay from any wallet, and reminders before, on and after the due date until the money lands.", rows: ["NORTHW-00042 · due in 14 days", "Reminder 3 days before, and on the day", "Overdue at 3 and 7 days, team notified", "invoice.paid when it lands"], foot: "POST /v1/invoices · /i/:code" },
  { id: "subscriptions", href: "use-cases.md#4-subscriptions", kicker: "SUBSCRIPTIONS", title: "A schedule, never a pull", summary: "Crypto cannot be pulled from a wallet, so each period issues an invoice for the customer to pay. Nothing leaves their wallet unless they send it.", rows: ["Coffee box · $12 every month", "First invoice now, due in 7 days", "3 days overdue → past_due", "Cancel now or at the period end"], foot: "POST /v1/subscriptions" },
  { id: "checkout", href: "use-cases.md#5-hosted-and-embedded-checkout", kicker: "CHECKOUT", title: "Hosted, or in a popup", summary: "Create a payment intent on your server, then redirect to the hosted page or open it as a popup with embed.js. Wallet extensions and WalletConnect just work.", rows: ["POST /v1/payment_intents + Idempotency-Key", "Redirect to hosted_url, or Paylink.checkout()", "The customer picks a coin and network", "Fulfil on payment_intent.succeeded"], foot: "/pay/:id · embed.js" },
  { id: "refunds", href: "use-cases.md#6-refunds-and-claim-links", kicker: "REFUNDS", title: "Refunds that find the payer", summary: "Full or partial, in the coin and on the network the payment arrived on. If the payer's address is unknown, the customer gets a claim link to choose one.", rows: ["Refund $12.00 of order 1042", "Back to the screened paying address", "Unknown payer → a one-time claim link", "Direct settlement: send it, then mark_sent"], foot: "POST /v1/refunds · /refund/:token" },
  { id: "wallet", href: "getting-started.md#1-sign-in-with-your-wallet", kicker: "SIGN IN", title: "Your wallet is your login", summary: "No passwords. Sign a Sign-in with Ethereum message: no transaction, no gas. Sensitive actions ask for a fresh signature from the last ten minutes.", rows: ["EIP-4361 message, single use, 5 minutes", "Safe and smart wallets through ERC-1271", "Six roles, from owner to viewer", "Re-sign to add payout addresses or keys"], foot: "/connect" },
  { id: "settlement", href: "getting-started.md#5-choose-where-your-money-settles", kicker: "SETTLEMENT", title: "You choose where it lands", summary: "Custodial: a ledger balance with allowlisted payouts and team approvals. Direct: fresh addresses from your own xpub, funds in your wallet once final.", rows: ["Custodial: balance → payout → approvals", "Direct: your xpub, your wallet", "New destinations screened, 24 h cool-off", "Approvals by people, never by keys"], foot: "Settings → Settlement" },
  { id: "shopkeeper", href: "agent.md#paylink-in-the-dashboard", kicker: "AI SHOPKEEPER", title: "Paylink, in the dashboard", summary: "Ask in plain words. It looks things up and makes links and invoices as you, with your role, and never refunds, pays out or resolves reviews.", rows: ["\"make a $45 link for the bunny plush\"", "create_payment_link · 45.00 USD", "Every number comes from a lookup", "No refund, payout or review tools at all"], foot: "an agent built on Claudia" },
  { id: "mcp", href: "agent.md#the-mcp-server", kicker: "MCP", title: "Bring your own agent", summary: "Claude Code, Cursor or your own agent works the account over MCP. A restricted key decides exactly what it may touch, and every call is audited.", rows: ["paylink.useclaudia.xyz/mcp", "rk_live_… with read-only scopes", "25 tools, scope-checked like /v1", "Audited as \"via MCP agent\""], foot: "claude mcp add --transport http paylink …" },
  { id: "developers", href: "api-reference.md", kicker: "DEVELOPERS", title: "API, SDK and webhooks", summary: "Everything the dashboard does goes through one REST API, with idempotency, versioning, signed webhooks, an events feed and a typed Node SDK.", rows: ["/v1 · Idempotency-Key on every POST", "@paylink/node retries and pages for you", "Signed webhooks, retried with backoff", "The Events API to pull the same feed"], foot: "api-reference.md · webhooks.md · sdk.md" },
  { id: "test-mode", href: "getting-started.md#3-test-mode-and-live-mode", kicker: "TEST MODE", title: "Practise before it is real", summary: "Every account has a test copy with its own keys, data and webhooks. A simulator plays the customer, so you can rehearse every outcome.", rows: ["sk_test_… · rk_test_… · pk_test_…", "Simulate paid, underpaid, overpaid, late", "Test payouts complete by themselves", "Switch to Live in the header"], foot: "POST /v1/payment_intents/:id/simulate" },
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
    rows += `<g class="k${i}"><rect x="40" y="${y - 11}" width="13" height="13" rx="3" fill="${C.green}"/><path d="M43 ${y - 4.5} l2.6 2.6 l4.6 -5" fill="none" stroke="${C.bg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  });
  const inner = `<g class="r"><text x="28" y="40" fill="${C.mint}" style="${mono(11, ";letter-spacing:.14em")}">${esc(f.kicker)}</text>
<text x="${W - 28}" y="40" text-anchor="end" fill="${C.muted}" style="${mono(11, ";letter-spacing:.12em")}">PAYLINK</text></g>
<g class="r r2">${titleLines.map((l, i) => `<text x="27" y="${tY + i * 32}" fill="${C.text}" style="${cond(30)}">${esc(l)}</text>`).join("")}</g>
<rect class="r r2" x="28" y="${barY}" width="40" height="3" fill="url(#card-${f.id}-g)"/>
<g class="r r3">${sumLines.map((l, i) => `<text x="28" y="${barY + 26 + i * 19}" fill="${C.sub}" style="${sans(14)}">${esc(l)}</text>`).join("")}</g>
<rect x="24" y="186" width="${W - 48}" height="${H - 186 - 40}" rx="6" fill="${C.panel}" stroke="${C.line}"/>
<text x="40" y="204" fill="${C.muted}" style="${mono(9.5, ";letter-spacing:.14em")}">HOW IT WORKS</text>
<g class="lp">${rows}</g>
<text x="28" y="${H - 16}" fill="${C.muted}" style="${mono(10.5)}">${esc(clip(f.foot, 64))}</text>
<text x="${W - 28}" y="${H - 16}" text-anchor="end" fill="${C.muted}" style="${mono(10.5)}">${esc(f.id)}</text>`;
  return frame(W, H, `card-${f.id}`, `${f.title} — Paylink`, `${f.summary} ${f.rows.join("; ")}.`, css, inner);
}

export function bannerSvg() {
  const urls = ["paylink.useclaudia.xyz/app", "paylink.useclaudia.xyz/l/coffee-beans", "paylink.useclaudia.xyz/pay/pi_…", "paylink.useclaudia.xyz/i/NORTHW-00042", "paylink.useclaudia.xyz/mcp", "paylink.useclaudia.xyz/docs"];
  const T = urls.length * 1800, per = 100 / urls.length;
  let css = RISE + LINK() + `.live{animation:live 2400ms ease-in-out infinite}@keyframes live{0%,100%{opacity:.55}50%{opacity:1}}`;
  urls.forEach((_, i) => {
    const a = i * per, b = a + per;
    css += `.n${i}{${i ? "opacity:0;" : ""}animation:n${i} ${T}ms linear infinite}@keyframes n${i}{0%,${pct(a)}{opacity:0}${pct(a + 1)},${pct(b - 2)}{opacity:1}${pct(b - 1)},100%{opacity:0}}`;
  });
  // A payment travelling along the bottom edge: a dot runs from left to right and lands as a tick.
  css += `.run{stroke-dasharray:1000;animation:run 4800ms linear infinite}@keyframes run{0%{stroke-dashoffset:1000}100%{stroke-dashoffset:0}}`;
  const inner = `<path d="M0 290H1200" stroke="${C.line}" stroke-width="2"/><path class="run" d="M0 290H1200" pathLength="1000" fill="none" stroke="url(#hero-g)" stroke-width="2" opacity=".55"/>
${mark(56, 40, 200, "hero")}
<g class="r"><text x="300" y="86" fill="${C.muted}" style="${mono(15, ";letter-spacing:.14em")}">PAYLINK · BY CLAUDIA</text>
<rect x="548" y="69" width="74" height="24" rx="12" fill="none" stroke="${C.green}"/><circle class="live" cx="564" cy="81" r="4" fill="${C.green}"/><text class="live" x="575" y="86" fill="${C.green}" style="${mono(12, ";letter-spacing:.14em")}">LIVE</text></g>
<g class="r r2"><text x="296" y="156" fill="${C.text}" style="${cond(56)}">CRYPTO CHECKOUT, AI SHOPKEEPER</text></g>
<rect x="300" y="176" width="56" height="3" fill="url(#hero-g)"/>
<g class="r r3"><text x="300" y="210" fill="${C.sub}" style="${sans(18)}">Terminal · payment links · invoices · subscriptions · hosted checkout · MCP for your agents</text></g>
<g class="r r4"><text x="300" y="248" fill="${C.muted}" style="${mono(14)}">→</text>${urls.map((u, i) => `<text class="n${i}" x="320" y="248" fill="${C.mint}" style="${mono(14)}">${esc(u)}</text>`).join("")}</g>
<text x="1144" y="256" text-anchor="end" fill="${C.muted}" style="${mono(13, ";letter-spacing:.12em")}">SOLANA · BASE · ETHEREUM · BITCOIN</text>`;
  return frame(1200, 300, "hero", "Paylink: crypto checkout with an AI shopkeeper", "Paylink, by Claudia, live at paylink.useclaudia.xyz: Terminal, payment links, invoices, subscriptions, hosted checkout, and MCP for your own agents.", css, inner);
}

export function flowSvg() {
  const nodes = [
    ["QUOTE", "coin + network,", "one-time address"],
    ["SEEN", "processing: on chain,", "not final yet"],
    ["FINAL", "succeeded: booked", "to your ledger"],
    ["WEBHOOK", "signed event to", "your server"],
    ["SETTLE", "your balance, or", "your own wallet"],
  ];
  const T = 7500, w = 196, gap = 30, x0 = 46, y = 92;
  let css = `.e{animation:flow 1.6s linear infinite}@keyframes flow{to{stroke-dashoffset:-20}}`;
  let out = "";
  nodes.forEach(([h, a, b], i) => {
    const x = x0 + i * (w + gap), s = i * 20, e = s + 20;
    css += `.h${i}{opacity:0;animation:h${i} ${T}ms linear infinite}@keyframes h${i}{0%,${pct(s)}{opacity:0}${pct(s + 2)},${pct(e)}{opacity:1}${pct(e + 2)},100%{opacity:0}}`;
    out += `<rect x="${x}" y="${y}" width="${w}" height="120" rx="8" fill="${C.panel}" stroke="${C.border}"/><rect class="h${i}" x="${x}" y="${y}" width="${w}" height="120" rx="8" fill="none" stroke="${C.mint}" stroke-width="1.5"/>`;
    out += `<text x="${x + 18}" y="${y + 30}" fill="${C.muted}" style="${mono(10.5, ";letter-spacing:.12em")}">0${i + 1}</text><text x="${x + 18}" y="${y + 58}" fill="${C.text}" style="${cond(21)}">${esc(h)}</text>`;
    out += `<text x="${x + 18}" y="${y + 84}" fill="${C.sub}" style="${sans(13)}">${esc(a)}</text><text x="${x + 18}" y="${y + 102}" fill="${C.sub}" style="${sans(13)}">${esc(b)}</text>`;
    if (i < nodes.length - 1) out += `<path class="e" d="M${x + w + 2} ${y + 60} L${x + w + gap - 2} ${y + 60}" fill="none" stroke="${C.green}" stroke-width="1.5" stroke-dasharray="4 6"/>`;
  });
  const inner = `<text x="46" y="44" fill="${C.muted}" style="${mono(11, ";letter-spacing:.14em")}">PAYLINK</text><text x="46" y="72" fill="${C.text}" style="${cond(26)}">HOW A PAYMENT WORKS</text>
${out}
<text x="46" y="250" fill="${C.muted}" style="${mono(11)}">Late, short, doubled or on the wrong network? It opens a review under Needs attention. Ship the order on succeeded.</text>`;
  return frame(1200, 270, "flow", "How a payment works", "The customer gets a quote and a one-time address, the transfer is seen on chain, it becomes final and is booked to your ledger, a signed webhook reaches your server, and the funds settle to your balance or your own wallet.", css, inner);
}

/** A deterministic QR-like pattern: three finder squares and seeded modules. Decorative, not a scannable code. */
function qr(x, y, size, n = 25) {
  const m = size / n;
  let seed = 7, out = "";
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const finder = (cx, cy) => (cx < 8 && cy < 8) || (cx >= n - 8 && cy < 8) || (cx < 8 && cy >= n - 8);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = rnd();
    if (!finder(c, r) && v > 0.52) out += `<rect x="${(x + c * m).toFixed(1)}" y="${(y + r * m).toFixed(1)}" width="${m.toFixed(1)}" height="${m.toFixed(1)}"/>`;
  }
  for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    const X = x + fx * m, Y = y + fy * m;
    out += `<rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${(7 * m).toFixed(1)}" height="${(7 * m).toFixed(1)}" rx="${(m * 1.2).toFixed(1)}"/><rect x="${(X + m).toFixed(1)}" y="${(Y + m).toFixed(1)}" width="${(5 * m).toFixed(1)}" height="${(5 * m).toFixed(1)}" rx="${m.toFixed(1)}" fill="#ffffff"/><rect x="${(X + 2 * m).toFixed(1)}" y="${(Y + 2 * m).toFixed(1)}" width="${(3 * m).toFixed(1)}" height="${(3 * m).toFixed(1)}" rx="${(m * 0.6).toFixed(1)}"/>`;
  }
  return `<rect x="${x - 10}" y="${y - 10}" width="${size + 20}" height="${size + 20}" rx="10" fill="#ffffff"/><g fill="${C.bg}">${out}</g>`;
}

/**
 * Paylink in use: a test-mode payment link checkout on the left (pick USDC on Solana, QR, waiting → processing →
 * succeeded) and the shop's event feed on the right (created, processing, succeeded, the webhook, the ledger).
 * The shop, amounts and address are samples, and the corner says so.
 */
export function checkoutSvg() {
  const W = 820, H = 520, T = 15000;
  let css = `.lp{animation:lp ${T}ms linear infinite}@keyframes lp{0%,95%{opacity:1}98.5%,100%{opacity:0}}` + LINK(2400);
  const show = (cls, at) => { css += `.${cls}{animation:${cls} ${T}ms cubic-bezier(.2,.8,.2,1) infinite}@keyframes ${cls}{0%,${pct(at)}{opacity:0;transform:translateY(8px)}${pct(at + 2.5)},100%{opacity:1;transform:none}}`; };
  const span = (cls, a, b) => { css += `.${cls}{opacity:0;animation:${cls} ${T}ms linear infinite}@keyframes ${cls}{0%,${pct(a)}{opacity:0}${pct(a + 1.5)},${pct(b)}{opacity:1}${pct(b + 1.5)},100%{opacity:0}}`; };

  // Left: the hosted checkout.
  const lx = 24, lw = 392;
  const chips = [["USDC", "Solana"], ["USDC", "Base"], ["SOL", "Solana"], ["USDT", "Ethereum"]];
  css += `.pick{opacity:0;animation:pick ${T}ms linear infinite}@keyframes pick{0%,8%{opacity:0}9.5%,100%{opacity:1}}`;
  let chipSvg = "";
  chips.forEach(([coin, net], i) => {
    const cx = lx + 16 + (i % 2) * 184, cy = 148 + Math.floor(i / 2) * 40;
    chipSvg += `<rect x="${cx}" y="${cy}" width="176" height="32" rx="7" fill="${C.bg}" stroke="${C.border}"/><text x="${cx + 14}" y="${cy + 21}" fill="${C.text}" style="${mono(12.5, ";font-weight:700")}">${coin}</text><text x="${cx + 62}" y="${cy + 21}" fill="${C.muted}" style="${mono(12)}">${net}</text>`;
    if (i === 0) chipSvg += `<rect class="pick" x="${cx}" y="${cy}" width="176" height="32" rx="7" fill="none" stroke="${C.mint}" stroke-width="2"/><circle class="pick" cx="${cx + 160}" cy="${cy + 16}" r="5" fill="${C.mint}"/>`;
  });
  show("q", 12);
  span("st1", 12, 40);
  span("st2", 42, 58);
  show("st3", 60);
  css += `.ring{opacity:0;transform-origin:220px 330px;animation:ring ${T}ms ease-out infinite}@keyframes ring{0%,60%{opacity:0;transform:scale(.6)}62%{opacity:.9}72%,100%{opacity:0;transform:scale(1.7)}}`;
  css += `.sp{transform-origin:${lx + 30}px 476px;animation:sp 900ms linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`;
  const left = `<rect x="${lx}" y="72" width="${lw}" height="${H - 96}" rx="10" fill="${C.panel}" stroke="${C.line}"/>
<text x="${lx + 16}" y="100" fill="${C.text}" style="${sans(16, ";font-weight:700")}">Coffee beans 1 kg</text><text x="${lx + lw - 16}" y="100" text-anchor="end" fill="${C.text}" style="${cond(26)}">$12.00</text>
<text x="${lx + 16}" y="132" fill="${C.muted}" style="${mono(10, ";letter-spacing:.14em")}">PAY WITH</text>
${chipSvg}
<g class="q">${qr(lx + 30, 250, 140)}
<text x="${lx + 196}" y="268" fill="${C.muted}" style="${mono(10, ";letter-spacing:.14em")}">SEND EXACTLY</text>
<text x="${lx + 196}" y="296" fill="${C.text}" style="${cond(28)}">12.00 USDC</text>
<text x="${lx + 196}" y="318" fill="${C.sub}" style="${mono(12)}">on Solana</text>
<text x="${lx + 196}" y="346" fill="${C.muted}" style="${mono(10, ";letter-spacing:.14em")}">ONE-TIME ADDRESS</text>
<text x="${lx + 196}" y="366" fill="${C.sub}" style="${mono(12)}">7xKX…q9fP</text>
<text x="${lx + 196}" y="394" fill="${C.muted}" style="${mono(11)}">Quote valid 29:41</text></g>
<circle class="ring" cx="220" cy="330" r="60" fill="none" stroke="${C.green}" stroke-width="3"/>
<rect x="${lx + 14}" y="456" width="${lw - 28}" height="40" rx="8" fill="${C.bg}" stroke="${C.line}"/>
<g class="st1"><circle cx="${lx + 34}" cy="476" r="5" fill="${C.muted}"/><text x="${lx + 50}" y="481" fill="${C.sub}" style="${mono(13)}">Waiting for payment</text></g>
<g class="st2"><g class="sp"><path d="M${lx + 30} 468a8 8 0 1 1 -8 8" fill="none" stroke="${C.amber}" stroke-width="2.4" stroke-linecap="round"/></g><text x="${lx + 50}" y="481" fill="${C.amber}" style="${mono(13)}">Processing · seen on chain</text></g>
<g class="st3"><circle cx="${lx + 32}" cy="476" r="9" fill="${C.green}"/><path d="M${lx + 27.5} 476.5l3 3l5.5-6" fill="none" stroke="${C.bg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><text x="${lx + 50}" y="481" fill="${C.green}" style="${mono(13, ";font-weight:700")}">Succeeded · final</text></g>`;

  // Right: the shop's event feed.
  const rx = 436, rw = W - rx - 24;
  const events = [
    [6, "payment_intent.created", "pi_3Fz…  12.00 USD", C.sub],
    [12, "quote", "12.00 USDC · solana", C.sub],
    [42, "payment_intent.processing", "seen on chain", C.amber],
    [60, "payment_intent.succeeded", "final", C.green],
    [66, "POST shop.example.com/webhooks", "200 · signed", C.mint],
    [72, "ledger", "booked to your balance", C.sub],
  ];
  let feed = "";
  events.forEach(([at, ev, detail, color], i) => {
    show(`e${i}`, at);
    const y = 120 + i * 50;
    feed += `<g class="e${i}"><circle cx="${rx + 22}" cy="${y - 4}" r="4" fill="${color}"/><text x="${rx + 36}" y="${y}" fill="${C.text}" style="${mono(12.5)}">${esc(ev)}</text><text x="${rx + 36}" y="${y + 19}" fill="${C.muted}" style="${mono(11.5)}">${esc(detail)}</text></g>`;
  });
  show("ship", 80);
  const right = `<rect x="${rx}" y="72" width="${rw}" height="${H - 96}" rx="10" fill="${C.panel}" stroke="${C.line}"/>
<text x="${rx + 16}" y="96" fill="${C.muted}" style="${mono(10, ";letter-spacing:.14em")}">EVENTS · YOUR SHOP</text>
<path d="M${rx + 22} 120V${120 + 5 * 50}" stroke="${C.line}" stroke-width="2"/>
${feed}
<g class="ship"><rect x="${rx + 14}" y="456" width="${rw - 28}" height="40" rx="8" fill="none" stroke="${C.green}"/><text x="${rx + rw / 2}" y="481" text-anchor="middle" fill="${C.green}" style="${mono(13, ";font-weight:700")}">Ship the order</text></g>`;

  const inner = `<rect x="1" y="1" width="${W - 2}" height="54" rx="9" fill="${C.panel}"/><rect y="55" width="${W}" height="1" fill="${C.line}"/>
${mark(16, 9, 38, "co")}
<text x="66" y="27" fill="${C.text}" style="${sans(15, ";font-weight:700")}">Northwind Coffee</text><text x="66" y="45" fill="${C.muted}" style="${mono(11.5)}">paylink.useclaudia.xyz/l/coffee-beans</text>
<text x="${W - 22}" y="34" text-anchor="end" fill="${C.muted}" style="${mono(10, ";letter-spacing:.14em")}">TEST MODE · SAMPLE</text>
<g class="lp">
${left}
${right}
</g>`;
  return frame(W, H, "co", "Paylink in use: a payment link checkout", "A customer opens a payment link for $12 coffee beans, picks USDC on Solana and gets a QR code and a one-time address. The payment goes from waiting to processing to succeeded while the shop's feed shows the events, a signed webhook and the ledger entry.", css, inner);
}

/**
 * Paylink, the shopkeeper: the dashboard panel takes three requests. It makes a link, answers from a lookup, and
 * points a refund request at the right page instead of doing it. Numbers in the sales answer are samples.
 */
export function shopkeeperSvg() {
  const W = 820, H = 470, T = 16000;
  let css = `.lp{animation:lp ${T}ms linear infinite}@keyframes lp{0%,95%{opacity:1}98.5%,100%{opacity:0}}` + LINK(2400);
  const show = (cls, at) => { css += `.${cls}{animation:${cls} ${T}ms cubic-bezier(.2,.8,.2,1) infinite}@keyframes ${cls}{0%,${pct(at)}{opacity:0;transform:translateY(8px)}${pct(at + 2.5)},100%{opacity:1;transform:none}}`; };
  const msgs = [];
  const you = (cls, at, y, text) => { show(cls, at); const w = text.length * 7.6 + 32; msgs.push(`<g class="${cls}"><rect x="${W - 24 - w}" y="${y}" width="${w}" height="34" rx="12" fill="#14302a"/><text x="${W - 24 - w + 16}" y="${y + 22}" fill="${C.text}" style="${sans(13.5)}">${esc(text)}</text></g>`); };
  const tool = (cls, at, y, name, arg) => { show(cls, at); msgs.push(`<g class="${cls}"><text x="40" y="${y + 14}" fill="${C.mint}" style="${mono(12)}">▸ ${esc(name)}</text><text x="${48 + (name.length + 2) * 7.3}" y="${y + 14}" fill="${C.muted}" style="${mono(12)}">${esc(arg)}</text></g>`); };
  const pay = (cls, at, y, lines, tone = C.sub) => { show(cls, at); const h = 18 + lines.length * 19; msgs.push(`<g class="${cls}"><rect x="24" y="${y}" width="520" height="${h}" rx="12" fill="${C.panel}" stroke="${C.line}"/>${lines.map((l, i) => `<text x="40" y="${y + 23 + i * 19}" fill="${i ? C.sub : tone}" style="${sans(13.5)}">${l}</text>`).join("")}</g>`); };
  you("m1", 3, 76, "make a $45 link for the bunny plush");
  tool("m2", 10, 120, "create_payment_link", "45.00 USD");
  pay("m3", 15, 146, [`Done! It's on the counter: <tspan fill="${C.mint}" style="font-family:${MONO};font-size:12.5px">paylink.useclaudia.xyz/l/…</tspan>`], C.text);
  you("m4", 34, 202, "how are sales going this week?");
  tool("m5", 41, 246, "get_analytics", "days: 7");
  pay("m6", 46, 272, ["38 payments, $1,284 this week. USDC on Solana is your top asset,", "and one payment is waiting in Needs attention."], C.text);
  you("m7", 64, 348, "refund order 1042");
  pay("m8", 71, 392, [`I can't do refunds. Open <tspan fill="${C.mint}">Payments → order 1042</tspan> and refund it there.`], C.text);
  const inner = `<rect x="1" y="1" width="${W - 2}" height="54" rx="9" fill="${C.panel}"/><rect y="55" width="${W}" height="1" fill="${C.line}"/>
${mark(16, 9, 38, "sk")}
<text x="66" y="27" fill="${C.text}" style="${sans(15, ";font-weight:700")}">Paylink</text><text x="66" y="45" fill="${C.muted}" style="${sans(12)}">your AI shopkeeper · acts as you, with your role</text>
<text x="${W - 22}" y="34" text-anchor="end" fill="${C.muted}" style="${mono(10, ";letter-spacing:.14em")}">TEST MODE · SAMPLE</text>
<g class="lp">${msgs.join("\n")}</g>`;
  return frame(W, H, "sk", "Paylink, the AI shopkeeper", "In the dashboard, Paylink makes a $45 payment link, answers a sales question from a lookup, and points a refund request to the Payments page instead of doing it.", css, inner);
}

/** Your own agent over MCP: add the server to Claude Code with a restricted test key, then ask. */
export function mcpSvg() {
  const lines = [
    ["$ ", "claude mcp add --transport http paylink https://paylink.useclaudia.xyz/mcp \\", C.text, true],
    ["  ", "--header \"Authorization: Bearer rk_test_…\"", C.text, true],
    ["✓ ", "paylink added · restricted key, test mode", C.green, false],
    ["> ", "Which invoices are overdue? And make a $12 link for coffee beans.", C.text, true],
    ["● ", "paylink · list_invoices  status: open", C.mint, false],
    ["● ", "paylink · create_payment_link  12.00 USD", C.mint, false],
    ["✓ ", "paylink.useclaudia.xyz/l/…  · audit: \"Bookkeeper (rk_test_…) via MCP agent\"", C.green, false],
  ];
  const T = 13000, cw = 7.8;
  let css = `.lp{animation:lp ${T}ms linear infinite}@keyframes lp{0%,94%{opacity:1}98%,100%{opacity:0}}@media (prefers-reduced-motion:reduce){.cv{display:none}}`;
  let out = "", t = 4;
  lines.forEach(([p, raw, fill, typed], i) => {
    const text = clip(raw, 98), y = 76 + i * 28, len = text.length, dur = typed ? Math.min(16, len * 0.2) : 0.5, a = t, b = t + dur;
    css += `.p${i}{animation:p${i} ${T}ms linear infinite}@keyframes p${i}{0%,${pct(a)}{opacity:0}${pct(a + 0.1)},100%{opacity:1}}`;
    if (typed) css += `.c${i}{animation:c${i} ${T}ms linear infinite}@keyframes c${i}{0%,${pct(a)}{transform:translateX(0);animation-timing-function:steps(${len},end)}${pct(b)},100%{transform:translateX(${(len * cw).toFixed(1)}px)}}`;
    out += `<g class="p${i}"><text x="24" y="${y}" fill="${fill === C.text ? C.muted : fill}" style="${mono(13, ";white-space:pre")}">${esc(p)}</text><text x="44" y="${y}" fill="${fill}" style="${mono(13, ";white-space:pre")}">${esc(text)}</text>${typed ? `<rect class="cv c${i}" x="44" y="${y - 15}" width="${len * cw + 12}" height="21" fill="${C.bg}"/>` : ""}</g>`;
    t = b + (typed ? 4 : 6);
  });
  const inner = `<rect x="1" y="1" width="818" height="32" rx="9" fill="${C.panel}"/><rect y="32" width="820" height="1" fill="${C.line}"/>
<circle cx="18" cy="17" r="5" fill="${C.border}"/><circle cx="34" cy="17" r="5" fill="${C.border}"/><circle cx="50" cy="17" r="5" fill="${C.border}"/>
<text x="410" y="21" text-anchor="middle" fill="${C.muted}" style="${mono(11.5)}">your agent · paylink over MCP</text>
<g class="lp">${out}</g>`;
  return frame(820, 280, "mcp", "Paylink over MCP", "Add Paylink's MCP server to Claude Code with a restricted test key, ask about overdue invoices and for a payment link, and every call is audited as via MCP agent.", css, inner);
}

/** The README card grid, two per row. */
export function cardGrid() {
  const cells = FEATURES.map((f) => `<td width="50%" valign="top"><a href="${f.href}"><img src="assets/cards/${f.id}.svg" alt="${esc(`${f.title}: ${f.summary}`)}" width="100%"></a></td>`);
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>\n${cells[i]}\n${cells[i + 1] ?? '<td width="50%"></td>'}\n</tr>`);
  return `<table>\n${rows.join("\n")}\n</table>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = join(root, "assets");
  mkdirSync(join(out, "cards"), { recursive: true });
  const files = { "banner.svg": bannerSvg(), "how-it-works.svg": flowSvg(), "checkout.svg": checkoutSvg(), "shopkeeper.svg": shopkeeperSvg(), "mcp.svg": mcpSvg() };
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
