# Batch 5 step 3: Roth conversion sizing, split into 3a (flat-bracket candidates) and 3b (per-year sizing) (US)

Status: design approved by the owner on 2026-10-24 (decisions 1-6), then revised the same day after an outside review
(decisions 7-13: the step split into 3a and 3b). **3a** is approved to plan and build. **3b** (Part B) is built only after the
owner has seen 3a's numbers and asks for it; the work stops after 3a.
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
    fixing it). Until that fix lands, the search (3a) and sizing (3b) are off for `stateTax` `ri` and `pa`.
11. **IRMAA discount: deferred.** IRMAA stays charged in full two years on (conservative: a death or a lower later MAGI may mean
    it is never charged). The "decide in Batch 5" Open item is deferred past step 3, explicitly.
12. **A stay-under after a sized phase** (3b): add "the sized conversion, capped at the line" as one more guard candidate
    (scored at `m` = 1), rather than the stay-under trial converting nothing.
13. **The year-0 IRMAA stand-in** (3b): during the choice, frozen at the bracket phase's value (a conversion today cannot change
    returns already filed). Whether the engine itself should let year 0 move the stand-in is a backlog note, not a step 3 fix.

14. **Home equity: both no earlier** (owner, 2026-10-24). A candidate must deplete no earlier and first draw on home equity no
    earlier than the best; a plan that lasts longer only by selling the house sooner is never kept (A3).
15. **(Pending the owner.)** Shifted standard snapshot scenarios that deplete earlier: a hard stop, or classified like historical
    movers? Recommendation: classified like historical movers (A5.1).

# Part A: step 3a, flat-bracket candidates in the cliff plan

## A1. Goals, non-goals, anti-goals

Goals: the outer search over the six flat brackets, ranked by Rule A with the relative threshold; running it in the deferred
pass; the plan carrying the chosen bracket; the summary line saying what the plan did; the guard script, the gap table at both
lengths, the scan with a home-equity column; the 3a numbers for the owner.

Non-goals: per-year sizing and everything in Part B; storing the plan in `state`; the Apply refinement; the stock-account order
and the two-return split (step 4); retiring `optimizeMultiLever` (step 5); the IRMAA discount (decision 11); RI and PA (decision
10).

Anti-goals: any plan depleting, or first drawing on home equity, earlier than the user's-bracket run on the deterministic
projection; moving a plan that does not convert, or one whose bracket candidates all lose (rows byte-identical to V137); a
per-keystroke stall; choosing by historical or Monte Carlo results.

## A2. When the search applies

All of: `rothConvEnabled`, `cliffGuardEnabled`, at least one window age (`rothConvStartAge`..`rothConvEndAge`) inside the plan,
`stateTax` not `ri` or `pa` (decision 10), `inputs.appliedRothSchedule` null or with no keys (an explicit schedule is the user's choice; the
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
withdrawalMixByAge: optimizerState.withdrawalMixByAge } })`), so its rows mean what they say. The optimizer's trials keep their
own maps (their unmapped ages follow the plan's bracket, as the "current plan" they are compared against does).

`homeDrawAge`: the first age whose withdrawals took more than $1 from home equity in the kept pass of that year (the year's sum of
`takeHomeEquity`'s returns, `wd.homeDrawn`, against the same threshold as `wd.need > 1` for depletion, so float leftovers never
count), `null` if never; `wd.homeDrawn` is a new field of `newWithdrawal` (`src/us/core/withdrawals/draws.js`); recorded by the year loop as a scalar in `scalarSnapshot` (it is mutated in the year body and
must rewind with the passes), returned non-enumerable on the run (`sim.homeDrawAge`, as `cliffIntents` is), so no row and no
snapshot field changes.

`apply` and `choose` read the plan's bracket the same way, so `apply(choose)` still reproduces `choose` (pinned in A5).

## A5. Acceptance

1. **Snapshots** (decision 5's split gate): `node tests/snapshot.js` before and after; every mover has conversions on and the
   guard on, outside RI and PA. Standard scenarios with shift 0 never deplete, or first draw on home equity, earlier: by
   construction (A3), asserted; otherwise stop for the owner. The shifted standard scenarios (`shift±1`, `shift±3`,
   `tests/snapshot_scenarios.js`) apply the shift-0 plan to other retirement ages, so they are not covered by construction:
   **pending the owner's answer (decision 15 below); recommendation: classify them like historical movers** (a bridge drain
   stops, market variance is recorded). Historical movers: a before / after table, each that depletes earlier classified from
   the rows: **bridge drain** when, under the kept plan on that path, a year before the youngest relevant partner's 59.5 has
   `earlyPenalty > 0`, an earlier year converts more than the user's-bracket plan converts at that age on the same path
   (`conversionAmount`), and the user's-bracket plan on that path has no `earlyPenalty` before 59.5: stop and bring it to the owner;
   otherwise **market variance**: recorded (path, ages, first differing year). A script applies this test to two snapshot dumps.
   The five scenarios the first attempt broke are listed with before / after ages whether or not they move.
2. **Rows of non-converting plans byte-identical** (conversions off, the guard off, RI / PA, `bracketSearchOff`), and
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

- `searched` means "a full refresh was done for this key" (whether or not the search applied), so a plan that does not
  convert is final after one full refresh and never leaves `searchPending` set.
- `refreshCliffPlan({ light })`: the light render (`render({ light: true })`) computes or keeps the user's-bracket plan (today's
  `computeCliffPlan` with the search skipped) and, when the search applies and has not run for this key, records `searchPending`;
  the store then holds that plan as `cliffPlanStore.plan`. A full refresh (a full `render()`, the deferred pass, the test hooks'
  `ensureTestPlan`, `planForState`) runs the search and stores the kept plan; the key (state JSON, tax year, override maps) is
  unchanged, plus whether the stored plan is searched.
- No unsearched plan is served where a full one is owed: `planForState` returns the stored plan (identity or JSON match) only when
  it is `searched`, else it plans in full; `ensureTestPlan` re-plans when the key, the year or `!searched` says so;
  `__test_setCliffPlan` marks its hand-set plan `searched` (final); `__test_setBracketSearch` clears `cliffPlanStore.key` and
  `cliffPlanCache`.
- `scheduleRender()` sets the deferred timer when a search is pending even if no panel is stale (today it sets it only with stale
  panels), so the search always runs after `change` or the idle pause. The shared scheduler reads "pending" through a core seam
  (`#country/core/seam-searchPending`, Canada's facade returns false).
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
