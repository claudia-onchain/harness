// EVM reads: chain status, gas, tx lookup with decoded summary, ERC-20 info/balances, Alchemy enhanced APIs.
import { rpc, rpcRaw, rpcSource } from "./rpc.js";
import { SELECTORS, encodeCall, uint, string } from "./abi.js";
import { explorerTx, alchemyUrl } from "./registry.js";
import { headInfo } from "./other.js";
import { getKeys } from "../core/keys.js";
import { fetchJson, formatUnits } from "../core/util.js";

const hexNum = (h) => (h == null ? null : Number(BigInt(h)));
const gwei = (h) => (h == null ? null : Number(BigInt(h)) / 1e9);
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const METHODS = {
  "0xa9059cbb": "transfer(address,uint256)", "0x095ea7b3": "approve(address,uint256)", "0x23b872dd": "transferFrom(address,address,uint256)",
  "0x3593564c": "execute (Universal Router)", "0x5ae401dc": "multicall(uint256,bytes[])", "0xac9650d8": "multicall(bytes[])",
  "0x7ff36ab5": "swapExactETHForTokens", "0x38ed1739": "swapExactTokensForTokens", "0x18cbafe5": "swapExactTokensForETH",
  "0xd0e30db0": "deposit() (wrap)", "0x2e1a7d4d": "withdraw(uint256) (unwrap)", "0x96f4e9f9": "ccipSend", "0x20487ded": "getFee",
  "0x1249c58b": "mint()", "0x40c10f19": "mint(address,uint256)", "0x42842e0e": "safeTransferFrom(address,address,uint256)",
};

/** { id, blockNumber, gasPriceGwei?, latencyMs, rpcSource } */
export async function chainStatus(chain, keys = getKeys()) {
  if (chain.family !== "evm" && chain.family !== "solana") {
    const h = await headInfo(chain);
    return { id: chain.id, ...h, rpcSource: rpcSource(chain, keys) };
  }
  if (chain.family === "solana") {
    const r = await rpcRaw(chain, "getSlot", [], { keys });
    return { id: chain.id, blockNumber: r.result, latencyMs: r.ms, rpcSource: r.source };
  }
  const r = await rpcRaw(chain, "eth_blockNumber", [], { keys });
  const gp = await rpc(chain, "eth_gasPrice", [], { keys }).catch(() => null);
  return { id: chain.id, blockNumber: hexNum(r.result), gasPriceGwei: gwei(gp), latencyMs: r.ms, rpcSource: r.source, rpcHost: new URL(r.url).host.replace(/^[^.]*\.g\.alchemy\.com$/, "alchemy") };
}

export async function gas(chain) {
  const [gp, tip, block] = await Promise.all([
    rpc(chain, "eth_gasPrice", []),
    rpc(chain, "eth_maxPriorityFeePerGas", []).catch(() => null),
    rpc(chain, "eth_getBlockByNumber", ["latest", false]).catch(() => null),
  ]);
  return { chain: chain.id, gasPriceGwei: gwei(gp), baseFeeGwei: gwei(block?.baseFeePerGas), priorityFeeGwei: gwei(tip), blockNumber: hexNum(block?.number) };
}

export async function erc20Info(chain, address) {
  const call = (data) => rpc(chain, "eth_call", [{ to: address, data }, "latest"]).catch(() => null);
  const [n, s, d, ts] = await Promise.all([call(SELECTORS.name), call(SELECTORS.symbol), call(SELECTORS.decimals), call(SELECTORS.totalSupply)]);
  if (!s && !d) {
    const code = await rpc(chain, "eth_getCode", [address, "latest"]).catch(() => "0x");
    return { address, contract: code && code !== "0x", erc20: false };
  }
  const decimals = d ? Number(uint(d)) : 18;
  return { address, erc20: true, name: n ? safe(() => string(n)) : null, symbol: s ? safe(() => string(s)) : null, decimals, totalSupply: ts ? formatUnits(uint(ts), decimals) : null };
}
const safe = (f) => { try { return f(); } catch { return null; } };

export async function erc20Balance(chain, token, owner) {
  const hex = await rpc(chain, "eth_call", [{ to: token, data: encodeCall(SELECTORS.balanceOf, owner) }, "latest"]);
  return uint(hex);
}

/** Receipt + decoded summary + explorer link. */
export async function txLookup(chain, hash) {
  const [tx, rc] = await Promise.all([rpc(chain, "eth_getTransactionByHash", [hash]), rpc(chain, "eth_getTransactionReceipt", [hash]).catch(() => null)]);
  if (!tx) return { found: false, hash, chain: chain.id, note: `Not found on ${chain.name}. Wrong chain?` };
  const block = tx.blockNumber ? await rpc(chain, "eth_getBlockByNumber", [tx.blockNumber, false]).catch(() => null) : null;
  const sym = chain.native.symbol;
  const fee = rc ? BigInt(rc.gasUsed) * BigInt(rc.effectiveGasPrice || tx.gasPrice || 0) : null;
  const transfers = (rc?.logs || []).filter((l) => l.topics?.[0] === TRANSFER_TOPIC && l.topics.length === 3).slice(0, 20).map((l) => ({
    token: l.address, from: "0x" + l.topics[1].slice(26), to: "0x" + l.topics[2].slice(26), raw: BigInt(l.data === "0x" ? 0 : l.data).toString(),
  }));
  const sel = tx.input?.slice(0, 10);
  return {
    found: true, hash, chain: chain.id, status: !rc ? "pending" : rc.status === undefined || rc.status === null ? "success (pre-Byzantium receipt)" : rc.status === "0x1" ? "success" : "failed",
    from: tx.from, to: tx.to, contractCreated: rc?.contractAddress || null,
    value: `${formatUnits(BigInt(tx.value), chain.native.decimals)} ${sym}`,
    method: tx.input && tx.input !== "0x" ? METHODS[sel] || sel : "native transfer",
    blockNumber: hexNum(tx.blockNumber), timestamp: block ? new Date(hexNum(block.timestamp) * 1000).toISOString() : null,
    gasUsed: rc ? hexNum(rc.gasUsed) : null, fee: fee != null ? `${formatUnits(fee, chain.native.decimals)} ${sym}` : null,
    nonce: hexNum(tx.nonce), logs: rc?.logs?.length ?? 0, tokenTransfers: transfers, explorer: explorerTx(chain, hash),
  };
}

// ── Alchemy enhanced APIs ─────────────────────────────────────────────────
function alchemy(chain, keys) {
  const k = keys.get("alchemy");
  return k && chain.alchemy ? { key: k, url: alchemyUrl(chain, k) } : null;
}

export async function alchemyTokenBalances(chain, owner, keys = getKeys(), limit = 40) {
  const a = alchemy(chain, keys);
  if (!a) return null;
  const r = await rpc(chain, "alchemy_getTokenBalances", [owner, "erc20"], { keys });
  const nonzero = (r?.tokenBalances || []).filter((t) => t.tokenBalance && BigInt(t.tokenBalance) > 0n).slice(0, limit);
  const metas = await Promise.all(nonzero.map((t) => rpc(chain, "alchemy_getTokenMetadata", [t.contractAddress], { keys }).catch(() => null)));
  return nonzero.map((t, i) => {
    const m = metas[i] || {};
    const dec = m.decimals ?? 18;
    return { address: t.contractAddress, symbol: m.symbol || "?", name: m.name || "", decimals: dec, amount: formatUnits(BigInt(t.tokenBalance), dec) };
  });
}

export async function assetTransfers(chain, address, keys = getKeys(), max = 20) {
  const a = alchemy(chain, keys);
  if (!a) return null;
  const base = { fromBlock: "0x0", toBlock: "latest", category: ["external", "erc20", "erc721", "erc1155"], withMetadata: true, maxCount: "0x" + max.toString(16), order: "desc" };
  const [out, inc] = await Promise.all([
    rpc(chain, "alchemy_getAssetTransfers", [{ ...base, fromAddress: address }], { keys }).catch(() => ({ transfers: [] })),
    rpc(chain, "alchemy_getAssetTransfers", [{ ...base, toAddress: address }], { keys }).catch(() => ({ transfers: [] })),
  ]);
  const all = [...(out.transfers || []).map((t) => ({ ...t, dir: "out" })), ...(inc.transfers || []).map((t) => ({ ...t, dir: "in" }))];
  all.sort((x, y) => (y.metadata?.blockTimestamp || "").localeCompare(x.metadata?.blockTimestamp || ""));
  return all.slice(0, max).map((t) => ({ dir: t.dir, hash: t.hash, from: t.from, to: t.to, value: t.value, asset: t.asset, category: t.category, time: t.metadata?.blockTimestamp }));
}

export async function nftsForOwner(chain, owner, keys = getKeys()) {
  const a = alchemy(chain, keys);
  if (!a) throw new Error("NFT lookups need an Alchemy key (lumen keys set alchemy <key>).");
  const j = await fetchJson(`https://${chain.alchemy}.g.alchemy.com/nft/v3/${a.key}/getNFTsForOwner?owner=${owner}&withMetadata=true&pageSize=50&excludeFilters[]=SPAM`, {}, 15000);
  return { total: j.totalCount, nfts: (j.ownedNfts || []).map((n) => ({ contract: n.contract?.address, collection: n.contract?.name || n.collection?.name, tokenId: n.tokenId, name: n.name, type: n.tokenType, image: n.image?.cachedUrl || n.image?.originalUrl || null, floorEth: n.contract?.openSeaMetadata?.floorPrice ?? null })) };
}

// ── Etherscan V2 ───────────────────────────────────────────────────────────
export async function etherscan(chain, params, keys = getKeys()) {
  const k = keys.get("etherscan");
  if (!k) throw new Error("This needs an Etherscan V2 key (lumen keys set etherscan <key>); one key covers 60+ chains.");
  if (!chain.chainId) throw new Error(`Etherscan V2 covers EVM chains only (${chain.name} is ${chain.family}).`);
  const qs = new URLSearchParams({ chainid: String(chain.chainId), ...params, apikey: k });
  const j = await fetchJson(`https://api.etherscan.io/v2/api?${qs}`, {}, 15000);
  if (j.status === "0" && !/No transactions/i.test(j.message || "") && !Array.isArray(j.result)) throw new Error(`Etherscan: ${j.result || j.message}`);
  return j.result;
}

export async function txList(chain, address, keys = getKeys(), max = 20) {
  const r = await etherscan(chain, { module: "account", action: "txlist", address, startblock: "0", endblock: "99999999", page: "1", offset: String(max), sort: "desc" }, keys);
  return (Array.isArray(r) ? r : []).map((t) => ({ hash: t.hash, from: t.from, to: t.to, value: `${formatUnits(BigInt(t.value || 0), chain.native.decimals)} ${chain.native.symbol}`, method: t.functionName?.split("(")[0] || (t.input === "0x" ? "transfer" : t.methodId), time: new Date(Number(t.timeStamp) * 1000).toISOString(), ok: t.isError === "0" }));
}
