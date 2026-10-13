// Command dispatch for `lumen`.
import { parseArgs } from "./args.js";
import { theme, fail } from "./out.js";
import { printHelp } from "./help.js";
import { VERSION } from "../version.js";
import { log } from "../core/log.js";

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(argv = process.argv.slice(2)) {
  const { flags, pos } = parseArgs(argv);
  if (flags["no-color"]) process.env.NO_COLOR = "1";
  if (flags.ascii) process.env.LUMEN_ASCII = "1";
  theme(flags);
  if (flags.version) { process.stdout.write(`lumen ${VERSION}\n`); return; }
  if (flags.help || pos[0] === "help") return printHelp();
  if (typeof flags.print === "string" || flags.print === true) {
    const prompt = typeof flags.print === "string" ? [flags.print, ...pos].join(" ") : pos.join(" ") || (!process.stdin.isTTY ? await readStdin() : "");
    if (!prompt.trim()) return fail('Usage: lumen -p "your prompt"');
    const { runPrint } = await import("./commands/print.js");
    return runPrint(prompt, flags);
  }
  const [cmd, ...rest] = pos;
  const lazy = async (file, fn, ...a) => (await import(`./commands/${file}.js`))[fn](...a);
  switch (cmd) {
    case undefined: {
      if (!process.stdin.isTTY) {
        const prompt = await readStdin();
        if (!prompt.trim()) return printHelp();
        return lazy("print", "runPrint", prompt, flags);
      }
      if (!process.stdout.isTTY) return printHelp();
      const { createRuntime } = await import("../agent/runtime.js");
      const { runTui } = await import("../tui/index.js");
      const rt = await createRuntime({ cwd: process.cwd(), flags: { model: flags.model, persona: flags.persona, chain: flags.chain, yes: flags.yes, offline: flags.offline } });
      await runTui(rt, { noColor: !!flags["no-color"], ascii: !!flags.ascii, offline: !!flags.offline, noBoot: !!flags["no-boot"] });
      if (rt.server) await rt.server.close();
      process.exit(0);
    }
    case "doctor": return lazy("doctor", "runDoctor", flags);
    case "keys": case "key": return lazy("keys", "runKeys", rest, flags);
    case "chains": return lazy("chains", "runChains", rest, flags);
    case "chain": return lazy("chains", "runChain", rest, flags);
    case "price": return lazy("chains", "runPrice", rest, flags);
    case "balance": case "bal": return lazy("chains", "runBalance", rest, flags);
    case "tx": return lazy("chains", "runTx", rest, flags);
    case "gen": case "generate": return lazy("studio", "runGen", rest, flags);
    case "show": return lazy("studio", "runShow", rest, flags);
    case "windows": return lazy("studio", "runWindows", rest, flags);
    case "dashboard": return lazy("misc", "runServe", rest, flags, { open: true });
    case "serve": return lazy("misc", "runServe", rest, flags, { open: false });
    case "skills": case "skill": return lazy("misc", "runSkills", rest, flags);
    case "personas": case "persona": return lazy("misc", "runPersonas", rest, flags);
    case "plugins": return lazy("misc", "runPlugins", rest, flags);
    case "update": return lazy("misc", "runUpdate", rest, flags);
    default:
      return fail(`Unknown command "${cmd}". Run lumen --help. (To ask something: lumen -p "${[cmd, ...rest].join(" ")}")`);
  }
}

export function onFatal(e) {
  log.error("fatal", e);
  const T = theme();
  process.stderr.write(`\x1b[?25h${T.bad(T.sym.cross)} ${e?.message || e}\n`);
  if (process.env.LUMEN_DEBUG) process.stderr.write(String(e?.stack || "") + "\n");
  process.exitCode = 1;
}
