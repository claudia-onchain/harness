// Global app state from /api/state, plus connection mode (online / offline demo / unauthorized).
import { api, bus, isOffline, ApiError } from "../lib/api";
import { createStore } from "../lib/store";
import type { AppState } from "../lib/types";

export type Mode = "loading" | "online" | "offline" | "unauthorized";
export const app = createStore<{ mode: Mode; state: AppState | null; error?: string; updatedAt: number }>({ mode: "loading", state: null, updatedAt: 0 });

/** Placeholder state for demo/offline mode so every page still renders. */
export const DEMO_STATE: AppState = {
  version: "0.1.0-demo",
  persona: "lumen",
  model: { provider: "anthropic", id: "claude-opus-5-5" },
  providers: [],
  chains: 45,
  skills: { base: 101, chain: 900, user: 0 },
  updates: [],
  platform: "browser",
  screen: { supported: false },
};

// The server sends persona as { id, name }; older builds sent a string. Keep the UI on a plain id.
function normalizeState(s: AppState & { persona: unknown }): AppState {
  const p = s.persona as string | { id?: string; name?: string } | null | undefined;
  return { ...s, persona: typeof p === "string" ? p : p?.id ?? p?.name ?? "lumen" };
}

export async function refreshState(): Promise<AppState | null> {
  try {
    const s = normalizeState(await api<AppState & { persona: unknown }>("/api/state"));
    app.set({ mode: "online", state: s, error: undefined, updatedAt: Date.now() });
    return s;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) app.set({ mode: "unauthorized", error: e.message });
    else if (isOffline(e) || (e instanceof ApiError && e.status >= 500)) app.set({ mode: "offline", state: app.get().state ?? DEMO_STATE, error: "offline" });
    else app.set({ mode: "offline", state: app.get().state ?? DEMO_STATE, error: String((e as Error).message) });
    return null;
  }
}

bus.addEventListener("unauthorized", () => app.set({ mode: "unauthorized" }));

export const useApp = () => app.use();
export const isDemo = () => app.get().mode !== "online";
