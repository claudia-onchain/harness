---
name: test-writing
description: "Writes tests that catch real bugs and stay fast and deterministic: what to test, test boundaries, arrange-act-assert, table-driven cases, fakes vs mocks, fixtures, time and network control, coverage as a hint, and flaky-test hygiene. Use when someone asks to \"write tests\", \"add test coverage\", \"test this function\", \"set up node --test / vitest / pytest\", \"fix a flaky test\", or before refactoring untested code."
license: MIT
metadata:
  title: "Test writing"
  category: "build"
  level: "intermediate"
  tags: "testing, node --test, vitest, pytest, unit tests, integration tests, fixtures, mocks, tdd, flaky"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Test writing

A test is worth writing if it would fail when a user-visible behavior breaks and pass through any refactor that
keeps the behavior. The one idea that matters: test behavior at boundaries, not implementation details. Tests that
mirror internal calls break on every refactor and catch nothing.

## When to use

- "Write tests for X", "add coverage", "set up a test runner"
- Before refactoring code that has no tests (characterization tests)
- After a bug: a regression test that reproduces it
- A test suite is slow or flaky and needs triage

## Steps

1. **Find the existing setup.** `read_file package.json` for the `test` script; `bash ls test/` or
   `rg --files -g '*.test.*'`. Match the runner and style already in use. Node 22 with no runner yet: use the
   built-in `node:test` (zero deps, `node --test`, `--watch`, `--test-name-pattern`, `--experimental-test-coverage`).
2. **List behaviors, not functions.** For the unit under test, write the cases as sentences: "returns [] for
   empty input", "rejects negative amounts", "retries once on 503". Include edges: empty, one, many, max size,
   unicode, null/undefined, duplicate, boundary values (0, -1, 2^53), invalid types, concurrent calls.
3. **Pick the level.** Use the table; most tests should be fast unit tests, with a few integration tests on
   real boundaries and very few e2e.

   | Level | Scope | Speed target | Use for |
   |---|---|---|---|
   | Unit | One module, fakes for I/O | < 10 ms each | Logic, parsing, math, edge cases |
   | Integration | Real DB/file/HTTP server on localhost | < 1 s each | Queries, serialization, wiring |
   | Contract | Recorded upstream responses | < 50 ms each | Third-party API shapes |
   | E2E | Built app in a browser or CLI subprocess | seconds | 3–10 critical user journeys |

4. **Write table-driven tests with arrange-act-assert.**
   ```js
   import { test } from "node:test";
   import assert from "node:assert/strict";
   import { parseAmount } from "../src/amount.js";
   const cases = [
     ["1.5", 18, 1500000000000000000n], ["0", 6, 0n], ["0.000001", 6, 1n],
   ];
   for (const [input, decimals, want] of cases) {
     test(`parseAmount(${input}, ${decimals})`, () => assert.equal(parseAmount(input, decimals), want));
   }
   test("rejects too many decimals", () => assert.throws(() => parseAmount("0.0000001", 6), /decimals/));
   ```
5. **Control nondeterminism.** Inject the clock (`t.mock.timers.enable({ apis: ["Date", "setTimeout"] })` in
   node:test), seed randomness, stub `fetch` with `t.mock.method(globalThis, "fetch", fake)`, use temp dirs
   (`fs.mkdtempSync(path.join(os.tmpdir(), "t-"))`) and port 0. No test may touch the real network or the user's
   home directory.
6. **Prefer fakes over mocks.** An in-memory repository or a local `http.createServer` exercises real code
   paths; asserting "called `save` once with X" couples the test to implementation. Mock only true externals.
7. **Run, then prove the test can fail.** Run the suite (`bash`, approval needed). Then break the code on purpose
   (flip a condition) and confirm the new test goes red. A test you never saw fail may test nothing.
8. **Use coverage as a map, not a goal.** `node --test --experimental-test-coverage` or `c8`; look for untested
   branches in risky code (money math, auth, parsing), not for a percentage.
9. **Keep it fast and isolated.** Each test sets up its own state; order must not matter (`--sequence.shuffle` in
   vitest, `pytest -p randomly`). Whole unit suite under ~10 s or people stop running it.

## Check before you finish

- [ ] Each new test was seen failing (against broken code) and then passing
- [ ] Edge cases (empty, boundary, invalid, unicode) are covered for the risky paths
- [ ] No real network, real clock dependency, or writes outside a temp dir
- [ ] Tests pass when run alone and in random order
- [ ] Test names read as behavior sentences; failures say what broke
- [ ] The full suite still passes and stays within its time budget

## Pitfalls

- **Snapshot everything.** Big snapshots get rubber-stamped on update; assert the fields that matter.
- **Testing private functions.** Test through the public interface; if that is too hard, the design needs a seam.
- **Sleeping for async.** `await sleep(100)` is flaky; await the promise or event, or use fake timers.
- **Shared mutable fixtures.** One test mutates a fixture and another fails depending on order; deep-copy per test.
- **Asserting floats with `equal`.** Use a tolerance, or integers in the smallest unit (wei, cents).
- **Mocking what you own.** Mocking your own modules hides integration bugs; use the real thing or a fake.

## Related

- `debugging-method` — turn a bug repro into a regression test
- `refactoring` — characterization tests make refactors safe
- `api-integration` — fixture-driven contract tests
- `code-review` — checking that tests in a PR actually test something
- `write-a-cli` — black-box tests for command-line tools
