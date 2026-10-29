# Batch 5 step 3: Roth conversion sizing, split into 3a (flat-bracket candidates) and 3b (per-year sizing) (US)

Status: design approved by the owner on 2026-10-24 (decisions 1-6), then revised the same day after an outside review
(decisions 7-16: the step split into 3a and 3b). **3a** is approved to plan and build. **3b** (Part B) is built only after the
owner has seen 3a's numbers and asks for it; the work stops after 3a. **Owner, 2026-10-25: 3b skipped** (the Roth-only gap run left at most about 0.6% for per-year sizing; see the Batch 5 step 3a notes); step 4 is next.
**2026-10-27: 3b reopened as Batch 5 step 5b piece 3** (owner ruling 3 of 5a, after 5a's yardstick put the room at 0.9-5.0%).
Part B is revised against main `cf22985` (US V146, Canada V65) in section B0, which is authoritative where it differs from
B4-B13. B0 approved by the owner 2026-10-27; Tasks 0-4 built (switched off). **2026-10-28: B0.11 (revision 2: whole-run
acceptance, ties to the bracket) after Task 4 showed the yearly score never sizes; B0.11 waits for the owner's OK.**
**2026-10-28 (owner, after the cloud Fable review): piece 2 dropped;** the yardstick reports the reserve-to-target ratio instead
(B0.11.7).
Base: `b544934` (origin/main: steps 0-2 and PR #47, US V137).

Read with: `docs/next-batches-plan.md`, "Batch 5: optimizer" (the re-scope block, the 3C redesign items 1 and 5, "Batch 5 owns
all lambda-driven policy", "Tax-aware conversion sizing" with Notes 1 and 2) and the Batch 5 notes (step 0, step 2, step 2b);
the 3C notes, section 13 (the first attempt, which depleted 5 snapshot scenarios earlier); `docs/architecture/cliff-plan.md`,
`engine.md`, `magi-iteration.md`, `us-health.md`; the step 2 spec `2026-10-23-b5-objective-registry-design.md`.

## 1. Intent

Today a Roth conversion fills ordinary income to the top of the user's bracket (`rothConvBracket`) in each year of the user's
window, held under the ACA 400% line and the next IRMAA tier by `conversionMagiCeiling`. At the planner's default length the
shipped run is within a few percent of the slow reference; the remaining conversion gap is the IRMAA couple (CA): a flat 24%
bracket scores better than the shipped 22% (step 0, on the after-tax end value too).

An outside review's probe on the V137 build (2026-10-24, after-tax end value, guard on) found: CA 24% beats 22% by 0.52% at
life 100 and 0.18% at 75; TX 10% beats the shipped 22% by 3.52% at 100 and 1.30% at 75; NY no better bracket. So a flat bracket
recovers more for TX than for CA.

**3a** lets the cliff plan try the other flat brackets of the conversion select as whole-run candidates beside the user's own,
and keep one only when it is clearly better on the after-tax end value without running out (or touching the house) earlier.
That recovers what a flat bracket can recover (CA's gap) at small cost, with no change when the user's bracket wins.
**3b** (Part B) sizes each conversion year by price, behind an outer search over the lambda multiplier `m`; it is built only if
3a leaves room worth taking.

What success looks like for 3a: in every gap case and both plan lengths the kept plan's after-tax end value is at least the best
flat bracket's less the replacement threshold (true by construction); no standard snapshot scenario and no scan household
depletes, or first draws on home equity, earlier than its user's-bracket run; plans that do not convert are byte-identical in
their rows; historical movers are explained by cause (decision 5).

## 2. Owner decisions (2026-10-24)

Decisions 1-6 were made for the per-year design; decision 1, 5 and 6's principles carry into 3a as stated in Part A.

1. **Automatic, in the cliff plan.** The search is part of the automatic cliff plan, not only on Optimize. It acts only for a
   plan that already converts (`rothConvEnabled`, cliff guard on) and only inside the user's conversion ages. The user's bracket
   run is always a candidate and is kept unless another beats it under Rule A. (Where it runs in the render: decision 8.)
2. **No hard cap at the lines for sized candidates** (3b). The IRMAA tiers and the ACA 400% line are priced, not capped, for
   per-year sized candidates; "just under each line" is always a candidate; the bracket candidate keeps today's ceiling.
3. **The plan records a named target per age** (3b): a bracket top, just under or over a named line, or none; each path sizes
   its own conversion to it.
4. **`m` scales only the conversion sizing** (3b). The guard's lambda stays as today (`SOLVER_LAMBDA_MULT` = 1).
5. **Snapshot depletion: a split gate** (both parts). Standard snapshots never deplete earlier (hard); historical movers are
   explained by cause, and a bridge drain stops for the owner; a path-balance bridge test in `apply` counts as an eligibility
   fallback, built only if a drain shows the need (Part A section A5, Part B rule 9.1). This supersedes the plan's carried-over
   3C line "no snapshot scenario depletes earlier" for historical scenarios, as the cliff-plan spec's section 8 already did.
6. **A target that cannot be carried falls back to the user's bracket** with today's ceiling, the same in `choose` and `apply`
   (3b; amended for a crossed floor by the 3b revision list, item R10).
7. **Split step 3.** 3a: the five other flat brackets as outer-search candidates (six plain plans, the user's among them). Then
   re-run `tests/solver_gap.js` at both lengths with the flat-bracket comparison at both. 3b is built only if 3a leaves room
   worth taking: the owner sees 3a's numbers first, and the work stops before 3b.
8. **Where the search runs:** in the deferred render pass (`renderDeferred()`), not the light render. The user's-bracket plan
   shows while the user types or drags; the rows update once after release (or after the idle pause). A full `render()` runs the
   search at once.
9. **Replacement threshold: relative.** A candidate replaces the running best only when it is strictly better by more than
   0.1% of the best's after-tax end value (the exact rule in A3); the fixed candidate order and the strict-improvement rule stay.
10. **Rhode Island and Pennsylvania: the user's bracket only.** A conversion there takes the filer's pro-rata 401(k) share of the
    state exclusion, so conversions look too cheap (the existing Open item, F6 in the Batch 3 notes for PA; a separate session is
    fixing it). Until that fix lands, the search (3a) and sizing (3b) are off for `stateTax` `ri` and `pa`. **Superseded by
    decision 16.**
11. **IRMAA discount: deferred.** IRMAA stays charged in full two years on (conservative: a death or a lower later MAGI may mean
    it is never charged). The "decide in Batch 5" Open item is deferred past step 3, explicitly.
12. **A stay-under after a sized phase** (3b): add "the sized conversion, capped at the line" as one more guard candidate
    (scored at `m` = 1), rather than the stay-under trial converting nothing.
13. **The year-0 IRMAA stand-in** (3b): during the choice, frozen at the bracket phase's value (a conversion today cannot change
    returns already filed). Whether the engine itself should let year 0 move the stand-in is a backlog note, not a step 3 fix.

14. **Home equity: both no earlier** (owner, 2026-10-24). A candidate must deplete no earlier and first draw on home equity no
    earlier than the best; a plan that lasts longer only by selling the house sooner is never kept (A3).
15. **Shifted standard scenarios are classified like historical movers** (owner, 2026-10-24): they apply the unshifted plan to
    other retirement ages, so one that depletes earlier is explained by cause; a bridge drain stops for the owner, market variance
    is recorded (A5.1).

16. **Rhode Island and Pennsylvania: candidates on** (owner, 2026-10-24). The conversion-tax fix merged (PR #48, main `94e0fd4`,
    US V138): RI and PA tax a conversion by the account it comes from. The flat-bracket candidates apply there as everywhere, and the
    depletion scan gains RI and PA households. Supersedes decision 10's exclusion.

# Part A: step 3a, flat-bracket candidates in the cliff plan

## A1. Goals, non-goals, anti-goals

Goals: the outer search over the six flat brackets, ranked by Rule A with the relative threshold; running it in the deferred
pass; the plan carrying the chosen bracket; the summary line saying what the plan did; the guard script, the gap table at both
lengths, the scan with a home-equity column; the 3a numbers for the owner.

Non-goals: per-year sizing and everything in Part B; storing the plan in `state`; the Apply refinement; the stock-account order
and the two-return split (step 4); retiring `optimizeMultiLever` (step 5); the IRMAA discount (decision 11).

Anti-goals: any plan depleting, or first drawing on home equity, earlier than the user's-bracket run on the deterministic
projection; moving a plan that does not convert, or one whose bracket candidates all lose (rows byte-identical to V137); a
per-keystroke stall; choosing by historical or Monte Carlo results.

## A2. When the search applies

All of: `rothConvEnabled`, `cliffGuardEnabled`, at least one window age (`rothConvStartAge`..`rothConvEndAge`) inside the plan,
`inputs.appliedRothSchedule` null or with no keys (an explicit schedule is the user's choice; the
optimizer's override maps are not looked at here: planning sees the store's maps only through `refreshCliffPlan`'s key), and
`!ctx.test.bracketSearchOff` (a new field of the one `test` literal, `NO_TEST` and `storeRunContext`; it changes the Canada
build's bytes through the shared `NO_TEST`, not its behaviour). Otherwise the plan is today's, byte for byte.

## A3. The search

In `computeCliffPlan(ctx)` (`run-projection.js`), after today's selection:
1. **Candidate 0, the user's bracket:** today's `computeCliffPlan` result exactly (choose, the family subsets, `off`, Rule A
   through `planCandidateBetter`), with its run's `depletedAge`, `homeDrawAge` (A4) and value (`US_OBJECTIVES.endValue`).
2. **Candidates 1-5:** for each other bracket of `BRACKET_CANDIDATES = [10, 12, 22, 24, 32, 35]` in ascending order, the same
   selection on a context whose plan carries that bracket (A4): `choose` with `plan = { intents: {}, family: 'none', bracket: b,
   bracketFrom: inputs.rothConvBracket }`, the family subsets through `apply` with the bracket held, `off` with the bracket held;
   today's Rule A among them. So each candidate is that bracket's own best cliff plan.
3. **Rank** (fixed order: candidate 0, then 1-5 ascending; the running best is replaced only on a strict win):
   `bracketCandidateBetter(c, best)` (decision 14): `c` must deplete no earlier (`null` = never = latest) **and** first draw on home equity no earlier
   (`null` latest) than `best`; then it wins if it depletes later, or first draws on the house later, or both are equal and
   `c.value > best.value + Math.max(1, 0.001 * Math.abs(best.value))` (decision 9). Nothing else replaces the best. So the kept
   plan never depletes, and never touches the house, earlier than the user's-bracket plan (both by construction), and every
   candidate whose depletion and first home draw equal the kept plan's has a value at most the kept one's plus the threshold.
4. **The plan:** `{ intents, family, bracket, bracketFrom }` where `bracket` is the kept bracket and `bracketFrom` the user's
   (`bracket === bracketFrom` when candidate 0 is kept). The report keeps today's fields as they are for the kept bracket
   (`candidates[]`, the family candidates, and `kept`, a family name: `cliffPlanSummary`, `tests/cliff_plan.js`,
   `tests/cliff_guard.js` and `tests/bench_plan.js` read them) and adds `brackets[]` (one entry per bracket candidate:
   `bracket`, family, intents, depletion, first home draw, value, cost), `keptBracket` and `searched`.

Cost: today's plan is 1-4 runs; the search adds five such selections (5-20 runs). Measured, not assumed (A6).

## A4. The plan's bracket in the engine

`solveRothConversion(ctx, profile, maxAvailable, yearIndex, ageKey)` resolves the bracket in this order: the override map
(`ctx.overrides.rothBracketByAge`), the applied schedule, then **the plan's bracket** when `ctx.plan && ctx.plan.bracket != null
&& ctx.plan.bracketFrom === inputs.rothConvBracket`, then `inputs.rothConvBracket`. The `bracketFrom` test means a variant that
changes the bracket (a card's trial) is never silently overridden by a plan made for another setting. Today's ceiling applies
to every bracket (`conversionMagiCeiling`, unchanged).

The flat-bracket card (`computeRothOptimizer`, `src/us/ui/results/roth-optimizer.js`) asks "what does bracket b do"; its trial for
the user's own bracket would otherwise get the plan's bracket. When `plan.bracket !== plan.bracketFrom` (otherwise the card is
today's, so an applied schedule still wins over its rows as today), each card trial passes an override map pinning every window
age inside the plan to its bracket (`variantContext(state, variant, { overrides: { rothBracketByAge: <Map of every window age to b>,
withdrawalMixByAge: optimizerState.withdrawalMixByAge } })`), so its rows mean what they say. Its baseline is then the plan's
bracket, not the setting (independent review, item 1): the plan's row is the dashboard's run, so `pickFlatBracket` gets
`plan.bracket` as the current bracket (a tie keeps it), that row is labelled "(cliff plan)" and the setting's "(your setting)",
and the summary words the suggestion against the cliff plan ("The cliff plan already uses the 24% bracket (not your 22%
setting), ..." when it is the pick, else "fill to the X% bracket instead of the cliff plan's 24%"). The per-year card's
gain is measured against `selected` too, so it names "the cliff plan's flat 24%" (item 2). With the plan on the setting
(`bracket === bracketFrom`) both cards are worded as before. The optimizer's trials keep their
own maps (their unmapped ages follow the plan's bracket, as the "current plan" they are compared against does).

`homeDrawAge`: the first age whose withdrawals took more than $1 from home equity in the kept pass of that year (the year's sum of
`takeHomeEquity`'s returns, `wd.homeDrawn`, against the same threshold as `wd.need > 1` for depletion, so float leftovers never
count), `null` if never; `wd.homeDrawn` is a new field of `newWithdrawal` (`src/us/core/withdrawals/draws.js`); recorded by the year loop as a scalar in `scalarSnapshot` (it is mutated in the year body and
must rewind with the passes), returned non-enumerable on the run (`sim.homeDrawAge`, as `cliffIntents` is), so no row and no
snapshot field changes.

`apply` and `choose` read the plan's bracket the same way, so `apply(choose)` still reproduces `choose` (pinned in A5).

## A5. Acceptance

1. **Snapshots** (decision 5's split gate): `node tests/snapshot.js` before and after; every mover has conversions on and the
   guard on. Standard scenarios with shift 0 never deplete, or first draw on home equity, earlier: by
   construction (A3), asserted; otherwise stop for the owner. The shifted standard scenarios (`shift±1`, `shift±3`,
   `tests/snapshot_scenarios.js`) apply the shift-0 plan to other retirement ages, so they are not covered by construction:
   classified like historical movers (decision 15): a bridge drain stops, market variance is recorded. Historical movers: a before / after table, each that depletes earlier classified from
   the rows: **bridge drain** when, under the kept plan on that path, a year before the youngest relevant partner's 59.5 has
   `earlyPenalty > 0`, an earlier year converts more than the user's-bracket plan converts at that age on the same path
   (`conversionAmount`), and the user's-bracket plan on that path has no `earlyPenalty` before 59.5: stop and bring it to the owner;
   otherwise **market variance**: recorded (path, ages, first differing year). A script applies this test to two snapshot dumps.
   The five scenarios the first attempt broke are listed with before / after ages whether or not they move.
2. **Rows of non-converting plans byte-identical** (conversions off, the guard off, `bracketSearchOff`), and
   `tests/plan_off_anchor.js` identical. The plan object gains `bracket` and `bracketFrom` for every plan: tests that deep-compare
   the plan (`tests/cliff_plan.js`) are updated for the shape only.
3. **The guard script** `tests/bracket_search.js` (in `npm test`): the scan grid's conversions-on, default-order households (384),
   standard projection: the kept plan vs `bracketSearchOff`: never earlier depletion, never earlier first home draw; exit 1
   otherwise; prints its seconds (target under 60 s; over it, the owner decides).
4. **The gap table** (`node tests/solver_gap.js --objective endValue`, lengths 75 and default): a column for the kept plan (its
   bracket, value, cost, depletion) and the flat-bracket table at both lengths; the check "kept value at least the best flat
   bracket's (among those whose depletion and first home draw equal the kept plan's) less the threshold" printed per case.
5. **The scan** (`tests/solver_scan.js`): the bracket search on vs off, and guard on vs off with it on; a first-home-draw-age column
   beside depletion, an earlier one counted like an earlier depletion (exit 1 on the standard projection).
6. **Engine and planning tests** (Vitest): the plan's bracket honoured only with `bracketFrom` equal; the override map and the
   applied schedule win; `apply(choose)` with a non-user bracket reproduces `choose`; `homeDrawAge` (a household that draws on the
   house at a known age, and one that never does: `null`); `bracketCandidateBetter`'s every branch, including the threshold edge
   (`0.001 * |value|` exactly: not a win; one cent more: a win) and the $1 floor at a value near 0; the search's order and its
   report; skipped for RI, PA, an applied schedule, conversions off, the guard off.
7. **UI** (Playwright, root script; and `npm run test:ui` passes: a root script that types and then reads rows may need
   `__test_flushRender()` now that rows can change in the deferred pass): typing in a field leaves the user's-bracket plan on screen; after `change` the rows and the
   summary update once; the summary names the kept bracket ("Conversions: the cliff plan uses the 24% bracket, not your 22%,
   within your conversion ages" or "Conversions: your 22% bracket (no other flat bracket does better)"; no clause while the search
   is pending, and the clause is added even when the guard has no intents, so the early "no steering helps this plan" return no
   longer ends the line); toggling conversions
   off changes `window.fireProjectionRows`; the flat-bracket card's row for the user's bracket shows that bracket's own run; at
   390x844 no horizontal scroll.

## A6. Performance

- The light render pays nothing new (today's plan). The deferred pass and a full `render()` pay the search once per input
  change: gate 150 ms median on the slowest gap household with conversions on (a scratch Playwright timing of the full refresh);
  over it, stop and report.
- `tests/bench_runs_interleaved.js` +5% and `tests/bench_solver.js` +30% against `b544934`, plus a converting scenario in
  `bench_solver.js` (the ACA early retiree, conversions to 74 at 22%), gated +30% against the same scenario on a built `b544934`
  tree.
- `planForState` (comparison, overlay, load / undo / reset) plans with the search when it plans an uncached state.

## A7. The deferred pass (decision 8)

- `searched` means "this key needs no more planning": set by a full refresh, and also by a light refresh when the search does not
  apply (A2), so a plan that does not convert is planned once per change and never leaves `searchPending` set.
- `refreshCliffPlan({ light })`: the light render (`render({ light: true })`) computes or keeps the user's-bracket plan (today's
  `computeCliffPlan` with the search skipped) and, when the search applies and has not run for this key, records `searchPending`;
  the store then holds that plan as `cliffPlanStore.plan`. A full refresh (a full `render()`, the deferred pass, the test hooks'
  `ensureTestPlan`, `planForState`) runs the search and stores the kept plan; the key (state JSON, tax year, override maps) is
  unchanged, plus whether the stored plan is searched.
- No unsearched plan is served where a full one is owed: `planForState`'s identity branch (the live state object the store planned
  for, same tax year) serves the stored plan whether or not it is searched (the light render's own `simulate()` reaches it, and
  decision 8 shows the user's-bracket plan while typing); its JSON-match branch serves the stored plan when it is searched or its
  search is pending (a normalized copy of the live state, as the scenario comparison's current row and overlay project on a light
  render, gets the user's-bracket plan the dashboard shows and runs no search on a keystroke; the deferred pass redraws them through
  `renderBody` when the kept plan differs), and caches a computed, searched stored plan it serves; `cliffPlanCache` serves only
  searched plans; else it plans in full; `ensureTestPlan` re-plans when the key, the year or `!searched` says so;
  `__test_setCliffPlan` marks its hand-set plan `searched` (final); `__test_setBracketSearch` clears `cliffPlanStore.key`,
  `cliffPlanStore.forState` and `cliffPlanCache`.
- `scheduleRender()` sets the deferred timer when a search is pending even if no panel is stale (today it sets it only with stale
  panels), so the search always runs after `change` or the idle pause. The shared scheduler reads "pending" through a core seam
  (`#country/core/seam-searchPending`: a one-line facade in each country; the US re-exports `searchPending()` from `planning.js`,
  Canada a `searchPending()` returning false from its `store-context.js`).
- `render()`'s body after the plan is factored into `renderBody(selected, { light })` (everything from the first `simulate()`:
  the tiles, `simulate(110, 110)`, the chart, the table, the plan headline, the shortfall banner, the unusual assumptions,
  `window.fireProjection` / `fireProjectionRows`, the scenario comparison, the status bar). `renderDeferred()` first runs the full
  refresh; if the kept plan's JSON differs from the one on screen, it calls `renderBody` with the new plan, then the deferred
  panels, as today. CLAUDE.md's render invariant gains: rows can change in the deferred pass, so a test that dispatches `input` and
  reads rows calls `__test_flushRender()` first.
- The search's cost does not land on keystrokes; the rows can change once after release.

## A8. Code sites (at `b544934`)

`src/us/core/projection/run-projection.js` (`computeCliffPlan`; the year loop's home-draw scalar), `src/us/core/withdrawals/
roth-conversion.js` (`solveRothConversion`'s resolution order), `src/us/core/withdrawals/strategies.js` (where `takeHomeEquity`
is called, to flag the year), `src/us/core/cliff-plan/planning.js` (`refreshCliffPlan`, `planForState`, `cliffPlanSummary`'s
conversion clause), `src/us/core/cliff-plan-store.js` (`searched`, `searchPending`), `src/shared/core/projection/run-context.js`
(`NO_TEST`), `src/us/core/test-hooks.js`, `src/shared/ui/results/render-scheduler.js` and `src/us/ui/results/render.js` (the
deferred pass), `src/us/ui/results/roth-optimizer.js` (the card's pinning map), `src/us/ui/install-test-hooks.js`
(`__test_setBracketSearch`), `src/us/index.html` (the bracket tip, badge V138), `README.md`, `docs/architecture/cliff-plan.md`,
`docs/architecture/inputs-and-ui.md` (the deferred pass), `docs/architecture/engine.md` (`homeDrawAge`),
`docs/architecture/test-inventory.md`, CLAUDE.md (the render invariant line), `src/shared/ui/results/decision-questions.js` (its
conversion label names the plan's bracket when it differs).

## A9. Builder's calls (3a)

1. A candidate is that bracket's own best cliff plan (today's selection run per bracket), not one shared guard plan.
2. Ranking adds "first home-equity draw not earlier" (the review's point that `depletedAge` only bites once the house is gone).
3. The threshold `Math.max(1, 0.001 * Math.abs(best.value))`.
4. An applied schedule skips the search; the optimizer's override maps do not.
5. The flat-bracket card pins its trials with an override map.
6. `homeDrawAge` non-enumerable on the run, so snapshots do not move for it.
7. The guard script compares against `bracketSearchOff` on the standard projection only.
8. The report keeps today's fields for the kept bracket and adds `brackets[]`, `keptBracket`, `searched`.
9. The card pins its trials only when the plan's bracket differs from the user's.
10. The search ships switched off (`testBracketSearchOff` defaults to true) until the commit that reviews and updates the snapshots,
    bumps the badge and updates the README, which switches it on (the plan's Task 7), so `npm test` passes at every commit.
11. Known display gap, not changed in 3a: `optimizeMultiLever`'s flat-Roth start (`multi-lever.js`) is described as "the current
    plan" though the plan may use another bracket; step 5 retires it.

# Part B: step 3b, per-year sizing behind an outer search over `m` (built only on the owner's word after 3a)

Part B keeps the per-year design approved on 2026-10-24 (decisions 2-6, 12, 13). Its section numbers (4-13) and rule numbers
(9.1-9.9) refer to Part B's own sections. Before 3b is planned, these revisions from the outside review are folded in (each
verified against the code at that time, or recorded as a deliberate choice):

- **R1 (decision 12):** a stay-under after a sized phase gets "the sized conversion, capped at the line" as one more candidate.
- **R2 (decision 13):** the year-0 stand-in is frozen at the bracket phase's value during the choice (replaces 5.3's per-candidate
  write); the engine question goes to the backlog.
- **R3, the bridge need (5.4) is overstated and blocks the Roth ladder:** it is built from `flowOwn`, which already includes this
  year's bracket-conversion tax and the premium it raises, and repeats that for every year to 59.5; it credits nothing for this
  year's conversion becoming penalty-free after five years, so under 54.5 it blocks the ladder; and with wages in the year the
  need is 0, so the check never acts. Fix all three, or record each as a deliberate choice.
- **R4, the cost functions' arguments:** say whether the choice prices at the pass's estimates (the default arguments of `costAt`
  / `irmaaAt`) or the natural record's realized pairs (5.1); they differ after a forced pass. Pass them positionally; note that
  `costAt(trad, gain, sa, sb, ia, ib)` and `irmaaAt(trad, gain, ia, ib, sa, sb)` order their pairs differently.
- **R5, convergence in sized years:** the draw-aware bracket top adds a feedback loop; count forced and unresolved passes, sized vs
  bracket, with a stop rule in the measurement task.
- **R6, the live mix's MAGI room:** 5.2 pins it because a room of 0 makes `pickLiveWithdrawalOrder`'s `overage * 1e6` term almost
  always pick taxable first (`mix.js`); the 3C notes call it dead wiring only while the room stays positive. Settle it with a probe
  as the 3b plan's first task, before builder call 14.
- **R7, the bridge-drain remedy:** if built, its check in `apply` gets its own "apply reproduces choose" test.
- **R8, test fixes:** the draw-aware bracket test can be exact (with `maxAvailable` 65,536 and a filer under 65 the bisection ends
  on a representable value; verify); `solveRothConversionTo` is not exported (test through `solveRothConversion`); the
  historical-target test pins which branch happens (the target or the fallback), never "either"; Task 1 pins `rate` with a literal
  for one household; the survivor-fallback test uses a target that really disappears (a `ret: 'B'` line after a death, or `aca400`
  once on Medicare: `irmaa2` exists on the single tiers).
- **R9, home equity:** the scan's first-home-draw column and ranking rule of 3a apply to 3b's candidates too.
- **R10, smaller:** `cliffPlanSummary`'s `lineName` has no names for `senior` and `ctc`; a crossed floor falls back to `none`, not
  the bracket conversion (amends decision 6 for floors); the summary says "within your conversion ages"; the draw-aware bracket top
  counts `estGain` in the income that decides how much Social Security is taxed; in two-return years the two MAGIs passed to
  `magiThresholds` shift together (state it); `convSizingOff` in `NO_TEST` changes the Canada build's bytes (not "Canada
  untouched" literally).
- **R11:** decision 9's relative threshold replaces the $1 rule in section 7.3's ranking of `m` candidates.
- **R12:** the 3b search also runs in the deferred pass (decision 8), with 3a's six bracket plans among its candidates; B5.2's
  "bracket target" is the bracket the plan carries (3a's kept bracket, `plan.bracket`), not the raw `rothConvBracket`.
- **R13, overtaken by 3a:** B9.4's "TX and NY: 12%" (TX's best flat bracket on the end value is 10%); B6's "keys unchanged" (3a adds
  `searched`); B10's "moving the search to `renderDeferred`" option (now the design, decision 8); the 0.1% threshold and the
  home-equity rule of A3 replace B7.3's ranking; 3b's targets are measured against 3a's kept plan, not the raw bracket run.

## B0. Revision after steps 4a-5b (2026-10-27, against main `cf22985`)

Part B was written at `b544934`. Since then: 3a (the bracket search), 4a (one plan shape, `plan.mult`, the stored plan,
Optimize), 4b (the gains-capped stay-under), 4c (the order lever; the live mix is gone), 4d (the two-return split, per-return
lines, `planMet`), 5a (the yardstick, the `rothAmountByAge` seam) and 5b (the maintained bond reserve, reserve dollars converted
into `bondRoth`). Each item below says what it changes in B4-B13. Where B0 and B4-B13 disagree, B0 wins. R1-R13 above still
apply unless an item here retires them.

### B0.1 Why reopen, and the gate before any code

The 2026-10-25 skip rested on a run that searched a per-year *bracket* (`solver_gap.js --levers roth`: at most 0.60%). 5a's
reference A searches the per-year *amount* (uncapped) together with the per-year withdrawal mix and smoothing. On main
(`--hold-bonds`, endValue, real) its gap is 1.63-4.84% at 75 and 0.86-3.83% at 100. Reference C (the plan's current vocabulary)
adds at most 0.94%. So A's gap is the conversion amount **plus** the mix. 5a's notes say A sets 4-13 amounts and 7-38 mix ages,
but do not split the gain between them. Piece 3 can recover only the conversion part.

**Task 0 (measurement only; no `src/` change):** `tests/yardstick.mjs` gains `--levers conv`. Reference A then searches only
the conversion amount per age; the mix and smoothing are held at the pinned plan's. Run it at both lengths, free and
`--hold-bonds`, beside the existing three-lever run. Also print, per case, the ages where A's amount differs from the automatic
plan's, and each such year's MAGI against its nearest line and bracket top. That shows which target kinds (B5.2) the
reference's amounts sit at.

**Stop rule:** the owner sees Task 0 before Task 1. If the conversion-only gap is under about 0.5% in every case at both lengths
(the 3b skip's own threshold), piece 3 stops and the room is booked to the mix (step 5). If the reference's amounts mostly sit
away from every B5.2 target (neither a bracket top nor within $1k of a line), the target vocabulary is the wrong shape. That
also goes back to the owner before code.

### B0.2 What the sizing searches (amends B5.2)

Per conversion year, the candidates are unchanged in kind: `none`; the six bracket tops, counting the estimated discretionary
draw; just under each ceiling line and just over each floor in the sizing reach; and the bracket target. Changes:
- **The bracket target is `plan.bracket`** (3a's kept bracket; R12), resolved by today's `solveRothConversion` with today's
  ceiling. The bracket phase is then the 3a plan's year byte for byte.
- **Per-return lines (4d).** In a two-return year a line target carries `ret` `'A'` / `'B'` and its line's `own` (the line in
  that return's own MAGI). It sizes to that return: `c = (own - 1 - preMagiX) / shareX` under, `+ 1` over, where `shareX` is the
  conversion's share on that return. It is "met" by `planMet` on the return, as an intent is. Household lines (`ret` `'H'`) keep
  B5.2's formula.
- **The 5b reserve.** The convertible balance is still `traditionalBeforeRmd - rmd - seppLocked`. Reserve traditional dollars
  convert into `bondRoth` (`applyRothConversion`), so a sized conversion does not move the reserve into stocks. No new cap.
- **Retired: B5.2's last paragraph (the pinned `remainingMagiRoom`) and R6.** `pickLiveWithdrawalOrder` was removed in 4c, so
  there is nothing to pin. In a sized year the withdrawal's MAGI cap reads `magiSafeRoom` as today.
- **Exempt ages (amends B4):** an age in `ctx.overrides.rothAmountByAge` (the yardstick's seam), in `rothBracketByAge`, or in
  `appliedRothSchedule` is not sized.

### B0.3 How it ranks (amends B5.1, B5.3, B7)

- **In the year (unchanged in substance):** B5.3's score, `((c * lambdaConv - dTax) - dPremium) - dIrmaa`, at the converged
  bracket phase's realized draws (R4: the natural record's realized pairs, passed positionally). Ties go to the smaller amount.
  A larger candidate must win by more than $1.
- **One multiplier, `plan.mult` (replaces B4's and B6's `m` and B7's `M_GRID`).** Since 4a, `plan.mult` (`[m1, m2, m3]` by
  phase, `null` = ones) scales the year's lambda in `choose`. `lambdaConv` is the same scaled rate: `min(LAMBDA_MAX, max(0,
  mult x rateHat))`. The plan gains no `m` field. This revises decision 4 for Optimize only: there, one multiplier per phase moves
  both the guard's lambda and the conversion's. The automatic plan stays at ones, so decision 4 holds for it as written.
- **The automatic plan sizes at `mult` = ones only.** B7's nine-point grid is dropped from the render path. Optimize's existing
  search over `MULT_GRID` per phase (`plan-search.js`) is the outer search: it already runs `computeCliffPlan(ctx, { mult })`,
  so each of its trials plans with sizing at that multiplier, with no new search code. Reason: cost (B0.6). B7's grid on top of
  six brackets and two lever tracks would be about 9 sized `choose` runs per bracket. Owner fallback: if Task 6 shows Optimize
  recovering much more than the automatic plan, add `[0.75, 1, 1.25]` at the kept bracket only.
- **Where it sits in `computeCliffPlan` (replaces B7.1-B7.4): a sized track after the bracket search.** After the whole
  automatic selection (3a's bracket rank, 4c's stages, 4d's order-only floor), and before the stored-plan guard, when sizing
  applies (B0.4):
  1. at the kept bracket and with the kept track's levers, one `choose` run with sizing on (`plan.conv` = `{}`, the sentinel,
     B0.4), then its ACA-only / IRMAA-only subsets through `apply` when its guard intents span both families, each holding its
     `conv`, orders and splits;
  2. the sized candidate stands only by `bracketCandidateBetter` against the unsized kept plan (R11: no earlier depletion or
     first home draw; then later on either; else a value higher by more than `max(1, 0.001 x |value|)`). Otherwise the plan and
     report are the unsized ones, byte for byte.
  So the automatic plan never depletes or first draws on the house earlier than the 3a/4d plan, by construction. A sized winner
  adds `report.sized` (`{ candidates, kept, convIntents }`, a count per target kind), and `report.brackets` is untouched.
- **Interplay with the order and split stages (new).** Both stages need `conversionAmount === 0`. In a sized year the choice
  runs on the converged bracket phase, before the order stage. If the winner is `none`, the order and split stages may start from
  the sized record, which is then that year's natural record. If the winner converts, they do not run, as in any converting year
  today. The guard's trials follow the sized record (B5.1 step 4).

### B0.4 The plan, `apply` and the stored plan (amends B6)

- `PLAN_KEYS` gains `conv`, after `orderPhases`, default `null`. In `choose`, `{}` means "size and record". In `apply`, it is
  the map `age -> target` with B5.5's vocabulary; `null` means no sizing (today). `makePlan` keeps one hidden class.
- **The stored plan:** `isValidStoredPlan` requires `PLAN_KEYS` exactly, so every saved v1 plan would be dropped on load.
  `normalizeState` migrates a v1 stored plan by inserting `conv: null` in key order (keeping `v: 1`). The guard validates
  `conv`: `null`, or an object whose keys are integer ages and whose values are `'none'`, `'b10'`..`'b35'`, or `{ id, ret,
  side }` with `id` in `PLAN_LINE_IDS`, `ret` in `PLAN_RETS`, `side` in `'under' | 'over'`. A legacy-state Vitest case covers it.
- Optimize's result and Apply carry `conv` unchanged. `storedPlanVerdict` is unchanged.
- B6's resolution rule (decision 6, R10's floor amendment) and "apply reproduces choose" are unchanged.

### B0.5 Canada: the RRSP meltdown (not built in piece 3)

Canada has no cliff plan, no `choose` / `apply` and no objective registry. `solveMeltdown` fills gross income to
`meltdownBracket`'s federal ceiling every year of the window. The equivalent of piece 3 is per-year meltdown targets. Batch 4B's
candidate set already names them: the federal bracket ceilings, the OAS recovery threshold, the top of the age-amount range,
the GIS cutoff, the CCB bands, and 0. They would be priced by Canada's net `taxFor` (tax less income-tested benefits). That
needs 4A's shared per-year solver first. Piece 3 changes no Canada behaviour. Only the shared `NO_TEST` field
(`convSizingOff`) moves Canada's build bytes (R10). To keep 4A's port small, the target resolver works on a lines list it is
given (`{ magi, own, id, ret }`) and a bracket-top function. Nothing in it is US-only beyond those two inputs. No Canada
measurement is run in piece 3. A Canada yardstick belongs to 4B.

### B0.6 Expected run time (amends B10)

Measured on main in Task 0 before any code (the 2026-10-24 figures predate 4c-5b): planning time per input change on the
gap households and the default with conversions on (scratch Playwright, median of 9), Optimize's wall time
(`__test_planOptimizerCard().ms`), and the per-year card's two windows in `test_optimizer_ui.js`.

Estimate, to be replaced by the measurement. A plain run is 1.5-2.9 ms since 5b (the stress household needs a second MAGI pass
most years). A `choose` run is 30-50% more. The sized `choose` adds, per conversion year, about 15 candidates x (`taxFor` +
`costAt` + `irmaaAt`), priced once at the bracket phase's end. It also adds one more converged phase in each year whose winner
is not the bracket target. Together that is roughly one to two plain runs per sized `choose`. With up to two subset `apply`
runs, the sized track adds about 2-4 run-equivalents per planning: about 5-15 ms on the gap households, in the deferred pass
only (decision 8; the light render pays nothing). Optimize runs about 14 plannings, so +15-30% of its wall time.

The per-year Roth optimizer pays nothing new. Its trials map every window age through `rothBracketByAge`, which exempts them
(B0.2). That keeps the two 10 s limits of `test_optimizer_ui.js` unaffected; the script is re-run to confirm.

Gates (proposed; over a gate, the owner decides):
- The sized track at most +50% on the full planning's median for the slowest gap household.
- Optimize at most +40% on the gap households.
- `bench_runs_interleaved.js` +5% and `bench_solver.js` +30% against a `cf22985` build, with B10's converting scenario (which
  `bench_solver.js` has had since 3a).
- `tests/conversion_sizing.js` under 60 s.

### B0.7 The bridge check (amends B5.4; settles R3)

- **Need:** for each year from next year until the youngest relevant partner's 59.5, that year's 5b `reserveSpend`, in today's
  dollars, less `incomeAt`, which now includes wages until each partner's retirement age. This drops `flowOwn`, so the
  conversion's own tax and premium are not counted once a year (R3's first point), and a year with wages no longer reads 0 (its
  third point).
- **Credit:** this year's conversion counts as accessible from year + 5 (its seasoning) for the years inside the window (R3's
  second point).
- **Accessible money:** read through 3B's penalty statuses and `groupRoom` (`penalty-status.js`, PR #57), not a new sum. The
  reserve's taxable part counts; its traditional part counts only where penalty-free.

### B0.8 How it is measured (amends B9)

1. **Yardstick** (`node tests/yardstick.mjs --jobs 4`, free and `--hold-bonds`, both lengths, and Task 0's `--levers conv`):
   the gap of the sized automatic plan and of Optimize against the same references as the 5b table. Report the bond share auto
   / sized. Piece 2's question is answered here: if the sized plan's mean bond share is within 0.5 points of the unsized plan's in
   every case, and free and held gaps still agree where they agree today, piece 2 is dropped (owner). Otherwise the cases go to
   the owner.
2. **Fill probe** (`node tests/fill_probe.mjs --mode both`, with the sized plan as the automatic plan): the held wins (5a: 166
   household-modes, 2.0M), before and after. A drop means sized conversions to just under a line took part of the
   reserve-neutral fill room. No fill candidate is built (5a ruling 5).
3. **Snapshot movers** (decision 5's split gate; B9.1): listed with before / after depletion, first home draw and end value
   before any `npm run snapshot:update`. Every mover must have conversions on and the guard on. Standard shift-0 movers never
   deplete or draw on the house earlier (by construction, asserted). Shifted and historical movers are classified (bridge drain
   stops; market variance recorded). The five first-attempt scenarios are listed by their current names.
4. **The scan and the guard script:** B9.3 and B9's `tests/conversion_sizing.js`, sized vs `convSizingOff`, with 3a's
   first-home-draw column. `tests/bracket_search.js` still passes (the sized track runs after it).
5. **Unit tests:** B9.5-B9.9 as written. New: a per-return line target (two-return year) met by `planMet`. A `none` winner
   followed by a kept order phase (the record the order stage seeds from). The stored-plan migration and `conv` guard.
   `apply(choose)` with orders, splits and `conv` together.
6. `solver_gap.js` is not re-run for piece 3: the yardstick replaced it as the gap reference (5a).

### B0.9 Smaller corrections to B4-B13

- B8: the badge is V146 -> V147 (US). The summary clause follows 3a's conversion clause and 4c's runs-of-ages wording.
- B11 / B12: code sites are at `cf22985`. The phase machinery is in `run-projection.js`'s phased block (`naturalRec`,
  `orderNat`, `splitNat`, `trialRecs`). `lambdaEstimate` already takes `mult` and returns `lambda`; it gains `rate` (unscaled).
- B12.4 (the `m` grid) is retired by B0.3. B12.14 (the pinned room) is retired by B0.2.
- Known display gap, as A9.11: the per-year card's flat start pins every window age, so it cannot reproduce a sized plan. Its
  guardrail still compares to `selected`, the sized plan. Step 5 retires the card's engine.
- The switch ships off (`testConvSizingOff` defaults to true) until the commit that reviews the snapshot movers, as A9.10 did.

### B0.10 Implementation outline (for the owner's OK; the plan is written after it)

0. Task 0 (B0.1, B0.6): `--levers conv`, the timings on main. **Stop for the owner.**
1. The engine's target resolution and `apply` following `plan.conv`, `PLAN_KEYS.conv`, `ctx.test.convSizingOff`,
   `lambdaEstimate`'s `rate`; resolution-rule unit tests.
2. `choose`: the choice at the bracket phase, the sized phase, the bridge check, the interplay with order, split and trials;
   the one-dollar, bridge and apply-reproduces-choose tests.
3. Planning: the sized track and its keep rule, the report, Optimize through `mult`, the stored-plan migration and guard; the
   summary clause and the `convChoice` tooltip.
4. Guards and measurement: `tests/conversion_sizing.js`, the scan, the yardstick, the fill probe, the benches.
5. The snapshot movers listed for the owner; on the OK, switch on, `snapshot:update`, V147, README and docs.
6. An independent Opus review of the branch.

### B0.11 Revision 2 (2026-10-28): whole-run acceptance, ties to the bracket (amends B0.3, B0.6, B0.8, B0.10)

**Why.** Tasks 1-4 shipped B0's design switched off: commits 5b02037..efdb1e6, notes in `docs/next-batches-plan.md`, "Batch 5
step 5b piece 3: Tasks 1-4". On the 8 yardstick cases the sized track never passes the keep rule. Its plans lose 0.15-18.6%.

The cause is the shape of B5.3's yearly score, confirmed by the Opus readings pass and the Fable review. The fixed lambda makes
the score linear in `c`, so the winner is always an extreme: none, or the top of the highest bracket whose average rate is under
lambda.
- No constant lambda works across the cases. NY at 75 needs 0.30, TX at 75 needs 0.24, and TX and NY at 100 have none.
- Every working lambda is a knife edge: 0.02 past it loses 3-10%.
- A lambda that falls with `c` is too weak.

So a separate sizing lambda is dropped.

The target vocabulary is sound. Accepting the score's proposals on the whole run's own value recovers the room (the Fable
prototypes, `fable-review/`).

Owner, 2026-10-28: c2, plus ties to the bracket. It runs in the deferred automatic planning, with a run budget and a restated
gate.

#### B0.11.1 The year: ties go to the bracket (amends B0.3's tie rule)

The scan's running best starts at the bracket target. The candidates are then scanned by amount ascending, and the running best
is replaced only on `score > best + 1`. So an exact tie with the bracket keeps the bracket, as when every in-bracket amount
scores $0 (TX at 75). The year is then today's year, with no intent and no sized phase (B5.1 step 1). Among the other
candidates, a tie still goes to the smaller amount. The near-tie filter, the early-years bridge check and the reach stay.

#### B0.11.2 The year: the shortlist (new)

Every choice also records the year's **shortlist entry**: the best-scoring offered candidate that is neither `none` nor the
bracket target and that the bridge check did not drop. The year has none when no such candidate exists. It is recorded whether
or not that candidate wins the year.

`choose` returns it non-enumerable, as `sim.cliffConvShortlist` (`{ age: target }`), beside `cliffConvIntents`. The rest of the
sized `choose` run is unchanged: the choice, the sized phase and `cliffConvIntents`. The run is now only the proposal.

#### B0.11.3 The planning: a whole-run greedy pass (replaces B0.3's "sized track" steps 1-2)

The pass runs when the track ran before: `search && sizingApplies(ctx)`, the deferred pass only. It runs after the whole
automatic selection, and before the stored-plan guard.

1. **The proposal:** one `choose` run at the kept bracket, with the kept track's levers and `conv: {}`. This is today's run. If
   its shortlist is empty, the pass ends with `report.sized.kept` false.
2. **The start:** `cur` is the unsized kept best: its intents, family, orders, splits and bracket, with `conv = {}`.
3. **The walk:** go through the shortlist's ages in ascending order, at most `CONV_RUN_BUDGET` = **24** `apply` runs.
   - At each age, `trial` is `cur` with `conv[age] = shortlist[age]` added, run once through `apply`
     (`makePlan({ ...cur, conv: trialConv })`) and measured by `measure`.
   - The trial is accepted, and becomes `cur`, only when all of these hold:
     - it depletes no earlier than `cur`;
     - it first draws on the house no earlier than `cur` (`null` counts as never, for both);
     - and it depletes later, or first draws later, or scores above `cur.score + 1` (`score` is the selection's objective
       score).
   - Otherwise the age is dropped.
   - The guard intents, orders and splits stay `cur`'s throughout. The pass changes only `conv`.
4. **The keep rule:** the final `cur` (with a non-empty `conv`) stands only when `bracketCandidateBetter(cur, best)` holds, as
   in B0.3. Otherwise the plan and report are the unsized ones, byte for byte, apart from `report.sized`. When it stands, it is
   appended to `report.candidates`, `keptIndex` points at it, and the kept bracket's `brackets` entry is refreshed (Fable I-E).
5. **No family subsets.** The guard intents are already the unsized best's, chosen by family before the pass.
6. **The report:** `report.sized` becomes `{ proposed, tried, accepted, budgetHit, kept, convIntents }`.
   - `proposed`: the shortlist's size.
   - `tried`: the `apply` runs.
   - `accepted`: the ages kept.
   - `budgetHit`: `tried` reached 24 with ages left untried.
   - `convIntents`: counts per kind of the kept `conv`, as before.

   `candidates` (the old track's per-family list) is retired.

Why it works: the year's score only proposes a target, and the whole run's own value accepts or drops it. That value includes the
brackets of the RMD years, IRMAA, the end tax and each year's effect on the next. By construction, the pass never depletes or
draws on the house earlier: each acceptance is at least as good as `cur` on both, and the keep rule holds at the end.

`apply(choose)` reproduction is not affected. The kept plan is a `conv` map that `apply` follows, and `choose` with `conv: {}`
is only the proposal.

**Expected, from the Fable c2 prototypes.** Each figure is the change in after-tax end value against the unsized kept plan:

| Case | Life 75 | Life 100 |
|---|---|---|
| TX | +0.58% | +0.18% |
| NY | +1.80% | +2.42% |
| Two-return couple | +0.48% | +2.57% |
| CA | about +0.01%, rejected by the keep rule | about +0.01%, rejected |

6 of 8 runs keep a sized plan, using 14-21 `apply` runs per planning.

#### B0.11.4 Optimize (amends B0.3's "Optimize through `mult`")

Optimize's base planning (`plan(inputs)` in `plan-search.js`) is the automatic planning, so it includes the pass. Its `mult`
trials do not run the pass: `computeCliffPlan` gains an option `sizing` (default true), and the trials pass `false`.

Reasons:
- Each of about 14 trials would pay 14-21 runs, and Optimize's gate is +40%.
- The single-run track that trials ran in Tasks 1-4 never kept a plan on the gap households.

So an Optimize winner from a trial carries `conv: null`. It stands only when it beats the sized base by Optimize's existing
rule. The legacy-plan path is unchanged. Recorded for the owner: Optimize can no longer combine a multiplier with sizing.
Adding the pass to the final winner only (one more planning) is the follow-up if Task R3 shows Optimize losing to that.

#### B0.11.5 The restated gate (amends B0.6)

The light render pays nothing: `search` is false and the pass never runs. Gates, measured in the browser (the Task 0 timings
script with sizing on):
- **Full (deferred) planning:** the median per input change is at most **250 ms** on the slowest gap household, at both
  lengths. Today it is 11-47 ms; the pass adds about 40-150 ms. Above 250 ms, the owner decides: a smaller budget, or the pass
  only on input changes that touch conversions.
- **The light refresh:** at most +5% against `cf22985`.
- **Optimize:** at most +40% on the gap households against `cf22985`. The trials no longer run a track, so this should come in
  under the Task 4 figure of +26%.
- **The benches:** `bench_runs_interleaved.js` +5% and `bench_solver.js` +30% against `cf22985`, as before. Neither runs a
  planning with the pass.
- **`tests/conversion_sizing.js`:** under 60 s. 384 households, each with up to 25 runs more than today. If it goes over, the
  guard runs the pass at budget 8, and the full budget stays in the manual scan.

#### B0.11.6 Fixes from the Fable review (folded in)

- **I-1:** `tests/helpers/engine-node.mjs` reads the shipped default from `src/us/core/test-hooks.js` (`testConvSizingOff`).
  `--sizing` and `--no-sizing` override it, so after Task 5 the Node tools measure the plan the planner ships.
- **I-2:** `tests/conversion_sizing.js` fails when no household carries `report.sized`, or when no household keeps a sized plan.
  `conversion-plan.test.js`'s keep-rule test asserts that at least one gap household keeps one, which under B0.11.3 should hold
  for NY at 75.
- **I-3:** the bracket select's info tip (`src/us/index.html:185`) goes back to its `cf22985` text in Task R1. The new text
  lands in Task 5's switch-on commit, with V147.
- **I-4:** a new Vitest case: TX at 66, `irmaaPriorKnown` false, bracket 10, taxable $100,000, spending $40,000. Year 0 keeps the
  bracket. `rows[0]` of `choose(conv: {})` toStrictEqual `rows[0]` of `choose(conv: null)`.
- **Minors folded in:**
  - M-1: the stored-plan guard rejects `conv: {}`. An empty map is null, as for `orders` and `splits`.
  - M-6: the apply==choose test also compares `depletedAge` and `homeDrawAge`.
  - M-4: `sizingApplies` is computed once.
  - The other minors stay in the ledger for the final review.

#### B0.11.7 Measurement and acceptance (amends B0.8)

- **The yardstick:** with `--sizing`, free and `--hold-bonds`, at both lengths. Expected: the B0.11.3 figures, with at least 5 of
  8 runs keeping a sized plan. Report the bond share, auto against sized.
  - **Piece 2 is dropped** (owner, 2026-10-28, after the cloud Fable review): the only planner-exploitable bond-share fall (RMDs
    and SEPP drawing `bondTraditional` in surplus years) was closed by the reserve refill fix (PR #59); the remaining share falls
    are not reserve shortfalls; NY @100's free / held divergence is the reference search's.
  - Beside the bond share, the yardstick reports the **reserve-to-target ratio after the ladder build**: per case and plan (auto,
    sized, the references), its minimum over the years after `ladder.rotationEndYear` (until depletion or the end) and the count
    of those years below 0.95. Reported, not gated; no keep fence (owner).
  - Task 0's conversion-only room is a lower bound, not a ceiling: c2 exceeds it at NY and the two-return couple at life 100.
- **The fill probe:** run before and after, as in B0.8.
- **The scan:** run before and after, as in B0.8.
- **`tests/conversion_sizing.js`:** under B0.11.5's gate, non-vacuous (I-2).
- **New unit tests:**
  - the pass keeps an age only when the measured value rises (a hand-built shortlist of two ages, one that helps and one that
    hurts);
  - the budget stops the walk (budget 1 at the test seam);
  - the shortlist excludes `none`, the bracket target and dropped candidates;
  - the ties-to-bracket case (TX at 75: every in-bracket candidate scores $0, the year keeps the bracket, and no intent is
    recorded).

#### B0.11.8 Implementation outline (replaces B0.10's Tasks 5-6; Tasks 0-4 are done)

- **R1, fixes:** I-1 to I-4, M-1, M-4, M-6, and ties to the bracket (B0.11.1). Snapshots stay byte-identical, since the switch
  is still off.
- **R2, the shortlist and the pass:**
  - the shortlist in the choice (B0.11.2);
  - the greedy pass and its report in `computeCliffPlan` (B0.11.3);
  - the `sizing` option and Optimize's trials (B0.11.4);
  - the B0.11.7 unit tests;
  - the not-kept and kept summary clauses, unchanged.
- **R3, re-measure:** B0.11.5's gates and B0.11.7's measurements, plus the notes. **Stop for the owner** with the figures.
- **R4 (was Task 5):** list the snapshot movers and stop for the owner. On the owner's OK: switch on (`testConvSizingOff` false,
  and the engine-node default follows it, I-1), `snapshot:update`, V147, the tip, README and docs.
- **R5 (was Task 6):** an independent Opus review of the branch.

#### B0.11.9 The toggle's guarantee after sizing (owner, 2026-10-28; amends B0.11.3 and B0.11.5)

**The break.** R4's movers run turned sizing on, and `tests/unit/us/order-lever.test.js` A2 then failed: "toggle on is never
earlier than toggle off on either age, nor lower by more than $1 at equal ages". `leverPlanStands` and the order-only floor
compare unsized plans. The sizing pass then runs only from the kept base, and that base's orders and splits change which ages the
walk can accept: an order's value depends on the conversions.

Six of the 768 grid households fail, all at equal ages:
- TX at 100: −$887. Its orders at 75-81 gain $909 unsized and lose $887 once 64-69 convert.
- MFJ 52, Rule of 55 on and off: −$39,110 each.
- Single 58, Rule of 55: −$9,237.
- HoH 52, Rule of 55 on and off: −$42,061 each (0.6%).

Diagnosis: `.superpowers/sdd/.../a2-diag/report.md` (git-ignored), summarised in the notes.

**The rule.** The guarantee is restored after sizing.

1. **`sizePass(bracket, base, levers)`:** the B0.11.3 pass, steps 1-6, as one helper inside `computeCliffPlan`.
   - Its inputs are the kept bracket, the kept selection's best measure (the start `cur`), and the levers for the proposal run.
   - It returns the pass's final measure and its report: `{ proposed, tried, accepted, budgetHit, kept, convIntents }` against
     that base.
   - The keep rule (`bracketCandidateBetter` against the base) is unchanged.
2. **Toggle on, kept plan with no orders and no splits:** the proposal runs with `levers: null`. The one pass is then exactly
   toggle off's own pass from the same base, so no second pass and no re-check are needed.
3. **Toggle on, kept plan with orders or splits:**
   - `sizePass` runs on toggle on's kept base (proposal with `keptLev`). It also runs on toggle off's kept selection (the
     stage-0 bracket and best, `sel0.best0` and `b0` in `automatic`; proposal with `levers: null`).
   - The sized toggle-on plan stands only when `leverPlanStands(sizedOn, sizedOff)` holds. Otherwise the plan and report are
     toggle off's sized plan, with `levers` still the caller's, as today's A2 revert.
   - When toggle off's sized plan is used, its bracket and `brackets` entry are toggle off's (the A2 revert's existing path).
4. **The order-only floor (4d, both levers and a recorded split):** the same check, if it is needed. The joint track's sized plan
   stands against the order-only track's sized plan only by `planCandidateBetter`, as today's unsized rule.
   - R5's builder measures whether the floor can fail after sizing on the 768 grid households.
   - If it can, both tracks are sized and compared after sizing (one more pass, only when a split was recorded). If it cannot,
     the floor stays unsized, and the measurement is recorded in the notes.
5. **`report.sized`** is the kept plan's pass report. A toggle-on planning that ran both passes adds
   `report.sized.offPass = { proposed, tried, accepted, kept }` (test and diagnosis only).

**Amended (2026-10-28, controller ruling during the build, for the owner):** the second pass runs whenever the kept toggle-on best is not toggle off's own selection, the same measure object as `sel0.best0`. The trigger is not "the plan holds orders or splits". Steps 2 and 3 above are read with that trigger.
- Why: the HoH 52 pair keeps a toggle-on plan with no orders and no splits but 16 guard intents from the lever run (toggle off: 4), and it failed A2 by $42,061 under the narrower trigger. A ranking that moves the kept bracket to another bracket's stage-0 best is also caught.
- A best equal to toggle off's by value but not by identity only costs an unneeded pass. The tie falls back to toggle off's plan, of the same value.
- Measured: the second pass runs on 109 of 768 grid households and falls back on 18. A2 holds with sizing on for all 768.
- Timings: TX at 100 with the toggle on, 240 ms (gate 350); with the toggle off, 120 ms (gate 250).
- The order-only floor stays unsized: 0 failures after sizing on the 50 households that run both tracks.

**Why.** This is A2's contract stated after sizing: toggle on never depletes or first draws on the house earlier than toggle off,
and is never lower by more than $1 at equal ages. The sized toggle-off plan is the reference, because it is the plan the user
would get with the toggle off. In the prototype, A2 passes on all 768 grid households, and only the six failing plans change.

**The gate (amends B0.11.5).** Full (deferred) planning, median per input change, on the slowest gap household at both lengths:
- **250 ms with the toggle off** (unchanged);
- **350 ms with the toggle on.**

The second pass runs only when the kept toggle-on plan holds orders or splits: 248 of 768 grid households today. TX at 100, toggle
on: about 215 → about 290 ms in the browser (Node 273 → 371 ms; Node runs about 1.28× the browser). The light refresh, Optimize
(+40%), the benches and `tests/conversion_sizing.js` (< 60 s) keep their gates.

Optimize:
- Its base planning is the automatic planning, so it gets the check. Optimize's default levers are `PLAN_LEVERS`.
- Its mult trials still run no sizing (B0.11.4), so they are unchanged.
- The Optimize gate (+40% vs `cf22985`) is re-measured.

**Acceptance.**
- `order-lever.test.js` A2 passes with sizing on.
- A new Vitest case pins the TX at 100 failure.
  - Before the fix: the sized toggle-on plan with orders is $887 below the sized toggle-off plan.
  - After: the plan is toggle off's sized plan (no orders), toggle on's value equals toggle off's, and `report.sized.offPass`
    is present.
  - Its expectations are comparisons of two runs in one process.
- A scratch or `tests/` sweep confirms A2 on all 768 grid households (reported, as in the diagnosis).
- With sizing off, everything stays byte-identical.
- Then the R4 movers are re-listed.

#### B0.11.10 The forced pick in a sized year (owner, 2026-10-29)

**The defect.** Found while explaining the R4 movers. A sized bracket-top year resolves its conversion as the fill less the
pass's `estTrad`, and the conversion's tax raises the draw. So the estimate moves against the realized draw (a slope of about
-0.27), and the year can fail to converge within `MAGI_ITER_MAX`. The forced pass then replays the logged pass that overpaid the
least. With no premium line in play, every logged pass ties at an overpay of 0, and the strict `<` keeps pass 0. Pass 0 is the
seed pass, with `estTrad = prevDiscTraditional`.

On `std R everything` at Partner A's age 60 the seed is 0, so the forced pass converts 271,467 against 87,265 converged. That
lands in the 24% bracket (in the 32% on its `mc1` path). The proposal run carried that amount into the greedy pass's shortlist.

On the grid it is rare: 2 of 225 sized bracket-top years are forced, and neither overshoots by more than $1.

**The rule.** The forced pick is in the MAGI iteration's forced-pass block, `run-projection.js` `for (const p of passLog)`.
- In a sized year (`convTarget !== null`), a tie on the overpay goes to the logged pass with the smallest drift
  (`|realized - estimate|`, as `passLog` records it).
- The picked pass still overpaid the least, and the forced pass still replays its logged estimates exactly.
- Unsized years keep today's pick, byte for byte.

**Why.** The drift measures how consistent a pass is. The seed pass is the least consistent in an oscillating sized year, so the
rule picks the pass nearest the fixed point. `apply` resolves the same target from the same seeds pass for pass, so it makes the
same pick, and `apply(choose)` still reproduces `choose`.

**Measured** (a prototype in a patched copy; the overshoot folder in the piece 3 workspace):
- Sizing-off runs are identical on 384 of 384 households.
- `apply == choose` holds on 120 of 120 sized runs.
- The rule adds no extra passes.
- `std R everything` still depletes at 92, against 91 unsized. Its conversion at 60 drops from 271,467 to 87,265, and its tax
  at 60 from 92.3k to 43.8k.
- The three historical paths that deplete a year earlier (`real1966`, `real1973`, `mc1`) are unchanged. So they are market
  variance, not this defect.
- Gap gains: NY at 75 goes from +1.80% to +1.98%, and the two-return couple at 75 from +0.48% to +0.60%. The others are
  unchanged.
- The guard still keeps 98 of 384 households, with 0 failures.

**Recorded follow-up, not piece 3.** The same tie-to-pass-0 pick happens in unsized forced conversion years. In 11 of 60 such
years the kept estimate is more than $1k from the realized draw (grid #101 at 56: 0 against 138,915), and the MAGI-ceiling room
is then sized on a stale estimate. It is not yet known whether those years are real premium steps, where the pick is
deliberate, or plain ties.

## B4. Where sizing is on

Sizing runs in a year when all hold: the run is `choose` with a sizing multiplier (the context's `plan` carries it as
`{ intents: {}, conv: {}, m }`; a `choose` run with `plan` null, as today, does not size) or `apply` with a conversion intent
for that age, `convertsThisYear` (enabled and inside the window), the test switch is not set (`ctx.test.convSizingOff`,
section 7), and no explicit per-age schedule governs the year
(`ctx.overrides.rothBracketByAge` has no entry for the age and `inputs.appliedRothSchedule` has none either: an explicit
schedule is the user's or the optimizer's choice and wins; builder's call recorded, section 12). Every other year, and every
`off` run, is today's code path, byte for byte.

## B5. The per-year sizing (choose mode)

### B5.1 When the choice is made

In `choose`, a conversion year with sizing on runs as a phased year even when it has no withdrawal or no line in reach (today
only withdrawal years with a line in reach are phased):
1. **Bracket phase:** the natural year exactly as today (the user's bracket, today's ceiling), converged. If sizing picks the
   bracket target (below), nothing else changes: the year is today's year and the guard's phases follow as today.
2. **Choice:** at the bracket phase's final pass's realized draws, the figures the natural record keeps (`realizedTrad`,
   `taxableGainGross`, `seRealA/B`, `inhRealA/B`, and `flowOwn`), used as `estTrad` / `estGain` / the pairs in 5.2-5.4
   (also when the bracket phase ended in its forced pass or ran one pass), price every target (5.2, 5.3) and keep the best by
   score: candidates scanned by amount ascending (`none`, `c` = 0, first), the running best replaced only on
   `score > best + 1` (ties go to the smaller conversion).
3. **Sized phase:** if the winner is not the bracket target, the year re-runs from its snapshot as a fresh converged iteration
   with the target held, each pass re-sizing the amount to the held target from that pass's estimates. It is seeded from the
   **year's own start seeds** (`prevDiscTraditional`, `prevTaxableGainGross`, `prevSeHealthA/B`, `prevInhA/B`, as the
   year's first phase is), with the trial reset (`seHeld`, `seKind`, `forcedPass`, `phaseUnresolved`, `passLog`,
   `phasePass`), not from the bracket phase's draws. Reason: `apply` has no bracket phase (section 6), and the iteration is a
   damped fixed point (damping from pass 3, the 8-pass budget, the forced pass's pick from `passLog`), so a different seed
   gives different final doubles; with the same seeds and the same held target, `apply`'s first phase is `choose`'s sized
   phase pass for pass. The sized phase (and an `apply` intent year) sets `estUsed` (the target depends on the estimates even
   in a year with no finite ceiling and no premium, where today's year runs one pass). This phase replaces the natural record: the guard's trials (stay-under converts nothing; a fill
   keeps at most the natural conversion, the M17 clamp) are built from it, as from the natural phase today. Every record the
   phase machinery keeps (the natural record, each trial, the replay) carries the held target, so a fill trial resolves the
   held target and then clamps to the sized natural conversion (not the bracket amount), a replay re-runs the target, and
   next year's seeds (`prevDiscTraditional` and the others read from `naturalRec`) come from the sized phase.
4. **Guard trials after a sized phase:** they are offered by the existing rule (`flow < 0` and a line in reach), read on the
   sized phase. So a sized conversion that turns a no-withdrawal year into a withdrawal year can get guard trials the bracket
   year never had (and the M17 clamp becomes reachable, section 9). The year's lambda (`yearLambda`, held once computed) is
   computed from the bracket phase, before the choice: the conversion's own tax is not a yearly draw the walk should assume.
5. The new phase state (the held target, the sized record) lives with the other phase state outside the per-pass restore
   (it must survive the passes); nothing new goes into `scalarSnapshot`.

Why: holding the *target* and re-sizing the amount each pass avoids 3C B8a's failure (holding pass 0's amount broke the
ceiling where pass 0's estimate was stale), and choosing at the converged bracket year prices against real draws, not last
year's (the "bracket conversion ignores the year's draws" finding of 13.7). Cost: one more converged phase, only in choose
years whose winner differs from the bracket; `apply` pays none (it runs the sized phase as the year's first phase). The sized
phase has no `met` test (unlike the guard's trials): the amount is re-sized to the target on every pass; a pass whose target
cannot be carried (a line already passed, decision 6) converts the user's bracket under today's ceiling for that pass. Builder's call recorded
(section 12).

### B5.2 Targets

Each target resolves to an amount `c >= 0` for the year, at most `traditionalBeforeRmd - rmd - seppLocked` (the convertible
balance, as today), from the phase's estimates:
- **none:** 0.
- **Bracket tops:** each federal bracket of the conversion select (10, 12, 22, 24, 32, 35), sized like
  `solveRothConversionTo` (same conservative deduction, same bisection) but counting the phase's estimated discretionary
  traditional draw `estTrad` below the conversion, so a sized "top of 24%" really ends at the top in a year that also draws
  traditional money. `solveRothConversionTo` itself ignores the draws (the 13.7 finding: it can overshoot the top by the
  draw) and is left exactly as it is for the bracket target.
- **Lines:** each line `magiThresholds` returns for the year over the sizing reach `lo` = `preConvMagi` (this pass's MAGI with
  no conversion, draws included), `hi` = that plus the convertible balance. Target resolution builds its own lines with this
  reach on every pass, in `choose` and `apply` alike, so `apply` finds a line wherever `choose` sized to it; the guard's own
  call (its reach from `magiBase + ladderGain`) is untouched (the call builds lines with `c.irmaaGrowth` as the guard does, two-return lines in household MAGI
  through each return's share): a ceiling line (`aca400`, `irmaa1..5`, `medicaid`, `senior`, `ctc`) gives "just under",
  `c = line - 1 - preConvMagi`; a floor (`acaFloor`, and `medicaid` where crossing it lowers the cost, read as
  `yearPlanCandidates` reads floors) gives "just over", `c = line + 1 - preConvMagi`. Lines at or below `preConvMagi` give
  no candidate in the choice. In a two-return year the household amount moves each return by its share (`ownerShareA`), as
  `magiThresholds` already translates.
- **The bracket target** (the user's `rothConvBracket`, through today's `solveRothConversion` with today's ceiling, so the
  bracket phase is byte-identical) is always a candidate (decision 1).

Sized targets other than the bracket target are not capped by `conversionMagiCeiling` (decision 2). The withdrawal-order
uses of `magiSafeRoom`: in a sized year `remainingMagiRoom` is `incomeRoom(magiSafeRoom, b)`, where `b` is the bracket
conversion `solveRothConversion` gives at this pass's estimates (recomputed every pass, the same in `choose` and `apply`), not
the sized amount. Reason: a sized amount above the ceiling would make the room 0, and
`pickLiveWithdrawalOrder`'s `overage * 1e6` term (`mix.js`) would then always penalize traditional-first, moving the live mix
in sized years; pinning keeps the live mix reading what it reads today (it is removed in step 4).

### B5.3 The score

For a candidate amount `c` at the phase's estimates:
- `tax(c)` = `taxFor(ctx, profile, estGain, estTrad + c)`, the year's whole return at the phase's estimated draws (the form of
  the year's own `totalTax` call, `taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross)`), with
  `profile.medicalExpense` set as the year sets it, `premium(c) + ltc - (seRealA + seRealB)` when self-employment is live, else
  `premium(c) + ltc` (`ltc` from the year's `healthcareCost`; `costAt` returns the healthcare without it), and restored
  afterwards from the saved double. Payroll tax and the early-withdrawal penalty do not depend on `c` (a conversion
  carries no penalty; the draws are held at the estimates) and cancel. Federal and state, so state cliffs and the senior and
  CTC phase-outs are priced exactly. The pre-draw `taxFor(ctx, profile, 0, conversionAmount)` that sizes the flow is not the
  price (it would put the conversion at the bottom of the income stack);
- `premium(c)` = `costAt(estTrad + c, estGain)` (the in-year price; healthcare including the ACA credit and Medicaid line).
  In year 0 without entered prior MAGIs (`irmaaPriorKnown` off), IRMAA's lookback stand-in for years 0 and 1 is year 0's own
  MAGI, which the pass wrote from the bracket conversion: each candidate's pricing writes its own MAGI to the year-0 histories
  first and restores them after, as the settlement's `seStand0` does (`costAt`), so year 0's candidates are priced at their
  own MAGI;
- `irmaa(c)` = `irmaaAt(estTrad + c, estGain)` (charged two years on, on the charged year's tiers, per person on two returns);
- `lambdaConv` = `min(LAMBDA_MAX, max(0, m x rateHat))` (`rateHat` can be negative in a credit phase-in), where `rateHat` is `lambdaEstimate`'s unscaled, unclamped mean marginal rate
  for the year (one call, the same inputs the guard passes; `lambdaEstimate` returns it as a new field and its `lambda`
  stays exactly as today).

Known approximations, caught by the whole-run search, not the yearly score (recorded): the conversion's tax is paid by
further draws whose own MAGI is not priced here; more gains left in taxable raise later MAGI and IRMAA (the first of the two
costs the yearly score cannot see); the 162(l) settlement is not priced in the choice (the run's score reads it). The second
cost, a finite step crossing an IRMAA tier, is priced exactly for the conversion itself (`irmaaAt` at the finite amount, and
"just under" each tier is a candidate); inside `lambdaEstimate`'s sample step it remains (decision 4 leaves the estimator
alone), and the outer search over `m` absorbs its bias.

The one-dollar invariant (no double counting): a converted dollar gains `lambdaConv` once and this year's tax on it is
subtracted once. Evaluation order (fixed, so tests can write literals): `score = ((c * lambdaConv - dTax) - dPremium) - dIrmaa`,
with `dTax = tax(c) - tax(0)` and likewise the others. Test in section 9.

### B5.4 The bridge check (Note 2)

Applies while Partner A is under 59.5 (or Partner B, for B's share in a couple; the 3B penalty statuses decide which money is
penalty-free). A candidate larger than the bracket phase's own conversion is dropped when
`accessible - taxIncrease(c) < bridgeNeed`, where:
- `accessible` = penalty-free money at the start of the year after this year's draws: taxable + taxable bond reserve + cash +
  Roth basis and seasoned conversions + penalty-free traditional (Rule of 55, 72(t) payments, the 3B statuses), read from the
  bracket phase's ending balances and ledgers;
- `taxIncrease(c)` = `tax(c) + premium(c) + irmaa(c)` less the same at the bracket phase's conversion;
- `bridgeNeed` = the sum, over each year from next year until the youngest relevant partner reaches 59.5, of this year's
  need (`max(0, -flowOwn - lumpExpense)`, in today's dollars) less benefits started by then (the `lambdaEstimate` walk's
  `incomeAt`, lifted out of `lambdaEstimate` into a helper both use), undiscounted.
Smaller candidates (including none and the bracket target) are never dropped by the check. Builder's call on the details
recorded (section 12); the rule is Note 2's.

### B5.5 Recording

`choose` records `convIntents[age] = { target }` for every sized year whose winner differs from the bracket target, where
`target` is `'none'`, `'b10'`..`'b35'`, or a line `{ id, ret, side: 'under' | 'over' }` (the guard's id / ret vocabulary).
Returned non-enumerable on the run as `cliffConvIntents`, beside `cliffIntents`. A row of a sized year carries
`convChoice` (for example "converted to just under IRMAA tier 2", "converted to the top of the 24% bracket", "no conversion
(tax-aware)"), shown in the status cell's tooltip by `annotateSolverRows` beside `cliffChoice`.

### B5.6 The deduction lower bound (open item, decided here)

`solveRothConversionTo` keeps its conservative deduction (no state tax deduction, no senior deduction). The bracket run stays
byte-identical, and sized candidates are priced by `taxFor` exactly, so the bound only places the bracket-top candidates
slightly low for a year without traditional draws (5.2's sized targets add the draws; the bracket target keeps today's
overshoot by the draw, which is the user's setting as it runs today); closing the item as "kept, documented". Builder's call (section 12).

## B6. The plan and `apply`

The plan gains `conv` (the conversion intents by Partner A's age, `{}` when none) and `m` (the multiplier chosen, `null` for
the bracket candidate). `apply` follows `conv[age]` in a conversion year (inside the window, enabled, no explicit schedule):
the target is resolved to an amount on every pass from that pass's estimates, as in 5.2 (a line target looks its line up by
`id` and `ret` in the lines 5.2 builds for that pass, built only in a year with a conversion intent).

**Resolution rule (decision 6), one rule for `choose`'s sized phase and `apply` alike, applied per pass:**
- a bracket target: its amount (5.2), capped at the convertible balance;
- a line target whose line is in the pass's list (above `preConvMagi`, within the reach): its amount (5.2);
- a line target whose line is not in the pass's list (an "under" line at or below the pass's `preConvMagi`, a floor already
  crossed, or a line that does not exist that year): the user's bracket with today's ceiling (`solveRothConversion` at
  `min(convertible, magiSafeRoom)`), the same amount the bracket phase would convert on that pass;
- `none`: 0.
(A line above the reach cannot occur: the reach's top is the convertible balance, so the amount would exceed it; it is capped
at the convertible balance.) No scoring, no lambda, no bridge check in `apply` (the plan was chosen on the deterministic projection;
historical and Monte Carlo paths follow it). `apply(choose's intents and conv)` reproduces `choose` exactly (pinned).
`magiStats` count the kept phase only, as today: a discarded bracket phase's forced / unresolved flags are not counted.

The plan's cache and keys are unchanged. `refreshCliffPlan` keys on the inputs, the tax year and the override maps;
`planForState`'s cache keys on the tax year and the inputs' JSON only ("the first plan cached for a JSON wins", documented). The
sizing exemption for override ages (section 4) makes the plan depend on the overrides a little more than today; the callers with
non-default overrides are the optimizer trials, which apply the main plan and never re-plan. Recorded as an observation for the
owner, not changed here.

## B7. The outer search (in `computeCliffPlan`)

When sizing applies to the plan (enabled, guard on, and at least one window age without an explicit schedule; a partly
scheduled window searches, the scheduled ages keep their schedule):
1. **The bracket candidate:** today's `computeCliffPlan` exactly (choose with sizing off, the family subsets, `off`, Rule A),
   giving today's plan, value and depletion.
2. **Sized candidates:** for each `m` in the grid `M_GRID = [0, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]`, one `choose` run with
   sizing on at that `m`, measured with the registry (`US_OBJECTIVES.endValue`, `lifetimeCost`, `depletedAge`).
3. **Rank:** `planCandidateBetter` (Rule A: later depletion first, then the after-tax end value by more than $1, then fewer
   intents, guard and conversion intents counted together). The comparison is not transitive (the $1 band and the tie-break),
   so the order is fixed: step 1's kept bracket plan is the running best, then the nine `m` runs in grid order, then the family
   subsets of a sized winner; the running best is replaced only when the candidate is strictly better (`planCandidateBetter`
   true), so a tie keeps the earlier one.
4. **Families of the winner:** if a sized candidate wins and its guard intents span both families, its ACA-only and
   IRMAA-only subsets run through `apply` (with its `conv` held) as today's step does for the bracket plan, ranked the same way.
5. The report lists every candidate (`m`, family, intents, conversion intents, depletion, value, cost) and the kept one.

Why a fixed grid, not golden-section: the score in `m` is a step function (targets switch discretely), so a bracketing search
can stop on a plateau; a fixed grid is deterministic and its cost is known. Today's plan is 1-4 runs (a choose run with no intent is reused as `off`); the search adds nine `choose` runs (each with a second converged phase in its sized years, plus the
guard's trials) and up to two family `apply` runs for a sized winner: 12-15 runs per input change, nine of them in the costlier
mode, inside the brief's 20-100 budget, chosen for the per-render cost (section 10). `planForState` (scenario comparison,
overlay swaps, load / undo / reset) pays the same when it plans an uncached state. A plan with no
sized year (no window year, sizing off) runs only step 1: today's cost, byte-identical result.

The step is on by default for every plan with conversions on and the guard on: no new input field, no saved field
(`normalizeState` unchanged). The test hook `__test_setConversionSizing(false)` (`test-hooks.js`, read through `ctx.test`; it also marks the stored plan not
computed and clears `cliffPlanCache`, as `__test_setCliffPlan` marks it, because the plan keys see only the state's JSON and the
tax year; the before/after scripts call `__test_refreshCliffPlan` after each toggle)
turns it off for the before/after scans (`ctx.test.convSizingOff`, a new field of the one `test` literal in
`storeRunContext` and the Vitest builders).

## B8. UI and docs (only what the change needs)

- The cliff-plan summary line gains a conversion clause, grouped by runs of ages as the guard's are: "Conversions: top of the
  24% bracket at 62-65; just under IRMAA tier 2 at 66-70; none at 71-74 (tax-aware sizing)"; or "Conversions: your bracket
  (tax-aware sizing found nothing better)."
- The bracket select's info tip says the bracket is the starting point and the cliff guard may size each year by price; the
  `<small>` descriptor stays under 70 characters.
- US badge V137 -> V138. README feature list, `docs/architecture/cliff-plan.md` (sizing, the plan's `conv`, the outer search),
  `engine.md` where the phased-year rule changes, and the Batch 5 notes (measurements, section 9).

## B9. Acceptance tests

Hard rules (each must hold; exit 1 / test failure otherwise):
1. **No earlier depletion, snapshots (owner decision 5, 2026-10-24; the cliff-plan spec's section 8 rule):**
   `node tests/snapshot.js` before and after; every moved scenario has conversions on and the guard on.
   - *Standard* scenarios (`std ...`) never deplete earlier than before: guaranteed by Rule A, asserted; otherwise stop for
     the owner.
   - *Historical* scenarios (`hist ...`, one fixed path each) may move either way. Every mover is re-explained (a dump /
     compare and a before / after table), and any that depletes earlier is classified by cause before the commit:
     (i) **bridge drain**, decided from the rows: under the sized plan on that path some year before the youngest relevant
     partner's 59.5 has `earlyPenalty > 0`, an earlier year converts more than the bracket plan converts at that age on the
     same path (`conversionAmount`), and the bracket plan on that path has no `earlyPenalty` before 59.5 (the first attempt's
     cause 2: a design defect, stop and bring it to the owner with the remedy below); (ii) **market variance under the named
     target**: every other earlier depletion: recorded in the notes (path, ages, the first differing year), then
     `npm run snapshot:update`. A small script (scratch or `tests/`) applies this test to the snapshot dump, so the
     classification is mechanical.
     No `m` is dropped and no household excluded on historical evidence.
   - The five scenarios the first attempt broke (`std R rothConv+aca+live`, `hist R everything | real1929`, `| real1966`,
     `| real1973`, `hist R everything rich | crashFirst`, or their current names) are listed by name with before / after ages
     whether or not they move.
   - Historical and Monte Carlo rates (`tests/historical_rates.js`, the scan's per-path counts) are reported, never gated and
     never used to choose.

   **Remedy for a bridge drain** (built only if a case (i) trip shows the need): fix the deterministic side first (5.4's
   `accessible` or `bridgeNeed`: a margin, or counting the tax paid from taxable in later years). If the drain is path-only
   (the deterministic check passes, the path's own balances fail it), add an eligibility rule to `apply`: in a conversion
   year before 59.5 the intent is carried out only while a post-phase bridge test holds on the path's own balances
   (`accessible` at the end of the sized phase `>= bridgeNeed`, 5.4's terms), otherwise the year falls back to the user's
   bracket with today's ceiling. The owner rules this an eligibility fallback, not a per-path choice (2026-10-24). So that
   `apply(choose)` still reproduces `choose`, `choose` gains the identical post-phase test: after its sized phase converges,
   a winner that fails it is discarded and the bracket phase is replayed (no new phase); the pre-choice 5.4 check stays as a
   pruning step. Its cost is measured against the converting `bench_solver.js` scenario.
2. **Plans that do not convert are byte-identical:** the rows of every snapshot scenario with conversions off (or the guard off)
   unchanged (the plan object gains `conv` and `m` for every plan, so tests that deep-compare `__test_refreshCliffPlan()`
   output, such as `tests/cliff_plan.js`, are updated for the shape only);
   `tests/plan_off_anchor.js` identical (it runs guard-off, where sizing never runs: it shows the guard-off path untouched).
3. **The depletion sweep** (`tests/solver_scan.js`, conversions-on half, 384 households per mode): sized plan vs the bracket
   plan (`__test_setConversionSizing(false)`), and guard on vs guard off with sizing on: never earlier on the standard
   projection. Historical / Monte Carlo rates and per-path counts reported, not gated.
4. **The gap table** (`node tests/solver_gap.js --objective endValue`, both lengths): the sized plan's after-tax end value in
   each case is at least the best flat bracket's (CA at 100: 24%; TX and NY: 12%), and table 1-2 reprinted against the
   reference; a new column for the sized plan (m chosen, targets used, converted total).
5. **The one-dollar test** (Vitest, hand-computed, exact under test rule 2): a household in a flat-rate year (no line in reach,
   no premium, no IRMAA): `tax(c + 1) - tax(c)` equals a hand-computed literal, and the scores at `c` and `c + 1` each equal a
   literal computed in 5.3's evaluation order. No engine-computed expectation, no tolerance. **Amended (owner, 2026-10-24):**
   the comparisons are in cents (`Math.round(x * 100)` toBe the hand-computed cents), since a bracket slice times its rate is not
   exact in doubles (one more dollar at 22% gives 0.22000000000025466); the pure evaluation-order check of the score stays exact.
6. **The bridge check** (Vitest): a household at 52 whose 32% target would leave the taxable bridge short of the years to 59.5
   is not offered it, and the 22% target still is; removing the check makes the test fail.
7. **`apply` reproduces `choose`** for sized plans (rows identical), and a historical path follows the named targets
   (a line target re-sized on the path's own MAGI).
8. **M17 fill clamp:** if a sized natural year can be followed by a guard fill (5.1 step 3 makes it reachable), add the test
   written in Task 1 Step 5 of `docs/superpowers/plans/2026-10-08-review-followups.md`, proven red on deleting the clamp line;
   if no household reaches it, record that in the notes.
9. Unit coverage of each target kind (bracket, under a ceiling line, over a floor, none) and of each branch of section 6's
   resolution rule in both modes (a passed "under" line, a crossed floor, a line absent that year: each converts the bracket
   amount; the amount capped at the convertible balance), the tie rule, the explicit-schedule exemption, and the plan's report.

**Guards in `npm test` (3C item 5), builder's call recorded:** `solver_scan.js` is about 800,000 projections (tens of
minutes) and `solver_gap.js` about 5 minutes with its 200,000-evaluation reference: neither joins `npm test` whole. A new
`tests/conversion_sizing.js` joins it: the conversions-on, standard-projection, default-order part of the scan grid (384
households, about 14 projections each: sized vs bracket, the depletion rule only; smooth stays in the manual scan), target
under 60 s; measured and stated in the notes, and the owner decides if it is over.
The full scan and the gap table stay manual and are re-run for every lambda-driven change (steps 4 and 5).

## B10. Performance

- **Projection timing gates** (`tests/bench_runs_interleaved.js`, `tests/bench_solver.js`), against `b544934`: +5% on the
  no-cliff workload and +30% on the ACA case. Both have conversions off, so they show only that non-converting plans pay
  nothing. The new cost is on converting plans, so `bench_solver.js` gains a third scenario, the ACA early retiree with
  conversions on (to 74, 22%): its standard and historical paths under the plan, where `apply` resolves a target each
  conversion year (lines built in years with a line target). Gate +30% against the same scenario run on a built `b544934`
  tree (the scenario is a patch to the script, which the base tree runs through `--base`).
- **Planning time per input change** (new measure, `refreshCliffPlan` on the gap households and the default with conversions
  on): today 7-18 ms (measured 2026-10-24, a scratch Playwright script, median of 9, quantized to 1 ms). Sized: 12-15 runs,
  nine of them `choose` runs with a sized phase in their sized years (3C measured `choose` at +30-50% over a plain run on the
  ACA case; a plain run is about 3-5 ms), so roughly 60-120 ms on the slowest households; measured, not assumed. Gate: under 150 ms median on the slowest gap household; above that the owner decides (a coarser grid, or
  moving the search to `renderDeferred` with the bracket plan shown first).
- Why per render and not only on Optimize: decision 1. The search is limited to plans that already convert; everything else
  pays nothing.

## B11. Code sites (at `b544934`; re-read when building)

- `src/us/core/projection/run-projection.js`: the conversion block (`convertsThisYear`, `magiSafeRoom`, `solveRothConversion`,
  the fill clamp), the phased-year block (`phased && !replaying`, `naturalRec`, `trialRecs`, the replay), `lambdaOf`,
  `costAt`, `irmaaAt`; `computeCliffPlan` (the outer search). New per-phase state joins the phase carries and
  `scalarSnapshot` / the clone-restore pairs where the year body mutates it (MAGI-iteration invariant).
- `src/us/core/withdrawals/roth-conversion.js`: target resolution next to `solveRothConversionTo` (an engine function,
  `fn(ctx, ...)`).
- `src/us/core/cliff-plan/solver.js`: `lambdaEstimate` returns `rate` (unscaled mean) beside `lambda`; `magiThresholds`
  unchanged.
- `src/us/core/cliff-plan/planning.js`: `cliffPlanSummary` (the conversion clause).
- `src/us/ui/results/...` `annotateSolverRows` (the `convChoice` tooltip); `src/us/index.html` (tip, badge).
- `src/us/core/test-hooks.js`, `src/us/ui/install-test-hooks.js`, `newRunContext`'s `test` literal (one shape).
- Tests: `tests/solver_scan.js`, `tests/solver_gap.js`, new `tests/conversion_sizing.js`, Vitest suites under `tests/unit/us/`.

## B12. Builder's calls (made by the spec author, for the owner to check)

1. The choice is made at the converged bracket phase and the target held with the amount re-sized per pass (5.1).
2. Explicit per-age schedules (`appliedRothSchedule`, optimizer overrides) switch sizing off for those ages (4).
3. Ties go to the smaller conversion; a larger target must win by more than $1 (5.1).
4. The `m` grid `[0, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]` (7); lambdaConv clamped at `LAMBDA_MAX` (0.6).
5. Floors as "just over" targets read the way `yearPlanCandidates` reads them; the 0% long-term gain band is priced by
   `taxFor` but is not a target (named gap).
6. The bridge check's need and accessible money as in 5.4 (undiscounted, today's dollars, from next year to 59.5).
7. (Now owner decision 6.)
8. The deduction lower bound kept (5.6).
9. Guards: a new fast `tests/conversion_sizing.js` in `npm test` (default order only); the scan and gap table stay manual (9).
10. The planning-time gate of 150 ms (10).
11. `lambdaEstimate`'s IRMAA sample step left as it is (decision 4); recorded as a known bias the search absorbs.
12. The tax price is the whole return at the estimated draws (5.3); the tax on the extra draw that pays the conversion's tax
    is not priced in the year (the whole-run search sees it).
13. Sized bracket-top targets count the estimated traditional draw; the user's bracket target stays today's function (5.2).
14. `remainingMagiRoom` in sized years from the bracket conversion recomputed at each pass's estimates (5.2), one extra
    bisection per pass.
15. Guard trials follow a sized phase by the existing rule; the year's lambda is the bracket phase's (5.1).
16. A converting-household timing gate in `bench_solver.js` (10).
17. The sized phase is seeded from the year's start seeds, so `apply` runs it as the year's first phase (5.1).
18. Year-0 IRMAA stand-in written per candidate (5.3); `lambdaConv` floored at 0.

Notes for the builder: `magiStats` / `planStats` are cumulative and tests read deltas; nine more `choose` runs per plan change
the deltas a test sees around `refreshCliffPlan` (check `tests/cliff_plan.js`, `tests/solver_hooks.js`). After a sized phase the
guard's stay-under still scores with lambda at `m = 1` (decision 4) and can undo a sized conversion where cappable traditional
is drawn; expected, record it in the scan notes.

## B13. Left to the builder

The exact phase bookkeeping (where the sized phase's record lives among `naturalRec` / `trialRecs`, the replay), the names
of the new fields and helpers, the shape of `convIntents` entries beyond section 5.5's content, the test households beyond
those named, and the wording of the summary clause within section 8.
