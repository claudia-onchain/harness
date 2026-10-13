#!/usr/bin/env node
// One-off: fetch chain marks into dashboard/public/brand/chains and write SOURCES.md + src/lib/brand-chains.ts.
// Order per chain: official asset URL → the chain's own site icon (<link rel=icon>, SVG first) → Trust Wallet assets repo
// (project-submitted logos) → DefiLlama chain icon. Marks copied by hand from audited-claudia are listed in LOCAL.
// Testnets reuse their mainnet's mark (see TESTNET_OF).
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const out = join(root, "dashboard", "public", "brand", "chains");
mkdirSync(out, { recursive: true });
const { CHAINS } = await import(join(root, "src", "chains", "registry.js"));
const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", accept: "*/*" };
const TW = (slug) => `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${slug}/info/logo.png`;
const LLAMA = (key) => `https://icons.llamao.fi/icons/chains/rsz_${key}.jpg`;

// Copied by hand from audited-claudia/client/public/brand (official kits; provenance in its SOURCES.md).
const LOCAL = { ethereum: "ethereum.svg", base: "base.svg", bnb: "bnb.svg", solana: "solana.svg", robinhood: "robinhood.svg" };
export const TESTNET_OF = { sepolia: "ethereum", "base-sepolia": "base", "arbitrum-sepolia": "arbitrum", "op-sepolia": "optimism", "polygon-amoy": "polygon", "avalanche-fuji": "avalanche", "bnb-testnet": "bnb", "monad-testnet": "monad", "solana-devnet": "solana" };

// id → { site, tw (Trust Wallet slug), official: [urls] }
const SRC = {
  arbitrum: { site: "https://arbitrum.io", tw: "arbitrum" },
  optimism: { site: "https://www.optimism.io", tw: "optimism" },
  polygon: { site: "https://polygon.technology", tw: "polygon" },
  avalanche: { site: "https://www.avax.network", tw: "avalanchec" },
  zksync: { site: "https://www.zksync.io", tw: "zksync" },
  linea: { site: "https://linea.build", tw: "linea" },
  scroll: { site: "https://scroll.io", tw: "scroll", official: [TW("scroll")] }, // scroll.io/logo.png is the dark-on-transparent variant
  blast: { site: "https://blast.io", tw: "blast" },
  zora: { site: "https://zora.co", tw: "zora" },
  mantle: { site: "https://www.mantle.xyz", tw: "mantle" },
  worldchain: { site: "https://world.org", tw: "worldchain" },
  // These sites only link an .ico (or block fetches): use the brand's own GitHub org avatar / WebP site icon, else DefiLlama.
  unichain: { site: "https://www.unichain.org", tw: "unichain", official: ["https://icons.llamao.fi/icons/chains/rsz_unichain.jpg"] },
  ink: { site: "https://inkonchain.com", tw: "ink" },
  soneium: { site: "https://soneium.org", tw: "soneium", official: ["https://github.com/Soneium.png"] },
  abstract: { site: "https://abs.xyz", tw: "abstract", official: ["https://github.com/Abstract-Foundation.png"] },
  apechain: { site: "https://apechain.com", tw: "apechain" },
  berachain: { site: "https://www.berachain.com", tw: "berachain", official: ["https://github.com/berachain.png"] },
  gnosis: { site: "https://www.gnosis.io", tw: "xdai" },
  celo: { site: "https://celo.org", tw: "celo" },
  sonic: { site: "https://www.soniclabs.com", tw: "sonic" },
  sei: { site: "https://www.sei.io", tw: "sei" },
  monad: { site: "https://www.monad.xyz", tw: "monad" },
  hyperevm: { site: "https://hyperliquid.xyz", tw: "hyperevm" },
  ronin: { site: "https://roninchain.com", tw: "ronin" },
  opbnb: { site: "https://opbnb.bnbchain.org", tw: "opbnb" },
  mode: { site: "https://www.mode.network", tw: "mode" },
  metis: { site: "https://www.metis.io", tw: "metis" },
  moonbeam: { site: "https://moonbeam.network", tw: "moonbeam" },
  rootstock: { site: "https://rootstock.io", tw: "rootstock" },
  flow: { site: "https://flow.com", tw: "flowevm" },
  zetachain: { site: "https://www.zetachain.com", tw: "zetachain" },
  bob: { site: "https://www.gobob.xyz", tw: "bob", official: ["https://www.gobob.xyz/apple-touch-icon.webp"] },
  story: { site: "https://www.story.foundation", tw: "story", official: [LLAMA("story")] }, // story.foundation now redirects to a different brand
  shape: { site: "https://shape.network", tw: "shape", official: [LLAMA("shape")] }, // site favicon is a black disc
  plasma: { site: "https://www.plasma.to", tw: "plasma" },
  bitcoin: { site: "https://bitcoin.org", tw: "bitcoin", official: [TW("bitcoin")] }, // bitcoin.org only ships a wordmark SVG
  sui: { site: "https://sui.io", tw: "sui" },
  aptos: { site: "https://aptosfoundation.org", tw: "aptos" },
  tron: { site: "https://tron.network", tw: "tron" },
  starknet: { site: "https://www.starknet.io", tw: "starknet" },
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
const isWebp = (r) => r && r.buf.subarray(0, 4).toString() === "RIFF" && r.buf.subarray(8, 12).toString() === "WEBP";
const isImg = (r) => isSvg(r) || isPng(r) || isJpg(r) || isWebp(r);
const ext = (r) => (isSvg(r) ? "svg" : isJpg(r) ? "jpg" : isWebp(r) ? "webp" : "png");

function iconLinks(html, base) {
  // mask-icon / safari-pinned-tab SVGs are single-colour silhouettes: skip them.
  const links = [...html.matchAll(/<link\s[^>]*>/gi)].map((m) => m[0]).filter((l) => /rel=["'][^"']*(icon|apple-touch)/i.test(l) && !/mask-icon|pinned-tab/i.test(l));
  const items = links.map((l) => {
    const href = /href=["']([^"']+)/i.exec(l)?.[1];
    const sizes = Number(/sizes=["'](\d+)/i.exec(l)?.[1] || 0);
    const svg = /svg/i.test(l);
    try { return href ? { url: new URL(href, base).href, sizes, svg } : null; } catch { return null; }
  }).filter(Boolean);
  return [...items.filter((i) => i.svg), ...items.filter((i) => !i.svg).sort((a, b) => b.sizes - a.sizes)].map((i) => i.url);
}

const rows = [];
const manifest = {};
for (const [id, file] of Object.entries(LOCAL)) {
  if (!existsSync(join(out, file))) { console.log(`! missing local ${file}`); continue; }
  manifest[id] = file;
  rows.push({ id, ok: true, file, how: "copied by hand", url: "audited-claudia/client/public/brand (see its SOURCES.md)" });
}
// `node scripts/chain-brand-fetch.mjs zora bob` refetches only those ids and keeps the rest from disk.
const only = new Set(process.argv.slice(2));
for (const c of CHAINS) {
  if (c.testnet || manifest[c.id]) continue;
  if (only.size && !only.has(c.id)) {
    const have = ["svg", "png", "jpg", "webp"].map((e) => `${c.id}.${e}`).find((f) => existsSync(join(out, f)));
    if (have) { manifest[c.id] = have; rows.push({ id: c.id, ok: true, file: have, how: "kept", url: "(unchanged; see previous run)" }); }
    continue;
  }
  const s = SRC[c.id] || {};
  let got = null, how = "";
  for (const u of s.official || []) { const r = await get(u); if (isImg(r)) { got = r; how = /github\.com/.test(u) ? "official GitHub org avatar" : /llamao/.test(u) ? "DefiLlama chain icon" : /trustwallet/.test(u) ? "Trust Wallet assets" : "official asset"; break; } }
  if (!got && s.site) {
    const page = await get(s.site);
    if (page) for (const u of iconLinks(page.buf.toString("utf8"), page.url)) { const r = await get(u); if (isSvg(r) || (isPng(r) && r.buf.length > 2000)) { got = r; how = isSvg(r) ? "site SVG icon" : "site PNG icon"; break; } }
  }
  if (!got && s.tw) { const r = await get(TW(s.tw)); if (isPng(r)) { got = r; how = "Trust Wallet assets"; } }
  if (!got && c.llama) { const r = await get(LLAMA(c.llama)); if (isImg(r)) { got = r; how = "DefiLlama chain icon"; } }
  if (!got) { rows.push({ id: c.id, ok: false }); console.log(`✗ ${c.id}`); continue; }
  const file = `${c.id}.${ext(got)}`;
  writeFileSync(join(out, file), got.buf);
  manifest[c.id] = file;
  rows.push({ id: c.id, ok: true, file, how, url: got.url });
  console.log(`✓ ${c.id.padEnd(11)} ${ext(got)} ${String(got.buf.length).padStart(7)}B  ${how}  ${got.url}`);
}

writeFileSync(join(out, "SOURCES.md"), `# Chain marks

Fetched ${new Date().toISOString().slice(0, 10)} by scripts/chain-brand-fetch.mjs. Each chain's own brand rules apply: don't recolour, crop or restyle.
Testnets reuse their mainnet's mark.

| id | file | how | source |
|---|---|---|---|
${rows.map((r) => r.ok ? `| ${r.id} | ${r.file} | ${r.how} | ${r.url} |` : `| ${r.id} | — | not found | |`).join("\n")}
`);
writeFileSync(join(root, "dashboard", "src", "lib", "brand-chains.ts"), `// Generated by scripts/chain-brand-fetch.mjs — chain marks under /brand/chains. See that folder's SOURCES.md.
export const CHAIN_BRAND: Record<string, string> = ${JSON.stringify(manifest, null, 2)};
/** Testnet id → the mainnet whose mark it reuses. */
export const TESTNET_OF: Record<string, string> = ${JSON.stringify(TESTNET_OF, null, 2)};
`);
console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} marks → ${out}`);
