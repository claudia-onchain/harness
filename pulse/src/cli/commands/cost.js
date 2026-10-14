// pulse cost [--today | --routine <id> | --days <n>] and pulse why <alertId>: both read straight from SQLite.
import { getConfig, P } from "../../core/config.js";
import { openStore, ticksToUsd, dayOf } from "../../core/store.js";
import { say, fail, heading, table, kv, C, usd, when } from "../out.js";

const withStore = (fn) => { const store = openStore(P.db); try { return fn(store); } finally { store.close(); } };

export async function runCost(args, flags) {
  const cfg = getConfig();
  return withStore((s) => {
    const names = new Map(s.routines.list().map((r) => [r.id, r.name]));
    const name = (id) => (id === "_" ? C.dim("(unattributed)") : names.get(id) ? `${names.get(id)} ${C.dim(id)}` : id);
    if (flags.routine) {
      const id = String(flags.routine);
      const days = s.costs.byDay(Number(flags.days) || 7).map((d) => ({ day: d.day, ticks: d.byRoutine.find((r) => r.routine_id === id)?.ticks || 0 })).filter((d) => d.ticks);
      if (flags.json) return say(JSON.stringify({ routine: id, today: s.costs.today(id), days }, null, 2));
      heading(`cost · ${name(id)}`, `today ${usd(s.costs.today(id).usd)}`);
      table(days.map((d) => [d.day, usd(ticksToUsd(d.ticks)), d.ticks]), ["day", "usd", "ticks"]);
      return;
    }
    if (flags.days) {
      const days = s.costs.byDay(Number(flags.days) || 7);
      if (flags.json) return say(JSON.stringify(days, null, 2));
      heading(`cost · last ${flags.days} days`, `total ${usd(days.reduce((a, d) => a + d.usd, 0))}`);
      table(days.map((d) => [d.day, usd(d.usd), d.byRoutine.map((r) => `${names.get(r.routine_id) || r.routine_id} ${usd(r.usd, 3)}`).join(", ")]), ["day", "usd", "by routine"], { maxCol: 80 });
      return;
    }
    const day = dayOf();
    const total = s.costs.today();
    const rows = s.costs.byRoutine(day);
    if (flags.json) return say(JSON.stringify({ day, total, byRoutine: rows, capUsd: cfg.caps.dayUsd }, null, 2));
    heading(`cost · ${day}`, `${usd(total.usd)} of ${usd(cfg.caps.dayUsd, 2)} daily cap (${total.ticks} ticks)`);
    if (!rows.length) return say(C.dim("  nothing spent today"));
    table(rows.map((r) => [name(r.routine_id), usd(r.usd), r.ticks]), ["routine", "usd", "ticks"]);
  });
}

/** Best-effort dig into whatever shape the stored judge response has: {json}, {text}, Responses `output[]`. */
export function judgeView(resp) {
  const r = resp?.response;
  if (!r) return null;
  // A raw Responses object echoes the request's `text` setting as an object, so only trust string fields as text.
  const outText = Array.isArray(r.output) ? r.output.flatMap((o) => o.content || []).filter((c) => c.type === "output_text" || typeof c.text === "string").map((c) => c.text).filter(Boolean).join("\n") : null;
  const text = typeof r.text === "string" ? r.text : typeof r.output_text === "string" ? r.output_text : outText || null;
  const json = r.json ?? r.parsed ?? (text ? tryJson(text) : null);
  const reasoning = r.reasoning?.summary ?? r.reasoning ?? (Array.isArray(r.output) ? r.output.filter((o) => o.type === "reasoning").flatMap((o) => o.summary || []).map((x) => x.text || x).join("\n") : null);
  return { json, text, reasoning: typeof reasoning === "string" ? reasoning : reasoning ? JSON.stringify(reasoning) : null };
}
const tryJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

export async function runWhy(args, flags) {
  const id = args[0];
  if (!id) return fail("Usage: pulse why <alertId>");
  const cfg = getConfig();
  return withStore((s) => {
    const a = s.alerts.get(id);
    if (!a) return fail(`no alert ${id}`);
    const run = a.run_id ? s.runs.get(a.run_id) : null;
    const rt = s.routines.get(a.routine_id);
    const responses = a.run_id ? s.responses.byRun(a.run_id) : [];
    const judge = responses.filter((r) => r.model === cfg.model.judge || (rt?.config?.model && r.model === rt.config.model)).at(-1) || responses.at(-1) || null;
    if (flags.json) return say(JSON.stringify({ alert: a, run, routine: rt, responses: responses.map((r) => ({ id: r.id, model: r.model, cost_ticks: r.cost_ticks, created_at: r.created_at })), judge: judge ? { id: judge.id, model: judge.model, ...judgeView(judge) } : null }, null, 2));
    const sev = { high: C.red, medium: C.yellow, low: C.green }[a.severity] || ((x) => x);
    heading(`${sev(a.severity.toUpperCase())} ${a.headline}`, a.id);
    kv([
      ["routine", rt ? `${rt.name} ${C.dim(rt.id)}` : a.routine_id],
      ["when", when(a.created_at)],
      ["sent", a.sent_at ? `${when(a.sent_at)} → chat ${a.chat_id}` : C.dim("not sent")],
      ["sentiment", a.sentiment == null ? null : (a.sentiment > 0 ? "+" : "") + Number(a.sentiment).toFixed(2)],
      ["velocity", a.velocity == null ? null : Number(a.velocity).toFixed(2)],
      ["run", run ? `${run.id} ${run.status} ${usd(ticksToUsd(run.cost_ticks))} ${C.dim(`${responses.length} responses`)}` : null],
      ["media", a.media_url],
    ]);
    if (a.summary) say(`\n${a.summary}`);
    if (a.posts?.length) {
      say(`\n${C.bold("posts")}`);
      for (const p of a.posts) say(`  ${C.cyan(p.url || p)}${p.handle ? ` ${C.dim("@" + p.handle)}` : ""}${p.why ? `\n    ${C.dim(p.why)}` : ""}`);
    }
    if (judge) {
      const v = judgeView(judge);
      say(`\n${C.bold("judge")} ${C.dim(`${judge.model} · ${judge.id} · ${usd(ticksToUsd(judge.cost_ticks))}`)}`);
      if (v?.reasoning) say(`  ${C.dim("reasoning:")} ${v.reasoning}`);
      const summary = v?.json?.summary ?? v?.json?.reason ?? v?.json?.why;
      if (summary) say(`  ${C.dim("summary:")} ${summary}`);
      else if (v?.text && !v.json) say(`  ${v.text.slice(0, 1500)}`);
      if (v?.json && flags.verbose) say(C.dim(JSON.stringify(v.json, null, 2)));
    } else say(C.dim("\nno stored judge response for this alert (was it created outside a run?)"));
    if (responses.length) {
      say(`\n${C.bold("replay")}`);
      table(responses.map((r) => [r.id, r.model || "—", usd(ticksToUsd(r.cost_ticks)), when(r.created_at)]), ["response", "model", "cost", "at"]);
    }
  });
}
