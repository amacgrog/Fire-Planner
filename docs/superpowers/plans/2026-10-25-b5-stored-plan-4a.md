# Batch 5 step 4a: the stored plan and Optimize -> Apply (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plan the user can keep: Optimize searches per-phase lambda multipliers and all six brackets, Apply stores the plan in
`state.storedPlan`, and every planning keeps it only while it is no worse than the automatic plan on the current inputs.

**Architecture:** The plan object gets one fixed shape (a small `plan-shape.js` module) that the engine, the guard and the store
share. `computeCliffPlan` gains options (`mult`, `objective`, `rankEvenly`, an `off` memo) and the guarded comparison against
`ctx.inputs.storedPlan`. A new engine function `optimizePlan` runs the coordinate search over those options. A new US card
replaces the multi-lever card; the shared wrappers gain context-taking historical and Monte Carlo entry points for its
with/without success rates.

**Tech Stack:** plain ES modules under `src/`, esbuild (`npm run build`), Vitest (`tests/unit/`), Playwright (root `test_*.js`,
`tests/*.js`).

**Spec:** `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md` (approved 2026-10-25). Sections 2 (decisions 1-9), 3, 4
and 11 are what this plan builds; 5-8 are 4b-4d (not here), 9 is this plan's Task 9 measurement.

## Global Constraints

- `CLAUDE.md` holds: engine functions take the run context first and read only `ctx.*`; one context shape (`newRunContext`);
  a module-level array in an engine module is registered in `tests/engine-purity.json` in the same commit; line 1 of every new
  `core/` / `ui/` module is a one-line `//` purpose comment then a blank line; `npm run analyze` after adding a module; two-space
  module indentation; never reformat a module you also change.
- Vitest rules (CLAUDE.md "Writing a Vitest test"): only through `world()`; `toBe` / `toStrictEqual`, never `toBeCloseTo`;
  hand-computed expected values stay literals; `makeCounter` + `afterAll` count for suites with many checks; contexts from
  `w.ctx()` / `w.ctxBuilder()`; `stateContextFor()` for variant factories; a new suite run alone and with `--sequence.shuffle`.
- A bug found in existing `src/` code is reported to the controller, not fixed in the task (rule 7), except the
  `rothConvBracket` guard (spec decision 6).
- Gate for the branch: `npm test` and `npm run test:ui` green; engine snapshots (`tests/snapshot.js`) byte-identical; the
  `tests/legacy_state.js` baseline regenerated once, as an intended change (Task 4); `snapshot_ui` movers only from the card's
  markup (Task 8), listed; timing `bench_runs_interleaved.js` +5% for states without a stored plan; planning with a stored plan
  within 150 ms.
- US badge V139 -> V140 in the last commit that changes user-facing behaviour (Task 8); README feature line in the same commit.
- Batch notes go in `docs/next-batches-plan.md` "Batch 5 notes" (a new "Batch 5 step 4a" subsection), not `docs/reference.md`.
- Never push, never open a PR, never `git stash`, never touch another worktree. Commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Reviews (per task and the final whole-branch review) run on Opus (owner, 2026-10-25).

## Review Focus

1. **An old save or a hand-edited one.** A save with no `storedPlan` loads as today; a malformed stored plan drops whole to
   `null` and the automatic plan runs, never a partial plan. Test: Task 4 (`guard-normalize` cases, `legacy_state.js` cases).
2. **An edit after Apply** (retirement age, spending, the bracket setting): the dashboard runs the automatic plan whenever the
   stored plan does worse on the new inputs, and the card says why. Test: Task 5 (Vitest, `depletes` / `home` / `score`, bracket
   changed) and Task 8 (Playwright: rows equal the automatic plan's after the edit).
3. **The guard switched off and on with a stored plan.** Off: no plan runs, the card says the applied plan is not used; on: it
   is used again. Test: Task 8 (Playwright).
4. **Optimize with nothing to gain** (a household that already depletes, or whose automatic plan is already best): no Apply
   button and the card says so. Test: Task 7 (Vitest: `gain` <= 1 on the depleting `PLAN` household) and Task 8 (Playwright).
5. **A scenario comparison open with a saved scenario carrying a stored plan, while typing:** no full planning per keystroke
   (`__test_planForStateComputes()` delta 0) and the comparison row equals loading that scenario. Test: Task 8 (Playwright).

---

## File structure

- Create `src/us/core/cliff-plan/plan-shape.js`: `makePlan`, the valid id lists, `isValidStoredPlan`, `phaseOf`.
- Create `src/us/core/optimizer/plan-search.js`: `optimizePlan`, `MULT_GRID`.
- Create `src/us/ui/results/plan-optimizer.js`: the plan card (render, search, apply, clear) and its wiring function.
- Modify `src/us/core/projection/run-projection.js` (`computeCliffPlan`), `src/us/core/cliff-plan/solver.js`
  (`lambdaEstimate`, `planCandidateBetter` callers unchanged), `src/us/core/cliff-plan/planning.js` (`cliffPlanSummary`),
  `src/us/core/inputs/defaults.js`, `src/us/ui/inputs/normalize-state.js`, `src/us/ui/inputs/fields.js`,
  `src/shared/core/projection/simulate.js`, `src/us/index.html`, `src/us/ui/results/roth-optimizer.js`,
  `src/us/ui/results/roth-optimizer-controls.js`, `src/us/ui/results/render.js`, `src/us/main.js`,
  `src/us/ui/install-test-hooks.js`, `tests/unit/helpers/us-plan.js`.
- Tests: `tests/unit/us/plan-shape.test.js`, `plan-mult.test.js`, `stored-plan.test.js`, `plan-search.test.js`,
  `tests/unit/shared/success-with.test.js`, root `test_plan_optimizer.js`; changed: `tests/cliff_plan.js`,
  `tests/unit/us/bracket-search.test.js`, `test_bracket_search.js`, `tests/legacy_state.js`, `test_apply_optimizer_schedule.js`,
  `test_optimizer_ui.js`, `tests/unit/us/guard-normalize.test.js`.

---

### Task 1: One plan shape

**Files:**
- Create: `src/us/core/cliff-plan/plan-shape.js`
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`, every plan literal it builds)
- Test: `tests/unit/us/plan-shape.test.js`; update `tests/cliff_plan.js`, `tests/unit/us/bracket-search.test.js`,
  `test_bracket_search.js` where they compare whole plan objects

**Interfaces:**
- Produces:
  - `PLAN_KEYS = ['intents', 'family', 'bracket', 'bracketFrom', 'orders', 'splits', 'levers', 'mult', 'orderPhases']` (frozen)
  - `makePlan(fields) -> plan`: an object with exactly `PLAN_KEYS` in that order; missing fields: `intents: {}`, `family:
    'none'`, `bracket: null`, `bracketFrom: null`, the other five `null`. Unknown fields throw.
  - `PLAN_LINE_IDS = ['medicaid', 'acaFloor', 'aca400', 'irmaa1', 'irmaa2', 'irmaa3', 'irmaa4', 'irmaa5']`,
    `PLAN_FAMILIES = ['all', 'aca', 'irmaa', 'none']`, `PLAN_RETS = ['H', 'A', 'B']`, `PLAN_KINDS = ['under', 'fill']`
    (all frozen; `BRACKET_CANDIDATES` stays in `run-projection.js` and is imported by the validator in Task 4).

- [ ] **Step 1: Write the failing tests** in `tests/unit/us/plan-shape.test.js`:
  - `makePlan({})` `toStrictEqual` `{ intents: {}, family: 'none', bracket: null, bracketFrom: null, orders: null, splits: null,
    levers: null, mult: null, orderPhases: null }` and `Object.keys(...)` `toStrictEqual(PLAN_KEYS)`;
  - `makePlan({ family: 'aca', bracket: 24, bracketFrom: 22 })` keeps that key order;
  - `makePlan({ nope: 1 })` throws;
  - `computeCliffPlan(await w.ctx())` on the CA gap household (`GAP_CASES`, 100/100, search on as in `bracket-search.test.js`'s
    helper) returns a plan whose `Object.keys` equal `PLAN_KEYS`; same with the guard on and no conversions (default household);
  - every `PLAN_LINE_IDS` entry is an id `magiThresholds` can return (read `src/us/core/cliff-plan/solver.js` and
    `irmaa.js` to confirm five finite edges) — asserted as the literal list, not computed.
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/plan-shape.test.js` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `plan-shape.js` and route every plan `computeCliffPlan` builds or passes (`held` plans for other
  brackets, the subsets' `apply` plans, the returned `plan`) through `makePlan`. `select(null)` still passes `null` to
  `choose` / `off` (byte-identical runs). `ctx.plan` from `planForState` is unchanged otherwise.
- [ ] **Step 4: Run** the new suite, then `npx vitest run tests/unit/us` and `npm run build && node tests/cliff_plan.js &&
  node tests/bracket_search.js && node tests/snapshot.js` — expect PASS with snapshots identical. Update the whole-object plan
  comparisons in `tests/cliff_plan.js`, `bracket-search.test.js` and `test_bracket_search.js` to the new shape (field values
  unchanged).
- [ ] **Step 5:** `npm run analyze`, then commit ("Batch 5 4a: one plan shape (plan-shape.js)").

### Task 2: Per-phase lambda multipliers

**Files:**
- Modify: `src/us/core/cliff-plan/solver.js` (`lambdaEstimate`), `src/us/core/cliff-plan/plan-shape.js` (`phaseOf`),
  `src/us/core/projection/run-projection.js` (`lambdaOf` near line 718; `computeCliffPlan`'s `select`)
- Test: `tests/unit/us/plan-mult.test.js`

**Interfaces:**
- Consumes: `makePlan` (Task 1).
- Produces:
  - `lambdaEstimate({ ..., mult = 1 })`: `lambda: Math.min(LAMBDA_MAX, Math.max(0, (SOLVER_LAMBDA_MULT * mult * rateSum) / 3))`;
    `tauGain` unchanged.
  - `phaseOf(ctx, age) -> 0 | 1 | 2`: `age < 65 ? 0 : age < rmdStartAge(ctx, ctx.inputs.ageA) ? 1 : 2`
    (`rmdStartAge` from `src/us/core/income/distributions.js`), `age` being Partner A's age that year.
  - `computeCliffPlan(ctx, { search = true, mult = null } = {})`: with `mult` null or `[1, 1, 1]`, today's runs exactly; else
    every `choose` run receives a plan with `mult` set (the user's bracket: `makePlan({ bracket: from, bracketFrom: from, mult
    })` instead of `null`; other brackets: their `held` plan with `mult`). The returned plan carries `mult` (null when null or
    all ones). `off` runs never carry `mult`.
  - `lambdaOf` passes `mult: plan && plan.mult ? plan.mult[phaseOf(ctx, age)] : 1` in `choose` (computed once per year, not
    per call).

- [ ] **Step 1: Write the failing tests** in `plan-mult.test.js`:
  - CA, TX and NY gap households (100/100) and the converting `std R rothConv` household of `tests/cliff_plan.js`:
    `computeCliffPlan(ctx, { mult: [1, 1, 1] })` `toStrictEqual` `computeCliffPlan(ctx)` (plan and report), and a `choose` run
    with `makePlan({ bracket: 22, bracketFrom: 22, mult: [1, 1, 1] })` has rows `toStrictEqual` the run with `plan: null`;
  - `mult: [0, 0, 0]` on the TX household gives a `choose` trace (`planTrace: true`) whose recorded `lambda` is 0 in every
    year with a candidate (non-vacuous: at least one such year, and the `[1, 1, 1]` trace has a non-zero lambda there);
  - `phaseOf`: A born so that `rmdStartAge` is 73 (A's age today 60): ages 64 -> 0, 65 -> 1, 72 -> 1, 73 -> 2; a household
    whose `rmdStartAge` is 75 (age today 55, per `distributions.js`'s birth-year rule): 74 -> 1, 75 -> 2 (literals from the
    rule, hand-checked).
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/plan-mult.test.js` — expect FAIL.
- [ ] **Step 3: Implement** as in Interfaces. Check `tests/engine-purity.json` needs nothing (no new module mutable).
- [ ] **Step 4: Run** the suite, `npx vitest run tests/unit/us`, `npm run build && node tests/snapshot.js && node
  tests/cliff_plan.js` — PASS, snapshots identical. Run the new suite alone with `--sequence.shuffle`.
- [ ] **Step 5: Commit** ("Batch 5 4a: per-phase lambda multipliers (default byte-identical)").

### Task 3: The objective, even bracket ranking and the `off` memo in `computeCliffPlan`

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`), `src/us/core/cliff-plan/solver.js` (new rank
  function beside `bracketCandidateBetter`)
- Test: `tests/unit/us/bracket-search.test.js` (new cases)

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces:
  - `computeCliffPlan(ctx, { search = true, mult = null, objective = 'endValue', rankEvenly = false, offMemo = null } = {})`.
    `objective`: the registry id each candidate's `score` is read with (`objectiveById(objective).score(runCtx, sim)`, a new
    `score` field in `measure`); `planCandidateBetter` and the bracket rank compare `score` (for `endValue`, `score === value`,
    so today's choices are unchanged). `rankEvenly`: the bracket step uses `bracketEvenBetter(c, best)` instead of
    `bracketCandidateBetter`, over all six brackets, and ties (`!bracketEvenBetter` both ways) keep the earlier one in the
    order the search visits them (the user's first). `offMemo`: a caller-owned `Map` keyed by bracket; when given, each
    bracket's `off` candidate measure is read from it or stored in it (valid only for one working copy of the inputs: the caller
    makes a new Map per `optimizePlan` call).
  - `bracketEvenBetter(c, best)` in `solver.js`: false if `c` depletes earlier or first draws on home equity earlier (null =
    never); true if later on either; else `c.score > best.score + Math.max(1, 0.001 * Math.abs(best.score))`.
  - The report's `brackets` entries gain `score`.

- [ ] **Step 1: Write the failing tests** (bracket-search suite, counted): `objective: 'endValue'` default equals today's plan
  and report on CA / TX / NY (`toStrictEqual` after removing `score` fields); `objective: 'lifetimeCost'` on the CA household
  keeps a bracket whose `cost` is the minimum among brackets with the best depletion and home draw (assert against the report's
  own `brackets` table, by hand-chosen rule, not by re-implementing the rank); `rankEvenly: true` on a household where today's
  strict-win rule keeps the setting while another bracket scores higher by less than 0.1% — find one with the report of the
  existing CA / TX cases or construct it by `rothConvBracket` (TX at 10% vs 12%: 3a notes say 12-35% tie) and assert the
  documented tie-break; `offMemo`: a second call with the same Map returns `toStrictEqual` results and the Map holds 6 entries.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/unit/us`, `npm run build && node tests/snapshot.js && node tests/bracket_search.js`
  — PASS, snapshots identical.
- [ ] **Step 5: Commit** ("Batch 5 4a: computeCliffPlan objective, even bracket ranking, off memo").

### Task 4: `state.storedPlan`, its guard, the `rothConvBracket` guard, the Monte Carlo seed

**Files:**
- Modify: `src/us/core/inputs/defaults.js` (`storedPlan: null`), `src/us/ui/inputs/normalize-state.js`,
  `src/us/ui/inputs/fields.js` (line 150), `src/us/core/cliff-plan/plan-shape.js` (`isValidStoredPlan`),
  `src/shared/core/projection/simulate.js` (`monteCarloSeed`)
- Test: `tests/unit/us/guard-normalize.test.js` (new cases), `tests/legacy_state.js` (new cases, baseline regenerated),
  `tests/unit/shared/success-with.test.js` (seed case; the file grows in Task 6)

**Interfaces:**
- Consumes: Task 1's lists, `BRACKET_CANDIDATES`, `US_OBJECTIVES` ids, `MULT_GRID` (declare it in `plan-shape.js` now as
  `[0, 0.5, 1, 1.5, 2]`, frozen; Task 7 imports it).
- Produces:
  - `isValidStoredPlan(sp) -> boolean` (pure, in `plan-shape.js`): exactly the checks of spec 4.2 (`v === 1`; `plan` with
    exactly `PLAN_KEYS` in order; intents' keys `String(Number(k)) === k` and integer 0-120, values `{ kind, line, ret }` from
    the lists; `family` in `PLAN_FAMILIES`; `bracket` / `bracketFrom` in `BRACKET_CANDIDATES`; `orders` / `splits` null or a
    plain object (4a writes null; the value checks for 4c / 4d land with them); `levers` null; `mult` null or three values of
    `MULT_GRID`; `orderPhases` null; `objective` a registry id; `madeFor` a string; `taxYear` an integer; `summary` `{ gain:
    finite, success: { hist: [finite|null, finite|null], mc: [finite|null, finite|null] } }`).
  - `normalizeState`: `s.storedPlan = isValidStoredPlan(s.storedPlan) ? s.storedPlan : null` — the original object kept, never
    rebuilt (spec 4.2, JSON identity). Amendment to spec 4.2 (recorded in the commit): `normalize-state.js` imports the lists
    from `plan-shape.js` instead of duplicating them (the "consts declared later" comment predates the modules), so no
    list-equality test is needed.
  - `rothConvBracket` FIELDS entry gains `values: [10, 12, 22, 24, 32, 35], fallback: 22`.
  - `monteCarloSeed` leaves out `storedPlan` with the two dismissal lists.

- [ ] **Step 1: Write the failing tests.** `guard-normalize.test.js`: a valid stored plan survives `normalizeState` as the same
  object (`toBe`) and `JSON.stringify` unchanged; each malformed kind (bad `v`, an extra plan key, keys out of order, intent age
  `'07'`, `'121'`, `'6.5'`, a line `'senior'`, `ret: 'C'`, `bracket: 23`, `mult: [1, 1, 3]`, `objective: 'x'`, `madeFor: 5`,
  `taxYear: 2026.5`, `summary.gain: NaN`, `levers: { order: true }`) gives `null`; `rothConvBracket: 23` and `'22'` give 22.
  `success-with.test.js`: `monteCarloSeed(2026, 500, { ...s, storedPlan: X })` `toBe` `monteCarloSeed(2026, 500, s)`.
  `tests/legacy_state.js`: add cases `'stored plan: valid'`, `'stored plan: malformed'`, `'rothConvBracket invalid'`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/guard-normalize.test.js tests/unit/shared/success-with.test.js` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suites; `npm run build && node tests/legacy_state.js` — FAIL on every case's hash (the new key):
  inspect that the only difference is `storedPlan: null` (and the new cases), then `node tests/legacy_state.js --update`; run
  `node tests/snapshot.js` (identical) and `node tests/field_registry.js`. Run Canada's Monte Carlo check: `npm run test:unit:canada`.
- [ ] **Step 5: Commit** ("Batch 5 4a: state.storedPlan and its guard; rothConvBracket guard; MC seed excludes the stored
  plan (legacy_state baseline regenerated: the new key)"), listing any legacy case the bracket fallback moved.

### Task 5: The guarded comparison in `computeCliffPlan`, and the summary of the winner

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`), `src/us/core/cliff-plan/solver.js`
  (`storedPlanVerdict`), `src/us/core/cliff-plan/planning.js` (`cliffPlanSummary`)
- Test: `tests/unit/us/stored-plan.test.js`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces:
  - `storedPlanVerdict(stored, auto) -> 'better' | 'tie' | 'depletes' | 'home' | 'score'` in `solver.js`: inputs are measures
    `{ depletedAge, homeDrawAge, score }` (score on the stored plan's objective for both); `depletes` / `home` when the stored
    plan is earlier on either (null = never); `score` when `auto.score > stored.score + Math.max(1, 0.001 * |stored.score|)`;
    `better` when the stored is later on either, or `stored.score > auto.score + tolerance`; else `tie`.
  - In `computeCliffPlan`, after the automatic plan is chosen, when `inputs.storedPlan` (and the guard is on): one `apply` run of
    `storedPlan.plan` on `ctxFor('apply', storedPlan.plan)`, the automatic best re-scored on `storedPlan.objective` (no extra
    run: `objectiveById(id).score(runCtx, sim)` needs the sim, so `measure` keeps a reference to each candidate's sim only for
    the best, then drops it), the verdict, and the returned `plan` is the stored plan unless the verdict is `depletes`, `home`
    or `score`. `report` keeps its fields for the automatic plan and gains `auto: true|false` (whether the automatic plan is the
    returned one) and `stored: { used, reason, depletedAge, homeDrawAge, value, cost }`; `report.searched` unchanged.
  - `cliffPlanSummary(plan, report)`: when `report.stored && report.stored.used`, the text starts "Applied plan:" (same clause
    builder over the stored plan's intents), and omits the "not used" family clauses and the bracket clause; the bracket clause
    becomes " Conversions: the applied plan uses the X% bracket." when its bracket differs from `bracketFrom`.

- [ ] **Step 1: Write the failing tests** (`stored-plan.test.js`, counted). Build stored plans by hand with `makePlan` and a
  `storedPlan` envelope (`v: 1`, objective, `mult: null`, `madeFor: 'x'`, `taxYear: 2026`, `summary`):
  - a stored plan equal to the automatic plan -> `report.stored.reason === 'tie'`, returned plan `toBe` the stored plan;
  - TX gap household: a stored plan with the automatic intents plus an extra intent that loses value -> `score`, returned plan
    is the automatic one, and the dashboard-equivalent run (`usPlan(w).runPlanMode({ planMode: 'apply', plan })`) rows equal the
    automatic plan's;
  - the `DEPLETING` household of `tests/helpers/plan-households` (or a spending raise on CA) where a stored plan's stay-under
    year leads to earlier depletion -> `depletes` (construct: stored plan made at spending S, state edited to a higher S; assert
    the reason, and that both depletion ages are what the report says);
  - the `home` reason with the `BROKE` household of `bracket-search.test.js`;
  - `objective: 'lifetimeCost'` stored plan compared on cost (a stored plan with lower cost and lower end value is `better`);
  - the bracket setting changed after Apply: stored plan `bracket: 24, bracketFrom: 22`, state `rothConvBracket: 12` -> the
    apply run converts at 12% (rows equal a plain apply at the 12% setting with the stored intents) and the verdict still decides;
  - guard off: `computeCliffPlan` returns `{ plan: null, report: null }` with a stored plan present;
  - `cliffPlanSummary` of a used stored plan starts "Applied plan:" and has no "not used" clause.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `planForState` / `refreshCliffPlan` need no change (`storedPlan` is in the state JSON).
- [ ] **Step 4: Run** `npx vitest run tests/unit/us`, `npm run build && node tests/snapshot.js && node tests/cliff_plan.js &&
  node tests/bracket_search.js` — PASS, snapshots identical (no snapshot state has a stored plan).
- [ ] **Step 5: Commit** ("Batch 5 4a: the stored plan as a guarded candidate (spec 4.3)").

### Task 6: Context-taking historical and Monte Carlo success rates (shared)

**Files:**
- Modify: `src/shared/core/projection/simulate.js`
- Test: `tests/unit/shared/success-with.test.js`

**Interfaces:**
- Produces (exported from `simulate.js`):
  - `runHistoricalCyclesWith(ctx) -> { cycles, successRate, projectionYears }`: projection years from `ctx.inputs`; one
    `simulateHistoricalWith(newRunContext({ ...each field of ctx, taxFactors: [] }), rowFn)` per cycle; cached in `histCache`
    under `resultKey('hist', '', ctx)` with `ctx.plan` in the entry check (as `cached` does).
  - `monteCarloSummaryWith(ctx, pathCount)`: seed `monteCarloSeed(ctx.taxYear, pathCount, ctx.inputs)`; a fresh context per
    path as above; the same summary shape as `monteCarloSummary`; cached in `mcCache`.
  - `runHistoricalCycles()` and `monteCarloSummary(n)` become `runHistoricalCyclesWith(storeContext())` and
    `monteCarloSummaryWith(storeContext(), n)` with unchanged results; `runHistoricalCyclesFresh` / `runMonteCarlo` keep their
    signatures for their existing callers (check with Grep) or are rewritten over the `With` functions with equal output.

- [ ] **Step 1: Write the failing tests** (both projects: put it in `tests/unit/shared/` and run it under US and Canada as the
  other shared suites do): for the default household, a converting household with a cliff plan, and Canada's default:
  `runHistoricalCyclesWith(await w.ctx({ withPlan: true }))` `toStrictEqual` `runHistoricalCycles()`; the same for
  `monteCarloSummaryWith(ctx, 200)` vs `monteCarloSummary(200)`; with `plan` A vs plan B on the same inputs the results differ
  for a household whose plan has intents (non-vacuous) and the cache does not return A's result for B.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** No state swap anywhere.
- [ ] **Step 4: Run** `npm run test:unit`, `npm run build && node tests/historical_rates.js && node tests/snapshot.js` — PASS,
  identical. `node tests/bench_runs_interleaved.js` +5% (the wrappers sit on the dashboard path).
- [ ] **Step 5: Commit** ("Batch 5 4a: runHistoricalCyclesWith / monteCarloSummaryWith (shared, results unchanged)").

### Task 7: `optimizePlan`

**Files:**
- Create: `src/us/core/optimizer/plan-search.js`
- Modify: `tests/engine-purity.json` (if `plan-search.js` declares module arrays; `MULT_GRID` lives in `plan-shape.js` and is
  registered there as a `constant` in Task 4's commit if `plan-shape.js` is in the engine closure — check `engine_purity.js`)
- Test: `tests/unit/us/plan-search.test.js`

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: `optimizePlan(ctx, { objective = 'endValue' } = {}) -> { plan, mult, objective, measure, base, current, gain,
  plannings, legacy }` where:
  - the working copy is `{ ...ctx.inputs, storedPlan: null, appliedRothSchedule: null, appliedMixSchedule: null }`, its context
    `newRunContext({ ...ctx fields, inputs: copy })`;
  - candidate 0 (`base`) is `computeCliffPlan(copyCtx)` (today's automatic plan of the copy, `mult` null, strict-win brackets);
    every other candidate is `computeCliffPlan(copyCtx, { mult, objective, rankEvenly: true, offMemo })` with one `offMemo`
    Map for the call; `mult` over `MULT_GRID` by coordinate search from `[1, 1, 1]` (each pass: phases 0, 1, 2 in turn, every
    other grid value, keep a strict win, at most 3 passes, stop after a pass with no change); a phase with no plan year (Partner
    A never at that age within the plan, or no withdrawal year) is skipped;
  - when `ctx.inputs.storedPlan` is valid, its plan run through `apply` on the copy is also a candidate (`current`);
  - ranking: no earlier depletion and no earlier home draw than `base`; then `bracketEvenBetter`'s order on the objective's
    score; the winner's `measure` `{ depletedAge, homeDrawAge, score, value, cost }`;
  - `gain`: in today's dollars against what runs today (the guarded winner: `current` when present and used, else `base`),
    with `gainInTodaysDollars`;
  - `legacy`: when the original inputs had applied schedules, the measure of the current run with them (information only),
    else null;
  - `plannings`: the count of `computeCliffPlan` calls (for the notes).
  - The returned `plan` is a `makePlan` object with `mult` set (or null when `[1, 1, 1]` won).

- [ ] **Step 1: Write the failing tests** (counted): for CA, TX, NY at 100 and 75: the winner never depletes or first draws on
  the house earlier than `base`, and `measure.score >= base.score`; the winner's plan run through `apply` on the copy gives a
  measure `toStrictEqual` the reported one (scored as Apply runs it); `optimizePlan` is deterministic (two calls
  `toStrictEqual`); a stored plan better than anything the search finds is returned unchanged (construct: pass the winner of a
  first call as `storedPlan` and call again: same plan, `gain` <= 1); the depleting household: `gain <= 1`; a household with
  `appliedRothSchedule` keys: `legacy` set, the search ran on the copy (`plan.bracketFrom === rothConvBracket`), and the winner
  is ranked against `base`. Record `plannings` and wall time per case in the test output (`console.log`), not asserted.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Context first; no store import (`tests/engine_purity.js`).
- [ ] **Step 4: Run** the suite alone and shuffled, `npx vitest run tests/unit/us`, `npm run build && node tests/engine_purity.js
  && node tests/snapshot.js`. If any gap case takes over 10 s, report the timings to the controller before Task 8 (spec 4.5's
  target; not a CI gate).
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4a: optimizePlan (per-phase multipliers, even brackets, scored as Apply
  runs it)").

### Task 8: The plan card (replaces the multi-lever card), hooks and UI tests

**Files:**
- Create: `src/us/ui/results/plan-optimizer.js`, root `test_plan_optimizer.js`
- Modify: `src/us/index.html` (replace `#multiLeverOptimizerCard`'s contents; bump the `<h1>` badge V139 -> V140),
  `src/us/ui/results/roth-optimizer.js` (remove `renderMultiLeverOptimizer`; keep `renderMultiLeverAppliedStatus` moved or
  re-pointed at the new card's status element; `planBracketOverSetting` names "the applied plan" when
  `cliffPlanStore.report?.stored?.used`), `src/us/ui/results/roth-optimizer-controls.js` (remove the multi-lever wiring; keep
  `applyMultiLeverSchedule` / `clearAppliedMultiLeverSchedule` for the hooks and the legacy Clear buttons),
  `src/us/ui/results/render.js` (render the card's status in the light render; the with/without rates only on demand),
  `src/us/main.js` (call `wirePlanOptimizer()`), `src/us/ui/install-test-hooks.js` (`__test_optimizePlan(objective)`,
  `__test_applyStoredPlan(result)`, `__test_clearStoredPlan()`, `__test_planOptimizerCard()`; the analysis bundle drops the
  multi-lever card ids and keeps the optimizer results), `tests/unit/helpers/us-plan.js` (mirror `optimizePlan` through
  `stateContext`), `test_apply_optimizer_schedule.js`, `test_optimizer_ui.js`, `README.md`, `CLAUDE.md` (sanctioned writes:
  `plan-optimizer.js` writes `storedPlan`)
- Test: `test_plan_optimizer.js`; the two changed UI scripts; `tests/snapshot_ui.js`

**Interfaces:**
- Consumes: `optimizePlan` (Task 7), `runHistoricalCyclesWith` / `monteCarloSummaryWith` (Task 6), `fnv1a32` and the guard
  (Task 4), `report.stored` (Task 5).
- Produces:
  - `wirePlanOptimizer()` (called once from `main.js`, next to `wireRothOptimizerControls()`); `renderPlanOptimizerStatus()`
    (called from the light render).
  - `storedPlanFingerprint(s) -> string`: `String(fnv1a32(JSON.stringify(rest)))` of `normalizeState(s)` without
    `storedPlan`, `dismissedEstimates`, `dismissedUnusualAssumptions`.
  - Apply: `snapshotForUndo('Applied plan')`; when legacy schedules have keys, set both to null; `state.storedPlan = { v: 1,
    plan, objective, mult, madeFor: storedPlanFingerprint(state), taxYear: currentYear, summary }` (fingerprint taken after the
    schedules are cleared); `render()`; `saveInputs()`. Clear: undo snapshot, `state.storedPlan = null`, `render()`,
    `saveInputs()`.
  - Copy (from spec 4.4 / 4.6, exact): "Applied plan in use."; "Applied plan in use. It was computed for different inputs; it
    still beats the automatic plan on these inputs. Re-run Optimize to refine it."; "Your applied plan was computed for different
    inputs and no longer beats the automatic plan, which is in use. Re-run Optimize." plus " (it runs out earlier)" / " (it draws
    on home equity earlier)" / " (it scores lower)"; "The cliff plan is off, so the applied plan is not used."; "The automatic
    plan is already the best this search found."; "Applying replaces your applied conversion / withdrawal schedule."; "Your
    conversion bracket changed since this plan was applied; it now converts at your X%."; the card's lead: "Searches for a
    tax-efficient plan on your own assumptions; a better one may exist." The multipliers line: "How strongly the plan weighs
    future tax when choosing the years to stay under or fill a line: before 65 ×a, 65 to RMDs ×b, RMD years ×c."

- [ ] **Step 1: Write the failing Playwright script** `test_plan_optimizer.js` (exits 1 on failure; locator waits, no fixed
  waits): load the TX gap household (life 100) through the autosave; open the card; Search; the result shows a gain and the
  with/without historical and Monte Carlo rates; Apply; the status reads "Applied plan in use."; `window.fireProjectionRows`
  equals a fresh `__test_simulate()` with the stored plan (no re-plan drift); the Monte Carlo rate on the dashboard equals the
  card's "with" rate; reload: the stored plan survives (autosave) and is used; edit spending up so the stored plan loses
  (`__test_flushRender()`): status reads the "no longer beats" copy with its reason and `fireProjectionRows` equal the automatic
  plan's rows (`__test_runPlanMode({ planMode: 'apply', plan: <automatic> })`); edit back: used again; guard off: the "cliff plan
  is off" copy; guard on: used; Clear; the depleting household: no Apply button and the "already the best" copy; a household
  with a legacy applied schedule (`__test_applyMultiLeverSchedule`): the replaces-schedule copy, Apply clears it; the
  comparison open with a saved scenario carrying a stored plan: typing in spending gives `__test_planForStateComputes()` delta
  0 and the scenario's row equals loading it; 390x844: no horizontal scroll.
- [ ] **Step 2: Run** `npm run build && node test_plan_optimizer.js` — FAIL.
- [ ] **Step 3: Implement** the card, hooks and wiring. Move the checks of `test_apply_optimizer_schedule.js` and
  `test_optimizer_ui.js` that drove the multi-lever card's DOM onto the hooks (`__test_optimizeMultiLever`,
  `__test_applyMultiLeverSchedule`, `__test_clearAppliedMultiLeverSchedule`) or the new card, keeping coverage of the legacy
  apply-and-clear; the flat-bracket and per-year cards unchanged.
- [ ] **Step 4: Run** `npm test` (includes `snapshot_ui`: list each moved surface and confirm it is the card's markup only),
  then `node tests/ui_scripts.js test_plan_optimizer.js test_apply_optimizer_schedule.js test_optimizer_ui.js
  test_bracket_search.js test_live_withdrawal_mix.js`, then `npm run test:ui`. Mobile check passes.
- [ ] **Step 5:** README feature line (the plan optimizer; the multi-lever card's removal), badge V140; `npm run analyze`;
  `npm run snapshot:update` only for the listed `snapshot_ui` movers; commit ("Batch 5 4a: the plan card replaces the
  multi-lever card; Optimize -> Apply stores the plan (US V140)").

### Task 9: Measurements, docs and notes

**Files:**
- Modify: `tests/solver_gap.js` (`--shipped auto|optimized`, default `auto`), `docs/architecture/cliff-plan.md`,
  `docs/architecture/inputs-and-ui.md`, `docs/architecture/test-inventory.md`, `docs/next-batches-plan.md` (status line of
  "Batch 5: optimizer"; a new "Batch 5 step 4a" notes subsection)

- [ ] **Step 1:** Add `--shipped optimized` to `tests/solver_gap.js`: the shipped column reads `__test_optimizePlan(objective)`'s
  plan applied (`__test_runPlanMode({ planMode: 'apply', plan })`); `auto` prints exactly what it prints today (check: run
  `node tests/solver_gap.js --lengths default` before and after, identical output).
- [ ] **Step 2: Run** `node tests/solver_gap.js --objective endValue --shipped optimized` (both lengths, background, minutes) and
  record table 2's after-tax end value, shipped (optimized) / reference, beside 3a's automatic figures (TX 9.7% / 4.7%, CA 1.5%
  / 4.5%, NY 0 / 1.3%).
- [ ] **Step 3: The lambda table (spec section 9):** for the three gap households at both lengths and a 48-household sample of
  `scanHouseholds` (every 16th, both conversion settings), record per phase the multiplier `optimizePlan` keeps, the gain over
  `[1, 1, 1]`, and the share of that phase's plan years with `movedSample` (`__test_planTrace()`), as a scratch script run
  outside the repo (path printed in the notes; not committed) or a committed `tests/plan_mult_table.js` (builder's choice;
  not in `npm test`).
- [ ] **Step 4: Timing:** `node tests/bench_runs_interleaved.js` (+5%), `node tests/bench_solver.js --rounds 7` (+30%),
  planning time with a stored plan on the gap households (median of 9 full refreshes, 150 ms), `optimizePlan` wall time per gap
  household (target 10 s).
- [ ] **Step 5: Docs:** `cliff-plan.md` (the plan shape, `mult`, `objective` / `rankEvenly` / `offMemo`, the guarded
  comparison, `report.stored`, `optimizePlan`, the new hooks), `inputs-and-ui.md` (`storedPlan`, its guard, the card),
  `test-inventory.md` (new tests), the Batch 5 notes subsection (decisions, figures, the movers list from Tasks 4 and 8, the
  lambda table, timings, follow-ups); the "Batch 5: optimizer" status line names 4a done and 4b next.
- [ ] **Step 6:** `npm test` green; commit ("Batch 5 4a: measurements and notes").

---

## Self-review (done while writing)

- Spec coverage: 4.1 Tasks 1-2 (the `levers` / `orders` / `splits` slots stay null until 4c / 4d); 4.2 Task 4; 4.3 Task 5 (light
  and deferred both go through `computeCliffPlan`, so no planning-layer change); 4.4 Task 8 (fingerprint in the store layer);
  4.5 Tasks 2, 3, 7; 4.6 Tasks 6, 8; 4.7 Tasks 1-9; decision 5 / section 9 Task 9; decision 6 Tasks 3-4; decision 7 Tasks 3,
  5, 7, 8. Not in 4a by design: sections 5-8 (4b-4d), decision 9 (4b).
- Spec amendment made here: 4.2's duplicated lists become an import (Task 4), recorded in that commit.
- Type consistency: `makePlan`, `PLAN_KEYS`, `MULT_GRID`, `phaseOf`, `bracketEvenBetter`, `storedPlanVerdict`,
  `isValidStoredPlan`, `optimizePlan`, `runHistoricalCyclesWith`, `monteCarloSummaryWith`, `storedPlanFingerprint` are each
  defined once (Interfaces) and used under the same names later.
