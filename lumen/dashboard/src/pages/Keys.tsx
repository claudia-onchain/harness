// Keys: provider cards grouped by kind; masked values; set / test / delete via REST. Claudia Local is a placeholder.
import { useEffect, useState } from "react";
import { api, errText } from "../lib/api";
import { toast } from "../lib/toast";
import { refreshState, useApp } from "../state/app";
import type { ProviderKind, ProviderStatus } from "../lib/types";
import { Btn, Empty, PageHeader } from "../components/ui";
import { ProviderMark } from "../components/ProviderMark";
import { agentProps } from "../takeover/registry";

const GROUPS: { kind: ProviderKind; title: string; sub: string }[] = [
  { kind: "llm", title: "Language models", sub: "At least one is required: Anthropic, OpenAI, xAI Grok, OpenRouter or Gemini (or a local Ollama / LM Studio)." },
  { kind: "media", title: "Media", sub: "Images, video, speech and music. OpenRouter alone covers most of it." },
  { kind: "chain", title: "Chain", sub: "RPC and explorers. Everything works keyless on public RPCs, just slower." },
  { kind: "data", title: "Data", sub: "Prices, swaps and market data." },
  { kind: "social", title: "Social", sub: "Posting integrations." },
];

const FALLBACK: ProviderStatus[] = [
  ["anthropic", "Anthropic", "llm", "ANTHROPIC_API_KEY"], ["openai", "OpenAI", "llm", "OPENAI_API_KEY"], ["xai", "xAI Grok", "llm", "XAI_API_KEY"], ["openrouter", "OpenRouter", "llm", "OPENROUTER_API_KEY"], ["gemini", "Google Gemini", "llm", "GEMINI_API_KEY"],
  ["fal", "fal", "media", "FAL_KEY"], ["elevenlabs", "ElevenLabs", "media", "ELEVENLABS_API_KEY"],
  ["alchemy", "Alchemy", "chain", "ALCHEMY_API_KEY"], ["etherscan", "Etherscan V2", "chain", "ETHERSCAN_API_KEY"], ["helius", "Helius", "chain", "HELIUS_API_KEY"],
  ["coingecko", "CoinGecko", "data", "COINGECKO_API_KEY"], ["zerox", "0x", "data", "ZEROX_API_KEY"], ["jupiter", "Jupiter", "data", "JUPITER_API_KEY"],
].map(([id, name, kind, env]) => ({ id, name, kind: kind as ProviderKind, env, configured: false, docs: "", fields: [{ id, label: "API key", placeholder: env }] }));

function ProviderCard({ p, onChange, offline }: { p: ProviderStatus; onChange: (l: ProviderStatus[]) => void; offline: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "test" | "del">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = Object.values(vals).some((v) => v.trim());

  async function save() {
    setBusy("save");
    try {
      const body = Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
      const r = await api<{ ok: boolean; providers: ProviderStatus[] }>("/api/keys", { method: "PUT", body });
      onChange(r.providers);
      setVals({});
      toast(`${p.name} key saved`, "ok");
      refreshState();
    } catch (e) { toast(errText(e), "bad"); }
    setBusy("");
  }
  async function test() {
    setBusy("test");
    try { const r = await api<{ ok: boolean; message: string }>("/api/keys/test", { method: "POST", body: { provider: p.id } }); setMsg({ ok: r.ok, text: r.message }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setBusy("");
  }
  async function del() {
    if (!confirm(`Delete the ${p.name} key from ~/.lumen/keys.json?`)) return;
    setBusy("del");
    try {
      const r = await api<{ ok: boolean; providers: ProviderStatus[] }>("/api/keys", { method: "PUT", body: Object.fromEntries(p.fields.map((f) => [f.id, null])) });
      onChange(r.providers);
      setMsg(null);
      refreshState();
    } catch (e) { toast(errText(e), "bad"); }
    setBusy("");
  }
  return (
    <div className="panel card" {...agentProps(`keys.${p.id}`, `${p.name} key`, "panel")}>
      <div className="card-h">
        <ProviderMark id={p.id} name={p.name} />
        <div className="grow">
          <b>{p.name}</b>
          <div className="tiny dim mono">{p.env}</div>
        </div>
        {p.configured ? <span className="badge ok">● {p.masked ?? "set"}</span> : <span className="badge">not set</span>}
      </div>
      {p.fields.map((f) => (
        <input key={f.id} className="input mono" type="password" autoComplete="off" spellCheck={false} placeholder={p.configured ? `Replace ${f.label.toLowerCase()}` : f.placeholder || f.label}
          value={vals[f.id] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))} disabled={offline} {...agentProps(`keys.${p.id}.${f.id}`, `${p.name} ${f.label}`, "input")} />
      ))}
      {msg && <div className={`small ${msg.ok ? "" : ""}`} style={{ color: msg.ok ? "var(--ok)" : "var(--bad)" }}>{msg.text}</div>}
      <div className="row">
        <Btn size="sm" kind="primary" onClick={save} disabled={!dirty || !!busy || offline}>{busy === "save" ? "Saving…" : "Save"}</Btn>
        <Btn size="sm" onClick={test} disabled={!p.configured || !!busy}>{busy === "test" ? "Testing…" : "Test"}</Btn>
        <div className="grow" />
        {p.docs && <a className="small" href={p.docs} target="_blank" rel="noreferrer">Get a key ↗</a>}
        {p.configured && <Btn size="sm" kind="danger" icon="trash" onClick={del} disabled={!!busy} title="Delete key" />}
      </div>
    </div>
  );
}

export default function Keys() {
  const { mode } = useApp();
  const [list, setList] = useState<ProviderStatus[] | null>(null);
  useEffect(() => {
    api<ProviderStatus[]>("/api/providers").then(setList).catch(() => setList(FALLBACK));
  }, [mode]);
  const offline = mode !== "online";
  return (
    <div className="page">
      <PageHeader title="Keys" sub="Bring your own keys. Stored in ~/.lumen/keys.json (0600), never shown in full, never sent anywhere except the provider. Env vars override the file." />
      {!list ? <div className="row muted"><span className="spinner" /> Loading…</div> : list.length === 0 ? <Empty title="No providers reported" /> : GROUPS.map((g) => {
        const items = list.filter((p) => p.kind === g.kind);
        if (!items.length) return null;
        return (
          <section key={g.kind}>
            <div className="section-t">{g.title}</div>
            <p className="small muted" style={{ margin: "-4px 0 10px" }}>{g.sub}</p>
            <div className="cards">{items.map((p) => <ProviderCard key={p.id} p={p} onChange={setList} offline={offline} />)}</div>
          </section>
        );
      })}
      <div className="section-t">Connectors</div>
      <div className="cards">
        <div className="panel card disabled" aria-disabled>
          <div className="card-h"><div className="ic">C</div><div className="grow"><b>Claudia Local</b><div className="tiny dim">Connect a local Claudia studio</div></div><span className="badge warn">coming later</span></div>
          <p className="small muted">A bridge to Claudia Local is planned. It is not available in this version.</p>
          <div className="row"><button className="btn sm" disabled>Connect</button></div>
        </div>
      </div>
    </div>
  );
}
