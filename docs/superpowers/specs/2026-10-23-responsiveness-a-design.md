# Design: responsiveness PR A (seeded Monte Carlo and a result cache)

**Roadmap:** prep item 3, PR A (`docs/roadmap.md`, "Current plan"). **Proposal:**
`docs/superpowers/specs/2026-10-22-responsiveness-proposal.md`. This design follows the proposal, with three changes
(section 6). PR B (deferred rendering) is a separate later task.

## 1. Baseline (measured 2026-10-23 at `320f374`)

The built planners in headless Chromium (Playwright, 1280x900). Each figure is the median time of one slider `input` event
(`k401PctA` in the US, `rrspPctA` in Canada), which runs `render()` synchronously:

| | Projection view | Monte Carlo view (1,000 paths) |
|---|---|---|
| US, new value | 21 ms | 842 ms |
| US, same value again | 16 ms | 827 ms |
| Canada, new value | 15 ms | 672 ms |
| Canada, same value again | 14 ms | 660 ms |

Other measurements:
- **Memory held by one result:** a 1,000-path Monte Carlo result is about 29 MB, one backtest (`runHistoricalCycles`) about
  1.2 MB, one `simulate()` about 26 KB. These are CDP heap figures after a forced GC.
- **Stringifying the state:** `JSON.stringify(state)` of the default US state takes about 3 µs; the JSON is 2.6 KB.

The same script runs again after the change (section 7).

## 2. Seeded Monte Carlo

All changes are in `src/shared/core/projection/simulate.js`, the store layer.

- **The generator:** `bootstrapReturnSeries(length, rand)` takes a generator instead of calling `Math.random()`. A run makes
  one mulberry32 generator (the same function `tests/historical_rates.js` and `tests/snapshot_ui.js` use), local to that
  call. No module-level generator state exists.
- **The seed:** a 32-bit FNV-1a hash of `taxYear + '|' + pathCount + '|' + JSON.stringify(inputs)`. The same inputs always
  give the same paths and the same success rate. Changing any input, the tax year or the path count gives a different, but
  equally reproducible, set of paths.
- **What else changes:** `Math.random` remains only in the scenario ids (`src/shared/ui/plans/scenarios.js`).
- **The figures move:** this is an intended behavior change. The Monte Carlo figures differ from today's random draws. Today
  they differ on every render anyway.
- **`tests/historical_rates.js`:** drops its `Math.random` stub and its `--seed` option, because the seed now comes from the
  inputs. `tests/bench_heavy.js` keeps its stub; with a seeded run the stub does nothing, and the stub is harmless.

## 3. The Monte Carlo summary (new)

**Why:** the Monte Carlo view never uses the individual paths.
- **The chart** (`renderMonteCarloChart`, `src/shared/ui/charts/monte-carlo-chart.js`): for each year it sorts every path's
  total (real or nominal), keeps the 10th, 25th, 50th, 75th and 90th percentiles, and draws only those. It has no hover over
  paths.
- **The text** (`chart-view.js`, both countries): reads the success rate, the number of surviving paths and the path count.

**The change:**
- **The helper:** a pure function `monteCarloBands(paths, projectionYears, valueFn)` in a new module
  `src/shared/core/format/monte-carlo-bands.js`. It holds the chart's band arithmetic moved verbatim: the same `.map`, the
  same `.sort((a, b) => a - b)`, the same `pctl` interpolation. It returns `[{ year, p10, p25, p50, p75, p90 }]`.
- **The cached function:** a new store wrapper `monteCarloSummary(pathCount)` runs `runMonteCarlo(pathCount)` and keeps only
  this, returning the summary:

  ```
  { successRate, survived, pathCount, projectionYears,
    bands: { nominal: [...], real: [...] } }
  ```

  `nominal` uses `r.total`; `real` uses `r.total / r.cumFactor`.
- **The paths are dropped:** the full paths become garbage as soon as the summary is built, as they do after every render
  today. The peak memory during a run is unchanged; what stays held is about 4 KB.
- **The chart:** `renderMonteCarloChart(summary)` picks `summary.bands[mode === 'real' ? 'real' : 'nominal']` and adds
  `state.ageA` to each `year` for the x-axis, as it does today. Its optional `valueFn` argument goes away; no caller passes
  one. It draws the same pixels: the percentile arithmetic is unchanged and runs on the same values in the same order.
- **The chart view:** both `chart-view.js` files call `monteCarloSummary(mcPathCount)` instead of `runMonteCarlo` and read
  `survived` / `pathCount` instead of filtering `paths`.
- **Gain beyond memory:** switching real / nominal in the Monte Carlo view no longer re-sorts 1,000 values for each year.
- **What stays the same:** `runMonteCarlo(n)` keeps its return shape (`{ paths, successRate, projectionYears }`) and is **not
  cached**. The test hooks (`__test_runMonteCarlo`), `tests/bench_heavy.js`, `tests/historical_rates.js` and the Vitest
  helper `tests/unit/helpers/engine.js` use it, so their numbers and counters keep measuring real runs.

## 4. The result cache

This is also in `simulate.js`. No engine module changes.

**What is cached:** `simulate(a, b)`, `runHistoricalCycles()` and `monteCarloSummary(n)`. `simulateHistorical(rowFn, ...)` is
not cached, because a `rowFn` is a closure that cannot be keyed. The analysis and optimizer variants (`simulateWith` through a
`contextFor` factory) are not cached either (proposal, out of scope).

**The key.** Each wrapper builds its store context first, as today (`storeContext()`; US: the plan comes from `planForState`).
It then looks up an entry under this string key:

```
kind | args | ctx.taxYear | JSON.stringify(ctx.inputs)
```

Here `kind` is `sim`, `hist` or `mc`, and `args` is the retirement ages or the path count. The string key alone is not enough;
the entry stores these too, and a hit requires each to equal the current context's:
- `ctx.planMode`;
- `ctx.plan`, compared by identity. A plan is a function of the tax year, the inputs' JSON and the overrides, except where
  `planForState`'s identity rule applies the kept plan to a state changed in place, or `__test_setCliffPlan` sets one. A
  different plan object for the same JSON is then only a miss, never a wrong hit.
- the JSON of the two override maps (`ctx.overrides.rothBracketByAge`, `.withdrawalMixByAge`);
- the JSON of `ctx.test` (`inhForce`, `inhNoNeedAdj`).

In Canada the plan is `null`, the mode `off`, and the overrides and test switches are the constant empty objects of
`newRunContext`, so the same code serves both countries. `ctx.stats` and `ctx.taxFactors` are not part of the key: the first
is a sink, the second a fresh array per historical run.

**What a hit skips:** the run's writes to the `ctx.stats` sinks (US `magiStats`, `planStats` and the `testHooks`
counters). Production never reads them; the tests that do are covered in section 5.

**Why the state is stringified on every call:** the proposal suggested reusing `refreshCliffPlan()`'s key, so the state is
stringified once per state change. That key belongs to the state *object*, and a state changed in place keeps its identity:
- an input handler mutates `state`, then renders;
- a call between those two steps would get the old result.

The cliff plan tolerates that on purpose; it applies the kept plan to in-place variants. A stale result would be a silently
wrong number, and stringifying costs about 3 µs against a 1-6 ms `simulate()`. So every call stringifies.

**The size limits** are per kind, from the measured sizes:

| Kind | Entries | Held at most |
|---|---|---|
| `sim` | 64 | about 2 MB |
| `hist` | 8 | about 10 MB |
| `mc` (summaries) | 16 | under 0.1 MB |

`sim` needs more entries than the others: one default render runs about six age pairs (selected, the ±1 / ±3 lines,
`workForever`).

**Eviction:** least recently used (a `Map`, re-inserted on a hit, the oldest key deleted when full). `cliffPlanCache` instead
clears everything when full. The code is the same size, and LRU keeps the slider positions just visited.

**The registry:** `simulate.js` is a store-layer module (`adapters` in `tests/engine-purity.json`), not an engine module. If
`tests/engine_purity.js` asks for the caches to be registered anyway, they go in as kind `cache`.

**A shared result must not be changed.** A grep found no caller that writes to a result's rows, cycles or fields; this
section makes that a test.
- **The switch:** a module-level `freezeResults` flag in `simulate.js`. It is set through an exported `assignFreezeResults(on)`
  and the shared test hook `window.__test_freezeSimResults(on)`. When on, every result is deep-frozen before it is stored,
  including the non-enumerable fields `estate` and `cliffIntents`; the walk uses `Object.getOwnPropertyNames`.
- **Production:** never sets it.
- **Strict mode does the checking:** the built app runs in strict mode, so a write to a frozen result throws, and a page error
  fails the Playwright script below.

## 5. Tests

**Vitest:** a new suite, `tests/unit/shared/result-cache.test.js`, through `world()`, exact comparisons, both countries where
the case applies.
- **Seed:**
  - the same inputs give the identical Monte Carlo summary in two separate worlds;
  - changing one input, the tax year (US) or the path count changes the bands.
- **Summary:** its bands equal `monteCarloBands` over the uncached `runMonteCarlo` paths, element by element.
- **Hits:** a second `simulate()`, `runHistoricalCycles()` or `monteCarloSummary(n)` with nothing changed returns the
  identical object (`toBe`).
- **Invalidation:** each key part forces a fresh run (`not.toBe`):
  - a state field;
  - the retirement-age arguments and the path count;
  - the tax year (US);
  - a different plan object (US, `__test_setCliffPlan`'s store write, or a guard toggle);
  - the planMode;
  - each override map (US);
  - each test switch (US).
- **Limits:** filling a kind past its limit evicts the least recently used entry and keeps the most recent ones.
- **Shuffle:** the suite runs alone and with `--sequence.shuffle` before commit.
- **Node versions:** it compares only runs within one process, so no engine literal depends on the Node version.

**Playwright:** a new root script, `test_result_cache.js`, both planners.
- **Freezing:** it turns `__test_freezeSimResults(true)` on, opens every result card, and visits every chart view:
  - projection;
  - ±1 yr, ±3 yrs, CAGR;
  - Fix one partner;
  - historical;
  - Monte Carlo at each path count, real and nominal.

  It also runs the scenario comparison and the print report, and dispatches a few slider steps. Any page error fails it.
- **Stability:** the Monte Carlo success rate and band text are identical across: a re-render, opening and closing a card,
  switching the chart view away and back, and real / nominal.
- **Revisits:** stepping a slider to a new value and back returns the earlier figures exactly.

**Existing tests:**
- `tests/engine_purity.js` and `tests/unit/shared/engine-ratchet.test.js` pass unchanged.
- `tests/snapshot.js` (the engine snapshots) does not move.
- `tests/snapshot_ui.js` hashes the rendered text with every card open, but does not appear to open the Monte Carlo view. It
  should not move. If it does, the commit says which values moved and why.
- **Counters:** a hit skips the engine, so `planStats`, `magiStats` and the `testHooks` counters are not bumped. The
  `__test_simulate` / `__test_runHistoricalCycles` hooks keep going through the cache. If a test that resets a counter and
  reads it back fails, the fix is a bypass for those hooks (a cache-off switch or the raw `simulateWith` path), not a weaker
  test.

## 6. Changes from the proposal

1. **The Monte Carlo summary** (section 3): the proposal cached `runMonteCarlo(n)` with its paths, about 29 MB per entry. The
   summary is about 4 KB, so more entries fit and revisits in the Monte Carlo view are hits too.
2. **The state JSON is computed per call**, not once per state change (section 4, with the reason).
3. **LRU eviction** instead of clearing when full.

## 7. Measuring after the change, and expected results

The section 1 script runs again against the built tree.
- **Default view:** the duplicate `simulate()` calls within one render become hits, so a slider step should be no slower and
  likely a little faster.
- **Monte Carlo view:**
  - a re-render with no input change, and a slider value already visited, should cost about the same as the default view;
  - a **new** value still runs every path (about 840 ms in the US). Deferring that run is PR B.

## 8. Docs, version and commits

- **Version badges:** both planners' badges are bumped (user-facing: the Monte Carlo figure is now reproducible).
- **README:** a feature-list line saying the same.
- **CLAUDE.md:** a new invariant line under "Engine and run context": the result cache lives in the store layer
  (`simulate.js`); its key must cover every context field a run reads; results are shared, so never write to one.
- **`docs/architecture/engine.md`:** a paragraph on the store wrappers, the cache and the seed.
- **`docs/architecture/test-inventory.md`:** the new Vitest suite and root script.
- **Module map:** `npm run analyze` for the new module and exports.
- **Commits:** one for the seed, one for the summary, one for the cache and its tests, each with `npm test` green. Nothing is
  pushed and no PR is opened until the owner asks.
