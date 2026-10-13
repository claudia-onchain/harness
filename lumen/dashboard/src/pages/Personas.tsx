import { useEffect, useState } from "react";
import { api, errText } from "../lib/api";
import { toast } from "../lib/toast";
import { refreshState, useApp } from "../state/app";
import type { Persona } from "../lib/types";
import { Empty, PageHeader } from "../components/ui";

export default function Personas() {
  const { mode } = useApp();
  const [list, setList] = useState<Persona[] | null>(null);
  const load = () => api<Persona[]>("/api/personas").then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, [mode]);
  async function activate(id: string) {
    try { await api("/api/persona", { method: "PUT", body: { id } }); toast(`Persona → ${id}`, "ok"); load(); refreshState(); } catch (e) { toast(errText(e), "bad"); }
  }
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <PageHeader title="Personas" sub="Who the agent is. Built-ins ship with Lumen; add your own as markdown in ~/.lumen/personas/<id>.md (frontmatter name + summary, body = the persona prompt)." />
      {!list ? <div className="row muted"><span className="spinner" /> Loading…</div> : list.length === 0 ? <Empty icon="persona" title={mode === "online" ? "No personas found" : "Personas need the Lumen server"} /> : (
        <div className="cards">
          {list.map((p) => (
            <div key={p.id} className={`panel card ${p.active ? "" : ""}`} style={p.active ? { borderColor: "rgba(124,92,255,.55)", boxShadow: "var(--glow)" } : undefined}>
              <div className="card-h"><div className="ic">{p.name.slice(0, 1)}</div><div className="grow"><b>{p.name}</b><div className="tiny dim mono">{p.id}</div></div>{p.active && <span className="badge accent">active</span>}</div>
              <p className="small muted">{p.summary}</p>
              <div className="row"><div className="grow" /><button className="btn sm" disabled={p.active} onClick={() => activate(p.id)} data-agent-id={`persona.${p.id}`}>{p.active ? "In use" : "Use persona"}</button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
