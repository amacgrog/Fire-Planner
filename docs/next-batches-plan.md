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
6. Batch 2 adds **no new fields**: Medicare is always delayed while a partner is
   working (no checkbox); itemizing is only state income tax + property tax
   (under the SALT cap) + mortgage interest, using inputs already tracked.
   Charity, QCD and medical deductions are out of scope.
7. Retirement accounts are modeled per partner as four accounts (traditional
   IRA, traditional 401(k), Roth IRA, Roth 401(k)), with Roth IRA contribution
   basis, a Roth 401(k) contribution-basis slider, per-account 72(t) elections
   with a start age, and the withdrawal order in 3B (taxable, cash, bonds,
   penalty-free retirement money, then penalized draws as a last resort).
8. A new Batch 7 covers children (built first), US federal credits, and the
   state and provincial tax update.
9. Batches 4, 5 and 6 are pending the owner's review and may change. (The one
   exception already decided: the Canadian federal age amount and pension
   income credit moved out of Batch 4 into Batch 7.)
10. While any account is penalized, cash and the taxable bond reserve are used
    **before** Roth IRA contribution basis (the basis keeps growing tax-free).
11. The Roth 401(k) basis slider is per partner (default 100%); the Roth IRA
    basis is an optional per-partner dollar amount.
12. Batch 7 covers the 50 states **plus DC** and the 10 provinces. The three
    territories are out of scope. Canada's income-tested federal benefits
    (Guaranteed Income Supplement and Allowance, Canada Child Benefit, GST/HST
    credit) and provincial benefits are in scope alongside the credits.
13. Batch 7 review shape: 7D (all remaining states and DC) is **one PR**, and 7K
    (all provinces) is **one PR**, each reviewed as a whole table. Each ships a
    generated, human-readable rules table (see 7C) so the owner reviews data, not
    code.
14. The Treasury-yield loose end is closed: keep the recorded 2023-2025 yields
    as they are (the January 2024 value stays; it is documented, not changed).
15. Every tax, benefit and retirement-account figure is re-confirmed against
    primary sources at implementation time and cited (owner: yes, all batches).
16. Batch 3B: the Rule-of-55 age convention keeps the existing one.
17. The proposals for Batch 4B (candidate set and benefit-netted objective) and
    Batch 6 (Social Security basis switch, trust-fund what-if, CPP/OAS basis
    switch) are accepted. Social Security earnings test and WEP/GPO are not
    modeled (WEP/GPO is repealed).
18. A survivor-benefit claim optimizer is added as Batch 8, after everything else.
19. The first-run wizard collects balances by account type. **Amended during 3A
    (owner, 2026-10-04):** it asks for every balance directly, per partner and per
    account (traditional 401(k), traditional IRA, Roth 401(k), Roth IRA, for A and
    B), with no 50/50 split and no assumed traditional IRA. It became three steps
    (basics, balances, optional questions) and carries a prominent note to set the
    Roth basis. Legacy saves are not migrated (owner: they do not matter).

## Execution order

1 (historical parity) -> 2 (US tax and Medicare) -> 3A (account model) -> 3B
(penalty-aware rules, 72(t), Rule of 55) -> 7A (children)
-> 7B (federal credits) -> 7C (state framework + reference states) -> 7D (all
remaining states and DC, one PR) -> 7D part 2 (state-tax performance, one small PR) -> 7J (Canada federal credits) -> 7K (all
provinces, one PR) -> 7L (income-tested benefits) -> 3C (safe-MAGI room; moved
here, owner decision) -> 4A -> 4B -> 5 -> 6 -> 8 (survivor-benefit claim
optimizer).

Why 3C moved after Batch 7 and before 4A and 5 (owner decision): Batch 7 adds the
cliffs and phase-outs (senior deduction, child tax credit, state circuit-breaker
cutoffs, 7L income-tested benefits) that the safe-MAGI policy has to price, and the
measurement of the ACA-cliff policy (Auto / Always / Never, see the 3C notes) is
only worth running once the tax model has settled. 3C still goes before 4A, which
reuses its shared `stayUnder` policy for the Canadian income-room hook, and before
5, which consumes a settled engine and may sweep the policy's parameter as a lever.
Nothing in 4A-8 or 7 consumes 3C's output; what stays open meanwhile is listed
under "Open items".

Why: 3A is a no-number-change data-model PR that 3B and 3C depend on. Batch 1's
mix-mode work in the historical engine is written against the `take*` withdrawal
primitives so 3A can swap the account model underneath without redoing it. The
tax update (7) goes before Canada mixing and the optimizer because both consume
tax costs. Batches 4-6 are the owner's to reorder when reviewed.

## Ground rules (every item)

- One commit per item. The `README.md` feature list, `CLAUDE.md` (when
  architecture changes) and the version badge move in the same commit. US and
  Canada badges bump independently. **`docs/reference.md` is deliberately not
  updated per batch** (owner decision): each batch instead appends its findings
  to its "Batch notes" section in this file (see "Batch notes" below), and a
  single consolidation pass writes them into `docs/reference.md` after the last
  batch.
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
  in the commit message and in the batch's notes (consolidated into
  `docs/reference.md` at the end).
- UI changes: root `test_*.js` Playwright scripts, a 390x844 overflow check, and
  a real wheel-scroll check for anything sticky.

## Batch notes (replaces per-batch `docs/reference.md` edits)

Every batch PR adds to its own "Batch notes" section at the bottom of this file,
in the same PR, so the evidence for each change is reviewed with the change.
Each entry records, as applicable:
- decisions made while building that were not in the plan, and why;
- every verified rule or figure with its **primary-source citation and retrieval
  date** (IRS, state revenue department, CRA, SSA, BLS);
- gotchas, traps and failed approaches (the kind of thing `docs/reference.md`
  normally holds), including anything a future session would need to avoid
  repeating;
- the before/after table for any intended number change (default scenario,
  success rates), and which snapshot scenarios moved and why;
- new or changed field names, state keys and migrations.

Wording rule: write notes as finished reference text (what is true now and
why), not as a diary, so the final consolidation is a copy and organize step.
The README and `CLAUDE.md` still follow the "same PR" rule because the README is
user-facing and `CLAUDE.md` is what future sessions read first.

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
- Retirement accounts (after 3A): four accounts per partner as inputs; the engine keeps pooled
  `bal.traditional/roth` (plus `bondTraditional/bondRoth`) with a per-account share ledger underneath
  (`accts`), which sizes RMDs, 72(t) and the blended penalty fraction. Roth early access is still a pooled
  `rothLedger` (contribution basis, a conversion queue with 5-year seasoning, earnings). The early-
  withdrawal penalty is still a blended `penalizedShare`; Rule of 55 and the 72(t) SEPP
  (`sepp72tEnabledA/B`, `singleLifeDivisor`) still act on the pooled traditional balance. Property tax
  (`propertyTax`, `propertyTaxGrowth`) and tenure are already inputs.
- `refillBondReserve` and `rotateIntoBondLadder` only move money between stock
  and bond holdings inside the same account type, so they never trigger the
  early-withdrawal penalty.
- DC is not in the model today (added in Batch 7); the Canadian territories are
  out of scope.

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

## Batch 2: US tax and Medicare correctness (one PR)

Goal: MAGI, taxable income and healthcare cost are right before Batch 3 starts
steering withdrawals. **No new input fields in this batch** (owner decision):
everything below is derived from inputs the planner already has.

1. **Centralize the standard deduction.** Replace the three hard-coded
   `32200`/`16100` sites with one `standardDeduction(filing, year, ages)`
   helper returning the base amount. Pure refactor: all snapshots identical.
2. **Medicare always starts when the partner stops working, never before 65.**
   - Rule (decided, no field): Medicare Part B/D starts at
     `max(65, that partner's retirement age)`. A partner who is not working at 65
     enrolls at 65. A partner still working at 65 stays on the employer plan
     (the existing `healthPremiumA/B` payroll deduction keeps applying) and
     enrolls the year they stop working, with no late-enrollment penalty. The
     owner's reasoning, recorded in the info bubble: an employer plan can be
     cheaper than Medicare plus IRMAA, so delaying is the sensible default; users
     who really would enroll earlier can set a later retirement age.
   - Engine: `healthcareCost()`'s `medicareEligibleA/B` (today purely
     `age >= 65`) becomes `age >= 65 && !workingA` (and `!workingB`). IRMAA is
     computed only for partners actually on Medicare. Survivor and single-person
     paths follow the same rule. `acaEligibility()` is unchanged (it already
     requires age < 65 and a retired 65+ partner is on Medicare).
   - Copy: extend the existing `medicareYearly` info bubble (no new control) to
     state the assumption and that late-enrollment penalties are not modeled.
   - Intended default change for any scenario where a partner works past 65
     (before/after + snapshot update). Scenarios where everyone retires by 65
     must not move.
   - Tests: `tests/irmaa_gating.js` currently asserts the surcharge applies while
     still working; revise it to the new rule and say why. New
     `tests/medicare_enrollment.js`: retire before 65 (unchanged); work to 68
     (no Medicare cost or IRMAA until 68, full cost from 68); one partner
     working and one retired; single person; survivor case, then run
     `survivor_symmetry.js`.
3. **Age-based deductions and simplified itemizing (no new fields).**
   - Verified 2026 figures (secondary sources; irs.gov was not reachable from
     the planning environment, so re-confirm each number against the IRS
     publication or Rev. Proc. when implementing and record the citation in the
     commit and in `docs/reference.md`):
     standard deduction $32,200 MFJ / $16,100 single (already in the code);
     additional deduction for age 65+: $1,650 per spouse (married) or $2,050
     (single/head of household); temporary senior deduction $6,000 per eligible
     person for tax years 2025-2028, reduced by 6% of MAGI over $75,000 single /
     $150,000 MFJ, available whether or not the filer itemizes; SALT cap $40,000
     in 2025 and $40,400 in 2026, +1% a year through 2029 ($40,804 / $41,212 /
     $41,624), reduced by 30% of MAGI over a threshold ($500,000 in 2025,
     $505,000 in 2026, +1% a year) but never below $10,000, and back to a flat
     $10,000 in 2030; the $750,000 mortgage-debt limit is permanent.
   - Age-based: per-filer additional amounts live in `standardDeduction()`; the
     senior deduction is its own function of MAGI.
   - **Senior deduction sunset (decided):** tax years through 2028 only, via a
     named constant `SENIOR_DEDUCTION_LAST_YEAR = 2028` beside the other tax
     parameters, with a code comment, an info-bubble sentence and a
     `docs/reference.md` note: *revisit if Congress extends it, when tax details
     are next updated for 2027.* A test pins the cutoff (2028 gets it, 2029
     does not). The SALT cap schedule uses the same pattern (explicit year
     table, named end year, same "revisit" note).
   - **Itemizing is deliberately simple (decided):** itemized deductions =
     `min(SALT cap, state income tax + property tax) + mortgage interest`, and
     nothing else. Charitable giving, QCDs and medical expenses are out of scope.
     Every input already exists: state income tax comes from the state model for
     the same year, property tax is `propertyTax` grown by `propertyTaxGrowth`
     while the household owns, and mortgage interest comes from
     `mortgageSchedule()` (which must expose per-year interest; today it is
     computed inside the payment loop). Mortgage interest is scaled down when the
     original principal exceeds the $750,000 limit.
   - Deduction used = `max(standard + age-based, itemized)` each year, plus the
     senior deduction on top of either.
   - Ordering and circularity to handle explicitly: compute state tax before the
     federal deduction decision (confirm no modeled state takes federal tax as an
     input; if one does, use the prior MAGI-iteration pass); phase-outs read the
     realized MAGI from the MAGI iteration; Roth-conversion bracket sizing
     (`bracketCeilingReal` area) uses `max(standard + age-based, property tax +
     mortgage interest capped)` as a conservative lower bound, documented as an
     approximation.
   - Intended number changes: anyone 65+ in the projection (age-based and senior
     deduction) and homeowners whose itemized total beats the standard
     deduction. Before/after required; snapshot update in the same commit.
   - Tests: extend `tests/tax_brackets.js` (each deduction function); new
     `tests/deductions.js` with hand-computed MFJ, single, 65+, phase-out,
     SALT-cap, SALT-phase-down and 2028/2029 cutoff cases; itemize-vs-standard
     crossover; mortgage-limit proration.
4. **State-tax scope disclosure** (copy only, interim). One sentence plus an info
   bubble stating what the state model omits. Batch 7 replaces the omissions
   with real rules and rewrites this copy then.

Already done, therefore not in this plan: the 0.9% Additional Medicare Tax on
wages (above $250,000 MFJ / $200,000 single, statutory and not indexed) shipped
in Phase 1 (US V71, `tests/additional_medicare_tax.js`). It applies to wages
only, as the law does, so retirees living on withdrawals do not pay it; the
related 3.8% Net Investment Income Tax is also already modeled.

Canada: nothing in this batch.

---

## Batch 3: retirement accounts and early-withdrawal rules (three PRs)

The owner's account-level spec cannot ride on the current model: today the US
planner has one pooled `traditional` balance and one pooled `roth` balance, with
Partner A's share set by the `traditionalSharePctA` slider, and Rule of 55 and
72(t) are applied to the pooled traditional balance. So this is split into three
reviewable PRs: **3A** the account model (no number changes), **3B** the
penalty-aware rules, **3C** the safe-MAGI steering.

### Rule check against current law (done while writing this plan)

Sources were secondary summaries of IRS guidance (Notice 2022-6, Treas. Reg.
1.402A-1, SECURE 2.0 materials, IRS Notice 2025-67); irs.gov itself was not
reachable. Each point must be re-confirmed against the primary text when 3B is
implemented.

| Item | Finding | Effect on the plan |
|---|---|---|
| 10% additional tax before 59½ | Confirmed. | Per-account status, below. |
| Rule of 55 | Applies only to the plan of the employer you separate from (in or after the year you turn 55). It does **not** cover IRAs or 401(k)s from earlier employers, and it is lost if the 401(k) is rolled into an IRA. (Age 50 for certain public-safety workers is not modeled.) | Today's engine applies it to the whole pooled balance. After 3A it applies **only to the 401(k) buckets**, so users with large IRA balances see more penalty exposure. Assumption stated in the UI: the entered 401(k) balance is the last employer's plan. |
| Roth IRA ordering | Contributions first, then conversions (oldest first, each with its own 5-year clock for the 10% tax), then earnings. | Already implemented in the pooled `rothLedger`; becomes one ledger per partner. |
| Roth 401(k) | Non-qualified distributions are **pro rata** between contributions and earnings (Treas. Reg. 1.402A-1), unlike Roth IRAs. The earnings share is taxable and penalized; qualified at 59½ + 5 years. No RMDs since 2024 (SECURE 2.0). Rolling it into a Roth IRA changes the treatment. | Separate bucket with its own pro-rata ledger (contribution basis, earnings fraction). Roth rollovers are not modeled; a user who rolled can enter the balance as Roth IRA. The 5-year qualified-distribution clock is assumed met after 59½ (the same simplification the Roth IRA path makes today); documented. |
| 72(t) SEPP | **One correction to the spec:** SEPP payments must be taken exactly. Taking *more* than the computed amount from that account (or less, or adding money to it) is a "modification": the 10% tax is recaptured retroactively on **all** earlier SEPP payments, plus interest. It is not just a 10% penalty on the excess. Payments continue until the later of the 5th anniversary of the first payment or age 59½. RMD method: prior year-end balance divided by the Single Life Table factor for the age attained in the year, recomputed every year (tables per Notice 2022-6). Elected per account (an IRA or a specific 401(k) plan). | The SEPP account is a hard cap: while active it supplies exactly its SEPP amount and any further need comes from other accounts. No Roth conversions out of an active SEPP account, no contributions into it. The existing `singleLifeDivisor` table must be re-checked against the final tables. |
| Roth IRA basis while a SEPP runs | The SEPP is on a traditional IRA or 401(k); the Roth IRA is a separate account whose contribution basis stays withdrawable penalty-free. | Ordering tier 4 below. Confirmed: this works as the owner described. |
| Refilling cash/bond buckets | `refillBondReserve` and the pre-retirement ladder move money between stock and bond holdings **inside the same account** (`traditional` to `bondTraditional`, taxable to `bondTaxable`). That is rebalancing, not a distribution, so no 10% tax can arise. | The owner's rule ("never refill with a penalty") already holds by construction; 3B adds a test that pins it. |
| 2026 contribution limits | 401(k) deferral $24,500, catch-up $8,000, age 60-63 catch-up $11,250; IRA $7,500 plus $1,100 catch-up; Roth catch-up required above $150,000 prior-year FICA wages. | The code already uses the $150,000 Roth catch-up threshold. Verify the other limits when 3A routes contributions to specific accounts. |

### 3A: account model (no behavior change)

Goal: represent each partner's four retirement accounts while every existing
scenario produces byte-identical output.

- **New fields**, per partner (Partner B fields use `data-partner-b` and are 0
  in single-person mode): `tradIraA/B`, `trad401kA/B`, `rothIraA/B`,
  `roth401kA/B` (all `.money` fields); `rothIraBasisA/B` (optional dollars;
  blank means "treat the whole Roth IRA as contributions", today's default);
  `roth401kBasisPctA/B` (slider 0-100, default 100 so the default scenario is
  unchanged). One collapsible "Retirement accounts" group with a per-partner
  sub-group, with `<small>` descriptors and info bubbles per CLAUDE.md.
- **Retired fields** (deleted from the saved state): `traditional`, `roth`,
  `traditionalSharePctA`, `rothBasisPct`, and the `sepp72tEnabledA/B` pair in 3B.
  **Amended during 3A (owner decision): no migration.** `normalizeState` just deletes
  the four pooled keys, so an old save opens with default accounts. (The original plan
  mapped them into the 401(k) and Roth IRA buckets; the snapshot grid and older tests
  keep their old vocabulary through `tests/legacy_balances.js` instead.)
- **Engine representation.** Keep `bal.traditional`, `bal.bondTraditional`,
  `bal.roth`, `bal.bondRoth` as the pooled totals everything downstream already
  reads (tax, RMD, ACA/IRMAA, bond ladder, Sankey, tables). Add an account
  ledger that records each account's share of its pool, plus a Roth IRA ledger
  and a Roth 401(k) pro-rata ledger per partner (generalizing `rothLedger`).
  Growth applies to every account at the pooled return (same allocation
  assumption; documented). Contributions route to the owner's account
  (`k401Type` / `iraType`; employer match goes to the traditional 401(k)); RMDs
  come out of traditional accounts in proportion to balance; Roth conversions
  draw from non-SEPP traditional accounts, IRAs before 401(k)s (to keep Rule of
  55 access longest).
- **MAGI-iteration rule from CLAUDE.md applies:** every new mutable ledger is
  cloned and restored with the existing snapshot (`rothLedgerClone/Restore`
  pattern); add them in the same commit or convergence silently breaks.
- **First-run wizard (amended, see decision 19).** Step 2 asks for every account
  balance per partner; the basis fields and 72(t) elections live only in the
  Retirement accounts group, and the wizard says to set the basis.
- Surfaces to update: field registry (one entry per field), MCP schema (derived),
  first-run wizard and field search, "investable at retirement" and other sums,
  CSV/table exports, scenario compare, `tests/field_registry.js`,
  `tests/snapshot_ui.js` (regenerate only the UI baseline for the new controls).
- Risk: widest surface in the plan; the first commit is a spike that proves the
  snapshot stays identical with the new ledger in place but no new inputs
  exposed, before any UI is added.
- Canada: unchanged (RRSP/TFSA per-partner balances are a separate question).

### 3B: penalty-aware withdrawals, 72(t) per account, Rule of 55 on 401(k)s

Both engines (standard and historical bucket mode). Intended number changes.

- **Per-account penalty status** replaces the fractional `penalizedShare` blend
  (each account has one owner, so status is binary per year). An account is
  penalty-free if its owner is 59½ or older, or it is a 401(k) and Rule of 55
  applies to the owner, or the money is a forced SEPP/RMD amount, or it is
  Roth IRA contribution basis / 5-year-seasoned conversions. Everything else is
  penalized. The hooks later reused by Canada (`penaltyStatus`, `incomeRoom`)
  are introduced here as the first, no-behavior-change commit.
- **Withdrawal order when any penalized account exists (decided by the owner):**
  0. Forced amounts first: RMDs and active SEPP payments (taxable, never
     penalized).
  1. Taxable brokerage. Accounts that are currently penalty-free by exemption
     (Rule-of-55 401(k)s, or any account whose owner is 59½+) join the household's
     normal strategy alongside taxable (default, smooth, live mix or applied
     schedule), exactly as today.
  2. Cash.
  3. Taxable bond reserve.
  4. Penalty-free retirement money: Roth IRA contribution basis and seasoned
     conversions.
  5. Only if all of the above are exhausted: penalized withdrawals, choosing the
     lowest marginal (tax + 10%) per dollar. Traditional pays tax plus 10% on the
     whole draw; a Roth 401(k) draw pays both only on its earnings fraction; Roth
     IRA unseasoned conversions pay 10% only; Roth IRA earnings pay both.
  6. Home equity last, as today.
  The mix modes apply only inside tier 1's penalty-free set; a schedule that asks
  for a penalized traditional draw is redirected down this list. Once the owner is
  59½ or exempt, today's strategies are untouched.
  Decided by the owner: tiers 2-3 (cash and bonds) come before tier 4 (Roth
  basis), because Roth basis has more value left growing tax-free.
- **72(t) per account.** Replace `sepp72tEnabledA/B` with, for each of the four
  traditional accounts (A IRA, A 401(k), B IRA, B 401(k)): an election checkbox
  and a start-age field (blank/0 means "at retirement age", which reproduces
  today's behavior; legacy `sepp72tEnabledA/B` migrates onto the partner's 401(k)).
  Payment = that account's balance at the start of the year divided by the
  Single Life Table factor at the age attained that year, for the later of five
  years of payments or 59½. Roth accounts are not eligible in the UI (a SEPP on
  a Roth account would serve no purpose). If the start age is 59½ or later the
  UI says no penalty exists to avoid.
- **Rule of 55 only on 401(k)s**, using the owner's retirement age with the
  existing age convention (documented); IRAs never get it.
- **Roth 401(k) pro-rata ledger**: contributions (basis) and earnings tracked
  separately; growth accrues to earnings; each draw takes the same fraction of
  both; the earnings fraction is taxed, and penalized unless exempt.
- Tests, new `tests/penalty_aware_withdrawals.js` plus extensions: age-50
  retiree with taxable, cash, bonds, traditional and Roth draws in the tier order
  with zero penalty until penalty-free money runs out; the penalized-choice rule;
  Rule of 55 on a 401(k) but not on an IRA with identical balances; SEPP cap
  (account yields exactly its payment, shortfall comes from elsewhere, ends at
  the later of 5 years or 59½, no conversion from it); Roth IRA basis available
  during a SEPP; Roth 401(k) fractions over several years (hand-computed);
  refill/ladder produce no penalty; Partner A-dies equals Partner B-dies
  (`survivor_symmetry.js`); historical engine matches standard where no bucket
  draw happens.
- Before/after on the default scenario, an early-retiree scenario, and the
  historical and Monte Carlo success rates; docs rewritten where CLAUDE.md
  describes the pooled penalty fraction and `traditionalSharePctA`.

**Also look at here (raised after Batch 1; see "Open items"):** the pre-retirement
bond-bucket strategy for early retirees. The ladder and refill put the reserve in
traditional first, so for a household retiring before 59.5 any draw from it owes
the 10% penalty. Decide whether the source order should depend on the age the
reserve will first be drawn.

### 3C: safe-MAGI room on every withdrawal path (old B2)

**Scheduling (owner decision): runs after Batch 7 (after 7L) and before 4A and 5.** See "Execution order".
Exploration, the prototype and the design direction are recorded in "Batch 3C: exploration so far" in the
notes. When it is picked up, re-derive the prototype diff against the then-current `Planner_US.html` (it
targets today's line positions), and re-run the cap-policy measurement on the post-Batch-7 tax model.

Default draw, smooth withdrawals and the applied/optimizer schedules respect
`remainingMagiRoom`: prefer taxable gains or Roth when traditional would cross
the 400%-FPL cliff or the next IRMAA tier, inside the 3B rules (penalty-free
money first). The ceiling is computed every year (`usesMagiRoom` on for the
bucket mode, from Batch 1). Check that the MAGI iteration (`MAGI_ITER_MAX`/`TOL`)
still converges; add a case where the draw straddles a cliff. Before/after on
the default scenario, a cliff-straddling scenario, and the historical success
rates. Finish by re-running the optimizer once on the new engine and recording
whether its schedules still beat the live mix (reference-doc note; no code).

**Also resolve here (carried from Batch 1):** the safe-MAGI room has no behavioral
test. No scenario was found where `remainingMagiRoom` changes the live mix's choice
(the room is computed from a MAGI that already includes the same year's own
estimated draw), so Batch 1 only checks the wiring in the source. Build a scenario
where the room binds, or fix the computation, then add a behavioral parity test
with a mutation check, and record the outcome in this batch's notes and in the
"Batch 1" section of `docs/reference.md` (step 5 and the open items there).

---

## Batch 4: Canada mixed withdrawals (and the optimizer port)

Prerequisite check before starting: how much of the withdrawal module is shared
today. Phase 2 step 4.5 shared helpers only and left the year loops per-country,
so this batch may need to extract the mix code from `withdrawStandard` into a
`shared/` fragment first (Batch 3 step 1 defines the hook shape).

1. **Federal age amount and pension income credits: moved to Batch 7 (7J)**
   (owner decision; same machinery as the provincial credits). By the time this
   batch runs, `personTaxCA` already has them.
   **Depends on 3C (now scheduled before this batch):** if 3C puts its stay-under-the-ceiling policy in a
   shared fragment, the Canadian `incomeRoom` hook below reuses it for the OAS clawback and GIS limits.
2. **Mixed withdrawals** for taxable / RRSP-RRIF / TFSA using the shared module
   and these hooks: `penaltyFraction` always 0, `incomeRoom` = room under the
   OAS clawback threshold and, now that Batch 7 models it, the Guaranteed Income
   Supplement income test and the age-credit phase-out (TFSA withdrawals do not
   count as income for either, which is the main reason to mix),
   account mapping RRSP/RRIF = traditional, TFSA = roth with no basis ledger,
   FHSA handled as today.
   - Modes: live mix, applied/override schedule, smooth (exists).
   - UI: controls matching the US ones, plus the info bubbles.
   - Check: `solvePensionSplit()` runs before the draw is evaluated; the RRSP
     meltdown ladder and the mix do not double count RRSP income.
3. Tests: `tests/canada_mix.js` (defaults unchanged; mix reduces OAS clawback in
   a constructed case; TFSA never taxed), survivor symmetry for Canada.

Batch 4 is two PRs: **4A** = steps 2-3 above (mixed withdrawals);
**4B** = the optimizer port below (decided: its own sub-batch).

### 4B: port the multi-lever optimizer to Canada

Starts only after 4A is merged, since the mix lever needs the Canada mix modes.
- Port `optimizeMultiLever` and its candidate/window/budget machinery, with the
  RRSP meltdown ladder as the Roth-lever analogue and the mix lever on the 4A
  hooks.
- **Candidate set (proposed, owner reviews with Batch 4):** each year's meltdown
  target is chosen from (a) the five federal bracket ceilings the ladder offers
  today (14, 20.5, 26, 29.29, 33%), plus (b) computed "kink" targets for that
  year: the OAS clawback threshold, the top of the age-amount clawback range,
  the Guaranteed Income Supplement cutoff, and the Canada Child Benefit
  reduction bands when children are present, and 0 (no meltdown). The kinks are
  where the true marginal rate jumps (GIS removes about 50 cents per dollar of
  RRSP/RRIF income; the OAS clawback is 15%), so bracket rates alone would miss
  the best stopping points. Deduplicate targets within a dollar, as the US
  candidate list does.
- **Objective (depends on Batch 7):** net cost = income tax + OAS clawback
  minus income-tested benefits received (GIS/Allowance, CCB, GST/HST credit,
  provincial benefits), summed in real dollars. Without the benefit term the
  search would happily raise income through a GIS cliff. Rows must expose
  `benefits` as their own column (Batch 7L requirement).
- Reuse as much of the US optimizer as can live in `shared/`.
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

**After 3C (now scheduled before this batch):** the ACA-cliff policy's parameter may become an optimizer lever.
Solve any "Auto" choice once outside the optimizer and hold it fixed inside the search; running extra
projections per evaluation would multiply the cost of the up-to-8,000-call search.

**Dependencies on Batch 7 (must be in place first):**
- `row.tax` must include state tax and be net of the new credits (child tax
  credit, state credits), and the objective registry reads the same row fields
  the UI shows; Canada rows expose `benefits` separately (see 4B).
- New cliffs and phase-outs make the objective more discontinuous: the senior
  deduction phase-out (6% of MAGI above $75,000 / $150,000 through 2028), the
  child tax credit phase-out, state retirement-exclusion income tests, and state
  circuit-breaker credit cutoffs. The US candidate list
  `ROTH_PER_YEAR_CANDIDATES` is federal brackets only; add computed kink targets
  per year (senior-deduction phase-out edges while in force, state exclusion
  thresholds) and keep the multi-start structure.
- Speed: `taxFor()` is the hot path (up to 8,000 projection calls per search).
  Batch 7C therefore carries a timing gate (below) so the performance baseline
  in step 1 here starts from a known budget.

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

- **Social Security (US): guided estimate, claim-age rules, spousal and survivor
  benefits, trust-fund scenario.** Today `ssMonthlyA/B` is a flat monthly amount
  used as-is from the start age (default 62), and in the survivor period the
  household simply keeps the greater of the two benefits.
  1. *Guided PIA entry (replaces "enter whatever ssa.gov says").* Per partner, a
     short step-by-step panel linking to the SSA Quick Calculator: enter birth
     date, retirement (claim) month and current salary; click "See the earnings
     we used"; then either edit the yearly earnings (put zero for years you will
     not work before claiming) or paste earnings from your record at
     ssa.gov/myaccount; read the monthly benefit at full retirement age (your
     PIA, in today's dollars) and enter it here. This fixes the known problem
     that the default ssa.gov estimate assumes earnings continue until claiming,
     which overstates an early retiree's benefit. Exact calculator labels are
     re-checked when implementing.
  2. *Benefit basis, per partner:* `ssBenefitBasis` = `atClaim` (today's
     behavior: the amount is paid as-is from the start age) or `pia` (the amount
     is the PIA at full retirement age and the planner applies the claim-age
     rules). Saved scenarios and the default scenario stay on `atClaim`, so
     nothing moves unless the user switches. Claim-age rules in `pia` mode:
     reduction of 5/9 of 1% per month for the first 36 months early and 5/12 of
     1% per month beyond; delayed-retirement credit of 2/3 of 1% per month (8% a
     year) to age 70; full retirement age by birth year, derived from the age
     input (67 for anyone born 1960 or later).
  3. *Spousal benefit:* a spouse receives their own benefit plus an excess
     spousal amount of `max(0, 50% of the worker's PIA - own PIA)`, reduced when
     claimed before full retirement age (25/36 of 1% per month for the first 36
     months, 5/12 of 1% beyond; no delayed credits), payable only once the worker
     has claimed and the spouse is at least 62.
  4. *Survivor benefit:* replaces the "greater of the two" swap. The survivor
     receives the larger of their own retirement benefit or the deceased's
     benefit (including delayed credits if the deceased claimed late; not less
     than 82.5% of PIA if the deceased claimed early), reduced if the survivor
     takes survivor benefits before survivor full retirement age. The benefit
     starts at 71.5% of the deceased's benefit at age 60 and rises to 100% at the
     survivor's full retirement age (67 for anyone born 1962 or later; earlier
     birth years use the SSA table). Remarriage and divorced-spouse benefits are
     not modeled (one-line UI note).
     *Independent claim ages (needed by Batch 8):* a survivor may start the
     survivor benefit and their own retirement benefit at different ages and
     switch from one to the other, in either order. Add per-partner
     `ssSurvivorStartAgeA/B` (age at which the survivor benefit starts if
     widowed; default the survivor full retirement age, i.e. 100%), and the
     existing own-benefit start age (`ssStartAgeA/B`) also governs when the
     survivor's own retirement benefit starts. While only one of the two has
     started the survivor receives that one; once both have started they receive
     the higher of the two (SSA pays the own benefit plus the excess of the
     survivor benefit over it). Defaults reproduce the planned behavior.
  5. *Trust-fund benefit-cut scenario.* The Social Security trustees project that
     the retirement trust fund (OASI) runs out of reserves and then incoming
     payroll taxes can pay only part of the scheduled benefits unless Congress
     changes the law. The 2026 Trustees Report puts the OASI depletion in the
     fourth quarter of 2032 with about 78% of scheduled benefits payable
     afterward (combined OASDI: 2034 and 83%). This is a what-if switch, not a
     forecast: two fields, `ssBenefitCutPct` (default 0) and `ssBenefitCutStartYear`
     (default 2033), and one "Use the Trustees' projection" button that sets 22%
     from 2033. The cut applies proportionally to all Social Security income
     (own, spousal, survivor) from the start year onward. Default off, so no
     existing number moves. The preset values live in named constants with a
     revisit note for each annual Trustees Report.
  6. *Not modeled, documented in the UI:* the earnings test for claiming before
     full retirement age while still working; Windfall Elimination Provision and
     Government Pension Offset (repealed by the Social Security Fairness Act in
     2025; verify before documenting); family maximum.
  Tests: new `tests/social_security.js` (claim-age factors at 62/FRA/70, spousal
  excess with early claiming, survivor larger-of with delayed credits and the
  82.5% floor, survivor reduction at 60, cut applied from the start year),
  `survivor_symmetry.js`, legacy-state cases proving `atClaim` for old saves.
- **HSA** account type: contributions (pre-tax, FICA-exempt via payroll),
  tax-free qualified medical withdrawals, post-65 non-medical treated as
  traditional. New balance in `bal`, snapshot, registry, MCP, Sankey/table
  columns.
- **Canada CPP/OAS claim-age adjustments (proposed shape).** Same pattern as
  the Social Security basis, so no saved scenario changes: a per-partner
  `benefitBasis` for CPP and OAS, `atClaim` by default (today: the entered
  amount is used as-is from the start age) or `at65` (the user enters the amount
  their My Service Canada estimate shows at 65 and the planner adjusts for the
  start age). Adjustment factors (verify at implementation): CPP minus 0.6% per
  month before 65 (maximum minus 36% at 60) and plus 0.7% per month after 65
  (maximum plus 42% at 70); OAS plus 0.6% per month after 65 (maximum plus 36%
  at 70; OAS cannot start before 65). Defaults and migration keep `atClaim`;
  `tests/legacy_state.js` proves it. For parity with the Social Security
  survivor work, the CPP survivor's pension (the survivor's own retirement
  pension combined with a survivor pension, capped at the maximum retirement
  pension) is a proposed addition; the owner can drop it when reviewing.
- **Loose ends.**
  - Bond coupon proxy: the standard projection taxes bond interest at the `Bond
    return` input, a total return used as a proxy for the coupon. Unchanged
    unless the owner wants it addressed.
  - Treasury yields: closed (owner: use the recorded 2023-2025 values as they
    are; the January 2024 figure stays and is documented).
  - CPI source: the column is the BLS CPI-U (all items, U.S. city average, not
    seasonally adjusted), December to December. Checked from the index levels
    (December 2022 296.797, December 2023 306.746, December 2024 315.605;
    reported from BLS data by a secondary source because bls.gov was not
    reachable): 2023 = 3.35% and 2024 = 2.89%, both matching the recorded values
    to two decimals. 2025: BLS reports 2.7% for the 12 months ending December
    2025, consistent with the recorded 2.68, but the December 2025 index level
    was not available here, so two-decimal confirmation of 2025 remains. When
    implementing, confirm 2025 from the BLS index level and record the series ID
    (CUUR0000SA0) and retrieval date in `docs/reference.md` and
    `docs/roadmap.md`.

---

## Batch 7: dependents, then the federal, state and provincial tax update

Requested by the owner: update state and provincial tax handling for all 50
states, DC and all ten Canadian provinces (no territories), adding credits,
pension/retirement exemptions and capital-gains rules (cost basis is already
tracked), the US federal Child Tax Credit and a review of the premium tax
credit, the Canadian federal age amount and pension income credit, and
Canada's income-tested benefits.

**Where it runs:** after Batch 3 and before Canada mixed withdrawals (4A). The
withdrawal logic compares tax costs and Batch 2's SALT deduction consumes the
state tax, so the tax model should settle before Canada's mixing and the
optimizer rely on it. It is split into many small PRs because the state and
province work is mostly data that the owner needs to review.

### 7A: children (dependents), built first

Every credit below reads the same list, so it ships as its own small PR.
- A new add-as-you-go list `children` (the seventh DYN list: default `[]`,
  `LIST_MAX`, spec-driven UI, `normalizeLists`, MCP, legacy-state case). One
  field per child: `birthYear` (a past or **future** year, so "from birth" works
  for planned children). The list starts empty (0 children) and a "+ Add child"
  button appends a row (with a remove control), exactly like the other
  add-as-you-go lists.
- Assumption (owner): a dependent is always a child. Each credit defines its
  own age cutoff (the federal Child Tax Credit is under 17 at year end); a
  helper `dependentsInYear(year)` returns each child's age so a credit can apply
  its own cutoff.
- Plumbing: the tax profile gets the dependents' ages (including the survivor
  remap, since children stay with the surviving parent); ACA household size
  (`fplForHousehold`) counts dependents in the household while claimed (cutoff
  documented). Nothing else changes, in particular spending is not adjusted
  automatically; the UI says so.
- Default `[]` so every existing snapshot is byte-identical.

### 7B: US federal credits

- **Child Tax Credit** (verify at implementation; 2026 figures from secondary
  sources): up to $2,200 per qualifying child under 17, of which up to $1,700 is
  refundable (the Additional Child Tax Credit, phase-in at 15% of earned income
  above $2,500), reduced by $50 per $1,000 of MAGI over $200,000 single /
  $400,000 MFJ (not indexed). Cover the phase-in, the cap on the refundable
  part, the phase-out, and that it only helps while a child is under 17.
- **Premium tax credit:** already modeled as the ACA expected-contribution
  schedule with the 400%-FPL cliff and the `acaEnhanced` switch. This item is a
  review, not a build: confirm the 2026 applicable-percentage table, that the
  enhanced credits expired after 2025, and that the model repays any excess (the
  repayment cap is gone from 2026, and the model uses annual MAGI so it already
  settles the full year); confirm household size now includes dependents.
- Credits are applied in `taxFor()`; refundable portions can make tax negative
  only through the ACTC. Tests in `tests/tax_brackets.js` and a new
  `tests/child_credits.js`.
- **Scope added after 7A (owner, 2026-10-04). None of it may add an input** (the 7A
  children list is the only input; `student` is on it). Commit order inside 7B:
  1. **Filing-status lookup table, no behavior change.** Replace the ~25 `filing === 'mfj'`
     comparisons (brackets, standard deduction, senior-deduction phase-out, long-term-gain
     bands, Social Security taxation base, NIIT, Additional Medicare Tax, IRMAA table, the
     state-tax calls, CTC phase-out) with one table keyed by status, so `'hoh'` and `'qss'`
     are data, not new branches. Snapshots must stay byte-identical.
  2. **Death-year MFJ fix** (its own commit, an intended number change for every survivor
     scenario, with a before/after table). Today `isSurvivorPeriod = year >= deathYear` and
     `filingStatusFor` returns `'single'` for the death year itself; the law is that the
     survivor files jointly for the year of death (IRC 6013(a)(3)).
  3. **Head of household and qualifying surviving spouse (QSS).** Survivor timeline: death
     year MFJ always; the next two tax years QSS (MFJ brackets and standard deduction) while a
     qualifying child exists that year, otherwise single for the rest; after the window HoH
     while a qualifying child still exists (a student to 23), otherwise single. A single
     person (or the pre-marriage Partner A) with a qualifying child files HoH. QSS keeps the
     single Social Security base amounts, the $200,000 Additional Medicare Tax and CTC
     thresholds and (to verify) the single IRMAA and senior-deduction thresholds.
  4. **Child Tax Credit and Additional Child Tax Credit** (`age <= 16`).
  5. **Credit for Other Dependents** ($500, nonrefundable, same phase-out as the CTC): a
     qualifying child who is not CTC-eligible (17 and 18, and 19-23 students).
  The ACA household and the premium-tax-credit review stay as listed above.
- **Pre-marriage two-filer branch (`marryLater`):** Partner A claims the children (owner,
  2026-10-04), so Partner A files HoH there when a qualifying child exists.
- **Deliberately not modeled (owner, 2026-10-04):** Child and Dependent Care Credit and the
  dependent-care FSA (need a child-care expense input), education credits, the adoption credit,
  coverage on a parent's plan to 26. EITC and Social Security child benefits are open items
  (below).

### 7C: state-tax framework plus reference states

- Replace the scattered state logic with a data table `STATE_RULES[code]`. Each
  state declares, explicitly (no silent defaults): brackets by filing status;
  standard deduction / personal and dependent exemptions; Social Security
  treatment; retirement/pension exclusions (amount, age threshold, income test,
  per person); capital-gains treatment (taxed as ordinary, a percentage
  exclusion, a separate rate, a surtax or tax-on-sale rule) computed from the
  gain and cost basis the engine already tracks; and credits (child tax credit,
  senior/retirement credit, property-tax and renter credits, low-income credit)
  with age, income and expense tests. Every row carries a `source` URL and an
  `asOf` year.
- Credits that need household facts use fields that already exist (age, income,
  retirement income, property tax, rent, tenure) plus the 7A children list.
  **No new inputs beyond 7A.**
- A coverage test fails if any of the 50 states or DC is missing any field (an
  explicit `none` is required). DC is a new jurisdiction in the model (state
  selector, brackets, standard deduction, its own credits); it goes in the group
  that matches its mechanics.
- This PR ships the schema and a handful of reference states chosen to cover
  every mechanism (proposal: CA, NY, PA, TX, WA), so the owner can approve the
  pattern before the bulk data lands.
- Local income taxes stay out of scope and are listed as an explicit documented
  gap (e.g. NYC, parts of PA, OH, MD, IN).
- **Review artifact:** a script generates `docs/state-tax-rules.md` from the
  data table, one row per jurisdiction with every rule and its source link, so
  the owner reviews the table as data. `npm test` fails if the generated file is
  stale (same mechanism as the shared-region check).
- **Timing gate:** state rules are looked up once per (jurisdiction, year) and
  cached; the 400-run `simulate()` and 120-run historical timing from Phase 2
  must stay within +5% (the optimizer calls this path thousands of times).

### 7D: all remaining states and DC (one PR)

Decided: one PR, reviewed as a whole table. Inside the PR the commits are
grouped by mechanism so the history stays bisectable and the diff is readable:
no-income-tax states and special cases (including WA's capital-gains tax and
TN/NH); flat-rate states; progressive states with simple structures; states with
large retirement-income exclusions; states with income-tested property-tax /
renter circuit-breaker credits; remaining multi-credit states and DC. The review
artifact is the generated `docs/state-tax-rules.md` (jurisdiction x rule, with
source links), plus per-state tests: two hand-computed households per state (a
retiree with pension + Social Security + gains; a working family with children).
The batch-2 disclosure copy and each state's tax note are rewritten in this PR.

Research method: each row is taken from the state revenue department's current
forms and instructions, recorded with URL and date. If the owner wants this
sped up, the research can be fanned out to subagents (one per group, output as
a sourced data file for review). That uses far more compute, so it is only done
if the owner asks for it.

### 7D schema mechanisms (to add, with tests, before the data lands)

Written 2026-10-04 from the verified review worklist (see "External review of the migrated rows" in the 7C notes) plus the shapes the remaining
states are known to use. Mechanisms taken from the worklist are marked **W** (the state and rule were verified there); the others are **K** (known
from general knowledge of state tax law, to be confirmed during that state's research, with the state list a starting point, not a finding).
The rule for all of them is the 7C one: add the field to the schema and `tests/state_rules.js` (every row declares it, an explicit none where it does
not apply), add the evaluator branch, add a hand-computed case on the synthetic jurisdiction in `tests/state_mechanisms.js`, and only then write data
rows that use it. The first 7D commit is the mechanisms; the data commits follow in the groups above. Each mechanism's indexing flag follows the
7C per-family rule (a new family gets its own flag in `indexing`, never reuse an existing one by accident).

| # | Mechanism | Needed by | Proposed schema | Evaluator and plumbing | Test (hand-computed) |
|---|---|---|---|---|---|
| 1 | **Year-effective rule sets** (scheduled statutory changes) | **W** HI (Act 46 widens brackets in 2027 and 2029; Act 24 adds a 13% rate from 2027 at $500,000 single / $750,000 HoH / $1,000,000 joint), SC (automatic rate cuts, only if triggered: not scheduled, leave out); **K** states with enacted phase-downs (several flat-rate states, MS, GA, IN, KY, NE, IA and others) | `schedule`: a list of `{ fromYear, ...overrides }` where an override replaces `tax`, `standardDeduction`, `exemption` or any other whole field from that tax year; the base row is the first year | the compiled row keeps one compiled variant per `fromYear`; `stateIncomeTax` picks the variant by the tax year (`taxYearOf(yearIndex)`, the same clock the federal rules use), a lookup done once per call, no allocation. The nominal-dollar thresholds in a later variant are statutory amounts for that year, so indexing applies from that variant's own base year (a `baseYear` field per variant) | a synthetic row whose rate and deduction change in year 3; a variant with its own indexing base year |
| 2 | **Standard deduction that steps down or phases out with AGI** | **W** AL (2025 table: single $3,000 falling $25 per $500 of AGI over $25,999 to a $2,500 floor at $35,500; joint $8,500 to $5,000; HoH $5,200 to $2,500), SC (the new SCIAD: $15,000 / $22,500 / $30,000 reduced across $40,000-$95,000 single, $60,000-$142,500 HoH, joint from $80,000, upper end to read); **K** MD, others | `standardDeductionPhase`: `{ kind: 'stepDown', start, width, step, floor }` or `{ kind: 'linear', start, end, floor }`, per column; the base `standardDeduction` stays the maximum | after the state AGI is known, reduce the column's standard deduction; `start`, `end` and `width` index with `creditThresholdsIndexed` unless a new `standardDeductionThresholdsIndexed` flag is added (decide when the first row needs it) | AL-style steps and an SC-style linear case, at, below and above each bound |
| 3 | **Age-tiered per-person retirement caps** | **W** CO (pension and annuity subtraction $20,000 at 55-64 and $24,000 at 65+, per person), DE ($2,000 under 60, $12,500 at 60+, pension and eligible retirement income combined, per person); **K** GA ($35,000 at 62-64, $65,000 at 65+), SC's old tier, others | replace the single `minAge` and `cap` of `perPerson` by `tiers: [[minAge, cap], ...]` (the highest tier a filer has reached applies; a filer under the first tier gets nothing) | the same per-filer loop as `perPerson` with a tier lookup | a couple with ages in two tiers; a filer just under the first tier |
| 4 | **Which income bucket qualifies** (`applies`) | **W** AL-type rules; **K** states that exclude defined-benefit pensions but not IRA or 401(k) withdrawals (AL, LA, IL's reverse), public-sector pensions only (several), PA's split (already modeled by two minimum ages) | `applies: { pension, traditional }` booleans on every per-person kind, in addition to (not instead of) the per-bucket minimum ages | the loop already reads `pensionA/B` and `retirementA/B` separately; add the two flags. Military and public-employee pension rules cannot be told apart (the engine has one `pension` stream): the row's `notes` says which way the simplification leans | a pension-only and a traditional-only row |
| 5 | **Pension cap shared with Social Security (a per-person bucket)** | **W** CO (the $24,000 / $20,000 bucket shared by the person's Social Security subtraction and pension and IRA subtraction, working reading above), ME ($48,216 per person for 2025, reduced dollar for dollar by Social Security and railroad retirement benefits, with an AGI phase-out from 2025) | `retirementExclusion` kind `perPersonSharedCap`: `{ tiers: [[minAge, cap]], reducedBy: 'socialSecuritySubtracted' | 'benefitsReceived', phase?: stepTable }` (CO reduces by the Social Security amount that person subtracted, ME by all benefits received, taxable or not) | needs **each partner's own Social Security benefits** (`ssBenefitsA/B`) on `sources` (today only the total `ssBenefits`; `profile.ssA/ssB` already exist); excluded = max(0, min(income, cap - benefits)) per filer, times the AGI share | benefits 0, partial, above the cap; with the AGI phase-out |
| 6 | **Cap and AGI share together** | **K** NJ (a per-status exclusion amount that is zero once income passes a limit, with a cliff near $100,000 and a lower band), GA, MD | allow `perPerson` to carry `share: stepTable` as well as `cap`, multiplied | the per-person total times the AGI step value | at each step edge |
| 7 | **Federal income tax paid as a state deduction** | **W** AL (full), MO (partly); **K** OR (capped, phased out by income), MT, ND-style variants (to confirm each) | `federalTaxSubtraction` becomes `{ kind: 'lagged', cap?, phase? }` (the 7C `'none'` stays valid) | **one lagged pass, not an iteration**: `taxFor` first computes the federal tax with a state tax of zero (the federal itemizing test can only change if itemized deductions beat the standard one), passes it to `sources.federalTax`, then computes the state tax, then the real federal tax with the state tax as SALT, as today. Only a row with `kind: 'lagged'` pays for the extra federal pass (`stateNeedsFederalTax`). Document the small inconsistency (the deducted federal tax ignores the SALT feedback) in the row | a synthetic row at an income where the answer is hand-computed; assert no loop and the extra pass count |
| 8 | **Starting point is federal taxable income** (conforming states) | **K** CO, ID, ND, OR, UT (credit based), VT, NM (to confirm each), and SC before 2026 | `federalConformity: { standardDeduction: true, seniorDeduction: bool, ageAdditional: bool }` (an explicit none elsewhere) | add the federal standard deduction for the status (`standardDeduction(filing, yearIndex, ages)`, which depends on no state tax, so no circularity) and optionally the federal senior deduction (`seniorDeduction`, 2025-2028 only) to the state deduction. A state that conforms at a fixed date (static) versus rolling is recorded in `notes` | a conforming row with and without a 65+ filer, checked against the federal helper |
| 9 | **Social Security rules beyond the AGI cliff** | **W** CO (65+ all; 55-64 all under $75,000 / $95,000 AGI, otherwise capped at $20,000 together with pension income; under 55 nothing: confirm); **K** MN, UT (a credit), WV, MT, NM, VT, KS, MO, RI, NE (AGI tests, phase-outs, a credit that falls with AGI) | extend `base.socialSecurity`: `{ kind: 'ageAgiTiered', tiers: [[minAge, ...]] }`, `{ kind: 'agiPhaseOut', start, rate, floor }` (the subtraction falls by `rate` per dollar of AGI over `start`), and the credit form through the credits list (`ssCredit`) | per-person ages already on `sources.ages`; the AGI used is the federal AGI proxy as for CT; `ssBenefitsA/B` (mechanism 5) | each tier and a phase-out end point |
| 10 | **Exemption extras** | **W** MA ($4,400 / $8,800 / $6,800 HoH plus $1,000 per dependent; more at 65+ and blind), MS ($6,000 / $12,000 / $8,000 head of family plus $1,500 per dependent), AL ($1,500 / $3,000, dependent amount unsettled); **K** NJ and others with a 65+ extra | `exemption` (per column, exists), `dependentExemption` (exists), add `seniorExemption: { age, amount }` (per qualifying filer at or over `age`), and allow `dependentExemption` to be `{ amount, phaseDown? }` for the AL-style income tiers | senior count from `sources.ages`; no new inputs (blind is not modeled: documented) | a senior couple and a family |
| 11 | **Circuit-breaker credit** | **K** MI, MN, WI, VT, MD, IA, KS, CT-like variants, NY's RPTC (not built in 7C), and the renter forms | new credit kind `circuitBreaker`: `{ rentShare, minAge?, incomeBasis, thresholdPct, max, pctOfExcess, refundable }`: relief = min(max, pctOfExcess x max(0, propertyTax + rentShare x rent - thresholdPct x income)) with an income cap | `sources.propertyTax` and `sources.rent` already exist; the income basis is the household income proxy (state AGI plus the Social Security the state counts: say so in the row); refundable ones can take the tax negative as in 7C | a renter and an owner, below, at and above the cap |
| 12 | **Flat personal and senior credits** | **W** DE (a $110 personal credit and a 65+ one, to confirm amounts), **K** OR, NJ, IL-type credits | reuse `exemptionCredits` (CA shape: `personal`, `senior`, `dependent`, a `phaseOut`) where it fits; add an `incomeTestedCredit` kind (a flat amount that stops above an income, or falls by steps) where it does not | the 7C credit loop | per kind |
| 13 | **Capital gains shapes beyond a fixed share** | **K** MT (two rates on gains), MA (5% general, a higher rate on short-term gains, which the engine's long-term gains never hit), AR, ND, NM, SC (percentage exclusions, covered by `gainsIncluded`), NH and TN (tax on interest and dividends only, repealed or phasing out: check), WA (done) | `base.gains`: today `gainsIncluded` (a share); add an optional `gainsRate` (a flat rate on gains instead of the bracket rates) and `gainsDeduction` (a dollar exclusion) | gains separated from the ordinary base before the bracket tax | a row with a rate on gains and a dollar exclusion |
| 14 | **Additions with per-column thresholds** | **W** HI's 13% rate arrives as a bracket (so mechanism 1), but a surtax-style addition can differ by status elsewhere (`threshold` is one number today) | allow `threshold` to be a number or `{ single, mfj, hoh }` | one lookup by column | a surtax with two thresholds |
| 15 | **Per-person Social Security on `sources`** | prerequisite of 5 and 9 | add `ssBenefitsA` and `ssBenefitsB` next to `ssBenefits` in all three `taxFor` branches (two-filer: each partner's own return reads its slot A) | plumbing only, bit-identical for every row that does not read it | the existing `taxFor` plumbing test, extended |

Not planned (documented gaps, listed so a row's `notes` can say so): state itemized deductions, military-versus-civilian and public-versus-private
pension distinctions, blind exemptions, earned-income credits that follow the federal EITC, nonresident rules, and any local tax.

Sequencing inside 7D: (1) a plumbing commit (15), (2) a mechanisms commit for 1, 2, 3, 4, 5, 6, 8, 10, 14 with tests, (3) a second mechanisms commit for 7, 9, 11, 12, 13
with tests, (4) the data commits by group. A mechanism that the data of its own group does not need yet may slip to the group that does, but never after
its data: the rule from 7C holds that a row is not written before the mechanism and its test exist.

### 7D part 2: state-tax performance (owner decision, after the 7D PR)

Why: the 7D PR fails the +5% timing gate (`tests/bench_runs.js`, all 51 states, branch base -> 7D: about 40 states above +5%; Oregon +83%, Missouri +79%, Colorado +57%, Montana +45%, Kentucky +44%, Maryland +43%; flat-rate states +20% to +30%; numbers in the 7D commit 11 notes). A slider move stays about 80 ms in most states (measured with every results card open), but Missouri went 67 -> 161 ms, and the heavy paths (Monte Carlo, tornado, Roth optimizer) were not measured per state. The cause is the generic evaluator, not any row. The owner chose to ship 7D as is, record the cost, and fix it in this follow-up. No behavior change is allowed: every number (all snapshots, `tests/state_7d_households.js`, `tests/state_reference.js`) must stay exact.

Three optimizations, in this order, each its own commit with a before/after from `tests/bench_runs.js --scale 3` on all 51 states against the 7D tip:
1. **Cache the federal conformity deduction.** `stateIncomeTax` calls `standardDeduction(filing, yearIndex, ages)` and `seniorDeduction(...)` on every call for a conforming row (DC, MT, ID, NM, and others). Cache per (filing, year index, ages signature, AGI for the senior phase-out), cleared when the state inputs that feed them change. Expected: removes most of the DC/MT/ID cost.
2. **Cache the lagged federal-tax pass** (`federalLiabilityForState`, rows with `federalTaxSubtraction.kind === 'lagged'`: AL, MO, OR). Key on the profile and year and the gains and traditional draw it depends on. Correctness risk: a stale value gives a wrong state tax, so add a test that changes one input at a time (wages, gains, draw, filing status, children) and compares cached against uncached results, and cover the MAGI-iteration rewind path (`tests/aca_magi_iteration.js`). Expected: removes most of the OR/MO/AL cost.
3. **Build per-person inputs only for rows that read them.** `taxFor` assembles pension, retirement and Social Security splits (`pensionA/B`, `retirementA/B`, `ssBenefitsA/B`, `taxableSSA/B`) for every taxing state. Compile a per-row `needs` flag set (per-person retirement kind, Social Security split, property tax, rent, dependents) and skip the rest; also keep the compiled row's hot-path arrays allocation-free. Expected: the +20% to +30% on flat-rate states.

Acceptance: every state within +5% of the branch base on the full 51-state run (or the remaining overruns named, with the reason); `npm test` green with snapshots unchanged; slider latency re-measured with all cards open for TX, MA, OR, MO; measure Monte Carlo, the tornado chart and the Roth optimizer per state once (not done in 7D). If a state still exceeds the gate after all three, record it in this section.

### 7J: Canadian federal age amount and pension income credit

Moved here from Batch 4 (owner decision). Verify the current amounts and the
age-amount income clawback, add them to `personTaxCA`, extend the Canada
section of `tests/tax_brackets.js`, and record the before/after (intended
number change for anyone 65+; per-person, so it respects the two-return model
and pension splitting).

### 7K: provinces (one PR)

Decided: all provinces in one PR, reviewed as a whole table via a generated
`docs/province-tax-rules.md` (same mechanism as the state table). Quebec is its
own commit inside the PR because it is the largest special case.
- Same data-table pattern: `PROVINCE_RULES[code]` with a coverage test across
  the 10 provinces (no territories). Items per the owner: provincial basic
  personal / spouse / eligible-dependant amounts (dependants are children from
  7A), age amount and its income clawback, pension income amount, low-income
  reductions, child and family credits, property-tax and rent credits, and
  dividend tax credits.
- **Dividend credits, what is already there and what to check.** The code
  already models the 38% gross-up, the federal eligible-dividend credit
  (15.0198%) and a provincial eligible-dividend credit rate for each of the ten
  provinces (`PROVINCE_ELIGIBLE_DTC`); the "How the model works" callout on the
  page still says provincial dividend credits are not modeled, which is stale and
  gets corrected here. To verify and decide: (1) each province's 2026
  eligible-dividend credit rate; (2) non-eligible Canadian dividends (15%
  gross-up, smaller credit) are currently taxed like interest, which is right
  for foreign dividends but not for non-eligible Canadian ones, so decide whether
  the existing eligible-share input needs a non-eligible counterpart; (3)
  Ontario's surtax is computed before the dividend credit and not recomputed
  after it, and Quebec's abatement is applied to the federal credit, both noted
  simplifications to confirm or fix; (4) the credit is non-refundable and
  floored at zero tax, as modeled.
- Quebec is a separate provincial return with its own abatement and QPP rules
  and gets its own PR.
- Reference provinces first (ON, BC, AB, QC), then the rest.

### 7L: Canada's income-tested federal benefits

In scope per the owner. These are benefits paid to the household, not credits
against tax, so each needs its own income test and its own output line.
- **Guaranteed Income Supplement and the Allowance** (paid with OAS to low-income
  seniors): tested on net family income. RRSP/RRIF withdrawals and most other
  income count and are clawed back at a high effective rate; TFSA withdrawals do
  not count. Needs OAS to be taken and the couple/single rate tables. This is
  the main Canadian reason to prefer TFSA draws, so it feeds the 4A income-room
  hook.
- **Canada Child Benefit**: paid on children from 7A (under 18), reduced by
  adjusted family net income, amounts that step with child age bands.
- **GST/HST credit**: income-tested, with a family/child supplement.
- Provincial benefit programs that are paid rather than credited (e.g. Ontario
  Trillium Benefit components, BC and Alberta family benefits) come with the
  province rows in 7K and reuse the same plumbing.
- Rows expose a `benefits` column (income-tested benefits received) so the
  Canada optimizer objective in 4B can net it against tax.
- Each benefit shows as its own line in the cash-flow outputs so users can see
  income-tested amounts, and survivor symmetry is re-checked
  (`tests/survivor_symmetry.js`).

### Remaining scope assumption (Batch 7)

State, provincial and benefit child rules each have their own age cutoff; the
cutoff is a field in the jurisdiction's data row and the shared children list
from 7A is read through `dependentsInYear(year)`.

---

## Batch 8: Social Security survivor-claim optimizer (after everything above)

Added at the owner's request, to be done after all earlier batches. Prerequisite:
Batch 6's survivor rules with independent claim ages.

- **What it searches.** For a surviving spouse: the age to start the survivor
  benefit and the age to start (or switch to) their own retirement benefit, in
  both orders. Order one: take the reduced survivor benefit early (as early as
  60), then switch to the own benefit at a later age (up to 70) when it is larger.
  Order two: take the own benefit early and switch to the survivor benefit at the
  survivor's full retirement age, when it is larger (or at any age in between).
  It runs for each death scenario (Partner A dies first, Partner B dies first),
  using the planner's existing survivor-period assumptions.
- **Method.** A small grid (survivor start age 60-70 by own start age 62-70, a
  few hundred cheap evaluations per scenario) evaluated by the projection engine,
  so exhaustive search is affordable and no coordinate ascent is needed. Objective
  from the Batch 5 objective registry (default: total after-tax household income
  over the survivor period, also reporting end-of-plan portfolio).
- **Output.** A "Survivor claiming strategy" results card: recommended survivor
  start age and switch age per scenario, with the dollar difference against the
  planned ages and a plain statement of what it assumes (no remarriage, benefit
  rules as modeled). An "apply" action writes `ssSurvivorStartAgeA/B` and the
  own-benefit start ages.
- **Tests.** Hand-computed two-year cases where each order wins, a case where
  the reduced early survivor benefit loses to waiting, and survivor symmetry.

---

## Final step: consolidate into `docs/reference.md`

After Batch 8 is merged, one docs-only PR moves every "Batch notes" entry into
`docs/reference.md` in the existing chronological style, merges overlapping
topics (for example the account model touched by 3A, 3B and 3C), updates the
architecture sections that changed, and checks `CLAUDE.md` and `README.md` for
anything still stale. Batch 1 was consolidated early (2026-10-03, owner request).
**Must carry over (owner request):** update the "Batch 1" section of
`docs/reference.md` with how Batch 3C resolved the safe-MAGI-room test gap (the
room is computed from a MAGI that already contains the same year's estimated
draw) and how Batch 3B resolved the early-retiree pre-retirement bond-bucket
strategy (the 10% penalty on reserve draws). The per-batch note sections are then removed from this
file, leaving the plan as a record of scope and decisions.

---

## Batch notes

One subsection per batch is added by that batch's PR. Empty until work starts.

### Batch 1 notes
Consolidated into `docs/reference.md` ("Batch 1: historical parity and gradual
bond refill") on 2026-10-03, at the owner's request, after PR #2 merged. The two
open items it raised stay tracked here (Open items, Batch 3B and 3C) and must be
updated in that `reference.md` section when they are resolved.

### Batch 2 notes

US V80 -> V83 (V81 Medicare, V82 deductions, V83 state-tax copy). Canada untouched
(its snapshots are byte-identical; only the shared mortgage fragment gained data).
Branch `claude/batch-2-us-tax-medicare`, one commit per plan step plus this notes
commit. No new input fields, no new state keys, no migrations.

**Source verification status (read this first).** irs.gov, medicare.gov, cms.gov,
ssa.gov, federalregister.gov, congress.gov and law.cornell.edu were all still
blocked by the egress proxy on 2026-10-04 (`EGRESS_BLOCKED`; bls.gov was not retried).
No primary source could be fetched. Every figure below was confirmed only from
**search-result summaries of secondary sources** (retrieved 2026-10-04 with
WebSearch; the pages themselves were not opened), so none is verified against the
IRS publication, the Rev. Proc. or the statute. Re-confirm each against the primary
document at the next tax update. What was used:
- Rev. Proc. 2025-32 (tax year 2026 adjustments): standard deduction $32,200 MFJ /
  $16,100 single / $24,150 head of household; additional standard deduction for age
  65+ (or blind) $1,650 per condition married, $2,050 unmarried (IRC 63(f)). Via the
  KPMG Tax News Flash on the Rev. Proc. (kpmg.com/us/en/taxnewsflash/news/2025/10/
  tnf-rev-proc-2025-32-inflation-adjustments-for-2026-individual-taxpayers.html),
  Journal of Accountancy and The Tax Adviser summaries.
- Enhanced (senior) deduction, IRC 151(d)(5)(C), P.L. 119-21 section 70103: $6,000
  per person aged 65+ by year end, tax years 2025 through 2028, on top of the
  standard deduction and available when itemizing, reduced by 6% of MAGI over $75,000
  (single) / $150,000 (joint), gone at $175,000 / $250,000 for one eligible person.
  Via search summaries of IRS "Check your eligibility for the new enhanced deduction
  for seniors" (irs.gov/node/156821, title seen, page not opened) and tax-software
  explainers (TaxAct, nationaltaxtools.com, q3adv.com).
- SALT cap, IRC 164(b)(7): $40,000 (2025), $40,400 (2026), +1% a year to $40,804
  (2027), $41,212 (2028), $41,624 (2029), $10,000 from 2030; reduced by 30% of MAGI
  over $500,000 (2025) / $505,000 (2026), threshold +1% a year, never below $10,000;
  halved for married filing separately (not modeled). Via The Tax Adviser, "Cap
  raised, strings attached: The 2025 SALT shake-up" (thetaxadviser.com, March 2026
  issue), Kiplinger and TaxAct summaries.
- Mortgage-interest acquisition-debt limit $750,000 made permanent: taken from this
  plan, not re-looked-up. The model ignores the $1,000,000 limit for loans taken out
  before 2017-12-16 (that would only increase the deduction).
- Medicare enrollment (decision 3, owner's rule): not a figure to verify; the rule
  of enrolling at the later of 65 and the end of work, no late-enrollment penalty, is
  a modeling decision. (Real-world Part B special enrollment depends on employer
  coverage; medicare.gov was not reachable to re-read it.)

**Decisions made while building (not in the plan).**
- *Where the deduction is computed.* Inside `taxFor()`, per return, from that
  return's own AGI (ordinary + gains), the state tax it has just computed, and
  `profile.propertyTax` / `profile.mortgageInterest`. The plan proposed reading
  the realized MAGI from the MAGI iteration; that is unnecessary because `taxFor`
  already receives the realized discretionary gains and traditional draws, so the
  phase-outs use exactly this call's income with no extra pass and no circularity.
  Confirmed that no modeled state tax takes the federal deduction or federal tax as
  an input (`stateIncomeTax` reads income sources and `taxableSS` only).
- *Tax year of a plan year* = `currentYear + yearIndex` (the clock the engines
  already use for RMD birth years; the snapshot harness pins it to 2026-06-15). Both
  engines use it: historical runs replay returns, not tax law, so the senior
  deduction window and the SALT table follow the plan's own calendar years. The
  existing brackets still treat plan year 0 as 2026 whatever the date (a known
  limitation until the 2027 update).
- *Unindexed statutory amounts.* The senior deduction ($6,000, $75k/$150k
  thresholds), the SALT cap table and its $500k threshold, and the $750,000 debt
  limit are fixed nominal amounts, not run through `taxIndexFactor`, as the law
  has them; in a high-inflation historical path they lose real value. The 65+
  additional standard deduction is indexed (it is inflation-adjusted annually).
- *SALT threshold after 2026* compounds at 1% from $500,000 (510,050 in 2027).
  Secondary sources say only "increases 1% a year"; confirm when primary sources
  are reachable.
- *Senior phase-out* reduces each eligible person's $6,000 by 6% of the excess MAGI,
  then sums (so a joint couple with both 65+ and one eligible spouse alike lose it
  entirely at $250,000, a single filer at $175,000). The first version of step 3
  reduced the couple's combined $12,000 once (gone at $350,000); corrected after the
  owner's reading of 151(d)(5)(C) and the widely quoted $250,000 joint figure, which
  the statute text should settle. It is treated as a deduction from taxable income,
  not from AGI (our understanding: it is claimed with the qualified business income
  deduction on Form 1040 and does not lower AGI), so the phase-out MAGI, taxable
  Social Security, the SALT phase-down and IRMAA all read income before it; this is
  also unverified against the form and should be confirmed. Age is the planner's integer age
  during the year (the law says 65 by year end), so a person turning 65 mid-year is
  treated as 65 for the whole year.
- *Two single filers (`marryLater` before the wedding).* Each return picks its own
  standard-or-itemized deduction; property tax and deductible mortgage interest are
  split 50/50; each filer gets the full SALT cap. Survivor and single-person years
  use the single branch with the survivor's age and the whole household's housing.
- *Mortgage interest limit.* `deductible interest = interest x min(1, 750,000 /
  original principal)`, a proration rather than the exact balance-based rule. The
  principal falls back to the current balance when no original loan is entered.
- *Roth-conversion bracket sizing* uses `max(age-adjusted standard, min(SALT cap,
  property tax) + mortgage interest)`. State income tax and the senior deduction
  are left out because they depend on the conversion itself; a 65+ filer therefore
  converts slightly less than an exact calculation (up to the senior deduction,
  $12,000 for a couple, of bracket room). Documented approximation.
- *Medicare.* `healthcareCost()` receives `workingA/workingB`; Medicare and IRMAA
  are charged to a partner only when `age >= 65 && !working` (and, as before, alive
  and not single-person B). The ACA eligibility helper and the conversion-ceiling
  IRMAA guard (`!working && age >= 63`) already agree with this and are unchanged.
  The survivor's cost stays their half of the household figure, as before.

**Cross-check against an owner-supplied table (2026-10-04).** The owner supplied a
table of the same rules with IRS, Cornell LII (26 USC 151, 163(h)(3), 164(b)(7)),
Medicare.gov and CMS links. Those links were not fetchable from this environment, so
the table is a second secondary source, not a primary verification. It agrees with
the implementation on every row: standard deduction $32,200 / $16,100 and the age
amounts $1,650 / $2,050; the senior deduction ($6,000, 2025-2028, 65 by year end,
phase-out 6% over $75,000 / $150,000, allowed with itemizing); the SALT cap table
($40,000, $40,400, $40,804, $41,212, $41,624, then $10,000), the $505,000 (2026)
threshold, 30% rate and $10,000 floor, and the threshold compounding at 101% of the
prior year ($510,050 in 2027, not $510,000), which settles the compounding question
above; the $750,000 acquisition-debt limit as permanent (pre-12/16/2017 loans keep
$1,000,000, not modeled); and the 2026 IRMAA tiers (the code's per-partner Part B +
Part D surcharges $95.70 / $240.40 / $385.00 / $529.60 / $578.00 equal the table's
81.20+14.50, 202.90+37.50, 324.60+60.40, 446.30+83.30, 487.00+91.00; MFJ bounds
$218k / $274k / $342k / $410k / $750k). The table's Medicare rules (Part B can wait
while current-employment coverage lasts; an 8-month special enrollment period after
work or coverage ends; COBRA does not extend it) match the modeled assumption of
enrolling the year work stops and are consistent with "no late-enrollment penalty";
the model does not represent the 8-month window or COBRA. Still to do at the next tax
update: open the primary pages and cite them directly.

**What moved (before/after).**
- Step 1: nothing (475 US / 359 Canada scenarios and the UI baseline identical).
- Step 2 (Medicare): no existing scenario moved (none has anyone working past 65).
  New pinned scenarios (US `R work past 65`, `... single`, `... survivor` and their
  40 historical variants). `R work past 65` (A retires at 68, B at 66): lifetime
  healthcare $620,365 -> $595,520, ending total $14.98M -> $15.13M; single works to
  69: $601,532 -> $545,650. Seeded success rates unchanged.
- Step 3 (deductions): 433 of 877 scenario files moved, all US. Anyone 65+ in the
  projection moves; couples under 65 do not; four single-person scenarios move from
  year 0 because a single homeowner's default mortgage interest (about $16.4k on the
  default $300,000 / 5.5% loan) is just above the $16,100 standard deduction (the
  deliberate "itemize when larger" rule). Default scenario (ages 52/50, standard
  engine): tax at 68 $14,115 -> $13,669, at 78 $3,308 -> $2,653, ending total
  $5,007,409 -> $5,143,807. Seeded success rates (2000 paths, seed 7), start of
  Batch 2 -> end:

  | Planner | Scenario | Historical | Monte Carlo |
  |---|---|---|---|
  | US | default | 82.9% -> 82.9% | 84.5% -> 84.7% |
  | US | early retiree | 86.8% -> 86.8% | 86.8% -> 86.9% |
  | US | early retiree, smooth | 83.0% -> 83.0% | 86.2% -> 86.3% |
  | US | early retiree, live mix | 86.8% -> 86.8% | 86.8% -> 86.9% |
  | US | working, then retires, bondYears 4 | 85.4% -> 85.4% | 86.2% -> 86.4% |
  | Canada | all five scenarios | unchanged | unchanged |
- Step 4 (state-tax copy): only the UI baseline's rendered-text hash moved.
- Run time: the US snapshot run is still about 2.0 s (the deduction math is a few
  comparisons per `taxFor` call).

**Tests.** New `tests/medicare_enrollment.js` and `tests/deductions.js` (both in
`npm test`; hand-computed, mutation-checked: each rule, constant, wiring step and
the cutoff year was broken in the planner and the test failed). `tests/tax_brackets.js`
extended (explicit-deduction parameters, `standardDeduction`). Revised because the
new rules legitimately change their numbers (each was checked against a hand
calculation first):
- `irmaa_gating.js`: asserted a surcharge while still working at 69; now asserts no
  premium or surcharge while working and the lookback surcharge once retired.
- `historical_tax_indexing.js`: its invariant is "everything indexes with
  inflation"; the fixed senior deduction breaks that for a 65-year-old, so it now
  runs in tax year 2030 (after the sunset; the indexed 65+ amount is still covered).
- `dividend_income.js`: US retiree is 64 instead of 65 so its plain $16,100
  deduction arithmetic holds.
- `historical_bond_yield.js`: expects $1,185 instead of $1,420 (deduction $18,150
  at 75: 10% x 11,850).
- `snapshot_scenarios.js`: three US work-past-65 scenarios added (hist grid too).

**Gotchas.**
- The `07-mortgagePayment` fragment (mortgage schedules, `buildDeferredMortgage`)
  is shared with Canada, so the new `interest` arrays were added in `shared/` and
  synced. The `propertyTax` field's label used to sit inside the shared
  `html-medicalInflation` markup region, so a US-only itemizing info bubble failed the
  drift check. Fixed in a follow-up commit (US V84): that region now ends just before
  the property-tax field and a new `html-propertyTaxGrowth` region starts right after
  it, so the one `propertyTax` line is per-planner (Canada's text is unchanged, byte
  for byte; only the marker comments moved). The US label carries the itemizing bubble
  as well as the filing-status bubble and the methodology text.
- The filing-status bubble is hidden for single-person plans, so the methodology
  callout ("Tax treatment") carries the same deduction text for them.
- Any test that hand-derives US tax for a 65+ person must now allow for the
  additional deduction and, through 2028, the senior deduction; pin the clock
  (`page.clock.install`) or use an under-65 person.
- Itemizing triggers for single-filer homeowners at the default loan; the interest
  is the model's, not an input the user typed, so users will see small changes
  without touching anything.
- Medicare bubble copy exists in three places (field info bubble, README, the
  methodology "Healthcare, ACA, Medicare & IRMAA" callout); step 2 missed the
  callout and step 3 fixed it.
- Background-job trap again: `pkill -f '<pattern>'` killed the invoking shell;
  never use it in the same command line as the pattern.

### Batch 3A / 3B / 3C notes

#### Batch 3A: account model (US V85 -> V88; Canada code untouched)

Branch `claude/batch-3a-account-model`, cut from the Batch 2 merge (`6b91093`). Four
commits plus this notes commit. The plan called 3A a no-number-change batch; the owner
changed that during the batch (the ledger should drive the shares, and the Roth basis
should default to 50%), so two of the four commits are **intended number changes**, each
isolated with its own snapshot update. All 359 Canada scenarios are byte-identical at every
commit.

**Source verification status (read this first).** irs.gov, law.cornell.edu and
federalregister.gov returned `EGRESS_BLOCKED` again on 2026-10-04 (retried this session);
ssa.gov, medicare.gov, cms.gov, congress.gov and bls.gov were blocked in Batch 2 earlier that
day and not retried. No primary source could be opened. 3A changes **no limit, bracket or
tax figure**; it only routes contributions that the engine already computed. The limits it
routes were checked only against **secondary sources** (one WebSearch on 2026-10-04; the pages
themselves were not opened): 2026 401(k) deferral $24,500, catch-up $8,000, age 60-63 catch-up
$11,250, IRA $7,500 plus $1,100 catch-up, and the Roth catch-up rule above $150,000 of prior-year
FICA wages, all attributed to IRS Notice 2025-67 (sources: 401kspecialistmag.com, Frier Levitt,
visionretirement.com, credaily.com summaries). **Not confirmed at all:** the $72,000 annual
additions limit the mega-backdoor room uses (`72000 * limitFactor` in
`retirementContributions`), and every Roth ordering rule below (Treas. Reg. 1.402A-1 pro-rata
for Roth 401(k), 5-year clocks), which stay as the plan's secondary-source rule check and are
re-read when 3B implements them.

**What was built.**
- Per partner, four accounts: `tradIraA/B`, `trad401kA/B`, `rothIraA/B`, `roth401kA/B` (all
  `.money`), `rothIraBasisA/B` (dollars) and `roth401kBasisPctA/B` (slider). One collapsible
  "Retirement accounts" group (`#retirementAccountsGroup`, `data-cat="assets"`, US-only markup
  outside the shared regions) replaces the four old Assets fields.
- **`rothIraBasis` 0 means "not entered".** The registry's number listener cannot represent a
  blank (it stores `Number(x) || 0`, in a shared fragment), so 0 = assume
  `ROTH_BASIS_ASSUMED_PCT` (50) of the balance and "enter $1" means none. Tests that need a true zero
  use a Roth 401(k) at 0% instead (an exact zero).
- **Partner B's accounts are ignored in single-person mode** (not summed; owner decision). Toggling
  single-person on therefore removes B's balances from the plan. `openingAccounts()` is the one place
  that applies this; the sidebar sums, the group summary and the wizard use it too.
- **Engine.** `bal.traditional/roth` start as the sums of the four accounts. The ledger `accts`
  (`accountsNew/Contribute/Convert/Draw/Clone/Restore`) stores each account's SHARE of its pool in
  `ACCOUNT_SLOTS` order `[IRA A, 401(k) A, IRA B, 401(k) B]`; growth, ladder/refill moves and draws
  are pro rata and leave shares alone. Contributions route to the owner's account (employer match to
  the traditional 401(k); k401Type roth and catch-up to the Roth 401(k); iraType roth to the Roth IRA;
  mega-backdoor to the Roth 401(k)); Roth conversions draw the IRAs first (pro rata between the two),
  then the 401(k)s, into the same partner's Roth IRA; a partner's RMD/72(t) amount comes out of that
  partner's own accounts (a single person or the survivor draws pro rata, no share moves). The
  ledger is cloned/restored in the MAGI-iteration snapshot (`accountsClone/Restore`).
  `rothLedger` stays one pooled basis-first ledger (Roth IRA and Roth 401(k) share it); its opening
  basis is `openingRothBasis()` = per partner `min(Roth IRA balance, entered basis)` (or the assumed
  share when none) plus Roth 401(k) balance times its slider. **Per-account Roth ledgers and the
  pro-rata Roth 401(k) rule are 3B**, where something reads them; building them now would have been
  dead code.
- **Wizard.** The shared `28-wizardOverlay` fragment is data-driven (`[data-wizard-step]` panels with
  `data-title`/`data-note`, `[data-wizard-mirror]` inputs); Canada's wizard keeps two steps and its text
  (its markup gained the data attributes only). CSS `#wizardStep2` rules became `.wizard-grid`. The US
  wizard has three steps: basics, "Your balances" (taxable, cash, the eight accounts, a basis callout),
  optional questions.

**Decisions made while building (not in the plan).**
- *Ledger as shares of a pool, not dollar balances per account.* Same-allocation growth means shares
  only move on contributions, conversions and owner-specific draws, so the ledger hooks are four
  places, and a hook that is skipped shows up as a share that is wrong. Dollars are derived
  (`share x pool`).
- *No-shortfall transfer in `accountsDraw`.* A first version moved the part of a partner's RMD their
  accounts could not cover onto the other partner. It is unobservable: the short partner is emptied
  either way and renormalizing the remaining dollars gives the same shares, so mutation testing could
  not distinguish them; the code was removed and the test asserts the emptied-partner result.
- *Roth penalty blend* uses the Roth share (`accountsOwnerShareA(accts.roth)`); the old engine used
  the traditional ownership slider for both. Roth shares move only by contributions and conversions.
- *Rule of 55 and 72(t) still act on the pooled traditional balance* (IRAs included). The plan's
  "Rule of 55 only on 401(k)s" and per-account 72(t) are 3B; until then the traditional IRA and 401(k)
  behave identically, and the info bubbles say so.
- *Three-commit staging of the number changes* (owner agreed): commit 2 changed no number, commit 3
  (ledger drives shares) and commit 4 (50% basis) each regenerated the simulation baseline on its own,
  so each effect is attributable.
- *Test vocabulary.* The grid and ~15 older tests speak the old pooled vocabulary through
  `tests/legacy_balances.js`: `legacyToAccounts` (snapshot, UI surfaces, `bond_refill`,
  `historical_rates`) and `translateFieldList`/`setBalance` (Playwright tests that drive DOM ids).
  Old `traditional` becomes the 401(k)s split by the old slider (all on A when single), old `roth`
  the Roth IRAs (snapshot) or Roth 401(k)s with the slider set from `rothBasisPct` (DOM tests, so a
  0% basis is an exact zero). `pinBasis`/the DOM translator keep 100% for hand-computed tests; the
  snapshot grid runs at the planner's own 50%. **Do not pass the old keys straight to
  `Object.assign(state, ...)` in a new test: the engine ignores them.**

**Gotchas.**
- A first measurement of the early-retiree success rate showed 15.1% in both columns:
  `tests/historical_rates.js` had set the retired pooled keys, which the new engine ignores. The script
  now translates; the before column then reproduced the Batch 2 end values exactly (86.8% / 86.9%).
- The snapshot harness merges patches straight into `state` (bypassing `normalizeState`), which is why
  retiring a field breaks every scenario that names it until the grid is translated.
- A single-person patch that names no balances needs the household's balances moved to A, or half of
  the money silently disappears (the default single scenario caught this).
- `roth_early_access` scenarios had `rothBasisPct` 0 and expect cent-exact numbers; a $1 Roth IRA
  basis would have shifted them, hence the Roth 401(k) at 0% for those.
- The two-step `renderWizardStep` hard-coded step ids in a shared fragment; any new step needs
  `data-wizard-step` plus `data-title`/`data-note`, or it is skipped.
- After a conversion the converted Roth money is all Roth IRA, but opening Roth 401(k) money stays in
  the Roth 401(k) slots: shares are exact, but the pooled `rothLedger` still treats both the same.

**What moved (before/after).**
- Step 1 (ledger, no inputs) and step 2 (new inputs and wizard): nothing. 518 US and 359 Canada
  simulation scenarios byte-identical, no simulation baseline update; the default scenario's rows hash in
  the UI baseline is unchanged. Only the UI baseline (new controls, new text) and the legacy-state
  corpus (retired keys dropped, new fields) were regenerated.
- Step 3 (ledger drives RMD, 72(t) and penalty shares): 330 of 518 US scenarios moved (52 standard,
  278 historical), none in Canada. Median |change| of final investable 0.017%, p90 0.05%. Default
  scenario: age-60 penalty 2,391 -> 2,726, lifetime penalty 30,290 -> 34,539, lifetime tax
  1,029,578 -> 1,030,174, investable at retirement 1,815,962 -> 1,815,568, end of plan 2,644,777 ->
  2,523,687 (-4.6%; the extra penalty at 60-64 leaves the Roth balance about 7k lower at 75 and
  that compounds for 30 years). Symmetric early retirees (`std R`) do not move.
- Step 4 (Roth basis 50%): 89 of 518 US scenarios moved (11 standard, 78 historical), only those that
  draw Roth before 59.5; median change 0, largest -3.9% (hist R mixApplied boom). `std R mixApplied`:
  lifetime penalty 51,200 -> 62,139.
- Seeded success rates (2000 paths, seed 7), start of 3A -> end of 3A (US; Canada unchanged):

  | Scenario | Historical | Monte Carlo |
  |---|---|---|
  | default | 82.9% -> 82.9% | 84.7% -> 84.5% |
  | early retiree | 86.8% -> 86.8% | 86.9% -> 86.9% |
  | early retiree, smooth | 83.0% -> 83.0% | 86.3% -> 86.3% |
  | early retiree, live mix | 86.8% -> 86.8% | 86.9% -> 86.9% |
  | working, then retires, bondYears 4 | 85.4% -> 85.4% | 86.4% -> 86.2% |

- A mis-worded sentence in the step 3 commit message says the UI baseline "moved only for the V87
  badge-free rowsHash of 'std R' staying equal and the rendered text". What it should say: the
  `std R` rows/projection hashes in the UI baseline did not change at step 3; only rendered text and
  the new controls' wiring entries moved.

**Tests.** New: `tests/account_ledger.js` (units for contribute/convert/draw/clone/restore;
contribution routing in the surplus and deficit branches; mega-backdoor; invariants in both engines;
the MAGI-iteration rewind on a lopsided ACA scenario; RMDs from the owner's accounts over three years,
both partners, an emptied partner; the traditional and Roth penalty blends in both engines),
`tests/account_inputs.js` (balances by account and partner, single-person mode, the Roth basis rules and
the 50% defaults, the opening ownership ratio sizing the first RMD), `test_wizard_accounts.js` (three
steps, mirrors, single-person hiding, the group, 390x844 overflow at every step, Canada's two-step wizard
unchanged), `tests/legacy_balances.js` (helper). `tests/legacy_state.js` replaced the two slider cases
with retired-key, valid and junk account cases. Every new test was mutation-checked: 20+ broken variants
(skip the MAGI rewind, wrong routing slot, IRA/401(k) order, fixed 0.5 ratios, B accounts summed in
single mode, assumed basis 0, slider ignored, basis cap removed, a wizard input losing its mirror, a
panel losing `data-wizard-step`, RMD pro rata, B's RMD drawn from A, no clamp). Two survived at first
and led to stronger tests (the rewind needed a lopsided scenario; the basis cap needed a second Roth
account). `npm test` and the root scripts `test_wizard_accounts`, `test_info_tips`,
`test_mobile_category_rail`, `test_dynamic_lists`, `test_spending_and_fi_widgets`,
`test_apply_optimizer_schedule`, `test_live_withdrawal_mix`, `test_multi_lever_optimizer` pass.

**New or changed fields.** Added: `tradIraA/B`, `trad401kA/B`, `rothIraA/B`, `roth401kA/B`,
`rothIraBasisA/B`, `roth401kBasisPctA/B` (all in `FIELDS`, derived MCP schema, `normalizeState`
clamps). Removed without migration: `traditional`, `roth`, `traditionalSharePctA`, `rothBasisPct`
(deleted in `normalizeState`). Defaults: 100,000 per 401(k), 25,000 per Roth IRA, others 0,
`roth401kBasisPct*` 50. Test hooks: `__test_accountTrace`, `__test_accounts`.

**Carried to 3B.** The fractional `penalizedShare` blend (now fed by the ledger) is replaced by a
per-account status; Rule of 55 and 72(t) move to per-account; per-account Roth ledgers and the Roth
401(k) pro-rata rule; the pre-retirement bond-bucket strategy question (Open items) is unchanged by 3A.

#### Batch 3B step 6: pre-retirement bond-bucket source for early retirees (no code change)

**Decision: do nothing.** No option clearly wins, so the ladder (`rotateIntoBondLadder`) and the gradual
refill (`refillBondReserve`) keep their traditional-first order and no shared fragment, test or badge changed.
Measured at the 3B step 5 tip (V92), US only, seed 7, 2000 Monte Carlo paths, `simulate()` for the standard
engine. Canada was not touched. The variants were throwaway edits in a scratch worktree (not committed).

**Baseline.** `npm test` green at the tip. `node tests/historical_rates.js`: early retiree (52/50)
historical 90.6% / Monte Carlo 88.4% (same for the smooth and live-mix versions); default 85.4% / 85.7%;
bondYears 4 87.8% / 86.9%. So the penalty-aware order already recovers the Batch 1 loss (86.8% -> 90.6%) in the
stock early-retiree scenario.

**Upper bound.** Variant `nopen` switches all early-withdrawal rules off (every account free). Where tip equals
`nopen` there is no penalty cost left for any ladder rule to recover:

| Scenario (historical % / MC %) | tip | nopen (ceiling) | (a) | (c) | (b1) half reserve | (b2) none |
|---|---|---|---|---|---|---|
| Early 52/50 (stock) | 90.6 / 88.4 | 90.6 / 88.3 | 90.6 / 88.5 | 94.3 / 90.0 | 90.6 / 89.2 | 96.2 / 89.5 |
| Early, thin taxable | 83.0 / 83.2 | 90.6 / 87.1 | 81.1 / 83.7 | 86.8 / 87.0 | 86.8 / 85.3 | 86.8 / 86.1 |
| Early, trad-heavy, no Roth | 79.2 / 82.8 | 86.8 / 86.5 | 77.4 / 83.0 | 86.8 / 86.0 | 86.8 / 84.9 | 84.9 / 85.8 |
| Early 45/45 | 81.3 / 88.0 | 89.6 / 89.8 | 85.4 / 88.8 | 91.7 / 90.6 | 85.4 / 89.0 | 91.7 / 90.1 |
| Early, bondYears 8 | 81.1 / 85.5 | 81.1 / 85.2 | 79.2 / 84.9 | 92.5 / 89.0 | 90.6 / 87.6 | 94.3 / 88.9 |
| Rule of 55 (all 401(k)) | 94.8 / 95.8 | 94.8 / 95.3 | 94.8 / 95.2 | 94.8 / 95.3 | 96.6 / 96.0 | 98.3 / 95.2 |
| Rule of 55 (IRA-heavy) | 96.6 / 96.6 | 96.6 / 96.4 | not run | not run | not run | not run |
| Default (retire 55) | 85.4 / 85.7 | 85.4 / 86.3 | 85.4 / 85.5 | 90.2 / 90.1 | 87.8 / 88.0 | 92.7 / 89.8 |
| Working, bondYears 4 | 87.8 / 86.9 | 87.8 / 88.2 | 85.4 / 87.0 | 92.7 / 90.4 | 90.2 / 88.3 | 92.7 / 89.8 |
| Retire 62/60 (not early) | 100.0 / 99.5 | same | same | same | same | same |
| Retire 59/57 after 5 working years | 100.0 / 99.5 | same | same | same | 100.0 / 99.4 | 100.0 / 98.9 |

(a) = taxable or Roth first while the reserve will first be drawn before 59.5 (Roth, then taxable, then
traditional as a last resort), traditional first otherwise; "early" is decided from the per-account statuses at
retirement (ladder) or this year (refill), so a Rule-of-55 401(k) counts as free. (c) = penalty-free money only
(no traditional while early). (b1) / (b2) = reserve and ladder target halved / zero while early.

**Standard engine** (`simulate()`, no depletion in any scenario; investable at the last year / total tax over
the plan): early 52/50 tip $11.5M / $1.44M; (a) $8.9M / $2.01M; (b2) $18.2M / $2.45M. Default: tip $2.9M;
(a) $1.7M; (c) $7.4M. Other early scenarios move the same way.

**Findings.**
1. The remaining penalty cost is where penalty-free money runs out (thin taxable, trad-heavy, 45/45): tip is
   4-8 points below `nopen` there. It is a real cost of retiring early with most money in traditional accounts,
   not an artifact of where the reserve sits; in the stock early-retiree case and the Rule-of-55 cases tip equals
   `nopen`.
2. (a) does not help and costs tax. Historical success falls in 4 of the 6 early scenarios (thin taxable
   83.0 -> 81.1, trad-heavy 79.2 -> 77.4, bondYears 8 81.1 -> 79.2, working-bondYears-4 87.8 -> 85.4; only
   45/45 rises, 81.3 -> 85.4). Taxable bonds are taxed on their interest every year and a Roth reserve spends the
   free money the plan wants to draw anyway; total plan tax rises about $0.5-0.6M in the stock case and
   investable at the end falls about $2.6M.
3. (b) and (c) look better but are mostly not a penalty effect: they shrink the actual bond reserve, so the plan
   holds more stock and the 1928-2025 data rewards that. Proof: Default and bondYears 4 gain 4-7 points under
   (c)/(b2) although `nopen` equals tip there (no penalty to avoid), and (b2) with the penalty off is identical
   to `nopen` by construction. A smaller reserve is a different assumption the user already controls through the
   Bond reserve size field; changing it silently would be a hidden strategy change, hard to explain.
4. Non-early plans (retire 62/60, retire 59/57) are unchanged under every option, and the Rule-of-55 plans
   show no gain from (a)/(c) because their 401(k) is already free.

**Recommendation.** Leave the ladder and refill as they are. If the owner wants the early-retiree reserve to
protect against down years without the penalty, the lever is the existing Bond reserve size field, or a
future "penalty-free reserve" checkbox decided as a product choice (it needs its own measurement because it
changes the reserve size, not just its source). No new unverified figure was introduced, so the Verification
backlog is unchanged.

**Lifespan sensitivity (added after the first table).** The first table used the scenarios' own lifespans
(95 for the early retirees, 100 for the default), so the historical run had only 41-53 cycles, all starting
1928-1980: `runHistoricalCycles` needs each cycle to fit inside 1928-2025 (`lastStart = 97 - projectionYears`), so
a long horizon tests few start years and never a retirement that began after about 1980 (not 2000 or 2007). A
shorter lifespan gives more cycles, not fewer. Monte Carlo is not limited this way (5-year blocks from any
year). Re-run with both partners living to 85 (56-73 cycles) and to 75 (66-83 cycles); historical % / Monte
Carlo %, same variants:

| Lifespan 85 | tip | nopen | (a) | (c) | (b1) | (b2) |
|---|---|---|---|---|---|---|
| Early 52/50 | 93.7 / 93.3 | 93.7 / 93.3 | 93.7 / 93.3 | 96.8 / 94.7 | 95.2 / 94.2 | 96.8 / 94.3 |
| Early, thin taxable | 90.5 / 90.0 | 93.7 / 92.2 | 90.5 / 90.0 | 93.7 / 92.0 | 92.1 / 91.1 | 93.7 / 91.5 |
| Early, trad-heavy, no Roth | 90.5 / 89.8 | 93.7 / 91.8 | 90.5 / 89.5 | 92.1 / 91.6 | 92.1 / 90.8 | 93.7 / 91.0 |
| Early 45/45 | 87.9 / 90.0 | 94.8 / 91.8 | 91.4 / 90.5 | 96.6 / 92.3 | 93.1 / 90.6 | 96.6 / 91.1 |
| Early, bondYears 8 | 92.1 / 92.4 | 90.5 / 91.6 | 92.1 / 91.8 | 96.8 / 94.7 | 95.2 / 93.5 | 96.8 / 94.2 |
| Rule of 55 (all 401(k)) | 98.5 / 99.1 | 97.1 / 98.3 | 98.5 / 98.6 | 100 / 99.1 | 100 / 99.1 | 100 / 98.7 |
| Rule of 55 (IRA-heavy) | 100 / 99.4 | 98.5 / 99.1 | 98.5 / 99.2 | 100 / 99.4 | 100 / 99.4 | 100 / 99.0 |
| Default (retire 55) | 91.1 / 93.8 | 92.9 / 94.9 | 89.3 / 94.0 | 100 / 96.0 | 94.6 / 95.0 | 100 / 95.3 |
| Working, bondYears 4 | 91.1 / 94.4 | 96.4 / 95.4 | 91.1 / 94.6 | 100 / 95.9 | 98.2 / 95.1 | 100 / 95.3 |
| Retire 62/60, retire 59/57 | 100 / 100 | same | same | same | same | same |

At 85 the standard engine still shows (a) costing tax and ending assets (early 52/50: total tax $0.81M ->
$1.10M, investable at the end $7.8M -> $6.7M). At 75 nearly every cell is 94-100% and the tip is within 1-3
points of `nopen` (worst: early 45/45, 92.6 vs 95.6), so there is nothing to separate; one cycle is 1.2-1.6
points there. Conclusions 1-4 above hold: the penalty cost remains where penalty-free money runs out (3-7
points at 85), (a) helps only 45/45 (+3.5) and loses in the default plan (91.1 -> 89.3), (b)/(c) still win
mainly by shrinking the reserve (default: ceiling 92.9, (c) 100), and the non-early plans do not move. The
decision (no code change) is unchanged. Caveat for every historical rate in this repo: with a long lifespan
the historical run is thin and early-weighted; read it next to Monte Carlo.

#### Batch 3C: exploration so far (no app code committed; V92)

**Handoff (session moved to a local clone).** Status: **deferred** (owner decision) to run after Batch 7 and
before 4A and 5; nothing is built. When picked up, the owner answers the open design points below, then the
real change is built as one isolated number-change commit. Branch `claude/batch-3b-penalty-rules` holds
steps 1-6 of 3B plus these notes; 3B's PR should be split from the 3C notes and prototype so 3B can merge
without them.

Branch: still `claude/batch-3b-penalty-rules` (the session's designated branch); the 3C commits can be split
off later. Everything below was measured with throwaway edits in a scratch worktree (US, `simulate()`, 2026
tax year, ACA on and not enhanced, Texas, no conversions, no bond reserve).

**Why the safe-MAGI room never had a behavioral test (answered).** Two separate reasons.
1. *Double counting.* The engines pass `remainingMagiRoom = ceiling - preConvMagi - conversion`, and
   `preConvMagi` already contains the MAGI iteration's estimate of this year's own draw (`estTrad + estGain`).
   `pickLiveWithdrawalOrder` then compares the whole draw (`taxableGain + fromTraditional`) against that
   already-reduced room. The right room for a draw is `ceiling - magiBase - conversion` (the draw's own
   estimate excluded). With that fix alone, 972 scenarios (single and married, ages 52/58/62, taxable
   $0.3-2M, traditional $0.5-1.5M, basis 20/60/90%, spending $60-130k, live/smooth/default) still gave
   identical results.
2. *The live mix cannot lower MAGI.* Its two orders are taxable-first and traditional-first. A traditional dollar
   counts one for one in MAGI; a taxable dollar counts only its gain share. So taxable-first never has more MAGI
   than traditional-first, and the overage term can never favor traditional-first. The only zero-MAGI source is
   Roth (and cash/bonds principal), which the live mix deliberately leaves alone. A behavioral test for the room
   needs a rule that actually steers MAGI-bearing draws toward Roth, which is what the 3C text asks for.

**Prototype: cap the MAGI-bearing draw at the room.** In `takeTraditional`, limit a (non-penalized) traditional
draw to `room - discretionary traditional so far - taxable gains so far`, with the corrected room; the shortfall
falls to Roth, cash and the bonds through the existing fallbacks, and a last uncapped traditional pass runs just
before home equity so the cap can never strand money or cause depletion. Smooth and the applied/override schedules
go through the same `takeTraditional`, so they are covered; the live mix was not yet changed. Result across the
same 972 scenarios (standard engine), counting scenarios whose results moved:

| Mode | Scenarios that moved | Ending investable assets higher / lower (> $1,000) | Depletes later / earlier |
|---|---|---|---|
| Smooth | 274 | 194 / 3 | 42 / 0 |
| Default (taxable then traditional) | 112 | 41 / 0 | 24 / 0 |
| Live mix | 0 (not wired) | | |

The mechanism is the ACA 400%-FPL cliff (the IRMAA tier ceiling is also in the room): without the cap a year that
lands a little over the line loses the whole premium credit. The 3 worse smooth cases are married, age 52 or 58,
$2M taxable and $0.5M traditional, ending about $0.1M lower of about $16-20M (an earlier Roth draw forgoes
tax-free growth).

**Open design points (owner)**, to settle before building the real change:
1. Hard cap for both ceilings, or only for the ACA cliff? The IRMAA ceiling is a soft cost assessed two years
   later, so capping at it spends Roth earlier for a smaller, delayed saving.
2. Fallback order after the cap: Roth first (the prototype), or cash and bond-reserve first?
3. Live mix: replace its `overage * 1e6` term with the same cap (it never changes the choice today).

**Reframing (brainstorm with the owner; design direction, nothing built or measured yet).** The hard cap in the
prototype assumes staying under the ACA cliff is always worth it. It is not. Crossing the cliff costs a fixed
lump (the whole premium credit, whether $1 or $100k over). Staying under costs an amount that grows with the
overshoot, because every MAGI-bearing dollar steered to Roth is spent earlier. A high-expense household can
therefore do better by crossing. The 3 worse smooth cases above are the early sign of this.

Why per-year pricing was dropped. A per-year comparison needs a growth rate and a "later tax rate on traditional
money". The growth rate cancels (traditional left behind compounds at the same rate as Roth), so what remains is
the later tax on traditional. A fixed constant cannot capture it: leftover traditional money is forced out by
RMDs (73 or 75), stacks on Social Security, and can push MAGI into higher brackets and IRMAA, whereas Roth has no
RMDs and stays a zero-MAGI source for later cliff years. `simulate()` already models all of that year by year, so
the later cost does not need estimating; two whole-plan runs can be compared instead.

Direction chosen (a first version; the owner expects to refine it later, see "Refinement later"):
- A first plain version was a single plan-level on/off switch, decided once and applied to every run. The owner
  rejected that as too coarse: in the historical and Monte Carlo runs the right answer changes with an up or a
  down year (a down year raises spending and the overshoot, which favors crossing).
- Instead the decision is made **per year inside the engine**, and the plan level only chooses a parameter.
  One function, `stayUnder(yearState, policy)`, decides whether this year's draw is capped. It is the only
  place the decision lives: in the prototype it replaces the line that builds `wd.magiCap`
  (`wd.magiCap = stayUnder(...) ? {room, ...} : null`), so later refinements replace only that function. Put it
  in a `shared/` fragment so Canada (4A) can reuse it.
- Rule: each year compute the overshoot (the MAGI-bearing draw that does not fit under the room, i.e. the amount
  that would have to come from Roth, cash or bonds to stay under) and the subsidy at stake (price crossing with
  `acaNetCost` at that year's MAGI). Stay under only if `subsidyLost >= k * overshoot`, where `k` is the value of
  keeping one dollar out of Roth. `k = Infinity` is Always, `k = 0` is Never, values between are the middle.
- Auto searches for the best `k` on the standard projection, by comparing runs (depletion age first, then ending
  wealth; leftover traditional balance valued with a flat terminal tax haircut, which the owner agreed is fine as
  a tie-breaker because it only separates plans that do not deplete). The chosen `k` is then applied to the
  historical and Monte Carlo runs, where the per-year rule adapts to each path's own sequence.
- Setting: "Stay under ACA cliff: Auto / Always / Never", Auto as the default.
- Cost: a handful of standard projections (one per candidate `k`) per render, solved once and held fixed inside
  the optimizer (see Batch 5).

Refinement later (owner: handling can be modified once this is in place and measured):
- Replace or enrich `stayUnder` without touching the engine: a per-year `k`, `k` varying with age or years left,
  a threshold lever the multi-lever optimizer sweeps, or pricing IRMAA and the Batch 7 cliffs directly in the same
  rule instead of treating the ceiling as a single number.
- Use the plan-derived later tax rate on traditional money, or a "value of a zero-MAGI reserve" term, if the flat
  terminal haircut turns out to matter.
- Open risk: the year's MAGI estimate moves with the decision, so the decision and the MAGI iteration
  (`MAGI_ITER_MAX`/`TOL`) can interact near the cliff; the convergence check on a cliff-straddling case is
  required, and `k` needs a sensible search grid.

Effect on the open points above:
- Point 1 (both ceilings or ACA only) mostly goes away. IRMAA tiers sit well above the ACA cliff (checked in
  `conversionMagiCeiling`: the ceiling is the `min` of the two, and IRMAA only enters from age 63), so before 65
  the ACA term is the binding one and IRMAA binds only at 65+ where ACA no longer applies. Exceptions: a couple
  with one partner 65+, and ages 63-64. Note `irmaaTierCeiling(preConvMagi)` is the top of the tier the
  pre-conversion MAGI currently sits in, so the ceiling can move when the cap changes MAGI; check for that
  circularity when building.
- Point 2 (Roth first, or cash and bonds first) is still open. Roth is the most valuable pocket to keep (no
  RMDs); cash and bonds are the sequence-risk reserve.
- Point 3 (live mix) is still open; the live mix would call the same `stayUnder` instead of its `overage * 1e6`
  term.

Measurement before building: Auto against Always and Never over the same 972 scenarios, plus high-spending cases
where crossing should win, and historical paths with bad early sequences, to see how often crossing actually
wins and whether Auto beats Always by enough to justify the extra explanation. Run it on the post-Batch-7 tax
model. Extend `docs/batch-3c-prototype/scan.js` for this (throwaway).

The prototype diff and scan script are committed under `docs/batch-3c-prototype/` (throwaway, see its README).
This is an intended number change: when built it needs its own commit with
before/after, `npm run snapshot:update`, a behavioral test with a mutation check, the bucket engine (down and up
year orders, the penalty-aware paths), a MAGI-iteration convergence check on a cliff-straddling case, the
optimizer re-run note, the US badge bump and the README.

### Batch 7 notes (7A, 7B, 7C, 7D, 7J, 7K, 7L)

#### 7A: children (US V92 -> V93, Canada V38 -> V39)

Branch `claude/batch-7a-children`, cut from the 3B tip (`c9d4b07`) so it stacks on 3B (owner,
2026-10-04: the whole stack merges back into `tender-meitner` after 3C; `main` is not touched).

**What is true now**
- `state.children` is the seventh add-as-you-go list, in BOTH planners (owner: Canada keeps the
  data model now; its list note says the benefits that read it arrive later). A row is
  `{ birthYear, student }`. No other input was added.
- `normalizeLists` (shared fragment `01-LIST_MAX`) clamps `birthYear` to the fixed bounds
  1950-2100, rounds it, drops rows with no usable year (non-numeric, null, empty, boolean) and
  keeps `student` only when literally `true`. Bounds are fixed, not relative to today: a
  clock-relative bound would silently rewrite a saved birth year as the years pass. A new row
  defaults to the current year (a newborn, so "from birth" for a planned child).
- Dependent definition (owner, 2026-10-04): **qualifying child** = a child whose age at the end
  of the tax year (`taxYear - birthYear`) is 18 or under, or 23 or under if `student`; a child
  counts for the whole birth year and not before it. Dependent here always means qualifying child
  (qualifying relatives, disabled-at-any-age children are not modeled). `dependentsInYear(taxYear)`
  (shared) returns `{ age, student, qualifyingChild }` per child, and every credit applies its
  own cutoff to `age`: CTC `age <= 16`, Credit for Other Dependents a qualifying child with
  `age >= 17`, child-care credit would be `age <= 12` (not modeled).
- US only: `buildTaxProfile` carries `profile.dependents` (survivor remap included: children stay
  with the surviving parent); `acaHouseholdSize` = adults + qualifying children feeds `acaNetCost`
  (via `healthcareCost`) and the 400%-FPL guard in `conversionMagiCeiling`. HealthCare.gov counts
  tax dependents regardless of age, so the ACA household uses the same qualifying-child flag
  with no separate cutoff. The gross premium `state.healthcare` is NOT scaled for children: the
  household enters the premium it pays (the list tip says so).
- The list is not in the MCP `update_fire_assumptions` schema (owner agreed): that schema is built
  from `FIELDS`, and none of the existing lists are in it either.
- Spending is not adjusted for children; the list tip says to add costs to spending.

**Before / after.** Default `[]`, so by construction nothing moves: the engine snapshots are
byte-identical (US 518, Canada 359 scenarios), and the standard, historical and Monte Carlo
numbers are unchanged. Intended baseline changes: `tests/snapshots/ui_{us,canada}.json`
(`executeStateHash`, because the state now holds `children: []`, and the three rendered-text
hashes, +98 / +92 characters for the new "Children" sidebar group; the MCP `schemaHash`,
the control count, and every projection and row hash are unchanged), and
`tests/snapshots/legacy_state.json` (every hash changed for the new `children` key; four new
cases: valid, junk, wrong type, over the cap).

**Tests.** `tests/child_dependents.js` (in `npm test`): hand-tabulated `normalizeState` results,
the qualifying-child ages at tax year 2026 and 2027, ACA household sizes (single, couple,
survivor), and an engine case: a single retiree with a $90,000 income stream owes the full
$20,000 premium with no children (400% of the 2026 poverty line for 1 is $62,600) and gets the
subsidy with two children (household of 3, 400% of $26,650 = $106,600); an adult non-student and
an unborn child change nothing. `test_children.js` (ad hoc): the Children group in both
planners, summary text, reload round trip, the cap of ten, and the 390 px overflow check.
`test_dynamic_lists.js` now expects seven empty-state lists.

**Gotchas**
- `npm run sync` on Windows rewrites the planner files with LF while `shared/*` stay CRLF
  (`core.autocrlf=true`), so `--check` fails on every region until the planners are converted
  back to CRLF. Recorded in `CLAUDE.md`.
- `tests/snapshot_ui.js` is timing-sensitive on a busy machine: once the US "std R everything"
  surface read `dashHistSuccess` as `85%` instead of the pinned `—` (the async historical success
  tile had finished). It passed twice on rerun with no change. If it recurs, re-run before
  suspecting the code.
- Profiles built outside `buildTaxProfile` (the Roth solver and optimizer literals) have no
  `dependents`; a 7B consumer must treat a missing list as none.
- A birth year typed digit by digit is saved at every keystroke (`20` before `2015`); only a
  reload at that exact moment would clamp it to 1950. Accepted, same as the other number rows.
- Browser pane / environment: Node was not installed and the C: drive was nearly full when 7A
  started; Playwright's Chromium needs about 150 MB to download plus space to unpack.

**Cliffs and phase-outs register (for the 3C safe-MAGI policy).** Every batch that adds or moves a
cliff appends a row here (where the threshold lives, what it keys on). 7A adds no cliff of its own;
it moves one: the ACA 400% line now keys on household size including qualifying children.

| Cliff / phase-out | Where the threshold lives | Keyed on | Added by |
|---|---|---|---|
| ACA premium-tax-credit cliff, 400% of FPL (non-enhanced) | `fplForHousehold` x 4 in `conversionMagiCeiling`; `acaNetCost` | MAGI, `acaHouseholdSize` (now incl. children) | Phase 1; household size 7A; reviewed 7B step 6 |
| ACA expected-contribution schedule (sliding 2.1%-9.96%) | `acaExpectedPct` | MAGI / FPL ratio | Phase 1 |
| Medicare IRMAA tiers (two-year lookback) | `irmaaSurcharge`, `irmaaTierCeiling` | MAGI two years earlier, filing status | Phase 1 / 2 |
| Senior deduction phase-out ($6,000, 6% over $75k / $150k, 2025-2028) | `seniorDeduction`, `SENIOR_DEDUCTION_*` | MAGI, filing status | Batch 2 |
| SALT cap phase-down (30% over about $505k to a $10,000 floor) | `saltCap`, `SALT_PHASE_*` | MAGI | Batch 2 |
| Taxable Social Security (50% / 85% tiers) | `taxableSocialSecurity` | provisional income, filing status | Phase 1 |
| 0% / 15% long-term-gain bands | `longTermGainTax` | taxable income, filing status | Phase 1 |
| NIIT 3.8% over $200k / $250k | `niitTax` | MAGI, filing status | Phase 1 |
| Additional Medicare Tax 0.9% over $200k / $250k | `additionalMedicareTax` | wages, filing status | Batch 2 |
| Early-withdrawal penalty status (Rule of 55, 72(t), 59.5) | `penaltyStatus`, `accountStatuses` | age, account | 3B |
| Child Tax Credit and ODC phase-out ($50 per $1,000 over $200k / $400k, not indexed); the credit ends when the youngest child turns 17 | `childCredits`, `CTC_PHASE_START` | MAGI, filing status (`ctc` family), child ages | 7B step 4 |
| ACTC phase-in (15% of earned income over $2,500) and the tax limit on the nonrefundable part: more income changes the credit, not just the tax | `childCredits` | earned wages, federal income tax | 7B step 4 |
| Filing status (HoH / QSS) switches: QSS two-year window ends (MFJ brackets and deduction -> single or HoH), HoH starts and ends with the last qualifying child | `filingStatusFor`, `FILING` | year, children, survivor timeline | 7B step 3 |
| State circuit-breaker and income-tested credits (generic) | `STATE_RULES` `credits`, `additions`, `exemptionPhaseOut`, AGI-tested `base`/`retirementExclusion` | state AGI, federal AGI, filing column | 7C (reference rows), 7D (the rest) |
| NY tax benefit recapture: phased in over $50,000 of AGI from $107,650 and from each band start; band by taxable income, so band crossings step; marginal rates well above the top rate inside phase-ins | `stateBenefitRecapture`, NY row | NY AGI, taxable income | 7C |
| NY Empire State child credit: $16.50 per $1,000 of federal AGI over $75,000 / $110,000, off the household total | NY `credits` | federal AGI, child ages | 7C |
| CT: Social Security exempt under $75,000 / $100,000 AGI, then 25% of benefits taxed; pension/IRA share steps 100% to 0% across $75,000-$100,000 ($100,000-$150,000 joint); exemption step-down from $30,000 / $48,000 / $38,000; add-back, recapture and personal-credit step tables; property tax credit 15% per $10,000 | CT row (`agiTested`, `agiPhasedShare`, `agiStep`, `agiStepFraction`, `propertyTaxCredit`) | CT AGI, filing column | 7C |
| PA Tax Forgiveness: 10% per $250 of eligibility income over $6,500 / $13,000 plus $9,500 per child | PA `credits` | PA base, children | 7C |
| CA exemption credits: $6 per credit per $2,500 of federal AGI over $252,203 / $504,411 / $378,310; renter's credit lost over AGI $53,954 / $107,987 | CA `credits` | federal AGI, state AGI | 7C |
| PA / NY / CT / CA pension and IRA age tests (59 and a half per filer) | `retirementExclusion` `perPerson` | each filer's age | 7C |
| 7D G2: UT taxpayer credit lost at 1.3 cents per dollar over $18,213 / $36,426 (straight line); UT Social Security credit lost at 2.5 cents per dollar over $54,000 / $90,000; NC child deduction steps down every $10,000-$20,000 of AGI to zero (joint $140,000); LA retirement exclusion starts at 65; MA child credit ends at 13; KY and IN 65+ amounts start at 65 | UT, NC, LA, MA, KY, IN rows | state AGI, filing column, ages | 7D |
| 7D G3: HI 13% bracket from 2027 and the Act 46 bracket and deduction steps; NE 2027 bracket and rate change; OH senior credit lost at $100,000 and the joint filing credit's cap; RI Social Security and pension modifications lost above $107,000 / $133,750 (a cliff) and need age 67; VA age deduction lost dollar for dollar over $50,000 / $75,000; ND zero bracket to $49,575 / $82,800 | HI, NE, OH, RI, VA, ND rows | state AGI, filing column, ages | 7D |
| 7D G4: CO Social Security by age and AGI ($75,000 / $95,000) and the shared $20,000 / $24,000 bucket; NJ pension exclusion 100% to $100,000 of income, 50% / 25% (joint) to $150,000, none above (a cliff); MO federal tax share 35% -> 0 by income, private pension lost over $25,000 / $32,000, Social Security at 62; AL standard deduction stepping down over $26,000-$35,500; ME pension deduction reduced by benefits and its AGI phase-out; SC SCIAD lost over $40,000 / $60,000 / $80,000 to $95,000 / $142,500 / $190,000; IL exemption and property credit lost over $250,000 / $500,000 (not modeled); IA, DE, GA, ME, MS age gates (55, 60, 62, 65) | AL CO DE GA IL IA ME MS MO NJ SC rows | state AGI, federal AGI, ages | 7D |
| 7D G5: MN Social Security subtraction 10% per $4,000 over $84,490 / $108,320; MD exemption lost in steps over $100,000 and pension exclusion less benefits; OR exemption credit lost in a cliff over $100,000 / $200,000 and federal-tax deduction phased out to $250,000+; VT Social Security fully taxed over $80,000 / $100,000 and pension exclusion over $70,000 / $90,000; WI standard deduction sliding 12% per dollar over $20,000+; MI retirement deduction by birth year | MD MI MN OR VT WI rows | state AGI, ages | 7D |
| 7D G6: NM Social Security taxed in full at federal AGI $100,000 single / $150,000 joint (cliff); NM age-65 exemption falling to zero by $28,500 / $51,000; NM low- and middle-income exemption gone by $36,667 / $55,000; NM Child Income Tax Credit steps at $25,000 / $50,000 / $75,000 / $100,000 / $200,000 / $350,000; DC child credit gone above $55,000 / $70,000 | NM, DC rows | federal AGI | 7D |
| Canada: federal age amount clawback (15% of net income over $46,432, gone at about $107,800) and the BPA phase-down ($16,452 to $14,829 between $181,440 and $258,482); the $2,000 pension amount has no income test. Continuous, not cliffs: about +2.1 points of marginal rate through the age-amount range | `personTaxCA`, `federalTaxCA`, `ageAndPensionCreditBase` | each person's own net income (after any pension split), age 65+ | 7J |
| Canada: provincial credits and clawbacks | (7K) `PROVINCE_RULES` | net income | 7K |
| Canada: GIS and Allowances (BENEFIT_RULES.gis knots: 50 percent and 25 percent reductions of income, top-up reductions; table 4 ends at 42,768 where the spouse Allowance ends and the pensioner continues on table 3) | net income less OAS and the employment exemption, combined for couples | each household situation, OAS in payment | 7L |
| Canada: Canada Groceries and Essentials Benefit (5 percent over 46,432, single supplement 2 percent over 11,564) | BENEFIT_RULES.cgeb | family net income, children under 19 | 7L |
| Canada: Canada Child Benefit (reduction from 38,237 and 82,847 by child count) | BENEFIT_RULES.ccb | family net income, children under 18 | 7L |

#### 7B: US federal credits (US V93 -> V97; Canada untouched)

Branch `claude/batch-7b-federal-credits`, cut from the 7A tip (`a9d88a1`). US only.

**Step 1: filing-status table (no behavior change).** `FILING` (just above `standardDeduction`) maps a
status to, per parameter family, the data row it reads, plus a `joint` flag for the structural branch.
Families: brackets, deduction, extraAge (the 65+ add-on), gains, ss, niit, medicare, irmaa, senior, state.
Data rows: `ORDINARY_BRACKETS`, `STD_DEDUCTION`, `STD_EXTRA_65`, `GAIN_BANDS`, `SS_BASE`,
`NIIT_THRESHOLD`, `IRMAA_TIERS`, `SENIOR_PHASE_START`. `bracketCeilingReal` is now derived from
`ORDINARY_BRACKETS`. State tax reads a `state` column (`joint` inside `stateIncomeTax`); the state data
itself still has only MFJ and single columns (7C/7D own that). All 518 US and 359 Canada snapshot scenarios
were byte-identical.

**Step 2: death-year MFJ (intended number change).** `filingStatusFor` now returns `'mfj'` for the year of
death (IRC 6013(a)(3)) when the couple was married that year, and `'single'` in later years. Married means
`marryLater ? age >= marriageAgeA : filingStatus === 'mfj'`: an unmarried couple (`filingStatus: single`, or
before the marriage age) has no joint year. The survivor remap in `buildTaxProfile` puts the deceased's age
in the B slot for a joint year (a one-person return keeps `null`), so the death-year 65+ standard and senior
deductions do not depend on which partner died (`tests/survivor_symmetry.js` and `tests/filing_status.js`).
Side effects, all deliberate: the IRMAA table and the Roth-conversion bracket ceiling also read the MFJ row in
the death year (the IRMAA lookback MAGI is two years old, so it was a joint return); the Additional Medicare
Tax threshold is the MFJ one; the ACA household size is unchanged (survivor household). Income is still the
survivor's own: the deceased's income for the part of the year before death is not modeled, as before.

Before / after (standard projection, from the snapshot dumps): first changed year only.

| Scenario | Death year (age of Partner A) | Tax before -> after | Healthcare before -> after |
|---|---|---|---|
| std R work past 65 survivor | 67 | 33,877 -> 26,079 | 0 -> 0 |
| std R survivor+loans | 75 | 22,563 -> 11,366 | 12,240 -> 11,092 (IRMAA on the joint table) |
| std R survivor A | 80 | 0 -> 0 | 14,338 -> 13,190 |
| std R survivor B | 80 | no change | no change |

Success rates (`tests/historical_rates.js`, seed 7, 2000 paths; two survivor scenarios added to it):

| Scenario | Historical before -> after | Monte Carlo before -> after |
|---|---|---|
| default, early retiree (3 variants), bondYears 4 | unchanged | unchanged |
| survivor, A dies at 70 (rich) | 100.0% -> 100.0% | 100.0% -> 100.0% |
| survivor, B dies at 75, early retiree | 90.6% -> 90.6% | 89.2% -> 89.3% |

49 of 518 US scenarios moved, every one a survivor scenario (names containing "survivor" or "everything");
Canada and every non-survivor scenario are byte-identical. Baselines updated: `tests/snapshots/us.json`,
`ui_us.json` (the survivor info bubble and README-visible text changed).

**Step 3: head of household and qualifying surviving spouse (US V95).** `FILING` gains `hoh` and `qss`.
- `hoh`: own brackets (10% to $17,700, 12% to $67,450, 22% to $105,700, 24% to $201,750, 32% to $256,200,
  35% to $640,600), standard deduction $24,150 (+$2,050 at 65), 0%/15% gain bands $66,200 / $579,600; every
  statutory "any other case" threshold (Social Security bases, NIIT $200,000, Additional Medicare Tax, IRMAA, senior
  phase-out) is the single one. Figures are from secondary sources (Rev. Proc. 2025-32 summaries), see the
  Verification backlog.
- `qss`: MFJ brackets, standard deduction, 65+ add-on (the married $1,650: the higher "unmarried" add-on is only
  for filers who are unmarried and not a surviving spouse, IRC 63(f)(3)) and gain bands; single Social Security
  bases, Additional Medicare Tax, IRMAA table and senior phase-out start; **NIIT at the joint $250,000** (IRC
  1411(b)(1) names "a joint return or a surviving spouse"; the plan had not listed NIIT). State tax reads the joint
  column for QSS and the single column for HoH: an interim mapping, many states have their own HoH brackets (7C/7D).
- `filingStatusFor` timeline: unmarried with a qualifying child that year is `hoh`, otherwise `single`; survivors
  of a married couple are `mfj` in the death year, `qss` for `year - deathYear <= 2` while a qualifying child exists
  that year, and unmarried after. The test is per year, so a child born after the death (a planned child) would
  count; a child aging out of year 1 ends QSS. Survivors of an unmarried couple (`filingStatus: single`, or before
  the `marryLater` marriage age) get no joint year and no QSS.
- Two-filer branch (pre-marriage `marryLater` and `filingStatus: single` with two partners, which share the branch):
  the household status stays `single`; Partner A claims the children (owner decision) and files `hoh` while a
  qualifying child exists, B files single. Housing deductions still split 50/50.
- Assumed, not modeled: the household pays more than half the cost of keeping up the home, and a QSS child is the
  survivor's own dependent child.
- Default `[]` children: every existing snapshot is byte-identical (checked, no baseline change).

**Step 4: Child Tax Credit and Additional Child Tax Credit (US V96).** `childCredits` (above `taxFor`).
- 2026 amounts (Rev. Proc. 2025-32 via secondary sources: OBBBA made $2,200 permanent from 2026, refundable part
  $1,700): $2,200 per child with `age <= 16` (under 17 at year end) and `qualifyingChild`; the credit and the
  $1,700 cap are indexed with `taxIndexFactor` (the statute indexes both from 2026, rounded to $100; we keep the
  index smooth and unrounded, like every other indexed amount here).
- Phase-out: $50 per $1,000 (or part) of MAGI over $200,000 ($400,000 joint), thresholds not indexed. QSS and HoH
  use the $200,000 (the `ctc` family; the joint threshold is for a joint return only). MAGI is AGI
  (`ordinary + gains`, the same stand-in the senior deduction uses).
- Nonrefundable part is limited to the federal income tax (ordinary + long-term-gain tax), not state tax, NIIT or
  payroll tax. ACTC = min(unused credit, $1,700 per child, 15% of (earned income - $2,500)). Earned income is the
  profile wages (already net of pre-tax contributions and premiums, which is the W-2 box 1 figure). Extra income
  streams and one-time income ride in the non-wage slot and are **not** earned income: a part-time job entered as an
  income stream earns no ACTC. Known understatement, accepted (no new input).
- The tax can be negative (only through the ACTC). Checked in a smoke run (working couple with two children, Roth
  conversion, smooth withdrawals, survivor): no NaN, no solver trouble, no negative withdrawals. Credits do not
  depend on withdrawals except through the tax limit, so the net-from-gross bisections stay monotone.
- Two-filer branch: credits on Partner A's return (A claims the children), with A's own MAGI for the phase-out.
- Assumed: every child and parent has a valid SSN. Not modeled: Credit for Other Dependents until step 5.
- Default `[]` children: snapshots byte-identical (the no-children return is a shared constant and the float order of
  the sums is unchanged). Tests: `tests/child_credits.js` (in `npm test`; hand-computed unit cases, taxFor and an
  engine case across the age-16/17 boundary) and the two-filer case in `tests/filing_status.js`.

**Step 5: Credit for Other Dependents (US V97).** Inside `childCredits`: $500 per qualifying child with
`age >= 17` (17 and 18, and 19-23 full-time students), nonrefundable, **not indexed** (statutory $500, no
inflation adjustment), same $50 per $1,000 phase-out as the CTC and the same `ctc` threshold family. Qualifying
relatives are not modeled, so the credit covers only the children list. Ordering inside the combined credit (only
matters below the phase-out): the reduction comes off the CTC part first, the tax absorbs the ODC first, and only
the unused CTC can be refunded, so a household with no tax and earned income loses its ODC and refunds up to
$1,700 per CTC child (tests: mixed 5- and 17-year-old). A 17-year-old alone loses the whole $500 at $10,000 over
the threshold. Default `[]`: snapshots byte-identical.

**Step 6: premium-tax-credit review (no code change).**
- 2026 applicable-percentage table in `acaExpectedPct` (2.10% under 133% of FPL, 3.14-4.19% to 150%, 4.19-6.60%
  to 200%, 6.60-8.44% to 250%, 8.44-9.96% to 300%, 9.96% to 400%, nothing above) matches Rev. Proc. 2025-25 as
  reported by secondary sources (currentfederaltaxdevelopments.com, thefinancebuff.com), including the linear
  interpolation inside each band. The 400% cliff is back for 2026 (the 2021-2025 enhanced credits expired on
  2025-12-31): `acaNetCost` returns the full premium above 4.0 x FPL when `acaEnhanced` is off, which is the default.
- **Enhanced-credit extension: unresolved as found.** The House passed a three-year extension on 2026-01-08 (230-196;
  Ballotpedia, AHA, Health Affairs); the Senate had not acted in the sources found, and no extension was in the law
  at this review. `acaEnhanced` stays a user switch, default off. Re-check at the final verification pass; if an
  extension is enacted, the default and the info bubble need a decision.
- Repayment: OBBBA removed the cap on repaying excess advance credits for tax years beginning after 2025. The model
  does not model advance payments: each year's credit is computed from that year's realized MAGI (the engine
  iterates MAGI to convergence), so there is no mismatch to repay and nothing needs the cap.
- Household size: `acaHouseholdSize` = adults + qualifying children (7A), used by both the cost and the 400% guard.
  HealthCare.gov counts tax dependents of any age; the model uses the qualifying-child flag. In a death year the
  household is the survivor plus children (the death-year joint return does not change the ACA household).
- Simplifications that remain, none changed here: the entered gross premium stands for the second-lowest silver
  benchmark premium (the credit is capped at the premium paid); the federal poverty line is the 2025 guideline
  ($15,650 + $5,500 per person) for the 2026 coverage year, indexed by `taxIndexFactor` after that; the applicable
  percentages are held constant (the IRS re-indexes them yearly); no PTC floor at 100% of FPL (a household below
  100% of FPL, ineligible in expansion states, is charged 2.10% of a tiny income); no Medicaid eligibility.

**7B summary.** Only step 2 moved numbers (49 of 518 US survivor scenarios). Cliffs added or moved: the filing-status
switches (QSS window end, HoH start/end), the child-credit phase-out and the ACTC phase-in, all in the register above.
Not modeled (owner): child and dependent-care credit and FSA, education credits, adoption credit, coverage on a
parent's plan to 26. Open items: EITC and Social Security child benefits.

#### 7C: state-tax framework plus reference states (US only; Canada untouched)

Branch `claude/batch-7c-state-framework`, cut from the 3B-line tip `fb03255` (7A and 7B merged). Owner decisions
(2026-10-04), recorded before work started:
- **Migrate all 51 jurisdictions now**, at today's simplified figures, in the first commit, so the coverage test
  ("every state declares every field") can be real. The reference states (CA, NY, PA, TX, WA, plus **CT** as the sixth,
  added to cover income-tested Social Security and pension rules) follow as researched rows.
- Migrated rows keep "index everything with inflation" (`indexing: 'cpi'`); the flag exists for 7D to set per state.
- NY's high-income tax-benefit recapture is a schema mechanism in the NY reference row.
- **Circular reference (state tax feeds the federal SALT deduction):** the order is state first, federal second. A state
  never reads a federal deduction or federal tax; conforming states use the federal standard deduction (independent of state
  tax); `federalTaxSubtraction` is a required field, `'none'` for every row in 7C. States that deduct federal income tax
  paid (AL, OR, MT, partly MO; 7D) get one lagged pass, not an iteration. A refundable credit never takes the SALT-deductible
  state tax below zero.
- **Per-person amounts:** the partner split of discretionary traditional withdrawals uses the year's account-ledger share
  (`accountsOwnerShareA(accts.trad)`, carried on the tax profile as `ownerShareA`; absent = 50%). It replaces the two-filer
  branch's 50/50 split of `traditionalExtra`. No new inputs.
- Local income taxes (NYC, parts of PA, OH, MD, IN) stay out of scope, listed as a documented gap (the `localTax` field is
  `'notModeled'` on every row).
- WA's top tier goes to 9.9% (owner OK), and CA figures are refreshed to the latest published (reference-state commit).

**Commit 1: schema and migration of all 51 rows (no behavior change).** `STATE_RULES` replaces `stateRules`, `noTaxStates`,
`massachusettsTax`, `progressiveTax`, `bracketsFromStarts` and the hand-coded CO / MA / NC / NJ / SC / WI / WA branches. The schema
is described in `CLAUDE.md`. `FILING.state` is removed: each row's `statusAs` maps a federal status to a column (migrated rows
keep the 7B interim mapping, HoH as single, QSS as joint). DC was already a jurisdiction (the plan called it new).
Migration notes:
- NJ's table keeps its redundant top row (a 5,000,000 start at the same 10.75% rate as the 1,000,000 row) so the float arithmetic
  is identical to the old code; remove it when 7D refreshes NJ.
- NC is modeled as Social Security `exempt` (the old code taxed it then subtracted it back out); the result is identical.
- The migrated retirement-exclusion kinds (`shareByAge`, `perEligibleCap`, `perEligibleCapSeniorTier`, `seniorCap`, `full`)
  reproduce the old household-level quirks (SC's tier counts `max(eligible, senior)` filers at the senior cap, for example).
  They are replaced by per-person kinds in the reference rows and 7D, as intended changes.
- Unknown state codes owe nothing (the legacy `'none'` value is not in the selector).

**Verification of "no behavior change".** (1) `npm test`: US 518 and Canada 359 snapshot scenarios exact, UI snapshots unchanged.
(2) A one-time differential against a worktree of `fb03255`: 51 states x 2 inflation settings x 6 filing statuses (single, mfj, hoh,
qss, an unknown string, undefined) x 3 year indexes (0, 7, 13.5) x grids of wages, pension, retirement, gains, taxable Social Security
and age lists (including null ages), 1,367,820 values, **0 mismatches, exact equality**. (3) `tests/tax_brackets.js` now reads
`STATE_RULES` (its independent reference calculation is unchanged).

**Timing gate.** The Phase 2 benchmark was a one-off measurement, never committed; `tests/bench_runs.js` is the committed
version (400 `simulate()` + 120 `simulateHistorical()`, median of 3, per state). Before (`fb03255`) vs commit 1, ms:

| State | simulate before -> after | historical before -> after |
|---|---|---|
| tx | 319 -> 309 | 67 -> 77 |
| ca | 564 -> 361 | 111 -> 72 |
| ny | 617 -> 374 | 116 -> 76 |
| pa | 444 -> 346 | 84 -> 68 |
| ct | 601 -> 344 | 113 -> 68 |
| wa | 337 -> 301 | 70 -> 61 |

(Run-to-run noise is about 5-10%; the old code rebuilt the bracket arrays on every call. A per-(state, year) cache would not
have helped: the index factor differs per historical or Monte Carlo path, so the row is resolved once per state code and the
factor is applied inside the loop.)

**Commit 2: generated review artifact.** `scripts/gen-state-rules.js` evaluates the `STATE_RULES:begin/end` block of
`Planner_US.html` in a `vm` (no browser) and writes `docs/state-tax-rules.md`: a rules table (status and source, tax, indexing,
HoH/QSS columns, base, deductions, retirement exclusion, surtax, credits), a notes list and the full bracket list, plus the
local-tax gap. `npm test` runs it with `--check` (stale or missing file fails; CRLF is ignored). It is outside `sync-shared`
because the table is US-only.

**Commit 3: mechanisms and plumbing (no behavior change for any migrated row).** Schema v2: `surtax` becomes the
`additions` list (MA's surtax is the one migrated entry), and rows gain `sourceKind` (`none` | `secondary` | `primary`),
`exemptionPhaseOut`, `dependentExemption`; Social Security can be `agiTested` and the retirement exclusion `perPerson` or
`agiPhasedShare`; `credits` is a typed list. The evaluator order is: base (ordinary income, gains share, Social Security),
state AGI after the state's own subtractions, deduction, exemption (with its step-down), dependent exemption, graduated or flat
tax, additions, credits. Verified: the same 1,367,820-value differential against `fb03255` (0 mismatches), snapshots exact, and
`tests/state_mechanisms.js` (hand-computed cases for every mechanism on a synthetic row, plus the `taxFor` plumbing).
- NY's recapture is modeled from its structure, not its constants: for taxable income in band k above band start s with rate r and
  the previous band's rate q, tax = T(income) + (q*s - T(s)) + (r - q)*s*ratio. Checked against the 2024 IT-201-I worksheets
  (single, base 568 and incremental 1,831 at 215,400; MFJ base 333 and incremental 807 at 161,550, 1,140 and 2,747 at 323,200),
  so the 2026 rates (3.9 / 4.4 / 5.15 / 5.4 / 5.9) produce the right constants without retyping them. The ratio is rounded to four
  decimals as the worksheets do.
- A no-tax state skips building the state inputs in `taxFor` (`stateTaxActive`). Without it the larger `sources` object made the
  no-tax path about 10% slower on the historical runs (measured at `--scale 6`: 720 runs, 403 ms vs 355 ms); with it Texas is at or
  below the `fb03255` baseline.
- Timing, ms, `tests/bench_runs.js --scale 6` (2,400 simulate + 720 historical), `fb03255` -> commit 3: tx 1651/341 -> 1570/344,
  ca 3313/669 -> 2093/455.

**Commit 4: two separate returns split the discretionary draw by account ownership (US V97 -> V98; intended number change).**
The two-filer branch of `taxFor` (a couple before the `marryLater` marriage age, or `filingStatus: single` with two partners) taxed
`traditionalExtra` half on each return. It now uses `profile.ownerShareA` (Partner A's share of the traditional pool in the year, from the
account ledger; 0.5 when a profile carries none, which is bit-identical to the old half). Gains and dividends still split evenly (the taxable
account has no per-partner ledger). One of 518 US scenarios moved ("std R filing single": first changed year index 9, tax 18,239 -> 18,853,
depleted age 88 -> 89); Canada and every joint or one-person scenario are unchanged. The default scenario and the historical and Monte Carlo
success rates in `tests/historical_rates.js` do not use separate returns, so they are unchanged. Test: `tests/state_mechanisms.js` (two
separate returns, state and federal parts).

**Commit 5: the researched reference states (US V98 -> V99; intended number changes for CA, NY, PA, CT and WA).** Rows for
California, New York, Pennsylvania, Connecticut (the sixth reference state, owner decision, for income-tested Social Security and pension
rules), Washington and Texas. Each row's `notes` (shown under the selector in the planner) and `docs/state-tax-rules.md` list what is and is
not modeled and the source. Source status is S (secondary) unless marked P (primary: an official document opened and read):
- **California (S, 2025 figures; the FTB's 2026 indexed schedules were not yet published, so 2025 stands for plan year 0 and the
  index factor takes it from there).** CalCPA Fast Tax Facts, Dec. 2025: brackets for single and joint (the old table already held the
  2025 bracket thresholds; the old standard deduction was the 2024 one), standard deduction $5,706 / $11,412 (HoH the same as joint),
  exemption credits $153 (single, HoH) / $307 (joint) / $153 per filer 65+ / $475 per dependent, each cut by $6 per $2,500 of federal AGI over
  $252,203 / $504,411 / $378,310, renter's credit $60 / $120 under AGI $53,954 / $107,987. HoH brackets from a 2025 Schedule Z listing
  (22,173 / 52,530 / 67,716 / 83,805 / 98,990 / 505,208 / 606,251 / 1,010,417), with the 1% mental-health surcharge folded into the top two
  brackets as before. HoH and QSS now read their own columns (QSS: joint). Not modeled: CalEITC, Young Child Tax Credit, senior HoH credit.
- **New York (thresholds P, 2026 rates and amounts S).** Bracket thresholds are statutory and not indexed (IT-201-I 2024 and 2025, read);
  2026 rates 3.9 / 4.4 / 5.15 / 5.4 / 5.9 percent (the five-bracket cut, from secondary sources), standard deduction $8,000 / $16,050 / $11,200,
  $1,000 per dependent. **Tax benefit recapture** is implemented from the IT-201-I worksheet structure and checked against its 2024 constants
  (see commit 3). It has real steps: the phase-in is by AGI over $50,000 starting at $107,650 (or at the band start), the band is chosen by taxable
  income, so crossing a band start with an AGI a deduction above it jumps by the incremental benefit times the ratio already reached
  (single at taxable $215,400 with AGI $223,400: +$293), and inside a phase-in the marginal rate is high (about 70% across $1,077,550 to $1,127,550
  for a single filer). That is the law's shape, not a bug; the invariants test exempts recapturing rows from its no-jump check. Pension and annuity
  exclusion $20,000 per filer from 59 and a half (traditional withdrawals included, S). Empire State child credit $1,000 under 4 and $500 at
  4-16 for 2026, refundable, reduced $16.50 per $1,000 of federal AGI over $75,000 ($110,000 joint); the reduction comes off the household's total credit
  once, not off each child (owner, 2026-10-04: two children aged 5 at AGI 120,000 owe 1,000 - 165 = 835). A qualifying surviving spouse reads the joint column even for the child credit (the credit's own threshold is $75,000).
  Not modeled: household credit, real property tax credit, EITC, NYC and Yonkers taxes.
- **Pennsylvania (rate, no deductions and the forgiveness tables P; retirement rules S).** Flat 3.07%, gains as ordinary income, Social Security
  exempt, pensions excluded, **traditional withdrawals excluded only from 59 and a half per filer** (secondary sources: IRA distributions before
  59 and a half are taxable with cost recovery). This fixes the old row, which excluded every traditional withdrawal at any age, so an early
  retiree drawing from an IRA at 52 owed nothing; it now owes 3.07%. The 401(k)-after-retirement exception (an employer-plan distribution after
  retiring is excluded at any age) and Roth cost recovery are not modeled: conservative. Tax Forgiveness: 100% at or under $6,500 of eligibility
  income ($13,000 married) plus $9,500 per dependent, then 10% less per $250 (the no-dependent tables were read; the per-dependent structure
  and the 10-step width are taken to hold for all rows); eligibility income is taken as the PA base (qualified retirement payments and Social
  Security are excluded from it).
- **Connecticut (tables P: Form CT-1040 TCS Rev. 12/25, tax year 2025; retirement rules P: OLR report 2025-R-0152, Sept. 2025).** Brackets, the
  personal exemption ($15,000 / $24,000 / $19,000, less $1,000 per $1,000 of AGI over $30,000 / $48,000 / $38,000), Table C (2% add-back), Table D
  (recapture) and Table E (personal tax credit decimals) are encoded as AGI step tables (C and D generated from their regular ramps and checked
  against the printed endpoints; the PDF text of Table A is misaligned, so the exemption follows the rule that matches the joint column and the
  stated phase-out ends). Social Security: exempt under $75,000 AGI ($100,000 joint or HoH), above that 25% of benefits received is the most
  taxed. Pension, annuity and IRA income: share 100% under $75,000 ($100,000 joint) falling in steps to 0% at $100,000 ($150,000 joint); the IRA
  deduction is 100% from 2026 (75% in 2025), so the 2026 share applies to all traditional income. Property tax credit up to $300 for the home,
  15% less per $10,000 over $49,500 / $70,500 / $54,500 (S). Nothing is indexed. Not modeled: the CT EITC, the vehicle part of the property tax
  credit, any 2026 table revisions.
- **Washington (P, DOR).** 7% to $1 million of taxable gains, **9.9% above** (ESSB 5813, owner decision), standard deduction $278,000 (the same for a couple;
  2025), assumed to index with inflation (DOR says the exemption adjusts; the $1 million tier is assumed to index too, to confirm).
- **Texas.** No individual income tax (the Comptroller's tax list has none; the constitutional text was not opened).

Before / after (state tax in plan year 0, `fb03255`'s rules vs commit 5, dollars):

| Household | Change |
|---|---|
| Working couple 45/43, wages 200,000, children 6 and 9, owner (property tax 9,000) | CA 10,447 -> 9,159; NY 9,713 -> 10,548; PA 6,140 -> 6,140; CT 9,500 -> 10,000 |
| Retired couple 66/64: pension 40,000, IRA draws 40,000, Social Security 40,000 (25,000 taxable), gains 10,000 | CA 1,885 -> 1,411; NY 1,501 -> 1,501; PA 307 -> 0; CT 4,825 -> 2,142 |
| Early retiree, single, 55: traditional draws 50,000, gains 20,000 | CA 2,541 -> 2,375; NY 3,183 -> 3,183; PA 614 -> 2,149; CT 3,100 -> 40 |
| Single, wages 100,000, renter (rent 18,000) | CA 5,223 -> 5,055; NY 4,860 -> 4,860; PA 3,070 -> 3,070; CT 4,750 -> 4,975 |
| Single, wages 1,300,000 | CA 143,000 -> 142,978; NY 91,892 -> 124,678 (the recapture) |
| Single, gains 400,000 | WA 8,540 -> 8,540 (the 9.9% tier starts above 1,000,000 of taxable gains) |

Snapshots: 2 of 518 US scenarios moved, both explained by the new rows: "std R state ca" (first changed year index 0: tax 1,504 -> 1,177,
the exemption credit and the new standard deduction; depleted age 87 -> 88) and "std R state ny" (first changed year index 1: tax 3,277 -> 3,308;
depleted age 86 -> 86). Canada and every other scenario are byte-identical. UI snapshots (`ui_us.json`) changed only in the rendered-text
hashes (the selector tip and the state note lines). Default scenario: unchanged (its state is the old default, Massachusetts, which is
still a migrated row).

Timing (`tests/bench_runs.js --scale 3`, 1,200 simulate + 360 historical, ms), `fb03255` -> commit 5: tx 760/159 -> 731/161, ca 1,580/310 ->
1,145/235, ny 1,705/324 -> 1,146/250, pa 1,245/231 -> 1,056/222, ct 1,672/316 -> 1,403/315, wa 921/197 -> 887/193. Within the +5% gate everywhere.

Tests: `tests/state_reference.js` (about 45 hand-computed households across the six rows, including QSS and HoH columns and the indexing
choice), the updated literals in `tests/tax_brackets.js` (CA single $100k, WA 9.9%), and the invariants test now allows NY's recapture steps and
checks that a non-indexing state stays put.

**Follow-up to commit 5 (owner, 2026-10-04): indexing per family, NY QSS threshold, confirmations.**
- **Indexing is declared per family of parameters, not as one switch** (owner): `bracketsIndexed`, `standardDeductionIndexed`,
  `personalExemptionIndexed` (exemptions, dependent exemption, exemption credits), `creditAmountsIndexed`, `creditThresholdsIndexed` (credit
  income limits, phase-out starts and widths, the exemption step-down) and `retirementExclusionIndexed` (exclusion caps, the Social Security and
  pension AGI tests), plus an `indexed` flag on each `additions` entry. Migrated rows are fully indexed (bit-identical to before). CA: everything
  indexed except the 1% mental-health surcharge, now its own fixed-threshold addition at $1,000,000 instead of merged top brackets (so the surcharge
  threshold no longer drifts past the indexed 12.3% bracket start). NY, PA, CT: nothing indexed. WA: deduction indexed, the $1,000,000 tier not.
- **NY Empire State child credit for a qualifying surviving spouse** uses the $75,000 threshold (the credit's own per-status override; the brackets
  still read the joint column). The phase-out comes off the household total (see the earlier correction).
- **Owner-confirmed 2026 points** (from the owner's own table; treat as S+O until opened at the primary source): NY rates and thresholds, NY standard
  deductions, NY pension exclusion is for qualifying pension and annuity income from 59 and a half per person; CT property tax credit 15% per $10,000 over
  $49,500 / $70,500 / $54,500 with no enacted 2026 change found; WA standard deduction indexed ($278,000 for 2025), WA $1 million tier not indexed; CA
  has no published 2026 schedule yet (the row stays 2025, never labeled 2026). PA: IRA distributions are generally exempt after retirement age with
  early distributions taxable; 401(k) distributions are generally exempt after retirement (see the open item: not yet modeled).
- **The 17 states that index their brackets (owner's table; input for 7D, not yet applied to any migrated row):** AZ (Phoenix CPI), AR (CPI), CA (California CPI), ID (CPI,
  cumulative), IA (GDP deflator), ME (chained CPI), MN (CPI / statutory federal reference), MO (CPI, cumulative), MT (CPI), NE (CPI), ND (chained
  CPI), OH (GDP deflator), OR (CPI), RI (CPI), SC (chained CPI), VT (CPI), WI (CPI). The other states' rows have bracket indexing off in 7D unless
  the row research says otherwise; the per-family flags let 7D set standard deduction, exemption and credit indexing separately for each state. The
  planner uses one index factor (the plan's tax-index factor) for every state; the measures differ (Phoenix CPI, chained CPI, GDP deflator) and that
  difference is not modeled.

**External review of the migrated rows (2026-10-04): verified 7D worklist.** An outside review of `docs/state-tax-rules.md` flagged
12 items. Every flagged row is a `migrated` row (labeled unverified, scheduled for 7D), so none was a deliberate simplification except the
retirement-exclusion shapes and the empty credits, which the file already disclosed. Each claim was re-searched; P = an official document opened and
read (or an official site's own page), S = secondary.

| State | Claim | Verdict | Evidence | 7D action |
|---|---|---|---|---|
| MO | 2026 brackets are $1,313 / $2,626 / ... / $9,191 and the standard deduction does not match | **False.** Our brackets ($1,348 ... $9,436, 0% / 2% / 2.5% / 3% / 3.5% / 4% / 4.5% / 4.7%) and standard deduction ($16,100 single, $32,200 joint, $24,150 HoH) match the official figures | P: MO DOR 2026 Withholding Tax Formula PDF (annual rate table 0 to 1,348 ... over 9,436; deduction $16,100 / $32,200 / $24,150) | none for these figures; MO's federal-tax deduction and pension rules are still 7D |
| NC | 3.99% | Correct (reviewer agrees) | | confirm in 7D |
| UT | 4.5% | **Error.** 4.45% for 2026 (SB 60, 2026 session, retroactive to Jan. 1, 2026) | S: Utah legislature enrolled bill SB0060, EY summary | rate 4.45%; also the Social Security credit |
| WV | 2.22% - 4.82% | **Error.** 2026 rates are 2.11 / 2.81 / 3.16 / 4.22 / 4.58 percent (SB 392, signed March 31, 2026, retroactive) | S: WV tax department page and EY summary (tax.wv.gov page listed, not opened) | new rates |
| HI | standard deduction $4,400 / $8,800 | **Error (stale).** 2026: $8,000 single / $16,000 joint / $12,000 HoH; 2026 brackets equal the 2025 ones (ours match) | P: Hawaii Dept. of Taxation Announcement 2024-03 (Act 46), read | deduction; new item: Act 24 (2026) adds a 13% rate from Jan. 1, 2027 on taxable income over $500,000 single / $750,000 HoH / $1,000,000 joint (S: EY, Bloomberg Tax, CPA Practice Advisor) and the 2027 bracket widening in Act 46 (P, same announcement): the plan years after 2026 need them |
| MA | deduction 0, no exemptions | **Error (omission).** Personal exemption $4,400 single / $8,800 joint / $6,800 HoH plus $1,000 per dependent for 2026 (more for 65+ and blind) | P: mass.gov "Massachusetts Personal Income Tax Exemptions" (search result; page not opened) | add exemptions and dependent exemption |
| MS | personal exemption missing; retirement shown as a share scaled by the share of filers 59 and a half | **Error (omission), and the shape is wrong.** Exemptions: $6,000 single, $12,000 joint, $8,000 head of family (with a dependent), $1,500 per dependent (standard deduction $2,300 / $4,600 is right). Qualified retirement income is exempt per person when the plan's retirement requirements are met; early distributions are taxable | P: MS DOR forms (search result); S: retirement rule | per-person retirement kind, exemptions |
| AL | no exemptions | **Error (omission).** Personal exemption $1,500 single / $3,000 joint and head of family; dependent exemption amount unresolved ($300 in one source, $1,000 falling to $500 above $100,000 in another). The standard deduction in the row is the top of an AGI-phased schedule (2025 official table: single $3,000 falling to $2,500 by $35,500 of AGI; joint $8,500 to $5,000; HoH $5,200 to $2,500) | P: Alabama DOR standard deduction table (tax year 2025), read; S: exemptions | exemptions, phase-down (a step-down on AGI), federal-tax deduction (the lagged pass) |
| DE | no retirement exclusion | **Error (omission).** $12,500 per person age 60+ (pension and eligible retirement income combined, including IRA, 401(k) and a capped share of other eligible income); under 60, $2,000 of qualifying pension income. Social Security is exempt. | S: Delaware Division of Revenue and Delaware Code title 30, ch. 11 listings | new retirement kind with an age tier |
| CO | Social Security: all at 65+, else up to $24,000 | **Partly right, partly error.** 65+: the full federally taxable amount is subtractable (ours is right). 55-64 (from tax year 2025): the full amount if AGI is under $75,000 single / $95,000 joint, otherwise the reviewer's $20,000 cap. The $24,000 in our row is the *pension* cap, conflated. **The row also has no pension and annuity subtraction at all**: $24,000 per person at 65+, $20,000 at 55-64 (includes IRA and 401(k) distributions). **The cap-increase bills did not become law** (resolved, see below): the enacted 2026 rule stays $20,000 / $24,000 | P: Colorado General Assembly bill pages (read) for the bills; tax.colorado.gov 2025 Form 104 instructions (excerpts via search, pages return 403) for the caps | per-person pension kind with age tiers, SS rule by age and AGI |
| ME | standard deduction $8,350 / $16,700 and no retirement exclusion | **Error (stale), correct value unsettled.** Pension income deduction exists: $48,216 per person for 2025, reduced dollar for dollar by Social Security and railroad retirement benefits, with a phase-out by AGI from 2025. Standard deduction 2026: secondary sources say $15,700 / $31,400 (the reviewer too); Maine's own 2025 instructions state a "basic standard deduction" of $12,000 single / $18,000 HoH / $24,000 joint for 2026 and later (indexing not read). Brackets 2026 $27,400 / $64,850 (ours $27,399 / $64,849, a 2025 rounding) | P: Maine Revenue Services 2025 instructions (search result); S: others | read the 2026 Maine instructions; pension deduction as a per-person kind reduced by benefits |
| SC | 0-6%, federal-style deduction | **Error.** H.4216 (Act 110, signed March 30, 2026) for tax years from 2026: 1.99% under $30,000 of taxable income, 5.21% minus $966 at or over $30,000; the base is federal AGI; the federal standard deduction is replaced by the SCIAD of $15,000 single / $22,500 HoH / $30,000 joint, reduced by income (single $40,000-$95,000, HoH $60,000-$142,500, joint from $80,000, upper end not read); EITC capped at $200; later automatic rate cuts. The DOR page is silent on retirement and Social Security under the new law | P: SC DOR "Information about H. 4216" (read); S: others | rebuild the row; read the act for the retirement deduction |
| WA | possible new income tax in 2026 | Not an error (reviewer agrees): the new tax on income over $1 million starts January 1, 2028; the 7% / 9.9% capital-gains tax is the 2026 tax | | track 2028 |

**Colorado cap-increase: resolved (2026-10-04).** The General Assembly's own bill pages (leg.colorado.gov, read) settle it:
- **HB24-1142** (enacted): signed June 6, 2024, effective August 7, 2024, for tax years from January 1, 2025: ages 55-64 may subtract their full federally taxable
  Social Security when AGI is at most $75,000 single / $95,000 joint (65+ already could). It does not touch the pension and annuity caps.
- **SB25-136** (would have removed the pension and annuity caps from 2026): lost; the Senate State, Veterans and Military Affairs Committee postponed it
  indefinitely on February 27, 2025 (3-2).
- **HB26-1062** (would have let anyone 55 or older subtract all pension and annuity income): lost; the House Finance Committee postponed it indefinitely on
  February 9, 2026 (7-4).
- The $40,000 (55-64) / $50,000 (65+) caps with an AGI cutoff above $100,000 appear only in a September 2024 interim-committee draft ("Bill 7", fiscal note); that draft was a
  proposal and never enacted. An outside suggestion that it was bill SB24-777 could not be confirmed: leg.colorado.gov has no such page (404).
- **The 2026 rule to model** (Colorado Department of Revenue 2025 Form 104 instructions, excerpts): pension and annuity subtraction is the smaller of the taxable
  pension and annuity income or $24,000 at 65+ / $20,000 at 55-64 (nothing under 55 except military and similar, not modeled), per taxpayer; Social Security: the
  full federally taxable amount at 65+, and at 55-64 when AGI is within $75,000 / $95,000 (HB24-1142). The instruction wording subtracts "any amount entered on line 3" from the cap;
  line 3 is a prior subtraction on the same schedule, probably the capped Social Security subtraction of a 55-64 filer above the AGI limits, so that capped Social Security amount
  would use up part of the same cap (to confirm in the Form 104 booklet when reachable; tax.colorado.gov returned 403 to the fetch tool). Our migrated row's $24,000 under-65 Social
  Security cap is therefore wrong in both directions (it is the 65+ pension cap, and a 55-64 filer above the AGI limit is capped at $20,000 together with pension income).
The 2025 Colorado schedule DR 0104AD (the subtractions schedule, supplied by the owner, read) confirms the structure but not the line 3 wording: the Social Security and the
pension, annuity and IRA subtractions are separate lines **per person** (line 3 primary taxpayer's Social Security, line 4 primary's pension, annuity and IRA income, lines 5 and 6 the spouse's),
so the per-person kinds are the right shape and "minus line 3" in the instructions refers to that same person's Social Security subtraction. Whether a 65+ filer's full Social Security subtraction
reduces the $24,000 pension cap is not stated on the form (the instruction booklet's wording for lines 3 and 4 is still needed; the form is not the instructions). It also lists the
subtractions the planner does not model: military retirement under 55 (lines 7 and 8), railroad benefits, PERA, and others.
**Working reading of the shared bucket (outside analysis, consistent with the instruction wording, not yet confirmed in the booklet):** per person, the Social Security subtraction
(line 3 / 5) and the pension, annuity and IRA subtraction (line 4 / 6) share one bucket of $24,000 (65+) or $20,000 (55-64). Pension subtraction = min(that person's taxable pension and IRA income,
max(0, cap - that person's Social Security subtraction)). A 65+ filer's Social Security subtraction is itself unlimited (the 2022 rule: all federally taxable benefits when they exceed the cap), so
taxable Social Security of $24,000 or more leaves no pension subtraction, and the two never add to more than the cap except through that Social Security exception. Worked rows (65+, $20,000
taxable pension): Social Security $10,000 -> pension subtraction $14,000 (min of $20,000 and $24,000 less $10,000), $20,000 -> $4,000, $24,000 -> $0, $30,000 -> $0. For 55-64 the Social Security part follows the HB24-1142 AGI test, and above the AGI limits it uses the
$20,000 bucket. Needs each person's own taxable Social Security (the household figure split in proportion to each partner's benefits; mechanism 15).
Backlog: confirm the shared bucket and the line 3 reading against the Form 104 booklet, and the HB24-1142 thresholds' indexing (none stated), as open.

Findings that are disclosed simplifications, not errors: credits shown as `none` (every migrated row), the household-level retirement kinds (MS share,
SC tier, IA, AR, GA), the CA / CT / NY 2025 labels. The migrated rows were never validated; 7D replaces them. One more consequence of the list above:
several rows need a mechanism the schema does not have yet (a combined cap reduced by benefits received, ME; an AGI step-down of the standard deduction,
AL and SC's SCIAD; a pension cap by age tier with a younger tier, CO and DE; a tax deduction for federal tax paid, AL / MO / OR / MT), to be added with
tests before the data lands.

#### 7D: all remaining states and DC (US only; Canada untouched)

Branch `claude/batch-7d-remaining-states`, cut from the 3B-line tip `2136d7b` (7C merged). Owner decisions (2026-10-04), recorded before work started:
- **One version-badge bump for the whole PR** (US V99 -> V100, in the first user-facing commit), not one per data commit; this deviates from the per-commit rule in CLAUDE.md on the owner's instruction.
- **State tax ignored additional income** (income streams and one-time income): `taxFor` fed the state `wages` from the wage fields only, while the federal side reads `profile.otherA`, which includes them. Fixed in its own commit (intended number change, before/after below).
- **Scheduled changes (mechanism 1):** a variant's amounts are the statutory amounts for its `fromYear`; an indexed family grows from that year on, `amount x F(i) / F(fromYear - currentYear)`. Only unconditional enacted schedules are modeled; revenue-triggered cuts (SC and others) are left out and named in the row's notes (the model then overstates later-year tax if the triggers fire: the safe side).
- **Federal income tax deducted by a state (mechanism 7):** the year's federal income tax liability, i.e. ordinary tax plus long-term-gain tax minus the nonrefundable child credits, floored at zero; not NIIT, payroll tax, Additional Medicare Tax or the refundable ACTC; this year's liability (not withholding or prior-year payments); from one lagged pass (the federal itemizing test run with state tax zero); each separate return deducts its own; a survivor uses the single return; the row applies its own cap or phase-out.
- **Circuit-breaker and income-tested property-tax / renter credits are excluded** (mechanism 11 dropped, so 14 mechanisms remain): they pay low-income households, and a FIRE household living on Roth, cash and basis can look low-income on paper, but the planner has no nontaxable-income input to apply the real income definitions, so the credit would go to households the forms would refuse. Each affected row's notes name the gap; listed under Open items. No home-value or assessed-value input is added. The existing CA, NY, PA and CT credits stay.
- **Also not modeled** (documented in the rows): blind and disabled status, military versus civilian and public versus private pension distinctions, short-term gains, state itemized deductions, local taxes other than MD and IN.
- **Local tax for MD and IN only:** one statewide rate per state (MD: the most common county rate; IN: the population-weighted average county rate), no county input; it feeds the federal SALT deduction. Every other local tax stays out of scope.
- **Selector tip from the table:** the tip is built at runtime from the selected row (a shared sentence, the row's notes, source and as-of year).
- **Research is inline** (no subagents).

**Commit 1: per-person Social Security on `sources` (mechanism 15; no behavior change).** `ssBenefitsA/B` and the taxable Social Security split in proportion to benefits (`taxableSSA/B`) join `ssBenefits` in all three `taxFor` branches; a one-person return and each separate return read slot A. Snapshots exact (518 US, 359 Canada), UI snapshots unchanged. The end-to-end test arrives with mechanism 5, the first reader.

**Commit 2: state tax on additional income (US V99 -> V100; intended number change).** `profile.extraIncome` (income streams plus one-time income, which `buildTaxProfile` already put in Partner A's slot of `otherA`) now feeds the state `wages` in the joint, one-person and (on A's return) two-separate-returns branches, including the survivor remap. The bug: the federal side read `otherA`, the state read the wage fields only, so these streams were never state taxed. Before/after, plan year 0, default household plus a $20,000 stream: MA 39,455 -> 40,455 (+1,000, 5%), CA 37,166 -> 38,790 (+1,625), NY 39,018 -> 40,224 (+1,206), NC 38,054 -> 38,852 (+798, 3.99%), TX unchanged. No snapshot scenario combines an income stream with a taxing state, so 0 of 518 US scenarios moved (Canada untouched). Test: `tests/state_extra_income.js` (joint, one person, two returns, a profile without the field). Canada was not checked for the equivalent.

**Commit 3: mechanisms 1, 2, 3, 4, 5, 6, 8, 10 and 14 (no behavior change for any row).** Every row declares four new fields (an explicit none):
`standardDeductionPhase`, `seniorExemption`, `federalConformity` and `schedule`; `dependentExemption` may be a number or an AGI-tiered table and a
`threshold` addition may carry a number or a per-column object. The NY and PA rows moved to the new `perPerson` shape (`applies`, `tiers`,
`reducedBy`, `share`; the old `cap` is `tiers: [[0, cap]]`). Snapshots, the 1.37-million-value differential and every existing state test are unchanged.
Decisions taken while building:
- **Mechanism 5 is a field, not a separate kind.** `perPerson` carries `reducedBy` ('none' | 'socialSecuritySubtracted' | 'benefitsReceived') instead of a
  second kind `perPersonSharedCap`: one loop, one test. The filer's own Social Security subtraction is the household's subtraction split in proportion to the
  taxable benefits (`taxableSSA/B` from commit 1); mechanism 9 will compute it per person where a state's rule is per person.
- **Schedule entries build on each other** (a 2030 rate cut keeps the 2028 deduction change). Each indexing family remembers the base year of the latest entry
  that touched it (`SCHEDULE_FAMILIES`: a field maps to the family of its amounts and, if it has them, of its thresholds), so a rate-only entry never rebases the
  deduction. A `fromYear` before the plan's first year applies from year 0. A no-tax row has no schedule.
- **Mechanism 8 takes the whole federal helper**: `standardDeduction(filing, yearIndex, ages)` with the 65+ add-on only if asked, and `seniorDeduction` at the
  AGI proxy; a conforming row carries zeros in its own `standardDeduction` (checked), and the senior and 65+ options require conformity.
- **Mechanism 2 uses the credit-threshold index flag for its AGI bounds** (no new family yet); the amounts follow the deduction family.
- Mechanism 10's `seniorExemption` has the optional per-filer phase-out proposed for Virginia-style age deductions.
Timing (`tests/bench_runs.js --scale 3 --repeats 5`, 1,200 simulate + 360 historical, ms, previous commit -> this one): NY (the only reference row on the new per-person loop) 1,333 -> 1,373 and 288 -> 292, 1,313 -> 1,345 and 294 -> 300; PA 1,176 -> 1,217, 1,331 -> 1,229; CA, CT, TX, WA inside run-to-run noise. A first version that read the exclusion's nested fields on every call measured +5% on NY; the per-person exclusion is now flattened once in `compileRetirement`, which brought it to +2-3%.

Tests: `tests/state_mechanisms.js` (about 80 new hand-computed cases, each checked in a mutation run to fail when its expected value is wrong; the per-person
Social Security plumbing through `taxFor` in the joint, two-return and one-person branches), `tests/state_rules.js` (the new fields, scheduled variants checked as
complete rows).

**Commit 4: mechanisms 7, 9, 12, 13 and the flat local tax (no behavior change for any row).** Mechanism 11 (circuit breakers) was dropped by the owner;
the local tax is the owner-requested addition for MD and IN. All rows gain `base.gainsRate: null` and `base.gainsDeduction: 0`; the schema accepts
`federalTaxSubtraction` and `localTax` objects. Snapshots exact, existing state tests unchanged. Decisions taken while building:
- **Mechanism 7 (`federalTaxSubtraction`)** has a `placement`: 'subtraction' lowers the state AGI (Oregon, Missouri, Montana style) and 'itemized' replaces the
  standard deduction when larger (Alabama style, where the federal tax is the main itemized item); `cap` is null or a dollar amount per column, `phase` a step
  table that scales the cap by the state AGI (Oregon's phase-out). The liability is the one defined in the owner decisions above, computed by `taxFor` once per
  call with a state tax of zero, only when the selected row asks (`stateNeedsFederalTax`), per return in the two-return branch. The accepted inconsistency: a
  filer who itemizes federally deducts a federal tax computed without this state's tax in the SALT total. A schedule may not add or drop the deduction.
- **Mechanism 9**: `ageAgiTiered` is per filer (each filer's own age and own taxable benefits, the household figure split in proportion; the highest tier reached
  applies; under the first tier nothing; within a tier all of the filer's taxable benefits while the federal AGI is at or under the tier's limit, else at most
  `capOverLimit`), and it feeds the same per-filer subtraction to a shared retirement cap (Colorado). `agiShare` (a step table of the share subtracted) covers the
  AGI cliffs (KS, MO, NM, RI, WV) and `agiPhaseOut` (a straight line between two AGIs) covers Vermont-style phase-outs. `ssCredit` is a nonrefundable credit of
  `rate` on the taxable benefits reduced by `phase.rate` per dollar of AGI over `phase.start`; it is a first guess at Utah's credit and gets amended if the Utah
  research shows another shape (no row uses it yet).
- **Mechanism 12**: `incomeTestedCredit` (a flat amount per column, a senior amount per filer from an age, an amount per qualifying child, none above an AGI
  limit or tapering by `pct` per `width`); `exemptionCredits` already covers the California shape.
- **Mechanism 13**: with a `gainsRate` the included gains (after the dollar exclusion) are taxed at that flat rate outside the bracketed base; the ordinary
  deduction and exemptions do not offset them (conservative). A dollar exclusion alone is taken from the included gains before they join the base.
- **Local tax**: `localTax: { kind: 'flat', rate }` adds `rate` x the state taxable income after the credits, and the whole amount is the state tax that
  `taxFor` hands to the federal SALT deduction. A state credit does not reduce it. MD: the most common county rate; IN: the population-weighted average
  county rate (both sourced when the rows are written).
Timing (`tests/bench_runs.js --scale 3 --repeats 5`, previous commit -> this one, three alternating rounds): NY 1,352 / 1,370 / 1,351 -> 1,371 / 1,428 / 1,391 simulate and 292 / 295 / 289 -> 298 / 317 / 297 historical; CT 1,521 / 1,520 / 1,486 -> 1,531 / 1,535 / 1,533; TX and CA inside noise (one round measured +10% on a loaded machine and did not repeat).

Tests: `tests/state_mechanisms.js` (about 60 more hand-computed cases: each Social Security kind at, below and above its bounds; the credit kinds; the gains shapes;
the local tax including its effect on the federal itemized deduction; the federal tax paid for a single filer, a joint couple with and without a child, two
separate returns, a cap, a phase and both placements), `tests/state_rules.js` (the new schema).

**Commit 5: G1, the states with no individual income tax (AK FL NV SD WY NH TN; US V100).** Seven rows become `researched` with indexing off. Sources: Tennessee's
Department of Revenue notice HIT-3 (the Hall tax repealed for periods beginning January 1, 2021; primary, an official page read through search excerpts); New Hampshire's
Interest and Dividends Tax repealed for periods beginning on or after January 1, 2025 (HB 2 of 2023; a law-firm summary quoting the Department of Revenue Administration,
secondary); Alaska, Florida, Nevada, South Dakota and Wyoming from a no-income-tax roundup (secondary, no state page opened; backlog). Also in this commit:
- **The state field's info bubble is built from the selected row** (`stateTaxTipText`, refreshed in `render()`): a common sentence on what no state models, then the
  row's notes, as-of year and source (a migrated row says it is still a simplified estimate). The static markup carries a short fallback; the small caption under the
  label changed too. A researched no-tax row now shows its own notes in the callout under the selector.
- UI snapshot: only the rendered-text hashes of the three surfaces changed (the caption and the state note text); projection and row hashes, and `histSuccess`, are
  identical. 0 of 518 US and 0 of 359 Canada scenarios moved.
- Test: `tests/state_7d_households.js` (the two shared households; every no-tax state owes 0). The file grows with each group.

**Commit 6: G2, the flat-rate states (AZ ID IN KY LA MA NC UT; US V100; intended number change for Massachusetts, the planner's default state).** Eight rows become
`researched`. Source status per state (P = official page or document read, S = secondary or search excerpt; figures not found are listed in the backlog):
- **Arizona (S; the Department of Revenue page read for the dependent credit only).** Flat 2.5%; the standard deduction is the federal base (conformity, no 65+ add-on); 25%
  of net long-term gains subtracted; Social Security exempt; dependent credit $100 under 17 and $25 other dependents (P). The 2026 session's $125 credit (SB 1845) was vetoed on
  May 5, 2026 (P, azleg.gov summary read), and the extension of the gains subtraction to all assets appears only in a vetoed bill, so neither is modeled; the dependent credit's
  high-income phase-out, the $2,100 age-65 and $2,300 dependent exemptions (from memory of A.R.S. 43-1023, S) and conformity to the federal senior deduction (SB 1106 and HB 2531
  disagreed; no enacted conformity found) are in the backlog.
- **Idaho (P: Tax Commission announcement read).** Flat 5.3% since 2025; the larger federal standard deduction and the senior deduction through House Bill 559 (S: news and
  software summaries); Social Security exempt; food tax credit $155 per person, refundable (P, the 2025 amount).
- **Indiana (P: Departmental Notice #1, effective October 1, 2026, read).** State rate 2.95% for 2026; the Notice says 2.90% from 2027 on, modeled as the one scheduled change
  (further cuts depend on revenue and are left out). Exemptions $1,000 per filer, $1,000 more per filer 65+, and $2,500 per dependent child (P). All 92 county rates are in the
  Notice (0.5% Porter to 3.0% Randolph); the planner applies **1.77%**, the average weighted by approximate 2020 census county populations (populations from memory, S), to the
  state taxable income. The extra $500 for 65+ under $40,000, the renter's deduction ($3,000) and the military and other deductions are not modeled.
- **Kentucky (P: the 2026 withholding formula read).** 3.5% and a $3,360 standard deduction (indexed); retirement income exclusion $31,110 per person (S) and a $40 credit at 65
  (S). The family size credit and local occupational taxes are not modeled.
- **Louisiana (S).** 3% flat; standard deduction $12,500 / $25,000 inflation-adjusted from 2026; retirement exclusion $12,000 per person 65+ (S, EY and a Department of Revenue FAQ
  excerpt); Social Security exempt. Whether the personal and dependent exemptions survive the 2025 reform was not settled and none is modeled.
- **Massachusetts (S; the mass.gov exemptions page returned 403).** 5% flat (long-term gains included) plus the 4% surtax over $1,107,750 (P in the worklist); exemptions $4,400 /
  $8,800 / $6,800, $1,000 per dependent, $700 at 65; Child and Family Tax Credit $440 per dependent under 13, refundable, no income test (S, mass.gov search excerpts); Social Security
  exempt. Short-term gains (8.5%), the rent deduction and public-pension rules are not modeled. This fixes the migrated row's omission of the exemptions (worklist).
- **North Carolina (P: Department of Revenue child-deduction tables read).** 3.99%; the 2027 and later cuts depend on revenue and are left out; standard deduction $12,750 /
  $25,500 / $19,125 (S); child deduction by AGI and status, $3,000 down to $0 (P, 2025 tables). Social Security exempt.
- **Utah (P: Tax Commission credit pages read, tax year 2025 amounts; the rate S).** 4.45% (SB 60; the legislature's page failed a certificate check). Taxpayer tax credit:
  6% of the federal standard deduction plus $2,111 per dependent, less 1.3 cents per dollar of income over $18,213 / $36,426 / $27,320 (modeled as an `incomeTestedCredit` with a
  straight-line taper; the 2026 federal deduction is used for the amounts); Social Security benefits credit 4.45% of taxable benefits, less 2.5 cents per dollar over $54,000 /
  $90,000; taxable Social Security is included. The retirement credit (born 1952 or earlier) is not modeled.
Mechanism change: the `incomeTestedCredit` taper may be a straight line (`{ rate }`, dollars lost per dollar of AGI over the limit) as well as steps (needed for Utah's 1.3%); test
added in `tests/state_mechanisms.js`.
**Intended number change: Massachusetts.** The default state now takes the exemptions: the default scenario's year-0 state tax falls by $440 (the $8,800 joint exemption at 5%),
35,055.25 -> 34,615.25. 22 of 518 US scenarios moved, all using the default state (the 10 `hist_default` runs, `std_default` and its variants, `std R state ma`); Canada is
untouched. Default scenario success rates (`tests/historical_rates.js`): historical 85.4% -> 85.4% (41 cycles), Monte Carlo 85.7% -> 86.1% (2,000 paths, seed 7); the early retiree,
working-then-retires and survivor scenarios each move by 0.0 to 0.5 point of Monte Carlo (88.4 -> 88.6, 86.9 -> 87.4, 89.3 -> 89.5). UI snapshot: rendered-text hashes only for the
state note; `histSuccess` unchanged.
Tests: `tests/state_7d_households.js` (16 hand-computed household pairs so far, Indiana also at plan year 1 for the 2027 rate), the tax-schedule invariants test now lets a
refundable per-person credit (Idaho's) start the schedule below zero and skips scheduled rows in its plain-indexing check, and its MA literals moved to the exemption-adjusted values.

**Commit 7: G3, progressive states with simpler structures (AR HI KS NE ND OH OK RI VA WV; US V100).** Ten rows become `researched`; one mechanism is added first
(`taxShareCredit`: a share of the tax up to a cap, by column, for Ohio's joint filing credit; test in `tests/state_mechanisms.js`). Source status (P = document read, S = secondary):
- **Arkansas (P: the Department of Finance and Administration's 2026 withholding formula).** Table 0 / 2% / 3% / 3.4% / 3.9% at $5,600 / $11,200 / $16,000 / $26,400 and a $2,470
  standard deduction (one table for all filers; joint standard deduction doubled); half of net long-term gains taxed, $6,000 retirement exclusion per filer and $29 personal credits
  (P: DFA pension and capital gains pages via search excerpts). The earlier aggregator figure of a 3.7% top rate was wrong or is not the 2026 law: the DFA table says 3.9%.
- **Hawaii (P: Announcements 2024-03, 2025-07 and 2026-06).** The Act 46 schedule is data: 2026 brackets equal 2025's; 2027 and 2029 widen every bracket; standard deductions
  $8,000 / $16,000 / $12,000 in 2026, $9,000 / $18,000 / $13,500 in 2028, $10,000 / $20,000 / $15,000 in 2030, $12,000 / $24,000 / $18,000 from 2031. Act 24 of 2026 changes the 2027 and
  2029 brackets: second bracket 2.5%, third 5%, a new 13% bracket above $500,000 single / $750,000 head of household / $1,000,000 joint (the worklist's thresholds are confirmed). The
  rows are five `schedule` entries (the first user of mechanism 1). Hawaii is not indexed, so no base year matters. Employer-funded pensions are excluded and IRA and 401(k)
  withdrawals taxed (S: from the state's pension rules; the pension stream is all-or-nothing). The 7.25% cap on long-term gains is not modeled (overstates tax on gains in the upper
  brackets); backlog.
- **Kansas (P: KW-100).** 5.2% / 5.58% at $23,000 ($46,000 joint), 2026 standard deduction and exemption allowance, Social Security fully exempt; the $2,320 dependent amount is S.
- **Nebraska (P: the 2026 and 2027 estimated tax schedules in Form 1040N-ES, and the rate chronology).** 2.46% / 3.51% / 4.55% in 2026 (the third and fourth brackets share the top rate)
  at $4,130 / $24,760 single, $8,250 / $49,530 joint, $7,700 / $39,620 head of household; 3.99% from 2027 (draft 2027 schedule, thresholds $4,270 / $25,570 and so on, modeled as a `schedule`
  entry in 2027 dollars). Standard deduction $8,850 / $17,700 (chronology), personal exemption credit $176. The head of household deduction of $13,000 is derived (S).
- **North Dakota (P: tax.nd.gov rate table; the 2025 ND-1 form read).** Brackets by filing status, starting from federal taxable income; head of household treated as single (the withholding
  booklet does the same; the tax schedule's own head of household column was not found, backlog); a net long-term gain exclusion of 40% (S, from memory) and Social Security exempt.
- **Ohio (S: Legislative Service Commission analysis of HB 96 and Department of Taxation search excerpts).** Flat 2.75% above $26,050 in 2026; exemptions by income; the $50 senior credit; the
  joint filing credit approximated as 20% of the tax up to $650 (S; the per-spouse $500 income rule is not checked); the $200 retirement income credit and the $500,000 cutoff are not modeled.
- **Oklahoma (P: HB 2764 enrolled; 2026 withholding tables).** The three new 2026 brackets, standard deduction $6,350 / $12,700 / $9,350, exemption $1,000, retirement exclusion $10,000 per
  filer, Social Security exempt. Head of household reading the joint table is from memory (S).
- **Rhode Island (P: Division of Taxation Advisory 2025-22, converted to text with pdftotext).** 2026 brackets $82,050 / $186,450, standard deduction, exemption $5,250 and dependent amounts; the Social
  Security and pension modifications (full retirement age, AGI under $107,000 / $133,750, the pension modification up to $50,000 from 2025). The 2026 limits are not published, so the 2025 limits are used.
- **Virginia (P: the Department of Taxation deductions page and 2025 Form 760 instruction excerpts).** Rates 2 / 3 / 5 / 5.75%, standard deduction $8,750 / $17,500, exemption $930, age deduction $12,000
  per filer reduced dollar for dollar by income over $50,000 / $75,000.
- **West Virginia (P: the Tax Division's rate-cut page and Social Security page, excerpts).** 2.11 / 2.81 / 3.16 / 4.22 / 4.58% (SB 392); Social Security fully exempt from 2026; $2,000 exemption (S) and $8,000 for
  filers 65+ (S, as an exemption).
Tests: `tests/state_7d_households.js` now has 25 states (hand-computed; Hawaii at plan years 1, 2 and 3, Nebraska at year 1, Rhode Island with a filer at 67); `tests/tax_brackets.js` keeps its plain
table check for the rows that are still just a table (the threshold moved from 25 to 8 as rows gain exemptions, credits and conformity). No snapshot scenario uses these states: 0 moved.

**Commit 8: G4, the states with large retirement rules and federal-tax deductions (AL CO DE GA IL IA ME MS MO NJ SC; US V100).** Eleven rows in one commit (the plan's G4a and G4b; the
rows are independent and the hardest mechanisms are all in this group). Three small mechanism extensions came first, each with hand-computed cases in `tests/state_mechanisms.js`:
- the federal-tax deduction's `phase` now says what the AGI share scales: `basis: 'cap'` (Oregon-style, the cap shrinks) or `basis: 'tax'` (Missouri, only a share of the tax counts, then the cap);
- a retirement tier's cap may be a number or an amount per filing column (New Jersey: $75,000 single, $100,000 joint);
- credit kind `propertyTaxShareCredit` (a flat share of the property tax paid, lost above an AGI limit by column: Illinois' 5%).
Source status (P = document read, S = secondary; every unverified figure is in the backlog row below):
- **Alabama (P: the Department of Revenue's 2025 standard deduction chart, the Form 40A exemption and dependent charts and its federal tax deduction worksheet, all read).** The standard deduction by income
  becomes a `stepDown` per column; the federal tax deduction is an 'itemized' deduction (replaces the standard deduction when larger; the worksheet also adds the NIIT, which the planner leaves out);
  defined-benefit pensions are exempt and IRA/401(k) taxed (P: the form booklet); a $6,000 retirement exclusion at 65 and a "qualifying senior" deduction appear in search excerpts but their rules were not
  confirmed, so neither is modeled.
- **Colorado (P for the caps and the Social Security rule: the 2025 Form 104 instructions via search excerpts, and the General Assembly's bill pages; S for the 4.4% rate and the conformity points).** The
  2026 rule: $20,000 (55-64) / $24,000 (65+) per filer; the cap-removal bills SB25-136 and HB26-1062 were postponed indefinitely, so the caps stay (a Legislative Council forecast describes the bill as if
  enacted; it is not). The shared bucket is the working reading from the worklist (backlog). Social Security is the first row of kind `ageAgiTiered`.
- **Delaware (P: the General Assembly's House Substitute for House Bill 13 and Division of Revenue instruction excerpts).** New 2026 brackets (2.175% ... 6.95%), $110 credits (60+ extra), $2,000 / $12,500 exclusion.
- **Georgia (P: the Department of Revenue and the governor's press release on House Bill 463).** 4.99% for 2026 (the 0.1-point annual cuts depend on revenue; left out), standard deduction $15,000 / $30,000, retirement
  exclusion $35,000 at 62-64 and $65,000 at 65+, rising to $70,000 at 65+ in 2027 (a scheduled change). The $4,000 dependent exemption and the 62-64 amount are S.
- **Illinois (P: Bulletin FY 2026-15 for the $2,925 exemption).** 4.95%, retirement income and Social Security exempt, 5% property tax credit; the $1,000 extra exemption at 65 is current law (a $2,000 figure in a bill
  excerpt was not confirmed).
- **Iowa (P: Department of Revenue pages and the 2025 IA 1040 instructions).** Flat 3.8%; federal deduction and senior deduction; all retirement income excluded from 55; $40 / $20 credits.
- **Maine (P: the 2026 rate schedule, read; pension deduction amounts from search excerpts).** 2026 brackets, the new 2% surcharge, deduction $15,700 / $31,400, exemption $5,300, pension deduction $49,824 less benefits received.
- **Mississippi (P: HB 1 as sent to the governor).** 4% above $10,000 in 2026, stepping to 3.75 / 3.5 / 3.25 / 3% (unconditional through 2030; later cuts conditional and left out). The standard deduction, exemptions and retirement rule are S/the worklist.
- **Missouri (P: Department of Revenue pages and RSMo 143.171; the HB 798 flat-rate version was not enacted, the 2026 withholding table still has eight brackets).** All capital gains subtracted from 2025 (House Bill 594);
  Social Security exempt at 62+; the federal tax deduction at 35% / 25% / 15% / 5% of the tax by income, capped $5,000 / $10,000; the private pension exemption shrinks over $25,000 / $32,000 (six steps approximate the dollar-for-dollar cut).
- **New Jersey (P: the Division of Taxation's exclusion page; rates S from the 2025 NJ-1040 excerpt and the migrated row).** Rates unchanged for 2026 (a flat 5.9% bill from 2027, S3311, is only introduced).
- **South Carolina (P: Department of Revenue page and bill text of H. 4216, read).** 1.99% / 5.21% (597 + 5.21% over $30,000), the SCIAD with its linear phase-out ranges (7C worklist: the "upper end not read" is now read: $95,000 single, $142,500 head of household, $190,000 joint), earned income credit
  cap $200 (not modeled); the 44% gains deduction, the $3,000 / $15,000 retirement and age deductions (the age deduction absorbs the retirement deduction) and the $4,930 dependent exemption are the statutes (S).
**Timing.** The rows that deduct federal tax pay for the extra federal pass the plan predicted (`tests/bench_runs.js --scale 3 --repeats 3`, 1,200 simulate + 360 historical, ms, previous commit -> this one): AL 1,232 -> 1,779 (+44%) and 244 -> 341 (+40%),
MO 1,163 -> 2,174 (+87%) and 251 -> 394 (+57%; Missouri also pays for the federal-conformity calls); TX, CA unchanged within noise. The +5% gate is met for every other state; for the lagged rows it is exceeded as a stated cost, to
be revisited if it hurts the optimizer (a cache keyed on the profile would remove most of it). Oregon and Montana will pay the same.
**Tests.** `tests/state_7d_households.js` now has 36 states; the households carry the hand-worked federal income tax (6,962 retiree, 6,975 family) for the rows that deduct it. `tests/tax_brackets.js`: its literal checks for NJ, CO, IL and GA moved to the
exemption/conformity-adjusted values. No snapshot scenario uses these states: 0 moved.

**Commit 9: G5 (MD MI MN MT OR VT WI).** Two small mechanism extensions came first (cases in `tests/state_mechanisms.js`): `base.gainsRate` may be an array, one rate per
ordinary bracket applied to the gains stacked on top of the ordinary income (Montana); an `exemptionPhaseOut` step may differ by column (Maryland). The MD and IN selector labels now say the county tax is included.
Source status (P = document read, S = secondary; unverified figures are in the backlog row):
- **Maryland (P: the Comptroller's tax alert for the 6.25% / 6.5% brackets and the $3,350 / $6,700 standard deduction).** Pension exclusion, exemption phase-out steps by AGI (approximated by steps) and the common county rate 3.2% (owner decision) are S.
- **Michigan (P for the 2026 retirement deduction $67,610 / $135,220; S for 4.25% and the exemption).**
- **Minnesota (P for the 2026 brackets and the Social Security thresholds, 2025 amounts used where 2026 were not found).** The subtraction is 10% lost per $4,000 over the threshold.
- **Montana (P: HB 337).** 4.7% / 5.65% in 2026, 4.7% / 5.4% from 2027 (scheduled); gains 3.0% / 4.1% stacked. **Correction:** an earlier worklist guess said Montana deducts federal tax; it does not (it starts from federal taxable income), so Montana pays no lagged pass.
- **Oregon (P for the 2026 brackets and the 2025 standard deduction; the federal-tax cap and phase-out step table are from memory: S).** The kicker is not modeled.
- **Vermont (P: the 2025 schedules; asOf 2025).** 2026 amounts were not yet published.
- **Wisconsin (P: Form 1 instructions; 2025 brackets from the table's constants).** The sliding standard deduction is approximated by a straight line (a visible approximation, off by under about $60 of tax in the test households); new $24,000 subtraction at 67+.
**Timing** (same benchmark; previous commit -> this one, ms for 1,200 simulate / 360 historical, median of 3): TX 892 -> 910, CA 1,501 -> 1,604, MD 1,359 -> 1,593, MT 1,338 -> 1,571, OR 1,375 -> 2,107 (+53%; the lagged federal pass, as predicted). MD and MT sit at +17%. **Correction after G6:** the DC measurement below shows the same +16% for a row that conforms to the federal standard and senior deductions, so MT's +17% is the federal-conformity calls (as for MO, ID, MT), not noise; MD's +17% is unexplained and is re-measured in the final run.
**Tests.** `tests/state_7d_households.js` now has 43 states. `tests/tax_brackets.js`: the WI literal moved (straight-line approximation), the jump invariant allows exemption phase-outs and the Oregon-style cliff credit, and the plain-table check needs at least one state.

**Commit 10: G6 (NM, DC), the last two rows.** Mechanisms first (cases in `tests/state_mechanisms.js`): exemption phase-out kind `linear`; dependent exemption `afterFirst`; senior exemption phase-out with a per-column rate and a federal-AGI basis; credit kind `childStepCredit`.
- **New Mexico (P: PIT-ADJ 2025 instructions, PIT-1 2025 instructions and PIT-RC 2025 instructions, all read with pdftotext; brackets S: tax-site summaries).** The Social Security exemption (federal AGI under $100,000 single / $150,000 joint or head of household, else the taxable benefits), the age-65 exemption table (up to $8,000 per filer, falling $1,000 per $1,500 single / $3,000 joint of federal AGI; modeled as a straight line, the table cliffs at $28,500 / $51,000), the low- and middle-income exemption worksheet, the $4,000 deduction for each dependent beyond the first, the $2,500 gains deduction (the 40% deduction is for a New Mexico business sale only) and the Child Income Tax Credit table ($637 ... $26; 2025 amounts used for 2026 and indexed). The standard deduction is the federal one, line 12 of Form 1040 (with the 65+ add-on, without the new senior deduction, which is a Schedule 1-A line); whether New Mexico decoupled from the 2025 federal increase for 2026 was not checked.
- **District of Columbia (S: Office of Tax and Revenue pages and a news summary of the 2026 budget act).** Rates unchanged (4% to 10.75%); rolling conformity: the 2025 booklet shows $15,000 / $30,000 / $22,500 (decoupled), the 2026 budget decouples only business provisions and the non-itemizer charitable deduction, so 2026 uses the federal standard deduction, 65+ add-on and senior deduction. The old $3,000 pension exclusion at 62 was repealed. A $1,000 refundable child credit from 2026 for AGI up to $55,000 / $70,000 (a hard cutoff here).
**Timing** (same benchmark, previous commit -> this one, ms for 1,200 simulate / 360 historical): TX 919 -> 943 (+3%), CA 1,381 -> 1,447 (+5%, an unchanged row), NM 1,413 -> 1,459 (+3%), DC 1,255 -> 1,458 (+16%; the federal standard deduction and senior deduction are computed on every call, as for the other conforming rows). Open item: cache the conformity deduction per (filing, year, ages) if the final full-table run shows it matters.
**Tests.** `tests/state_7d_households.js` now has 45 states, i.e. every jurisdiction but the six reference states (NM 1,910.55 / 3,639.60; DC 2,859.75 / 6,883). The linear exemption, the afterFirst rule, the federal-basis senior cut and the child step credit have their own hand-computed cases.

**Commit 11: cleanup.** Removed the household-level retirement kinds (`full`, `shareByAge`, `perEligibleCap`, `perEligibleCapSeniorTier`, `seniorCap`) from the evaluator, the schema test and the generator; removed the `migrated` status, the migrated branch of the treatment note, the 13 hand-written notes and `STATE_TAX_SCOPE_NOTE`; `tests/state_rules.js` now requires every row to be researched with a source; the note under the selector ends with one "Not modeled for any state" line (UI snapshot: the three rendered-text hashes moved, projection and rows hashes and histSuccess unchanged). The plain-table check in `tests/tax_brackets.js` stays for the rows that are still plain tables.
**Full timing gate (all 51 states, 800 simulate + 240 historical, median of 3; branch base -> this branch, simulate ms): the +5% gate FAILS broadly.** Largest: OR 790 -> 1,448 (+83%), MO +79%, CO +57%, MT +45%, KY +44%, MD +43%, IA +40%, NM +39%, NE +39%, OH +37%; about 40 of 51 states are above +5% (flat-rate states +20 to +30%); no-tax states and TX/AK/WY/HI/GA are within noise (noise on a no-tax state reached +12%). The cost is the generic evaluator (per-person sources, per-call conformity deduction, the lagged federal pass), not any one row. Needs a decision before merge: cache the federal conformity deduction and the lagged liability per (profile, year), or accept the cost.

**External review of the 7D research (ChatGPT, 2026-10-05), checked.** The review proposed a status taxonomy and two corrections. Adopted going forward, as labels in the notes and the backlog (several can apply to one state): **P** primary source read, **S** secondary only, **A** intentional approximation or modeling assumption (Indiana 1.77% and Maryland 3.2% county rates; the Wisconsin and New Mexico straight lines; the Missouri six-step pension approximation; the Maryland exemption steps), **O** intentionally omitted (Oregon kicker, Hawaii 7.25% gains cap, Minnesota alternative Social Security method, the NIIT in Alabama's deduction, South Carolina's earned income credit, Rhode Island's high-income phase-out), **U** unresolved (North Dakota 40% gains exclusion, Michigan's 2026-2028 Social Security interaction with the standard deduction, Vermont 2026 amounts, Oregon 2026 conformity, DC's 2026 act text), **C** a claim in these notes was wrong (temporary: becomes P once fixed).
- **Louisiana: confirmed and fixed.** The Department of Revenue FAQ states the additional $1,000 deductions for the blind, persons 65+ and dependents were repealed (read). The row already modeled no exemptions; its note said "unverified" and now says confirmed.
- **Rhode Island: no change needed.** The review says our notes claim the 2026 values were not published. Advisory 2025-22 was already the row's source and the row already uses its 2026 figures (standard deduction $11,200 / $22,400 / $16,800, exemption $5,250, brackets $82,050 / $186,450). What the Advisory does not publish is the 2026 Social Security and pension modification limits (it prints the 2025 limits only), which is the only thing the note says. The $261,000 to $290,800 phase-out is a known omission (label O).
- **Rows the review called "not covered" (CA, CT, NY, PA, WA, TX, FL, NV, NH, SD, TN, WY, AK):** these were researched in 7C and G1, not in this PR's later groups; the review only saw the later commits. No action.
- Everything else in the review (Iowa wording "qualifying retirement income", upgrading remaining S items, Ohio joint-filing credit, Oklahoma HoH) is source tightening for the verification pass, not checked here.

**7D part 2 (state-tax performance), results.** Branch `claude/batch-7d-part2-state-tax-perf`, base `origin/claude/batch-3b-penalty-rules` (7D merge `e45cfe7`). No behavior change: every snapshot, `tests/state_7d_households.js` and `tests/state_reference.js` are untouched and `npm test` is green at every commit. No version badge bump (nothing user-facing).

*What the profile said, and what the plan got wrong.* Two of the three planned optimizations did not pay and were replaced by what the profile showed.
- **Planned 1, a conformity-deduction cache: measured, no gain.** The conforming rows (DC, MT, ID, NM) cost the same as a non-conforming one (IL): about +25% over the 7C base each. A memo inside `standardDeduction` (Map plus 3 slots per filing row, keyed on the index factor) was slower than recomputing (DC 591 -> 627 ms per 500 simulations, interleaved). Not shipped. What the standard deduction (and every other tax call) really pays for is `Math.pow` in `taxIndexFactor`, a fifth of a projection with inlining off.
- **Commit 1 (shipped): remember the plan's index factor.** Shared fragment `06-histTaxFactors` (so Canada gets it): the factor for a whole year index is kept while `state.inflation` is the value it was computed for. Interleaved, 500 simulate: -10% to -14% in every taxing state; the historical path (its own per-run factors) is unchanged. `tests/tax_caches.js` compares it with `Math.pow` bit for bit (inflation changes, fractional and out-of-range indexes, both orders, after a historical run).
- **Planned 2, a cache of the lagged federal pass: measured, no gain; replaced.** 231,000 lagged calls per 100 simulations in OR; a 1-slot memo would hit 46%, a 4-slot 61%. A 4-slot memo of the whole federal pass (ordinary tax, gain tax, child credits; keyed on status, year, index factor, incomes, deduction, earned income and the dependents list by identity; the main pass reuses the lagged pass's entry when the state tax does not change the itemizing choice) cost as much to look up as the pass costs to compute: interleaved c1 vs c2, within noise in every state, and equally with the next commit under it. Not shipped. **Commit 2 (shipped instead): `drawTaxable`'s bisection computed `taxFor(profile, priorGains, priorTraditionalExtra)` on every one of its 25 probes, the same value each time.** It is computed once (shared fragment `drawTaxable`, Canada too). `taxFor` calls per OR simulation fell by about half in the biggest loop; this one change took the standard path from +45% to about the base in OR/MO/AL and to -25% in the flat-rate states. The other solvers (`solveTraditionalForNet*`) already hoisted theirs.
- **Commit 3 (shipped, planned 3): state inputs only for the rows that read them.** `compileRow` sets `needsPerPerson` (a per-person retirement kind, or the age-and-AGI-tiered Social Security kind; 23 rows, covering scheduled variants); `taxFor` fills four shape-stable scratch objects (`SOURCES_JOINT/SINGLE/A/B`) instead of allocating an object and three arrays per call, writes the per-person fields only when flagged, and looks the rule up once instead of three times. Another 5% to 12% on the standard path. A micro-step tried on top (scratch ages arrays for the federal deduction calls and a scratch credit context) gained under 3% and was not kept.
- **Guards.** `tests/tax_caches.js` (in `npm test`): the index factor against `Math.pow`, and 51 states x 9 one-input changes (single person, filing status, children, retired both, one income, survivor in both directions, Roth conversions) in both engines with the compiled flags against every row forced on, `Object.is` on every number, plus a pin of which rows carry the flag. Negative controls run: forcing every flag off fails 151 of 459 projections; a stale-hit memo fails the direct test.

*Timing method and its limit.* Wall-clock noise between runs on this machine is +/-10% (a no-tax state read +12%, and in the final sequential run FL read +27% while TX read -28%). Decisions were taken from `cmp`-style runs: both trees loaded in separate pages of one browser, 500 simulate + 150 historical per round, 7 rounds interleaved, median. The records below are those, plus the requested `tests/bench_runs.js` runs (scale 3 per commit on a subset, scale 2 final) for the reader who wants the plan's tool.

*Per-commit subset (interleaved, 500 simulate / 150 historical, ms; 7C base -> 7D tip -> after each commit).*

| state | base | 7D tip | commit 1 | commit 2 | commit 3 |
|---|---|---|---|---|---|
| DC | 464 / 97 | 620 / 128 | 528 / 126 | 394 / 116 | 351 / 98 |
| MT | 452 / 92 | 593 / 113 | 522 / 118 | 395 / 105 | 351 / 94 |
| ID | 437 / 90 | 576 / 112 | 491 / 115 | 360 / 100 | 326 / 89 |
| NM | 456 / 91 | 599 / 122 | 543 / 121 | 373 / 104 | 341 / 96 |
| OR | 476 / 96 | 835 / 159 | 720 / 162 | 509 / 139 | 474 / 127 |
| MO | 437 / 91 | 787 / 156 | 688 / 161 | 489 / 137 | 466 / 130 |
| AL | 451 / 92 | 706 / 139 | 635 / 146 | 463 / 123 | 436 / 118 |
| IL | 445 / 91 | 574 / 125 | 549 / 124 | 395 / 109 | 367 / 99 |
| IN | 430 / 88 | 498 / 106 | 466 / 107 | 338 / 96 | 303 / 85 |
| PA | 477 / 102 | 579 / 122 | 535 / 123 | 406 / 111 | 353 / 98 |
| MI | 454 / 92 | 545 / 111 | 490 / 113 | 368 / 99 | 328 / 90 |
| UT | 463 / 94 | 592 / 122 | 558 / 129 | 388 / 110 | 356 / 100 |
| TX | 306 / 68 | 317 / 74 | 278 / 72 | 217 / 67 | 219 / 63 |
| MA | 455 / 93 | 605 / 123 | 536 / 122 | 412 / 113 | 353 / 98 |

(The per-commit rows come from several runs, so a base figure drifts by a few percent between columns; the delta between neighbouring columns of one run is what is meant. These subsets only show direction; the 51-state run is the acceptance test.)

*Acceptance run, all 51 states, `--scale 2` (800 simulate + 240 historical, median of 3), against `2136d7b`.* Sequential runs on the same machine, base run twice around the tree run (base first 20 minutes before, again after): the two base runs differ by up to 40% in a state (AR 1253 vs 791), so the sequential numbers are not used for the verdict. The interleaved 51-state comparison (7 rounds, same process) is the verdict:
- **Standard projection (`simulate`): all 51 states at or below the base; the worst are MO and OR at +3%** (inside the +5% gate and the noise); the median state is -27%; the no-tax states are -30% (shared fragment gains).
- **Historical backtest/Monte Carlo (`simulateHistorical`): 31 states within +5%; 20 above:** AL +26%, MO +41%, OR +37% (the three rows that deduct federal income tax: the lagged federal pass runs on every probe of the bucket strategy's `solveTraditionalForNetFromNeed`, 832 calls per run, and the 7D rows for these states are genuinely heavier than the old code); NM +14%, OH +14%, IL +13%, KY +13%, DC +11%, DE +10%, CO +9%, IN +9%, RI +9%, NE +8%; AZ, AR, IA, MD, ID, UT, WI +5% to +6%. The remaining historical cost sits inside `stateIncomeTax` itself (OR: 255 ms against 121 ms in the base per 1,500 runs, profiled with inlining off) and in the lagged pass; reducing it further would need the evaluator or the solver restructured, not a cache (two cache designs were measured and did not pay). **Recorded as the remaining overrun.**

*Heavy paths and slider latency, per state, once (`tests/bench_heavy.js`: median of 5 slider moves after a 0.9 s settle, MC 100 paths seeded, per-year Roth optimizer once; 7C base -> this branch, ms).* All 51 states run on both trees. Slider move with every card closed: median ratio 0.89 (VA worst at 1.13, one state over 1.05); with the tornado card open: 0.88 (AL 1.21, 2 states over); **with every results card open: median 0.86, worst IA 1.07, 1 state over 1.05**. Spot states (all cards open): TX 55 -> 33, MA 45 -> 43, OR 48 -> 48, MO 45 -> 46 (the 7D tip was about 80 ms in most states and 161 ms in MO, so the slider is back at or under the base everywhere). Monte Carlo (100 paths, single shot, noisy): median 0.93; 15 states above 1.05, as the historical table predicts (a 300-path repeat: OR 272 -> 338, MO 265 -> 335, IL 260 -> 258, TX 202 -> 196, MA 856 -> 620 for base -> branch). Per-year Roth optimizer: median 0.84, 6 states above 1.05 (worst MO 322 -> 385).

*Method notes for the next performance batch.* (1) inlining hides the cost: profile with `--js-flags=--no-turbo-inlining` and read absolute milliseconds, not percentages, between trees; (2) count the calls before building a cache (231k lagged calls looked cacheable, and the cheaper fix was to stop making the duplicate call two levels up); (3) a memo must beat the work it replaces by a clear margin, and with these functions (a few dozen floating-point operations) a 4-slot lookup does not; (4) `tests/bench_runs.js` alone cannot settle a +5% question here: use an interleaved comparison. `tests/bench_heavy.js` and `tests/tax_caches.js` are new; CLAUDE.md records both and the rules above.

#### 7J: Canadian federal age amount and pension income credit (Canada V39 -> V40; US untouched)

Branch `claude/batch-7j-canada-age-credits`, cut from `origin/claude/batch-3b-penalty-rules` at the 7D part 2
merge (`a123c45`).

**Verified 2026 figures** (retrieved 2026-10-05)
- Indexation adjustment page, CRA ("Indexation adjustment for personal income tax and benefit amounts",
  canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html):
  brackets start at $58,523 / $117,045 / $181,440 / $258,482 (the code already had these); basic personal amount (BPA)
  maximum **$16,452** for net income up to the 29% threshold ($181,440), minimum **$14,829** from the 33% threshold
  ($258,482), the $1,623 difference phasing out linearly between them; age amount **$9,208**, net income threshold
  **$46,432** (2.0% indexation). Cross-checked on the 2026 bracket and BPA figures in CTV / BNN Bloomberg (CRA release, 2025-12-01).
- Age amount reduction rate **15%** of net income over the threshold: Income Tax Act s. 118(2) (statutory, not
  restated on the indexation page).
- Pension income amount: **$2,000** federal maximum, not indexed; CRA line 31400 page (2025 version; the amount is
  statutory in s. 118(3)). The same page says RRIF and RRSP income at 65+ qualifies (employer pension annuities at any
  age; RRIF/RRSP only from 65), CPP and OAS never do.
- Credit rate: 14% (the lowest bracket rate for all of 2026), already the first bracket in `federalTaxCA`.
- Not re-verified because it is unchanged by this step: the provincial amounts (7K).

**What changed**
- `personTaxCA(ordinary, gains, yearIndex, dtcBase, age, pensionIncome)` takes the person's age and eligible
  pension income (both default to 0, so a caller that passes neither, including the tests' older calls, gets an
  under-65 result with no pension). `ageAndPensionCreditBase` returns the credit amount; `federalTaxCA` takes it as
  `extraCreditBase` and subtracts 14% of (BPA + that), floored at zero. Quebec: the credits come off the federal tax
  before the 0.835 abatement, like the dividend credit. No allocation was added (two scalar arguments; the credit
  work is skipped when age < 65 and there is no pension).
- **BPA fix (owner decision, 2026-10-05: "can you fix it").** The old code subtracted a BPA of $14,829 from income
  *before* the brackets, which is a deduction at the marginal rate, not a 14% credit, and $14,829 is the *minimum*
  BPA, so the old comment ("the full BPA is used") was wrong. It now takes the credit at 14% and phases the BPA from
  $16,452 to $14,829 over $181,440-$258,482 (keyed on net income). Effect: about -$227 a year for anyone with income
  under the second bracket, and +$0.7k to +$2.8k for incomes of $80k to $300k (the old deduction was worth the
  marginal rate times $14,829). Provincial BPAs are still deductions at the marginal rate (7K).
- `solveMeltdown` (RRSP ladder): the old target was `bracket ceiling + BPA` because the BPA was a deduction. Credits
  no longer move the brackets, so the target is the bracket ceiling itself (taxable income = income). The age and
  pension credits do not change it.
- `buildTaxProfile` adds `penA`/`penB`: each person's eligible pension income after the split transfer (employer
  pension at any age, RRIF at 65+; the survivor remap carries the survivor's own). `taxFor` adds, at 65+, that
  person's half (or all, single) of the discretionary RRSP/RRIF draw as RRIF income (owner decision: count it).
  A profile without `ageA`/`penA` (the older literals) reads as under 65 with no pension.
- `solvePensionSplit` now passes ages and the transferred pension income, so the split sees both credits. Because
  the age-amount clawback makes combined tax non-convex for a 65+ filer (flat plateaus with narrow dips), a plain ternary
  search can end in the wrong place. When either partner is 65+ it first scans 48 cells across the transfer range,
  refines inside the best cell (20 iterations), and also tries the equal-income transfer (where the narrow dip often is),
  returning the cheapest. Under 65 the original 40-iteration ternary search is untouched, so those results are byte-identical.
  Measured against a $50 brute-force scan over 360 households with a 65+ partner (ages 70 / 68, Ontario): end points only
  (first version) 20 of 360 worse than the scan, worst $144 a year; grid of 24 cells 13, worst $144; grid of 48 cells plus the
  equal-income candidate, 9 worse, worst $1.89 a year (total $7.87 over all 360). Cost with pension splitting on
  (200 `simulate()`, interleaved, median of 7): 563 ms before the grid, 584 ms after (+4%); a 96-cell grid with 40 iterations was
  +86% and was rejected. The split itself is the dominant cost of a split-enabled run (about 6x a run without it), which predates 7J. `window.__test_tax` now exports `solvePensionSplit`.

**Simplifications (named)**: net income for the clawback is the person's own income after the split, with the 50%
gains inclusion and grossed-up dividends, and the OAS recovery tax is not deducted from it (CRA does); the age amount
uses the tax year's whole-year age rule (age on December 31 is not tracked: the engine's age in the year); provincial
age and pension amounts are not modeled (7K); the pension amount counts whatever the engine calls RRIF income at 65+, even
a lump-sum RRSP withdrawal (CRA allows that at 65+); a spouse's unused age amount transfer is not modeled.

**Before / after, one filer, Ontario, today's dollars, tax in dollars** (`personTaxCA`; the "65+ with pension" columns
use age 66 and eligible pension income of the smaller of income and $30,000; the "under 65" column is the BPA fix alone)

| Income | Before | After, under 65 | Change | After, 65+ with pension | Change |
|---|---|---|---|---|---|
| $20,000 | 1,078 | 851 | -227 | 354 | -724 |
| $30,000 | 2,983 | 2,756 | -227 | 1,187 | -1,796 |
| $50,000 | 7,154 | 6,926 | -227 | 5,432 | -1,721 |
| $80,000 | 14,078 | 14,815 | +737 | 13,951 | -128 |
| $120,000 | 26,463 | 27,362 | +899 | 27,082 | +619 |
| $200,000 | 59,357 | 61,451 | +2,095 | 61,171 | +1,815 |
| $300,000 | 107,236 | 110,053 | +2,818 | 109,773 | +2,538 |

Engine level: every Canada scenario in the snapshot grid moves from year 0 (working-age tax up about $1.5k on the
default household, which is in the second bracket; 65+ rows down by roughly $3k to $9k a year by the late 70s, partly
through the path: lower tax leaves more in the accounts). Example, `std default fhsa`: year 0 tax 39,466 -> 40,940,
age 68 22,711 -> 19,400, age 78 20,319 -> 13,201, age 88 23,604 -> 14,670; final investable 1,518,380 -> 2,316,535.
Intended baseline change: `tests/snapshots/canada.json` (every scenario; the grid-plus-refine split search then moved 25 more, all pension-splitting scenarios, by small amounts) and `tests/snapshots/ui_canada.json` (the
rendered-text hashes; control count, MCP schema and state hashes unchanged). US snapshots byte-identical.

**Timing** (Canada, interleaved same-process, 300 `simulate()` per round, median of 7, previous commit's file vs
this one): 126 ms -> 123 ms (ratio 0.98), within noise. No `bench_runs.js` run: that gate is US-only (state tax).

**Tests.** `tests/tax_brackets.js` (Canada section) rewritten for the credit form with hand-computed literals: federal at $100k
(14,392.725), at the BPA, at $181,440 and $258,482 and in the middle of the phase-out; every bracket edge against an independent
reference; age amount at $40k (2,007.60 federal), $60k (5,188.533, partly clawed back) and $120k (equal to under 65);
the pension credit capped at $2,000 and below the cap; age amount plus pension; the zero floor; indexing (age amount
and threshold scale, pension amount does not); monotone and cliff-free in every province at 66 with a pension; Quebec
abatement after the credits; `taxFor` per-person ages and pension, the RRSP-draw rule at 66 and at 60, a profile with no ages;
and `solvePensionSplit` on four 65+ households against a $250 grid, plus the 360-household regret bound (under $3 a year against a $50 scan). The dividend-credit literal moved from 13,252.5707 to
13,989.2357 (the BPA change). `tests/historical_tax_indexing.js`: Canada's tolerance is 3e-3 instead of 1e-6, because the
$2,000 pension amount is not indexed (a 65+ filer's real tax drifts with inflation by that much).

**Gotchas**
- Sandbox: a quoted bash heredoc containing an apostrophe in the body failed to parse here; write edit scripts with the
  file tool instead.
- The BPA, as a deduction, was baked into `solveMeltdown` and `federalBracketCeilingCA` callers; any future code that
  needs "income where the next bracket starts" for Canada should use the bracket cap directly.
- Provincial tax deducted its BPA at the marginal rate when this was written; 7K converted it (see the 7K notes).

### 7K notes: provinces (Canada V41)

Three commits and one docs commit on one branch (`claude/batch-7k-provinces`, base `claude/batch-3b-penalty-rules` at the 7J merge 44af361):
1. `PROVINCE_RULES` table, provincial credits at the lowest rate, generated `docs/province-tax-rules.md`;
2. the pension income amount counts an RRSP/RRIF draw from 71, not 65 (a correction to 7J);
3. Quebec's pooled amounts, QPP and QPIP (its own commit, owner decision).
US snapshots byte-identical; Canada snapshots changed by intent (every scenario in commit 1, a few in commit 2, one Quebec scenario in commit 3).

**Owner decisions in this step (2026-10-05)**
- Quebec: its own commit inside this PR (the plan said both "its own commit" and "its own PR").
- Non-eligible Canadian dividends: not built, no new input. They stay taxed like interest (as foreign dividends are), a named gap; they come mostly from private-company shares, so a household that owns a corporation is the only likely case.
- Where a figure could only be found on a secondary source, use the best secondary value and flag it in the table and the backlog.
- Paid benefits (Ontario Trillium Benefit, BC and Alberta family benefits, Quebec solidarity credit and work premium) are 7L, not here.
- RRSP withdrawals and the pension amount: fix it in 7K (see commit 2).

**What changed**
- `PROVINCE_RULES[code]` (inside `// PROVINCE_RULES:begin` / `end`, pure literals): per province `creditRate` (the lowest bracket rate), `brackets`, `bpa` (amount, optional phase-down to a floor), `age` (amount, threshold, 15% reduction rate, optional supplement), `pension` (maximum), `pooled` (Quebec only), `payroll` (CPP or QPP rate, Quebec's QPIP premium), `dividend.eligible`, Ontario's `surtax` and `healthPremium`, an explicit `indexing` object (`bracketsIndexed`, `bpaIndexed`, `ageAmountIndexed`, `pensionAmountIndexed`, `surtaxIndexed`) and a `verified` object (primary or secondary, per family). `compileProvince(code)` splits the brackets into flat arrays once per code; `provincialTaxCA` allocates nothing (the old code built a scaled bracket array on every call).
- `scripts/gen-province-rules.js` writes `docs/province-tax-rules.md` (`npm run gen:provinces`); `npm test` runs it with `--check` and runs `tests/province_rules.js` (coverage: 10 provinces, every field present and typed, brackets increasing, credit rate equals the lowest bracket rate, only Ontario has a surtax and premium, only Manitoba a BPA phase-down, only Quebec the pooled amounts).
- Provincial amounts are credits at the province's lowest rate, floored at zero, instead of deductions at the marginal rate. Manitoba's BPA phases down linearly from $15,780 at $200,000 net income to nil at $400,000 (CRA T4127; Manitoba Income Tax Act per the second review, not fetched).
- Age amount (65+): amount reduced by 15% of net income over the threshold (every province's figures satisfy `amount = 15% x (eliminated at - threshold)`, checked), plus Saskatchewan's $2,569 senior supplement (not income tested). Pension amount: the first dollars of eligible pension income up to the province's maximum ($1,000 most provinces; AB $1,753, NS $1,173 and ON $1,796 are indexed; the $1,000 ones are flat).
- The federal and provincial dividend credits are floored against their own tax (before, one combined floor); Ontario's surtax is computed on Ontario tax after non-refundable credits and before the dividend credit, which is the order on form ON428 (verified from the form text: line 62 tax, surtax on line 65, dividend credit subtracted on line 70), so the old "not recomputed after the credit" simplification was in fact correct and is now documented as the rule.
- **Bug fix found in review (pre-existing, carried into the first 7K commit):** Ontario's second surtax tier was coded as 16% over $7,446; the statute and form ON428 give 20% over $5,818 plus 36% over $7,446 (both apply above the second threshold, a 56% surtax on the top slice; the top Ontario combined rate of 53.53% only works with 36%). Corrected to 36% in the table (`surtax.secondRate`), with the $200,000 test literal recomputed (22,586.7826 -> 24,655.1918). Moves Canada tax for Ontario households whose Ontario tax passes $7,446 (roughly taxable income over $120,000). Cited in the 7K review: CRA T4127 2026 Ontario table and form ON428 (the excerpt read here shows 20% over the first threshold and 36% over the second).
- The Ontario Health Premium is now computed on taxable income. The old code fed it income *less the BPA* (an artifact of the deduction form), which understated it near each step.
- `personTaxCA(ordinary, gains, yearIndex, dtcBase, age, pensionIncome, familyIncome = null)`; `provincialTaxCA(income, yearIndex, dtcBase, age, pensionIncome, familyIncome)`. `familyIncome` is only read by Quebec: a number for a couple (both spouses' net income, built in `taxFor` and in `solvePensionSplit`, where it does not move with the transfer), `null` for a single filer or survivor (own income, lives alone).
- `cppContribution` reads `payroll` from the province row: QPP 6.30% and the 0.430% QPIP premium up to $103,000 for Quebec wages (the 4% second tier and $74,600 / $85,000 / $3,500 figures are shared).
- Callout and notes corrected: the "Tax treatment" callout and the province note under the selector no longer say provincial credits or dividend credits are not modeled; they list what is (BPA, age, pension, dividend credits) and what is not.

**Commit 2: the pension amount and RRSP draws (correction to 7J).** 7J counted a discretionary RRSP/RRIF draw as RRIF income from 65 ("CRA allows a lump sum at 65+"). CRA's line 31400 page says RRSP income qualifies only as an annuity payment (or on a spouse's death or as split-pension income), not as a withdrawal. The planner converts the RRSP to a RRIF at 71 (`rrifMinPct` is zero before it), so the draw earns the federal and provincial pension amounts from `RRIF_PENSION_AGE = 71`. Employer pensions still qualify at any age, the mandatory RRIF minimum from 71 (it was already zero before 71). Effect: ages 65 to 70 with a discretionary draw owe a little more (the pension amount is $2,000 federal at 14% plus the province's, about $300 to $400 a year).

**Verified 2026 figures** (retrieved 2026-10-05; P = primary page read by this session, S = secondary or relayed)
| Item | Value | Source |
|---|---|---|
| Brackets and BPA AB, MB, NB, NS, ON, PE, SK, BC (except the BC rate) | as in the table | P: CRA T4127 122nd ed. (Jan 1, 2026), https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html |
| BC lowest rate 5.60% (CRA T4127 still shows 5.06%, a stale payroll rate) | 5.60% | P: https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates (page dated 2026-04-17) |
| Manitoba: BPA 15,780, nil at 400,000; brackets 47,000 / 100,000, not indexed | | P: CRA T4127 |
| Nova Scotia BPA at its maximum at every income (no phase-down in 2026) | 11,932 | P: CRA T4127; https://www.novascotia.ca/personal-income-tax-rates-and-indexation (age amount 5,826, indexation 1.6%) |
| PEI brackets 33,928 / 65,820 / 106,890 / 142,520 (the code had 142,250: corrected) and BPA 15,000 | | P: CRA T4127 |
| Saskatchewan: BPA 20,381, age amount 5,901 (threshold 43,927), senior supplement 2,569 (65+, claimable with a nil age amount), pension 1,000, spouse 20,381, dependent child 8,358 | | P: https://www.saskatchewan.ca/residents/taxes-and-investments/personal-income-tax/2026-personal-income-tax-structure |
| Quebec: indexation 2.05%, brackets 54,345 / 108,680 / 132,245, BPA 18,952, age 3,986, retirement income 3,541 (lesser of that and 1.25 x qualifying income), living alone 2,172 (single-parent supplement 2,681), reduction threshold 42,955 and rate 18.75% | | P: Revenu Quebec form TP-1015.3-V 2026 (owner-supplied PDF) and Finance Quebec, "Parameters of the Personal Income Tax System for 2026" (Nov 2025), Table 3, https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/finances/publications-adm/parametres/AUTEN_IncomeTax2026.pdf |
| Pension income amount: RRIF income qualifies at 65+ (any age on a spouse's death), an RRSP withdrawal does not; CPP and OAS never; provincial maximums $1,000 except AB, ON (and NS per TaxTips) | | P: https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31400-pension-income-amount.html (2025 amounts shown: AB 1,719, ON 1,762; the 2026 AB 1,753 and ON 1,796 are S) |
| Ontario surtax 5,818 / 7,446 at 20% / 36%; form ON428 orders the surtax before the dividend credit | | P for the order (CRA form ON428 text, 2023 thresholds in the excerpt); S for the 2026 thresholds (TaxTips; second review cites CRA ON payroll table) |
| Provincial age amounts and thresholds (all but SK, NS), spouse amounts, pension amounts for AB, ON, NS | as in `docs/province-tax-rules.md` | S: https://www.taxtips.ca/nrcredits/tax-credits-2026.htm (also shown by KPMG 2026 PDF, not readable here) |
| Eligible dividend credit rates (all ten) | unchanged from the code | S: https://taxtips.ca/dtc/eligible-dividends/eligible-dividend-tax-credit-rates.htm; Ontario 10.0% also stated on the Ontario page per the second review (not fetched) |

**Quebec resolved from the primary form (owner supplied the PDF, 2026-10-05).** Revenu Quebec form TP-1015.3-V (2026-01), Work Chart 2 and the line 6 and line 80 instructions, plus a screenshot of the "Principal changes for 2026" page (https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/employers-principal-changes-for-2026/, which returned 403 to the session) confirm: age amount $3,986 per person 65+, living alone $2,172, retirement income maximum $3,541, reduction threshold $42,955 and rate **18.75%** of estimated net family income (both spouses), brackets and the 2.05% indexation. Two corrections came out of reading it, both fixed in the follow-up commit: (1) the retirement-income amount is the **lesser of $3,541 and 1.25 times** the qualifying retirement income ($2,000 gives $2,500; the code had the pension income itself); (2) for a couple the two spouses' amounts are **added and reduced once** by the family-income reduction (lines 85 to 98), not each reduced separately, which had understated a couple's credit. Each spouse now takes a share of the reduced pool in proportion to their own amounts (`partnerPool` argument; a spouse's unused-amount transfer is approximated by that split). (The form also states ceilings of $91,872 of family income for a couple and $66,027 for a single filer above which the amounts cannot be claimed; they are not reproduced by this pooled formula, so the planner may allow a small credit above them: backlog.)

**Verification backlog (7K)**
- QPP 6.30% from $3,500 to $74,600, 4% second tier to $85,000, and QPIP 0.430% up to $103,000 (employee maximums $4,479.30, $416 and $442.90; employer QPIP 0.602%): relayed from a review, which cites the Act respecting the Quebec Pension Plan (CQLR c. R-9, ss. 44 to 44.3 and 50; the second additional rate is 8% shared, so 4% for the employee) and the Act respecting parental insurance (CQLR c. A-29.011, s. 6: the rate is set each year by regulation of the Conseil de gestion de l'assurance parentale, so the Act itself does not state 0.430%). The code already implements this structure (the two ceilings are independent). Not read on a primary page: LegisQuebec returned HTTP 403 to this session. Needs the Revenu Quebec 2026 contribution table or the regulation.
- Newfoundland and Labrador BPA: $11,188 for January to June and $15,000 from July 1, 2026 (T4127 and budget summaries); the $13,094 time-weighted figure the code uses is relayed (TaxTips and the second review), not read on an NL Finance page. $15,000 is the full-year amount from 2027 (not modeled).
- PEI top bracket: the CRA payroll table lists 19% above $142,520; EY (updated budget alert) says the new 20% bracket over $200,000 applies from 2026. The code keeps 20%. Needs the PEI Finance page, which blocked automated access (Radware).
- PEI indexing: CRA says no statutory indexing for 2026 (thresholds were raised by hand, 1.8%); modeled as indexed.
- Manitoba age amount and other credit amounts: unindexed per TaxTips (factor 1.000), secondary.
- Dividend credits for the nine non-Ontario provinces: no 2026 provincial Form 428 or statute read; CRA's general page still shows 2025 tables.
- Provincial credit amounts for the age, spouse and pension rows marked S above.
- BC tax reduction: sources disagree on the figures. The CRA payroll excerpt read here gave $575 max, $25,570 threshold, 3.56% reduction rate, nil at $41,722; a review says $690 max, nil at $44,952 (same threshold and rate). Both are internally consistent. Not built; needs the BC428 form or BC page.
- **BC bracket indexation is paused for 2027 to 2030 (open item, not built).** BC Budget 2026 paused the indexation of the tax brackets for the 2027 to 2030 tax years and resumes it for 2031 and later (BC government "Personal income tax rates" page, last updated 2026-04-17, https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates; read from an owner-supplied screenshot, 2026-10-05). The BC row has `bracketsIndexed: true` for every year, so projected BC tax for 2027 onward is slightly too low (thresholds rise when they should be flat for four years). Fixing it needs an optional frozen-year range on an indexing family (the flags are one boolean per family for all years); BC only, a Canada snapshot change. The same page confirms the 2026 lowest rate of 5.60% and all seven brackets (primary). Whether BC's other indexed amounts (basic personal amount, age amount) are also paused is not stated on that page: check.
- Low-income reductions: see "Not built".

**Indexing, per row and family** (`indexing` flags; true scales the family by the plan's `taxIndexFactor`)
- All brackets, BPAs and age amounts indexed, except **Manitoba**: brackets, BPA (and its phase-down range) and the age amount are frozen (statutory freeze, CRA T4127; the age amount per TaxTips).
- Pension amount indexed only for AB, ON and NS (the $1,000 maximum elsewhere is flat), and not for Quebec's pool (indexed with the rest of Quebec's parameters).
- Ontario's surtax thresholds and Health Premium steps are indexed (unchanged from before).
- `tests/historical_tax_indexing.js` (Canada tolerance 3e-3 for the unindexed federal pension amount) passes unchanged: its household is Ontario, whose amounts are indexed or small. No tolerance change was needed.

**Before / after** (`personTaxCA`, today's dollars, tax in dollars, one filer, no gains or dividends; "68, pension" is age 68 with eligible pension income of the smaller of income and $30,000; before = the 7J merge, after = this branch)

| Prov | Income | Before (under 65) | After (under 65) | Change | Before (68, pension) | After (68, pension) | Change |
|---|---|---|---|---|---|---|---|
| ON | 20,000 | 851 | 851 | +0 | 354 | 0 | -354 |
| ON | 40,000 | 4,961 | 5,111 | +150 | 3,392 | 3,131 | -261 |
| ON | 60,000 | 9,017 | 9,417 | +400 | 7,733 | 7,819 | +86 |
| ON | 100,000 | 20,895 | 21,521 | +626 | 20,451 | 20,968 | +517 |
| ON | 200,000 | 61,451 | 62,707 | +1,256 | 61,171 | 62,304 | +1,133 |
| BC | 20,000 | 877 | 877 | +0 | 380 | 0 | -380 |
| BC | 40,000 | 4,797 | 4,797 | +0 | 3,228 | 2,840 | -388 |
| BC | 60,000 | 8,813 | 9,015 | +202 | 7,528 | 7,476 | -52 |
| BC | 100,000 | 20,017 | 20,295 | +278 | 19,573 | 19,795 | +222 |
| BC | 200,000 | 58,245 | 59,650 | +1,405 | 57,965 | 59,314 | +1,349 |
| AB | 20,000 | 497 | 497 | +0 | 0 | 0 | +0 |
| AB | 40,000 | 4,675 | 4,675 | +0 | 3,106 | 2,458 | -648 |
| AB | 60,000 | 9,171 | 9,171 | +0 | 7,887 | 7,392 | -495 |
| AB | 100,000 | 20,892 | 21,347 | +455 | 20,448 | 20,763 | +315 |
| AB | 200,000 | 57,079 | 58,139 | +1,060 | 56,799 | 57,719 | +920 |
| SK | 20,000 | 497 | 497 | +0 | 0 | 0 | +0 |
| SK | 40,000 | 5,357 | 5,357 | +0 | 3,788 | 2,793 | -995 |
| SK | 60,000 | 10,353 | 10,462 | +109 | 9,069 | 8,437 | -632 |
| SK | 100,000 | 23,254 | 23,662 | +408 | 22,810 | 22,843 | +33 |
| SK | 200,000 | 61,959 | 62,774 | +815 | 61,679 | 62,119 | +440 |
| MB | 20,000 | 952 | 952 | +0 | 456 | 0 | -456 |
| MB | 40,000 | 5,912 | 5,912 | +0 | 4,343 | 4,031 | -312 |
| MB | 60,000 | 10,968 | 11,222 | +254 | 9,684 | 9,830 | +146 |
| MB | 100,000 | 24,214 | 24,522 | +308 | 23,770 | 23,970 | +200 |
| MB | 200,000 | 66,608 | 67,650 | +1,042 | 66,328 | 67,262 | +934 |
| QC | 20,000 | 561 | 415 | -146 | 147 | 0 | -147 |
| QC | 40,000 | 5,699 | 5,395 | -304 | 4,389 | 3,031 | -1,358 |
| QC | 60,000 | 10,918 | 11,200 | +282 | 9,845 | 9,218 | -627 |
| QC | 100,000 | 24,700 | 25,647 | +947 | 24,329 | 25,276 | +947 |
| QC | 200,000 | 69,655 | 71,882 | +2,227 | 69,421 | 71,648 | +2,227 |
| NB | 20,000 | 1,092 | 1,092 | +0 | 596 | 0 | -596 |
| NB | 40,000 | 5,772 | 5,772 | +0 | 4,203 | 3,530 | -673 |
| NB | 60,000 | 10,548 | 10,901 | +353 | 9,264 | 9,144 | -120 |
| NB | 100,000 | 24,072 | 24,701 | +629 | 23,628 | 24,163 | +535 |
| NB | 200,000 | 65,434 | 66,550 | +1,116 | 65,154 | 66,176 | +1,022 |
| NS | 20,000 | 1,206 | 1,206 | +0 | 709 | 94 | -615 |
| NS | 40,000 | 5,764 | 6,319 | +555 | 4,195 | 4,255 | +60 |
| NS | 60,000 | 11,470 | 12,205 | +735 | 10,185 | 10,690 | +505 |
| NS | 100,000 | 26,098 | 27,060 | +962 | 25,654 | 26,513 | +859 |
| NS | 200,000 | 70,331 | 71,788 | +1,457 | 70,051 | 71,405 | +1,354 |
| PE | 20,000 | 972 | 972 | +0 | 475 | 0 | -475 |
| PE | 40,000 | 5,672 | 5,913 | +241 | 4,103 | 3,679 | -424 |
| PE | 60,000 | 10,907 | 11,503 | +596 | 9,623 | 9,839 | +216 |
| PE | 100,000 | 25,096 | 26,161 | +1,065 | 24,651 | 25,621 | +970 |
| PE | 200,000 | 68,810 | 70,231 | +1,421 | 68,530 | 69,856 | +1,326 |
| NL | 20,000 | 1,098 | 1,098 | +0 | 601 | 0 | -601 |
| NL | 40,000 | 5,638 | 5,638 | +0 | 4,068 | 3,371 | -697 |
| NL | 60,000 | 10,403 | 11,162 | +759 | 9,119 | 9,442 | +323 |
| NL | 100,000 | 24,403 | 25,301 | +898 | 23,959 | 24,769 | +810 |
| NL | 200,000 | 66,446 | 67,638 | +1,192 | 66,166 | 67,271 | +1,105 |

Reading it: below roughly the second bracket the credit equals the old deduction, so the under-65 change is nil in provinces whose lowest bracket reaches that far (AB, SK to $40k, BC, MB, NB, NL); above it the credit is worth the lowest rate, not the marginal rate, so tax rises (up to $1,000 to $2,200 at $200,000). Quebec's under-65 change at low incomes is a decrease because a single Quebec filer gets the living-alone amount ($2,172). At 68 with a pension the age and pension amounts now come off provincial tax too, which more than offsets it up to about $50,000. Engine level: every Canada scenario in the snapshot grid moves from year 0. Default scenario (Ontario), tax in dollars, 7J merge -> this branch: year 0 40,940 -> 42,305; age 68 19,400 -> 20,420; age 78 13,201 -> 11,863; age 88 14,670 -> 13,147 (higher while working, lower once the age and pension amounts apply).

**Not built (named gaps; none changes a Canadian result until built)**
- Spouse and eligible-dependant amounts (provincial and federal alike): they need the spouse's income and the 7A children list in the Canada engine; the federal ones are not modeled either.
- A spouse's transfer of unused age and pension amounts (Quebec included, where the pool is reduced by family income).
- Non-eligible Canadian dividends (owner decision): taxed like interest.
- Low-income tax reductions and credits (Ontario tax reduction, BC tax reduction, NB, NL, PEI, Saskatchewan low-income credits) and property-tax and rent credits (7K list). Figures I could read were unreliable: the CRA payroll excerpt returned identical text for the Ontario and BC reductions ($575, $25,570, $41,722, 3.56%), and the second review quotes "$300 + $575 per dependant" for Ontario and $842 / $563 for NL and a $23,000 PEI threshold, none confirmed on a primary page. They matter mostly for incomes under about $40,000. Deferred rather than built on unconfirmed numbers; the list is in the backlog.
- BC tax reduction (see the backlog for the conflicting figures), and any province-specific credit with its own rate (for example Saskatchewan donations above $200 at 14.5%, not 10.5%): the table's credit rate applies to the credits it models only.
- Quebec: Health Services Fund contribution, the single-parent supplement (needs children), and the paid credits (solidarity, work premium, family allowance: 7L).
- Provincial child and family credits: the Canada engine does not read the 7A children list yet.

**Timing** (Canada, interleaved same-process, 300 `simulate()` per round, median of 7, the 7J merge's file vs this branch): Ontario 378 ms -> 308 ms (0.81), BC 397 -> 289 (0.73), Quebec 260 -> 232 (0.90). Faster because the new `provincialTaxCA` no longer builds a scaled bracket array per call. Pension splitting not re-timed (its search is unchanged apart from the family-income argument).

**Pension-split regret** (the 360-household check in `tests/tax_brackets.js`, 65+ partner, Ontario, against a $50 brute-force scan): still under $3 a year, no change to the search. Added a four-household Quebec check (family income changes nothing about the transfer, so the same search holds); regret under $3.

**Tests.** `tests/tax_brackets.js` (Canada section) updated for the credit form with hand-computed literals: Ontario $100k (7,127.8294) and $200k with surtax (22,586.7826), the dividend credit (14,615.0896), separate floors for the federal and provincial credits, BC age amount, AB age plus pension, BC pension at 60, SK senior supplement, Manitoba BPA at $300k (45,781.38) and nil at $400k, Manitoba's frozen schedule, per-province indexing of the pension amount, Quebec's pooled amounts (single 66 at $30k and at $50k with a pension, a couple's family income, under 65), QPP and QPIP at $60k and $100k, taxFor's family income. `tests/province_rules.js` and the generated-doc check are in `npm test`. `tests/dividend_income.js` (Canada) uses British Columbia for the eligible-versus-ordinary comparison, because Ontario's Health Premium is on the grossed-up dividend and is not reduced by the credit. `tests/historical_bond_yield.js` (Canada) now has $24,000 of CPP so the age and personal credits do not shelter the interest.

**Gotchas**
- Sandbox: a quoted bash heredoc containing an apostrophe in the body failed to parse again; write edit scripts with the file tool.
- A summarising fetch of the CRA payroll page can merge unrelated sections (it gave the BC reduction formula under Ontario); read formulas from the form or statute, not a summary.
- CRA's payroll tables lag provincial legislation in both directions (BC 5.06% vs 5.60%, NL's two BPAs, PEI's top rate); for an annual tax figure prefer the province's own page or statute.
- Quebec `familyIncome === null` means "single, lives alone": do not pass 0 for a single filer.


### 7L notes: income-tested benefits (Canada, in progress)

Branch `claude/batch-7l-benefits`, base `origin/claude/batch-3b-penalty-rules` at f3668b7. Nothing is built yet; this section records the scoping decisions and the verification done so far. The reviewer hand-off is `docs/7l-benefit-catalog-for-verification.md`; the ESDC GIS tables are in `docs/sources/`.

**Owner decisions (2026-10-05)**
- No new inputs in 7L. Everything uses inputs that exist: each partner age and income, wages, the 7A children list, province, rent, property tax, couple or single.
- Provincial scope: the generic mechanisms are built in 7L for every province; data rows are filled for the federal programs plus ON, BC, AB and QC; the other provinces are filled in 7M. Ontario: the Sales Tax Credit, the Ontario Child Benefit and the occupancy-cost part of the Energy and Property Tax Credit (from rent and property tax). The Ontario energy component (it needs energy costs) and the Northern Ontario Energy Credit (it needs a region input) are named gaps. No Northern Ontario checkbox.
- Timing: GIS, Allowance, CCB and the CGEB use same-year income as an explicit engine convention (the real tests use the prior-year return); the benefit rules are written as the legal rules and the convention is stated separately.
- OAS recommended amount (762.50 a month at 65 to 74) and the 75-plus factor 1.10 (ESDC October to December 2026) are quarterly-indexed and must be updated when tax figures are next updated for 2027 (owner request 2026-10-05). Written spec: docs/7l-benefits-spec.md.
- OAS (revised 2026-10-05, owner): the oasMonthlyA/B inputs stay (0 = no OAS), the default becomes 762.50, and the planner applies the statutory 10 percent increase from age 75 automatically; deferral stays manual. Historical check of the 75-plus ratio: 756.32 / 687.56 (July 2023), 800.44 / 727.67 (January 2025), 838.75 / 762.50 (October 2026) are all 1.1000; 1.000 before July 2022 (ESDC page for the current quarter; earlier quarters from secondary summaries).
- OAS clawback stays as it is today (no discretionary-draw feedback); measured effect is nil under about 2 million of registered money and +7.6% to +13% of end assets at 3 to 5 million (throwaway comparison, 2026-10-05).
- Net-tax design (Canada taxFor returns tax minus benefits, the pure tax renamed incomeTaxCA) is proposed, not yet confirmed.

**Verified on primary pages (retrieved 2026-10-05)**
- ESDC OAS payment amounts, October to December 2026: https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/payments.html (GIS, Allowance and Allowance for the Survivor maximums and cutoffs; all non-taxable; OAS 762.50 and 838.75; clawback threshold shown as 93,454 for 2025).
- ESDC GIS tables 1 to 5 (owner-supplied xlsx, `docs/sources/`). Fit: single GIS 11,549.88 minus 50% of income, top-up 2,116.92 minus 25% of income over about 2,030 (gone near 10,495); spouse of an OAS pensioner GIS 7,626.84 minus 25% of combined income, top-up 599.88 minus 12.5% over about 4,050; spouse without OAS GIS 11,549.88 flat to about 9,190 then minus 25%, top-up 2,116.92 minus 12.5% over about 4,050; survivor Allowance 75% reduction to about 10,500 then 50%. Zero points agree with the published cutoffs (23,112; 30,528; 55,392; 31,152). Tables 4 and 5 need exact piecewise fits.
- Canada Groceries and Essentials Benefit: replaced the GST/HST credit in July 2026 (CRA page). Statute: Bill C-19 (S.C. 2026 c. 1, assented 2026-02-12), new ITA 122.5(3.005): 445 individual, 445 spouse, 234 per dependant (445 for the first child of a single parent), single supplement the lesser of 234 and 2% of income over 11,564, minus 5% of adjusted income over 46,432, paid in quarters. https://www.parl.ca/DocumentViewer/en/45-1/bill/C-19/royal-assent
- Canada Child Benefit July 2026 to June 2027 (CRA calculation page): 8,157 and 6,883, reduction from 38,237 and 82,847.
- CRA provincial pages (province-*.html under child-family-benefits/provincial-territorial-programs): Ontario (OSTC 378 per adult, spouse and child, 4% over 29,047 or 36,309; Ontario Child Benefit 146.66 a month, partial above 26,865; senior homeowners property tax grant 500), BC Family Benefit, Alberta ACFB maximums and thresholds, Saskatchewan low-income tax credit amounts and thresholds, New Brunswick (child tax benefit, working income supplement, HST credit, school supplement), Nova Scotia (child benefit, Affordable Living Tax Credit 255 plus 60 per child, 5% over 30,000), Newfoundland and Labrador programs and maximums, PEI child benefit and sales tax credit; Manitoba: CRA administers nothing.
- Alberta ACFB maximums: https://www.alberta.ca/alberta-child-and-family-benefit (base 1,529 / 2,293 / 3,057 / 3,821; working 782 / 1,494 / 1,920 / 2,061). The base reduction rates 8.05%, 12.07%, 16.09% and 20.11% are implied by the maximums over the 18,999 span to 47,115 but not printed there.
- Nova Scotia child benefit step schedule (full below 26,000; first child full and later children half to 33,999): https://novascotia.ca/coms/families/childbenefit.html (page shows 2023 dollars; 2026 amount from the CRA page).
- Quebec (owner-supplied screenshots of Revenu Quebec and Retraite Quebec pages): work premium 2026 maximums 1,207.33 / 1,882.45 / 3,122.40 / 4,057.00, adapted 2,294.59 / 3,559.12 / 4,218.00 / 5,234.00, supplement 200 a month for up to 12 months; family allowance 2026 3,068 falling to 1,221 between 60,000 and 107,000 of family income (two parents), 4,145 falling to 1,651 between 44,000 and 107,000 (single parent), line 275 family income, December 31 of the prior year.

- Provincial seniors programs, primary pages read 2026-10-05: Saskatchewan Income Plan (https://www.saskatchewan.ca/residents/family-and-social-support/seniors-services/seniors-income-plan: maximum 360 a month single, 325 each for a couple with both on OAS and GIS, 360 with a spouse under 60 or on the Allowance; zero when taxable income excluding OAS and GIS reaches 4,560 / 7,440 / 11,568 / 9,120 as of April 1 2026; rates effective July 1 2023); New Brunswick Low-Income Seniors Benefit (https://www2.gnb.ca/content/gnb/en/corporate/promo/new-brunswick-low-income-seniors-benefit.html: 629 for 2026, needs GIS, the Allowance or the Allowance for the Survivor in 2025, one benefit per couple where both get GIS and live together); Alberta Seniors Benefit (https://www.alberta.ca/alberta-seniors-benefit: maximum 3,946 single and 5,918 couple for a homeowner, renter or lodge resident, reduced 0.1714 and 0.1717 per dollar of income used, eligible to 32,690 and 53,800; income is line 15000 less OAS, GIS and Allowance, RRSP and pension deductions, and up to 3,600 of employment income; needs OAS in payment; deferring OAS removes eligibility); Ontario GAINS (https://www.ontario.ca/page/guaranteed-annual-income-system-payments-seniors, updated 2026-07-02: up to 92 a month for 2026-27, private income up to 4,416 single or 8,832 couple, rate tables by age and marital status are separate pages); Manitoba 55 PLUS (https://www.gov.mb.ca/fs/eia/55plus.html: maximum quarterly 161.80 single and 173.90 each for a couple, junior component to 9,746.40 single and 16,255.20 couple, senior component keyed to the federal GIS and Allowance level; benefit year April to March). BC Senior Supplement: both BC pages returned only an election-period banner, so BC is not verified (secondary: up to 99.30 a month single, 220.50 a couple, 99.83 for a spouse on the Allowance).
- Correction to the reviewer: the Alberta Seniors Benefit maximums 3,946 and 5,918 are on the primary page.

- Task 7 sources (read 2026-10-05): CRA 2026 OEPTC calculation sheets (primary; every sheet read except the shared-care variants): occupancy cost = 20 percent of rent plus property tax; energy component = lesser of occupancy cost and 290 (so it is computable, only the long-term-care and on-reserve lines are not modeled); property tax component = lesser of occupancy cost and (10 percent of it capped at 944, plus 73; seniors cap 581 plus 617); less 2 percent of family net income over 29,047 (single), 36,309 (couple or single parent), seniors 36,309 (single) and 43,571 (couple or single parent); senior step 5 limits credit plus senior homeowners grant to energy plus occupancy cost. Finance Quebec Parameters of the Personal Income Tax System for 2026 (primary, https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/finances/publications-adm/parametres/AUTEN_IncomeTax2026.pdf, Tables 3 and 4): family allowance 3,068 / 1,221 per child and 1,077 / 430 once per single-parent family with reduction thresholds 44,032 and 60,398 (the earlier assumption that 4,145 is per child was wrong: it is 3,068 plus the 1,077 family supplement); solidarity credit QST 363 / 363 / 172 and housing 906 / 746 / 158 per child, threshold 43,195; general work premium maxima and thresholds. Derived and interim (secondary, on the backlog): work premium phase-in rates 11.6 / 30 / 25 percent from maximum / (threshold - exclusion); solidarity 6 percent reduction (consistent with the published ceilings 64,545 and 70,395); Ontario senior homeowners grant 500, 35,000 / 45,000, 3.33 percent (a search summary of the ontario.ca page); the Quebec family allowance reduction end at 107,000.
**Corrections to the first catalog:** CGEB replaces the GST/HST credit; the GIS figures used the July to September quarter; the BC Climate Action Tax Credit has ended (per the reviewer, CRA page not yet read); Ontario Child Benefit, Saskatchewan Income Plan, NL seniors benefit and income supplement, NB Low-Income Seniors Benefit and others were missing.

**Built (7L, Canada V42; branch claude/batch-7l-benefits, eight commits after the plan commits)**
1. BENEFIT_RULES table, generated docs/benefits-rules.md (npm run gen:benefits), coverage test (tests/benefit_rules.js). No behavior change.
2. GIS and Allowance evaluator (knots fitted to ESDC tables 1 to 5; tests/gis_tables.js checks every row: worst difference 8.98 / 8.83 / 9.00 / 10.86 / 21.97 / 27.98 dollars a year, tolerances 12 and 30; the Allowance tables carry up to 28 dollars a year of band-width rounding stair).
3. OAS: the oasMonthly inputs stay; default 762.50 (was 742); x1.10 from age 75. Canada snapshots changed (intended).
4. Net-tax taxFor (incomeTaxCA minus benefitsFor), GIS and Allowances in the engine, benefit lines in rows, Sankey and printed table, gisIncomeRoom hook for 4A, survivor symmetry extended with a low-income couple.
5. CCB and CGEB with the children plumbing.
6. Provincial: Ontario (sales tax credit, child benefit), BC Family Benefit, Alberta (ACFB, Seniors Benefit), Quebec family allowance.
7. Ontario Energy and Property Tax Credit and senior homeowners grant, Quebec solidarity credit and work premium (interim values on the backlog).
8. Docs, version V42.

**Before and after (nominal dollars; old = the 7K merge base, new = this branch)**
| Household | Old | New |
|---|---|---|
| Default Ontario couple (retires, then draws) | lifetime benefits 0; end assets 3,012,385 at 105 | benefits 95 a year at 73 rising to 2,155 at 105 (19,915 over the plan, Ontario Sales Tax Credit plus later GIS-range years); end assets 3,666,522 |
| Low-income retired couple, 66, Ontario, renting, 80k RRSP and 120k TFSA, 30k spending | runs out at 82 | never runs out; benefits 5,308 at 66, 11,217 at 76, 19,775 at 90; 293,230 over the plan |
| Quebec couple, 38, two children, working | runs out at 61 (benefits 0) | runs out at 66; benefits 17,067 at 38, 13,753 at 48, 4,676 at 63 (534,261 over the plan) |

Gross tax is unchanged by benefits (checked: with no children the rows are identical). With children the rows differ because the extra cash changes how the pre-retirement bond ladder is funded. Snapshot changes (all intended, US byte-identical): task 3 every Canada scenario (default OAS and the 75-plus step), task 4 every Canada scenario (row fields and low-income GIS), task 5 (CGEB), task 6 331 of 359 (Ontario sales tax credit for the default province), task 7 24 of 359 (housing credits, Quebec).

**Timing** (interleaved same-process, 300 simulate() per round, median of 7, old file from origin/claude/batch-3b-penalty-rules against the working file): Ontario 135 -> 149 ms (1.10), BC 142 -> 153 (1.08), Quebec 192 -> 200 (1.04), Ontario with two children 173 -> 198 (1.15), Alberta with two children 161 -> 190 (1.18), Quebec with two children 190 -> 216 (1.14). Noise is about 10 percent. With benefitsFor stubbed to return 0 the ratio is 1.01, so the cost is the evaluators, which run on every solver probe; they allocate nothing, and an early exit skips a household with no children above 125,000. Over the plan's 5 percent target; accepted because the work is real (every withdrawal now prices the benefits) and the absolute cost is small (about 0.05 ms per projection year); a tighter per-situation exit or caching would be the next step if needed.

**Final whole-branch review (fresh Opus reviewer) and fixes.** Two real bugs found and fixed: (1) table 4 of the ESDC GIS tables ends at 42,768 only because the younger spouse's Allowance reaches 0; the pensioner then continues on table 3 (263.49 then 262.49 a month), so there is no cliff (the earlier plan and the first tests treated it as one; a couple with GIS income between 42,768 and 55,392 lost up to about 3,150 a year and the withdrawal solvers could return a negative net there); benefitsFor now switches to table 3 when the Allowance is 0. (2) A survivor under 65 inherited the deceased's OAS (the existing greater-of swap) and also received the Allowance for the Survivor, double counting about 9,400 a year; OAS is now inherited only if the survivor is 65 or older (84 of 359 Canada snapshot scenarios moved, intended). Added an engine test of the Allowance for the Survivor and fixed stale statements in CLAUDE.md, README and the page callout. Deferred minors: smooth-mode solveTraditionalForNet brackets at 3 x need + 1 and under-delivers where the marginal rate exceeds about 67 percent (single GIS 75 percent; the shortfall falls to the TFSA); the 125,000 early exit is skipped when a plan has adult children; in a surplus year with a ladder gain the cash flow uses the pre-ladder tax so lost benefits are not taken from cash that year.

**Rulings made during execution** (details in the ledger): the CSV export has no benefit columns (it is shared region 22-exportCsv); the golden drawdown test and the bond-refill test now account for the CGEB and Ontario credit (445 plus 378 a year at zero income); the bond-yield test reads the row tax field; the OSHPTG has explicit cutoffs; three Task 4 assertions compare against total benefits; the extraction script reads inline-string headers.

**Named limitation:** where a benefit phases in as income rises (the CGEB single supplement at 2 percent, the ACFB working component, the Quebec work premium), a taxable sale can net more than its gross and the shared drawTaxable bisection (which starts at the amount needed) over-sells by up to the phase-in amount (at most 234 for the CGEB). Documented in CLAUDE.md; not fixed because drawTaxable is a shared region.

**Alberta Seniors Benefit in a couple with one senior: confirmed against the official estimator (2026-10-05).** benefitsFor pays it when either partner receives OAS (flags pA or pB) and, for any couple, uses the couple row (maximum 5,918, rate 0.1717) on combined income less OAS, GIS and up to 3,600 of employment income, never the single row (3,946, rate 0.1714) for the senior alone. What the primary page (https://www.alberta.ca/alberta-seniors-benefit, read 2026-10-05) says: eligibility needs the applicant to be 65 or older and receive OAS; the benefit is set by "your income, combined with your spouse/partner's income, regardless of age" and "your marital/cohabitation status"; the guideline income limits are 32,690 single and 53,800 for "senior couples" (full OAS included in income); the deductions include OAS, GIS and Allowance, the RPP and RRSP deductions, the pension-split line (couples) and up to 3,600 of employment income. The page does not say which maximum a senior with a younger spouse gets, so the owner ran the official Seniors Benefit Estimator (https://www.seniors.alberta.ca/benefit-estimate-calculator, valid 1 July to 31 December 2026): married, applicant a senior with OAS, spouse under 65 and not on OAS, applicant line 15000 of 15,000 and line 11300 (OAS) of 9,150, spouse nothing. Income for calculating benefits 5,850; result 409 a month for the applicant (the spouse is shown as not eligible, one benefit per couple). The couple row gives 5,918 - 0.1717 x 5,850 = 4,913.6 a year = 409.5 a month; the single row would give 3,946 - 0.1714 x 5,850 = 2,943.3 a year = 245 a month. So the couple row applies to a senior with a younger spouse, as the planner models it, and the exposure below does not arise. One data point (a homeowner or renter row, one income); the residence type was not recorded. Exposure had the single row applied (it does not): the schedules differ by about 1,972 - 0.0003 x income, i.e. up to about 1,970 a year while assessed income is under about 23,000 and tapering to zero at about 34,500. How often it applies (a sweep on the engine, Alberta couple, Partner A retiring at 60 with Partner B 2 or 6 years younger, 72 plans per gap: portfolios 150,000 to 2,000,000, 20, 60 or 100 percent traditional, spending 30,000 to 80,000; counting years with A at 65 or over and B under 65): with a 2-year gap 45 of 72 plans receive a benefit in at least one such year (82 of 144 such years, average 3,514); with a 6-year gap 52 of 72 plans (265 of 432 years, average 3,845). By portfolio size (plans with a hit out of 12): 150,000 and 300,000: 12; 500,000: 8 (gap 2) and 10 (gap 6); 800,000: 6 and 9; 1,200,000: 5 and 6; 2,000,000: 2 and 3. The grid leans to modest wealth, so the share is not a population rate, but a couple with an age gap and under about 1,200,000 of mostly tax-free or taxable savings will often land in the band. The mixed-age rule is closed; the frequency figures above show how often the benefit matters for an Alberta couple with an age gap.

**GIS tables 4 and 5 tolerance of 30 a year (spec said 1 a month = 12 a year).** tests/gis_tables.js compares the fitted annual knots with every ESDC table row at the band midpoint. Tables 1 to 3 pass within 12 (worst 8.98, 8.83, 9.00 and 10.86 a year). In tables 4 and 5 (the Allowance tables) the printed band widths alternate, so the table steps down in a stair while the knots are straight lines between points; the fit can sit up to about 28 a year off a single row (measured worst 21.97 and 27.98), roughly 2.30 a month. The straight line is the right shape on average; the gap is the stair, not a wrong formula. The test uses 30 for those two tables so a real error (a wrong rate or knot) still fails.

**Not built (named gaps):** other provinces' programs (7M); the Allowance for the Survivor beyond the survivor remap; disability benefits; the Ontario energy component for long-term care and reserves, the Northern Ontario Energy Credit and the shared-care sheets; low-income tax reductions; the prior-year lookback; the CSV columns; OAS deferral and partial residence (the input stays manual).

### Batch 4A / 4B notes
_(to be added by the Batch 4 PRs)_

### Batch 5 notes
_(to be added by the Batch 5 PR)_

### Batch 6 notes
_(to be added by the Batch 6 PR)_

### Batch 8 notes
_(to be added by the Batch 8 PR)_

---

## Verification backlog (primary sources, to do at the end)

Owner decision (2026-10-04): carry on without primary sources and verify everything in one pass at the
end. Primary sites (irs.gov, law.cornell.edu, federalregister.gov, ssa.gov, medicare.gov, cms.gov,
congress.gov, bls.gov) were blocked from this environment through Batch 3A. Every figure or rule below
is in the code or the plan today on secondary sources or on our own reading; none was opened at its
primary source. Each batch adds its items here as it lands; the final pass opens each primary document,
cites it with the retrieval date in the consolidated `docs/reference.md`, and fixes the code where
reality differs. Status key: S = secondary source only, U = no source checked, O = owner's own table or
reading (itself secondary).

| Item (where it lives) | Batch | Status | What to confirm |
|---|---|---|---|
| 2026 standard deduction $32,200 / $16,100 / $24,150 HoH; age 65+ additional $1,650 / $2,050 | 2 | S (Rev. Proc. 2025-32 summaries: KPMG, JofA) | Rev. Proc. 2025-32 text |
| Senior deduction $6,000, 2025-2028, phase-out 6% over $75k / $150k, per eligible person, below AGI | 2 | S + O | IRC 151(d)(5)(C), P.L. 119-21 s.70103, Schedule 1-A and Form 1040 line numbers |
| SALT cap table $40,000 / $40,400 / $40,804 / $41,212 / $41,624 / $10,000 from 2030; $500k/$505k threshold, 30% rate, +1% a year, $10,000 floor | 2 | S + O | IRC 164(b)(7) |
| Mortgage interest limit $750,000 (permanent); grandfathered $1,000,000 not modeled | 2 | U / O | IRC 163(h)(3), Pub. 936 |
| 2026 IRMAA tiers and per-partner Part B + D surcharges; MFJ bounds | 2 | O | CMS 2026 IRMAA notice |
| Medicare timing: work past 65 delays enrollment, no late penalty; 8-month special enrollment, COBRA | 2 | O (modeling decision) | Medicare.gov / CMS rules |
| 2026 401(k) deferral $24,500, catch-up $8,000, age 60-63 $11,250; IRA $7,500 + $1,100; Roth catch-up above $150,000 prior-year FICA wages | 3A | S (Notice 2025-67 summaries) | IRS Notice 2025-67 |
| Annual additions limit $72,000 (`retirementContributions`, mega-backdoor room) | 3A | U | IRS Notice 2025-67 / Pub. 560 |
| Roth ordering: contributions, then conversions (oldest first, each with its own 5-year clock for the 10% tax), then earnings | 3A / 3B | S | IRC 408A(d)(4), Treas. Reg. 1.408A-6 |
| Roth 401(k) non-qualified distributions pro rata between contributions and earnings; no RMDs from 2024 | 3B | S | Treas. Reg. 1.402A-1, SECURE 2.0 s.325 |
| Rule of 55 applies only to the plan of the employer separated from, lost on rollover to an IRA | 3B | S | IRC 72(t)(2)(A)(v) |
| 72(t) SEPP: exact payments, recapture on modification, later of 5 years or 59.5, Single Life Table | 3B | S | Notice 2022-6, Rev. Rul. 2002-62 |
| Single Life Table divisors in `singleLifeDivisor` | 3B | U | Treas. Reg. 1.401(a)(9)-9 |
| Uniform Lifetime Table in `rmdDivisor` (72-100+) and RMD start ages 73 / 75 by birth year (`rmdStartAge`) | 3A (read by tests) | U | Treas. Reg. 1.401(a)(9)-9(c), SECURE 2.0 s.107 |
| Treasury yields 2023-2025 kept as recorded (decision 14); CPI 2023-2024 confirmed, CPI 2025 to two decimals | 1 / 6 | S | Treasury, BLS index levels |
| Qualifying child ages: under 19 at year end, under 24 if a full-time student, any age if permanently disabled (not modeled); a child counts for the whole birth year | 7A | O (owner's table citing IRS Pub. 501) | IRC 152(c)(3), Pub. 501 |
| ACA household = filer + spouse + tax dependents regardless of age | 7A | O (owner's table citing HealthCare.gov) | HealthCare.gov household-size page, 26 CFR 1.36B-1(d) |
| 2025 poverty guideline $15,650 + $5,500 per extra person, used for the 2026 coverage year (`fplForHousehold`); indexed by `taxIndexFactor` in later years | Phase 1 (found in 7A) | U | HHS poverty guidelines notice, Rev. Proc. 2025-25 |
| CTC $2,200 per child under 17 (2026, indexed from 2026 and rounded to $100 by statute; the code does not round), refundable cap $1,700, 15% over $2,500, phase-out $50 per $1,000 over $200,000 / $400,000 (not indexed) | 7B | S (Rev. Proc. 2025-32 summaries, OBBBA) | IRC 24(a)-(h), Schedule 8812 instructions, Rev. Proc. 2025-32 |
| CTC needs a valid SSN for the child (and a parent): assumed; ACTC earned income = wages (box 1) + net self-employment earnings | 7B | O | IRC 24(h)(7), 24(d) |
| 2026 applicable-percentage table (2.10 / 3.14-4.19 / 4.19-6.60 / 6.60-8.44 / 8.44-9.96 / 9.96) and the 400% cliff; enhanced credits expired 2025-12-31; repayment cap removed from 2026; enhanced-extension status (House passed 2026-01-08, Senate open) | 7B | S (secondary: currentfederaltaxdevelopments, thefinancebuff, Ballotpedia, AHA) | Rev. Proc. 2025-25, IRC 36B(b)(3)(A), 36B(f)(2)(B) as amended by P.L. 119-21; current status of the extension at the final pass |
| ODC $500 for a qualifying child 17 or older, nonrefundable, not indexed, shares the CTC phase-out; ordering inside the combined credit (reduction off the CTC first, tax absorbs the ODC first) | 7B | S / O (own reading of Schedule 8812) | IRC 24(h)(4), Schedule 8812 lines 11-14 |
| QSS: two years after the death year with a dependent child; QSS thresholds (Social Security base amounts, IRMAA table, senior-deduction phase-out, CTC phase-out) | 7B | U | IRC 2(a), 1(a), Pub. 501, Pub. 915, SSA / CMS IRMAA notice |
| QSS NIIT threshold $250,000 and QSS Additional Medicare Tax $200,000 | 7B | U (own reading) | IRC 1411(b)(1), 3101(b)(2) |
| QSS 65+ standard-deduction add-on is the married $1,650, not the unmarried $2,050 | 7B | U (own reading) | IRC 63(c)(3), 63(f) |
| 2026 HoH brackets (17,700 / 67,450 / 105,700 / 201,750 / 256,200 / 640,600), standard deduction $24,150, 0% / 15% gain bands $66,200 / $579,600 | 7B | S (secondary: q3adv, bradfordtaxinstitute, KPMG for the deduction) | Rev. Proc. 2025-32 section 3 |
| HoH needs a qualifying child (or other qualifying person), paying over half the home cost; a student 19-23 counts | 7B | O | IRC 2(b), Pub. 501 |
| State tax: HoH read as single, QSS as joint, until 7C/7D | 7B | n/a (interim) | each state's forms |
| Survivor files jointly for the year of death (code: step 2, V94); the deceased's own age counts for the 65+ deductions | 7B | U | IRC 6013(a)(3), Pub. 501 |
| State tax table: CA 2025 brackets, HoH schedule, standard deduction, exemption credits and phase-out, renter's credit (CalCPA Fast Tax Facts Dec. 2025, a 2025 Schedule Z listing); 2026 figures when the FTB publishes | 7C | S | FTB 2025 540 instructions and tax rate schedules (blocked: 403), later the 2026 schedules |
| NY: 2026 rates (3.9 / 4.4 / 5.15 / 5.4 / 5.9), 2026 standard deductions, $1,000 dependent exemption, pension exclusion includes IRA distributions from 59 and a half, Empire State child credit $1,000 / $500 for 2026 and its $16.50 phase-out on the household total (owner's reading), QSS threshold | 7C | S (thresholds and recapture worksheets P: IT-201-I 2024 and 2025 read) | Tax Law sec. 601, IT-201-I 2026, IT-213 instructions |
| PA: 59 and a half rule for IRA and 401(k) withdrawals, 401(k)-after-retirement exception, Roth cost recovery, forgiveness per-dependent rows and the 10% per $250 step for every row, eligibility income definition | 7C | S (rate, no deductions and the no-dependent forgiveness tables P: pa.gov) | PA-40 instructions, Schedule SP, 61 Pa. Code sec. 101.6 |
| CT: Table A exemption (the PDF text is misaligned; formula $1,000 per $1,000 over $30,000 / $48,000 / $38,000 matches the printed joint column and stated ends), property tax credit steps (15% per $10,000), 2026 table revisions, IRA deduction 100% from 2026 | 7C | P (Form CT-1040 TCS Rev. 12/25; OLR 2025-R-0152) for tables and thresholds; S for the property tax credit | CT-1040 instructions 2025 and 2026, CGS sec. 12-701(a)(20) |
| WA: $278,000 standard deduction for 2025 (P, DOR), 2026 amount, whether the $1 million tier indexes, 9.9% (P, DOR) | 7C | P / U | RCW 82.87.040 as amended by ESSB 5813 |
| TX: no individual income tax | 7C | S (Comptroller tax list) | Tex. Const. art. VIII sec. 24-a |
| 7D G1: AK, FL, NV, SD, WY have no individual income tax (a no-income-tax roundup, taxact.com; no state page opened); NH Interest and Dividends Tax repealed from 2025 (a law-firm summary quoting the DRA); TN Hall tax repealed from 2021 (revenue.support.tn.gov, search excerpt) | 7D | S (TN: official page via excerpt) | each state's revenue department page, NH DRA notice, RSA 77, Tenn. Code 67-2-102 repeal |
| 7D G2: AZ (age-65 $2,100 and dependent $2,300 exemptions, dependent-credit phase-out, senior-deduction conformity, whether the 25% gains subtraction covers all assets), ID (2026 food credit amount, rate for 2026), IN (county populations behind the 1.77% average, the $500 extra at 65, renter deduction), KY (the $31,110 exclusion and $40 credit at the Department of Revenue), LA (exemptions after the 2025 reform; the $12,000 exclusion's coverage of IRA income), MA (exemption amounts, the Child and Family Tax Credit, at mass.gov), NC (2026 standard deduction), UT (SB 60 rate, 2026 deduction amounts behind the credit) | 7D | S (P for the IN notice, KY formula, NC child deduction, UT credit pages, ID announcement) | each state's forms and instructions |
| 7D G3: AR retirement exclusion age gates and the one-table reading for joint returns; HI IRA/401(k) taxable vs employer pension exempt, the 7.25% gains cap, Act 24's other bracket effects; KS $2,320 dependent amount; NE head of household standard deduction; ND head of household column, the 40% gains exclusion; OH exemption tiers and joint filing credit rule; OK head of household brackets, retirement exclusion ages; RI 2026 Social Security / pension limits, FRA; VA $800 age exemption, 2026 standard deduction beyond 2026; WV $2,000 exemption and $8,000 modification rules | 7D | S (P for the AR formula, HI announcements, KS guide, NE schedules, OK bill, RI advisory) | each state's instructions |
| 7D G4: AL ($6,000 retirement exclusion at 65, senior deduction, NIIT in the deduction, 2026 standard deduction chart), CO (shared bucket, 4.4% for 2026, standard-deduction add-back, whether the senior deduction flows through), DE (HS 1 for HB 13 brackets and the gains inside the $12,500), GA ($4,000 dependent, $35,000 at 62, $70,000 from 2027), IL ($1,000 vs $2,000 at 65), IA (credits), ME (pension deduction phase-out and 2026 amount), MS (standard deduction, exemption and retirement requirements), MO (public vs private pension, the six-step approximation), NJ (2026 schedules, property tax deduction), SC (retirement and age deductions under Act 110, 2026 dependent exemption) | 7D | S (P for the AL charts, DE bill, GA, IL, IA, ME schedule, MS HB 1, MO statute and DOR pages, NJ exclusion, SC bill) | each state's forms |
| 7D G5: MD (pension exclusion, exemption steps, 3.2% county rate), MI (exemption, retirement deduction for 2026), MN (2026 Social Security thresholds, standard deduction), MT (HB 337 gains rates and the exact 2027 figures), OR (federal-tax cap and phase, exemption credit, 2026 standard deduction), VT (2026 schedules, pension exclusion), WI (the sliding standard deduction table, the 2026 brackets) | 7D | S (P for MD alert, MI deduction, MN brackets, MT bill, OR brackets, VT 2025, WI instructions) | each state's forms |
| 7D G6: NM (2026 standard deduction conformity or decoupling, the 2026 Child Income Tax Credit amounts, bracket source is a tax-site summary), DC (the 2026 budget act's conformity text, the standard deduction and senior deduction for 2026, the child credit amounts and its cutoff, whether any 2026 rate change) | 7D | S (P for NM PIT-ADJ, PIT-1, PIT-RC instructions; DC rate page) | NM TRD, DC OTR, DC Council |
| State indexing by family: NY, PA and CT nothing indexed; CA all indexed except the $1 million surcharge; WA deduction indexed, $1 million tier not; the 17-state list of bracket-indexing states and each state's measure (owner's table) | 7C / 7D | O (owner's table, secondary) | each state's statute and revenue department notices |
| 7L NL: NL Child Benefit rates (10.61% / 21.86% / 33.94% / 33.94% + 12.98% per child over 3 above 20,397) and annual child amounts (1,888 / 1,896 / 2,036 / 2,188); relayed from NL Regulation 16/26, text not read (a search result puts the zero point near 38,193, which matches 10.61% on 1,888) | 7L | S | The regulation text (assembly.nl.ca) and the NL Department of Finance page |
| 7L NL: Early Childhood Nutrition Supplement tied to the NLCB (no separate reduction); 150 a month per child under 5 | 7L | S | NL regulation sections 6 and 7 |
| 7L NL: Seniors Benefit 1,882 full to 30,409, 11.66% reduction above (zero near 46,550; CRA shows 46,549) | 7L | S (rate); P (1,882 and 30,409 on the CRA page) | NL Department of Finance page and the regulation |
| 7L NL: Income Supplement 520 single, 589 couple, 231 per child; reduction rule not found; disability amount and disability benefit are out of scope (need a disability input) | 7L | P for amounts / U for the reduction | NL regulation or the CRA calculator |
| 7L: ACFB working-component rates (phase-in 15%, reduction 3.40% / 6.49% / 8.34% / 8.95% above 47,115) and base rates (implied by the maximums) | 7L | S | Alberta program parameters or the CRA calculator |
| 7L: PEI child benefit as annual 410 and 290 per child; PEI Island Essentials Benefit (310 / 365 to 175, from November 2026) | 7L (7M data) | S | PEI government 2026 pages |
| 7L: Saskatchewan low-income tax credit 2026 reduction rate (not stated on the CRA page; do not carry the 2025 rate) | 7L (7M data) | U | Saskatchewan 2026 page |
| 7L: Quebec solidarity credit component tables (housing, QST, northern; 2026) and the work premium formula (rates, thresholds, work-income rules); thresholds 64,545 / 70,395 and 2,634 per child are secondary | 7L | S | Revenu Quebec pages (tables hidden from the text reader; owner screenshot) |
| 7L: provincial seniors programs still open: BC Senior Supplement (BC pages blocked by an election banner; 99.30 / 220.50 / 99.83 are secondary), Ontario GAINS rate tables (eight pages by age and marital status; only the 92 maximum and the 4,416 / 8,832 limits are read), Manitoba 55 PLUS senior-component formula | 7L / 7M | P for SK, NB, AB; S for BC | BC rate table; Ontario GAINS tables; Manitoba regulation 64/90 |
| 7L: Ontario Energy and Property Tax Credit occupancy-cost calculation (the 20% of rent / 100% of property tax shape is a search summary) and the OSTC seniors income threshold | 7L | S | CRA OEPTC calculation sheet |
| 7L: OAS recovery tax threshold: ESDC page shows 93,454 for 2025; the code uses 95,323 for 2026 | 7L | S | ESDC / CRA 2026 threshold |
| 7L: GIS employment exemption (first 5,000 exempt, half of the next 10,000) and GIS income definition (net income less OAS, capital gains at 50%, TFSA excluded); GIS tables 4 and 5 exact fits | 7L | S / P (tables) | OAS Act schedule and the ESDC tables |
| 7L Ontario senior homeowners property tax grant: 500 maximum, full to 35,000 (single) or 45,000 (couple), 3.33 percent reduction, nil at 50,000 / 60,000, owners 64 or older (a search summary of the ontario.ca page; not read directly) | 7L | S | https://www.ontario.ca/page/senior-homeowners-property-tax-grant and the CRA OSHPTG questions and answers |
| 7L Quebec work premium phase-in rates 11.6 percent (living alone, couple without children), 30 percent (single parent), 25 percent (couple with children): derived from maximum / (threshold - exclusion) using the primary Finance Quebec Table 3 maxima and thresholds and the 2,400 / 3,600 exclusions (11.6 percent also appears in a search summary) | 7L | S (derived) | Revenu Quebec Schedule P or publication IN-245 |
| 7L Quebec solidarity credit 6 percent reduction over 43,195 (3 percent with one component; not modeled); consistent with the published ceilings 64,545 and 70,395 and the 1,281 and 1,948 maxima (Finance Quebec Table 4 amounts are primary) | 7L | S | Revenu Quebec solidarity credit calculation page |
| 7L Quebec family allowance reduction: ends at 107,000 and is linear between the Finance Quebec reduction threshold (44,032 single parent, 60,398 couple) and 107,000 (Retraite Quebec table, rounded thresholds); the single-parent supplement is once per family | 7L | S | Retraite Quebec calculation page |
| 7L Ontario OEPTC: the age-64 test and the monthly entitlement are approximated by the same year and the plan age; lines 5 and 6 (long-term care, on-reserve energy) and the 25 dollar student residence are not modeled; the work premium uses wages as work income | 7L | P (formula) | CRA 2026 OEPTC calculation sheets (read 2026-10-05) |

## Open items

- 7D part 2 (state-tax performance): three optimizations after the 7D PR; see the "7D part 2" section in Batch 7. The 7D PR carries the timing overrun by decision.

Everything raised so far is answered or recorded as a decision above. What
remains is detail to settle when the relevant batch is scoped:
- All batches: figures are confirmed against primary sources at implementation
  time (decided). The planning pass used secondary sources because irs.gov and
  bls.gov were not reachable.
- Pre-retirement bond-bucket strategy for early retirees (raised after Batch 1;
  look at it with Batch 3B; resolved in 3B step 6, no code change, see "Batch 3B step 6" in the notes): the ladder and the gradual refill now park the whole
  reserve in `bondTraditional` first. For a household retiring before 59.5 that
  forces the 10% early-withdrawal penalty whenever the reserve is drawn (a down
  year, or after taxable, cash and Roth are exhausted), unless Rule of 55 or a
  72(t) plan covers it. Batch 1 measured it: the US early-retiree historical
  success rate fell from 90.6% to 86.8% when the ladder moved to traditional
  first. Options to evaluate: choose the source by the household's expected age at
  first draw (taxable or Roth first when the reserve will be drawn before 59.5,
  traditional first otherwise), size the reserve differently before 59.5, or fund
  it from penalty-free money only. Needs a before/after on early-retiree scenarios
  (standard, historical and Monte Carlo) and the 3B penalty-aware rules in place
  first. Carry the outcome into `docs/reference.md`.
- Checked, no action (Batch 1 follow-up question): bonds held in retirement
  accounts are not taxed on interest each year. `investmentIncome()` /
  `investmentIncomeCA()` are called with `bal.bondTaxable` only, so only the
  taxable bond bucket's interest is taxed (US: ordinary income counted in MAGI;
  Canada: ordinary income); `bondTraditional`, `bondRoth` (and the Canadian RRSP
  and TFSA equivalents) grow at the bond return with no yearly tax. The tax shows
  up only when money leaves the account.
- Batch 3C: the safe-MAGI room has no behavioral test (carried from Batch 1, see
  its notes); resolve it there and carry the note into `docs/reference.md`.
- Roth-conversion bracket sizing (raised in Batch 2): `solveRothConversion` sizes the
  conversion with a conservative deduction lower bound (age-adjusted standard, or
  property tax + mortgage interest if larger), leaving out the senior deduction and
  state income tax because both depend on the conversion itself. Effect: in tax years
  2026-2028 a 65+ filer converts up to about $6,000 per eligible person less than an
  exact fill, and a large-state-tax itemizer slightly less; later years are
  unaffected. Making it exact needs iterating on the conversion inside
  `solveRothConversion`. Revisit with Batch 3C (safe-MAGI room and conversion
  sizing), with a before/after on a 65+ conversion scenario.
- Grandfathered mortgage debt (raised in Batch 2, decided to leave): the model limits
  deductible mortgage interest to $750,000 of original debt (IRC 163(h)(3)(F), permanent
  for debt after 12/15/2017) by prorating interest by 750,000 / original principal. Debt
  taken on or before 12/15/2017 keeps a $1,000,000 limit (Pub. 936), so a grandfathered
  loan between $750,000 and $1,000,000 is under-deducted (conservative). Fixing it needs
  a loan-origination-date (or "pre-2018 loan") input, which Batch 2 could not add; the
  limits also apply to combined primary and second-residence debt, and the model has one
  home. Decide when the next batch that adds housing fields is scoped.
- Senior deduction placement (raised in Batch 2): resolved per the owner's reading of
  the IRS form flow (2026-10-04): Form 1040 line 11b is AGI; Schedule 1-A Part I starts
  from it to compute MAGI (AGI plus the specified additions, none modeled); the
  Schedule 1-A total goes to line 13b and reduces taxable income only, after AGI. So it
  is not above the line, its own phase-out MAGI is pre-deduction, and it stacks with the
  65+ additional standard deduction. This is what the model does. Not independently
  opened by us (primary sites blocked); confirm the line numbers when reachable.
- Survivor and the account ledger (raised in 3A): after a death the survivor owns everything, so RMD and
  penalty math treat the whole pool as theirs and draws are pro rata, but the ledger still labels the
  deceased's accounts to them; nothing reads that label today. 3B's per-account Rule of 55 and 72(t) should
  say what happens to a deceased partner's 401(k) (spousal rollover into the survivor's IRA is the
  realistic answer).
- Roth IRA basis uses 0 as "not entered" (3A): a true zero basis is entered as $1. If a real blank is
  wanted, the shared `24-syncContributionControls` number listener needs a blank-aware option.
- CPI 2025: confirm to two decimals from the BLS index level (see Batch 6).
- EITC (raised in 7A, deliberately not modeled in 7B): a qualifying child plus earned income and
  an investment-income cap. It could matter to a coast-FIRE household with children in low-MAGI
  years, and it interacts with the safe-MAGI policy, so decide it with 3C.
- Social Security child benefits (raised in 7A, for Batch 6): a retired or disabled parent's
  child under 18 (19 if still in high school) can add up to about 50% of the parent's benefit per
  child, up to a family maximum. Real money for an early claimer with young children; it needs
  the children list (7A) and the Social Security basis work in Batch 6.
- HoH and QSS in state tax (raised in 7A): until 7C reconsiders them, the state-tax calls get
  the nearest `mfj` / `single` mapping (QSS as `mfj`, HoH as `single`); each state's own rules
  go in `STATE_RULES`.
- **Bracket-creep patches for the non-indexing states (owner request):** NY, PA and CT (and any other state whose row has bracket indexing off) hold their thresholds still, so a long
  projection pushes more income into higher brackets than legislatures have historically allowed. Estimate how often and by how much each state has actually raised its
  thresholds and deductions relative to inflation (a periodic adjustment, or a rate cut in place of one), and decide whether to add an optional assumed catch-up (for
  example a periodic reset of the thresholds toward the indexed path) to the unindexed rows. Needs the historical series per state, a before/after on a long-horizon
  scenario for NY, PA and CT, and a switch or default decision. Not built.
- PA 401(k) after retirement (owner-confirmed rule: a 401(k) distribution after retirement is generally exempt at any age, while IRA distributions before 59 and a half are taxable):
  the row taxes every traditional draw before 59 and a half, which overstates PA tax for an early retiree drawing a 401(k). Modeling it needs the 401(k) and IRA split of each
  partner's traditional draw in the tax profile (the account ledger already tracks it) and a `retired` condition. Not built.
- Lagged federal-tax pass cost (7D): Alabama, Missouri (and Oregon, Montana when written) run an extra federal tax computation inside every `taxFor` call; measured +44% (AL) and +87% (MO) on the 1,200 + 360 run benchmark. Decide whether to cache the liability (keyed on the profile and the draw) if the optimizer feels it.
- State EITCs and other refundable earned-income credits (CalEITC, NY EITC, CT EITC) are not modeled in 7C; decide them with the federal EITC (above).
- CA 2026 figures: replace the 2025 figures when the FTB publishes the 2026 schedules (the row is `asOf: 2025`).
- NY real property tax credit and household credit, CA Young Child Tax Credit, and local income taxes are documented gaps.
- 7A birth-year clamp: the bounds are fixed 1950-2100; a typed partial year is saved transiently
  (see the 7A gotchas).
- Batch 8: grid ranges and the default objective are confirmed when it is
  scoped.
