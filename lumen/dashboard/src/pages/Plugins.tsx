import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errText } from "../lib/api";
import { toast } from "../lib/toast";
import { useApp } from "../state/app";
import type { PluginInfo } from "../lib/types";
import { Empty, PageHeader } from "../components/ui";
import { loadPlugin, pluginRegistry } from "../plugins/host";

export default function Plugins() {
  const { mode } = useApp();
  const reg = pluginRegistry.use();
  const [list, setList] = useState<PluginInfo[] | null>(null);
  useEffect(() => { api<PluginInfo[]>("/api/plugins").then(setList).catch(() => setList([])); }, [mode]);
  async function toggle(p: PluginInfo) {
    try {
      await api(`/api/plugins/${encodeURIComponent(p.id)}`, { method: "PUT", body: { enabled: !p.enabled } });
      setList((l) => l?.map((x) => (x.id === p.id ? { ...x, enabled: !p.enabled } : x)) ?? null);
      if (!p.enabled && p.kind === "dashboard" && p.entry) await loadPlugin({ ...p, enabled: true });
      toast(`${p.name} ${p.enabled ? "disabled" : "enabled"}${p.kind === "tool" ? " — restart the agent to apply" : ""}`, "ok");
    } catch (e) { toast(errText(e), "bad"); }
  }
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <PageHeader title="Plugins" sub="Tool plugins (~/.lumen/plugins/*.js) add agent tools and slash commands. Dashboard plugins add studio panels, effects, instruments and UiCommands." />
      {!list ? <div className="row muted"><span className="spinner" /> Loading…</div> : list.length === 0 ? (
        <Empty icon="plug" title={mode === "online" ? "No plugins installed" : "Plugins need the Lumen server"}>Drop an ES module in <code>~/.lumen/plugins/</code>. See the <code>lumen-plugin-authoring</code> skill.</Empty>
      ) : (
        <div className="cards">
          {list.map((p) => (
            <div key={p.id} className="panel card">
              <div className="card-h">
                <div className="ic">{p.name.slice(0, 1)}</div>
                <div className="grow"><b>{p.name}</b><div className="tiny dim mono">{p.id} · v{p.version}</div></div>
                <span className={`badge ${p.kind === "dashboard" ? "accent" : ""}`}>{p.kind}</span>
              </div>
              {reg.failed[p.id] && <div className="small" style={{ color: "var(--bad)" }}>Load error: {reg.failed[p.id]}</div>}
              {reg.loaded.includes(p.id) && <div className="small" style={{ color: "var(--ok)" }}>Loaded · {reg.panels.filter((x) => x.pluginId === p.id).length} panel(s), {reg.effects.filter((x) => x.pluginId === p.id).length} effect(s)</div>}
              <div className="row">
                <label className="row small"><input type="checkbox" checked={p.enabled} onChange={() => toggle(p)} /> enabled</label>
                <div className="grow" />
                {reg.panels.filter((x) => x.pluginId === p.id).map((x) => <Link key={x.id} className="btn sm" to={`/plugin/${x.id}`}>{x.title}</Link>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
