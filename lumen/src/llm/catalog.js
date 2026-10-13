// LLM providers and the built-in model catalog (defaults per role, context, vision, list prices).
// Prices are USD per 1M tokens and are an estimate only; unknown prices are null (shown as "unpriced").

export const THINKING_LEVELS = ["off", "low", "medium", "high", "xhigh"];

const m = (id, o = {}) => ({ id, name: o.name || id, context: o.context ?? null, vision: o.vision ?? true, tools: o.tools ?? true, price: o.price ?? null });

export const LLM = {
  anthropic: {
    name: "Anthropic", kind: "anthropic", key: "anthropic", baseUrl: "https://api.anthropic.com/v1",
    docs: "https://console.anthropic.com/settings/keys",
    roles: { default: "claude-opus-5-5", fast: "claude-haiku-5-5", vision: "claude-opus-5-5" },
    models: [
      m("claude-opus-5-5", { name: "Claude Opus 5.5", context: 1_000_000, price: { in: 4, out: 20 } }),
      m("claude-sonnet-5-5", { name: "Claude Sonnet 5.5", context: 1_000_000, price: { in: 2, out: 10 } }),
      m("claude-haiku-5-5", { name: "Claude Haiku 5.5", context: 1_000_000, price: { in: 0.1, out: 0.5 } }),
      m("claude-fable-5-1", { name: "Claude Fable 5.1", context: 1_000_000, price: { in: 10, out: 50 } }),
    ],
  },
  openai: {
    name: "OpenAI", kind: "openai", key: "openai", baseUrl: "https://api.openai.com/v1", usage: "openai",
    docs: "https://platform.openai.com/api-keys",
    roles: { default: "gpt-6.1-sol", fast: "gpt-6-luna", vision: "gpt-6.1-sol" },
    models: [m("gpt-6-astra", { name: "GPT-6 Astra" }), m("gpt-6.1-sol", { name: "GPT-6.1 Sol" }), m("gpt-6-luna", { name: "GPT-6 Luna" })],
  },
  xai: {
    name: "xAI (Grok)", kind: "openai", key: "xai", baseUrl: "https://api.x.ai/v1", usage: "openai",
    docs: "https://console.x.ai",
    roles: { default: "grok-4.7", fast: "grok-4.3", vision: "grok-4.7" },
    models: [m("grok-4.7", { name: "Grok 4.7", context: 500_000 }), m("grok-4.3", { name: "Grok 4.3", context: 1_000_000 }), m("grok-build-0.1", { name: "Grok Build 0.1", vision: false })],
  },
  openrouter: {
    name: "OpenRouter", kind: "openai", key: "openrouter", baseUrl: "https://openrouter.ai/api/v1", usage: "openrouter",
    docs: "https://openrouter.ai/settings/keys",
    roles: { default: "anthropic/claude-opus-5.5", fast: "google/gemini-3.8-flash", vision: "anthropic/claude-opus-5.5" },
    models: [
      m("anthropic/claude-opus-5.5", { name: "Claude Opus 5.5", context: 1_000_000, price: { in: 4, out: 20 } }),
      m("anthropic/claude-sonnet-5.5", { name: "Claude Sonnet 5.5", context: 1_000_000, price: { in: 2, out: 10 } }),
      m("openai/gpt-6-astra", { name: "GPT-6 Astra" }),
      m("x-ai/grok-4.7", { name: "Grok 4.7", context: 500_000 }),
      m("google/gemini-3.8-flash", { name: "Gemini 3.8 Flash" }),
      m("perplexity/sonar", { name: "Perplexity Sonar (web)", vision: false, tools: false }),
    ],
  },
  gemini: {
    name: "Google Gemini", kind: "openai", key: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", usage: "openai",
    docs: "https://aistudio.google.com/apikey",
    roles: { default: "gemini-3.8-flash", fast: "gemini-3.8-flash", vision: "gemini-3.8-flash" },
    models: [m("gemini-3.8-flash", { name: "Gemini 3.8 Flash" })],
  },
  ollama: {
    name: "Ollama (local)", kind: "openai", local: true, baseUrl: "http://127.0.0.1:11434/v1", usage: "openai",
    docs: "https://ollama.com/download",
    roles: { default: "", fast: "", vision: "" },
    models: [],
  },
  lmstudio: {
    name: "LM Studio (local)", kind: "openai", local: true, baseUrl: "http://127.0.0.1:1234/v1", usage: null,
    docs: "https://lmstudio.ai",
    roles: { default: "", fast: "", vision: "" },
    models: [],
  },
  custom: {
    name: "Custom (OpenAI-compatible)", kind: "openai", key: "customKey", baseUrlKey: "customBaseUrl", optionalKey: true, usage: "openai",
    docs: "",
    roles: { default: "", fast: "", vision: "" },
    models: [],
  },
  mock: {
    name: "Mock (offline demo)", kind: "mock", hidden: true, local: true,
    roles: { default: "echo", fast: "echo", vision: "echo" },
    models: [m("echo", { name: "Echo (offline)", context: 100_000, price: { in: 0, out: 0 } })],
  },
};

/** Order used to pick a default provider when the config doesn't name one. */
export const PROVIDER_ORDER = ["anthropic", "openai", "openrouter", "xai", "gemini", "custom", "ollama", "lmstudio"];

const OR_PRICES = new Map(); // filled by live OpenRouter listings: id -> {in,out,context,vision}
export function rememberOpenRouterModels(list) {
  for (const x of list || []) OR_PRICES.set(x.id, x);
}

export function findModel(provider, id) {
  const p = LLM[provider];
  if (!p) return null;
  const hit = p.models.find((x) => x.id === id);
  if (hit) return hit;
  if (provider === "openrouter" && OR_PRICES.has(id)) return OR_PRICES.get(id);
  return null;
}

const PRICE_RULES = [
  [/claude-haiku-5[.-]5/, 0.1, 0.5], [/claude-sonnet-5[.-]5/, 2, 10], [/claude-opus-5[.-]5/, 4, 20], [/claude-fable-5/, 10, 50],
  [/claude-opus-5/, 5, 25], [/claude-sonnet-5/, 2, 10], [/claude-opus-4/, 5, 25], [/claude-sonnet-4/, 3, 15], [/claude-haiku-4/, 1, 5],
];

/** {in,out} USD per 1M tokens, 0 for local models, null when unknown. */
export function priceFor(provider, id) {
  if (LLM[provider]?.local) return { in: 0, out: 0 };
  const hit = findModel(provider, id);
  if (hit?.price) return hit.price;
  const bare = String(id || "").toLowerCase().replace(/^[a-z0-9-]+\//, "");
  const rule = PRICE_RULES.find(([re]) => re.test(bare));
  return rule ? { in: rule[1], out: rule[2] } : null;
}

/** Estimated USD for one call. Cached reads at 10% of input, cache writes at 125%. */
export function estimateCost(provider, id, u = {}) {
  if (Number.isFinite(u.costUsd)) return u.costUsd;
  const p = priceFor(provider, id);
  if (!p) return null;
  const cr = u.cacheRead || 0, cw = u.cacheWrite || 0;
  const plain = Math.max(0, (u.input || 0) - cr - cw);
  return (plain * p.in + cw * p.in * 1.25 + cr * p.in * 0.1 + (u.output || 0) * p.out) / 1e6;
}

export function contextFor(provider, id) {
  return findModel(provider, id)?.context || (provider === "anthropic" ? 1_000_000 : 200_000);
}

export function visionFor(provider, id) {
  const hit = findModel(provider, id);
  if (hit && hit.vision !== undefined && hit.vision !== null) return !!hit.vision;
  return /claude|gpt-[4-9]|gemini|grok-4|vision|llava|qwen.*vl|pixtral/i.test(String(id));
}

/** Parse "provider:model" (or a bare model id) into { provider, id }. */
export function parseModelSpec(spec) {
  const s = String(spec || "").trim();
  if (!s) return null;
  const i = s.indexOf(":");
  if (i > 0 && LLM[s.slice(0, i)]) return { provider: s.slice(0, i), id: s.slice(i + 1) || LLM[s.slice(0, i)].roles.default };
  if (LLM[s]) return { provider: s, id: LLM[s].roles.default };
  if (s.includes("/")) return { provider: "openrouter", id: s };
  if (/^claude/.test(s)) return { provider: "anthropic", id: s };
  if (/^(gpt|o\d)/.test(s)) return { provider: "openai", id: s };
  if (/^grok/.test(s)) return { provider: "xai", id: s };
  if (/^gemini/.test(s)) return { provider: "gemini", id: s };
  return { provider: "ollama", id: s };
}

export const specString = (m) => (m ? `${m.provider}:${m.id}` : "");
