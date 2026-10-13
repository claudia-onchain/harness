// Top bar: page title, model + persona switchers, global agent activity orb.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, errText } from "../lib/api";
import { toast } from "../lib/toast";
import { useAgent } from "../state/agent";
import { refreshState, useApp } from "../state/app";
import type { ModelInfo, Persona } from "../lib/types";
import { LumenMark, Icon } from "./icons";
import { ProviderMark } from "./ProviderMark";
import { Orb } from "./Orb";

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    addEventListener("mousedown", on);
    return () => removeEventListener("mousedown", on);
  }, [open, close]);
  return ref;
}

const FALLBACK_MODELS: Record<string, string[]> = {
  anthropic: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  openai: ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"],
  xai: ["grok-4.7", "grok-4.3"],
  openrouter: ["anthropic/claude-opus-5.5", "openai/gpt-6-astra", "x-ai/grok-4.7", "google/gemini-3.8-flash"],
  gemini: ["gemini-3.8-flash"],
};

function ModelSwitcher() {
  const { state, mode } = useApp();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<Record<string, ModelInfo[]>>({});
  const ref = useOutside(open, () => setOpen(false));
  const llms = state?.providers.filter((p) => p.kind === "llm" && p.configured).map((p) => p.id) ?? [];
  const providers = llms.length ? llms : Object.keys(FALLBACK_MODELS);

  useEffect(() => {
    if (!open || mode !== "online") return;
    for (const p of providers) {
      if (models[p]) continue;
      api<{ provider: string; models: ModelInfo[] }>(`/api/models?provider=${encodeURIComponent(p)}`)
        .then((r) => setModels((m) => ({ ...m, [p]: r.models.slice(0, 40) })))
        .catch(() => setModels((m) => ({ ...m, [p]: (FALLBACK_MODELS[p] ?? []).map((id) => ({ id, name: id })) })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  async function pick(provider: string, id: string) {
    setOpen(false);
    try {
      await api("/api/model", { method: "PUT", body: { provider, id } });
      toast(`Model → ${id}`, "ok");
      refreshState();
    } catch (e) { toast(errText(e), "bad"); }
  }

  return (
    <div className="switcher" ref={ref}>
      <button className="switcher-btn" onClick={() => setOpen((o) => !o)} data-agent-id="top.model" data-agent-label="Model switcher">
        <span className="lbl">Model</span>
        {state?.model && <ProviderMark id={state.model.provider} name={state.model.provider} size={18} className="inline" />}
        <span className="val">{state?.model?.id ?? "no model"}</span>
        <Icon name="more" size={14} />
      </button>
      {open && (
        <div className="menu">
          {providers.map((p) => (
            <div key={p}>
              <div className="menu-h row"><ProviderMark id={p} name={p} size={16} className="inline" /> {p}</div>
              {(models[p] ?? (FALLBACK_MODELS[p] ?? []).map((id) => ({ id, name: id }))).map((m) => (
                <button key={m.id} className={`menu-i ${state?.model?.id === m.id ? "on" : ""}`} onClick={() => pick(p, m.id)} disabled={mode !== "online"}>
                  <span>{m.name || m.id}</span>
                  {m.context ? <span className="sub">{Math.round(m.context / 1000)}k</span> : null}
                </button>
              ))}
            </div>
          ))}
          {mode !== "online" && <div className="menu-h" style={{ textTransform: "none", letterSpacing: 0 }}>Connect to the server to switch models.</div>}
        </div>
      )}
    </div>
  );
}

function PersonaSwitcher() {
  const { state, mode } = useApp();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Persona[]>([]);
  const ref = useOutside(open, () => setOpen(false));
  useEffect(() => {
    if (open && mode === "online") api<Persona[]>("/api/personas").then(setList).catch(() => {});
  }, [open, mode]);
  async function pick(id: string) {
    setOpen(false);
    try {
      await api("/api/persona", { method: "PUT", body: { id } });
      toast(`Persona → ${id}`, "ok");
      refreshState();
    } catch (e) { toast(errText(e), "bad"); }
  }
  return (
    <div className="switcher hide-sm" ref={ref}>
      <button className="switcher-btn" onClick={() => setOpen((o) => !o)} data-agent-id="top.persona" data-agent-label="Persona switcher">
        <span className="lbl">Persona</span>
        <span className="val">{state?.persona ?? "lumen"}</span>
      </button>
      {open && (
        <div className="menu">
          <div className="menu-h">Personas</div>
          {list.length === 0 && <div className="menu-i muted">{mode === "online" ? "Loading…" : "Offline"}</div>}
          {list.map((p) => (
            <button key={p.id} className={`menu-i ${p.active ? "on" : ""}`} onClick={() => pick(p.id)}>
              <span>{p.name}</span><span className="sub">{p.id}</span>
            </button>
          ))}
          <Link className="menu-i" to="/personas" onClick={() => setOpen(false)}>Manage personas →</Link>
        </div>
      )}
    </div>
  );
}

export function TopBar({ title, onActivity }: { title: string; onActivity: () => void }) {
  const a = useAgent();
  return (
    <header className="top">
      <div className="mobile-brand row"><LumenMark size={24} /></div>
      <div className="top-title">{title}</div>
      <div className="grow" />
      <PersonaSwitcher />
      <ModelSwitcher />
      <button className="status-pill" onClick={onActivity} title="Agent activity" data-agent-id="top.activity" data-agent-label="Agent activity">
        <Orb state={a.status.state} />
        <b>{a.status.state}</b>
        {a.status.detail && <span className="detail">{a.status.detail}</span>}
      </button>
    </header>
  );
}
