# Batch 5 step 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `optimizeMultiLever` and the applied schedules, record the lambda measurement, let Optimize size its best k
trials, show a per-year conversion schedule on the bracket card, and close Batch 5 (US V149).

**Architecture:** Deletions first (the old optimizer and its UI, then the applied-schedule fields and their engine branches),
each leaving `npm test` green with no snapshot mover except the three deleted scenarios. Then the Optimize change in
`src/us/core/optimizer/plan-search.js` (a sized re-planning of the best k unsized trials), the schedule table in
`src/us/ui/results/roth-optimizer.js`, and the measurements and docs.

**Tech Stack:** plain ES modules under `src/`, esbuild (`npm run build`), Vitest (`tests/unit/`), Playwright scripts (`tests/*.js`,
root `test_*.js`), the Node engine for measurements (`tests/helpers/engine-node.mjs`, `node --conditions=us`).

**Spec:** `docs/superpowers/specs/2026-10-29-b5-step5-retire-design.md` (read it first; section numbers below are its).

## Global Constraints

- Exact to the cent: Vitest comparisons `toBe` / `toStrictEqual`, never `toBeCloseTo`; hand-computed expected values or two runs
  in one process, never a literal copied from an engine run (CLAUDE.md, "Writing a Vitest test").
- Never `git stash`; never touch other worktrees; no push and no PR until the owner asks.
- A bug found in existing code is recorded in the task report and brought to the owner, not fixed here.
- Engine purity (CLAUDE.md "Engine and run context"): engine functions take `ctx` first and read `ctx.inputs`; a new module-level
  mutable in an engine module goes in `tests/engine-purity.json` in the same commit.
- After adding, removing or changing a module's exports or line-1 purpose: `npm run analyze` (the module map), same commit.
- Engine snapshots (`tests/snapshots/us.json`): only the three deleted scenarios' entries leave (43 entries: 3 `std` and 40
  `hist`, the latter from `histNames`); any other engine mover stops the task for the owner with its cause. Hash baselines that
  move by construction are updated in the task that moves them, after checking the cause: `snapshot_ui` (it hashes every hidden
  element's id, so a deleted hidden element moves every wiring entry) and `tests/snapshots/legacy_state.json` (it hashes the whole
  normalized state, so every US case moves once the two keys are gone; Canada moves only through the renamed `COMMON` case). Each
  update: first a script in the workspace shows the moved state / surface differs only by the deleted keys or elements, then
  `--update` (or `npm run snapshot:update`), and the commit lists the movers. Run `snapshot.js` / `snapshot_ui.js` /
  `legacy_state.js` and update before `npm test`, which runs them.
- Every review subagent runs on model `opus`. Implementer model per task as tagged.
- The workspace for scratch scripts and outputs: `.superpowers/sdd/2026-10-29-b5-step5/` (git-ignored via `.git/info/exclude`).
- US badge: V148 -> V149 (`src/us/index.html`'s `<h1>` span), once, in the task that makes the first user-facing change (Task 1).

## Review Focus

1. **A saved file from before step 5** carrying `appliedRothSchedule` / `appliedMixSchedule` (with keys, or garbage) loads, the
   fields are gone from `state`, and the dashboard runs the automatic plan (Task 2, `legacy_state.js` case).
2. **A stored plan saved before step 5** still loads and is still judged by the guard. Its `madeFor` fingerprint was taken over a
   state that held the two retired keys, so it now reads "computed for different inputs" until re-applied (expected, recorded in
   the notes; Task 2 adds a `legacy_state.js` case that pins exactly this, so a silent change shows).
3. **Optimize with sizing off or conversions off** (`testConvSizingOff`, `rothConvEnabled: false`): no trial is re-planned sized,
   and the result equals today's byte for byte (Task 4 Vitest case).
4. **The conversion schedule in display mode `real` vs nominal**, and after Apply / Clear and an input edit: the table follows the
   dashboard's run, never a stale one (Task 5 Playwright section).
5. **The bracket card on a household whose cliff plan's bracket differs from the setting** (the R5 I-A pinning through
   `rothBracketByAge`) is unchanged by the deletions (Task 1 keeps `bracket-search.test.js`'s pinning checks green).

---

### Task 1: Retire the old optimizer and its card (Sonnet)

**Files:**
- Delete: `src/us/core/optimizer/multi-lever.js`; `tests/unit/us/multi-lever-optimizer.test.js`, `-mix`, `-combined`,
  `-determinism`, `tests/unit/us/roth-optimizer-per-year.test.js`, `tests/unit/helpers/multi-lever.js` (if only those use it);
  `test_optimizer_ui.js`; `tests/solver_gap.js`; `tests/bench_optimizer.js`.
- Modify: `src/us/core/optimizer/roth-schedule.js` (keep `pickFlatBracket`; delete the `ROTH_PER_YEAR_*` constants and their
  comment block); `src/us/core/optimizer-state.js` (keep `rothBracketByAge`, `withdrawalMixByAge`; delete
  `ROTH_PER_YEAR_EVAL_BUDGET`, `lastMultiLeverRun`, `rothPerYearEvalBudget`; purpose line: "test-only override maps the store's run
  context reads"); `src/us/index.html` (delete the "Go further" block and `#rothPerYearResult`; badge V149);
  `src/us/ui/results/roth-optimizer.js` (delete `renderRothPerYearOptimizer` and its imports);
  `src/us/ui/results/roth-optimizer-controls.js` (delete the per-year button wiring; keep what else it wires, or delete the module
  and its `main.js` call if nothing is left); `src/us/ui/install-test-hooks.js` (delete `__test_optimizeRothLadderPerYear`,
  `__test_optimizeMultiLever`, `__test_setOptimizerBudget`, `__test_ROTH_PER_YEAR_CANDIDATES`, the analysis bundle's
  `perYear` / `multiLever` / `scheduleCost` / `card` parts, `multiLeverRun`, `multiLeverPlannedWithoutMaps`, `withOptimizerState`);
  `tests/unit/helpers/us-plan.js`; `tests/unit/us/bracket-search.test.js` (its `optimizeMultiLever` / `optimizeRothLadderPerYear`
  context checks at about lines 326-370 go; the card's pinning checks stay); `test_bracket_search.js:224-247` (the per-year
  section: `__test_setOptimizerBudget`, `#rothPerYearResult`, the "per-year words" check go); `tests/unit/shared/engine-ratchet.test.js:175-182`
  (its `multi-lever.js` load goes, count updated); `tests/unit/us/objectives.test.js` (line 5 imports `ACA_CLIFF` from
  `tests/unit/helpers/multi-lever.js`: move `ACA_CLIFF` into `objectives.test.js`, keep its checks, delete the helper; line 4
  imports `usOptimizer` from `tests/unit/helpers/us-plan.js`, whose multi-lever load at about lines 105 and 115-118 goes, the rest
  of `usOptimizer` kept for `objectives.test.js`); `test_apply_optimizer_schedule.js` (deleted here, not in Task 2: it calls the
  deleted `__test_optimizeMultiLever`; with its `tests/ui_scripts.js` entry, so `npm run test:ui` is green after this commit); `src/us/core/optimizer-state.js`'s load-time comment (it reads the deleted constant); `tests/analysis_parity.js` (drop the PLAN_G58_SCHED
  multi-lever self-check); `tests/bench_heavy.js` (drop the per-year timing); `tests/state_modules.js` (optimizerState's keys);
  `tests/engine-purity.json`; `tests/ui_scripts.js` (`SERIAL`); `test_plan_optimizer.js` (gains `test_optimizer_ui.js` section 4,
  the plan card's same answer in nominal and real mode, moved as is).
- Docs in this commit: `CLAUDE.md` (the multi-lever suites in "Commands"; the sanctioned writes: `multiLeverRun` /
  `multiLeverPlannedWithoutMaps` go), `docs/architecture/test-inventory.md`, `module-system.md` (`optimizer/` line, the sanctioned
  writes), `cliff-plan.md` (the `pickGuardedRun` and `solver_gap.js` references), `engine.md` (about lines 69 and 316-322: the
  old optimizers and `pickGuardedRun`), `README.md` (the "Go further" per-year search line: user-facing, same commit),
  `docs/superpowers/inventory/*` (`npm run analyze`).

**Interfaces:**
- Produces: no `multi-lever.js`; `optimizerState = { rothBracketByAge: null, withdrawalMixByAge: null }`; `__test_setRothOverride`
  and `__test_setWithdrawalMixOverride` unchanged (Task 2 relies on them).

- [ ] **Step 1: Audit.** `grep -rn "multi-lever\|optimizeMultiLever\|optimizeRothLadderPerYear\|pickGuardedRun\|ROTH_PER_YEAR\|lastMultiLeverRun\|rothPerYearEvalBudget\|rothPerYear\|setOptimizerBudget\|multiLeverRun\|PlannedWithoutMaps" src tests test_*.js scripts docs CLAUDE.md README.md`
  and list, in the task report, every hit with its fate (deleted / edited / kept with reason). A check of surviving behaviour that
  only reached it through a deleted hook is rewritten on a kept hook, not dropped; name each such check.
- [ ] **Step 2: Delete and edit** per the Files list. `scripts/extractions/*.json` are history from the module extraction: leave them.
- [ ] **Step 3: Verify.** `npm run analyze`; `npm run build`; `node tests/snapshot.js` (exact: no engine mover);
  `node tests/snapshot_ui.js`: it moves (the wiring entries hash the deleted `#rothPerYearResult`, and the bracket card's markup):
  confirm the cause as in Global Constraints, `--update`, list the surfaces; then `npm test` (green; the counted suites' totals
  change only where a deleted check is named in the report); `node tests/ui_scripts.js test_plan_optimizer.js test_bracket_search.js`;
  `node tests/analysis_parity.js --base <a 7a7df54 build>` with the four removed US bundle keys (`perYear`, `multiLever`,
  `scheduleCost`, `card`) stripped before the comparison (a workspace wrapper, or a `--ignore-keys` option): identical.
- [ ] **Step 4: Commit** "Batch 5 step 5 Task 1: retire optimizeMultiLever and the per-year card (US V149)".

### Task 2: Retire the applied schedules (Sonnet)

**Files:**
- Modify: `src/us/core/inputs/defaults.js` (delete both fields and their comment); `src/us/ui/inputs/normalize-state.js` (replace
  the sanitize block with `delete s.appliedRothSchedule; delete s.appliedMixSchedule;` and a one-line retired-field comment);
  `src/us/core/withdrawals/roth-conversion.js` (the schedule lookup at about lines 169-187: the bracket map, then the setting);
  `src/us/core/withdrawals/strategies.js` (the `appliedMixSchedule` lookup at about line 35: the mix map, then the configured order);
  `src/us/core/projection/run-projection.js` (`convExempt`: delete the schedule clause, keep both map clauses;
  `bracketSearchApplies`: delete the schedule clause); `src/us/core/optimizer/plan-search.js` (the working copy strips only
  `storedPlan`; delete `legacy` and its doc lines; the result loses `legacy`); `src/us/ui/results/plan-optimizer.js`
  (`withoutSchedules`, the copy's schedule nulling, Apply's schedule nulling, the `r.legacy` replace note at about lines 160-171 and
  `#planOptimizerReplaceNote`); `src/us/ui/results/roth-optimizer.js` (`renderMultiLeverAppliedStatus`) and `render.js` (its
  call); `src/us/ui/results/roth-optimizer-controls.js` (`applyMultiLeverSchedule`, `clearAppliedMultiLeverSchedule`, the
  `#multiLeverAppliedStatus` listener: delete the module and its `main.js` import and call if nothing is left);
  `src/us/index.html` (`#multiLeverAppliedStatus`, `#planOptimizerReplaceNote`); `src/us/ui/install-test-hooks.js`
  (`__test_applyMultiLeverSchedule`, `__test_clearAppliedMultiLeverSchedule`; `__test_setRothOverride` and
  `__test_setWithdrawalMixOverride` also drop the plan cache, `cliffPlanStore.key` / `forState` and `cliffPlanCache`, as
  `__test_setBracketSearch` does at about lines 163-170, so every moved Playwright test gets rule (c) below for free);
  `test_plan_optimizer.js`: the legacy section (about lines 315-371) loses its legacy setup (`__test_applyMultiLeverSchedule` at
  about 320) and the schedule checks, but its later checks of kept behaviour stay, rebuilt on a household where the search wins,
  applied through `#planOptimizerApplyBtn`: "search after apply: the applied plan wins" (the copy, no Apply button), the
  saved-scenario comparison (`__test_planForStateComputes`, loading the scenario gives the row's end assets) and the 390 x 844
  check with the card open; the `replaceNote` check at about 141 goes; the comments in `mix.js` / `roth-conversion.js` that name the old optimizer become
  "test-only seam (the yardstick, the fill probe and the tests)" for `withdrawalMixByAge`, and "the flat-bracket card's pinning
  (R5 I-A) and the tests" for `rothBracketByAge`.
- Delete: the snapshot scenarios `R mixApplied`, `R mixApplied+live`, `R rothSchedule`
  (`tests/snapshot_scenarios.js`) and their baseline entries.
- Tests moved to the kept seams (spec section 2). The swap is not one to one: an applied schedule also turned the cliff plan's
  bracket search off (`bracketSearchApplies`), and the plan cache (`planForState`, `src/us/core/cliff-plan/planning.js`) is keyed
  on the inputs only, never on the override maps. So each moved test (a) sets the map: `withdrawalMixByAge` for a forced mix,
  `rothBracketByAge` for a forced per-age bracket. Vitest: write the store's `optimizerState` before building the context, as
  `conversion-apply.test.js:116` does (`(await w.load('us/core/optimizer-state.js')).optimizerState.rothBracketByAge = new Map(...)`;
  `storeContext` takes no `overrides` option and always passes `optimizerState`, so an `overrides` option would be silently
  ignored). Playwright: `__test_setWithdrawalMixOverride` / `__test_setRothOverride` with a `Map`, reset to null after. (b) Turns the
  bracket search off (`test.bracketSearchOff` / `__test_setBracketSearch(false)`) whenever the old schedule covered a conversion age.
  (c) Drops the plan cache after setting a map (Playwright: the setters now do it; Vitest: a fresh context after the write). With
  (a)-(c) its figures must not change (Step 2's stop). `tests/unit/helpers/historical-parity.js` (its scenarios are `patch` objects
  only) gains a per-scenario override field that the helper writes to `optimizerState` before the run, and resets after.
- **Audit first (Step 0):** `grep -rn "appliedRothSchedule\|appliedMixSchedule\|PLAN_G58_SCHED\|multiLeverAppliedStatus\|ApplyMultiLever\|AppliedMultiLever\|planOptimizerReplaceNote" src tests test_*.js docs CLAUDE.md README.md`,
  each hit's fate in the report; after the task, zero hits outside `normalize-state.js`, `legacy_state.js` and the history docs.
  Known sites: `order-draw.test.js:98`, `mix-fallthrough.test.js:78/152/155`, `gains-capped.test.js:157`, `order-lever.test.js:150`,
  `conversion-choose.test.js:345`, `conversion-plan.test.js:226-233` (its `searched` checks), `conversion-apply.test.js:114/125`,
  `penalty_aware_withdrawals.js:109`, `tests/unit/helpers/historical-parity.js:56,60` (moved to the override path: `w.setState`
  normalizes, so a left-in field would silently make a copy of `US_R`); `plan-search.test.js:72,83` (copies built with the two
  null fields: drop them). `PLAN_G58_SCHED` (`plan-households.js:34-37`, a state patch
  that cannot carry a map) is deleted with its `engine-ratchet` and `analysis_parity` uses. Null resets (`appliedMixSchedule: null`
  in base patches: `cliff_guard.js`, `two_return_magi.js`, `sepp_per_account.js`, ...) are removed. `bracket-search.test.js:71/188`
  (an applied schedule turns the search off) are deleted with the behaviour. `plan-search.test.js`'s legacy checks are deleted with
  `legacy`.
- Docs also: `README.md` (about line 133, "Applying replaces a per-year conversion / withdrawal schedule ... keeps working": goes,
  same commit); `CLAUDE.md`'s sanctioned writes (the `roth-optimizer-controls.js` entry goes; `plan-optimizer.js`'s "sets the applied
  schedules to null" goes) and the same text in `module-system.md` (about line 73).
- `tests/legacy_state.js`: "garbage schedules" becomes "retired schedules" (a raw state with both fields, with keys and garbage:
  after load neither key is in `state`); plus "stored plan across step 5": a stored plan whose `madeFor` literal is the fingerprint
  a pre-Task-2 build produced (apply a plan on a `7a7df54` build in the workspace and read `state.storedPlan.madeFor`; any wrong
  literal would give the same card line, so it must be that real one). It loads valid and the guard still compares it; what its
  card line says follows the owner's fingerprint decision (Review Focus 2).
- Docs: `docs/architecture/inputs-and-ui.md`, `engine.md`, `cliff-plan.md` (the seams' test-only labels), `lists.md` if it names them.

**Interfaces:**
- Consumes: Task 1's `optimizerState` shape.
- Produces: `optimizePlan`'s result without `legacy`; `state` never holds the two keys.

- [ ] **Step 1: Write the `legacy_state.js` cases** above; run `npm run build && node tests/legacy_state.js`: they fail.
- [ ] **Step 2: Implement** the deletions and the test moves. A moved test must keep its assertions and pass unchanged
  (same rows, same figures): if any figure differs, stop and report (the seam and the field took different paths).
- [ ] **Step 3: Verify, in this order.** `npm run build`. Delete the three scenarios from `tests/snapshot_scenarios.js` and
  their names from `histNames` (about line 370); `node tests/snapshot.js` then reports only their 43 entries; `npm run
  snapshot:update`; `git diff tests/snapshots/us.json` shows exactly those 43 entries removed (anything else stops the task).
  `node tests/snapshot_ui.js` and `node tests/legacy_state.js`: update per Global Constraints (states differing only by the two keys,
  hidden-id lists differing only by the deleted elements). Then `npm test`; `node tests/ui_scripts.js test_plan_optimizer.js
  test_bracket_search.js`; `node tests/penalty_aware_withdrawals.js`, `node tests/roth_early_access.js`.
- [ ] **Step 4: Commit** "Batch 5 step 5 Task 2: retire the applied schedules (snapshot: 3 scenarios deleted, no mover)".

### Task 3: The lambda measurement, recorded (Sonnet)

**Files:**
- Modify: `tests/plan_mult_table.js` (a `--levers on|off` option, default on; off passes `{ order: false, split: false }` to the
  search: add an optional second argument `levers` to `__test_optimizePlan(objective, levers)` in `src/us/ui/install-test-hooks.js`,
  forwarded through `searchPlanAndRender` -> `searchPlan(objective, levers)` -> `optimizePlan(ctx, { objective, levers })`; the
  card's own calls pass nothing, so the UI is unchanged); `docs/architecture/test-inventory.md`.
- Modify: `docs/next-batches-plan.md`, a new notes section "Batch 5 step 5: lambda and the multiplier (measurement; no estimator
  change)", from spec section 3 and the two reports in the shared notes folder
  (`C:\Users\Alex\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\side-session-notes\local_e6ea644c-1e11-4167-b6cd-e4641944fa51\b5-step5-lambda-mult-report.md`
  and `b5-step5-lambda-local\`): the levers-separated table, F's diff and effect, the hindsight table (pooled, moved vs not), the
  oracle table, the uniform-multiplier table, the knife-edge count, the grid-shrink table; each with machine and Node version.

- [ ] **Step 1:** Implement the option; run `npm run build && node tests/plan_mult_table.js --levers off --no-gap --limit 4`:
  exit 0 and the table prints.
- [ ] **Step 2:** Write the notes section (figures copied from the reports, not re-derived).
- [ ] **Step 3: Commit** "Batch 5 step 5 Task 3: the lambda table's levers-off option and the lambda notes".

### Task 4: Optimize sizes its best k trials (Opus)

**Files:**
- Modify: `src/us/core/optimizer/plan-search.js`; `src/us/core/test-hooks.js` (`sizedTrials: null`);
  `src/shared/core/projection/run-context.js` (`NO_TEST` gains `sizedTrials: null`: one context shape);
  `src/us/core/cliff-plan/planning.js` (`storeRunContext`'s `test` literal, about line 33, as `convSizingOff`);
  `tests/state_modules.js` (about line 64, the `testHooks` deep-equal); `tests/helpers/engine-node.mjs` (its `TEST`); `src/us/ui/install-test-hooks.js` (`__test_setSizedTrials`);
  `tests/unit/shared/run-context.test.js` (the `test` pin); `src/us/ui/results/plan-optimizer.js` only if the card reads `trials`.
- Test: `tests/unit/us/plan-search.test.js` (new cases); `test_plan_optimizer.js` (new section).
- Docs: `docs/architecture/cliff-plan.md` (the plan card / Optimize section; the line "Optimize therefore no longer combines a
  multiplier with sizing" changes), `docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md` is not edited (history).

**Interfaces:**
- Produces: `export const SIZED_TRIALS` (k, the value set by Step 5); `optimizePlan(ctx, { objective, levers, sizedTrials })`,
  where an omitted `sizedTrials` reads `ctx.test.sizedTrials` when set (a test field fed from a new `testHooks.sizedTrials`, null by
  default, exactly as `ctx.test.convSizingOff` is fed from `testHooks.testConvSizingOff`; hook `__test_setSizedTrials(k)`), else
  `SIZED_TRIALS`;
  each entry of `result.trials` gains `sized: null | { measure }` (the sized re-planning's kept measure, `{ depletedAge,
  homeDrawAge, score, value, cost }`); `result.sizedCount` (how many trials were re-planned sized).

The algorithm (after the coordinate search, before the final rank):
1. Sizing applies only when base's planning ran the pass (`base.report.sized` is set). Otherwise `sizedTrials` is treated as 0 and
   the result is today's, byte for byte (no new planning, `sized: null` everywhere, `sizedCount: 0`).
2. Order the trials: those passing Rule A against base first (`late(depletedAge) >= late(base.depletedAge)` and the same for
   `homeDrawAge`), then later depletion, later first home draw, higher score; ties keep search order (stable sort). Walk that
   order and take the first `sizedTrials` trials whose plans are distinct (`JSON.stringify` of the plan's `intents, family, bracket,
   orders, orderPhases, splits`).
3. Re-plan each with the trial's own options and `sizing: true` (same `offMemo`, `rankEvenly`, `tieBracket`, `levers`, `objective`,
   `mult`); record `trials[i].sized = { measure }`.
4. The search's best is the best of the sized re-plannings by `rankBetter(t, best, base)` (first one as the start); it replaces
   the unsized best. With no sized re-planning (`sizedTrials` 0, or sizing not applying) the unsized best stays, as today. The
   final rank (base, current, search best) is unchanged. The comment and `cliff-plan.md` say a sized re-planning is "no earlier on
   Rule A, and within $1 on score" of its unsized self, not "never below" (the toggle-off fallback through `leverPlanStands` /
   `planCandidateBetter`, `solver.js:145-156`, can end up to $1 lower; `rankBetter`'s max($1, 0.1%) margin makes it moot).
   Distinctness ignores `mult`, while the pass proposes at the trial's own
   multiplier: of a duplicate set, the first in the order is sized (deterministic; say so in the code comment and `cliff-plan.md`).

- [ ] **Step 0: Choose the test household.** In a workspace copy of `src/` with the algorithm prototyped at k = 1, run Optimize
  (endValue, Node engine) on the conv sample (`scanHouseholds({ conversions: true }).filter((_, i) => i % 8 === 0)`) and the
  yardstick's two-return couple; pick one whose sized trial wins at k = 1 (so the test holds for any k >= 1). The cloud report's
  candidates: conv #11, #15, #45; two-return @100 at `[0.5, 1, 1]`. Delete the copy afterwards.
- [ ] **Step 1: Write the failing Vitest cases** in `plan-search.test.js`:
  - "sized trials: a sized search win with sizing on (R5 M2)": the Step 0 household. Asserts: `winner === 'search'`;
    `plan.conv` has at least one key; the plan's `apply` run's measure equals `measure` (`toStrictEqual` on the five keys);
    `measure` passes Rule A against `base`; `gain > 0`; `sizedCount === Math.min(SIZED_TRIALS, distinct trials)`.
  - "sized trials: sizing off is today's": the same household with `test.convSizingOff: true` -> every `trials[i].sized === null`,
    `sizedCount === 0`, and `plannings` equal to a run with `sizedTrials: 0`.
  - "sized trials: k = 0 is the unsized search": `sizedTrials: 0` gives the same `plan`, `measure`, `winner` as the code before this
    task (compare with the trials' own unsized best picked by `rankBetter`, recomputed in the test from `trials`).
  - Update the count in `afterAll`.
  Run `npx vitest run tests/unit/us/plan-search.test.js`: the new cases fail.
- [ ] **Step 2: Implement** the algorithm above.
- [ ] **Step 3: Existing tests.** `npx vitest run tests/unit/us/plan-search.test.js tests/unit/us/order-lever.test.js tests/unit/us/split-order-floor.test.js`
  then `npm run test:unit`. Known to break by construction: `plan-search.test.js:269`
  (`c.expect(r.trials).toStrictEqual(r0.trials)`, sizing on against off: trials now carry `sized`, and that case's `winner` may
  flip); compare the unsized fields only and state the winner's cause. Any other changed expectation (a winner, a plannings count, a trial's `conv`) is changed only with its cause
  written beside it in the test and in the task report; any Rule A failure stops the task.
- [ ] **Step 4: `test_plan_optimizer.js` section** with the shipped switch: the Step 1 household through the card's Search and
  Apply: Apply shown, after Apply the dashboard rows equal the plan's `apply` run and the year table's tooltip shows a sized
  conversion (`Conversion:`) in at least one year.
- [ ] **Step 5: Set k by the gate.** In the workspace, a Playwright timing script: for each gap household (`GAP_CASES` at life 75
  and 100, as B0.11.5 measures), cold page per round, `__test_optimizePlan('endValue')` and `'lifetimeCost'` wall time, median of 3 rounds (as B0.11.5's figures, so before and after compare; the headroom is small: TX @100 passed
  B0.11.5 at +28.6%, and even k = 1 adds a sized planning), on
  this build with k 1, 2, 3 (`__test_setSizedTrials(k)`) and on a `cf22985` build (`git archive
  cf22985` into the workspace, built with this worktree's `node_modules` on `NODE_PATH`). k = the largest of 1, 2, 3 whose worst
  household is at most +40% over `cf22985` on both objectives; if k = 1 fails, stop for the owner with the table. Also run the
  conv sample (48) and the yardstick with that k (`node tests/yardstick.mjs --jobs 2`) and record wins, Rule A and the gaps.
- [ ] **Step 6: Commit** "Batch 5 step 5 Task 4: Optimize re-plans its best k trials with sizing (k = N)", with the timing table
  in the task report.

### Task 5: The conversion schedule on the bracket card (Sonnet)

**Files:**
- Modify: `src/us/index.html` (in the old "Go further" place: `<div id="conversionSchedule">` with a heading line
  `#conversionScheduleTitle` and a table `Age | Conversion | Why`, tbody `#conversionScheduleRows`, and `#conversionScheduleNone`
  for "This plan converts nothing."); `src/us/ui/results/roth-optimizer.js` (`export function renderConversionSchedule(selected)`);
  `src/us/ui/results/render.js` (`renderOpenCards`: call it right after `annotateRothOptimizer()`, same condition).
- Test: `test_bracket_search.js` or a new root `test_conversion_schedule.js` (builder's choice; a new file is picked up by
  `tests/ui_scripts.js` by name).
- Docs: README (the bracket card's feature line), `inputs-and-ui.md` (the render path).

**Interfaces:**
- Consumes: the dashboard's run `selected` (rows with `age`, `year`, `conversionAmount`, `convChoice`, `cliffChoice`); the plan name
  wording of `planName()` in the same module; `cliffPlanStore.plan.bracket` / `bracketFrom` for the flat bracket.

The "why" cell, per row with `conversionAmount >= 1`: `row.convChoice` when set (capitalised as a sentence fragment); else
`row.cliffChoice` when set ("stayed under ..." or "filled to ...": a phased fill year's conversion is capped at the natural
year's, `run-projection.js:863`, so the bracket label would be wrong there; a builder's call beyond spec section 5, which named
only "stayed under"); else "Fill to the top of the N% bracket" with N the plan's bracket when
`plan.bracketFrom === state.rothConvBracket`, else the setting. Amount: `money(displayValue(row.conversionAmount, row.year))`.
Title: "Conversions in <planName()>" (e.g. "Conversions in the applied plan").

- [ ] **Step 1: Write the failing UI test:** (a) the CA gap couple at life 100 with the card open: the table's ages are exactly
  the rows of `window.fireProjectionRows` with `conversionAmount >= 1`, and each amount cell equals `money(displayValue(...))` of
  that row (read through `__test_*` hooks as `test_bracket_search.js` does); (b) display mode real vs nominal: amounts differ and
  each equals its row's display value; (c) a spending `input` then `__test_flushRender()`: the table matches the new rows;
  (d) conversions that convert nothing (a household whose plan converts 0): the "converts nothing" line shows, the table is hidden;
  (e) 390 x 844 viewport: `document.documentElement.scrollWidth > clientWidth` is false with the card open.
  Run it after `npm run build`: fails.
- [ ] **Step 2: Implement** the markup and `renderConversionSchedule`.
- [ ] **Step 3: Verify:** the new test passes; `node tests/snapshot_ui.js` moves only on the bracket card (list the surfaces);
  `npm test` green.
- [ ] **Step 4: Commit** "Batch 5 step 5 Task 5: the conversion schedule on the bracket card".

### Task 6: Two-return cold time (Opus, measurement; code only if over 10 s)

- [ ] **Step 1:** In the workspace, time Optimize cold (fresh page, first click of the card's Search, both objectives, median of 3)
  on the two-return households of the 4d notes ("Optimize on two-return households": the household behind Task 7's slowest Search
  and Task 7's worst two-return household; find them in the 4d notes and `tests/helpers/plan-households.js` / the scan grid) with
  this branch's build (k from Task 4).
- [ ] **Step 2:** If every time is at most 10 s: record the table in the notes (Task 7) and the stage-0 share as a follow-up; no
  code. Otherwise share stage 0 between the joint and order-only tracks in `computeCliffPlan` (`automatic(lev, offMemo)`): prove
  identity with a workspace script comparing `JSON.stringify` of `{ plan, report }` for the 384 two-return household-modes
  (`scanHouseholds()` two-return filings, both modes, conversions off and on) against the commit before; 0 differences, no snapshot
  mover; then commit "Batch 5 step 5 Task 6: share stage 0 between the two tracks (pure speed-up)".

### Task 7: Measurements, movers and closing Batch 5 (Sonnet for docs; the controller runs the measurements)

- [ ] **Step 1: Gates** (alone on the machine): `node tests/bench_runs_interleaved.js --warm-analysis` against `cf22985` (+5%),
  `node tests/bench_solver.js` (+30%), the planning median (250 ms; the piece 3 notes' method), `node tests/conversion_sizing.js`
  (60 s), Optimize (Task 4's table). Record each in the notes.
- [ ] **Step 2: Yardstick and scan:** `node tests/yardstick.mjs --jobs 2 --json` and `node tests/solver_scan.js --sizing --conv-only`
  on this branch and on `7a7df54` (the scan's figures before are in the piece 3 notes; re-run only if the machine differs). Expected:
  the automatic plan's columns identical (Tasks 1-2 move no engine output), Optimize's columns move by Task 4 only.
- [ ] **Step 3: Snapshots:** `node tests/snapshot.js`, `node tests/snapshot_ui.js`, `node tests/plan_off_anchor.js` against
  `7a7df54`: list every mover with its cause (expected: none beyond the three deleted scenarios and the bracket card's
  `snapshot_ui` surfaces). Stop for the owner if anything else moves.
- [ ] **Step 4: Docs:** README (the per-year search's line goes; the conversion schedule and Optimize's sized trials come in);
  `cliff-plan.md`; `docs/roadmap.md` (Batch 5 complete); `docs/next-batches-plan.md` (the Batch 5 status line: complete, with the
  follow-ups of spec section 7, Task 6's outcome and the fingerprint note of Review Focus 2; the step 5 notes: Tasks 4-6's tables and
  Step 1-3's figures); `npm run analyze`.
- [ ] **Step 5:** `npm test` and `npm run test:ui` green; commit "Batch 5 step 5: measurements and docs (Batch 5 complete)".
- [ ] **Step 6:** Final whole-branch review on `opus`, then stop for the owner (no push, no PR until asked).
