import { useEffect } from "react";
import { api } from "../lib/api";
import { agent, useAgent } from "../state/agent";
import { useApp } from "../state/app";
import type { Approval } from "../lib/types";
import { ApprovalCard } from "../components/chat/ApprovalCard";
import { Empty, PageHeader } from "../components/ui";

export default function Approvals() {
  const a = useAgent();
  const { mode } = useApp();
  useEffect(() => { if (mode === "online") api<Approval[]>("/api/approvals").then((l) => agent.setApprovals(l)).catch(() => {}); }, [mode]);
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHeader title="Approvals" sub="Anything that signs, sends, spends or writes waits here for a human yes. The agent can never approve its own requests." />
      {a.approvals.length === 0 ? <Empty icon="shield" title="Nothing waiting">Transactions, shell commands, paid media jobs and agent questions show up here and in the chat.</Empty>
        : <div className="col" style={{ gap: 12 }}>{a.approvals.map((x) => <ApprovalCard key={x.id} approval={x} />)}</div>}
    </div>
  );
}
