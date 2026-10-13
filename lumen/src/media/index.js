// Media generation service: picks a backend from the available keys, estimates cost, asks before spending
// above config.media.approveAboveUsd, runs the job and stores outputs in ~/.lumen/media.
import { MediaJobs } from "./jobs.js";
import { BACKENDS, BACKEND_BY_ID, KIND_ORDER, download } from "./backends.js";
import { P } from "../core/paths.js";
import { fmtUsd } from "../core/util.js";
import { log } from "../core/log.js";

export const KINDS = ["image", "video", "speech", "music", "sfx"];

export class MediaService {
  constructor({ keys, approvals, getConfig }) {
    this.keys = keys; this.approvals = approvals; this.getConfig = getConfig;
    this.jobs = new MediaJobs();
    this.running = new Map();
  }

  /** Which backends could run this kind right now. */
  available(kind) {
    return (KIND_ORDER[kind] || []).map((id) => BACKEND_BY_ID.get(id)).filter((b) => b && b.kinds.includes(kind) && b.available(this.keys));
  }

  /** Resolve { backend, model }. model may be "backend:model" or an OpenRouter-style id. */
  pick(kind, model) {
    if (!KINDS.includes(kind)) throw new Error(`Unknown media kind "${kind}". Use ${KINDS.join(", ")}.`);
    let want = null, m = model || "";
    const i = m.indexOf(":");
    if (i > 0 && BACKEND_BY_ID.has(m.slice(0, i))) { want = m.slice(0, i); m = m.slice(i + 1); }
    const list = this.available(kind);
    const b = want ? list.find((x) => x.id === want) : list[0];
    if (!b) {
      if (want) throw new Error(`${want} can't make ${kind} with the keys you have.`);
      const hint = { image: "OpenRouter, OpenAI, xAI or fal", video: "OpenRouter, xAI or fal", speech: "OpenRouter, OpenAI or ElevenLabs", music: "ElevenLabs or OpenRouter", sfx: "ElevenLabs" }[kind];
      throw Object.assign(new Error(`No key can make ${kind} yet. Add a ${hint} key (lumen keys set <provider> <key>).`), { code: "no_key" });
    }
    return { backend: b, model: m || b.defaults[kind] || "" };
  }

  estimate(req) {
    const { backend, model } = this.pick(req.kind, req.model);
    return { provider: backend.id, model, usd: backend.estimate({ ...req, model }) ?? null };
  }

  /**
   * Start a job. Returns { job, done } where done resolves to the finished job.
   * req: { kind, prompt, model?, aspect?, durationSec?, voice?, refs? }
   */
  generate(req, { signal, sessionId, approve = false } = {}) {
    const prompt = String(req.prompt || "").trim();
    if (!prompt) throw new Error("A prompt is required.");
    const { backend, model } = this.pick(req.kind, req.model);
    const est = backend.estimate({ ...req, model });
    const job = this.jobs.create({ kind: req.kind, prompt, provider: backend.id, model, costUsd: est ?? undefined });
    const done = this.#run(job, backend, { ...req, prompt, model }, { signal, sessionId, approve, est });
    this.running.set(job.id, done);
    done.finally(() => this.running.delete(job.id));
    return { job, done };
  }

  async #run(job, backend, req, { signal, sessionId, approve, est }) {
    const cfg = this.getConfig();
    const limit = cfg.media?.approveAboveUsd ?? 0.5;
    try {
      if (!approve && cfg.approvalMode !== "yolo" && (est == null ? backend.id === "claudia-media" && req.kind === "video" : est > limit)) {
        this.jobs.update(job.id, { status: "awaiting_approval" });
        const ans = await this.approvals.request({ kind: "media", title: `Generate ${req.kind} with ${backend.id} (${req.model || "default"})`, detail: `Estimated cost: ${est == null ? "unknown" : fmtUsd(est)} (asks above ${fmtUsd(limit)})\nPrompt: ${req.prompt.slice(0, 600)}`, sessionId });
        if (!ans.approve) return this.jobs.update(job.id, { status: "failed", error: ans.reason === "no_ui" ? `Estimated ${fmtUsd(est)} is above your ${fmtUsd(limit)} limit and nobody is attached to approve. Use --yes or raise media.approveAboveUsd.` : "Declined by the user." });
      }
      this.jobs.update(job.id, { status: "running" });
      const r = await backend.run(req, { keys: this.keys, signal, dataDir: P.home, onProgress: () => this.jobs.emit("job", this.jobs.get(job.id)) });
      for (const o of r.outputs || []) {
        const file = o.bytes ? o : o.url ? await download(o.url, {}, signal) : null;
        if (file) this.jobs.saveOutput(job, file.bytes, file.mime || o.mime);
      }
      if (!job.outputs.length) throw new Error("The provider returned no files.");
      return this.jobs.update(job.id, { status: "done", ...(r.costUsd != null ? { costUsd: r.costUsd } : {}), ...(r.model ? { model: r.model } : {}), ...(r.provider ? { provider: r.provider } : {}) });
    } catch (e) {
      log.warn("media job failed", job.id, e.message);
      return this.jobs.update(job.id, { status: "failed", error: signal?.aborted ? "Stopped." : e.message });
    }
  }

  summary() {
    return Object.fromEntries(KINDS.map((k) => [k, this.available(k).map((b) => b.id)]));
  }
}

export { BACKENDS };
