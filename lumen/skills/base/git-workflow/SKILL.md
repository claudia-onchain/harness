---
name: git-workflow
description: "Day-to-day and rescue Git: branching, small focused commits, good messages, rebase vs merge, resolving conflicts, stashing, finding history with log/blame/bisect, undoing mistakes with reflog, and keeping secrets out of history. Use when someone asks \"how do I undo this commit\", \"fix this merge conflict\", \"clean up my branch\", \"squash commits\", \"I committed a secret\", \"write a commit message\", or \"which commit broke this\". The agent never pushes or force-pushes on its own."
license: MIT
metadata:
  title: "Git workflow"
  category: "build"
  level: "intermediate"
  tags: "git, commits, branches, rebase, merge conflicts, reflog, bisect, blame, gh, history"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Git workflow

Git rarely loses work; people lose track of where the work is. The one idea that matters: before any history-
rewriting command, know how you would get back (`git reflog`, a backup branch). With that, rebase, reset and
amend become safe tools instead of scary ones.

## When to use

- Branching, committing and opening a PR for a change
- "Undo my last commit", "I committed to the wrong branch", "I lost my changes"
- Merge or rebase conflicts
- "Which commit introduced this?", "who changed this line and why?"
- A secret or huge file landed in a commit

## Steps

1. **Look before acting (read-only, safe).**
   ```sh
   git status -sb && git branch -vv && git log --oneline --graph -n 15
   git diff            # unstaged     |  git diff --staged   # what will be committed
   ```
   The agent runs these freely. Anything that writes (commit, reset, rebase, checkout over changes) goes through
   `bash` with approval, and the agent never runs `git push` (force or not) unless the user explicitly asks.
2. **Branch per change.** `git switch -c fix/price-rounding origin/main`. Keep branches short-lived (days, not
   weeks) and rebase on main often to keep conflicts small.
3. **Make small, focused commits.** Stage by hunk with `git add -p` (or name files explicitly); never blind
   `git add -A` in a dirty tree. One logical change per commit, tests passing at each.
4. **Write messages that explain why.**
   ```text
   fix(prices): round USD values half-even to 2 decimals

   DefiLlama returns 8+ decimals and the dashboard showed $0.1 as $0.09999999.
   Rounding happens once at the API boundary; storage keeps full precision.
   ```
   Subject ≤ 72 chars, imperative mood, optional Conventional Commits prefix if the repo uses it (check
   `git log --oneline -n 20`). Follow the repo's trailer rules (co-author lines, sign-off) when present.
5. **Integrate: rebase your own branch, merge shared ones.** `git fetch && git rebase origin/main` for a local
   feature branch; never rebase commits others have pulled. Tidy before review (the user can run
   `git rebase -i origin/main`; the agent uses the non-interactive form): `git commit --fixup <sha>`, then
   `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash origin/main`.
6. **Resolve conflicts deliberately.** `git status` lists them; open each file, understand both sides
   (`git log --merge -p -- <file>`), edit, run tests, `git add <file>`, `git rebase --continue`. Bail out with
   `git rebase --abort` / `git merge --abort`. Set `git config rerere.enabled true` to reuse resolutions.
7. **Dig through history.** `git log -S 'formatPrice' --oneline` (when a string appeared or vanished),
   `git log -L :parsePrice:src/prices.js`, `git blame -w -C -- src/prices.js`, `git bisect run <test cmd>` for
   regressions.
8. **Undo with the right tool.** See the table. Before anything destructive: `git branch backup/$(date +%s)`.

## Undo table

| Situation | Command |
|---|---|
| Discard unstaged edits to a file | `git restore <file>` |
| Unstage a file | `git restore --staged <file>` |
| Fix the last commit (not pushed) | edit, `git add`, `git commit --amend` |
| Undo last commit, keep changes | `git reset --soft HEAD~1` |
| Committed on the wrong branch | `git branch fix/x && git reset --hard HEAD~1 && git switch fix/x` |
| Undo a pushed commit | `git revert <sha>` (new commit; history intact) |
| "I lost commits" after reset/rebase | `git reflog`, then `git branch rescue <sha>` |
| Save work-in-progress | `git stash push -m "wip: parser"`, later `git stash pop` |

## Secrets in history

If a key was committed: **rotate the key first** (it is compromised the moment it was pushed or shared), then
remove it from history with `git filter-repo --path .env --invert-paths` or BFG, and have every clone re-fetch.
Prevent repeats with `.gitignore` entries for `.env*`, `*.pem`, `keys.json`, and a pre-commit secret scan
(`gitleaks git --staged` in a pre-commit hook, or trufflehog).

## Check before you finish

- [ ] `git status` is clean or the remaining changes are intentional and explained
- [ ] Each commit is one logical change with a why-focused message
- [ ] Tests pass on the final commit
- [ ] No secrets, `.env` files, build output or large binaries were committed (`git diff --stat origin/main...`)
- [ ] Nothing was pushed or force-pushed without the user's explicit request

## Pitfalls

- **`git reset --hard` with uncommitted work.** Uncommitted changes are not in the reflog; stash or commit first.
- **Rebasing shared branches.** Rewrites others' history; use merge or revert there.
- **`git push --force`.** Use `--force-with-lease` if a force push is truly needed, and only when asked.
- **Giant mixed commits.** "misc fixes" with 40 files cannot be reviewed, reverted or bisected.
- **Deleting a secret in a new commit.** It is still in history; rotate and rewrite.

## Related

- `code-review` — getting the branch reviewed
- `debugging-method` — bisect-driven root cause hunting
- `refactoring` — commit hygiene for structural changes
- `security-review` — secret scanning and leak response
- `deployment-replit-vercel-docker` — what happens after merge
