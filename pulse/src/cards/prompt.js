// Alert visuals and captions. The image is a Grok Imagine render in a fixed house style (so a feed of alerts looks
// like one product); the caption carries the numbers, the cited posts and the id for `pulse why`.
import { fmtChange, fmtPrice, sparkline } from "../sensors/prices.js";

const STYLE = "Dark editorial poster, near-black background #07080c, a single glowing violet-to-cyan gradient accent, " +
  "minimal geometric shapes, subtle grain, no text, no letters, no logos, no watermark, cinematic lighting, 16:9.";

const MOTIF = {
  high: "a bright flare breaking through dark clouds, high energy, sharp contrast",
  medium: "a calm signal wave travelling across a dark field, steady glow",
  low: "a faint pulse of light in a quiet dark room, soft and ambient",
};

/** Imagine prompt for an alert: the headline sets the motif; the style keeps every card on-brand. */
export function imagePrompt({ headline, severity = "medium", symbols = [] }) {
  const subject = symbols.length ? `an abstract representation of ${symbols.map((s) => s.replace(/^\$/, "")).join(" and ")} market momentum` : "an abstract representation of market momentum";
  return `${subject}: ${MOTIF[severity] || MOTIF.medium}. Mood inspired by: "${String(headline).slice(0, 120)}". ${STYLE}`;
}

/** Imagine prompt for a brief (morning/evening): calmer, horizon motif. */
export function briefImagePrompt({ title, topics = [] }) {
  return `A wide dawn horizon over a dark digital landscape, thin violet-to-cyan light on the edge, abstract shapes hinting at ${topics.slice(0, 3).join(", ") || "markets"}. Mood: "${String(title).slice(0, 80)}". ${STYLE}`;
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const gauge = (v, n = 10) => { const k = Math.round(((Number(v) + 1) / 2) * n); return "▮".repeat(k) + "▯".repeat(n - k); };

/**
 * Telegram HTML caption for an alert (≤ 1024 chars for sendPhoto).
 * alert: { id, severity, headline, summary, sentiment, velocity, posts: [{url, why, handle?}] }
 * prices: { SOL: { price, change24h, points } }
 */
export function alertCaption(alert, prices = {}, { maxPosts = 3 } = {}) {
  const sev = { high: "🔴", medium: "🟠", low: "🟡" }[alert.severity] || "🟠";
  const lines = [`${sev} <b>${esc(alert.headline)}</b>`, esc(alert.summary)];
  const px = Object.values(prices).slice(0, 3).map((p) => `<code>${p.symbol} ${fmtPrice(p.price)} ${fmtChange(p.change24h)} ${sparkline(p.points)}</code>`);
  if (px.length) lines.push(px.join("\n"));
  lines.push(`sentiment ${gauge(alert.sentiment ?? 0)} ${(alert.sentiment ?? 0) >= 0 ? "+" : ""}${Number(alert.sentiment ?? 0).toFixed(2)} · velocity ${Math.round((alert.velocity ?? 0) * 100)}%`);
  const posts = (alert.posts || []).slice(0, maxPosts);
  if (posts.length) lines.push(posts.map((p) => `• <a href="${esc(p.url)}">${esc(p.handle ? "@" + p.handle : hostOf(p.url))}</a> — ${esc(p.why || "")}`).join("\n"));
  lines.push(`<i>pulse why ${esc(alert.id)}</i>`);
  let text = lines.filter(Boolean).join("\n\n");
  if (text.length > 1000) text = text.slice(0, 990) + "…";
  return text;
}

function hostOf(url) {
  try { const u = new URL(url); const m = /^\/([^/]+)\/status\//.exec(u.pathname); return m ? "@" + m[1] : u.hostname; } catch { return "link"; }
}

/** Spoken line for a 6-second video brief. */
export function videoLine(alert) {
  return `${alert.headline}. ${String(alert.summary).split(/(?<=\.)\s/)[0]}`.slice(0, 180);
}

export function videoPrompt(alert, symbols = []) {
  return `${imagePrompt({ headline: alert.headline, severity: alert.severity, symbols })} Slow camera push-in, light pulses once. A calm, confident narrator says: "${videoLine(alert).replace(/"/g, "'")}"`;
}
