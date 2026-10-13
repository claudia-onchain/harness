// Tool registry. A tool: { name, group, label, description, parameters (JSON schema), approval, safe, run(args, ctx), summary? }
//   approval  "none" | "write" (file mutations) | "shell" | "money" (always asks, cannot be skipped) | "custom" (tool asks itself)
//   safe      true when it can run in parallel with other safe tools (pure reads)
// run() returns a string or { text, images?, summary?, data? }. Errors thrown become error results.
import { clip } from "../../core/util.js";

// No additionalProperties:false: models (and skills) sometimes use alias names, which tools normalise.
export const obj = (properties = {}, required = []) => ({ type: "object", properties, required });
export const str = (description, extra = {}) => ({ type: "string", description, ...extra });
export const num = (description, extra = {}) => ({ type: "number", description, ...extra });
export const bool = (description) => ({ type: "boolean", description });
export const arr = (items, description) => ({ type: "array", items, description });

const MAX_MODEL_CHARS = 40_000;

export class ToolRegistry {
  constructor() { this.tools = new Map(); }

  add(tool) {
    if (!tool?.name || typeof tool.run !== "function") throw new Error(`Invalid tool ${tool?.name}`);
    this.tools.set(tool.name, { group: "Other", label: tool.name, approval: "none", safe: false, ...tool });
    return this;
  }

  addAll(list) { for (const t of list) this.add(t); return this; }
  get(name) { return this.tools.get(name); }
  remove(name) { this.tools.delete(name); }

  enabled(name, config) {
    const t = this.tools.get(name);
    if (!t) return false;
    if (t.locked) return true;
    return config?.tools?.[name] !== false;
  }

  list(config) { return [...this.tools.values()].map((t) => ({ name: t.name, group: t.group, label: t.label, description: t.description, enabled: this.enabled(t.name, config), approval: t.approval })); }

  /** Specs for the model: [{ name, description, parameters }]. `only` narrows (sub-agents). */
  specs(config, only) {
    return [...this.tools.values()].filter((t) => this.enabled(t.name, config) && (!only || only.includes(t.name)) && !t.hidden).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters || obj() }));
  }

  /** Execute with approval policy. Returns { ok, text, images?, summary }. */
  async execute(name, args, ctx) {
    const t = this.tools.get(name);
    if (!t) return { ok: false, text: `Unknown tool: ${name}`, summary: "unknown tool" };
    if (!this.enabled(name, ctx.config)) return { ok: false, text: `The ${name} tool is disabled in config (tools.${name}).`, summary: "disabled" };
    args = normalizeArgs(t, args);
    const gate = await approve(t, args, ctx);
    if (gate) return { ok: false, text: gate, summary: "not approved" };
    try {
      const r = await t.run(args || {}, ctx);
      const res = typeof r === "string" ? { text: r } : r || { text: "(no output)" };
      const text = clip(res.text ?? JSON.stringify(res.data ?? ""), MAX_MODEL_CHARS);
      return { ok: res.ok !== false, text, images: res.images, summary: res.summary || (t.summary ? safe(() => t.summary(args, res)) : firstLine(text)), data: res.data };
    } catch (e) {
      if (ctx.signal?.aborted) return { ok: false, text: "Stopped by the user.", summary: "stopped" };
      return { ok: false, text: `Error: ${e.message}`, summary: firstLine(e.message) };
    }
  }
}

/** Apply a tool's alias map ({ alias: canonical }) and optional normalize(args). */
export function normalizeArgs(t, args) {
  let a = args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
  for (const [from, to] of Object.entries(t.aliases || {})) if (a[from] !== undefined && a[to] === undefined) { a[to] = a[from]; delete a[from]; }
  if (t.normalize) a = t.normalize(a) || a;
  return a;
}

const safe = (f) => { try { return f(); } catch { return ""; } };
const firstLine = (s) => String(s || "").split("\n").find((l) => l.trim())?.slice(0, 140) || "";

async function approve(tool, args, ctx) {
  const mode = ctx.config?.approvalMode || "always-ask";
  const kind = tool.approval;
  if (kind === "none" || kind === "custom") return null;
  if (kind === "write" && (mode === "write" || mode === "yolo")) return null;
  if (kind === "shell" && mode === "yolo") return null;
  const preview = tool.preview ? safe(() => tool.preview(args, ctx)) : JSON.stringify(args, null, 2).slice(0, 2000);
  const ans = await ctx.approvals.request({ kind: kind === "money" ? "tx" : kind, title: `${tool.label}: ${tool.approvalTitle ? safe(() => tool.approvalTitle(args)) : tool.name}`, detail: preview, sessionId: ctx.sessionId });
  if (ans.approve) return null;
  return ans.reason === "no_ui"
    ? `This needs approval and nobody is attached to approve it. Re-run with --yes (or approvalMode "${kind === "write" ? "write" : "yolo"}") to allow ${tool.name}.`
    : `The user did not approve ${tool.name}${ans.answer ? `: ${ans.answer}` : ""}.`;
}
