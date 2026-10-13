// Types from docs/CONTRACT.md (server ⇄ dashboard). Keep in sync with the contract.

export type ProviderKind = "llm" | "media" | "chain" | "data" | "social";
export type ProviderStatus = {
  id: string;
  name: string;
  kind: ProviderKind;
  configured: boolean;
  masked?: string;
  env: string;
  docs: string;
  fields: { id: string; label: string; placeholder?: string }[];
};
export type UpdateInfo = { name: string; current: string; latest: string; outdated: boolean; command: string };
export type AppState = {
  version: string;
  persona: string;
  /** null until an LLM key is configured. */
  model: { provider: string; id: string } | null;
  providers: ProviderStatus[];
  chains: number;
  skills: { base: number; chain: number; user: number };
  updates: UpdateInfo[];
  platform: string;
  screen: { supported: boolean };
};
export type ModelInfo = { id: string; name: string; context?: number; vision?: boolean; tools?: boolean; price?: unknown };
export type Persona = { id: string; name: string; summary: string; active: boolean };
export type SessionInfo = { id: string; title: string; updated: string | number; messages: number };
export type Chain = {
  id: string;
  name: string;
  family: string;
  chainId: number | null;
  native: { symbol: string; decimals: number; coingecko?: string };
  alchemy?: string;
  publicRpc?: string[];
  explorer: string;
  chainlink?: string | null;
  llama?: string | null;
  tags: string[];
  testnet: boolean;
  accent: string;
  rpcSource?: "alchemy" | "public";
};
export type ChainStatus = { id: string; blockNumber: number; gasPriceGwei?: number; latencyMs: number; rpcSource: string };
export type PriceResult = { symbol: string; usd: number; source: string; updatedAt: string | number };
export type BalanceResult = {
  chain: string;
  address: string;
  native: { symbol: string; amount: string | number; usd?: number };
  tokens: { address: string; symbol: string; amount: string | number; usd?: number }[];
};
export type SkillInfo = { slug: string; name: string; title: string; description: string; category: string; source: "base" | "chain" | "user"; chain?: string };
export type MediaKind = "image" | "video" | "speech" | "music" | "sfx";
export type MediaJob = {
  id: string;
  kind: MediaKind | string;
  status: "queued" | "running" | "done" | "failed" | "awaiting_approval";
  provider: string;
  model: string;
  prompt: string;
  createdAt: string | number;
  outputs: { url: string; mime: string; path: string }[];
  error?: string;
  costUsd?: number;
};
export type PluginInfo = { id: string; name: string; kind: "tool" | "dashboard"; version: string; enabled: boolean; entry?: string };
export type Approval = {
  id: string;
  kind: "tx" | "shell" | "media" | "write" | "question";
  title: string;
  detail: unknown;
  createdAt: string | number;
  options?: string[];
};
export type Marker = { x: number; y: number; w: number; h: number; label?: string; color?: string; shape?: "box" | "arrow" | "circle"; relativeTo?: "screen" | "window" };

export type UiRole = "button" | "input" | "slider" | "tab" | "canvas" | "track" | "knob" | "list" | "panel";
export type UiTarget = { id: string; label: string; role: UiRole; route: string; value?: string };
export type UiCommandSpec = { name: string; description: string; params: Record<string, unknown> };
export type UiOp = {
  id: string;
  op: "takeover_start" | "takeover_end" | "move" | "click" | "type" | "drag" | "highlight" | "scroll" | "command" | "navigate" | "snapshot";
  target?: string;
  to?: string;
  text?: string;
  value?: unknown;
  name?: string;
  args?: Record<string, unknown>;
  route?: string;
  note?: string;
};
export type AgentState = "idle" | "thinking" | "tool" | "driving";
