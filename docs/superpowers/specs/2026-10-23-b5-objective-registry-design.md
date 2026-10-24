# Batch 5 step 2: the optimizer's objective registry (US; notes for Canada's 4B)

Status: design, awaiting the owner's approval. No plan or code until then.
Base: `d8e3cee` (origin/main). Inputs: `docs/next-batches-plan.md` "Batch 5: optimizer" (items 2-4, the 3C redesign
notes, 13.3) and step 0's results (commit `10acc51` on `claude/b5-gap-remeasure-796afa`, unmerged: "Batch 5 step 0:
re-measured gap").

## 1. Why

The US planner ranks plans three different ways today:

| Where | Ranks by | Code |
|---|---|---|
| The cliff plan (the automatic plan inside every run) | Rule A: later depletion, then the after-tax end value by more than $1, then fewer intents | `planCandidateBetter`, `afterTaxEndValueUS` (`src/us/core/cliff-plan/solver.js`), `computeCliffPlan` |
| The per-year and multi-lever optimizers | Lifetime tax + healthcare, in **the dollars the screen shows** (real or nominal) | `rothScheduleCost` (`src/us/core/optimizer/roth-schedule.js`), `optimizeMultiLever` |
| The flat-bracket card ("fill to X% every year") | Lifetime tax alone (no healthcare), display dollars | `computeRothOptimizer` (`src/us/ui/results/roth-optimizer.js`) |

Canada's meltdown card already ranks by the after-tax estate (7N N8). Step 0 showed the cost of the mismatch: lifetime tax +
healthcare ignores the tax still owed on traditional balances at the end, so a plan that converts nothing can "win" (the CA
couple at 75 converts 0 and leaves 4.2M in traditional), and the two fair measures can disagree in direction (CA at 100:
the reference is 80k better on the old score, 140k better counting the end tax undiscounted, and 75k worse on the end
value). Steps 3-5 (the outer search over `m`, the
stored plan with Apply refinement, retiring `optimizeMultiLever`) each need one score, and the cliff plan running inside
each of their trials already uses one. `optimizeMultiLever` has no objective hook (`rothScheduleCost` is fixed), and its
score changes with a display toggle.

## 2. Decisions (owner, 2026-10-23)

1. **The default objective is the after-tax end value** (step 0's recommendation). This supersedes the plan's "the default
   stays today's tax + healthcare so existing results do not move" (item 2 of the Batch 5 list).
2. **Exactly two objectives:** the after-tax end value (default) and lifetime tax + healthcare. Dropped from the plan's list:
   ending net worth before tax (counts a traditional dollar like a Roth dollar; Canada dropped it in N8), legacy (it *is* the
   after-tax end value), IRMAA, ACA subsidy, RMDs and healthcare as targets of their own (each is gamed by a search: fewest
   RMDs converts everything at any tax; least IRMAA never crosses a tier that would pay), and the balanced blend (arbitrary
   weights; the end value already prices tax now against tax later in dollars). Components appear as a **breakdown** beside
   a result, never as a target.
3. **No selector and no new saved field in step 2.** The objective is a parameter of the engine functions; the UI uses the
   default. A saved `objective` field and a selector come with step 4's card.
4. **The flat-bracket card moves to the registry**: it suggests the bracket with the highest after-tax end value (among
   brackets that do not run out earlier), as Canada's card does. Year-to-year conversion sizing is step 3's job; the flat
   setting stays an input and a baseline the search must beat.

## 3. The two objectives

The registry's ranking (`objectiveBetter`, section 4) puts **depletion first** (Rule A) under both: among candidates, a
later depletion age (or none) always wins, whatever the score. A search that ranks with it and keeps the user's current
settings as a candidate therefore never returns a plan that runs out earlier. How each step-2 caller honours Rule A:
- **The cliff plan:** already ranks this way (its candidates include `off`, the unsteered run).
- **The flat card and `optimizeMultiLever`** (the per-year search is its Roth-only wrapper): neither has the current plan
  among its candidates (the card forces the ladder on in every candidate), so both keep today's **guardrail** against
  the current plan (`selected`): a candidate that runs out earlier than `selected` is never picked while any candidate
  does not. Among the candidates that pass, the card picks with `pickBest` (section 4); `optimizeMultiLever` keeps its
  strictly-better-score steps so that, under `lifetimeCost`, it reproduces today exactly (section 4, caller 2), as the
  measuring reference until step 5 retires it.
- **When no candidate passes the guardrail** (every one runs out earlier than the current plan), both pick depletion first
  (the latest depletion, then the score). Today they pick the best score regardless of depletion (`multi-lever.js` lines
  146 and 154, `roth-optimizer.js` line 34). *My call:* this is the only case where the multi-lever search does not
  reproduce today, and the card's "without shortening how long the portfolio lasts" sentence is not shown then.
- **The outer search of step 3** ranks with `objectiveBetter` and has the current settings among its candidates.

**`endValue` (default): the after-tax end value.** Exactly `afterTaxEndValueUS(ctx, sim)` as it is today (spec of the cliff
plan, section 5): Roth, taxable (stepped-up basis), cash and home equity at face value, the traditional balance (inherited
traditional included) net of ten slices of tax, each added to the last year's own return (its law, its filing status;
single after a death), priced under `ctx`, the context of the run that made `sim`.
- Score: the nominal value (higher is better). Ranking uses it with the cliff plan's $1 tolerance, in nominal dollars, so the
  cliff plan's choices stay byte-identical.
- Shown in today's dollars: the value divided by `Math.pow(1 + pct(inputs.inflation), lastRow.year)`. One positive constant
  per run, so the ranking is the same in either unit.
- Known, accepted (recorded, not changed here): the US end value does not subtract non-mortgage loans still open in the last
  year (`row.loanBalance`); the loan schedules never depend on the plan (payments come from the original principal and term),
  so this cannot change a ranking, only the shown figure. Canada's `afterTaxEstate` starts from `last.total`, which does
  subtract them.

**`lifetimeCost`: lifetime tax + healthcare.** `sum over rows of (row.tax + row.healthcare) / Math.pow(1 + pct(inputs.inflation), row.year)`,
in today's dollars, undiscounted, **always real** (never the display mode). Summed in that order, one term per row: the very
double `computeCliffPlan`'s `measure` and `rothScheduleCost(sim, inputs, 'real')` give today (both compute
`(tax + healthcare) / Math.pow(1 + pct(inflation), year)` and add from 0). Score: minus the cost (higher is better).

**The breakdown** (every result carries it, both objectives, all in today's dollars): `lifetimeCost`, `lifetimeTax`
(`row.tax`), `healthcare` (`row.healthcare`), `rmds` (`row.rmd`), `endTax` (the ten-slice tax, `max(0, tax)`), `endValue`,
and `depletedAge`. Each row sum is deflated per row as above. IRMAA and the ACA subsidy are not row fields today (both are
inside `healthcare`; `healthcareCost` returns only the sum); splitting them out is not part of step 2 (a later breakdown
addition, if wanted, adds row fields and moves snapshots).

**Runs it scores.** Standard (deterministic) runs only: Rule A chooses on the deterministic projection, and historical and
Monte Carlo rates are reported, never used to choose. (A historical row's real value divides by `row.cumFactor`, not the
inflation input; the registry does not score such runs and says so in its comment.)

## 4. The interface

**Where.** Country-free parts in a new shared engine module, `src/shared/core/analysis/objectives.js`; the US pricing in a
new `src/us/core/optimizer/objectives.js`. *(My call: this split lets Canada's 4B add its own pricing module instead of a
second registry; see section 7.)* Both are engine modules (`core/optimizer/` and `core/analysis/` are seeds of
`tests/engine_purity.js`): no store or store-layer import, context first where a function prices with tax law. Every
top-level `const` holding an object (`US_OBJECTIVES`, each objective object, frozen or not) is registered in
`tests/engine-purity.json` with kind `"constant"` in the same commit, as `SENSITIVITY_LEVERS` is. An initializer that
references other bindings (`{ endValue, lifetimeCost }` shorthand) is not inert for the load-time guard
(`scripts/lib/load-time.js`): it carries a `// load-time: <reason>` comment, or the objectives are written inline in the
literal.

**The shape** (names are the builder's to refine; the contract is not):
- An objective is `{ id, label, sense: 'max' | 'min', value(ctx, sim), score(ctx, sim) }`. `value` is in the objective's
  natural unit (`endValue`: the nominal end value; `lifetimeCost`: the positive real cost); `score` is `value` for `max`
  and `-value` for `min`, so higher is always better.
- `gainInTodaysDollars(objective, ctx, winnerSim, baseSim)` (US): how much better the winner is, in today's dollars, for
  the cards: `endValue`: `(value(winner) - value(base)) / Math.pow(1 + pct(inputs.inflation), lastRow.year)` (both runs
  share the last year: the levers never change the plan's length); `lifetimeCost`: `value(base) - value(winner)` (already
  real). One context prices both (pricing reads only the inputs, the tax year and the tax factors).
- `US_OBJECTIVES = { endValue, lifetimeCost }` and `DEFAULT_OBJECTIVE_ID = 'endValue'` (US module). Unknown ids throw.
- `objectiveBreakdown(ctx, sim)` (US): the breakdown of section 3, plain numbers.
- `pickBest(cands, preferred)` (shared): the one tie rule for picking from a list, since a $1 tolerance is not transitive
  and a pairwise scan would depend on order. Take the candidates with the latest depletion (null = never); among them
  `M` = the highest score; the tied are those scoring at least `M - 1`; return `preferred(tied)` (the caller's tie-break).
  The flat card and step 3's outer search use it. The cliff plan keeps its sequential `planCandidateBetter` scan, which
  is today's behaviour and byte-identical (its few candidates in a fixed order).
- `objectiveBetter(a, b)` (shared): `a` and `b` are `{ depletedAge, score }`. Later depletion (null = never) wins; else `a`
  wins when `a.score > b.score + 1`; otherwise false (a tie, which the caller breaks). This is Rule A's first two steps.
  `planCandidateBetter` keeps its signature and input (`{ depletedAge, value, n }`, which `tests/cliff_plan.js` T5.1 and
  `window.__test_planCandidateBetter` pass, and the report's `value` field): it maps `value` to `score` and decides
  `objectiveBetter(a, b)` true, else `objectiveBetter(b, a)` false, else fewer intents, the same decisions it makes today.
- `afterTaxEndValueUS` is split so the end tax is readable (`endTaxUS(ctx, sim)` returning `max(0, tax)`, and the value
  computed from it with the same expression), its result byte-identical.

**Callers in step 2:**
1. **The cliff plan** (`computeCliffPlan`): `measure` takes `value` and `cost` from the registry (`endValue.value` and
   `lifetimeCost.value`), both priced with `runCtx` (the plan-`off` standard context it prices with today, not each
   candidate's own `choose` / `apply` context), so the figures are byte-identical by construction; `planCandidateBetter`
   goes through `objectiveBetter`. The cliff plan always ranks by `endValue`
   (its documented rule) and names it explicitly, so a later step can pass another objective with a one-argument change.
   No row, plan, report figure or snapshot moves.
2. **`optimizeMultiLever` / `optimizeRothLadderPerYear`**: `search.displayMode` is replaced by `search.objective`, an id that
   is required (a missing or unknown id throws, as a missing `displayMode` does today; the UI passes the default). Each
   trial is scored with `objective.score(trialCtx, sim)`, `trialCtx` the context its run used (the user's cliff plan pinned,
   as trials run today). Every comparison (lines 92, 100, 147, 155 at `d8e3cee`) keeps today's rule on the score (the
   guardrail, then strictly higher; negation is exact, so `-x > -y` decides as `x < y`), so with `lifetimeCost` it
   reproduces today's real-mode results exactly (section 6) whenever some run passes the guardrail. It holds the
   winning trial's `sim` in a local beside `bestOverall` (no extra run, `evalCount` and `budgetExhausted` unchanged) only to
   compute the breakdown at the end; the `sim` is never returned or stored. **Return shape:** today's fields with `cost`
   replaced by `objective` (the id), `score`, `value`, `gain` (`gainInTodaysDollars` against `selected`, priced with
   `contextFor(base, { rothBracketByAge: null, withdrawalMixByAge: null })`, which builds a context and runs nothing) and
   `breakdown` (plain numbers, from the pinned-plan trial, not an Apply re-plan; step 4 changes how trials run).
   Consumers: `roth-optimizer.js` (the cards read `gain` where they read `currentCost - opt.cost`; the Apply gate
   becomes `gain > 1`, today's dollars); `optimizerState.lastMultiLeverRun.savings`, which holds `gain` under its existing
   name (`roth-optimizer-controls.js` "Apply" and the test hook's `savings: 2`, `install-test-hooks.js` line 377, keep
   their meaning: "the search found more than $1"); the analysis bundle (below).
3. **The flat-bracket card** (`computeRothOptimizer`): the guardrail against `selected` (today's), then `pickBest` on
   `endValue` among the brackets that pass (or among all, depletion first, when none passes; section 3). *My call:* the
   tie-break keeps the user's current bracket when it is among the tied, else the lowest tied bracket. As today, every
   candidate forces the ladder on, and an applied per-year schedule still wins inside its ages
   (`roth-conversion.js` lines 166-170), so with the ladder off or a schedule applied the "(current)" row is the bracket
   setting, not the current plan; the guardrail still compares with the current plan. It keeps the lifetime tax and end
   assets columns and adds an after-tax end value column.
   The table stays in the display mode as its other columns are (`displayValue`, as Canada's estate column is); the
   ranking does not depend on the unit. The shared `renderRothOptimizer` writes the summary and four cells per row to match
   the US header (`src/us/index.html`), so the US needs its own header cell, row writer and sentence (Canada's
   `annotateRothOptimizer` is one pattern; the builder chooses).
4. **The optimizer cards' figures**: the per-year and multi-lever cards report the end value gained over the current settings
   (today's dollars) instead of tax + healthcare saved; the flat card names the end value as its reason. Minimal factual
   text only; the wording and layout are step 4's.
5. **`rothScheduleCost` is retired**, with its display-mode parameter. Its callers move to the registry:
   `roth-optimizer.js`; `src/us/ui/install-test-hooks.js` (`__test_rothScheduleCost`, and `usAnalysisPerMode`'s
   `scheduleCost`, read by the analysis bundle and `tests/analysis_parity.js`); `tests/cliff_plan.js` F1, which uses
   `__test_rothScheduleCost` as a wrapped hook to prove `ensureTestPlan` re-plans on a tax-year change; the helper
   `tests/unit/helpers/us-plan.js` and its users (`multi-lever-mix.test.js`, `multi-lever-optimizer.test.js`,
   `roth-optimizer-per-year.test.js`); `test_optimizer_ui.js`; `tests/solver_gap.js`; comments in `withdrawals/mix.js`
   and `test_apply_optimizer_schedule.js`; `tests/bench_heavy.js` (calls `__test_optimizeRothLadderPerYear`); docs
   `cliff-plan.md` and `test-inventory.md`. `roth-schedule.js` keeps the search constants and drops its `displayValueOf`
   import. The analysis bundle (`usAnalysisPerMode`, `src/us/ui/install-test-hooks.js` lines 84-99, and the shared
   bundle's `computeRothOptimizer` result) passes the default objective and serializes the new fields, so
   `tests/analysis_parity.js` cannot compare across this commit (the fields are renamed and the choices move): it is
   compared against a base at or after it. *My call:* the replacement hook is
   `__test_objectiveScore(id, sim)` (and `__test_objectiveBreakdown(sim)`), wrapped with the same `ensureTestPlan` re-plan;
   `__test_optimizeMultiLever` / `__test_optimizeRothLadderPerYear` and the helper take the objective explicitly, and
   today's mechanics checks pass `'lifetimeCost'`.

**For steps 3 and 4 (not built here).** The outer search over `m` scores each full projection with `score(ctx, sim)` and
ranks with `objectiveBetter`, the user's current mode and `m = 0` among the candidates. The registry scores a finished run
and never runs one: *how* a trial runs (the user's cliff plan pinned, as optimizer trials do today, or re-planned, as Apply
does) is the caller's choice, and step 4 scores candidates the way Apply runs them (step 0, finding 4) by building its trial
contexts that way. When step 4 adds the saved `objective` field, the cliff plan, the search and the card all read it.

**Speed.** `endValue` adds two `taxFor` calls per scored run (one projection is about 1-4 ms); no hot-path change. The
breakdown is computed once per reported result, not per trial.

## 5. What moves

- **Nothing in the projection.** Rows, `depletedAge`, the cliff plan's choice and report, golden math and every math
  snapshot stay byte-identical (the cliff plan already ranks by this end value).
- **What the optimizer cards suggest and report** (on demand, not in the math snapshots): the multi-lever and per-year
  searches now maximize the end value; their figure becomes end value gained. Users in nominal display mode also stop
  getting a different answer from users in real mode.
- **The flat card's suggested bracket** can change, and it runs when the card opens. `tests/snapshot_ui.js` opens every
  `<details>`, so the new column and sentence move `tests/snapshots/ui_us.json`'s hashes for every captured scenario that
  shows the card: an intended move, updated with `npm run snapshot:update` and named in the commit.
- **Tests that assert the old score's choices**: the multi-lever Vitest suites (`multi-lever-*.test.js`,
  `roth-optimizer-per-year.test.js`, for example "the smoothed-withdrawals A/B picks the cheaper"), `test_optimizer_ui.js`,
  `test_apply_optimizer_schedule.js`. Each check either passes `objective: 'lifetimeCost'` (when it tests the search
  mechanics) or is restated for the end value (when it tests the default's choice). `test_optimizer_ui.js` check 1 ("with a
  1-year window the per-year search is never worse than the flat card's starred pick") compares the two cards, so it is
  restated with both on `endValue`: the per-year winner's score is at least the starred bracket's score less $1 (with one
  year, the per-year search tries every bracket the card does plus 0, and picks the strict maximum among those that pass
  the guardrail; the card picks within $1 of that maximum).
- The analysis bundle's fields and figures (section 4, caller 5); `tests/analysis_parity.js` is not comparable across this
  commit.
- User-facing: US version badge bump, README feature list (the optimizer cards rank by the after-tax end value).
- Docs: `docs/architecture/engine.md` gains a short "Objectives" entry (the registry, its two objectives, Rule A and
  `pickBest`); `cliff-plan.md` and `test-inventory.md` change as listed; the Batch 5 notes in `docs/next-batches-plan.md`
  record the measurements. The two new modules need line-1 purpose comments and `npm run analyze` (the module map).

## 6. Tests

- **New Vitest suite** `tests/unit/us/objectives.test.js` (counted, exact):
  - Hand-computed: a synthetic `sim` (literal rows; `estate` with `traditional: 0` and a non-null literal `profile`, since
    `afterTaxEndValueUS` returns 0 without one; inflation 0 and 2%) gives literal `lifetimeCost`, `lifetimeTax`,
    `healthcare`, `rmds`, `endValue` figures; `objectiveBetter` cases (later depletion beats a higher score; a $1 difference
    ties; $1.01 wins; null depletion beats any age); `pickBest` cases (a chain a ties b ties c with a beating c: the tied
    set is fixed by the maximum, not by order; the preferred tie-break; depletion groups).
  - **From the rows the UI shows:** for a few real households (the default; the ACA early retiree; an IRMAA couple), run the
    projection and recompute each breakdown figure in the test by summing the run's own rows (`r.tax`, `r.healthcare`,
    `r.rmd`, the per-row deflator written out), and `endValue.value` against `afterTaxEndValueUS` (both nominal; the
    breakdown's `endValue` against it divided by the last row's deflator, written out); equal with `toBe`.
  - `lifetimeCost` equals today's `rothScheduleCost(sim, inputs, 'real')` reduce, written out in the test (the old function
    is deleted, so the test carries its expression), and `computeCliffPlan`'s reported `cost` for the same run.
- **Unchanged-by-construction guards:** `npm test` (golden, snapshots, `tests/cliff_plan.js`, `tests/end_value_us.js`) passes
  with no baseline change except the flat card's UI snapshot hashes (section 5); `tests/engine_purity.js` passes with the two new modules.
- **The old search reproduced:** `optimizeMultiLever(..., { objective: 'lifetimeCost' })` returns the same schedules, smooth
  choice and cost (its `value`) as the tree just before the change (`d8e3cee`, or step 1's merge if that lands first)
  in real mode on the six `tests/bench_optimizer.js` scenarios (a one-off comparison recorded in
  the batch notes; the Vitest suites keep a smaller pinned case).
- **`tests/solver_gap.js`** takes `--objective endValue|lifetimeCost` (default `endValue`): the reference optimizes that
  objective, and its tables rank and report through the registry (`window.__test_objectiveBreakdown`, a new US hook, and
  the objective passed to `__test_optimizeMultiLever`). Step 0's table-2 score (lifetime cost plus end tax, undiscounted)
  stays as a script-local sensitivity column. Done includes one run with `--objective endValue` at both plan lengths,
  recorded in the Batch 5 notes: the reference optimizing the end value is the measurement step 0 could not make.
- **Prerequisite:** `tests/bench_optimizer.js` and step 0's version of `tests/solver_gap.js` (the table-2 column, the
  pinned and re-planned replays) exist only on step 0's unmerged commit `10acc51`. Step 0 merges before this is built, or
  the build branch starts from it.
- The CLAUDE.md checklist as usual (`npm run test:unit`, a shuffled run of the new suite, both Node versions for any
  comparison of engine output, `npm run test:ui` for the cards).

## 7. Notes for Canada's port (4B)

- Canada's pricing module mirrors the US one: `endValue` = `afterTaxEstate(ctx, sim)` (already the Canada card's ranking;
  it taxes the RRSP/RRIF and the deemed gains at 50% inclusion on one final return, subtracts probate, starts from
  `last.total`); `lifetimeCost` = `row.tax + row.oasClawback - row.benefits + row.healthcare` deflated per row (the rows
  report tax gross of benefits and without the OAS recovery, so this is the net tax the year paid; check whether Canada's
  `healthcare` and `ltc` belong in the sum, which the current card leaves out).
- The ranking, the registry shape, `objectiveBetter` and `pickBest` are the shared module's. The Canada card changes in
  three ways: from a strict `>` to `pickBest`'s $1 tolerance; its no-candidate-passes fallback becomes depletion first
  (section 3); and it ranks nominal values instead of display-mode ones (`displayValue(...)`, its line 23; the ranking is
  unit-independent except for where the $1 tolerance falls).
- The breakdown gains Canada's components (`oasClawback`, `benefits`); `rmds` keeps its key (Canada's RRIF minimum is
  already the row field `rmd`).

## 8. Interplay with step 1 (162(l) settlement, in review)

The registry scores whatever the rows and the estate record. Step 1 settles a year's deduction at the final draws and moves
the cash difference into the next year's flow (the last year: the estate). Corrected 2026-10-24 by the step 1 session:
in step 1, `row.tax` and `row.healthcare` stay what the year paid; a settled (held) year adds flat fields `taxSettled`,
`healthcareSettled`, `seDeductionA/B` and `seSettlement`, the next row carries `seSettlementIn`, and the last year's
settlement is added to `sim.estate.cash` (so `afterTaxEndValueUS` already sees it). On the owner's instruction, step 1
adds one shared row helper (`rowCost(r)` and `rowTax(r)` in `src/us/core/projection/row-cost.js`, commit `f92efdb` on
its branch) returning `taxSettled + healthcareSettled` where a row has them and `tax + healthcare`
otherwise, plus a tax-only twin; `computeCliffPlan`'s `measure`, `rothScheduleCost` and the flat card's `lifetimeTax` use
it.

So, if step 1 lands first, the registry reads rows only through that helper: `lifetimeCost` sums the helper's total (per
row, deflated as in section 3), the breakdown's `lifetimeTax` sums its tax twin, and its `healthcare` sums
`healthcareSettled` where present, else `healthcare`. On rows without settled fields this is the same double as section
3's expression, so every byte-identity claim stands. If this registry lands first, step 1 points the registry's row sums
(rather than `measure` and `rothScheduleCost`, which no longer compute their own) at its helper. Either way the
unit check "computed from the rows the UI shows" sums the same helper in the test.

## 9. Out of scope

The selector and the saved field (step 4), UI wording beyond the minimal figures above, conversion sizing and the outer
search (step 3), the stored plan and Apply refinement (step 4), retiring `optimizeMultiLever` and the age-keyed schedules
(step 5), IRMAA and subsidy row fields, Canada (4B).

## 10. Calls made in this design (for the owner to check)

- The split into a shared ranking module plus a US pricing module (section 4).
- Ties within $1 go to the caller's tie-break (the cliff plan: fewer intents, its scan unchanged; the flat card and step 3:
  `pickBest`, the card preferring the current bracket, else the lowest).
- `optimizeMultiLever` keeps its guardrail-then-strict steps until step 5, so it stays the measuring reference and
  reproduces today under `lifetimeCost`; it reports the winner's breakdown from the kept trial run, never returning the run.
- When no candidate passes the guardrail, the flat card and `optimizeMultiLever` pick depletion first instead of today's
  best score regardless of depletion (the only case where the old search does not reproduce).
- The cards report `gain` in today's dollars; the Apply gate is `gain > 1`.
- A missing objective throws; the test hooks take the objective explicitly; the flat card's table stays in the display mode.
- The cliff plan always ranks by `endValue` until step 4 adds the saved objective.
- `rothScheduleCost` is deleted rather than kept beside the registry.
- The end value's figure keeps today's US definition (open non-mortgage loans not subtracted), since it cannot change a
  ranking.
