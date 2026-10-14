// Typed errors for everything that talks to api.x.ai. Callers branch on `code` (stable strings) or
// `instanceof`; `retryable` tells the request loop whether another attempt could succeed.

export class GrokError extends Error {
  constructor(message, { status = 0, code = "grok_error", retryable = false, retryAfterMs, data, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    if (retryAfterMs != null) this.retryAfterMs = retryAfterMs;
    if (data !== undefined) this.data = data;
  }
}

export class GrokAuthError extends GrokError {
  constructor(message = "xAI rejected the API key", opts = {}) {
    super(message, { status: 401, code: "auth", ...opts, retryable: false });
  }
}

export class GrokRateLimitError extends GrokError {
  constructor(message = "xAI rate limit hit", opts = {}) {
    super(message, { status: 429, code: "rate_limit", ...opts, retryable: true });
  }
}

export class GrokBudgetError extends GrokError {
  constructor(message = "budget exceeded", { spentTicks, capTicks, ...opts } = {}) {
    super(message, { code: "budget", ...opts, retryable: false });
    this.spentTicks = spentTicks;
    this.capTicks = capTicks;
  }
}

export class GrokToolError extends GrokError {
  constructor(message, opts = {}) {
    super(message, { code: "tool", ...opts });
  }
}

export class GrokTimeoutError extends GrokError {
  constructor(message = "xAI request timed out", opts = {}) {
    super(message, { status: 408, code: "timeout", ...opts, retryable: true });
  }
}

export class GrokInvalidRequestError extends GrokError {
  constructor(message, opts = {}) {
    super(message, { status: 400, code: "invalid_request", ...opts, retryable: false });
  }
}

export class GrokAbortError extends GrokError {
  constructor(message = "request aborted", opts = {}) {
    super(message, { code: "aborted", ...opts, retryable: false });
  }
}

/** xAI answers errors in two shapes: `{error:{message,code}}` and `{code, error:"message"}`. */
export function parseErrorBody(text) {
  let message = String(text || "").slice(0, 600);
  let code;
  try {
    const j = JSON.parse(text);
    if (j && typeof j === "object") {
      const e = j.error;
      if (e && typeof e === "object") { message = e.message || message; code = e.code || e.type; }
      else if (typeof e === "string") { message = e; code = j.code; }
      else if (j.message) { message = j.message; code = j.code; }
    }
  } catch { /* not JSON: keep the raw text */ }
  return { message: message || "unknown error", code };
}

/** Retry-After may be a delay in seconds or an HTTP date. Undefined when absent or unparseable. */
export function retryAfterMs(headerValue) {
  if (headerValue == null || headerValue === "") return undefined;
  const secs = Number(headerValue);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(headerValue);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** Build the right error class from an HTTP status + body text + headers. */
export function errorFromHttp(status, bodyText, headers) {
  const { message, code } = parseErrorBody(bodyText);
  const get = (k) => (headers?.get ? headers.get(k) : headers?.[k]);
  const data = { body: bodyText?.slice?.(0, 2000) };
  if (status === 401 || status === 403) return new GrokAuthError(`${status}: ${message}`, { status, data });
  if (status === 429) return new GrokRateLimitError(`429: ${message}`, { retryAfterMs: retryAfterMs(get("retry-after")), data });
  if (status === 408 || status === 504) return new GrokTimeoutError(`${status}: ${message}`, { status, data });
  if (status >= 500) return new GrokError(`${status}: ${message}`, { status, code: code || "server_error", retryable: true, data });
  // 404 on a chained response id is the one 4xx a long-lived loop must recognise and recover from.
  const c = code === "previous_response_not_found" || /previous_response/i.test(message) ? "previous_response_not_found" : code || "invalid_request";
  return new GrokInvalidRequestError(`${status}: ${message}`, { status, code: c, data });
}

/** Build the right error from a streamed / WebSocket `error` event payload. */
export function errorFromEvent(ev) {
  const e = ev?.error && typeof ev.error === "object" ? ev.error : ev || {};
  const code = e.code || ev?.code || "stream_error";
  const message = e.message || ev?.message || "xAI returned an error event";
  if (code === "previous_response_not_found") return new GrokInvalidRequestError(message, { code, status: 404 });
  if (/rate_limit/i.test(code)) return new GrokRateLimitError(message, { data: ev });
  if (/unauthori|invalid_api_key|permission/i.test(code)) return new GrokAuthError(message, { data: ev });
  return new GrokError(message, { code, retryable: code === "websocket_connection_limit_reached", data: ev });
}
