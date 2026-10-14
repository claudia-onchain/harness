// JSONL logger: one object per line in PULSE_HOME/logs/pulse.log, rotated once at 10 MB (pulse.log.1).
// Console mirroring is opt-in (the long-running `run`/`serve` commands turn it on; one-shot commands stay quiet)
// and coloured only when the stream is a TTY. `child({ routine })` stamps every line with context.
import { appendFileSync, statSync, renameSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { P } from "./config.js";
import { colours } from "../cli/out.js";

export const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger({ file, level, console: toConsole = false, stream = process.stderr, maxBytes = 10 * 1024 * 1024, base = {}, clock = () => new Date() } = {}) {
  const state = {
    file: file || null, // resolved on first write so PULSE_HOME can change after import
    min: LEVELS[level || process.env.PULSE_LOG_LEVEL || "info"] ?? LEVELS.info,
    size: -1, // unknown until the first stat
    paint: colours(stream),
  };
  const path = () => state.file || (state.file = join(P.logs, "pulse.log"));

  function rotateIfNeeded(adding) {
    const f = path();
    if (state.size < 0) { try { state.size = statSync(f).size; } catch { state.size = 0; } }
    if (state.size + adding <= maxBytes) return;
    try { renameSync(f, `${f}.1`); } catch { /* nothing to rotate */ }
    state.size = 0;
  }

  function write(lvl, msg, data, ctx) {
    if (LEVELS[lvl] < state.min) return;
    const rec = { ts: clock().toISOString(), level: lvl, msg: String(msg), ...ctx };
    if (data instanceof Error) rec.err = { message: data.message, name: data.name, stack: data.stack, ...(data.code ? { code: data.code } : {}) };
    else if (data && typeof data === "object") for (const [k, v] of Object.entries(data)) rec[k] = v instanceof Error ? { message: v.message, name: v.name, stack: v.stack } : v;
    const line = JSON.stringify(rec) + "\n";
    try {
      rotateIfNeeded(line.length);
      try { appendFileSync(path(), line); } catch (e) {
        if (e.code !== "ENOENT") throw e;
        mkdirSync(dirname(path()), { recursive: true, mode: 0o700 });
        appendFileSync(path(), line);
      }
      state.size += line.length;
    } catch { /* a dead log must never take the harness down */ }
    if (toConsole) echo(rec);
  }

  function echo(rec) {
    const c = state.paint;
    const tint = { debug: c.grey, info: c.cyan, warn: c.yellow, error: c.red }[rec.level] || ((s) => s);
    const { ts, level, msg, err, ...rest } = rec;
    const extras = Object.entries(rest).map(([k, v]) => `${c.dim(k + "=")}${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ");
    const time = ts.slice(11, 19);
    let line = `${c.dim(time)} ${tint(level.padEnd(5))} ${msg}${extras ? " " + extras : ""}`;
    if (err) line += `\n${c.red("  " + (err.stack || err.message).split("\n").join("\n  "))}`;
    stream.write(line + "\n");
  }

  function make(ctx) {
    const l = {
      debug: (m, d) => write("debug", m, d, ctx),
      info: (m, d) => write("info", m, d, ctx),
      warn: (m, d) => write("warn", m, d, ctx),
      error: (m, d) => write("error", m, d, ctx),
      child: (extra) => make({ ...ctx, ...extra }),
      setLevel: (lv) => { state.min = LEVELS[lv] ?? state.min; },
      get file() { return path(); },
    };
    return l;
  }
  return make({ ...base });
}

/** Process-wide default (file only). Runtime creates its own with console mirroring. */
export const log = createLogger();
