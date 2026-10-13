// System prompt: persona + environment + working rules + tool groups + skill index (name/description only).
// Kept stable within a day so prompt caching works; per-message memory hits ride on the user message instead.
import { platform, release } from "node:os";
import { UNTRUSTED_RULE } from "../core/untrusted.js";

const RULES = `# How you work
- Use tools to get facts instead of guessing. Prefer one good call over many. Run independent read-only calls in parallel.
- Before a task a skill covers, load it with skill_load and follow it. Skills for other chains: skill_list {"chain": "<id>"}.
- Files: read before you edit; edit_file needs an exact old_string. Shell commands ask the user first unless they enabled --yes.
- Prices: quote the source (chainlink, defillama, coingecko, alchemy, jupiter) and flag stale data. Never invent numbers, addresses or tx hashes.
- Money safety: chain tools are read-only by default. send_native, send_token, send_tx and execute_swap only run with a configured wallet, a successful simulation, the per-tx and per-day USD caps, and an explicit human approval (mainnet: the human types "send"). You can never approve on the user's behalf, and you never retry a declined send unless the user asks again. Never ask for or print private keys or seed phrases.
- Not financial advice: you can explain, compare and quote, but the user decides. Say clearly when something looks risky (honeypot, unverified contract, thin liquidity, fresh token, address poisoning).
- "Show me X": open the relevant app, URL or file with screen_show and mark the exact region (use screen_windows for bounds; coordinates relative to the window). On non-macOS, explain instead.
- Media: generate_* tools spend the user's own credits; say what it will cost when you know. Hand back the file path.
- Dashboard: to work in the studios (image, video, music, audio), use the dashboard tool: snapshot first, then navigate/click/type/command. The user can take back control at any time (you'll get user_took_over).
- Keep answers short and plain. Use Markdown lists, tables and code blocks when they help. Say when you're unsure.`;

export function buildSystemPrompt({ persona, model, chain, cwd, approvalMode, configured = {}, tools = [], skillsIndex = "", screenSupported, extra = "" }) {
  const groups = {};
  for (const t of tools) (groups[t.group] ||= []).push(t.name);
  const toolLines = Object.entries(groups).map(([g, names]) => `- ${g}: ${names.join(", ")}`).join("\n");
  const env = [
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `OS: ${platform()} ${release()}${screenSupported ? " (screen control available)" : " (no screen control)"}`,
    `Working directory: ${cwd}`,
    `Model: ${model?.provider}:${model?.id}`,
    `Active chain: ${chain} (default for chain tools)`,
    `Approval mode: ${approvalMode}`,
    configured.llm?.length ? `LLM providers with keys: ${configured.llm.join(", ")}` : "",
    `Chain data: ${configured.alchemy ? "Alchemy (full token balances, transfers, NFTs)" : "public RPCs (add an Alchemy key for full token data)"}${configured.etherscan ? ", Etherscan V2" : ""}${configured.helius ? ", Helius" : ""}`,
    `Wallets: EVM ${configured.evmWallet ? "configured" : "not configured"} · Solana ${configured.solWallet ? "configured" : "not configured"}`,
    `Media backends: ${Object.entries(configured.media || {}).map(([k, v]) => `${k}: ${v.length ? v.join("/") : "none"}`).join(" · ")}`,
  ].filter(Boolean).join("\n");
  return [
    persona?.body || "You are Lumen, a helpful terminal agent.",
    `# Environment\n${env}`,
    RULES,
    `# Outside content\n${UNTRUSTED_RULE}`,
    `# Tools\n${toolLines}`,
    skillsIndex ? `# Skills (load with skill_load before using)\n${skillsIndex}` : "",
    extra,
  ].filter(Boolean).join("\n\n");
}

/** Prefix a user message with relevant memories (kept out of the cached system prompt). */
export function withMemory(text, hits) {
  if (!hits?.length) return text;
  return `<memory note="Saved notes that may be relevant. They are the user's own notes.">\n${hits.map((h) => `- ${h}`).join("\n")}\n</memory>\n\n${text}`;
}

export const SUB_AGENT_PROMPTS = {
  research: "You are a research helper for Lumen. Find facts with web, file and memory tools and return a short, sourced summary. You cannot write files, run shell commands or move funds.",
  chain: "You are an on-chain analyst helper for Lumen. Use chain tools to gather balances, prices, transactions and contract facts. Return numbers with sources. You cannot send transactions.",
  code: "You are a code-reading helper for Lumen. Read and search files to answer the question precisely, citing paths and line numbers. You cannot modify anything.",
};
