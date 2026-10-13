// First-load boot: animated LUMEN mark (light sweep + particle field) and a checklist resolved from /api/state.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "../state/app";

type Row = { label: string; value: string; state: "pending" | "done" | "warn" };

function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;
    const resize = () => { w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; };
    resize();
    addEventListener("resize", resize);
    const N = Math.min(140, Math.floor((w * h) / 9000));
    const ps = Array.from({ length: N }, () => {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * Math.max(w, h) * 0.6;
      return { a, r, v: 0.0008 + Math.random() * 0.0025, s: Math.random() * 1.6 + 0.4, hue: Math.random() };
    });
    const t0 = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.42;
      for (const p of ps) {
        if (!reduced) {
          p.a += p.v;
          p.r = Math.max(30, p.r - 0.18 * (1 + Math.sin(t + p.hue * 6)));
          if (p.r <= 31) p.r = Math.max(w, h) * 0.65;
        }
        const x = cx + Math.cos(p.a) * p.r * 1.6, y = cy + Math.sin(p.a) * p.r * 0.7;
        const alpha = Math.min(1, t * 1.5) * (0.25 + 0.6 * (1 - p.r / (Math.max(w, h) * 0.7)));
        g.fillStyle = p.hue > 0.5 ? `rgba(34,211,238,${alpha})` : `rgba(140,115,255,${alpha})`;
        g.beginPath();
        g.arc(x, y, p.s, 0, Math.PI * 2);
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="particles" />;
}

export function Boot({ onDone }: { onDone: () => void }) {
  const { mode, state } = useApp();
  const [shown, setShown] = useState(0);
  const [out, setOut] = useState(false);
  const started = useRef(performance.now());

  const offline = mode === "offline";
  const llm = state?.providers.filter((p) => p.kind === "llm" && p.configured).length ?? 0;
  const outdated = state?.updates.filter((u) => u.outdated) ?? [];
  const rows: Row[] = mode === "loading"
    ? []
    : [
        { label: "Server", value: offline ? "offline · demo mode" : `v${state?.version}`, state: offline ? "warn" : "done" },
        { label: "Keys", value: offline ? "—" : llm ? `${llm} LLM provider${llm > 1 ? "s" : ""}` : "no LLM key yet", state: offline || !llm ? "warn" : "done" },
        { label: "Model", value: state?.model ? `${state.model.provider} · ${state.model.id}` : offline ? "—" : "none · add a key in Settings", state: !offline && state && !state.model ? "warn" : "done" },
        { label: "Chains", value: `${state?.chains ?? 0} networks`, state: "done" },
        { label: "Skills", value: state ? `${state.skills.base + state.skills.chain + state.skills.user}` : "—", state: "done" },
        { label: "Updates", value: outdated.length ? `${outdated.length} available` : "up to date", state: outdated.length ? "warn" : "done" },
      ];

  useEffect(() => {
    if (mode === "loading") return;
    const elapsed = performance.now() - started.current;
    const timers: ReturnType<typeof setTimeout>[] = [];
    rows.forEach((_, i) => timers.push(setTimeout(() => setShown((n) => Math.max(n, i + 1)), Math.max(0, 260 - elapsed) + i * 150)));
    timers.push(setTimeout(finish, Math.max(1500 - elapsed, rows.length * 150 + 400)));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  function finish() {
    setOut(true);
    setTimeout(onDone, 380);
  }

  return (
    <div className={`boot ${out ? "out" : ""}`} onClick={finish}>
      <Particles />
      <div className="boot-inner">
        <div className="boot-mark" aria-label="Lumen">
          LUMEN
          <span className="lit" aria-hidden>LUMEN</span>
          <span className="lit base" aria-hidden>LUMEN</span>
        </div>
        <div className="boot-tag">your keys · your agent · your studio</div>
        <div className="boot-list">
          {mode === "loading" && <div className="boot-row" style={{ opacity: 1 }}><span className="spinner" /> connecting…</div>}
          {rows.slice(0, shown).map((r) => (
            <div key={r.label} className={`boot-row ${r.state}`}>
              <span className="ck">{r.state === "warn" ? "!" : "✓"}</span>
              <span>{r.label}</span>
              <span className="v">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      <button className="btn ghost sm boot-skip" onClick={(e) => { e.stopPropagation(); finish(); }}>Skip <kbd>Esc</kbd></button>
    </div>
  );
}

export function Locked() {
  const local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const [token, setToken] = useState("");
  const go = (e: FormEvent) => { e.preventDefault(); const t = token.trim(); if (t) location.href = `/?t=${encodeURIComponent(t)}`; };
  return (
    <div className="locked">
      <div className="panel card fade-up">
        <svg width="44" height="44" viewBox="0 0 64 64"><defs><linearGradient id="lk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7c5cff" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs><rect width="64" height="64" rx="16" fill="#0e1016" /><path d="M22 14v30h22" fill="none" stroke="url(#lk)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {local ? (
          <>
            <h2>Open from the CLI</h2>
            <p className="muted">This dashboard needs the session token Lumen creates when it opens the page. Run this in your terminal:</p>
            <pre>lumen dashboard</pre>
            <p className="muted small">The link contains a one-time token that is stored as a local cookie. Nothing leaves 127.0.0.1.</p>
          </>
        ) : (
          <>
            <h2>Access token</h2>
            <p className="muted">This Lumen server is hosted. Open the link printed in its console, or paste the access token (the LUMEN_DASHBOARD_TOKEN secret, or the one in the console log).</p>
            <form onSubmit={go} className="row" style={{ gap: 8, marginTop: 12 }}>
              <input className="input" type="password" autoComplete="off" placeholder="Paste token" value={token} onChange={(e) => setToken(e.target.value)} data-agent-id="locked.token" style={{ flex: 1 }} />
              <button className="btn primary" type="submit" disabled={!token.trim()}>Open</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
