// TUI entry: terminal setup, boot animation + health checklist, first-run setup, then the chat App.
import { detectTerm } from "./term.js";
import { createTheme } from "./theme.js";
import { Screen } from "./renderer.js";
import { KeyReader } from "./keys.js";
import { playBoot } from "./boot.js";
import { App } from "./app.js";
import { firstRunSetup } from "./setup.js";
import { bootChecks } from "../cli/checks.js";
import { VERSION } from "../version.js";
import { specString } from "../llm/catalog.js";
import { isTruthy } from "../core/util.js";

export async function runTui(rt, flags = {}) {
  process.env.LUMEN_TUI_ACTIVE = "1";
  const term = detectTerm({ noColor: flags.noColor, ascii: flags.ascii || rt.config.ui?.ascii });
  const th = createTheme(term);
  const screen = new Screen(process.stdout);
  const keys = new KeyReader(process.stdin);
  keys.start();
  const restore = () => { try { process.stdout.write("\x1b[?2004l\x1b[?25h\x1b[0m"); keys.stop(); } catch { /* exiting */ } };
  process.on("exit", restore);

  const checks = bootChecks(rt, { offline: flags.offline });
  let header;
  const wantBoot = !isTruthy(process.env.LUMEN_NO_BOOT) && rt.config.ui?.boot !== false && !flags.noBoot;
  if (wantBoot) {
    const r = await playBoot({ screen, th, keys, checks: checks.list, version: VERSION });
    header = r.lines;
  } else {
    header = ["", `  ${th.bold(th.gradient("◆ LUMEN"))} ${th.muted(`v${VERSION}`)}`];
  }
  header.push(`  ${th.muted("persona")} ${th.accent2(rt.persona.name)} ${th.muted("· model")} ${th.text(rt.model ? specString(rt.model) : "none")} ${th.muted(`· thinking ${rt.thinking} · chain ${rt.chain} · approvals ${rt.effectiveApproval()}`)}`);
  header.push(`  ${th.muted("/help commands · @ files · ! shell · Esc stop · Ctrl+C ×2 quit")}`);
  // The boot frame is the live region right now; forgetting it makes the first app frame commit the
  // header over it in place.
  screen.prev = [];
  const app = new App(rt, { th, screen, keys });
  const done = app.start(header);
  checks.updates.then((u) => {
    const out = (u || []).filter((x) => x.outdated);
    if (out.length) app.note(`Updates: ${out.map((x) => `${x.name} ${x.current} → ${x.latest}`).join(", ")} · run \`lumen update\` or /update`, "warn");
  }).catch(() => {});
  if (!rt.hasLlm()) setTimeout(() => firstRunSetup(app).catch((e) => app.note(`Setup failed: ${e.message}`, "warn")), 50);
  await done;
  process.off("exit", restore);
}
