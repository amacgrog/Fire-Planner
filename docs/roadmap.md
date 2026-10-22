# Roadmap

Planned work, in priority order. Sources: the earlier modeling-refinement list
(what is done / not done is folded in below) and an external review of the US
engine's ACA / IRMAA / payroll-tax handling.

**Status (as of 2026-10-21):** on `main`: Phases 1 and 2, Batches 1, 2, 3, 7 and
E1-E3, the cliff plan, the IRMAA MAGI fix and the modular-build refactor (stages
0-4); US V130 / Canada V60. Every PR goes to `main`. The detailed plan and the
live order are `docs/next-batches-plan.md`; this page says what is done, what is
open and where to look.

## Current plan (supersedes the Phase 3 and "After Phase 2" lists where they differ)

The detailed, decision-annotated plan is `docs/next-batches-plan.md`. Each batch
(or sub-batch) is one PR into `main`, reviewed by the owner before the next
starts.

Done:
- **1. Historical parity (2B)** and gradual bond refill.
- **2. US tax and Medicare:** Medicare delayed while working, age-based and senior
  deductions, simplified itemizing.
- **3. Retirement accounts and early-withdrawal rules:** 3A per-partner account
  model, 3B penalty-aware withdrawals, 72(t) per account and Rule of 55; 3C
  redesigned as the cliff plan
  (`docs/superpowers/specs/2026-10-07-cliff-plan-design.md`).
- **7. Dependents and the tax update** (7A-7O): children, US federal credits, the
  state rules table (50 states and DC), the Canadian federal credits, the
  provincial rules table, the income-tested benefits.
- **IRMAA MAGI fix.**
- **E1-E3 (life events):** income character (E1a-E1e: contribution limits, income
  streams, self-employment, one-time income, inherited accounts), E2 adoption, E3
  the IRMAA appeal. Batch E stopped after E3 to do the modular-build refactor.
- **Modular build, stages 0-4** (below).

Next, in order (owner, 2026-10-21): every refactor item comes before E4.
1. **Docs refresh** after the modular build.
2. **Core regroup: done** (`docs/superpowers/specs/2026-10-21-core-regroup-design.md`,
   `docs/superpowers/plans/2026-10-21-core-regroup.md`): the one-unit `core/` modules merged and renamed by topic,
   `core/` and `ui/` now topic folders; T17 of `docs/superpowers/inventory/stage4-open-items.md` resolved.
3. **Vitest: done** (`docs/superpowers/specs/2026-10-21-vitest-design.md`, `docs/superpowers/plans/2026-10-21-vitest.md`):
   `tests/unit/` holds the suites converted from Playwright scripts, per planner, in a fresh module graph per
   test, run by `npm test` (`vitest run`); `tests/benefits.js`, which had never been in the old chain, now runs in CI.
   Further conversions are follow-up, not a prerequisite.
4. **Stateless engine: done** (`docs/superpowers/specs/2026-10-22-stateless-engine-design.md`,
   `docs/superpowers/plans/2026-10-22-stateless-engine.md`, four PRs): `runProjection(ctx, ...)` and every engine module
   (its import closure, `computeCliffPlan`, `core/analysis/`, `core/optimizer/`) read a run context passed first
   (`newRunContext`: inputs, tax year, tax factors, plan, overrides, stats sinks, test switches) and never the store;
   variants run on shallow copies through `variantContext` / a `contextFor` factory; the store layer is the two
   `store-context.js`, `simulate.js` and US `cliff-plan/planning.js`. Guarded by `tests/engine_purity.js` (no engine module
   reaches the store; every module-level mutable registered by kind) and `tests/unit/shared/engine-ratchet.test.js`; every
   stage was exact, parity-identical (`tests/analysis_parity.js`) and within the +5% timing gate against the stage 1 tree.
   Left for item 5: the few functions that take `inputs` rather than `ctx` (CLAUDE.md, "Architecture, per planner file").
5. **TypeScript**, starting with `core/`.
6. **Centralized state writes** (and subscriptions).
7. **Vite** hot reload, as a dev-only layer.
8. **Merging the US and Canada engines.**

Items 4-8 are section 11 of
`docs/superpowers/specs/2026-10-10-modular-build-design.md`. They are ordered by
dependency (the stateless engine's ratchet tests need Vitest; TypeScript is easier
on explicit inputs; merging the engines is the largest and goes last); each gets
its own design before it starts, and the owner may reorder them.

Then the feature batches:
- **E4. State relocation (US).**
- **5. Optimizer:** selectable objective, remove the 30-year cap if affordable,
  wording.
- **4. Canada:** 4A mixed withdrawals, 4B optimizer port.
- **6. Social Security and others:** guided PIA estimate, claim-age rules, spousal
  and survivor benefits, trust-fund benefit-cut what-if; HSA; CPP/OAS claim-age
  basis; loose ends.
- **8. Social Security survivor-claim optimizer** (after everything above):
  searches when a surviving spouse should start the survivor benefit and their
  own benefit, and when to switch, in both orders.

Later, not scheduled: E5 (real assets) and the Canada province move.

Documentation: `docs/reference.md` is updated once, after the last batch, from
the per-batch "Batch notes" kept in `docs/next-batches-plan.md` (the one exception
so far: the modular-build refresh of its layout sections, 2026-10-21).

Not modeled by decision: charitable itemized deductions, Medicare late-enrollment
penalties, the Social Security earnings test, WEP/GPO (repealed), territories
(Canada), local income taxes (except a flat county rate for MD and IN, 7D).
Medical expenses over 7.5% of AGI are deducted since 7O.

## Phase 0: baseline
- `npm test` green (golden, historical_tax_indexing, dividend_income,
  medical_inflation, irmaa_gating, roth_early_access, tax-brackets (Vitest),
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
All four items are complete (see `docs/phase2-refactor-plan.md`; item 4 was shared regions kept in sync by `scripts/sync-shared.js`, later replaced by the modular build (below), with the two `runProjection` year loops deliberately left per-country). Deferred follow-ups are listed under "After Phase 2".
No behavior change; `npm test` must stay identical throughout.
1. Merge `simulate()` and `simulateHistorical()` into one engine; only the
   per-year return/inflation source differs.
2. Extract per-year helpers (coverage/ACA eligibility, MAGI, healthcare cost,
   withdrawal cascade).
3. Consolidate the `ids` / `syncControls` / `syncContributionControls` wiring
   into a single field registry.
4. Share structure between the US and Canada planners (files stay
   self-contained; no build step). (Superseded by the modular build.)

## Modular build (stages 0-4) — done
The source moved to `src/` as ES modules, with an esbuild build to one
self-contained file per planner in `dist/` (CI keeps the build as an artifact; the Pages deploy
was removed on 2026-10-22: the repository is private); no
behavior change. Specs: `docs/superpowers/specs/2026-10-10-modular-build-design.md`
and `docs/superpowers/specs/2026-10-15-stage4-ui-design.md`. Stage 4 was merged by
PR #24. The follow-ups are in "Current plan".

## Phase 3: remaining items (a branch per group)
- **Done (Batch 2).** **Medicare enrollment:** configurable (still working at 65, employer
  coverage, delayed Part B).
- **Open: Batch 5.** **Optimizer:** user-selectable objective (lifetime tax, healthcare cost,
  ending net worth, legacy, IRMAA, ACA subsidy, RMDs, balanced); raise or remove
  the 30-year cap (`ROTH_PER_YEAR_MAX_WINDOW`) if performance allows; reword UI
  as "searches for a tax-efficient strategy" (coordinate ascent over a
  discontinuous objective is not a global optimum).
- **Done (Batch 2; medical in 7O).** **Itemized deductions** (mortgage interest, charity/QCD, medical, SALT) and
  **age-based deductions** (65+ additional standard deduction, the temporary
  senior deduction with phase-out). Build together; verify current IRS rules
  and the SALT cap first.
- **Done in part (7C/7D: each state's notes show under the selector; local taxes only for MD and IN).** **State-tax scope:** state clearly in the UI that the state model is
  simplified (no local taxes, some credits, state itemizing, pension exclusions,
  after-tax IRA basis, some capital-gain rules, phase-outs).
- **Open: Batch 6.** **Social Security:** ssa.gov estimate assumes earnings continue to claiming
  (too high for an early retiree); no trust-fund benefit-cut scenario; spousal
  and survivor rules simplified.
- **Open: Batch 6.** **HSA** account type.
- **Age and pension credits done (7J); CPP/OAS claim ages open (Batch 6).** **Canada:** federal age amount and pension income credits (verify current
  amounts); CPP/OAS claim-age adjustments (a design decision, since it changes
  saved scenarios).

## After Phase 2 (decided, not yet scheduled)
Done in a follow-up branch started once the exact refactor (2A) is green, in
this order, each its own commit with a before/after on the default scenario's
historical and Monte Carlo success rates:
- **Done (Batch 1).** **Historical parity (2B):** the backtest/Monte Carlo engine gains what the
  standard engine already has: pre-retirement bond ladder (sized from plan
  inflation), smooth withdrawals, applied/override and live withdrawal mix,
  MAGI safe room, the `age` argument to `solveRothConversion`, and the extra
  row columns (US all; Canada ladder, smooth, columns only).
- **Done (Batch 1).** **Gradual bond refill (historical only):** in up years move at most one year
  of that year's expenses from stocks into the bond bucket until it reaches its
  target (today it refills all at once). The standard projection never refills.
  Down years: cash, then bond buckets, then stocks via the mix modes.
- **Done (3B).** **Penalty-aware mixed withdrawals (US, both engines):** when the 10% early
  penalty applies, draw taxable first, honor Rule of 55 / 72(t), and apply the
  mix (smooth/applied/live) only where no penalty is owed. Changes standard
  and historical numbers together; see `docs/phase2-refactor-plan.md` A.5.
- **Superseded (3C, by the cliff plan).** **Use the safe-MAGI room wherever withdrawals are chosen (US):** today
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
- **Open: Batch 4A.** **Canada mixed withdrawals:** taxable / RRSP / TFSA mix, with the OAS
  clawback threshold as the income-room limit and no penalty gating; needs the
  shared withdrawal module from Phase 2 first (A.6).

## Loose ends
- ~~Canada survivor period: partner B's income zeroed when partner A dies
  first.~~ Confirmed and fixed in Phase 1 (V33 Canada, V74 US for the
  extra-income variant); see `docs/reference.md`.
- The standard projection (not the historical one) taxes bond interest at the
  `Bond return` input, a total return used as a proxy for the coupon.
- The 2024 Treasury yield uses January 2024 (4.06%) because no December 2023
  value was supplied. Decided: keep the recorded 2023-2025 yields as they are.
- The CPI column's source is not recorded (matches Dec-to-Dec CPI-U through
  2022; 2023-2025 unchecked).

## Verified as not needing changes
2026 ACA FPL values (the subsidy uses the prior-year FPL); the two-year IRMAA
lookback itself; federal brackets and standard deduction; LTCG thresholds;
Social Security taxation; NIIT; RMD ages/divisors.
