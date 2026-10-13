// Audio studio (wavesurfer.js v8): load/drag audio, waveform + region selection, cut/trim/fade/normalize/gain/
// reverse via WebAudio, TTS into the editor, undo, export WAV.
import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { Btn, Panel, pickFiles } from "../../components/ui";
import { Icon } from "../../components/icons";
import { agentProps, useAgentCommands } from "../../takeover/registry";
import { download, fmtTime } from "../../lib/format";
import { toast } from "../../lib/toast";
import { api, upload, errText } from "../../lib/api";
import { encodeWav } from "../../lib/wav";
import { createStore, sleep } from "../../lib/store";
import { isDemo } from "../../state/app";
import type { MediaJob } from "../../lib/types";
import { cut, decode, fadeIn, fadeOut, gain, normalize, peak, reverse, rmsDb, silence, trim } from "./dsp";

type Sel = { start: number; end: number } | null;
export const audioStudio = createStore<{ name: string | null; duration: number; sel: Sel; playing: boolean; time: number; undo: number; peakDb: number; rms: number; zoom: number }>({ name: null, duration: 0, sel: null, playing: false, time: 0, undo: 0, peakDb: -Infinity, rms: -Infinity, zoom: 0 });

let buffer: AudioBuffer | null = null;
const history: AudioBuffer[] = [];
let ws: WaveSurfer | null = null;
let regions: ReturnType<typeof RegionsPlugin.create> | null = null;

async function show(b: AudioBuffer, name?: string, record = true) {
  if (record && buffer) { history.push(buffer); if (history.length > 25) history.shift(); }
  buffer = b;
  audioStudio.set({ duration: b.duration, undo: history.length, peakDb: 20 * Math.log10(peak(b) || 1e-9), rms: rmsDb(b), ...(name ? { name } : {}) });
  await ws?.loadBlob(encodeWav(b));
}

export async function loadAudioUrl(url: string, name?: string) {
  const data = await (await fetch(url)).arrayBuffer();
  history.length = 0;
  buffer = null;
  regions?.clearRegions();
  audioStudio.set({ sel: null });
  await show(await decode(data), name ?? url.split("/").pop() ?? "audio", false);
}

function range(): { start: number; end: number } {
  const s = audioStudio.get().sel;
  return s ?? { start: 0, end: buffer?.duration ?? 0 };
}
function need() { if (!buffer) throw new Error("no audio loaded"); return buffer; }

const OPS = {
  cut: (a?: number, b?: number) => { const r = a !== undefined && b !== undefined ? { start: a, end: b } : range(); if (!audioStudio.get().sel && a === undefined) throw new Error("select a region to cut"); return show(cut(need(), r.start, r.end)).then(() => { regions?.clearRegions(); audioStudio.set({ sel: null }); }); },
  trim: () => { const r = range(); return show(trim(need(), r.start, r.end)).then(() => { regions?.clearRegions(); audioStudio.set({ sel: null }); }); },
  fadeIn: (sec?: number) => { const r = sec ? { start: 0, end: sec } : range(); return show(fadeIn(need(), r.start, r.end)); },
  fadeOut: (sec?: number) => { const b = need(); const r = sec ? { start: b.duration - sec, end: b.duration } : range(); return show(fadeOut(b, r.start, r.end)); },
  normalize: (db = -1) => { const r = range(); return show(normalize(need(), r.start, r.end, db)); },
  gain: (db: number) => { const r = range(); return show(gain(need(), r.start, r.end, db)); },
  silence: () => { const r = range(); return show(silence(need(), r.start, r.end)); },
  reverse: () => { const r = range(); return show(reverse(need(), r.start, r.end)); },
  undo: async () => { const prev = history.pop(); if (prev) await show(prev, undefined, false); audioStudio.set({ undo: history.length }); },
};

export default function AudioStudio() {
  const st = audioStudio.use();
  const el = useRef<HTMLDivElement>(null);
  const [tts, setTts] = useState("");
  const [voice, setVoice] = useState("marin");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const w = WaveSurfer.create({ container: el.current!, height: 180, waveColor: "#3b3f63", progressColor: "#7c5cff", cursorColor: "#22d3ee", cursorWidth: 2, barWidth: 2, barGap: 1, barRadius: 2, normalize: false, dragToSeek: false });
    const r = w.registerPlugin(RegionsPlugin.create());
    r.enableDragSelection({ color: "rgba(34, 211, 238, 0.18)" });
    r.on("region-created", (reg) => { for (const x of r.getRegions()) if (x !== reg) x.remove(); audioStudio.set({ sel: { start: reg.start, end: reg.end } }); });
    r.on("region-updated", (reg) => audioStudio.set({ sel: { start: reg.start, end: reg.end } }));
    w.on("timeupdate", (t) => audioStudio.set({ time: t }));
    w.on("play", () => audioStudio.set({ playing: true }));
    w.on("pause", () => audioStudio.set({ playing: false }));
    ws = w;
    regions = r;
    if (buffer) w.loadBlob(encodeWav(buffer));
    return () => { w.destroy(); ws = null; regions = null; };
  }, []);

  async function onFiles(files: File[]) {
    const f = files.find((x) => x.type.startsWith("audio/") || /\.(wav|mp3|ogg|m4a|flac|aac)$/i.test(x.name));
    if (!f) return toast("Drop an audio file (WAV, MP3, OGG, M4A)", "warn");
    history.length = 0;
    buffer = null;
    await show(await decode(await f.arrayBuffer()), f.name, false).catch((e) => toast(errText(e), "bad"));
  }

  async function generateSpeech(text = tts, v = voice) {
    if (!text.trim()) return;
    setBusy(true);
    try {
      let job = await api<MediaJob>("/api/media/generate", { method: "POST", body: { kind: "speech", prompt: text, voice: v } });
      for (let i = 0; i < 90 && !["done", "failed"].includes(job.status); i++) { await sleep(1000); job = await api<MediaJob>(`/api/media/${job.id}`); }
      if (job.status !== "done" || !job.outputs[0]) throw new Error(job.error || `speech job ${job.status}`);
      await loadAudioUrl(job.outputs[0].url, `tts-${v}.mp3`);
      toast("Speech loaded into the editor", "ok");
      return { ok: true, jobId: job.id };
    } catch (e) { toast(errText(e), "bad"); throw e; } finally { setBusy(false); }
  }

  async function doExport() {
    const b = need();
    const blob = encodeWav(b);
    const name = `${(st.name ?? "lumen-audio").replace(/\.[a-z0-9]+$/i, "")}-edit.wav`;
    download(blob, name);
    const url = isDemo() ? undefined : (await upload(blob, name).catch(() => null))?.url;
    return { ok: true, name, bytes: blob.size, url };
  }

  const run = (f: () => Promise<unknown> | unknown) => async () => { try { await f(); } catch (e) { toast(errText(e), "warn"); } };
  const selectRegion = (start: number, end: number) => { regions?.clearRegions(); regions?.addRegion({ start, end, color: "rgba(34, 211, 238, 0.18)" }); audioStudio.set({ sel: { start, end } }); };

  useAgentCommands([
    { name: "audio.load", description: "Load an audio URL into the editor.", params: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }, panel: "audio.wave", run: async ({ url }) => { await loadAudioUrl(String(url)); return { duration: buffer?.duration }; } },
    { name: "audio.select", description: "Select a region (seconds).", params: { type: "object", properties: { start: { type: "number" }, end: { type: "number" } }, required: ["start", "end"] }, panel: "audio.wave", run: ({ start, end }) => { selectRegion(Number(start), Number(end)); return { ok: true }; } },
    { name: "audio.cut", description: "Remove start..end seconds (or the selected region).", params: { type: "object", properties: { start: { type: "number" }, end: { type: "number" } } }, panel: "audio.wave", run: async ({ start, end }) => { await OPS.cut(start, end); return { duration: buffer?.duration }; } },
    { name: "audio.trim", description: "Keep only the selected region.", params: { type: "object", properties: {} }, panel: "audio.tools", run: async () => { await OPS.trim(); return { duration: buffer?.duration }; } },
    { name: "audio.fade", description: "Fade in and/or out: {in: seconds, out: seconds}; without args fades the selected region out.", params: { type: "object", properties: { in: { type: "number" }, out: { type: "number" } } }, panel: "audio.tools", run: async (a) => { if (a.in) await OPS.fadeIn(Number(a.in)); if (a.out) await OPS.fadeOut(Number(a.out)); if (!a.in && !a.out) await OPS.fadeOut(); return { ok: true }; } },
    { name: "audio.normalize", description: "Normalize peak to targetDb dBFS (default -1).", params: { type: "object", properties: { targetDb: { type: "number" } } }, panel: "audio.tools", run: async ({ targetDb }) => { await OPS.normalize(targetDb ?? -1); return { peakDb: audioStudio.get().peakDb }; } },
    { name: "audio.gain", description: "Apply gain in dB to the selection or whole file.", params: { type: "object", properties: { db: { type: "number" } }, required: ["db"] }, panel: "audio.tools", run: async ({ db }) => { await OPS.gain(Number(db)); return { ok: true }; } },
    { name: "audio.tts", description: "Generate speech (TTS) and load it into the editor.", params: { type: "object", properties: { text: { type: "string" }, voice: { type: "string" } }, required: ["text"] }, panel: "audio.tts", run: ({ text, voice: v }) => generateSpeech(String(text), v ?? voice) },
    { name: "audio.play", description: "Play/pause.", params: { type: "object", properties: {} }, panel: "audio.wave", run: () => { ws?.playPause(); return { ok: true }; } },
    { name: "audio.export", description: "Export WAV (download + save to uploads).", params: { type: "object", properties: {} }, panel: "audio.tools", run: doExport },
  ], () => {
    const s = audioStudio.get();
    return `Audio studio: ${s.name ? `"${s.name}" ${s.duration.toFixed(2)}s, peak ${s.peakDb.toFixed(1)} dBFS, RMS ${s.rms.toFixed(1)} dBFS` : "no audio loaded"}${s.sel ? `, selection ${s.sel.start.toFixed(2)}–${s.sel.end.toFixed(2)}s` : ""}, ${s.undo} undo step(s).`;
  });

  const loaded = st.duration > 0;
  return (
    <div className="page full studio audio-studio">
      <div className="studio-bar panel">
        <Btn kind="primary" icon={st.playing ? "pause" : "play"} onClick={() => ws?.playPause()} disabled={!loaded} agent="audio.playBtn" label="Play/Pause">{st.playing ? "Pause" : "Play"}</Btn>
        <span className="mono small">{fmtTime(st.time)} <span className="dim">/ {fmtTime(st.duration)}</span></span>
        {st.sel && <span className="badge accent mono">sel {st.sel.start.toFixed(2)}–{st.sel.end.toFixed(2)}s</span>}
        <div className="grow" />
        <div className="row hide-sm"><Icon name="zoomIn" size={14} /><input type="range" min={0} max={400} value={st.zoom} onChange={(e) => { const z = Number(e.target.value); audioStudio.set({ zoom: z }); ws?.zoom(z); }} style={{ width: 100 }} /></div>
        <Btn size="sm" icon="upload" onClick={async () => onFiles(await pickFiles("audio/*", false))} agent="audio.open" label="Open audio">Open</Btn>
        <Btn size="sm" kind="primary" icon="download" onClick={run(doExport)} disabled={!loaded} agent="audio.exportBtn" label="Export WAV">WAV</Btn>
      </div>
      <div className={`wave-wrap panel ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); else { const ext = e.dataTransfer.getData("text/lumen-media-url"); if (ext) loadAudioUrl(JSON.parse(ext).url).catch((er) => toast(errText(er), "bad")); } }}
        {...agentProps("audio.wave", "Waveform", "canvas")}>
        <div ref={el} className="wave" />
        {!loaded && <div className="stage-empty"><Icon name="audio" size={30} /><b>Drop audio here</b><span className="muted small">or open a file, generate speech below, or drag from the Media library.</span></div>}
      </div>
      <div className="audio-grid">
        <Panel title="Edit" agentId="audio.tools" agentLabel="Edit tools">
          <div className="tool-grid">
            <Btn icon="scissors" onClick={run(() => OPS.cut())} disabled={!st.sel} agent="audio.cutBtn" label="Cut selection">Cut</Btn>
            <Btn icon="crop" onClick={run(OPS.trim)} disabled={!st.sel} agent="audio.trimBtn" label="Trim to selection">Trim</Btn>
            <Btn onClick={run(() => OPS.fadeIn())} disabled={!loaded} agent="audio.fadeInBtn" label="Fade in">Fade in</Btn>
            <Btn onClick={run(() => OPS.fadeOut())} disabled={!loaded} agent="audio.fadeOutBtn" label="Fade out">Fade out</Btn>
            <Btn onClick={run(() => OPS.normalize(-1))} disabled={!loaded} agent="audio.normalizeBtn" label="Normalize">Normalize −1 dB</Btn>
            <Btn onClick={run(() => OPS.gain(3))} disabled={!loaded} agent="audio.gainUp" label="Gain +3 dB">+3 dB</Btn>
            <Btn onClick={run(() => OPS.gain(-3))} disabled={!loaded} agent="audio.gainDown" label="Gain -3 dB">−3 dB</Btn>
            <Btn onClick={run(OPS.silence)} disabled={!st.sel} agent="audio.silenceBtn" label="Silence">Silence</Btn>
            <Btn onClick={run(OPS.reverse)} disabled={!loaded} agent="audio.reverseBtn" label="Reverse">Reverse</Btn>
            <Btn icon="undo" onClick={run(OPS.undo)} disabled={!st.undo} agent="audio.undoBtn" label="Undo">Undo</Btn>
          </div>
          <p className="tiny dim" style={{ marginTop: 10 }}>Drag on the waveform to select. Edits apply to the selection, or the whole file when nothing is selected.</p>
        </Panel>
        <Panel title="Text to speech" agentId="audio.tts" agentLabel="Text to speech">
          <div className="col">
            <textarea className="textarea" rows={3} placeholder="Type a voiceover line…" value={tts} onChange={(e) => setTts(e.target.value)} {...agentProps("audio.ttsText", "TTS text", "input")} />
            <div className="row">
              <select className="select" value={voice} onChange={(e) => setVoice(e.target.value)} style={{ width: 140 }}>
                {["marin", "cedar", "alloy", "verse", "aria", "sage"].map((v) => <option key={v}>{v}</option>)}
              </select>
              <div className="grow" />
              <Btn kind="primary" icon="mic" onClick={() => generateSpeech().catch(() => {})} disabled={busy || !tts.trim() || isDemo()} agent="audio.ttsGenerate" label="Generate speech">{busy ? "Generating…" : "Generate"}</Btn>
            </div>
            {isDemo() && <span className="tiny dim">Connect the Lumen server (with a TTS-capable key) to generate speech.</span>}
          </div>
        </Panel>
        <Panel title="Levels">
          <div className="stats">
            <div className="stat"><span className="l">Peak</span><span className="v mono">{Number.isFinite(st.peakDb) ? `${st.peakDb.toFixed(1)}` : "–"}<span className="small muted"> dBFS</span></span></div>
            <div className="stat"><span className="l">RMS</span><span className="v mono">{Number.isFinite(st.rms) ? `${st.rms.toFixed(1)}` : "–"}<span className="small muted"> dBFS</span></span></div>
            <div className="stat"><span className="l">Length</span><span className="v mono">{st.duration.toFixed(2)}<span className="small muted"> s</span></span></div>
          </div>
          <p className="tiny dim" style={{ marginTop: 8 }}>Streaming targets about −14 LUFS integrated, podcasts −16 LUFS, true peak ≤ −1 dBTP. RMS here is a rough guide, not a LUFS meter.</p>
        </Panel>
      </div>
    </div>
  );
}
