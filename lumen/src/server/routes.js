// REST routes (docs/CONTRACT.md). Each handler gets (ctx) = { req, res, url, params, body(), rt } and returns JSON.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { HttpError, readBody, readJsonBody } from "./http.js";
import { sendFile, safeJoin } from "./static.js";
import { VERSION } from "../version.js";
import { P } from "../core/paths.js";
import { getConfig, updateConfig } from "../core/config.js";
import { FIELDS, resolveField } from "../core/keys.js";
import { providerStatus, testProvider } from "../core/providers.js";
import { listPersonas } from "../core/personas.js";
import { listSessions, loadSession } from "../core/sessions.js";
import { checkUpdates, installUpdates } from "../core/update.js";
import { CHAINS, mainnets, getChain } from "../chains/registry.js";
import { rpcSource } from "../chains/rpc.js";
import { chainStatus } from "../chains/evm.js";
import { getPrice } from "../chains/prices.js";
import { getBalance } from "../chains/balances.js";
import { listModels } from "../llm/index.js";
import { LLM } from "../llm/catalog.js";
import { pluginList, loadPlugins } from "../plugins/index.js";
import * as screen from "../screen/index.js";

const started = Date.now();
const chainOr404 = (id) => { const c = getChain(id); if (!c) throw new HttpError(404, "unknown_chain", `Unknown chain ${id}`); return c; };

export function apiState(rt) {
  const s = rt.state();
  return {
    version: VERSION, persona: s.persona, model: s.model, providers: providerStatus(rt.keys, { localUp: rt.localUp }), chains: CHAINS.length,
    skills: (({ base, chain, user }) => ({ base, chain, user }))(rt.skills.counts), updates: rt.updates || [], platform: process.platform,
    screen: { supported: screen.supported() }, chain: s.chain, thinking: s.thinking, approvalMode: s.approvalMode, sessionId: s.sessionId,
  };
}

const CONFIG_KEYS = ["chain", "thinking", "approvalMode", "maxRounds", "wallet", "media", "persona", "tools", "ui", "search"];

export function buildRoutes(rt, hub) {
  const R = [];
  const route = (method, path, handler, opts = {}) => R.push({ method, re: new RegExp("^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)").replace(/\*$/, "(?<rest>.*)") + "$"), handler, ...opts });

  route("GET", "/api/health", () => ({ ok: true, version: VERSION, uptime: Math.round((Date.now() - started) / 1000) }), { public: true });
  route("GET", "/api/state", () => apiState(rt));
  route("GET", "/api/providers", () => providerStatus(rt.keys, { localUp: rt.localUp }));
  route("PUT", "/api/keys", async ({ body }) => {
    const b = await body();
    for (const [raw, v] of Object.entries(b)) {
      const field = resolveField(raw);
      if (!FIELDS[field]) throw new HttpError(400, "unknown_field", `Unknown key field ${field}`);
      rt.keys.set(field, v === null ? null : String(v));
    }
    if (!rt.model || !rt.hasLlm()) { const { resolveModel } = await import("../llm/index.js"); const m = resolveModel({ config: getConfig(), keys: rt.keys, localUp: rt.localUp }); if (m) rt.model = m; }
    return { ok: true, providers: providerStatus(rt.keys, { localUp: rt.localUp }) };
  });
  route("POST", "/api/keys/test", async ({ body }) => { const b = await body(); return testProvider(String(b.provider || ""), rt.keys); });
  route("GET", "/api/models", async ({ url }) => {
    const provider = url.searchParams.get("provider") || rt.model?.provider || "anthropic";
    if (!LLM[provider]) throw new HttpError(400, "unknown_provider", `Unknown provider ${provider}`);
    return { provider, models: await listModels(provider, rt.keys) };
  });
  route("PUT", "/api/model", async ({ body }) => { const b = await body(); rt.setModel({ provider: b.provider, id: b.id }); hub.broadcast({ type: "notice", level: "info", text: `Model: ${b.provider}:${b.id}` }); return { ok: true }; });
  route("GET", "/api/personas", () => listPersonas().map((p) => ({ id: p.id, name: p.name, summary: p.summary, active: p.id === rt.persona.id })));
  route("PUT", "/api/persona", async ({ body }) => { const b = await body(); rt.setPersona(b.id); return { ok: true }; });
  route("GET", "/api/sessions", () => listSessions(100));
  route("GET", "/api/sessions/:id", ({ params }) => { const s = loadSession(params.id); if (!s) throw new HttpError(404, "not_found", "No such session"); return { id: s.id, title: s.title, items: s.items }; });
  route("GET", "/api/chains", ({ url }) => (url.searchParams.get("testnets") === "1" ? CHAINS : mainnets()).map((c) => ({ ...c, rpcSource: rpcSource(c, rt.keys) })));
  route("GET", "/api/chains/:id/status", async ({ params }) => chainStatus(chainOr404(params.id), rt.keys));
  route("GET", "/api/price", async ({ url }) => getPrice({ symbol: url.searchParams.get("symbol") || undefined, token: url.searchParams.get("token") || undefined, chain: url.searchParams.get("chain") || rt.chain }, rt.keys));
  route("GET", "/api/balance", async ({ url }) => {
    const address = url.searchParams.get("address");
    if (!address) throw new HttpError(400, "missing_address", "address is required");
    return getBalance(address, chainOr404(url.searchParams.get("chain") || rt.chain), rt.keys);
  });
  route("GET", "/api/skills", ({ url }) => rt.skills.list({ chain: url.searchParams.get("chain") || undefined, q: url.searchParams.get("q") || undefined }));
  route("GET", "/api/skills/:slug", ({ params }) => { const s = rt.skills.get(params.slug); if (!s) throw new HttpError(404, "not_found", "No such skill"); return { slug: s.slug, markdown: s.markdown, files: rt.skills.files(s.slug) }; });
  route("GET", "/api/media", () => rt.media.jobs.list(200));
  route("POST", "/api/media/generate", async ({ body }) => {
    const b = await body();
    try {
      const { job, done } = rt.media.generate({ kind: b.kind, prompt: b.prompt, model: b.model, aspect: b.aspect, durationSec: b.durationSec, voice: b.voice, refs: (b.refs || []).map((r) => rt.imageUrl(r) || r) }, { sessionId: rt.activeId });
      done.catch(() => {});
      return job;
    } catch (e) { throw new HttpError(e.code === "no_key" ? 400 : 422, e.code || "media_error", e.message); }
  });
  route("GET", "/api/media/:id", ({ params }) => { const j = rt.media.jobs.get(params.id); if (!j) throw new HttpError(404, "not_found", "No such job"); return j; });
  route("GET", "/api/files/media/*", ({ req, res, params }) => { const f = safeJoin(P.media, params.rest); if (!f || !sendFile(req, res, f)) throw new HttpError(404, "not_found", "No such file"); return null; });
  route("GET", "/api/files/uploads/*", ({ req, res, params }) => { const f = safeJoin(P.uploads, params.rest); if (!f || !sendFile(req, res, f)) throw new HttpError(404, "not_found", "No such file"); return null; });
  route("POST", "/api/uploads", async ({ req }) => {
    const buf = await readBody(req, 200 * 1024 * 1024);
    const raw = basename(decodeURIComponent(String(req.headers["x-filename"] || "upload.bin"))).replace(/[^\w.\- ]+/g, "_").slice(-120) || "upload.bin";
    mkdirSync(P.uploads, { recursive: true });
    const name = `${Date.now().toString(36)}-${raw}`;
    const path = join(P.uploads, name);
    writeFileSync(path, buf);
    return { path, url: `/api/files/uploads/${encodeURIComponent(name)}` };
  });
  route("GET", "/api/plugins", () => pluginList(rt.plugins));
  route("PUT", "/api/plugins/:id", async ({ params, body }) => {
    const b = await body();
    const set = new Set(getConfig().plugins?.disabled || []);
    if (b.enabled) set.delete(params.id); else set.add(params.id);
    updateConfig({ plugins: { disabled: [...set] } });
    rt.plugins = await loadPlugins({ config: getConfig() });
    return { ok: true };
  });
  route("GET", "/api/plugins/:id/entry.js", ({ req, res, params }) => {
    const p = rt.plugins.dashboard.find((x) => x.id === params.id && x.enabled);
    if (!p || !sendFile(req, res, join(p.dir, "entry.js"))) throw new HttpError(404, "not_found", "No such plugin");
    return null;
  });
  route("GET", "/api/plugins/:id/*", ({ req, res, params }) => {
    const p = rt.plugins.dashboard.find((x) => x.id === params.id && x.enabled);
    const f = p && safeJoin(p.dir, params.rest);
    if (!f || !sendFile(req, res, f)) throw new HttpError(404, "not_found", "No such file");
    return null;
  });
  route("GET", "/api/updates", async ({ url }) => { rt.updates = await checkUpdates({ force: url.searchParams.get("force") === "1", timeoutMs: 4000 }); return rt.updates; });
  route("POST", "/api/updates/install", async ({ body }) => { const b = await body(); const r = await installUpdates(b.names); rt.updates = await checkUpdates({ timeoutMs: 3000 }).catch(() => rt.updates); return r; });
  route("POST", "/api/screen/show", async ({ body }) => {
    if (!screen.supported()) throw new HttpError(400, "unsupported", `Screen control is macOS-only (this is ${process.platform}).`);
    const b = await body();
    const r = await screen.show({ app: b.app, url: b.url, markers: b.markers || [], seconds: b.seconds || 5 });
    return { ok: r.ok, ...(r.message ? { message: r.message } : {}) };
  });
  route("GET", "/api/approvals", () => rt.approvals.list());
  route("POST", "/api/approvals/:id", async ({ params, body }) => { const b = await body(); return { ok: rt.approvals.resolve(params.id, { approve: !!b.approve, answer: b.answer ?? null }) }; });
  // Additions (documented in CONTRACT.md): settings and active chain.
  route("GET", "/api/config", () => Object.fromEntries(CONFIG_KEYS.map((k) => [k, getConfig()[k]])));
  route("PUT", "/api/config", async ({ body }) => {
    const b = await body();
    const patch = Object.fromEntries(Object.entries(b).filter(([k]) => CONFIG_KEYS.includes(k)));
    if (patch.chain) rt.setChain(patch.chain);
    if (patch.thinking) rt.setThinking(patch.thinking);
    if (patch.persona) rt.setPersona(patch.persona);
    if (patch.approvalMode) { if (!["always-ask", "write", "yolo"].includes(patch.approvalMode)) throw new HttpError(400, "bad_value", "approvalMode must be always-ask, write or yolo"); rt.approvalMode = patch.approvalMode; }
    updateConfig(patch);
    return { ok: true, config: Object.fromEntries(CONFIG_KEYS.map((k) => [k, getConfig()[k]])) };
  });
  route("GET", "/api/tools", () => rt.registry.list(getConfig()));
  return R;
}

export async function handleApi(routes, ctx) {
  const { req, url } = ctx;
  for (const r of routes) {
    if (r.method !== req.method && !(req.method === "HEAD" && r.method === "GET")) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    let cached;
    ctx.params = m.groups || {};
    ctx.body = () => (cached ||= readJsonBody(req));
    return { route: r, result: await r.handler(ctx) };
  }
  throw new HttpError(404, "not_found", `No route ${req.method} ${url.pathname}`);
}

