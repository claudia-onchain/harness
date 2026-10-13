// config.json: user settings deep-merged over defaults. Unknown keys are kept.
import { P, ensureHome } from "./paths.js";
import { readJson, writeJson } from "./fsx.js";
import { deepMerge } from "./util.js";

export const DEFAULTS = {
  model: { provider: "", id: "" },          // empty = pick the first configured provider's default
  roles: { fast: null, vision: null },       // {provider,id} per role; null = derive from catalog
  fallback: null,                            // {provider,id} tried once when the main model fails
  cycle: [],                                 // ["anthropic:claude-opus-5-5", ...] for Ctrl+P; empty = one per configured provider
  thinking: "medium",                        // off | low | medium | high | xhigh
  maxTokens: 32000,
  persona: "lumen",
  chain: "ethereum",
  approvalMode: "always-ask",                // always-ask | write | yolo
  maxRounds: 24,
  tools: {},                                 // { toolName: false } disables a tool
  addDirs: [],                               // extra folders file tools may touch
  shell: { timeoutSec: 120, maxOutput: 30000 },
  wallet: { maxUsdPerTx: 25, maxUsdPerDay: 100 },
  media: { approveAboveUsd: 0.5, open: true },
  server: { port: 4747, coop: false },
  ui: { boot: true, showThinking: false, ascii: false },
  update: { check: true },
  plugins: { disabled: [] },
  providers: { custom: { baseUrl: "", name: "Custom" } },
  search: { provider: "auto" },
};

let cache = null;

export function loadConfig() {
  ensureHome();
  cache = deepMerge(DEFAULTS, readJson(P.config, {}));
  return cache;
}

export function getConfig() {
  return cache || loadConfig();
}

/** Apply a patch (deep merge) and persist only the user layer. */
export function updateConfig(patch) {
  const user = readJson(P.config, {});
  const next = deepMerge(user, patch);
  writeJson(P.config, next);
  cache = deepMerge(DEFAULTS, next);
  return cache;
}

/** Set a dotted path, e.g. setConfigPath("wallet.maxUsdPerTx", 50). */
export function setConfigPath(path, value) {
  const patch = {};
  const parts = path.split(".");
  let cur = patch;
  parts.slice(0, -1).forEach((p) => { cur[p] = {}; cur = cur[p]; });
  cur[parts.at(-1)] = value;
  return updateConfig(patch);
}

export function resetConfigCache() { cache = null; }
