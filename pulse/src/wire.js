// Lead wiring: metered Grok/Imagine clients, the routine runners, `pulse ask`, and the Telegram command handlers.
// Metering lives here, not in the routines, so a routine cannot forget to charge the budget or log a response.
import { createImagine } from "./grok/imagine.js";
import { runWatch } from "./routines/watch.js";
import { runBrief } from "./routines/brief.js";
import { ask, answerHtml } from "./routines/ask.js";
import { parseArgs, parseDuration, parseClock, parseList } from "./cli/args.js";
import { computeNextRun } from "./core/routines.js";
import { BudgetError } from "./core/budget.js";
import { escapeHtml as esc } from "./channels/telegram.js";

const ASK_ROUTINE = "_ask";

/** Wraps a Grok client and an Imagine client so every response is appended to the replay log and charged. */
export function metered(rt, { routineId, runId = null, runCapUsd = null } = {}) {
  const { store, budget } = rt;
  const record = (body, res) => {
    store.responses.append({ runId, model: res.model, request: body, response: res.raw, costTicks: res.usage?.costTicks ?? 0 });
    budget.meter(routineId, runId, res.usage, runCapUsd != null ? { runCapUsd } : undefined);
    return res;
  };
  const grok = rt.grok && {
    tools: rt.grok.tools, jsonSchema: rt.grok.jsonSchema,
    respond: async (body, opts) => record(body, await rt.grok.respond(body, opts)),
    stream: async (body, opts) => record(body, await rt.grok.stream(body, opts)),
  };
  const imagine = rt.imagine && {
    image: async (o) => record({ kind: "image", ...o }, await rt.imagine.image(o)),
    video: async (o) => record({ kind: "video", ...o }, await rt.imagine.video(o)),
  };
  return { grok, imagine };
}

/** Deliver to Telegram when it is configured; otherwise print, so `pulse run --once` is useful on its own. */
export async function deliver(rt, chatId, media, caption) {
  const to = chatId || rt.config.telegram?.chatId;
  if (rt.telegram && to) {
    if (media?.kind === "photo") return rt.telegram.sendPhoto(to, media.url, { caption });
    if (media?.kind === "video") return rt.telegram.sendVideo(to, media.url, { caption });
    return rt.telegram.sendMessage(to, caption);
  }
  rt.log.info("deliver.console", { chatId: to || null, media: media?.url || null });
  if (rt.print) rt.print(`${media ? `[${media.kind}] ${media.url}\n` : ""}${caption.replace(/<[^>]+>/g, "")}`);
}

function routineCtx(rt, routine, sctx) {
  const m = metered(rt, { routineId: routine.id, runId: sctx.run?.id, runCapUsd: routine.cap_usd_run ?? null });
  if (!m.grok) throw new Error("No xAI key: run `pulse keys set xai <key>`");
  return { ...sctx, grok: m.grok, imagine: m.imagine, store: rt.store, budget: rt.budget, log: sctx.log || rt.log, config: rt.config, send: (chatId, media, caption) => deliver(rt, chatId, media, caption) };
}

export function wire(rt) {
  const baseUrl = process.env.XAI_BASE_URL || undefined;
  rt.imagine = rt.grok && rt.keys.has("xai") ? createImagine({ apiKey: rt.keys.get("xai"), baseUrl }) : null;

  rt.runners.watch = (routine, sctx) => runWatch(routine, routineCtx(rt, routine, sctx));
  rt.runners.brief = (routine, sctx) => runBrief(routine, routineCtx(rt, routine, sctx));

  // One-off question: charged to the "_ask" routine; the day cap applies, the run cap is advisory (the answer is kept).
  rt.ask = async (question, { capUsd, model, handles } = {}) => {
    if (!rt.grok) throw new Error("No xAI key: run `pulse keys set xai <key>`");
    rt.budget.check(ASK_ROUTINE);
    // Questions get a run too, so `pulse why`-style replay and `pulse cost --routine _ask` work for them.
    // A hidden, disabled routine row (the store insists on a schedule; the scheduler never picks disabled rows).
    if (!rt.store.routines.get(ASK_ROUTINE)) rt.store.routines.insert({ id: ASK_ROUTINE, kind: "ask", name: "ask", enabled: false, everyMin: 525600, config: {} });
    const run = rt.store.runs.start({ routineId: ASK_ROUTINE });
    const { grok } = metered(rt, { routineId: ASK_ROUTINE, runId: run.id });
    try {
      const res = await ask(grok, question, { model: model || rt.config.model.judge, handles });
      if (capUsd != null && res.usage.costUsd > capUsd) res.overCap = { capUsd, costUsd: res.usage.costUsd };
      rt.store.runs.finish(run.id, { status: "ok", postsFetched: res.usage.tools?.xPostsFetched ?? 0, costTicks: res.usage.costTicks });
      res.runId = run.id;
      return res;
    } catch (e) {
      rt.store.runs.finish(run.id, { status: e instanceof BudgetError ? "budget_exceeded" : "error", error: e.message });
      throw e;
    }
  };

  rt.handlers = { onMessage: (m) => onMessage(rt, m), onCallback: () => {} };
  return rt;
}

// ── Telegram commands ──

const HELP = `<b>Pulse</b> — a Grok-native harness for things that move.
/watch add <i>name</i> --symbols SOL --keywords a,b --handles x,y --every 15m --cap 0.40
/watch list · /watch pause <i>id</i> · /watch resume <i>id</i> · /watch rm <i>id</i>
/brief add <i>name</i> --topics "a, b" --symbols BTC,SOL --at 07:30
/why <i>alertId</i> · /cost · /pause · /resume
Anything else is a question answered with live X + web search.`;

async function onMessage(rt, m) {
  const tg = rt.telegram;
  const reply = (html) => tg.sendMessage(m.chatId, html);
  try {
    switch (m.command) {
      case "start": case "help": return reply(HELP);
      case "watch": case "brief": return reply(routineCommand(rt, m.command, m.args, m.chatId));
      case "why": return reply(whyHtml(rt, m.args[0]));
      case "cost": return reply(costHtml(rt));
      case "pause": case "resume": {
        const on = m.command === "resume";
        const rows = rt.store.routines.list({}).filter((r) => r.kind === "watch" || r.kind === "brief");
        for (const r of rows) rt.store.routines.update(r.id, { enabled: on, ...(on ? { nextRunAt: computeNextRun(r, new Date()).toISOString() } : {}) });
        return reply(`${on ? "▶️ resumed" : "⏸ paused"} ${rows.length} routine${rows.length === 1 ? "" : "s"}`);
      }
      case null: case undefined: {
        if (!m.text?.trim()) return;
        if (!rt.grok) return reply("No xAI key yet — run <code>pulse keys set xai …</code> on the host.");
        const thinking = await tg.sendMessage(m.chatId, "🔎 asking Grok…");
        const res = await rt.ask(m.text, { capUsd: rt.config.caps.runUsd });
        const html = answerHtml(res);
        if (thinking?.message_id && tg.editText) await tg.editText(m.chatId, thinking.message_id, html).catch(() => reply(html));
        else await reply(html);
        return;
      }
      default: return reply(`Unknown command /${esc(m.command)}. ${HELP}`);
    }
  } catch (e) {
    const msg = e instanceof BudgetError ? `💸 budget cap hit (${e.scope}: $${e.spentUsd.toFixed(2)} of $${e.capUsd.toFixed(2)})` : `⚠️ ${e.message}`;
    rt.log.warn("telegram.command.error", { command: m.command, error: e.message });
    return reply(esc(msg));
  }
}

/** /watch and /brief subcommands; mirrors src/cli/commands/watch.js but answers in HTML. */
export function routineCommand(rt, kind, args, chatId) {
  const [sub = "list", ...rest] = args;
  const { store } = rt;
  const describe = (r) => `<code>${r.id}</code> ${esc(r.name)} ${r.enabled ? "on" : "paused"} · ${r.at_utc ? `daily ${r.at_utc} UTC` : `every ${r.every_min}m`}` +
    (r.kind === "watch" ? ` · ${esc([r.config.symbols?.join(" "), r.config.keywords?.join(", "), r.config.handles?.length ? "@" + r.config.handles.join(" @") : ""].filter(Boolean).join(" | "))}` : ` · ${esc((r.config.topics || []).join(", "))}`);
  if (sub === "list") {
    const rows = store.routines.list({ kind });
    return rows.length ? rows.map(describe).join("\n") : `no ${kind} routines yet`;
  }
  if (sub === "rm" || sub === "pause" || sub === "resume") {
    const r = store.routines.get(rest[0]);
    if (!r || r.kind !== kind) return `no ${kind} routine ${esc(rest[0] || "")}`;
    if (sub === "rm") { store.routines.remove(r.id); return `removed ${esc(r.name)}`; }
    const on = sub === "resume";
    store.routines.update(r.id, { enabled: on, ...(on ? { nextRunAt: computeNextRun(r, new Date()).toISOString() } : {}) });
    return `${on ? "▶️" : "⏸"} ${esc(r.name)}`;
  }
  if (sub === "add") {
    const { flags, pos } = parseArgs(rest);
    const name = pos.join(" ").trim();
    if (!name) return `Usage: /${kind} add name …`;
    const common = { kind, name, chatId, capUsdRun: flags.cap != null ? Number(flags.cap) : null };
    if (kind === "watch") {
      const every = parseDuration(flags.every ?? "15m");
      if (!every) return "bad --every (e.g. 15m, 1h)";
      const config = { symbols: parseList(flags.symbols), keywords: parseList(flags.keywords), handles: parseList(flags.handles), excludedHandles: parseList(flags.exclude), video: !!flags.video };
      if (!config.symbols.length && !config.keywords.length && !config.handles.length) return "give at least one of --symbols, --keywords, --handles";
      const r = store.routines.insert({ ...common, config, everyMin: every });
      return `👁 watching <b>${esc(r.name)}</b> every ${every}m — first scan on the next tick\n${describe(r)}`;
    }
    const at = parseClock(flags.at ?? "07:30");
    if (!at) return "bad --at (HH:MM UTC)";
    const config = { topics: parseList(flags.topics), symbols: parseList(flags.symbols), handles: parseList(flags.handles) };
    if (!config.topics.length) return "give --topics";
    const r = store.routines.insert({ ...common, config, atUtc: at, nextRunAt: computeNextRun({ at_utc: at }, new Date()).toISOString() });
    return `📰 brief <b>${esc(r.name)}</b> daily at ${at} UTC\n${describe(r)}`;
  }
  return `Usage: /${kind} add|list|pause|resume|rm`;
}

export function whyHtml(rt, id) {
  const a = id && rt.store.alerts.get(id);
  if (!a) return `no alert ${esc(id || "")}`;
  const posts = (a.posts || []).map((p) => `• <a href="${esc(p.url)}">${esc(p.handle ? "@" + p.handle : p.url)}</a> — ${esc(p.why || "")}`).join("\n");
  const run = a.run_id ? rt.store.runs.get(a.run_id) : null;
  const spent = run?.cost_ticks != null ? ` · $${(Number(run.cost_ticks) / 1e10).toFixed(4)}` : "";
  return `<b>${esc(a.headline)}</b> [${a.severity}]\n${esc(a.summary || "")}\n\n${posts || "no cited posts"}\n\n<i>${esc(a.created_at)}${spent}</i>`;
}

export function costHtml(rt) {
  const today = rt.store.costs.today();
  const days = rt.store.costs.byDay(7);
  const lines = days.map((d) => `<code>${d.day} $${d.usd.toFixed(4)}</code>`);
  return `<b>Spend</b> today $${today.usd.toFixed(4)} of $${rt.config.caps.dayUsd} cap\n${lines.join("\n")}`;
}
