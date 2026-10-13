// Contract reads, simulation and name resolution.
import { rpc, endpoints } from "./rpc.js";
import { etherscan } from "./evm.js";
import { getChain } from "./registry.js";
import { isEvmAddress } from "./tokens.js";
import { getKeys } from "../core/keys.js";
import { fetchJson } from "../core/util.js";

const ERROR_STRING = "0x08c379a0", PANIC = "0x4e487b71";

/** Decode a revert payload: Error(string), Panic(uint256) or raw. */
export function decodeRevert(data) {
  const d = String(data || "");
  try {
    if (d.startsWith(ERROR_STRING)) {
      const h = d.slice(10);
      const len = Number(BigInt("0x" + h.slice(64, 128)));
      return Buffer.from(h.slice(128, 128 + len * 2), "hex").toString("utf8");
    }
    if (d.startsWith(PANIC)) return `Panic(0x${BigInt("0x" + d.slice(10, 74)).toString(16)})`;
  } catch { /* fall through */ }
  return d && d !== "0x" ? `custom error ${d.slice(0, 10)}` : "reverted without a reason";
}

const hexValue = (v) => {
  if (v == null || v === "") return undefined;
  if (typeof v === "string" && v.startsWith("0x")) return v;
  return "0x" + BigInt(v).toString(16);
};

/** Simulate an EVM call (eth_call + estimateGas, logs via eth_simulateV1 when the RPC supports it) or a Solana tx. */
export async function simulateTx({ chain: chainQ, from, to, data, value, tx } = {}, keys = getKeys()) {
  const chain = getChain(chainQ);
  if (!chain) throw new Error(`Unknown chain ${chainQ}`);
  if (chain.family === "solana") {
    if (!tx) throw new Error("Pass the base64 Solana transaction as `tx`.");
    const r = await rpc(chain, "simulateTransaction", [tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" }], { keys });
    const v = r?.value || {};
    return { success: !v.err, error: v.err || undefined, unitsConsumed: v.unitsConsumed, logs: (v.logs || []).slice(-25) };
  }
  if (chain.family !== "evm") throw new Error(`Simulation supports EVM and Solana (not ${chain.family}).`);
  if (!isEvmAddress(to)) throw new Error("`to` must be an EVM address.");
  const call = { ...(from ? { from } : {}), to, ...(data ? { data } : {}), ...(value ? { value: hexValue(value) } : {}) };
  const out = { chain: chain.id, to, success: true };
  try {
    out.returnData = await rpc(chain, "eth_call", [call, "latest"], { keys });
  } catch (e) {
    return { ...out, success: false, revert: decodeRevert(e.data?.data ?? e.data) || e.message, error: e.message };
  }
  try { out.gas = Number(BigInt(await rpc(chain, "eth_estimateGas", [call], { keys }))); } catch (e) { out.gasError = e.message; }
  try {
    const sim = await rpc(chain, "eth_simulateV1", [{ blockStateCalls: [{ calls: [call] }], traceTransfers: true, validation: false }, "latest"], { keys, timeoutMs: 8000 });
    const c = sim?.[0]?.calls?.[0];
    if (c) out.logs = (c.logs || []).slice(0, 30).map((l) => ({ address: l.address, topics: l.topics, data: String(l.data).slice(0, 200) }));
  } catch { /* eth_simulateV1 not supported by this RPC */ }
  return out;
}

/** Normalise "balanceOf(address) returns (uint256)" into a viem human-readable ABI item. */
export function signatureToAbi(sig) {
  let s = String(sig).trim();
  if (!/^function\s/.test(s)) s = `function ${s}`;
  if (/\breturns\b/.test(s) && !/\b(view|pure|payable|nonpayable)\b/.test(s)) s = s.replace(/\)\s*returns/, ") view returns");
  return s;
}

export async function readContract({ chain: chainQ, address, signature, abi, functionName, args = [], block = "latest" } = {}, keys = getKeys()) {
  args = Array.isArray(args) ? args : args === undefined || args === null ? [] : [args];
  const chain = getChain(chainQ);
  if (!chain || chain.family !== "evm") throw new Error("read_contract supports EVM chains.");
  if (!isEvmAddress(address)) throw new Error("address must be an EVM address.");
  const viem = await import("viem");
  const KNOWN = { "latestRoundData()": "latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)", "decimals()": "decimals() view returns (uint8)", "symbol()": "symbol() view returns (string)", "name()": "name() view returns (string)", "totalSupply()": "totalSupply() view returns (uint256)", "owner()": "owner() view returns (address)" };
  let abiItems;
  if (signature && !/\breturns\b/.test(signature) && KNOWN[String(signature).replace(/^function\s+/, "").replace(/\s+/g, "")]) signature = KNOWN[String(signature).replace(/^function\s+/, "").replace(/\s+/g, "")];
  if (signature && !/\breturns\b/.test(signature) && keys.has("etherscan")) {
    // No return types given: use the verified ABI when we can.
    try {
      const all = JSON.parse(await etherscan(chain, { module: "contract", action: "getabi", address }, keys));
      const name = String(signature).replace(/^function\s+/, "").split("(")[0].trim();
      if (all.some((x) => x.type === "function" && x.name === name)) { abiItems = all; functionName = name; signature = null; }
    } catch { /* fall back to raw decoding */ }
  }
  if (signature) abiItems = [viem.parseAbiItem(signatureToAbi(signature))];
  else if (abiItems) { /* from etherscan above */ }
  else if (abi) abiItems = typeof abi === "string" ? JSON.parse(abi) : abi;
  else {
    const raw = await etherscan(chain, { module: "contract", action: "getabi", address }, keys);
    abiItems = JSON.parse(raw);
  }
  const fn = functionName || abiItems.find((x) => x.type === "function")?.name;
  if (!fn) throw new Error("No function to call.");
  const data = viem.encodeFunctionData({ abi: abiItems, functionName: fn, args });
  const hex = await rpc(chain, "eth_call", [{ to: address, data }, block], { keys });
  const item = abiItems.find((x) => x.type === "function" && x.name === fn);
  if (!item?.outputs?.length) {
    const h = String(hex).replace(/^0x/, "");
    return { chain: chain.id, address, function: fn, args, raw: hex, note: "No return types given; showing raw data. Add `returns (...)` to the signature to decode.", ...(h.length === 64 ? { asUint: BigInt("0x" + h).toString(), ...(h.startsWith("000000000000000000000000") ? { asAddress: viem.getAddress("0x" + h.slice(24)) } : {}) } : {}) };
  }
  const result = viem.decodeFunctionResult({ abi: abiItems, functionName: fn, data: hex });
  return { chain: chain.id, address, function: fn, args, result };
}

/** ENS / Basenames (via mainnet universal resolver, CCIP-read) and reverse lookup; .sol via the SNS proxy. */
export async function resolveAddress(name, keys = getKeys()) {
  const q = String(name || "").trim();
  if (/\.sol$/i.test(q)) {
    try { return await resolveSns(q, keys); } catch (e) { return { name: q, address: null, chain: "solana", note: `.sol resolution failed: ${e.message}` }; }
  }
  const viem = await import("viem");
  const { mainnet } = await import("viem/chains");
  const eth = getChain("ethereum");
  const url = endpoints(eth, keys)[0].url;
  const client = viem.createPublicClient({ chain: mainnet, transport: viem.http(url, { timeout: 12000 }) });
  if (isEvmAddress(q)) {
    const ens = await client.getEnsName({ address: q }).catch(() => null);
    let verified = false;
    if (ens) verified = ((await client.getEnsAddress({ name: viem.normalize ? viem.normalize(ens) : ens }).catch(() => null)) || "").toLowerCase() === q.toLowerCase();
    return { address: viem.getAddress(q), name: ens, verified, source: "ens-reverse" };
  }
  const { normalize } = await import("viem/ens");
  const n = normalize(q);
  const address = await client.getEnsAddress({ name: n });
  return { name: n, address: address || null, source: "ens", note: address ? undefined : "No address record." };
}

// Solana Name Service: derive the name account PDA and read its owner (bytes 32..64 of the account data).
const SNS_PROGRAM = "namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX";
const SOL_TLD = "58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx";
async function resolveSns(name, keys) {
  const { createHash } = await import("node:crypto");
  const w3 = await import("@solana/web3.js");
  const label = name.replace(/\.sol$/i, "").toLowerCase();
  const hashed = createHash("sha256").update("SPL Name Service" + label).digest();
  const [pda] = w3.PublicKey.findProgramAddressSync([hashed, Buffer.alloc(32), new w3.PublicKey(SOL_TLD).toBuffer()], new w3.PublicKey(SNS_PROGRAM));
  const r = await rpc(getChain("solana"), "getAccountInfo", [pda.toBase58(), { encoding: "base64" }], { keys });
  const data = r?.value?.data?.[0];
  if (!data) return { name, address: null, chain: "solana", source: "sns", note: "Not registered." };
  const owner = new w3.PublicKey(Buffer.from(data, "base64").subarray(32, 64)).toBase58();
  return { name, address: owner, chain: "solana", source: "sns", account: pda.toBase58() };
}
