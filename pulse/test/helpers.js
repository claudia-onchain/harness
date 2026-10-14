// Shared test scaffolding: a fresh PULSE_HOME per test so nothing touches ~/.pulse.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tmpHome(t) {
  const dir = mkdtempSync(join(tmpdir(), "pulse-test-"));
  const prev = process.env.PULSE_HOME;
  process.env.PULSE_HOME = dir;
  t?.after?.(() => { if (prev === undefined) delete process.env.PULSE_HOME; else process.env.PULSE_HOME = prev; rmSync(dir, { recursive: true, force: true }); });
  return dir;
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Fake fetch for Telegram: `routes[method]` is a function(body, callIndex) -> result or a queue of results. */
export function fakeTelegram(routes = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const method = String(url).split("/").pop();
    let body = null;
    if (init?.body instanceof FormData) { body = {}; for (const [k, v] of init.body.entries()) body[k] = v; }
    else if (init?.body) body = JSON.parse(init.body);
    const idx = calls.filter((c) => c.method === method).length;
    calls.push({ method, body, url: String(url), init });
    if (init?.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    const r = routes[method];
    let result;
    if (typeof r === "function") result = await r(body, idx, init);
    else if (Array.isArray(r)) result = idx < r.length ? r[idx] : [];
    else result = r ?? { message_id: idx + 1, chat: { id: body?.chat_id } };
    if (result && result.__error) return new Response(JSON.stringify({ ok: false, error_code: result.code, description: result.description, parameters: result.parameters }), { status: result.code });
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}
