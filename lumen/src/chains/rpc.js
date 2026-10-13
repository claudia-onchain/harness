// RPC selection + failover with latency tracking.
//   EVM / Solana / Starknet: Alchemy when ALCHEMY_API_KEY is set, Helius for Solana when HELIUS_API_KEY is set,
//   then the registry's public RPCs ordered by recent health. Other families use their REST/JSON-RPC publicRpc.
import { alchemyUrl, getChain } from "./registry.js";
import { getKeys } from "../core/keys.js";

const ALCHEMY_FAMILIES = new Set(["evm", "solana", "starknet"]);
const health = new Map();
// Extra keyless endpoints tried after the registry's publicRpc (verified 2026-10-13; the registry's
// Starknet Blast endpoint is discontinued).
export const EXTRA_PUBLIC_RPC = { starknet: ["https://api.cartridge.gg/x/starknet/mainnet"] }; // url -> { ms, ok, fails, at }

export class RpcError extends Error {
  constructor(message, { code, data, url } = {}) { super(message); this.code = code; this.data = data; this.url = url; }
}

export function resolveChain(q, fallback = "ethereum") {
  const c = getChain(q ?? fallback);
  if (!c) throw new Error(`Unknown chain "${q}". Run \`lumen chains\` to see ids (aliases like eth, arb, op, sol, btc work).`);
  return c;
}

/** Ordered endpoints [{ url, source }] for a chain. */
export function endpoints(chain, keys = getKeys()) {
  const out = [];
  const ak = keys.get("alchemy");
  if (ak && chain.alchemy && ALCHEMY_FAMILIES.has(chain.family)) out.push({ url: alchemyUrl(chain, ak), source: "alchemy" });
  const hk = keys.get("helius");
  if (hk && chain.family === "solana") out.push({ url: chain.testnet ? `https://devnet.helius-rpc.com/?api-key=${hk}` : `https://mainnet.helius-rpc.com/?api-key=${hk}`, source: "helius" });
  const pub = [...(chain.publicRpc || []), ...(EXTRA_PUBLIC_RPC[chain.id] || [])].map((url, i) => ({ url, source: "public", i }));
  pub.sort((a, b) => score(a.url, a.i) - score(b.url, b.i));
  return [...out, ...pub.map(({ url, source }) => ({ url, source }))];
}

function score(url, i) {
  const h = health.get(url);
  if (!h) return i * 100;
  return (h.ok ? h.ms : 5000 + h.fails * 1000) + i * 10;
}

export function rpcSource(chain, keys = getKeys()) {
  return endpoints(chain, keys)[0]?.source || "public";
}

export const healthOf = (url) => health.get(url) || null;

const RETRYABLE = /rate|limit|timeout|temporar|unavailable|overload|capacity|too many|internal error|header not found|missing trie node|bad gateway/i;

/**
 * JSON-RPC call with failover. Returns { result, url, source, ms }.
 * JSON-RPC errors that are not transport-ish (e.g. "execution reverted") are thrown immediately.
 */
export async function rpcRaw(chain, method, params = [], { keys = getKeys(), timeoutMs = 10000, signal } = {}) {
  const list = endpoints(chain, keys);
  if (!list.length) throw new RpcError(`No RPC configured for ${chain.name}.`);
  let lastErr;
  for (const ep of list) {
    const t0 = Date.now();
    try {
      const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
      const res = await fetch(ep.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: sig });
      const ms = Date.now() - t0;
      if (!res.ok) {
        health.set(ep.url, { ms, ok: false, fails: (health.get(ep.url)?.fails || 0) + 1, at: Date.now() });
        lastErr = new RpcError(`${res.status} ${res.statusText}`, { url: ep.url, code: res.status });
        continue;
      }
      const j = await res.json();
      if (j.error) {
        const msg = String(j.error.message || JSON.stringify(j.error));
        if (RETRYABLE.test(msg) || j.error.code === -32005 || j.error.code === 429) {
          health.set(ep.url, { ms, ok: false, fails: (health.get(ep.url)?.fails || 0) + 1, at: Date.now() });
          lastErr = new RpcError(msg, { code: j.error.code, data: j.error.data, url: ep.url });
          continue;
        }
        health.set(ep.url, { ms, ok: true, fails: 0, at: Date.now() });
        throw Object.assign(new RpcError(msg, { code: j.error.code, data: j.error.data, url: ep.url }), { final: true });
      }
      health.set(ep.url, { ms, ok: true, fails: 0, at: Date.now() });
      return { result: j.result, url: ep.url, source: ep.source, ms };
    } catch (e) {
      if (e.final) throw e;
      if (signal?.aborted) throw e;
      health.set(ep.url, { ms: Date.now() - t0, ok: false, fails: (health.get(ep.url)?.fails || 0) + 1, at: Date.now() });
      lastErr = e;
    }
  }
  throw lastErr instanceof RpcError ? lastErr : new RpcError(`All RPCs failed for ${chain.name}: ${lastErr?.cause?.code || lastErr?.message}`);
}

export async function rpc(chain, method, params = [], opts = {}) {
  return (await rpcRaw(chain, method, params, opts)).result;
}

/** Read-only JSON-RPC methods the agent may call without approval. */
export const READ_METHODS = /^(eth_(blockNumber|chainId|gasPrice|maxPriorityFeePerGas|feeHistory|getBalance|getCode|getStorageAt|call|estimateGas|getTransactionCount|getTransactionByHash|getTransactionReceipt|getBlockBy(Number|Hash)|getLogs|getBlockReceipts|syncing|getProof)|net_version|web3_clientVersion|alchemy_get\w+|get\w+|starknet_(blockNumber|call|getClassAt|getNonce|getTransactionReceipt|getTransactionByHash|chainId|getBlockWithTxHashes|getStorageAt)|suix_get\w+|sui_get\w+|isBlockhashValid|simulateTransaction|minimumLedgerSlot)$/;
