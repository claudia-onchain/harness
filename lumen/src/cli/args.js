// Tiny argv parser: positionals, --flag, --flag=value, --flag value, -p value, -y, --no-x.
const BOOL = new Set(["help", "version", "yes", "json", "offline", "testnets", "no-open", "check", "no-color", "ascii", "force", "no-boot", "headless", "wait", "all"]);
const SHORT = { p: "print", y: "yes", h: "help", v: "version", m: "model", c: "chain", o: "out" };

export function parseArgs(argv) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) flags[name] = a.slice(eq + 1);
      else if (BOOL.has(name)) flags[name] = true;
      else if (name.startsWith("no-")) flags[name] = true;
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
