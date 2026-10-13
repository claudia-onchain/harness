// Where Lumen keeps its files. Everything lives under ~/.lumen (override with LUMEN_HOME).
import { mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** The install directory (the folder holding package.json). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SUBDIRS = ["sessions", "media", "uploads", "memory", "personas", "plugins", "skills", "logs"];

export function home() {
  return process.env.LUMEN_HOME || join(homedir(), ".lumen");
}

/** Paths are computed lazily so tests can set LUMEN_HOME before first use. */
export const P = {
  get home() { return home(); },
  get config() { return join(home(), "config.json"); },
  get keys() { return join(home(), "keys.json"); },
  get update() { return join(home(), "update.json"); },
  get state() { return join(home(), "state.json"); },
  get sessions() { return join(home(), "sessions"); },
  get media() { return join(home(), "media"); },
  get mediaJobs() { return join(home(), "media", "jobs.json"); },
  get uploads() { return join(home(), "uploads"); },
  get memory() { return join(home(), "memory"); },
  get memoryFile() { return join(home(), "memory", "MEMORY.md"); },
  get personas() { return join(home(), "personas"); },
  get plugins() { return join(home(), "plugins"); },
  get dashboardPlugins() { return join(home(), "plugins", "dashboard"); },
  get skills() { return join(home(), "skills"); },
  get logs() { return join(home(), "logs"); },
  get history() { return join(home(), "history.json"); },
  get spend() { return join(home(), "spend.json"); },
  get feedsCache() { return join(home(), "cache"); },
};

let ensured = null;
/** Create ~/.lumen and its subfolders (idempotent, mode 0700 for the root). */
export function ensureHome() {
  const h = home();
  if (ensured === h) return h;
  if (!existsSync(h)) mkdirSync(h, { recursive: true, mode: 0o700 });
  for (const d of [...SUBDIRS, "cache"]) mkdirSync(join(h, d), { recursive: true });
  ensured = h;
  return h;
}

export const builtinPersonasDir = join(ROOT, "personas");
export const skillsDir = join(ROOT, "skills");
export const nativeDir = join(ROOT, "native");
export const dashboardDist = join(ROOT, "dashboard", "dist");
