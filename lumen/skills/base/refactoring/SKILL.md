---
name: refactoring
description: "Changes code structure without changing behavior, in small verified steps: characterization tests first, a catalog of safe moves (extract, inline, rename, move, split, replace conditional), codemods with rg and AST tools, strangler-fig migrations and separating refactor commits from behavior changes. Use when someone says \"clean this up\", \"refactor\", \"this file is too big\", \"untangle this\", \"rename across the codebase\", \"migrate from X to Y\", or before adding a feature to messy code."
license: MIT
metadata:
  title: "Refactoring"
  category: "build"
  level: "advanced"
  tags: "refactoring, clean code, extract function, rename, codemod, strangler fig, characterization tests, tech debt"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Refactoring

Refactoring means behavior stays identical while structure improves; anything else is a rewrite wearing a
disguise. The one idea that matters: take steps so small that the tests stay green after each one, and never mix
a refactor with a behavior change in the same commit. Then any break points at exactly one step.

## When to use

- "Clean this up", "refactor", "this function/file is too big"
- Before adding a feature to code that resists change ("make the change easy, then make the easy change")
- Renaming or moving something used across the codebase
- Migrating a library, API or pattern incrementally

## Steps

1. **Name the goal and the smell.** One sentence: "Split `server.js` (1,400 lines) so routes, auth and static
   serving live in separate modules." Common smells: long function (> ~60 lines), duplicated logic in 3+ places,
   flag arguments, deep nesting (> 3 levels), a module everyone imports, shotgun surgery.
2. **Get a safety net.** Run the suite and record the baseline. If the target lacks tests, add characterization
   tests that pin current behavior, including odd behavior: feed real inputs, assert the current outputs. Bugs
   you discover go on a list, not into this change.
3. **Find every usage before you move anything.**
   ```sh
   rg -n '\bformatPrice\b' --type js            # call sites
   rg -n "from ['\"].*\/prices(\.js)?['\"]"     # importers of a module
   rg -n 'formatPrice' -g '!node_modules' --files-with-matches | wc -l
   ```
   Check dynamic access too (string keys, `require(variable)`, templates, docs, configs).
4. **Apply one move at a time from the catalog.**

   | Move | When | Watch out for |
   |---|---|---|
   | Extract function/module | A block has a nameable job | Captured variables, early returns |
   | Inline | Indirection adds nothing | Other callers |
   | Rename | Name lies or is vague | String references, public API, serialized keys |
   | Move | Code lives far from its data | Circular imports |
   | Split phase | One function parses and acts | Order of side effects |
   | Replace conditional with lookup/polymorphism | Switch repeated in many places | Default branch semantics |
   | Introduce parameter object | 4+ params travel together | Call sites passing positionally |

5. **Run tests after every move.** Use `edit_file` for precise edits, then run the tests (`bash`, approval
   needed). Green: commit (`git commit -m "refactor: extract parseRoute"`). Red: revert that step
   (`git checkout -- <file>`) and take a smaller one.
6. **Use tools for wide mechanical changes.** Editor/LSP rename for symbols; for patterns, an AST tool
   (`npx jscodeshift`, `ast-grep`, `comby`) beats regex. Regex with `sed` only for unambiguous text, and review
   `git diff` in full afterward.
7. **Migrate big things with a strangler fig.** Build the new path beside the old one, route one caller at a
   time, keep both working, delete the old path once `rg` finds zero users. Feature-flag if you need rollback.
8. **Parallelize independent slices.** For a codemod over many packages, `delegate` one sub-agent per package
   with the exact move and the test command; review each diff before accepting it.
9. **Verify no behavior changed.** Full suite, typecheck, lint, build. When stakes are high, compare outputs on
   real inputs: `git worktree add ../before <base-sha>`, run the same command in both trees, `diff` the results.

## Check before you finish

- [ ] Tests were green before starting and are green after every commit
- [ ] Refactor commits contain no behavior changes; bugs found are listed separately
- [ ] `rg` shows zero leftover references to old names or paths (code, docs, configs)
- [ ] Public APIs and serialized formats are unchanged, or deprecated with an alias
- [ ] Typecheck, lint and build pass
- [ ] The diff is reviewable: moves and edits are in separate commits

## Pitfalls

- **The big-bang rewrite.** Weeks without a green build; ship increments instead.
- **Fixing bugs mid-refactor.** Tests that change expectations hide whether the refactor broke something.
- **Moving code and editing it in one commit.** Git shows it as delete + add; reviewers cannot see the edit.
- **Abstracting too early.** Two similar blocks are fine; extract on the third, when the shape is clear.
- **Ignoring dynamic references.** Reflection, string-built imports and config keys survive a symbol rename.
- **Refactoring without a reason.** Tie the work to an upcoming change or a measured pain point.

## Related

- `test-writing` — characterization tests before you start
- `code-review` — keeping refactor PRs reviewable
- `git-workflow` — small commits, interactive staging and reverts
- `codebase-onboarding` — understand the structure before changing it
- `performance-profiling` — when the goal is speed rather than clarity
