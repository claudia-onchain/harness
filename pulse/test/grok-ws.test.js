import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockGrok } from "./mock-grok.js";
import { createGrok } from "../src/grok/responses.js";
import { openSocket, encodeFrame, frameDecoder, acceptKey } from "../src/grok/ws.js";
import { GrokInvalidRequestError } from "../src/grok/errors.js";

let mock, grok, usages;
before(async () => {
  mock = await startMockGrok();
  usages = [];
  grok = createGrok({ apiKey: "test-key", baseUrl: mock.url, safetyIdentifier: "routine-7", onUsage: (u) => usages.push(u), sleep: async () => {} });
});
after(() => mock.close());

test("ws frames: masking, length encodings, fragmentation and control frames decode correctly", () => {
  const seen = [];
  const feed = frameDecoder((f) => seen.push(f));
  const big = "x".repeat(70_000), mid = "y".repeat(300);
  feed(encodeFrame("hi", { mask: true }));
  feed(encodeFrame(mid, { mask: false }));
  feed(encodeFrame(big, { mask: true }));
  // Fragmented text message with a ping in the middle, delivered byte by byte.
  const parts = Buffer.concat([encodeFrame("ab", { fin: false, mask: true }), encodeFrame("ping!", { opcode: 9, mask: true }), encodeFrame("cd", { opcode: 0, fin: true, mask: true })]);
  for (const b of parts) feed(Buffer.from([b]));
  assert.equal(seen[0].payload.toString(), "hi");
  assert.equal(seen[1].payload.toString(), mid);
  assert.equal(seen[2].payload.toString(), big);
  assert.equal(seen[3].opcode, 9);
  assert.equal(seen[3].payload.toString(), "ping!");
  assert.equal(seen[4].opcode, 1);
  assert.equal(seen[4].payload.toString(), "abcd");
  assert.equal(acceptKey("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="); // RFC 6455 §1.3 example
});

test("ws client: upgrade carries the Authorization header; missing auth is refused", async () => {
  const ws = await openSocket(mock.wsUrl, { headers: { authorization: "Bearer abc" } });
  assert.equal(mock.calls.at(-1).method, "WS");
  assert.equal(mock.calls.at(-1).headers.authorization, "Bearer abc");
  const closed = new Promise((r) => ws.once("close", r));
  ws.close();
  await closed;
  await assert.rejects(openSocket(mock.wsUrl), (e) => e.status === 401);
});

test("connect: turns chain with previous_response_id, one in flight, the rest queued in order", async () => {
  const c = await grok.connect();
  assert.equal(c.open, true);
  const a = c.turn({ model: "grok-4.3", input: "first" });
  const b = c.turn({ model: "grok-4.3", input: "second" });
  const d = c.turn({ model: "grok-4.3", input: "third" });
  assert.equal(c.pending, 3);
  const [ra, rb, rd] = await Promise.all([a, b, d]);
  assert.ok(ra.text.includes("first"));
  assert.ok(rb.text.includes("second"));
  assert.ok(rd.text.includes("third"));
  assert.ok(ra.id < rb.id && rb.id < rd.id, "ids allocated in submission order");
  assert.equal(c.lastResponseId, rd.id);
  assert.equal(c.pending, 0);
  const chained = await c.turn({ model: "grok-4.3", input: [{ role: "user", content: "fourth" }], previous_response_id: c.lastResponseId });
  assert.ok(chained.text.startsWith(`[continuing ${rd.id}]`));
  assert.equal(chained.usage.costTicks, 12345678);
  // Wire body is `response.create` without stream/background, and the safety identifier rides along.
  const wire = mock.calls.filter((x) => x.method === "WS" && x.body).at(-1).body;
  assert.equal(wire.previous_response_id, rd.id);
  assert.equal(wire.stream, undefined);
  assert.equal(wire.safety_identifier, "routine-7");
  assert.equal(usages.length, 4);
  c.close();
  assert.equal(c.open, false);
  await assert.rejects(c.turn({ model: "grok-4.3", input: "after close" }), /closed/);
});

test("connect: warm() returns a chainable id without generating; text deltas stream to onText", async () => {
  const c = await grok.connect();
  const w = await c.warm({ model: "grok-4.3", input: [{ role: "user", content: "context" }] });
  assert.match(w.id, /^resp_/);
  assert.equal(w.text, "");
  assert.equal(mock.calls.filter((x) => x.method === "WS" && x.body).at(-1).body.generate, false);
  const chunks = [];
  const r = await c.turn({ model: "grok-4.3", input: "go", previous_response_id: w.id }, { onText: (t) => chunks.push(t) });
  assert.equal(chunks.join(""), r.text);
  c.close();
});

test("connect: connection limit → transparent reconnect; previous_response_not_found → typed error", async () => {
  const c = await grok.connect();
  const sockets = () => mock.calls.filter((x) => x.method === "WS" && x.body === null).length;
  const before = sockets();
  const r = await c.turn({ model: "grok-4.3", input: "ws_limit_me then answer" });
  assert.equal(r.status, "completed");
  assert.ok(r.text.includes("ws_limit_me"));
  assert.equal(sockets(), before + 1, "exactly one new socket was opened");
  assert.equal(c.open, true);
  await assert.rejects(c.turn({ model: "grok-4.3", input: "x", previous_response_id: "resp_gone" }), (e) => e instanceof GrokInvalidRequestError && e.code === "previous_response_not_found");
  // The socket survives a turn-level error and keeps serving.
  const again = await c.turn({ model: "grok-4.3", input: "still alive" });
  assert.ok(again.text.includes("still alive"));
  c.close();
});

test("connect: structured output and function calls are normalised like HTTP", async () => {
  const c = await grok.connect();
  const j = await c.turn({ model: "grok-4.3", input: "judge", text: { format: { type: "json_schema", name: "s", strict: true, schema: { type: "object", properties: { score: { type: "number" } }, required: ["score"] } } } });
  assert.equal(typeof j.json.score, "number");
  const f = await c.turn({ model: "grok-4.3", input: "call_tool", tools: [{ type: "function", name: "lookup", parameters: { type: "object", properties: {} } }] });
  assert.equal(f.functionCalls[0].name, "lookup");
  c.close();
});
