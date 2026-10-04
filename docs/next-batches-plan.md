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
remaining states and DC, one PR) -> 7J (Canada federal credits) -> 7K (all
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
| ACA premium-tax-credit cliff, 400% of FPL (non-enhanced) | `fplForHousehold` x 4 in `conversionMagiCeiling`; `acaNetCost` | MAGI, `acaHouseholdSize` (now incl. children) | Phase 1; household size 7A |
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
| State circuit-breaker and income-tested credits | (7C / 7D) `STATE_RULES` | AGI / income | 7C, 7D |
| Canada: age amount clawback, pension credit | (7J) `personTaxCA` | net income | 7J |
| Canada: provincial credits and clawbacks | (7K) `PROVINCE_RULES` | net income | 7K |
| Canada: GIS / Allowance, CCB, GST/HST credit | (7L) | net family income | 7L |

#### 7B: US federal credits (US V93 -> V97 so far; Canada untouched)

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
| ODC $500 for a qualifying child 17 or older, nonrefundable, not indexed, shares the CTC phase-out; ordering inside the combined credit (reduction off the CTC first, tax absorbs the ODC first) | 7B | S / O (own reading of Schedule 8812) | IRC 24(h)(4), Schedule 8812 lines 11-14 |
| QSS: two years after the death year with a dependent child; QSS thresholds (Social Security base amounts, IRMAA table, senior-deduction phase-out, CTC phase-out) | 7B | U | IRC 2(a), 1(a), Pub. 501, Pub. 915, SSA / CMS IRMAA notice |
| QSS NIIT threshold $250,000 and QSS Additional Medicare Tax $200,000 | 7B | U (own reading) | IRC 1411(b)(1), 3101(b)(2) |
| QSS 65+ standard-deduction add-on is the married $1,650, not the unmarried $2,050 | 7B | U (own reading) | IRC 63(c)(3), 63(f) |
| 2026 HoH brackets (17,700 / 67,450 / 105,700 / 201,750 / 256,200 / 640,600), standard deduction $24,150, 0% / 15% gain bands $66,200 / $579,600 | 7B | S (secondary: q3adv, bradfordtaxinstitute, KPMG for the deduction) | Rev. Proc. 2025-32 section 3 |
| HoH needs a qualifying child (or other qualifying person), paying over half the home cost; a student 19-23 counts | 7B | O | IRC 2(b), Pub. 501 |
| State tax: HoH read as single, QSS as joint, until 7C/7D | 7B | n/a (interim) | each state's forms |
| Survivor files jointly for the year of death (code: step 2, V94); the deceased's own age counts for the 65+ deductions | 7B | U | IRC 6013(a)(3), Pub. 501 |

## Open items

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
- 7A birth-year clamp: the bounds are fixed 1950-2100; a typed partial year is saved transiently
  (see the 7A gotchas).
- Batch 8: grid ranges and the default objective are confirmed when it is
  scoped.
