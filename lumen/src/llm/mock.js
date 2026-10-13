// Offline mock model (`--model mock:echo`). Used by tests and demos without any key.
//   "call <tool> {json}"  -> requests that tool call, then summarizes its result
//   "demo"                -> a markdown showcase (headings, lists, code, links)
//   anything else         -> streams "Echo: <text>" with a short thinking trace
import { completeText } from "./http.js";

const DEMO = `## Lumen demo

Here is what **markdown** looks like in the terminal:

- Bold, *italic* and \`inline code\`
- Links like [Chainlink docs](https://docs.chain.link)
- Nested lists
  - work too

\`\`\`js
const price = await lumen.price("ETH", { chain: "base" });
console.log(price.usd);
\`\`\`

> Quotes are dimmed. Tables and long lines wrap to the terminal width.

1. First
2. Second
`;

const textOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.filter((p) => p.type === "text").map((p) => p.text).join("\n") : "");

export class MockClient {
  constructor({ model = "echo", delayMs } = {}) {
    this.provider = "mock";
    this.model = model;
    this.delay = delayMs ?? Number(process.env.LUMEN_MOCK_DELAY ?? 8);
  }

  async *stream(messages, tools, { signal } = {}) {
    const wait = () => (this.delay ? new Promise((r) => setTimeout(r, this.delay)) : Promise.resolve());
    const last = messages[messages.length - 1] || {};
    const input = Math.ceil(JSON.stringify(messages).length / 4);
    let out = "";
    const say = async function* (s) {
      for (const w of s.split(/(?<=\s)/)) {
        if (signal?.aborted) return;
        out += w;
        yield { type: "text", text: w };
        await wait();
      }
    };
    if (last.role === "tool") {
      const results = [];
      for (let i = messages.length - 1; i >= 0 && messages[i].role === "tool"; i--) results.unshift(messages[i]);
      yield { type: "thinking", text: `Got ${results.length} tool result(s); summarizing.` };
      const lines = results.map((r) => `- \`${r.name || "tool"}\`: ${String(r.content).replace(/\s+/g, " ").slice(0, 300)}`);
      yield* say(`Done. Tool results:\n\n${lines.join("\n")}\n`);
    } else {
      const text = textOf(last.content).trim();
      const m = /^(?:call|tool)\s+([\w.-]+)\s*(\{[\s\S]*\})?\s*$/i.exec(text);
      if (m && (tools || []).some((t) => t.name === m[1])) {
        let args = {};
        try { args = m[2] ? JSON.parse(m[2]) : {}; } catch { /* keep {} */ }
        yield { type: "thinking", text: `The user asked me to call ${m[1]}.` };
        yield* say(`Calling \`${m[1]}\`…`);
        yield { type: "tool_start", id: `mock_${Date.now().toString(36)}`, name: m[1] };
        yield { type: "usage", usage: { input, output: Math.ceil(out.length / 4) + 10, cacheRead: 0, cacheWrite: 0 }, model: this.model };
        yield { type: "tool_calls", calls: [{ id: `mock_${Date.now().toString(36)}`, name: m[1], args }] };
        yield { type: "done", stop: "tool_use", model: this.model };
        return;
      }
      yield { type: "thinking", text: `Reading the message (${text.length} chars). Mock mode: no real model is called.` };
      await wait();
      if (/^demo$/i.test(text)) yield* say(DEMO);
      else yield* say(`Echo: ${text || "(empty)"}`);
    }
    yield { type: "usage", usage: { input, output: Math.ceil(out.length / 4), cacheRead: 0, cacheWrite: 0 }, model: this.model };
    yield { type: "done", stop: "end_turn", model: this.model };
  }

  complete(messages, signal) { return completeText(this, messages, signal); }
}
