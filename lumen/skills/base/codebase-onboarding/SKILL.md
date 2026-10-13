---
name: codebase-onboarding
description: "Builds a working mental model of an unfamiliar repository fast: entry points, build/test commands, module map, data flow and conventions, written up as a short orientation note. Use when someone says \"explain this codebase\", \"where do I start\", \"how does this repo work\", \"find where X happens\", \"I just cloned this\", or before making a first change in a project you have not seen."
license: MIT
metadata:
  title: "Codebase onboarding"
  category: "build"
  level: "beginner"
  tags: "onboarding, codebase, architecture, rg, grep, git log, entry points, repo map, conventions"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Codebase onboarding

Reading a repo top to bottom wastes hours. Instead, find the entry points, run the tests, and trace one real
request end to end; the rest of the structure hangs off that path. The one idea that matters: verify by running,
not by reading. A green test run and one traced flow are worth more than skimming fifty files.

## When to use

- "Explain this codebase", "where do I start", "how is this organized"
- "Where does X happen?" in a repo you have not seen
- Before your first change, review or bug fix in a new project
- Handing a repo to a teammate or a sub-agent and needing a map first

## Steps

1. **Get the shape (read-only, no approval needed).** `bash ls -la` at the root and one level down. Read the
   manifest first: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile`, `Dockerfile`,
   `.github/workflows/*`. These tell you language, scripts, entry points and how CI builds it.
   ```sh
   git log --oneline -n 20 && git shortlog -sn --since=1.year | head
   rg --files | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -25   # where the code mass is
   ```
2. **Read the docs that exist.** `README`, `CONTRACT`/`ARCHITECTURE`/`docs/*`, `CLAUDE.md`, `AGENTS.md`,
   `CONTRIBUTING.md`. Note stated rules (no new deps, ESM only, ownership boundaries) before you touch anything.
3. **Find the entry points.** `bin` and `main`/`exports` in package.json, `if __name__ == "__main__"`,
   `func main`, route registrations, CLI arg parsers:
   ```sh
   rg -n '"bin"|"main"|"exports"' package.json
   rg -n 'createServer|app\.(get|post)|router\.|addEventListener\(.fetch' --type js
   rg -n 'process\.argv|parseArgs|commander|yargs' -g '!node_modules'
   ```
4. **Run it.** Install and run the test suite and the check script (`npm ci && npm test`, `pytest -q`,
   `go test ./...`). These go through `bash` and need approval; say what they do. Record the baseline: how many
   pass, which fail already, how long it takes. Pre-existing failures are not yours to explain away later.
5. **Trace one real flow.** Pick the most important user action (one CLI command, one API route) and follow it
   from entry point to side effect with `grep` for each function name you hit. Write the path as
   `bin/cli.js → src/commands/price.js → src/chains/prices.js → fetch(coins.llama.fi)`.
6. **Map the modules.** For each top-level directory: one line on its job, its key files, and what it may import.
   Find the hot spots with `git log --format= --name-only | sort | uniq -c | sort -rn | head -15`; those files
   change most and carry most of the risk.
7. **Learn the conventions.** Error handling style, logging, config loading, naming, test layout, formatting
   (`.editorconfig`, `.prettierrc`, `eslint.config.*`). Match them; do not import your own.
8. **Parallelize big repos.** For a monorepo or 100k+ lines, `delegate` one sub-agent per package with the
   instruction "return entry points, responsibilities, external deps, and 3 non-obvious things, under 150
   words". Merge the answers into one map.
9. **Write the orientation note.** Use the template; save key facts with `memory_save` so later sessions skip
   this.

## Orientation note template

```markdown
## <repo> in one paragraph
## Run it:   install / dev / test / build commands (verified: yes/no)
## Entry points:  file → purpose
## Module map:    dir → job → depends on
## One traced flow:  a → b → c → side effect
## Conventions and rules
## Hot spots and known failing tests
## Open questions
```

## Check before you finish

- [ ] Test and build commands were actually run, with the baseline result recorded
- [ ] At least one flow is traced from entry point to side effect with file paths
- [ ] Every top-level directory has a one-line purpose
- [ ] Project rules from README/CONTRIBUTING/AGENTS files are listed
- [ ] Claims about behavior cite a file and line, not a guess from a name

## Pitfalls

- **Trusting names.** `utils/cache.js` may not cache; open it before describing it.
- **Generated and vendored code.** Exclude `dist/`, `build/`, `vendor/`, lockfiles and `node_modules` from searches
  (`rg` respects `.gitignore`; add `-g '!dist'` when it is committed).
- **Stale docs.** READMEs drift; when docs and code disagree, the code wins and you flag the doc.
- **Running unknown scripts blind.** Read `postinstall`, `prepare` and Makefile targets before running them.
- **Over-mapping.** A 40-line note people read beats a 400-line one nobody does.

## Related

- `debugging-method` — once you know the map, find the actual bug
- `code-review` — reviewing a change in a codebase you just learned
- `refactoring` — changing structure safely after onboarding
- `docs-writing` — turning the orientation note into real docs
- `git-workflow` — history archaeology with log, blame and bisect
