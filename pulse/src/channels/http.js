// Small JSON HTTP surface on 127.0.0.1: health, recent alerts, routines, and a token-gated trigger.
// No body parsing beyond the URL: POST /run/:id only needs the id and a bearer token.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

export function createHttp({ store, scheduler, token = null, port = 4800, host = "127.0.0.1", log, version = "0.1.0" } = {}) {
  const lg = log || { info() {}, warn() {}, error() {} };
  const started = Date.now();
  let server = null;

  const send = (res, status, body) => {
    const data = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(data), "cache-control": "no-store" });
    res.end(data);
  };

  const authed = (req) => {
    if (!token) return false;
    const h = String(req.headers.authorization || "");
    const got = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    const a = Buffer.from(got), b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  async function route(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "GET" && path === "/health") {
      return send(res, 200, { ok: true, version, uptimeSec: Math.round((Date.now() - started) / 1000), routines: store.routines.list().length, running: scheduler?.running ?? [], scheduler: !!scheduler?.active, pendingApprovals: store.approvals.listPending().length, db: store.path });
    }
    if (req.method === "GET" && path === "/alerts") {
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 20));
      const routineId = url.searchParams.get("routine") || undefined;
      return send(res, 200, { alerts: store.alerts.list({ limit, routineId }) });
    }
    if (req.method === "GET" && path === "/routines") return send(res, 200, { routines: store.routines.list() });
    const m = /^\/run\/([A-Za-z0-9_-]+)$/.exec(path);
    if (m) {
      if (req.method !== "POST") return send(res, 405, { error: "POST only" });
      if (!token) return send(res, 503, { error: "no PULSE_HTTP_TOKEN configured; run `pulse keys set http <token>`" });
      if (!authed(req)) return send(res, 401, { error: "bad or missing bearer token" });
      const rt = store.routines.get(m[1]);
      if (!rt) return send(res, 404, { error: `no routine ${m[1]}` });
      if (!scheduler) return send(res, 503, { error: "scheduler not available" });
      if (scheduler.isRunning(rt.id)) return send(res, 409, { error: "already running", routineId: rt.id });
      const p = scheduler.runNow(rt.id);
      p.catch(() => {});
      lg.info("http.run", { routineId: rt.id });
      return send(res, 202, { accepted: true, routineId: rt.id });
    }
    send(res, 404, { error: "not found" });
  }

  function start() {
    return new Promise((resolve, reject) => {
      server = createServer((req, res) => route(req, res).catch((e) => { lg.error("http.fail", e); if (!res.headersSent) send(res, 500, { error: e.message }); }));
      server.once("error", reject);
      server.listen(port, host, () => { server.off("error", reject); const a = server.address(); lg.info("http.listen", { host, port: a.port }); resolve(a.port); });
    });
  }

  function stop() { return new Promise((r) => (server ? server.close(() => r()) : r())); }

  return { start, stop, get port() { return server?.address()?.port ?? port; }, get host() { return host; } };
}
