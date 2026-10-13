// Swap quotes only (nothing is signed here): 0x for EVM, Jupiter for Solana, LI.FI for cross-chain.
import { getChain } from "./registry.js";
import { knownToken, NATIVE_EVM, SOL_MINT, KNOWN_TOKENS, isEvmAddress, isSolanaAddress } from "./tokens.js";
import { erc20Info } from "./evm.js";
import { mintInfo } from "./solana.js";
import { getKeys } from "../core/keys.js";
import { fetchJson, parseUnits, formatUnits } from "../core/util.js";

/** Resolve "ETH" / "USDC" / an address on a chain into { address, decimals, symbol }. */
export async function resolveToken(chain, q) {
  const s = String(q || "").trim();
  if (chain.family === "solana") {
    if (/^sol$/i.test(s)) return { address: SOL_MINT, decimals: 9, symbol: "SOL" };
    const k = KNOWN_TOKENS.solana[s.toUpperCase()];
    if (k) return { address: k.address, decimals: k.decimals, symbol: s.toUpperCase() };
    if (isSolanaAddress(s)) { const m = await mintInfo(chain, s); return { address: s, decimals: m?.decimals ?? 6, symbol: s.slice(0, 4) + "…" }; }
    throw new Error(`Unknown Solana token "${s}". Use a mint address.`);
  }
  if (chain.family !== "evm") throw new Error(`Swap quotes support EVM chains and Solana (not ${chain.family}).`);
  if (s.toUpperCase() === chain.native.symbol.toUpperCase() || s.toLowerCase() === NATIVE_EVM.toLowerCase()) return { address: NATIVE_EVM, decimals: chain.native.decimals, symbol: chain.native.symbol };
  const k = knownToken(chain.id, s);
  if (k) return { address: k.address, decimals: k.decimals, symbol: s.toUpperCase() };
  if (isEvmAddress(s)) { const i = await erc20Info(chain, s); if (!i.erc20) throw new Error(`${s} is not an ERC-20 token on ${chain.name}.`); return { address: s, decimals: i.decimals, symbol: i.symbol || "?" }; }
  throw new Error(`Unknown token "${s}" on ${chain.name}. Use the contract address.`);
}

export async function zeroExQuote(chain, sell, buy, amount, taker, keys = getKeys()) {
  const k = keys.get("zerox");
  if (!k) throw new Error("0x quotes need a 0x API key (lumen keys set zerox <key>). LI.FI works keyless: use provider lifi.");
  const s = await resolveToken(chain, sell), b = await resolveToken(chain, buy);
  const qs = new URLSearchParams({ chainId: String(chain.chainId), sellToken: s.address, buyToken: b.address, sellAmount: parseUnits(amount, s.decimals).toString(), ...(taker ? { taker } : {}) });
  const j = await fetchJson(`https://api.0x.org/swap/allowance-holder/${taker ? "quote" : "price"}?${qs}`, { headers: { "0x-api-key": k, "0x-version": "v2" } }, 15000);
  return {
    provider: "0x", chain: chain.id, sell: `${amount} ${s.symbol}`, buy: `${formatUnits(BigInt(j.buyAmount || 0), b.decimals)} ${b.symbol}`,
    minBuy: j.minBuyAmount ? `${formatUnits(BigInt(j.minBuyAmount), b.decimals)} ${b.symbol}` : undefined,
    route: (j.route?.fills || []).map((f) => f.source).filter(Boolean).join(" → ") || undefined,
    gas: j.gas || j.transaction?.gas, liquidityAvailable: j.liquidityAvailable, issues: j.issues?.allowance ? "needs token approval" : undefined,
    transaction: j.transaction, raw: { sellToken: s.address, buyToken: b.address },
  };
}

export async function jupiterQuote(sell, buy, amount, taker, keys = getKeys()) {
  const chain = getChain("solana");
  const s = await resolveToken(chain, sell), b = await resolveToken(chain, buy);
  const k = keys.get("jupiter");
  const qs = new URLSearchParams({ inputMint: s.address, outputMint: b.address, amount: parseUnits(amount, s.decimals).toString(), ...(taker ? { taker } : {}) });
  const j = await fetchJson(`https://api.jup.ag/swap/v2/order?${qs}`, { headers: k ? { "x-api-key": k } : {} }, 15000);
  return {
    provider: "jupiter", chain: "solana", sell: `${amount} ${s.symbol}`, buy: `${formatUnits(BigInt(j.outAmount || 0), b.decimals)} ${b.symbol}`,
    priceImpactPct: j.priceImpactPct ?? j.priceImpact, route: (j.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean).join(" → ") || j.router,
    requestId: j.requestId, transaction: j.transaction || null, raw: { inputMint: s.address, outputMint: b.address },
  };
}

export async function lifiQuote(fromChainQ, toChainQ, sell, buy, amount, fromAddress, keys = getKeys()) {
  const from = getChain(fromChainQ), to = getChain(toChainQ || fromChainQ);
  if (!from || !to) throw new Error("Unknown chain for LI.FI quote.");
  const s = await resolveToken(from, sell), b = await resolveToken(to, buy);
  const lifiId = (c) => (c.family === "solana" ? "SOL" : String(c.chainId));
  const addr = fromAddress || (from.family === "solana" ? "HR7Q5Ytqf6WPdrqvJ8wE8y2Uq9ZqzHkJp7o7oYvG5Q9u" : "0x000000000000000000000000000000000000dEaD");
  const qs = new URLSearchParams({ fromChain: lifiId(from), toChain: lifiId(to), fromToken: s.address === NATIVE_EVM ? "0x0000000000000000000000000000000000000000" : s.address, toToken: b.address === NATIVE_EVM ? "0x0000000000000000000000000000000000000000" : b.address, fromAmount: parseUnits(amount, s.decimals).toString(), fromAddress: addr, slippage: "0.005" });
  const k = keys.get("lifi");
  const j = await fetchJson(`https://li.quest/v1/quote?${qs}`, { headers: k ? { "x-lifi-api-key": k } : {} }, 20000);
  const est = j.estimate || {};
  return {
    provider: "lifi", fromChain: from.id, toChain: to.id, sell: `${amount} ${s.symbol}`,
    buy: `${formatUnits(BigInt(est.toAmount || 0), b.decimals)} ${b.symbol}`, minBuy: est.toAmountMin ? `${formatUnits(BigInt(est.toAmountMin), b.decimals)} ${b.symbol}` : undefined,
    tool: j.toolDetails?.name || j.tool, durationSec: est.executionDuration, feesUsd: (est.feeCosts || []).reduce((a, f) => a + Number(f.amountUSD || 0), 0), gasUsd: (est.gasCosts || []).reduce((a, f) => a + Number(f.amountUSD || 0), 0),
    transactionRequest: fromAddress ? j.transactionRequest : undefined, note: fromAddress ? undefined : "Quote uses a placeholder sender; pass from_address for an executable route.",
  };
}

export async function swapQuote({ chain: chainQ = "ethereum", toChain, sell, buy, amount, amountIsRaw = false, taker, provider } = {}, keys = getKeys()) {
  const chain = getChain(chainQ);
  if (!chain) throw new Error(`Unknown chain ${chainQ}`);
  if (amountIsRaw) amount = formatUnits(BigInt(amount), (await resolveToken(chain, sell)).decimals);
  if (toChain && getChain(toChain)?.id !== chain.id) return lifiQuote(chain.id, toChain, sell, buy, amount, taker, keys);
  if (provider === "lifi") return lifiQuote(chain.id, chain.id, sell, buy, amount, taker, keys);
  if (chain.family === "solana") return jupiterQuote(sell, buy, amount, taker, keys);
  if (keys.get("zerox") && provider !== "lifi") return zeroExQuote(chain, sell, buy, amount, taker, keys);
  return lifiQuote(chain.id, chain.id, sell, buy, amount, taker, keys);
}
