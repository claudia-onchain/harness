// Live feed of the agent's tool activity (side drawer). Opens automatically while the agent drives.
import { useEffect } from "react";
import { useAgent } from "../state/agent";
import { ago } from "../lib/format";
import { Icon } from "./icons";
import { Orb } from "./Orb";

export function ActivityDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAgent();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <aside className={`drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="panel-h">
        <Orb state={a.status.state} size={22} />
        <h3>Agent activity</h3>
        <span className="badge">{a.status.state}</span>
        <div className="grow" />
        <button className="btn ghost sm icon" onClick={onClose} aria-label="Close"><Icon name="x" size={14} /></button>
      </div>
      <div className="feed">
        {a.activity.length === 0 && <div className="empty small">No tool activity yet. When Lumen works, every tool call streams here live.</div>}
        {a.activity.map((x) => (
          <div key={x.id} className="feed-i">
            {x.state === "running" ? <span className="spinner" /> : <span className={`dot ${x.state === "ok" ? "ok" : "bad"}`} style={{ marginTop: 5 }} />}
            <div>
              <div className="nm">{x.name}</div>
              <div className="sm">{x.summary || x.label}</div>
            </div>
            <time>{ago(x.ts)}</time>
          </div>
        ))}
      </div>
      <div className="side-foot">
        <span>Session spend</span>
        <span className="grow" />
        <span className="mono">${a.spend.costUsd.toFixed(4)}</span>
        <span className="dim mono">{a.spend.input + a.spend.output} tok</span>
      </div>
    </aside>
  );
}
