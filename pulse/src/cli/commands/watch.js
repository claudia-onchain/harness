// pulse watch add|list|rm|pause|resume and pulse brief add|list|rm. Routines are rows in the store; the
// scheduler (pulse run) picks them up on its next tick, so these commands never need Grok or Telegram.
import { getConfig, P } from "../../core/config.js";
import { openStore } from "../../core/store.js";
import { computeNextRun } from "../../core/routines.js";
import { parseDuration, parseClock, parseList } from "../args.js";
import { say, fail, ok, table, kv, C, usd, when } from "../out.js";

const withStore = (fn) => { const store = openStore(P.db); try { return fn(store); } finally { store.close(); } };

function describe(rt) {
  const sched = rt.at_utc ? `daily ${rt.at_utc} UTC` : `every ${rt.every_min}m`;
  const what = rt.kind === "watch"
    ? [rt.config.handles?.length ? "@" + rt.config.handles.join(" @") : "", rt.config.keywords?.join(", "), rt.config.symbols?.join(" ")].filter(Boolean).join(" | ")
    : (rt.config.topics || []).join(", ");
  return { sched, what };
}

function listRoutines(kind, flags) {
  const rows = withStore((s) => s.routines.list({ kind }));
  if (flags.json) return say(JSON.stringify(rows, null, 2));
  if (!rows.length) return say(C.dim(`no ${kind} routines yet — pulse ${kind} add <name> …`));
  table(rows.map((r) => { const d = describe(r); return [r.id, r.name, r.enabled ? C.green("on") : C.yellow("paused"), d.sched, d.what, r.chat_id || "—", r.cap_usd_run != null ? usd(r.cap_usd_run, 2) : "—", when(r.next_run_at)]; }),
    ["id", "name", "state", "schedule", "what", "chat", "cap/run", "next run (UTC)"]);
}

function removeRoutine(kind, id) {
  if (!id) return fail(`Usage: pulse ${kind} rm <id>`);
  const gone = withStore((s) => { const r = s.routines.get(id); return r && r.kind === kind ? s.routines.remove(id) : false; });
  return gone ? ok(`${id} removed`) : fail(`no ${kind} routine ${id}`);
}

function toggle(kind, id, enabled) {
  if (!id) return fail(`Usage: pulse ${kind} ${enabled ? "resume" : "pause"} <id>`);
  const r = withStore((s) => {
    const cur = s.routines.get(id);
    if (!cur || cur.kind !== kind) return null;
    const next = enabled ? computeNextRun(cur, new Date()) : null;
    return s.routines.update(id, { enabled, ...(enabled ? { nextRunAt: next.toISOString() } : {}) });
  });
  return r ? ok(`${id} ${enabled ? "resumed" : "paused"}`) : fail(`no ${kind} routine ${id}`);
}

export async function runWatch(args, flags) {
  const [sub = "list", ...rest] = args;
  switch (sub) {
    case "list": case "ls": return listRoutines("watch", flags);
    case "rm": case "remove": return removeRoutine("watch", rest[0]);
    case "pause": return toggle("watch", rest[0], false);
    case "resume": return toggle("watch", rest[0], true);
    case "add": {
      const name = rest.join(" ").trim();
      if (!name) return fail('Usage: pulse watch add "<name>" --handles a,b --keywords x,y --symbols SOL --every 15m --cap 0.40 --chat <id>');
      const handles = parseList(flags.handles).map((h) => h.replace(/^@/, ""));
      const keywords = parseList(flags.keywords);
      const symbols = parseList(flags.symbols).map((s) => s.replace(/^\$/, "").toUpperCase());
      if (!handles.length && !keywords.length && !symbols.length) return fail("give at least one of --handles, --keywords, --symbols");
      if (handles.length > 20) return fail("x_search allows at most 20 handles per routine");
      const everyMin = parseDuration(flags.every ?? "15m");
      if (!everyMin) return fail(`bad --every "${flags.every}" (e.g. 15m, 1h)`);
      if (everyMin < 1) return fail("--every must be at least 1m");
      const cfg = getConfig();
      const chatId = flags.chat ?? cfg.telegram.chatId ?? null;
      if (!chatId) fail("no --chat and no telegram.chatId in config: alerts will be stored but not sent (set one later with --chat or config.json)", 0);
      const capUsdRun = flags.cap != null ? Number(flags.cap) : cfg.caps.runUsd;
      const capUsdDay = flags["day-cap"] != null ? Number(flags["day-cap"]) : null;
      if (!(capUsdRun > 0)) return fail(`bad --cap "${flags.cap}"`);
      const config = { handles, keywords, symbols, video: !!flags.video, hd: !!flags.hd, ...(flags.model ? { model: flags.model } : {}), ...(flags.effort ? { effort: flags.effort } : {}) };
      const rt = withStore((s) => s.routines.insert({ kind: "watch", name, config, everyMin, chatId, capUsdRun, capUsdDay, nextRunAt: new Date().toISOString() }));
      ok(`watch ${C.bold(rt.id)} "${rt.name}" every ${everyMin}m, cap ${usd(capUsdRun, 2)}/run${chatId ? `, chat ${chatId}` : ""}`);
      say(C.dim("  runs on the next tick of `pulse run`, or now with `pulse run --once " + rt.id + "`"));
      return;
    }
    default: return fail(`Unknown watch subcommand "${sub}" (add | list | rm | pause | resume)`);
  }
}

export async function runBrief(args, flags) {
  const [sub = "list", ...rest] = args;
  switch (sub) {
    case "list": case "ls": return listRoutines("brief", flags);
    case "rm": case "remove": return removeRoutine("brief", rest[0]);
    case "pause": return toggle("brief", rest[0], false);
    case "resume": return toggle("brief", rest[0], true);
    case "show": {
      const r = withStore((s) => s.routines.get(rest[0]));
      if (!r) return fail(`no routine ${rest[0]}`);
      return flags.json ? say(JSON.stringify(r, null, 2)) : kv(Object.entries(r).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]));
    }
    case "add": {
      const name = rest.join(" ").trim();
      if (!name) return fail('Usage: pulse brief add "<name>" --topics "a, b" --at 07:30 --chat <id>');
      const topics = parseList(flags.topics);
      if (!topics.length) return fail("give --topics \"a, b\"");
      const atUtc = parseClock(flags.at ?? "07:30");
      if (!atUtc) return fail(`bad --at "${flags.at}" (want HH:MM, UTC)`);
      const cfg = getConfig();
      const chatId = flags.chat ?? cfg.telegram.chatId ?? null;
      const capUsdRun = flags.cap != null ? Number(flags.cap) : Math.max(cfg.caps.runUsd, 0.5); // briefs read more than a scan
      const config = { topics, symbols: parseList(flags.symbols).map((s) => s.toUpperCase()), image: flags["no-image"] ? false : true, ...(flags.model ? { model: flags.model } : {}) };
      const next = computeNextRun({ at_utc: atUtc }, new Date());
      const rt = withStore((s) => s.routines.insert({ kind: "brief", name, config, atUtc, chatId, capUsdRun, nextRunAt: next.toISOString() }));
      ok(`brief ${C.bold(rt.id)} "${rt.name}" daily at ${atUtc} UTC (next ${when(next.toISOString())}), cap ${usd(capUsdRun, 2)}/run${chatId ? `, chat ${chatId}` : ""}`);
      return;
    }
    default: return fail(`Unknown brief subcommand "${sub}" (add | list | rm | pause | resume)`);
  }
}
