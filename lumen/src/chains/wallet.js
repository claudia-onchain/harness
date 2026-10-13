// Money-moving actions. Every path goes: wallet key configured -> value + caps check -> simulation ->
// human approval (mainnet requires typing "send") -> sign -> broadcast -> receipt. The agent cannot approve.
import { getChain, explorerTx } from "./registry.js";
import { rpc, endpoints } from "./rpc.js";
import { getPrice } from "./prices.js";
import { resolveToken, zeroExQuote, jupiterQuote } from "./swaps.js";
import { NATIVE_EVM, isEvmAddress, isSolanaAddress } from "./tokens.js";
import { solanaKeypair, web3 } from "./solana.js";
import { getKeys } from "../core/keys.js";
import { getConfig } from "../core/config.js";
import { P } from "../core/paths.js";
import { readJson, writeJson } from "../core/fsx.js";
import { parseUnits, formatUnits, fmtUsd, fetchJson, sleep } from "../core/util.js";

const today = () => new Date().toISOString().slice(0, 10);
export function spentToday() { return readJson(P.state, {}).walletSpend?.[today()] || 0; }
function recordSpend(usd) {
  const s = readJson(P.state, {});
  s.walletSpend = { [today()]: (s.walletSpend?.[today()] || 0) + usd };
  writeJson(P.state, s);
}

export async function evmAccount(keys = getKeys()) {
  const k = keys.get("evmPrivateKey");
  if (!k) throw new Error("No EVM wallet key configured. Add one with `lumen keys set evmPrivateKey 0x…` (use a dedicated hot wallet with small funds).");
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeyToAccount(k.startsWith("0x") ? k : `0x${k}`);
}

async function solanaWallet(keys = getKeys()) {
  const k = keys.get("solanaSecret");
  if (!k) throw new Error("No Solana wallet configured. Add one with `lumen keys set solanaSecret <base58>`.");
  return solanaKeypair(k);
}

/** Cap check. Testnets skip caps (worthless tokens); mainnet needs a known USD value. */
function checkCaps(chain, usd) {
  if (chain.testnet) return { ok: true, note: "testnet: caps not applied" };
  const w = getConfig().wallet || {};
  if (!Number.isFinite(usd)) return { ok: false, reason: "Couldn't price this transfer, so it can't be checked against your caps. Nothing was sent." };
  if (usd > (w.maxUsdPerTx ?? 25)) return { ok: false, reason: `This is ${fmtUsd(usd)}, above your per-transaction cap of ${fmtUsd(w.maxUsdPerTx ?? 25)} (config wallet.maxUsdPerTx).` };
  const spent = spentToday();
  if (spent + usd > (w.maxUsdPerDay ?? 100)) return { ok: false, reason: `This would bring today's total to ${fmtUsd(spent + usd)}, above your daily cap of ${fmtUsd(w.maxUsdPerDay ?? 100)} (config wallet.maxUsdPerDay).` };
  return { ok: true, note: `caps ok: ${fmtUsd(usd)} of ${fmtUsd(w.maxUsdPerTx ?? 25)}/tx · ${fmtUsd(spent)} spent of ${fmtUsd(w.maxUsdPerDay ?? 100)} today` };
}

async function usdValue(chain, symbolOrToken, amount) {
  if (chain.testnet) return 0;
  try {
    const q = isEvmAddress(symbolOrToken) || (chain.family === "solana" && isSolanaAddress(symbolOrToken) && symbolOrToken.length > 30) ? { token: symbolOrToken } : { symbol: symbolOrToken };
    const p = await getPrice({ ...q, chain: chain.id });
    return Number(amount) * p.usd;
  } catch { return NaN; }
}

async function evmFees(chain) {
  const block = await rpc(chain, "eth_getBlockByNumber", ["latest", false]);
  if (block?.baseFeePerGas) {
    const tip = BigInt(await rpc(chain, "eth_maxPriorityFeePerGas", []).catch(() => "0x3b9aca0"));
    const base = BigInt(block.baseFeePerGas);
    return { type: "eip1559", maxFeePerGas: base * 2n + tip, maxPriorityFeePerGas: tip };
  }
  return { type: "legacy", gasPrice: BigInt(await rpc(chain, "eth_gasPrice", [])) * 11n / 10n };
}

/** Ask the human. Returns null when approved, else an explanation string. */
async function confirm(ctx, chain, title, lines) {
  if (!ctx?.approvals) return "No approval channel is available, so nothing was sent.";
  const detail = [...lines, "", chain.testnet ? "Testnet: approve with yes." : `MAINNET: real funds. Type "send" to approve.`].join("\n");
  const ans = await ctx.approvals.request({ kind: "tx", title, detail, confirmText: chain.testnet ? undefined : "send", sessionId: ctx.sessionId });
  if (!ans.approve) return `Not sent: ${ans.reason === "no_ui" ? "no human is attached to approve it" : ans.reason || "the user declined"}.`;
  return null;
}

async function evmBroadcast(chain, account, tx) {
  const nonce = Number(BigInt(await rpc(chain, "eth_getTransactionCount", [account.address, "pending"])));
  const signed = await account.signTransaction({ ...tx, chainId: chain.chainId, nonce });
  const hash = await rpc(chain, "eth_sendRawTransaction", [signed]);
  for (let i = 0; i < 40; i++) {
    const rc = await rpc(chain, "eth_getTransactionReceipt", [hash]).catch(() => null);
    if (rc) return { hash, status: rc.status === "0x1" ? "success" : "failed", block: Number(BigInt(rc.blockNumber)), explorer: explorerTx(chain, hash) };
    await sleep(1500);
  }
  return { hash, status: "pending", explorer: explorerTx(chain, hash) };
}

/** send_native / send_token on EVM or native SOL on Solana. */
export async function send({ chain: chainQ, to, amount, token } = {}, ctx = {}) {
  const chain = getChain(chainQ);
  if (!chain) throw new Error(`Unknown chain ${chainQ}`);
  if (!(Number(amount) > 0)) throw new Error("Amount must be positive.");
  const keys = ctx.keys || getKeys();
  if (chain.family === "solana") return solanaSend(chain, to, amount, token, keys, ctx);
  if (chain.family !== "evm") throw new Error(`Sending on ${chain.family} chains is not supported.`);
  if (!isEvmAddress(to)) throw new Error(`"${to}" is not an EVM address.`);
  const account = await evmAccount(keys);
  const { encodeFunctionData, erc20Abi } = await import("viem");
  const t = token ? await resolveToken(chain, token) : { address: NATIVE_EVM, decimals: chain.native.decimals, symbol: chain.native.symbol };
  const native = t.address === NATIVE_EVM;
  const raw = parseUnits(String(amount), t.decimals);
  const usd = await usdValue(chain, native ? chain.native.symbol : t.address, amount);
  const caps = checkCaps(chain, usd);
  if (!caps.ok) return { sent: false, reason: caps.reason };
  const call = native ? { from: account.address, to, value: "0x" + raw.toString(16) } : { from: account.address, to: t.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, raw] }) };
  // Simulation: eth_call must not revert, estimateGas must succeed, balance must cover value + fee.
  let gas;
  try {
    await rpc(chain, "eth_call", [call, "latest"]);
    gas = BigInt(await rpc(chain, "eth_estimateGas", [call])) * 12n / 10n;
  } catch (e) { return { sent: false, reason: `Simulation failed: ${e.message}. Nothing was sent.` }; }
  const fees = await evmFees(chain);
  const feeWei = gas * (fees.maxFeePerGas || fees.gasPrice);
  const bal = BigInt(await rpc(chain, "eth_getBalance", [account.address, "latest"]));
  if (bal < feeWei + (native ? raw : 0n)) return { sent: false, reason: `Not enough ${chain.native.symbol}: have ${formatUnits(bal, 18)}, need ${formatUnits(feeWei + (native ? raw : 0n), 18)} including max fee.` };
  const lines = [`From: ${account.address}`, `To:   ${to}`, `Amount: ${amount} ${t.symbol}${Number.isFinite(usd) && usd ? ` (~${fmtUsd(usd)})` : ""}`, `Chain: ${chain.name} (${chain.chainId})`, `Max fee: ${formatUnits(feeWei, 18)} ${chain.native.symbol}`, `Simulation: ok (gas ${gas})`, caps.note];
  const no = await confirm(ctx, chain, `Send ${amount} ${t.symbol} on ${chain.name}`, lines);
  if (no) return { sent: false, reason: no };
  const tx = { to: native ? to : t.address, value: native ? raw : 0n, data: native ? undefined : call.data, gas, ...(fees.type === "eip1559" ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, type: "eip1559" } : { gasPrice: fees.gasPrice, type: "legacy" }) };
  const r = await evmBroadcast(chain, account, tx);
  if (Number.isFinite(usd)) recordSpend(usd);
  return { sent: true, ...r, amount: `${amount} ${t.symbol}`, to };
}

async function solanaSend(chain, to, amount, token, keys, ctx) {
  if (token && !/^sol$/i.test(token)) return { sent: false, reason: "SPL token sends aren't supported yet; only native SOL." };
  if (!isSolanaAddress(to)) throw new Error(`"${to}" is not a Solana address.`);
  const kp = await solanaWallet(keys);
  const w3 = await web3();
  const lamports = Number(parseUnits(String(amount), 9));
  const usd = await usdValue(chain, "SOL", amount);
  const caps = checkCaps(chain, usd);
  if (!caps.ok) return { sent: false, reason: caps.reason };
  const { value: { blockhash, lastValidBlockHeight } } = await rpc(chain, "getLatestBlockhash", [{ commitment: "confirmed" }]);
  const tx = new w3.Transaction({ feePayer: kp.publicKey, blockhash, lastValidBlockHeight }).add(w3.SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new w3.PublicKey(to), lamports }));
  tx.sign(kp);
  const b64 = tx.serialize().toString("base64");
  const sim = await rpc(chain, "simulateTransaction", [b64, { encoding: "base64", commitment: "confirmed" }]);
  if (sim?.value?.err) return { sent: false, reason: `Simulation failed: ${JSON.stringify(sim.value.err)}. Logs: ${(sim.value.logs || []).slice(-3).join(" | ")}` };
  const lines = [`From: ${kp.publicKey.toBase58()}`, `To:   ${to}`, `Amount: ${amount} SOL${usd ? ` (~${fmtUsd(usd)})` : ""}`, `Chain: ${chain.name}`, `Simulation: ok (${sim?.value?.unitsConsumed ?? "?"} CU)`, caps.note];
  const no = await confirm(ctx, chain, `Send ${amount} SOL on ${chain.name}`, lines);
  if (no) return { sent: false, reason: no };
  const sig = await rpc(chain, "sendTransaction", [b64, { encoding: "base64", preflightCommitment: "confirmed" }]);
  if (Number.isFinite(usd)) recordSpend(usd);
  return { sent: true, hash: sig, explorer: explorerTx(chain, sig), amount: `${amount} SOL`, to };
}

/** send_tx: a generic EVM transaction (contract interaction) behind the same gate as send_native. */
export async function sendTx({ chain: chainQ, to, data, value, gasLimit } = {}, ctx = {}) {
  const chain = getChain(chainQ);
  if (!chain) throw new Error(`Unknown chain ${chainQ}`);
  if (chain.family !== "evm") return { sent: false, reason: "send_tx supports EVM chains only." };
  if (!isEvmAddress(to)) throw new Error(`"${to}" is not an EVM address.`);
  const keys = ctx.keys || getKeys();
  const account = await evmAccount(keys);
  const raw = value ? parseUnits(String(value), chain.native.decimals) : 0n;
  const usd = raw ? await usdValue(chain, chain.native.symbol, formatUnits(raw, chain.native.decimals)) : 0;
  const caps = checkCaps(chain, usd);
  if (!caps.ok) return { sent: false, reason: caps.reason };
  const call = { from: account.address, to, ...(data ? { data } : {}), value: "0x" + raw.toString(16) };
  let gas;
  try {
    await rpc(chain, "eth_call", [call, "latest"]);
    gas = gasLimit ? BigInt(gasLimit) : BigInt(await rpc(chain, "eth_estimateGas", [call])) * 12n / 10n;
  } catch (e) { return { sent: false, reason: `Simulation failed: ${e.message}. Nothing was sent.` }; }
  const fees = await evmFees(chain);
  const sel = data && data.length >= 10 ? data.slice(0, 10) : "(none)";
  const lines = [`From: ${account.address}`, `To:   ${to}`, `Value: ${formatUnits(raw, chain.native.decimals)} ${chain.native.symbol}${usd ? ` (~${fmtUsd(usd)})` : ""}`, `Calldata: ${sel} · ${data ? (data.length - 2) / 2 : 0} bytes`, `Chain: ${chain.name} (${chain.chainId})`, `Max fee: ${formatUnits(gas * (fees.maxFeePerGas || fees.gasPrice), 18)} ${chain.native.symbol}`, "Simulation: ok", caps.note, "Note: calldata can move tokens or grant approvals that the USD caps cannot see. Check the target contract."];
  const no = await confirm(ctx, chain, `Contract transaction on ${chain.name} → ${to.slice(0, 10)}…`, lines);
  if (no) return { sent: false, reason: no };
  const r = await evmBroadcast(chain, account, { to, data: data || undefined, value: raw, gas, ...(fees.type === "eip1559" ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, type: "eip1559" } : { gasPrice: fees.gasPrice, type: "legacy" }) });
  if (usd) recordSpend(usd);
  return { sent: true, ...r, to };
}

/** execute_swap: EVM via 0x (needs key), Solana via Jupiter. */
export async function executeSwap({ chain: chainQ, sell, buy, amount, slippageBps } = {}, ctx = {}) {
  const chain = getChain(chainQ);
  if (!chain) throw new Error(`Unknown chain ${chainQ}`);
  const keys = ctx.keys || getKeys();
  if (chain.testnet) return { sent: false, reason: "Swap execution is mainnet-only (0x/Jupiter don't route testnets)." };
  if (chain.family === "solana") {
    const kp = await solanaWallet(keys);
    const s = await resolveToken(chain, sell);
    const usd = await usdValue(chain, s.address === "So11111111111111111111111111111111111111112" ? "SOL" : s.address, amount);
    const caps = checkCaps(chain, usd);
    if (!caps.ok) return { sent: false, reason: caps.reason };
    const q = await jupiterQuote(sell, buy, amount, kp.publicKey.toBase58(), keys);
    if (!q.transaction) return { sent: false, reason: "Jupiter returned no transaction for this wallet (insufficient balance?)." };
    const w3 = await web3();
    const vtx = w3.VersionedTransaction.deserialize(Buffer.from(q.transaction, "base64"));
    vtx.sign([kp]);
    const b64 = Buffer.from(vtx.serialize()).toString("base64");
    const sim = await rpc(chain, "simulateTransaction", [b64, { encoding: "base64", commitment: "confirmed", replaceRecentBlockhash: false }]);
    if (sim?.value?.err) return { sent: false, reason: `Simulation failed: ${JSON.stringify(sim.value.err)}` };
    const no = await confirm(ctx, chain, `Swap ${q.sell} → ${q.buy} on Solana`, [`Wallet: ${kp.publicKey.toBase58()}`, `Sell: ${q.sell}${usd ? ` (~${fmtUsd(usd)})` : ""}`, `Expected: ${q.buy}`, `Route: ${q.route || "?"} · impact ${q.priceImpactPct ?? "?"}`, "Simulation: ok", caps.note]);
    if (no) return { sent: false, reason: no };
    const k = keys.get("jupiter");
    const r = await fetchJson("https://api.jup.ag/swap/v2/execute", { method: "POST", headers: k ? { "x-api-key": k } : {}, body: { signedTransaction: b64, requestId: q.requestId } }, 30000);
    if (Number.isFinite(usd)) recordSpend(usd);
    return { sent: true, status: r.status, hash: r.signature, explorer: r.signature ? explorerTx(chain, r.signature) : undefined, quote: q };
  }
  if (chain.family !== "evm") return { sent: false, reason: `Swaps on ${chain.family} are not supported.` };
  const account = await evmAccount(keys);
  const s = await resolveToken(chain, sell);
  const usd = await usdValue(chain, s.address === NATIVE_EVM ? chain.native.symbol : s.address, amount);
  const caps = checkCaps(chain, usd);
  if (!caps.ok) return { sent: false, reason: caps.reason };
  const q = await zeroExQuote(chain, sell, buy, amount, account.address, keys);
  if (!q.transaction?.to) return { sent: false, reason: "0x returned no executable transaction." };
  if (s.address !== NATIVE_EVM && q.issues) return { sent: false, reason: `Selling ${s.symbol} needs an ERC-20 approval for the 0x AllowanceHolder first. Approve it in your wallet or sell the native token.` };
  const call = { from: account.address, to: q.transaction.to, data: q.transaction.data, value: "0x" + BigInt(q.transaction.value || 0).toString(16) };
  let gas;
  try { gas = BigInt(await rpc(chain, "eth_estimateGas", [call])) * 12n / 10n; } catch (e) { return { sent: false, reason: `Simulation failed: ${e.message}` }; }
  const fees = await evmFees(chain);
  const no = await confirm(ctx, chain, `Swap ${q.sell} → ${q.buy} on ${chain.name}`, [`Wallet: ${account.address}`, `Sell: ${q.sell}${usd ? ` (~${fmtUsd(usd)})` : ""}`, `Expected: ${q.buy}${q.minBuy ? ` (min ${q.minBuy})` : ""}`, `Route: ${q.route || "0x"}`, `Simulation: ok (gas ${gas})`, caps.note]);
  if (no) return { sent: false, reason: no };
  const r = await evmBroadcast(chain, account, { to: call.to, data: call.data, value: BigInt(call.value), gas, ...(fees.type === "eip1559" ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, type: "eip1559" } : { gasPrice: fees.gasPrice, type: "legacy" }) });
  if (Number.isFinite(usd)) recordSpend(usd);
  return { sent: true, ...r, quote: { sell: q.sell, buy: q.buy } };
}

