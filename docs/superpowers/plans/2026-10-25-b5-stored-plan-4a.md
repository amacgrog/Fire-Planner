# Batch 5 step 4a: the stored plan and Optimize -> Apply (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plan the user can keep: Optimize searches per-phase lambda multipliers and all six brackets, Apply stores the plan in
`state.storedPlan`, and every planning keeps it only while it is no worse than the automatic plan on the current inputs.

**Architecture:** The plan object gets one fixed shape (a small `plan-shape.js` module) that the engine, the guard and the store
share. `computeCliffPlan` gains options (`mult`, `objective`, `rankEvenly` with `tieBracket`, an `off` memo) and the guarded
comparison against `ctx.inputs.storedPlan`. A new engine function `optimizePlan` runs the coordinate search over those options.
A new US card replaces the multi-lever card; the shared wrappers gain context-taking historical and Monte Carlo entry points for
its with/without success rates.

**Tech Stack:** plain ES modules under `src/`, esbuild (`npm run build`), Vitest (`tests/unit/`), Playwright (root `test_*.js`,
`tests/*.js`).

**Spec:** `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md` (approved 2026-10-25). Sections 2 (decisions 1-9), 3, 4
and 11 are what this plan builds; 5-8 are 4b-4d (not here); 9 is Task 9's measurement.

## Global Constraints

- `CLAUDE.md` holds: engine functions take the run context first and read only `ctx.*`; one context shape (`newRunContext`);
  every module-level binding of an engine-closure module is registered by kind in `tests/engine-purity.json` in the same commit;
  every computed module-level initializer (including `Object.freeze([...])`) has a `// load-time: <reason>` comment directly
  above it (`tests/ui_cycles.js` checks `core/` too); no import cycle outside `ui/`; line 1 of every new `core/` / `ui/` module
  is a one-line `//` purpose comment then a blank line; two-space module indentation; never reformat a module you also change.
- **`npm run analyze` in every task that adds, renames or removes an export or a module** (the module-map check in `npm test`
  fails otherwise), committed with the task.
- Vitest rules (CLAUDE.md "Writing a Vitest test"): only through `world()`; `toBe` / `toStrictEqual`, never `toBeCloseTo`;
  hand-computed expected values stay literals; `toStrictEqual` ignores key order, so key-order checks use `Object.keys`;
  `makeCounter` + `afterAll` count for suites with many checks; contexts from `w.ctx()` / `w.ctxBuilder()`; `stateContextFor()`
  for variant factories; a new suite run alone and with `--sequence.shuffle`. `w.setState` normalizes: every hand-built stored
  plan must pass the guard, and each test asserts `state.storedPlan !== null` after setting it.
- A bug found in existing `src/` code is reported to the controller, not fixed in the task (rule 7), except the
  `rothConvBracket` guard (spec decision 6).
- Byte-identity proof: the engine snapshots (`tests/snapshot.js`) and `tests/cliff_plan.js` / `tests/bracket_search.js`, not a
  new test comparing new code with itself.
- Branch gate: `npm test` and `npm run test:ui` green; engine snapshots byte-identical; the US `tests/legacy_state.js` baseline
  regenerated once, as an intended change (Task 4), Canada's cases unchanged; `snapshot_ui` movers only from the card's markup
  (Task 8), listed; timing `bench_runs_interleaved.js` +5% for states without a stored plan; planning with a stored plan within
  150 ms; `tests/analysis_parity.js` against a pre-4a base differs only in the bundle's removed multi-lever `card` keys (noted).
- US badge V139 -> V140 in Task 8, with the README feature line.
- Batch notes go in `docs/next-batches-plan.md` "Batch 5 notes" (a new "Batch 5 step 4a" subsection), not `docs/reference.md`.
- Never push, never open a PR, never `git stash`, never touch another worktree. Commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Reviews (per task and the final whole-branch review) run on Opus (owner, 2026-10-25).

## Spec amendments made by this plan (recorded in the named task's commit and in the Batch 5 notes)

1. Spec 4.2's duplicated id lists become an import from `plan-shape.js` (Task 4); the list check moves to "every line `choose`
   records is in `PLAN_LINE_IDS`" (Task 1).
2. Spec 4.1 / 4.2's `levers` is `null` in 4a (the guard accepts only `null`); 4c widens the guard to `{ order, split }`
   booleans. `orders` / `splits` get their value checks now (`'traditional'`; `'A'` / `'B'`), though 4a writes `null`.
3. Spec 4.3's "the automatic plan's candidates under `auto`" is kept as: the report's existing fields stay the automatic plan's,
   and `report.stored.used` says which plan runs (no `auto` key).
4. Spec 4.5's "ties to the automatic plan's kept bracket" is the `tieBracket` option (Task 3).

## Review Focus

1. **An old save or a hand-edited one.** A save with no `storedPlan` loads as today; a malformed stored plan drops whole to
   `null` and the automatic plan runs, never a partial plan. Test: Task 4.
2. **An edit after Apply** (retirement age, spending, the bracket setting, the tax year): the dashboard runs the automatic plan
   whenever the stored plan does worse on the new inputs, and the card says why. Tests: Task 5 (Vitest) and Task 8 (Playwright).
3. **The guard switched off and on with a stored plan.** Off: no plan runs, the card says the applied plan is not used; on: it
   is used again. Test: Task 8.
4. **Optimize with nothing to gain** (a household that already depletes, or whose automatic plan is already best): no Apply
   button and the card says so. Tests: Task 7 and Task 8.
5. **A scenario comparison open with a saved scenario carrying a stored plan, while typing:** no full planning per keystroke
   (`__test_planForStateComputes()` delta 0) and the comparison row equals loading that scenario. Test: Task 8.

---

## File structure

- Create `src/us/core/cliff-plan/plan-shape.js`: `PLAN_KEYS`, `makePlan`, the id lists, `BRACKET_CANDIDATES` (moved here from
  `run-projection.js`, which imports it), `MULT_GRID`, `phaseOf`, `isValidStoredPlan`. It imports nothing from
  `run-projection.js` (no cycle); `normalize-state.js` imports it without pulling in the engine.
- Create `src/us/core/optimizer/plan-search.js`: `optimizePlan`.
- Create `src/us/ui/results/plan-optimizer.js`: the plan card (render, search, apply, clear), `storedPlanFingerprint`, and its
  wiring function.
- Modify `src/us/core/projection/run-projection.js` (`computeCliffPlan`, `lambdaOf`, the plan trace), `src/us/core/cliff-plan/solver.js`
  (`lambdaEstimate`, `bracketEvenBest`, `storedPlanVerdict`), `src/us/core/cliff-plan/planning.js` (`cliffPlanSummary`),
  `src/us/core/inputs/defaults.js`, `src/us/ui/inputs/normalize-state.js`, `src/us/ui/inputs/fields.js`,
  `src/shared/core/projection/simulate.js`, `src/us/index.html`, `src/us/ui/results/roth-optimizer.js`,
  `src/us/ui/results/roth-optimizer-controls.js`, `src/us/ui/results/render.js`, `src/us/main.js`,
  `src/us/ui/install-test-hooks.js`, `tests/unit/helpers/us-plan.js`, `tests/engine-purity.json`.

---

### Task 1: One plan shape

**Files:**
- Create: `src/us/core/cliff-plan/plan-shape.js`
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`; `BRACKET_CANDIDATES` re-exported from
  `plan-shape.js` so existing importers keep working, or importers updated), `tests/engine-purity.json` (the new module's
  constants; `BRACKET_CANDIDATES`'s entry moves to the new module)
- Test: `tests/unit/us/plan-shape.test.js`; update whole-plan comparisons in `tests/cliff_plan.js`,
  `tests/unit/us/bracket-search.test.js`, `test_bracket_search.js`

**Interfaces:**
- Produces:
  - `PLAN_KEYS = ['intents', 'family', 'bracket', 'bracketFrom', 'orders', 'splits', 'levers', 'mult', 'orderPhases']` (frozen)
  - `makePlan(fields) -> plan`: exactly `PLAN_KEYS` in that order; missing: `intents: {}`, `family: 'none'`, `bracket: null`,
    `bracketFrom: null`, the other five `null`. An unknown field throws.
  - `PLAN_LINE_IDS = ['medicaid', 'acaFloor', 'aca400', 'irmaa1', 'irmaa2', 'irmaa3', 'irmaa4', 'irmaa5']`,
    `PLAN_FAMILIES = ['all', 'aca', 'irmaa', 'none']`, `PLAN_RETS = ['H', 'A', 'B']`, `PLAN_KINDS = ['under', 'fill']`,
    `BRACKET_CANDIDATES = [10, 12, 22, 24, 32, 35]`, `MULT_GRID = [0, 0.5, 1, 1.5, 2]` (all frozen, each with its load-time
    comment and engine-purity entry).
  - Every plan `computeCliffPlan` builds goes through `makePlan`. `select`'s `held` argument becomes a full plan,
    `makePlan({ bracket: b, bracketFrom: from })` (today `{ bracket, bracketFrom }`, run-projection.js:1717), so it carries
    `intents: {}` / `family: 'none'`; the subset plans therefore put the subset last:
    `makePlan({ ...(held || { bracket: from, bracketFrom: from }), intents: sub, family: fam })`. `select(null)` still passes
    `null` to `choose` and `off`.

- [ ] **Step 1: Write the failing tests** in `plan-shape.test.js`: `Object.keys(makePlan({}))` `toStrictEqual(PLAN_KEYS)` and
  the values are the defaults above; `Object.keys(makePlan({ bracket: 24, family: 'aca', bracketFrom: 22 }))` is `PLAN_KEYS`;
  `makePlan({ nope: 1 })` throws; `Object.keys` of `computeCliffPlan(ctx).plan` is `PLAN_KEYS` on the CA gap household (search
  on, as `bracket-search.test.js`'s helper does) and on the default household with the guard on; every intent line recorded by
  `computeCliffPlan` (all bracket candidates' `choose` runs, through `usPlan(w).runPlanMode({ planMode: 'choose' })`'s
  `intents`) on the three gap households and the 48-household sample of `scanHouseholds` (every 16th) is in `PLAN_LINE_IDS`
  and its `ret` in `PLAN_RETS`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/plan-shape.test.js` — FAIL (module missing).
- [ ] **Step 3: Implement**, then update the whole-plan comparisons in the three test files to the new shape (field values
  unchanged).
- [ ] **Step 4: Run** `npx vitest run tests/unit/us`, `npm run build && node tests/engine_purity.js && node tests/ui_cycles.js
  && node tests/cliff_plan.js && node tests/bracket_search.js && node tests/snapshot.js` — PASS, snapshots identical.
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4a: one plan shape (plan-shape.js)").

### Task 2: Per-phase lambda multipliers

**Files:**
- Modify: `src/us/core/cliff-plan/solver.js` (`lambdaEstimate`), `src/us/core/cliff-plan/plan-shape.js` (`phaseOf`),
  `src/us/core/projection/run-projection.js` (`lambdaOf` near line 718; the plan trace near line 1461; `computeCliffPlan`'s
  `select`)
- Test: `tests/unit/us/plan-mult.test.js`

**Interfaces:**
- Consumes: `makePlan`, `MULT_GRID` (Task 1).
- Produces:
  - `lambdaEstimate({ ..., mult = 1 })`: `lambda: Math.min(LAMBDA_MAX, Math.max(0, (SOLVER_LAMBDA_MULT * mult * rateSum) / 3))`;
    `tauGain` unchanged.
  - `phaseOf(ctx, age) -> 0 | 1 | 2`: `age < 65 ? 0 : age < rmdStartAge(ctx, ctx.inputs.ageA) ? 1 : 2` (`rmdStartAge`,
    `src/us/core/income/distributions.js`: 75 when `taxYear - round(age today) >= 1960`, else 73), `age` being Partner A's age
    that year.
  - `lambdaOf` passes `mult: plan && plan.mult ? plan.mult[phaseOf(ctx, age)] : 1` in `choose` (the phase computed once per
    year).
  - Trace-only: `planTr.lambda = yearLambda ? yearLambda.lambda : null` beside `planTr.lambdaNeed` (no row field).
  - `computeCliffPlan(ctx, { search = true, mult = null } = {})`: `mult` null or `[1, 1, 1]` runs today's plans exactly (the
    user's bracket keeps `null`); otherwise every `choose` run receives a plan with `mult` (the user's bracket:
    `makePlan({ bracket: from, bracketFrom: from, mult })`; other brackets: their held plan with `mult`). `off` runs never carry
    `mult`. The returned plan carries `mult` (null when null or all ones).

- [ ] **Step 1: Write the failing tests** in `plan-mult.test.js`: on the TX gap household, the `choose` trace
  (`runPlanMode({ planMode: 'choose', planTrace: true })` with `plan: makePlan({ bracket: 22, bracketFrom: 22, mult: [0, 0,
  0] })`) has `lambda === 0` in every year with a candidate, and the plan-less trace has a non-zero `lambda` in at least one of
  those years (non-vacuous); the rows of `choose` with `mult: [1, 1, 1]` `toStrictEqual` the rows with `plan: null` on CA, TX, NY
  and the converting `std R rothConv+aca+live` scenario of `tests/cliff_plan.js` (cliff_plan.js:384); `phaseOf` at tax year 2026: A aged 67 today
  (`rmdStartAge` 73): 64 -> 0, 65 -> 1, 72 -> 1, 73 -> 2; A aged 60 today (`rmdStartAge` 75): 74 -> 1, 75 -> 2.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite alone and shuffled, `npx vitest run tests/unit/us`, `npm run build && node tests/snapshot.js &&
  node tests/cliff_plan.js && node tests/solver_hooks.js` — PASS, identical.
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4a: per-phase lambda multipliers (default byte-identical)").

### Task 3: The objective, even bracket ranking and the `off` memo in `computeCliffPlan`

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`), `src/us/core/cliff-plan/solver.js`
  (`bracketEvenBest`)
- Test: `tests/unit/us/bracket-search.test.js` (new cases, counted)

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces:
  - `computeCliffPlan(ctx, { search = true, mult = null, objective = 'endValue', rankEvenly = false, tieBracket = null,
    offMemo = null } = {})`.
  - Each candidate's measure gains `score`, derived with no extra pricing: `endValue` -> `value`; `lifetimeCost` -> `cost === 0 ?
    0 : -cost` (never `-0`). `planCandidateBetter` and the bracket step compare `score` (for `endValue` `score === value`: no
    choice changes). The measure keeps no sim.
  - `bracketEvenBest(entries, tieBracket) -> entry` in `solver.js` (used when `rankEvenly`): over every bracket's best (no
    running-best chaining), keep those with the latest depletion (null = never), then of those the latest first home draw, then
    the maximum `score`; among entries within `Math.max(1, 0.001 * Math.abs(maxScore))` of that maximum, the one whose
    `bracket === tieBracket` if present, else the lowest bracket (`BRACKET_CANDIDATES` order, never the search order, which
    starts at the setting). Each bracket's measures do not depend on the setting (`solveRothConversion` resolves `bracket ===
    bracketFrom` to the setting), so the kept bracket does not depend on it either.
  - `offMemo`: a caller-owned `Map` keyed by bracket holding each bracket's `off` measure (plus its run's `homeDrawAge` /
    `depletedAge`); valid only for one working copy of the inputs (the caller makes one Map per `optimizePlan` call).
  - The report's `brackets` entries gain `score`.

- [ ] **Step 1: Write the failing tests:** with `rankEvenly: true, tieBracket: 22` on the CA and TX gap households,
  `rothConvBracket: 12` and `rothConvBracket: 22` give the same kept bracket (the strict-win default gives different ones on at
  least one of them: assert that too, so the test is not vacuous; if neither household differs, find one in `scanHouseholds`
  and name it in the test); `objective: 'lifetimeCost'` on CA keeps the bracket the report's own `brackets` table shows with the
  latest depletion and home draw and the lowest `cost` (read from the table, rule applied by the test's own literal loop);
  a lifetime cost of exactly 0 scores `0` (`Object.is(score, 0)`), using the household with no tax (`BROKE` in this suite);
  `offMemo`: a second call with the same Map returns `toStrictEqual` results and the Map has one entry per bracket searched.
- [ ] **Step 2: Run** — FAIL.
  Add a case where two brackets other than `tieBracket` tie within the tolerance (a synthetic `entries` list passed to
  `bracketEvenBest` directly): the lower bracket is kept, whatever order the list is in.
- [ ] **Step 3: Implement.** Update the existing exact key-list assertion of `report.brackets` entries
  (`bracket-search.test.js:162`) to include `score`, and the suite's check count (line 278).
- [ ] **Step 4: Run** `npx vitest run tests/unit/us`, `npm run build && node tests/snapshot.js && node tests/bracket_search.js
  && node tests/cliff_plan.js` — PASS, identical (the byte-identity proof for the default options).
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4a: computeCliffPlan objective, even bracket ranking, off memo").

### Task 4: `state.storedPlan`, its guard, the `rothConvBracket` guard, the Monte Carlo seed

**Files:**
- Modify: `src/us/core/inputs/defaults.js` (`storedPlan: null`), `src/us/ui/inputs/normalize-state.js`,
  `src/us/ui/inputs/fields.js` (the `rothConvBracket` entry, line 150), `src/us/core/cliff-plan/plan-shape.js`
  (`isValidStoredPlan`), `src/shared/core/projection/simulate.js` (`monteCarloSeed`)
- Test: `tests/unit/us/guard-normalize.test.js`, `tests/legacy_state.js` (new cases; US baseline regenerated),
  `tests/unit/shared/success-with.test.js` (created here with the seed case; grows in Task 6)

**Interfaces:**
- Consumes: Task 1's lists and `BRACKET_CANDIDATES` / `MULT_GRID`; the registry ids (`US_OBJECTIVES` keys,
  `src/us/core/optimizer/objectives.js`; import the ids, not the registry's pricing, if that keeps `plan-shape.js` free of
  `solver.js`: otherwise inline `['endValue', 'lifetimeCost']` with a Vitest check against `Object.keys(US_OBJECTIVES)`).
- Produces:
  - `STORED_PLAN_KEYS = ['v', 'plan', 'objective', 'mult', 'madeFor', 'taxYear', 'summary']` (frozen).
  - `isValidStoredPlan(sp) -> boolean`: a plain object with exactly `STORED_PLAN_KEYS`; `v === 1`; `plan` a plain object with
    exactly `PLAN_KEYS` in order; `intents` keys valid ages (`String(Number(k)) === k`, integer 0-120) with values exactly
    `{ kind, line, ret }` from the lists; `family` in `PLAN_FAMILIES`; `bracket` / `bracketFrom` in `BRACKET_CANDIDATES`;
    `orders` null or ages -> `'traditional'`; `splits` null or ages -> `'A'` / `'B'`; `levers`, `orderPhases` null; `plan.mult`
    and envelope `mult` null or three `MULT_GRID` values; `objective` a registry id; `madeFor` a string; `taxYear` an integer;
    `summary` exactly `{ gain, success: { hist: [a, b], mc: [c, d] } }` with `gain` finite and each rate finite or null.
  - `normalizeState`: `s.storedPlan = isValidStoredPlan(s.storedPlan) ? s.storedPlan : null` (the original object kept).
  - `rothConvBracket` FIELDS entry gains `values: [10, 12, 22, 24, 32, 35], fallback: 22`.
  - `monteCarloSeed` leaves out `storedPlan` by name with the two dismissal lists (`const { dismissedEstimates,
    dismissedUnusualAssumptions, storedPlan, ...rest } = inputs`); otherwise every US seed changes (`storedPlan: null` would be
    hashed) while Canada's would not.

- [ ] **Step 1: Write the failing tests.** `guard-normalize.test.js` (through `w.setState` and the store's state): a valid
  stored plan survives as the same object (`toBe`) with unchanged JSON; each malformed kind gives `null`: `v: 2`, an extra
  envelope key, a missing envelope key, an extra plan key, plan keys out of order, intent ages `'07'`, `'121'`, `'6.5'`, an
  intent line `'senior'`, `ret: 'C'`, an intent with an extra key, `bracket: 23`, `plan.mult: [1, 1, 3]`, envelope
  `mult: [1, 1]`, `orders: { 60: 'roth' }`, `splits: { 60: 'C' }`, `levers: { order: true }`, `objective: 'x'`, `madeFor: 5`,
  `taxYear: 2026.5`, `summary.gain: NaN`, `summary.success.mc: [0.5]`; `rothConvBracket: 23` and `'22'` give 22.
  `success-with.test.js`: `monteCarloSeed(2026, 500, { ...s, storedPlan: X })` `toBe` `monteCarloSeed(2026, 500, s)`.
  `tests/legacy_state.js`: add `'stored plan: valid'`, `'stored plan: malformed'`, `'rothConvBracket invalid'` (US).
- [ ] **Step 2: Run** the two Vitest files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them; `npm run build && node tests/legacy_state.js`: the US cases fail on their hash (the new key);
  confirm the only differences are `storedPlan: null` and the new cases (dump one before/after), and that every Canada case
  passes unchanged; then `node tests/legacy_state.js --update`; `node tests/snapshot.js` (identical), `node
  tests/field_registry.js`, `npm run test:unit`.
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4a: state.storedPlan and its guard; rothConvBracket guard; MC seed
  excludes the stored plan (US legacy_state baseline regenerated for the new key)"), naming any legacy case the bracket fallback
  moved and spec amendments 1-2.

### Task 5: The guarded comparison in `computeCliffPlan`, and the summary of the winner

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`), `src/us/core/cliff-plan/solver.js`
  (`storedPlanVerdict`), `src/us/core/cliff-plan/planning.js` (`cliffPlanSummary`)
- Test: `tests/unit/us/stored-plan.test.js` (counted)

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces:
  - `storedPlanVerdict(stored, auto) -> 'better' | 'tie' | 'depletes' | 'home' | 'score'` in `solver.js`, over measures
    `{ depletedAge, homeDrawAge, score }` on the stored plan's objective; with `tol = Math.max(1, 0.001 * Math.abs(stored.score))`:
    `depletes` / `home` when the stored plan is earlier on depletion / first home draw (null = never); `better` when it is later
    on either, or `stored.score > auto.score + tol`; `score` when `auto.score > stored.score + tol`; else `tie`.
  - In `computeCliffPlan`, with the guard on and `inputs.storedPlan` set: one `apply` run of `storedPlan.plan`, measured like
    every candidate; the automatic best's `score` on `storedPlan.objective` derived from its measure (Task 3's rule, no rerun);
    the verdict; the returned `plan` is `storedPlan.plan` unless the verdict is `depletes`, `home` or `score`. The report's
    existing fields stay the automatic plan's, and it gains `stored: { used, reason, depletedAge, homeDrawAge, value, cost,
    bracketHonoured }` (spec amendment 3), `bracketHonoured = storedPlan.plan.bracketFrom === inputs.rothConvBracket`.
  - `cliffPlanSummary(plan, report)`: with `report.stored && report.stored.used` the text starts "Applied plan:" (the same
    clause builder over the stored plan's intents); the "not used" family clauses are omitted; the bracket clause is
    " Conversions: the applied plan uses the X% bracket." only when `report.stored.bracketHonoured` and its bracket differs
    from `bracketFrom`, else none (after the setting changed, `apply` converts at the setting).

- [ ] **Step 1: Write the failing tests.** Envelopes from a helper `stored(plan, objective = 'endValue')` returning
  `{ v: 1, plan, objective, mult: null, madeFor: 'test', taxYear: 2026, summary: { gain: 0, success: { hist: [null, null], mc:
  [null, null] } } }`; after each `w.setState({ ...patch, storedPlan })` assert `state.storedPlan !== null`. Cases:
  - the automatic plan stored as is -> `reason: 'tie'`, returned plan `toStrictEqual` it, `used: true`;
  - TX gap household, `score`: take the `choose` trace (`planTrace: true`) and pick a year whose best candidate other than the
    winner has `ok: true` (its trial meets its line); store the automatic intents plus that intent; expect `score`, and the
    store's own run (`usPlan(w).runPlanMode({ planMode: undefined })`, the `planForState` path) rows `toStrictEqual` the apply run
    of the automatic plan;
  - `depletes`: the CA household's automatic plan stored, then `spending` raised until the stored plan's apply run depletes
    earlier than the re-planned automatic plan (find the spending in the test with a literal list of tries; assert the reason and
    both ages from the report);
  - `home`: the same with the `BROKE` household of `bracket-search.test.js`;
  - `lifetimeCost`: a stored plan with lower cost and lower end value than the automatic plan -> `better` (its `objective`
    decides);
  - the bracket setting changed after Apply: a stored plan with `bracket: 24, bracketFrom: 22` and `rothConvBracket: 12` -> its
    apply run's rows `toStrictEqual` an apply run of the same intents at the 12% setting; the verdict still decides;
    `report.stored.bracketHonoured === false` and the summary has no bracket clause;
  - the tax year changed (`w.setTaxYear(2027)`): the comparison still runs (staleness is display only);
  - guard off with a stored plan: `{ plan: null, report: null }`;
  - `cliffPlanSummary` of a used stored plan starts "Applied plan:" and contains no "not used".
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `planForState` / `refreshCliffPlan` need no change (`storedPlan` is in the state JSON).
- [ ] **Step 4: Run** the suite alone and shuffled, `npx vitest run tests/unit/us`, `npm run build && node tests/snapshot.js &&
  node tests/cliff_plan.js && node tests/bracket_search.js` — PASS, identical.
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4a: the stored plan as a guarded candidate (spec 4.3)").

### Task 6: Context-taking historical and Monte Carlo success rates (shared)

**Files:**
- Modify: `src/shared/core/projection/simulate.js`
- Test: `tests/unit/shared/success-with.test.js`

**Interfaces:**
- Produces (exported from `simulate.js`):
  - `runHistoricalCyclesWith(ctx) -> { cycles, successRate, projectionYears }`: projection years from `ctx.inputs`; per cycle
    `simulateHistoricalWith(newRunContext({ inputs: ctx.inputs, taxYear: ctx.taxYear, taxFactors: [], plan: ctx.plan, planMode:
    ctx.planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test }), rowFn)`; never reuses `ctx` across paths.
  - `monteCarloSummaryWith(ctx, pathCount)`: seed `monteCarloSeed(ctx.taxYear, pathCount, ctx.inputs)`; a fresh context per path
    as above; the same shape as `monteCarloSummary`.
  - Both cached in `histCache` / `mcCache` under a key of the kind, the arguments, the tax year, the inputs' JSON **without
    `storedPlan`** (the same exclusion as the seed: the engine reads the stored plan only through `ctx.plan`) and
    `JSON.stringify(ctx.plan)`. So the card's with/without runs do not evict the dashboard's entry, the card's "with" run is
    the dashboard's entry after Apply (same inputs less the stored plan, same plan), and its "without" run is the dashboard's
    current entry when no legacy schedule is set. `runHistoricalCycles()` / `monteCarloSummary(n)` use the same key.
  - `runHistoricalCycles()` = `runHistoricalCyclesWith(storeContext())`, `monteCarloSummary(n)` =
    `monteCarloSummaryWith(storeContext(), n)`. `runHistoricalCyclesFresh` and `runMonteCarlo` stay as they are (state-based):
    they are the reference the tests compare against.

- [ ] **Step 1: Write the failing tests** (in `tests/unit/shared/`, run by both projects; the cases branch on `w.country`, the
  US ones loading `us/...` modules only under the US project): on the US default household, a US converting household with
  plan intents, and Canada's default household, with the context built **with the plan** (`await w.ctx({ withPlan: true })`,
  i.e. `storeContext()`; `w.ctx()` alone has `plan: null`): an uncached `runHistoricalCyclesWith(ctx)` (on a fresh world,
  before anything is cached) `toStrictEqual` `runHistoricalCyclesFresh()`; `monteCarloSummaryWith(ctx, 200)`'s
  rate and survived count `toBe` those computed from `runMonteCarlo(200)`; on the US converting household, the automatic plan
  vs `makePlan({ bracket: 22, bracketFrom: 22 })` (no intents) give different `successRate` or `cycles` (non-vacuous; pick the
  household so they differ), and calling A, then B, then A returns A's first result object (`toBe`: the cache keeps both).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** No state swap anywhere.
- [ ] **Step 4: Run** `npm run test:unit`, `npm run build && node tests/historical_rates.js && node tests/snapshot.js` — PASS,
  identical; `node tests/bench_runs_interleaved.js` within +5%.
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4a: runHistoricalCyclesWith / monteCarloSummaryWith (shared, results
  unchanged)").

### Task 7: `optimizePlan`

**Files:**
- Create: `src/us/core/optimizer/plan-search.js` (plus `tests/engine-purity.json` entries for any module binding)
- Test: `tests/unit/us/plan-search.test.js` (counted)

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: `optimizePlan(ctx, { objective = 'endValue' } = {}) -> { plan, mult, objective, measure, base, current, gain,
  plannings, legacy }`:
  - working copy `{ ...ctx.inputs, storedPlan: null, appliedRothSchedule: null, appliedMixSchedule: null }`; its context
    `newRunContext` from `ctx`'s fields with `inputs` replaced;
  - `base`: `computeCliffPlan(copyCtx)` (the automatic plan of the copy), measured on `objective` (Task 3's derivation from its
    kept candidate);
  - search candidates: `computeCliffPlan(copyCtx, { mult, objective, rankEvenly: true, tieBracket: base.plan.bracket, offMemo })`,
    one `offMemo` Map per call; `mult` by coordinate search over `MULT_GRID` from `[1, 1, 1]` (each pass: phases 0, 1, 2 in turn,
    every other grid value, keep a strict win, at most 3 passes, stop after a pass with no change); a phase is skipped when
    no age in `ageA .. ageA + projectionYears` falls in it (`projectionYears` from both life expectancies, as
    `bracketSearchApplies` computes it: survivor years are keyed by A's age too);
  - `current`: when `ctx.inputs.storedPlan` is a valid stored plan, its plan run through `apply` on the copy, measured; it is a
    candidate; it is "in use" when `storedPlanVerdict(current, base)` is `better` or `tie`;
  - ranking of candidates: none may deplete or first draw on the house earlier than `base`; then latest depletion, latest first
    home draw, then `score` higher by more than `Math.max(1, 0.001 * |best.score|)` (a strict win replaces);
  - `gain`: `gainInTodaysDollars(objectiveById(objective), copyCtx, winnerSim, referenceSim)` where `winnerSim` is one `apply`
    run of the winner and `referenceSim` one `apply` run of what runs today (`current` when in use, else `base`) on the copy;
  - `legacy`: when the original inputs had applied schedules with keys, `{ depletedAge, homeDrawAge, score }` of the original
    inputs' own planned run (information only), else null;
  - `plan`: a `makePlan` object, `mult` set (null when `[1, 1, 1]` wins); `measure` the winner's
    `{ depletedAge, homeDrawAge, score, value, cost }`; `plannings` the number of `computeCliffPlan` calls; `winner: 'search' |
    'base' | 'current'` (which candidate won, for the card's copy).

- [ ] **Step 1: Write the failing tests:** for CA, TX, NY at 100 and 75: the winner never depletes or first draws on the house
  earlier than `base`; at equal depletion and home draw, `measure.score >= base.score`; the winner's plan run through `apply`
  on the copy gives a measure `toStrictEqual` `measure` (scored as Apply runs it); two calls `toStrictEqual`; the depleting
  household (`DEPLETING`, `tests/helpers/plan-households.js:43`, which depletes at 62 with no cliff in reach): `gain <= 1`,
  and `base.plan.intents` is empty and every candidate equals `base` (so the reason is visible if a later default moves it); storing the winner (an envelope that passes the guard,
  `mult` from the result) and planning again: `computeCliffPlan(ctx).report.stored.reason === 'better'` and `used` (spec 4.7's
  right-after-Apply case), and a second `optimizePlan` returns the same plan with `gain <= 1`; a household with
  `appliedRothSchedule` keys: `legacy` set and the search ran on the copy (`report.brackets.length > 1` for the winner's
  planning, which the strict rule disables while the schedule has keys). Print `plannings` and wall time per case (not
  asserted).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Context first; no store import.
- [ ] **Step 4: Run** the suite alone and shuffled, `npx vitest run tests/unit/us`, `npm run build && node tests/engine_purity.js
  && node tests/snapshot.js`. A gap case over 10 s: report the timings to the controller before Task 8.
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4a: optimizePlan (per-phase multipliers, even brackets, scored as Apply
  runs it)").

### Task 8: The plan card (replaces the multi-lever card), hooks and UI tests

**Files:**
- Create: `src/us/ui/results/plan-optimizer.js`, root `test_plan_optimizer.js`
- Modify: `src/us/index.html` (`#multiLeverOptimizerCard` becomes the plan card; the `<h1>` badge V139 -> V140),
  `src/us/ui/results/roth-optimizer.js` (remove `renderMultiLeverOptimizer`; `renderMultiLeverAppliedStatus` keeps rendering the
  legacy schedules' status into `#multiLeverAppliedStatus`, which stays in the new card; `planBracketOverSetting` names "the
  applied plan" when `cliffPlanStore.report?.stored?.used`), `src/us/ui/results/roth-optimizer-controls.js` (remove the
  multi-lever Search / Apply wiring; keep `applyMultiLeverSchedule` / `clearAppliedMultiLeverSchedule`, with their writes to the
  removed `#multiLeverApplyBtn` / `#multiLeverApplyNote` dropped; keep the `#multiLeverAppliedStatus` clear listener),
  `src/us/ui/results/render.js` (the card's status in the light render), `src/us/main.js` (`wirePlanOptimizer()` after
  `wireRothOptimizerControls()`), `src/us/ui/install-test-hooks.js` (`__test_optimizePlan(objective)`,
  `__test_applyStoredPlan(result)`, `__test_clearStoredPlan()`, `__test_planOptimizerCard()`; the analysis bundle drops the
  multi-lever card ids from `ANALYSIS_CARD_IDS`, the `renderMultiLeverOptimizer` call and `card.lastMultiLeverRun`, keeping
  the optimizer results; all three are listed as the expected `analysis_parity.js` differences),
  `tests/unit/helpers/us-plan.js` (`optimizePlan` hook mirror), `test_apply_optimizer_schedule.js`, `test_optimizer_ui.js`,
  `README.md`, `CLAUDE.md` ("State and the sanctioned writes": `plan-optimizer.js` writes `storedPlan` and clears the legacy
  schedules)
- Test: `test_plan_optimizer.js`; the two changed UI scripts; `tests/snapshot_ui.js`

**Interfaces:**
- Consumes: `optimizePlan` (Task 7), `runHistoricalCyclesWith` / `monteCarloSummaryWith` (Task 6), `fnv1a32` and the guard
  (Task 4), `report.stored` (Task 5), `mcPathCount` (`src/shared/core/chart-prefs.js`).
- Produces:
  - `wirePlanOptimizer()`; `renderPlanOptimizerStatus()` (light render).
  - `storedPlanFingerprint(s) -> string`: `String(fnv1a32(JSON.stringify(rest)))` of `normalizeState(s)` without `storedPlan`,
    `dismissedEstimates`, `dismissedUnusualAssumptions`; memoized on `cliffPlanStore.key` (one computation per state JSON, not
    per keystroke render).
  - Stale when the fingerprint differs from `storedPlan.madeFor` or `storedPlan.taxYear !== currentYear`.
  - The with / without rates: contexts `storeRunContext(copy, { plan, planMode: 'apply' })` (`planning.js`) on Optimize's working
    copy (no legacy schedules, no stored plan), `plan` the found plan (with) and `result.base`'s plan (without);
    `runHistoricalCyclesWith(ctx).successRate` and `monteCarloSummaryWith(ctx, mcPathCount).successRate`.
  - Search: the objective radio pair (`name="planObjective"`, values `endValue` (checked) and `lifetimeCost`, labels "After-tax
    end value" / "Lifetime tax + healthcare"); the button shows "Searching…" and the search runs after
    `requestAnimationFrame(() => setTimeout(..., 0))`, as the old button did.
  - Apply: `snapshotForUndo('Applied plan')`; legacy schedules with keys set to null; `state.storedPlan = { v: 1, plan, objective,
    mult, madeFor: storedPlanFingerprint(state), taxYear: currentYear, summary }` (fingerprint after the schedules are cleared);
    `render()`; `saveInputs()`. Clear: undo snapshot, `state.storedPlan = null`, `render()`, `saveInputs()`. No Apply button when
    `!applyGateOpen(result.gain)`.
  - Copy (spec 4.4 / 4.5 / 4.6, exact): "Applied plan in use."; "Applied plan in use. It was computed for different inputs; it
    still beats the automatic plan on these inputs. Re-run Optimize to refine it."; "Your applied plan was computed for different
    inputs and no longer beats the automatic plan, which is in use. Re-run Optimize." plus " (it runs out earlier)" / " (it draws
    on home equity earlier)" / " (it scores lower)"; "The cliff plan is off, so the applied plan is not used."; "The automatic plan
    is already the best this search found." (`winner === 'base'`); "Your applied plan is already the best this search found."
    (`winner === 'current'`); "Applying replaces your applied conversion / withdrawal schedule."; when
    `result.legacy` depletes later or first draws on the house later than the found plan: "Your applied schedule lasts longer
    (or draws on home equity later) than this plan; applying it replaces that schedule."; "Your conversion bracket changed since
    this plan was applied; it now converts at your X%."; the lead: "Searches for a tax-efficient plan on your own assumptions; a
    better one may exist."; the multipliers: "How strongly the plan weighs future tax when choosing the years to stay under or
    fill a line: before 65 ×a, 65 to RMDs ×b, RMD years ×c."

- [ ] **Step 1: Write the failing Playwright script** `test_plan_optimizer.js` (exits 1 on any failure; locator waits only):
  - TX gap household (life 100) through the autosave; open the card; Search; the result shows a gain and four rates;
  - Apply; status "Applied plan in use."; `window.fireProjectionRows` `deepStrictEqual` `__test_runPlanMode({ planMode: 'apply',
    plan: <found plan> }).rows`; the dashboard's Monte Carlo rate equals the card's "with" rate;
  - Undo (the toast's button): `state.storedPlan` is null and the rows are the automatic plan's again; Apply again;
  - reload: the stored plan survives (autosave) and is used;
  - edit `ageA`'s life expectancy by one year so the plan is stale but still wins (find a value in the script with a literal list
    of tries): the "still beats" copy;
  - edit spending up so it loses (`__test_flushRender()`): the "no longer beats" copy with its reason, and `fireProjectionRows`
    equal `__test_runPlanMode({ planMode: 'apply', plan: <the automatic plan from __test_cliffPlanState / __test_planForState> })`;
    count plan switches over the typing (the rows equal either plan's after each `input`, and change plan at most once after the
    flush); edit back: used again;
  - guard off: the "cliff plan is off" copy; guard on: used;
  - Clear: status gone, `state.storedPlan` null;
  - the depleting household: no Apply button and the "already the best" copy;
  - a household with a legacy schedule (`__test_applyMultiLeverSchedule`): the "replaces" copy; Apply clears both schedules,
    the status reads "Applied plan in use." (not stale: the fingerprint is taken after the clear), and
    `__test_cliffPlanState().searched` with `report.brackets.length > 1` on the next refresh (the bracket search is back on);
  - Search again right after Apply: "Your applied plan is already the best this search found." and no Apply button;
  - the comparison open with a saved scenario that carries a stored plan: typing in spending gives
    `__test_planForStateComputes()` delta 0, and the scenario's comparison row equals the dashboard after loading it;
  - 390x844: `scrollWidth > clientWidth` is false with the card open and a result shown.
- [ ] **Step 2: Run** `npm run build && node test_plan_optimizer.js` — FAIL.
- [ ] **Step 3: Implement** the card, hooks and wiring. Move the checks of `test_apply_optimizer_schedule.js` and
  `test_optimizer_ui.js` that drove the multi-lever card's DOM onto the hooks (`__test_optimizeMultiLever`,
  `__test_applyMultiLeverSchedule`, `__test_clearAppliedMultiLeverSchedule`) or the new card, keeping coverage of the legacy
  apply-and-clear and its status line; the flat-bracket and per-year cards unchanged.
- [ ] **Step 4: Run** `npm test` (`snapshot_ui`: list each moved surface and confirm only the card's markup moved), `node
  tests/ui_scripts.js test_plan_optimizer.js test_apply_optimizer_schedule.js test_optimizer_ui.js test_bracket_search.js
  test_live_withdrawal_mix.js`, then `npm run test:ui`.
- [ ] **Step 5:** README feature line (the plan optimizer; the multi-lever card's removal); badge V140; `npm run analyze`;
  `npm run snapshot:update` only for the listed `snapshot_ui` movers; commit ("Batch 5 4a: the plan card replaces the
  multi-lever card; Optimize -> Apply stores the plan (US V140)").

### Task 9: Measurements, docs and notes

**Files:**
- Modify: `tests/solver_gap.js` (`--shipped auto|optimized`, default `auto`), `docs/architecture/cliff-plan.md`,
  `docs/architecture/inputs-and-ui.md`, `docs/architecture/test-inventory.md`, `docs/next-batches-plan.md`

- [ ] **Step 1:** `--shipped optimized` in `tests/solver_gap.js`: the shipped column reads `__test_optimizePlan(objective)`'s plan
  run through `__test_runPlanMode({ planMode: 'apply', plan })`; `auto` unchanged (run `node tests/solver_gap.js --lengths
  default` before and after the edit: identical output).
- [ ] **Step 2: Run** `node tests/solver_gap.js --objective endValue --shipped optimized` (both lengths, in the background) and
  record table 2's after-tax end value, shipped (optimized) / reference, beside 3a's (TX 9.7% / 4.7%, CA 1.5% / 4.5%, NY 0 /
  1.3%).
- [ ] **Step 3: The lambda table (spec section 9):** on the three gap households at both lengths and the 48-household sample,
  per phase: the multiplier kept, the gain over `[1, 1, 1]`, the share of the phase's plan years with `movedSample`
  (`__test_planTrace()`). A committed `tests/plan_mult_table.js` (not in `npm test`; listed in `test-inventory.md`).
- [ ] **Step 4: Timing:** `node tests/bench_runs_interleaved.js` (+5%), `node tests/bench_solver.js --rounds 7` (+30%), planning
  time with a stored plan on the gap households (median of 9 full refreshes, 150 ms), `optimizePlan` wall time per gap household
  (target 10 s), and the card's whole Search on those households (the search plus the four rates: two historical sweeps and two
  Monte Carlo summaries at `mcPathCount`, default 1,000 paths; report it to the owner if the total passes 15 s); `node tests/analysis_parity.js --base <a12c64c build>`: only the removed `card` keys differ (recorded).
- [ ] **Step 5: Docs:** `cliff-plan.md` (the plan shape, `mult`, `objective` / `rankEvenly` / `tieBracket` / `offMemo`, the
  guarded comparison and `report.stored`, `optimizePlan`, the new hooks), `inputs-and-ui.md` (`storedPlan`, its guard, the
  card), `test-inventory.md` (the new tests and scripts), the Batch 5 notes subsection (decisions, the spec amendments, figures,
  the movers lists from Tasks 4 and 8, the lambda table, timings, follow-ups); the "Batch 5: optimizer" status line: 4a done,
  4b next.
- [ ] **Step 6:** `npm test` green; commit ("Batch 5 4a: measurements and notes").

---

## Self-review

- Spec coverage: 4.1 Tasks 1-2; 4.2 Task 4; 4.3 Task 5 (light and deferred both go through `computeCliffPlan`); 4.4 Task 8 (the
  fingerprint and the tax year in the store layer); 4.5 Tasks 2, 3, 7 and Task 8 (the button's frame yield, the legacy note);
  4.6 Tasks 6, 8; 4.7 Tasks 1-9; decision 5 / section 9 Task 9; decisions 6-7 Tasks 3-5, 7-8. Not in 4a: sections 5-8 and
  decision 9 (4b-4d).
- Type consistency: `PLAN_KEYS`, `makePlan`, `BRACKET_CANDIDATES`, `MULT_GRID`, `phaseOf`, `bracketEvenBest`,
  `storedPlanVerdict`, `STORED_PLAN_KEYS`, `isValidStoredPlan`, `optimizePlan`, `runHistoricalCyclesWith`,
  `monteCarloSummaryWith`, `storedPlanFingerprint` are each defined once (Interfaces) and used under the same names later.
- Order: no task consumes a later task's product (Task 7's right-after-Apply case needs Task 5; Task 8 needs 4-7).
