import { useEffect, useState } from "react";
import { api, errText } from "../lib/api";
import { toast } from "../lib/toast";
import { refreshState, useApp } from "../state/app";
import type { UpdateInfo } from "../lib/types";
import { Btn, Empty, PageHeader, Panel } from "../components/ui";

export default function Updates() {
  const { mode, state } = useApp();
  const [list, setList] = useState<UpdateInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const load = (force = false) => api<UpdateInfo[]>(`/api/updates${force ? "?force=1" : ""}`).then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, [mode]);
  async function install(names?: string[]) {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; log: string }>("/api/updates/install", { method: "POST", body: names ? { names } : {}, timeoutMs: 300000 });
      setLog(r.log);
      toast(r.ok ? "Updated — restart Lumen to load new versions" : "Update finished with errors", r.ok ? "ok" : "warn");
      load(true); refreshState();
    } catch (e) { toast(errText(e), "bad"); }
    setBusy(false);
  }
  const outdated = list?.filter((u) => u.outdated) ?? [];
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader title="Updates" sub={`Lumen ${state?.version ?? ""} checks npm once a day for itself and @useclaudia/sdk, @useclaudia/media, @useclaudia/social. Same as \`lumen update\`.`}>
        <Btn icon="update" onClick={() => load(true)} disabled={mode !== "online"}>Check now</Btn>
        <Btn kind="primary" onClick={() => install()} disabled={!outdated.length || busy}>{busy ? "Installing…" : `Update all${outdated.length ? ` (${outdated.length})` : ""}`}</Btn>
      </PageHeader>
      {!list ? <div className="row muted"><span className="spinner" /> Loading…</div> : list.length === 0 ? <Empty icon="update" title={mode === "online" ? "Nothing to report" : "Update checks need the Lumen server"}>Run <code>lumen update</code> in your terminal.</Empty> : (
        <table className="t">
          <thead><tr><th>Package</th><th>Installed</th><th>Latest</th><th /></tr></thead>
          <tbody>{list.map((u) => (
            <tr key={u.name}>
              <td className="mono">{u.name}</td><td className="mono">{u.current}</td><td className="mono">{u.latest}</td>
              <td style={{ textAlign: "right" }}>{u.outdated ? <Btn size="sm" onClick={() => install([u.name])} disabled={busy}>Update</Btn> : <span className="badge ok">up to date</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {log && <Panel title="Install log" className="fade-up"><pre className="log">{log}</pre></Panel>}
    </div>
  );
}
