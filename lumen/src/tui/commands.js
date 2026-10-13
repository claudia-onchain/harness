// Slash commands for the TUI. Each: { name, args?, description, run(app, argString) }.
import { writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { listPersonas } from "../core/personas.js";
import { listSessions, exportSession } from "../core/sessions.js";
import { getConfig, updateConfig, loadConfig } from "../core/config.js";
import { resetKeys, getKeys } from "../core/keys.js";
import { P } from "../core/paths.js";
import { mainnets } from "../chains/registry.js";
import { specString } from "../llm/catalog.js";
import { checkUpdates, installUpdates } from "../core/update.js";
import { providerStatus } from "../core/providers.js";
import { fmtTokens, fmtUsd } from "../core/util.js";

export const HOTKEYS = [
  ["Enter", "send (while busy: queue a steering message)"], ["Alt+Enter", "new line"], ["Esc", "stop the current turn / close popups"],
  ["Ctrl+C ×2", "quit (once clears the input)"], ["Ctrl+P", "cycle models"], ["Ctrl+L", "model picker"], ["Shift+Tab", "cycle thinking level"],
  ["Ctrl+T", "show/hide thinking"], ["Ctrl+O", "expand/collapse tool output"], ["↑ / ↓", "history (at first/last line)"],
  ["@", "file picker (images attach, text files inline)"], ["/", "command palette"], ["!cmd", "run a shell command and send its output"], ["!!cmd", "run without sending"],
];

function copy(text) {
  const cmd = process.platform === "darwin" ? ["pbcopy"] : process.platform === "win32" ? ["clip"] : ["xclip", "-selection", "clipboard"];
  return new Promise((res) => {
    try {
      const p = spawn(cmd[0], cmd.slice(1));
      p.on("error", () => { process.stdout.write(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`); res("osc52"); });
      p.on("close", () => res(cmd[0]));
      p.stdin.end(text);
    } catch { res(null); }
  });
}

export function buildCommands(app) {
  const rt = app.rt;
  const th = app.th;
  const cmds = [
    { name: "help", description: "Commands and keys", run: () => app.print([th.bold(th.gradient("Lumen commands")), ...app.commands.map((c) => `${th.accent2(("/" + c.name).padEnd(12))}${th.muted((c.args || "").padEnd(26))}${th.muted(c.description)}`), "", th.bold("Keys"), ...HOTKEYS.map(([k, d]) => `${th.accent(k.padEnd(12))} ${th.muted(d)}`)]) },
    { name: "hotkeys", description: "Keyboard shortcuts", run: () => app.print(HOTKEYS.map(([k, d]) => `${th.accent(k.padEnd(12))} ${th.muted(d)}`)) },
    { name: "model", args: "[provider:model]", description: "Switch model (picker without args)", run: (a) => (a ? app.setModel(a) : app.modelPicker()) },
    { name: "thinking", args: "[off|low|medium|high|xhigh]", description: "Thinking level", run: (a) => { if (a) rt.setThinking(a); else rt.cycleThinking(); app.note(`Thinking: ${rt.thinking}`); } },
    { name: "persona", args: "[id]", description: "Switch persona", run: async (a) => {
      if (a) { const p = rt.setPersona(a); return app.note(`Persona: ${p.name}`); }
      const pick = await app.pick({ title: "Persona", items: listPersonas().map((p) => ({ label: p.name, detail: `${p.id} · ${p.summary}`.slice(0, 90), value: p.id })), index: Math.max(0, listPersonas().findIndex((p) => p.id === rt.persona.id)) });
      if (pick) app.note(`Persona: ${rt.setPersona(pick.value).name}`);
    } },
    { name: "chain", args: "[id]", description: "Active chain for chain tools and skills", run: async (a) => {
      if (a) return app.note(`Chain: ${rt.setChain(a).name}`);
      const list = mainnets();
      const pick = await app.pick({ title: "Active chain", items: list.map((c) => ({ label: c.name, detail: `${c.id} · ${c.family}${c.chainlink ? " · chainlink" : ""}`, value: c.id })), index: Math.max(0, list.findIndex((c) => c.id === rt.chain)) });
      if (pick) app.note(`Chain: ${rt.setChain(pick.value).name}`);
    } },
    { name: "new", description: "Start a new session", run: () => { rt.newSession(); app.resetTranscript(); app.note("New session."); } },
    { name: "resume", description: "Resume a saved session", run: async () => {
      const rows = listSessions(40);
      if (!rows.length) return app.note("No saved sessions yet.");
      const pick = await app.pick({ title: "Resume session", items: rows.map((r) => ({ label: r.title, detail: `${r.updated.slice(0, 16).replace("T", " ")} · ${r.messages} msgs`, value: r.id })) });
      if (pick) app.loadSession(pick.value);
    } },
    { name: "session", description: "Session info: tokens, cost, file", run: () => {
      const s = rt.session();
      app.print([`${th.bold("Session")} ${s.title}`, th.muted(`id ${s.id} · ${join(P.sessions, s.id + ".jsonl")}`), `${fmtTokens(s.usage.input)} in · ${fmtTokens(s.usage.output)} out · ${s.usage.priced ? "" : "≥"}${fmtUsd(s.usage.costUsd)} (estimate) · context ${rt.contextPct(s)}%`, `${s.messages.length} messages in history`]);
    } },
    { name: "compact", description: "Summarize history to free context", run: async () => { app.setActivity("compacting"); try { const sum = await rt.compact(); app.print([th.bold("Compacted. Summary:"), ...sum.split("\n")]); } finally { app.setActivity(null); } } },
    { name: "copy", description: "Copy the last answer", run: async () => { const last = [...app.items].reverse().find((i) => i.kind === "assistant"); if (!last) return app.note("Nothing to copy yet."); const via = await copy(last.text); app.note(via ? `Copied (${via}).` : "Couldn't copy."); } },
    { name: "export", args: "[md|html]", description: "Export this session", run: (a) => { const fmt = a === "html" ? "html" : "md"; const s = rt.session(); const out = resolve(rt.cwd, `lumen-${s.id}.${fmt}`); writeFileSync(out, exportSession(s.id, fmt)); app.note(`Exported to ${out}`, "ok"); } },
    { name: "skills", args: "[query]", description: "List skills", run: (a) => {
      const c = rt.skills.counts;
      const rows = rt.skills.list({ q: a || undefined, chain: rt.chain }).slice(0, a ? 40 : 30);
      app.print([`${th.bold("Skills")} ${th.muted(`${c.base} base · ${c.chain} chain (${c.templates} templates) · ${c.user} user`)}`, ...rows.map((s) => `${th.accent2(s.slug)} ${th.muted(`[${s.source}] ${s.description.slice(0, 90)}`)}`), th.muted("Use /skill:<slug> to run one, or just ask.")]);
    } },
    { name: "reload", description: "Reload config, keys, skills, plugins", run: async () => { loadConfig(); resetKeys(); await rt.init({ detect: true }); app.note(`Reloaded · ${rt.skills.counts.base + rt.skills.counts.chain + rt.skills.counts.user} skills · ${rt.registry.tools.size} tools`, "ok"); } },
    { name: "settings", description: "Show settings", run: () => { const c = getConfig(); app.print([`${th.bold("Settings")} ${th.muted(P.config)}`, `model ${specString(rt.model)} · thinking ${rt.thinking} · persona ${rt.persona.id} · chain ${rt.chain}`, `approvalMode ${rt.effectiveApproval()} · maxRounds ${c.maxRounds} · wallet caps $${c.wallet.maxUsdPerTx}/tx $${c.wallet.maxUsdPerDay}/day · media asks above $${c.media.approveAboveUsd}`, th.muted("Edit the file or use lumen keys / /model / /persona / /chain / /approval.")]); } },
    { name: "keys", description: "Key status", run: () => { const st = providerStatus(getKeys(), { localUp: rt.localUp }); app.print([th.bold("Keys"), ...st.filter((p) => !p.comingSoon).map((p) => `${p.configured ? th.ok(th.sym.check) : th.muted(th.sym.ring)} ${p.name.padEnd(18)} ${th.muted(p.kind.padEnd(6))} ${p.masked ? th.muted(p.masked) : ""}`), th.muted("Add one: lumen keys set <field> <value>  (fields: lumen keys list)")]); } },
    { name: "approval", args: "[always-ask|write|yolo]", description: "Approval mode for writes/shell", run: (a) => { if (!["always-ask", "write", "yolo"].includes(a)) return app.note(`Approval mode: ${rt.effectiveApproval()} (always-ask | write | yolo). Money moves always ask.`); rt.approvalMode = a; app.note(`Approval mode: ${a}${a === "yolo" ? " (money moves still ask)" : ""}`, a === "yolo" ? "warn" : "info"); } },
    { name: "add-dir", args: "<path>", description: "Allow file tools in another folder", run: (a) => { const p = resolve(rt.cwd, a || ""); if (!a || !existsSync(p) || !statSync(p).isDirectory()) return app.note("Give an existing folder."); updateConfig({ addDirs: [...new Set([...(getConfig().addDirs || []), p])] }); app.note(`Added ${p}`, "ok"); } },
    { name: "dashboard", description: "Open the local dashboard (shares this session)", run: async () => { const url = await app.openDashboard(); app.note(`Dashboard: ${url}`, "ok"); } },
    { name: "tools", description: "List tools", run: () => { const by = {}; for (const t of rt.registry.list(getConfig())) (by[t.group] ||= []).push(t.enabled ? t.name : th.strike(t.name)); app.print([th.bold("Tools"), ...Object.entries(by).map(([g, n]) => `${th.accent2(g.padEnd(14))} ${th.muted(n.join(", "))}`)]); } },
    { name: "plugins", description: "List plugins", run: () => { const p = rt.plugins; app.print([th.bold("Plugins") + th.muted(` ${P.plugins}`), ...[...p.tool, ...p.dashboard].map((x) => `${x.enabled ? th.ok(th.sym.check) : th.muted(th.sym.ring)} ${x.name} ${th.muted(`${x.kind} v${x.version}${x.error ? " · error: " + x.error : ""}`)}`), ...(p.tool.length + p.dashboard.length ? [] : [th.muted("None yet. Drop a .js file exporting { name, tools, commands } into the folder above.")])]); } },
    { name: "update", description: "Check for updates (and install)", run: async () => {
      app.setActivity("checking updates");
      const res = await checkUpdates({ force: true, timeoutMs: 4000 }).finally(() => app.setActivity(null));
      app.print(res.map((u) => `${u.outdated ? th.warn(th.sym.warn) : th.ok(th.sym.check)} ${u.name.padEnd(20)} ${th.muted(`${u.current ?? "-"} ${u.latest ? `→ ${u.latest}` : "(not published)"}`)}`));
      const out = res.filter((u) => u.outdated && u.name !== "lumen-agent");
      if (!out.length) return;
      const pick = await app.pick({ title: `Install ${out.length} update(s)?`, items: [{ label: "Install now", value: true }, { label: "Later", value: false }] });
      if (pick?.value) { app.setActivity("npm install"); const r = await installUpdates(out.map((u) => u.name)); app.setActivity(null); app.print(r.log.split("\n").slice(-12)); app.note(r.ok ? "Updated. Restart Lumen to load new versions." : "Update failed (see output).", r.ok ? "ok" : "warn"); }
    } },
    { name: "doctor", description: "Health checks", run: async () => { const { doctorLines } = await import("../cli/commands/doctor.js"); app.setActivity("doctor"); const lines = await doctorLines({ offline: false, th, rt }).finally(() => app.setActivity(null)); app.print(lines); } },
    { name: "clear", description: "Clear the screen (session continues)", run: () => app.resetTranscript() },
    { name: "quit", description: "Exit", run: () => app.quit() },
    { name: "exit", description: "Exit", run: () => app.quit() },
  ];
  for (const p of rt.plugins?.tool || []) for (const c of p.commands || []) {
    if (cmds.some((x) => x.name === c.name)) continue;
    cmds.push({ name: c.name, args: c.args, description: `${c.description || "plugin command"} (${p.name})`, run: (a) => c.run(a, { runtime: rt, print: (l) => app.print([].concat(l)), send: (t) => app.sendText(t) }) });
  }
  return cmds;
}

