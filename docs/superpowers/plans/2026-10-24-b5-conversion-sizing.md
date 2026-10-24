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
decisions 1-15. Part B (3b) is out of scope: this plan ends with the 3a numbers for the owner. (The 3b plan, last at commit
`6bf6a59`, will be revised with Part B's R1-R13 if the owner asks for 3b.)

## Global Constraints

- Base `b544934` (US V137). Badge **V138** in Task 7's switch-on commit. Canada: behaviour untouched; the shared `NO_TEST` literal
  gains a field and Canada gains a one-line seam facade.
- `BRACKET_CANDIDATES = [10, 12, 22, 24, 32, 35]`, registered as `"constant"` in `tests/engine-purity.json`.
- Replacement rule, exactly (spec A3, decision 14): `c` depletes no earlier and first draws on the house no earlier (`null` latest for
  both); then later depletion wins, else later first draw wins, else `c.value > best.value + Math.max(1, 0.001 * Math.abs(best.value))`.
  Fixed order: the user's bracket, then the others ascending; replace only on a strict win.
- **The search ships off.** `testHooks.testBracketSearchOff` defaults to `true` from Task 2 until Task 7, whose single commit switches
  it on together with the snapshot update, badge V138 and the README. Turning it on in a test: a browser test calls
  `window.__test_setBracketSearch(true)` (Task 4); a Vitest test sets
  `(await w.load('us/core/test-hooks.js')).testHooks.testBracketSearchOff = false` before `await w.ctx()` / the planning call
  (`storeRunContext` copies `testHooks` into `ctx.test`, `planning.js:32`). `npm test` passes at every commit.
- Off (today's plan, byte for byte): conversions off, guard off, no window age, `stateTax` `ri` or `pa`, an `appliedRothSchedule`
  that is not null and has keys, `ctx.test.bracketSearchOff`.
- Engine rules (CLAUDE.md): `ctx` first, no store imports in engine code, contexts only from `newRunContext`, new scalars mutated in
  the year body go in `scalarSnapshot`, Vitest exact comparisons only, `world()` per `it`, counted suites with `makeCounter`.
- Every task's last step runs `npm test` (it builds) before committing. After every commit that changes exports: `npm run analyze`.
  New tests are listed in `docs/architecture/test-inventory.md` in the commit that adds them.
- `tests/state_modules.js` (lines ~53-67) pins `cliffPlanStore`'s and `testHooks`' keys and defaults: update it in each task that
  changes them (Tasks 2, 4, 7).
- One copy of the household grid: `tests/unit/helpers/scan-grid.mjs` (ESM; `.mjs` because the root `package.json` has no `"type"`);
  the CommonJS scripts load it with `await import()` inside their async IIFEs.
- A base tree for `--base` gates: `git worktree add <scratchpad>/base b544934`, then `npm install` and `npm run build` there.
- A bug found in existing code is recorded and brought to the owner, not fixed here. Never `git stash`; never push.

## Review Focus

1. **The flat-bracket card's own-bracket row** shows the user's bracket's conversions: test in Task 5 (`card row`).
2. **A variant that changes the bracket** never gets the plan's bracket: test in Task 2 (`bracketFrom mismatch`).
3. **Typing fast then releasing**: keystrokes show the user's-bracket plan and run no search; the rows reflect the kept plan after
   `change` or the idle pause: test in Task 4.
4. **A candidate that draws on the house** while the user's bracket does not: never kept: test in Task 3 (`home draw blocks`).
5. **A marry-later plan**: the plan's bracket applies across the filing change like the user's own setting: test in Task 2.

---

### Task 1: One household grid for tests and scripts

**Files:**
- Create: `tests/unit/helpers/scan-grid.mjs` (ESM: `GAP_CASES`, `scanHouseholds`, and the legacy-balance conversion the scripts use
  today, moved from or re-exporting `tests/legacy_balances.js`)
- Modify: `tests/solver_gap.js`, `tests/solver_scan.js`, `tests/cliff_plan.js` (its F2 grid), each loading the helper with
  `await import()` and dropping its own copy

**Interfaces:**
- Produces: `GAP_CASES: [{ name, patch(lifeA, lifeB) }]` (conversions on from `ageA` to 74 at 22%, as today's script);
  `scanHouseholds({ conversions, mode } = {}) -> [{ name, patch }]`: with no argument the full grid in today's interleaved order (so
  `--from` / `--limit` keep their meaning); `conversions` (true / false) filters that axis; `mode` (`'default'` | `'smooth'`) sets the
  withdrawal patch as `tests/solver_scan.js` does.

- [ ] **Step 1:** capture on the current tree, in the scratchpad: `node tests/solver_gap.js --objective endValue --lengths 75 >
  before.md`, `node tests/solver_scan.js --limit 24 --md before-scan.md`, `node tests/cliff_plan.js > before-cp.txt`.
- [ ] **Step 2:** move the grids into the helper and import them in the three scripts.
- [ ] **Step 3:** re-run the three commands; `diff` against the captures: identical (seconds columns aside); `npm test`.
- [ ] **Step 4:** add the helper to `docs/architecture/test-inventory.md`; commit `git commit -m "Tests: one ESM copy of the gap cases and scan grid"`.

### Task 2: The plan's bracket and the first home draw in the engine

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js` (`solveRothConversion`'s resolution order, spec A4),
  `src/us/core/withdrawals/draws.js` (`newWithdrawal` gains `homeDrawn: 0`), `src/us/core/withdrawals/strategies.js` (add each
  `takeHomeEquity` return to `wd.homeDrawn`; the two call sites, ~126 and ~198), `src/us/core/projection/run-projection.js` (the
  `homeDrawAge` scalar in `scalarSnapshot`, set when the kept pass's `wd.homeDrawn > 1`; non-enumerable `sim.homeDrawAge`),
  `src/shared/core/projection/run-context.js` (`NO_TEST` gains `bracketSearchOff: false` after `seNoSettle`),
  `src/us/core/cliff-plan/planning.js` (`storeRunContext`'s `test` literal gains `bracketSearchOff: testHooks.testBracketSearchOff`
  after `seNoSettle`), `src/us/core/test-hooks.js` (`testBracketSearchOff: true`: off until Task 7), `tests/unit/shared/run-context.test.js`
  (the exact `test` keys at ~44 and ~193), `tests/state_modules.js` (the `testHooks` keys), `docs/architecture/engine.md` (`homeDrawAge`)
- Test: `tests/unit/us/bracket-search.test.js` (new; counted)

**Interfaces:**
- Produces: plans may carry `bracket` and `bracketFrom` (numbers); `sim.homeDrawAge` (number or `null`, non-enumerable);
  `ctx.test.bracketSearchOff` (boolean); `wd.homeDrawn` (number).

- [ ] **Step 1: Write the failing tests** (through `usPlan(w).runPlanMode`; every household written out in the file; the CA gap case
  from `GAP_CASES` at life 100): `plan bracket honoured` (`apply` rows with `{ intents: {}, family: 'none', bracket: 24, bracketFrom: 22 }`
  `toStrictEqual` `apply` rows of the same state with `rothConvBracket: 24` and `{ intents: {}, family: 'none' }`); `bracketFrom mismatch`
  (`bracketFrom: 12` with the state at 22: rows equal the plain 22 run); `override map wins` (a `rothBracketByAge` map pinning 62 to 12,
  through the store's optimizer override assign function: the 62 row's `conversionAmount` equals the plain run at 12%'s); `applied
  schedule wins` (`appliedRothSchedule { 62: 12 }`: likewise); `apply reproduces choose` (`choose` and `apply` with the same bracket-24
  plan and `choose`'s intents: rows `toStrictEqual`); `filing change` (`marryLater` couple, both 58, marrying at 60, conversions 58-64,
  traditional 1,500,000 split 900k / 600k: rows with plan bracket 24 equal the plain 24 run); `homeDrawAge` (an owner: every account,
  taxable and cash 0, the default home 450,000 against a 300,000 mortgage, `tenure: 'own'`, spending above income: `homeDrawAge` is
  `ageA` and `depletedAge` is later; a renter with the same money: `null`; a well-funded owner whose liquid money covers spending:
  `null`); `no snapshot field` (`Object.keys(sim)` does not include `homeDrawAge`).
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/bracket-search.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and `npx vitest run --sequence.shuffle tests/unit/us/bracket-search.test.js` (PASS); `npm test` (snapshots
  identical); `node tests/engine_purity.js`; `node tests/plan_off_anchor.js --base <base>/dist`; `node tests/bench_runs_interleaved.js
  --base <base>` (+5% gate: over it, stop and report the table to the owner).
- [ ] **Step 5:** add the suite to `test-inventory.md`; commit `git commit -m "US: the plan's conversion bracket; the first home-equity draw age"`.

### Task 3: The bracket search in `computeCliffPlan`

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`; `BRACKET_CANDIDATES`), `src/us/core/cliff-plan/solver.js`
  (`bracketCandidateBetter`, beside `planCandidateBetter`), `tests/engine-purity.json`, `tests/cliff_plan.js` (the plan's two new
  fields and the report's new fields)
- Test: `tests/unit/us/bracket-search.test.js`

**Interfaces:**
- Consumes: Task 2.
- Produces: `export function bracketCandidateBetter(c, best)` (`c`, `best`: `{ depletedAge, homeDrawAge, value }`);
  `computeCliffPlan(ctx, { search = true } = {})` → `{ plan: { intents, family, bracket, bracketFrom }, report: { candidates, kept,
  brackets, keptBracket, searched } }`: `candidates` and `kept` keep today's meaning for the kept bracket; `brackets: [{ bracket,
  family, intents, depletedAge, homeDrawAge, value, cost }]`; `searched` true after a call with `search: true`, and also after
  `search: false` when the search does not apply (A2), so that plan is final. With the guard off it still returns `{ plan: null,
  report: null }`.

- [ ] **Step 1: Write the failing tests** (search turned on as in Global Constraints): `bracketCandidateBetter` (literal objects: later
  depletion wins whatever the value; equal depletion, later home draw wins; an earlier home draw never wins even with later depletion;
  all equal: 1,000,000 vs 1,001,000 not a win (exactly 0.1%), 1,001,000.01 a win; 100 vs 100.5 not a win, 101.01 a win (the $1
  floor); `null` depletion beats 90); `home draw blocks` (same depletion, higher value, `homeDrawAge` 80 vs the best's `null`: not a
  win); `search order and report` (the CA gap case at life 100: `brackets` lists 22, 10, 12, 24, 32, 35 in that order; `keptBracket`
  names the winner; `candidates` / `kept` are the kept bracket's; every `brackets` entry whose depletion and first home draw equal the
  kept one's has a value at most the kept value plus the threshold: computed from the report, no engine literal); `CA at 100 keeps a
  higher bracket` (`keptBracket` is not 22, and its value exceeds 22's by more than the threshold); `skipped` (RI, PA, an applied
  schedule, conversions off, `bracketSearchOff`: `brackets` has one entry and `bracket === bracketFrom`; guard off: `{ plan: null,
  report: null }`; `search: false` on the CA case: one entry, `searched` false); `never earlier`
  (`scanHouseholds({ conversions: true, mode: 'default' })`' first 24: the kept plan's run never depletes or first draws on the house
  earlier than the user's-bracket run, read from `brackets`).
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement**; update `tests/cliff_plan.js` for the new plan and report fields.
- [ ] **Step 4: Run** the suite and shuffled (PASS); `npm test`; `npm run analyze`.
- [ ] **Step 5: The switch-on dry run** (nothing committed from it): set `testBracketSearchOff: false` locally, `npm run build`, run
  `npm test` and `npm run test:ui`, list every failure, restore the default. A failure in a test that pins the user's-bracket plan on
  a converting, guard-on household (expected: `tests/cliff_plan.js` T5.2 and F2 `reportDiffer`; possibly `tests/cliff_guard.js`,
  `tests/bench_plan.js`, `tests/analysis_parity.js`, the optimizer Vitest suites; any `planStats` / compute-count delta) is fixed by
  turning the search off in that test (browser: `__test_setBracketSearch(false)` once Task 4 adds it, so record these for Task 4 if
  the hook is needed; Vitest: `testBracketSearchOff = true`). Snapshot movers are Task 7's. Any other failure: stop and report to the
  owner.
- [ ] **Step 6:** commit `git commit -m "US: the flat-bracket search in the cliff plan (off by default)"`, naming each test changed in
  Step 5.

### Task 4: The search in the deferred pass

**Files:**
- Modify: `src/us/core/cliff-plan/planning.js` (`refreshCliffPlan({ light })`; `planForState`: its identity branch, `inputs ===
  cliffPlanStore.forState` with the same year, serves the stored plan whether or not it is searched (the light render's own
  `simulate()` reaches it, and decision 8 shows the user's-bracket plan while typing); its JSON-match branch and `cliffPlanCache`
  serve only searched plans; `ensureTestPlan` re-plans on a changed key or year or `!searched`; `export function searchPending()`
  returning `cliffPlanStore.searchPending`), `src/us/core/cliff-plan-store.js` (`searched`, `searchPending`), `src/us/core/seam-searchPending.js`
  and `src/canada/core/seam-searchPending.js` (one-line facades; Canada's re-exports a `searchPending` returning `false` added to
  `src/canada/core/projection/store-context.js`), `src/shared/ui/results/render-scheduler.js` (`scheduleRender` sets the timer when
  `searchPending()` is true even with no stale panel), `src/us/ui/results/render.js` (`renderBody(selected, { light })` factored out of
  `render` from the first `simulate()` to the end; `render` calls `refreshCliffPlan({ light })`; `renderDeferred` runs the full refresh
  and, when the kept plan's JSON differs from the one drawn, calls `renderBody(selected, { light: true })` (the light
  panels, no stale marking), then draws the deferred panels as today), `src/us/ui/install-test-hooks.js` (`__test_setBracketSearch(on)`: sets
  `testHooks.testBracketSearchOff = !on`, clears `cliffPlanStore.key`, `cliffPlanStore.forState` and `cliffPlanCache`;
  `__test_setCliffPlan` marks its plan `searched`; `__test_cliffPlanState()` → `{ bracket, bracketFrom, searched, searchPending }`,
  read without refreshing), `tests/state_modules.js` (`cliffPlanStore` keys), the tests recorded in Task 3 Step 5 that need the
  browser hook, `docs/architecture/module-system.md` (the seam count and list), CLAUDE.md (the render invariant: rows can change in the
  deferred pass; a test that dispatches `input` and reads rows calls `__test_flushRender()` first), `docs/architecture/inputs-and-ui.md`
- Test: root `test_bracket_search.js` (new Playwright script)

**Interfaces:**
- Consumes: Task 3's `computeCliffPlan(ctx, { search })`.
- Produces: `refreshCliffPlan({ light = false } = {})`; `searchPending()`; `cliffPlanStore.searched`, `.searchPending`;
  `window.__test_setBracketSearch(on)`, `window.__test_cliffPlanState()`.

- [ ] **Step 1: Write the failing UI test** `test_bracket_search.js`: load the page, `__test_setBracketSearch(true)`, then
  `__test_replaceState(<the CA gap couple at life 100, conversions on>)`, `__test_syncControls()` and a full render by clicking the
  theme toggle (as `tests/cliff_plan.js` does near line 614). Record `fireProjectionRows` and the user's-bracket plan
  (`__test_cliffPlanState()`). Select the spending field and type `115000` (`input` events): `__test_cliffPlanState().searchPending` is
  true, `bracket === bracketFrom`, and `fireProjectionRows` equals `__test_runPlanMode({ planMode: 'apply', plan: <that plan> }).rows`.
  Dispatch `change`: `searchPending` false, `bracket` is the kept bracket (not 22), and `fireProjectionRows` differs from the rows
  before `change`. Repeat with another value and no `change`: the same state is reached after the idle pause (a `waitForFunction` on
  `searchPending === false`, no fixed sleep). Exit 1 on any failure.
- [ ] **Step 2: Run** `npm run build && node test_bracket_search.js`. Expected: FAIL.
- [ ] **Step 3: Implement**; `npm run analyze` (the new seam).
- [ ] **Step 4: Run** `node test_bracket_search.js` (PASS); `npm test`; `npm run test:ui`; the planning time: a scratch Playwright
  timing (median of 9) of the full refresh on the slowest gap household with conversions on and the search on, against the 150 ms
  gate (over it, stop and report the timings to the owner).
- [ ] **Step 5:** add the script to `test-inventory.md`; commit `git commit -m "US: the bracket search runs in the deferred pass (off by default)"`.

### Task 5: Summary, card, tip and docs

**Files:**
- Modify: `src/us/core/cliff-plan/planning.js` (`cliffPlanSummary`: the conversion clause of spec A5.7, only when `report &&
  report.searched && report.brackets.length > 1`, added after the early "no steering helps this plan" return is restructured so the
  clause can follow it), `src/us/ui/results/decision-questions.js` (~58: the conversion label names the plan's bracket when it
  differs), `src/us/ui/results/roth-optimizer.js` (`computeRothOptimizer`: when `plan.bracket !== plan.bracketFrom`, each trial pins
  every window age inside the plan to its bracket through the override map, spec A4), `src/us/index.html` (the `rothConvBracket`
  `data-tip` only; the `<small>` text unchanged), `docs/architecture/cliff-plan.md`
- Test: `test_bracket_search.js` (extend)

- [ ] **Step 1: Extend the UI test** (search on): `summary` (while `searchPending`: no "Conversions:" clause; after `change`: the
  A5.7 clause naming the kept bracket and "within your conversion ages", literal string; a household whose user's bracket is kept:
  "Conversions: your 22% bracket (no other flat bracket does better)"); `card row` (open the flat-bracket card on the CA case: the
  22% row's after-tax end value equals that of `__test_runPlanMode({ planMode: 'apply', plan: { intents: <kept intents>, family:
  <kept family> } })` with `rothConvBracket` 22, read inside the page); conversions toggled off: the clause disappears and
  `fireProjectionRows` changes; at 390x844 `document.documentElement.scrollWidth > document.documentElement.clientWidth` is false.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then `node tests/snapshot_ui.js` (unchanged with the search off) and `node tests/doc_paths.js`.
- [ ] **Step 4: Run** `node test_bracket_search.js` (PASS); `npm test`.
- [ ] **Step 5:** commit `git commit -m "US: bracket-search summary, card pinning, tip and docs (search still off)"`. (The tip is
  user-facing text without a badge bump; the badge moves in Task 7's switch-on commit, which first makes the change visible.)

### Task 6: Guard script, scan and gap columns, bench scenario

**Files:**
- Create: `tests/bracket_search.js` (in `package.json`'s `test` chain after `tests/cliff_plan.js`), `tests/hist_depletion_cause.js`
- Modify: `tests/solver_scan.js` (bracket search on vs off: `__test_setBracketSearch(on)` then `__test_refreshCliffPlan()` for each
  side; a first-home-draw column read inside the page from `report.brackets` or `sim.homeDrawAge` before serialization; an earlier
  first draw counted like an earlier depletion), `tests/solver_gap.js` (the kept-plan column and the A5.4 check at both lengths, search
  on), `tests/bench_solver.js` (the converting scenario: the ACA early retiree, conversions to 74 at 22%), `docs/architecture/test-inventory.md`

- [ ] **Step 1:** `tests/bracket_search.js` per spec A5.3: for each of `scanHouseholds({ conversions: true, mode: 'default' })`, inside
  the page, search on then off, each followed by `__test_refreshCliffPlan()`, compare `depletedAge` and the first home draw (read
  in the page); exit 1 on an earlier one. Run it: exit 0 (a failure is the standard-depletion stop: report to the owner); record the
  seconds (over 60 s: stop and report).
- [ ] **Step 2:** `tests/hist_depletion_cause.js DIR_A DIR_B` (two `node tests/snapshot.js --dump DIR` outputs, `DIR/US/<slug>.json`,
  `tests/snapshot.js` ~181): for each `hist` or shifted `std` scenario depleting earlier in B, print `bridge drain` or `market
  variance` by spec A5.1's row rule; exit 1 on any bridge drain.
- [ ] **Step 3:** the scan, gap and bench changes; run `node tests/solver_gap.js --objective endValue` (both lengths) to check the
  script; numbers go in Task 7.
- [ ] **Step 4:** `npm test`; commit `git commit -m "Tests: bracket-search guard in npm test; scan, gap, bench and cause scripts"`.

### Task 7: Snapshots, gates, the switch-on, notes, and the stop before 3b

**Files:**
- Modify: `src/us/core/test-hooks.js` (the default), `tests/state_modules.js`, `tests/snapshots/us.json` and the `snapshot_ui`
  baselines if they move, `src/us/index.html` (badge V138), `README.md`, `docs/next-batches-plan.md` (a "#### Batch 5 step 3a"
  section under "### Batch 5 notes")

- [ ] **Step 1:** set `testBracketSearchOff: false` locally, `npm run build`, `node tests/snapshot.js`; list every mover (scenario,
  kept bracket, depletion and first home draw before -> after, end value change). Stop and report if a shift-0 standard scenario
  depletes or first draws on the house earlier, or if any mover lacks conversions on and the guard on, or is in RI or PA (A5.1).
- [ ] **Step 2:** `node tests/snapshot.js --dump <A>` on the base tree and `--dump <B>` here (search on); `node
  tests/hist_depletion_cause.js <A> <B>`: a bridge drain, stop and report; record each market-variance mover (historical and shifted
  standard, decision 15); list the five named scenarios with before / after ages.
- [ ] **Step 3: The gates, before committing:** `node tests/bench_runs_interleaved.js --base <base>` (+5%), `node tests/bench_solver.js
  --base <base> --rounds 7` (+30%, including the converting scenario), the planning time (150 ms). Over a gate: stop and report.
- [ ] **Step 4: The switch-on commit:** the default `false`, `tests/state_modules.js`, `npm run snapshot:update` (and the `snapshot_ui`
  baselines if `node tests/snapshot_ui.js` moves with the reviewed changes only), badge **V138**, `README.md`'s feature list; `npm test`
  and `npm run test:ui` (PASS); commit `git commit -m "US V138: the cliff plan tries the other flat brackets"`.
- [ ] **Step 5:** measurements: `node tests/solver_gap.js --objective endValue` (both lengths: the kept plan against the reference and
  the flat brackets; how much of step 0's gap 3a closed), `node tests/solver_scan.js`, `node tests/historical_rates.js` (reported).
- [ ] **Step 6:** write the notes (decisions 7-15, the measurements, the movers and causes, the gate timings) and commit
  `git commit -m "Batch 5 step 3a: notes"`. Then stop: bring the owner the 3a numbers (the gap left in each case after 3a, the scan's
  counts, the timings) and ask whether 3b is worth building.
