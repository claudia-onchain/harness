// Approval prompt. Transactions show every detail and need an explicit confirmation before Approve unlocks.
import { useState } from "react";
import type { Approval } from "../../lib/types";
import { agent } from "../../state/agent";
import { api, errText } from "../../lib/api";
import { toast } from "../../lib/toast";
import { ago } from "../../lib/format";
import { Icon } from "../icons";

function DetailView({ detail }: { detail: unknown }) {
  if (detail == null) return null;
  if (typeof detail === "string") return <pre className="ap-raw">{detail}</pre>;
  if (typeof detail === "object" && !Array.isArray(detail)) {
    const entries = Object.entries(detail as Record<string, unknown>);
    return (
      <div className="kv ap-kv">
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <span>{k}</span>
            <span className="mono" style={{ wordBreak: "break-all" }}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <pre className="ap-raw">{JSON.stringify(detail, null, 2)}</pre>;
}

const KIND_LABEL: Record<Approval["kind"], string> = { tx: "Transaction", shell: "Shell command", media: "Paid media job", write: "File write", question: "Question" };

/** Answer via WS when connected, else via REST. */
export async function answerApproval(id: string, approve: boolean, answer?: string) {
  if (agent.connected()) agent.answer(id, approve, answer);
  else {
    await api(`/api/approvals/${encodeURIComponent(id)}`, { method: "POST", body: { approve, ...(answer ? { answer } : {}) } });
    agent.markApprovalAnswered(id, answer || (approve ? "Approved" : "Rejected"));
  }
}

export function ApprovalCard({ approval, answered }: { approval: Approval; answered?: string }) {
  const [confirm, setConfirm] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const isTx = approval.kind === "tx";
  const unlocked = !isTx || confirm.trim().toLowerCase() === "confirm";

  async function go(approve: boolean, answer?: string) {
    setBusy(true);
    try { await answerApproval(approval.id, approve, answer); } catch (e) { toast(errText(e), "bad"); }
    setBusy(false);
  }

  return (
    <div className={`approval ${isTx ? "tx" : ""} ${answered ? "done" : ""}`} data-agent-ignore>
      <div className="ap-h">
        <Icon name={isTx ? "wallet" : approval.kind === "question" ? "chat" : "shield"} />
        <span className="badge warn">{KIND_LABEL[approval.kind] ?? approval.kind}</span>
        <b className="grow">{approval.title}</b>
        <span className="dim tiny">{ago(approval.createdAt)}</span>
      </div>
      <DetailView detail={approval.detail} />
      {answered ? (
        <div className="ap-answered"><Icon name="check" size={14} /> {answered}</div>
      ) : approval.kind === "question" ? (
        <div className="col">
          <div className="row wrap">
            {(approval.options ?? ["Yes", "No"]).map((o) => <button key={o} className="btn sm" disabled={busy} onClick={() => go(true, o)}>{o}</button>)}
          </div>
          <div className="row">
            <input className="input" placeholder="Or type an answer…" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && custom.trim() && go(true, custom.trim())} />
            <button className="btn sm" disabled={!custom.trim() || busy} onClick={() => go(true, custom.trim())}>Send</button>
          </div>
        </div>
      ) : (
        <>
          {isTx && (
            <div className="ap-confirm">
              <p className="small muted">Review the simulated preview above. Signing is irreversible. Type <b>confirm</b> to unlock Approve.</p>
              <input className="input mono" placeholder="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
          )}
          <div className="row">
            <button className="btn danger" disabled={busy} onClick={() => go(false)}>Reject</button>
            <div className="grow" />
            <button className={`btn ${isTx ? "ok" : "primary"}`} disabled={!unlocked || busy} onClick={() => go(true)}>{isTx ? "Sign & send" : "Approve"}</button>
          </div>
        </>
      )}
    </div>
  );
}
