# Per-year withdrawal and conversion solver (new Batch 3C): design

Status: approved in brainstorming with the owner, 2026-10-06. Next step: implementation plan (writing-plans).
Scope of this spec: the prerequisite Rule of 55 PR and Batch 3C (US). Batches 5, 4A and 4B are sketched only so
that 3C does not block them; each gets its own spec.

## 1. Why this redesign

**Why 3C was deferred (owner decision, `docs/next-batches-plan.md`, "Execution order").** 3C decides when to keep
MAGI under a cliff. Batch 7 added most of the cliffs it must price (senior deduction, child tax credit, state
income tests, Canada's benefits, and in 7O the Medicaid and 100%-of-FPL lines), so measuring the old Auto / Always /
Never cap policy before the tax model settled would have been wasted. 7O also handed 3C "design B" (fill to the
Medicaid line instead of staying under it).

**The current optimizer is too slow.** `optimizeMultiLever` minimizes lifetime real tax + healthcare (with a
"no earlier depletion" guard) by cyclic coordinate ascent over (year x candidate) for the Roth and mix levers, from
6 starts, twice (smooth on/off), up to `ROTH_PER_YEAR_EVAL_BUDGET` = 8,000 whole-plan `simulate()` calls. Measured
on the 7O tip (bb798d4), Chromium via Playwright:

| Scenario | One `simulate()` | Full optimizer (Roth + mix + smooth) |
|---|---|---|
| Default | 2.4 ms | 5.4 s, budget exhausted (search unfinished) |
| Retire 50/50, ACA on, California | 12.9 ms | 208 s, 7,032 evaluations |

**Four mechanisms answer one question.** The live mix, the per-year mix/Roth schedules, the smooth toggle, and the
planned `stayUnder(k)` plus 7O's fill-to-line all decide "where should this year's MAGI land, and from which
accounts". This design replaces them with one per-year decision and one parameter.

**Why not optimize only the short term.** A conversion always raises this year's cost; its value is entirely later
(RMDs, IRMAA, survivor single-filer rates). A one-year picker therefore never converts, and the code records a
one-year mix picker raising lifetime cost by about $900k (comment above `pickLiveWithdrawalOrder`). The future must
be represented, but by a per-year estimate (lambda), not by thousands of projections.

## 2. Decisions (owner, 2026-10-06)

1. The optimizer's output is a **policy** (a few parameters the engine follows in every run: standard, historical,
   Monte Carlo), not an age-keyed schedule. Close to optimal and fast (seconds) beats exact; avoid overfitting.
2. The single-scenario Optimize -> Apply button may run a deeper search for that scenario; its result is always
   applicable (it starts from the live policy and keeps the best found, so it cannot score worse on the standard
   projection). The card shows historical and Monte Carlo success rates for both, since the refinement can lose
   there. (Batch 5.)
3. Results are deterministic (fixed grids, fixed candidates, no random starts; Monte Carlo already seeded).
4. lambda is **estimated per year from each path's own balances** (option 2), times a multiplier `m` that the
   outer search tunes. Not a constant, not tuned on Monte Carlo.
5. Order: **Rule of 55 PR -> 3C -> 5 -> 4A -> 4B -> 6 -> 8** (5 moves before 4).
6. 3C mode scope (option b): the **cliff guard in every mode**; the **full solver opt-in** behind the renamed
   live-mix toggle. Whether the full solver becomes the default is decided in 5 after measurement.
7. The lambda estimate averages **three sample future years** (first RMD year, a midpoint, a late survivor year).
8. Performance gate (option b): **+5%** for households with no cliff in reach; **up to +30%** for households with
   one in reach.
9. New checkbox **"Cliff guard", on by default**, old saves included.
10. The Rule of 55 per-partner election and the Partner B 72(t) field fix ship as a **separate PR before 3C**.
11. Discounting IRMAA for its two-year lag goes to the backlog (Open items).

## 3. Prerequisite PR: Rule of 55 per partner, 72(t) field visibility (no number change)

Bounded change; it gets its own short design approval before implementation.

- **Bug:** `syncControls` sets `hidden = !!state.singlePerson` on every `[data-partner-b]` element
  (`Planner_US.html` ~13205) after `syncFieldDom` applied the registry `reveals`, so `sepp72tK401BAgeField` and
  `sepp72tIraBAgeField` show even when their 72(t) box is unchecked. Fix: the partner-B loop must not un-hide an
  element its registry `reveals` hides (or re-apply the reveals after the loop). Test in a root `test_*.js`.
- **Rule of 55 per partner:** replace the household `ruleOf55Enabled` with `ruleOf55A` / `ruleOf55B` (bool,
  `FIELDS`, MCP, `normalizeState`, `tests/legacy_state.js`). One box per partner covers that partner's traditional
  and Roth 401(k) (same employer plan; existing stated assumption that the 401(k) is the last employer's plan).
  Rule of 55 never applies to IRAs. The box is enabled only when that partner's retirement age is 55 or more; at
  59.5 or more it is disabled with a note that there is no penalty to avoid. A 72(t) election on a 401(k) whose
  owner has Rule of 55 shows a note that the 72(t) does nothing there. Migration: an old save with
  `ruleOf55Enabled: true` sets both boxes, which reproduces today's numbers (the engine already requires
  retirement age >= 55 per partner, `rule55Applies`); the old key is deleted.
- Acceptance: every snapshot byte-identical; UI snapshot regenerated for the new controls only; 390x844 check.

## 4. Architecture (all sub-projects)

- **Inner, per year, cheap:** pick this year's target MAGI from a few candidates and fund the need (and any
  conversion) to hit it, scored by after-tax wealth left with traditional dollars valued at `1 - lambda`.
- **Outer, whole plan, few runs (Batch 5):** search `m` (and per-phase values in the Apply refinement) with full
  projections scored by the Batch 5 objective. Roughly 20-100 projections instead of 8,000.
- Sub-projects: **3C** (this spec, US solver), **5** (outer search, Apply, objective registry, retire coordinate
  ascent and age-keyed schedules), **4A** (solver core to `shared/`, Canada kinks: OAS recovery, GIS, CCB, age
  amount; TFSA as the zero-income source), **4B** (Canada outer search; may merge with 4A).

## 5. 3C: the per-year solver (US)

### 5.1 Scoring

Each candidate draw is scored by the after-tax wealth it leaves: traditional dollars at `1 - lambda`, Roth at 1,
taxable at `1 - gainShare x tauGain` (`tauGain` from the same synthetic future year as lambda), cash and bond
principal at 1. Costs paid this year (federal and state tax, the 10% additional tax, the ACA net premium, IRMAA)
reduce it. Consequences:
- funding the need: the mix that consumes the least after-tax value wins;
- converting: a dollar moves traditional -> Roth only while this year's marginal cost is below lambda;
- cliffs: staying under wins when the credit or tier saved exceeds the extra value spent; filling to a floor wins
  when the premium removed exceeds the tax (and penalty) on the extra draw, the excess kept as cash.
IRMAA is priced in the year that causes it, undiscounted in real dollars (documented approximation; backlog).

### 5.2 Candidates and reach

Per year:
- **Reach:** the lowest reachable MAGI (need funded as far as possible from zero-MAGI money: penalty-free Roth,
  cash, bond principal, taxable basis) and the highest (all from penalty-free traditional, plus the largest
  conversion while conversions are on). Bounds include a tax gross-up, padded on the safe side. No tuned ratio.
- **Kinks** (federal, from the cliffs register in the batch notes): ACA 400% of FPL (non-enhanced), the Medicaid
  line and the 100% credit floor (`MEDICAID_RULES`, `medicaidLimit`), IRMAA tier edges, senior-deduction phase-out
  edges (through 2028), the CTC phase-out start. State-law cliffs are priced through `taxFor` but are not
  candidates in 3C (documented gap).
- **Candidate set:** the no-cap draw (what the current mode does), the nearest kink below it (stay just under), the
  nearest floor above it (fill just over), and, while conversions are on, the bracket tops above it until the
  marginal rate exceeds lambda. Only kinks inside the reach. Typically 2-4 candidates, each one draw solve plus
  `taxFor` / `acaNetCost`, never a projection.
- **Skip rule:** no kink in reach and conversions off: the solver does nothing and the year runs exactly as today.

### 5.3 lambda estimate

lambda = `m x rateHat`, `m = 1` in 3C. `rateHat` averages three synthetic future years: the first RMD year, a
midpoint, and a late survivor year. For each: grow the current traditional balance at the plan's real return to
that age, take the RMD (`rmdDivisor`), add Social Security, pensions and fixed income, take the filing status from
`filingStatusFor` for that year (a survivor files single), and read the marginal rate with the real functions
(federal + state via `taxFor`, plus IRMAA) over a finite step of about 10% of the RMD so one kink does not
dominate. Cost: a few `taxFor` calls per year. Written behind a hook (inputs and tax functions country-specific).

### 5.4 Placement in the year loop

One function per MAGI pass, after the year's fixed items (wages, Social Security, pensions, RMDs, 72(t)) and before
the draw. It returns a target MAGI; the draw is capped at it through the cap in `takeTraditional` (the 3B prototype
in `docs/batch-3c-prototype/`, re-derived against the current file) using the **corrected room**
`ceiling - magiBase - conversion` (the double counting found in the 3B exploration: the old room subtracted the
iteration's own draw estimate). A last uncapped traditional pass before home equity keeps the cap from stranding
money. Each candidate's premium is priced at its own MAGI, so the chosen one should be self-consistent and the MAGI
iteration converge in fewer passes; the iteration, `MAGI_ITER_MAX` / `TOL` and the forced-pass fallback (7O F5)
stay as safety nets. Any new mutable state follows the snapshot rules in `CLAUDE.md`. Works inside the 3B penalty
tiers and the bucket order (owner decision 1: only the stock-account step and the conversion; cash and bonds keep
their place).

### 5.5 Modes

- **Cliff guard (all modes: default order, smooth, live/tax-aware, applied schedules):** the stay-under and
  fill-to-line candidates against the mode's own draw. Controlled by `cliffGuardEnabled`.
- **Full solver:** the live-mix toggle (`withdrawalMixEnabled`, key unchanged, relabelled "Tax-aware withdrawals")
  runs the full candidate set for the draw: both stock-account orders, the cliff candidates and (two returns) the
  draw split. Replaces `pickLiveWithdrawalOrder`'s two-order rule and its `overage * 1e6` term. **Conversions are
  not sized by the solver in 3C** (amendment, section 13): they keep the bracket setting and the safe-MAGI ceiling.
- Applied schedules keep precedence over the solver (as the override does over the live mix today); the cliff
  guard still applies to them. The Apply flow is unchanged until Batch 5.

### 5.6 Accounts and penalties

The solver never picks accounts directly; every candidate is realized through the 3B primitives (`tradGroup`,
`takeTraditional`, `takeRoth`, `rothFreeCaps`, `takePenalized`, `accountStatuses`), so per-owner 59.5, Rule of 55
(per partner, 401(k)s only), exact 72(t) payments (no conversion out of a SEPP account), Roth IRA basis and
seasoning, and the Roth 401(k) pro-rata earnings all apply unchanged. Empty accounts hold a zero share and are
skipped. Conversions take IRAs first, then 401(k)s (existing; a household with an empty traditional IRA converts
from the 401(k), which assumes in-plan conversion is allowed; documented). Priorities kept: penalty-free before
penalized, cheapest per dollar in the penalized tier; Roth IRA basis before a Roth 401(k) while early; IRAs first
for conversions; pro rata among penalty-free traditional accounts on a joint return.

### 5.7 Two-return years

- **Correctness fix (first commit):** in years with two returns (unmarried couple, marry-later before the wedding;
  Partner A possibly head of household), ACA is per tax household (each partner's own MAGI against their own
  poverty line, children with the partner who claims them) and IRMAA per person (own MAGI against the single
  tiers). Today both use one household MAGI (`magiProxy`, `healthcareCost`, `conversionMagiCeiling`). Joint
  returns are unchanged (combined MAGI against joint figures is correct). Needs per-return MAGI history for the
  IRMAA lookback, inside the MAGI-iteration snapshot.
- **Solver lever:** in two-return years the solver tests each return's kinks and three draw splits between the
  partners' accounts: pro rata (today), A first, B first.

### 5.8 Inputs and display

- `cliffGuardEnabled` (bool, default true): `FIELDS` entry, `normalizeState` guard, MCP, `tests/legacy_state.js`
  case; info bubble written from what the code does.
- `withdrawalMixEnabled` relabelled "Tax-aware withdrawals" with a rewritten info bubble.
- No user field for `m` in 3C.
- Rows gain `lambda` and `cliffChoice` (e.g. "stayed under ACA 400%", "filled to the Medicaid line", or empty),
  shown in the year table's tooltip. Sankey and exports unchanged.
- The open item on `solveRothConversion`'s conservative deduction lower bound stays open (conversion sizing moved
  to Batch 5, section 13).

## 6. 3C commits

1. Per-return MAGI for ACA and IRMAA in two-return years (correctness; before/after; snapshots updated).
2. Hooks, no number change: reach bounds, the year's kink list, the lambda estimate (hand-computed tests).
3. Cliff guard in every mode, `cliffGuardEnabled` (number change).
4. Full solver behind "Tax-aware withdrawals": the stock-account order chosen by the plan; conversions unchanged
   (only live-mix scenarios move; amendment, section 13).
5. Two-return draw split lever.
Each: `npm test` green; intended number changes shown before/after with `npm run snapshot:update` in the same
commit; README, `CLAUDE.md` and US badge in the same commit when user-facing or architectural.

## 7. Validation

- Hand-computed in-year cases: stay under the ACA cliff; cross it at high spending; fill to the Medicaid line;
  skip when no kink is in reach (identical to today); the 10% counted in a penalized candidate; Rule of 55 and
  72(t) combinations; a two-return household on each return's own lines.
- MAGI iteration: extend the cliff-straddling probe in `tests/aca_medicaid.js`; pass counts via `magiStats`.
- Behavioural test of the MAGI room with a mutation check (closes the Batch 1 open item; record in the notes).
- Determinism (`Object.is` on repeated runs), `tests/survivor_symmetry.js`, `tests/historical_parity.js`.
- Scenario sweep: extend `docs/batch-3c-prototype/scan.js` (throwaway) across modes, election combinations
  (none, 72(t), Rule of 55, mixed) and filing statuses (joint, two single returns, head of household); report
  ending after-tax wealth, lifetime cost and depletion against today. Hard rule: no scenario depletes earlier.
- First gap table: the solver at `m = 1` against a slow reference (coordinate ascent with no budget and more
  starts; brute force on short plans) on a small set, as the baseline for Batch 5.
- Success rates before/after: `tests/historical_rates.js` (historical and seeded Monte Carlo).
- End of 3C: re-run today's optimizer once on the new engine; record whether its schedules still beat the solver.

## 8. Performance

- `tests/bench_runs.js`: +5% for households with no cliff in reach (skip path).
- ACA early-retiree case (12.9 ms per `simulate()` today) and a Monte Carlo run: up to +30%, measured in one
  process, interleaved (two trees, alternating rounds, medians), per `CLAUDE.md`.
- If the gate fails: narrow the candidate set (drop the bracket tops outside tax-aware mode first) before anything
  else.

## 9. Docs

README feature list; a `CLAUDE.md` section on the per-year solver (hooks, skip rule, snapshot rules, what is
country-specific); 3C batch notes in `docs/next-batches-plan.md`; in that file, the execution order becomes
Rule of 55 PR -> 3C -> 5 -> 4A -> 4B -> 6 -> 8 and the 3C, 5, 4A and 4B sections are rewritten to this design with
the owner's decisions recorded. Backlog (Open items): discounting IRMAA for its two-year lag; state-law cliffs as
solver candidates.

## 10. Out of scope for 3C

Outer search, objective registry, the deeper Apply search, retiring coordinate ascent and age-keyed schedules (all
Batch 5); Canada (4A/4B); state cliffs as candidates; IRMAA discounting; modeling the backdoor Roth rollover.

## 11. Sketch of the later sub-projects (so 3C does not block them)

- **5:** outer search over `m` on the fast path (deterministic grid or golden-section, always including the
  user's current mode as a candidate: "never worse than your current settings"); the Apply refinement searches
  per-phase multipliers (before 65, 65 to RMDs, RMD years) and is always applicable, showing both success rates;
  objective registry and wording from the current Batch 5 text; decide whether the full solver becomes the
  default; migrate or retire `appliedMixSchedule` / `appliedRothSchedule`; gap table against the slow reference
  becomes a guard script. **Also tax-aware conversion sizing**, built to the two design notes in section 13 and
  measured against the slow reference and the depletion sweep before it ships.
- **4A/4B:** move the scoring and candidate loop to a `shared/` fragment; Canada supplies its kink list (OAS
  recovery threshold, GIS, CCB bands, age-amount range), its lambda inputs (RRIF minimums, CPP/OAS, `personTaxCA`)
  and TFSA as the zero-income source; pension splitting runs before the draw is scored; the outer search ports
  with it.

## 12. Risks

- Per-year cost in every Monte Carlo path; mitigated by the exact reach and the skip rule, gated in section 8.
- The decision moves the MAGI estimate; near cliffs the iteration can oscillate. Candidates priced at their own
  MAGI should prevent it; the forced pass remains the fallback; tested on straddling cases.
- `irmaaTierCeiling` depends on the pre-conversion MAGI, which the cap changes; use the tier edges as fixed
  candidates rather than a moving ceiling.
- lambda is an estimate; a poor estimate costs value but never depletion, because the guard rule (no earlier
  depletion) is tested across the sweep and the outer search in 5 tunes `m`. (This held for the draw decisions; it
  did not hold for conversion sizing, see section 13.)

## 13. Amendment (owner decision, 2026-10-07): conversion sizing moves to Batch 5

**What happened.** Task B5 as first built sized conversions in tax-aware mode by `amount x lambda - tax now -
premium change - IRMAA change`. Five snapshot scenarios then depleted earlier than at the B4 tip (c54ac72), a hard
stop: `std R rothConv+aca+live` 95 -> 88, `hist R everything real1929` 91 -> 89, `real1966` 88 -> 87, `real1973`
87 -> 85, `rich crashFirst` never -> 97. With conversions left alone, the order choice moved 29 scenarios and none
depleted earlier. Lowering the multiplier to 0.9, 0.8 or 0.7 still left five scenarios depleting a year or two
earlier.

**Not the cause: double counting.** A converted dollar leaves traditional (worth `1 - lambda`) and enters Roth
(worth 1), gaining `lambda`; this year's tax is subtracted once, separately. lambda stands only for future tax.
Batch 5 adds a hand-computed one-dollar conversion test that pins this invariant.

**The two causes.**
1. *lambda's pool path ignores draws.* `lambdaEstimate` grows today's traditional pool at the real return with no
   withdrawals, so a household that lives on its traditional money is priced as if its RMDs will be huge (in the
   first failing scenario 900k becomes 2.4M, 3.9M and 6.0M across the samples; the survivor sample alone gives
   0.368, lambda 0.284). The spec called this an overestimate; for spenders it is a large one.
2. *The score values wealth, not when it can be spent.* A Roth dollar and a taxable dollar both count 1, but before
   59.5 a converted dollar is locked for five years while the conversion tax comes out of taxable, the money that
   bridges to 59.5. Converting to the top of the 24% bracket at 52 and 53 (435k, 446k; about 218k of tax from
   taxable, ACA credit lost) emptied taxable by 57 and pushed the plan into penalized draws and depletion.

**Decision.** B5 ships the order choice only. In 3C, conversions keep the bracket setting
(`solveRothConversion`, capped by the safe-MAGI ceiling) in every mode, including tax-aware. The refactors from the
first attempt stay: `solveRothConversionTo` split out, the healthcare-cost block moved above the conversion (both
byte-identical). Batch 5 owns tax-aware conversion sizing, built to these two notes:
- **Note 1, lambda's pool path includes the expected draws.** Project the traditional pool forward net of the
  traditional share of each year's need (for example the year's need times traditional's share of investable
  money, grown with inflation), not untouched. A household that spends its traditional money gets a small lambda.
- **Note 2, a bridge check on conversions.** Before 59.5 (per owner, using the 3B statuses), a conversion amount is
  allowed only while the penalty-free accessible money (taxable, cash, the taxable bond reserve, Roth basis and
  seasoned conversions, penalty-free traditional) still covers the need for every year left until 59.5 after the
  conversion's tax is paid. Larger amounts are not candidates.

Batch 5 also runs the depletion sweep and the slow-reference gap table on conversion sizing before it ships, and
keeps "never worse than your current settings" (the bracket conversion is always a candidate).

### 13.1 Second amendment (owner decision, 2026-10-07): Note 1 moves into 3C (task B5a)

**What happened.** B5 order-only had clean snapshots: 473 identical, 16 changed in fields only, 29 live-mix
movers, no depletion age changed. But the B7 grid scan (384 households) showed tax-aware mode depleting 1 to 3
years earlier than the tax-aware mode at c54ac72 in 36 households (35 of them with the cliff guard off).

The cause is section 13's cause 1: an inflated lambda makes traditional-first win when it should not. Example:
single, 58, lambda 0.311, 17,155 of tax and the ACA credit lost, runs out at 83 instead of 84.

Default-mode households were unchanged, and the guard never depleted earlier than guard-off.

**Decision.** Note 1 is built in 3C, as its own commit, task B5a, before B5 is committed. `lambdaEstimate` takes
`need` (this year's withdrawal need, `-flow`) and `tradShare` (traditional's share of investable money at the
start of the year). Both default to 0, which keeps the old path. For each sample year the pool is walked forward
from now in real dollars:

`pool = max(0, pool x (1 + real) - tradShare x max(0, need - (Social Security and pensions that start between now
and that year, in this year's dollars)))`

The sample's RMD is then taken on that pool, as before. B5a changes numbers only in years where the guard
computes lambda; those movers are re-explained as an intended change.

**Hard rules, unchanged:** no snapshot scenario depletes earlier, and guard-on never depletes earlier than
guard-off. If the re-run scan still shows a tax-aware household depleting earlier than at c54ac72, the work
stops and the owner decides; no traditional-first gate or other heuristic is added without that decision.

Note 2 (the bridge check on conversions) stays in Batch 5, with conversion sizing.

### 13.2 Third amendment (owner decision, 2026-10-07): lambda prices what the walk assumes (task B5b)

**What happened after B5a.** On the 768-household grid per mode (the earlier "384" was a miscount; the counts
36 and 40 were over 768), tax-aware mode now depletes earlier than at c54ac72 in 3 households (guard on or off;
36 before B5a), and earlier than the default order in the same 3 (40 before B5a; the old live mix had 4). The 3
are one household, repeated across the election columns (Rule of 55 and 72(t) do nothing at 62): an unmarried
couple filing two returns, both 62, 1.5M traditional, 300k taxable, 200k Roth, 130k spending, ACA on, Texas, no
conversions. Lambda is 0.494 at 62 and 0.444 at 63, so traditional-first wins (MAGI 206k instead of 119k, tax
25,492 instead of 0, healthcare 18,000 instead of 11,859), and the plan runs out at 93 instead of 94.

**Cause A, a bug.** `lambdaEstimate`'s IRMAA step for a two-return couple uses the household MAGI against the
single tiers and charges it for both partners. B1 prices IRMAA per person everywhere else; the estimate never got
that rule.

**Cause B, the gap the B5a review found.** The walk assumes the household draws `tradShare x need` every year,
but each sample priced only the RMD. Lambda is therefore too low whenever draws exceed the RMD, and about 0 when
the pool runs out before the RMD years (B5a's own scan: two age-58, 130k-spending households, 84 -> 83).

**Decision.** Task B5b, its own commit on top of B5a (0e664d6), before B5 is committed:
1. **IRMAA per person for two-return samples.** When a sample is a couple on two returns (not one person, filing
   not joint), each partner's MAGI is their own `other` + Social Security + half the sample's traditional income
   (the estimate's `ownerShareA` is 0.5). The step is split half to each, and each partner on Medicare is charged
   `irmaaSurcharge(own MAGI + step / 2, 'single') - irmaaSurcharge(own MAGI, 'single')`. Joint and one-person
   samples are unchanged.
2. **Each sample prices the traditional income the walk assumes.** For sample year `ys`, `poolBefore` is the pool
   after the walk's draws through `ys - 1`, grown one year, and `d` is that year's draw
   (`tradShare x max(0, need - benefits started since now)`).
   - The sample's traditional income is `max(RMD on poolBefore, min(poolBefore, d))` in place of the RMD alone.
   - If the walk empties the pool at a year `z` before a sample, that sample moves to `z` (ages, benefits, filing
     and RMD divisor of that year), priced at `max(RMD on poolBefore_z, min(poolBefore_z, d_z))`. One more dollar
     left today would be spent there.
   - With `need` 0 or `tradShare` 0 every sample's income is its RMD, so apart from item 1 (two-return couples'
     IRMAA, a deliberate fix) B2's results stay identical to the bit.
3. **The walk's need leaves out this year's lump expenses:** `need = max(0, -flow - lumpExpense)`, as the bond
   target already does.

**Hard rules, unchanged:** no snapshot scenario depletes earlier, guard-on never earlier than guard-off, and if
the re-run scan still shows a tax-aware household depleting earlier than at c54ac72, the work stops for the owner.

B5a's literal test (need 50,000, lambda 0.10) changes under item 2: each sample now prices the 50,000 draw rather
than the RMD, so lambda becomes 0.12. The test is updated, not kept.

### 13.3 Fourth amendment (owner decision, 2026-10-07): the tax-aware order and the draw split move to Batch 5

**Measurements at B5b (b5b7878), 768 households per mode** (data in
`.superpowers/sdd/2026-10-06-per-year-solver-3c/task-B5-metrics.md` and `task-B5-guard-metrics.md`). "Equal" means
within $1,000. Value is the ending after-tax value with a flat 22% haircut on traditional money; cost is lifetime
real tax plus healthcare.

| Comparison | Value better / equal / worse | Cost better / equal / worse | Depletion later / same / earlier |
|---|---|---|---|
| Tax-aware order vs default order | 227 / 401 / 140 | 232 / 367 / 169 | 0 / 749 / 19 |
| Guard on vs off, default order | 43 / 713 / 12 | 98 / 649 / 21 | 21 / 747 / 0 |
| Guard on vs off, smooth withdrawals | 227 / 488 / 53 | 202 / 456 / 110 | 33 / 735 / 0 |
| Guard on, b5b7878 vs c54ac72, default order | 6 / 746 / 16 | 25 / 716 / 27 | 5 / 763 / 0 |

- **The tax-aware order.** Where it changes a result, it is better about 60/40, but it never lets a plan last
  longer, and its losses are large (10th percentile about -75k, -150k among plans that never run out, worst
  -694k). They fall on the same kind of household as its gains: early retirees with large taxable balances.
- **With conversions on, the order is worse than a coin flip on cost** (107 dearer, 87 cheaper against the default
  order). The yearly choice does not see that the bracket conversion has already used the cheap room.
- **Without a plan-level check it is not reliable enough to ship, even marked experimental.**
- **The cliff guard is sound.** It never makes a plan run out earlier, it often lets one last longer, and it helps
  clearly with smooth withdrawals. Its value losses are small (largest about -29.5k on a 5.1M plan) and all come
  from IRMAA stay-unders.
- **The B5a/B5b lambda changes barely moved the guard.**

**Decision.**
- **B5 ships refactors only, with no number change** (snapshots identical to b5b7878):
  - `solveRothConversionTo`;
  - the healthcare-cost block moved above the conversion;
  - the lifted `irmaaAt` / `lambdaOf` closures (the guard uses them).
- **The live-mix toggle keeps its old behaviour, label and info tip** (`pickLiveWithdrawalOrder`). The plan's
  `orders` stays `[null]`.
- **Task B6 (the two-return draw split) moves to Batch 5.** It lives inside tax-aware mode and is scored by the same
  lambda.
- **Batch 5 owns all lambda-driven policy:** the stock-account order, the two-return draw split and conversion
  sizing (Notes 1 and 2), each behind the outer search, which includes the user's current mode and `m = 0` as
  candidates and ranks depletion first. Its acceptance tests are the tables above, the 5 households that ran out
  a year earlier, the conversions-on interplay, and the two costs the yearly score cannot see:
  - leaving more gains in taxable raises later MAGI and IRMAA;
  - a finite step can cross an IRMAA tier.
- **The cliff guard stays on by default, unchanged.** Batch 5 also looks at whether IRMAA stay-unders should
  remain guard candidates (all of the guard's value losses), using the same scans.
- **3C's remaining hard rules are unchanged:** no snapshot scenario depletes earlier, guard-on never earlier than
  guard-off.

### 13.4 Fifth amendment (owner decision, 2026-10-07): the plan holds its conversion; the timing gate is cumulative

**What the whole-branch review of PR 2 found.**
- **The plan's conversion was not held.** The year's plan is chosen on pass 0 and held, but later MAGI passes re-size
  the Roth conversion from the new estimate. That refills the headroom a "stayed under" plan created: Roth is spent
  for nothing, and the row is still labelled "stayed under". The realized MAGI is never checked against the target.
  This affects 79 of 234 standard-engine "stayed under" rows and 78 of 255 historical ones.
- **One hard-rule breach, in the bucket engine.** A head-of-household household (66, 1.5M traditional, 300k
  taxable, 200k Roth, 130k spending, Texas, ACA on, conversions 66-72, historical start 1966) runs out at 80 with
  the guard on against 81 with it off: 3 of 3,840 bucket paths, all that one household.
- **The scan missed it** because `tests/solver_scan.js` covered only the standard engine.

**Decision.**
1. **Hold the conversion in plan years.** In a year whose plan is not `none`, every pass after the one that chose
   the plan (later passes and the forced pass) uses that pass's conversion amount. Other years re-size it as
   before. This changes numbers only in years where the guard acted.
2. **Label only what happened.** `cliffChoice` is set only when the final pass's realized MAGI meets the plan:
   at or under the target plus $1 for "stayed under", at or over the target less $1 for "filled to". A missed
   plan leaves the label empty and is counted (a `magiStats` counter) so the scan can report it.
3. **The scan covers both engines and every mode.** `tests/solver_scan.js` adds the bucket engine (the reviewer's
   historical starts per household) and the live mix. It exits 1 on any guard-on earlier depletion in either
   engine, and reports the missed-plan count.
4. **The +5% timing gate is cumulative:** PR 2's tip against the pre-3C tip (`24f6585`), for households with no
   cliff in reach. The B7 amendment's per-step baseline was a drafting error.
   - Number-neutral speedups come first (snapshots identical), such as an early exit before building the year's
     lines when none can apply, and no per-pass allocation for one-return households.
   - If the result is still above +5% but at most +8%, it is accepted and documented (part of it is B1's
     correctness fix; this machine's run-to-run noise is about 10%). Above +8%, the owner decides.
   - The ACA early-retiree case keeps its +30% gate (+11 to 12% measured).
5. **Number-neutral clean-ups from the review:**
   - the README's B1 line drops "and withdrawal";
   - the README states that a fill can draw the traditional bond bucket;
   - spec section 7's MAGI-iteration probe in `tests/aca_medicaid.js` with `magiStats` pass counts is built (it
     was skipped);
   - `annotateSolverRows` stops reading `mixOrder` / `drawSplit`;
   - the docs describe `solver_scan.js`'s actual coverage.
6. **The implementer's seven rulings are accepted:** inline note style, fill to the nearest floor only, an uncapped
   bond-reserve traditional draw, IRMAA priced as `healthcareCost` charges it, and the B7 wording on
   `pickLiveWithdrawalOrder`.

### 13.5 Sixth amendment (owner decision, 2026-10-07): the guard never spends Roth to make room for a conversion

**13.4 items 1 and 2 are superseded by this section.** Items 3 to 6 (the scan, the cumulative timing gate, the
clean-ups and the rulings) stand.

**What B8a and the probe found.**
- *Holding pass 0's conversion fails in both directions.* It left the 1966 bucket case at 80 against 81. It also
  broke the conversion's own ceiling where pass 0's estimate was stale (a held 72,500 where a converged pass would
  convert about 10k), and nine smooth-mode runs then ran out a year earlier.
- *The mechanism, confirmed by a guard-off / guard-on trace of the 1966 household at 9dfc9e5:*

| Age | MAGI off / on | Conversion off / on | Roth drawn off / on |
|---|---|---|---|
| 70 | 202,740 / 162,424 | 29,758 / 20,849 | 0 / 22,537 |
| 71 | 256,499 / 256,581 | 7,460 / 29,168 | 0 / 21,645 |

- At 71 the guard spent 21.6k of Roth and ended at the same MAGI: the conversion grew by the same amount. The draw
  cap is a MAGI limit that counts the conversion. When it pushes the draw onto Roth, the next pass estimates a
  smaller draw, the conversion's ceiling room grows, and the conversion fills it. The next year's pass 0 is seeded
  with the capped draw, so the pattern carries over. This is the "Roth for nothing" pattern: 79 of 234 standard
  stay-under rows in the review, and 398 of 2,740 in the implementer's grid.
- *No head-of-household bug.* The household's head-of-household branches (IRMAA single tiers, an ACA household of
  2, the 75,000 senior phase-out, the 200,000 child-credit start, lambda's single filing after the child ages out)
  are correct. The failure is the general mechanism and can occur under any filing status with conversions on near
  an IRMAA tier.

**Decision: the guard never spends Roth to make room for a conversion.**
1. **The plan is chosen against the converged natural year.** The year's MAGI iteration first runs with no plan
   until it converges (or ends in its forced pass). That converged pass is the natural candidate. Only if a line
   lies inside the reach of the natural MAGI (section 5.2's reach, measured from it) are the candidates evaluated.
   Each candidate is evaluated against the natural year, under section 5.1's score, on the same balances and
   estimates.
2. **A "stay under" plan sets that year's conversion to 0.** It is offered only when the natural year's MAGI
   without its conversion (natural MAGI less the natural conversion) is still over the line; the draw is then capped
   at the line with no conversion. If only the conversion puts the year over a line, the guard does nothing: the
   conversion ceiling sized it inside its tier on purpose. A "fill" plan keeps the natural conversion
   (`min(natural conversion, that pass's ceiling-sized amount)`, so the ceiling holds).
3. **With a plan chosen, the iteration converges again with the plan held** (the cap or the fill, and the plan's
   conversion). The first pass that holds the plan is seeded from the natural pass's realized draw and gains, not
   from the previous year's seed.
4. **The label is set only when the final pass's realized MAGI meets the plan**, as in 13.4 item 2 (`planMissed`
   counts the misses).

**Cost.** Extra MAGI passes only in years where a line is inside the reach of the converged natural MAGI. A year
with no line in reach runs exactly as it does with the guard off. The cumulative gate in 13.4 item 4 applies.

**Coverage first.** Before the fix, a no-behaviour commit adds about 20 snapshot scenarios where the guard acts with
conversions on. This is needed because the existing grid moved 1 of 893 scenarios under B8a. The new scenarios:
- conversions on with IRMAA and ACA lines, in the default and smooth modes;
- head of household and two-return couples;
- the 1966 household, plus the same household on the 1929 and 1973 starts in the bucket engine;
- the three smooth-mode households B8a broke (MFJ 66 250k+250k 300k taxable 130k; single 66 500k 300k 60k;
  single 66 500k 300k 130k).

**Hard rules, unchanged:** no snapshot scenario depletes earlier, and guard-on never depletes earlier than
guard-off, in both engines.

### 13.6 Seventh amendment (owner decision, 2026-10-07): the stay-under metric, the largest-cliff line, timing

**What the redesigned B8a found** (uncommitted, `task-B8a2-wip.patch`, report `task-B8a2-report.md`). Spec 13.5 works
as written: the 1966 household runs out at 81 (guard off 81), the bucket sweep's one earlier depletion is gone, no
"stayed under" row converts (1,288 did), every stay-under is under its target, `planMissed` is 0, and no snapshot
scenario runs out earlier (543 compared against 292109e: 415 identical, 97 lambda only, 31 moved). Three gates failed:

1. **13.5's metric was wrong (our design error).** "Stayed under, not lower than the guard-off run's MAGI in the same
   year" compares two histories. Once the guard draws Roth in an earlier year, guard-off empties its traditional pool
   first and later lives on Roth at a low MAGI while guard-on still holds traditional money. All 163 such rows (of
   2,224; 785 before) come after the two runs diverged, conversions-off households included; before divergence the
   count is 0, and against each run's own natural year it is 0.
2. **Timing.** The ACA early retiree is +53% (simulate) / +49% (path) against `24f6585`, over the +30% gate; the
   default household +5-6%; no-cliff Texas equals 292109e.
3. **The nearest line below can be the wrong one.** At 63-64 on the ACA the converged natural year pays the full
   premium, so its MAGI can rise over an IRMAA tier that lies above the ACA 400% line; section 5.2 then offers only
   the IRMAA stay-under. `hist G single 58 aca default | real1966` ends at 2.64M against 3.71M at 292109e (guard off
   2.12M); `std G single 58 aca default` -220k and `hist R aca rich crashFirst` -173k are the same mechanism.
   No depletion changes.

**Decision.**
1. **The stay-under invariant is measured against the run's own natural year.** Every "stayed under" row has
   conversion 0, MAGI at or under its target plus $1, and MAGI lower than that year's natural candidate (the
   trace's `realized`) by more than $1. The scan also reports the cross-run count (stay-under MAGI not lower than the
   guard-off run's by more than $1), split at the first year the two runs' rows differ: before divergence it must
   be 0 (exit 1 otherwise), after divergence it is information only.
2. **A second stay-under: the line below with the largest cliff** (this amends section 5.2). Among the lines inside
   the reach at or below the natural MAGI, the cliff of a line is premium plus IRMAA just over it less just under it
   (the `costNear` the fill test already uses). If the line with the largest cliff (over $1; ties go to the nearer
   line) is not the nearest line, it is also offered as a stay-under, under 13.5 item 2's own eligibility (natural
   MAGI less the natural conversion over that line, and a natural traditional draw). At most three trials (two
   stay-unders and a fill), each a fresh converged iteration; the winner rule is unchanged.
3. **Timing: the +30% ACA gate stays.** 8a commits with its timing recorded. 8b then adds number-neutral speedups
   (snapshots identical to the 8a commit), measured after item 2, for example seeding a stay-under trial at its
   target, avoiding the replay when the natural year wins, or skipping a trial that cannot win. If the ACA early
   retiree is still over +30% against `24f6585`, or no-cliff households over +8%, the work stops for the owner.
4. **Accepted as decided in 13.5:** where a stay-under used to fund a conversion with Roth and that happened to pay
   (`std G hoh 58 aca smooth` -106k), the loss stands; conversion sizing is Batch 5's. The implementer's rewrite of
   the age-71 test to its intent (a plan at 71, if any, targets a lower line with no conversion) is accepted.

**Hard rules, unchanged:** no snapshot scenario depletes earlier; guard-on never depletes earlier than guard-off, in
both engines.
