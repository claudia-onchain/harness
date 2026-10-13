// Media job store: ~/.lumen/media/jobs.json + files under ~/.lumen/media/<date>/.
// MediaJob (contract): { id, kind, status, provider, model, prompt, createdAt, outputs: [{ url, mime, path }], error?, costUsd? }
import { EventEmitter } from "node:events";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { P, ensureHome } from "../core/paths.js";
import { readJson, writeJson } from "../core/fsx.js";
import { id as newId } from "../core/util.js";

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/aac": "aac", "audio/flac": "flac" };
export const extFor = (mime) => EXT[String(mime || "").split(";")[0].trim()] || "bin";

export function sniffMime(buf, fallback = "application/octet-stream") {
  const b = Buffer.from(buf.subarray ? buf.subarray(0, 16) : buf);
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE") return "audio/wav";
  if (b.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (b.toString("ascii", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (b.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (b.toString("ascii", 0, 4) === "fLaC") return "audio/flac";
  if (b.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return fallback;
}

export class MediaJobs extends EventEmitter {
  constructor() { super(); ensureHome(); this.jobs = readJson(P.mediaJobs, []).slice(-500); }

  persist() { try { writeJson(P.mediaJobs, this.jobs.slice(-500)); } catch { /* ignore */ } }

  create({ kind, prompt, provider, model, costUsd }) {
    const job = { id: newId("mj_"), kind, status: "queued", provider, model, prompt: String(prompt || "").slice(0, 4000), createdAt: new Date().toISOString(), outputs: [], ...(costUsd != null ? { costUsd } : {}) };
    this.jobs.push(job);
    this.persist();
    this.emit("job", job);
    return job;
  }

  update(id, patch) {
    const j = this.get(id);
    if (!j) return null;
    Object.assign(j, patch, { updatedAt: new Date().toISOString() });
    this.persist();
    this.emit("job", j);
    return j;
  }

  get(id) { return this.jobs.find((j) => j.id === id) || null; }
  list(limit = 100) { return this.jobs.slice(-limit).reverse(); }

  /** Save bytes for a job; returns the contract output { url, mime, path }. */
  saveOutput(job, bytes, mime) {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const realMime = mime && mime !== "application/octet-stream" ? mime : sniffMime(buf);
    const day = new Date().toISOString().slice(0, 10);
    const dir = join(P.media, day);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${job.id}-${job.outputs.length + 1}.${extFor(realMime)}`);
    writeFileSync(file, buf);
    const out = { url: `/api/files/media/${relative(P.media, file).split(sep).join("/")}`, mime: realMime, path: file };
    job.outputs.push(out);
    this.persist();
    return out;
  }
}
