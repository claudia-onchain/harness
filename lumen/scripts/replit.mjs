// Replit entry (`npm run replit`): build the dashboard once if needed, then serve it in hosted mode on 0.0.0.0.
// Keys come from Replit Secrets (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, ...). Set LUMEN_DASHBOARD_TOKEN as a
// Secret for a fixed access token; otherwise one is generated once and printed in the console.
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, LUMEN_HOSTED: "1", LUMEN_NO_BOOT: "1" };
env.LUMEN_HOME ||= join(root, ".lumen");

if (!existsSync(join(root, "dashboard", "dist", "index.html"))) {
  console.log("◆ Building the dashboard (first run)…");
  const b = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit", env });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const child = spawn(process.execPath, [join(root, "bin", "lumen.js"), "serve", ...process.argv.slice(2)], { cwd: root, stdio: "inherit", env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 0));
