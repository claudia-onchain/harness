// Health checks shared by the boot checklist and `lumen doctor`.
import { mainnets, CHAINS } from "../chains/registry.js";
import { rpcSource } from "../chains/rpc.js";
import { chainStatus } from "../chains/evm.js";
import { getChain } from "../chains/registry.js";
import { LLM, specString } from "../llm/catalog.js";
import { testLlm } from "../llm/index.js";
import { checkUpdates, cachedUpdates } from "../core/update.js";
import { supported as screenSupported } from "../screen/index.js";

export function bootChecks(rt, { offline = false } = {}) {
  const updates = offline ? Promise.resolve(cachedUpdates()) : rt.updatesPromise || checkUpdates({ timeoutMs: 1500 }).catch(() => cachedUpdates());
  const llms = rt.configuredLlms();
  const list = [
    { label: "node", run: async () => { const major = Number(process.versions.node.split(".")[0]); return major >= 22 ? { status: "ok", text: `v${process.versions.node}` } : { status: "fail", text: `v${process.versions.node} (Lumen needs Node 22+)` }; } },
    { label: "keys", run: async () => (llms.length ? { status: "ok", text: `${llms.map((p) => LLM[p].name).join(", ")}${rt.keys.locked ? " · keys.json locked" : ""}` } : { status: "warn", text: rt.keys.locked ? "keys.json is encrypted: set LUMEN_PASSPHRASE" : "no LLM key yet: setup will start" }) },
    {
      label: "model", pendingText: "reaching provider…",
      run: async () => {
        if (!rt.model) return { status: "warn", text: "none selected" };
        if (rt.model.provider === "mock") return { status: "ok", text: "mock:echo (offline demo)" };
        if (offline) return { status: "skip", text: `${specString(rt.model)} (offline: not checked)` };
        if (!rt.hasLlm()) return { status: "warn", text: `${specString(rt.model)}: no key` };
        const r = await Promise.race([testLlm(rt.model.provider, rt.keys), new Promise((res) => setTimeout(() => res({ ok: null }), 2200))]);
        return r.ok === null ? { status: "skip", text: `${specString(rt.model)} (slow to answer)` } : r.ok ? { status: "ok", text: `${specString(rt.model)} reachable` } : { status: "fail", text: `${specString(rt.model)}: ${r.message}` };
      },
    },
    { label: "chains", run: async () => { const n = mainnets().length; const t = CHAINS.length - n; return { status: "ok", text: `${n} mainnets + ${t} testnets · Alchemy ${rt.keys.has("alchemy") ? "on" : "off (public RPCs)"}${rt.keys.has("etherscan") ? " · Etherscan" : ""}` }; } },
    { label: "skills", run: async () => { const c = rt.skills.counts; return { status: c.base ? "ok" : "warn", text: `${c.base} base · ${c.chain} chain · ${c.user} user` }; } },
    { label: "plugins", run: async () => { const p = rt.plugins; const errs = p.errors.length; return { status: errs ? "warn" : "ok", text: `${p.tool.filter((x) => x.enabled).length} tool · ${p.dashboard.length} dashboard${errs ? ` · ${errs} failed` : ""}` }; } },
    { label: "screen", run: async () => (screenSupported() ? { status: "ok", text: "macOS: open, windows, markers, capture" } : { status: "skip", text: `not available on ${process.platform}` }) },
    {
      label: "updates", pendingText: "asking npm…",
      run: async () => {
        const u = await updates;
        const out = (u || []).filter((x) => x.outdated);
        if (out.length) return { status: "warn", text: out.map((x) => `${x.name} ${x.current} → ${x.latest}`).join(", ") + " · run `lumen update`" };
        return { status: "ok", text: u?.length ? "all up to date" : offline ? "skipped (offline)" : "up to date" };
      },
    },
  ];
  return { list, updates };
}

/** One RPC probe, for doctor. */
export async function chainProbe(rt, id = rt.chain) {
  const c = getChain(id);
  const s = await chainStatus(c, rt.keys);
  return { status: "ok", text: `${c.name} block ${s.blockNumber} · ${s.latencyMs}ms · ${rpcSource(c, rt.keys)}` };
}
