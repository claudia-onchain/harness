// Test helpers: isolated LUMEN_HOME, SSE body builder.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tempHome() {
  const dir = mkdtempSync(join(tmpdir(), "lumen-test-"));
  process.env.LUMEN_HOME = dir;
  process.env.LUMEN_NO_UPDATE_CHECK = "1";
  return dir;
}

/** A ReadableStream that emits the given chunks (strings), to mimic fetch bodies split at odd places. */
export function streamOf(chunks) {
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close(); } });
}

export const sse = (events) => events.map((e) => (e.event ? `event: ${e.event}\n` : "") + `data: ${typeof e.data === "string" ? e.data : JSON.stringify(e.data)}\n\n`).join("");

/** Split a string into n-char chunks (to test boundary handling). */
export const chunked = (s, n = 7) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));

export async function collect(gen) { const out = []; for await (const x of gen) out.push(x); return out; }
