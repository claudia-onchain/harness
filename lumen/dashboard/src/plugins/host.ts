// Dashboard plugin host. Enabled dashboard plugins (GET /api/plugins, kind "dashboard") expose an ES module
// `entry`; its default export is `register(api)`. Plugins can add studio panels, Tone effects/instruments
// and UiCommands the agent can drive.
import { api, authHeaders } from "../lib/api";
import { createStore } from "../lib/store";
import { toast } from "../lib/toast";
import { registerCommands, type CommandDef } from "../takeover/registry";
import type { PluginInfo } from "../lib/types";

export type PluginPanel = { id: string; pluginId: string; title: string; route?: string; render: (el: HTMLElement) => void | (() => void) };
export type PluginEffect = { id: string; pluginId: string; name: string; create: (Tone: unknown) => unknown };
export type PluginInstrument = PluginEffect;
export type LumenPluginApi = {
  version: string;
  addPanel: (p: Omit<PluginPanel, "pluginId">) => void;
  addEffect: (e: Omit<PluginEffect, "pluginId">) => void;
  addInstrument: (e: Omit<PluginInstrument, "pluginId">) => void;
  addCommand: (c: CommandDef) => void;
  toast: (text: string) => void;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

export const pluginRegistry = createStore<{ loaded: string[]; failed: Record<string, string>; panels: PluginPanel[]; effects: PluginEffect[]; instruments: PluginInstrument[] }>({
  loaded: [], failed: {}, panels: [], effects: [], instruments: [],
});

function apiFor(pluginId: string): LumenPluginApi {
  const owner = Symbol(pluginId);
  return {
    version: "1",
    addPanel: (p) => pluginRegistry.set((s) => ({ panels: [...s.panels.filter((x) => x.id !== p.id), { ...p, pluginId }] })),
    addEffect: (e) => pluginRegistry.set((s) => ({ effects: [...s.effects.filter((x) => x.id !== e.id), { ...e, pluginId }] })),
    addInstrument: (e) => pluginRegistry.set((s) => ({ instruments: [...s.instruments.filter((x) => x.id !== e.id), { ...e, pluginId }] })),
    addCommand: (c) => registerCommands([{ ...c, name: c.name.includes(".") ? c.name : `${pluginId}.${c.name}` }], owner),
    toast: (text) => toast(`${pluginId}: ${text}`),
    fetch: (path, init) => fetch(path, { ...init, credentials: "same-origin", headers: { ...authHeaders(), ...(init?.headers as Record<string, string>) } }),
  };
}

let loading = false;
export async function loadPlugins() {
  if (loading) return;
  loading = true;
  let list: PluginInfo[] = [];
  try { list = await api<PluginInfo[]>("/api/plugins"); } catch { loading = false; return; }
  for (const p of list) {
    if (p.kind !== "dashboard" || !p.enabled || !p.entry || pluginRegistry.get().loaded.includes(p.id)) continue;
    await loadPlugin(p);
  }
  loading = false;
}

export async function loadPlugin(p: PluginInfo) {
  try {
    const mod = await import(/* @vite-ignore */ p.entry!);
    const register = mod.default ?? mod.register;
    if (typeof register !== "function") throw new Error("entry has no default register(api) export");
    await register(apiFor(p.id));
    pluginRegistry.set((s) => ({ loaded: [...s.loaded, p.id] }));
  } catch (e) {
    pluginRegistry.set((s) => ({ failed: { ...s.failed, [p.id]: (e as Error).message } }));
  }
}
