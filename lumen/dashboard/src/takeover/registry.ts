// UiCommand registry + target discovery for the takeover channel (docs/CONTRACT.md "Takeover channel").
// Studios register commands with useAgentCommands(); every element with data-agent-id is a drivable target.
import { useEffect, useRef } from "react";
import { send } from "../state/agent";
import type { UiCommandSpec, UiRole, UiTarget } from "../lib/types";

export type CommandDef = UiCommandSpec & {
  /** data-agent-id of the panel that owns the command (the cursor glides there before running). */
  panel?: string;
  run: (args: Record<string, any>) => unknown | Promise<unknown>;
};

type Entry = CommandDef & { owner: symbol };
const commands = new Map<string, Entry>();
const snapshotProviders = new Map<symbol, () => string>();
let currentRoute = "/";

/** Where each command family lives, so the runner can navigate before a studio has mounted. */
export const COMMAND_ROUTES: Record<string, string> = {
  image: "/studio/image",
  photo: "/studio/photo",
  video: "/studio/video",
  music: "/studio/music",
  synth: "/studio/music",
  mixer: "/studio/music",
  fx: "/studio/music",
  audio: "/studio/audio",
  chat: "/chat",
  chains: "/chains",
};

/** Commands that work on every route. */
const GLOBAL_SPECS: UiCommandSpec[] = [
  { name: "nav.go", description: "Navigate to a dashboard route (glides to the sidebar item and clicks it).", params: { type: "object", properties: { route: { type: "string", description: "e.g. /studio/music, /chat, /chains" } }, required: ["route"] } },
];

export function registerCommands(defs: CommandDef[], owner: symbol) {
  for (const d of defs) commands.set(d.name, { ...d, owner });
  scheduleHello();
}
export function unregisterCommands(owner: symbol) {
  for (const [k, v] of commands) if (v.owner === owner) commands.delete(k);
  scheduleHello();
}
export const getCommand = (name: string) => commands.get(name);
export const commandSpecs = (): UiCommandSpec[] => [
  ...GLOBAL_SPECS,
  ...[...commands.values()].map(({ name, description, params }) => ({ name, description, params })),
];

/**
 * Register UiCommands for the lifetime of the calling component. `defs` may change every render;
 * the latest closures are always used (no stale state), and registration happens once per mount.
 */
export function useAgentCommands(defs: CommandDef[], summary?: () => string) {
  const ref = useRef(defs);
  ref.current = defs;
  const sumRef = useRef(summary);
  sumRef.current = summary;
  const names = defs.map((d) => d.name).join("|");
  useEffect(() => {
    const owner = Symbol("cmds");
    registerCommands(
      ref.current.map((d) => ({ ...d, run: (args: Record<string, any>) => ref.current.find((x) => x.name === d.name)!.run(args) })),
      owner,
    );
    if (sumRef.current) snapshotProviders.set(owner, () => sumRef.current?.() ?? "");
    return () => {
      unregisterCommands(owner);
      snapshotProviders.delete(owner);
    };
  }, [names]);
}

export function studioSummary(): string {
  const parts = [...snapshotProviders.values()].map((f) => { try { return f(); } catch { return ""; } }).filter(Boolean);
  return parts.join("\n") || `On ${currentRoute}.`;
}

// ── targets ──

const ROLES: UiRole[] = ["button", "input", "slider", "tab", "canvas", "track", "knob", "list", "panel"];

function isVisible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none";
}

function inferRole(el: HTMLElement): UiRole {
  const r = el.dataset.agentRole as UiRole | undefined;
  if (r && ROLES.includes(r)) return r;
  if (el instanceof HTMLInputElement) return el.type === "range" ? "slider" : "input";
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return "input";
  if (el instanceof HTMLCanvasElement) return "canvas";
  if (el.getAttribute("role") === "tab") return "tab";
  return "button";
}

export function discoverTargets(): UiTarget[] {
  const out: UiTarget[] = [];
  const seen = new Set<string>();
  document.querySelectorAll<HTMLElement>("[data-agent-id]").forEach((el) => {
    const id = el.dataset.agentId!;
    if (seen.has(id) || el.closest("[data-agent-ignore]") || !isVisible(el)) return;
    seen.add(id);
    const role = inferRole(el);
    const label = el.dataset.agentLabel || el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 60) || id;
    let value: string | undefined;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) value = String(el.value).slice(0, 120);
    else if (el.dataset.agentValue) value = el.dataset.agentValue;
    out.push({ id, label, role, route: currentRoute, ...(value !== undefined ? { value } : {}) });
  });
  return out;
}

export function findTarget(id: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(`[data-agent-id="${CSS.escape(id)}"]`);
  } catch {
    return null;
  }
}

// ── ui_hello ──

let helloTimer: ReturnType<typeof setTimeout> | undefined;
export function setRoute(route: string) {
  currentRoute = route;
  scheduleHello(320);
}
export const getRoute = () => currentRoute;

export function scheduleHello(ms = 200) {
  clearTimeout(helloTimer);
  helloTimer = setTimeout(sendHello, ms);
}
export function sendHello() {
  send({ type: "ui_hello", route: currentRoute, targets: discoverTargets(), commands: commandSpecs() });
}

/** Spread onto any element: {...agentProps("music.play", "Play", "button")} */
export function agentProps(id: string, label?: string, role?: UiRole): Record<string, string> {
  const p: Record<string, string> = { "data-agent-id": id };
  if (label) p["data-agent-label"] = label;
  if (role) p["data-agent-role"] = role;
  return p;
}
