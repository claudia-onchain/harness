// Hosted mode (Replit and similar): the dashboard is served on 0.0.0.0 behind the host's HTTPS proxy.
// Turned on by LUMEN_HOSTED=1 or automatically when REPL_ID is set. Local runs are unaffected.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { home } from "../core/paths.js";

const REPLIT_SUFFIXES = [".replit.dev", ".replit.app", ".repl.co", ".replit.com"];
const REPLIT_FRAMERS = ["https://replit.com", "https://*.replit.com", "https://*.replit.dev"];

const list = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const bare = (h) => String(h || "").trim().toLowerCase().replace(/:\d+$/, "");

export function hostedConfig(env = process.env) {
  if (env.LUMEN_HOSTED !== "1" && !env.REPL_ID) return null;
  const onReplit = !!env.REPL_ID || !!env.REPLIT_DEV_DOMAIN;
  const hosts = [env.REPLIT_DEV_DOMAIN, ...list(env.REPLIT_DOMAINS), ...list(env.LUMEN_ALLOWED_HOSTS)].map(bare).filter(Boolean);
  return {
    hosts: new Set(hosts),
    suffixes: onReplit ? REPLIT_SUFFIXES : [],
    frameAncestors: onReplit ? REPLIT_FRAMERS : list(env.LUMEN_FRAME_ANCESTORS),
    publicHost: hosts[0] || null,
    port: Number(env.LUMEN_PORT || env.PORT) || undefined,
  };
}

/** True when a Host / X-Forwarded-Host value belongs to this hosted deployment. */
export function hostedHostOk(cfg, host) {
  const h = bare(host);
  if (!h) return false;
  return cfg.hosts.has(h) || cfg.suffixes.some((s) => h.endsWith(s));
}

/** Stable access token: LUMEN_DASHBOARD_TOKEN (e.g. a Replit Secret), else one generated once and kept in LUMEN_HOME. */
export function hostedToken(env = process.env) {
  if (env.LUMEN_DASHBOARD_TOKEN) return env.LUMEN_DASHBOARD_TOKEN;
  const file = join(home(), "server-token");
  try { const t = readFileSync(file, "utf8").trim(); if (t.length >= 24) return t; } catch { /* first run */ }
  const t = randomBytes(24).toString("base64url");
  if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, t + "\n", { mode: 0o600 });
  return t;
}
