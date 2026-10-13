// Dashboard takeover tool and the delegate (sub-agent) tool.
import { obj, str, num } from "./registry.js";
import { wrap } from "../../core/untrusted.js";

const OPS = ["open", "snapshot", "navigate", "click", "type", "drag", "highlight", "scroll", "command", "takeover_start", "takeover_end"];

export function agenticTools() {
  return [
    {
      name: "dashboard", group: "Dashboard", label: "Drive dashboard", aliases: { op: "action" },
      description: [
        "Drive the Lumen web dashboard with a visible ghost cursor. ALWAYS call {action:\"snapshot\"} first: it returns the route, every target id, the registered commands and a summary of studio state.",
        "Actions: open (start + open browser), snapshot, navigate {route}, click/move/highlight {target, note?}, type {target, text} (types) or {target, value} (sets a slider/select/knob), drag {target, to}, scroll {target, value}, command {name, args}, takeover_start {note} / takeover_end.",
        "Target ids: sidebar nav:<route> (e.g. nav:/studio/music); controls <studio>.<thing> e.g. music.play, music.tempo, music.step.<kick|snare|hat|clap|perc|sampler>.<0-15>, synth.cutoff, mixer.drums.gain, photo.preset.<name>, photo.tool.<tool>, video.track.<V1|V2|T1|C1|A1>, video.media.<id>, video.clip.<id>, chat.input, chat.send.",
        "Routes: /studio/image, /studio/photo, /studio/video, /studio/music, /studio/audio (commands auto-navigate by prefix image./photo./video./music.|synth.|mixer.|fx./audio.).",
        "Commands include image.generate {prompt}, image.toPhoto, photo.filter {name, amount}, photo.addText {text}, photo.export {format}, video.import {url}, video.addClip, video.trim, video.split, video.addCaption {text,start,end}, video.export, music.setTempo {bpm}, music.setPattern {track, steps}, music.addNote {pitch, at, dur}, music.preset {name}, music.play/stop, music.export, synth.set {param, value}, fx.set {effect, value}, mixer.set {channel, gain}, audio.load {url}, audio.cut {start,end}, audio.normalize, audio.export. Use snapshot.commands for the exact list and params.",
        "Wrap multi-step work in takeover_start/takeover_end. If a result says user_took_over, stop driving and tell the user.",
      ].join(" "),
      parameters: obj({ action: { type: "string", enum: OPS, description: "What to do (alias: op)" }, route: str("Route for navigate, e.g. /studio/music"), target: str("data-agent-id from snapshot"), to: str("Drag destination id"), text: str("Text to type"), value: { description: "Value for sliders/knobs/selects (type) or scroll amount" }, note: str("Callout / banner note"), name: str("Command name"), args: { type: "object", description: "Command args" } }, ["action"]),
      async run(a, ctx) {
        const d = ctx.runtime?.dashboard;
        if (!d) throw new Error("Dashboard control is unavailable in this mode.");
        if (a.action === "open") { const url = await d.open(); return { text: `Dashboard is open at ${url}. Wait for it to connect, then snapshot.`, summary: "opened" }; }
        const { action, ...rest } = a;
        const r = await d.op(action, rest, { signal: ctx.signal });
        return { ok: r.ok, text: r.ok ? wrap("dashboard", JSON.stringify(r.result ?? { ok: true }, null, 1).slice(0, 20000), { from: "dashboard" }) : `Dashboard ${action} failed: ${r.error}`, summary: r.ok ? `${action} ok` : `${action}: ${r.error}` };
      },
    },
    {
      name: "delegate", group: "Helpers", label: "Delegate", aliases: { prompt: "task", goal: "task" },
      description: "Hand a focused, read-only research job to a helper agent (uses the fast model, web/chain/file read tools, no writes or sends). Returns its summary. Good for parallel lookups.",
      parameters: obj({ task: str("What the helper should find out, with all context it needs"), role: { type: "string", enum: ["research", "chain", "code"], description: "Helper focus" }, persona: str("Optional persona id for the helper (e.g. chain-analyst, researcher)"), tools: { type: "array", items: { type: "string" }, description: "Optional subset of read-only tools to allow" }, max_rounds: num("Max tool rounds (default 8)") }, ["task"]),
      async run(a, ctx) {
        if (ctx.depth > 0) throw new Error("Helpers can't delegate further.");
        const r = await ctx.runtime.subAgent({ task: a.task, role: a.role || (/chain|trader/.test(a.persona || "") ? "chain" : /builder|code/.test(a.persona || "") ? "code" : "research"), persona: a.persona, tools: a.tools, maxRounds: Math.min(16, Number(a.max_rounds) || 8), signal: ctx.signal, parentSession: ctx.sessionId });
        return { text: r.text || "(helper returned nothing)", summary: `${a.role || "research"} helper · ${r.rounds} rounds` };
      },
    },
  ];
}
