// `lumen -p "prompt"`: one non-interactive turn. Text streams to stdout; tool activity goes to stderr.
// --json writes every runtime event as one JSON line to stdout instead.
import { createRuntime } from "../../agent/runtime.js";
import { theme, err, attachTerminalApprovals } from "../out.js";
import { argsLine } from "../../tui/components.js";

export async function runPrint(prompt, flags) {
  const rt = await createRuntime({ cwd: process.cwd(), flags: { model: flags.model, persona: flags.persona, chain: flags.chain, yes: flags.yes } });
  const T = theme(flags);
  if (!rt.hasLlm()) {
    err(`${T.bad(T.sym.cross)} No LLM configured. Add a key (lumen keys set anthropic <key>), start Ollama, or use --model mock:echo.`);
    process.exitCode = 2;
    return;
  }
  const detach = attachTerminalApprovals(rt.approvals, { yes: !!flags.yes });
  const json = !!flags.json;
  const toolsToStderr = process.stderr.isTTY && !json;
  let lastWasText = false, failed = false;
  rt.on("event", (ev) => {
    if (json) { if (ev.type !== "approval_request") process.stdout.write(JSON.stringify(ev) + "\n"); if (ev.type === "error") failed = true; return; }
    if (ev.type === "delta") { process.stdout.write(ev.text); lastWasText = true; }
    else if (ev.type === "assistant_done" && lastWasText) { process.stdout.write("\n"); lastWasText = false; }
    else if (ev.type === "tool_start" && toolsToStderr) err(T.muted(`  ${T.sym.tool} ${ev.label} ${argsLine(ev.args)}`.slice(0, 160)));
    else if (ev.type === "tool_end" && toolsToStderr) err(`  ${ev.ok ? T.ok(T.sym.check) : T.bad(T.sym.cross)} ${T.muted(String(ev.summary || "").slice(0, 140))}`);
    else if (ev.type === "notice" && toolsToStderr) err(T.muted(`  ${T.sym.dot} ${ev.text}`));
    else if (ev.type === "error") { failed = true; err(`${T.bad(T.sym.cross)} ${ev.message}`); }
  });
  const onSig = () => rt.abort();
  process.on("SIGINT", onSig);
  const res = await rt.send(prompt, { source: "cli" });
  process.off("SIGINT", onSig);
  detach();
  if (lastWasText) process.stdout.write("\n");
  if (!res?.ok || failed) process.exitCode = 1;
}
