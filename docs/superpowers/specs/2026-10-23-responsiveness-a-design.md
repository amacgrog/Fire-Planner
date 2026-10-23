# Design: responsiveness PR A (seeded Monte Carlo and a result cache)

**Roadmap:** prep item 3, PR A (`docs/roadmap.md`, "Current plan"). **Proposal:**
`docs/superpowers/specs/2026-10-22-responsiveness-proposal.md`. This design follows the proposal, with three changes
(section 6). PR B (deferred rendering) is a separate later task.

## 1. Baseline (measured 2026-10-23 at `320f374`)

The built planners in headless Chromium (Playwright, 1280x900). Each figure is the median time of one slider `input` event
(`k401PctA` in the US, `rrspPctA` in Canada), which runs `render()` synchronously:

| | Projection view (the default ±3 yrs) | Monte Carlo view (1,000 paths) |
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
- **The seed:** a 32-bit FNV-1a hash of `taxYear + '|' + pathCount + '|' + canonical(inputs)`.
  - **`canonical`** is a JSON serialization with object keys sorted at every level (arrays keep their order). Plain
    `JSON.stringify` follows insertion order. A loaded file with legacy keys, or a list row added in the UI rather than
    loaded, would then change the seed without changing what the engine reads. Its cost (one serialization per Monte Carlo
    run, against an 800 ms run) does not matter.
  - **The hash** is exact integer arithmetic over the UTF-16 code units (`charCodeAt`): start at `0x811c9dc5`, then for each
    unit `h ^= c; h = Math.imul(h, 16777619)`, and `h >>> 0` at the end. A plain `h * 16777619` exceeds 2^53 and loses bits.
  - **Exactness:** mulberry32 (`Math.imul`, shifts, `/ 4294967296`) and `Math.floor(r * (maxStart + 1))` are exact on every
    engine, and the JSON number format is fixed by the language spec. So, unlike `Math.pow`, the paths do not differ between
    Node versions or browsers.
  - **What is left out of the seed:** the UI-only fields `dismissedEstimates` and `dismissedUnusualAssumptions` (both
    `defaults.js`). The engine never reads them, and dismissing a warning must not change the Monte Carlo figure. They stay
    in the cache key, where they only cost a miss.
- **The promise:** the same saved plan always gives the same paths and the same success rate, whatever its key order and
  whatever warnings are dismissed. Changing any input, the tax year or the path count gives a different, but equally
  reproducible, set of paths.
  - **The limit:** sorting fixes order, not presence. An unknown key that survives `normalizeState` (`{ ...defaults, ...raw }`)
    from an old file still changes the seed. Retired fields are deleted in `normalizeState` (CLAUDE.md, "Inputs"), so this is
    an unrecognized key, and it is accepted. A seed built from an allowlist of engine-read keys was considered and rejected:
    a forgotten new field would make the figure ignore an input.
- **What else changes:**
  - `Math.random` remains only in the scenario ids (`src/shared/ui/plans/scenarios.js`).
  - The Monte Carlo explanation in both `chart-view.js` files ("randomly shuffled 5-year blocks") says the blocks are drawn
    pseudo-randomly from a seed set by the inputs, so the same plan always shows the same result.
- **The figures move:** this is an intended behavior change. The Monte Carlo figures differ from today's random draws. Today
  they differ on every render anyway.
- **`tests/historical_rates.js` and `tests/bench_heavy.js`:** keep their `Math.random` stubs. On a seeded tree a stub does
  nothing, and a `--root` comparison against an older, unseeded tree stays reproducible. Their comments and
  `docs/architecture/test-inventory.md` say that `--seed` applies only to an unseeded tree.

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

Here `kind` is `sim`, `hist` or `mc`, and `args` is the path count or the **resolved** retirement ages (after the defaults
`state.retireAgeA/B` apply, so `simulate()` and `simulate(state.retireAgeA, state.retireAgeB)` share an entry). The string
key alone is not enough; the entry stores these too, and a hit requires each to equal the current context's:
- `ctx.planMode`;
- the JSON of `ctx.plan` (`{ intents, family }`, small; the engine reads only `plan.intents`). Identity would be wrong
  here: in the US, `refreshCliffPlan()` at the top of `render()` computes a new plan object whenever the state's JSON
  changes and never looks in `cliffPlanCache`. A slider moved A → B → A would then miss every entry at A. A plan can differ
  for the same inputs' JSON (`planForState`'s identity rule applies the kept plan to a state changed in place, and
  `__test_setCliffPlan` sets one), and the plan JSON catches that.
- the JSON of the two override maps (`ctx.overrides.rothBracketByAge`, `.withdrawalMixByAge`);
- the JSON of `ctx.test` (`inhForce`, `inhNoNeedAdj`).

**What JSON cannot tell apart:** `JSON.stringify` writes `NaN` and `±Infinity` as `null` and `-0` as `0`, so two states that
differ only there share a key. `normalizeState` clamps the numeric fields, and an engine run on a `NaN` input is already
wrong, so this is accepted and noted in the code comment rather than handled with a replacer.

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

**The registry and CLAUDE.md rules:**
- `simulate.js` is a store-layer module (`adapters` in `tests/engine-purity.json`), not an engine module, so its caches
  need no registry entry.
- Each cache `new Map()` initializer gets a `// load-time:` comment, as `cliffPlanCache` does in `planning.js`.
- The limits are exported constants, so the Vitest suite can fill a cache exactly.

**Uncached entry points for the test hooks.** `simulate.js` exports `simulateFresh(a, b)` and `runHistoricalCyclesFresh()`,
the uncached runs; the cached wrappers call them on a miss. The uncached `runMonteCarlo(n)` already exists (section 3).
Every `window.__test_*` projection hook calls the uncached functions:
- `__test_simulate`, `__test_simulateRaw`;
- `__test_runHistoricalCycles`;
- `__test_runMonteCarlo`.

The reasons:
- **Counter tests:** several tests reset an engine counter and read it back after a hook call on a state already simulated.
  - `tests/irmaa_appeal.js:231-233` and `:276-279`: `__test_simulate()`, then a reset, then `__test_simulateRaw()`;
  - `tests/inherited_accounts.js:703-705`, `:727-733` and `:1021-1023`;
  - `tests/aca_medicaid.js:253-256`.
  
  A hit would read zero.
- **Benchmarks:** the benches and scans time real runs.
- **The name:** `__test_simulateRaw` promises an uncached run.

The Vitest helper `tests/unit/helpers/engine.js` mirrors the hooks:
- **Uncached:** `simulateRaw` / `simulateHistoricalRaw` become the uncached functions (today `simulateRaw` maps to
  `simulate`).
- **Cached:** `simulate` / `runHistoricalCycles` stay the cached wrappers.
- **`tests/unit/us/tax-caches.test.js:91-107`:** runs a 459-state sweep twice, the second time under
  `withCompiledFlags(..., 'needsPerPerson', true)`, and compares the two. It moves to `simulateRaw`.
  - **Why:** compiled rule flags are module state and not in the key. The test recomputes today only because 459 keys cycle
    through a 64-entry LRU; with a larger limit or a shorter sweep, the comparison would become vacuous without failing.

**Not in the key: module state that only tests change.** The compiled rule flags (`withCompiledFlags`) and synthetic rule rows
(`withRuleRow`) change the engine's tables without changing the state. A test that changes them and then compares runs uses
the uncached functions. The section 8 CLAUDE.md line says so.

Still cached, and checked harmless: the analysis hooks (`src/shared/ui/install-test-hooks.js:52-97`, US `usAnalysisPerMode`
and `multiLeverPlannedWithoutMaps`) and `render()`. No counter is read around them, and `analysis_parity` compares JSON.
`mcp-tools.js` calls no projection function.

The production UI keeps the cached wrappers. Coverage of the cache comes from the UI path (every Playwright script renders
through it), the new root script and the new Vitest suite.

**A shared result must not be changed.** A grep found no caller that writes to a result's rows, cycles or fields; this
section makes that a test.
- **The switch:** a module-level `freezeResults` flag in `simulate.js`. It is set through an exported `assignFreezeResults(on)`
  and the shared test hook `window.__test_freezeSimResults(on)`. When on, every result is deep-frozen before it is stored,
  including the non-enumerable fields `estate`, `cliffIntents` and `irmaaAppeal`; the walk uses `Object.getOwnPropertyNames`.
  It cannot reach `state`: `estate.profile` is a fresh copy, and `dependents` is fresh or the already-frozen `NO_DEPENDENTS`.
  The walk skips typed arrays (`ArrayBuffer.isView`), because `Object.freeze` throws on one with elements. The US
  `irmaaAppeal` holds two `Int8Array`s (`irmaaAppealTable`, `src/us/core/healthcare/irmaa.js`), and those stay writable.
- **Production:** never sets it.
- **Strict mode does the checking:** the built app runs in strict mode, so a write to a frozen result throws, and a page error
  fails the Playwright script below.

## 5. Tests

**Vitest:** a new suite, `tests/unit/shared/result-cache.test.js`, through `world()`, exact comparisons, both countries where
the case applies.
- **Run cost:** the Monte Carlo cases use small path counts (2 to 20).
- **Seed:** the seed function `monteCarloSeed(taxYear, pathCount, inputs)` is exported, so the tests assert the seed
  itself. The bands would change with any input even on identical paths.
  - the same inputs give the identical Monte Carlo summary in two separate worlds;
  - the same inputs with a different key order give the same seed and summary. The reversed object is installed with the
    store's `assignState`, not `w.setState`, which normalizes and would restore the order; list rows with reversed keys
    are a second case.
  - changing a dismissed-warning field leaves the seed unchanged;
  - changing one input, the tax year (US) or the path count changes the seed;
  - the hash is checked against hand-computed FNV-1a values of two short strings.
- **Summary:** its bands equal `monteCarloBands` over the uncached `runMonteCarlo` paths, element by element.
- **Hits:** a second `simulate()`, `runHistoricalCycles()` or `monteCarloSummary(n)` with nothing changed returns the
  identical object (`toBe`).
- **Invalidation:** each key part forces a fresh run (`not.toBe`):
  - a state field;
  - the retirement-age arguments and the path count;
  - the tax year (US);
  - a different plan (US). Vitest has no window hooks, so the test writes the loaded `cliffPlanStore`'s `plan`, `forState`
    (the store's state) and `year` (the current tax year) the way `__test_setCliffPlan` does. A guard toggle would not
    isolate the plan, because it changes the state's JSON.
  - an equal plan in a new object is a **hit** (the A → B → A case);
  - the planMode: `storeContext()` derives it from the plan (`p ? 'apply' : 'off'`), so it cannot change alone through
    `simulate()`. The case is a plan of `null` (off) against `{ intents: {} }` (apply), whose JSON differs too;
  - each override map (US);
  - each test switch (US).
- **Limits:** filling a kind past its limit evicts the least recently used entry and keeps the most recent ones.
  - **`sim`:** filled by varying only the retirement-age arguments on one state, so no new cliff plans are computed (and
    `cliffPlanCache`, which clears at 16 entries, plays no part).
  - **`mc` and `hist`:** filled on a guard-off state with small path counts.
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
- **Counters:** a hit skips the engine, so `planStats`, `magiStats` and the `testHooks` counters are not bumped. The test
  hooks call the uncached functions (section 4), so the counter tests keep counting real runs. Checked: `__test_cliffPlanComputes`,
  `tests/cliff_plan.js` (`__test_runPlanMode`, uncached) and `tests/solver_scan.js:151-154` are unaffected.

## 6. Changes from the proposal

1. **The Monte Carlo summary** (section 3): the proposal cached `runMonteCarlo(n)` with its paths, about 29 MB per entry. The
   summary is about 4 KB, so more entries fit and revisits in the Monte Carlo view are hits too.
2. **The state JSON is computed per call**, not once per state change (section 4, with the reason).
3. **LRU eviction** instead of clearing when full.
4. **The plan is compared by its JSON**, and the Monte Carlo seed uses a key-sorted serialization without the UI-only fields (from the reviews, section 9).

## 9. Independent reviews

**First review (2026-10-23, of `ed0ad86`).**

A reviewer with no part in the design checked it against the code. No caller writes to a result, the cache key covers
everything a run reads, and the band move is pixel-identical. Its findings and what changed:

| Finding | Severity | Change |
|---|---|---|
| Hits would zero the counters that `irmaa_appeal.js`, `inherited_accounts.js` and `aca_medicaid.js` read back; `__test_simulateRaw` is plain `simulate` | blocker | the test hooks call uncached functions (section 4) |
| Plan identity: `refreshCliffPlan` makes a new plan per state JSON, so US revisits would never hit | should-fix | the plan is compared by its JSON (section 4) |
| The seed follows JSON key order | should-fix | key-sorted serialization for the seed (section 2) |
| The FNV-1a hash needs `Math.imul` and `>>> 0` | should-fix | spelled out (section 2) |
| The Vitest plan: how to set a plan without hooks, the guard toggle, the LRU fill, the run cost | should-fix | section 5 |
| `irmaaAppeal` is also non-enumerable | nit | named (section 4) |
| `NaN` / `-0` in the JSON key | nit | accepted, noted (section 4) |
| `load-time:` comments, resolved ages in the key, no registry entry needed, purpose comment | nit | section 4 |
| "randomly shuffled" in the Monte Carlo text | nit | reworded (section 2) |

**Second review (2026-10-23, of `105e736`):** no blocker. It confirmed:
- the plan JSON covers everything the engine reads from a plan;
- the per-path contexts inside the backtest and Monte Carlo runs get the same plan as the key's context;
- every render has at least one duplicate `simulate()` call (`render.js:41` and `plan-status-bar.js:34`).

| Finding | Severity | Change |
|---|---|---|
| Deep-freeze throws on the `Int8Array`s in `irmaaAppeal` | should-fix | the walk skips typed arrays (section 4) |
| The Vitest helper's `simulateRaw` maps to the cached `simulate`; `tax-caches.test.js` compares runs under changed compiled flags, which are not in the key | should-fix | helper raw functions uncached; tax-caches uses them; the rule is documented (section 4) |
| The seed would change when a warning is dismissed; sorting fixes order, not presence | should-fix | dismissed fields left out of the seed; the promise reworded (section 2) |
| The key-order, seed and planMode tests would not work as written | should-fix | exported seed, `assignState`, plan null vs empty (section 5) |
| `historical_rates.js` loses reproducible `--root` comparisons without its stub | nit | the stubs stay (section 2) |
| Docs: engine.md, README, test-inventory lines, reference.md | nit | section 8 |
| The baseline view is the default ±3 yrs | nit | section 1 |

**Left for later, not in PR A:** `refreshCliffPlan()` re-plans on every new state JSON without consulting `cliffPlanCache`,
so a revisited slider value still pays for planning in the US. Looking the plan and its report up there is a possible
follow-up, measured first.

## 7. Measuring after the change, and expected results

The section 1 script runs again against the built tree.
- **Default view:** the duplicate `simulate()` calls within one render become hits, so a slider step should be no slower and
  likely a little faster.
- **Monte Carlo view:**
  - a re-render with no input change, and a slider value already visited, should cost about the same as the default view
    (in the US a revisited value still re-plans the cliff plan in `refreshCliffPlan()`, as the default view does today);
  - a **new** value still runs every path (about 840 ms in the US). Deferring that run is PR B.

## 8. Docs, version and commits

- **Version badges:** both planners' badges are bumped (user-facing: the Monte Carlo figure is now reproducible).
- **README:** a feature-list line saying the same.
- **README:** the "randomly-ordered" blocks wording (`README.md:58`) is updated as well.
- **CLAUDE.md:** a new invariant line under "Engine and run context":
  - the result cache lives in the store layer (`simulate.js`), and its key must cover every context field a run reads;
  - results are shared, so never write to one;
  - a test that reads engine counters, or changes module state such as compiled rule flags, uses the uncached functions.
- **`docs/architecture/engine.md`:** a paragraph on the store wrappers, the cache and the seed, and a correction to its
  "called many times per render" text.
- **`docs/architecture/test-inventory.md`:**
  - the new Vitest suite and root script;
  - the helper change (line 31);
  - the `historical_rates.js` seed note (line 148).
- **`docs/reference.md`:** this work is outside the `docs/next-batches-plan.md` batches, so it gets a short entry in the
  same PR, per CLAUDE.md.
- **Module map:** `npm run analyze` for the new module and exports.
- **Commits:** one for the seed, one for the summary, one for the cache and its tests, each with `npm test` green. Nothing is
  pushed and no PR is opened until the owner asks.
