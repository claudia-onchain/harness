// Tiny argv parser: positionals, --flag, --flag=value, --flag value, -p value, --no-x.
// Values may start with a single dash (Telegram group chat ids are negative: --chat -1001234).
const BOOL = new Set(["help", "version", "json", "today", "yes", "hd", "video", "no-color", "offline", "live", "force", "console"]);
const SHORT = { p: "print", y: "yes", h: "help", v: "version", m: "model", n: "days" };

export function parseArgs(argv) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) flags[name] = a.slice(eq + 1);
      else if (BOOL.has(name) || name.startsWith("no-")) flags[name] = true;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags[name] = argv[++i];
      else flags[name] = true;
    } else if (/^-[a-zA-Z]$/.test(a)) {
      const name = SHORT[a[1]] || a[1];
      if (BOOL.has(name)) flags[name] = true;
      else if (i + 1 < argv.length) flags[name] = argv[++i];
      else flags[name] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}

/** "15m" | "2h" | "90s" | "1d" | "15" -> minutes (fractional allowed). Returns null when unparseable. */
export function parseDuration(s) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d)?\s*$/i.exec(String(s ?? ""));
  if (!m) return null;
  const n = Number(m[1]);
  const u = (m[2] || "m").toLowerCase()[0];
  const mins = u === "s" ? n / 60 : u === "h" ? n * 60 : u === "d" ? n * 1440 : n;
  return mins > 0 ? mins : null;
}

/** "07:30" | "7:30" | "0730" -> "07:30" (UTC). Returns null when invalid. */
export function parseClock(s) {
  const m = /^\s*(\d{1,2}):?(\d{2})\s*$/.exec(String(s ?? ""));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** "a, b ,c" | ["a","b"] -> ["a","b","c"] (trimmed, deduped, empty dropped). */
export function parseList(v) {
  const parts = Array.isArray(v) ? v : String(v ?? "").split(",");
  return [...new Set(parts.map((s) => String(s).trim()).filter(Boolean))];
}
