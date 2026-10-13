// POST with retries on 429/5xx/529 (honours retry-after up to 20 s). Returns { res } or { error }.
import { sleep } from "../core/util.js";

export const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

export async function postWithRetry(url, { headers, body, signal, timeoutMs = 300_000, attempts = 3, providerName = "the provider", onRetry } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let res;
    try {
      const t = AbortSignal.timeout(timeoutMs);
      res = await fetch(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, t]) : t });
    } catch (e) {
      if (signal?.aborted) return { aborted: true };
      lastErr = e;
      if (attempt < attempts - 1) { onRetry?.(`network error, retrying (${attempt + 1})`); await sleep(700 * (attempt + 1)); continue; }
      return { error: { status: 0, message: `Couldn't reach ${providerName}: ${e.cause?.code || e.message}` } };
    }
    if (!res.ok && RETRY_STATUS.has(res.status) && attempt < attempts - 1) {
      const ra = Number(res.headers.get("retry-after"));
      await res.text().catch(() => "");
      onRetry?.(`${res.status} from ${providerName}, retrying (${attempt + 1})`);
      await sleep(Number.isFinite(ra) && ra > 0 && ra <= 20 ? ra * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    return { res };
  }
  return { error: { status: 0, message: lastErr?.message || "request failed" } };
}

export async function errorText(res) {
  const text = await res.text().catch(() => res.statusText);
  let msg = text;
  try {
    const j = JSON.parse(text);
    msg = j.error?.message || j.message || (typeof j.error === "string" ? j.error : text);
  } catch { /* not JSON */ }
  return String(msg || res.statusText).slice(0, 600);
}

export const jsonOr = (s, d = {}) => {
  if (s && typeof s === "object") return s;
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : d; } catch { return d; }
};

export async function completeText(client, messages, signal) {
  let text = "";
  for await (const ev of client.stream(messages, null, { signal })) {
    if (ev.type === "text") text += ev.text;
    else if (ev.type === "error") throw Object.assign(new Error(ev.message), { status: ev.status });
  }
  return text;
}
