// Money math on xAI's `usage.cost_in_usd_ticks` (1 tick = 1e-10 USD). Ticks are kept as integers
// (BigInt internally) so that summing thousands of responses never drifts; USD numbers are derived
// only at the edges, for display and for comparing against caps.

export const TICKS_PER_USD = 10_000_000_000n;
const TICK_DIGITS = 10;

/** Any tick-ish value (number, bigint, numeric string, undefined) → BigInt. */
export function toTicks(v) {
  if (typeof v === "bigint") return v;
  if (v == null || v === "") return 0n;
  if (typeof v === "number") return BigInt(Math.round(v));
  return BigInt(String(v).trim());
}

/** Exact decimal string, e.g. 123456789012345678n → "12345678.9012345678". */
export function ticksToUsdString(ticks) {
  let t = toTicks(ticks);
  const neg = t < 0n;
  if (neg) t = -t;
  const whole = t / TICKS_PER_USD;
  const frac = (t % TICKS_PER_USD).toString().padStart(TICK_DIGITS, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Ticks → USD as a Number. Whole dollars and the fraction are converted separately so values far
 *  beyond 2^53 ticks (~$900k) still come out right to the last representable digit. */
export function ticksToUsd(ticks) {
  let t = toTicks(ticks);
  const neg = t < 0n;
  if (neg) t = -t;
  const usd = Number(t / TICKS_PER_USD) + Number(t % TICKS_PER_USD) / 1e10;
  return neg ? -usd : usd;
}

/** USD (number or decimal string) → ticks as BigInt, exact for strings and for numbers up to 10 dp. */
export function usdToTicksBig(usd) {
  if (typeof usd === "bigint") return usd * TICKS_PER_USD;
  let s = typeof usd === "number" ? usd.toFixed(TICK_DIGITS) : String(usd ?? "0").trim();
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === "" || s === "-" || s === ".") throw new TypeError(`not a USD amount: ${usd}`);
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [whole = "0", frac = ""] = s.split(".");
  const digits = (whole || "0") + frac.slice(0, TICK_DIGITS).padEnd(TICK_DIGITS, "0");
  const t = BigInt(digits);
  return neg ? -t : t;
}

/** USD → ticks as a Number (safe below ~$900k; use usdToTicksBig past that). */
export function usdToTicks(usd) {
  return Number(usdToTicksBig(usd));
}

/** Sum tick values of mixed types → Number ticks. */
export function sumTicks(...values) {
  return Number(values.reduce((acc, v) => acc + toTicks(v), 0n));
}

const TOOL_KEYS = {
  x_search_calls: "xSearchCalls",
  x_posts_fetched: "xPostsFetched",
  x_users_fetched: "xUsersFetched",
  web_search_calls: "webSearchCalls",
  code_interpreter_calls: "codeInterpreterCalls",
  file_search_calls: "fileSearchCalls",
  mcp_calls: "mcpCalls",
  document_search_calls: "documentSearchCalls",
  image_generation_calls: "imageGenerationCalls",
  attachment_search_calls: "attachmentSearchCalls",
};
const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

export function emptyUsage() {
  return {
    inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, reasoningTokens: 0,
    sourcesUsed: 0, serverToolsUsed: 0, costTicks: 0, costUsd: 0,
    tools: Object.fromEntries(Object.values(TOOL_KEYS).map((k) => [k, 0])),
  };
}

/** Raw xAI `usage` (Responses, Chat, Imagine shapes) → one flat, camelCased summary. */
export function summarizeUsage(usage) {
  const u = usage || {};
  const out = emptyUsage();
  out.inputTokens = Number(u.input_tokens ?? u.prompt_tokens ?? 0);
  out.outputTokens = Number(u.output_tokens ?? u.completion_tokens ?? 0);
  out.totalTokens = Number(u.total_tokens ?? out.inputTokens + out.outputTokens);
  out.cachedTokens = Number(u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0);
  out.reasoningTokens = Number(u.output_tokens_details?.reasoning_tokens ?? u.completion_tokens_details?.reasoning_tokens ?? 0);
  out.sourcesUsed = Number(u.num_sources_used ?? 0);
  out.serverToolsUsed = Number(u.num_server_side_tools_used ?? 0);
  // Prefer ticks; fall back to nano-USD (1e-9) when a surface only reports that.
  const ticks = u.cost_in_usd_ticks != null ? toTicks(u.cost_in_usd_ticks) : u.cost_in_nano_usd != null ? toTicks(u.cost_in_nano_usd) * 10n : 0n;
  out.costTicks = Number(ticks);
  out.costUsd = ticksToUsd(ticks);
  for (const [k, v] of Object.entries(u.server_side_tool_usage_details || {})) out.tools[TOOL_KEYS[k] || camel(k)] = Number(v) || 0;
  return out;
}

/** Fold summaries together (totals across a run or a tool loop). */
export function addUsage(a, b) {
  const out = emptyUsage();
  for (const k of Object.keys(out)) if (k !== "tools" && k !== "costUsd") out[k] = (a?.[k] || 0) + (b?.[k] || 0);
  for (const k of new Set([...Object.keys(a?.tools || {}), ...Object.keys(b?.tools || {}), ...Object.keys(out.tools)])) out.tools[k] = (a?.tools?.[k] || 0) + (b?.tools?.[k] || 0);
  out.costUsd = ticksToUsd(out.costTicks);
  return out;
}

/** "$0.0012" / "$0.0400" / "$12.35": enough digits that sub-cent API calls do not render as $0.00. */
export function fmtUsd(usd) {
  const n = Number(usd) || 0;
  const abs = Math.abs(n);
  const dp = abs >= 1 ? 2 : abs >= 0.01 ? 4 : abs === 0 ? 2 : 6;
  return `${n < 0 ? "-" : ""}$${abs.toFixed(dp)}`;
}

export const fmtTicks = (ticks) => fmtUsd(ticksToUsd(ticks));
