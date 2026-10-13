// Media tools: generate_image / video / speech / music / sfx, media_status.
import { obj, str, num, arr } from "./registry.js";
import { fmtUsd } from "../../core/util.js";

const ASPECTS = ["1:1", "16:9", "9:16", "4:5", "3:2", "2:3"];

function genTool(kind, label, extra = {}) {
  return {
    name: `generate_${kind}`, group: "Media", label, approval: "custom",
    description: `Generate ${kind === "sfx" ? "a sound effect" : kind === "speech" ? "speech (text to speech)" : `a ${kind}`} with the user's own keys (picks OpenRouter, OpenAI, xAI, fal, ElevenLabs or @useclaudia/media). Asks before spending above the configured limit. Returns the local file path.`,
    parameters: obj({
      prompt: str(kind === "speech" ? "The words to speak" : "What to make"),
      model: str("Optional model, or backend:model (e.g. openrouter:google/veo-3.1-fast, xai:grok-imagine-image-2.0)"),
      ...(kind === "image" || kind === "video" ? { aspect: { type: "string", enum: ASPECTS, description: "Aspect ratio" } } : {}),
      ...(kind === "video" || kind === "music" || kind === "sfx" ? { duration_sec: num("Duration in seconds") } : {}),
      ...(kind === "speech" ? { voice: str("Voice id/name") } : {}),
      ...(kind === "image" || kind === "video" ? { refs: arr({ type: "string" }, "Reference image URLs or data URLs") } : {}),
      ...extra,
    }, ["prompt"]),
    async run(a, ctx) {
      if (!ctx.media) throw new Error("Media service is not available.");
      const { job, done } = ctx.media.generate({ kind, prompt: a.prompt, model: a.model, aspect: a.aspect, durationSec: a.duration_sec, voice: a.voice, refs: a.refs }, { signal: ctx.signal, sessionId: ctx.sessionId });
      ctx.emit({ type: "agent_status", state: "tool", detail: `generating ${kind} (${job.provider})` });
      const fin = await done;
      if (fin.status !== "done") return { ok: false, text: `The ${kind} job ${fin.id} ${fin.status}: ${fin.error || "unknown error"}`, summary: `${fin.status}: ${String(fin.error || "").slice(0, 90)}` };
      const base = ctx.runtime?.serverUrl?.();
      const files = fin.outputs.map((o) => `${o.path}${base ? `  (${base}${o.url})` : ""}`);
      return { text: `Done (${fin.provider} ${fin.model}${fin.costUsd != null ? `, ~${fmtUsd(fin.costUsd)}` : ""}). Files:\n${files.join("\n")}\nJob id: ${fin.id}`, summary: `${fin.outputs.length} file · ${fin.provider}${fin.costUsd != null ? ` · ~${fmtUsd(fin.costUsd)}` : ""}`, data: fin };
    },
  };
}

export function mediaTools() {
  return [
    genTool("image", "Generate image"),
    genTool("video", "Generate video"),
    genTool("speech", "Generate speech"),
    genTool("music", "Generate music"),
    genTool("sfx", "Generate sound effect"),
    {
      name: "media_status", group: "Media", label: "Media jobs", safe: true,
      description: "Status of a media job by id, or the latest jobs when no id is given.",
      parameters: obj({ id: str("Job id") }),
      run(a, ctx) {
        if (a.id) { const j = ctx.media.jobs.get(a.id); if (!j) throw new Error(`No job ${a.id}`); return { text: JSON.stringify(j, null, 1), summary: `${j.kind} ${j.status}` }; }
        const list = ctx.media.jobs.list(15);
        return { text: list.map((j) => `${j.id} · ${j.kind} · ${j.status} · ${j.provider} · ${j.prompt.slice(0, 60)}${j.outputs[0] ? ` → ${j.outputs[0].path}` : ""}`).join("\n") || "No media jobs yet.", summary: `${list.length} jobs` };
      },
    },
  ];
}
