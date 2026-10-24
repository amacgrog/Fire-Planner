# Step 3a: flat-bracket candidates in the cliff plan (Batch 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In plans that already convert, the cliff plan also tries the other five flat brackets as whole-run candidates and keeps
one only when it is better by more than 0.1% of the after-tax end value without depleting or touching the house earlier; the
search runs in the deferred render pass.

**Architecture:** `computeCliffPlan` runs today's selection once per bracket and ranks the six results with
`bracketCandidateBetter`; the plan carries `bracket` / `bracketFrom`, which `solveRothConversion` honours; the year loop records
the first home-equity draw age; `refreshCliffPlan` gains a light mode so the search waits for the deferred pass.

**Tech Stack:** plain ES modules, esbuild build, Vitest (`tests/unit/helpers/world.js`), Playwright node scripts.

**Spec:** `docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md`, **Part A** (sections A1-A9) and section 2's
decisions. Part B (3b) is out of scope: this plan ends with the 3a numbers for the owner. (The 3b plan, last at commit
`6bf6a59`, will be revised with Part B's R1-R12 if the owner asks for 3b.)

## Global Constraints

- Base `b544934` (US V137). Badge **V138** (Task 7, with the switch-on). Canada: behaviour untouched; the shared `NO_TEST` literal gains a field.
- `BRACKET_CANDIDATES = [10, 12, 22, 24, 32, 35]`, registered as `"constant"` in `tests/engine-purity.json`.
- Replacement rule, exactly (spec A3, owner decision 14): `c` depletes no earlier
  and first draws on the house no earlier (`null` latest for both); then later depletion wins, else later first draw wins, else
  `c.value > best.value + Math.max(1, 0.001 * Math.abs(best.value))`. Fixed order: the user's bracket, then the others ascending;
  replace only on a strict win.
- **The search ships off.** `testHooks.testBracketSearchOff` defaults to `true` from Task 2 until Task 7, whose single commit
  switches it on together with the snapshot update, badge V138 and the README; every test of the search turns it on with
  `__test_setBracketSearch(true)` (Vitest: the world's test-hooks module). `npm test` passes at every commit.
- Off (today's plan, byte for byte): conversions off, guard off, no window age, `stateTax` `ri` or `pa`, an
  `appliedRothSchedule` that is not null and has keys, `ctx.test.bracketSearchOff`.
- Engine rules (CLAUDE.md): `ctx` first, no store imports in engine code, contexts only from `newRunContext`, new scalars mutated in
  the year body go in `scalarSnapshot`, Vitest exact comparisons only, `world()` per `it`, counted suites with `makeCounter`.
- After every commit that changes exports: `npm run analyze`, `node tests/module_map.js`; new tests listed in
  `docs/architecture/test-inventory.md` in the same commit.
- One copy of the household grid: `tests/unit/helpers/scan-grid.mjs` (ESM; `.mjs` because the root `package.json` has no
  `"type"`); the CommonJS scripts (`tests/solver_gap.js`, `tests/solver_scan.js`, `tests/cliff_plan.js` F2) load it with
  `await import()` inside their async IIFEs.
- A bug found in existing code is recorded and brought to the owner, not fixed here. Never `git stash`; never push.

## Review Focus

1. **The flat-bracket card's own-bracket row** must show the user's bracket, not the plan's: test in Task 5 (`card row`).
2. **A variant that changes the bracket** (any trial) must not get the plan's bracket: test in Task 2 (`bracketFrom mismatch`).
3. **Typing fast then releasing**: the rows reflect the kept plan after `change`, and keystrokes run no search: test in Task 4.
4. **A candidate that draws on the house** while the user's bracket does not: never kept: test in Task 3 (`home draw blocks`).
5. **A marry-later plan**: the plan's bracket applies across the filing change like the user's own setting: test in Task 2
   (`filing change`).

---

### Task 1: One household grid for tests and scripts

**Files:**
- Create: `tests/unit/helpers/scan-grid.mjs` (ESM: `GAP_CASES`, `scanHouseholds({ conversions })`, and the legacy-balance conversion
  the scripts use today, moved or imported from `tests/legacy_balances.js`)
- Modify: `tests/solver_gap.js`, `tests/solver_scan.js`, `tests/cliff_plan.js` (its F2 grid) (load it with `await import()`; drop
  their own copies)

**Interfaces:**
- Produces: `GAP_CASES: [{ name, patch(lifeA, lifeB) }]` (conversions on from `ageA` to 74 at 22%, as today's script);
  `scanHouseholds({ conversions, mode }) -> [{ name, patch }]` (the grid of `tests/solver_scan.js`'s header, filtered by the
  conversions axis, `mode` `'default'` | `'smooth'` setting the withdrawal patch).

- [ ] **Step 1:** capture `node tests/solver_gap.js --objective endValue --lengths 75 > before.md` and `node tests/solver_scan.js
  --limit 24 --md before-scan.md` on the current tree (scratchpad).
- [ ] **Step 2:** move the grids into the helper and import them in both scripts.
- [ ] **Step 3:** re-run both commands and `node tests/cliff_plan.js`; `diff` against the captures: identical (seconds columns aside).
- [ ] **Step 4:** commit `git commit -m "Tests: one ESM copy of the gap cases and scan grid"`.

### Task 2: The plan's bracket and the first home draw in the engine

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js` (`solveRothConversion`'s resolution order, spec A4),
  `src/us/core/withdrawals/draws.js` (`newWithdrawal` gains `homeDrawn: 0`), `src/us/core/withdrawals/strategies.js` (add each
  `takeHomeEquity` return to `wd.homeDrawn`), `src/us/core/projection/run-projection.js` (the
  `homeDrawAge` scalar in `scalarSnapshot`; non-enumerable `sim.homeDrawAge`), `src/shared/core/projection/run-context.js`
  (`NO_TEST.bracketSearchOff: false`), `src/us/core/cliff-plan/planning.js` (`storeRunContext`'s `test` literal),
  `src/us/core/test-hooks.js` (`testBracketSearchOff: true`: off until Task 7), `tests/unit/shared/run-context.test.js` (the exact
  `test` keys it asserts), `docs/architecture/engine.md` (`homeDrawAge`)
- Test: `tests/unit/us/bracket-search.test.js` (new; counted)

**Interfaces:**
- Produces: plans may carry `bracket` and `bracketFrom` (numbers); `sim.homeDrawAge` (number or `null`, non-enumerable);
  `ctx.test.bracketSearchOff` (boolean); `wd.homeDrawn` (number, the net cash taken from home equity this year).

- [ ] **Step 1: Write the failing tests** (through `usPlan(w).runPlanMode`; households written out in the file): `plan bracket
  honoured` (the CA gap case at life 100, conversions on: `apply` rows with `{ intents: {}, family: 'none', bracket: 24,
  bracketFrom: 22 }` `toStrictEqual` `apply` rows of the same state with `rothConvBracket: 24` and `{ intents: {}, family: 'none' }`);
  `bracketFrom mismatch` (`bracketFrom: 12` with the state at 22: rows equal the plain 22 run); `override map wins` (a
  `rothBracketByAge` map pinning 62 to 12: 62 converts the 12% amount); `applied schedule wins` (`appliedRothSchedule { 62: 12 }`);
  `apply reproduces choose` (`choose` and `apply` with the same bracket-24 plan and `choose`'s intents: rows `toStrictEqual`);
  `filing change` (a `marryLater` couple marrying at 60, conversions 58-64: rows with plan bracket 24 equal the plain 24 run);
  `homeDrawAge` (an owner, `tenure: 'own'`, with no liquid or retirement money and spending above income: `homeDrawAge` is year 0's
  age and `depletedAge` later; a renter: `null`; an owner whose need leaves a float leftover under $1: `null`); `no snapshot field` (`Object.keys(sim)` does not include `homeDrawAge`).
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/bracket-search.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and `npx vitest run --sequence.shuffle tests/unit/us/bracket-search.test.js` (PASS); `npm run test:unit`;
  `npm run build && node tests/snapshot.js` (identical); `node tests/engine_purity.js`; `node tests/plan_off_anchor.js --base <b544934
  build>` (identical); `node tests/bench_runs_interleaved.js --base <b544934 tree>` (+5% gate; over it, stop and report).
- [ ] **Step 5: Commit** `git commit -m "US: the plan's conversion bracket; the first home-equity draw age"`.

### Task 3: The bracket search in `computeCliffPlan`

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`; `BRACKET_CANDIDATES`), `src/us/core/cliff-plan/solver.js`
  (`bracketCandidateBetter`, beside `planCandidateBetter`), `tests/engine-purity.json`, `tests/cliff_plan.js` (plan shape only)
- Test: `tests/unit/us/bracket-search.test.js`

**Interfaces:**
- Consumes: Task 2.
- Produces: `export function bracketCandidateBetter(c, best)` (`c`, `best`: `{ depletedAge, homeDrawAge, value }`);
  `computeCliffPlan(ctx, { search = true } = {})` → `{ plan: { intents, family, bracket, bracketFrom }, report: { candidates: [...today's family candidates of the kept bracket], kept: <family>, brackets: [{ bracket, family, intents, depletedAge,
  homeDrawAge, value, cost }], keptBracket, searched } }`; with `search: false` (the light
  refresh, Task 4) today's plan with `bracket === bracketFrom` and `searched: false`.

- [ ] **Step 1: Write the failing tests**: `bracketCandidateBetter` (literal objects: later depletion wins whatever the value; equal
  depletion, later home draw wins; an earlier home draw never wins even with later depletion; all equal: value 1,000,000 vs 1,001,000 not a win (exactly 0.1%), 1,001,000.01 a win; value 100
  vs 100.5 not a win, 101.01 a win (the $1 floor); `null` depletion beats 90); `home draw blocks` (a candidate depleting at the same
  age with a higher value but `homeDrawAge` 80 vs the best's `null`: not a win); `search order and report` (the CA gap case at life
  100: six candidates, the user's first then 10, 12, 24, 32, 35; `keptBracket` names the winner and `kept` / `candidates` keep today's meaning; the kept value at least every candidate's whose
  depletion and first home draw equal the kept plan's, less the threshold, a comparison of runs in one world); `CA at 100 keeps a higher bracket` (the kept bracket is not 22 and its value
  is more than 22's by more than the threshold, two runs in one world); `skipped` (RI, PA, an applied schedule, conversions off, guard
  off, `bracketSearchOff`, `search: false`: one candidate, `bracket === bracketFrom`); `never earlier`
  (`scanHouseholds({ conversions: true })`' first 24: the kept plan's run never depletes or first draws on the house earlier than the
  user's-bracket run).
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement**; update `tests/cliff_plan.js`'s plan-shape expectations (the two plan fields; the report's new fields) and any compute-count or
  `planStats` delta assertions the extra runs move (name each in the commit message).
- [ ] **Step 4: Run** the suite and shuffled (PASS); `npm run test:unit`; `npm run build && node tests/cliff_plan.js && node
  tests/solver_hooks.js && node tests/end_value_us.js && node tests/engine_purity.js`; `npm run analyze`.
- [ ] **Step 5: Commit** `git commit -m "US: the flat-bracket search in the cliff plan"`.

### Task 4: The search in the deferred pass

**Files:**
- Modify: `src/us/core/cliff-plan/planning.js` (`refreshCliffPlan({ light })`; `planForState` serves the stored plan only when
  `searched`, `ensureTestPlan` re-plans on `!searched`, spec A7),
  `src/us/core/cliff-plan-store.js` (`searched`, `searchPending`), `src/shared/ui/results/render-scheduler.js` (`scheduleRender`
  sets the timer when a search is pending, read through a core seam `#country/core/seam-searchPending` with a Canada facade that
  returns false), `src/us/ui/results/render.js` (`renderBody(selected, { light })` factored out of `render`; `render` calls the light
  refresh when `light`; `renderDeferred` runs the full refresh and, when the kept plan's JSON changed, calls `renderBody` before the
  deferred panels), `src/us/ui/install-test-hooks.js` (`__test_setBracketSearch(on)`: sets `testHooks.testBracketSearchOff = !on`,
  clears `cliffPlanStore.key` and `cliffPlanCache`; `__test_setCliffPlan` marks its plan `searched`), CLAUDE.md (the render
  invariant: rows can change in the deferred pass; flush before reading rows after `input`), `docs/architecture/inputs-and-ui.md`
- Test: root `test_bracket_search.js` (new Playwright script)

**Interfaces:**
- Consumes: Task 3's `computeCliffPlan(ctx, { search })`.
- Produces: `refreshCliffPlan({ light = false } = {})`; `cliffPlanStore.searchPending` (boolean).

- [ ] **Step 1: Write the failing UI test** `test_bracket_search.js` (the CA gap couple at life 100 with conversions on, loaded
  through `__test_replaceState`, then a full render): type three characters into the spending field (`input` events): the summary
  still names the user's bracket; dispatch `change`: the summary names the kept bracket and `window.fireProjectionRows` differs from
  the rows before `change`; a second run without `change` reaches the same state after the 250 ms idle pause (a locator wait on the
  summary text, no fixed sleep). Exit 1 on any failure.
- [ ] **Step 2: Run** `npm run build && node test_bracket_search.js`. Expected: FAIL.
- [ ] **Step 3: Implement**; `npm run analyze` (the new seam).
- [ ] **Step 4: Run** `node test_bracket_search.js` (PASS, with the search turned on by the hook); `npm test`; `npm run test:ui`;
  the planning time: a scratch Playwright timing (median of 9)
  of the full refresh on the slowest gap household with conversions on, against the 150 ms gate (over it, stop and report).
- [ ] **Step 5: Commit** `git commit -m "US: the bracket search runs in the deferred pass"`.

### Task 5: Summary, card, tip, badge and docs

**Files:**
- Modify: `src/us/core/cliff-plan/planning.js` (`cliffPlanSummary`: the conversion clause, spec A5.7 wording, added after the early
  "no steering" return is restructured, and left out while a search is pending), `src/shared/ui/results/decision-questions.js` (the
  conversion label names the plan's bracket when it differs), `src/us/ui/results/
  roth-optimizer.js` (`computeRothOptimizer`: when the plan's bracket differs from the user's, each trial pins every window age inside the plan to its
  bracket through the override map, spec A4), `src/us/index.html` (the `rothConvBracket` tip; `<small>` under 70 characters),
  `docs/architecture/cliff-plan.md`, `docs/architecture/test-inventory.md` (badge and README move to Task 7)
- Test: `test_bracket_search.js` (extend)

- [ ] **Step 1: Extend the UI test**: `card row` (open the flat-bracket card: the row for the user's 22% shows the 22% run's
  after-tax end value, equal to a `__test_simulate` of the state with the search off); `summary` (the two clauses of A5.7, literal
  strings); conversions toggled off: the clause disappears and `fireProjectionRows` changes; at 390x844
  `document.documentElement.scrollWidth > document.documentElement.clientWidth` is false.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then `node tests/snapshot_ui.js` and `node tests/doc_paths.js`.
- [ ] **Step 4: Run** `node test_bracket_search.js` (PASS).
- [ ] **Step 5: Commit** `git commit -m "US: bracket-search summary, card pinning, tip and docs (search still off)"`.

### Task 6: Guard script, scan and gap columns, bench scenario

**Files:**
- Create: `tests/bracket_search.js` (in `package.json`'s `test` chain after `tests/cliff_plan.js`), `tests/hist_depletion_cause.js`
- Modify: `tests/solver_scan.js` (bracket search on vs off via `__test_setBracketSearch`, `__test_refreshCliffPlan` after each
  toggle; a first-home-draw column; an earlier first draw counted like an earlier depletion), `tests/solver_gap.js` (the kept-plan
  column and the A5.4 check at both lengths), `tests/bench_solver.js` (the converting scenario), `docs/architecture/test-inventory.md`

- [ ] **Step 1:** `tests/bracket_search.js` per spec A5.3; run it: exit 0 (a failure is the standard-depletion stop: report to the
  owner); record the seconds (over 60 s: stop and report).
- [ ] **Step 2:** `tests/hist_depletion_cause.js A.json B.json` per spec A5.1 (prints each earlier `hist` mover's cause; exit 1 on a
  bridge drain).
- [ ] **Step 3:** the scan, gap and bench changes; run `node tests/solver_gap.js --objective endValue` (both lengths) to check the
  script; numbers go in Task 7.
- [ ] **Step 4:** commit `git commit -m "Tests: bracket-search guard in npm test; scan, gap, bench and cause scripts"`.

### Task 7: Snapshots, measurements, notes, and the stop before 3b

**Files:**
- Modify: `tests/snapshots/us.json` (after the review below), `docs/next-batches-plan.md` (a "#### Batch 5 step 3a" section under
  "### Batch 5 notes")

- [ ] **Step 1:** with the search switched on locally, `node tests/snapshot.js`; list every mover (scenario, kept bracket, depletion and first home draw before -> after,
  end value change). A shift-0 standard scenario earlier: stop and report; shifted ones are
  classified like the historical movers in Step 2 (decision 15).
- [ ] **Step 2:** dump `b544934`'s and this branch's snapshot results; `node tests/hist_depletion_cause.js`; a bridge drain: stop and
  report; record each market-variance mover; list the five named scenarios.
- [ ] **Step 3:** in one commit: `testHooks.testBracketSearchOff` defaults to `false` (the search on), `npm run snapshot:update`,
  badge **V138** in `src/us/index.html`, `README.md`'s feature list; `npm test` and `npm run test:ui` (PASS); commit `git commit -m
  "US V138: the cliff plan tries the other flat brackets"`.
- [ ] **Step 4:** measurements: `node tests/solver_gap.js --objective endValue` (both lengths: the kept plan against the reference and
  the flat brackets; how much of step 0's gap 3a closed), `node tests/solver_scan.js`, the timing gates (`bench_runs_interleaved`,
  `bench_solver` with the converting scenario), the planning time, `node tests/historical_rates.js` (reported).
- [ ] **Step 5:** write the notes (decisions 7-11, the measurements, the movers and causes) and commit `git commit -m "Batch 5 step
  3a: snapshots and notes"`. Then stop: bring the owner the 3a numbers (the gap left in each case after 3a, the scan's counts, the
  timings) and ask whether 3b is worth building.
