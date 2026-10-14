// Shared HTTP layer for api.x.ai: Bearer auth, per-attempt timeout, retries on 429/5xx/network
// with Retry-After taking precedence over exponential backoff, and typed errors for everything else.
import { GrokError, GrokAbortError, GrokTimeoutError, GrokInvalidRequestError, errorFromHttp } from "./errors.js";

const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));

export function createRequester({
  apiKey, baseUrl = "https://api.x.ai", fetch: fetchImpl, timeoutMs = 300_000,
  maxRetries = 3, retryBaseMs = 1000, retryMaxMs = 30_000, sleep = sleepDefault,
} = {}) {
  if (!apiKey) throw new GrokInvalidRequestError("xAI apiKey is required");
  const base = String(baseUrl).replace(/\/+$/, "");
  const doFetch = fetchImpl || globalThis.fetch;
  const headers = () => ({ "content-type": "application/json", authorization: `Bearer ${apiKey}` });

  async function request(method, path, body, { signal } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) throw new GrokAbortError();
      const timer = AbortSignal.timeout(timeoutMs);
      const sig = signal ? AbortSignal.any([signal, timer]) : timer;
      let res;
      try {
        res = await doFetch(`${base}${path}`, { method, headers: headers(), body: body == null ? undefined : JSON.stringify(body), signal: sig });
      } catch (e) {
        if (signal?.aborted) throw new GrokAbortError("request aborted", { cause: e });
        lastErr = timer.aborted
          ? new GrokTimeoutError(`no response from xAI within ${timeoutMs} ms`, { cause: e })
          : new GrokError(`could not reach xAI: ${e.cause?.code || e.message}`, { code: "network", retryable: true, cause: e });
        if (attempt < maxRetries) { await sleep(Math.min(retryMaxMs, retryBaseMs * 2 ** attempt)); continue; }
        throw lastErr;
      }
      if (res.ok) return res;
      const text = await res.text().catch(() => "");
      lastErr = errorFromHttp(res.status, text, res.headers);
      if (lastErr.retryable && attempt < maxRetries) {
        await sleep(Math.min(retryMaxMs, lastErr.retryAfterMs ?? retryBaseMs * 2 ** attempt));
        continue;
      }
      throw lastErr;
    }
    throw lastErr;
  }

  async function json(method, path, body, opts) {
    const res = await request(method, path, body, opts);
    const text = await res.text();
    try { return Object.assign(JSON.parse(text), { [STATUS]: res.status }); } catch (e) {
      throw new GrokError(`xAI returned non-JSON (${res.status}): ${text.slice(0, 200)}`, { status: res.status, code: "bad_response", cause: e });
    }
  }

  return { request, json, baseUrl: base, apiKey };
}

/** Symbol key carrying the HTTP status on parsed JSON bodies (202 vs 200 matters for deferred jobs). */
export const STATUS = Symbol("httpStatus");
