// Request helpers and local-only guards: Host/Origin checks, session cookie / dev header auth, JSON bodies.
import { timingSafeEqual } from "node:crypto";
import { hostedHostOk } from "./hosted.js";

export const COOKIE = "lumen_session";
export const DEV_PORT = 5174;

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

export const sendError = (res, status, code, message) => sendJson(res, status, { error: { code, message } });

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function createGuards(port, token, hosted = null) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `127.0.0.1:${DEV_PORT}`, `localhost:${DEV_PORT}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  const hostOf = (req) => String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
  const hostAllowed = (h) => hosts.has(h) || (!!hosted && hostedHostOk(hosted, h));
  return {
    // Behind a hosting proxy (Replit) the public name arrives as X-Forwarded-Host; locally it is Host.
    hostOk: (req) => hostAllowed(String(req.headers.host || "").toLowerCase()) || (!!hosted && hostAllowed(hostOf(req))),
    /** Writes and sockets: same origin, or no Origin (curl/scripts on this machine). */
    originOk: (req) => {
      const o = String(req.headers.origin || "").toLowerCase();
      if (!o || origins.has(o)) return true;
      if (!hosted) return false;
      try { const u = new URL(o); return u.protocol === "https:" && hostAllowed(u.host) && u.host === hostOf(req).replace(/:443$/, ""); } catch { return false; }
    },
    authed: (req) => safeEqual(parseCookies(req.headers.cookie)[COOKIE], token) || safeEqual(req.headers["x-lumen-token"], token),
    // Hosted: Secure + SameSite=None + Partitioned so the cookie also works inside Replit's preview iframe.
    cookie: () => `${COOKIE}=${token}; Path=/; HttpOnly; ${hosted ? "Secure; SameSite=None; Partitioned" : "SameSite=Strict"}`,
  };
}

export function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, "too_large", `Body too large (max ${Math.round(limit / 1024 / 1024)} MB)`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function readJsonBody(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { const v = JSON.parse(buf.toString("utf8")); return v && typeof v === "object" ? v : {}; } catch { throw new HttpError(400, "bad_json", "Invalid JSON body"); }
}

export function securityHeaders(res, { port, coop = false, csp = true, hosted = null } = {}) {
  const framers = hosted?.frameAncestors?.length ? hosted.frameAncestors.join(" ") : "'none'";
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  if (!hosted?.frameAncestors?.length) res.setHeader("x-frame-options", "DENY");
  if (coop) { res.setHeader("cross-origin-opener-policy", "same-origin"); res.setHeader("cross-origin-embedder-policy", "require-corp"); }
  if (csp) res.setHeader("content-security-policy", [
    "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval' blob:", "worker-src 'self' blob:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:", "media-src 'self' data: blob: https:", "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' blob: data: https: ${hosted ? "wss: " : ""}ws://127.0.0.1:${port} ws://localhost:${port}`, `frame-ancestors ${framers}`, "base-uri 'none'", "object-src 'none'",
  ].join("; "));
}
