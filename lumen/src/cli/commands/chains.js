// chains, chain <id>, price, balance, tx
import { CHAINS, mainnets } from "../../chains/registry.js";
import { rpcSource, resolveChain } from "../../chains/rpc.js";
import { chainStatus, txLookup } from "../../chains/evm.js";
import { getPrice } from "../../chains/prices.js";
import { getBalance } from "../../chains/balances.js";
import { solTx } from "../../chains/solana.js";
import { getKeys } from "../../core/keys.js";
import { getConfig } from "../../core/config.js";
import { theme, say, heading, kv, table, spin, fail } from "../out.js";
import { fmtUsd, fmtAmount } from "../../core/util.js";

const chainOf = (flags) => resolveChain(flags.chain || getConfig().chain || "ethereum");
const out = (flags, obj) => (flags.json ? (say(JSON.stringify(obj, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2)), true) : false);

export async function runChains(pos, flags) {
  const T = theme(flags);
  const keys = getKeys();
  const list = flags.testnets ? CHAINS : mainnets();
  if (out(flags, list.map((c) => ({ ...c, rpcSource: rpcSource(c, keys) })))) return;
  heading("Chains", `${mainnets().length} mainnets${flags.testnets ? ` + ${CHAINS.length - mainnets().length} testnets` : " (--testnets for more)"} · RPC: ${keys.has("alchemy") ? "Alchemy" : "public"}`);
  table(list.map((c) => [T.hex(c.accent || "#8a93a6")(T.sym.dot) + " " + c.id, c.name, c.family, c.chainId ?? "", c.native.symbol, c.chainlink ? T.ok("chainlink") : T.muted("—"), rpcSource(c, keys), c.testnet ? T.warn("testnet") : (c.tags || []).slice(0, 2).join(",")]), ["id", "name", "family", "chainId", "native", "feeds", "rpc", "tags"]);
}

export async function runChain(pos, flags) {
  const T = theme(flags);
  const c = resolveChain(pos[0] || flags.chain || "ethereum");
  const s = await spin(`querying ${c.name}`, chainStatus(c, getKeys()));
  if (out(flags, s)) return;
  heading(c.name, `${c.id} · ${c.family}${c.chainId ? ` · chain id ${c.chainId}` : ""}`);
  kv([
    ["block", T.text(String(s.blockNumber))],
    ...(s.gasPriceGwei != null ? [["gas", T.text(`${s.gasPriceGwei < 0.01 ? s.gasPriceGwei.toFixed(5) : s.gasPriceGwei.toFixed(3)} gwei`)]] : []),
    ...(s.fees ? [["fees", T.text(`${s.fees.fastestFee} sat/vB fast · ${s.fees.hourFee} sat/vB hour`)]] : []),
    ["latency", T.text(`${s.latencyMs} ms`)],
    ["rpc", T.text(`${s.rpcSource}${s.rpcHost ? ` (${s.rpcHost})` : ""}`)],
    ["native", T.text(c.native.symbol)],
    ["chainlink", c.chainlink ? T.ok(c.chainlink) : T.muted("no feeds")],
    ["explorer", T.accent2(c.explorer)],
  ]);
}

export async function runPrice(pos, flags) {
  const T = theme(flags);
  const q = pos[0];
  if (!q) return fail("Usage: lumen price <SYMBOL|address> [--chain base]");
  const isAddr = /^0x[0-9a-fA-F]{40}$/.test(q) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);
  const chain = chainOf(flags);
  const p = await spin(`pricing ${q}`, getPrice(isAddr ? { token: q, chain: chain.id } : { symbol: q, chain: chain.id }));
  if (out(flags, p)) return;
  say(`  ${T.bold(T.text(p.symbol || q))}  ${T.bold(T.gradient(fmtUsd(p.usd)))}  ${T.muted(`${p.source}${p.chain ? ` · ${p.chain}` : ""}`)}${p.stale ? T.warn("  stale") : ""}`);
  const extra = [["updated", T.muted(`${p.updatedAt}${p.ageSec != null ? ` (${p.ageSec}s ago)` : ""}`)]];
  if (p.feed) extra.push(["feed", T.muted(p.feed)]);
  if (p.change24h != null) extra.push(["24h", (p.change24h >= 0 ? T.ok : T.bad)(`${Number(p.change24h).toFixed(2)}%`)]);
  if (p.confidence != null) extra.push(["confidence", T.muted(String(p.confidence))]);
  kv(extra, { indent: "  " });
}

export async function runBalance(pos, flags) {
  const T = theme(flags);
  const addr = pos[0];
  if (!addr) return fail("Usage: lumen balance <address> [--chain base]");
  const chain = chainOf(flags);
  const b = await spin(`reading ${chain.name}`, getBalance(addr, chain, getKeys()));
  if (out(flags, b)) return;
  heading(`${chain.name} balance`, addr);
  say(`  ${T.bold(T.text(`${fmtAmount(b.native.amount)} ${b.native.symbol}`))}${b.native.usd != null ? "  " + T.muted(fmtUsd(b.native.usd)) : ""}`);
  if (b.tokens.length) table(b.tokens.slice(0, 50).map((t) => [T.text(t.symbol || "?"), fmtAmount(t.amount), t.usd != null ? fmtUsd(t.usd) : T.muted("—"), T.muted(t.address)]), ["token", "amount", "usd", "address"]);
  say(`  ${T.muted("total")} ${T.bold(T.gradient(fmtUsd(b.totalUsd)))}`);
  for (const n of b.notes || []) say(`  ${T.muted(`${T.sym.dot} ${n}`)}`);
}

export async function runTx(pos, flags) {
  const T = theme(flags);
  const hash = pos[0];
  if (!hash) return fail("Usage: lumen tx <hash> --chain <id>");
  const chain = chainOf(flags);
  if (chain.family === "solana") {
    const t = await spin("looking up", solTx(chain, hash));
    if (out(flags, t)) return;
    if (!t) return fail("Not found.");
    kv([["status", t.meta?.err ? T.bad("failed") : T.ok("success")], ["slot", String(t.slot)], ["fee", `${(t.meta?.fee || 0) / 1e9} SOL`], ["explorer", T.accent2(`${chain.explorer}/tx/${hash}`)]]);
    return;
  }
  const t = await spin("looking up", txLookup(chain, hash));
  if (out(flags, t)) return;
  if (!t.found) return fail(t.note);
  heading(`Transaction on ${chain.name}`, hash);
  kv([
    ["status", /success/.test(t.status) ? T.ok(t.status) : t.status === "pending" ? T.warn(t.status) : T.bad(t.status)],
    ["from", t.from], ["to", t.to || T.muted(`contract creation ${t.contractCreated || ""}`)], ["value", t.value], ["method", t.method],
    ["block", `${t.blockNumber}${t.timestamp ? T.muted(` · ${t.timestamp}`) : ""}`], ["fee", t.fee || "—"], ["gas used", String(t.gasUsed ?? "—")],
    ["transfers", t.tokenTransfers.length ? `${t.tokenTransfers.length} token transfer(s)` : T.muted("none")], ["explorer", T.accent2(t.explorer)],
  ]);
  for (const x of t.tokenTransfers.slice(0, 10)) say(`    ${T.muted(`${x.token.slice(0, 10)}… ${x.from.slice(0, 8)}… ${T.sym.arrow} ${x.to.slice(0, 8)}… raw ${x.raw}`)}`);
}

