// Prices: Chainlink on-chain first (when a feed exists), then Alchemy Prices, DefiLlama, CoinGecko;
// Jupiter for Solana mints. Returns { symbol, usd, source, updatedAt, ... }.
import { chainlinkPrice } from "./chainlink.js";
import { getChain, CHAINS } from "./registry.js";
import { COINGECKO_IDS, isEvmAddress, isSolanaAddress, KNOWN_TOKENS } from "./tokens.js";
import { getKeys } from "../core/keys.js";
import { fetchJson } from "../core/util.js";

const iso = (sec) => new Date((sec || Date.now() / 1000) * 1000).toISOString();

export function coingeckoIdFor(symbol) {
  const s = String(symbol).toUpperCase();
  if (COINGECKO_IDS[s]) return COINGECKO_IDS[s];
  const native = CHAINS.find((c) => c.native.symbol.toUpperCase() === s && c.native.coingecko);
  return native?.native.coingecko || null;
}

async function cgSearch(symbol, keys) {
  const k = keys.get("coingecko");
  const j = await fetchJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`, { headers: k ? { "x-cg-demo-api-key": k } : {} }, 8000);
  const exact = (j.coins || []).find((c) => c.symbol?.toUpperCase() === String(symbol).toUpperCase());
  return exact?.id || null;
}

async function llama(keysList) {
  const j = await fetchJson(`https://coins.llama.fi/prices/current/${keysList.map(encodeURIComponent).join(",")}`, {}, 10000);
  return j.coins || {};
}

async function bySymbol(symbol, chain, keys, errors) {
  const sym = String(symbol).toUpperCase();
  // 1. Chainlink on the requested chain, then Ethereum for majors.
  for (const c of chain.id === "ethereum" ? [chain] : [chain, getChain("ethereum")]) {
    try {
      const r = await chainlinkPrice(c, sym);
      if (r && !r.stale) return r;
      if (r?.stale) errors.push(`chainlink ${c.id}: stale (${r.ageSec}s old)`);
    } catch (e) { errors.push(`chainlink ${c.id}: ${e.message}`); }
  }
  // 2. Alchemy Prices API.
  const ak = keys.get("alchemy");
  if (ak) {
    try {
      const j = await fetchJson(`https://api.g.alchemy.com/prices/v1/${ak}/tokens/by-symbol?symbols=${encodeURIComponent(sym)}`, {}, 8000);
      const p = j.data?.[0]?.prices?.find((x) => x.currency === "usd");
      if (p) return { symbol: sym, usd: Number(p.value), source: "alchemy", updatedAt: p.lastUpdatedAt || new Date().toISOString() };
    } catch (e) { errors.push(`alchemy: ${e.message}`); }
  }
  // 3. DefiLlama via coingecko id.
  let cg = coingeckoIdFor(sym);
  if (!cg) { try { cg = await cgSearch(sym, keys); } catch (e) { errors.push(`coingecko search: ${e.message}`); } }
  if (cg) {
    try {
      const coins = await llama([`coingecko:${cg}`]);
      const c = coins[`coingecko:${cg}`];
      if (c?.price) return { symbol: sym, usd: c.price, source: "defillama", updatedAt: iso(c.timestamp), confidence: c.confidence };
    } catch (e) { errors.push(`defillama: ${e.message}`); }
    // 4. CoinGecko simple price.
    try {
      const k = keys.get("coingecko");
      const j = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${cg}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`, { headers: k ? { "x-cg-demo-api-key": k } : {} }, 8000);
      if (j[cg]?.usd) return { symbol: sym, usd: j[cg].usd, source: "coingecko", updatedAt: iso(j[cg].last_updated_at), change24h: j[cg].usd_24h_change };
    } catch (e) { errors.push(`coingecko: ${e.message}`); }
  }
  // Solana-native symbols through Jupiter.
  const mint = KNOWN_TOKENS.solana[sym]?.address;
  if (mint) { try { return await jupiterPrice(mint, keys, sym); } catch (e) { errors.push(`jupiter: ${e.message}`); } }
  return null;
}

export async function jupiterPrice(mint, keys = getKeys(), symbol) {
  const k = keys.get("jupiter");
  const j = await fetchJson(`https://api.jup.ag/price/v3?ids=${mint}`, { headers: k ? { "x-api-key": k } : {} }, 8000);
  const p = j[mint] || j.data?.[mint];
  if (!p?.usdPrice && !p?.price) throw new Error("no Jupiter price");
  return { symbol: symbol || mint, token: mint, usd: Number(p.usdPrice ?? p.price), source: "jupiter", updatedAt: new Date().toISOString(), change24h: p.priceChange24h, chain: "solana" };
}

async function byToken(token, chain, keys, errors) {
  if (chain.family === "solana" || (!isEvmAddress(token) && isSolanaAddress(token))) {
    try { return await jupiterPrice(token, keys); } catch (e) { errors.push(`jupiter: ${e.message}`); }
    try {
      const coins = await llama([`solana:${token}`]);
      const c = coins[`solana:${token}`];
      if (c?.price) return { symbol: c.symbol, token, usd: c.price, source: "defillama", updatedAt: iso(c.timestamp), chain: "solana" };
    } catch (e) { errors.push(`defillama: ${e.message}`); }
    return null;
  }
  if (chain.llama) {
    try {
      const key = `${chain.llama}:${token}`;
      const coins = await llama([key]);
      const c = coins[key];
      if (c?.price) return { symbol: c.symbol, token, usd: c.price, source: "defillama", updatedAt: iso(c.timestamp), chain: chain.id, decimals: c.decimals };
    } catch (e) { errors.push(`defillama: ${e.message}`); }
  }
  const ak = keys.get("alchemy");
  if (ak && chain.alchemy) {
    try {
      const j = await fetchJson(`https://api.g.alchemy.com/prices/v1/${ak}/tokens/by-address`, { method: "POST", body: { addresses: [{ network: chain.alchemy, address: token }] } }, 8000);
      const p = j.data?.[0]?.prices?.find((x) => x.currency === "usd");
      if (p) return { symbol: token, token, usd: Number(p.value), source: "alchemy", updatedAt: p.lastUpdatedAt, chain: chain.id };
    } catch (e) { errors.push(`alchemy: ${e.message}`); }
  }
  return null;
}

/** getPrice({ symbol } | { token }, chain) -> price object; throws with the reasons when nothing works. */
export async function getPrice({ symbol, token, chain: chainQ = "ethereum" } = {}, keys = getKeys()) {
  const chain = getChain(chainQ) || getChain("ethereum");
  const errors = [];
  const q = token || symbol;
  if (!q) throw new Error("Give a symbol (ETH) or a token address.");
  const r = token || isEvmAddress(q) || (isSolanaAddress(q) && q.length > 30) ? await byToken(q, chain, keys, errors) : await bySymbol(q, chain, keys, errors);
  if (!r) throw new Error(`No price for ${q}${errors.length ? ` (${errors.slice(0, 4).join("; ")})` : ""}`);
  return r;
}

/** Batch USD prices for llama keys like "base:0x…", "coingecko:ethereum". Missing keys are omitted. */
export async function llamaPrices(keysList) {
  if (!keysList.length) return {};
  const out = {};
  for (let i = 0; i < keysList.length; i += 60) Object.assign(out, await llama(keysList.slice(i, i + 60)).catch(() => ({})));
  return out;
}
