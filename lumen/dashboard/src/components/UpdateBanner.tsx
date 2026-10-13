// "@useclaudia/media 0.4.0 available — Update" banner from /api/updates (and the boot state).
import { useEffect, useState } from "react";
import { api, errText } from "../lib/api";
import { toast } from "../lib/toast";
import { refreshState, useApp } from "../state/app";
import type { UpdateInfo } from "../lib/types";
import { Icon } from "./icons";

export function UpdateBanner() {
  const { state, mode } = useApp();
  const [list, setList] = useState<UpdateInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem("lumen.hideUpdates") === "1"; } catch { return false; } });
  useEffect(() => {
    if (state?.updates) setList(state.updates);
    if (mode === "online") api<UpdateInfo[]>("/api/updates").then(setList).catch(() => {});
  }, [mode, state?.updates]);
  const outdated = list.filter((u) => u.outdated);
  if (!outdated.length || hidden) return null;
  const first = outdated[0];
  async function install() {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; log: string }>("/api/updates/install", { method: "POST", body: { names: outdated.map((u) => u.name) }, timeoutMs: 180000 });
      toast(r.ok ? "Updated. Restart Lumen to load the new versions." : "Update finished with warnings — see Updates.", r.ok ? "ok" : "warn");
      refreshState();
      setList((l) => l.map((u) => ({ ...u, outdated: false })));
    } catch (e) { toast(errText(e), "bad"); }
    setBusy(false);
  }
  return (
    <div className="banner">
      <Icon name="update" />
      <span className="grow"><b>{first.name} {first.latest}</b> available{outdated.length > 1 ? ` (+${outdated.length - 1} more)` : ""} — you have {first.current}</span>
      <button className="btn primary sm" onClick={install} disabled={busy} data-agent-id="updates.install" data-agent-label="Install updates">{busy ? <span className="spinner" /> : null}Update</button>
      <button className="btn ghost sm icon" onClick={() => { setHidden(true); try { sessionStorage.setItem("lumen.hideUpdates", "1"); } catch { /* */ } }} aria-label="Dismiss"><Icon name="x" size={14} /></button>
    </div>
  );
}
