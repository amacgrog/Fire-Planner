# Batch 5 step 5: retire the old optimizer, lambda, Optimize's sizing, the conversion schedule (US)

Status: owner decisions taken 2026-10-29 (sections 2-5); awaiting the owner's OK on this document. Base `7a7df54` (origin/main,
PR #60, US V148 / Canada V66). Branch `claude/b5-step5-retire-7717e6`. Canada is untouched (Batch 4B). The last planned piece of
Batch 5: after it, Batch 5 is closed with its follow-ups listed.

Read with: `docs/next-batches-plan.md` "Batch 5: optimizer" and its notes (4a's lambda table, "Step 4 summary, for step 5" in 4d,
5a's yardstick, the piece 3 notes and R5's follow-ups); `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md`;
`docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md` (B0.11.4, B0.11.5, B0.11.9); `docs/architecture/cliff-plan.md`.

## 1. Intent

The stored plan (4a) with its levers (4b-4d) and the per-year conversion sizing (piece 3) replaced the old per-year search
(`optimizeMultiLever`). Step 5 removes the old search and everything that only it used, leaves the engine with one way to plan,
settles lambda from measurement, lets Optimize keep conversion sizing on the plans it offers, and gives the user back the answer
the old card gave: how much to convert at each age. The first intended users are couples around 60 asking about Roth
conversions and a bond bucket.

## 2. Retire the old optimizer and the applied schedules (owner, 2026-10-29)

**Decision.** Nobody uses the older engine, so no saved scenario carries an old Apply: there is nothing to migrate and no user to
warn. `appliedRothSchedule` and `appliedMixSchedule` are retired fields: `normalizeState` deletes both explicitly (CLAUDE.md:
a retired field is deleted, or it re-migrates on every load). No note, no conversion to a stored plan.

**Deleted:**
- `optimizeMultiLever`, `optimizeRothLadderPerYear`, `pickGuardedRun` (`src/us/core/optimizer/multi-lever.js`, the module);
  `ROTH_PER_YEAR_CANDIDATES`, `ROTH_PER_YEAR_MAX_WINDOW` (the 30-year cap), `ROTH_PER_YEAR_MAX_PASSES`,
  `ROTH_PER_YEAR_EVAL_BUDGET`; `optimizerState`'s `lastMultiLeverRun` and `rothPerYearEvalBudget`.
- The "Go further: search each year separately" button, its summary and its table (`#rothPerYearOptimizeBtn`,
  `#rothPerYearResult`), `renderRothPerYearOptimizer`, the "Applied from the earlier strategy search" note and its clear links,
  `applyMultiLeverSchedule` / the roth-optimizer controls' Apply and Clear.
- The engine's applied-schedule branches: `solveRothConversion`'s schedule lookup (`roth-conversion.js`), the strategies'
  `appliedMixSchedule` lookup, `convExempt`'s schedule clause, `bracketSearchApplies`'s schedule clause, Optimize's `legacy`
  run and `withoutSchedules` / the schedule nulling in the plan card.
- The test hooks that exist only for the above (`__test_optimizeMultiLever`, `__test_optimizeRothLadderPerYear`,
  `__test_setOptimizerBudget`, the analysis bundle's per-year and multi-lever parts) and the tests that exist only for them
  (`multi-lever-*.test.js`, `roth-optimizer-per-year.test.js`, `test_optimizer_ui.js`, `test_apply_optimizer_schedule.js`,
  `tests/solver_gap.js` and `tests/bench_optimizer.js`, whose reference is the deleted search; the yardstick replaces the gap
  table), and the three snapshot scenarios that only run applied schedules (`R mixApplied`, `R mixApplied+live`,
  `R rothSchedule`), which become copies of `R`: deleted, not re-baselined.

**Kept.**
- `ctx.overrides.rothBracketByAge`: the flat-bracket card (the bracket ranking table, which stays) pins each window age of a
  bracket's row through it when the cliff plan's bracket differs from the setting (R5 I-A, `computeRothOptimizer`). It is a
  live UI seam, so the overrides shape stays `{ rothBracketByAge, withdrawalMixByAge, rothAmountByAge }`, unchanged.
- Labelled test-only in the code and in `cliff-plan.md` / `engine.md`: `ctx.overrides.rothAmountByAge` (the yardstick and the
  fill probe) and `ctx.overrides.withdrawalMixByAge` with the explicit-mix draw (`WITHDRAWAL_MIX_CANDIDATES`, the mix
  fallthrough of step 2b). No UI path reaches the mix map.
- `optimizerState` keeps `rothBracketByAge` and `withdrawalMixByAge`, the hook-settable maps the store's run context reads
  (`__test_setRothOverride`, `__test_setWithdrawalMixOverride`), as test-only state; nothing in the UI writes them.

**Tests that leaned on the retired fields** keep their checks on the kept seams: a test that set `appliedMixSchedule` to force a
year's mix (`order-draw`, `mix-fallthrough`, `gains-capped`, `penalty_aware_withdrawals.js`, `roth_early_access.js`, ...) sets
`withdrawalMixByAge` instead (Vitest: the context's overrides; Playwright: `__test_setWithdrawalMixOverride`); a test that set
`appliedRothSchedule` or the bracket map to force a per-age bracket (`plan-households.js`'s `PLAN_G58_SCHED`,
`conversion-apply.test.js`, ...) sets `rothBracketByAge` (one to one: both map an age to a bracket). Null resets of the retired
fields are removed. Tests of a behaviour that goes (an applied schedule turning the bracket search off) are deleted with it.

**Builder's calls:** the exact list of deleted tests and hooks is the plan's, after an audit that every deleted check covered
only deleted code (a check of surviving behaviour that leaned on a deleted hook is rewritten, not dropped). `tests/legacy_state.js`'s
"garbage schedules" case becomes "the retired fields are deleted".

## 3. Lambda and the multiplier: no change (owner, 2026-10-29)

**Decision.** `lambdaEstimate` and the default multiplier (`[1, 1, 1]`) stay as they are; Optimize keeps searching `mult` on the
full grid `[0, 0.5, 1, 1.5, 2]`, unsized trials as shipped. Step 5's lambda work is the measurement, recorded in the Batch 5
notes:
- **The levers separated** (Node, sizing on): with the order and split levers off, the multiplier alone never wins on endValue
  (0 of 102 households) and wins on lifetimeCost in 5 (every16) and 8 (conv), at 1.5, in phases whose lambda sample is moved
  (21/21 years before 65). With the levers on, most `mult != 1` wins are in phases with no moved sample: the multiplier tunes the
  order and split decisions for lifetimeCost. `tests/plan_mult_table.js` gains the levers-off option (`--levers off`).
- **The moved-sample correction (F)**, pricing an emptied-pool sample at the year's full draw: the automatic plan moves in 1 of
  102 households on endValue (-1,031) and 3 on lifetimeCost; the yardstick is identical. Recorded as a follow-up, not built.
- **The independent analysis** (a cloud Fable run, 2026-10-29): a hindsight lambda (one traditional dollar against one Roth
  dollar under the applied plan) runs about 0.04 above the estimate, with errors 2.6 times larger in moved years, but is nearly
  constant across a household's years (a marginal traditional dollar is mostly priced by the end tax), and even that oracle moves
  the yardstick -2.05% .. +0.56% with no consistent sign. Every uniform multiplier other than 1 breaks Rule A somewhere or loses
  end value. Lambda matters through conversion sizing (31% of sized years are knife-edge on lambda), not through `choose` on
  conversions-off households.

## 4. Optimize: size the best k trials (owner, 2026-10-29)

**The problem.** Optimize's `mult` trials run unsized (B0.11.4); a trial winner carries `conv: null`, so applying it drops the
sizing. Sizing only the final winner (B0.11.4's recorded follow-up) does not capture the gain: the trials that gain once sized
mostly lose while unsized. Sizing every trial gains +71,515 endValue on the conv sample and +505,349 lifetimeCost on the
yardstick with no Rule A failure, but fails Optimize's +40% gate (+26% .. +195% on the gap households).

**Decision.** After the coordinate search, Optimize re-plans the best `k` distinct unsized trials with sizing on (the same
planning options, `sizing: true`). Each sized trial replaces its unsized self: the sizing pass keeps a sized plan only when it
beats the planning's own unsized plan (`bracketCandidateBetter`), so a sized trial is never below its unsized self, and the best
unsized trial is among the `k`, so no unsized trial can win and an applied winner never drops its sizing. The final rank (base,
the stored plan, the `k` sized trials) runs as today: `rankBetter`, Rule A against base, a strict win. `k` is the largest of 1, 2, 3 that keeps Optimize within its
gate (B0.11.5: at most +40% on the gap households against `cf22985`, measured in the browser). `k = 1` is B0.11.4's final-winner
pass, the floor; if even `k = 1` fails the gate, the builder stops for the owner.

**Details (builder's calls, to confirm in the plan):**
- "Best" is the order `rankBetter` gives the unsized trials (Rule A against base first, then depletion, home draw, score).
  "Distinct" is by the trial's plan (intents, bracket, orders, splits), so two multipliers that plan the same are sized once.
- A sized trial reuses the search's `offMemo`; the sizing pass is unchanged (its own scoring and keep rule, B0.11.3 / B0.11.9).
- A sized winner carries its `conv` into the stored plan as a sized automatic plan does; the stored-plan shape is unchanged.
- The report records which trials were sized and their sized measures (`trials[i].sized`), for the card and the notes.

**The missing test (R5 M2).** One Vitest case and one `test_plan_optimizer.js` section in which Optimize's search beats a sized
base with the shipped switch (sizing on); a household from the analysis whose sized trial wins (for example the yardstick's
two-return couple @100, `[0.5, 1, 1]`, or a conv-sample household), chosen in the plan by measurement.

**Two-return cold time.** Measure Optimize's cold time (with section 4's `k`) on the 4d notes' two-return households in the
browser first (the cloud analysis saw at most 2.5 s in Node), and record it. `k` is set by the gap households' gate only; the
two-return times are information against the 4a cost target (10 s). Only if a two-return household's cold time is over 10 s,
share stage 0 between the joint and order-only tracks, as a pure speed-up: every plan and report identical (checked by a
byte-for-byte comparison of plans and reports on the 384 two-return household-modes), no snapshot mover. Under 10 s, the share
is recorded as a follow-up and not built.

## 5. The conversion schedule on the bracket card (owner, 2026-10-29)

**Decision.** In the old card's place on the Roth conversion bracket card, a read-only table built from the dashboard's own
standard run (the applied plan when the guard uses it, else the automatic plan; the run `render()` already has): no search, no
extra projection.
- Columns: age; conversion amount (`row.conversionAmount`, in the dashboard's dollars, `displayValue`); why: the row's
  `convChoice` in a sized year ("the top of the 22% bracket", "just under IRMAA tier 1", ...), else the plan's flat bracket
  ("fill to the top of the 22% bracket"); in an unsized year whose `row.cliffChoice` starts "stayed under", that stay-under
  ("stayed under the ACA 400% line"). Read from existing row fields only: no new row field (a new field would move every
  standard snapshot).
- Only years with a conversion; with none, one line ("This plan converts nothing.") or the table hidden when conversions are off.
- A one-line heading says which plan it is (the applied plan or the automatic plan), in the cards' existing wording.
- US only. A Playwright section (the table matches the rows of `window.fireProjectionRows`, follows an Apply and an input
  change) and the 390-px mobile check (no horizontal scroll).

**Builder's calls:** the exact wording of the "why" column and the heading; whether it renders in the light or the deferred pass
(the deferred pass when the dashboard's rows can change there, as the cliff plan's bracket search does).

## 6. Gates

- `npm test` and `npm run test:ui` green; US badge past V148 (V149).
- Timing within the existing gates: planning (250 ms median per input change, B0.11.5 / B0.11.9), the light refresh (+5%),
  Optimize (+40% against `cf22985`, with section 4's `k`), the benches.
- Snapshots: the standard snapshot scenarios do not move except the three deleted ones (section 2); none runs out or first draws
  on the house earlier; historical movers explained by cause; movers listed with causes before `npm run snapshot:update`.
  Section 4 changes only Optimize, which no snapshot runs; `snapshot_ui` moves where the bracket card's markup changes.
- The yardstick (`tests/yardstick.mjs`) and `tests/solver_scan.js` re-run and recorded (before / after).
- Docs: README, `cliff-plan.md`, `engine.md`, `inputs-and-ui.md`, `test-inventory.md`, `module-map.md` (`npm run analyze`),
  `docs/roadmap.md` and the Batch 5 section of `docs/next-batches-plan.md` say Batch 5 is complete and list its follow-ups.

## 7. Out of scope (recorded as Batch 5 follow-ups)

- Lambda's moved-sample correction (F) and the `convScore` tie at the bracket top on the whole-run measure (section 3).
- Sizing every Optimize trial, or a cheaper form beyond `k` (sizing only the phase a trial changes; sized trials for lifetimeCost
  only), and lifetimeCost Optimize regaining Task 4's lower costs.
- The R5 M3 survivor bridge need; the unsized forced-pick tie (11 of 60 years); the reserve target net of guaranteed income (V2);
  the bucket mode's buy-year flaw; a floor for `tests/conversion_sizing.js`'s keep count.
- Shrinking the `mult` grid (needs `validMult` to keep accepting 0, or a stored-plan migration).
- Canada (Batch 4B).
