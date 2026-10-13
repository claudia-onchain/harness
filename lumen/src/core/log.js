// Tiny file logger: ~/.lumen/logs/lumen.log. LUMEN_DEBUG=1 also mirrors to stderr (outside the TUI).
import { appendFileSync, statSync, renameSync } from "node:fs";
import { join } from "node:path";
import { P, ensureHome } from "./paths.js";

let checked = false;
function file() {
  ensureHome();
  const f = join(P.logs, "lumen.log");
  if (!checked) {
    checked = true;
    try { if (statSync(f).size > 5 * 1024 * 1024) renameSync(f, `${f}.1`); } catch { /* none yet */ }
  }
  return f;
}

function write(level, args) {
  const line = `${new Date().toISOString()} ${level} ${args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`;
  try { appendFileSync(file(), line); } catch { /* ignore */ }
  if (process.env.LUMEN_DEBUG && !process.env.LUMEN_TUI_ACTIVE) process.stderr.write(line);
}

export const log = {
  info: (...a) => write("INFO", a),
  warn: (...a) => write("WARN", a),
  error: (...a) => write("ERROR", a),
  debug: (...a) => { if (process.env.LUMEN_DEBUG) write("DEBUG", a); },
};
