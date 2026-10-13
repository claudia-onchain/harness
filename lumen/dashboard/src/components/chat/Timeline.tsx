// Chat timeline items: user, assistant (streaming markdown), thinking (collapsible), tool cards, approvals, notices.
import { useState } from "react";
import type { Item, ToolItem } from "../../state/agent";
import { Markdown } from "../Markdown";
import { Icon } from "../icons";
import { ApprovalCard } from "./ApprovalCard";

function Thinking({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`thinking ${open ? "open" : ""}`}>
      <button className="th-h" onClick={() => setOpen((o) => !o)}>
        {streaming ? <span className="spinner" /> : <Icon name="wand" size={14} />}
        <span>{streaming ? "Thinking…" : "Thought"}</span>
        <span className="dim tiny">{text.length > 0 ? `${Math.max(1, Math.round(text.split(/\s+/).length))} words` : ""}</span>
        <span className="grow" />
        <span className="dim tiny">{open ? "hide" : "show"}</span>
      </button>
      {open && <div className="th-b">{text}</div>}
    </div>
  );
}

function ToolCard({ t }: { t: ToolItem }) {
  const [open, setOpen] = useState(false);
  const dur = t.endedAt ? `${((t.endedAt - t.startedAt) / 1000).toFixed(1)}s` : "";
  const args = t.args && typeof t.args === "object" ? JSON.stringify(t.args) : String(t.args ?? "");
  return (
    <div className={`toolcard ${t.state}`}>
      <button className="tc-h" onClick={() => setOpen((o) => !o)}>
        {t.state === "running" ? <span className="spinner" /> : <span className={`dot ${t.state === "ok" ? "ok" : "bad"}`} />}
        <span className="tc-name">{t.name}</span>
        <span className="tc-label">{t.summary || t.label || args.slice(0, 90)}</span>
        <span className="grow" />
        <span className="dim tiny">{dur}</span>
        <Icon name={open ? "x" : "more"} size={13} />
      </button>
      {open && (
        <div className="tc-b">
          <div className="tiny dim">args</div>
          <pre>{JSON.stringify(t.args, null, 2)}</pre>
          {t.result !== undefined && (<><div className="tiny dim">result</div><pre>{typeof t.result === "string" ? t.result : JSON.stringify(t.result, null, 2)}</pre></>)}
        </div>
      )}
    </div>
  );
}

export function TimelineItem({ it }: { it: Item }) {
  switch (it.kind) {
    case "user":
      return (
        <div className="msg user">
          {it.source && it.source !== "dashboard" && <span className="badge tiny">{it.source}</span>}
          {it.images?.length ? <div className="msg-imgs">{it.images.map((src, i) => <img key={i} src={src} alt="" />)}</div> : null}
          {it.text && <div className="bubble">{it.text}</div>}
        </div>
      );
    case "assistant":
      return <div className="msg assistant"><Markdown text={it.text} streaming={it.streaming} /></div>;
    case "thinking":
      return <Thinking text={it.text} streaming={it.streaming} />;
    case "tool":
      return <ToolCard t={it} />;
    case "approval":
      return <ApprovalCard approval={it.approval} answered={it.answered} />;
    case "error":
      return <div className="msg-note bad"><Icon name="x" size={14} /> {it.text}</div>;
    case "notice":
      return <div className={`msg-note ${it.level === "warn" ? "warn" : ""}`}><Icon name="bolt" size={14} /> {it.text}</div>;
    case "turn":
      return it.usage ? <div className="turn-meta">{it.model} · {it.usage.input + it.usage.output} tokens · ${it.usage.costUsd?.toFixed(4) ?? "0"}</div> : null;
  }
}
