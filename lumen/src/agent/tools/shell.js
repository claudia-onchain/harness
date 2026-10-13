// bash tool: runs a command in the working directory with approval, a timeout and an output cap.
import { spawn } from "node:child_process";
import { obj, str, num } from "./registry.js";

export function runShell(command, { cwd, timeoutSec = 120, maxOutput = 30000, signal, onData } = {}) {
  return new Promise((resolve) => {
    const shell = process.platform === "win32" ? "cmd.exe" : process.env.SHELL?.endsWith("zsh") ? "/bin/zsh" : "/bin/bash";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command];
    const child = spawn(shell, args, { cwd, env: { ...process.env, LUMEN: "1", PAGER: "cat", GIT_PAGER: "cat" }, detached: process.platform !== "win32" });
    let out = "", truncated = false, killed = null;
    const add = (d) => {
      const s = String(d);
      onData?.(s);
      if (out.length < maxOutput) { out += s; if (out.length > maxOutput) { out = out.slice(0, maxOutput); truncated = true; } } else truncated = true;
    };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    const kill = (why) => { killed = why; try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* gone */ } } };
    const timer = setTimeout(() => kill("timeout"), timeoutSec * 1000);
    const onAbort = () => kill("aborted");
    signal?.addEventListener?.("abort", onAbort, { once: true });
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, output: `Failed to start: ${e.message}`, truncated: false }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      resolve({ code: killed ? -1 : code, output: out, truncated, killed });
    });
  });
}

export function shellTools() {
  return [{
    name: "bash", group: "Shell", label: "Run command", approval: "shell",
    description: "Run a shell command in the working directory. Asks the user first (unless --yes). Use for git, npm, tests, builds, scripts. Non-interactive only.",
    parameters: obj({ command: str("The command line"), timeout_sec: num("Timeout in seconds (default 120, max 900)") }, ["command"]),
    approvalTitle: (a) => String(a.command).slice(0, 80),
    preview: (a, ctx) => `$ ${a.command}\n(in ${ctx.cwd})`,
    async run(a, ctx) {
      const r = await runShell(String(a.command), { cwd: ctx.cwd, timeoutSec: Math.min(900, Number(a.timeout_sec) || ctx.config.shell?.timeoutSec || 120), maxOutput: ctx.config.shell?.maxOutput || 30000, signal: ctx.signal });
      const tail = r.killed ? `\n[${r.killed === "timeout" ? "timed out" : "stopped"}]` : `\n[exit ${r.code}]`;
      return { ok: r.code === 0, text: (r.output || "(no output)") + (r.truncated ? "\n[output truncated]" : "") + tail, summary: `exit ${r.killed || r.code} · ${String(a.command).slice(0, 60)}` };
    },
  }];
}
