// Chat: streaming timeline, image attachments (paste / drag / pick), stop button, suggestion chips.
import { useEffect, useRef, useState } from "react";
import { agent, useAgent } from "../state/agent";
import { useApp } from "../state/app";
import { TimelineItem } from "../components/chat/Timeline";
import { Icon, LumenMark } from "../components/icons";
import { agentProps, useAgentCommands } from "../takeover/registry";
import { runDemoTakeover } from "../takeover/demo";
import { pickFiles } from "../components/ui";

const SUGGESTIONS = [
  "What's ETH worth on Base right now, and where does the price come from?",
  "Build me a 124 BPM house beat in the Music studio",
  "Rug-check this Solana mint before I touch it",
  "Generate a cinematic thumbnail for my video about L2s",
];

const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

export default function Chat() {
  const a = useAgent();
  const { mode, state } = useApp();
  const s = a.sessions[a.sessionId] ?? { items: [], busy: false };
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [s.items]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [text]);

  async function addFiles(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, 6);
    const urls = await Promise.all(imgs.map(readAsDataUrl));
    setImages((x) => [...x, ...urls].slice(0, 6));
  }

  function submit(t = text) {
    const msg = t.trim();
    if (!msg && !images.length) return;
    agent.chat(msg, images);
    setText("");
    setImages([]);
    stick.current = true;
  }

  useAgentCommands([
    { name: "chat.send", description: "Type and send a chat message as the user would (only when the user asked you to).", params: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, panel: "chat.composer", run: ({ text }) => { setText(String(text)); return { ok: true }; } },
  ], () => `Chat: ${s.items.length} items in session ${a.sessionId}${s.busy ? " (agent busy)" : ""}.`);

  const noKey = mode === "online" && state && !state.providers.some((p) => p.kind === "llm" && p.configured);

  return (
    <div className="chat"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files]); }}>
      <div className="chat-scroll" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} {...agentProps("chat.timeline", "Chat timeline", "list")}>
        <div className="chat-col">
          {s.items.length === 0 ? (
            <div className="chat-hero fade-up">
              <LumenMark size={54} />
              <h1>What are we making?</h1>
              <p className="muted">Ask anything — research a token on any of {state?.chains ?? 45} chains, build a beat, edit a photo, cut a short. Lumen can take over the studios and show you as it works.</p>
              {noKey && <a className="btn primary" href="/keys">Add an LLM key to start</a>}
              <div className="sugg">
                {SUGGESTIONS.map((q) => <button key={q} className="sugg-i" onClick={() => submit(q)}>{q}</button>)}
              </div>
              {mode !== "online" && (
                <div className="col" style={{ alignItems: "center", marginTop: 6 }}>
                  <span className="small muted">Server offline. You can still watch Lumen drive the studios:</span>
                  <button className="btn" onClick={runDemoTakeover}><Icon name="wand" /> Run demo takeover</button>
                </div>
              )}
            </div>
          ) : (
            s.items.map((it) => <TimelineItem key={it.id} it={it} />)
          )}
          {s.busy && s.items[s.items.length - 1]?.kind === "user" && <div className="typing"><span /><span /><span /></div>}
        </div>
      </div>
      <div className="composer-wrap">
        <div className={`composer ${drag ? "drag" : ""}`} {...agentProps("chat.composer", "Message composer", "panel")}>
          {images.length > 0 && (
            <div className="attach">
              {images.map((src, i) => (
                <div key={i} className="att">
                  <img src={src} alt="" />
                  <button onClick={() => setImages((x) => x.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={ta}
            rows={1}
            value={text}
            placeholder={drag ? "Drop images to attach" : "Message Lumen…  (Shift+Enter for a new line)"}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); addFiles(files); } }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
            {...agentProps("chat.input", "Message input", "input")}
          />
          <div className="composer-bar">
            <button className="btn ghost sm icon" title="Attach images" onClick={async () => addFiles(await pickFiles("image/*"))}><Icon name="image" size={15} /></button>
            <span className="dim tiny">{a.conn === "open" ? state?.model?.id ?? "no model" : "offline"}</span>
            <div className="grow" />
            {s.busy ? (
              <button className="btn danger sm" onClick={() => agent.stop()} {...agentProps("chat.stop", "Stop", "button")}><Icon name="stop" size={13} /> Stop</button>
            ) : (
              <button className="btn primary sm" onClick={() => submit()} disabled={!text.trim() && !images.length} {...agentProps("chat.send", "Send", "button")}><Icon name="send" size={13} /> Send</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
