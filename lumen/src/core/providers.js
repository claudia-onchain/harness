// Provider registry: every service Lumen can use, grouped by kind (llm | media | chain | data | social),
// with key fields, docs links and a live dry-run test. Feeds `lumen keys`, `lumen doctor` and /api/providers.
import { FIELDS, getKeys } from "./keys.js";
import { LLM } from "../llm/catalog.js";
import { testLlm } from "../llm/index.js";
import { fetchJson } from "./util.js";

const f = (id) => ({ id, label: FIELDS[id]?.label || id, placeholder: FIELDS[id]?.placeholder || "" });
const P = (id, name, kind, fields, docs, extra = {}) => ({ id, name, kind, fields: fields.map(f), docs, ...extra });

export const PROVIDERS = [
  P("anthropic", "Anthropic", "llm", ["anthropic"], LLM.anthropic.docs, { summary: "Claude Opus / Sonnet / Haiku 5.5" }),
  P("openai", "OpenAI", "llm", ["openai"], LLM.openai.docs, { summary: "GPT-6 chat, gpt-image, TTS", alsoMedia: true }),
  P("xai", "xAI (Grok)", "llm", ["xai"], LLM.xai.docs, { summary: "Grok 4.7, Grok Imagine image + video", alsoMedia: true }),
  P("openrouter", "OpenRouter", "llm", ["openrouter"], LLM.openrouter.docs, { summary: "One key: every model + images, video, speech, music", alsoMedia: true }),
  P("gemini", "Google Gemini", "llm", ["gemini"], LLM.gemini.docs, { summary: "Gemini 3.8 Flash (OpenAI-compatible endpoint)", alsoMedia: true }),
  P("ollama", "Ollama (local)", "llm", [], LLM.ollama.docs, { summary: "Models on this computer at 127.0.0.1:11434", local: true }),
  P("lmstudio", "LM Studio (local)", "llm", [], LLM.lmstudio.docs, { summary: "Models on this computer at 127.0.0.1:1234", local: true }),
  P("custom", "Custom endpoint", "llm", ["customBaseUrl", "customKey"], "", { summary: "Any OpenAI-compatible /v1 server" }),
  P("claudia-local", "Claudia Local", "llm", [], "https://useclaudia.xyz", { summary: "Connect a Claudia Local install (coming later)", comingSoon: true }),
  P("alchemy", "Alchemy", "chain", ["alchemy"], "https://dashboard.alchemy.com/apps", { summary: "RPC for 40+ chains, token balances, transfers, NFTs, prices" }),
  P("helius", "Helius", "chain", ["helius"], "https://dashboard.helius.dev", { summary: "Solana RPC" }),
  P("etherscan", "Etherscan V2", "chain", ["etherscan"], "https://etherscan.io/myapikey", { summary: "ABIs, source, tx lists on 60+ chains" }),
  P("wallet-evm", "EVM wallet", "chain", ["evmPrivateKey"], "", { summary: "Signs sends/swaps after simulation, caps and your yes", wallet: true }),
  P("wallet-solana", "Solana wallet", "chain", ["solanaSecret"], "", { summary: "Signs Solana sends after simulation, caps and your yes", wallet: true }),
  P("defillama", "DefiLlama", "data", [], "https://defillama.com/docs/api", { summary: "Prices, TVL, yields (no key)", keyless: true }),
  P("coingecko", "CoinGecko", "data", ["coingecko"], "https://www.coingecko.com/en/developers/dashboard", { summary: "Prices (works keyless, a demo key raises limits)", keyless: true }),
  P("jupiter", "Jupiter", "data", ["jupiter"], "https://portal.jup.ag", { summary: "Solana prices + swap quotes (keyless at low rate)", keyless: true }),
  P("zerox", "0x", "data", ["zerox"], "https://dashboard.0x.org", { summary: "EVM swap quotes" }),
  P("lifi", "LI.FI", "data", ["lifi"], "https://portal.li.fi", { summary: "Cross-chain quotes (keyless works)", keyless: true }),
  P("brave", "Brave Search", "data", ["brave"], "https://api-dashboard.search.brave.com", { summary: "web_search" }),
  P("tavily", "Tavily", "data", ["tavily"], "https://app.tavily.com", { summary: "web_search" }),
  P("exa", "Exa", "data", ["exa"], "https://dashboard.exa.ai", { summary: "web_search" }),
  P("fal", "fal.ai", "media", ["fal"], "https://fal.ai/dashboard/keys", { summary: "Image + video models via queue" }),
  P("elevenlabs", "ElevenLabs", "media", ["elevenlabs"], "https://elevenlabs.io/app/settings/api-keys", { summary: "Speech + music" }),
  P("replicate", "Replicate", "media", ["replicate"], "https://replicate.com/account/api-tokens", { summary: "Open models" }),
  P("heygen", "HeyGen", "media", ["heygen"], "https://app.heygen.com/settings", { summary: "Avatars (via @useclaudia/media)" }),
  P("runway", "Runway", "media", ["runway"], "https://dev.runwayml.com", { summary: "Video (via @useclaudia/media)" }),
  P("byteplus", "BytePlus", "media", ["byteplus"], "https://console.byteplus.com", { summary: "Seedance / Seedream (via @useclaudia/media)" }),
  P("telegram", "Telegram", "social", ["telegram"], "https://t.me/BotFather", { summary: "Bot token for @useclaudia/social plugins" }),
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function providerStatus(keys = getKeys(), { localUp = {} } = {}) {
  return PROVIDERS.map((p) => {
    const first = p.fields[0]?.id;
    const configured = p.comingSoon ? false : p.local ? !!localUp[p.id] : p.fields.length ? p.fields.every((x) => x.id === "customKey" || keys.has(x.id)) : !!p.keyless;
    const fieldEnv = first ? FIELDS[first].env : [];
    return {
      id: p.id, name: p.name, kind: p.kind, configured, summary: p.summary,
      masked: first && keys.has(first) ? keys.list().find((k) => k.id === first)?.masked : undefined,
      env: fieldEnv[0] || null, docs: p.docs, fields: p.fields,
      ...(p.comingSoon ? { comingSoon: true } : {}), ...(p.keyless ? { keyless: true } : {}), ...(p.local ? { local: true } : {}), ...(p.wallet ? { wallet: true } : {}),
    };
  });
}

/** Live dry-run check for a provider. Never spends money. Returns { ok, message }. */
export async function testProvider(id, keys = getKeys()) {
  const p = PROVIDER_BY_ID.get(id) || PROVIDERS.find((x) => x.fields.some((fl) => fl.id === id));
  if (!p) return { ok: false, message: `Unknown provider: ${id}` };
  if (p.comingSoon) return { ok: false, message: `${p.name} is coming later.` };
  if (p.kind === "llm") return testLlm(p.id, keys);
  const k = p.fields[0] ? keys.get(p.fields[0].id) : "";
  const need = () => ({ ok: false, message: `No ${p.name} key set.` });
  try {
    switch (p.id) {
      case "alchemy": {
        if (!k) return need();
        const j = await fetchJson(`https://eth-mainnet.g.alchemy.com/v2/${k}`, { method: "POST", body: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] } }, 8000);
        return j.result ? { ok: true, message: `Key works · Ethereum block ${parseInt(j.result, 16)}` } : { ok: false, message: j.error?.message || "Unexpected reply" };
      }
      case "helius": {
        if (!k) return need();
        const j = await fetchJson(`https://mainnet.helius-rpc.com/?api-key=${k}`, { method: "POST", body: { jsonrpc: "2.0", id: 1, method: "getSlot" } }, 8000);
        return j.result ? { ok: true, message: `Key works · slot ${j.result}` } : { ok: false, message: j.error?.message || "Unexpected reply" };
      }
      case "etherscan": {
        if (!k) return need();
        const j = await fetchJson(`https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${k}`, {}, 8000);
        return j.result && /^0x/.test(j.result) ? { ok: true, message: `Key works · block ${parseInt(j.result, 16)}` } : { ok: false, message: String(j.result || j.message) };
      }
      case "wallet-evm": {
        if (!k) return need();
        const { privateKeyToAccount } = await import("viem/accounts");
        const a = privateKeyToAccount(k.startsWith("0x") ? k : `0x${k}`);
        return { ok: true, message: `Wallet address ${a.address}` };
      }
      case "wallet-solana": {
        if (!k) return need();
        const { solanaKeypair } = await import("../chains/solana.js");
        const kp = await solanaKeypair(k);
        return { ok: true, message: `Wallet address ${kp.publicKey.toBase58()}` };
      }
      case "defillama": {
        const j = await fetchJson("https://coins.llama.fi/prices/current/coingecko:ethereum", {}, 8000);
        return { ok: true, message: `Reachable · ETH $${j.coins?.["coingecko:ethereum"]?.price?.toFixed?.(2)}` };
      }
      case "coingecko": {
        const j = await fetchJson("https://api.coingecko.com/api/v3/ping", { headers: k ? { "x-cg-demo-api-key": k } : {} }, 8000);
        return { ok: true, message: `${k ? "Key works" : "Reachable keyless"} · ${j.gecko_says || "ok"}` };
      }
      case "jupiter": {
        await fetchJson("https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112", { headers: k ? { "x-api-key": k } : {} }, 8000);
        return { ok: true, message: k ? "Key works" : "Reachable keyless (0.5 RPS)" };
      }
      case "zerox": {
        if (!k) return need();
        await fetchJson("https://api.0x.org/swap/allowance-holder/price?chainId=1&sellToken=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&buyToken=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&sellAmount=10000000000000000", { headers: { "0x-api-key": k, "0x-version": "v2" } }, 8000);
        return { ok: true, message: "Key works" };
      }
      case "lifi": {
        const j = await fetchJson("https://li.quest/v1/chains", { headers: k ? { "x-lifi-api-key": k } : {} }, 8000);
        return { ok: true, message: `${k ? "Key works" : "Reachable keyless"} · ${(j.chains || []).length} chains` };
      }
      case "brave": {
        if (!k) return need();
        await fetchJson("https://api.search.brave.com/res/v1/web/search?q=lumen&count=1", { headers: { "X-Subscription-Token": k } }, 8000);
        return { ok: true, message: "Key works" };
      }
      case "tavily": {
        if (!k) return need();
        await fetchJson("https://api.tavily.com/search", { method: "POST", headers: { authorization: `Bearer ${k}` }, body: { query: "lumen", max_results: 1 } }, 10000);
        return { ok: true, message: "Key works" };
      }
      case "elevenlabs": {
        if (!k) return need();
        await fetchJson("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": k } }, 8000);
        return { ok: true, message: "Key works" };
      }
      case "replicate": {
        if (!k) return need();
        const j = await fetchJson("https://api.replicate.com/v1/account", { headers: { authorization: `Bearer ${k}` } }, 8000);
        return { ok: true, message: `Key works · ${j.username || "account"}` };
      }
      default:
        return k ? { ok: true, message: "Key is set (no free live check for this provider)." } : need();
    }
  } catch (e) {
    return { ok: false, message: e.status === 401 || e.status === 403 ? `${p.name} rejected the key (${e.status}).` : `Check failed: ${e.message}` };
  }
}
