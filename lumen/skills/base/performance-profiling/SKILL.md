---
name: performance-profiling
description: "Finds and fixes real performance problems by measuring first: baselines with hyperfine and autocannon, CPU profiles with node --cpu-prof and Chrome DevTools, heap snapshots for leaks, event-loop lag, clinic doctor/flame, browser Performance panel and Lighthouse with Web Vitals thresholds, plus RPC and API call batching. Use when someone asks \"why is this slow\", \"profile my app\", \"memory leak\", \"high CPU\", \"speed up this script\", \"page loads slowly\" or \"too many RPC calls\"."
license: MIT
metadata:
  title: "Performance profiling"
  category: "build"
  level: "advanced"
  tags: "performance, profiling, node, cpu-prof, heap, flamegraph, clinic, devtools, lighthouse, web vitals"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Performance profiling

Never optimize from a hunch. Measure a baseline, profile to find where time or memory actually goes, fix the
single biggest cost, measure again. In practice most slowness is waiting (network, RPC, disk, sequential
awaits), not computing; a profile shows which in minutes.

## When to use

- "This script / endpoint / page is slow."
- Memory grows until the process crashes, or CPU sits at 100%.
- A Node service has latency spikes or event-loop lag.
- A dApp or bot makes hundreds of RPC or API calls and hits rate limits.

## Steps

1. **Define the target and a repeatable baseline.** Pick one number: p95 latency, total runtime, LCP, peak RSS.
   ```sh
   hyperfine --warmup 2 'node scripts/build-report.js'                 # CLI runtime, mean and spread
   npx autocannon -c 50 -d 20 http://127.0.0.1:3000/api/prices         # HTTP latency p50/p97.5/p99 and req/s
   ```
   Run against production-like data. Save the output; every change gets compared to it.
2. **Find out if it is waiting or computing.** Time the phases with `performance.now()` or
   `console.time('fetch')`. If wall time is far above CPU time (`process.cpuUsage()`), it is I/O: go to step 6.
3. **CPU profile.**
   ```sh
   node --cpu-prof --cpu-prof-dir=./prof scripts/build-report.js
   ```
   Open the `.cpuprofile` in Chrome DevTools (Performance panel, load profile) or drag it into speedscope.app.
   Read the bottom-up view: the top self-time functions are your targets. For servers:
   `node --inspect server.js`, open `chrome://inspect`, record in the Performance tab while autocannon runs.
4. **Let clinic triage a server.**
   ```sh
   npx clinic doctor --autocannon [ -c 50 -d 20 /api/prices ] -- node server.js
   npx clinic flame -- node server.js        # flamegraph
   npx clinic bubbleprof -- node server.js   # async waits
   ```
   Doctor tells you whether to look at CPU, event loop, GC or I/O.
5. **Memory leaks.** Take three heap snapshots in DevTools Memory tab (after warmup, after load, after more
   load) and compare: objects that keep growing (caches without limits, listeners never removed, arrays of
   past requests) are the leak. Headless: `node --heap-prof app.js` or `node --heapsnapshot-signal=SIGUSR2
   app.js` then `kill -USR2 <pid>`. Watch `process.memoryUsage().heapUsed` over time.
6. **Fix I/O patterns first.** Usually the biggest wins:
   - sequential `await` in a loop → `Promise.all` with a concurrency limit (5-10) to respect rate limits;
   - many `eth_call`s → one Multicall3 call (viem `multicall`), many balances → Alchemy token balance API;
   - repeated identical lookups → cache with a TTL (prices 15-60 s, token metadata hours, ABIs forever);
   - N+1 database queries → one query with `IN`/join; add the index the query plan asks for.
7. **Event loop health.** `perf_hooks.monitorEventLoopDelay()` p99 above ~100 ms means something blocks:
   sync JSON of huge objects, `fs.*Sync` in handlers, big regexes, crypto. Move it to a worker thread or stream it.
8. **Front end.** Lighthouse (`npx lighthouse https://site --view`) and the DevTools Performance panel with CPU
   throttling 4x. Targets (75th percentile): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Usual fixes: smaller JS
   (code-split routes, drop heavy libs), sized and lazy images (`width`/`height`, `loading="lazy"`, AVIF/WebP),
   no layout shifts from late banners, and virtualized long lists.
9. **Re-measure and keep the win.** Same benchmark, same data. Keep the change only if it beats noise
   (hyperfine shows the spread). Add a perf check to CI for hot paths if regressions recur.

## Check before you finish

- [ ] A baseline number exists, measured with a repeatable command and realistic data.
- [ ] A profile (CPU, heap or async) identified the cost before any code changed.
- [ ] Each fix was measured; the before/after numbers are written down.
- [ ] Concurrency limits and caches respect provider rate limits.
- [ ] No correctness regressions: tests pass, cached data has sane TTLs.

## Pitfalls

- **Profiling dev builds.** React dev mode, source-map-heavy bundles and `NODE_ENV=development` lie. Profile production builds.
- **Micro-benchmarks.** Making a function 10x faster that takes 1% of runtime changes nothing. Follow the profile.
- **Unbounded `Promise.all`.** 5,000 parallel RPC calls get you 429s and bans. Limit concurrency.
- **Caching money-critical data too long.** Stale prices or balances must never feed a transaction preview;
  re-fetch right before `simulate_tx`.
- **One run.** Variance is real; use warmups and multiple runs.
- **Laptop vs server.** Thermal throttling and different cores skew results; compare on the same machine.

## Related

- `debugging-method` — the hypothesis-driven loop profiling plugs into.
- `rpc-providers-and-rate-limits` — batching and quotas for chain calls.
- `event-indexing-and-logs` — fetching logs efficiently instead of polling.
- `build-a-web-app` — front-end structure that stays fast.
- `refactoring` — restructuring hot code safely once you know where it is.
