// JSON API wrapper. Same-origin cookie auth; in dev the x-lumen-token header (VITE_LUMEN_TOKEN) also works.

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** App-wide event bus: "unauthorized", "offline", "online", "media", "skills"... */
export const bus = new EventTarget();
export const emitBus = (name: string, detail?: unknown) => bus.dispatchEvent(new CustomEvent(name, { detail }));

const DEV_TOKEN = (import.meta.env.VITE_LUMEN_TOKEN as string | undefined) || "";
export const authHeaders = (): Record<string, string> => (DEV_TOKEN ? { "x-lumen-token": DEV_TOKEN } : {});

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 20000);
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || (opts.body !== undefined || opts.raw !== undefined ? "POST" : "GET"),
      headers: { ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}), ...authHeaders(), ...opts.headers },
      body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: "same-origin",
      signal: ctl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    emitBus("offline");
    throw new ApiError(0, "Lumen server is not reachable", "offline");
  }
  clearTimeout(timer);
  let data: any = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    if (res.status === 401) emitBus("unauthorized");
    // Vite dev server without a backend answers proxied calls with 5xx/HTML.
    if (res.status >= 500 && data == null) emitBus("offline");
    const err = data?.error;
    throw new ApiError(res.status, err?.message || (typeof err === "string" ? err : `Request failed (${res.status})`), err?.code);
  }
  if (data == null && text && !text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    // SPA fallback answered instead of the API → no backend.
    emitBus("offline");
    throw new ApiError(0, "Lumen server is not reachable", "offline");
  }
  return data as T;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const isOffline = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.code === "offline");

/** Upload raw bytes to /api/uploads. */
export async function upload(blob: Blob, filename: string): Promise<{ path: string; url: string }> {
  return api("/api/uploads", { method: "POST", raw: blob, headers: { "x-filename": filename, "Content-Type": blob.type || "application/octet-stream" }, timeoutMs: 120000 });
}
