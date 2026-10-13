import { test } from "node:test";
import assert from "node:assert/strict";
import { tempHome } from "./helpers.js";

tempHome();
const { runTurn } = await import("../src/agent/loop.js");
const { ToolRegistry, obj, str } = await import("../src/agent/tools/registry.js");
const { Approvals } = await import("../src/core/approvals.js");
const { MockClient } = await import("../src/llm/mock.js");

function setup() {
  const reg = new ToolRegistry();
  const calls = [];
  reg.add({ name: "echo_tool", group: "Test", label: "Echo", safe: true, description: "echo", parameters: obj({ v: str("value") }), run: (a) => { calls.push(a); return { text: `echoed ${a.v}`, summary: `v=${a.v}` }; } });
  reg.add({ name: "danger", group: "Test", label: "Danger", approval: "shell", description: "needs approval", parameters: obj(), run: () => "ran" });
  const approvals = new Approvals();
  const events = [];
  const toolCtx = { cwd: process.cwd(), config: { approvalMode: "always-ask", tools: {} }, approvals, emit: (e) => events.push(e) };
  return { reg, calls, approvals, events, toolCtx };
}

test("agent loop: mock model calls a tool, gets the result, answers", async () => {
  const { reg, calls, events, toolCtx } = setup();
  const messages = [{ role: "user", content: 'call echo_tool {"v":"42"}' }];
  const res = await runTurn({ client: new MockClient({ delayMs: 0 }), system: "sys", messages, registry: reg, toolCtx, emit: (e) => events.push(e), sessionId: "s1" });
  assert.equal(res.ok, true);
  assert.equal(res.rounds, 1);
  assert.deepEqual(calls, [{ v: "42" }]);
  assert.deepEqual(messages.map((m) => m.role), ["user", "assistant", "tool", "assistant"]);
  assert.equal(messages[2].content, "echoed 42");
  assert.match(messages[3].content, /echoed 42/);
  const types = events.map((e) => e.type);
  assert.ok(types.includes("tool_start") && types.includes("tool_end") && types.includes("delta"));
  assert.equal(events.find((e) => e.type === "tool_end").summary, "v=42");
});

test("agent loop: tools that need approval are denied when no human is attached", async () => {
  const { reg, toolCtx } = setup();
  const messages = [{ role: "user", content: "call danger" }];
  await runTurn({ client: new MockClient({ delayMs: 0 }), system: "sys", messages, registry: reg, toolCtx, emit: () => {}, sessionId: "s1" });
  assert.match(messages[2].content, /needs approval and nobody is attached/);
});

test("agent loop: a human approval lets the tool run; yolo skips shell approvals", async () => {
  const { reg, approvals, toolCtx } = setup();
  const detach = approvals.attach();
  approvals.on("request", (a) => approvals.resolve(a.id, { approve: true }));
  const messages = [{ role: "user", content: "call danger" }];
  await runTurn({ client: new MockClient({ delayMs: 0 }), system: "sys", messages, registry: reg, toolCtx, emit: () => {}, sessionId: "s1" });
  assert.equal(messages[2].content, "ran");
  detach();
  const m2 = [{ role: "user", content: "call danger" }];
  await runTurn({ client: new MockClient({ delayMs: 0 }), system: "sys", messages: m2, registry: reg, toolCtx: { ...toolCtx, config: { approvalMode: "yolo" } }, emit: () => {}, sessionId: "s1" });
  assert.equal(m2[2].content, "ran");
});

test("approvals: confirmText must match exactly (mainnet sends)", async () => {
  const a = new Approvals();
  a.attach();
  a.on("request", (r) => a.resolve(r.id, { approve: true, answer: "yes" }));
  const r1 = await a.request({ kind: "tx", title: "send", confirmText: "send" });
  assert.equal(r1.approve, false);
  const b = new Approvals();
  b.attach();
  b.on("request", (r) => b.resolve(r.id, { approve: true, answer: "send" }));
  assert.equal((await b.request({ kind: "tx", title: "send", confirmText: "send" })).approve, true);
});

test("agent loop: steering messages are injected after a tool round; abort stops", async () => {
  const { reg, toolCtx } = setup();
  const messages = [{ role: "user", content: 'call echo_tool {"v":"1"}' }];
  const queue = ["also say hi"];
  await runTurn({ client: new MockClient({ delayMs: 0 }), system: "sys", messages, registry: reg, toolCtx, emit: () => {}, sessionId: "s1", takeSteering: () => queue.splice(0) });
  assert.ok(messages.some((m) => m.role === "user" && m.content === "also say hi"));
  const ac = new AbortController();
  ac.abort();
  const res = await runTurn({ client: new MockClient({ delayMs: 0 }), system: "sys", messages: [{ role: "user", content: "x" }], registry: reg, toolCtx, emit: () => {}, sessionId: "s1", signal: ac.signal });
  assert.equal(res.aborted, true);
});

test("runtime: mock model end to end with built-in tools", async () => {
  const { createRuntime } = await import("../src/agent/runtime.js");
  const rt = await createRuntime({ flags: { model: "mock:echo" }, detect: false });
  const types = [];
  rt.on("event", (e) => types.push(e.type));
  const r = await rt.send('call skill_list {"q":"swap"}');
  assert.equal(r.ok, true);
  assert.ok(types.includes("turn_done"));
  const s = rt.session();
  assert.equal(s.messages.at(-2).role, "tool");
  assert.ok(rt.systemPrompt().includes("<untrusted>") || rt.systemPrompt().includes("untrusted"));
});
