// Update reminders. Once a day (cached in ~/.lumen/update.json) ask the npm registry for the latest versions
// of the @useclaudia packages and lumen-agent, compare with what's installed, and tell the user.
import { readFileSync, existsSync } from "node:fs";
import { join, sep } from "node:path";
import { spawn } from "node:child_process";
import { ROOT, P } from "./paths.js";
import { readJson, writeJson } from "./fsx.js";
import { compare } from "./semver.js";

export const PACKAGES = ["@useclaudia/sdk", "@useclaudia/media", "@useclaudia/social", "lumen-agent"];
export const LUMEN_ID = "lumen-terminal-agent";
export const DAY = 24 * 60 * 60 * 1000;

export function installedVersion(name, root = ROOT) {
  try {
    const file = name === "lumen-agent" ? join(root, "package.json") : join(root, "node_modules", ...name.split("/"), "package.json");
    return JSON.parse(readFileSync(file, "utf8")).version || null;
  } catch { return null; }
}

const isGlobalInstall = (root = ROOT) => root.split(sep).includes("node_modules");

export function commandFor(name, root = ROOT) {
  if (name === "lumen-agent") return isGlobalInstall(root) ? "npm install -g lumen-agent@latest" : "git pull && npm install";
  return `lumen update`;
}

async function latestOf(name, { fetchImpl = fetch, timeoutMs = 1500 } = {}) {
  const res = await fetchImpl(`https://registry.npmjs.org/${name}/latest`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
  if (res.status === 404) return null; // unpublished
  if (!res.ok) throw new Error(`registry ${res.status}`);
  const j = await res.json();
  // "lumen-agent" on npm may belong to someone else: only trust it when it carries our identity marker.
  if (name === "lumen-agent" && j.lumen?.id !== LUMEN_ID) return null;
  return j.version || null;
}

export function shapeResults(latest, { root = ROOT } = {}) {
  return PACKAGES.filter((n) => latest[n] !== undefined).map((name) => {
    const current = installedVersion(name, root);
    const l = latest[name];
    return { name, current, latest: l, outdated: !!(l && current && compare(current, l) < 0), command: commandFor(name, root) };
  }).filter((r) => r.latest || r.current);
}

/**
 * Returns UpdateInfo[] = { name, current, latest, outdated, command }.
 * Uses the cache when younger than 24 h unless force. Never throws.
 */
export async function checkUpdates({ force = false, timeoutMs = 1500, fetchImpl = fetch, cacheFile = P.update, now = Date.now(), root = ROOT, env = process.env } = {}) {
  const cache = readJson(cacheFile, null);
  const fresh = cache?.checkedAt && now - cache.checkedAt < DAY;
  if ((!force && fresh) || (!force && (env.CI || env.LUMEN_NO_UPDATE_CHECK))) return shapeResults(cache?.latest || {}, { root });
  const latest = {};
  await Promise.all(PACKAGES.map(async (n) => {
    try { latest[n] = await latestOf(n, { fetchImpl, timeoutMs }); } catch { if (cache?.latest?.[n]) latest[n] = cache.latest[n]; }
  }));
  try { writeJson(cacheFile, { checkedAt: now, latest }); } catch { /* read-only home */ }
  return shapeResults(latest, { root });
}

/** Cached results only (no network). */
export function cachedUpdates({ cacheFile = P.update, root = ROOT } = {}) {
  return shapeResults(readJson(cacheFile, {})?.latest || {}, { root });
}

/** Run npm install <pkg>@latest in the install dir, streaming output. Resolves { ok, log }. */
export function installUpdates(names, { onData = () => {}, root = ROOT } = {}) {
  const want = (names?.length ? names : PACKAGES).filter((n) => PACKAGES.includes(n));
  const deps = want.filter((n) => n !== "lumen-agent");
  const logLines = [];
  const emit = (s) => { logLines.push(s); onData(s); };
  if (want.includes("lumen-agent")) emit(isGlobalInstall(root) ? "To update Lumen itself run: npm install -g lumen-agent@latest\n" : "Lumen runs from a source checkout: update it with `git pull && npm install`.\n");
  if (!deps.length) return Promise.resolve({ ok: true, log: logLines.join("") });
  if (!existsSync(join(root, "package.json"))) return Promise.resolve({ ok: false, log: "No package.json in the install directory." });
  return new Promise((resolve) => {
    const args = ["install", "--no-audit", "--no-fund", ...deps.map((n) => `${n}@latest`)];
    emit(`$ npm ${args.join(" ")}\n`);
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd: root, env: process.env });
    child.stdout.on("data", (d) => emit(String(d)));
    child.stderr.on("data", (d) => emit(String(d)));
    child.on("error", (e) => { emit(`npm failed to start: ${e.message}\n`); resolve({ ok: false, log: logLines.join("") }); });
    child.on("close", (code) => {
      try { writeJson(P.update, { checkedAt: 0, latest: {} }); } catch { /* force recheck next time */ }
      resolve({ ok: code === 0, log: logLines.join("") });
    });
  });
}
