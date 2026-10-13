// The help screen.
import { theme, say } from "./out.js";
import { VERSION } from "../version.js";
import { MARK } from "../tui/boot.js";
import { truncate } from "../tui/ansi.js";

/** The 5-row wordmark folded into 3 lines with half blocks (▀ ▄ █), 2 columns per pixel. */
export function halfBlockMark(T) {
  const at = (r, x) => (MARK[r]?.[x] === "#");
  const lines = [];
  for (let r = 0; r < 5; r += 2) {
    let l = "";
    for (let x = 0; x < MARK[0].length; x++) {
      const top = at(r, x), bot = at(r + 1, x);
      l += T.term.unicode ? (top && bot ? "██" : top ? "▀▀" : bot ? "▄▄" : "  ") : (top || bot ? "##" : "  ");
    }
    lines.push(T.gradient(l));
  }
  return lines;
}

export function printHelp() {
  const T = theme();
  const cols = process.stdout.columns || 100;
  if (cols >= 64 && T.level >= 2) {
    say("");
    for (const l of halfBlockMark(T)) say("  " + l);
  } else say(`  ${T.bold(T.gradient("◆ LUMEN"))}`);
  say(`  ${T.muted(`v${VERSION} · bring-your-own-keys agent for code, chains, media and your screen`)}`);
  say("");
  const sec = (t) => say(`  ${T.bold(T.accent(t))}`);
  const W = Math.min(46, Math.max(30, cols - 50));
  const fitD = (d) => (process.stdout.isTTY ? truncate(d, Math.max(10, cols - W - 6)) : d);
  const row = (c, d0) => { const d = fitD(d0); return c.length + 2 > W ? (say(`    ${T.accent2(c)}`), say(`    ${" ".repeat(W)}${T.muted(d)}`)) : say(`    ${T.accent2(c.padEnd(W))}${T.muted(d)}`); };
  sec("Chat");
  row("lumen", "interactive chat (boot, health check, setup on first run)");
  row('lumen -p "prompt" [--json]', "one answer to stdout (--json: event stream)");
  row("echo prompt | lumen", "same, reading the prompt from stdin");
  say("");
  sec("Setup");
  row("lumen keys [list]", "show keys (masked) for every provider");
  row("lumen keys set <field> <value>", "store a key in ~/.lumen/keys.json (0600)");
  row("lumen keys unset|test <field|provider>", "remove a key / live-test a provider");
  row("lumen keys import <.env> | lock | unlock", "import env file / passphrase-encrypt keys");
  row("lumen doctor [--offline]", "health checks: keys, model, chains, skills, updates");
  row("lumen personas [list|use <id>]", "who the agent is (default: lumen)");
  row("lumen update [--check]", "update @useclaudia/* packages");
  say("");
  sec("Chains");
  row("lumen chains [--testnets]", "every supported chain + RPC source");
  row("lumen chain <id>", "block, gas, latency, RPC source");
  row("lumen price <SYMBOL|address> [--chain base]", "Chainlink first, then Alchemy/DefiLlama/CoinGecko");
  row("lumen balance <address> [--chain base]", "native + tokens with USD values");
  row("lumen tx <hash> --chain <id>", "status, transfers, fee, explorer link");
  say("");
  sec("Create & show");
  row('lumen gen image|video|speech|music "<prompt>"', "media with your keys [--model --aspect --out]");
  row('lumen show "Safari" | "https://…"', "open + highlight on screen [--label --box x,y,w,h]");
  row("lumen windows [App]", "list windows and their bounds (macOS)");
  row("lumen dashboard [--no-open] · lumen serve", "local web studio (shares the agent) / headless");
  row("lumen skills [list|show <slug>|export <dir>]", "base, per-chain and your own skills [--chain]");
  row("lumen plugins [list]", "plugins in ~/.lumen/plugins");
  say("");
  sec("Flags");
  row("--model provider:model", "e.g. anthropic:claude-opus-5-5, openrouter:x-ai/grok-4.7, mock:echo");
  row("--persona <id> · --chain <id>", "persona and active chain for this run");
  row("--yes", "skip approvals for files/shell/media (money moves always ask)");
  row("--no-color · --ascii", "plain output for any terminal");
  say("");
  say(`  ${T.muted("In chat: /help · /model · /persona · /chain · /skills · /dashboard · Esc stops · Ctrl+C twice quits")}`);
  say(`  ${T.muted("Docs & keys: README.md · ~/.lumen (override with LUMEN_HOME)")}`);
}
