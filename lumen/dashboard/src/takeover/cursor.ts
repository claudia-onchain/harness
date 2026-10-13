// The ghost cursor engine: curved eased glides with a trail, click ripples, highlight rings, drag and typing.
// Position updates are imperative (no React render per frame); overlay state lives in a small store.
import { createStore, sleep, uid } from "../lib/store";

export type Highlight = { id: string; el: HTMLElement; note?: string; tone?: "accent" | "warn" };
export type Ripple = { id: string; x: number; y: number };

export const overlay = createStore<{
  active: boolean;
  note: string;
  visible: boolean;
  pressed: boolean;
  caption: string;
  highlights: Highlight[];
  ripples: Ripple[];
  demo: boolean;
}>({ active: false, note: "", visible: false, pressed: false, caption: "", highlights: [], ripples: [], demo: false });

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

let cursorEl: HTMLElement | null = null;
let trailCanvas: HTMLCanvasElement | null = null;
const pos = { x: -100, y: -100 };
const trail: { x: number; y: number; t: number }[] = [];
let rafTrail = 0;

export function attachCursor(el: HTMLElement | null, canvas: HTMLCanvasElement | null) {
  cursorEl = el;
  trailCanvas = canvas;
  if (el) place();
}

function place() {
  if (cursorEl) cursorEl.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
}

function drawTrail() {
  const c = trailCanvas;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(innerWidth * dpr) || c.height !== Math.round(innerHeight * dpr)) {
    c.width = Math.round(innerWidth * dpr);
    c.height = Math.round(innerHeight * dpr);
  }
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);
  const now = performance.now();
  while (trail.length && now - trail[0].t > 420) trail.shift();
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const life = 1 - (now - b.t) / 420;
    g.strokeStyle = `rgba(${Math.round(124 + (34 - 124) * (i / trail.length))}, ${Math.round(92 + (211 - 92) * (i / trail.length))}, ${Math.round(255 + (238 - 255) * (i / trail.length))}, ${life * 0.85})`;
    g.lineWidth = 1 + life * 5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  if (trail.length) rafTrail = requestAnimationFrame(drawTrail);
  else rafTrail = 0;
}

function addTrail(x: number, y: number) {
  trail.push({ x, y, t: performance.now() });
  if (!rafTrail) rafTrail = requestAnimationFrame(drawTrail);
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Glide to (x, y) along a quadratic curve. Duration scales with distance (350–700 ms). */
export async function moveTo(x: number, y: number, ms?: number) {
  overlay.set({ visible: true });
  if (pos.x < 0) {
    // first appearance: enter from the bottom-right corner
    pos.x = innerWidth - 40;
    pos.y = innerHeight - 40;
  }
  const sx = pos.x, sy = pos.y;
  const dx = x - sx, dy = y - sy;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return;
  const dur = reduced() ? 0 : ms ?? Math.min(700, Math.max(350, 260 + dist * 0.45));
  if (!dur) {
    pos.x = x; pos.y = y; place();
    return;
  }
  // control point: perpendicular offset for a natural arc
  const bend = Math.min(140, dist * 0.28) * (dx > 0 ? 1 : -1);
  const cx = sx + dx / 2 - (dy / (dist || 1)) * bend;
  const cy = sy + dy / 2 + (dx / (dist || 1)) * bend * 0.6;
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = ease(t);
      const u = 1 - e;
      pos.x = u * u * sx + 2 * u * e * cx + e * e * x;
      pos.y = u * u * sy + 2 * u * e * cy + e * e * y;
      place();
      addTrail(pos.x, pos.y);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export function center(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 24) };
}

export async function ensureInView(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.top < 60 || r.bottom > innerHeight - 20 || r.left < 0 || r.right > innerWidth) {
    el.scrollIntoView({ block: "center", inline: "center", behavior: reduced() ? "auto" : "smooth" });
    await sleep(reduced() ? 30 : 380);
  }
}

export async function moveToEl(el: HTMLElement) {
  await ensureInView(el);
  const c = center(el);
  await moveTo(c.x, c.y);
}

export async function ripple() {
  const r: Ripple = { id: uid("r"), x: pos.x, y: pos.y };
  overlay.set((s) => ({ pressed: true, ripples: [...s.ripples, r] }));
  await sleep(110);
  overlay.set({ pressed: false });
  setTimeout(() => overlay.set((s) => ({ ripples: s.ripples.filter((x) => x.id !== r.id) })), 650);
}

export function press(down: boolean) {
  overlay.set({ pressed: down });
}

export function caption(text: string) {
  overlay.set({ caption: text });
}

export function highlight(el: HTMLElement, note?: string, ms = 2600, tone: Highlight["tone"] = "accent") {
  const h: Highlight = { id: uid("h"), el, note, tone };
  overlay.set((s) => ({ highlights: [...s.highlights.filter((x) => x.el !== el), h] }));
  if (ms > 0) setTimeout(() => overlay.set((s) => ({ highlights: s.highlights.filter((x) => x.id !== h.id) })), ms);
  return h.id;
}

export function cursorPos() {
  return { ...pos };
}

export function hideCursor() {
  overlay.set({ visible: false, highlights: [], caption: "" });
  pos.x = -100;
  pos.y = -100;
  place();
}
