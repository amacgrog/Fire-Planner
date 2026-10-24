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
standard snapshot scenario and no scan household depletes earlier than its bracket run on the deterministic projection;
historical movers are explained by cause (decision 5); plans that do not convert are byte-identical.

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
   guard's choices move only where a sized conversion changes the year it steers. `m = 0` values future tax savings at
   nothing: it converts only where a conversion pays for itself this year (a fill just over a floor whose premium drop exceeds
   its tax), otherwise nothing.
6. **A target that cannot be carried falls back to the user's bracket** with today's ceiling, the same in `choose` and
   `apply` (for example a "just under IRMAA tier 2" year whose income without a conversion is already over the line, on a pass
   or on a historical path). The bracket is the baseline wherever the plan's target cannot be carried (section 6).
5. **Snapshot depletion: a split gate.** Standard snapshots never deplete earlier (hard); historical movers are explained by
   cause, and a bridge drain stops for the owner; a path-balance bridge test in `apply` counts as an eligibility fallback,
   built only if a drain shows the need (section 9, rule 1). This supersedes the plan's carried-over 3C line "no snapshot
   scenario depletes earlier" for historical scenarios, as the cliff-plan spec's section 8 already did.

## 3. Goals, non-goals, anti-goals

Goals
- Per-year sizing by `score(c) = c x lambdaConv - (tax(c) - tax(0)) - (premium(c) - premium(0)) - (irmaa(c) - irmaa(0))`
  over a fixed set of targets, with lambdaConv = `min(LAMBDA_MAX, max(0, m x rateHat))`.
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

Sizing runs in a year when all hold: the run is `choose` with a sizing multiplier (the context's `plan` carries it as
`{ intents: {}, conv: {}, m }`; a `choose` run with `plan` null, as today, does not size) or `apply` with a conversion intent
for that age, `convertsThisYear` (enabled and inside the window), the test switch is not set (`ctx.test.convSizingOff`,
section 7), and no explicit per-age schedule governs the year
(`ctx.overrides.rothBracketByAge` has no entry for the age and `inputs.appliedRothSchedule` has none either: an explicit
schedule is the user's or the optimizer's choice and wins; builder's call recorded, section 12). Every other year, and every
`off` run, is today's code path, byte for byte.

## 5. The per-year sizing (choose mode)

### 5.1 When the choice is made

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

### 5.2 Targets

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

### 5.3 The score

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
  `incomeAt`, lifted out of `lambdaEstimate` into a helper both use), undiscounted.
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
slightly low for a year without traditional draws (5.2's sized targets add the draws; the bracket target keeps today's
overshoot by the draw, which is the user's setting as it runs today); closing the item as "kept, documented". Builder's call (section 12).

## 6. The plan and `apply`

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

## 7. The outer search (in `computeCliffPlan`)

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
   literal computed in 5.3's evaluation order. No engine-computed expectation, no tolerance.
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

## 10. Performance

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

## 13. Left to the builder

The exact phase bookkeeping (where the sized phase's record lives among `naturalRec` / `trialRecs`, the replay), the names
of the new fields and helpers, the shape of `convIntents` entries beyond section 5.5's content, the test households beyond
those named, and the wording of the summary clause within section 8.
