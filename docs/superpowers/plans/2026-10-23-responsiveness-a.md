# Responsiveness PR A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monte Carlo gives the same result for the same plan, and a re-render with unchanged inputs reuses the last
projection, backtest and Monte Carlo results instead of re-running them.

**Architecture:**
- **Store layer only:** everything lives in the store wrappers in `src/shared/core/projection/simulate.js`. No engine module
  changes.
- **Seed:** Monte Carlo draws its blocks from a mulberry32 generator seeded by an FNV-1a hash of the tax year, the path
  count and a key-sorted serialization of the inputs.
- **Summary:** the Monte Carlo view gets a small summary (the percentile bands and the counts) instead of all the paths.
- **Cache:** `simulate`, `runHistoricalCycles` and the summary are cached in per-kind LRU maps, keyed on everything a run
  reads. The `window.__test_*` hooks call uncached versions.

**Tech Stack:** plain ES modules, esbuild build (`npm run build`), Vitest 5 (Node 22.12+), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-responsiveness-a-design.md`. Read it, plus CLAUDE.md, before Task 1. Where this
plan and the spec differ, the plan is the later decision. Also read before Task 1:
- `docs/architecture/engine.md`;
- the cliff-plan section of `docs/architecture/cliff-plan.md`.

## Global Constraints

- **Where to work:** the worktree `C:\Users\Alex\code\Fire-Planner\.claude\worktrees\cranky-babbage-970d4f`, branch
  `claude/responsiveness-a`. Never run `git stash`, never touch other worktrees, never push or open a PR (the owner asks
  for that).
- **Commits:** each ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Engine purity:** no engine module changes. Everything new is in the store layer (`simulate.js`), `core/format/`
  (pure) or `ui/`. `tests/engine_purity.js` must pass.
- **Vitest rules** (CLAUDE.md, "Where a new test goes"):
  - load `src/` only through `world()` / `w.load`;
  - exact comparisons only (`toBe`, `toStrictEqual`, `not.toBe`), never `toBeCloseTo`;
  - expected numbers are hand-computed literals or comparisons of two runs in one process, never literals copied from an
    engine run;
  - no `it.concurrent`;
  - a new suite passes alone and with `npx vitest run --sequence.shuffle`.
- **Module rules:**
  - line 1 of a new `core/` or `ui/` module is a one-line `//` purpose comment, then a blank line;
  - two-space indentation inside module bodies, as the surrounding code;
  - a module-level initializer that computes something (`new Map()`) has a `// load-time: <reason>` comment directly
    above it (as `cliffPlanCache` in `src/us/core/cliff-plan/planning.js:14-16`);
  - after adding a module or changing exports, run `npm run analyze`.
- **Versions:** bump the topbar badges in Task 1: US `V130` → `V131` (`src/us/index.html`), Canada `V60` → `V61`
  (`src/canada/index.html`).
- **Snapshots:**
  - `tests/snapshot.js` (the engine snapshots) must not move.
  - `tests/snapshot_ui.js` is expected not to move, because it does not open the Monte Carlo view.
  - If `snapshot_ui` moves only in Monte Carlo figures, run `npm run snapshot:update` and list the moved values in that
    commit's message.
  - If anything else moves, stop and report.
- **Tests that fail:** a bug a test exposes in unrelated `src/` code is reported, not fixed in the same commit.

## Review Focus

1. **A cache key that misses an input:** two calls that differ in anything a run reads must never share a result. The
   cases are an override map given as a `Map` (`JSON.stringify` of a `Map` is `"{}"`), a plan with the same inputs, and a
   test switch. Pinned in Task 3, Step 1 (`override Map entries`).
2. **A cached result written by a caller:** any write must surface as an error in tests. Pinned in Task 3 (freeze switch)
   and Task 4 (every card and view with freezing on).
3. **A Monte Carlo figure that changes when it should not:** dismissing a warning, a different key order, or a re-render.
   Pinned in Task 1, Step 1, and Task 4.
4. **Real / nominal in the Monte Carlo view after the change:** the bands come from the summary; the wrong set would draw
   silently. Pinned in Task 2, Step 1 (`real bands are total / cumFactor`) and Task 4 (both modes).
5. **Counter-reading tests silently passing on a cache hit:** the hooks and the helper's raw functions must be uncached.
   Pinned in Task 3, Step 1 (`raw functions are uncached`), plus the full `npm test`.

---

### Task 1: Seeded Monte Carlo

**Files:**
- Modify: `src/shared/core/projection/simulate.js`
  - `bootstrapReturnSeries`, about lines 19-27;
  - `runMonteCarlo`, about lines 59-71.
- Modify: `src/us/ui/charts/chart-view.js:60` and `:66`, and `src/canada/ui/charts/chart-view.js`, the same two text lines.
- Modify: `README.md:58`; the version badges in `src/us/index.html` and `src/canada/index.html`.
- Modify: the comments in `tests/historical_rates.js:4-7` and `tests/bench_heavy.js:76`; `docs/architecture/test-inventory.md:148`;
  `docs/architecture/engine.md`, the paragraph on the store wrappers (about line 70-85).
- Create: `tests/unit/shared/monte-carlo.test.js`

**Interfaces:**
- Produces (exports of `simulate.js`):
  - `fnv1a32(str: string) -> number`: a uint32;
  - `monteCarloSeed(taxYear: number, pathCount: number, inputs: object) -> number`: a uint32;
  - `runMonteCarlo(pathCount)`: unchanged signature and return shape `{ paths, successRate, projectionYears }`, now seeded.

- [ ] **Step 1: Write the failing tests** in `tests/unit/shared/monte-carlo.test.js`. They run in both projects:
  `inject('country')`; the tax-year case runs only for `us`.
  - `fnv1a32 matches the published test vectors`:
    - `fnv1a32('')` is `2166136261`;
    - `fnv1a32('a')` is `3826002220`;
    - `fnv1a32('foobar')` is `3214735720`.
  - `the same inputs give the same paths in two worlds`: in two separate `world()`s, `setState({ cliffGuardEnabled: false })`
    on US (Canada `setState({})`), then `runMonteCarlo(20)` from `w.load('shared/core/projection/simulate.js')`. Map each path
    to its `rows.map((r) => r.total)`; the two results are `toStrictEqual`, and so are the success rates.
  - `key order does not change the seed`:
    - Take the normalized state `s`, build `r` with the same top-level keys in reverse order, and install it with
      `store.assignState(r)` (not `w.setState`, which normalizes and restores the order).
    - `monteCarloSeed(2026, 20, s)` is `monteCarloSeed(2026, 20, r)`.
    - A second case: `setState({ children: [{ birthYear: 2020 }] })` (both countries have `children: []` in `defaults.js`),
      then rebuild the state with the keys of each normalized `children` row reversed, whatever keys normalization gave it.
      Install it with `assignState`; the seed is unchanged.
  - `dismissed warnings do not change the seed`: changing `dismissedEstimates` to `['x']` and `dismissedUnusualAssumptions` to
    `['y']` leaves `monteCarloSeed` unchanged.
  - `each input changes the seed`: the seed changes (`not.toBe`) for:
    - `spending + 1000`;
    - path count 21 against 20;
    - US tax year 2027 against 2026 (`monteCarloSeed(2027, ...)`).
  - `the seed is a uint32`: `Number.isInteger(seed) && seed >= 0 && seed < 4294967296`.

- [ ] **Step 2: Run them and check they fail**

  Run: `npx vitest run tests/unit/shared/monte-carlo.test.js`
  Expected: FAIL (`fnv1a32` / `monteCarloSeed` are not exported).

- [ ] **Step 3: Implement in `simulate.js`**
  - **`fnv1a32(str)`:** `let h = 0x811c9dc5`; for each `i`, `h ^= str.charCodeAt(i); h = Math.imul(h, 16777619);` then
    `return h >>> 0`.
  - **`mulberry32(seed)`:** not exported; returns a generator. Its body is the generator in `tests/historical_rates.js:57`,
    with its own `let a = seed | 0`:
    ```js
    () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    ```
  - **`monteCarloSeed(taxYear, pathCount, inputs)`:**
    1. `const { dismissedEstimates, dismissedUnusualAssumptions, ...rest } = inputs`;
    2. `canonical = JSON.stringify(rest, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v)`;
    3. `return fnv1a32(taxYear + '|' + pathCount + '|' + canonical)`.
    
    A comment says why the two fields are left out (UI-only, the engine never reads them).
  - **`bootstrapReturnSeries(length, rand)`:** `Math.random()` becomes `rand()`.
  - **`runMonteCarlo(pathCount)`:** before the loop, `const rand = mulberry32(monteCarloSeed(storeContext({ withPlan: false }).taxYear, pathCount, state))`;
    pass `rand` to every `bootstrapReturnSeries`.
  - **The comment:** update the block-bootstrap comment above `MC_BLOCK_SIZE` to say the draws are seeded from the inputs.
  - **No module state:** no module-level generator.

- [ ] **Step 4: Run the tests and check they pass**

  Run: `npx vitest run tests/unit/shared/monte-carlo.test.js && npx vitest run tests/unit/shared/monte-carlo.test.js --sequence.shuffle`
  Expected: PASS in both projects.

- [ ] **Step 5: Update the copy and docs.** These two sentences are fixed copy:
  - **`chart-view.js`, both countries, the `mcSuccessSub` text:** replace `each built from randomly shuffled 5-year blocks of actual 1928–2025 market history.`
    with `each built from 5-year blocks of actual 1928–2025 market history. The blocks are drawn in an order set by your inputs, so the same plan always shows the same result.`
  - **`chart-view.js`, both countries, the note text:** replace `Each path stitches together random 5-year blocks` with
    `Each path stitches together 5-year blocks (picked pseudo-randomly, seeded by your inputs)`.
  - **README.md:58:** after the sentence ending `...within each block.`, add `The block order comes from a seed derived from your inputs, so the same plan always shows the same paths and success rate; changing any input or the path count draws a different, equally reproducible set.`
  - **Badges:** US `V130` → `V131`, Canada `V60` → `V61`.
  - **`tests/historical_rates.js` header comment and `tests/bench_heavy.js:76`:** the `Math.random` stub only matters
    against an older, unseeded tree (`--root`); a seeded tree draws from its inputs. Keep both stubs.
  - **`test-inventory.md:148`:** `(seeded)` becomes `(seeded from the inputs; `--seed` applies only to an older, unseeded --root tree)`.
  - **`engine.md`:** one sentence in the store-wrapper paragraph saying that `runMonteCarlo` seeds mulberry32 with
    `monteCarloSeed(taxYear, pathCount, inputs)`. The seed is a key-sorted serialization without the dismissed-warning
    fields.

- [ ] **Step 6: Run the full suite**

  Run: `npm test`
  Expected: PASS. `tests/snapshot.js` and `tests/snapshot_ui.js` are unchanged (see Global Constraints if not).

- [ ] **Step 7: Commit**

  ```bash
  git add src/shared/core/projection/simulate.js src/us/ui/charts/chart-view.js src/canada/ui/charts/chart-view.js src/us/index.html src/canada/index.html README.md tests/historical_rates.js tests/bench_heavy.js tests/unit/shared/monte-carlo.test.js docs/architecture/test-inventory.md docs/architecture/engine.md
  git commit -m "Monte Carlo: seed the block bootstrap from the inputs (same plan, same result)"
  ```
  Add the attribution line. If `npm run analyze` changed `docs/superpowers/inventory/` (new exports), add those files too.

---

### Task 2: The Monte Carlo summary

**Files:**
- Create: `src/shared/core/format/monte-carlo-bands.js`
- Modify: `src/shared/core/projection/simulate.js` (add `monteCarloSummary`)
- Modify: `src/shared/ui/charts/monte-carlo-chart.js:14-46` (take the summary)
- Modify: `src/us/ui/charts/chart-view.js:54-70` and `src/canada/ui/charts/chart-view.js:54-70`
- Modify: `tests/unit/helpers/engine.js` (expose `monteCarloSummary`; US wrapped in `ensureTestPlan`, as the others)
- Test: `tests/unit/shared/monte-carlo.test.js` (extend)

**Interfaces:**
- Consumes: `runMonteCarlo(pathCount)` from Task 1.
- Produces:
  - **`monteCarloBands(paths, projectionYears, valueFn)`** (in `monte-carlo-bands.js`): returns
    `Array<{ year, p10, p25, p50, p75, p90 }>`, one entry per `year = 0..projectionYears`.
  - **`monteCarloSummary(pathCount)`** (in `simulate.js`, uncached until Task 3): returns
    `{ successRate, survived, pathCount, projectionYears, bands: { nominal, real } }`.
    - `nominal` is `monteCarloBands(paths, projectionYears, (r) => r.total)`;
    - `real` uses `(r) => r.total / r.cumFactor`;
    - `survived` is the count of paths with no `depletedAge`;
    - `pathCount` is `paths.length`.
  - **`renderMonteCarloChart(summary)`:** the second parameter (`valueFn`) is removed.

- [ ] **Step 1: Write the failing tests** (append to `monte-carlo.test.js`)
  - `bands are the interpolated percentiles`: 11 fake paths, path `i` has `rows: [{ total: 10 * i, cumFactor: 2 }]`
    (`i = 0..10`, so totals 0, 10, ..., 100), `projectionYears = 0`.
    - `monteCarloBands(paths, 0, (r) => r.total)` is `toStrictEqual([{ year: 0, p10: 10, p25: 25, p50: 50, p75: 75, p90: 90 }])`.
    - Shuffle the paths' order first: the result must not depend on it.
  - `real bands are total / cumFactor`: the same paths with `(r) => r.total / r.cumFactor` give
    `[{ year: 0, p10: 5, p25: 12.5, p50: 25, p75: 37.5, p90: 45 }]`.
  - `the summary matches the full run`: in one world, `const mc = runMonteCarlo(20)` and `const s = monteCarloSummary(20)`.
    - `s.successRate` is `mc.successRate`;
    - `s.survived` is the count of `mc.paths` with no `depletedAge`;
    - `s.pathCount` is `20`;
    - `s.projectionYears` is `mc.projectionYears`;
    - `s.bands.nominal` is `toStrictEqual(monteCarloBands(mc.paths, mc.projectionYears, (r) => r.total))`, and the same for
      `real`;
    - `s` has no `paths` key.

- [ ] **Step 2: Run them and check they fail**

  Run: `npx vitest run tests/unit/shared/monte-carlo.test.js`
  Expected: FAIL (module not found / not exported).

- [ ] **Step 3: Implement**
  - **`monte-carlo-bands.js`:** line 1 is `// Monte Carlo percentile bands: the 10th-90th percentile totals by year across paths`.
    Move the `pctl` helper and the `bands` loop out of `monte-carlo-chart.js:29-46` **verbatim** (the same `.map`, the same
    `.sort((a, b) => a - b)`, the same interpolation), with `year` in place of `age`.
  - **`monteCarloSummary`:** in `simulate.js`, built on `runMonteCarlo` as specified in Interfaces.
  - **`renderMonteCarloChart(summary)`:**
    - `const bands = summary.bands[mode === 'real' ? 'real' : 'nominal']`;
    - every later use of `b.age` becomes `state.ageA + b.year`;
    - `mc.projectionYears` becomes `summary.projectionYears`;
    - nothing else in the drawing code changes.
  - **Both `chart-view.js`:**
    - `const mc = monteCarloSummary(mcPathCount)`;
    - `mc.paths.filter((p) => !p.depletedAge).length` becomes `mc.survived`;
    - `mc.paths.length` (three places) becomes `mc.pathCount`;
    - drop the `runMonteCarlo` import if unused.
  - **`tests/unit/helpers/engine.js`:** add `monteCarloSummary` to both branches. The US one is
    `(...a) => (ensureTestPlan(), monteCarloSummary(...a))`.
  - **`npm run analyze`.**

- [ ] **Step 4: Run the tests and check they pass**

  Run: `npx vitest run tests/unit/shared/monte-carlo.test.js --sequence.shuffle`
  Expected: PASS.

- [ ] **Step 5: Check the chart draws the same pixels**
  1. Before this task's first edit, make a scratch copy of the Task 1 commit: `git worktree add <scratch>/base HEAD`, then
     `npm ci && npm run build` inside it. Remove it at the end with `git worktree remove <scratch>/base`. This is the only
     worktree you may create or touch. `<scratch>` is any folder outside the repo.
  2. For each planner, in both trees, a Playwright snippet opens the page:
     - `page.clock.install({ time: new Date('2026-06-15T12:00:00Z') })`;
     - click `#chartGroupMcBtn`;
     - read `document.getElementById('chart').toDataURL()` in real mode, then in nominal mode, then with log scale on.
       Switch with `page.evaluate(() => document.getElementById('nominalBtn').click())` (`#realBtn` / `#nominalBtn` sit in
       a dropdown, and a Playwright click on a hidden element waits 30 s). Log scale is `#logScaleToggle`.
  3. Every data URL must be identical between the two trees.
  4. Delete the snippet and the scratch tree afterwards. Nothing is committed from this step.

- [ ] **Step 6: Run the full suite**

  Run: `npm test`
  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add src/shared/core/format/monte-carlo-bands.js src/shared/core/projection/simulate.js src/shared/ui/charts/monte-carlo-chart.js src/us/ui/charts/chart-view.js src/canada/ui/charts/chart-view.js tests/unit/helpers/engine.js tests/unit/shared/monte-carlo.test.js docs/superpowers/inventory
  git commit -m "Monte Carlo: the chart view reads a summary (bands and counts), not every path"
  ```

---

### Task 3: The result cache

**Files:**
- Modify: `src/shared/core/projection/simulate.js`
- Modify: `src/shared/ui/install-test-hooks.js:151-154` (the hooks)
- Modify: `src/us/ui/install-test-hooks.js:153` (`__test_simulateRaw`) and `:158-161`
- Modify: `tests/unit/helpers/engine.js` (raw functions uncached)
- Modify: `tests/unit/us/tax-caches.test.js:94-95` (use `simulateRaw`)
- Modify: `CLAUDE.md` ("Engine and run context"), `docs/architecture/engine.md`, `docs/architecture/test-inventory.md:31`
- Create: `tests/unit/shared/result-cache.test.js`

**Interfaces:**
- Consumes: `monteCarloSummary`, `runMonteCarlo` (Tasks 1-2).
- Produces (exports of `simulate.js`):
  - **Cached:** `simulate(a, b)`, `runHistoricalCycles()`, `monteCarloSummary(n)`, with unchanged signatures.
  - **Uncached:** `simulateFresh(a, b)` and `runHistoricalCyclesFresh()`, identical to today's bodies.
  - **Unchanged:** `runMonteCarlo(n)` stays uncached; `simulateHistorical` and `simulateAtRealCagr` are unchanged.
  - **The limits:** `RESULT_CACHE_LIMITS = Object.freeze({ sim: 64, hist: 8, mc: 16 })`.
  - **The freeze switch:** `assignFreezeResults(on: boolean)`.
  - **New hook:** `window.__test_freezeSimResults(on)`.
  - **Vitest helper:** `simulate`, `runHistoricalCycles` and `monteCarloSummary` cached; `simulateRaw` and
    `simulateHistoricalRaw` uncached; a new `runHistoricalCyclesRaw`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/shared/result-cache.test.js`
  - **Setup:**
    - In each `it`, a fresh `world()` and `w.load('shared/core/projection/simulate.js')`.
    - US cases start from `w.setState({ cliffGuardEnabled: false })`, so no cliff plan is computed.
    - A plan is installed by writing the loaded `us/core/cliff-plan-store.js` object: `cliffPlanStore.plan = P`,
      `forState = store.state`, `year = 2026`. `planForState`'s identity rule returns it even with the guard off, and
      `storeContext()` then runs in `apply` mode.
    - Overrides and test switches: write the properties of the loaded `optimizerState` (`us/core/optimizer-state.js`) and
      `testHooks` (`us/core/test-hooks.js`) objects, then reset them. Vitest has no window hooks.
    - Monte Carlo cases use path counts of 2 to 18.
  - **`hits return the identical object`:** for each of `simulate()`, `simulate(60, 58)`, `runHistoricalCycles()` and
    `monteCarloSummary(2)`, called twice with nothing changed, the second result `toBe` the first.
  - **`simulate() shares the entry of its resolved ages`:** `simulate()` `toBe` `simulate(state.retireAgeA, state.retireAgeB)`.
  - **`a state change misses, and changing back hits`:**
    1. `a = simulate()`;
    2. `setState({ ..., spending: s + 1000 })`, then `b = simulate()`: `not.toBe(a)`;
    3. back to the old spending through `assignState` of an equal object, then `simulate()` `toBe(a)`.
    
    Run it in both countries.
  - **`an equal plan in a new object is a hit` (US):** install a plan `P`, then `a = simulate()`; install
    `structuredClone(P)`, then `simulate()` is `toBe(a)`. This is the slider A → B → A case: `refreshCliffPlan` makes a new
    but equal plan object.
  - **`each key part forces a fresh run` (US):** start from `a = simulate()`; after each change, `simulate()` is
    `not.toBe(a)`; restore before the next change.
    - `w.setTaxYear(2027)`;
    - **a different plan:** write `cliffPlanStore.plan = { intents: { 70: { kind: 'under', line: 'aca400', ret: 'H' } }, family: 'aca' }`,
      `forState = state` and `year = 2026`;
    - **plan null against `{ intents: {} }`** (the planMode case);
    - **override Map entries:**
      - `optimizerState.rothBracketByAge = new Map([[60, 22]])`;
      - then a different `new Map([[60, 24]])`, which must also miss against the first Map's entry;
      - the same for `withdrawalMixByAge`;
    - `testHooks.testInhNoNeedAdj = true`;
    - `testHooks.testInhForce = { year: 1, slot: 0, x: 1000 }`.
  - **`arguments are part of the key`:** `simulate(60, 58)` `not.toBe` `simulate(61, 58)`, and `monteCarloSummary(2)` `not.toBe`
    `monteCarloSummary(3)`.
  - **`least recently used is evicted` (`sim`):** on one guard-off state, fill `RESULT_CACHE_LIMITS.sim` distinct age pairs
    (`simulate(st.ageA + (i % 20), st.ageB + Math.floor(i / 20))` for `i = 0 .. limit - 1`), keeping each result.
    1. Touch entry 0 again (a hit).
    2. Add one new pair.
    3. Entry 0 is still `toBe` its kept result; entry 1 is now `not.toBe` its kept result (evicted); the newest is a hit.
  - **The other limits:** the same check for `mc` (`monteCarloSummary(n)` for `n = 2 ..`) and `hist` (vary `spending` on a
    guard-off state).
  - **`raw functions are uncached`:** through `engine(w)` (`tests/unit/helpers/engine.js`):
    - `simulateRaw()` `not.toBe` `simulateRaw()`;
    - `runHistoricalCyclesRaw()` `not.toBe` `runHistoricalCyclesRaw()`;
    - `simulateFresh()` `not.toBe` `simulate()`, and `toStrictEqual` its rows.
  - **`freezing`:** after `assignFreezeResults(true)`:
    - `Object.isFrozen(simulate().rows[0])` is `true`;
    - writing `simulate().rows[0].total = 1` inside a function in strict mode throws (Vitest modules are strict);
    - a US result's non-enumerable `irmaaAppeal`, if present, is frozen, and its typed arrays are not;
    - `assignFreezeResults(false)` afterwards.

- [ ] **Step 2: Run them and check they fail**

  Run: `npx vitest run tests/unit/shared/result-cache.test.js`
  Expected: FAIL (no cache; `simulateFresh` not exported).

- [ ] **Step 3: Implement in `simulate.js`**
  - **The uncached functions:** rename the current bodies of `simulate` and `runHistoricalCycles` to `simulateFresh` and
    `runHistoricalCyclesFresh`.
  - **The caches:** one `Map` per kind, each with a `// load-time: creates an empty cache Map; reads nothing` comment.
  - **The helper:** a private `cached(cache, limit, key, ctx, run)`.
    - **On a hit:** the stored entry is used only if all of these equal the current context's:
      - `entry.planMode === ctx.planMode`;
      - `entry.plan === JSON.stringify(ctx.plan)`;
      - `entry.overrides === overridesKey(ctx.overrides)`;
      - `entry.test === JSON.stringify(ctx.test)`.
      
      Then delete and re-insert the entry (LRU) and return `entry.result`.
    - **On a miss:** run `run()`, deep-freeze the result if `freezeResults` is on, delete any stale entry under the key,
      delete the first (oldest) key if `cache.size >= limit`, then insert.
  - **`overridesKey(o)`:** `JSON.stringify([entriesOf(o.rothBracketByAge), entriesOf(o.withdrawalMixByAge)])`, where
    `entriesOf(m)` is `m instanceof Map ? [...m] : m`. A comment says why: the optimizers build `Map`s, and the JSON of a
    `Map` is `"{}"`.
  - **The key strings:** `kind + '|' + args + '|' + ctx.taxYear + '|' + JSON.stringify(ctx.inputs)`.
    - `sim`: `args = retireAgeA + ',' + retireAgeB`, after the default parameters resolve;
    - `hist`: `''`;
    - `mc`: `pathCount`.
    
    A comment notes that JSON writes `NaN` / `±Infinity` as `null` and `-0` as `0` (accepted; spec section 4).
  - **`simulate(retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB)`:** `const ctx = storeContext()`, then
    `cached(..., () => simulateWith(ctx, retireAgeA, retireAgeB))`. This reuses the key's context, so it equals
    `simulateFresh`.
  - **`runHistoricalCycles()`:** `const ctx = storeContext()` for the key, then `cached(..., runHistoricalCyclesFresh)`.
  - **`monteCarloSummary(n)`:** the same, with `kind` `mc`.
  - **`deepFreeze(v)`:** returns `v`. It skips non-objects, frozen objects and `ArrayBuffer.isView(v)`, and freezes children
    before the parent through `Object.getOwnPropertyNames`, so non-enumerables (`estate`, `cliffIntents`, `irmaaAppeal`) are
    reached.
  - **`assignFreezeResults(on)`:** sets the module-level `let freezeResults = false`.

- [ ] **Step 4: Wire the hooks and the helper**
  - **`src/shared/ui/install-test-hooks.js`:**
    - `window.__test_simulate = simulateFresh`;
    - `window.__test_runHistoricalCycles = runHistoricalCyclesFresh`;
    - `window.__test_runMonteCarlo` stays `runMonteCarlo`;
    - add `window.__test_freezeSimResults = assignFreezeResults`.
  - **`src/us/ui/install-test-hooks.js`:**
    - `__test_simulateRaw = simulateFresh`;
    - `__test_simulate = (...a) => (ensureTestPlan(), simulateFresh(...a))`;
    - `__test_runHistoricalCycles = (...a) => (ensureTestPlan(), runHistoricalCyclesFresh(...a))`;
    - the analysis hooks that call `simulate()` (lines 82-108) stay cached.
  - **`tests/unit/helpers/engine.js`:**
    - `simulateRaw` → `simulateFresh`;
    - add `runHistoricalCyclesRaw` → `runHistoricalCyclesFresh`, in both branches (the US one without `ensureTestPlan`, as
      the other raw functions);
    - update the header comment: the cached functions are `simulate` / `runHistoricalCycles` / `monteCarloSummary`; the raw
      ones match the uncached `window.__test_*` hooks.
  - **`tests/unit/us/tax-caches.test.js:94`:** `e.simulate(...)` → `e.simulateRaw(...)`. Compiled flags are not in the key.

- [ ] **Step 5: Run the tests and check they pass**

  Run:
  ```
  npx vitest run tests/unit/shared/result-cache.test.js
  npx vitest run tests/unit/shared/result-cache.test.js --sequence.shuffle
  npm run test:unit
  ```
  Expected: PASS. If an existing suite that reads counters fails, move it to the helper's raw functions. Do not loosen its
  assertion.

- [ ] **Step 6: Docs**
  - **CLAUDE.md, "Engine and run context":** add one bullet:
    > The store wrappers `simulate`, `runHistoricalCycles` and `monteCarloSummary` (`src/shared/core/projection/simulate.js`)
    > cache their results: the key must cover every context field a run reads (a `Map` is keyed by its entries); results
    > are shared, so never write to one (`__test_freezeSimResults`); a test that reads engine counters or changes module
    > state (compiled rule flags, synthetic rule rows) uses the uncached functions (`simulateFresh`, the `__test_*` hooks,
    > the Vitest helper's `*Raw`).
  - **`engine.md`:**
    - a short paragraph on the cache: the key, the limits, LRU, the uncached functions, the summary;
    - fix "Called many times per render" to say the store wrappers are cached, so repeated calls within a render are hits.
  - **`test-inventory.md:31`:** the helper's cached and raw functions; add the two new suites.
  - **`npm run analyze`.**

- [ ] **Step 7: Run the full suite**

  Run: `npm test`
  Expected: PASS. The suite includes `tests/engine_purity.js`, `tests/snapshot.js` and `tests/snapshot_ui.js`.

- [ ] **Step 8: Commit**

  ```bash
  git add src/shared/core/projection/simulate.js src/shared/ui/install-test-hooks.js src/us/ui/install-test-hooks.js tests/unit/helpers/engine.js tests/unit/us/tax-caches.test.js tests/unit/shared/result-cache.test.js CLAUDE.md docs/architecture/engine.md docs/architecture/test-inventory.md docs/superpowers/inventory
  git commit -m "Store layer: cache simulate, runHistoricalCycles and the Monte Carlo summary (bounded LRU)"
  ```

---

### Task 4: UI check with frozen results (root script)

**Files:**
- Create: `test_result_cache.js` (repo root; picked up by `npm run test:ui` by its name)
- Modify: `docs/architecture/test-inventory.md` (one line for the script)

**Interfaces:**
- Consumes: `window.__test_freezeSimResults(on)` (Task 3), the chart view buttons:
  - `#chartGroupProjectionBtn`, `#chartGroupHistBtn`, `#chartGroupMcBtn`;
  - `#chartView1Btn`, `#chartView3Btn`, `#chartViewCagrBtn`;
  - `#chartShiftGapBtn`.

  Also the `#mcSuccessRate` and `#mcSuccessSub` text.

- [ ] **Step 1: Write the script.** Shape as `test_state_notes.js`:
  - a header comment naming it a UI check for `npm run test:ui`;
  - `page.on('pageerror')` collected;
  - `assert`;
  - exit code 1 on failure;
  - one closing `console.log` line.

  For each planner (`dist/Planner_US.html`, `dist/Planner_Canada.html`), at 1280x900 with
  `page.clock.install({ time: new Date('2026-06-15T12:00:00Z') })`:
  1. Call `__test_freezeSimResults(true)` before anything renders a result:
     - install it with `page.addInitScript`, which polls until the hook exists;
     - or call it right after load, then trigger one render by dispatching `input` on a slider and restoring its value.
  2. Open every `details` result card (`document.querySelectorAll('details')` inside the results column: set `open` and
     dispatch `toggle`).
  3. Visit each projection view (±1 yr, ±3 yrs, CAGR), then Fix one partner, then historical, then Monte Carlo. In Monte
     Carlo, visit each path count: `#mcPaths500Btn`, `#mcPaths1000Btn`, `#mcPaths2000Btn`. Toggle the dollar display in
     each view with `page.evaluate(() => document.getElementById('nominalBtn').click())` (and `realBtn`). The buttons sit in
     a dropdown, and a Playwright click on a hidden element waits its full 30 s.
  4. Read `#mcSuccessRate` and `#mcSuccessSub` in the Monte Carlo view.
     - Then close and reopen one card, switch to Projection and back to Monte Carlo, and toggle real/nominal twice.
     - Both texts are identical each time (`assert.strictEqual`).
  5. Step a slider to a new value and back (US `k401PctA`, Canada `rrspPctA`): the Monte Carlo texts equal the first read.
  6. `assert.deepStrictEqual(errors, [])`.

  The scenario comparison and print are left out: the comparison needs saved scenarios, and print opens a window. Both
  call `simulate()` on a swapped-in state, which the Vitest state-change cases cover.

  Prefer locator waits over fixed waits. A short `waitForTimeout(150)` is allowed only where a render is debounced (the
  plan status bar's 500 ms historical rate).

- [ ] **Step 2: Run it**

  Run: `npm run build && node test_result_cache.js`
  Expected: PASS, one summary line, under about 30 s.

- [ ] **Step 3: Check it catches a write.** Temporarily add `selected.rows[0].total = 0;` after `const selected = simulate()`
  in `src/us/ui/results/render.js:41`, rebuild, and run the script. It must FAIL with a page error naming a read-only
  property. Revert the line, rebuild, and run again: PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add test_result_cache.js docs/architecture/test-inventory.md
  git commit -m "Tests: a UI check that no caller writes to a cached result and the Monte Carlo figure is stable"
  ```

---

### Task 5: Measure, document, final checks

**Files:**
- Modify: `docs/reference.md` (one entry, as its other entries)
- Modify: `docs/superpowers/specs/2026-10-23-responsiveness-a-design.md` (a section "10. Measured after")

- [ ] **Step 1: Measure.**
  1. Save the timing script below as `tests/_bench_step_tmp.js` (it resolves `playwright` from the repo). It is never
     committed.
  2. Run it against a build of the base commit `320f374` (a scratch `git worktree add`, then `npm ci && npm run build` there;
     remove it afterwards), and against this branch's `dist/`.
  3. Delete the script.
  ```js
  const { chromium } = require('playwright'); const path = require('path');
  const DIST = path.resolve(process.argv[2]); const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  (async () => { const browser = await chromium.launch();
    for (const [file, slider] of [['Planner_US.html', 'k401PctA'], ['Planner_Canada.html', 'rrspPctA']]) {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await page.goto('file://' + path.join(DIST, file)); await page.waitForTimeout(500);
      for (const view of ['proj', 'mc']) {
        if (view === 'mc') { await page.click('#chartGroupMcBtn'); await page.waitForTimeout(300); }
        const r = await page.evaluate((id) => { const el = document.getElementById(id), start = Number(el.value);
          const step = (v) => { el.value = String(v); const t = performance.now(); el.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - t; };
          const vals = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => (start + d * 3) % 101), fresh = [], back = [], same = [];
          for (const v of vals) fresh.push(step(v)); for (const v of [...vals].reverse()) back.push(step(v));
          for (let i = 0; i < 5; i++) same.push(step(vals[0])); step(start); return { fresh, back, same }; }, slider);
        console.log(`${file} ${view}: new ${med(r.fresh).toFixed(1)} ms | revisited ${med(r.back).toFixed(1)} ms | same ${med(r.same).toFixed(1)} ms`);
      } }
    await browser.close(); })();
  ```
  Expected:
  - **Projection view:** no slower than the base.
  - **Monte Carlo view:** "same" and "revisited" close to the projection view's figures; "new" is still the full run
    (PR B's work).

- [ ] **Step 2: Write the results**
  - **Design doc:** add section 10 to the spec with the before/after table.
  - **`docs/reference.md`:** add a short entry (date 2026-10-23) covering:
    - the seed;
    - the summary;
    - the cache and its key, with the `Map` trap;
    - the uncached hooks and why;
    - the measured figures.

- [ ] **Step 3: Final checks**

  Run:
  ```
  npm test
  npx vitest run --sequence.shuffle
  npm run test:ui
  ```
  Expected: all PASS. Also check the mobile width: at 390x844 in the Monte Carlo view, `document.documentElement.scrollWidth
  > document.documentElement.clientWidth` is `false` (the text lines changed).

- [ ] **Step 4: Commit**

  ```bash
  git add docs/reference.md docs/superpowers/specs/2026-10-23-responsiveness-a-design.md
  git commit -m "Docs: responsiveness PR A, measured before and after"
  ```
  Then stop. Report the commits and the measurement table; the owner decides when to push and open the PR.
