import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errText } from "../lib/api";
import { ago } from "../lib/format";
import { toast } from "../lib/toast";
import { agent, type Item } from "../state/agent";
import { useApp } from "../state/app";
import type { SessionInfo } from "../lib/types";
import { Btn, Empty, PageHeader } from "../components/ui";

/** Accepts TimelineItem[] from the server in either the dashboard shape or a {type,...} event shape. */
function toItems(raw: any[]): Item[] {
  return raw.map((x, i): Item | null => {
    const id = x.id ?? x.callId ?? `h${i}`;
    const k = x.kind ?? x.type ?? x.role;
    if (k === "user") return { kind: "user", id, text: x.text ?? x.content ?? "" };
    if (k === "assistant" || k === "delta") return { kind: "assistant", id, text: x.text ?? x.content ?? "" };
    if (k === "thinking") return { kind: "thinking", id, text: x.text ?? x.delta ?? "" };
    if (k === "tool" || k === "tool_start") return { kind: "tool", id, name: x.name, label: x.label, args: x.args, state: x.ok === false || x.state === "error" ? "error" : "ok", summary: x.summary, result: x.result, startedAt: 0 };
    if (k === "error") return { kind: "error", id, text: x.text ?? x.message ?? "" };
    if (k === "notice") return { kind: "notice", id, text: x.text ?? "" };
    return null;
  }).filter(Boolean) as Item[];
}

export default function Sessions() {
  const { mode } = useApp();
  const nav = useNavigate();
  const [list, setList] = useState<SessionInfo[] | null>(null);
  useEffect(() => { api<SessionInfo[]>("/api/sessions").then(setList).catch(() => setList([])); }, [mode]);
  async function open(id: string) {
    try {
      const s = await api<{ id: string; title: string; items: any[] }>(`/api/sessions/${encodeURIComponent(id)}`);
      agent.loadSession(s.id, toItems(s.items ?? []));
      nav("/chat");
    } catch (e) { toast(errText(e), "bad"); }
  }
  function exportMd(s: SessionInfo) {
    api<{ items: any[]; title: string }>(`/api/sessions/${encodeURIComponent(s.id)}`).then((d) => {
      const md = `# ${d.title}\n\n` + toItems(d.items).map((it) => it.kind === "user" ? `**You:** ${it.text}` : it.kind === "assistant" ? it.text : it.kind === "tool" ? `> tool \`${it.name}\` ${it.summary ?? ""}` : "").filter(Boolean).join("\n\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
      a.download = `${s.title.replace(/[^\w-]+/g, "-").slice(0, 40) || s.id}.md`;
      a.click();
    }).catch((e) => toast(errText(e), "bad"));
  }
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader title="Sessions" sub="Every conversation, from the CLI or the dashboard. Open one to continue it here."><Btn icon="plus" onClick={() => { agent.newSession(); nav("/chat"); }}>New session</Btn></PageHeader>
      {!list ? <div className="row muted"><span className="spinner" /> Loading…</div> : list.length === 0 ? <Empty icon="history" title={mode === "online" ? "No sessions yet" : "Sessions need the Lumen server"} /> : (
        <table className="t">
          <thead><tr><th>Title</th><th>Messages</th><th>Updated</th><th /></tr></thead>
          <tbody>{list.map((s) => (
            <tr key={s.id}>
              <td><a href="#" onClick={(e) => { e.preventDefault(); open(s.id); }}>{s.title || s.id}</a></td>
              <td className="mono">{s.messages}</td>
              <td className="muted">{ago(s.updated)}</td>
              <td style={{ textAlign: "right" }}><Btn size="sm" kind="ghost" icon="download" onClick={() => exportMd(s)}>Export</Btn></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
