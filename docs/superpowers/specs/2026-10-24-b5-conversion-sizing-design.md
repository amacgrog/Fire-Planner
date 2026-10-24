# Batch 5 step 3: tax-aware Roth conversion sizing behind an outer search over `m` (US)

Status: design, awaiting the owner's approval. No implementation plan or code until then.
Base: `b544934` (origin/main: steps 0-2 and PR #47, US V137). Canada untouched.

Read with: `docs/next-batches-plan.md`, "Batch 5: optimizer" (the re-scope block, the 3C redesign items 1 and 5, "Batch 5 owns
all lambda-driven policy", "Tax-aware conversion sizing" with Notes 1 and 2) and the Batch 5 notes (step 0, step 2, step 2b);
the 3C notes, section 13 (the first attempt, which depleted 5 snapshot scenarios earlier); `docs/architecture/cliff-plan.md`,
`engine.md`, `magi-iteration.md`, `us-health.md`; the step 2 spec `2026-10-23-b5-objective-registry-design.md`.

## 1. Intent

Today a Roth conversion fills ordinary income to the top of the user's bracket (`rothConvBracket`) in each year of the user's
window, held under the ACA 400% line and the next IRMAA tier by `conversionMagiCeiling`. It ignores what the conversion
costs this year beyond the bracket (premium credit, IRMAA two years on) and what it saves later. At the planner's default
length the shipped run is within a few percent of the slow reference; the remaining conversion gap is the IRMAA couple (CA):
a flat 24% bracket scores better than the shipped 22% (step 0; on the after-tax end value too).

This step sizes each conversion year by price, picks how strongly to value future tax savings with a whole-run search over
the multiplier `m`, and keeps the user's own bracket run as a candidate, so on the deterministic projection the result is
never worse than the user's settings (Rule A).

What success looks like: the CA couple's sized plan reaches at least the best flat bracket's after-tax end value; no
snapshot scenario and no scan household depletes earlier than its bracket run; plans that do not convert are byte-identical.

## 2. Owner decisions (2026-10-24)

1. **Automatic, in the cliff plan.** The outer search runs inside `computeCliffPlan` (per input change, `refreshCliffPlan` /
   `planForState`), not only on Optimize. It acts only for a plan that already converts (`rothConvEnabled`, cliff guard on)
   and only inside the user's conversion ages (`rothConvStartAge`..`rothConvEndAge`). The user's bracket run (today's plan,
   exactly) is always a candidate and is kept unless a sized plan beats it under Rule A.
2. **No hard cap at the lines for sized candidates.** The IRMAA tiers and the ACA 400% line are priced, not capped: a sized
   candidate may cross them when the price says so (example: a lumpy-expense year already over the 400% line has lost the
   credit anyway, and converting there is cheap; today's ceiling gives it no room at all). "Just under each line" is always a
   candidate. The bracket candidate keeps today's ceiling unchanged.
3. **The plan records a named target per age**, not a dollar amount: the top of a bracket, just under (or just over, for a
   floor) a named line, or none. Each path (standard, historical, Monte Carlo) sizes its own conversion to that target.
4. **`m` scales only the conversion sizing.** The guard's lambda stays as today (`SOLVER_LAMBDA_MULT` = 1, unchanged), so the
   guard's choices move only where a sized conversion changes the year it steers. `m = 0` means "convert nothing".

## 3. Goals, non-goals, anti-goals

Goals
- Per-year sizing by `score(c) = c x lambdaConv - (tax(c) - tax(0)) - (premium(c) - premium(0)) - (irmaa(c) - irmaa(0))`
  over a fixed set of targets, with lambdaConv = `min(LAMBDA_MAX, m x rateHat)`.
- The bridge check before 59.5 (Note 2): larger amounts that strand the bridge are not candidates.
- The outer search over a fixed grid of `m`, scored by the registry's `endValue` with Rule A (depletion first).
- Named conversion intents applied per path; the plan summary line and the row tooltip say what was done.
- The acceptance tests of the plan (section 9), and timing within the gates (section 10).

Non-goals (later steps)
- Storing the plan in `state`, the Apply refinement, per-phase multipliers (step 4).
- The stock-account order and the two-return draw split (step 4); the TX early-ACA single's gap is the order, not sizing.
- Retiring `optimizeMultiLever` and the age-keyed schedules; the 30-year window cap (step 5).
- Changing `lambdaEstimate`, the guard's candidates or its scoring (decision 4).
- Canada (the RRSP meltdown has no income-tested cliff to price).

Anti-goals (a failure even if it "works")
- Any plan depleting earlier than the user's bracket run on the deterministic projection.
- Moving a plan that does not convert, or a converting plan whose sized candidates all lose (byte-identical to V137).
- Repeating the first attempt's failure: converting heavily before 59.5 with the tax paid from the bridge money.
- Choosing by historical or Monte Carlo rates (they are reported, never used to choose).
- A per-keystroke stall: the planning time is bounded (section 10).

## 4. Where sizing is on

Sizing runs in a year when all hold: the run is `choose` (or `apply` with a conversion intent for that age), `convertsThisYear`
(enabled and inside the window), the plan's sizing switch is on (section 6), and no explicit per-age schedule governs the year
(`ctx.overrides.rothBracketByAge` has no entry for the age and `inputs.appliedRothSchedule` has none either: an explicit
schedule is the user's or the optimizer's choice and wins; builder's call recorded, section 12). Every other year, and every
`off` run, is today's code path, byte for byte.

## 5. The per-year sizing (choose mode)

### 5.1 When the choice is made

In `choose`, a conversion year with sizing on runs as a phased year even when it has no withdrawal or no line in reach (today
only withdrawal years with a line in reach are phased):
1. **Bracket phase:** the natural year exactly as today (the user's bracket, today's ceiling), converged. If sizing picks the
   bracket target (below), nothing else changes: the year is today's year and the guard's phases follow as today.
2. **Choice:** at the converged bracket phase's realized estimates (`estTrad`, `estGain`, the settled 162(l) pair where held,
   `flowOwn`), price every target (5.2, 5.3) and keep the best by score; a larger candidate must beat the best smaller one by
   more than $1 (ties go to the smaller conversion).
3. **Sized phase:** if the winner is not the bracket target, the year re-runs from its snapshot as a fresh converged iteration
   with the target held (seeded from the bracket phase's realized draws), each pass re-sizing the amount to the held target
   from that pass's estimates. This phase replaces the natural record: the guard's trials (stay-under converts nothing; a fill
   keeps at most the natural conversion, the M17 clamp) are built from it, as from the natural phase today.

Why: holding the *target* and re-sizing the amount each pass avoids 3C B8a's failure (holding pass 0's amount broke the
ceiling where pass 0's estimate was stale), and choosing at the converged bracket year prices against real draws, not last
year's (the "bracket conversion ignores the year's draws" finding of 13.7). Cost: one more converged phase, only in choose
years whose winner differs from the bracket. Builder's call recorded (section 12).

### 5.2 Targets

Each target resolves to an amount `c >= 0` for the year, at most `traditionalBeforeRmd - rmd - seppLocked` (the convertible
balance, as today), from the phase's estimates:
- **none:** 0.
- **Bracket tops:** each federal bracket of the conversion select (10, 12, 22, 24, 32, 35), sized by
  `solveRothConversionTo` (its conservative deduction bound unchanged, decision in 5.6).
- **Lines:** each line `magiThresholds` returns for the year over the reach `lo` = MAGI with no conversion, `hi` = that plus
  the convertible balance (the call builds lines with `c.irmaaGrowth` as the guard does, two-return lines in household MAGI
  through each return's share): a ceiling line (`aca400`, `irmaa1..5`, `medicaid`, `senior`, `ctc`) gives "just under",
  `c = line - 1 - preConvMagi`; a floor (`acaFloor`, and `medicaid` where crossing it lowers the cost, read as
  `yearPlanCandidates` reads floors) gives "just over", `c = line + 1 - preConvMagi`. Lines at or below `preConvMagi` give
  no candidate. In a two-return year the household amount moves each return by its share (`ownerShareA`), as
  `magiThresholds` already translates.
- **The bracket target** (the user's `rothConvBracket`, with today's ceiling) is always a candidate (decision 1).

Sized targets other than the bracket target are not capped by `conversionMagiCeiling` (decision 2). The withdrawal-order
uses of `magiSafeRoom` (`remainingMagiRoom`, dead wiring until step 4) keep their current value.

### 5.3 The score

For a candidate amount `c` at the phase's estimates:
- `tax(c)` = `taxFor(ctx, profile, 0, c)` + the year's payroll tax (constant), federal and state, the profile at the phase's
  estimates (the same call the year makes, so state cliffs and the senior and CTC phase-outs are priced exactly);
- `premium(c)` = `costAt(estTrad + c, estGain)` (the in-year price; healthcare including the ACA credit and Medicaid line);
- `irmaa(c)` = `irmaaAt(estTrad + c, estGain)` (charged two years on, on the charged year's tiers, per person on two returns);
- `lambdaConv` = `min(LAMBDA_MAX, m x rateHat)`, where `rateHat` is `lambdaEstimate`'s unscaled, unclamped mean marginal rate
  for the year (one call, the same inputs the guard passes; `lambdaEstimate` returns it as a new field and its `lambda`
  stays exactly as today).

Known approximations, caught by the whole-run search, not the yearly score (recorded): the conversion's tax is paid by
further draws whose own MAGI is not priced here; more gains left in taxable raise later MAGI and IRMAA (the first of the two
costs the yearly score cannot see); the 162(l) settlement is not priced in the choice (the run's score reads it). The second
cost, a finite step crossing an IRMAA tier, is priced exactly for the conversion itself (`irmaaAt` at the finite amount, and
"just under" each tier is a candidate); inside `lambdaEstimate`'s sample step it remains (decision 4 leaves the estimator
alone), and the outer search over `m` absorbs its bias.

The one-dollar invariant (no double counting): a converted dollar gains `lambdaConv` once and this year's tax on it is
subtracted once. Test in section 9.

### 5.4 The bridge check (Note 2)

Applies while Partner A is under 59.5 (or Partner B, for B's share in a couple; the 3B penalty statuses decide which money is
penalty-free). A candidate larger than the bracket phase's own conversion is dropped when
`accessible - taxIncrease(c) < bridgeNeed`, where:
- `accessible` = penalty-free money at the start of the year after this year's draws: taxable + taxable bond reserve + cash +
  Roth basis and seasoned conversions + penalty-free traditional (Rule of 55, 72(t) payments, the 3B statuses), read from the
  bracket phase's ending balances and ledgers;
- `taxIncrease(c)` = `tax(c) + premium(c) + irmaa(c)` less the same at the bracket phase's conversion;
- `bridgeNeed` = the sum, over each year from next year until the youngest relevant partner reaches 59.5, of this year's
  need (`max(0, -flowOwn - lumpExpense)`, in today's dollars) less benefits started by then (the `lambdaEstimate` walk's
  `incomeAt`), undiscounted.
Smaller candidates (including none and the bracket target) are never dropped by the check. Builder's call on the details
recorded (section 12); the rule is Note 2's.

### 5.5 Recording

`choose` records `convIntents[age] = { target }` for every sized year whose winner differs from the bracket target, where
`target` is `'none'`, `'b10'`..`'b35'`, or a line `{ id, ret, side: 'under' | 'over' }` (the guard's id / ret vocabulary).
Returned non-enumerable on the run as `cliffConvIntents`, beside `cliffIntents`. A row of a sized year carries
`convChoice` (for example "converted to just under IRMAA tier 2", "converted to the top of the 24% bracket", "no conversion
(tax-aware)"), shown in the status cell's tooltip by `annotateSolverRows` beside `cliffChoice`.

### 5.6 The deduction lower bound (open item, decided here)

`solveRothConversionTo` keeps its conservative deduction (no state tax deduction, no senior deduction). The bracket run stays
byte-identical, and sized candidates are priced by `taxFor` exactly, so the bound only places the bracket-top candidates
slightly low (a small amount under the true top); closing the item as "kept, documented". Builder's call (section 12).

## 6. The plan and `apply`

The plan gains `conv` (the conversion intents by Partner A's age, `{}` when none) and `m` (the multiplier chosen, `null` for
the bracket candidate). `apply` follows `conv[age]` in a conversion year (inside the window, enabled, no explicit schedule):
the target is resolved to an amount on every pass from that pass's estimates, as in 5.2 (a line target looks its line up by
`id` and `ret` in that year's `magiThresholds`, built only in a year with a conversion intent); a target that does not exist
that year (no such line in reach, or none above the pre-conversion MAGI for an "under") falls back to the user's bracket with
today's ceiling. No scoring, no lambda, no bridge check in `apply` (the plan was chosen on the deterministic projection;
historical and Monte Carlo paths follow it). `apply(choose's intents and conv)` reproduces `choose` exactly (pinned).

The plan's cache and keys are unchanged (`planForState`, `cliffPlanCache`, `refreshCliffPlan`'s key): the plan is a function
of the inputs, the tax year and the override maps, as today.

## 7. The outer search (in `computeCliffPlan`)

When sizing applies to the plan (enabled, guard on, at least one window year, no explicit schedule for all window ages):
1. **The bracket candidate:** today's `computeCliffPlan` exactly (choose with sizing off, the family subsets, `off`, Rule A),
   giving today's plan, value and depletion.
2. **Sized candidates:** for each `m` in the grid `M_GRID = [0, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]`, one `choose` run with
   sizing on at that `m`, measured with the registry (`US_OBJECTIVES.endValue`, `lifetimeCost`, `depletedAge`).
3. **Rank:** `planCandidateBetter` (Rule A: later depletion first, then the after-tax end value by more than $1, then fewer
   intents, guard and conversion intents counted together); the bracket candidate is first in the list, so a tie keeps it.
4. **Families of the winner:** if a sized candidate wins and its guard intents span both families, its ACA-only and
   IRMAA-only subsets run through `apply` (with its `conv` held) as today's step does for the bracket plan, ranked the same way.
5. The report lists every candidate (`m`, family, intents, conversion intents, depletion, value, cost) and the kept one.

Why a fixed grid, not golden-section: the score in `m` is a step function (targets switch discretely), so a bracketing search
can stop on a plateau; a fixed grid is deterministic and its cost is known. Nine sized runs plus today's plan: about 10-11
projections per input change, inside the brief's 20-100 budget, chosen for the per-render cost (section 10). A plan with no
sized year (no window year, sizing off) runs only step 1: today's cost, byte-identical result.

The step is on by default for every plan with conversions on and the guard on: no new input field, no saved field
(`normalizeState` unchanged). The test hook `__test_setConversionSizing(false)` (`test-hooks.js`, read through `ctx.test`)
turns it off for the before/after scans.

## 8. UI and docs (only what the change needs)

- The cliff-plan summary line gains a conversion clause, grouped by runs of ages as the guard's are: "Conversions: top of the
  24% bracket at 62-65; just under IRMAA tier 2 at 66-70; none at 71-74 (tax-aware sizing)"; or "Conversions: your bracket
  (tax-aware sizing found nothing better)."
- The bracket select's info tip says the bracket is the starting point and the cliff guard may size each year by price; the
  `<small>` descriptor stays under 70 characters.
- US badge V137 -> V138. README feature list, `docs/architecture/cliff-plan.md` (sizing, the plan's `conv`, the outer search),
  `engine.md` where the phased-year rule changes, and the Batch 5 notes (measurements, section 9).

## 9. Acceptance tests

Hard rules (each must hold; exit 1 / test failure otherwise):
1. **No earlier depletion, snapshots:** `node tests/snapshot.js` before and after; every moved scenario has conversions on
   (and the guard on), and none depletes earlier. The five scenarios the first attempt broke are listed by name in the notes
   with their before / after ages: `std R rothConv+aca+live`, `hist R everything | real1929`, `| real1966`, `| real1973`,
   `hist R everything rich | crashFirst` (or their current names). `npm run snapshot:update` only after the list is reviewed.
2. **Plans that do not convert are byte-identical:** every snapshot scenario with conversions off unchanged; `tests/plan_off_anchor.js`
   identical; `bench_runs` workload (conversions off) unchanged in output.
3. **The depletion sweep** (`tests/solver_scan.js`, conversions-on half, 384 households per mode): sized plan vs the bracket
   plan (`__test_setConversionSizing(false)`), and guard on vs guard off with sizing on: never earlier on the standard
   projection. Historical / Monte Carlo rates and per-path counts reported, not gated.
4. **The gap table** (`node tests/solver_gap.js --objective endValue`, both lengths): the sized plan's after-tax end value in
   each case is at least the best flat bracket's (CA at 100: 24%; TX and NY: 12%), and table 1-2 reprinted against the
   reference; a new column for the sized plan (m chosen, targets used, converted total).
5. **The one-dollar test** (Vitest, hand-computed): a household in a flat-rate year (no line in reach, no premium) where a $1
   larger conversion changes the score by exactly `lambdaConv - marginal rate` (literal expected values, no engine-computed
   expectation).
6. **The bridge check** (Vitest): a household at 52 whose 32% target would leave the taxable bridge short of the years to 59.5
   is not offered it, and the 22% target still is; removing the check makes the test fail.
7. **`apply` reproduces `choose`** for sized plans (rows identical), and a historical path follows the named targets
   (a line target re-sized on the path's own MAGI).
8. **M17 fill clamp:** if a sized natural year can be followed by a guard fill (5.1 step 3 makes it reachable), add the test
   written in Task 1 Step 5 of `docs/superpowers/plans/2026-10-08-review-followups.md`, proven red on deleting the clamp line;
   if no household reaches it, record that in the notes.
9. Unit coverage of each target kind (bracket, under a ceiling line, over a floor, none, the fallback in `apply`), the tie
   rule, the explicit-schedule exemption, and the plan's report.

**Guards in `npm test` (3C item 5), builder's call recorded:** `solver_scan.js` is about 800,000 projections (tens of
minutes) and `solver_gap.js` about 5 minutes with its 200,000-evaluation reference: neither joins `npm test` whole. A new
`tests/conversion_sizing.js` joins it: the conversions-on, standard-projection part of the scan grid (384 households, sized vs
bracket, the depletion rule only), target under 60 s; measured and stated in the notes, and the owner decides if it is over.
The full scan and the gap table stay manual and are re-run for every lambda-driven change (steps 4 and 5).

## 10. Performance

- **Projection timing gates** (`tests/bench_runs_interleaved.js`, `tests/bench_solver.js`): +5% on the no-cliff workload
  (it has conversions off: no new work but the sizing switch test), +30% on the ACA case, against `b544934`.
- **Planning time per input change** (new measure, `refreshCliffPlan` on the gap households and the default with conversions
  on): today 7-18 ms (measured 2026-10-24, a scratch Playwright script, median of 9, quantized to 1 ms). Sized: the bracket
  plan plus nine choose runs (each about 5 ms, more in years with a sized phase) is expected around 60-120 ms on the slowest
  households. Gate: under 150 ms median on the slowest gap household; above that the owner decides (a coarser grid, or
  moving the search to `renderDeferred` with the bracket plan shown first).
- Why per render and not only on Optimize: decision 1. The search is limited to plans that already convert; everything else
  pays nothing.

## 11. Code sites (at `b544934`; re-read when building)

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

## 12. Builder's calls (made by the spec author, for the owner to check)

1. The choice is made at the converged bracket phase and the target held with the amount re-sized per pass (5.1).
2. Explicit per-age schedules (`appliedRothSchedule`, optimizer overrides) switch sizing off for those ages (4).
3. Ties go to the smaller conversion; a larger target must win by more than $1 (5.1).
4. The `m` grid `[0, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]` (7); lambdaConv clamped at `LAMBDA_MAX` (0.6).
5. Floors as "just over" targets read the way `yearPlanCandidates` reads them; the 0% long-term gain band is priced by
   `taxFor` but is not a target (named gap).
6. The bridge check's need and accessible money as in 5.4 (undiscounted, today's dollars, from next year to 59.5).
7. `apply` falls back to the user's bracket when a target does not exist that year (6).
8. The deduction lower bound kept (5.6).
9. Guards: a new fast `tests/conversion_sizing.js` in `npm test`; the scan and gap table stay manual (9).
10. The planning-time gate of 150 ms (10).
11. `lambdaEstimate`'s IRMAA sample step left as it is (decision 4); recorded as a known bias the search absorbs.

## 13. Left to the builder

The exact phase bookkeeping (where the sized phase's record lives among `naturalRec` / `trialRecs`, the replay), the names
of the new fields and helpers, the shape of `convIntents` entries beyond section 5.5's content, the test households beyond
those named, and the wording of the summary clause within section 8.
