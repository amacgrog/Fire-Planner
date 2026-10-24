# Batch 5 step 2: Objective Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One objective registry (after-tax end value by default, lifetime real tax + healthcare as the alternative) that
the cliff plan, `optimizeMultiLever` and the US flat-bracket card score with, ready for step 3's outer search.

**Architecture:** A shared, country-free ranking module (`objectiveBetter`, `pickBest`) and a US pricing module (the two
objectives, the breakdown, the gain). The cliff plan is rewired through them byte-identically; `optimizeMultiLever` takes a
required objective id and keeps its own acceptance steps; the flat card ranks by the end value. No projection number moves.

**Tech Stack:** plain ES modules under `src/`, esbuild bundle, Vitest 5 (Node 22.12+), Playwright UI scripts.

**Spec:** `docs/superpowers/specs/2026-10-23-b5-objective-registry-design.md` (approved by the owner 2026-10-24). Read it
first; section numbers below refer to it.

## Global Constraints

- Exact to the cent: `toBe` / `toStrictEqual` only, never `toBeCloseTo`; hand-computed expected values stay literals.
- Engine modules (`core/analysis/`, `core/optimizer/`, `cliff-plan/`) take the context first, never import a store module
  or the store layer (`tests/engine_purity.js`); every top-level `const` holding an object is registered in
  `tests/engine-purity.json` with kind `"constant"` in the same commit.
- A computed module-level initializer (anything but literals, functions, arrows, classes, object/array literals of those)
  carries a `// load-time: <reason>` comment directly above it.
- Line 1 of every new `core/` / `ui/` module is a one-line `//` purpose comment, then a blank line; then `npm run analyze`.
- Two-space indentation in module bodies, as the surrounding modules; never reformat a module in a commit that changes it.
- Vitest: go through `world()`; `await w.load(...)`; contexts from `await w.ctx()` built after the last `setState`; counted
  suites use `makeCounter` and assert the total in `afterAll`; a new suite passes `npx vitest run --sequence.shuffle`.
- Objective ids are exactly `'endValue'` (default) and `'lifetimeCost'`; a missing or unknown id throws.
- `endValue` ranks on the nominal value with the $1 tolerance (`a.score > b.score + 1`); every figure shown or returned as a
  breakdown or gain is in today's dollars.
- No new saved field, no selector. US version badge V134 -> V135 (once, in Task 4). Commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git stash`; never touch other worktrees.

## Review Focus

1. **The display mode changes nothing.** A user who switches the chart to nominal dollars gets the same schedules, gain and
   Apply state as in real dollars (today the multi-lever score follows the toggle). Test: Task 4, Step 1 (engine) and Step 4 (`test_optimizer_ui.js`, the UI).
2. **Survivor and depleting households.** The end value prices the last year as the survivor's single return, and a
   depleting plan still ends with an estate; the breakdown must equal the row sums for both. Test: Task 2, Step 1
   (`survivor` and `depleting` households in the rows check).
3. **Identical runs across brackets.** For TX/NY-like plans every bracket from 12% up is the same run (step 0): the flat card
   must keep the current bracket when it ties, else the lowest tied, never an arbitrary one. Test: Task 5, Step 1.
4. **Nothing passes the guardrail.** The pick falls back to the latest depletion, then the score, and the "without
   shortening" sentence is not shown. Test: Task 4, Step 1 (`pickGuardedRun`) and Task 5, Step 1 (`pickFlatBracket`).
5. **The Apply gate at the boundary.** A gain of exactly $1 or less leaves Apply disabled; just over $1 enables it. Test:
   Task 4, Step 4 (`applyGateOpen`).

---

### Task 0: Base and baseline capture

**Files:**
- Create (scratch, never committed): `<scratchpad>/capture-multilever.js`, `<scratchpad>/base/dist/`, `<scratchpad>/base-lifetime.json`

**Interfaces:**
- Produces: `<scratchpad>/base-lifetime.json`, the pre-change `optimizeMultiLever` results Task 6 compares against.

- [ ] **Step 1: Check the base.** Step 0 must be in the branch: `test -f tests/bench_optimizer.js && grep -q "Table 2" tests/solver_gap.js && echo ok`. Expected: `ok`. (At the time of writing it is not: the controller merges `origin/main` after the owner merges step 0, or rebuilds the branch on `10acc51`, before dispatching any task.)

- [ ] **Step 1b: Check for step 1 (162(l) settlement).** Run `test -f src/us/core/projection/row-cost.js && echo merged`.
  If merged (step 1's branch `claude/b5-162l-settlement-1eab95`, helper commit `f92efdb`), the module exports
  `rowCost(r)` (`r.taxSettled + r.healthcareSettled` when `r.taxSettled !== undefined`, else `r.tax + r.healthcare`) and
  `rowTax(r)` (`r.taxSettled` when present, else `r.tax`). Then everywhere this plan sums `r.tax + r.healthcare` it uses
  `rowCost(r)`, `r.tax` becomes `rowTax(r)`, and `r.healthcare` becomes
  `r.taxSettled !== undefined ? r.healthcareSettled : r.healthcare` (Task 2's `lifetimeCost`, the breakdown and the tests
  that recompute them; spec section 8). Step 1 already points `measure`, `rothScheduleCost` and the card's `lifetimeTax`
  at its helpers, so those call sites move to the registry with the helper in them. If not merged, write the plain row
  expressions as below; step 1 then points the registry at its helpers.

- [ ] **Step 2: Build the unchanged tree into the scratchpad:** `node scripts/build.js --out <scratchpad>/base/dist`. Expected: `Planner_US.html` there.

- [ ] **Step 3: Write `capture-multilever.js`** (`--root DIR --objective ID --out FILE`). It loads `Planner_US.html` from `--root`
  (clock pinned to `2026-06-15T12:00:00Z`, as `tests/bench_optimizer.js`), and for each of the six scenarios of
  `tests/bench_optimizer.js` sets the state exactly as that script does (copy its scenario patches, its `gap()` /
  `legacyToAccounts` patch building, its `Object.assign(st, patch, { withdrawalMixEnabled: false, cliffGuardEnabled: true })`
  and its save / restore of the state), calls `__test_setOptimizerBudget(8000)`, then
  `__test_optimizeMultiLever(__test_simulate(), { includeRoth: true, includeMix: true, includeSmooth: true }, ID)` (the old
  hook ignores the third argument and scores in the store's mode, `'real'`). Inside `page.evaluate` it turns the Maps into
  entry arrays (Maps do not serialize) and returns per scenario
  `{ rothSchedule: [...entries], mixSchedule: [...entries], smoothWithdrawals, cost: 'value' in opt ? opt.value : opt.cost, depletedAge, evalCount, budgetExhausted }`.

- [ ] **Step 4: Capture:** `node <scratchpad>/capture-multilever.js --root <scratchpad>/base --objective lifetimeCost --out <scratchpad>/base-lifetime.json` (about 2 minutes). Expected: six entries.

---

### Task 1: The shared ranking module

**Files:**
- Create: `src/shared/core/analysis/objectives.js`
- Test: `tests/unit/shared/objectives.test.js`

**Interfaces:**
- Produces: `objectiveBetter(a, b) -> boolean` with `a`, `b` = `{ depletedAge: number | null, score: number }`;
  `pickBest(cands, preferred) -> cand`, `cands` an array of `{ depletedAge, score, ... }` (non-empty), `preferred(tied) -> cand`
  given the tied candidates in input order.

- [ ] **Step 1: Write the failing tests** (plain `it`/`expect`, no counter needed):

```js
// objectiveBetter
expect(B({ depletedAge: null, score: 0 }, { depletedAge: 80, score: 1e6 })).toBe(true);   // never depleting beats any age
expect(B({ depletedAge: 85, score: 0 }, { depletedAge: 80, score: 1e6 })).toBe(true);     // later depletion first
expect(B({ depletedAge: 80, score: 1e6 }, { depletedAge: 85, score: 0 })).toBe(false);
expect(B({ depletedAge: null, score: 101 }, { depletedAge: null, score: 100 })).toBe(false); // $1 is a tie
expect(B({ depletedAge: null, score: 100 }, { depletedAge: null, score: 101 })).toBe(false);
expect(B({ depletedAge: null, score: 101.5 }, { depletedAge: null, score: 100 })).toBe(true);
// pickBest: a ties b, b ties c, c beats a; the tied set is fixed by the maximum (1.6), not by order
const a = { id: 'a', depletedAge: null, score: 0 }, b = { id: 'b', depletedAge: null, score: 0.8 }, c = { id: 'c', depletedAge: null, score: 1.6 };
const first = (t) => t[0], ids = [];
pickBest([a, b, c], (t) => (ids.push(t.map((x) => x.id)), t[0]));
expect(ids).toStrictEqual([['b', 'c']]);
expect(pickBest([c, b, a], first)).toBe(c);
// depletion groups: only the latest-depletion group competes
expect(pickBest([{ depletedAge: 80, score: 1e6 }, { depletedAge: null, score: 0 }], first).score).toBe(0);
expect(pickBest([{ depletedAge: 80, score: 5 }, { depletedAge: 82, score: 0 }], first).depletedAge).toBe(82);
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/shared/objectives.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `objectiveBetter` and `pickBest` in `src/shared/core/analysis/objectives.js` (purpose comment:
  the objective registry's ranking: depletion first, then the score with a $1 tolerance). Depletion `null` counts as
  `Infinity`, as `planCandidateBetter` does. No module-level object constants.

- [ ] **Step 4: Run** the test file, then `npx vitest run tests/unit/shared/objectives.test.js --sequence.shuffle`. Expected: PASS.

- [ ] **Step 5: `npm run analyze`, then commit** (`src/shared/core/analysis/objectives.js`, the test, `docs/superpowers/inventory/`):
  `Objective registry: shared ranking (objectiveBetter, pickBest)`.

---

### Task 2: The US objectives

**Files:**
- Create: `src/us/core/optimizer/objectives.js`
- Modify: `src/us/core/cliff-plan/solver.js:342-354` (`afterTaxEndValueUS`, split out `endTaxUS`)
- Modify: `tests/engine-purity.json` (the new module's constants)
- Modify docs: `docs/architecture/engine.md` (a new "## Objectives" section: the registry, the two objectives, Rule A,
  `objectiveBetter` / `pickBest`, standard runs only, the row helpers of step 1 if merged)
- Test: `tests/unit/us/objectives.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 directly (Task 3 does).
- Produces (exported from `src/us/core/optimizer/objectives.js` unless noted):
  - `endTaxUS(ctx, sim) -> number` (exported from `src/us/core/cliff-plan/solver.js`; `objectives.js` imports it, no re-export): `0` when `!sim.estate || !sim.estate.profile` or
    `traditional <= 0`, else `Math.max(0, 10 * (taxFor(... lastTrad + T / 10) - taxFor(... lastTrad)))`.
  - `US_OBJECTIVES = { endValue, lifetimeCost }`, each `{ id, label, sense, value(ctx, sim), score(ctx, sim) }`:
    `endValue.value = afterTaxEndValueUS(ctx, sim)` (nominal), `sense: 'max'`; `lifetimeCost.value` = the real cost of
    spec section 3, `sense: 'min'`; `score` = `value` (max) or `-value` (min).
  - `DEFAULT_OBJECTIVE_ID = 'endValue'`; `objectiveById(id) -> objective` (throws `Error('unknown objective: ' + id)`,
    including for `undefined`).
  - `objectiveBreakdown(ctx, sim) -> { lifetimeCost, lifetimeTax, healthcare, rmds, endTax, endValue, depletedAge }`
    (today's dollars; each row sum deflated per row by `Math.pow(1 + pct(inputs.inflation), r.year)`; `endTax` and
    `endValue` divided by that factor at the last row's year).
  - `gainInTodaysDollars(objective, ctx, winnerSim, baseSim) -> number` (spec section 4).

- [ ] **Step 1: Write the failing tests** (counted suite, `makeCounter`, `afterAll` total):
  - Synthetic, `await w.setState({ inflation: 25 })`, `ctx = await w.ctx()`, sim
    `{ rows: [{ year: 0, tax: 1000, healthcare: 500, rmd: 0 }, { year: 1, tax: 2000, healthcare: 0, rmd: 3000 }], depletedAge: null, estate: { traditional: 0, roth: 100, taxable: 200, cash: 50, homeEquity: 1000, profile: {}, lastGain: 0, lastTrad: 0 } }`:
    `lifetimeCost.value` `3100`; breakdown `{ lifetimeCost: 3100, lifetimeTax: 2600, healthcare: 500, rmds: 2400, endTax: 0, endValue: 1080, depletedAge: null }`
    (`toStrictEqual`; 1000 + 2000 / 1.25 = 2600 tax, plus 500 healthcare = 3100); `endValue.value` `1350`; `endValue.score` `1350`; `lifetimeCost.score` `-3100`. The same sim with
    `inflation: 0`: `lifetimeCost.value` `3500`, breakdown `endValue` `1350`.
  - `objectiveById('nope')` and `objectiveById(undefined)` throw; `DEFAULT_OBJECTIVE_ID` is `'endValue'`.
  - `gainInTodaysDollars`: two synthetic sims differing only in `estate.roth` (100 vs 350) at inflation 25: `endValue` gain
    `200` (250 / 1.25); two differing in row-0 tax (1000 vs 900): `lifetimeCost` gain `100`.
  - **From the rows the UI shows**, households `default` (no patch), `aca` (`ACA_CLIFF` from `tests/unit/helpers/multi-lever.js`),
    `irmaa` (couple 62, `stateTax: 'ca'`, spending 110000, taxable 800000, `trad401kA: 2500000`, `rothIraA: 200000`),
    `survivor` (the `irmaa` couple with `survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 75`), `depleting`
    (`retireAgeA: 50, retireAgeB: 50, spending: 120000, taxable: 400000`, asserting `sim.depletedAge !== null`): run
    `(await usOptimizer(w)).simulate()`, `ctx = await w.ctx()`, recompute in the test with the expressions written out:
    `rows.reduce((s, r) => s + (r.tax + r.healthcare) / Math.pow(1 + infl, r.year), 0)` for `lifetimeCost` (and its
    `value`), the same for `tax`, `healthcare`, `rmd`; `afterTaxEndValueUS(ctx, sim)` for `endValue.value`; that divided by
    `Math.pow(1 + infl, rows.at(-1).year)` for the breakdown's `endValue`; each `toBe`.
  - The split is byte-identical, checked against the old formula written out in the test (not the new implementation):
    for those households, `endTaxUS(ctx, sim)` `toBe`
    `e.traditional > 0 ? Math.max(0, 10 * (taxFor(ctx, e.profile, e.lastGain, e.lastTrad + e.traditional / 10) - taxFor(ctx, e.profile, e.lastGain, e.lastTrad))) : 0`
    (`taxFor` loaded from `us/core/tax/` as the solver imports it), and `afterTaxEndValueUS(ctx, sim)` `toBe`
    `e.roth + e.taxable + e.cash + e.homeEquity + e.traditional - thatOldTax`.
  - Count every check; set `NEW_COUNT` to the total.

- [ ] **Step 2: Run** `npx vitest run tests/unit/us/objectives.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `endTaxUS` in `solver.js` and rewrite `afterTaxEndValueUS` as
  `e.roth + e.taxable + e.cash + e.homeEquity + T - endTaxUS(ctx, sim)` (keep its early `return 0`). Then
  `src/us/core/optimizer/objectives.js` (purpose comment: the US objective registry: the after-tax end value and lifetime
  tax + healthcare, their breakdown and gain). Write the two objectives inline in the `US_OBJECTIVES` literal, not frozen
  (a plain object literal of functions is inert, no load-time comment; wrapping it in `Object.freeze(...)` is a call and
  would need a `// load-time:` comment). Register `US_OBJECTIVES` (and any other top-level object constant) in
  `tests/engine-purity.json` as `"constant"`. A comment says the registry scores standard runs only (spec section 3).

- [ ] **Step 4: Run** the file, shuffled, then on Node 24 if available (`npx -p node@24 ...` or the local install). Expected:
  PASS. Then `node tests/engine_purity.js` and `npm run test:unit`. Expected: PASS.

- [ ] **Step 5: `npm run analyze`, commit:** `Objective registry: US objectives, breakdown and gain`.

---

### Task 3: The cliff plan through the registry

**Files:**
- Modify: `src/us/core/cliff-plan/solver.js:120-127` (`planCandidateBetter`)
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`'s `measure`)
- Test: `tests/unit/us/objectives.test.js` (one more case)
- Modify docs: `docs/architecture/cliff-plan.md` (Planning: `planCandidateBetter` decides through `objectiveBetter`;
  `measure` reads the registry)

**Interfaces:**
- Consumes: `objectiveBetter` (Task 1); `US_OBJECTIVES` (Task 2).
- Produces: unchanged signatures: `planCandidateBetter(a, b)` with `{ depletedAge, value, n }`; `computeCliffPlan(ctx)`.

- [ ] **Step 1: Write the parity test** (passes before and after; it guards the rewire). Household: the T5.3 `SCAN` patch
  of `tests/cliff_plan.js:282-287` (single, 58, TX, ACA on, enhanced off, taxable 300,000, spending 130,000, conversions
  off, `cliffGuardEnabled: true`), with its `traditional: 1500000, roth: 200000` turned into account fields as its `hand()`
  helper does (`tests/legacy_balances.js` `legacyToAccounts`). The ACA and IRMAA households of Task 2 give one candidate
  only and do not exercise the ranking. `run = await w.load('us/core/projection/run-projection.js')`, `ctx = await w.ctx()`,
  `{ plan, report } = run.computeCliffPlan(ctx)`. Assert `report.candidates.map((c) => c.family)` `toStrictEqual`
  `['none', 'aca', 'irmaa', 'all']`. For each candidate, replay it with `usPlan(w).runPlanMode`: `none` with
  `{ planMode: 'off' }`, the others with `{ planMode: 'apply', plan: { intents } }` where `intents` are the candidate's
  (take `all`'s from a `{ planMode: 'choose' }` run's `intents`, and the family subsets by filtering them as
  `computeCliffPlan` does), and assert its `cost` `toBe` `US_OBJECTIVES.lifetimeCost.value(ctx, sim)` and its `value` `toBe`
  `US_OBJECTIVES.endValue.value(ctx, sim)` (pricing reads only the inputs, the tax year and the tax factors, which `ctx`
  shares with `computeCliffPlan`'s `runCtx`). Assert `report.kept` equals the family a hand-written Rule A scan of the four
  `{ depletedAge, value, n }` picks (later depletion, then value by more than $1, then fewer intents, written out in the
  test). Update `NEW_COUNT`.

- [ ] **Step 2: Run** it. Expected: PASS.

- [ ] **Step 3: Rewire.** `measure` uses `US_OBJECTIVES.endValue.value(runCtx, sim)` and
  `US_OBJECTIVES.lifetimeCost.value(runCtx, sim)` (priced with `runCtx`, as today); `planCandidateBetter` maps `value` to
  `score` and returns `objectiveBetter(A, B) ? true : objectiveBetter(B, A) ? false : a.n < b.n`. The cliff plan names
  `endValue` explicitly (a comment: step 4 passes the saved objective here). `run-projection.js` imports from
  `../optimizer/objectives.js`; check no cycle (`objectives.js` imports `solver.js`, never `run-projection.js`).

- [ ] **Step 4: Verify.** `npm run test:unit`, then `npm test` (builds; golden, snapshots, `tests/cliff_plan.js`,
  `tests/end_value_us.js`). Expected: all PASS with no baseline change.

- [ ] **Step 5: Commit:** `Cliff plan: score candidates through the objective registry (no number moves)`.

---

### Task 4: `optimizeMultiLever` on the registry

**Files:**
- Modify: `src/us/core/optimizer/multi-lever.js` (whole search API), `src/us/core/optimizer/roth-schedule.js` (delete
  `rothScheduleCost` and its `displayValueOf` import; update the purpose comment), `src/us/core/withdrawals/mix.js:16`
  (comment)
- Modify: `src/us/ui/results/roth-optimizer.js` (per-year and multi-lever cards: lines 46-75, 103-190, 244-255)
- Modify: `src/us/ui/install-test-hooks.js` (`searchOptions`, the two optimizer hooks, `__test_rothScheduleCost` ->
  `__test_objectiveScore` / `__test_objectiveBreakdown`, `usAnalysisPerMode`'s `scheduleCost`, `multiLeverPlannedWithoutMaps`)
- Modify: `src/us/index.html` (badge V134 -> V135; the per-year and multi-lever cards' intro sentences at lines 251 and 261
  say they look for the highest after-tax end value). The multi-lever card is always present and `tests/snapshot_ui.js`
  hashes `main.innerText` with every `<details>` open, so this moves every US UI snapshot (precedent: `2ad1f79`).
- Modify tests: `tests/unit/helpers/us-plan.js` (`usOptimizer`), `tests/unit/us/multi-lever-*.test.js`,
  `tests/unit/us/roth-optimizer-per-year.test.js`, `tests/unit/shared/engine-ratchet.test.js:177`, `tests/cliff_plan.js:634-636`,
  `test_optimizer_ui.js` (checks 1-3), `test_apply_optimizer_schedule.js` (header comment; check 2), `tests/bench_heavy.js:84`,
  `tests/snapshots/ui_us.json` (via `npm run snapshot:update`)
- Modify docs: `README.md` (the per-year and multi-lever bullets, lines 132-133: they look for the highest after-tax end
  value), `docs/architecture/cliff-plan.md` (the hook list: `__test_objectiveScore` replaces `__test_rothScheduleCost`,
  line 63), `docs/architecture/test-inventory.md` (line 39 and the changed suites)

**Interfaces:**
- Consumes: `objectiveById`, `objectiveBreakdown`, `gainInTodaysDollars`, `DEFAULT_OBJECTIVE_ID` (Task 2).
- Produces:
  - `optimizeMultiLever(selected, base, contextFor, options, { budget, objective })`: `objective` an id, required. Returns
    today's fields except `cost`, plus `objective` (id), `score`, `value`, `gain`, `breakdown`. No `sim` in the result.
  - `optimizeRothLadderPerYear(selected, base, contextFor, { budget, objective })`: returns `{ schedule, objective, score,
    value, gain, breakdown, depletedAge, truncated, budgetExhausted, activeYears, evalCount }`.
  - `pickGuardedRun(runs, notWorse) -> run` (exported from `multi-lever.js`): `runs` = `[{ depletedAge, score, ... }]`.
    If any passes `notWorse(depletedAge)`, the strict maximum score among them (`reduce((a, b) => (b.score > a.score ? b : a))`,
    today's tie behaviour); else the latest depletion (`null` latest), then the strict maximum score.
  - `applyGateOpen(gain) -> boolean` (`gain > 1`), exported from `src/us/core/optimizer/objectives.js`.
  - Test hooks (window and `usOptimizer`): `optimizeRothLadderPerYear(selected, objective)`,
    `optimizeMultiLever(selected, options, objective)`, `objectiveScore(id, sim)`, `objectiveBreakdown(sim)`; each re-plans
    first (`ensureTestPlan`) and prices with `storeContext({ withPlan: false })`.

- [ ] **Step 1: Write the failing tests.**
  - `tests/unit/us/multi-lever-optimizer.test.js`: `pickGuardedRun` with literal runs:
    `[{id:'a',depletedAge:null,score:5},{id:'b',depletedAge:null,score:5},{id:'c',depletedAge:70,score:9}]`, `notWorse = (d) => !d`
    -> `'a'` (first of the tied maximum); `[{id:'a',depletedAge:70,score:9},{id:'b',depletedAge:75,score:1},{id:'c',depletedAge:75,score:2}]`,
    `notWorse = () => false` -> `'c'`.
  - Same file: `optimizeMultiLever(selected, base, contextFor, { includeRoth: true }, { budget: 50 })` throws (no objective);
    with `objective: 'nope'` throws.
  - The household for the next two cases: `ROTH2 = { ...ACA_CLIFF, rothConvEnabled: true, rothConvStartAge: 55, rothConvEndAge: 56 }`
    (the ladder on, as the trials force it, so a replay reproduces the winning trial; cf. the `roth()` helper of
    `roth-optimizer-per-year.test.js`).
  - Same file, Review Focus 1 (engine side): on `ROTH2`, `optimizeRothLadderPerYear` with `'endValue'` gives
    `toStrictEqual` results (schedule entries, `score`, `gain`, `breakdown`) after `store.assignMode('nominal')` and after
    `assignMode('real')` (`w.load('shared/core/store.js')`). The UI side is a Playwright check in Step 6.
  - Same file: the result has no `sim` key and no `cost` key; `gain` `toBe` `gainInTodaysDollars(endValue, ctx, winnerRun, selected)`
    on `ROTH2`, where `winnerRun` is `h.simulate()` after `h.setRothOverride(opt.schedule)` (`ctx = await w.ctx()`).
  - The spec's "smaller pinned case" of the reproduced search is the existing brute-force check of
    `roth-optimizer-per-year.test.js` ("3-year window ... global optimum"), run with `'lifetimeCost'`: it keeps passing
    unchanged in logic.

- [ ] **Step 2: Run** `npx vitest run tests/unit/us/multi-lever-optimizer.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement the engine change.** `evaluate` returns `{ score: objective.score(trialCtx, sim), depletedAge, sim }`
  with `trialCtx` the context passed to `simulateWith`; every `cost <` comparison becomes `score >` (lines 92, 100, 147, 155
  at `d8e3cee`); `bestOverall` carries the `sim` locally; the two final picks (`runForSmooth`'s pool and the smooth pool) use
  `pickGuardedRun`; at the end build `value` (`objective.value` of the winner's run), `breakdown`
  (`objectiveBreakdown(winnerCtx, winnerSim)`) and `gain` (`gainInTodaysDollars(objective, baseCtx, winnerSim, selected)`,
  `baseCtx = contextFor(base, { rothBracketByAge: null, withdrawalMixByAge: null })`), and drop the `sim` from the returned
  object. The `displayMode` check is replaced by `objectiveById(objective)` (it throws). Delete `rothScheduleCost`.

- [ ] **Step 4: Move every caller.**
  - `roth-optimizer.js`: both cards pass `{ budget, objective: DEFAULT_OBJECTIVE_ID }`; `savings` becomes `opt.gain`;
    the sentences say "an estimated <b>$X</b> more after-tax end value (today's dollars) than your current ...", and the
    "without shortening how long the portfolio lasts" clause only when `notWorse(opt.depletedAge)` against `selected`;
    `optimizerState.lastMultiLeverRun = { opt, options, savings: opt.gain }`; Apply enabled iff `opt.gain > 1`.
  - `install-test-hooks.js`: `searchOptions()` returns `{ budget }` and the hooks add `objective`;
    `usAnalysisPerMode` and `multiLeverPlannedWithoutMaps` pass `DEFAULT_OBJECTIVE_ID`; `scheduleCost` becomes
    `{ breakdown: objectiveBreakdown(storeContext({ withPlan: false }), run), total, depletedAge }`.
  - Tests: `usOptimizer` hooks as in Interfaces; the multi-lever and per-year suites pass `'lifetimeCost'` where they test the
    search mechanics and read `.value` (the real cost) where they read `.cost`; `h.rothScheduleCost(sim)` becomes
    `h.objectiveScore('lifetimeCost', sim)` negated, or `.value` via `objectiveBreakdown(sim).lifetimeCost`; the
    brute-force check compares `opt.value` with the brute-force minimum cost (unchanged logic). `engine-ratchet.test.js`
    passes `{ budget: 50, objective: 'endValue' }`. `cliff_plan.js` F1 calls `__test_objectiveScore('endValue', ...)`.
    `bench_heavy.js` passes `'endValue'`. `test_apply_optimizer_schedule.js` calls no optimizer hook: update its header
    comment (lines 21-24); its check 2 ("Apply button is enabled after a run that found real savings", line 116) must
    still pass under the default objective; if it does not, change its household so the UI run finds an end-value gain
    over $1, and say so in the commit.
  - `test_optimizer_ui.js`: checks 2 and 3 (lines 106, 116, 130) pass `'endValue'` to the hooks. Check 1 is restated here
    (it calls the deleted `__test_rothScheduleCost`): `opt = __test_optimizeRothLadderPerYear(selected, 'endValue')`; the
    starred bracket's run scored with `__test_objectiveScore('endValue', flatSim)`; assert `opt.score >= flatScore - 1`
    (with one year the per-year search tries every bracket the card does plus 0, and keeps the strict maximum among
    those that pass the guardrail). Add a check for Review Focus 1 (UI side): set the display mode to nominal the way the
    existing UI scripts do, run the multi-lever card (Optimize), read `#multiLeverSummary` text and
    `#multiLeverApplyBtn.disabled`; repeat in real; both must be equal.
  - Review Focus 5: the gate is `applyGateOpen(gain) -> boolean` (`gain > 1`), exported from
    `src/us/core/optimizer/objectives.js` and used by the multi-lever card for the button and by both cards for the
    "suggested" sentence. Test in `tests/unit/us/objectives.test.js`: `applyGateOpen(1)` false, `applyGateOpen(1.01)` true,
    `applyGateOpen(0)` false, `applyGateOpen(-5)` false; update that suite's `NEW_COUNT`.
  - Update the count constants of every counted suite you change.
  - Docs as listed under Files.

- [ ] **Step 5: Run** `npm run test:unit`, then `npx vitest run --sequence.shuffle`. Expected: PASS.

- [ ] **Step 6: Build and run the UI scripts that touch the cards:** `npm run build`, then
  `node tests/ui_scripts.js test_optimizer_ui.js test_apply_optimizer_schedule.js test_multi_lever_optimizer.js test_roth_optimizer_per_year.js`
  (those that exist) and `node tests/cliff_plan.js`. Expected: PASS.

- [ ] **Step 7: Snapshots and the full gate.** `npm test`: the US UI snapshots fail only on the text hashes the new
  intro sentences move (and the badge, if the snapshot reads it). Confirm the failures name only those, then
  `npm run snapshot:update`, and `npm test` again. Expected: PASS. `node tests/doc_paths.js`: OK.

- [ ] **Step 8: Commit:** `optimizeMultiLever: score by a required objective (default: after-tax end value); retire rothScheduleCost (US V135; UI snapshot text hashes updated for the card intros)`.

---

### Task 5: The flat-bracket card on the end value

**Files:**
- Modify: `src/us/core/optimizer/roth-schedule.js` (add `pickFlatBracket`)
- Modify: `src/us/ui/results/roth-optimizer.js` (`computeRothOptimizer`; new `annotateRothOptimizer`, mirroring Canada's)
- Modify: `src/us/ui/results/render.js:177` (call `annotateRothOptimizer()` right after `renderRothOptimizer(selected)`)
- Modify: `src/us/index.html:246-248` (intro sentence: highest estimated after-tax end value; header gains
  `<th>After-tax end value (est.)</th>` after End assets)
- Modify: `tests/snapshots/ui_us.json` (via `npm run snapshot:update`)
- Modify docs: `README.md` (the bracket search bullet, line 131: it suggests the highest after-tax end value and shows
  that column), `docs/architecture/test-inventory.md` (the new cases)
- Test: `tests/unit/us/flat-bracket.test.js` (new, counted)

**Interfaces:**
- Consumes: `pickBest` (Task 1); `US_OBJECTIVES.endValue` (Task 2).
- Produces: `pickFlatBracket(results, selectedDepletedAge, currentBracket) -> result`, `results` =
  `[{ bracket, depletedAge, score }]`: guardrail pool (not depleting when `selectedDepletedAge` is null; else none or at
  least `selectedDepletedAge`), `pickBest(pool.length ? pool : results, preferred)` with `preferred(t)` = the tied result
  whose bracket is `currentBracket`, else the tied result with the lowest bracket. `computeRothOptimizer` returns
  `{ results, best, currentBracket, guarded }` (each result adds `afterTaxEnd` in display dollars and `score`, the nominal
  end value; `guarded` false when nothing passed the guardrail).

- [ ] **Step 1: Write the failing tests** for `pickFlatBracket`:
  - Identical scores 12-35 (score 500 each), 10 at 400, all never depleting, current 22 -> bracket 22; current 10 -> 12.
  - 24 scores 900 but depletes at 80 while `selectedDepletedAge` is null; 22 scores 500 never depleting -> 22.
  - Nothing passes (`selectedDepletedAge` null; 10 depletes at 80 with score 9, 12 at 85 with score 1, 22 at 85 with score
    1.5; current 35) -> `12` (the latest depletion group is {12, 22}, maximum 1.5, both within $1; 35 is not tied, so the
    lowest tied bracket).

- [ ] **Step 2: Run** the test. Expected: FAIL.

- [ ] **Step 3: Implement** `pickFlatBracket`; `computeRothOptimizer` prices each bracket's run with the run's own
  `variantContext` (`endValue.score(ctx, sim)`, and `displayValue(endValue.value(ctx, sim), end.year)` for the column),
  keeps `lifetimeTax` and `endAssets` as today, picks with `pickFlatBracket`, stores `lastRothOptimizer`.
  `annotateRothOptimizer` rewrites the summary (the end value gained, today's dollars when the display is real, with the
  lifetime tax difference as Canada's does; the "without shortening" clause only when `guarded`) and the five-cell rows.

- [ ] **Step 4: Verify.** `npm run test:unit`; `npm run build`; `node tests/ui_scripts.js test_optimizer_ui.js` (check 1
  now reads the new star; expected PASS); `node tests/snapshot_ui.js` shows `ui_us.json` hash moves only for scenarios
  that show the flat card (the ladder on); then `npm run snapshot:update` and check `git diff --stat tests/snapshots`
  touches `ui_us.json` only; `npm test` PASS. Mobile check at 390x844: the five-column table keeps
  `document.documentElement.scrollWidth > clientWidth` false (it sits in `.table-wrap`). Docs as listed under Files.

- [ ] **Step 5: Commit:** `Flat-bracket card: suggest by the after-tax end value (UI snapshot hashes updated: new column and sentence)`.

---

### Task 6: Measurement tools and the reproduction check

**Files:**
- Modify: `tests/solver_gap.js` (`--objective endValue|lifetimeCost`, default `endValue`), `tests/bench_optimizer.js`
  (`--objective`, default `endValue`)
- Modify: `docs/next-batches-plan.md` ("### Batch 5 notes": a "Batch 5 step 2" subsection)

**Interfaces:**
- Consumes: the hooks of Task 4 (`__test_optimizeMultiLever(selected, options, objective)`, `__test_objectiveScore`,
  `__test_objectiveBreakdown`).

- [ ] **Step 1: `solver_gap.js`.** The reference optimizes `--objective`; table 1's cost column reads
  `__test_objectiveBreakdown(sim).lifetimeCost` (it replaces `__test_rothScheduleCost`); table 2's end tax and end value read
  the breakdown's `endTax` / `endValue`; step 0's table-2 score (cost plus end tax) stays as a script-local column; the
  pinned-replay check is always `ref.score === __test_objectiveScore(objective, pinnedReplaySim)` (scores, never a
  value against a score).

- [ ] **Step 2: The reproduction check.** `npm run build`, then
  `node <scratchpad>/capture-multilever.js --root . --objective lifetimeCost --out <scratchpad>/new-lifetime.json` and
  compare with `base-lifetime.json` (`node -e` deep-equal). Expected: identical in all six (no scenario has every run
  failing the guardrail). Any difference stops the task: report it.

- [ ] **Step 3: Measure.** `node tests/solver_gap.js --objective endValue` (both lengths, about 5 minutes, background) and
  `node tests/bench_optimizer.js --objective endValue`. Record the tables, the reproduction result and the timing next to
  step 0's in the new Batch 5 notes subsection (dates, commit, Node version).

- [ ] **Step 4: Commit:** `Batch 5 step 2: solver_gap and bench_optimizer score by an objective; measurements`.

---

### Task 7: The full sweep

Docs land with their code (CLAUDE.md): `engine.md` in Task 2, `cliff-plan.md` in Tasks 3 and 4, README and
`test-inventory.md` in Tasks 4 and 5, the Batch 5 notes in Task 6. This task only checks the whole branch.

- [ ] **Step 1: Full sweep.** `npm test` (expected PASS), `npm run test:ui` (expected PASS), `node tests/doc_paths.js`
  (OK), and a read of `docs/architecture/engine.md`, `cliff-plan.md` and README against the final code. `tests/analysis_parity.js`
  is not run against a base before this change (its fields are renamed and the optimizer choices move; spec section 5):
  say so in the PR text. Fix anything found in a commit of its own.
