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

## Phase 2: refactor (separate branch, not merged back)
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
- **Penalty-aware mixed withdrawals (US, both engines):** when the 10% early
  penalty applies, draw taxable first, honor Rule of 55 / 72(t), and apply the
  mix (smooth/applied/live) only where no penalty is owed. Changes standard
  and historical numbers together; see `docs/phase2-refactor-plan.md` A.5.
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
