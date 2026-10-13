// Key store: ~/.lumen/keys.json (mode 0600), env vars override the file.
// Optional passphrase encryption (scrypt + AES-256-GCM, see vault.js): `lumen keys lock` encrypts at rest;
// a locked file is opened with LUMEN_PASSPHRASE or an interactive prompt. Keys are never printed in full.
import { existsSync, readFileSync } from "node:fs";
import { P, ensureHome } from "./paths.js";
import { readJson, writeJson } from "./fsx.js";
import { seal, open } from "./vault.js";

/** Every field Lumen knows: id -> { label, env: [names, first wins], secret, placeholder } */
export const FIELDS = {
  anthropic: { label: "Anthropic API key", env: ["ANTHROPIC_API_KEY"], placeholder: "sk-ant-…" },
  openai: { label: "OpenAI API key", env: ["OPENAI_API_KEY"], placeholder: "sk-…" },
  xai: { label: "xAI (Grok) API key", env: ["XAI_API_KEY"], placeholder: "xai-…" },
  openrouter: { label: "OpenRouter API key", env: ["OPENROUTER_API_KEY"], placeholder: "sk-or-…" },
  gemini: { label: "Gemini API key", env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], placeholder: "AIza…" },
  customBaseUrl: { label: "Custom OpenAI-compatible base URL", env: ["LUMEN_CUSTOM_BASE_URL"], placeholder: "https://host/v1", secret: false },
  customKey: { label: "Custom endpoint API key", env: ["LUMEN_CUSTOM_API_KEY"], placeholder: "optional" },
  alchemy: { label: "Alchemy API key", env: ["ALCHEMY_API_KEY"], placeholder: "alcht_…" },
  etherscan: { label: "Etherscan V2 API key", env: ["ETHERSCAN_API_KEY"], placeholder: "ABC123…" },
  helius: { label: "Helius API key", env: ["HELIUS_API_KEY"], placeholder: "uuid" },
  coingecko: { label: "CoinGecko demo API key", env: ["COINGECKO_API_KEY"], placeholder: "CG-…" },
  jupiter: { label: "Jupiter API key", env: ["JUPITER_API_KEY"], placeholder: "optional" },
  zerox: { label: "0x API key", env: ["ZEROX_API_KEY"], placeholder: "uuid" },
  lifi: { label: "LI.FI API key", env: ["LIFI_API_KEY"], placeholder: "optional" },
  fal: { label: "fal.ai key", env: ["FAL_KEY"], placeholder: "key-id:secret" },
  elevenlabs: { label: "ElevenLabs API key", env: ["ELEVENLABS_API_KEY"], placeholder: "sk_…" },
  replicate: { label: "Replicate API token", env: ["REPLICATE_API_TOKEN"], placeholder: "r8_…" },
  heygen: { label: "HeyGen API key", env: ["HEYGEN_API_KEY"], placeholder: "…" },
  runway: { label: "Runway API key", env: ["RUNWAY_API_KEY", "RUNWAYML_API_SECRET"], placeholder: "key_…" },
  byteplus: { label: "BytePlus ModelArk key", env: ["BYTEPLUS_API_KEY", "ARK_API_KEY"], placeholder: "…" },
  brave: { label: "Brave Search API key", env: ["BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY"], placeholder: "BSA…" },
  tavily: { label: "Tavily API key", env: ["TAVILY_API_KEY"], placeholder: "tvly-…" },
  exa: { label: "Exa API key", env: ["EXA_API_KEY"], placeholder: "…" },
  telegram: { label: "Telegram bot token", env: ["TELEGRAM_BOT_TOKEN"], placeholder: "123:ABC…" },
  evmPrivateKey: { label: "EVM wallet private key", env: ["LUMEN_EVM_PRIVATE_KEY"], placeholder: "0x… (64 hex)", wallet: true },
  solanaSecret: { label: "Solana wallet secret", env: ["LUMEN_SOLANA_SECRET"], placeholder: "base58 or [json array]", wallet: true },
};

/** Friendly names accepted by `lumen keys set` and PUT /api/keys. */
export const FIELD_ALIASES = {
  wallet: "evmPrivateKey", "wallet-evm": "evmPrivateKey", evm: "evmPrivateKey", "evm-wallet": "evmPrivateKey",
  "wallet-solana": "solanaSecret", "solana-wallet": "solanaSecret", "solana": "solanaSecret",
  "0x": "zerox", zeroex: "zerox", google: "gemini", grok: "xai", claude: "anthropic", "li.fi": "lifi", custom: "customBaseUrl",
};
export const resolveField = (f) => (FIELDS[f] ? f : FIELD_ALIASES[String(f || "").toLowerCase()] || f);

/** "sk-…a1b2" style mask. Never returns more than a short prefix and the last 4 chars. */
export function mask(value) {
  const v = String(value || "");
  if (!v) return "";
  if (/^https?:\/\//.test(v)) return v; // URLs are not secret
  if (v.length < 12) return "…" + "•".repeat(4);
  const dash = v.indexOf("-");
  const prefix = dash > 0 && dash <= 6 ? v.slice(0, dash + 1) : v.slice(0, 2);
  return `${prefix}…${v.slice(-4)}`;
}

export class KeyStore {
  constructor({ file = P.keys, env = process.env } = {}) {
    this.file = file;
    this.env = env;
    this.values = {};
    this.encrypted = false;
    this.locked = false;
    this.passphrase = null;
    this.load();
  }

  load() {
    ensureHome();
    const raw = readJson(this.file, null);
    this.values = {};
    this.encrypted = !!raw?.encrypted;
    this.locked = this.encrypted;
    if (raw?.encrypted) {
      const pass = this.env.LUMEN_PASSPHRASE;
      if (pass) { try { this.unlock(pass); } catch { /* stays locked */ } }
    } else if (raw?.keys && typeof raw.keys === "object") {
      this.values = { ...raw.keys };
    }
    return this;
  }

  unlock(passphrase) {
    const raw = readJson(this.file, null);
    if (!raw?.encrypted) { this.locked = false; return true; }
    this.values = open(raw.encrypted, passphrase) || {};
    this.passphrase = passphrase;
    this.locked = false;
    return true;
  }

  save() {
    if (this.locked) throw new Error("keys.json is encrypted and locked. Unlock it first (LUMEN_PASSPHRASE or `lumen keys unlock`).");
    const body = this.encrypted && this.passphrase
      ? { version: 1, encrypted: seal(this.values, this.passphrase), updatedAt: new Date().toISOString() }
      : { version: 1, keys: this.values, updatedAt: new Date().toISOString() };
    writeJson(this.file, body, { mode: 0o600 });
  }

  /** Encrypt keys.json with a passphrase. */
  lock(passphrase) {
    if (String(passphrase || "").length < 8) throw new Error("Use a passphrase of at least 8 characters.");
    if (this.locked) throw new Error("Already locked.");
    this.encrypted = true;
    this.passphrase = passphrase;
    this.save();
  }

  /** Remove encryption (store plain, 0600). */
  decrypt(passphrase) {
    this.unlock(passphrase);
    this.encrypted = false;
    this.passphrase = null;
    this.save();
  }

  envName(field) {
    const f = FIELDS[field];
    return f?.env?.find((n) => this.env[n]) || null;
  }

  /** Value for a field: env first, then file. */
  get(field) {
    field = resolveField(field);
    const n = this.envName(field);
    if (n) return String(this.env[n]).trim();
    const v = this.values[field];
    return typeof v === "string" && v ? v : "";
  }

  has(field) { return !!this.get(field); }

  source(field) {
    if (this.envName(field)) return "env";
    return this.values[field] ? "file" : null;
  }

  set(field, value) {
    field = resolveField(field);
    if (!FIELDS[field] && !/^[a-zA-Z][\w.-]{0,63}$/.test(field)) throw new Error(`Unknown key field: ${field}`);
    if (value === null || value === undefined || value === "") delete this.values[field];
    else this.values[field] = String(value).trim();
    this.save();
  }

  unset(field) { this.set(field, null); }

  /** Import KEY=VALUE lines from a .env file; returns the field ids imported. */
  importEnv(path) {
    const text = readFileSync(path, "utf8");
    const byEnv = {};
    for (const [id, f] of Object.entries(FIELDS)) for (const n of f.env) byEnv[n] = id;
    const got = [];
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || !byEnv[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!v) continue;
      this.values[byEnv[m[1]]] = v;
      got.push(byEnv[m[1]]);
    }
    if (got.length) this.save();
    return got;
  }

  list() {
    return Object.entries(FIELDS).map(([id, f]) => {
      const v = this.get(id);
      return { id, label: f.label, configured: !!v, masked: f.secret === false ? v : mask(v), source: this.source(id), env: f.env[0], wallet: !!f.wallet };
    });
  }

  fileExists() { return existsSync(this.file); }
}

let shared = null;
export function getKeys() { return shared || (shared = new KeyStore()); }
export function resetKeys() { shared = null; }
