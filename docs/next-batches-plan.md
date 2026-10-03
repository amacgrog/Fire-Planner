# Implementation plan: batches after Phase 2

Branch: `claude/dazzling-thompson-rp3l5j`, cut from `claude/tender-meitner-a3bo59`
(`5383063`: Phase 2 complete, US V75 / Canada V34). `main` is not involved.
Source of scope: `docs/roadmap.md` ("After Phase 2" and "Phase 3") and
`docs/phase2-refactor-plan.md` appendix A.3 / A.5 / A.6 / A.7.

This plan is sequential on purpose: every numeric batch touches `runProjection()`
and regenerates the exact-match snapshots, so parallel branches would conflict.

## Review gate (decided)

- Each batch (and each sub-batch) is **one pull request into
  `claude/tender-meitner-a3bo59`**, never into `main`. The owner reviews and
  merges it before the next batch starts.
- Work for the next batch begins only after the previous PR is merged: the
  working branch is then reset to the updated `tender-meitner` tip and the
  next batch's commits go on top (the working branch is
  `claude/dazzling-thompson-rp3l5j`; its merged history is never reused).
- A PR is opened only when the owner asks for it (or this plan's batch is
  declared ready); the PR description lists the commits, the before/after
  tables for any intended number changes, and the `npm test` result.
- Each batch's exit criteria below are what the PR must demonstrate.

## Decisions already made by the owner

1. Mix modes in the bucket (historical) engine replace only the stock-account
   step: the taxable -> traditional (Canada: RRSP/RRIF) -> Roth (Canada: TFSA)
   order. Cash and bond buckets keep their position in the cascade.
2. The temporary senior deduction ends after tax year 2028 and is modeled that
   way. A visible note (UI info bubble, `docs/reference.md`, and a code comment
   at the tax-parameter table) says it must be revisited if Congress extends
   it, when tax details are next updated for 2027.
3. No Medicare late-enrollment penalties. A retiree who is not working at 65 is
   assumed to enroll in Medicare Part B and D at 65. A partner still working
   at 65 is assumed to be able to wait without penalty and enrolls when they
   stop working.
4. The Canada optimizer port is its own sub-batch (4B), separate from Canada
   mixed withdrawals (4A).
5. PR-per-batch into `tender-meitner`, reviewed before moving on (above).

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
   Decided: the cascade order is unchanged (down year: cash, bond buckets, then
   stock accounts; up year: stock accounts first). The mix modes replace only
   the "stock accounts" step, i.e. the taxable -> traditional -> Roth order
   (Canada: taxable -> RRSP/RRIF -> TFSA), so the sequence-risk reserve
   semantics are preserved. `BUCKET_STEP.taxable/traditional/roth` are
   consulted as one grouped step that delegates to the same mix code
   `withdrawStandard` uses.
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
2. **Medicare enrollment** (decided rule: no penalties).
   - Rule: a partner who is not working at 65 enrolls in Part B and D at 65. A
     partner still working at 65 defers without penalty and starts Medicare the
     year they stop working (their own retirement age, at least 65). While
     deferred, they pay no Medicare cost and no IRMAA, and their employer plan
     (the existing `healthPremiumA/B` payroll deduction) is the coverage.
   - Input: one per-partner checkbox, `delayMedicareWhileWorkingA/B`, default
     **on** (the owner's stated assumption). Turn it off for someone who is
     working past 65 with no employer coverage (e.g. self-employed), who must
     enroll at 65. One info bubble explains the assumption; the UI says plainly
     that late-enrollment penalties are not modeled.
   - Engine: `healthcareCost()`'s `medicareEligibleA/B` (today purely
     `age >= 65`) becomes `age >= 65 && !(delayWhileWorking && stillWorking)`.
     The IRMAA surcharge is computed only for partners actually on Medicare.
     `acaEligibility()` is **not** changed: it already requires age < 65, and a
     retired 65+ partner is on Medicare, not ACA.
   - This is an intended default change for any scenario where a partner works
     past 65, so it needs a before/after and a snapshot update; scenarios where
     everyone retires by 65 must not move.
   - Existing test to revisit: `tests/irmaa_gating.js` asserts the surcharge
     applies while still working; update it with the new rule and say why.
   - Tests: `tests/medicare_enrollment.js` (retire before 65: unchanged; work to
     68 with the box on: no Medicare/IRMAA until 68, cost from 68; box off:
     enrolls at 65; one partner working and one retired; survivor case, run
     `survivor_symmetry.js`).
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
   - **Senior deduction sunset (decided):** applies for tax years through 2028
     only, then is zero. Because the engine indexes brackets from today and
     tax years are explicit (`yearIndex`), the cutoff is a named constant
     (`SENIOR_DEDUCTION_LAST_YEAR = 2028`) next to the other tax parameters, with
     a comment, an info bubble on the deduction, and a `docs/reference.md` note:
     *revisit if Congress extends it, when tax details are next updated for
     2027.* A test pins the cutoff (2028 gets it, 2029 does not).
   - SALT cap: apply current law as written, including its scheduled step-down,
     by explicit tax year; any scheduled sunset gets the same named constant and
     the same "revisit when extended" note.
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
3. Tests: `tests/canada_mix.js` (defaults unchanged; mix reduces OAS clawback in
   a constructed case; TFSA never taxed), survivor symmetry for Canada.

Batch 4 is two PRs: **4A** = steps 1-3 above (credits and mixed withdrawals);
**4B** = the optimizer port below (decided: its own sub-batch).

### 4B: port the multi-lever optimizer to Canada

Starts only after 4A is merged, since the mix lever needs the Canada mix modes.
- Port `optimizeMultiLever` and its candidate/window/budget machinery, with the
  RRSP meltdown ladder as the Roth-lever analogue (candidates are bracket
  targets or annual RRSP draw levels, to be chosen when 4B is scoped) and the mix
  lever on the 4A hooks.
- Reuse as much of the US optimizer as can live in `shared/`; the objective is
  tax + healthcare equivalent (Canadian tax + OAS clawback; no ACA/IRMAA).
- Interactions to test: pension splitting (`solvePensionSplit()`), the OAS
  clawback threshold, and the 4A mix. Applied schedules persist in `state` and
  need `normalizeState` guards and legacy-state cases.
- UI: the same results card and "apply" flow as the US planner; mobile check.
- If scoping 4B shows it is still too large for one reviewable PR, split it
  (search engine first, UI second) and say so before starting.

Design decision (deferred, owner): CPP/OAS claim-age adjustments change saved
scenarios, so they are a separate item (Batch 6), not part of this one.

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

## Open items

None of the earlier questions remain open (see "Decisions already made by the
owner"). Still to be settled when the relevant batch is scoped:
- Batch 4B: which candidate set the RRSP-meltdown lever searches.
- Batch 6: the shape of the CPP/OAS claim-age change (affects saved scenarios).
- Batch 2: current SALT and age-deduction figures, to be verified from
  primary sources at the start of that batch and recorded in the commit.
