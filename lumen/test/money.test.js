// Money safety: --yes / approvalMode "yolo" must never skip the human approval for sends.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tempHome } from "./helpers.js";

const home = tempHome();
const { KeyStore } = await import("../src/core/keys.js");
const { Approvals } = await import("../src/core/approvals.js");
const { buildTools } = await import("../src/agent/tools/index.js");
const { runTurn } = await import("../src/agent/loop.js");
const { MockClient } = await import("../src/llm/mock.js");
const { attachTerminalApprovals } = await import("../src/cli/out.js");

// Anvil's well-known test account #0 (public, never holds real funds).
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const keys = new KeyStore({ file: join(home, "money-keys.json"), env: { LUMEN_EVM_PRIVATE_KEY: TEST_KEY } });
let sent = 0;
const orig = globalThis.fetch;
const RESULTS = {
  eth_call: "0x", eth_estimateGas: "0x5208", eth_maxPriorityFeePerGas: "0x1", eth_getBalance: "0xde0b6b3a7640000", eth_getTransactionCount: "0x0",
  eth_getBlockByNumber: { number: "0x10", baseFeePerGas: "0x3b9aca00" }, eth_getTransactionReceipt: { status: "0x1", blockNumber: "0x11" }, eth_gasPrice: "0x3b9aca00",
};
beforeEach(() => {
  sent = 0;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === "eth_sendRawTransaction") { sent++; return Response.json({ jsonrpc: "2.0", id: 1, result: "0x" + "ab".repeat(32) }); }
    return Response.json({ jsonrpc: "2.0", id: 1, result: RESULTS[body.method] ?? null });
  };
});
afterEach(() => { globalThis.fetch = orig; });

async function sendVia(approvals, approvalMode) {
  const reg = buildTools({});
  const messages = [{ role: "user", content: 'call send_native {"chain":"sepolia","to":"0x000000000000000000000000000000000000dEaD","amount":"0.001"}' }];
  const toolCtx = { cwd: process.cwd(), keys, approvals, config: { approvalMode, tools: {}, wallet: { maxUsdPerTx: 25, maxUsdPerDay: 100 } }, emit: () => {}, chain: "sepolia" };
  await runTurn({ client: new MockClient({ delayMs: 0 }), system: "s", messages, registry: reg, toolCtx, emit: () => {}, sessionId: "m" });
  return messages.find((m) => m.role === "tool").content;
}

test("yolo with nobody attached: send_native is refused, nothing broadcast", async () => {
  const out = await sendVia(new Approvals(), "yolo");
  assert.match(out, /"sent": false/);
  assert.match(out, /no human is attached/);
  assert.equal(sent, 0);
});

test("yolo still asks the human; a decline means nothing is sent", async () => {
  const a = new Approvals();
  a.attach();
  const seen = [];
  a.on("request", (r) => { seen.push(r.kind); a.resolve(r.id, { approve: false }); });
  const out = await sendVia(a, "yolo");
  assert.deepEqual(seen, ["tx"]);
  assert.match(out, /the user declined/);
  assert.equal(sent, 0);
});

test("a human yes (testnet) sends after simulation", async () => {
  const a = new Approvals();
  a.attach();
  let detail = "";
  a.on("request", (r) => { detail = r.detail; a.resolve(r.id, { approve: true }); });
  const out = await sendVia(a, "always-ask");
  assert.match(detail, /Simulation: ok/);
  assert.match(out, /"sent": true/);
  assert.equal(sent, 1);
});

test("--yes terminal handler never auto-approves tx approvals", async () => {
  const a = new Approvals();
  const detach = attachTerminalApprovals(a, { yes: true });
  const media = await a.request({ kind: "media", title: "gen" });
  const tx = await a.request({ kind: "tx", title: "send", confirmText: "send" });
  detach();
  assert.equal(media.approve, true);
  assert.equal(tx.approve, false);
});
