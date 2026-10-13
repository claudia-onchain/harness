// Static files: dashboard/dist with SPA fallback (or a friendly placeholder), and media/uploads with Range.
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { VERSION } from "../version.js";

export const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".map": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".wasm": "application/wasm", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".flac": "audio/flac", ".aac": "audio/aac", ".m4a": "audio/mp4", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
};

/** Resolve a URL path under root; null if it escapes. */
export function safeJoin(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  const full = resolve(root, "." + (p.startsWith("/") ? p : "/" + p));
  return full === resolve(root) || full.startsWith(resolve(root) + sep) ? full : null;
}

/** Serve a file with Range support. */
export function sendFile(req, res, file, { cache = "no-cache" } = {}) {
  let st;
  try { st = statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const type = MIME[extname(file).toLowerCase()] || "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": cache, "last-modified": st.mtime.toUTCString() };
  if (range) {
    let start = range[1] === "" ? st.size - Number(range[2]) : Number(range[1]);
    let end = range[1] === "" || range[2] === "" ? st.size - 1 : Math.min(Number(range[2]), st.size - 1);
    if (!(start >= 0) || start > end || start >= st.size) {
      res.writeHead(416, { "content-range": `bytes */${st.size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...base, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") return res.end(), true;
    createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...base, "content-length": st.size });
  if (req.method === "HEAD") return res.end(), true;
  createReadStream(file).pipe(res);
  return true;
}

export function placeholderPage(state) {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lumen</title>
<style>:root{--bg:#07080c;--panel:#0e1016;--line:#1c2030;--text:#e8ecf4;--muted:#8a93a6;--a:#7c5cff;--b:#22d3ee}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(1200px 600px at 20% -10%,#1a1440 0,transparent 60%),var(--bg);color:var(--text);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.card{max-width:560px;margin:24px;padding:32px;border:1px solid var(--line);border-radius:18px;background:color-mix(in srgb,var(--panel) 92%,transparent);box-shadow:0 30px 80px rgba(0,0,0,.45)}
h1{margin:0 0 6px;font-size:34px;letter-spacing:.08em;background:linear-gradient(90deg,var(--a),var(--b));-webkit-background-clip:text;background-clip:text;color:transparent}
p{color:var(--muted)}code{background:#000;border:1px solid var(--line);padding:2px 8px;border-radius:6px;color:var(--b)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.chip{border:1px solid var(--line);border-radius:999px;padding:4px 12px;color:var(--muted);font-size:13px}</style></head>
<body><main class="card"><h1>LUMEN</h1><p>The agent is running, but the dashboard hasn't been built yet.</p>
<p>Build it once with <code>npm run build</code> in the Lumen folder, then reload this page.</p>
<div class="row"><span class="chip">v${esc(VERSION)}</span><span class="chip">${esc(state.persona?.name)}</span><span class="chip">${esc(state.model ? state.model.provider + ":" + state.model.id : "no model")}</span><span class="chip">chain ${esc(state.chain)}</span></div>
<p style="margin-top:22px;font-size:13px">API: <code>/api/health</code> · WebSocket: <code>/ws</code></p></main></body></html>`;
}

export function serveDashboard(req, res, dist, state) {
  const url = new URL(req.url, "http://x");
  if (!existsSync(join(dist, "index.html"))) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(placeholderPage(state));
    return;
  }
  const file = safeJoin(dist, url.pathname);
  if (file && file !== resolve(dist) && sendFile(req, res, file, { cache: url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" })) return;
  if (extname(url.pathname) && url.pathname !== "/") { res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found"); return; }
  sendFile(req, res, join(dist, "index.html"));
}
