// Local server: node:http + ws on 127.0.0.1 implementing docs/CONTRACT.md. Shares the caller's runtime, so CLI
// messages show up in the dashboard and dashboard messages run through the same agent.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import { createGuards, sendJson, sendError, securityHeaders, HttpError } from "./http.js";
import { buildRoutes, handleApi, apiState } from "./routes.js";
import { serveDashboard } from "./static.js";
import { createHub } from "./ws.js";
import { hostedConfig, hostedToken } from "./hosted.js";
import { dashboardDist } from "../core/paths.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../core/log.js";

export async function startServer(rt, { port: wantPort, host: wantHost, token: fixedToken } = {}) {
  const hosted = hostedConfig();
  const port = Number(wantPort || hosted?.port || process.env.LUMEN_PORT || rt.config.server?.port || 4747);
  const host = wantHost || (hosted ? "0.0.0.0" : "127.0.0.1");
  const token = fixedToken || (hosted ? hostedToken() : randomBytes(24).toString("base64url"));
  const guards = createGuards(port, token, hosted);
  const hub = createHub(rt);
  const routes = buildRoutes(rt, hub);
  const coop = !!rt.config.server?.coop;
  const csp = rt.config.server?.csp !== false;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    securityHeaders(res, { port, coop, csp, hosted });
    if (!guards.hostOk(req)) return sendError(res, 403, "bad_host", "Host not allowed");
    if (req.method !== "GET" && req.method !== "HEAD" && !guards.originOk(req)) return sendError(res, 403, "bad_origin", "Origin not allowed");
    try {
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname !== "/api/health" && !guards.authed(req)) return sendError(res, 401, "unauthorized", "Open from the CLI: lumen dashboard");
        const { result } = await handleApi(routes, { req, res, url, rt });
        if (result !== null && !res.headersSent) sendJson(res, 200, result);
        return;
      }
      if (url.pathname === "/ws") return sendError(res, 426, "upgrade_required", "WebSocket only");
      if (url.searchParams.has("t")) {
        if (url.searchParams.get("t") !== token) return sendError(res, 401, "unauthorized", "This link is from an older session. Run lumen dashboard again.");
        // Keep the path so a login link can deep-link a page (e.g. /keys?t=…).
        res.writeHead(302, { "set-cookie": guards.cookie(), location: url.pathname });
        return res.end();
      }
      if (req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405, "method_not_allowed", "Method not allowed");
      serveDashboard(req, res, dashboardDist, rt.state());
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      if (status >= 500) log.error("api error", req.method, url.pathname, e);
      if (!res.headersSent) sendError(res, status, e.code && typeof e.code === "string" ? e.code : status >= 500 ? "internal" : "bad_request", e.message);
      else res.end();
    }
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname !== "/ws" || !guards.hostOk(req) || !guards.originOk(req) || !guards.authed(req)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return socket.destroy();
    }
    hub.wss.handleUpgrade(req, socket, head, (ws) => hub.wss.emit("connection", ws, req));
  });

  await new Promise((resolve, reject) => {
    server.once("error", (e) => reject(e.code === "EADDRINUSE" ? new Error(`Port ${port} is in use. Another Lumen dashboard may be running (set LUMEN_PORT to use another port).`) : e));
    server.listen(port, host, resolve);
  });

  const base = hosted?.publicHost ? `https://${hosted.publicHost}` : `http://127.0.0.1:${port}`;
  const loginUrl = `${base}/?t=${token}`;
  const openBrowser = () => {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
    exec(`${opener} "${loginUrl}"`, () => {});
  };
  // Takeover controller used by the `dashboard` tool.
  rt.dashboard = {
    async open() { if (!hub.clientCount()) openBrowser(); await hub.waitForUi(10_000); return base; },
    async op(op, args, opts) { if (!hub.clientCount()) openBrowser(); return hub.uiOp(op, args, opts); },
  };
  const srv = {
    url: base, loginUrl, token, port, hub, server, hosted: !!hosted, distExists: existsSync(join(dashboardDist, "index.html")),
    state: () => apiState(rt),
    async close() { hub.close(); await new Promise((r) => server.close(() => r())); server.closeAllConnections?.(); rt.server = null; },
  };
  rt.server = srv;
  return srv;
}
