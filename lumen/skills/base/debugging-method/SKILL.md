---
name: debugging-method
description: "A disciplined method for finding the root cause of bugs: reproduce, minimize, form falsifiable hypotheses, bisect in code and history, instrument, fix, and lock it in with a regression test. Use when someone says \"this is broken\", \"why does this fail\", \"it works locally but not in CI\", \"flaky test\", \"find the bug\", \"it started failing after\", or pastes a stack trace or error message."
license: MIT
metadata:
  title: "Debugging method"
  category: "build"
  level: "intermediate"
  tags: "debugging, root cause, reproduce, bisect, git bisect, stack trace, logging, flaky tests, regression"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Debugging method

Debugging is the scientific method under time pressure. Guessing and patching symptoms feels fast and is slow.
The one idea that matters: get a reliable reproduction first. With a repro that fails in seconds, almost every bug
falls to bisection; without one, you are reading tea leaves.

## When to use

- "This is broken / throws / returns the wrong thing"
- A pasted stack trace, error code or failing CI log
- "It worked yesterday", "works locally, fails in CI", "only in production"
- Flaky tests or intermittent failures

## Steps

1. **Capture the facts.** Exact error text, full stack trace, command run, inputs, versions (`node -v`,
   `git rev-parse --short HEAD`, lockfile), environment (OS, env vars that matter, CI vs local). Read the trace
   bottom-up to the first frame in *your* code, then `read_file` that file around the line.
2. **Reproduce it.** Write the shortest command that shows the failure, ideally a failing test:
   `node --test --test-name-pattern="parses empty input" test/parse.test.js`. Running needs `bash` approval;
   state what it does. If you cannot reproduce, gather more data (logs, inputs) before changing code.
3. **Minimize.** Cut input and code until removing anything makes the bug vanish. A 5-line repro usually names
   the cause on its own.
4. **Hypothesize, then try to falsify.** Write 2–3 candidate causes, each with a prediction: "If it's a stale
   cache, clearing `~/.cache/x` fixes it." Run the cheapest test first. Change one variable at a time.
5. **Bisect.** In history, when you have a known good commit:
   ```sh
   git bisect start && git bisect bad HEAD && git bisect good v1.4.0
   git bisect run node --test test/parse.test.js   # exit 0 = good, 1-124 = bad, 125 = skip
   git bisect reset
   ```
   In code: comment out half the pipeline, or log at the midpoint, and recurse into the failing half. In data:
   split the input file in half until one record remains.
6. **Instrument where you are blind.** Targeted logs with values and types (`console.error({ x, typeof: typeof x })`),
   `node --inspect-brk`, `DEBUG=*`, `NODE_DEBUG=http,net`, `strace`/`dtruss` for syscalls, `curl -v` for HTTP.
   Use `grep` to find every writer of the bad value: `rg -n 'config\.timeout\s*='`.
7. **Fix the cause, not the symptom.** Ask "why" until you reach a decision someone made (a wrong assumption, a
   missing check, a race). A `try/catch` that swallows the error or a `?? default` that hides `undefined` is not a fix.
8. **Lock it in.** The repro becomes a regression test that fails before the fix and passes after. Run the full
   suite. Search for siblings: `rg` for the same pattern elsewhere and fix or list them.
9. **Write it up in 3 lines.** Symptom, root cause, fix. Put it in the commit message; `memory_save` it if the
   pattern is likely to recur in this project.

## Symptom → first suspect

| Symptom | Look at first |
|---|---|
| Works locally, fails in CI | Env vars, Node/OS version, timezone (`TZ=UTC`), file-path case, missing build step |
| Fails intermittently | Races, shared state between tests, timers, network, unordered iteration, ports in use |
| Started after a deploy / upgrade | `git bisect`, lockfile diff (`git diff HEAD~1 -- package-lock.json`) |
| Wrong number by a little | Floats, rounding, units (wei vs ether, ms vs s), timezone, off-by-one |
| `undefined` / null deep inside | The boundary where external data entered unvalidated |
| Hangs | Unresolved promise, missing `await`, open handle, deadlock, no timeout on fetch |

## Check before you finish

- [ ] A repro exists and was run before and after the fix
- [ ] The root cause is stated in one sentence and explains every observed symptom
- [ ] A regression test fails without the fix and passes with it
- [ ] The full test suite passes, not just the new test
- [ ] Temporary logging and debug flags are removed
- [ ] Similar code paths were searched for the same bug

## Pitfalls

- **Shotgun changes.** Five edits at once means you do not know which one mattered; revert and do one.
- **Trusting the error message's location.** The throw site is often far from the cause; trace the bad value back.
- **"Fixed" flaky tests with retries or longer sleeps.** That hides races; find the shared state or missing await.
- **Debugging the wrong build.** Stale `dist/`, cached modules or a different binary on `PATH`; check `which` and rebuild.
- **Stopping at the first plausible cause.** Confirm it explains all symptoms before writing the fix.

## Related

- `test-writing` — turning the repro into a durable regression test
- `git-workflow` — bisect, blame and reverting cleanly
- `performance-profiling` — when the bug is "it's slow"
- `incident-runbook` — when the bug is live and users are affected
- `codebase-onboarding` — mapping an unfamiliar repo before you dig in
