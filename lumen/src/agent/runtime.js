// Runtime: the one agent instance shared by the TUI, `lumen -p`, and the dashboard server.
// Everything observable goes out as runtime.emit("event", { type, ... }) — the same frames the WS contract uses.
import { EventEmitter } from "node:events";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { getConfig, updateConfig } from "../core/config.js";
import { getKeys } from "../core/keys.js";
import { Approvals } from "../core/approvals.js";
import { getPersona, listPersonas } from "../core/personas.js";
import * as sessions from "../core/sessions.js";
import { searchMemory, allMemories } from "../core/memory.js";
import { P, ensureHome } from "../core/paths.js";
import { id as newId } from "../core/util.js";
import { log } from "../core/log.js";
import { LLM, THINKING_LEVELS, PROVIDER_ORDER, parseModelSpec, specString, contextFor, visionFor } from "../llm/catalog.js";
import { createClient, resolveModel, FallbackClient, detectLocal, providerConfigured } from "../llm/index.js";
import { loadSkills } from "../skills/index.js";
import { loadPlugins } from "../plugins/index.js";
import { MediaService } from "../media/index.js";
import { supported as screenSupported } from "../screen/index.js";
import { getChain } from "../chains/registry.js";
import { buildTools } from "./tools/index.js";
import { runTurn } from "./loop.js";
import { buildSystemPrompt, withMemory, SUB_AGENT_PROMPTS } from "./prompt.js";
import { VERSION } from "../version.js";
import { checkUpdates, cachedUpdates } from "../core/update.js";

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const READ_ONLY_TOOLS = ["read_file", "list_dir", "glob", "grep", "web_fetch", "web_search", "skill_list", "skill_load", "skill_file", "memory_search", "chain_list", "chain_status", "get_balance", "get_price", "token_info", "tx_lookup", "address_activity", "nfts", "contract_abi", "gas", "chainlink_feeds", "swap_quote", "bridge_quote", "defi_tvl", "defi_yields", "claudia_coin", "simulate_tx", "read_contract", "resolve_address", "media_status", "screen_windows"];

export class Runtime extends EventEmitter {
  constructor({ cwd = process.cwd(), flags = {} } = {}) {
    super();
    this.setMaxListeners(50);
    this.cwd = cwd;
    this.flags = flags;
    this.approvals = new Approvals();
    this.sessions = new Map();
    this.activeId = null;
    this.localUp = {};
    this.updates = [];
    this.dashboard = null;
    this.server = null;
  }

  get config() { return getConfig(); }
  get keys() { return getKeys(); }

  async init({ detect = true } = {}) {
    ensureHome();
    const cfg = this.config;
    if (this.flags.yes) this.approvalMode = "yolo";
    this.persona = getPersona(this.flags.persona || cfg.persona);
    this.chain = (getChain(this.flags.chain || cfg.chain) || getChain("ethereum")).id;
    this.thinking = cfg.thinking;
    if (detect) this.localUp = await detectLocal();
    this.skills = await loadSkills({ cwd: this.cwd });
    this.plugins = await loadPlugins({ config: cfg });
    this.media = new MediaService({ keys: this.keys, approvals: this.approvals, getConfig: () => ({ ...this.config, approvalMode: this.effectiveApproval() }) });
    this.media.jobs.on("job", (job) => this.emit("event", { type: "media_job", ...job }));
    this.approvals.on("request", (a) => this.emit("event", { type: "approval_request", ...a }));
    this.registry = buildTools({ plugins: this.plugins });
    this.model = resolveModel({ spec: this.flags.model, config: cfg, keys: this.keys, localUp: this.localUp });
    if (!this.updatesPromise) {
      this.updatesPromise = (this.flags.offline || cfg.update?.check === false ? Promise.resolve(cachedUpdates()) : checkUpdates({ timeoutMs: 1500 })).catch(() => cachedUpdates());
      this.updatesPromise.then((u) => { this.updates = u || []; });
    }
    // Lazy takeover controller: the first dashboard op starts the server (which replaces this object).
    if (!this.server) this.dashboard = {
      open: async () => { await this.startServer(); return this.dashboard.open(); },
      op: async (...a) => { await this.startServer(); return this.dashboard.op(...a); },
    };
    return this;
  }

  effectiveApproval() { return this.approvalMode || this.config.approvalMode || "always-ask"; }

  // ── model / persona / settings ──────────────────────────────────────────
  hasLlm() { return !!this.model && (this.model.provider === "mock" || LLM[this.model.provider]?.local || providerConfigured(this.model.provider, this.keys, { localUp: this.localUp })); }

  configuredLlms() { return PROVIDER_ORDER.filter((p) => providerConfigured(p, this.keys, { localUp: this.localUp })); }

  setModel(spec, { persist = true } = {}) {
    const m = typeof spec === "string" ? parseModelSpec(spec) : spec;
    if (!m || !LLM[m.provider]) throw new Error(`Unknown model "${spec}". Use provider:model, e.g. anthropic:claude-opus-5-5.`);
    if (!m.id) m.id = LLM[m.provider].roles.default;
    this.model = m;
    if (persist && m.provider !== "mock") updateConfig({ model: m });
    this.emit("event", { type: "model", model: m });
    return m;
  }

  /** Models to cycle with Ctrl+P: config.cycle, else each configured provider's default + fast. */
  cycleList() {
    const c = this.config.cycle;
    if (c?.length) return c.map(parseModelSpec).filter(Boolean);
    const out = [];
    for (const p of this.configuredLlms()) {
      const r = LLM[p].roles;
      if (r.default) out.push({ provider: p, id: r.default });
      if (r.fast && r.fast !== r.default) out.push({ provider: p, id: r.fast });
    }
    if (this.model && !out.some((m) => specString(m) === specString(this.model))) out.unshift(this.model);
    return out;
  }

  cycleModel(dir = 1) {
    const list = this.cycleList();
    if (!list.length) return this.model;
    const i = list.findIndex((m) => specString(m) === specString(this.model));
    return this.setModel(list[(i + dir + list.length) % list.length]);
  }

  setThinking(level) {
    if (!THINKING_LEVELS.includes(level)) throw new Error(`Thinking level must be one of ${THINKING_LEVELS.join(", ")}`);
    this.thinking = level;
    updateConfig({ thinking: level });
    this.emit("event", { type: "thinking_level", level });
  }

  cycleThinking() { return this.setThinking(THINKING_LEVELS[(THINKING_LEVELS.indexOf(this.thinking) + 1) % THINKING_LEVELS.length]), this.thinking; }

  setPersona(id) {
    const p = listPersonas().find((x) => x.id === String(id).toLowerCase());
    if (!p) throw new Error(`No persona "${id}". Try: ${listPersonas().map((x) => x.id).join(", ")}`);
    this.persona = p;
    updateConfig({ persona: p.id });
    this.emit("event", { type: "persona", persona: { id: p.id, name: p.name } });
    return p;
  }

  setChain(id) {
    const c = getChain(id);
    if (!c) throw new Error(`Unknown chain ${id}`);
    this.chain = c.id;
    updateConfig({ chain: c.id });
    this.emit("event", { type: "chain", chain: c.id });
    return c;
  }

  // ── sessions ─────────────────────────────────────────────────────────────
  session(id = this.activeId) {
    if (id && this.sessions.has(id)) return this.sessions.get(id);
    if (id) {
      const s = sessions.loadSession(id);
      if (s) { const live = this.#wrap(s.id, s.title, s.messages, s.items); this.sessions.set(id, live); return live; }
    }
    return this.newSession();
  }

  #wrap(id, title, messages = [], items = []) {
    return { id, title, messages, items, busy: false, abort: null, queue: [], usage: { input: 0, output: 0, costUsd: 0, lastInput: 0, priced: true }, todo: [] };
  }

  newSession() {
    const id = sessions.createSession({ cwd: this.cwd, persona: this.persona?.id, model: specString(this.model) });
    const s = this.#wrap(id, "New session");
    this.sessions.set(id, s);
    this.activeId = id;
    this.emit("event", { type: "session", sessionId: id, title: s.title });
    return s;
  }

  resume(id) {
    const s = this.session(id);
    this.activeId = s.id;
    this.emit("event", { type: "session", sessionId: s.id, title: s.title, resumed: true });
    return s;
  }

  // ── turns ────────────────────────────────────────────────────────────────
  systemPrompt() {
    const tools = this.registry.list(this.config).filter((t) => t.enabled);
    return buildSystemPrompt({
      persona: this.persona, model: this.model, chain: this.chain, cwd: this.cwd, approvalMode: this.effectiveApproval(),
      configured: { llm: this.configuredLlms(), alchemy: this.keys.has("alchemy"), etherscan: this.keys.has("etherscan"), helius: this.keys.has("helius"), evmWallet: this.keys.has("evmPrivateKey"), solWallet: this.keys.has("solanaSecret"), media: this.media.summary() },
      tools, skillsIndex: this.skills.promptIndex(this.chain), screenSupported: screenSupported(),
    });
  }

  client(model = this.model) {
    let c = createClient(model, { keys: this.keys, config: this.config, thinking: this.thinking });
    const fb = this.config.fallback;
    if (fb?.provider && specString(fb) !== specString(model)) {
      try { c = new FallbackClient(c, createClient(fb, { keys: this.keys, config: this.config, thinking: this.thinking }), specString(fb)); } catch { /* fallback unusable */ }
    }
    return c;
  }

  toolCtx(s, extra = {}) {
    return { runtime: this, cwd: this.cwd, keys: this.keys, config: { ...this.config, approvalMode: this.effectiveApproval() }, approvals: this.approvals, skills: this.skills, media: this.media, chain: this.chain, sessionId: s.id, depth: 0, emit: (ev) => this.emit("event", ev), ...extra };
  }

  /** Resolve image refs (data URLs, /api/... upload URLs, local paths) into data URLs. */
  imageUrl(ref) {
    const r = String(ref || "");
    if (r.startsWith("data:") || /^https?:\/\//.test(r)) return r;
    let file = r;
    const m = /^\/api\/files\/(media|uploads)\/(.+)$/.exec(r);
    if (m) file = join(m[1] === "media" ? P.media : P.uploads, decodeURIComponent(m[2]));
    if (!existsSync(file) || file.includes("..")) return null;
    return `data:${MIME[extname(file).toLowerCase()] || "image/png"};base64,${readFileSync(file).toString("base64")}`;
  }

  /**
   * Send a user message. If the session is busy, it's queued as steering and injected after the current tool round.
   * Returns the turn result promise (or { queued: true }).
   */
  async send(text, { source = "cli", images = [], sessionId, displayText } = {}) {
    const s = this.session(sessionId || this.activeId);
    this.activeId = s.id;
    const body = String(text ?? "").trim();
    if (!body && !images.length) return { ok: false, error: "empty" };
    if (s.busy) { s.queue.push(body); this.emit("event", { type: "notice", level: "info", text: "Queued: it will reach the agent after the current step.", sessionId: s.id }); return { queued: true }; }
    if (!this.hasLlm()) {
      const msg = "No model is configured. Add an LLM key (lumen keys set anthropic <key>) or start Ollama, or try --model mock:echo.";
      this.emit("event", { type: "error", sessionId: s.id, message: msg });
      return { ok: false, error: msg };
    }
    const uid = newId("u_");
    const shown = displayText || body;
    this.emit("event", { type: "user", sessionId: s.id, id: uid, text: shown, source, ...(images.length ? { images: images.length } : {}) });
    sessions.appendItem(s.id, { type: "user", id: uid, text: shown, source });
    if (s.title === "New session" && body) { s.title = shown.replace(/\s+/g, " ").slice(0, 60); sessions.setTitle(s.id, s.title); this.emit("event", { type: "session", sessionId: s.id, title: s.title }); }
    const hits = allMemories().length ? searchMemory(body, 5) : [];
    const content = withMemory(body, hits);
    const imgs = images.map((x) => this.imageUrl(x)).filter(Boolean);
    const userMsg = imgs.length ? { role: "user", content: [{ type: "text", text: content }, ...imgs.map((url) => ({ type: "image_url", image_url: { url } }))] } : { role: "user", content };
    s.messages.push(userMsg);
    sessions.appendMessage(s.id, imgs.length ? { role: "user", content: content + `\n[${imgs.length} image(s)]` } : userMsg);
    return this.#turn(s);
  }

  async #turn(s) {
    s.busy = true;
    s.abort = new AbortController();
    let client;
    try { client = this.client(); } catch (e) {
      s.busy = false;
      this.emit("event", { type: "error", sessionId: s.id, message: e.message });
      this.emit("event", { type: "agent_status", state: "idle", sessionId: s.id });
      return { ok: false, error: e.message };
    }
    const thinkingBuf = [];
    const onEv = (ev) => { if (ev.sessionId === s.id && ev.type === "thinking") thinkingBuf.push(ev.delta); };
    this.on("event", onEv);
    let res;
    try {
      res = await runTurn({
        client, system: this.systemPrompt(), messages: s.messages, registry: this.registry, toolCtx: this.toolCtx(s), signal: s.abort.signal, sessionId: s.id,
        maxRounds: this.config.maxRounds || 24, provider: this.model.provider, vision: visionFor(this.model.provider, this.model.id),
        emit: (ev) => {
          this.emit("event", ev);
          if (ev.type === "assistant_done") sessions.appendItem(s.id, { type: "assistant", id: ev.id, text: ev.text });
          else if (ev.type === "tool_start") sessions.appendItem(s.id, { type: "tool", phase: "start", callId: ev.callId, name: ev.name, args: ev.args });
          else if (ev.type === "tool_end") sessions.appendItem(s.id, { type: "tool", callId: ev.callId, name: ev.name, ok: ev.ok, summary: ev.summary });
          else if (ev.type === "error") sessions.appendItem(s.id, { type: "error", text: ev.message });
        },
        takeSteering: () => s.queue.splice(0),
        onMessage: (m) => sessions.appendMessage(s.id, m),
      });
    } catch (e) {
      log.error("turn crashed", e);
      res = { ok: false, error: e.message, usage: { input: 0, output: 0, costUsd: 0 } };
      this.emit("event", { type: "error", sessionId: s.id, message: `Internal error: ${e.message}` });
    } finally {
      this.off("event", onEv);
      s.busy = false;
      s.abort = null;
    }
    if (thinkingBuf.length) sessions.appendItem(s.id, { type: "thinking", text: thinkingBuf.join("").slice(0, 8000) });
    const u = res.usage || {};
    s.usage.input += u.input || 0; s.usage.output += u.output || 0; s.usage.costUsd += u.costUsd || 0;
    if (u.lastInput) s.usage.lastInput = u.lastInput;
    if (u.priced === false) s.usage.priced = false;
    this.emit("event", { type: "turn_done", sessionId: s.id, usage: { input: u.input || 0, output: u.output || 0, costUsd: u.costUsd || 0 }, model: specString(this.model), ok: res.ok, aborted: !!res.aborted });
    this.emit("event", { type: "agent_status", state: "idle", sessionId: s.id });
    if (s.queue.length && !res.aborted) { const next = s.queue.splice(0).join("\n\n"); setImmediate(() => this.send(next, { source: "steer", sessionId: s.id })); }
    return res;
  }

  abort(sessionId = this.activeId) {
    const s = this.sessions.get(sessionId);
    if (s?.abort) { s.queue.length = 0; s.abort.abort(); this.approvals.cancelAll("stopped"); return true; }
    return false;
  }

  contextPct(s = this.session()) {
    const ctx = contextFor(this.model?.provider, this.model?.id);
    return ctx ? Math.min(100, Math.round((s.usage.lastInput / ctx) * 100)) : 0;
  }

  /** Summarize the history into one message to free context. */
  async compact(sessionId = this.activeId) {
    const s = this.session(sessionId);
    if (s.busy) throw new Error("Wait for the current turn to finish.");
    if (s.messages.length < 4) return "Nothing to compact yet.";
    const client = this.client();
    const transcript = s.messages.map((m) => `${m.role}${m.name ? `(${m.name})` : ""}: ${typeof m.content === "string" ? m.content.slice(0, 3000) : "[content]"}${m.tool_calls ? ` [called ${m.tool_calls.map((t) => t.function.name).join(", ")}]` : ""}`).join("\n").slice(-120000);
    const summary = await client.complete([{ role: "system", content: "Summarize this conversation for your own future reference: goals, decisions, facts found (with numbers and addresses), files touched, open tasks. Be dense; under 400 words." }, { role: "user", content: transcript }]);
    s.messages.splice(0, s.messages.length, { role: "user", content: `Summary of our conversation so far:\n${summary}` }, { role: "assistant", content: "Got it. I'll continue from that summary." });
    sessions.appendRecord(s.id, { t: "reset", keep: s.messages });
    s.usage.lastInput = Math.ceil(summary.length / 4);
    return summary;
  }

  /** Read-only helper agent for `delegate`. */
  async subAgent({ task, role = "research", persona, tools, maxRounds = 8, signal, parentSession }) {
    const m = resolveModel({ config: this.config, keys: this.keys, localUp: this.localUp, role: "fast" }) || this.model;
    const sameProvider = m?.provider === this.model?.provider ? m : this.model;
    const client = createClient(sameProvider, { keys: this.keys, config: this.config, thinking: "low" });
    const messages = [{ role: "user", content: task }];
    const parent = this.session(parentSession);
    const res = await runTurn({
      client, system: `${SUB_AGENT_PROMPTS[role] || SUB_AGENT_PROMPTS.research}${persona && listPersonas().find((p) => p.id === persona) ? `\n\nPersona notes:\n${listPersonas().find((p) => p.id === persona).body}` : ""}\n\nActive chain: ${this.chain}. Working directory: ${this.cwd}.`, messages, registry: this.registry,
      toolCtx: { ...this.toolCtx(parent, { depth: 1 }), config: { ...this.config, approvalMode: "always-ask" } }, only: Array.isArray(tools) && tools.length ? READ_ONLY_TOOLS.filter((t) => tools.includes(t)) : READ_ONLY_TOOLS, signal, sessionId: parentSession,
      maxRounds, provider: sameProvider.provider, emit: (ev) => { if (["tool_start", "tool_end"].includes(ev.type)) this.emit("event", { ...ev, helper: role }); },
    });
    parent.usage.input += res.usage.input; parent.usage.output += res.usage.output; parent.usage.costUsd += res.usage.costUsd;
    return { text: res.text, rounds: res.rounds };
  }

  serverUrl() { return this.server?.url || null; }

  async startServer(opts = {}) {
    if (this.server) return this.server;
    const { startServer } = await import("../server/index.js");
    this.server = await startServer(this, opts);
    return this.server;
  }

  state() {
    return {
      version: VERSION, persona: { id: this.persona.id, name: this.persona.name }, model: this.model ? { provider: this.model.provider, id: this.model.id } : null,
      chain: this.chain, thinking: this.thinking, approvalMode: this.effectiveApproval(), sessionId: this.activeId,
    };
  }
}

export async function createRuntime(opts) { return new Runtime(opts).init(opts); }
