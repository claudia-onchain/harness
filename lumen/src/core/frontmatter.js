// Minimal YAML-ish frontmatter parser for personas (skills use skills/lib.mjs when present).
export function parseFrontmatter(text) {
  const s = String(text ?? "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(s);
  if (!m) return { data: {}, body: s };
  const data = {};
  let lastKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      let v = kv[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      data[kv[1]] = v;
      lastKey = kv[1];
    } else if (lastKey && /^\s+\S/.test(line)) {
      data[lastKey] = `${data[lastKey]} ${line.trim()}`.trim();
    }
  }
  return { data, body: s.slice(m[0].length) };
}
