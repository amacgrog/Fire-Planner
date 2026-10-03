# Implementation plan: batches after Phase 2

Branch: `claude/dazzling-thompson-rp3l5j`, cut from `claude/tender-meitner-a3bo59`
(`5383063`: Phase 2 complete, US V75 / Canada V34). `main` is not involved.
Source of scope: `docs/roadmap.md` ("After Phase 2" and "Phase 3") and
`docs/phase2-refactor-plan.md` appendix A.3 / A.5 / A.6 / A.7.

This plan is sequential on purpose: every numeric batch touches `runProjection()`
and regenerates the exact-match snapshots, so parallel branches would conflict.
Each batch gets a sign-off before it starts.

## Ground rules (every item)

- One commit per item. Docs (`README.md` feature list, `docs/reference.md`,
  `CLAUDE.md` when architecture changes) and the version badge move in the same
  commit. US and Canada badges bump independently.
- `npm test` must pass at the end of every commit. Because the snapshot harness
  is exact, an **intended** number change means: show the before/after, then
  `npm run snapshot:update` in that same commit, and say which scenarios moved
  and why in the commit message. Never update snapshots to silence an
  unexplained diff; use `tests/snapshot.js --dump` / `--compare` against a
  worktree of the previous commit to see exactly what moved.
- Default-off features (new toggles, new inputs whose default reproduces today)
  must leave every existing snapshot byte-identical. That is the acceptance test
  for "no behavior change".
- New enum/bool/number fields go in the field registry (one entry), get a
  `normalizeState` guard, appear in the MCP schema, and need a
  `tests/legacy_state.js` case so old saves still load.
- Shared code lives in `shared/` and is synced with `scripts/sync-shared.js`
  (`npm test` runs `--check`). Edit the canonical fragment, then sync.
- Before/after report for every batch that changes projection numbers: default
  scenario plus the historical and Monte Carlo success rates (fixed seed), kept
  in the commit message and in `docs/reference.md`.
- UI changes: root `test_*.js` Playwright scripts, a 390x844 overflow check, and
  a real wheel-scroll check for anything sticky.

## What the engine looks like now (relevant facts)

- One engine per planner: `runProjection({ mode, source, retireAgeA, retireAgeB })`.
  `mode` is `STANDARD_MODE` or `BUCKET_MODE` (US ~line 5064), with switches
  `bucketStrategy`, `usesBondLadder`, `usesMagiRoom`, `passConversionAge`,
  `detailedRows`. The historical-parity work is flipping `BUCKET_MODE` switches
  one at a time, each a reviewed change.
- Withdrawals: `withdrawStandard(wd, { age, remainingMagiRoom })` (US) picks
  among applied/override mix, live mix, smooth, default; `withdrawBucket()` is
  the historical cascade. Both end with Roth, cash, bond reserve, home equity.
  Canada's `withdrawStandard` has only smooth and default.
- The standard deduction is hard-coded in three US places
  (`32200`/`16100` x factor in `ordinaryTax`, `taxFor`, and the
  bracket-ceiling helper). Batch 2 must centralize this first.
- `acaEligibility()`, `healthcareCost()` (Medicare gate is purely
  `age >= 65`), `magiSafeRoom` / `remainingMagiRoom`, and the optimizer
  (`optimizeMultiLever`, `ROTH_PER_YEAR_*`, `rothScheduleCost`) are the other
  touch points.

---

## Batch 1: historical parity (2B) and gradual bond refill

Goal: the backtest and Monte Carlo engine does what the standard engine does,
so historical success rates reflect the same strategy the user configured.
Touches `BUCKET_MODE`, `withdrawBucket`, `refillBondReserve`. Standard-engine
numbers must not move; only historical/Monte Carlo snapshots change.

Order (each its own commit, lowest risk first):

1. **F7: detailed rows for historical** (`detailedRows` on). Extra columns and
   the end-of-year `totalTax`/`totalIncome` correction. Data only; assert the
   existing historical row values are unchanged and the new columns equal what
   the standard engine would compute for the same year inputs.
2. **F1: `passConversionAge`** on (US). Historical conversions key the bracket
   override by age as the standard engine does.
3. **F2: `usesMagiRoom`** on (US). The safe-MAGI ceiling is computed every year,
   not only in a conversion window. By itself this only matters once the live
   mix reads it (step 5), so check for no change first and then use it.
4. **F3: pre-retirement bond ladder** (`usesBondLadder`; US and Canada). Sized
   once from the plan inflation (decided Q2), as the standard engine does.
5. **F4/F5/F6: mix modes inside the bucket strategy** (US: applied/override,
   live, smooth; Canada: smooth only).
   Design question to settle with the owner before coding: how a mix interacts
   with the bucket cascade. Proposal: the cascade order is unchanged (down year:
   cash, bond buckets, then stock accounts; up year: stock accounts first). The
   mix modes replace only the "stock accounts" step's taxable/traditional(/Roth)
   split, so the sequence-risk reserve semantics are preserved.
6. **Gradual bond refill** (historical only). In up years, move at most one
   year of that year's expenses from stocks into the bond bucket until it
   reaches target, instead of refilling all at once (`refillBondReserve` gains a
   per-year cap; the cap uses that year's realized expenses). Down years: cash,
   then bond buckets, then stocks via the mix modes. The standard projection is
   unaffected (decided Q3).

Tests: extend `tests/snapshot_scenarios.js` hist grid where needed (smooth,
applied schedule, live mix, ladder on); new `tests/historical_parity.js` that
runs the same inputs through standard and historical with a constant-return
`rowFn` and asserts the strategies agree year by year where the engines should
be identical (no bucket draw); gradual-refill unit test with a hand-computed
sequence added to `tests/golden.js` style checks.

Exit criteria: `npm test` green; before/after of historical and Monte Carlo
success rates on the default scenario recorded; Canada gets ladder + smooth +
columns only (no mix modes yet).

---

## Batch 2: US tax and Medicare correctness

Goal: MAGI, taxable income and healthcare cost are right before Batch 3 starts
steering withdrawals by MAGI room. New inputs default to today's behavior.

1. **Centralize the standard deduction.** Replace the three hard-coded
   `32200`/`16100` sites with one `standardDeduction(filing, year, ages)`
   helper returning the base amount. Pure refactor: all snapshots identical.
2. **Medicare enrollment** (new per-partner inputs, defaults = today).
   - Fields: `medicareStartAgeA/B` (default 65, i.e. today) and, for people who
     keep working past 65 on an employer plan, a flag that defers Part B while
     the employer plan is primary. Part B/D late-enrollment penalties are out of
     scope unless the owner asks (note in the UI).
   - `healthcareCost()`'s `medicareEligibleA/B` becomes "age >= start age and
     not deferred". `acaEligibility()` must treat a partner who has not yet
     started Medicare, is retired, and is 65+ as ACA-eligible (today `age < 65`
     hard-stops ACA). The IRMAA gate (`irmaa_gating`) follows the same flag.
   - Tests: `tests/medicare_enrollment.js` (defaults reproduce snapshots;
     delayed start moves Medicare cost and ACA eligibility; survivor symmetry
     still holds, run `survivor_symmetry.js`).
3. **Age-based and itemized deductions, built together.**
   - First, verify current rules and write them down in the commit and in
     `docs/reference.md` with sources: the 65+/blind additional standard
     deduction amounts, the temporary senior deduction and its MAGI
     phase-out and sunset years, and the SALT cap and its phase-down. Do not
     rely on memory.
   - Age-based: per-filer additional amounts applied in `standardDeduction()`;
     the senior deduction as its own phase-out function of MAGI. This changes
     default numbers for anyone 65+ in the projection, so it is an intended
     snapshot update with a before/after.
   - Itemized: new lists or fields for charity/QCD, medical (above the AGI
     floor), SALT (capped), and mortgage interest read from `mortgageSchedule()`
     (no new input for that). Deduction = max(standard, itemized) each year.
     Defaults: zero items, so itemized never wins and nothing moves except via
     the age-based change.
   - QCD interacts with RMDs (reduces taxable RMD and MAGI); model it as an
     amount excluded from the RMD's taxable income, capped by the RMD.
   - Tests: extend `tests/tax_brackets.js` for each deduction; new
     `tests/deductions.js` with hand-computed MFJ/single/65+/phase-out cases.
4. **State-tax scope disclosure** (copy only). One sentence plus an info bubble
   stating what the state model omits (local taxes, some credits, state
   itemizing, pension exclusions, after-tax IRA basis, some capital-gain rules,
   phase-outs). No engine change; add to the existing state-tax note near
   `notes[code]`.

Canada: nothing here (the age amount / pension credits are Batch 4).

---

## Batch 3: US withdrawal behavior (both engines)

Goal: the withdrawal paths stop violating the early-withdrawal penalty and the
ACA/IRMAA cliffs they are supposed to respect. Introduce the injected hooks that
Canada reuses in Batch 4.

1. **Extract the hook interface** (no behavior change): the withdrawal code
   takes `penaltyFraction(age...)` and `incomeRoom(...)` from the engine
   (US: today's penalty fractions and `magiSafeRoom`). Snapshots identical.
2. **B1, penalty-aware mixing (A.5).** When a 10% penalty would apply, draw
   taxable first, then honor Rule of 55 and 72(t) where elected, and apply the
   mix (applied/override, live, smooth) only to the portion with no penalty.
   `pickLiveWithdrawalOrder` already compares orders including the penalty; the
   fixed-weight paths do not. Intended number change in both engines.
   Tests: `tests/penalty_aware_mix.js` (age 50 with taxable available draws
   taxable; Rule of 55 and 72(t) cases; post-59.5 behavior unchanged).
3. **B2, safe-MAGI room on every withdrawal path (A.7).** Default draw, smooth
   withdrawals and the applied/optimizer schedules respect
   `remainingMagiRoom`: prefer taxable gains or Roth when traditional would cross
   the 400%-FPL cliff or the next IRMAA tier, inside the penalty-aware rules.
   The ceiling is computed every year (`usesMagiRoom` on for the bucket mode,
   from Batch 1). Interaction to test: the MAGI iteration
   (`MAGI_ITER_MAX`/`TOL`) must still converge; add a case where the draw would
   straddle a cliff.
   Before/after required (default scenario, a cliff-straddling scenario, the
   historical success rates).
4. Re-run the optimizer once on the new engine and record whether recommended
   schedules still beat the live mix (reference doc note; no code change).

---

## Batch 4: Canada credits and Canada mixed withdrawals

Prerequisite check before starting: how much of the withdrawal module is shared
today. Phase 2 step 4.5 shared helpers only and left the year loops per-country,
so this batch may need to extract the mix code from `withdrawStandard` into a
`shared/` fragment first (Batch 3 step 1 defines the hook shape).

1. **Federal age amount and pension income credits.** Verify current amounts and
   the age-amount income phase-out. Add to `personTaxCA`; extend
   `tests/tax_brackets.js` (Canada section). Intended number change for 65+.
2. **Mixed withdrawals** for taxable / RRSP-RRIF / TFSA using the shared module
   and these hooks: `penaltyFraction` always 0, `incomeRoom` = room under the
   OAS clawback threshold (and the age-credit phase-out if it matters),
   account mapping RRSP/RRIF = traditional, TFSA = roth with no basis ledger,
   FHSA handled as today.
   - Modes: live mix, applied/override schedule, smooth (exists).
   - UI: controls matching the US ones, plus the info bubbles.
   - Check: `solvePensionSplit()` runs before the draw is evaluated; the RRSP
     meltdown ladder and the mix do not double count RRSP income.
3. **Port the multi-lever optimizer** (US-only today) to Canada, with the
   RRSP meltdown ladder as the Roth-lever analogue and the mix lever on the new
   hooks. Largest piece; may split into its own sub-batch.
4. Tests: `tests/canada_mix.js` (defaults unchanged; mix reduces OAS clawback in
   a constructed case; TFSA never taxed), survivor symmetry for Canada.

Design decision to confirm with the owner: CPP/OAS claim-age adjustments change
saved scenarios, so they are a separate item (Batch 6), not part of this one.

---

## Batch 5: optimizer

Run after the engine and tax model have settled, since objective values and
timing both depend on them.

1. **Performance baseline** on the final engine: time `optimizeMultiLever` on
   representative scenarios and measure the evaluation budget
   (`ROTH_PER_YEAR_EVAL_BUDGET`). Decide whether lifting
   `ROTH_PER_YEAR_MAX_WINDOW` (30) is affordable, and what replaces the cap
   (a time/budget bound with a visible "searched through age N" note).
2. **Selectable objective.** Replace the fixed `rothScheduleCost` with an
   objective registry: lifetime tax, healthcare cost, ending net worth, legacy,
   IRMAA, ACA subsidy, RMDs, balanced (a documented weighted blend). The default
   stays today's tax + healthcare so existing results do not move.
3. **Wording.** Present results as "searches for a tax-efficient strategy", not
   "the optimal"; mention it is coordinate ascent on a discontinuous objective.
4. Tests: `test_multi_lever_optimizer.js` and `test_roth_optimizer_per_year.js`
   extended per objective; a unit check that each objective's value is computed
   from the same rows the UI shows.

---

## Batch 6: independent items and loose ends

- **Social Security (US).** Earnings-history option so the ssa.gov estimate can
  be adjusted for years not worked before claiming; a trust-fund benefit-cut
  scenario (percent cut from a chosen year, default off); review spousal and
  survivor rules and list what stays simplified.
- **HSA** account type: contributions (pre-tax, FICA-exempt via payroll),
  tax-free qualified medical withdrawals, post-65 non-medical treated as
  traditional. New balance in `bal`, snapshot, registry, MCP, Sankey/table
  columns.
- **Canada CPP/OAS claim-age adjustments:** design decision first (it changes
  saved scenarios), with `normalizeState` migration and a legacy-state test.
- **Loose ends:** proxy for bond coupon in the standard projection vs the
  `Bond return` input; the January 2024 Treasury yield; record the CPI source
  and check 2023-2025.

---

## Open decisions for the owner

1. Batch 1 step 5: confirm that mix modes replace only the stock-account step
   of the bucket cascade (proposal above).
2. Batch 2: senior-deduction and SALT rules apply as law stands for the years
   they are in force, then hold constant in real terms afterward? Or hold the
   last-known values flat? (Affects far-future years only.)
3. Batch 2: Part B/D late-enrollment penalties modeled or only disclosed?
4. Batch 4: one batch for Canada mix + optimizer port, or split the optimizer
   port into its own sub-batch?
5. Gate between batches: PR per batch into `tender-meitner`, or commits on this
   branch with a summary at each exit?
