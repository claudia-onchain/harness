---
name: write-a-cli
description: "Designs and builds a command-line tool that behaves well in terminals, scripts, pipes and CI: argument parsing, subcommands, --json output, exit codes, stdout vs stderr, config precedence, TTY and color handling, signals and tests. Use when someone asks to \"write a CLI\", \"make a command-line tool\", \"add a subcommand\", \"wrap this script as a command\", or \"make this scriptable\". Node-first (node:util parseArgs, zero deps) with notes for Python and Go."
license: MIT
metadata:
  title: "Write a CLI"
  category: "build"
  level: "intermediate"
  tags: "cli, node, parseArgs, exit codes, json output, stdout, stderr, tty, scripting, node --test"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Write a CLI

A good CLI is a small API whose consumers are humans and shell scripts at the same time. The one idea that
matters: stdout is for data, stderr is for people. Get that, exit codes and `--json` right and your tool composes
with `jq`, cron and CI; get them wrong and every script around it breaks.

## When to use

- "Write a CLI", "make a command-line tool for X", "add a subcommand"
- Wrapping an ad-hoc script so others (or cron) can run it safely
- Making an existing tool scriptable: `--json`, quiet mode, reliable exit codes
- Reviewing a CLI's UX before release

## Steps

1. **Write the usage first.** Draft `--help` output before code: command, subcommands, flags, one example each.
   Use verbs for subcommands (`tool fetch`, `tool list`), long flags with short aliases only for frequent ones
   (`-o, --out`), and `--` to end flag parsing. Mirror conventions users already know (`lumen price ETH --chain base`).
2. **Parse with the standard library.** Node 22 needs no dependency:
   ```js
   #!/usr/bin/env node
   import { parseArgs } from "node:util";
   const { values, positionals } = parseArgs({
     allowPositionals: true,
     options: { json: { type: "boolean" }, chain: { type: "string", default: "ethereum" },
       help: { type: "boolean", short: "h" }, verbose: { type: "boolean", short: "v" } },
   });
   ```
   Python: `argparse`; Go: `flag` or `cobra` for deep subcommand trees. Unknown flags must error, not be ignored.
3. **Separate data from chatter.** Results to stdout; progress, warnings and errors to stderr. Detect a terminal
   with `process.stdout.isTTY`: spinners and color only when true, and never when `NO_COLOR` is set or `--json`
   is passed. With `--json`, print exactly one JSON document (or JSON Lines for streams) and nothing else.
4. **Use meaningful exit codes.** Document them in `--help`.

   | Code | Meaning |
   |---|---|
   | 0 | success (including "nothing to do") |
   | 1 | runtime failure (network, upstream API error) |
   | 2 | usage error (bad flag, missing argument) |
   | 3+ | domain-specific, e.g. 3 = not found, 4 = auth missing |
   | 130 | interrupted by Ctrl+C (SIGINT) |

   Set `process.exitCode` and return instead of `process.exit()` so stdout flushes when piped.
5. **Layer configuration.** Precedence: flags > env vars > project config > user config (`~/.tool/config.json`)
   > defaults. Secrets come from env or a 0600 file, never from a flag (flags land in shell history and `ps`).
   Mask any key you print to its last 4 chars.
6. **Fail helpfully.** Error messages say what failed, why, and the next command to run:
   `error: ETHERSCAN_API_KEY not set. Run: lumen keys set etherscan`. Print stack traces only with `--verbose`.
7. **Be safe by default.** Destructive or paid actions need `--yes` or an interactive confirm, and support
   `--dry-run`. Never prompt when stdin is not a TTY; fail with exit 2 and say which flag skips the prompt.
8. **Handle signals and pipes.** On SIGINT, stop work, clean temp files, exit 130. Ignore `EPIPE` on stdout so
   `tool list | head -1` does not crash.
9. **Test as a black box.** Spawn the binary in `node --test` and assert on stdout, stderr and exit code:
   ```js
   import { test } from "node:test"; import assert from "node:assert/strict";
   import { spawnSync } from "node:child_process";
   test("bad flag exits 2", () => {
     const r = spawnSync(process.execPath, ["bin/tool.js", "--nope"], { encoding: "utf8" });
     assert.equal(r.status, 2); assert.match(r.stderr, /unknown option/i); assert.equal(r.stdout, "");
   });
   ```
   Run with `node --test` (approval needed for `bash`). Add `"bin": { "tool": "bin/tool.js" }` and try
   `npm link` to test the installed command.

## Check before you finish

- [ ] `tool --help` and `tool <sub> --help` show usage, flags, exit codes and an example
- [ ] `tool ... --json | jq .` parses with no stray log lines
- [ ] Unknown flag exits 2; runtime failure exits 1; success exits 0
- [ ] Output has no ANSI codes when piped or when `NO_COLOR=1`
- [ ] No secret is accepted as a flag value or printed in full
- [ ] Destructive actions require `--yes` or confirmation and support `--dry-run`
- [ ] Black-box tests cover help, one happy path, one usage error, one runtime error

## Pitfalls

- **`console.log` for progress.** It pollutes stdout and breaks pipes; use `console.error` or a stderr logger.
- **`process.exit()` after writing.** Truncates piped output; set `process.exitCode`.
- **Interactive prompts in CI.** Hangs forever; check `process.stdin.isTTY` first.
- **Breaking flags silently.** Renaming a flag breaks scripts; keep the old one as a deprecated alias for a release.
- **Heavy dependencies.** A 40 MB dep tree for arg parsing slows every invocation; the stdlib is enough.
- **Locale-dependent output.** Format numbers and dates explicitly in `--json` (ISO 8601, plain numbers).

## Related

- `test-writing` — deeper test design for the CLI's internals
- `api-integration` — when the CLI wraps a remote API
- `automation-and-cron` — running the CLI on a schedule
- `docs-writing` — README and help text people actually read
- `lumen-plugin-authoring` — exposing the same logic as a Lumen tool or slash command
