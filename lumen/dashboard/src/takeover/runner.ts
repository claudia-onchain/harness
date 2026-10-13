// Executes takeover `ui` ops with visible animation and answers with ui_result (docs/CONTRACT.md).
import { agent, send } from "../state/agent";
import { sleep } from "../lib/store";
import type { UiOp } from "../lib/types";
import { center, caption, cursorPos, ensureInView, hideCursor, highlight, moveTo, moveToEl, overlay, press, ripple } from "./cursor";
import { COMMAND_ROUTES, commandSpecs, discoverTargets, findTarget, getCommand, getRoute, sendHello, studioSummary } from "./registry";

let navigateFn: ((route: string) => void) | null = null;
export const setNavigator = (f: (route: string) => void) => { navigateFn = f; };

class TookOver extends Error { constructor() { super("user_took_over"); } }
let generation = 0; // bumps when the user takes back control; stale ops abort
let queue: Promise<unknown> = Promise.resolve();

const guard = (gen: number) => { if (gen !== generation) throw new TookOver(); };

function need(id: string | undefined): HTMLElement {
  if (!id) throw new Error("target is required");
  const el = findTarget(id);
  if (!el) throw new Error(`target_not_found: ${id}`);
  return el;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter ? setter.call(el, value) : (el.value = value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function pointer(el: Element, type: string, x: number, y: number, extra: PointerEventInit = {}) {
  const init: PointerEventInit = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 77, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, ...extra };
  el.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, init) : new MouseEvent(type, init));
}

async function clickEl(el: HTMLElement) {
  await moveToEl(el);
  await ripple();
  const role = el.dataset.agentRole;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) el.click();
    return;
  }
  if (role === "canvas" || role === "track" || el instanceof HTMLCanvasElement) {
    const { x, y } = cursorPos();
    const hit = document.elementFromPoint(x, y) ?? el;
    pointer(hit, "pointerdown", x, y);
    pointer(hit, "mousedown", x, y);
    pointer(hit, "pointerup", x, y);
    pointer(hit, "mouseup", x, y);
    pointer(hit, "click", x, y);
    return;
  }
  el.click();
}

async function typeInto(el: HTMLElement, text: string, gen: number) {
  await clickEl(el);
  const input = (el.matches("input,textarea") ? el : el.querySelector("input,textarea")) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!input) throw new Error("target is not a text input");
  input.focus();
  let v = "";
  setNativeValue(input, v);
  const fast = text.length > 120;
  for (const ch of text) {
    guard(gen);
    v += ch;
    setNativeValue(input, v);
    await sleep(fast ? 6 : 22 + Math.random() * 10);
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function setValue(el: HTMLElement, value: unknown) {
  await moveToEl(el);
  await ripple();
  const input = (el.matches("input,select,textarea") ? el : el.querySelector("input,select,textarea")) as HTMLInputElement | null;
  if (input) {
    setNativeValue(input, String(value));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  el.dispatchEvent(new CustomEvent("agent-set", { detail: { value }, bubbles: true }));
}

async function drag(from: HTMLElement, to: HTMLElement, gen: number) {
  await moveToEl(from);
  const a = cursorPos();
  const dt = new DataTransfer();
  press(true);
  pointer(from, "pointerdown", a.x, a.y);
  from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: a.x, clientY: a.y }));
  await sleep(120);
  guard(gen);
  await ensureInView(to);
  const b = center(to);
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    const over = document.elementFromPoint(x, y) ?? to;
    pointer(over, "pointermove", x, y);
  }
  await moveTo(b.x, b.y, 650);
  guard(gen);
  to.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: b.x, clientY: b.y }));
  to.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: b.x, clientY: b.y }));
  await sleep(90);
  to.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: b.x, clientY: b.y }));
  pointer(to, "pointerup", b.x, b.y);
  from.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
  to.dispatchEvent(new CustomEvent("agent-drop", { bubbles: true, detail: { source: from.dataset.agentId } }));
  press(false);
  await ripple();
}

async function navigate(route: string, gen: number) {
  const norm = route.startsWith("/") ? route : `/${route}`;
  if (getRoute() === norm) return;
  const item = findTarget(`nav:${norm}`);
  if (item && item.getBoundingClientRect().width > 0) {
    await moveToEl(item);
    guard(gen);
    await ripple();
  }
  navigateFn?.(norm);
  // router navigations run in a transition: wait until the new route (and its lazy chunk) has committed
  for (let i = 0; i < 40 && getRoute() !== norm; i++) await sleep(75);
  await sleep(220);
}

async function runCommand(name: string, args: Record<string, unknown>, gen: number) {
  if (name === "nav.go") {
    await navigate(String(args.route ?? "/"), gen);
    return { route: getRoute() };
  }
  let cmd = getCommand(name);
  if (!cmd) {
    const route = COMMAND_ROUTES[name.split(".")[0]];
    if (route && getRoute() !== route) {
      await navigate(route, gen);
      for (let i = 0; i < 30 && !getCommand(name); i++) await sleep(100);
      cmd = getCommand(name);
    }
  }
  if (!cmd) throw new Error(`unknown_command: ${name}`);
  guard(gen);
  const panel = cmd.panel ? findTarget(cmd.panel) : null;
  if (panel) {
    await moveToEl(panel);
    highlight(panel, cmd.description.split(".")[0], 1400);
    panel.classList.add("agent-pulse");
    setTimeout(() => panel.classList.remove("agent-pulse"), 1200);
  }
  caption(name);
  try {
    const result = await cmd.run(args ?? {});
    await ripple();
    return result ?? { ok: true };
  } finally {
    setTimeout(() => { if (overlay.get().caption === name) caption(""); }, 900);
  }
}

/** Run one op and return its result. Throws on failure. */
export async function execOp(op: UiOp, gen = generation): Promise<unknown> {
  guard(gen);
  switch (op.op) {
    case "takeover_start":
      overlay.set({ active: true, note: op.note || "Lumen is driving", visible: true });
      agent.setStatus("driving", op.note);
      return { ok: true };
    case "takeover_end":
      overlay.set({ active: false, note: "", demo: false });
      setTimeout(hideCursor, 400);
      if (agent.get().status.state === "driving") agent.setStatus("idle");
      return { ok: true };
    case "navigate":
      await navigate(op.route || "/", gen);
      return { route: getRoute() };
    case "move":
      await moveToEl(need(op.target));
      return { ok: true };
    case "click":
      await clickEl(need(op.target));
      return { ok: true };
    case "type":
      if (op.value !== undefined && op.text === undefined) {
        await setValue(need(op.target), op.value);
        return { ok: true };
      }
      await typeInto(need(op.target), String(op.text ?? ""), gen);
      return { ok: true };
    case "drag":
      await drag(need(op.target), need(op.to), gen);
      return { ok: true };
    case "scroll": {
      const el = need(op.target);
      await moveToEl(el);
      el.scrollBy({ top: Number(op.value ?? 300), behavior: "smooth" });
      await sleep(300);
      return { ok: true };
    }
    case "highlight": {
      const el = need(op.target);
      await moveToEl(el);
      highlight(el, op.note, 3200);
      await sleep(500);
      return { ok: true };
    }
    case "command":
      return runCommand(String(op.name), op.args ?? {}, gen);
    case "snapshot":
      return { route: getRoute(), targets: discoverTargets(), commands: commandSpecs(), summary: studioSummary() };
    default:
      throw new Error(`unknown op ${(op as UiOp).op}`);
  }
}

/** Server-driven ops: queued, one at a time, each answered with ui_result. */
export function handleServerOp(op: UiOp) {
  const gen = generation;
  queue = queue.then(async () => {
    try {
      const result = await execOp(op, gen);
      send({ type: "ui_result", id: op.id, ok: true, result });
      if (op.op === "navigate" || op.op === "command") sendHello();
    } catch (e) {
      send({ type: "ui_result", id: op.id, ok: false, error: e instanceof TookOver ? "user_took_over" : (e as Error).message });
    }
  });
}

/** The user pressed Esc or "Take back": stop the agent and fail every pending op. */
export function takeBack() {
  generation++;
  overlay.set({ active: false, note: "", demo: false });
  hideCursor();
  send({ type: "stop", sessionId: agent.get().sessionId });
  agent.setStatus("idle");
}

export const currentGeneration = () => generation;
export { TookOver };
