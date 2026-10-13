import { Link } from "react-router-dom";
import { useApp } from "../state/app";
import { useAgent } from "../state/agent";
import { runDemoTakeover } from "../takeover/demo";
import { Btn, PageHeader, Panel } from "../components/ui";
import { Icon } from "../components/icons";

export default function Settings() {
  const { state, mode } = useApp();
  const a = useAgent();
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader title="Settings" sub="Most settings live in ~/.lumen/config.json and are edited from the CLI (/settings). This page shows what the dashboard sees." />
      <div className="grid" style={{ gap: 14 }}>
        <Panel title="Agent takeover" actions={<span className="badge accent">showpiece</span>}>
          <p className="small muted" style={{ marginBottom: 12 }}>The agent can drive this dashboard with a visible ghost cursor: it glides, clicks, types and drags across the studios while you watch. Press <kbd>Esc</kbd> or “Take back” at any time. The demo runs locally, without the server: it builds a beat in the Music studio, then grades a photo.</p>
          <div className="row wrap">
            <Btn kind="primary" icon="wand" onClick={runDemoTakeover} agent="settings.demo" label="Demo takeover">Demo takeover</Btn>
            <span className="tiny dim">or open <code>/?demo=takeover</code></span>
          </div>
        </Panel>
        <Panel title="Connection">
          <div className="kv">
            <span>Server</span><span>{mode === "online" ? `connected · v${state?.version}` : mode}</span>
            <span>WebSocket</span><span>{a.conn}</span>
            <span>Model</span><span className="mono">{state?.model ? `${state.model.provider} · ${state.model.id}` : state ? "none (add an LLM key below)" : "—"}</span>
            <span>Persona</span><span>{state?.persona ?? "—"}</span>
            <span>Platform</span><span>{state?.platform ?? "—"} {state?.screen.supported ? "· screen markers available" : ""}</span>
            <span>Skills</span><span>{state ? `${state.skills.base} base · ${state.skills.chain} chain · ${state.skills.user} user` : "—"}</span>
            <span>Spend (this tab)</span><span className="mono">${a.spend.costUsd.toFixed(4)}</span>
          </div>
        </Panel>
        <Panel title="Safety">
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>Chain tools are read-only by default. Signing needs a configured wallet key, a simulated preview, per-tx and per-day caps, and your explicit yes on the <Link to="/approvals">Approvals</Link> page or in the CLI.</li>
            <li>The agent can never approve its own requests. Web pages, token names, memos and files are treated as untrusted data.</li>
            <li>The dashboard only listens on 127.0.0.1 and needs the session token from <code>lumen dashboard</code>.</li>
          </ul>
        </Panel>
        <Panel title="Keyboard">
          <div className="kv small">
            <span><kbd>Esc</kbd></span><span>Take back control from the agent · close drawers</span>
            <span><kbd>Space</kbd></span><span>Play / pause (Video)</span>
            <span><kbd>S</kbd></span><span>Split at playhead (Video)</span>
            <span><kbd>V C B E T U</kbd></span><span>Photo tools: move, crop, brush, eraser, text, shape</span>
            <span><kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd></span><span>Undo / redo (Photo)</span>
          </div>
        </Panel>
        <p className="tiny dim row"><Icon name="bolt" size={12} /> Lumen dashboard · fonts self-hosted · no external CDNs</p>
      </div>
    </div>
  );
}
