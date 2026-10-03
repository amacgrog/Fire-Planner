# Roadmap

Planned work, in priority order, as of 2026-10-02 (`main` at `50c160c`, US V69 /
Canada V32). Sources: the earlier modeling-refinement list (what is done / not
done is folded in below) and an external review of the US engine's ACA / IRMAA /
payroll-tax handling.

**Status:** Phase 1 is complete and merged to `main` (US V74 / Canada V33).
Phases 2 and 3 are **not** merged back from the same branch: each is started
in its own session/branch.

## Phase 0: baseline
- `npm test` green (golden, historical_tax_indexing, dividend_income,
  medical_inflation, irmaa_gating, roth_early_access, tax_brackets,
  historical_bond_yield, rmd_age).
- Confirm CI is green on `main` (Actions tab).

## Phase 1: bug fixes (US unless noted) — done
Each item is its own commit with its own test; docs and the version badge are
updated in the same commit.

1. **IRMAA startup MAGI.** Inputs for MAGI one and two years before plan start;
   used for the 2-year lookback in years 0 and 1, simulated MAGI afterward.
   Blank inputs keep the old behavior (year-0 MAGI stand-in).
2. **IRMAA boundaries.** Exact CMS thresholds with `<` comparisons instead of
   `749999` / `499999`.
3. **Additional Medicare Tax.** 0.9% of wages above $250k (MFJ) / $200k (single);
   statutory, not indexed.
4. **ACA coverage model.** Explicit per-partner coverage (employer / ACA /
   other) and whether a working partner's employer plan covers the spouse;
   default reproduces the old "ACA only once both have stopped working" rule.
5. **ACA MAGI iteration.** Compute ACA MAGI including this year's discretionary
   withdrawals and conversions by iterating to convergence; applies to the
   subsidy, the displayed healthcare cost, and the 400%-FPL cliff guard the
   Roth-conversion sizing uses.

Canada has no ACA, IRMAA, or Additional Medicare Tax equivalent. The Canada
survivor-income loose end was checked in this phase and was a real bug (fixed,
with the US extra-income variant; see `docs/reference.md`).

## Phase 2: refactor (separate branch, not merged back) — done
All four items are complete (see `docs/phase2-refactor-plan.md`; item 4 is shared regions kept in sync by `scripts/sync-shared.js`, with the two `runProjection` year loops deliberately left per-country). Deferred follow-ups are listed under "After Phase 2".
No behavior change; `npm test` must stay identical throughout.
1. Merge `simulate()` and `simulateHistorical()` into one engine; only the
   per-year return/inflation source differs.
2. Extract per-year helpers (coverage/ACA eligibility, MAGI, healthcare cost,
   withdrawal cascade).
3. Consolidate the `ids` / `syncControls` / `syncContributionControls` wiring
   into a single field registry.
4. Share structure between the US and Canada planners (files stay
   self-contained; no build step).

## Phase 3: remaining items (a branch per group)
- **Medicare enrollment:** configurable (still working at 65, employer
  coverage, delayed Part B).
- **Optimizer:** user-selectable objective (lifetime tax, healthcare cost,
  ending net worth, legacy, IRMAA, ACA subsidy, RMDs, balanced); raise or remove
  the 30-year cap (`ROTH_PER_YEAR_MAX_WINDOW`) if performance allows; reword UI
  as "searches for a tax-efficient strategy" (coordinate ascent over a
  discontinuous objective is not a global optimum).
- **Itemized deductions** (mortgage interest, charity/QCD, medical, SALT) and
  **age-based deductions** (65+ additional standard deduction, the temporary
  senior deduction with phase-out). Build together; verify current IRS rules
  and the SALT cap first.
- **State-tax scope:** state clearly in the UI that the state model is
  simplified (no local taxes, some credits, state itemizing, pension exclusions,
  after-tax IRA basis, some capital-gain rules, phase-outs).
- **Social Security:** ssa.gov estimate assumes earnings continue to claiming
  (too high for an early retiree); no trust-fund benefit-cut scenario; spousal
  and survivor rules simplified.
- **HSA** account type.
- **Canada:** federal age amount and pension income credits (verify current
  amounts); CPP/OAS claim-age adjustments (a design decision, since it changes
  saved scenarios).

## After Phase 2 (decided, not yet scheduled)
Done in a follow-up branch started once the exact refactor (2A) is green, in
this order, each its own commit with a before/after on the default scenario's
historical and Monte Carlo success rates:
- **Historical parity (2B):** the backtest/Monte Carlo engine gains what the
  standard engine already has: pre-retirement bond ladder (sized from plan
  inflation), smooth withdrawals, applied/override and live withdrawal mix,
  MAGI safe room, the `age` argument to `solveRothConversion`, and the extra
  row columns (US all; Canada ladder, smooth, columns only).
- **Gradual bond refill (historical only):** in up years move at most one year
  of that year's expenses from stocks into the bond bucket until it reaches its
  target (today it refills all at once). The standard projection never refills.
  Down years: cash, then bond buckets, then stocks via the mix modes.
- **Penalty-aware mixed withdrawals (US, both engines):** when the 10% early
  penalty applies, draw taxable first, honor Rule of 55 / 72(t), and apply the
  mix (smooth/applied/live) only where no penalty is owed. Changes standard
  and historical numbers together; see `docs/phase2-refactor-plan.md` A.5.
- **Use the safe-MAGI room wherever withdrawals are chosen (US):** today
  `magiSafeRoom` (the headroom under the ACA 400%-FPL cliff and the next IRMAA
  tier) caps only the Roth conversion and the live withdrawal mix. The default
  draw, smooth withdrawals, and the applied/optimizer mix schedules ignore it, so
  they can push MAGI over a cliff that the engine then merely charges for.
  Make every withdrawal path respect the remaining room (prefer drawing taxable
  gains or Roth when traditional would cross a cliff, within the same
  penalty-aware rules), in both engines, with the ceiling computed every year
  (`usesMagiRoom` on for the bucket mode). Lands with or right after the
  penalty-aware mixing change; it changes standard and historical numbers, so a
  before/after on the default scenario is required. See
  `docs/phase2-refactor-plan.md` A.7.
- **Canada mixed withdrawals:** taxable / RRSP / TFSA mix, with the OAS
  clawback threshold as the income-room limit and no penalty gating; needs the
  shared withdrawal module from Phase 2 first (A.6).

## Loose ends
- ~~Canada survivor period: partner B's income zeroed when partner A dies
  first.~~ Confirmed and fixed in Phase 1 (V33 Canada, V74 US for the
  extra-income variant); see `docs/reference.md`.
- The standard projection (not the historical one) taxes bond interest at the
  `Bond return` input, a total return used as a proxy for the coupon.
- The 2024 Treasury yield uses January 2024 (4.06%) because no December 2023
  value was supplied.
- The CPI column's source is not recorded (matches Dec-to-Dec CPI-U through
  2022; 2023-2025 unchecked).

## Verified as not needing changes
2026 ACA FPL values (the subsidy uses the prior-year FPL); the two-year IRMAA
lookback itself; federal brackets and standard deduction; LTCG thresholds;
Social Security taxation; NIIT; RMD ages/divisors.
