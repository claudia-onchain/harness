// Balances for any chain: native + tokens with USD values where we can price them.
// Output matches the contract: { chain, address, native: {symbol, amount, usd?}, tokens: [{address, symbol, amount, usd?}] }
import { rpc } from "./rpc.js";
import { alchemyTokenBalances, erc20Balance } from "./evm.js";
import { solBalance, splTokens } from "./solana.js";
import { nativeBalance } from "./other.js";
import { getPrice, llamaPrices } from "./prices.js";
import { KNOWN_TOKENS, isEvmAddress } from "./tokens.js";
import { getKeys } from "../core/keys.js";
import { formatUnits } from "../core/util.js";

async function nativeUsd(chain, amount, keys) {
  if (!amount) return 0;
  try { const p = await getPrice({ symbol: chain.native.symbol, chain: chain.id }, keys); return amount * p.usd; } catch { return undefined; }
}

export async function getBalance(address, chain, keys = getKeys()) {
  const notes = [];
  let nativeAmount, tokens = [];
  if (chain.family === "evm") {
    if (!isEvmAddress(address)) throw new Error(`"${address}" is not an EVM address.`);
    const wei = await rpc(chain, "eth_getBalance", [address, "latest"], { keys });
    nativeAmount = Number(formatUnits(BigInt(wei), chain.native.decimals));
    try {
      const viaAlchemy = await alchemyTokenBalances(chain, address, keys);
      if (viaAlchemy) tokens = viaAlchemy;
      else {
        const known = Object.entries(KNOWN_TOKENS[chain.id] || {});
        const bals = await Promise.all(known.map(([, t]) => erc20Balance(chain, t.address, address).catch(() => 0n)));
        tokens = known.map(([sym, t], i) => ({ address: t.address, symbol: sym, decimals: t.decimals, amount: formatUnits(bals[i], t.decimals) })).filter((t) => Number(t.amount) > 0);
        notes.push(known.length ? "Token list limited to well-known tokens; add an Alchemy key for full ERC-20 balances." : "Add an Alchemy key to see ERC-20 balances on this chain.");
      }
    } catch (e) { notes.push(`token balances failed: ${e.message}`); }
    if (tokens.length && chain.llama) {
      const prices = await llamaPrices(tokens.map((t) => `${chain.llama}:${t.address}`));
      for (const t of tokens) { const p = prices[`${chain.llama}:${t.address}`]?.price; if (p) t.usd = Number(t.amount) * p; }
    }
  } else if (chain.family === "solana") {
    nativeAmount = await solBalance(chain, address);
    tokens = await splTokens(chain, address).catch((e) => { notes.push(`token accounts failed: ${e.message}`); return []; });
    if (tokens.length && !chain.testnet) {
      const prices = await llamaPrices(tokens.slice(0, 60).map((t) => `solana:${t.address}`));
      for (const t of tokens) { const p = prices[`solana:${t.address}`]; if (p?.price) { t.usd = Number(t.amount) * p.price; t.symbol = p.symbol; } }
    }
  } else {
    const r = await nativeBalance(chain, address);
    nativeAmount = r.amount;
    if (r.pending) notes.push(`${r.pending} ${chain.native.symbol} pending in mempool`);
  }
  const usd = chain.testnet ? undefined : await nativeUsd(chain, nativeAmount, keys);
  tokens.sort((a, b) => (b.usd || 0) - (a.usd || 0));
  const totalUsd = (usd || 0) + tokens.reduce((s, t) => s + (t.usd || 0), 0);
  return { chain: chain.id, address, native: { symbol: chain.native.symbol, amount: nativeAmount, ...(usd !== undefined ? { usd } : {}) }, tokens, totalUsd, ...(notes.length ? { notes } : {}) };
}
