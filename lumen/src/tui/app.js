// The interactive chat TUI. Listens to runtime events, keeps a transcript of items, commits settled items to
// scrollback and redraws the live region (streaming text, pending tools, approvals, editor, footer).
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { exec } from "node:child_process";
import { Editor } from "./editor.js";
import { width, truncate, PASTE_ON, PASTE_OFF, SHOW_CURSOR } from "./ansi.js";
import * as C from "./components.js";
import { buildCommands } from "./commands.js";
import { inputMethods, IMG } from "./app-input.js";
import { runShell } from "../agent/tools/shell.js";
import { loadSession } from "../core/sessions.js";
import { specString, LLM } from "../llm/catalog.js";
import { listModels } from "../llm/index.js";


export class App {
  constructor(rt, { th, screen, keys }) {
    this.rt = rt; this.th = th; this.screen = screen; this.keys = keys;
    this.items = []; this.committed = 0; this.partial = 0;
    this.editor = new Editor();
    this.overlay = null; this.approvals = [];
    this.todo = []; this.activity = null; this.activityStart = 0;
    this.showThinking = !!rt.config.ui?.showThinking; this.expandTools = false;
    this.ctrlC = 0; this.popupIndex = 0; this.liveUsage = null;
    this.autoApprove = new Set();
    this.commands = buildCommands(this);
    this.fileCache = { at: 0, files: [] };
    this.queued = 0;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────
  start(headerLines = []) {
    this.items.push({ kind: "raw", lines: headerLines });
    this.detachUi = this.rt.approvals.attach();
    this.onEvent = (ev) => this.handle(ev);
    this.rt.on("event", this.onEvent);
    this.keys.on("key", (k) => { try { this.onKey(k); } catch (e) { this.note(`Key handler error: ${e.message}`, "warn"); } });
    process.stdout.write(PASTE_ON);
    this.onResize = () => { clearTimeout(this.resizeT); this.resizeT = setTimeout(() => this.fullRedraw(), 60); };
    process.stdout.on("resize", this.onResize);
    this.timer = setInterval(() => { if (this.animating()) this.render(); }, 80);
    this.render();
    return new Promise((res) => { this.done = res; });
  }

  quit() {
    if (this.quitting) return;
    this.quitting = true;
    clearInterval(this.timer);
    this.rt.off("event", this.onEvent);
    this.detachUi?.();
    this.rt.abort();
    this.render(true);
    this.screen.finish();
    process.stdout.write(PASTE_OFF + SHOW_CURSOR);
    this.keys.stop();
    this.done?.();
  }

  animating() { return !!this.activity || this.items.slice(this.committed).some((i) => (i.kind === "tool" && i.status === "pending") || (i.kind === "thinking" && !i.done) || (i.kind === "shell" && i.code === undefined)); }

  // ── output helpers ───────────────────────────────────────────────────────
  print(lines) { this.items.push({ kind: "system", lines }); this.render(); }
  note(text, level = "info") { this.items.push({ kind: "notice", text, level }); this.render(); }
  setActivity(a) { this.activity = a; this.activityStart = Date.now(); this.render(); }

  resetTranscript() { this.items = this.items.slice(0, 1); this.committed = 0; this.partial = 0; this.todo = []; this.fullRedraw(); }

  loadSession(id) {
    const s = this.rt.resume(id);
    const saved = loadSession(id);
    this.items = this.items.slice(0, 1);
    for (const it of saved?.items || []) {
      if (it.type === "user") this.items.push({ kind: "user", text: it.text });
      else if (it.type === "assistant") this.items.push({ kind: "assistant", text: it.text, done: true, id: it.id });
      else if (it.type === "tool" && it.phase !== "start") this.items.push({ kind: "tool", label: it.name, name: it.name, args: {}, status: it.ok === false ? "error" : "ok", summary: it.summary, startedAt: 0 });
      else if (it.type === "error") this.items.push({ kind: "error", text: it.text });
    }
    this.items.push({ kind: "notice", text: `Resumed "${s.title}" (${s.messages.length} messages).`, level: "ok" });
    this.committed = 0; this.partial = 0;
    this.fullRedraw();
  }

  // ── runtime events ───────────────────────────────────────────────────────
  handle(ev) {
    if (ev.sessionId && ev.sessionId !== this.rt.activeId && ev.type !== "approval_request") return;
    const live = () => this.items.slice(this.committed);
    const closeThinking = () => { for (const i of live()) if (i.kind === "thinking") i.done = true; };
    switch (ev.type) {
      case "user": this.items.push({ kind: "user", text: ev.text, source: ev.source, images: ev.images }); if (ev.source === "steer" && this.queued) this.queued--; break;
      case "thinking": {
        const last = this.items[this.items.length - 1];
        if (last?.kind === "thinking" && !last.done) last.text += ev.delta;
        else this.items.push({ kind: "thinking", text: ev.delta, done: false });
        break;
      }
      case "delta": {
        closeThinking();
        let it = this.items.findLast?.((i) => i.kind === "assistant" && i.id === ev.id);
        if (!it) { it = { kind: "assistant", id: ev.id, text: "", done: false }; this.items.push(it); }
        it.text += ev.text;
        break;
      }
      case "assistant_done": { const it = this.items.findLast((i) => i.kind === "assistant" && i.id === ev.id); if (it) it.done = true; break; }
      case "tool_start": closeThinking(); this.items.push({ kind: "tool", callId: ev.callId, name: ev.name, label: ev.label || ev.name, args: ev.args, status: "pending", startedAt: Date.now(), helper: ev.helper }); break;
      case "tool_end": { const it = this.items.findLast((i) => i.kind === "tool" && i.callId === ev.callId); if (it) Object.assign(it, { status: ev.ok ? "ok" : "error", summary: ev.summary, result: ev.result }); break; }
      case "turn_done": for (const i of live()) { if (i.kind === "thinking" || i.kind === "assistant") i.done = true; if (i.kind === "tool" && i.status === "pending") i.status = "error"; } this.liveUsage = null; break;
      case "usage": this.liveUsage = ev.usage; break;
      case "error": this.items.push({ kind: "error", text: ev.message }); break;
      case "notice": this.items.push({ kind: "notice", text: ev.text, level: ev.level }); break;
      case "todo": this.todo = ev.items; break;
      case "agent_status": this.activity = ev.state === "idle" ? null : ev.state === "tool" ? (ev.detail || "working") : ev.state === "driving" ? "driving dashboard" : "thinking"; if (ev.state !== "idle" && !this.activityStart) this.activityStart = Date.now(); if (ev.state === "idle") this.activityStart = 0; break;
      case "approval_request":
        if (this.autoApprove.has(ev.kind) && ev.kind !== "tx") { this.rt.approvals.resolve(ev.id, { approve: true }); break; }
        this.approvals.push({ ...ev, input: { text: "", index: 0 } });
        process.stdout.write("\x07");
        break;
      case "media_job": if (ev.status === "done" && ev.outputs?.[0] && !this.rt.session().busy) this.note(`${ev.kind} ready: ${ev.outputs[0].path}`, "ok"); break;
      default: break;
    }
    this.render();
  }

  // ── rendering ────────────────────────────────────────────────────────────
  settled(i) {
    if (i.kind === "assistant" || i.kind === "thinking") return !!i.done;
    if (i.kind === "tool") return i.status !== "pending";
    if (i.kind === "shell") return i.code !== undefined;
    return true;
  }

  renderItem(i, cols, live = false) {
    const t = Date.now();
    switch (i.kind) {
      case "raw": return i.lines;
      case "user": return C.userItem(i, cols, this.th);
      case "assistant": return C.assistantItem(i, cols, this.th);
      case "thinking": return C.thinkingItem(i, cols, this.th, { show: this.showThinking, live: live && !i.done, t });
      case "tool": return C.toolItem(i, cols, this.th, { expanded: this.expandTools, t });
      case "notice": return C.noticeItem(i, cols, this.th);
      case "error": return C.errorItem(i, cols, this.th);
      case "system": return C.systemItem(i, cols, this.th);
      case "shell": return C.shellItem(i, cols, this.th);
      default: return [];
    }
  }

  /** Live lines below the transcript: approvals/pickers, todo, editor, popup, footer. */
  bottom(cols) {
    const th = this.th;
    const out = [];
    let cursor = null;
    out.push(...C.todoWidget(this.todo.some((x) => x.status !== "done") ? this.todo : [], cols, th));
    const a = this.approvals[0];
    if (a) out.push("", ...C.approvalBox(th, cols, a, a.input));
    else if (this.overlay?.type === "select") out.push("", ...C.selectList(th, cols, this.overlay.st, Math.max(4, this.screen.rows - 12)));
    else if (this.overlay?.type === "input") {
      const o = this.overlay;
      const shown = o.mask ? (o.text.length > 8 ? "•".repeat(Math.min(32, o.text.length - 4)) + o.text.slice(-4) : "•".repeat(o.text.length)) : o.text;
      out.push("", ...C.box(th, cols, o.title, [th.muted(o.hint || ""), th.accent2(`${th.sym.prompt} `) + th.text(shown) + th.inverse(" ")].filter((x) => x !== ""), th.accent));
    }
    const thinkColor = th.hex(th.thinkingColor(this.rt.thinking));
    const label = ` ${this.rt.thinking === "off" ? "thinking off" : `thinking ${this.rt.thinking}`} `;
    out.push(thinkColor(th.sym.hr.repeat(Math.max(0, cols - width(label) - 2))) + th.muted(label) + thinkColor(th.sym.hr.repeat(2)));
    const busy = this.rt.session().busy;
    const ed = this.editor.render(cols, {
      prefix: (busy ? th.warn(th.sym.prompt) : th.accent(th.sym.prompt)) + " ", cont: "  ",
      placeholder: busy ? "Steer the agent… (Enter queues, Esc stops)" : "Ask Lumen anything · / commands · @ files · ! shell",
      style: (s) => th.text(s), muted: (s) => th.muted(s),
    });
    if (!a && this.overlay?.type !== "select" && this.overlay?.type !== "input") cursor = { row: out.length + ed.cursorRow, col: ed.cursorCol };
    out.push(...ed.lines);
    const pop = this.popup();
    if (pop && !a && !this.overlay) {
      pop.items.forEach((p, i) => out.push(truncate(`  ${i === this.popupIndex ? th.bold(th.accent2(`${th.sym.sel} ${p.label}`)) : th.text(`  ${p.label}`)}  ${th.muted(p.detail || "")}`, cols)));
    }
    const s = this.rt.session();
    const u = this.liveUsage;
    const elapsed = this.activity && this.activityStart ? `${((Date.now() - this.activityStart) / 1000).toFixed(0)}s` : "";
    out.push(...C.footer(th, cols, {
      cwd: this.rt.cwd, persona: this.rt.persona.name, model: this.rt.model ? specString(this.rt.model) : "no model",
      ctxPct: u?.lastInput ? Math.min(100, Math.round((u.lastInput / (this.ctxSize() || 1)) * 100)) : this.rt.contextPct(s),
      tokens: s.usage.input + s.usage.output + (u ? u.input + u.output : 0), cost: s.usage.costUsd + (u?.costUsd || 0), priced: s.usage.priced && (u ? u.priced : true),
      chain: this.rt.chain, activity: this.activity, elapsed, t: Date.now(), yolo: this.rt.effectiveApproval() === "yolo", queued: s.queue?.length || 0,
    }));
    return { lines: out, cursor };
  }

  ctxSize() { const m = this.rt.model; const hit = m && LLM[m.provider]?.models.find((x) => x.id === m.id); return hit?.context || (m?.provider === "anthropic" ? 1_000_000 : 200_000); }

  render(final = false) {
    if (this.quitting && !final) return;
    const { cols, rows } = this.screen.size();
    // 1. commit settled items in order
    while (this.committed < this.items.length && this.settled(this.items[this.committed])) {
      const lines = this.renderItem(this.items[this.committed], cols);
      this.screen.commit(lines.slice(this.partial));
      this.committed++; this.partial = 0;
    }
    // 2. live items
    const liveItems = this.items.slice(this.committed);
    let live = [];
    liveItems.forEach((it, k) => { const l = this.renderItem(it, cols, true); live.push(...(k === 0 ? l.slice(this.partial) : l)); });
    const bottom = final ? { lines: [], cursor: null } : this.bottom(cols);
    // 3. overflow: commit the oldest streaming lines so the live region fits the screen
    const max = rows - 1;
    const over = live.length + bottom.lines.length - max;
    if (over > 0 && liveItems.length) {
      const first = liveItems[0];
      if (first.kind === "assistant" || first.kind === "thinking" || first.kind === "shell") {
        const firstLines = this.renderItem(first, cols, true).slice(this.partial);
        const n = Math.min(over, Math.max(0, firstLines.length - 1));
        if (n > 0) { this.screen.commit(firstLines.slice(0, n)); this.partial += n; live = live.slice(n); }
      }
    }
    const lines = [...live, ...bottom.lines];
    const cursor = bottom.cursor ? { row: live.length + bottom.cursor.row, col: bottom.cursor.col } : null;
    this.screen.frame(lines, cursor);
  }

  fullRedraw() {
    const { cols } = this.screen.size();
    const committed = [];
    for (let i = 0; i < this.committed; i++) committed.push(...this.renderItem(this.items[i], cols));
    this.partial = 0;
    const liveItems = this.items.slice(this.committed);
    const live = liveItems.flatMap((it) => this.renderItem(it, cols, true));
    const b = this.bottom(cols);
    this.screen.reset(committed, [...live, ...b.lines], b.cursor ? { row: live.length + b.cursor.row, col: b.cursor.col } : null);
  }

  // ── pickers / prompts ────────────────────────────────────────────────────
  pick({ title, items, index = 0, hint }) {
    return new Promise((res) => { this.overlay = { type: "select", st: { title, items, index, filter: "", hint }, resolve: res }; this.render(); });
  }

  ask({ title, mask = false, hint = "" }) {
    return new Promise((res) => { this.overlay = { type: "input", title, mask, hint, text: "", resolve: res }; this.render(); });
  }

  closeOverlay(value) { const o = this.overlay; this.overlay = null; o?.resolve(value); this.render(); }

  async modelPicker() {
    const providers = this.rt.configuredLlms();
    if (!providers.length) return this.note("No LLM provider configured. Add a key: lumen keys set anthropic <key>", "warn");
    this.setActivity("loading models");
    const lists = await Promise.all(providers.map(async (p) => (await listModels(p, this.rt.keys)).map((m) => ({ label: `${p}:${m.id}`, detail: [m.name !== m.id ? m.name : "", m.context ? `${Math.round(m.context / 1000)}k ctx` : "", m.price ? `$${m.price.in}/$${m.price.out}` : ""].filter(Boolean).join(" · "), value: { provider: p, id: m.id } }))));
    this.setActivity(null);
    const items = lists.flat();
    const cur = items.findIndex((x) => x.label === specString(this.rt.model));
    const pick = await this.pick({ title: "Model", items, index: Math.max(0, cur) });
    if (pick) this.setModel(pick.value);
  }

  setModel(spec) { try { const m = this.rt.setModel(spec); this.note(`Model: ${specString(m)}`); } catch (e) { this.note(e.message, "warn"); } }

  async openDashboard() {
    const srv = await this.rt.startServer();
    const url = srv.loginUrl;
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    exec(`${opener} "${url}"`, () => {});
    return srv.url;
  }

  // ── keys ─────────────────────────────────────────────────────────────────
  onKey(k) {
    if (this.quitting) return;
    const a = this.approvals[0];
    if (a) return this.approvalKey(a, k);
    if (this.overlay?.type === "select") return this.selectKey(k);
    if (this.overlay?.type === "input") return this.inputKey(k);
    const ed = this.editor;
    if (k.ctrl && k.name === "c") {
      if (!ed.isEmpty()) { ed.clear(); return this.render(); }
      if (Date.now() - this.ctrlC < 1500) return this.quit();
      this.ctrlC = Date.now();
      return this.note("Press Ctrl+C again to quit.");
    }
    if (k.ctrl && k.name === "d" && ed.isEmpty()) return this.quit();
    if (k.name === "escape") {
      if (this.popup()) { const { start } = ed.tokenBeforeCursor(); ed.replaceToken(start, ""); return this.render(); }
      if (this.rt.abort()) this.note("Stopped.", "warn");
      return this.render();
    }
    if (k.ctrl && k.name === "p") { this.rt.cycleModel(); return this.note(`Model: ${specString(this.rt.model)}`); }
    if (k.ctrl && k.name === "l") return void this.modelPicker();
    if (k.name === "tab" && k.shift) { this.rt.cycleThinking(); return this.render(); }
    if (k.ctrl && k.name === "t") { this.showThinking = !this.showThinking; return this.fullRedraw(); }
    if (k.ctrl && k.name === "o") { this.expandTools = !this.expandTools; return this.fullRedraw(); }
    const pop = this.popup();
    if (pop) {
      if (k.name === "up") { this.popupIndex = (this.popupIndex - 1 + pop.items.length) % pop.items.length; return this.render(); }
      if (k.name === "down") { this.popupIndex = (this.popupIndex + 1) % pop.items.length; return this.render(); }
      if (k.name === "tab" || (k.name === "enter" && !k.meta && pop.kind === "file")) { this.acceptPopup(pop); return this.render(); }
      if (k.name === "enter" && !k.meta && pop.kind === "cmd") {
        // Enter completes the highlighted command and runs it right away.
        if (!this.commands.some((c) => `/${c.name}` === pop.token)) this.acceptPopup(pop);
        return void this.submit();
      }
    } else this.popupIndex = 0;
    switch (k.name) {
      case "enter": if (k.meta || k.shift) ed.newline(); else return void this.submit(); break;
      case "paste": ed.paste(k.paste); break;
      case "backspace": if (k.meta) ed.deleteWordBack(); else ed.backspace(); break;
      case "delete": ed.del(); break;
      case "left": if (k.ctrl || k.meta) ed.wordLeft(); else ed.left(); break;
      case "right": if (k.ctrl || k.meta) ed.wordRight(); else ed.right(); break;
      case "home": ed.home(); break;
      case "end": ed.end(); break;
      case "up": ed.up(); break;
      case "down": ed.down(); break;
      default:
        if (k.newline || (k.ctrl && k.name === "j")) ed.newline();
        else if (k.ctrl && k.name === "a") ed.home();
        else if (k.ctrl && k.name === "e") ed.end();
        else if (k.ctrl && k.name === "w") ed.deleteWordBack();
        else if (k.ctrl && k.name === "u") ed.killToStart();
        else if (k.ctrl && k.name === "k") ed.killToEnd();
        else if (k.meta && k.name === "b") ed.wordLeft();
        else if (k.meta && k.name === "f") ed.wordRight();
        else if (k.text && !k.ctrl && !k.meta) ed.insert(k.text);
    }
    this.render();
  }

  // ── submit ───────────────────────────────────────────────────────────────
  async submit() {
    const raw = this.editor.value();
    const text = raw.trim();
    if (!text) return;
    this.editor.remember(this.editor.text);
    this.editor.clear();
    this.render();
    if (text.startsWith("/") && !text.startsWith("//")) return this.slash(text);
    if (text.startsWith("!")) return this.shell(text);
    return this.sendText(text);
  }

  async slash(text) {
    const m = /^\/([\w:.-]+)\s*([\s\S]*)$/.exec(text);
    const name = m?.[1] || "", arg = (m?.[2] || "").trim();
    if (name.startsWith("skill:")) {
      const s = this.rt.skills.get(name.slice(6));
      if (!s) return this.note(`No skill "${name.slice(6)}". Try /skills.`, "warn");
      return this.sendText(`Use the "${s.slug}" skill (instructions below).${arg ? `\n\nTask: ${arg}` : ""}\n\n<skill slug="${s.slug}">\n${s.markdown}\n</skill>`, { display: `/skill:${s.slug}${arg ? " " + arg : ""}` });
    }
    const cmd = this.commands.find((c) => c.name === name);
    if (!cmd) return this.note(`Unknown command /${name}. Type /help.`, "warn");
    try { await cmd.run(arg); } catch (e) { this.note(e.message, "warn"); }
    this.render();
  }

  async shell(text) {
    const send = !text.startsWith("!!");
    const command = text.replace(/^!!?/, "").trim();
    if (!command) return;
    const item = { kind: "shell", command, output: "" };
    this.items.push(item);
    this.render();
    const r = await runShell(command, { cwd: this.rt.cwd, timeoutSec: 300, maxOutput: 40000, onData: (d) => { item.output += d; this.render(); } });
    item.output = r.output; item.code = r.code; item.sent = send;
    this.render();
    if (send) this.sendText(`I ran \`${command}\` (exit ${r.code}):\n\`\`\`\n${r.output.slice(-20000)}\n\`\`\``, { display: `(shell output of ${command})` });
  }

  /** Expand @file mentions: images attach, text files inline (scoped to cwd). */
  expandMentions(text) {
    const images = [];
    let extra = "";
    for (const m of text.matchAll(/(?:^|\s)@([^\s]+)/g)) {
      const p = resolve(this.rt.cwd, m[1]);
      if (!p.startsWith(this.rt.cwd) || !existsSync(p) || !statSync(p).isFile()) continue;
      if (IMG.has(extname(p).toLowerCase())) { images.push(p); continue; }
      if (statSync(p).size > 200_000) { extra += `\n\n(@${m[1]} is large: ask me to read parts of it)`; continue; }
      extra += `\n\n<file path="${m[1]}">\n${readFileSync(p, "utf8")}\n</file>`;
    }
    return { text: text + extra, images };
  }

  sendText(text, { display } = {}) {
    if (!this.rt.hasLlm()) { this.note("No model yet. Run /model, add a key with `lumen keys set`, or restart Lumen for setup.", "warn"); return; }
    const { text: body, images } = this.expandMentions(text);
    const s = this.rt.session();
    if (s.busy) this.queued++;
    this.rt.send(body, { images, source: "cli", displayText: display || (body !== text ? text : undefined) }).catch((e) => this.note(e.message, "warn"));
  }
}

Object.assign(App.prototype, inputMethods);
