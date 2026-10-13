// Global takeover overlay: ghost cursor + trail, ripples, highlight rings with callouts, the
// "Lumen is driving" banner, the glowing frame, and the Take back (Esc) button.
import { useEffect, useRef, useState } from "react";
import { attachCursor, overlay, type Highlight } from "./cursor";
import { takeBack } from "./runner";

function Ring({ h }: { h: Highlight }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el && h.el.isConnected) {
        const r = h.el.getBoundingClientRect();
        el.style.transform = `translate3d(${r.left - 6}px, ${r.top - 6}px, 0)`;
        el.style.width = `${r.width + 12}px`;
        el.style.height = `${r.height + 12}px`;
        el.dataset.below = r.top < 90 ? "1" : "";
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [h.el]);
  return (
    <div ref={ref} className={`ag-ring ${h.tone === "warn" ? "warn" : ""}`}>
      {h.note && <div className="ag-callout">{h.note}</div>}
    </div>
  );
}

export function AgentCursor() {
  const o = overlay.use();
  const cur = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);

  useEffect(() => {
    attachCursor(cur.current, trail.current);
    const onResize = () => force((n) => n + 1);
    addEventListener("resize", onResize);
    return () => { attachCursor(null, null); removeEventListener("resize", onResize); };
  }, []);

  useEffect(() => {
    if (!o.active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); takeBack(); } };
    addEventListener("keydown", onKey);
    document.body.classList.add("lumen-driving");
    return () => { removeEventListener("keydown", onKey); document.body.classList.remove("lumen-driving"); };
  }, [o.active]);

  return (
    <div className="ag-layer" aria-hidden={!o.active} data-agent-ignore>
      <canvas ref={trail} className="ag-trail" />
      {o.active && <div className="ag-frame" />}
      {o.highlights.map((h) => <Ring key={h.id} h={h} />)}
      {o.ripples.map((r) => <span key={r.id} className="ag-ripple" style={{ left: r.x, top: r.y }} />)}
      <div ref={cur} className={`ag-cursor ${o.visible ? "on" : ""} ${o.pressed ? "down" : ""}`}>
        <svg width="26" height="30" viewBox="0 0 26 30" className="ag-pointer">
          <defs>
            <linearGradient id="agg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7c5cff" />
              <stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <path d="M2 2 L2 24 L8.2 18.4 L12.6 28 L16.4 26.3 L12.1 17 L21 17 Z" fill="url(#agg)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <span className="ag-tag">Lumen{o.caption ? <em> · {o.caption}</em> : null}</span>
      </div>
      {o.active && (
        <div className="ag-banner" role="status">
          <span className="ag-dot" />
          <span className="ag-banner-text">
            <b>Lumen is driving</b>
            {o.note && o.note !== "Lumen is driving" ? <span> — {o.note}</span> : null}
            {o.demo ? <span className="ag-demo-tag">demo</span> : null}
          </span>
          <button className="ag-takeback" onClick={takeBack}>
            Take back <kbd>Esc</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
