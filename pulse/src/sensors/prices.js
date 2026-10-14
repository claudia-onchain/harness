// Keyless prices for the symbols a routine watches: DefiLlama first (coins.llama.fi), CoinGecko as a fallback.
// Returns enough for a judgement and a caption: price, 24 h change, and a few hourly points for a sparkline.
const LLAMA = "https://coins.llama.fi";
const GECKO = "https://api.coingecko.com/api/v3";

// Symbol → DefiLlama coin key / CoinGecko id. Extend freely; unknown symbols are looked up on CoinGecko by symbol.
export const KNOWN = {
  BTC: { llama: "coingecko:bitcoin", gecko: "bitcoin" },
  ETH: { llama: "coingecko:ethereum", gecko: "ethereum" },
  SOL: { llama: "coingecko:solana", gecko: "solana" },
  BNB: { llama: "coingecko:binancecoin", gecko: "binancecoin" },
  HYPE: { llama: "coingecko:hyperliquid", gecko: "hyperliquid" },
  XRP: { llama: "coingecko:ripple", gecko: "ripple" },
  DOGE: { llama: "coingecko:dogecoin", gecko: "dogecoin" },
  AVAX: { llama: "coingecko:avalanche-2", gecko: "avalanche-2" },
  LINK: { llama: "coingecko:chainlink", gecko: "chainlink" },
  SUI: { llama: "coingecko:sui", gecko: "sui" },
  APT: { llama: "coingecko:aptos", gecko: "aptos" },
  TRX: { llama: "coingecko:tron", gecko: "tron" },
  ARB: { llama: "coingecko:arbitrum", gecko: "arbitrum" },
  OP: { llama: "coingecko:optimism", gecko: "optimism" },
  POL: { llama: "coingecko:polygon-ecosystem-token", gecko: "polygon-ecosystem-token" },
  USDC: { llama: "coingecko:usd-coin", gecko: "usd-coin" },
  USDT: { llama: "coingecko:tether", gecko: "tether" },
};

const norm = (s) => String(s).replace(/^\$/, "").toUpperCase();

async function getJson(url, { fetch: f = fetch, timeoutMs = 8000 } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await f(url, { signal: c.signal, headers: { accept: "application/json", "user-agent": "pulse-harness/0.1" } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Resolve a CoinGecko id for an unknown symbol (first exact-symbol match by market cap rank). */
async function geckoIdFor(symbol, opts) {
  const list = await getJson(`${GECKO}/search?query=${encodeURIComponent(symbol)}`, opts);
  const hit = (list.coins || []).find((c) => c.symbol?.toUpperCase() === symbol);
  return hit?.id || null;
}

/**
 * Prices for symbols → { SOL: { symbol, price, change24h, points: number[], source, updatedAt } }.
 * Never throws for a single bad symbol: it is simply absent from the result.
 */
export async function getPrices(symbols, opts = {}) {
  const out = {};
  const wanted = [...new Set(symbols.map(norm))].filter(Boolean);
  if (!wanted.length) return out;
  // Current prices in one DefiLlama call.
  const ids = {};
  for (const s of wanted) {
    const k = KNOWN[s]?.llama || (await geckoIdFor(s, opts).then((id) => (id ? `coingecko:${id}` : null)).catch(() => null));
    if (k) ids[s] = k;
  }
  const keys = Object.values(ids);
  if (keys.length) {
    try {
      const cur = await getJson(`${LLAMA}/prices/current/${keys.join(",")}`, opts);
      for (const [s, k] of Object.entries(ids)) {
        const c = cur.coins?.[k];
        if (c?.price != null) out[s] = { symbol: s, price: c.price, change24h: null, points: [], source: "defillama", updatedAt: (c.timestamp || 0) * 1000 };
      }
    } catch { /* fall through to CoinGecko below */ }
  }
  // 24 h change + hourly points from CoinGecko market_chart (one call per symbol; rate-limited but keyless).
  await Promise.all(wanted.map(async (s) => {
    const id = KNOWN[s]?.gecko || ids[s]?.replace(/^coingecko:/, "");
    if (!id) return;
    try {
      const mc = await getJson(`${GECKO}/coins/${id}/market_chart?vs_currency=usd&days=1`, opts);
      const pts = (mc.prices || []).map((p) => p[1]);
      if (!pts.length) return;
      const first = pts[0], last = pts[pts.length - 1];
      out[s] = { ...(out[s] || { symbol: s, source: "coingecko", updatedAt: Date.now() }), price: out[s]?.price ?? last, change24h: first ? ((last - first) / first) * 100 : null, points: sample(pts, 24) };
    } catch { /* keep the DefiLlama price without a sparkline */ }
  }));
  return out;
}

/** Evenly sample n points from a series (for sparklines). */
export function sample(arr, n) {
  if (arr.length <= n) return arr;
  return Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
}

/** Unicode sparkline: ▁▂▃▄▅▆▇█ */
export function sparkline(points) {
  const bars = "▁▂▃▄▅▆▇█";
  if (!points?.length) return "";
  const lo = Math.min(...points), hi = Math.max(...points);
  return points.map((p) => bars[hi === lo ? 3 : Math.round(((p - lo) / (hi - lo)) * (bars.length - 1))]).join("");
}

export const fmtPrice = (p) => (p == null ? "—" : p >= 1000 ? `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : p >= 1 ? `$${p.toFixed(2)}` : `$${p.toPrecision(3)}`);
export const fmtChange = (c) => (c == null ? "" : `${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(1)}%`);
