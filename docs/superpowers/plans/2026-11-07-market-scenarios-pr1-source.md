# Market scenarios, PR 1: the scenario year source — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A normalized `marketScenario` input (a custom crash list or a real-history window), a year source that turns it into
yearly stock, bond, yield and inflation figures, and one choke point so every normal run (dashboard, cliff plan, plan search,
the analysis cards) uses it when present. There is no UI in this PR, and nothing changes for a state without a scenario.

**Architecture:** `marketScenario` is an optional key on `state`. It is **absent** when off: never `null`, never in `defaults`,
so the JSON of every existing state, every cache key, the Monte Carlo seeds and the plan fingerprints stay byte-identical.
`scenarioYearSource(inputs, taxFactors)` computes each year's inputs as a pure function of the year index. `runSourceFor(ctx)`
picks `{ ctx, mode, source }` from the inputs and replaces the hard-wired `STANDARD_MODE` / `standardYearSource` at the five
run sites.

**Tech Stack:** plain ES modules under `src/`, Vitest 5 (Node 22.12+), esbuild build.

**Spec:** `docs/superpowers/specs/2026-11-06-market-scenarios-design.md` (sections 1–3 and 7 are this PR; read it first, then
CLAUDE.md's engine invariants and `docs/architecture/engine.md`, "Year source and mode").

## Global Constraints

- The engine reads only `ctx`. The new modules hold **no module-level mutable**: if one appears it is registered in
  `tests/engine-purity.json`, but none is needed.
- One context shape: every context comes from `newRunContext` (`src/shared/core/projection/run-context.js`).
- With no `marketScenario`, every run is the very same run as today: `npm test` (snapshots, golden, every Vitest file) passes
  unchanged and `node tests/bench_runs_interleaved.js --warm-analysis` shows no regression.
- Exact tests only: `toBe` / `toStrictEqual`, hand-computed literals, never `toBeCloseTo` (CLAUDE.md "Writing a Vitest test").
- New `core/` modules: line 1 is a one-line `//` purpose comment, then a blank line, with two-space body indentation (as in
  `year-sources.js`). Run `npm run analyze` after adding them.
- No version-badge bump and no README change (nothing user-facing yet).
- Percent units, as in the rest of `state`: `drop: 35` means 35%. The source converts with `pct()` (`n / 100`,
  `src/shared/core/format/numbers.js`).

## Review Focus

1. **A crash or history start age already in the past** (`age < ageA`): it must not throw or shift the plan. The crash starts
   in year 0, and a real-history window is already underway (Task 2 tests E and H).
2. **A 100% drop or other out-of-range values from a hand-edited save:** drop is clamped to 95, so the index never hits zero and
   never divides by zero, and bad rows are dropped (Task 1 tests).
3. **The data's end:** a window that runs past 2025 falls back to the plan's rates from 2026 on, and an `endAge` at or below
   `atAge` means no real years (Task 2 tests F and G).
4. **The plan-rate years inside a scenario carry exactly the plan's rate,** with no float drift from the index arithmetic,
   for any drop, not just exactly-binary ones (Task 2 tests A, I and K; Task 3's rows-before-the-crash test).
5. **The Monte Carlo market paths ignore the scenario:** the same seed, and for a fixed plan the same cached result
   (Task 3 test). The plan those views run is the plan in use, which in the US can be the scenario's plan (decision in
   Task 3).

---

## File structure

- Create `src/shared/core/inputs/market-scenario.js`: `normalizeMarketScenario(raw)` and the range constants. The year
  bounds read from `HIST` get a `// load-time:` comment block.
- Create `src/shared/core/projection/scenario-source.js`: `scenarioYearSource(inputs, taxFactors)`.
- Create `src/shared/core/projection/run-source.js`: `runSourceFor(ctx)`, the choke point.
- Modify `src/us/ui/inputs/normalize-state.js` and `src/canada/core/inputs/normalize-state.js`: call the normalizer.
- Modify `src/shared/core/projection/runs.js` (`simulateWith`, `simulateWithAccountLog`),
  `src/us/core/projection/run-projection.js:3298` (`computeCliffPlan`'s `run`), `src/us/core/optimizer/plan-search.js:76`
  (`runOn`), and `src/us/ui/install-test-hooks.js:168, 261, 337` (their standard branches only): run through `runSourceFor`.
- Modify `src/shared/core/projection/simulate.js`: `monteCarloSeed` and `successKey` leave `marketScenario` out.
- Tests: `tests/unit/shared/market-scenario-normalize.test.js`, `tests/unit/shared/scenario-source.test.js`,
  `tests/unit/shared/run-source.test.js`, `tests/unit/us/scenario-plan.test.js`. Files under `tests/unit/shared/` run in both
  Vitest projects.
- Docs: create `docs/architecture/market-scenarios.md`, then list it in CLAUDE.md's "Topic files" and in
  `docs/architecture/test-inventory.md`. Add one line under "Year source and mode" in `docs/architecture/engine.md`.

---

### Task 1: The `marketScenario` shape and its normalizer

**Files:**
- Create: `src/shared/core/inputs/market-scenario.js`
- Modify: `src/us/ui/inputs/normalize-state.js`, `src/canada/core/inputs/normalize-state.js`
- Test: `tests/unit/shared/market-scenario-normalize.test.js`

**Interfaces:**
- Produces: the normalized shape every later task reads. Only the active kind's part is kept:
  ```js
  { kind: 'crash', order: 'bucket' | 'standard',
    crashes: [{ age, drop, fallYears, recoverPct, recoverYears, inflation, bondReturn }, ...] }   // 1..10 rows, list order kept
  { kind: 'history', order: 'bucket' | 'standard',
    history: { startYear, atAge, endAge } }                                                     // endAge: integer or null
  ```
- Produces: `normalizeMarketScenario(raw) -> object | undefined` (undefined means off). It never mutates `raw` and always
  returns a fresh object.

Rules (*my calls*; record them in the topic file):

- `kind` must be `'crash'` or `'history'`, or the whole scenario is `undefined`.
- `order` other than `'standard'` becomes `'bucket'` (the default).
- A field counts as a number only if it is a finite number, or a non-blank string `Number` reads as finite (the rule at
  normalize-state.js:14). `''`, `null`, `true` and `[]` are not numbers. A row with any field that is not a number is
  dropped, and is never "fixed" with a default.
- A crash row that is not a plain object is dropped. `crashes` that is not an array, or `history` that is not a plain
  object, makes the scenario off. An `endAge` that is not blank and not a number makes the scenario off.
- Crash fields are clamped, then integers are rounded with `Math.round`:
  - `age`: integer, 0–120
  - `drop`: 0–95
  - `fallYears`: integer, 1–10
  - `recoverPct`: 0–100
  - `recoverYears`: integer, 1–30
  - `inflation`: −15 to 30
  - `bondReturn`: −50 to 50
- At most 10 crashes; extra rows are dropped. Zero valid crashes makes the scenario `undefined`.
- History fields:
  - `startYear`: integer clamped to `HIST[0][0]..HIST.at(-1)[0]`, read from `historical-data.js` (1928–2025).
  - `atAge`: integer, 0–120.
  - `endAge`: `null`, `undefined` or `''` → `null`; otherwise integer, 0–120.
  - A non-finite `startYear` or `atAge` makes the scenario `undefined`.

- [ ] **Step 1: Write the failing tests** (each `it` builds its own `world()`, loads `shared/core/inputs/market-scenario.js`)

```js
it('a valid crash scenario round-trips as a fresh object, list order kept', ...)
  // in: { kind:'crash', order:'bucket', crashes:[C1, C2] } with C1 = { age:60, drop:35, fallYears:2, recoverPct:60,
  //      recoverYears:4, inflation:0.5, bondReturn:12 }, C2 = { ...C1, age:70 }
  // expect(out).toStrictEqual(in); expect(out).not.toBe(in); expect(out.crashes[0]).not.toBe(in.crashes[0])
it('clamps and rounds crash fields', ...)
  // { age:60.4, drop:100, fallYears:0, recoverPct:150, recoverYears:99, inflation:-40, bondReturn:80 }
  // -> { age:60, drop:95, fallYears:1, recoverPct:100, recoverYears:30, inflation:-15, bondReturn:50 }
it('drops a row with a field that is not a number; no rows left means off', ...)
  // crashes [{ ...C1, drop:'x' }, C1] -> crashes [C1];  crashes [{ ...C1, age:NaN }] -> undefined;
  // drop '' / null / true / [] each drop the row;  drop '35' is read as 35;  crashes [null, C1] -> [C1]
it('malformed containers are off', ...)
  // crashes 'x' / {} -> undefined;  kind 'history' with history null / [] / 5 -> undefined;  endAge 'abc' -> undefined
it('keeps at most 10 crashes', ...)            // 12 copies of C1 -> length 10
it('order: anything but "standard" becomes "bucket"', ...)   // order:'zzz' -> 'bucket'; order:'standard' kept
it('an unknown kind, null or a non-object is off', ...)      // kind:'x' / null / 'str' / 5 -> undefined
it('history: clamps the start year to the data and normalizes endAge', ...)
  // { kind:'history', history:{ startYear:1900, atAge:52, endAge:'' } } -> { kind:'history', order:'bucket',
  //   history:{ startYear:1928, atAge:52, endAge:null } };  startYear 2100 -> 2025;  endAge 70.6 -> 71
it('keeps only the active kind', ...)          // kind:'crash' with a history key too -> no `history` key in the output
it('normalizeState: no marketScenario key when off, the normalized one when on', ...)
  // w.setState({}) -> 'marketScenario' in state === false;  w.setState({ marketScenario:{ kind:'x' } }) -> false;
  // w.setState({ marketScenario: CRASH }) -> state.marketScenario toStrictEqual the normalized CRASH
it('normalizeState leaves the JSON of a state without a scenario unchanged', ...)
  // JSON.stringify(normalizeState({})) has no "marketScenario" substring
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/shared/market-scenario-normalize.test.js`
Expected: FAIL (the module is not found).

- [ ] **Step 3: Implement `normalizeMarketScenario(raw)` in `src/shared/core/inputs/market-scenario.js`** following the rules
  above. In both `normalizeState`s, after `normalizeLists` and before `return`:
  `const ms = normalizeMarketScenario(s.marketScenario); if (ms) s.marketScenario = ms; else delete s.marketScenario;`
  with a comment explaining why the key is deleted rather than set to null (the spread carries unknown keys through, and a
  null key would change every state's JSON, cache key and Monte Carlo seed).

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/unit/shared/market-scenario-normalize.test.js` (both projects).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/core/inputs/market-scenario.js src/us/ui/inputs/normalize-state.js src/canada/core/inputs/normalize-state.js tests/unit/shared/market-scenario-normalize.test.js
git commit -m "Market scenarios: the marketScenario input and its normalizer"
```

---

### Task 2: `scenarioYearSource`

**Files:**
- Create: `src/shared/core/projection/scenario-source.js`
- Test: `tests/unit/shared/scenario-source.test.js`

**Interfaces:**
- Consumes: Task 1's normalized shape, read from `inputs.marketScenario`, plus `inputs.ageA`, `returnRate`, `inflation` and
  `bondReturn`.
- Produces: `scenarioYearSource(inputs, taxFactors) -> { inflation, yearInputs(year), endOfYear() }`. It has the same
  contract as `historicalYearSource`:
  - `yearInputs` returns `{ stockReturn, bondReturn, bondYield, factor, limitFactor }` and writes `taxFactors[year] = factor`.
  - `endOfYear()` compounds the year's inflation.
  - `inflation` is `pct(inputs.inflation)`.
  - It has **no `startYear` property**, so `runProjection` treats the run as non-historical and rows keep today's shape. PR 2
    adds the display factor.
  - `taxFactors` must be a fresh array; the caller (Task 3) provides it.

The algorithm (spec section 3). `y` is the plan year, `r = pct(returnRate)`, and the defaults are `stock = r`,
`infl = pct(inflation)`, `bond = pct(bondReturn)` and `yield = bond`.

- **Crash kind.**
  - For each crash, `D = pct(drop)`, `F = fallYears`, `R = pct(recoverPct)`, `N = recoverYears`, and
    `t0 = max(0, age − ageA)`.
  - `q(t)`:
    - `t < t0`: 1
    - `t0 ≤ t < t0+F`: `Math.pow(1 − D, (t − t0 + 1) / F)`
    - `t0+F ≤ t < t0+F+N−1`: `(1 − D) * Math.pow(qEnd / (1 − D), (t − t0 − F + 1) / N)`, with `qEnd = 1 − D * (1 − R)`
    - from `t0+F+N−1` on (the last recovery year included): `qEnd` itself. The pow form's last year is often not `qEnd` in
      floating point (for D = 0.65, `0.65 * (1/0.65)`), which would make the next year drift off the plan rate (review B1).
  - `Q(t)` is the product over the crashes taken in a **sorted copy** of the list, by `(age, drop, fallYears, recoverPct,
    recoverYears)`, with `Q(−1) = 1`. With 3 or more crashes, the association order of the product changes the last bits,
    so sorting makes the stock path exactly independent of list order.
  - `t0` uses `Math.round(age − ageA)`, so a fractional `ageA` can never give fractional exponents.
  - If `Q(y) === Q(y − 1)`, then `stock = r` exactly. Otherwise `stock = (1 + r) * Q(y) / Q(y − 1) − 1`, evaluated left to
    right in exactly that order (the tests' literals depend on it).
  - If `y` is a fall year of one or more crashes (`t0 ≤ y < t0+F`), the **last-listed** of them sets
    `infl = pct(crash.inflation)` and `bond = pct(crash.bondReturn)`. `yield` stays at `pct(inputs.bondReturn)`: the crash's
    bond figure is a total return, and the coupon is the plan's (*my call*; the same reasoning as the yield comment in
    `historical-data.js`).
- **History kind.**
  - `t0 = atAge − ageA` (may be negative), and `i = (startYear − HIST[0][0]) + (y − t0)`.
  - When `y ≥ t0`, `0 ≤ i < HIST.length` and (`endAge === null` or `ageA + y < endAge`), the row `HIST[i]` gives
    `stock = row[1] / 100`, `infl = row[2] / 100`, `bond = row[3] / 100` and
    `yield = row[4] != null ? row[4] / 100 : Math.max(0, bond)`. These are the very expressions `historicalYearSource` uses.
  - Otherwise the defaults apply.
- **Factor.** `factor = limitFactor`:
  - Until the first year whose inflation differs from the plan's has been served, the factor is
    `Math.pow(1 + pct(inflation), y)`: the standard source's very expression, so the years before a crash match a
    no-scenario run bit for bit.
  - From then on it is the running product `cumFactor`. It is seeded with the last pow value and multiplied by `1 + infl`
    of each year served.
- **Ages in history.** `t0 = Math.round(atAge − ageA)` as well.
- Each call computes `yearInputs(y)` directly from `y`, with no running state other than `cumFactor`. It allocates nothing
  beyond the returned object, as the standard source does.

- [ ] **Step 1: Write the failing tests.** Each builds `src = scenarioYearSource(inputs, tf = [])` and a helper `serve(n)`
  that calls `yearInputs(y)`, then `endOfYear()`, for `y = 0..n−1`, collecting the results. The base inputs are
  `B = { ageA: 50, returnRate: 50, inflation: 0, bondReturn: 4 }`, a plain object (the source is pure; no `setState`).

```js
it('A: a full recovery lands back on the plan line; plan-rate years are exactly the plan rate', ...)
  // B + crash { age:52, drop:75, fallYears:2, recoverPct:100, recoverYears:2, inflation:100, bondReturn:20 }
  // stockReturn y0..y6:  [0.5, 0.5, -0.25, -0.25, 2, 2, 0.5]
  // bondReturn  y0..y6:  [0.04, 0.04, 0.2, 0.2, 0.04, 0.04, 0.04];  bondYield all 0.04
  // factor y0..y6:       [1, 1, 1, 2, 4, 4, 4];  tf toStrictEqual the same array;  limitFactor === factor each year
it('B: 0% recovery is permanent; the recovery years change nothing', ...)
  // B with returnRate 0 + crash { age:50, drop:50, fallYears:1, recoverPct:0, recoverYears:3, inflation:0, bondReturn:4 }
  // stockReturn y0..y5: [-0.5, 0, 0, 0, 0, 0];  same result with recoverYears 1 and 30
it('C: a partial recovery closes that share of the gap and stays there', ...)
  // returnRate 0 + crash { age:50, drop:75, fallYears:1, recoverPct:50, recoverYears:1, ... }
  // stockReturn y0..y3: [-0.75, 1.5, 0, 0];  product of (1+stock) over y0..y3 === 0.625
it('D: crashes stack and the stock path does not depend on list order', ...)
  // returnRate 0, X = { age:50, drop:50, fallYears:1, recoverPct:0, recoverYears:1, inflation:0, bondReturn:4 },
  // Y = { ...X, age:51 }:  [X, Y] -> stock y0..y2 [-0.5, -0.5, 0];  [Y, X] -> the same array
it('D2: in overlapping fall years the later-listed crash sets inflation and bonds', ...)
  // X = { age:50, fallYears:2, inflation:10, bondReturn:-10, drop:10, ... }, Y = { age:51, fallYears:1, inflation:20, bondReturn:5, drop:10, ... }
  // [X, Y]: y1 bondReturn 0.05, and factor y2 === (1 + 0.1) * (1 + 0.2);   [Y, X]: y1 bondReturn -0.1
it('E: a crash age already past starts in year 0', ...)
  // returnRate 0, crash { age:45, drop:50, fallYears:1, recoverPct:0, ... }, ageA 50 -> y0 stock -0.5
it('F: real history from an age, then the plan rates after the data ends', ...)
  // { ageA:50, returnRate:7, inflation:0, bondReturn:4, marketScenario:{ kind:'history', order:'bucket',
  //   history:{ startYear:2008, atAge:52, endAge:null } } }
  // y0, y1: stock 0.07, bond 0.04, yield 0.04
  // y2 (2008): stock -36.55/100, bond 20.1/100, yield 4.10/100;  y3 (2009): stock 25.94/100, yield 2.42/100
  // y3 factor === 1 * (1 + 0.11 / 100);  y19 (2025): stock 17.78/100;  y20: stock 0.07, bond 0.04
it('G: endAge stops the real years; endAge at or below atAge means none', ...)
  // endAge 53: y2 is 2008, y3 stock 0.07;  endAge 52 and endAge 40: y2 stock 0.07
it('H: a start age already past means the window is underway', ...)
  // startYear 2000, atAge 48, ageA 50 -> y0 is 2002: stock -21.97/100, bond 15.12/100, yield 5.09/100
it('the source has no startYear (rows keep the standard shape)', ...)   // expect('startYear' in src).toBe(false)
it('I: non-binary values: every year after the recovery is exactly the plan rate', ...)
  // returnRate 7, crash { age:50, drop:35, fallYears:2, recoverPct:60, recoverYears:4, inflation:0.5, bondReturn:12 }:
  //   stockReturn y6..y12 each toBe(0.07);  also drop:1, fallYears:1, recoverPct:30, recoverYears:1: y2..y8 each toBe(0.07)
  // (the review's sweep of drop 1..95 x R {0,30,50,60,100} x F {1,2,3} x N {1,2,4,7} may be kept as a loop: every year
  //  from t0+F+N on toBe(0.07))
it('J: three crashes in any order give the identical stock path', ...)
  // X/Y/Z = drops 35, 20, 10 at ages 51, 52, 53 (F 2, R 60, N 3), returnRate 7: all 6 permutations toStrictEqual
it('K: before the first off-plan year the factor is the standard pow', ...)
  // inflation 2.5, crash at ageA + 5: factor y0..y5 toBe(Math.pow(1 + 2.5 / 100, y))   (the standard source's expression)
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/shared/scenario-source.test.js`
Expected: FAIL (the module is not found).

- [ ] **Step 3: Implement `scenarioYearSource` in `src/shared/core/projection/scenario-source.js`** as specified. It imports
  `pct` and `HIST`, and only those.

- [ ] **Step 4: Run the tests and see them pass.** Also run them on Node 24 if it is installed; every literal is exact in
  binary, so both versions must agree.

Run: `npx vitest run tests/unit/shared/scenario-source.test.js`
Expected: PASS in both projects.

- [ ] **Step 5: Commit**

```bash
git add src/shared/core/projection/scenario-source.js tests/unit/shared/scenario-source.test.js
git commit -m "Market scenarios: the scenario year source"
```

---

### Task 3: The run choke point, `runSourceFor`

**Files:**
- Create: `src/shared/core/projection/run-source.js`
- Modify: `src/shared/core/projection/runs.js:11-19`, `src/us/core/projection/run-projection.js:3298`,
  `src/us/core/optimizer/plan-search.js:76`, `src/us/ui/install-test-hooks.js:168, 261, 337`,
  `src/shared/core/projection/simulate.js:43-44, 108-111`
- Test: `tests/unit/shared/run-source.test.js`, `tests/unit/us/scenario-plan.test.js`

**Interfaces:**
- Consumes: `scenarioYearSource` (Task 2), `standardYearSource`, `STANDARD_MODE` / `BUCKET_MODE` through the existing seams
  (`#country/core/seam-STANDARD_MODE`, `#country/core/seam-BUCKET_MODE`), and `newRunContext`.
- Produces: `runSourceFor(ctx) -> { ctx, mode, source }`:
  - Without `ctx.inputs.marketScenario`: `{ ctx, mode: STANDARD_MODE, source: standardYearSource(ctx.inputs) }`, with the
    very `ctx` passed in.
  - With a scenario: the mode is `BUCKET_MODE`, or `STANDARD_MODE` when `order === 'standard'`. `ctx` is a new
    `newRunContext` copy of every field except `taxFactors: []`, as `pathContext` in `simulate.js` does. The source is
    `scenarioYearSource(ctx.inputs, thatCopy.taxFactors)`.
- Import graph: `run-source.js` imports `year-sources.js`, `scenario-source.js`, `run-context.js` and the two mode seams.
  `year-modes.js` imports nothing, and every module `run-source.js` reaches is a leaf, so there is no cycle. US
  `run-projection.js` and `plan-search.js` import `run-source.js` by relative path. Remove the imports this makes unused:
  - `standardYearSource` in run-projection.js:13, plan-search.js:4 and the test hooks;
  - `STANDARD_MODE` in plan-search.js:6 and the test hooks;
  - run-projection.js:31's `STANDARD_MODE` only if nothing else uses it.

  Check with `node tests/ui_cycles.js` and the build.
- **The historical and Monte Carlo views** (*decision, review S2*): they run their own market paths with the plan in use. In
  the US that is the plan `planForState` makes on the inputs, so while a scenario is on it is the scenario's plan; their
  success rates can change and they use their own cache entries. Only the market paths and the Monte Carlo seed ignore the
  scenario. PR 2's note on those views says exactly this.

Each run site becomes
`const run = runSourceFor(ctx); runProjection(run.ctx, { mode: run.mode, source: run.source, ...rest })`, keeping its other
options as they are. In `computeCliffPlan`, `ctxFor` and `runCtx` are unchanged. The objectives keep pricing with `runCtx`, the
plan's own factors; pricing in the scenario's own dollars is PR 2, spec section 8. In the US test hooks, only the `STANDARD_MODE`
branches change, and the explicit-history branches stay.

`simulate.js`: `monteCarloSeed` and `successKey` also destructure `marketScenario` out, next to `storedPlan`, with a comment
saying the historical and Monte Carlo views ignore the scenario (spec, non-goals).

- [ ] **Step 1: Write the failing tests**

`tests/unit/shared/run-source.test.js` (both countries; `CRASH` is Task 2 test A's scenario on the default inputs, with
`age: state.ageA + 2`):

```js
it('without a scenario: the same ctx, STANDARD_MODE, a standard source', ...)
  // r = runSourceFor(ctx); expect(r.ctx).toBe(ctx); expect(r.mode).toBe(STANDARD_MODE);
  // expect(r.source.yearInputs(3)).toStrictEqual(standardYearSource(ctx.inputs).yearInputs(3))
it('with a scenario: a fresh context with its own taxFactors, the bucket mode by default', ...)
  // r.ctx !== ctx; r.ctx.taxFactors toStrictEqual []; Object.keys(r.ctx) toStrictEqual Object.keys(ctx);
  // r.mode === BUCKET_MODE; two calls give two different taxFactors arrays
it('order "standard" picks STANDARD_MODE', ...)
it('simulateWith on a scenario equals the explicit scenario run', ...)
  // after w.setState({ marketScenario: CRASH }): simulateWith(await w.ctx()).rows toStrictEqual
  // runProjection(c2, { mode: BUCKET_MODE, source: scenarioYearSource(c2.inputs, c2.taxFactors), retireAgeA, retireAgeB }).rows,
  // where c2 = await w.ctx({ taxFactors: [] }) (if w.ctx does not pass taxFactors through, build it with newRunContext
  // from w.ctx()'s fields)
it('a scenario changes the projection; without it simulateWith is unchanged', ...)
  // rows with CRASH !== rows without (some row's total differs); a second no-scenario run toStrictEqual the first
it('the Monte Carlo seed and the Monte Carlo result ignore the scenario for a fixed plan', ...)
  // monteCarloSeed(2026, 100, s) === monteCarloSeed(2026, 100, { ...s, marketScenario: CRASH });
  // cOff = await w.ctx() (withPlan false); then setState with CRASH, cOn = await w.ctx():
  // expect(monteCarloSummaryWith(cOn, 2)).toBe(monteCarloSummaryWith(cOff, 2))   (the same cached object: successKey ignores it)
it('with order "standard", the rows before the crash equal the no-scenario rows', ...)
  // planMode off (w.ctx(), withPlan false); crash at ageA + 5, inflation 2.5:
  // rows.slice(0, 5) toStrictEqual the no-scenario rows.slice(0, 5)
it('the choke point stays the choke point', ...)
  // read src/**/*.js as text (fs, as tests/unit/helpers/historical-parity.js reads src): `standardYearSource(` appears as a
  // call only in src/shared/core/projection/year-sources.js and run-source.js
```

`tests/unit/us/scenario-plan.test.js` (US; reuse `tests/unit/us/plan-search.test.js`'s pattern and a household from
`helpers/scan-grid.mjs` where the cliff plan is active, e.g. `'couple 58, trad-heavy, ACA (NY)'` from `GAP_CASES`):

This file's `applyMeasure(plan)` **runs through the choke point**: `simulateWith` on an `at('apply', plan)` context (which
goes through `runSourceFor`), priced with `at('off', null)`. It never calls `runProjection` with `STANDARD_MODE` /
`standardYearSource` directly, as `plan-search.test.js:80-89` does, because that would skip the scenario (review S1).

```js
it('the cliff plan plans on the scenario: its kept measure is the scenario apply run', ...)
  // with CRASH on: applyMeasure(computeCliffPlan(ctx).plan) toStrictEqual keptMeasure of its report
it('optimizePlan under a scenario: measure, current and gain all priced on the scenario', ...)
  // with CRASH on and a valid storedPlan (the winner of a first optimizePlan, as plan-search.test.js:151 stores it):
  // applyMeasure(r.plan) toStrictEqual r.measure;  applyMeasure(storedPlan) toStrictEqual the measure fields of r.current;
  // r.gain === gainInTodaysDollars(obj, priceCtx, applySim(r.plan), applySim(reference)), where reference is the plan
  // r.gain is measured against (plan-search.js:187-190)
it('the plan under a scenario differs from the plan without it', ...)
  // JSON.stringify(plan with CRASH) !== JSON.stringify(plan without)   (if equal for this household, pick one where a
  //   75% drop at the first retirement year changes the conversions; record which in the test's comment)
it('choose replays as apply under a scenario, in both orders (review S3)', ...)
  // with CRASH on, order 'bucket' and then 'standard': a 'choose' run's intents, orders and splits, fed to an 'apply' run
  // through the same choke point, give toStrictEqual rows. Planning has never run in BUCKET_MODE or with tax factors
  // before (cliff-plan.md:44, :128). If this fails, CLAUDE.md test rule 7 applies: commit the test as it.fails with a
  // comment, report the engine bug to the owner, and do not fix src/ in the test commit.
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/shared/run-source.test.js tests/unit/us/scenario-plan.test.js`
Expected: FAIL (`run-source.js` is not found; the scenario is not used yet).

- [ ] **Step 3: Implement `runSourceFor`** and switch the five sites and `simulate.js` as described.

- [ ] **Step 4: Run them and see them pass, then run the whole fast loop**

Run: `npx vitest run tests/unit/shared/run-source.test.js tests/unit/us/scenario-plan.test.js`, then `npm run test:unit`, then
`npx vitest run --sequence.shuffle tests/unit/shared/market-scenario-normalize.test.js tests/unit/shared/scenario-source.test.js tests/unit/shared/run-source.test.js tests/unit/us/scenario-plan.test.js`
Expected: all PASS, and no existing test changes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/core/projection/run-source.js src/shared/core/projection/runs.js src/shared/core/projection/simulate.js src/us/core/projection/run-projection.js src/us/core/optimizer/plan-search.js src/us/ui/install-test-hooks.js tests/unit/shared/run-source.test.js tests/unit/us/scenario-plan.test.js
git commit -m "Market scenarios: every normal run goes through runSourceFor"
```

---

### Task 4: Docs, module map and the full gate

**Files:**
- Create: `docs/architecture/market-scenarios.md`
- Modify: `CLAUDE.md` ("Topic files": one line), `docs/architecture/engine.md` ("Year source and mode": one line naming
  `scenarioYearSource` and `runSourceFor`), `docs/architecture/test-inventory.md` (the four new test files),
  `docs/superpowers/inventory/*` (generated)

- [ ] **Step 1: Write `docs/architecture/market-scenarios.md`.** Cover:
  - The input's shape and normalizer rules, with the clamp ranges.
  - Why the key is absent when off.
  - The source's algorithm, including the exact evaluation order and the yield rule.
  - `runSourceFor` and its five sites. A new run site must use it, or that run ignores the scenario.
  - The Monte Carlo and historical exclusion.
  - Which spec sections PR 2 and PR 3 still owe.
  - A "Related" line linking engine.md and the spec.
  Also record in the topic file:
  - **The PR 2 pricing sites** (review S4): computeCliffPlan's `runCtx` (run-projection.js:3297), plan-search's `copyCtx` and
    `measureOn` (:75-79), objectives.js `realCost`, `objectiveBreakdown` and `gainInTodaysDollars` (:37, :43, :68), and
    `endTaxUS` / `afterTaxEndValueUS`. They still deflate by the plan's inflation, and the brackets they apply are the plan's.
  - **The lookahead approximations shared with the historical runs**: `irmaaGrowth2` and the ladder sizing use
    `source.inflation` (run-projection.js:341, :349), and `lambdaEstimate` uses `returnRate` (solver.js:388).
  - **During PR 1**, a hand-edited save carrying `marketScenario` runs the planner in a crash with no indicator. Nothing in
    the UI writes the key until PR 2, which strips it on load and import. This is accepted for PR 1.
- [ ] **Step 2: Add the CLAUDE.md lines.**
  - Under "Topic files": `- [market-scenarios.md](docs/architecture/market-scenarios.md) — the marketScenario input, the
    scenario year source, runSourceFor (the run choke point).`
  - Under "Engine and run context": `- A new run site of the normal projection goes through runSourceFor
    (src/shared/core/projection/run-source.js), or that run silently ignores a market scenario (tests/unit/shared/run-source.test.js).`
  - Update the comments at run-projection.js:3258 and plan-search.js:51, and cliff-plan.md:44 and :128: planning can now run
    in BUCKET_MODE and with tax factors, under a scenario.
  - Add one line to inputs-and-ui.md: `marketScenario` has no `defaults` value and no `FIELDS` entry. It is absent when off,
    and the normalizer owns it.
- [ ] **Step 3: Run the generators.** Run `npm run analyze`. Expected: `module-map.md` and the closure files gain the three
  modules with their purpose lines.
- [ ] **Step 4: Run the full gate.** Run `npm test`. Expected: PASS, with no snapshot or golden change. Then run
  `node tests/bench_runs_interleaved.js --warm-analysis`. Expected: within noise (the no-scenario path adds one small object
  per run). Record both results in the PR description.
- [ ] **Step 5: Commit**

```bash
git add docs/architecture/market-scenarios.md CLAUDE.md docs/architecture/engine.md docs/architecture/cliff-plan.md docs/architecture/inputs-and-ui.md docs/architecture/test-inventory.md docs/superpowers/inventory src/us/core/projection/run-projection.js src/us/core/optimizer/plan-search.js
git commit -m "Market scenarios: topic file, module map and test inventory"
```
