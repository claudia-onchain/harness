// pulse run [--once <id>] | pulse serve | pulse ask "<question>". These need the full runtime (Grok, routines).
import { createRuntime } from "../../runtime.js";
import { say, fail, ok, warn, C, usd, kv } from "../out.js";
import { ticksToUsd } from "../../core/store.js";

function onSignal(fn) {
  let once = false;
  const h = () => { if (once) process.exit(130); once = true; say(C.dim("\nshutting down… (Ctrl-C again to force)")); fn(); };
  process.on("SIGINT", h); process.on("SIGTERM", h);
}

export async function runRun(args, flags) {
  const once = typeof flags.once === "string" ? flags.once : args[0];
  const rt = await createRuntime({ console: true, telegram: !once, http: !once });
  if (!Object.keys(rt.runners).length) warn("no routine runners registered yet (src/routines/* not wired in runtime.js); runs will fail fast");
  if (once) {
    const routine = rt.store.routines.get(once);
    if (!routine) { await rt.close(); return fail(`no routine ${once}`); }
    const run = await rt.scheduler.runNow(once);
    await rt.close();
    if (flags.json) return say(JSON.stringify(run, null, 2));
    kv([["run", run.id], ["routine", `${routine.name} (${routine.id})`], ["status", run.status === "ok" ? C.green(run.status) : C.red(run.status)], ["cost", usd(ticksToUsd(run.cost_ticks))], ["posts", run.posts_fetched], ["error", run.error]]);
    if (run.status !== "ok") process.exitCode = 1;
    return;
  }
  rt.approvals.start();
  rt.scheduler.start();
  const bits = [`scheduler (${rt.store.routines.list({ enabledOnly: true }).length} routines)`];
  if (rt.telegram) { rt.telegram.start(); bits.push("telegram"); } else warn("no telegram token: alerts are stored only (pulse keys set telegram <token>)");
  if (rt.http) { try { await rt.http.start(); bits.push(`http :${rt.http.port}`); } catch (e) { warn(`http: ${e.message}`); } }
  if (!rt.grok) warn("no Grok client (missing XAI key or src/grok): routines that call Grok will fail");
  ok(`pulse running: ${bits.join(", ")}  ${C.dim("Ctrl-C to stop")}`);
  await new Promise((resolve) => onSignal(() => rt.close().then(resolve, resolve)));
}

export async function runServe(args, flags) {
  const rt = await createRuntime({ console: true, telegram: false, grok: false });
  if (!rt.http) return fail("http disabled");
  const port = await rt.http.start();
  ok(`http on ${rt.http.host}:${port}  ${C.dim("GET /health /alerts /routines, POST /run/:id (Bearer token)")}`);
  if (flags["with-scheduler"]) rt.scheduler.start();
  await new Promise((resolve) => onSignal(() => rt.close().then(resolve, resolve)));
}

export async function runAsk(args, flags) {
  const q = args.join(" ").trim();
  if (!q) return fail('Usage: pulse ask "what is crypto twitter saying about $HYPE today?"');
  const rt = await createRuntime({ console: !!flags.verbose, telegram: false, http: false });
  try {
    if (typeof rt.ask !== "function") return fail("ask is not wired yet (src/routines/ask.js registers rt.ask in runtime.js)");
    const res = await rt.ask(q, { capUsd: flags.cap != null ? Number(flags.cap) : rt.config.caps.runUsd, model: flags.model });
    if (flags.json) return say(JSON.stringify(res, null, 2));
    say(res?.text ?? String(res));
    if (res?.citations?.length) { say(""); for (const c of res.citations) say(C.dim(`  ${c.url || c}`)); }
    if (res?.usage) say(C.dim(`\ncost ${usd(res.usage.costUsd ?? ticksToUsd(res.usage.costTicks))}`));
  } finally { await rt.close(); }
}
