// ~/.pulse (PULSE_HOME overrides): config.json (defaults deep-merged under the user's layer), keys.json 0600.
// Paths are resolved lazily so tests can point PULSE_HOME at a temp dir before each case.
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULTS = {
  model: { scan: "grok-4.3", judge: "grok-4.7", image: "grok-imagine-image-2.0", video: "grok-imagine-video-1.5-lite" },
  caps: { runUsd: 0.40, dayUsd: 5 },          // per-run default and the global per-day ceiling, enforced from cost ticks
  telegram: { chatId: null },                 // default chat for new routines; also the only chat the bot answers
  http: { port: 4800 },
};

export const pulseHome = () => process.env.PULSE_HOME || join(homedir(), ".pulse");

/** Lazy path getters: P.home, P.config, P.keys, P.db, P.logs. */
export const P = {
  get home() { return pulseHome(); },
  get config() { return join(pulseHome(), "config.json"); },
  get keys() { return join(pulseHome(), "keys.json"); },
  get db() { return join(pulseHome(), "pulse.db"); },
  get logs() { return join(pulseHome(), "logs"); },
};

export function ensureHome() {
  const home = pulseHome();
  for (const d of [home, P.logs]) if (!existsSync(d)) mkdirSync(d, { recursive: true, mode: 0o700 });
  try { chmodSync(home, 0o700); } catch { /* best effort on odd filesystems */ }
  return home;
}

export function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

/** Atomic write (tmp + rename) so a crash never leaves half a config or key file. */
export function writeJson(file, data, { mode = 0o644 } = {}) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode });
  renameSync(tmp, file);
  try { chmodSync(file, mode); } catch { /* ignore */ }
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
export function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) out[k] = isObj(v) && isObj(base?.[k]) ? deepMerge(base[k], v) : v;
  return out;
}

let cache = null, cacheHome = null;

export function getConfig() {
  const home = pulseHome();
  if (cache && cacheHome === home) return cache;
  ensureHome();
  cache = deepMerge(DEFAULTS, readJson(P.config, {}));
  cacheHome = home;
  return cache;
}

/** Deep-merge a patch into the user layer and persist it. Pass `null` for a key to reset it to the default. */
export function updateConfig(patch) {
  ensureHome();
  const user = readJson(P.config, {});
  const next = deepMerge(user, patch);
  writeJson(P.config, next);
  cache = deepMerge(DEFAULTS, next);
  cacheHome = pulseHome();
  return cache;
}

export function resetConfigCache() { cache = null; cacheHome = null; }

/** Key ids Pulse knows, with the env var that overrides each. Aliases keep `pulse keys set grok …` working. */
export const KEY_FIELDS = {
  xai: { label: "xAI (Grok) API key", env: "XAI_API_KEY", placeholder: "xai-…" },
  telegram: { label: "Telegram bot token", env: "TELEGRAM_BOT_TOKEN", placeholder: "123456:ABC…" },
  http: { label: "HTTP bearer token (POST /run/:id)", env: "PULSE_HTTP_TOKEN", placeholder: "any long random string" },
};
const KEY_ALIASES = { grok: "xai", "x.ai": "xai", tg: "telegram", bot: "telegram", token: "http" };
export const resolveKeyId = (id) => { const k = String(id || "").toLowerCase(); return KEY_FIELDS[k] ? k : KEY_ALIASES[k] || k; };

/** "xai-…a1b2": never more than a short prefix and the last 4 chars. */
export function mask(value) {
  const v = String(value || "");
  if (!v) return "";
  if (v.length < 12) return "…••••";
  const dash = v.indexOf("-");
  const colon = v.indexOf(":");
  const cutAt = dash > 0 && dash <= 6 ? dash + 1 : colon > 0 && colon <= 12 ? Math.min(colon, 4) : 3;
  return `${v.slice(0, cutAt)}…${v.slice(-4)}`;
}

/**
 * Map-like key store over keys.json (mode 0600). Env vars win over the file so a deployment can inject
 * secrets without touching disk; `list()` says which source each value came from and never prints it in full.
 */
export function getKeys({ env = process.env } = {}) {
  ensureHome();
  const file = P.keys;
  const load = () => readJson(file, {});
  const save = (data) => writeJson(file, data, { mode: 0o600 });
  return {
    get(id) {
      const k = resolveKeyId(id);
      const fromEnv = KEY_FIELDS[k]?.env && env[KEY_FIELDS[k].env];
      return fromEnv || load()[k] || null;
    },
    has(id) { return !!this.get(id); },
    set(id, value) {
      const k = resolveKeyId(id);
      const v = String(value ?? "").trim();
      if (!v) throw new Error("empty value");
      save({ ...load(), [k]: v });
      return k;
    },
    delete(id) {
      const k = resolveKeyId(id);
      const data = load();
      const had = k in data;
      delete data[k];
      save(data);
      return had;
    },
    list() {
      const data = load();
      const ids = [...new Set([...Object.keys(KEY_FIELDS), ...Object.keys(data)])];
      return ids.map((id) => {
        const fromEnv = KEY_FIELDS[id]?.env && env[KEY_FIELDS[id].env];
        const v = fromEnv || data[id] || "";
        return { id, label: KEY_FIELDS[id]?.label || id, env: KEY_FIELDS[id]?.env || null, set: !!v, masked: mask(v), source: fromEnv ? "env" : v ? "file" : null };
      });
    },
    file,
  };
}
