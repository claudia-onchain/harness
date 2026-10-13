// Chain tools: read-only by default. Money-moving tools (send_native, send_token, execute_swap) route through
// chains/wallet.js which enforces key + caps + simulation + human approval.
import { obj, str, num, bool } from "./registry.js";
import { CHAINS, mainnets } from "../../chains/registry.js";
import { resolveChain, rpc, READ_METHODS, rpcSource } from "../../chains/rpc.js";
import { chainStatus, gas, txLookup, erc20Info, assetTransfers, txList, nftsForOwner, etherscan } from "../../chains/evm.js";
import { getBalance } from "../../chains/balances.js";
import { getPrice } from "../../chains/prices.js";
import { feedDirectory, findFeed, readFeed } from "../../chains/chainlink.js";
import { swapQuote } from "../../chains/swaps.js";
import { defiTvl, defiYields } from "../../chains/defi.js";
import { claudiaCoin } from "../../chains/claudia.js";
import { signatures, mintInfo, solTx } from "../../chains/solana.js";
import { send, executeSwap, sendTx } from "../../chains/wallet.js";
import { simulateTx, readContract, resolveAddress } from "../../chains/contracts.js";
import { lifiQuote } from "../../chains/swaps.js";
import { isTxHash, isEvmAddress } from "../../chains/tokens.js";
import { wrap } from "../../core/untrusted.js";
import { fmtUsd, fmtAmount } from "../../core/util.js";

const chainArg = str("Chain id or alias (ethereum, base, arbitrum, solana, bitcoin, …). Defaults to the active chain.");
const ch = (a, ctx) => resolveChain(a.chain || ctx.chain);
const j = (x) => JSON.stringify(x, (k, v) => (typeof v === "bigint" ? v.toString() : v), 1).slice(0, 30000);

export function chainTools() {
  return [
    {
      name: "chain_list", group: "Chains", label: "List chains", safe: true,
      description: "List supported chains with id, family, native token and whether Chainlink feeds exist.",
      parameters: obj({ testnets: bool("Include testnets"), family: str("evm | solana | bitcoin | sui | aptos | tron | starknet") }),
      run(a, ctx) {
        const rows = (a.testnets ? CHAINS : mainnets()).filter((c) => !a.family || c.family === a.family);
        return { text: rows.map((c) => `${c.id} · ${c.name} · ${c.family}${c.chainId ? ` #${c.chainId}` : ""} · ${c.native.symbol}${c.chainlink ? " · chainlink" : ""} · rpc:${rpcSource(c, ctx.keys)}`).join("\n"), summary: `${rows.length} chains` };
      },
    },
    {
      name: "chain_status", group: "Chains", label: "Chain status", safe: true,
      description: "Latest block, gas price and RPC latency/source for a chain.",
      parameters: obj({ chain: chainArg }),
      async run(a, ctx) { const s = await chainStatus(ch(a, ctx), ctx.keys); return { text: j(s), summary: `block ${s.blockNumber}${s.gasPriceGwei != null ? ` · ${s.gasPriceGwei.toFixed(3)} gwei` : ""} · ${s.latencyMs}ms ${s.rpcSource}`, data: s }; },
    },
    {
      name: "rpc_call", group: "Chains", label: "Raw RPC", safe: true, approval: "custom",
      description: "Raw JSON-RPC call. Read methods run directly; anything else (e.g. sending raw transactions) needs the user's approval.",
      parameters: obj({ chain: chainArg, method: str("JSON-RPC method, e.g. eth_getLogs"), params: { type: "array", description: "Params array", items: {} } }, ["method"]),
      async run(a, ctx) {
        const c = ch(a, ctx);
        if (!READ_METHODS.test(a.method)) {
          const ans = await ctx.approvals.request({ kind: "tx", title: `Raw RPC ${a.method} on ${c.name}`, detail: j(a.params || []), confirmText: c.testnet ? undefined : "send", sessionId: ctx.sessionId });
          if (!ans.approve) return { ok: false, text: `Not run: ${a.method} is not a read method and was not approved.`, summary: "not approved" };
        }
        const r = await rpc(c, a.method, a.params || [], { keys: ctx.keys });
        return { text: wrap("chain", j(r), { from: `${c.id} ${a.method}` }), summary: `${a.method} ok` };
      },
    },
    {
      name: "get_balance", group: "Chains", label: "Balance", safe: true,
      description: "Native + token balances (with USD where priced) for an address on a chain.",
      parameters: obj({ address: str("Wallet address"), chain: chainArg }, ["address"]),
      async run(a, ctx) {
        const b = await getBalance(a.address, ch(a, ctx), ctx.keys);
        const lines = [`${b.native.amount} ${b.native.symbol}${b.native.usd != null ? ` (${fmtUsd(b.native.usd)})` : ""}`, ...b.tokens.slice(0, 40).map((t) => `${fmtAmount(t.amount)} ${t.symbol} ${t.address}${t.usd != null ? ` (${fmtUsd(t.usd)})` : ""}`)];
        return { text: wrap("chain", `${b.chain} ${b.address}\n${lines.join("\n")}\nTotal ≈ ${fmtUsd(b.totalUsd)}${b.notes ? `\nNotes: ${b.notes.join("; ")}` : ""}`, { from: "token metadata" }), summary: `${fmtAmount(b.native.amount)} ${b.native.symbol} + ${b.tokens.length} tokens ≈ ${fmtUsd(b.totalUsd)}`, data: b };
      },
    },
    {
      name: "get_price", aliases: { address: "token", mint: "token" }, group: "Chains", label: "Price", safe: true,
      description: "USD price for a symbol (ETH, BTC, SOL, …) or token address. Chainlink on-chain first, then Alchemy, DefiLlama, CoinGecko, Jupiter.",
      parameters: obj({ symbol: str("Symbol like ETH"), token: str("Token address or Solana mint"), chain: chainArg }),
      async run(a, ctx) { const p = await getPrice({ symbol: a.symbol, token: a.token, chain: a.chain || ctx.chain }, ctx.keys); return { text: j(p), summary: `${p.symbol} ${fmtUsd(p.usd)} · ${p.source}${p.stale ? " (stale)" : ""}`, data: p }; },
    },
    {
      name: "token_info", aliases: { address: "token", mint: "token" }, group: "Chains", label: "Token info", safe: true,
      description: "Token metadata: name, symbol, decimals, supply (ERC-20) or mint info (Solana).",
      parameters: obj({ token: str("Token address or mint"), chain: chainArg }, ["token"]),
      async run(a, ctx) {
        const c = ch(a, ctx);
        const info = c.family === "solana" ? await mintInfo(c, a.token) : await erc20Info(c, a.token);
        let price = null;
        try { price = await getPrice({ token: a.token, chain: c.id }, ctx.keys); } catch { /* unpriced */ }
        return { text: wrap("chain", j({ ...info, priceUsd: price?.usd, priceSource: price?.source }), { from: "token contract" }), summary: `${info?.symbol || info?.mint || a.token}${price ? ` · ${fmtUsd(price.usd)}` : ""}` };
      },
    },
    {
      name: "tx_lookup", aliases: { signature: "hash", sig: "hash", tx: "hash" }, group: "Chains", label: "Transaction", safe: true,
      description: "Look up a transaction: status, from/to, value, fee, decoded method and token transfers, explorer link.",
      parameters: obj({ hash: str("Tx hash or Solana signature"), chain: chainArg }, ["hash"]),
      async run(a, ctx) {
        const c = ch(a, ctx);
        if (c.family === "solana") { const t = await solTx(c, a.hash); return { text: wrap("chain", j({ slot: t?.slot, err: t?.meta?.err, fee: t?.meta?.fee, logs: t?.meta?.logMessages?.slice(0, 20) })), summary: t ? (t.meta?.err ? "failed" : "success") : "not found" }; }
        if (c.family !== "evm" || !isTxHash(a.hash)) throw new Error("tx_lookup supports EVM tx hashes and Solana signatures.");
        const t = await txLookup(c, a.hash);
        return { text: wrap("chain", j(t)), summary: t.found ? `${t.status} · ${t.method} · ${t.value}` : "not found", data: t };
      },
    },
    {
      name: "address_activity", aliases: { owner: "address", count: "limit" }, group: "Chains", label: "Address activity", safe: true,
      description: "Recent transfers/transactions for an address (Alchemy transfers, Etherscan V2 txlist, or Solana signatures).",
      parameters: obj({ address: str("Address"), chain: chainArg, limit: num("Max rows (default 20)") }, ["address"]),
      async run(a, ctx) {
        const c = ch(a, ctx), n = Math.min(50, Number(a.limit) || 20);
        let rows;
        if (c.family === "solana") rows = (await signatures(c, a.address, n)).map((s) => ({ sig: s.signature, slot: s.slot, time: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null, err: !!s.err, memo: s.memo }));
        else if (c.family === "evm") rows = (await assetTransfers(c, a.address, ctx.keys, n)) || (ctx.keys.has("etherscan") ? await txList(c, a.address, ctx.keys, n) : null);
        if (!rows) throw new Error("Address history needs an Alchemy key or an Etherscan V2 key on EVM chains.");
        return { text: wrap("chain", j(rows), { from: "chain history (memos and token names are untrusted)" }), summary: `${rows.length} rows` };
      },
    },
    {
      name: "nfts", aliases: { address: "owner" }, group: "Chains", label: "NFTs", safe: true,
      description: "NFTs owned by an address (Alchemy NFT API v3, spam filtered).",
      parameters: obj({ owner: str("Owner address"), chain: chainArg }, ["owner"]),
      async run(a, ctx) { const r = await nftsForOwner(ch(a, ctx), a.owner, ctx.keys); return { text: wrap("chain", j(r), { from: "NFT metadata" }), summary: `${r.total} NFTs` }; },
    },
    {
      name: "contract_abi", group: "Chains", label: "Contract ABI", safe: true,
      description: "Verified ABI (and optionally source) for a contract via Etherscan V2.",
      parameters: obj({ address: str("Contract address"), chain: chainArg, source: bool("Include source code") }, ["address"]),
      async run(a, ctx) {
        const c = ch(a, ctx);
        if (a.source) {
          const r = await etherscan(c, { module: "contract", action: "getsourcecode", address: a.address }, ctx.keys);
          const s = r?.[0] || {};
          return { text: wrap("chain", `Contract ${s.ContractName} · compiler ${s.CompilerVersion} · proxy ${s.Proxy === "1" ? s.Implementation : "no"}\n${String(s.SourceCode || "").slice(0, 25000)}`, { from: "verified source" }), summary: `${s.ContractName || "?"} source` };
        }
        const abi = await etherscan(c, { module: "contract", action: "getabi", address: a.address }, ctx.keys);
        let fns = [];
        try { fns = JSON.parse(abi).filter((x) => x.type === "function").map((f) => `${f.name}(${f.inputs.map((i) => i.type).join(",")}) ${f.stateMutability}`); } catch { /* not verified */ }
        return { text: wrap("chain", fns.length ? fns.join("\n") : String(abi).slice(0, 2000)), summary: `${fns.length} functions` };
      },
    },
    {
      name: "gas", group: "Chains", label: "Gas", safe: true,
      description: "Current gas price, base fee and priority fee on an EVM chain.",
      parameters: obj({ chain: chainArg }),
      async run(a, ctx) { const g = await gas(ch(a, ctx)); return { text: j(g), summary: `${g.gasPriceGwei?.toFixed(4)} gwei` }; },
    },
    {
      name: "chainlink_feeds", aliases: { q: "filter", pair: "read" }, group: "Chains", label: "Chainlink feeds", safe: true,
      description: "List Chainlink price feeds on a chain (filter by text), or read one feed (pair like ETH/USD or an address).",
      parameters: obj({ chain: chainArg, filter: str("Text filter, e.g. BTC"), read: str("Pair (ETH/USD) or proxy address to read now") }),
      async run(a, ctx) {
        const c = ch(a, ctx);
        if (a.read) {
          let addr = a.read, hb = null, dec = null;
          if (!isEvmAddress(a.read)) { const [b, q] = a.read.split("/"); const f = await findFeed(c, b, q || "USD"); if (!f) throw new Error(`No ${a.read} feed on ${c.name}.`); addr = f.address; hb = f.heartbeat; dec = f.decimals; }
          const r = await readFeed(c, addr, { heartbeat: hb, decimals: dec, withDescription: true });
          return { text: j({ address: addr, ...r }), summary: `${r.description || a.read} = ${r.value}${r.stale ? " (stale)" : ""}` };
        }
        const feeds = await feedDirectory(c);
        const rows = feeds.filter((f) => !a.filter || `${f.name} ${f.path}`.toLowerCase().includes(String(a.filter).toLowerCase())).slice(0, 80);
        return { text: rows.map((f) => `${f.name} · ${f.secondaryProxyAddress || f.proxyAddress} · ${f.feedCategory || ""} · heartbeat ${f.heartbeat}s`).join("\n") || `No Chainlink feeds listed for ${c.name}.`, summary: `${rows.length} of ${feeds.length} feeds` };
      },
    },
    {
      name: "swap_quote", aliases: { sellToken: "sell", buyToken: "buy", sellAmount: "amount", toChain: "to_chain", from_address: "taker", fromAddress: "taker" }, normalize: (a) => ({ ...a, amountIsRaw: a.amountIsRaw ?? (a.amount !== undefined && /^\d{7,}$/.test(String(a.amount))) }), group: "Chains", label: "Swap quote", safe: true,
      description: "Quote a swap (nothing is signed): 0x on EVM (with key), Jupiter on Solana, LI.FI for cross-chain or keyless EVM.",
      parameters: obj({ chain: chainArg, to_chain: str("Destination chain for bridges"), sell: str("Token to sell (symbol or address); alias sellToken"), buy: str("Token to buy; alias buyToken"), amount: str("Amount of sell token in human units (alias sellAmount; a long integer is read as raw base units)"), taker: str("Optional wallet address"), provider: str("0x | jupiter | lifi") }, ["sell", "buy", "amount"]),
      async run(a, ctx) { const q = await swapQuote({ chain: a.chain || ctx.chain, toChain: a.to_chain, sell: a.sell, buy: a.buy, amount: a.amount, amountIsRaw: a.amountIsRaw, taker: a.taker, provider: a.provider }, ctx.keys); const { transaction, transactionRequest, ...shown } = q; return { text: j(shown), summary: `${q.sell} → ${q.buy} via ${q.provider}` }; },
    },
    {
      name: "defi_tvl", group: "Chains", label: "DeFi TVL", safe: true,
      description: "DefiLlama TVL: a protocol (by name/slug), protocols on a chain, or top chains.",
      parameters: obj({ protocol: str("Protocol name or slug"), chain: str("DefiLlama chain name, e.g. Ethereum, Base") }),
      async run(a) { const r = await defiTvl(a); return { text: j(r), summary: r.name ? `${r.name} ${fmtUsd(r.tvlUsd, { compact: true })}` : "tvl" }; },
    },
    {
      name: "defi_yields", group: "Chains", label: "DeFi yields", safe: true,
      description: "DefiLlama yield pools filtered by chain/project/symbol, sorted by APY (min TVL $1M by default).",
      parameters: obj({ chain: str("DefiLlama chain name, e.g. Ethereum"), project: str("Project, e.g. aave-v3"), symbol: str("Symbol, e.g. USDC"), min_tvl_usd: num("Minimum TVL") }),
      async run(a) { const r = await defiYields({ chain: a.chain, project: a.project, symbol: a.symbol, minTvlUsd: a.min_tvl_usd ?? 1_000_000 }); return { text: j(r), summary: `${r.length} pools` }; },
    },
    {
      name: "claudia_coin", aliases: { q: "query", search: "query", mint: "token", address: "token" }, normalize: (a) => ({ ...a, action: a.action || (a.trending ? "trending" : a.hot ? "hot" : a.query && !a.token ? "search" : "token"), chain: /^(sol|solana)$/i.test(a.chain || "") ? "sol" : /^(hood|robinhood)$/i.test(a.chain || "") ? "hood" : undefined }), group: "Chains", label: "Claudia coins", safe: true,
      description: "Claudia coin data for Solana and Robinhood Chain tokens (@useclaudia/sdk public reads): token insights, trending, hot or search.",
      parameters: obj({ action: { type: "string", enum: ["token", "trending", "hot", "search"] }, token: str("Mint, 0x address, sol:<mint> or hood:0x…"), query: str("Search text"), chain: str("sol | hood") }),
      async run(a) { const r = await claudiaCoin(a); return { text: wrap("provider", j(r), { from: "Claudia insights (coin names are untrusted)" }), summary: `claudia ${a.action || "token"}` }; },
    },
    {
      name: "simulate_tx", aliases: {}, normalize: (a) => (a.tx && typeof a.tx === "object" ? { ...a.tx, ...a, tx: undefined, value: a.value ?? a.tx.value, data: a.data ?? a.tx.data, to: a.to ?? a.tx.to, from: a.from ?? a.tx.from } : a), group: "Chains", label: "Simulate tx", safe: true,
      description: "Simulate a transaction without sending: EVM eth_call + estimateGas (+ logs via eth_simulateV1 when supported) returning success or the revert reason; Solana simulateTransaction for a base64 tx.",
      parameters: obj({ chain: chainArg, from: str("Sender (EVM)"), to: str("Target contract/recipient (EVM)"), data: str("Calldata hex"), value: str("Value in wei (decimal or 0x hex)"), tx: str("Base64 transaction (Solana)") }),
      async run(a, ctx) { const r = await simulateTx({ ...a, chain: a.chain || ctx.chain }, ctx.keys); return { ok: r.success, text: j(r), summary: r.success ? `ok${r.gas ? ` · gas ${r.gas}` : ""}${r.logs ? ` · ${r.logs.length} logs` : ""}` : `reverts: ${r.revert || JSON.stringify(r.error)}`.slice(0, 120) }; },
    },
    {
      name: "read_contract", aliases: { fn: "function", method: "function", functionName: "function_name", params: "args" }, normalize: (a) => { if (a.function && !a.signature && !a.function_name) { if (String(a.function).includes("(")) a.signature = a.function; else a.function_name = a.function; } delete a.function; return a; }, group: "Chains", label: "Read contract", safe: true,
      description: 'Call a view function. Give a signature like "balanceOf(address) returns (uint256)" or an ABI; without either the verified ABI is fetched from Etherscan V2 (then pass function_name).',
      parameters: obj({ chain: chainArg, address: str("Contract address"), signature: str("Function signature with returns"), abi: str("ABI JSON (optional)"), function_name: str("Function name when using an ABI"), args: { type: "array", items: {}, description: "Arguments" } }, ["address"]),
      async run(a, ctx) { const r = await readContract({ chain: a.chain || ctx.chain, address: a.address, signature: a.signature, abi: a.abi, functionName: a.function_name, args: a.args || [] }, ctx.keys); return { text: wrap("chain", j(r)), summary: `${r.function} → ${j(r.result).slice(0, 80)}` }; },
    },
    {
      name: "resolve_address", group: "Chains", label: "Resolve name", safe: true,
      description: "Resolve ENS names (vitalik.eth, Basenames via CCIP) to addresses, reverse-resolve an address (forward-verified), or resolve .sol names (SNS).",
      parameters: obj({ name: str("ENS/.sol name or an address for reverse lookup") }, ["name"]),
      async run(a, ctx) { const r = await resolveAddress(a.name, ctx.keys); return { text: j(r), summary: `${r.name || a.name} → ${r.address || "not found"}` }; },
    },
    {
      name: "bridge_quote", aliases: { from_chain: "fromChain", to_chain: "toChain", from_token: "fromToken", to_token: "toToken", sellToken: "fromToken", buyToken: "toToken", sellAmount: "amount", from_address: "fromAddress", taker: "fromAddress" }, group: "Chains", label: "Bridge quote", safe: true,
      description: "Cross-chain quote via LI.FI (quotes only, nothing is signed).",
      parameters: obj({ fromChain: str("Source chain"), toChain: str("Destination chain"), fromToken: str("Token to send (symbol/address)"), toToken: str("Token to receive"), amount: str("Amount in source token units"), fromAddress: str("Sender wallet (for an executable route)") }, ["fromChain", "toChain", "fromToken", "toToken", "amount"]),
      async run(a, ctx) { const q = await lifiQuote(a.fromChain, a.toChain, a.fromToken, a.toToken, a.amount, a.fromAddress, ctx.keys); const { transactionRequest, ...shown } = q; return { text: j(shown), summary: `${q.sell} ${q.fromChain} → ${q.buy} ${q.toChain} via ${q.tool}` }; },
    },
    {
      name: "send_tx", group: "Wallet", label: "Send transaction", approval: "custom",
      description: "Send a generic EVM transaction (contract call) from the configured wallet. Same gate as send_native: simulation, caps on native value, human approval (mainnet: type \"send\").",
      parameters: obj({ chain: chainArg, to: str("Contract address"), data: str("Calldata hex"), value: str("Native value in ether units, e.g. 0.01"), gasLimit: str("Optional gas limit") }, ["to"]),
      async run(a, ctx) { const r = await sendTx({ ...a, chain: a.chain || ctx.chain }, ctx); return { ok: r.sent, text: j(r), summary: r.sent ? `sent · ${r.hash?.slice(0, 12)}…` : `not sent: ${r.reason}`.slice(0, 120) }; },
    },
    {
      name: "send_native", aliases: { recipient: "to", value: "amount" }, group: "Wallet", label: "Send native", approval: "custom",
      description: "Send the chain's native token from the configured wallet. Simulates, checks caps and asks the human (mainnet: they type \"send\").",
      parameters: obj({ chain: chainArg, to: str("Recipient address"), amount: str("Amount in native units, e.g. 0.01") }, ["to", "amount"]),
      async run(a, ctx) { const r = await send({ chain: a.chain || ctx.chain, to: a.to, amount: a.amount }, ctx); return { ok: r.sent, text: j(r), summary: r.sent ? `sent · ${r.hash?.slice(0, 12)}…` : `not sent: ${r.reason}`.slice(0, 120) }; },
    },
    {
      name: "send_token", aliases: { recipient: "to", tokenAddress: "token", address: "token" }, group: "Wallet", label: "Send token", approval: "custom",
      description: "Send an ERC-20 token (EVM) from the configured wallet. Simulates, checks caps and asks the human.",
      parameters: obj({ chain: chainArg, token: str("Token symbol or address"), to: str("Recipient"), amount: str("Amount in token units") }, ["token", "to", "amount"]),
      async run(a, ctx) { const r = await send({ chain: a.chain || ctx.chain, to: a.to, amount: a.amount, token: a.token }, ctx); return { ok: r.sent, text: j(r), summary: r.sent ? `sent · ${r.hash?.slice(0, 12)}…` : `not sent: ${r.reason}`.slice(0, 120) }; },
    },
    {
      name: "execute_swap", aliases: { sellToken: "sell", buyToken: "buy", sellAmount: "amount" }, group: "Wallet", label: "Execute swap", approval: "custom",
      description: "Execute a swap from the configured wallet (0x on EVM, Jupiter on Solana). Quotes, simulates, checks caps and asks the human.",
      parameters: obj({ chain: chainArg, sell: str("Token to sell"), buy: str("Token to buy"), amount: str("Sell amount") }, ["sell", "buy", "amount"]),
      async run(a, ctx) { const r = await executeSwap({ chain: a.chain || ctx.chain, sell: a.sell, buy: a.buy, amount: a.amount }, ctx); return { ok: r.sent, text: j(r), summary: r.sent ? `swapped · ${r.hash?.slice(0, 12)}…` : `not sent: ${r.reason}`.slice(0, 120) }; },
    },
  ];
}

