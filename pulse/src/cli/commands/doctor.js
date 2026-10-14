// pulse init: create the home, defaults and keys, then ping api.x.ai with the key (skipped with --offline).
// pulse doctor: everything a bug report needs, without touching the network.
import { existsSync, statSync } from "node:fs";
import { ensureHome, getConfig, getKeys, updateConfig, writeJson, P, KEY_FIELDS } from "../../core/config.js";
import { openStore } from "../../core/store.js";
import { say, ok, fail, warn, heading, kv, C, SYM } from "../out.js";
import { VERSION } from "../../version.js";

export const MIN_NODE = [22, 13];
export function nodeOk(v = process.versions.node) {
  const [maj, min] = v.split(".").map(Number);
  return maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
}

const mode = (p) => { try { return (statSync(p).mode & 0o777).toString(8); } catch { return null; } };

/** GET /v1/models with the key; true when the key is accepted. No Grok client involved. */
export async function pingXai(key, { fetch: f = globalThis.fetch, base = "https://api.x.ai/v1", timeoutMs = 10_000 } = {}) {
  const res = await f(`${base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, why: "key rejected" };
  if (!res.ok) return { ok: false, status: res.status, why: `HTTP ${res.status}` };
  let n = 0; try { n = (await res.json()).data?.length ?? 0; } catch { /* fine */ }
  return { ok: true, status: res.status, models: n };
}

export async function runInit(args, flags) {
  const home = ensureHome();
  const cfg = getConfig();
  const patch = {};
  if (flags.chat) patch.telegram = { chatId: String(flags.chat) };
  if (flags.port) patch.http = { port: Number(flags.port) };
  if (Object.keys(patch).length) updateConfig(patch);
  if (!existsSync(P.config)) updateConfig({}); // materialise config.json so people can find and edit it
  const keys = getKeys();
  if (!existsSync(P.keys)) writeJson(P.keys, {}, { mode: 0o600 }); // exists with the right mode before any secret lands
  if (flags.xai) keys.set("xai", flags.xai);
  if (flags.telegram) keys.set("telegram", flags.telegram);
  const store = openStore(P.db); store.close();
  heading(`pulse ${VERSION} · init`);
  kv([["home", home], ["config", P.config], ["keys", `${P.keys} ${C.dim(`(mode ${mode(P.keys) || "—"})`)}`], ["db", P.db], ["models", `${cfg.model.scan} → ${cfg.model.judge}`], ["caps", `$${cfg.caps.runUsd}/run · $${cfg.caps.dayUsd}/day`]]);
  const xai = keys.get("xai");
  if (!xai) warn(`no Grok key yet: pulse keys set xai <key>  ${C.dim("(or export XAI_API_KEY)")}`);
  else if (flags.offline) say(`${C.dim(SYM.dot)} xai key present (live check skipped)`);
  else {
    try { const r = await pingXai(xai); r.ok ? ok(`xai key accepted (${r.models} models visible)`) : fail(`xai key check failed: ${r.why}`); }
    catch (e) { warn(`xai key check could not reach api.x.ai: ${e.message}`); }
  }
  if (!keys.get("telegram")) warn(`no Telegram token: pulse keys set telegram <token>  ${C.dim("(alerts need it)")}`);
  if (!cfg.telegram.chatId && !flags.chat) say(C.dim(`${SYM.dot} tip: pulse init --chat <yourChatId> sets the default chat for alerts and locks the bot to it`));
  ok("ready. Next: pulse watch add \"SOL\" --symbols SOL --keywords solana --every 15m");
}

export async function runDoctor(args, flags) {
  const rows = [];
  const check = (label, good, detail, { soft = false } = {}) => rows.push({ label, good, detail, soft });
  check("node", nodeOk(), `${process.versions.node} ${C.dim(`(need ≥ ${MIN_NODE.join(".")})`)}`);
  const homeExists = existsSync(P.home);
  check("home", homeExists, `${P.home}${homeExists ? C.dim(` mode ${mode(P.home)}`) : C.dim(" (run pulse init)")}`);
  let cfg = null;
  try { cfg = getConfig(); check("config", true, `${existsSync(P.config) ? P.config : C.dim("defaults (no config.json yet)")}`); } catch (e) { check("config", false, e.message); }
  const keys = getKeys();
  for (const [id, f] of Object.entries(KEY_FIELDS)) {
    const row = keys.list().find((k) => k.id === id);
    check(`key ${id}`, !!row?.set, row?.set ? `${row.masked} ${C.dim(`via ${row.source === "env" ? f.env : "keys.json"}`)}` : C.dim(`not set — pulse keys set ${id} <value>`), { soft: id !== "xai" });
  }
  const km = mode(P.keys);
  if (km) check("keys.json mode", km === "600", km, { soft: true });
  try {
    const s = openStore(P.db);
    const st = s.stats();
    const stale = s.runs.list({ limit: 200 }).filter((r) => r.status === "running").length;
    s.close();
    check("db", true, `${P.db} ${C.dim(Object.entries(st).map(([k, v]) => `${k}=${v}`).join(" "))}${stale ? C.yellow(` ${stale} run(s) look stuck`) : ""}`);
  } catch (e) { check("db", false, e.message); }
  check("telegram", !!keys.get("telegram"), keys.get("telegram") ? `token set${cfg?.telegram.chatId ? `, chat ${cfg.telegram.chatId}` : C.yellow(" (no telegram.chatId: bot answers any chat; set one with pulse init --chat <id>)")}` : C.dim("no token"), { soft: true });
  check("http", true, `127.0.0.1:${cfg?.http.port ?? 4800}${keys.get("http") ? "" : C.dim(" (POST /run/:id disabled until a token is set)")}`);
  check("grok client", existsSync(new URL("../../grok/responses.js", import.meta.url)), C.dim("src/grok/responses.js"), { soft: true });
  if (flags.json) return say(JSON.stringify(rows.map(({ label, good, soft }) => ({ check: label, ok: good, soft })), null, 2));
  heading(`pulse ${VERSION} · doctor`);
  for (const r of rows) say(`  ${r.good ? C.green(SYM.ok) : r.soft ? C.yellow(SYM.warn) : C.red(SYM.bad)} ${r.label.padEnd(16)} ${r.detail}`);
  const hard = rows.filter((r) => !r.good && !r.soft);
  if (hard.length) { process.exitCode = 1; say(C.red(`\n${hard.length} problem(s)`)); } else say(C.dim("\nall good"));
}
