// gen, show, windows
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { getKeys } from "../../core/keys.js";
import { getConfig } from "../../core/config.js";
import { Approvals } from "../../core/approvals.js";
import { MediaService, KINDS } from "../../media/index.js";
import * as screen from "../../screen/index.js";
import { theme, say, fail, spin, attachTerminalApprovals, table } from "../out.js";
import { fmtUsd } from "../../core/util.js";

export async function runGen(pos, flags) {
  const T = theme(flags);
  const [kind, ...rest] = pos;
  const prompt = rest.join(" ") || flags.prompt;
  if (!KINDS.includes(kind) || !prompt) return fail(`Usage: lumen gen ${KINDS.join("|")} "<prompt>" [--model backend:model] [--aspect 16:9] [--duration 6] [--voice id] [--out file]`);
  const approvals = new Approvals();
  const detach = attachTerminalApprovals(approvals, { yes: !!flags.yes });
  const media = new MediaService({ keys: getKeys(), approvals, getConfig: () => ({ ...getConfig(), approvalMode: flags.yes ? "yolo" : getConfig().approvalMode }) });
  let est;
  try { est = media.estimate({ kind, model: flags.model, durationSec: Number(flags.duration) || undefined }); } catch (e) { detach(); return fail(e.message); }
  say(`  ${T.accent(T.sym.tool)} ${T.bold(kind)} ${T.muted(`via ${est.provider} ${est.model}${est.usd != null ? ` · ~${fmtUsd(est.usd)}` : ""}`)}`);
  const ac = new AbortController();
  process.once("SIGINT", () => ac.abort());
  const { done } = media.generate({ kind, prompt, model: flags.model, aspect: flags.aspect, durationSec: Number(flags.duration) || undefined, voice: flags.voice }, { signal: ac.signal });
  const job = await spin(`generating ${kind}${kind === "video" ? " (this can take a few minutes)" : ""}`, done);
  detach();
  if (job.status !== "done") return fail(`${job.status}: ${job.error || "unknown error"}`);
  for (const o of job.outputs) {
    let path = o.path;
    if (flags.out) { path = resolve(process.cwd(), job.outputs.length > 1 ? String(flags.out).replace(/(\.\w+)?$/, `-${job.outputs.indexOf(o) + 1}$1`) : String(flags.out)); copyFileSync(o.path, path); }
    say(`  ${T.ok(T.sym.check)} ${T.text(path)} ${T.muted(`${o.mime}${job.costUsd != null ? ` · ~${fmtUsd(job.costUsd)}` : ""}`)}`);
    if (process.platform === "darwin" && getConfig().media?.open !== false && !flags["no-open"]) exec(`open "${path}"`);
  }
}

export async function runShow(pos, flags) {
  const T = theme(flags);
  if (!screen.supported()) return fail(`Screen control is macOS-only (this is ${process.platform}).`);
  const target = pos.join(" ");
  if (!target) return fail('Usage: lumen show "Safari" | "https://…" | ./file [--label text] [--box x,y,w,h] [--seconds 5]');
  const isUrl = /^[a-z]+:\/\//i.test(target);
  const isPath = !isUrl && /[/.]/.test(target) && !/\.app$/i.test(target);
  const markers = [];
  if (flags.box) {
    const [x, y, w, h] = String(flags.box).split(",").map(Number);
    if ([x, y, w, h].some((n) => !Number.isFinite(n))) return fail("--box needs x,y,w,h");
    markers.push({ x, y, w, h, label: flags.label, relativeTo: flags.screen ? "screen" : "window", shape: flags.shape || "box", color: flags.color });
  }
  const r = await spin(`showing ${target}`, screen.show({ app: isUrl || isPath ? flags.app : target, url: isUrl ? target : undefined, path: isPath ? resolve(target) : undefined, markers, seconds: Number(flags.seconds) || 5, label: flags.label, wait: !!flags.wait }));
  if (!r.ok) return fail(r.message);
  say(`  ${T.ok(T.sym.check)} ${T.text(`Showing ${r.markers.length} marker(s)`)}${r.window ? T.muted(` on ${r.window.app} window (${r.window.x ?? r.window.X}, ${r.window.y ?? r.window.Y}) ${r.window.w ?? r.window.Width}×${r.window.h ?? r.window.Height}`) : ""}`);
}

export async function runWindows(pos, flags) {
  const T = theme(flags);
  if (!screen.supported()) return fail(`Screen control is macOS-only (this is ${process.platform}).`);
  const w = await screen.listWindows(pos.join(" ") || undefined);
  if (flags.json) return say(JSON.stringify(w, null, 2));
  if (!w.length) return say(T.muted("  No windows found."));
  table(w.map((x) => [T.text(x.app), x.title ? x.title : T.muted("(title needs Screen Recording)"), x.id, `${x.X},${x.Y}`, `${x.Width}×${x.Height}`]), ["app", "title", "id", "x,y", "size"]);
}
