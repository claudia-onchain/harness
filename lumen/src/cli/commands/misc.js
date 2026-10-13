// skills, personas, plugins, update, dashboard/serve
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { loadSkills } from "../../skills/index.js";
import { listPersonas } from "../../core/personas.js";
import { getConfig, updateConfig } from "../../core/config.js";
import { loadPlugins, pluginList } from "../../plugins/index.js";
import { checkUpdates, installUpdates } from "../../core/update.js";
import { createRuntime } from "../../agent/runtime.js";
import { P } from "../../core/paths.js";
import { theme, say, fail, heading, table, spin, attachTerminalApprovals } from "../out.js";

export async function runSkills(pos, flags) {
  const T = theme(flags);
  const sk = await loadSkills({ cwd: process.cwd() });
  const sub = pos[0] || "list";
  if (sub === "show") {
    const s = sk.get(pos[1]);
    if (!s) return fail(`No skill "${pos[1]}".`);
    if (flags.json) return say(JSON.stringify({ slug: s.slug, markdown: s.markdown, files: sk.files(s.slug) }, null, 2));
    say(s.markdown);
    const files = sk.files(s.slug);
    if (files.length) say(T.muted(`\nFiles: ${files.join(", ")}`));
    return;
  }
  if (sub === "export") {
    if (!pos[1]) return fail("Usage: lumen skills export <dir> [--chain base]");
    const n = sk.exportTo(resolve(pos[1]), { chain: flags.chain });
    return say(`${T.ok(T.sym.check)} Wrote ${n} skills to ${resolve(pos[1])}`);
  }
  const c = sk.counts;
  const rows = sk.list({ chain: flags.chain || undefined, q: sub === "list" ? (pos[1] || flags.q) : sub });
  const shown = flags.chain || flags.all ? rows : rows.filter((s) => s.source !== "chain");
  if (flags.json) return say(JSON.stringify(shown, null, 2));
  heading("Skills", `${c.base} base · ${c.chain} chain (${c.templates} templates × mainnets) · ${c.user} user`);
  table(shown.map((s) => [T.accent2(s.slug), T.muted(s.source + (s.chain ? `:${s.chain}` : "")), s.category, s.description.replace(/\s+/g, " ")]), ["slug", "source", "category", "description"], { maxCol: 70 });
  if (!flags.chain && !flags.all) say(T.muted(`\n  Chain skills hidden: add --chain <id> (e.g. --chain base) or --all.`));
}

export async function runPersonas(pos, flags) {
  const T = theme(flags);
  const cur = getConfig().persona;
  if (pos[0] === "use") {
    const p = listPersonas().find((x) => x.id === String(pos[1] || "").toLowerCase());
    if (!p) return fail(`No persona "${pos[1]}". Try: ${listPersonas().map((x) => x.id).join(", ")}`);
    updateConfig({ persona: p.id });
    return say(`${T.ok(T.sym.check)} Persona: ${p.name}`);
  }
  heading("Personas", `built-in + ${P.personas}`);
  for (const p of listPersonas()) say(`  ${p.id === cur ? T.accent2(T.sym.dot) : " "} ${T.bold(T.text(p.name.padEnd(18)))} ${T.muted(`${p.id.padEnd(18)} ${p.summary}`)}${p.source === "user" ? T.muted(" (yours)") : ""}`);
  say(T.muted("\n  lumen personas use <id> · add your own: ~/.lumen/personas/<id>.md with name/summary frontmatter"));
}

export async function runPlugins(pos, flags) {
  const T = theme(flags);
  const p = await loadPlugins({ config: getConfig() });
  const list = pluginList(p);
  if (flags.json) return say(JSON.stringify(list, null, 2));
  heading("Plugins", P.plugins);
  if (!list.length) return say(T.muted("  None yet. Drop a .js file exporting { name, tools, commands } into the folder above,\n  or a dashboard plugin into plugins/dashboard/<id>/entry.js. See README → Plugins."));
  for (const x of list) say(`  ${x.enabled ? T.ok(T.sym.check) : T.muted(T.sym.ring)} ${T.text(x.name.padEnd(20))} ${T.muted(`${x.kind} v${x.version}`)}${x.error ? T.bad(` error: ${x.error}`) : ""}`);
}

export async function runUpdate(pos, flags) {
  const T = theme(flags);
  const res = await spin("checking npm", checkUpdates({ force: true, timeoutMs: 5000 }));
  heading("Updates");
  for (const u of res) say(`  ${u.outdated ? T.warn(T.sym.warn) : T.ok(T.sym.check)} ${u.name.padEnd(22)} ${T.muted(`${u.current ?? "not installed"}${u.latest ? ` → latest ${u.latest}` : " (not on npm)"}`)}`);
  const todo = res.filter((u) => u.outdated);
  if (!todo.length) return say(T.muted("\n  Everything is up to date."));
  if (flags.check) return say(T.muted("\n  Run `lumen update` to install."));
  const r = await installUpdates(todo.map((u) => u.name), { onData: (d) => process.stdout.write(T.muted(d)) });
  say(r.ok ? `\n${T.ok(T.sym.check)} Done. Restart Lumen to use the new versions.` : `\n${T.bad(T.sym.cross)} npm install failed.`);
  if (!r.ok) process.exitCode = 1;
}

export async function runServe(pos, flags, { open = false } = {}) {
  const T = theme(flags);
  const rt = await createRuntime({ cwd: process.cwd(), flags: { model: flags.model, persona: flags.persona, chain: flags.chain, yes: flags.yes } });
  const srv = await rt.startServer({ port: Number(flags.port) || undefined });
  const detach = process.stdin.isTTY ? attachTerminalApprovals(rt.approvals, { yes: !!flags.yes }) : () => {};
  heading("Lumen dashboard", srv.url);
  say(`  ${T.muted("open")} ${T.accent2(srv.loginUrl)}`);
  say(T.muted(`  serving ${srv.distExists ? "dashboard/dist" : "placeholder page (run npm run build)"} · Ctrl+C to stop`));
  if (open && !flags["no-open"]) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    exec(`${opener} "${srv.loginUrl}"`);
  }
  await new Promise((res) => process.once("SIGINT", res));
  detach();
  await srv.close();
}
