// Shared helpers: fetch with timeout, formatting, ids.
import { randomBytes } from "node:crypto";

export const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener?.("abort", () => { clearTimeout(t); reject(new Error("aborted")); }, { once: true });
});

export const id = (prefix = "") => `${prefix}${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;

export const clip = (s, n = 400) => {
  const x = String(s ?? "");
  return x.length > n ? x.slice(0, n) + "…" : x;
};

export const oneLine = (s, n = 160) => clip(String(s ?? "").replace(/\s+/g, " ").trim(), n);

export class HttpStatusError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}

/** fetch() with a timeout and an optional outer signal. */
export async function fetchT(url, opts = {}, ms = 15000) {
  const timeout = AbortSignal.timeout(ms);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  return fetch(url, { ...opts, signal });
}

/** GET/POST JSON with a timeout; throws HttpStatusError on non-2xx. */
export async function fetchJson(url, opts = {}, ms = 15000) {
  const headers = { accept: "application/json", ...(opts.body && typeof opts.body !== "string" ? { "content-type": "application/json" } : {}), ...opts.headers };
  const body = opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body;
  const res = await fetchT(url, { ...opts, headers, body }, ms);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && typeof data === "object" && (data.error?.message || data.message || data.error)) || text.slice(0, 300) || res.statusText;
    throw new HttpStatusError(res.status, `${res.status} ${typeof msg === "string" ? msg : JSON.stringify(msg)}`.slice(0, 500), data);
  }
  return data;
}

export function fmtUsd(n, { compact = false } = {}) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "n/a";
  const v = Number(n);
  if (compact && Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (compact && Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (compact && Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  if (Math.abs(v) >= 1) return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v === 0) return "$0.00";
  return `$${v.toPrecision(4)}`;
}

export function fmtAmount(n, maxFrac = 6) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  if (v === 0) return "0";
  if (Math.abs(v) < 10 ** -maxFrac) return v.toExponential(2);
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 1000 ? 2 : maxFrac });
}

export function fmtTokens(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(v);
}

/** Format a bigint/str integer amount with decimals into a decimal string. */
export function formatUnits(value, decimals) {
  const v = BigInt(value);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export function parseUnits(str, decimals) {
  const s = String(str).trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") throw new Error(`Invalid amount: ${str}`);
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) throw new Error(`Too many decimals (max ${decimals})`);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export const isTruthy = (v) => /^(1|true|yes|on)$/i.test(String(v ?? ""));

export function deepMerge(base, over) {
  if (Array.isArray(over)) return over.slice();
  if (!over || typeof over !== "object") return over === undefined ? base : over;
  const out = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}
