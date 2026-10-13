#!/usr/bin/env node
// One-off: fetch provider marks into dashboard/public/brand/providers and write SOURCES.md + src/lib/brand.ts.
// Order per provider: official asset URL → site SVG icon (<link rel=icon>) → simple-icons (CC0, mono) → site PNG icon.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const out = join(root, "dashboard", "public", "brand", "providers");
mkdirSync(out, { recursive: true });
const SI = (slug) => `https://cdn.jsdelivr.net/npm/simple-icons@15/icons/${slug}.svg`;
const UA = { "user-agent": "Mozilla/5.0 (Macintosh) LumenBrandFetch/1.0", accept: "*/*" };

// id → { site, color, official: [urls], si: simple-icons slug }
const PROVIDERS = {
  anthropic: { site: "https://www.anthropic.com", color: "#D97757", si: "anthropic" },
  openai: { site: "https://openai.com", color: "#FFFFFF", si: "openai" },
  xai: { site: "https://x.ai", color: "#FFFFFF", si: "xai", official: ["https://x.ai/favicon.svg"] },
  openrouter: { site: "https://openrouter.ai", color: "#6467F2", official: ["https://openrouter.ai/favicon.svg", "https://openrouter.ai/icon.svg"] },
  gemini: { site: "https://gemini.google.com", color: "#4E8DF5", si: "googlegemini" },
  ollama: { site: "https://ollama.com", color: "#FFFFFF", si: "ollama" },
  lmstudio: { site: "https://lmstudio.ai", color: "#4F46E5", official: ["https://lmstudio.ai/favicon.svg", "https://lmstudio.ai/icon.svg"] },
  alchemy: { site: "https://www.alchemy.com", color: "#0C0C0E", si: "alchemy", official: ["https://www.alchemy.com/favicon.svg"] },
  helius: { site: "https://www.helius.dev", color: "#E84125", official: ["https://www.helius.dev/favicon.svg", "https://www.helius.dev/icon.svg"] },
  etherscan: { site: "https://etherscan.io", color: "#21325B", official: ["https://etherscan.io/images/brandassets/etherscan-logo-circle.svg", "https://etherscan.io/images/brandassets/etherscan-logo-circle-light.svg"] },
  // No SVG/PNG icon is linked from these sites: use the official GitHub organisation avatar (what the brand itself publishes there).
  defillama: { site: "https://defillama.com", color: "#2172E5", official: ["https://defillama.com/favicon.svg", "https://github.com/DefiLlama.png"] },
  coingecko: { site: "https://www.coingecko.com", color: "#8BC53F", official: ["https://github.com/coingecko.png"] },
  jupiter: { site: "https://jup.ag", color: "#C7F284", official: ["https://jup.ag/svg/jupiter-logo.svg", "https://jup.ag/favicon.svg", "https://station.jup.ag/img/logo.svg"] },
  zerox: { site: "https://0x.org", color: "#FFFFFF", official: ["https://0x.org/favicon.svg", "https://0x.org/icon.svg"] },
  lifi: { site: "https://li.fi", color: "#F5B5FF", official: ["https://li.fi/favicon.svg", "https://li.fi/icon.svg"] },
  brave: { site: "https://brave.com", color: "#FB542B", si: "brave" },
  tavily: { site: "https://tavily.com", color: "#468BFF", official: ["https://tavily.com/favicon.svg", "https://tavily.com/icon.svg"] },
  exa: { site: "https://exa.ai", color: "#1F40ED", official: ["https://exa.ai/favicon.svg", "https://github.com/exa-labs.png"] },
  fal: { site: "https://fal.ai", color: "#ECB4FF", official: ["https://fal.ai/favicon.svg", "https://fal.ai/icon.svg"] },
  elevenlabs: { site: "https://elevenlabs.io", color: "#FFFFFF", si: "elevenlabs" },
  replicate: { site: "https://replicate.com", color: "#FFFFFF", si: "replicate" },
  heygen: { site: "https://www.heygen.com", color: "#7559FF", official: ["https://www.heygen.com/favicon.svg", "https://github.com/heygen-com.png"] },
  runway: { site: "https://runwayml.com", color: "#FFFFFF", official: ["https://runwayml.com/favicon.svg", "https://runwayml.com/icon.svg"] },
  byteplus: { site: "https://www.byteplus.com", color: "#3370FF", official: ["https://sf-bpcms.bytepluscdn.com/obj/byteplus-public-aiso/portal/assets/apple-touch-icon.png"] },
  telegram: { site: "https://telegram.org", color: "#26A5E4", si: "telegram" },
};

async function get(url, { timeout = 12000 } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: UA, signal: c.signal, redirect: "follow" });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return { buf, type: r.headers.get("content-type") || "", url: r.url };
  } catch { return null; } finally { clearTimeout(t); }
}
const isSvg = (r) => r && (r.type.includes("svg") || r.buf.subarray(0, 300).toString().includes("<svg"));
const isPng = (r) => r && r.buf[0] === 0x89 && r.buf[1] === 0x50;
const isJpg = (r) => r && r.buf[0] === 0xff && r.buf[1] === 0xd8;
const isRaster = (r) => isPng(r) || isJpg(r);

/** Parse <link rel=icon|apple-touch-icon> hrefs from a page, SVG first, then largest PNG. */
function iconLinks(html, base) {
  const links = [...html.matchAll(/<link\s[^>]*>/gi)].map((m) => m[0]).filter((l) => /rel=["'][^"']*(icon|apple-touch)/i.test(l));
  const items = links.map((l) => {
    const href = /href=["']([^"']+)/i.exec(l)?.[1];
    const sizes = Number(/sizes=["'](\d+)/i.exec(l)?.[1] || 0);
    const svg = /svg/i.test(l);
    try { return href ? { url: new URL(href, base).href, sizes, svg } : null; } catch { return null; }
  }).filter(Boolean);
  return [...items.filter((i) => i.svg), ...items.filter((i) => !i.svg).sort((a, b) => b.sizes - a.sizes)].map((i) => i.url);
}

// Marks that are not fetched: copied by hand from audited-claudia/client/public/brand/tokens (see its SOURCES.md).
const LOCAL = {
  "wallet-evm": { file: "wallet-evm.svg", color: "#627EEA", mono: false },
  "wallet-solana": { file: "wallet-solana.svg", color: "#9945FF", mono: false },
};

const rows = [];
const manifest = { ...LOCAL };
for (const [id, p] of Object.entries(PROVIDERS)) {
  let got = null, how = "";
  for (const u of p.official || []) { const r = await get(u); if (isSvg(r) || isRaster(r)) { got = r; how = /github\.com/.test(u) ? "official GitHub org avatar" : "official asset"; break; } }
  if (!got) {
    const page = await get(p.site);
    if (page) {
      const cands = iconLinks(page.buf.toString("utf8"), page.url);
      for (const u of cands) { const r = await get(u); if (isSvg(r) || (isPng(r) && r.buf.length > 2000)) { got = r; how = isSvg(r) ? "site SVG icon" : "site PNG icon"; break; } }
    }
  }
  if ((!got || !isSvg(got)) && p.si) { const r = await get(SI(p.si)); if (isSvg(r)) { got = r; how = "simple-icons (CC0 mono)"; } }
  if (!got) { rows.push({ id, ok: false }); console.log(`✗ ${id}`); continue; }
  const ext = isSvg(got) ? "svg" : isJpg(got) ? "jpg" : "png";
  let body = got.buf;
  if (ext === "svg" && how.startsWith("simple-icons")) body = Buffer.from(body.toString("utf8").replace("<svg ", `<svg fill="${p.color}" `));
  writeFileSync(join(out, `${id}.${ext}`), body);
  manifest[id] = { file: `${id}.${ext}`, color: p.color, mono: how.startsWith("simple-icons") };
  rows.push({ id, ok: true, file: `${id}.${ext}`, how, url: got.url, bytes: body.length });
  console.log(`✓ ${id.padEnd(11)} ${ext} ${String(body.length).padStart(7)}B  ${how}  ${got.url}`);
}

const md = `# Provider marks

Fetched ${new Date().toISOString().slice(0, 10)} by scripts/brand-fetch.mjs. Each brand's own usage rules apply: don't recolour, crop or restyle these files
(simple-icons marks are single-colour by design and are tinted with the brand's primary colour).

| id | file | how | source |
|---|---|---|---|
${rows.map((r) => r.ok ? `| ${r.id} | ${r.file} | ${r.how} | ${r.url} |` : `| ${r.id} | — | not found | |`).join("\n")}
${Object.entries(LOCAL).map(([id, l]) => `| ${id} | ${l.file} | copied by hand | audited-claudia/client/public/brand/tokens (ethereum.org assets / solana.com branding; see its SOURCES.md) |`).join("\n")}
`;
writeFileSync(join(out, "SOURCES.md"), md);
writeFileSync(join(root, "dashboard", "src", "lib", "brand.ts"), `// Generated by scripts/brand-fetch.mjs — provider marks under /brand/providers. See that folder's SOURCES.md.
export const BRAND: Record<string, { file: string; color: string; mono: boolean }> = ${JSON.stringify(manifest, null, 2)};
`);
console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} marks → ${out}`);
