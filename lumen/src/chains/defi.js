// DefiLlama: protocol TVL, chain TVL and yields (keyless).
import { fetchJson } from "../core/util.js";
import { getChain } from "./registry.js";

/** Names a chain may appear under in DefiLlama ("base", "Base", "bsc" for bnb, "Avalanche", …), lower-cased. */
function llamaNames(q) {
  const c = getChain(q);
  const names = new Set([String(q).toLowerCase()]);
  if (c) { names.add(c.name.toLowerCase()); if (c.llama) names.add(c.llama.toLowerCase()); names.add(c.id); }
  const extra = { bnb: ["bsc", "binance"], avalanche: ["avalanche", "avax"], zksync: ["zksync era", "era"], gnosis: ["gnosis", "xdai"], optimism: ["optimism", "op mainnet"], polygon: ["polygon"], hyperevm: ["hyperliquid l1", "hyperliquid"], rootstock: ["rootstock", "rsk"], worldchain: ["world chain"] };
  for (const x of extra[c?.id] || []) names.add(x);
  return names;
}

let protocolsCache = null;

export async function defiTvl({ protocol, chain } = {}) {
  if (protocol) {
    const slug = String(protocol).toLowerCase().replace(/\s+/g, "-");
    const j = await fetchJson(`https://api.llama.fi/protocol/${encodeURIComponent(slug)}`, {}, 15000).catch(() => null);
    if (j?.name) {
      const cur = j.currentChainTvls || {};
      return { name: j.name, category: j.category, tvlUsd: Object.entries(cur).filter(([k]) => !/-|borrowed|staking|pool2/i.test(k)).reduce((a, [, v]) => a + v, 0), chains: Object.fromEntries(Object.entries(cur).filter(([k]) => !/-|borrowed|staking|pool2|vesting/i.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 12)), url: j.url, twitter: j.twitter };
    }
  }
  protocolsCache ||= await fetchJson("https://api.llama.fi/protocols", {}, 20000);
  let list = protocolsCache;
  if (protocol) list = list.filter((p) => p.name.toLowerCase().includes(String(protocol).toLowerCase()));
  if (chain) { const n = llamaNames(chain); list = list.filter((p) => (p.chains || []).some((c) => n.has(c.toLowerCase()))); }
  if (!protocol && !chain) {
    const chains = await fetchJson("https://api.llama.fi/v2/chains", {}, 15000);
    return { topChains: chains.sort((a, b) => b.tvl - a.tvl).slice(0, 20).map((c) => ({ name: c.name, tvlUsd: Math.round(c.tvl) })) };
  }
  return { protocols: list.sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, 20).map((p) => ({ name: p.name, category: p.category, tvlUsd: Math.round(p.tvl || 0), change1d: p.change_1d, chains: (p.chains || []).slice(0, 6) })) };
}

export async function defiYields({ chain, project, symbol, minTvlUsd = 1_000_000, limit = 15 } = {}) {
  const j = await fetchJson("https://yields.llama.fi/pools", {}, 25000);
  let pools = j.data || [];
  if (chain) { const n = llamaNames(chain); pools = pools.filter((p) => n.has(String(p.chain).toLowerCase())); }
  if (project) pools = pools.filter((p) => p.project?.toLowerCase().includes(String(project).toLowerCase()));
  if (symbol) pools = pools.filter((p) => p.symbol?.toUpperCase().includes(String(symbol).toUpperCase()));
  pools = pools.filter((p) => (p.tvlUsd || 0) >= minTvlUsd).sort((a, b) => (b.apy || 0) - (a.apy || 0)).slice(0, limit);
  return pools.map((p) => ({ project: p.project, chain: p.chain, symbol: p.symbol, apy: p.apy, apyBase: p.apyBase, apyReward: p.apyReward, tvlUsd: Math.round(p.tvlUsd), stable: p.stablecoin, il: p.ilRisk, pool: p.pool }));
}
