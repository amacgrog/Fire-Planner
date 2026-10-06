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
  runs the full candidate set including conversions while conversions are on. Replaces `pickLiveWithdrawalOrder`'s
  two-order rule and its `overage * 1e6` term.
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
- In tax-aware mode conversions are priced through `taxFor` directly, which closes the open item on
  `solveRothConversion`'s conservative deduction lower bound for that mode.

## 6. 3C commits

1. Per-return MAGI for ACA and IRMAA in two-return years (correctness; before/after; snapshots updated).
2. Hooks, no number change: reach bounds, the year's kink list, the lambda estimate (hand-computed tests).
3. Cliff guard in every mode, `cliffGuardEnabled` (number change).
4. Full solver behind "Tax-aware withdrawals", conversions included (only live-mix scenarios move).
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
  becomes a guard script.
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
  depletion) is tested across the sweep and the outer search in 5 tunes `m`.
