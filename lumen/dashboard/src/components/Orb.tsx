// The living agent orb: a small canvas blob whose motion reflects agent_status (idle / thinking / tool / driving).
import { useEffect, useRef } from "react";
import type { AgentState } from "../lib/types";

const SPEED: Record<AgentState, number> = { idle: 0.35, thinking: 1.6, tool: 2.4, driving: 3.2 };
const WOBBLE: Record<AgentState, number> = { idle: 0.06, thinking: 0.16, tool: 0.2, driving: 0.26 };

export function Orb({ state, size = 26 }: { state: AgentState; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef(state);
  st.current = state;
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const g = c.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;
    let speed = SPEED[st.current];
    let wob = WOBBLE[st.current];
    const draw = () => {
      speed += (SPEED[st.current] - speed) * 0.05;
      wob += (WOBBLE[st.current] - wob) * 0.05;
      t += reduced ? 0 : 0.016 * speed;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2, R = size * 0.32;
      // glow
      const glow = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, size / 2);
      glow.addColorStop(0, st.current === "idle" ? "rgba(124,92,255,0.25)" : "rgba(34,211,238,0.38)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, size, size);
      // blob
      g.beginPath();
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const r = R * (1 + wob * Math.sin(a * 3 + t * 2.1) * 0.6 + wob * Math.sin(a * 5 - t * 1.3) * 0.4);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      const grad = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      const shift = (Math.sin(t) + 1) / 2;
      grad.addColorStop(0, "#7c5cff");
      grad.addColorStop(Math.min(0.95, 0.35 + shift * 0.4), "#5b8cff");
      grad.addColorStop(1, "#22d3ee");
      g.fillStyle = grad;
      g.fill();
      // core highlight
      g.beginPath();
      g.arc(cx - R * 0.3, cy - R * 0.35, R * 0.28, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fill();
      // orbiting spark while working
      if (st.current !== "idle") {
        const sa = t * 3;
        g.beginPath();
        g.arc(cx + Math.cos(sa) * R * 1.35, cy + Math.sin(sa) * R * 1.35, 1.6, 0, Math.PI * 2);
        g.fillStyle = "#fff";
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} aria-label={`agent ${state}`} />;
}
