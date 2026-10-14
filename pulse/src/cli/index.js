// Command dispatch for `pulse`. Commands live in ./commands/*.js and are imported lazily so `--help`
// and `--version` never touch SQLite or the home directory.
import { parseArgs } from "./args.js";
import { fail, say, C } from "./out.js";
import { VERSION } from "../version.js";

export const HELP = `pulse ${VERSION} — a Grok-native harness for things that move

Usage: pulse <command> [options]

  init                                   create ~/.pulse, config.json and keys.json; checks the Grok key
  keys [list | set <id> <value> | rm <id>]   ids: xai, telegram, http (env: XAI_API_KEY, TELEGRAM_BOT_TOKEN, PULSE_HTTP_TOKEN)
  watch add <name> --handles a,b --keywords x,y --symbols SOL --every 15m --cap 0.40 --chat <id> [--video]
  watch list | rm <id> | pause <id> | resume <id>
  brief add <name> --topics "a, b" --at 07:30 --chat <id> | brief list | rm <id>
  run [--once <routineId>]               scheduler + Telegram bot + HTTP, foreground (or one routine, once)
  ask "<question>"                       one-off question with live X + web search, budget-capped
  why <alertId>                          the posts, scores and judge reasoning behind an alert
  cost [--today | --routine <id> | --days <n>]   exact spend from xAI cost ticks
  serve                                  HTTP only (health, alerts, routines, POST /run/:id)
  doctor                                 home, keys, database, node version, telegram
  --help, --version, --json, --no-color

Config: ${C.dim("~/.pulse/config.json")} (PULSE_HOME overrides). Logs: ${C.dim("~/.pulse/logs/pulse.log")}.`;

export async function main(argv = process.argv.slice(2)) {
  const { flags, pos } = parseArgs(argv);
  if (flags["no-color"]) process.env.NO_COLOR = "1";
  if (flags.version) { say(`pulse ${VERSION}`); return; }
  const [cmd, ...rest] = pos;
  if (flags.help || cmd === "help" || cmd === undefined) { say(HELP); return; }
  const lazy = async (file, fn, ...a) => (await import(`./commands/${file}.js`))[fn](...a);
  switch (cmd) {
    case "init": return lazy("doctor", "runInit", rest, flags);
    case "doctor": return lazy("doctor", "runDoctor", rest, flags);
    case "keys": case "key": return lazy("keys", "runKeys", rest, flags);
    case "watch": return lazy("watch", "runWatch", rest, flags);
    case "brief": return lazy("watch", "runBrief", rest, flags);
    case "run": return lazy("run", "runRun", rest, flags);
    case "serve": return lazy("run", "runServe", rest, flags);
    case "ask": return lazy("run", "runAsk", rest, flags);
    case "cost": return lazy("cost", "runCost", rest, flags);
    case "why": return lazy("cost", "runWhy", rest, flags);
    default: return fail(`Unknown command "${cmd}". Run pulse --help.`);
  }
}

export function onFatal(e) {
  process.stderr.write(`${C.red("✗")} ${e?.message || e}\n`);
  if (process.env.PULSE_DEBUG) process.stderr.write(String(e?.stack || "") + "\n");
  process.exitCode = 1;
}
