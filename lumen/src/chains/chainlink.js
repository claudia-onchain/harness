// Chainlink price feeds read straight from the chain: latestRoundData() decoded by hand from eth_call hex,
// with a staleness check. Feeds come from the verified CHAINLINK_FEEDS table, then the reference data
// directory (https://reference-data-directory.vercel.app/feeds-{network}.json), cached for 24 h.
import { join } from "node:path";
import { CHAINLINK_FEEDS } from "./registry.js";
import { rpc } from "./rpc.js";
import { SELECTORS, decodeLatestRoundData, uint, string, toNumber } from "./abi.js";
import { P, ensureHome } from "../core/paths.js";
import { readJson, writeJson } from "../core/fsx.js";
import { fetchJson } from "../core/util.js";

const DIR_URL = (net) => `https://reference-data-directory.vercel.app/feeds-${net}.json`;
const DAY = 86_400_000;
const mem = new Map();

/** The feed directory for a chain (array of entries), [] when the chain has no Chainlink network. */
export async function feedDirectory(chain, { force = false } = {}) {
  if (!chain.chainlink) return [];
  if (!force && mem.has(chain.chainlink)) return mem.get(chain.chainlink);
  ensureHome();
  const file = join(P.feedsCache, `feeds-${chain.chainlink}.json`);
  const cached = readJson(file, null);
  if (!force && cached?.at && Date.now() - cached.at < DAY) { mem.set(chain.chainlink, cached.feeds); return cached.feeds; }
  try {
    const raw = await fetchJson(DIR_URL(chain.chainlink), {}, 12000);
    const feeds = (Array.isArray(raw) ? raw : []).filter((f) => f.proxyAddress || f.secondaryProxyAddress).map((f) => ({
      name: f.name, path: f.path, proxyAddress: f.proxyAddress, secondaryProxyAddress: f.secondaryProxyAddress || null,
      decimals: f.decimals, heartbeat: f.heartbeat, feedCategory: f.feedCategory, docs: f.docs ? { assetName: f.docs.assetName, feedType: f.docs.feedType } : undefined,
    }));
    writeJson(file, { at: Date.now(), feeds });
    mem.set(chain.chainlink, feeds);
    return feeds;
  } catch (e) {
    if (cached?.feeds) return cached.feeds;
    throw e;
  }
}

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

/** Find a feed { address, name, decimals?, heartbeat?, source } for BASE/QUOTE on a chain. */
export async function findFeed(chain, base, quote = "USD") {
  const pair = `${String(base).toUpperCase()}/${String(quote).toUpperCase()}`;
  const known = CHAINLINK_FEEDS[chain.id]?.[pair];
  let dirEntry = null;
  try {
    const feeds = await feedDirectory(chain);
    const path = `${base}-${quote}`.toLowerCase();
    const candidates = feeds.filter((f) => norm(f.path) === path || norm(f.name) === norm(`${base} / ${quote}`));
    dirEntry = candidates.find((f) => norm(f.path) === path && !/svr/i.test(f.path)) || candidates.find((f) => !/svr/i.test(`${f.path} ${f.name}`)) || candidates[0] || null;
  } catch { /* directory unreachable: rely on the verified table */ }
  if (known) return { address: known, name: pair, decimals: dirEntry?.decimals ?? 8, heartbeat: dirEntry?.heartbeat ?? null, source: "verified" };
  if (!dirEntry) return null;
  // Some networks (Base) list the standard proxy as secondaryProxyAddress next to an SVR proxy.
  const address = dirEntry.secondaryProxyAddress || dirEntry.proxyAddress;
  return { address, name: dirEntry.name, decimals: dirEntry.decimals, heartbeat: dirEntry.heartbeat, source: "directory" };
}

/** Read a feed: { answer, decimals, value, updatedAt (ms), roundId, description, stale, ageSec }. */
export async function readFeed(chain, address, { heartbeat = null, decimals = null, withDescription = false } = {}) {
  const call = (data) => rpc(chain, "eth_call", [{ to: address, data }, "latest"]);
  const [roundHex, decHex, descHex] = await Promise.all([
    call(SELECTORS.latestRoundData),
    decimals == null ? call(SELECTORS.decimals) : Promise.resolve(null),
    withDescription ? call(SELECTORS.description).catch(() => null) : Promise.resolve(null),
  ]);
  const r = decodeLatestRoundData(roundHex);
  const dec = decimals ?? Number(uint(decHex, 0));
  const updatedAt = Number(r.updatedAt) * 1000;
  const ageSec = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  const limit = (Number(heartbeat) || 86400) * 1.5 + 600;
  return {
    answer: r.answer, decimals: dec, value: toNumber(r.answer, dec), updatedAt, roundId: r.roundId.toString(),
    description: descHex ? string(descHex) : undefined, ageSec, stale: ageSec > limit || r.answer <= 0n,
  };
}

/** Price of SYMBOL in USD via Chainlink on `chain`; null when no feed exists. */
export async function chainlinkPrice(chain, symbol) {
  if (chain.family !== "evm") return null;
  const base = String(symbol).toUpperCase().replace(/^W(ETH|BTC)$/, "$1");
  const feed = await findFeed(chain, base, "USD");
  if (!feed) return null;
  const r = await readFeed(chain, feed.address, { heartbeat: feed.heartbeat, decimals: feed.decimals });
  return { symbol: base, usd: r.value, source: "chainlink", updatedAt: new Date(r.updatedAt).toISOString(), feed: feed.address, stale: r.stale, ageSec: r.ageSec, chain: chain.id };
}
