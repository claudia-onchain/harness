// `lumen doctor [--offline]`: everything Lumen depends on, with fixes.
import { existsSync, statSync, accessSync, constants } from "node:fs";
import { createServer } from "node:net";
import { theme, say } from "../out.js";
import { createRuntime } from "../../agent/runtime.js";
import { bootChecks, chainProbe } from "../checks.js";
import { P, dashboardDist, skillsDir } from "../../core/paths.js";
import { providerStatus, testProvider } from "../../core/providers.js";
import { VERSION } from "../../version.js";

const portFree = (port) => new Promise((res) => { const s = createServer(); s.once("error", () => res(false)); s.listen(port, "127.0.0.1", () => s.close(() => res(true))); });

export async function doctorLines({ offline = false, th, rt }) {
  const T = th;
  const lines = [];
  const icon = (st) => (st === "ok" ? T.ok(T.sym.check) : st === "warn" ? T.warn(T.sym.warn) : st === "skip" ? T.muted("-") : T.bad(T.sym.cross));
  const add = (st, label, text) => lines.push(`${icon(st)} ${T.muted((label.length > 14 ? label.slice(0, 13) + "…" : label).padEnd(14))} ${st === "fail" ? T.bad(text) : st === "warn" ? T.warn(text) : T.text(text)}`);
  const sec = (t) => lines.push("", T.bold(T.accent(t)));
  lines.push(`${T.bold(T.gradient(`${T.sym.tool} Lumen doctor`))} ${T.muted(`v${VERSION}${offline ? " · offline" : ""}`)}`);
  sec("Core");
  const checks = bootChecks(rt, { offline });
  for (const c of checks.list) {
    const r = await c.run().catch((e) => ({ status: "fail", text: e.message }));
    add(r.status, c.label, r.text);
  }
  try { accessSync(P.home, constants.W_OK); add("ok", "home", P.home); } catch { add("fail", "home", `${P.home} is not writable`); }
  if (existsSync(P.keys)) { const mode = statSync(P.keys).mode & 0o777; add(mode & 0o077 ? "warn" : "ok", "keys file", `${P.keys} (mode ${mode.toString(8)}${mode & 0o077 ? ": run chmod 600" : ""})${rt.keys.encrypted ? " · encrypted" : ""}`); }
  else add("skip", "keys file", "none yet (env vars only)");
  add(existsSync(dashboardDist) ? "ok" : "warn", "dashboard", existsSync(dashboardDist) ? "built (dashboard/dist)" : "not built: run npm run build");
  add(existsSync(skillsDir) ? "ok" : "warn", "skills dir", skillsDir);
  const port = rt.config.server?.port || Number(process.env.LUMEN_PORT) || 4747;
  add((await portFree(port)) ? "ok" : "warn", "port", (await portFree(port)) ? `${port} free` : `${port} in use (another Lumen dashboard?)`);
  sec("Providers");
  const st = providerStatus(rt.keys, { localUp: rt.localUp });
  for (const p of st) {
    if (p.comingSoon) { add("skip", p.name, "coming later"); continue; }
    if (!p.configured) { if (!p.keyless) add("skip", p.name, `not set${p.env ? ` (${p.env})` : ""}`); continue; }
    if (offline || p.keyless) { add("ok", p.name, `${p.masked || "configured"}${p.keyless ? " (no key needed)" : ""}`); continue; }
    const r = await testProvider(p.id, rt.keys);
    add(r.ok ? "ok" : "fail", p.name, `${p.masked ? p.masked + " · " : ""}${r.message}`);
  }
  if (!offline) {
    sec("Network");
    for (const id of [...new Set(["ethereum", rt.chain])]) {
      const r = await chainProbe(rt, id).catch((e) => ({ status: "fail", text: `${id}: ${e.message}` }));
      add(r.status, "rpc", r.text);
    }
  }
  return lines;
}

export async function runDoctor(flags) {
  const T = theme(flags);
  const offline = !!flags.offline;
  const rt = await createRuntime({ cwd: process.cwd(), flags: { model: flags.model, offline }, detect: !offline });
  const lines = await doctorLines({ offline, th: T, rt });
  for (const l of lines) say("  " + l);
  say("");
  if (lines.some((l) => l.includes(T.sym.cross))) process.exitCode = 1;
}
