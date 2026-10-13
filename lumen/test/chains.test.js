import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeLatestRoundData, uint, string, encodeCall, SELECTORS } from "../src/chains/abi.js";
import { getChain, CHAINS, mainnets } from "../src/chains/registry.js";
import { decodeRevert, signatureToAbi } from "../src/chains/contracts.js";
import { formatUnits, parseUnits } from "../src/core/util.js";

const w = (v) => (BigInt.asUintN(256, BigInt(v))).toString(16).padStart(64, "0");

test("Chainlink latestRoundData decodes by hand (incl. negative answers)", () => {
  const hex = "0x" + w(110680464442257320000n) + w(250483000000n) + w(1760364863) + w(1760364863) + w(110680464442257320000n);
  const r = decodeLatestRoundData(hex);
  assert.equal(r.answer, 250483000000n);
  assert.equal(r.updatedAt, 1760364863n);
  assert.equal(Number(r.answer) / 1e8, 2504.83);
  const neg = decodeLatestRoundData("0x" + w(1) + w(-5n) + w(0) + w(0) + w(1));
  assert.equal(neg.answer, -5n);
  assert.throws(() => decodeLatestRoundData("0x1234"), /short/);
});

test("ABI helpers: decimals, string, bytes32 string, encodeCall", () => {
  assert.equal(uint("0x" + w(8)), 8n);
  const s = "0x" + w(32) + w(7) + Buffer.from("ETH/USD").toString("hex").padEnd(64, "0");
  assert.equal(string(s), "ETH/USD");
  assert.equal(string("0x" + Buffer.from("MKR").toString("hex").padEnd(64, "0")), "MKR");
  assert.equal(encodeCall(SELECTORS.balanceOf, "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"), "0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045");
});

test("registry: getChain aliases, chain ids, alchemy slugs, names", () => {
  assert.equal(getChain("eth").id, "ethereum");
  assert.equal(getChain("ARB").id, "arbitrum");
  assert.equal(getChain("8453").id, "base");
  assert.equal(getChain(8453).id, "base");
  assert.equal(getChain("sol").id, "solana");
  assert.equal(getChain("base-mainnet").id, "base");
  assert.equal(getChain("Ethereum Sepolia").id, "sepolia");
  assert.equal(getChain("hood").id, "robinhood");
  assert.equal(getChain("nope"), undefined);
  assert.ok(mainnets().length >= 40 && CHAINS.every((c) => c.id && c.family && c.native?.symbol));
});

test("revert decoding and signature normalisation", () => {
  const msg = Buffer.from("ERC20: transfer amount exceeds balance").toString("hex");
  const data = "0x08c379a0" + w(32) + w(msg.length / 2) + msg.padEnd(Math.ceil(msg.length / 64) * 64, "0");
  assert.equal(decodeRevert(data), "ERC20: transfer amount exceeds balance");
  assert.equal(decodeRevert("0x4e487b71" + w(0x11)), "Panic(0x11)");
  assert.equal(signatureToAbi("balanceOf(address) returns (uint256)"), "function balanceOf(address) view returns (uint256)");
});

test("units", () => {
  assert.equal(formatUnits(1234500000000000000n, 18), "1.2345");
  assert.equal(parseUnits("0.01", 18), 10000000000000000n);
  assert.equal(parseUnits("44.783666", 6), 44783666n);
  assert.throws(() => parseUnits("1.1234567", 6), /decimals/);
});

test("RPC failover: skips a failing endpoint (mock fetch)", async () => {
  const { rpcRaw } = await import("../src/chains/rpc.js");
  const chain = { id: "t", name: "T", family: "evm", publicRpc: ["https://bad.example", "https://good.example"] };
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("bad")) return new Response("busy", { status: 503 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x10" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const r = await rpcRaw(chain, "eth_blockNumber", [], { keys: { get: () => "" } });
    assert.equal(r.result, "0x10");
    assert.equal(r.url, "https://good.example");
  } finally { globalThis.fetch = orig; }
});
