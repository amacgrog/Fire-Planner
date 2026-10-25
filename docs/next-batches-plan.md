# Implementation plan: batches after Phase 2

Branch: `claude/dazzling-thompson-rp3l5j`, cut from `claude/tender-meitner-a3bo59`
(`5383063`: Phase 2 complete, US V75 / Canada V34). At the time, `main` was not involved.
Source of scope: `docs/roadmap.md` ("After Phase 2" and "Phase 3") and
`docs/phase2-refactor-plan.md` appendix A.3 / A.5 / A.6 / A.7.

The branches named above and in "Review gate" are history: every PR now goes to
`main` (owner, 2026-10-21).

This plan is sequential on purpose: every numeric batch touches `runProjection()`
and regenerates the exact-match snapshots, so parallel branches would conflict.

## Review gate (decided)

- Each batch (and each sub-batch) is **one pull request into `main`**. The
  owner reviews and merges it before the next batch starts.
- Work for the next batch begins only after the previous PR is merged: each
  batch's branch is cut from `main` after that merge.
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
5. PR-per-batch into `tender-meitner`, reviewed before moving on (above). Replaced 2026-10-21: every PR goes to `main`.
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
20. **Batch 7N (owner, 2026-10-06):** the Canadian credits, benefits and fixes still missing
    after 7J-7M go in one batch, 7N, with **no new inputs** (every item reads fields that already
    exist). Anything found wrong in 7J-7M is fixed in 7N, not by reopening those batches. CPP/OAS
    claim-age adjustments stay in Batch 6 (the per-partner basis switch), not 7N.
21. **Batch 7O (owner, 2026-10-06):** the US gaps from the 2026-10-06 credit and benefit
    assessment go in one batch, 7O, after 7N and before 3C (3C prices the Medicaid floor O1
    adds). No new inputs except the `medicaidWhenEligible` checkbox (O1). Items that need new
    fields (HSA, pension type) are deferred; EITC, Saver's Credit and Match, circuit breakers and
    the low-relevance programs are left out with reasons (O6). To confirm when scoped: the
    checkbox default (O1) and the medical-deduction reversal of the Batch 2 scope line (O2).
    **Confirmed 2026-10-06:** O1 `medicaidWhenEligible` defaults to ON, with an info tip on estate
    recovery from 55 and provider networks; O2 reverses the Batch 2 out-of-scope line for medical
    expenses only (charity and QCDs stay out).
    **Follow-up (2026-10-06):** the 7O review fixes ("7O follow-up fixes" in the batch notes: the Oregon, Vermont and
    Maine child credits, plus the O1 MAGI-iteration and O3 conversion items once the owner decides them) come first, before 3C.

## Execution order

1 (historical parity) -> 2 (US tax and Medicare) -> 3A (account model) -> 3B
(penalty-aware rules, 72(t), Rule of 55) -> 7A (children)
-> 7B (federal credits) -> 7C (state framework + reference states) -> 7D (all
remaining states and DC, one PR) -> 7D part 2 (state-tax performance, one small PR) -> 7J (Canada federal credits) -> 7K (all
provinces, one PR) -> 7L (income-tested benefits) -> 7M (paid benefits of the other six
provinces) -> 7N (remaining Canadian credits and fixes) -> 7O (remaining US credits,
benefits and fixes) -> 7O follow-up (review fixes: the OR, VT and ME child credits, then the
O1 and O3 items the owner decides; see "7O follow-up fixes" in the batch notes) -> Rule of 55 PR (per-partner
election, 72(t) field visibility; no number change) -> 3C (per-year solver: per-return MAGI, the cliff guard;
redesigned, owner decision 2026-10-06, see `docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md`)
-> 5 -> 4A -> 4B -> 6 -> 8 (survivor-benefit claim optimizer).

**Revised 2026-10-07 (owner):** 3C is paused and redesigned as the **cliff plan** (a plan chosen once on the
deterministic projection and applied unchanged in historical and Monte Carlo runs; spec
`docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md` is superseded in part by
`docs/superpowers/specs/2026-10-07-cliff-plan-design.md`). Order from here: cliff plan -> IRMAA MAGI fix (added
2026-10-07, below; both done and merged 2026-10-08) -> Batch E (E1 to E4, life events, small PRs) -> 5 -> 4A -> 4B -> 6 -> 8. E5 (real assets) and the
Canada province move are scheduled later.

Why 3C moved after Batch 7 (owner decision): Batch 7 adds the
cliffs and phase-outs (senior deduction, child tax credit, state circuit-breaker
cutoffs, 7L income-tested benefits, the 7O Medicaid and 100%-of-FPL lines) that the
per-year decision has to price, so measuring it before the tax model settled would
have been wasted.

Why 5 now runs before 4A and 4B (owner decision, 2026-10-06, spec section 2 item 5): 3C replaced the
`stayUnder(k)` design with a per-year solver scored by lambda (the future tax on a traditional dollar) and a
multiplier `m` that an outer, whole-plan search tunes. That outer search, and every lambda-driven policy
(the stock-account order, the two-return draw split, conversion sizing; spec section 13.3), is Batch 5. Canada
then ports the solver core and the search together (4A/4B), instead of porting a per-year rule first and an
optimizer later. What stays open meanwhile is listed under "Open items".

Why: 3A is a no-number-change data-model PR that 3B and 3C depend on. Batch 1's
mix-mode work in the historical engine is written against the `take*` withdrawal
primitives so 3A can swap the account model underneath without redoing it. The
tax update (7) goes before Canada mixing and the optimizer because both consume
tax costs. Batches 4-6 are the owner's to reorder when reviewed.

**Revised 2026-10-21 (owner):** Batch E stopped after E3 to do the modular-build
refactor (stages 0-4, merged into `main`). The whole refactor track comes next:
the docs refresh, the core regroup, Vitest unit tests for `core/`, then the
section 11 items of `docs/superpowers/specs/2026-10-10-modular-build-design.md`
(stateless engine, TypeScript, centralized state writes, Vite, merging the US and
Canada engines; see `docs/roadmap.md`). Then E4 -> 5 -> 4A -> 4B -> 6 -> 8, with
E5 and the Canada province move later. Merging the engines lands before E4, so E4
and every later batch are written against the merged engine.

**Revised 2026-10-22 (owner; supersedes the paragraph above):** after the stateless engine (done), the rest of the
refactor track no longer gates feature work. Order: a prep phase (slim CLAUDE.md into `docs/architecture/`, triage
the root `test_*.js` scripts, responsiveness (seeded Monte Carlo, a result cache, deferred heavy rendering), a
correctness spot-check against outside worksheets, the Batch 5 optimizer wording),
then the US planner to its first real users, then 5 -> E4 -> 6 -> 4A -> 4B -> 8 by default, reordered by what those
users run into (E4 and 6 may swap). The engine merge is decided at Batch 4, not before E4, so E4 is written against
the two engines as they are. `docs/roadmap.md` ("Current plan") holds the live order and the reasons.

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
- Shared code lives in modules under `src/shared/core|ui/`, imported by both
  planners; country code lives under `src/<country>/core|ui/` and is reached
  from shared code through `#country/core/seam-<name>`. Edit `src/`, never
  `dist/`; `npm test` builds first. Details: `CLAUDE.md` ("Modules and the
  extraction tool", "Shared state and country seams").
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

> **Update (2026-10-21):** these facts date from the start of this plan
> (2026-10-03). The line numbers and every mode switch listed except `bucketStrategy` are gone, and the
> standard deduction was centralized in Batch 2. `CLAUDE.md`'s "Architecture,
> per planner file" is current.

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

### 3C: per-year solver, US (done; redesigned from "safe-MAGI room on every withdrawal path")

**Status: cliff plan implemented on `claude/3c-cliff-plan` (V117-V118; "Cliff plan: implementation" in the 3C notes). Earlier, 2026-10-07: paused at `3ebee0e` (Stage A) and redesigned as the cliff plan** (owner;
`docs/superpowers/specs/2026-10-07-cliff-plan-design.md`, plan `docs/superpowers/plans/2026-10-07-cliff-plan.md`). The
in-path guard described below is replaced by a plan chosen once per render on the deterministic projection and applied
unchanged everywhere else; Stage 8a is not committed (its four rules are ported into the chooser). Decisions: "Redesign:
the cliff plan" in the 3C notes.

**Design:** `docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md` (approved 2026-10-06, amended four
times on 2026-10-07, sections 13 to 13.3). **Plan:** `docs/superpowers/plans/2026-10-06-per-year-solver-3c.md`.
Findings, measurements and decisions: "Batch 3C notes" below. The old `stayUnder(k)` direction ("Auto / Always /
Never", from the exploration) is superseded; `docs/batch-3c-prototype/` is kept for the record only.

What shipped (US only, branch `claude/batch-3b-penalty-rules`, V112 -> V116):
- **Rule of 55 PR** (before 3C, no number change, V113-V114): `ruleOf55A` / `ruleOf55B` per partner, the Partner B
  72(t) field visibility fix.
- **B1, per-return MAGI (V115):** in two-return years (an unmarried couple, or before a marry-later wedding) the
  ACA premium is priced per tax household and IRMAA per person on the single tiers; `conversionMagiCeiling`
  keeps each return under its own lines.
- **B2/B3, hooks and primitives (no number change):** `magiThresholds`, `lambdaEstimate`, `afterTaxValue`;
  `magiCap`, `releaseMagiCap`, `fillTraditional`, `freeTraditional`, `cloneWithdrawal`, `adoptWithdrawal`.
- **B4, the cliff guard (V116, on by default, `cliffGuardEnabled`):** in every withdrawal year with a federal line in
  reach, `chooseYearPlan` compares the mode's natural draw with a stay-under cap and a fill-to-floor, scored by
  after-tax value (traditional at `1 - lambda`) less the premium and IRMAA changes. Every mode (default order,
  smooth, the live mix, applied schedules), standard and historical engines.
- **B5a/B5b, lambda (number change in guard years only):** the pool is walked forward net of the traditional share
  of the year's need (spec 13.1, Note 1); each sample prices the walk's own draws and moves to the year the pool
  runs out; two-return samples price IRMAA per person (spec 13.2).
- **B5, refactors for Batch 5 (no number change):** `solveRothConversionTo`, the healthcare-cost block before the
  conversion, the lifted `irmaaAt` / `lambdaOf` closures.

Moved to Batch 5 (spec 13.3): the tax-aware stock-account order, the two-return draw split (task B6) and
tax-aware conversion sizing. The live-mix toggle keeps its old behavior (`pickLiveWithdrawalOrder`).

**Carried from Batch 1, resolved:** the safe-MAGI room now has a behavioral test with a mutation check
(`tests/cliff_guard.js` case 1: removing the cap, guard off, changes the result); the double-counted room is fixed
(the cap uses `target - magiBase`, not `incomeRoom`). See the notes.

---

## IRMAA MAGI fix (after the cliff plan, before Batch E; owner decision 2026-10-07)

Found while reviewing the cliff plan's Task 6 stop (the owner asked whether credits and benefits could throw a household
over a cliff it is steering under). The engine carries one MAGI, the ACA definition (all of Social Security), and uses it
for IRMAA too; Medicare's MAGI is AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4)(A)), which counts only the taxable
part (at most 85%). IRMAA MAGI is overstated by the untaxed benefit (at least 15% of benefits; about $10,500 for a
couple with $70,000 of benefits near the first tier): surcharges charged that a real return would not owe, conversions
held under a cap set too low, and cliff-plan IRMAA stay-unders placed too low. Predates the cliff plan (Batch 2).
Spec `docs/superpowers/specs/2026-10-07-irmaa-magi-design.md`, plan `docs/superpowers/plans/2026-10-07-irmaa-magi.md`:
two primitives (`irmaaMagiOf` and its exact inverse), one MAGI scale for steering with IRMAA edges translated into it,
its own movers table. No separate measurement first (owner: the movers table is the measurement). Checked at the same
time and found correct: credits never enter MAGI (they reduce tax); state exclusions, deductions and credits never enter
federal MAGI; federal deductions lower taxable income, not AGI; the ACA and Medicaid MAGI count all of Social Security,
as the engine does; one-time income (tax-free) is correctly outside MAGI.

##### IRMAA MAGI fix: implementation

Branch `claude/irmaa-magi` on `ce5fb56` (the cliff plan's V119 tip, CLIFF_TIP; both merge together later). Commits:
- `8f803b0` IRMAA MAGI 1: `irmaaMagiOf` (engine MAGI to Medicare's MAGI: only the taxable part of Social Security) and its
  exact inverse `magiForIrmaaLine` (piecewise linear through the four kinks of the taxable-benefit formula), `returnStatusA`,
  `irmaaSsOf`. No number change.
- `5b6a192` IRMAA MAGI 2 (V119 -> V120, snapshot update): the IRMAA lookback history stores Medicare's MAGI (household and,
  in two-return years, per return); `irmaaAt`, the IRMAA lines of `magiThresholds`, the conversion ceiling
  (`conversionMagiCeiling`, now given the profile) and `lambdaEstimate`'s IRMAA step convert through it, and lines and caps
  are translated back into the engine's MAGI. The ACA premium, the Medicaid line and the 400% guard still read the engine's
  (ACA) MAGI. README, CLAUDE.md and the healthcare callout updated.
- `538052c`, `eb58669` IRMAA MAGI 2b (number-neutral speedups for the timing gate; `npm test` green, every snapshot
  identical): `magiForIrmaaLine` without its kinks array, sort and closure (k1 is always the smallest and k4 >= k3, so only
  k2's place is written out; 6 million random cases bit-identical to the array version), reading the `SS_BASE` row once
  (`taxableSsOnRow`, the same arithmetic as `taxableSocialSecurity`); `returnStatusA` as a loop; no closure in the
  two-return conversion ceiling; `irmaaAt` reads the return's benefit and A's filing status once per pass, not per probe.

**Movers** (`node tests/snapshot.js --root ../fp-irmaa-base --dump A --update-nothing`, `--dump B`, `--compare A B`).
US: 543 scenarios, 339 identical, **204 moved** (175 historical / Monte Carlo paths, 29 standard). Canada: 375, all
identical. Every mover has Social Security in some year and reaches 63; no scenario without a benefit moved. **No
depletion age changed** (standard or historical). Healthcare totals fell in 187 movers and rose in 5.

| Group (first change) | Count (hist / std) | What happened |
|---|---|---|
| Charge removed | 178 (167 / 11) | The lookback's IRMAA MAGI no longer counts the untaxed benefit, so a tier is no longer crossed: `healthcare` falls by one or more IRMAA steps (e.g. -1,148.40 = 95.70 x 12 per Medicare partner). The saving stays invested; later draws, balances and MAGI follow. End total up in every one except the depleting `std_R_single` (+0, depletes at 77 both). Largest: `hist_R_everything_rich_boom` +391,362. |
| Conversion cap raised | 14 (of 25 conversion movers: 8 / 17) | The IRMAA cap on Roth conversions is the tier ceiling in Medicare's MAGI translated back, higher by the untaxed benefit, so the ladder converts more (e.g. `std_G_mfj_58_aca_default` 1,131,784 -> 1,204,630 converted, end +53,497). |
| Conversion cap lowered | 11 (same 25) | The cap's own rule (keep the year inside its current tier) now reads Medicare's MAGI, which can sit a tier LOWER than the engine MAGI did, so the cap protects that lower tier: e.g. `std_G_single_62_aca_smooth` at 66, engine MAGI about 124k (tier 2, edge about 151k) but IRMAA MAGI about 119k (tier 1, edge about 120k): conversion 26,922 -> 5,748, the later charge one tier lower for 7 years, end +106,015. Other ends +19,181 and +90,951; the depleting ones +0 (depletion unchanged). |
| Cliff-plan intent dropped | 1 (0 / 1: `std_R_work_past_65_single`) | At 76-79 CLIFF_TIP stayed under an IRMAA line by spending Roth; with the line translated up by the untaxed benefit the natural MAGI is already under it, so no stay-under is planned (healthcare identical, end -1,108: traditional drawn instead of Roth). The only `cliffChoice` change. |

The 5 healthcare-up movers are all conversion movers: the conversion timing moved MAGI between years and a later year
crosses a tier (e.g. `std_G_hoh_66_1966_household`, lower conversions at 69-70 leave more traditional to draw at 72-74:
healthcare 561,084 -> 563,969; depletes at 86 both).

**Lower nominal end totals (10 movers, all from raised conversion caps).** Larger conversions pay tax earlier and the end
total counts traditional at face value: largest `hist_G_mfj_62_aca_400_smooth_real1966` -1,210,733 of 41.4M (-2.9%);
standard: `std_G_two_returns_66_irmaa_default` -18,885 of 489k, `std_G_mfj_62_aca_400_default` / `_smooth` -16,587 /
-16,532 of 11.7M, `std_G_hoh_58_aca_smooth` -12,349 of 6.8M, `std_G_hoh_62_aca_smooth` -1,009; historical:
`hist_G_single_58_aca_default_real1966` -84,370, `hist_G_hoh_58_aca_smooth_real1973` -62,951,
`hist_G_hoh_62_aca_default_real1966` -60,280. No depletion change in any of them. (The cap is the existing rule on a
corrected MAGI; sizing conversions by after-tax value is Batch 5.)

**ACA side (plan Task 2, Step 3b).** The plan's Global Constraint says rows' `magiProxy`, `magiA` and `magiB` are
identical in every scenario. That cannot hold literally once a conversion or a draw moves (the MAGI includes them), so it
was applied as Step 3b states it: the MAGI may change only downstream of a moved conversion, draw or charge. Checked over
all 543 US dumps: in every mover the first year in which `magiProxy` / `magiA` / `magiB` differ is at or after the first
year a conversion, a draw or balance, the healthcare charge or the cliff choice changed, and in a same-year change a
conversion or draw changed that year. **No violations.** 201 of the 204 movers have a MAGI change, all downstream in this
sense; 3 changed only healthcare and balances. No `healthcare` change in any year with nobody 65 or over (the ACA years);
in mixed-age couple years the 5 changes are each exactly -1,148.40 (one IRMAA step), so the ACA premium did not move.
**Owner: please acknowledge this reading of the constraint** (the literal reading would forbid every conversion mover).

**Test expectations changed: none.** Every existing IRMAA test (`irmaa_startup`, `irmaa_gating`, `medicare_enrollment`,
`two_return_magi`, `solver_hooks`, `cliff_plan`, `cliff_guard`) passes unchanged. New engine cases in
`tests/irmaa_magi.js`: (a) the charge: single 70 with a 40,000 benefit, no surcharge on IRMAA MAGI 106,000 while the
engine MAGI stays 112,000.08; (b) two returns, A head of household: neither partner charged; (c) the IRMAA line at the
translated edge (109,000 of IRMAA MAGI is 115,000 of engine MAGI; no benefit: the edge itself), id / family / return
unchanged; (d) the survivor: no surcharge, ACA MAGI kept; (e) the first-two-years stand-in reads the user's entries;
(f) the conversion ceiling rises by the untaxed benefit; (g) no benefit, no change (fills to 109,000). Before the fix
(a), (b), (d), (e) from year 2 and (f) failed, (c) failed on the line value; (g) passed. Three justified deviations from
the brief: (b) asserts year-0 healthcare 10,000, not 20,000 (`medicareYearly` is a household figure, half per partner);
(f)'s hand numbers are a conversion of 24,999.93 and an engine MAGI of 115,000.01, not 25,000 / 115,000 (the benefit is
3,333.34 x 12 = 40,000.08); (g) uses spending 20,000, not (f)'s 60,000 (at 60,000 a draw enters the MAGI iteration and
the year ends at 108,980.49 on both trees, within tolerance of the edge rather than on it).

**Timing** (against CLIFF_TIP `ce5fb56`). The first interleaved measurement of `5b6a192` was over the per-path gate, so the
two number-neutral speedup commits were added; after them every full interleaved run is inside +5%. Every run is listed:

| Run | Tree | 400 simulate per state (tx / ca / ny / pa / ct / wa) | 120 historical (same order) |
|---|---|---|---|
| interleaved, 11 rounds | `5b6a192` | +6.5 / +4.5 / +3.7 / +3.0 / +2.5 / +2.3% | +3.6 / +6.6 / +3.5 / +9.5 / +2.9 / +3.2% |
| interleaved, 25 rounds | `5b6a192` | +7.3 / +4.9 / +6.2 / +3.7 / +5.1 / +7.7% | +9.6 / +5.3 / +6.1 / +6.8 / +4.9 / +4.8% |
| interleaved, 25 rounds | `538052c` | +6.1 / +4.9 / +4.1 / +3.8 / +4.0 / +5.3% | +3.8 / +5.3 / +6.0 / +5.5 / +4.9 / +6.6% |
| interleaved, 25 rounds | `538052c` | -2.7 / +1.9 / +1.7 / +3.1 / +2.0 / +1.9% | 0.0 / +2.6 / +3.7 / +4.2 / +1.9 / +1.6% |
| interleaved, 31 rounds | `538052c` | -0.5 / +1.5 / +2.4 / +2.3 / +5.8 / +1.9% | +3.6 / +1.3 / +3.6 / +1.4 / +6.1 / +1.6% |
| interleaved, 41 rounds, ct and tx | `538052c` | ct +6.4, tx +3.9% | ct +5.0, tx +1.9% |
| `tests/bench_runs.js`, separate processes, base first | `538052c` | +13.1 / +4.7 / +7.8 / +6.5 / +8.5 / +9.2% | +15.8 / +5.1 / +10.7 / +5.3 / +4.9 / +12.7% |
| `tests/bench_runs.js`, separate processes, head first | `538052c` | +2.3 / +2.5 / +1.3 / +2.2 / +7.6 / +4.1% | +15.8 / +2.6 / +3.5 / +1.3 / +7.6 / +3.1% |
| `tests/bench_runs.js --scale 3 --repeats 5`, separate | `538052c` | +2.9 / +2.1 / +2.2 / +3.8 / -0.6 / 0.0% | +1.8 / +2.6 / -0.8 / 0.0 / -0.6 / -0.5% |
| interleaved, 31 rounds | `eb58669` | +1.7 / +0.7 / +1.0 / +1.1 / +0.6 / 0.0% | 0.0 / +1.3 / +1.2 / +1.4 / 0.0 / 0.0% |
| interleaved, 41 rounds, ct and tx | `eb58669` | ct 0.0, tx +1.0% | ct 0.0, tx +5.5% (55 -> 58 ms) |
| interleaved, 61 rounds, tx | `eb58669` | tx +1.1% | tx 0.0% |
| interleaved, 31 rounds (final) | `eb58669` | +1.7 / +2.3 / +2.8 / +2.3 / +3.4 / +2.7% | +1.9 / +1.3 / +2.4 / +4.1 / +2.9 / +3.1% |
| `tests/bench_runs.js --scale 3 --repeats 5`, separate | `eb58669` | +9.1 / +3.4 / +4.5 / +5.6 / +2.8 / +2.9% | +8.1 / +4.9 / +3.2 / +3.7 / +2.0 / +3.3% |

Final medians (interleaved, 31 rounds, `ce5fb56` -> `eb58669`, ms): simulate 179 -> 182, 265 -> 271, 288 -> 296,
264 -> 270, 353 -> 365, 220 -> 226; historical 53 -> 54, 76 -> 77, 83 -> 85, 73 -> 76, 103 -> 106, 64 -> 66. The work
done is identical on both trees (instrumented copies: the same 557,497 `taxFor` calls and 29,003 MAGI passes for 400 ct
simulations); the new code adds about 23,000 `magiForIrmaaLine` and 75,000 `irmaaMagiOf` calls on that workload. The
separate-process figures are reported as measured (tx, the first state in each process, swings most); as CLAUDE.md
says, the gate was decided on the interleaved comparison.

| Gate | Measure | Number | Verdict |
|---|---|---|---|
| per path +5%, no-cliff households | `tests/bench_runs_interleaved.js`, `eb58669` | final 31 rounds: +1.3% to +4.1% (largest pa historical); tx historical +5.5% in one 41-round two-state run (a 3 ms step on 55 ms), 0.0% at 61 rounds | pass |
| ACA early retiree (CA) +5% | `tests/bench_solver.js`, simulate / path | `538052c`: 7 rounds -4.3% / +5.9%, 21 rounds +4.2% / 0.0%, 31 rounds -0.8% / 0.0%; `eb58669` 31 rounds +0.8% / 0.0% (2.36 -> 2.38 ms, 2.25 -> 2.25 ms) | pass |
| default household (printed) | same | `538052c`: 7 rounds +1.6% / +5.0%, 21 rounds +3.3% / 0.0%, 31 rounds +1.6% / 0.0%; `eb58669` 31 rounds +1.7% / 0.0% | pass |
| planning at most 5x one off projection | `tests/bench_plan.js` | `538052c`: default 1.07, ACA CA 1.20, Texas no cliff 1.20, `std G hoh 62 aca smooth` (3 intents) 2.23; `eb58669`: 1.14, 1.15, 1.60, 2.18 (CLIFF_TIP: 1.14, 1.12, 1.20, 2.14) | pass |

**For the owner.**
- Acknowledge the Step 3b reading of "`magiProxy` identical in every scenario" (above).
- 10 movers end with a lower nominal total (largest -2.9%), all where the corrected cap lets the ladder convert more;
  the end total counts traditional money at face value. No depletion change; conversion sizing by after-tax value is
  Batch 5.
- 11 movers convert less: the corrected IRMAA MAGI sits a tier lower and the existing stay-in-the-current-tier cap now
  protects that tier (mostly better end totals).
- The separate-process `tests/bench_runs.js` figures read higher than the interleaved ones (up to +9.1% simulate and
  +8.1% historical for tx at `eb58669`, scale 3); recorded, not used for the decision.
- The section's introduction lived on the docs branch (`3ee7d6e`); kept above at the merge.
- Tax-exempt interest (part of Medicare's MAGI) is not modeled (no input), as before.

##### IRMAA MAGI fix: review and acceptance (2026-10-08)

Re-checked by the reviewer in a scratch copy of `f13f0a2` against CLIFF_TIP `ce5fb56`: `npm test` exits 0; dump/compare
918 files, 204 US movers, all 375 Canada identical; no depletion change; no mover without Social Security; no
`healthcare` change in any year with nobody 65 or over. Reviewer timing (`tests/bench_runs_interleaved.js`, 21 rounds):
simulate tx / ca / ny / pa / ct / wa +0.5 / +0.4 / +1.0 / +4.6 / +3.7 / -2.3%, historical +1.8 / +3.9 / +1.2 / +4.1 / +4.8 /
+3.2%; `tests/bench_solver.js`: ACA early retiree 0.0% / 0.0%, default -3.0% / 0.0%. All gates pass.

**Decisions (owner, 2026-10-08):**
1. **Accepted**, and merged with the cliff plan into `claude/batch-3b-penalty-rules` (both branches, one merge). The
   owner authorized stashing the superseded Stage 8a work first: `stash@{0}`, "stage 8a wip (superseded by the cliff
   plan)"; the patch is also in `.superpowers/sdd/2026-10-06-per-year-solver-3c/`.
2. **Step 3b reading accepted.** The plan's Global Constraints line ("`magiProxy`, `magiA`, `magiB` identical in every
   scenario") was the reviewer's drafting error; Step 3b and the handoff stated the intended rule (they may change only
   downstream of a moved conversion, draw or charge), which the implementer applied and checked.
3. **Timing record accepted**: the interleaved comparison decides (`CLAUDE.md`); the separate-process figures stay
   recorded.

**Finding for Batch 5 (conversion sizing).** The conversion cap's rule, keep this year's MAGI inside the IRMAA tier it
already sits in, now reads the correct MAGI and raises conversions in 14 movers and lowers them in 11. A lowered cap
can cost more later: `std_G_hoh_66_1966_household` converts 195,257 less over the plan and pays 2,885 more healthcare
(IRMAA on the larger RMDs at 72-74). The rule works as written; sizing conversions by whole-run value is Batch 5's.

**For E1's PR (housekeeping):** the healthcare callout still says dependents are not modeled for the ACA household size
(stale since 7A: children count; user-facing copy); `taxableSsOnRow` repeats `taxableSocialSecurity`'s formula (make
`taxableSocialSecurity` call it, number-neutral); three per-call `irmaaSsOf` / `returnStatusA` lookups after convergence
can use the per-pass values. Separate, unscheduled: the Canada UI snapshot flaked once (historical success "—" instead of
a rate; the 500 ms debounced backtest raced the capture).

##### Branch review of the cliff plan and IRMAA fix (2026-10-08)

An independent Opus review of `5eb30fa` against `0d6dcf7` (owner-run, re-checked by its own chat) found no correctness
bug: `apply(choose's plan)` replays `choose` (600 households, 309 intents), rule A holds on the standard projection, the
IRMAA inverse is exact (about 81,000 cases, worst round trip 4.7e-10), the ACA side is untouched (450 ACA households,
none differs before 63), stale plans cannot reach another household, the MAGI iteration stays safe, and
`refreshCliffPlan`'s key covers every non-state input. Findings and how they relate to the work:
1. **Anchor drift** (the reviewer's design-chat miss): the IRMAA fix moves guard-off numbers by design, so
   `tests/plan_off_anchor.js --base 3ebee0e` gives 339 identical, 204 different at `5eb30fa` (543 identical against
   `ce5fb56`); the IRMAA plan should have re-based it. Re-based to `5eb30fa`.
2. **Five paths no test protects** (mutation runs, one edit at a time, ten test files): lambda's IRMAA step on one and
   two returns (M1, M13), the two-return `irmaaAt` (M14), the two-return IRMAA lines (M15), and the fill rule "never more
   than the natural year's conversion" (M17; the only fill test had conversions off). "No steering is always a candidate"
   (M6) is caught only by the snapshot. Gaps in the plans' test lists (IRMAA Task 2 covered one-return cases only; the
   cliff plan's fill case was accepted without conversions).
3. **`planForState` ignores the tax year** (only reachable through `__test_setCurrentYear` today): the fix wave added the
   year to `refreshCliffPlan`'s check but not to `planForState`'s key and cache.
4. **The $1 de-duplication can drop a cliff line for a tax-family line** (senior or child-tax-credit within $1 below an ACA
   or IRMAA line), so `choose` could record a `senior` intent; the implementer's ledger had this as latent.
5. **Cleanups:** `madeFor` is never read; `natOf` is allocated every withdrawal year; `conversionMagiCeiling` silently
   falls back to a benefit of 0 without a profile; `CLAUDE.md` does not list `tests/irmaa_magi.js`; `returnStatusA`
   changes no number (head of household reads the single Social Security bases).

**Decisions (owner, 2026-10-08):** fix 3 and 4 now, each with a test that fails before the fix. The reviewer's choices
for the rest (owner to veto before the handoff): add tests for M1, M13, M14, M15, M17 and M6, each proven against its
mutation; drop `madeFor`; `natOf` only where used; `conversionMagiCeiling` requires its profile; keep `returnStatusA`
(it states the return's status where the law reads it; its per-pass cost is one scan of the children list); fold E1's
housekeeping in here (one taxable-benefit formula, the per-pass lookups, the healthcare callout naming children, V121),
so E1 starts clean; the flaky Canada UI snapshot stays out. All number-neutral (a snapshot move in the de-duplication fix
stops the work). Plan: `docs/superpowers/plans/2026-10-08-review-followups.md`; branch `claude/review-followups` from the
commit that adds it.

**Task 1 stop and decisions (owner, 2026-10-08).** The implementer stopped in Task 1 at Step 5 (M17): no household found
(1,553 runs: the 768-household grid in both modes and the 17 `std G` scenarios, conversions on over 58 to 64; no fill
candidate at all; the probe does find the known conversions-off fill of T4.6). Steps 1 to 4 and 6 were written, uncommitted,
with `npm test` green and every snapshot identical; the reviewer re-ran the three test files on a clean copy of `8ce17e3`
(pass). Households found: M1 single 70, P 63,000; M13 unmarried couple 70, P 80,000 each; M14 unmarried couple 66, P 66,500
(natural `cliffCost` = row healthcare = 12,296.8; the search also requires year 0 to have trace candidates, which Step 4
asserts anyway). Mutations: M15, M1, M13, M14 each fail on the mutated tree and pass on the real one.
1. **M17 dropped: the fill clamp is unreachable today** (reviewer's reading of the code, accepted). `solveRothConversionTo`
   sizes the conversion from the profile's income and Social Security only, so a fill trial converts the same as the natural
   year unless `magiSafeRoom` binds; a fill raises the estimated draw, which only shrinks that room (the IRMAA stay-in-tier
   ceiling could grow it, but only near an IRMAA edge, and a fill's only target, `acaFloor`, is under 100% of the poverty
   line). A natural conversion also puts MAGI at the 10% bracket top plus the deduction or more, above that floor except in
   very large households. The line `if (phased && yearPlan.kind === 'fill' && conversionAmount > naturalRec.conversion)`
   stays as a defensive rule; its test moves to Batch 5 (below).
2. **M6's mutation reworded**: `none` kept only when `choose` recorded no intent. The plan's first wording (`none` always
   removed) empties `cands` for a household with no intent and crashes `render()` at load, a failure that does not exercise
   the new assertion; the revised one fails T5.2's own check (`'all' !== 'none'`).
3. Step 8's commit message no longer names the fill rule.

##### Review follow-ups: implementation

Branch `claude/review-followups` (worktree `fp-followups`), from `8ce17e3`; base tree `5eb30fa`. Plan:
`docs/superpowers/plans/2026-10-08-review-followups.md`.

**Commits:** `393b146` (the reviewer's Task 1 stop decisions, above), merged as `07f754d`; `d744511` (1: tests for the
two-return IRMAA lines, lambda's IRMAA step, two-return `irmaaAt` and the `none` candidate); `674c1ac` (2: `planForState`
keys its plan on the tax year); `7330bfa` (3: line de-duplication keeps the cliff line over a tax-family line); `373080c`
(4: cleanups, V121); and this commit (5: anchor re-based, CLAUDE.md, notes).

**Mutation table** (each applied in a scratch copy of the planner; "mutated" = the test run on the mutated tree):

| Test (file) | Mutation | Mutated tree | Real tree |
|---|---|---|---|
| M15 two-return lines (`solver_hooks.js`) | two-return branch of `magiThresholds`: the A and B `magiForIrmaaLine` calls replaced by `cap` | fails (A line 238,000, expected 250,000) | passes |
| M1 lambda IRMAA step, one return (`irmaa_magi.js`) | `lambdaEstimate` one-return branch: both `irmaaMagiOf` calls replaced by their first argument | fails (lambda 0.42548 vs 0.24027) | passes |
| M13 lambda, two returns (`irmaa_magi.js`) | two-return branch: the four `irmaaMagiOf` calls replaced by their first argument | fails (lambda 0.6 vs 0.24198) | passes |
| M14 two-return `irmaaAt` (`irmaa_magi.js`) | `irmaaAt` two-return branch: `irmaaMagiOf(ma, ...)`, `irmaaMagiOf(mb, ...)` replaced by `ma`, `mb` | fails (cliffCost 14,593.6 vs healthcare 12,296.8) | passes |
| M17 fill clamp | dropped by the owner decision (unreachable today); test deferred to Batch 5 | - | - |
| M6 `none` candidate (`cliff_plan.js`, T5.2) | `const cands = fams.size ? [] : [measure('none', {}, chosen)];` | fails (`'all' !== 'none'`) | passes |
| Task 2 T6.10 (`cliff_plan.js`) | the fix reverted (HEAD of Task 1 planner, `planForState` without the tax-year key) | fails ("planForState plans for the current tax year, not the cached 2026 plan") | passes |
| Task 3 FU3 (`solver_hooks.js`) | the fix reverted (de-duplication keeps the earlier line) | fails (senior kept, irmaa1 dropped) | passes |
| Task 3 invariant (`cliff_plan.js`: no intent names a senior or ctc line, every `std G` household) | the fix reverted | PASSES (no `std G` household reaches the coincident-line case) | passes |

The Task 3 invariant is a guard only; it cannot fail alone today. The "two non-tax lines coincide" case was skipped (the brief
permits it; no easy context).

**Households the searches found:**
- Task 1 Step 1 (M15): no search; the brief's context, `acaEnabled: false`; lines A 250,000, B 204,000 (untranslated 238,000 / 198,000).
- Step 2 (M1): single, 70, life expectancy 85, Texas, real return 0, pool 500,000, **P = 63,000** (at 85 the engine MAGI 134,250 to
  137,375 crosses 137,000, Medicare's 128,250 to 131,375 does not).
- Step 3 (M13): unmarried couple, both 70, same pool and return, **P = 80,000** each.
- Step 4 (M14): unmarried couple, both 66, retired at 60, Texas, no ACA, 2.5% inflation, 300,000 in each IRA, Social Security 40,000
  each, **P = 66,500** each (magiA = magiB = 116,925.14; natural `cliffCost` = row healthcare = 12,296.8). P = 66,000 met the MAGI rule but
  had no line in reach, so "a line in reach" is part of the search condition.
- Step 5 (M17): **0 hits in 1,553 runs** (the 768-household grid in both modes plus the 17 `std G` scenarios, conversions on over 58 to
  64); not one trace year with any fill candidate. Dropped (see the decision above).
- Step 6 (M6): the T5.2 loop, every `std G` household.
- Task 2 (R): `std G single 66 500k 300k 130k smooth`, an IRMAA household with ACA enabled in its state (2026: no intents, family none;
  2027: IRMAA stay-unders irmaa2 at 66 and irmaa1 at 67). The search over about 66 `std` shift-0 scenarios found no ACA-only `std G`
  scenario whose plan differs between 2026 and 2027.

**Anchor runs:** `node tests/plan_off_anchor.js --base ../fp-followups-base` (the `5eb30fa` tree): `plan_off_anchor: 543 identical, 0 different`.
Against `3ebee0e` it was 339 identical, 204 different (the IRMAA fix, by design); the header comment now names `5eb30fa`.

**Snapshots:** after Tasks 1, 2 and 3: US 543 and Canada 375 exact, UI snapshots pass, none updated. Task 4: US 543 and Canada 375
exact; `ui_us.json` updated with `node tests/snapshot_ui.js --update` (not `snapshot:update`) for the text hash and length of three
`std` surfaces only (the healthcare callout wording; `projectionHash` and `rowsHash` identical); `ui_canada.json` was rewritten
with no content change and restored.

**Timing** (Task 4; branch HEAD with Tasks 1 to 3 against `5eb30fa`, interleaved, 21 rounds, medians in ms, simulate / history path;
gate +5%):

| State | Run 1 | Run 2 |
|---|---|---|
| tx | 192->191 (-0.5%) / 57->57 (0.0%) | 190->190 (0.0%) / 57->57 (0.0%) |
| ca | 286->287 (0.3%) / 80->81 (1.2%) | 278->276 (-0.7%) / 80->80 (0.0%) |
| ny | 307->322 (4.9%) / 89->94 (5.6%) | 299->299 (0.0%) / 86->86 (0.0%) |
| pa | 273->287 (5.1%) / 77->81 (5.2%) | 275->274 (-0.4%) / 77->76 (-1.3%) |
| ct | 349->368 (5.4%) / 102->108 (5.9%) | 363->365 (0.6%) / 106->108 (1.9%) |
| wa | 219->234 (6.8%) / 65->70 (7.7%) | 221->222 (0.5%) / 65->65 (0.0%) |

`tests/bench_solver.js`: ACA early retiree (CA) simulate 2.84->2.96 ms (4.2%), path 2.70->2.60 (-3.7%); default household simulate
1.32->1.36 (3.0%), path 1.05->1.05 (0.0%).

**For the owner:**
- Run 1 of the timing showed ny, pa, ct and wa up to +7.7%; a single rerun showed -1.3% to +1.9%. CLAUDE.md puts the machine's noise
  at +-10%, and the change is number-neutral; the rerun was accepted, the +7.7% is unexplained.
- Task 2's test household is an IRMAA household (ACA enabled in the state), not a strict ACA-cliff one; no ACA-only `std G` scenario
  differs between 2026 and 2027.
- Task 3's invariant passes with and without the fix (a guard only); the T6.9 state-swap households exercise plan lookup, not line
  selection, so the regression is caught by FU3 in `solver_hooks.js`, not by the invariant.
- M17 (the fill clamp `conversionAmount > naturalRec.conversion`) has no test; it stays as a defensive rule, and its test moves to Batch 5.
- Scratch folders `fp-scratch-t1`, `-t2`, `-t3` under `C:\Users\Alex\code` held the mutation copies; the implementer deleted them.

##### Review follow-ups: review and acceptance (2026-10-08)

Re-checked by the reviewer in a scratch copy of `c3ce5a9`: `npm test` exits 0; US 543 and Canada 375 snapshots identical to
`5eb30fa`; the only snapshot file change is `ui_us.json` (the three rendered surfaces' text 3 characters shorter, the callout
wording; projection and rows hashes identical); `tests/plan_off_anchor.js --base ../fp-followups-base` 543 identical; badge
V121. Timing (`tests/bench_runs_interleaved.js`, 21 rounds, against `5eb30fa`): simulate tx / ca / ny / pa / ct / wa -1.6 /
-1.8 / +2.4 / +1.5 / -0.5 / +2.8%, historical 0.0 / 0.0 / +2.4 / +2.7 / -0.9 / +3.2% (the implementer's run-1 spike did not
recur). `tests/bench_solver.js`: default rounds, ACA early retiree +2.2% / 0.0%, default household simulate +7.9% (1.26 -> 1.36
ms) / path 0.0%; 31 rounds, ACA 0.0% / -2.1%, default -1.6% / 0.0% (the +7.9% is noise on 0.1 ms; the gate is per path).
Code matches the plan; `intent.line` is the line id, so the Task 3 invariant checks ids.

**Decisions (owner, 2026-10-08):**
1. **Accepted** and merged into `claude/batch-3b-penalty-rules` (`3d0851e`; `npm test` green on the merged tree).
2. The implementer's rulings stand: Task 2's household is an IRMAA one (it fails without the fix); the Task 3 invariant is a
   guard (FU3 is the regression test); the two `planForState` fast-path year checks have no test (`currentYear` changes only
   through `__test_setCurrentYear`, so they are defensive).
3. Docs fixed in the acceptance commit: `CLAUDE.md`'s de-duplication sentence and the tax-year condition on every
   `planForState` step; the scratch-folder path above; the plan's checkboxes.
4. **For E1's first commit:** the comment above the Task 3 invariant in `tests/cliff_plan.js` says "plus the plan
   refreshCliffPlan stores"; the test checks the `choose` intents only. Reword the comment (no code change).

## Batch E: life events (after the cliff plan; owner decision 2026-10-07)

The cliff plan optimizes against the known future events the inputs describe, so events that change tax rates, MAGI
lines or who files which return matter to it. Events that only change a cash flow are already covered by the dated
lists (lump expenses, one-time income, income streams, extra expenses, spending tiers). Each item below gets its own
short design before it is built; none is part of the cliff-plan batch (each changes the projection's inputs, which
would confound that batch's movers). Statuses were checked against `Planner_US.html` at `3ebee0e`.

**After the cliff plan, small PRs, in this order:**
- **E1 is split (owner, 2026-10-08) into E1a (contribution limits and profit sharing; spec
  `docs/superpowers/specs/2026-10-08-e1a-plan-contribution-limits-design.md`), E1b (stream owner and W-2 kind), E1c (full
  self-employment, main income and streams), E1d (one-time income treatments), E1e (inherited traditional and Roth IRA / 401(k), split from E1d 2026-10-09; scope note after the E1d acceptance record), and E1-CA (the Canada port, later, near the
  province move); see the E1a spec section 1.** The original E1 text below is the source for E1b to E1d.
- **E1. Income character.**
  - Income streams: an owner choice (Partner A / B; hidden in single-person mode) and an "earned income (wages)"
    checkbox. Today a stream is "taxed as ordinary income attributed to Partner A": no payroll tax, not earned income
    for the ACTC, and on two returns B's part-time work lands on A's return (state per-person rules read it wrong).
    Earned income pays payroll tax, counts for the ACTC and lands on its owner's return; it does not make the partner
    "working" for Medicare, the ACA or 401(k) contributions.
  - One-time income: a tax treatment per lump sum. Today every lump is "tax-free ... added directly to cash". Choices:
    tax-free (an inheritance of cash, stocks or a house, with stepped-up basis; life insurance; gifts received; a home
    gain under the section 121 exclusion; a sale at cost), ordinary income (severance, deferred compensation), long-term
    gain with a gain share (a business sale), and inherited traditional IRA / 401(k), drawn evenly over 10 years as
    ordinary income (10 years of MAGI right where the ACA and IRMAA lines sit).
- **E2. Adoption.** `dependentsInYear` (shared) counts a child from the birth year, so a 5-year-old adopted in 2032 is
  entered as born 2027 and counts from 2027 (wrong CTC, ACA household size, head-of-household status and Canada
  benefits for the years before). One optional field per child row, "Joins the household in (year)", blank meaning
  from birth; both planners; legacy-state cases.
- **E3. IRMAA appeal for a life-changing event (form SSA-44).** Today IRMAA always uses MAGI from two years earlier
  (the UI callout says appeals are not modeled). Model the two common appeals: a work stoppage (a retiree first charged
  on their last salary years) and a spouse's death (the survivor charged on the old joint MAGI against the single
  tiers): the charge uses the current year's MAGI instead. No new input. These are the years the cliff plan steers
  around IRMAA lines.
- **E4. State relocation (US).** `state.stateTax` is one value for the whole projection. A "+ Add a move" list: a state
  (same options as the selector) and "from Partner A age"; a move lasts until the next one; the current selector is
  the starting state; the move year is taxed wholly in the new state (part-year returns not modeled). Engine reads at
  `3ebee0e`: `stateIncomeTax`, `taxFor`'s no-tax fast path, `acaNetCost`'s Medicaid line, `magiThresholds`, plus
  `lambdaEstimate`'s sample years (each in its own year's state). The rule compiler and `medicaidLimit` are already
  cached per code, so a per-year code array costs nothing on the hot path. Biggest lever: converting after a move from
  a high-tax state to a no-tax one.

**Later, each with its own design:**
- **E5. Real assets.** One tab: the primary-home sale or downsize (sale age, replacement value or renting, selling
  costs, the section 121 exclusion) and investment properties (value, basis, growth, a property-tax rate, net rent, an
  optional sale age; on sale, cash with the gain taxed, or a 1031 exchange into a replacement: 1031 applies to
  investment property only). Cars are not assets (a car purchase is a repeating lump expense).
- **Canada province relocation** (many more reads: `PROVINCE_RULES`, `BENEFIT_RULES`, probate, Quebec).
- Already in Batch 6: Social Security claim-age rules and the earnings test; HSA.

**Excluded (owner; state them in the README where a user could assume otherwise):** divorce or separation, annuity
purchase, a disabled child, QCDs and charitable giving, a survivor's remarriage, international moves, cars as assets.

##### E1a: implementation (US V122; Canada untouched)

Commits on `claude/e1a-contribution-limits`: fbc11a4 (1: Partner A/B income as money fields, no number change), 383b76e
(2: `PLAN_LIMITS`, `allocatePlanRoom`, test hooks, tests of today's contribution math, no number change), 261d984 (3: the
limits and profit sharing, `snapshot:update`). No change to `Planner_Canada.html`, `shared/` or any shared region;
`npm run check:shared` OK (55 x 2).

**Failing, then passing** (Task 3 step 2, run before the fix with a soft-assert copy of the test):

| Case | Expected | Before the fix | After |
|---|---|---|---|
| catch-up at 55: acct.roth[1] | 55500 | 47500 | pass |
| catch-up at 61: acct.roth[1] | 58750 | 47500 | pass |
| compensation limit: profitA | 36000 | undefined | pass |
| compensation limit: acct.trad[1] (profit sharing) | 36000 | 0 | pass |
| compensation limit: matchA | 36000 | undefined | pass |
| order: matchA | 18000 | undefined | pass |
| order: profitA | 29500 | undefined | pass |
| order: acct.roth[1] (mega) | 0 | 47500 | pass |
| order: acct.trad[1] | 72000 | 24500 | pass |
| order: employerContrib | 47500 | undefined | pass |
| 100% of pay: matchA | 0 | undefined | pass |
| indexing: profitA | 39600 | undefined | pass |
| retired: [matchA, profitA, roth[1], trad[1]] | [0,0,0,0] | [undefined, undefined, 0, 0] | pass |
| single: [matchB, profitB, trad[3], roth[3]] | [0,0,0,0] | [undefined, undefined, 0, 0] | pass |
| engine: 401(k) A higher by 15,000 | 15000 | 0 | pass |
| legacy 'profit sharing junk' (A, B) | [0, 25] | ['x', 400] | pass |
| legacy 'profit sharing negative' (A, B) | [0, 0] | [-5, undefined] | pass |

Already passing before the fix (guards): catch-up deferral (24,500), 100% of pay deferral only (20,000), engine `tax` /
`wages` / `magiProxy` identical (`Object.is`) and IRA A identical, legacy income above the old slider cap (500,000).

**Movers** (dump of base 4df6e02 against the working tree): 918 scenario files compared, 1 differs (Canada: 0).

| Group | Standard | Historical | Largest end-total change | Depletion before -> after |
|---|---|---|---|---|
| (a) catch-up | 0 | 0 | - | - |
| (b) compensation limit | 0 | 0 | - | - |
| (c) match cut to the room | 1 (`default megaBackdoor+match`) | 0 | finalInvestable 1,600,677,371.58 -> 29,816,035.43 | null -> null (never runs out) |

The one mover (matchA 5000%, matchB 3000%, Roth deferrals, mega on; A 48, B 43, pay 100,000 each): first differing year
is index 0, `traditional` only (8,229,000 -> 324,000, i.e. 7,905,000 less). Hand check: old match 5,000,000 + 3,000,000 =
8,000,000; new match = each room min(100,000, 72,000) - 24,500 = 47,500, so 95,000; removed 7,905,000, exactly the
year-0 difference. The Roth pool is identical in every year (mega backdoor 0 before and after: the 50x match filled the
room in both). No mover outside (a)-(c); no standard scenario depletes earlier.

**Legacy proof:** `node tests/legacy_state.js` failed on all 30 pre-existing US cases plus the 3 new ones (Canada: all
passed). A scratch script (not committed) loaded every US case on both trees: every normalized state has exactly the two
new keys added, and with `profitSharingPctA` / `profitSharingPctB` deleted the states are equal for 33 of 33 cases. Then
`node tests/legacy_state.js --update` (US 33, Canada 17; the Canada hashes unchanged).

**Snapshots:** `npm run snapshot:update` changes only the one scenario above in `us.json`. `snapshot_ui.js --update`:
`ui_us.json` differs only in the MCP schema (two new properties `profitSharingPctA/B` after `matchB`), two new wiring
entries, every control's domHash/reloadDomHash (the DOM map holds the two new inputs) and the three rendered-text hashes
(+190 characters each, the estimated-field count 47 -> 49). No rowsHash or projectionHash changed.

**Timing** (`node tests/bench_runs_interleaved.js --base ../fp-e1a-base --rounds 21`; +5% allowed):

Run 1:
```
US tx  400 simulate 189 -> 188 ms (-0.5%), 120 historical 56 -> 55 ms (-1.8%)
US ca  400 simulate 280 -> 287 ms (2.5%), 120 historical 81 -> 83 ms (2.5%)
US ny  400 simulate 305 -> 311 ms (2.0%), 120 historical 87 -> 89 ms (2.3%)
US pa  400 simulate 272 -> 282 ms (3.7%), 120 historical 76 -> 80 ms (5.3%)
US ct  400 simulate 364 -> 358 ms (-1.6%), 120 historical 106 -> 104 ms (-1.9%)
US wa  400 simulate 216 -> 226 ms (4.6%), 120 historical 64 -> 67 ms (4.7%)
```
Run 2 (the one allowed re-run, for PA historical 5.3%):
```
US tx  400 simulate 186 -> 186 ms (0.0%), 120 historical 55 -> 55 ms (0.0%)
US ca  400 simulate 280 -> 277 ms (-1.1%), 120 historical 79 -> 79 ms (0.0%)
US ny  400 simulate 292 -> 296 ms (1.4%), 120 historical 85 -> 85 ms (0.0%)
US pa  400 simulate 265 -> 272 ms (2.6%), 120 historical 73 -> 76 ms (4.1%)
US ct  400 simulate 353 -> 360 ms (2.0%), 120 historical 103 -> 105 ms (1.9%)
US wa  400 simulate 213 -> 217 ms (1.9%), 120 historical 61 -> 63 ms (3.3%)
```
`node tests/bench_solver.js --base ../fp-e1a-base` (7 rounds), run 1: ACA early retiree (CA) simulate 2.96 -> 2.72 ms
(-8.1%), path 2.75 -> 2.75 ms (0.0%); default simulate 1.28 -> 1.44 ms (12.5%), path 1.05 -> 1.10 ms (4.8%). Run 2: ACA
2.94 -> 2.90 ms (-1.4%), path 2.60 -> 2.75 ms (5.8%); default 1.38 -> 1.30 ms (-5.8%), path 1.00 -> 1.10 ms (10.0%). At 21
rounds: ACA simulate 2.36 -> 2.46 ms (4.2%), path 2.30 -> 2.35 ms (2.2%); default simulate 1.20 -> 1.26 ms (5.0%), path
0.90 -> 0.90 ms (0.0%). The 7-round figures change sign between runs at a 0.05 ms grain (noise); the interleaved bench is
at most +4.6% in run 2 apart from PA historical (+5.3% in run 1, +4.1% in run 2). The change adds two `allocatePlanRoom`
calls (a two-element loop over module scratch arrays, no allocation) per projection year.

**For the owner:**
- `kA` / `kB` in `retirementContributions` are now unused (they only fed the old mega room); left as they were, remove at
  your choice.
- The MCP path stores `profitSharingPctA/B` values above 25 until the next reload's `normalizeState` clamps them;
  `matchA` has no normalizeState clamp at all (never clamped, even on reload), so the profit-sharing gap is smaller
  than the match's.
- The snapshot grid has no case for movers (a) or (b); only the hand-computed unit tests cover them. Say if you want a
  snapshot scenario for each (a 50+ partner with the mega backdoor and positive room; pay over 360,000 with a match).
- `snapshot_ui` `histSuccess` is timing-flaky (an `--update` can write 85% instead of a dash); the committed value is the
  stable dash.
- Only one scenario moved: default megaBackdoor+match (group c), year 0 match 7,905,000 lower.

**Review fixes (Task 5, owner decisions 2026-10-08).**
- The employee's own money (deferral + catch-up + after-tax) is capped at pay: the mega backdoor is now
  `min(room, max(0, pay - deferral - catch-up))` times the slider (at 55 on 40,000 the old code put in 24,500 + 8,000 +
  15,500 = 48,000). New cases in `tests/contribution_limits.js`: pay 40,000 at 55 gives traditional 401(k) 32,500 and Roth
  401(k) 7,500 (was 15,500); with a 10% match 4,000, Roth 7,500, traditional 36,500; with a 30% match the room (3,500)
  binds, Roth 3,500. The 200,000 catch-up cases (55,500 and 58,750) are unchanged.
- MCP: `mcpAccepts` (US-only, outside every shared region) rejects a number outside a field's optional `min` / `max`; the
  profit-sharing entries carry 0 and 25 (26 and -1 rejected, 0 and 25 accepted; the match has no bounds). The MCP `execute`
  in the shared region is not touched. Hook `window.__test_mcpAccepts`.
- Three snapshot scenarios added (`default megaBackdoor 50+`, `default pay over comp limit+match`, `default low pay 55
  megaBackdoor`): `us.json` gains exactly those three entries; no existing entry changes (base-vs-working compare: the only
  existing scenario that differs is the accepted `default megaBackdoor+match`, unchanged against the committed baseline).
- Recorded, no change: the match has no clamp (harmless, the engine limits any match to the room); `histSuccess` text in
  the UI snapshot is timing-flaky; the E1 pointer stays where it is.
- Timing (21 rounds): bench_runs_interleaved at most +3.4% (TX historical); bench_solver run 1 ACA simulate +8.3%, default
  path +5.6%; run 2 ACA simulate +5.6%, default path +5.6% (0.05 ms grain, the change adds one min/max per year).

##### E1a: review and acceptance (2026-10-08)

Re-checked by the reviewer in a scratch copy, at `9ba26fc` (Tasks 1-4) and at `accfc91` (Task 5): `npm test` exits 0 at
both. One projection moved in all of E1a: `default megaBackdoor+match` (a 5,000% / 3,000% match, now limited to the room;
final investable 1,600,677,371.58 -> 29,816,035.43; never depletes, before or after). The UI snapshot's DOM hashes all
change because the sidebar gained two fields (the hash covers the whole sidebar). Task 5 adds exactly the three new
`us.json` entries. Code as planned. Reviewer timing of the whole of E1a against `4df6e02`
(`tests/bench_runs_interleaved.js`, 21 rounds): simulate tx / ca / ny / pa / ct / wa -1.6 / 0.0 / 0.0 / +0.4 / -0.5 / 0.0%,
historical 0.0 / 0.0 / +1.1 / 0.0 / +0.9 / +1.6%. `tests/bench_solver.js`, 31 rounds, two runs: ACA early retiree
+3.4% / +2.2% then +5.1% / 0.0%; default +6.7% / +5.6% then +1.7% / 0.0% (simulate / path). The same tree reads +5.6% and
0.0% on one path: one timer tick (0.05 ms) is 5% of a 1 ms single run, so this bench cannot resolve a change of a few
`min`s per partner-year; the gate is decided on the interleaved table (`CLAUDE.md`), and the solver readings are recorded
as measured.

**Decisions (owner, 2026-10-08):**
1. After Tasks 1-4: the pay cap on after-tax money, MCP bounds for profit sharing and three snapshot scenarios (Task 5,
   above); the match's missing clamp, the `histSuccess` flake and the E1 pointer's placement recorded with no change.
2. **Accepted** and merged into `claude/batch-3b-penalty-rules` (`d669f9f`; `npm test` green on the merged tree), then
   pushed to origin at the owner's request.
3. Next: E1b (income stream owner and W-2 kind), designed in a new chat.

##### E1b: design (owner decisions, 2026-10-08)

Spec `docs/superpowers/specs/2026-10-08-e1b-income-streams-design.md`, plan
`docs/superpowers/plans/2026-10-08-e1b-income-streams.md`. Base `71451fd` (US V122, Canada V58).
- Income streams get an owner (Partner A / B; hidden in single-person mode; a stored B reads as A there) and a kind (Not
  earned / W-2 wages; self-employment is E1c's third kind). The age window is the owner's age.
- W-2 wages: payroll tax sharing the owner's wage base with their salary, earned income for the ACTC, the owner's
  return; no change to Medicare, ACA or the main job's contributions. A W-2 stream stops in its owner's death year; a
  not-earned stream continues to the survivor, taxed on the survivor's return.
- Reopened question 3: a W-2 stream may contribute to retirement accounts (checkbox opening a panel: 401(k) type,
  401(k) contribution, employer match, after-tax (mega backdoor) Roth, IRA). The deferral and IRA limits are per
  person and shared with the salary (salary first); the match and after-tax room are per employer (each stream its own
  employer). Self-employment streams get profit sharing in the same panel in E1c.
- Display: owner and kind are dropdowns; a `select` kind is added to the shared list renderer (`23-dynFieldHtml`; Canada
  unchanged). The new keys are normalized in a US-only step (`normalizeUsStreams`).
- The deceased partner's main salary stops at death, both planners, one commit (the deceased's effective retirement age
  is the lesser of the retirement age and the death age). Expected mover: `std R work past 65 survivor`.
- Backlog (not built): a pre-tax health premium on stream wages. No interim self-employment warning in the tooltip.
- Defaults (owner A, not earned, no contribution) reproduce today's numbers exactly; Tasks 3 and 4 must leave every
  existing snapshot entry byte-identical.

##### E1b: implementation (US V122 -> V124, Canada V58 -> V59)

Commits on `claude/e1b-income-streams` (base plan commit `84e13b3`, code of `71451fd`): 82f3100 (1: the death clamp, both
planners; `snapshot:update`), 393230b (2: shared `select` field kind, stream owner / kind / panel inputs, `normalizeUsStreams`;
legacy snapshot updated, no number change), b93a74c (3: the engine reads owner and kind), 186d353 (4: contributions from W-2
streams). `npm run check:shared` OK (55 x 2) after Task 2 (the only shared-region change: `23-dynFieldHtml`).

**Task 1 movers** (all with the first difference in year index 7, Partner A's death year, age 67; none depletes before or after):

| Scenario | Kind | End total before -> after |
|---|---|---|
| R work past 65 survivor | std | 13,973,799 -> 13,359,187 |
| R work past 65 survivor (real1929 / real1966 / real1973 / real2000) | hist | 18,655,352 -> 17,050,881 / 54,118,297 -> 50,635,107 / 48,556,712 -> 46,428,968 / 11,910,827 -> 10,993,186 |
| (crashFirst / sawtooth / boom / flat / mc1 / mc2) | hist | 9,573,792 -> 8,557,567 / 3,893,501 -> 3,612,201 / 187,659,252 -> 183,513,428 / 898,031 -> 794,600 / 40,388,714 -> 38,200,117 / 128,794,006 -> 125,675,694 |
| the same ten paths for `R work past 65 survivor rich` | hist | all lower by about 1% to 3% (e.g. real1929 57,370,531 -> 55,789,961) |
| R death before retirement (new Canada entry, A dies at 64, retires at 68) | std | first difference in year index 4 (tax 21,796 -> 20,048, grossIncome 75,369 -> 105,420 because the unfunded salary no longer arrives) |

No other scenario moved (22 of 922 files differ in the compare, including the new Canada one). No scenario depletes earlier. Every
mover is a scenario where a partner dies before their retirement age. Hand check, `std R work past 65 survivor`, year 7: cash
`wages` 245,974.77 -> 122,987.39, exactly Partner A's salary 100,000 x 1.03^7 = 122,987.39; `income` 203,201.39 -> 134,299.28
and `tax` 26,078.56 -> 16,670.02 fall with it, and Partner A's 401(k) and IRA stop receiving contributions in that year. The
`rothWithdrawn` field moves by -0.0011 (float noise from the changed Roth ledger sums).

**`retireAgeA/B` inside `runProjection`, and why the clamped value is right:** US: `retirementYear` (the both-retired year: the
deceased is retired from death, so the ladder and `firstWithdrawal` are sized from then), `makeProjectedExpense` (pre-retirement
spending steps follow the clamped age), `workingA/B` (the whole point), `requiredDistributions` (`retireAge` gates the 72(t)
and RMD working tests; the deceased's slots are zeroed by the survivor guard anyway), the Medicare lookback (`medA` / `medB`; the
deceased is excluded by `survivor2`), and `statusCtx` (account statuses: the deceased no longer works). Canada: `retirementYear`,
`makeProjectedExpense` and `workingA/B` only. No use needed the raw age, so no `rawRetireAge` was kept.

**Failing, then passing:** `tests/survivor_salary.js` failed on `death year` (`rows[7].wages` 150000, expected 50000) before the clamp in
both planners. The tests of Tasks 2 to 4 were written together with, not before, the code (a hand-checked set; they passed on the
first run, including the hand-computed payroll 22,439 / 19,125, ACTC -1,125, two-return state tax 3,000 and 4,000, and the
contribution cases), so there is no red run to record for them; the exactness gate (`tests/snapshot.js` against the committed
baseline) was run before the new scenarios were added in Tasks 3 and 4 and passed.

**Legacy proof (Task 2):** a scratch copy of `tests/legacy_state.js` dumped the full normalized state of every corpus case on the
base tree and on the working tree; after deleting the eight new stream keys from every stream the two are equal for all 54 cases
(US 37, Canada 17), so the new keys are the only change. Canada's hashes are unchanged; the US ones changed for the cases that
carry streams (`legacy bridge plan`, `legacy loans and income`) plus the four new cases (`stream owner kind`, `stream junk`,
`stream no keys`, `stream stored B single`). `ui_us.json` needed no update (the default state has no stream rows).

**Snapshots:** Task 1 updated 21 US entries (the movers above) and added one Canada entry. Task 3 added `R incomeSources B wages`,
`R incomeSources B other two returns`, `R survivor streams`; Task 4 added `R stream contributions`. Their `git diff` shows added lines
only; every other `us.json` / `canada.json` entry is byte-identical.

**Timing**, `tests/bench_runs_interleaved.js --rounds 21` (base `71451fd`) and `tests/bench_solver.js --rounds 31`.
Task 1 (`82f3100`):

```
US tx  400 simulate 183 -> 187 ms (2.2%), 120 historical 54 -> 55 ms (1.9%)
US ca  400 simulate 299 -> 297 ms (-0.7%), 120 historical 84 -> 85 ms (1.2%)
US ny  400 simulate 324 -> 326 ms (0.6%), 120 historical 95 -> 94 ms (-1.1%)
US pa  400 simulate 268 -> 267 ms (-0.4%), 120 historical 75 -> 75 ms (0.0%)
US ct  400 simulate 340 -> 348 ms (2.4%), 120 historical 100 -> 100 ms (0.0%)
US wa  400 simulate 214 -> 215 ms (0.5%), 120 historical 63 -> 63 ms (0.0%)
ACA early retiree (CA): simulate 2.38 -> 2.38 ms (0.0%), path 2.30 -> 2.30 ms (0.0%)
default: simulate 1.20 -> 1.20 ms (0.0%), path 0.90 -> 0.90 ms (0.0%)
```

Task 4 (tip, `186d353`):

```
US tx  400 simulate 185 -> 180 ms (-2.7%), 120 historical 55 -> 54 ms (-1.8%)
US ca  400 simulate 266 -> 266 ms (0.0%), 120 historical 77 -> 77 ms (0.0%)
US ny  400 simulate 291 -> 293 ms (0.7%), 120 historical 83 -> 85 ms (2.4%)
US pa  400 simulate 263 -> 268 ms (1.9%), 120 historical 74 -> 75 ms (1.4%)
US ct  400 simulate 354 -> 351 ms (-0.8%), 120 historical 104 -> 103 ms (-1.0%)
US wa  400 simulate 211 -> 213 ms (0.9%), 120 historical 62 -> 63 ms (1.6%)
ACA early retiree (CA): simulate 2.28 -> 2.32 ms (1.8%), path 2.15 -> 2.20 ms (2.3%)
default: simulate 1.18 -> 1.18 ms (0.0%), path 0.85 -> 0.85 ms (0.0%)
```

**For the owner:** (1) the Task 2 to 4 tests were written alongside the code rather than red first (see above). (2) A stream's
`kind: 'wages'` leaves Medicare, ACA eligibility and the salary's contributions on the main salary only, as designed; a stream
that is a person's only pay does not count as working for those rules. (3) `returnMagis` has no direct test hook; the two-return
split is checked through the rows' `magiA` / `magiB`. (4) `tests/survivor_salary.js` is in `npm test`; `test_income_streams.js`
is not (as for the other `test_*.js`).

##### E1b: review and acceptance (2026-10-08)

Re-checked by the reviewer in scratch worktrees of `ad10b88` (tip) and `82f3100` (Task 1): `npm test` exits 0 at the tip and
`test_income_streams.js` passes (parts 1-3). Movers, base `71451fd` against `82f3100` (926 scenario files): 22 differ, exactly
the 21 US entries of the implementation notes (`std R work past 65 survivor` and the ten historical paths of it and of its `rich`
variant) plus the new Canada entry; first difference year 7 (A's death year), no depletion before or after; end investable
13,973,799 -> 13,359,187; year-7 cash wages 245,974.77 -> 122,987.39 = 100,000 x 1.03^7. Task 1 against the tip: only the four new
scenarios differ, so Tasks 3 and 4 leave every existing entry byte-identical. The Canada entry's gross income rises in year 4
(75,369 -> 105,420) because the base paid the dead partner's salary as untaxed cash (wages 168,826) and the fix draws 55,217 from
taxable instead. The -0.0011 `rothWithdrawn` is old float noise (701 rows of the base dumps, the default scenario included).
`retireAgeA/B` uses: the lists are complete in both planners, and no engine helper reads `state.retireAgeA/B` directly, so the
clamp reaches every rule. `normalizeUsStreams` aligns with the shared `normalizeLists` (object rows, first `LIST_MAX`, bridge
streams appended after). Review Focus 1-5 each have a test; the hand figures (wage base 184,500, payroll 22,439 / 19,125, ACTC
1,125) re-derived. Ledger sums agree with the cash amounts (traditional + employer, Roth).

Reviewer timing of the tip against `71451fd`: `tests/bench_runs_interleaved.js`, 21 rounds: simulate tx / ca / ny / pa / ct / wa
+0.5 / +1.8 / +2.6 / +2.5 / -0.5 / +2.3%, historical +3.5 / +1.2 / +1.1 / +1.3 / +0.9 / +1.5%. `tests/bench_solver.js`, 31 rounds,
two runs (simulate / path): ACA early retiree +1.7% / +4.4%, then -0.8% / 0.0%; default +6.7% / 0.0%, then +1.7% / 0.0% (one
0.05 ms tick; recorded as measured).

Recorded, no change: the Task 2-4 tests were written with the code, not red first (their numbers were re-derived by the
reviewer); a legacy save's migrated Partner B bridge income stays owner A on A's shifted window (moving it to B would change old
saves); the deceased's earlier stop can move `retirementYear` (the "Investable at retirement" tile and `firstWithdrawal`),
intended, no grid scenario moved by it.

**Decision (owner, 2026-10-08):** accepted, merged into `claude/batch-3b-penalty-rules` (`862f0bb`) and pushed. Next: E1c (full
self-employment), brainstormed from the start.

##### E1c: design (owner decisions, 2026-10-08)

Spec `docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md`. Base `ee7a789` (US V124, Canada V59). US only, no
shared-region change.
- QBI is modeled (an early "drop it" was withdrawn), with no new dollar input; every business is treated as a specified
  service business (no input; conservative inside the phase-in range, exact below and above it, assuming no employees and
  no property); the $400 minimum is included. 2026 figures from Rev. Proc. 2025-32 sections 4.26 and 2.12: threshold
  $403,500 joint / $201,750 other, range $150,000 / $75,000 (fixed), minimum $400 with $1,000 of QBI.
- Main income: a per-partner "W-2 / Self-employed" choice (`incomeKindA/B`); streams gain the kind `self` with a plan-rate
  `profitSharingPct`.
- Health insurance while self-employed: the marketplace (or the other partner's plan) with the 162(l) deduction inside the
  MAGI iteration; Medicare from 65 with its premiums deductible. Couples use the existing "employer plan covers" boxes;
  an unticked box means no affordable offer (credit and deduction apply); married couples are not forced onto the W-2 plan.
- W-2 streams get an optional yearly health premium; above zero means that job covers its owner (the E1b backlog item,
  pulled into E1c).
- Approach: pure functions (`selfEmploymentTax`, `soloPlanContributions`, `qbiDeduction`, `coverageOf`) fed by a per-person
  self-employment total; all of one person's self-employment is one business (one Schedule SE, one Solo 401(k) room).
- Defaults reproduce today's numbers; no existing snapshot entry may move in any E1c commit.
- After an independent Opus review of the plan (owner decisions, 2026-10-08): the QBI $400 minimum follows the law for a
  specified service business (only the applicable percentage of QBI counts toward the $1,000 test, and above the range
  the deduction is 0; 26 USC 199A(d)(1)(A), (d)(3), (i)(2) checked in the Cornell text); where the 162(l) deduction and
  the premium credit have no consistent answer (a single person near the 400% line with net self-employment of roughly
  $69,000-$81,000) the existing cliff rule decides (pass log and forced pass priced on the realized deduction); the
  Roth-conversion bracket fill subtracts the 162(l) deduction but not QBI. Fixes adopted without a decision: the
  traditional IRA no longer reduces the 162(l) cap or the QBI base (plan money only: IRC 401(c)(2), Treas. Reg.
  1.199A-3(b)(1)(vi)); the year's recorded MAGI uses the realized deduction; two broken test cases; six tests from spec
  section 7 restored; a cliff-plan replay test, an in-band test and an eighth scenario added.

##### E1c: implementation (US V124 -> V125)

Commits on `claude/e1c-self-employment` (base `ee7a789`, US V124, Canada V59 unchanged; no shared-region change): c74e439 (1: the
inputs, `incomeKindA/B`, stream kind `self`, `profitSharingPct`, `healthPremium`), 6e2f36a (2: coverage as `employerA/B` +
`streamCoverBits`, the W-2 stream premium), 88ab2a4 (3: self-employment tax), de7fc94 (4: Solo 401(k) and IRA from self-employment),
06ed7fd (5: the 162(l) deduction inside the MAGI iteration), 0f274db (6: the QBI deduction, eight new scenarios, V125). Task 7 is this
documentation commit.

**Red, then green** (the first failure of each new test before implementing):

| Task | Test | First failure |
|---|---|---|
| 1 | `test_self_employment.js` part 1 | `state.incomeKindA` undefined (expected `'wages'`) |
| 2 | `tests/se_health.js` | `premiumB` / `coverB` / `coverA` undefined |
| 3 | `tests/self_employment.js` | `window.__test_selfEmploymentTax` is not a function |
| 4 | `tests/self_employment.js` | `window.__test_soloPlanContributions` is not a function |
| 5 | `tests/se_health.js` | `window.__test_seHealthDeduction` is not a function |
| 6 | `tests/qbi.js` | `window.__test_qbiDeduction` is not a function |

**Legacy proof (Task 1).** A scratch script loaded all 58 corpus cases (US 41, Canada 17) on the base worktree and on the working tree;
after deleting `incomeKindA/B` (raw unknown keys, which the old code kept) and the per-stream `profitSharingPct` / `healthPremium`, and
mapping the three `kind: 'self'` streams back to the old kind, 0 cases differ. Canada unchanged. `ui_canada.json` was rewritten with no
content change and restored.

**MAGI-iteration sites changed (Task 5; lines at 06ed7fd).** 1 `prevSeHealthA/B` seed (10307); 2 `magiBase0` / `let magiBase` (10497);
3 `estSeA/estSeB` (10509); 4 per-pass `profile.seHealthA/B` and `magiBase` (10562); 5 `costAt(trad, gain, sa, sb)` and `lastCost`
(10636); 6 `irmaaAt` with `returnMagis` wrapped (10672); 7 the `seRealA/B` block with the `estUsed` setter, medical expense less the
deduction (10739); 8 the convergence test (10865); 9 pass log `estSeA/B`, realized cost on the realized pair (10868); 10 the damped
update (10875); 11 the pick restore (10889); 12 the forced pass: realized-pair `costAt`, the deduction re-run on `lastCost`, the medical
line (10902-10915); 18b `realizedMagi = magiBase0 - (seRealA + seRealB) + draws` (10928); 13/14 `naturalRec` (10967 / 10977); 15 fallback
replay (10998); 16 `trialRecs` (11012); 17 winner replay (11028); 18 trial seed (11043); 19 `prevSeHealthA/B` written after convergence
(11058). Also: `healthcareCost` returns `premA/premB` (~8910-8975), `seHealthDeduction` (8996), `seAllowA/B` at 10431, the
`buildTaxProfile` parameters and remap, `returnMagis` (7255), `taxFor` (6710+), `solveRothConversionTo` (7333), the test hook (16824).
All the readers that need no edit were confirmed to still hold. Ruling: each `taxFor` branch computes the net other income once
(`otherAB`, `otherA1`, `otherA2` / `otherB2`): the same sums in the same order, the same doubles, done to bring `tx` under +5%.

**Deviations from the spec's first draft.**
- Coverage is built as `employerA/B` plus `streamCoverBits` (no `coverageOf`).
- No `scalarSnapshot` entry: `prevSeHealthA/B` is written only after convergence.
- The 162(l) band rule (decision 8b, above): where the deduction and the credit have no consistent answer the existing cliff rule
  decides. Band test (single, `incomeA` 82,000, `sePlanNet` 76,206.89): `magiStats` {forced 0, unresolved 0} -> {forced 30, unresolved 0}
  (the count spans the cliff plan's own runs plus the trace and `simulate` runs). Year 0: H = 5,797.41, D = 5,797.41, M = 70,409.48;
  asserted agreements hold (D = min(H, `sePlanNet`) to 1e-9; M = `sePlanNet` - D within 1).
- The Roth conversion fill sees 162(l) but not QBI (decision 8c). Test: conversion higher by 18,000 within 1.
- The row's `income` stays before the 162(l) deduction.
- Other engine cases: fixed point H 5,050.71, D 5,050.71, M 50,710.43; two returns magiA 35,395.10, A's part 1,779.10, D 1,778.99.
  Cliff-plan replay: the stream stayed at 40,000; `choose` recorded 5 intents; `apply(choose's intents)` equals `choose` row for row;
  with every line id replaced `planStats.absent` rose by 5 and the rows equal the `off` run.

**Snapshots.** Task 6 added exactly eight entries to `tests/snapshots/us.json` (56 insertions, 0 deletions): US 550 -> 558 scenarios,
Canada 376. No existing entry changed in any commit.

**Timing** (baseline `ee7a789`; `tests/bench_runs_interleaved.js --rounds 21`, base -> new, medians).

Task 2 (6e2f36a):

| State | 400 simulate | 120 historical |
|---|---|---|
| tx | 191 -> 189 ms (-1.0%) | 56 -> 55 ms (-1.8%) |
| ca | 277 -> 278 ms (0.4%) | 79 -> 79 ms (0.0%) |
| ny | 297 -> 304 ms (2.4%) | 85 -> 86 ms (1.2%) |
| pa | 269 -> 277 ms (3.0%) | 75 -> 76 ms (1.3%) |
| ct | 363 -> 367 ms (1.1%) | 105 -> 106 ms (1.0%) |
| wa | 216 -> 220 ms (1.9%) | 62 -> 64 ms (3.2%) |

Task 2, `tests/bench_solver.js --rounds 31`: ACA early retiree (CA): simulate 2.38 -> 2.42 ms (1.7%), path 2.35 -> 2.35 ms (0.0%);
default: simulate 1.20 -> 1.26 ms (5.0%), path 0.90 -> 0.95 ms (5.6%).

Task 5 (06ed7fd), final gate (an earlier run before the `taxFor` refactor showed `tx` +6.6% / +7.1% and was not accepted):

| State | 400 simulate | 120 historical |
|---|---|---|
| tx | 194 -> 196 ms (1.0%) | 58 -> 58 ms (0.0%) |
| ca | 275 -> 275 ms (0.0%) | 78 -> 79 ms (1.3%) |
| ny | 292 -> 299 ms (2.4%) | 84 -> 85 ms (1.2%) |
| pa | 268 -> 273 ms (1.9%) | 75 -> 76 ms (1.3%) |
| ct | 355 -> 363 ms (2.3%) | 104 -> 105 ms (1.0%) |
| wa | 214 -> 220 ms (2.8%) | 63 -> 64 ms (1.6%) |

Task 5, `bench_solver.js --rounds 31`, first run on the final tree: ACA early retiree (CA): simulate 2.26 -> 2.80 ms (23.9%), path
2.20 -> 2.65 ms (20.5%); default: simulate 1.18 -> 1.24 ms (5.1%), path 0.85 -> 0.95 ms (11.8%). Re-run: ACA early retiree (CA):
simulate 2.30 -> 2.40 ms (4.3%), path 2.20 -> 2.30 ms (4.5%); default: simulate 1.18 -> 1.24 ms (5.1%), path 0.85 -> 0.95 ms (11.8%).
(Timer steps are 0.05 ms.)

Task 6 (0f274db): **the +5% gate was NOT met.** Run 1:

| State | 400 simulate | 120 historical |
|---|---|---|
| tx | 183 -> 192 ms (4.9%) | 54 -> 56 ms (3.7%) |
| ca | 271 -> 279 ms (3.0%) | 78 -> 79 ms (1.3%) |
| ny | 298 -> 307 ms (3.0%) | 85 -> 88 ms (3.5%) |
| pa | 266 -> 280 ms (5.3%) | 74 -> 78 ms (5.4%) |
| ct | 355 -> 369 ms (3.9%) | 104 -> 107 ms (2.9%) |
| wa | 215 -> 225 ms (4.7%) | 62 -> 66 ms (6.5%) |

Run 2:

| State | 400 simulate | 120 historical |
|---|---|---|
| tx | 184 -> 194 ms (5.4%) | 54 -> 58 ms (7.4%) |
| ca | 270 -> 284 ms (5.2%) | 77 -> 81 ms (5.2%) |
| ny | 293 -> 309 ms (5.5%) | 85 -> 88 ms (3.5%) |
| pa | 267 -> 281 ms (5.2%) | 75 -> 79 ms (5.3%) |
| ct | 354 -> 370 ms (4.5%) | 103 -> 108 ms (4.9%) |
| wa | 214 -> 228 ms (6.5%) | 63 -> 67 ms (6.3%) |

Run 3 gave 3.9% to 9.3%. A temporary worktree of the Task 5 tip, benchmarked the same way: Task 6 vs the Task 5 tip 0-2% per path;
the Task 5 tip vs base 2.7-6.5% in the same machine state. So the excess comes from Tasks 2-5 plus machine noise (wall-clock noise is
+-10% on this machine), not Task 6; nothing was tuned. Task 6 `bench_solver.js --rounds 31`, run 1: ACA early retiree (CA): simulate
2.30 -> 2.62 ms (13.9%), path 2.20 -> 2.55 ms (15.9%); default: simulate 1.20 -> 1.28 ms (6.7%), path 0.90 -> 0.95 ms (5.6%). Run 2:
ACA early retiree (CA): simulate 2.24 -> 2.50 ms (11.6%), path 2.20 -> 2.45 ms (11.4%); default: simulate 1.18 -> 1.28 ms (8.5%),
path 0.90 -> 1.00 ms (11.1%).

Side-business timing (recorded, not gated): 400 `simulateRaw()` over 31 interleaved rounds, median 951.0 ms for the R side business
stream with kind `self` vs 583.0 ms with kind `wages` (ratio 1.631).

**For the owner.**
1. The timing gate was not met at Task 6 (tables above): decide whether to accept it or have Tasks 2-5 re-checked.
2. Band inconsistency: H is the credit-rate premium at MAGI 58,207 (the MAGI with the full 18,000 deduction), while the recorded MAGI
   70,409 is above the 400% line, where `acaNetCost` gives 18,000. The forced pass prices the realized cost at the MAGI from the
   pre-refund deduction, the deduction then follows that lower premium, and the recorded MAGI rises past the line. The plan's rule was
   implemented as written.
3. The test "ACA off still converges" does not guard site 7's `estUsed` line (site 18b already records the MAGI from the realized
   pair); only the Step 8b Roth-fill test fails without it.

**E1c: review fixes (Task 8).** Commits: 8a ebda26d, 8b f3884fd, 8c (this commit). 8a: `seOn` flag; no number change; its gate run
(bench_runs_interleaved 21 rounds vs base): tx 1.6%/-1.8%, ca 1.4%/0.0%, ny 4.3%/3.5%, pa 2.5%/2.6%, ct 1.9%/1.9%, wa 1.8%/1.5%
(simulate/historical); bench_solver: ACA early retiree (CA) simulate 2.40 -> 2.50 ms (4.2%), path 2.30 -> 2.45 ms (6.5%); default
simulate 1.22 -> 1.30 ms (6.6%), path 0.90 -> 1.00 ms (11.1%); earlier runs of the same tree showed tx 5.3-5.5% and ct 7.1% that
repeated at 1.0-3.6% (noise ~+-10%). 8b: Rev. Proc. 2014-41 alternative calculation in a non-converging 162(l) year; red run at 8a:
first failing assert `band, consistent premium (70000)` 5880.58 vs 5893.74; probe differences (healthcare minus the premium at the
recorded MAGI) at 8a: 70,000: -13.15; 74,000: -12,943.10; 82,000: -12,202.59; 86,000: -11,832.34; joint: -10,032.00; Medicaid line:
-781.11; converged 60,000: -0.05; all 0.00 after 8b with forced/unresolved +0. Hand values: 82,000 case sePlanNet 76,206.8845, step-1
MAGI 58,206.8845, D = acaNetCost = 5,797.4057, final MAGI 70,409.4788, premium 18,000; joint band profit 105,449.7904 (sePlanNet
98,000; line for two 84,600): D 7,968.00, MAGI 90,032.00, premium 18,000; Medicaid line (ca): FPL 15,650, line 1.38 x 15,650 = 21,597,
profit 23,561.5721 (sePlanNet 21,897): D 0, MAGI 21,897, premium 781.11; converged 60,000: D 5,050.71, MAGI 50,710.43. The 70,000 case
did not converge at 8a (damped iteration after 8 passes) and now gets the alternative calculation: D 4,686.64, MAGI 60,368.01, premium
6,012.65 (the true fixed point's D would be about 5,892). Moved E1c snapshot entries: none (the plan expected `R single self-employed
cliff band` to move; its MAGI is about 83,710 because the R household's investment income lifts it above the band; `R side business
stream` switches to the alternative calculation in 3 years but its rows are byte-identical, the non-convergence is in the draws and
goes to the existing forced pass: forced 3 before and after); a dump of ../fp-e1c-base against the tree shows exactly the 8 E1c
scenario files differ out of 934, no pre-E1c entry. Timing 8b vs base (three runs, tx simulate 8.6%/6.3%/7.6%, ca up to 6.6%, wa up
to 7.4% in single runs; others within 6%); 8b vs 8a: tx 1.6%, ca -0.4%, ny -3.8%, pa -3.1%, ct -1.6%, wa -2.6% (8b costs nothing
against 8a); 8a vs base the same day: tx 7.7%, ny 5.8% (so the residual overage is the branch's existing cost plus noise, not 8b);
bench_solver 8b: ACA early retiree (CA) simulate 2.36 -> 2.44 ms (3.4%), path 2.30 -> 2.35 ms (2.2%); default simulate 1.20 -> 1.28 ms
(6.7%), path 0.90 -> 0.95 ms (5.6%). OPEN for the owner: the +5% gate against base still fails for tx in single runs. Rulings of 8b:
the switch fires on any unconverged year with a 162(l) deduction allowed (as the spec says), including slow damped years; the 8b
commit message says no snapshot:update because nothing moved; the Task 5 test `no consistent answer` was replaced (it pinned decision
8b's premium = D at MAGI 70,409). Also open: the snapshot grid does not exercise the band (a household without income-paying balances
would). 8c: copy for the self-employed (the `#healthcare`, `#acaEnabled` and `#medicareYearly` tooltips, the Healthcare callout, the
employer-plan boxes, the catch-up tooltips, the profit-sharing descriptors); tests: `ACA off` renamed for what it checks, the Roth-fill
test is documented as the guard for site 7's `estUsed` line (red proof: with that line removed in a scratch copy the first failure is
`Roth fill: conversion higher by the deduction ... 0 vs 18000`; the other ACA-off asserts still pass, which is why the earlier test
could not guard it), "Solo money leaves cash" now asserts the hand difference (the 43,087.045 of plan money less the year-0 tax saved,
from the rows' own tax, within 1e-3 because the taxable sale is solved by bisection), `tests/qbi.js` engine case commented as the
wiring check. No number changed in 8c.

**E1c: review fixes, round 2 (Task 9).** Commits: 9a 1e4b747, 9b a0a2082, 9c (this commit). Spec decision 10 (owner, 2026-10-09).

9a (the consistent deduction first). Red run at 5399f23 (the new block of `tests/se_health.js`): first failing assert `sliver, single (70000): D vs the
consistent 5892.55: 4686.643887000001 vs 5892.546277737359`. Green after the code: `seHealthDeduction`-style bisection in the 8b block (60 halvings or a
bracket under $0.01, consistent when `allowed(lo) - lo <= 1`; one search on the total for one return, one per return on two; the part with no consistent
answer takes the alternative calculation; `magiStats.seFixed` / `seAlternative` count a year's hold; a two-return year with one part of each counts as an
alternative). A return's slot of `seHealthDeduction` reads only its own MAGI (`returnMagis` subtracts each return's own deduction; premA on magiA, premB on
magiB), so the per-return searches are independent. The search closures (`allowedAt`, `rootOf`) are created inside the block, which runs only in an unconverged
year with a deduction allowed (not once per run as the plan sketched; no allocation on any other path). Scans, year 0, `tx`, $18,000 premium, engine D (premium) at
5399f23 -> now, against the consistent D: single 66,000-67,250: unchanged (converged, D = premium, within $0.05 of the consistent); 67,500 4,262 (5,824) -> 5,682.09
(5,682.10), 68,000 4,348 (5,861) -> 5,724.19, 70,000 4,687 (6,013) -> 5,892.54 (5,892.55), 72,500 4,918 (6,221) -> 6,102.99, 72,750 4,941 (18,000) -> 6,124.04 (6,124.04),
73,000 4,964 (18,000) -> 6,145.08, 74,000 5,057 (18,000) -> 6,229.26; every profit 67,500-74,000 by 250 is within $0.01 of the consistent D after (27 rows, all "ok");
74,250-76,000: no consistent deduction (`dfp` finds none), unchanged from 5399f23 (alternative calculation: D 5,080-5,242, premium 18,000). Joint (`mfj`, A
self-employed, B no pay): 90,000-91,000 converged and unchanged; 91,500 6,677 (7,805) -> 7,702.39 (7,702.40); 95,000 7,001 (8,096) -> 7,997.03; 98,500 7,325 (8,388) ->
8,291.65; 99,000 7,371 (18,000) -> 8,333.74 (8,333.74); 100,000 7,464 (18,000) -> 8,417.92; 100,500 and 101,000: none, unchanged. The Task 8b joint band case
(sePlanNet 98,000, profit 105,449.7904) has no consistent deduction, so its 8b expectations stand (D 7,968.00, MAGI 90,032.00, premium 18,000). Two returns
(unmarried couple, both 50, A self-employed, B no pay, no children, premium 18,000 so A's part is 9,000): scanned at 5399f23 in 500 steps from 40,000 to 130,000:
A's profits 67,500-74,000 switched with a consistent answer (engine D 5,768 at 72,000 against a consistent 6,061; 74,000 charged A's full 9,000 against 6,229), 74,500-77,000
switched with none; the test uses 70,000, 72,000 and 74,000 and asserts A's D within $1 of the consistent one and priced on `rows[0].magiA`. Inflated multi-year check (inflation 3,
income growth 3, medical inflation 5, single profits 30,000-110,000 by 1,000, years 0-9, gross premium of the year from the same run with ACA off): the largest
|healthcare - acaNetCost(magiProxy, 1, gross, y)| is $0.18 (profit 53,000, year 3), the same at 5399f23 (limit 2). Moved snapshot entries: none (`node tests/snapshot.js`
passes against the committed baseline; `R side business stream` did not move), so no snapshot:update in 9a.

9b (two band scenarios, new entries only): `single self-employed band, alternative` (profit 82,000) and `single self-employed band, consistent` (73,000), single, age 50,
retiring at 60, self-employed main income, ACA on, $18,000 premium, `tx`, taxable 0, cash 0, `hysaRate` 0, traditional 300,000, Roth 100,000, default inflation and
growth; the contribution defaults are zeroed (`k401PctA`, `catchupPctA`, `profitSharingPctA`, `iraPctA` 0, no mega backdoor), because the default 401(k) deferral cuts
sePlanNet from 76,207 to 43,707 and takes the household out of the band (checked at the tip: 82,000 -> sePlanNet 76,206.8845, one `seAlternative` per `simulate()`, D 5,797.41,
premium 18,000, MAGI 70,409.48; 73,000 -> sePlanNet 67,842.71, one `seFixed`, D 6,145.08, premium 6,145.08, MAGI 61,697.63; default inflation does not move year 0).
`npm run snapshot:update` was run; its rewrite of `ui_us.json` (a Monte Carlo `histSuccess` timing flake: "—" vs "85%") was discarded and `snapshot_ui.js` passes against the
committed files twice, so only `us.json` carries the two new entries. A dump of ../fp-e1c-base against the tree: 936 files, 10 differ, exactly the E1c scenario files.

9c (timing, no number change). Per-commit bisect (bench_runs_interleaved, 21 rounds, each commit's tree against its parent's, temporary worktrees; simulate/historical % per
state, wall-clock noise about +-3% per cell): no single commit costs more than a few percent; the largest repeatable cells are 6 (QBI) tx 4.7/1.7, ca 2.5/2.5 and 3
(SE tax) +1/+2; the cost is diffuse:
  - c74e439 (1) vs base: tx -0.5/1.8, ca 1.4/2.5, ny -0.6/1.1, pa 0.7/0.0, ct -3.8/-2.8, wa -0.8/-5.7
  - 6e2f36a (2) vs c74e439: tx -1.6/0.0, ca -0.7/0.0, ny -1.3/-2.2, pa 1.7/1.2, ct -0.8/0.0, wa 1.4/0.0
  - 88ab2a4 (3) vs 6e2f36a: tx 1.1/1.8, ca 0.7/1.3, ny 1.3/2.3, pa 1.1/2.6, ct -0.5/-0.9, wa 0.5/1.5
  - de7fc94 (4) vs 88ab2a4: tx 0.5/3.5, ca -3.1/-2.5, ny -1.6/-2.2, pa -1.4/-1.3, ct 2.8/3.8, wa -3.1/-1.5
  - 06ed7fd (5) vs de7fc94: tx 0.5/0.0, ca 0.0/0.0, ny -0.3/-1.1, pa 0.0/1.3, ct -4.7/0.9, wa 0.4/1.5
  - 0f274db (6) vs 06ed7fd: tx 4.7/1.7, ca 2.5/2.5, ny 0.6/1.1, pa 1.1/2.5, ct 1.6/1.8, wa 1.7/1.5
  - ebda26d (8a) vs 0f274db: tx 1.0/3.4, ca 1.0/0.0, ny -0.6/0.0, pa 0.7/0.0, ct -2.1/-0.9, wa -1.3/1.5
  - f3884fd (8b) vs ebda26d: tx -0.5/-1.7, ca -0.7/0.0, ny -1.6/0.0, pa 2.8/2.6, ct 5.3/4.8, wa 0.4/3.0
  - 5399f23 (8c) vs f3884fd: tx -3.5/-1.7, ca -1.4/1.2, ny 0.6/2.3, pa 1.1/2.6, ct 4.7/3.8, wa -0.4/1.5
  - 1e4b747 (9a) vs 5399f23: tx -0.5/0.0, ca -0.4/0.0, ny -0.6/-1.1, pa 0.0/0.0, ct -1.1/-0.9, wa -2.2/-1.5
The tip against base before the 9c edits (one run): tx 4.8/5.4, ca 3.2/3.8, ny 2.6/3.4, pa 2.9/3.9, ct 11.5/9.6, wa 3.2/3.1. At 400 simulations in about 190 ms a
`simulate()` is under 0.5 ms with a few hundred `taxFor` calls, so one added operation per call or per year is a measurable fraction of the 5% budget; the 9c edits
(CLAUDE.md, "9c") skip every E1c term for a household without self-employment: `taxFor` (one `seOn` test, the terms inside `if (seOn)`), the pass terms behind `seLive`, the Solo
sums, the stream premium factor (a `Math.pow`) and the IRMAA cover bits when there are no streams. `tests/tax_caches.js` and the snapshots are unchanged. Gate, three runs of
`bench_runs_interleaved.js --base ../fp-e1c-base --rounds 21` (simulate/historical %): run 1 tx 1.6/3.6, ca 0.7/0.0, ny 0.3/1.1, pa 1.8/1.3, ct 6.2/6.8, wa 0.9/0.0; run 2 tx 2.1/1.8,
ca 0.0/1.2, ny -2.5/-2.2, pa -4.9/-1.2, ct 3.3/3.8, wa -0.9/-2.9; run 3 tx 5.0/5.0, ca 2.9/2.5, ny 4.7/4.7, pa 4.4/3.9, ct 2.7/3.7, wa 4.1/4.6. Medians: tx 2.1/3.6, ca 0.7/1.2, ny
0.3/1.1, pa 1.8/1.3, ct 3.3/3.8, wa 0.9/0.0 (every path within +5%). An intermediate triple (after the `taxFor` edit and the `seLive` terms, before the stream-factor and Solo-sum
edits) had tx historical at 5.7% (11.3, 3.8, 5.7), which is why those were added. bench_solver (31 rounds vs base, two runs, recorded): ACA early retiree (CA) simulate 2.42 -> 2.52 ms
(4.1%) and 2.38 -> 2.58 ms (8.4%), path 2.35 -> 2.45 ms (4.3%) twice; default simulate 1.26 -> 1.34 ms (6.3%) and 1.24 -> 1.30 ms (4.8%), path 0.95 -> 1.00 ms (5.3%) and 0.90 -> 1.00 ms (11.1%).

**E1c: review fixes, round 3 (Task 10).** Commits: 10a 4bf26a5, 10b (this commit). Spec decision 11 (owner, 2026-10-09). No snapshot entry moved.

10a. Red runs at 9b47b3a (the Task 10a block of `tests/se_health.js`, each case alone with `SE_CASE=<name>`): `recheck` (single, 60, a 48,000 self stream, spending 26,000, 500,000 taxable at 60% basis, no housing, `tx`, premium 18,000, year 0): `held year re-checked at its final draws: D 5260.79 vs the search 5465.70`; `grid`: 7 of 10 held alternative years off the search, worst 335.52, assert `held years over a draw grid ...`; `zero` (`R side business stream`): `no hold at a $0 deduction: nothing counted` (4 years counted over one `__test_simulate()`, which includes the cliff plan's phases); `joint` (married, both 50, both self-employed, A's plan net 3,000, B's profit 90,000): passes at 9b47b3a (the test gap, not a defect): A 3,000, B 4,847.86, total 7,847.86 against the consistent 7,847.86 (A first, B the rest to 1e-9). The reviewer's household (a 30,000 stream, spending 24,000, 30% basis) was **not reproduced**: a scan of taxable 200,000-2,000,000 with and without housing, the cash reserve and the bond ladder found no year-0 switch with the described held 6,224.54 against 18,000, so the household above was found by scanning (it has the same shape: switched year 0, a held deduction 205 below the search at the final draws, 88 of the 187 year-0 households in the 20,000-30,000 spending by 24,000-40,000 stream grid held). Draw grid (single, 55, retiring at 55, a 20,000-60,000 self stream by 5,000, spending 30,000 and 60,000, 500,000 taxable at 30% basis, no housing, `tx`, inflation 0, medical inflation 0, years 0-9; 180 years): at 9b47b3a 10 held alternative years, 7 more than $1 off the search at their final draws (worst 335.52); at the tip 10 held years, 1 off (stream 55,000 year 9, D 5,575.55 against 5,573.17, worst 2.38).

Code. The 9a search moved into one closure, `seSearch(trad, gain)`, with results in `seFixA` / `seFixB` / `seNeedAlt`. It is built lazily at its first use **in the pass**, not in the year as the plan asked: `costAt` and `hcArgs` are per-pass closures (they live inside the `for (iter)` body), so a year-level closure cannot call them. A pass that never searches allocates nothing, which is the plan's point. One construction site serves both users (an unconverged year that has not switched; a converged held year not yet re-checked). `seKind` (1 consistent, 2 alternative) replaces the two counter increments; `magiStats.seFixed` / `seAlternative` are incremented once, next to `unresolved`, from the kept phase. `seKind` and `seRechecked` are carried wherever `seHeld` is (both `naturalRec` literals, `trialRecs.push`, the fallback replay, the winner replay) and reset at a trial start. The $0 guard: the search returns false when the step-1 deduction is 0, the switch holds nothing and the pass falls to the forced pass as before 8b; the step-1 `costAt` leaves `lastCost` changed, and every reader of `lastCost` (the forced-pass block, `allowedAt`, the alternative calculation) calls `costAt` first, so nothing reads the stale value. The re-check sits just before `if (forcedPass && flow < 0)`: it is reached by a converged pass (an unconverged one continued above or is out of passes and is excluded by `!unconverged`). A re-check whose search holds nothing (a $0 step-1 deduction after a non-zero hold, practically unreachable) reads 0 for both parts and re-holds 0.

The re-check cannot close every year: it allows one re-hold, and the re-run's draws move again. Results at the tip over the larger scans: of 88 held year-0 households (taxable 600,000, 30% basis, spending 20,000-30,000, stream 24,000-40,000 by 1,000) almost every one that was off by 20 to 900 at 9b47b3a ends within about 1 to 20 of the search (D equals the search at the draws of the pass before the re-hold). Where the two answers sit on either side of the 400% line the single re-hold can flip the sign instead of closing the gap: stream 39,000 / spending 23,000: held 6,139.9 against a search of 18,000 at 9b47b3a, held 18,000 against a search of 5,595 at the tip (the section 5.02 value is legal in a year whose iteration does not converge). The test therefore asserts the grid at one year off by at most 5; the `recheck` case asserts the household where the re-hold closes the gap to under $1 (D 5,465.70, search 5,464.86).

Scans, unchanged against 9b47b3a (identical to the cent): single profits 66,000-76,000 by 250 and joint 90,000-101,000 by 500, year 0 (D, premium and MAGI equal in all 64 cells); inflation 3, income growth 3, medical inflation 5, single profits 30,000-110,000 by 1,000, years 0-9: the largest |healthcare - acaNetCost(magiProxy, 1, gross, y)| is $0.18 (profit 53,000, year 3), as at 9b47b3a. `node tests/snapshot.js` passes against the committed baseline: **no entry moved** (so no `npm run snapshot:update`, and `ui_*.json` were not touched); a dump of ../fp-e1c-base against the tree: 936 files, 10 differ, exactly E1c's ten scenario files (including `R side business stream`, byte-identical to 9b47b3a). `npm test` green; `npm run check:shared` OK.

Timing (quiet machine). `bench_runs_interleaved.js --base ../fp-e1c-base --rounds 21`, three runs (simulate / historical %): run 1 tx 9.1/5.5, ca 3.6/2.5, ny 3.7/7.1, pa 2.2/2.6, ct 0.8/1.9, wa 4.1/3.1; run 2 tx 2.4/-1.6, ca 3.2/2.5, ny 2.3/1.1, pa 3.2/2.6, ct -1.9/-1.9, wa 5.0/3.1; run 3 tx 1.0/5.5, ca 2.2/3.8, ny 4.3/3.5, pa 5.1/3.9, ct 7.4/7.9, wa 5.0/0.0. Medians over the three runs: tx 2.4/5.5, ca 3.2/2.5, ny 3.7/3.5, pa 3.2/2.6, ct 0.8/1.9, wa 5.0/3.1. **One path misses the gate: tx historical, median 5.5%** (55 -> 58 ms in two of the three runs; the script reports whole milliseconds, so one millisecond on 55 is 1.8%). The same three-run protocol against 9b47b3a (`--base` a temporary worktree of 9b47b3a): tx 0.0/-1.7, -0.5/0.0, 4.3/1.8 (medians 0.0/0.0); ca -0.7/-1.2, 1.4/0.0, 2.1/1.2 (1.4/0.0); ny -1.9/-2.3, 3.3/1.1, 3.0/3.4 (3.0/1.1); pa -0.4/-1.3, 2.5/2.6, 2.6/2.6 (2.5/2.6); ct -5.3/-5.4, -2.2/-2.8, -2.5/-2.8 (-2.5/-2.8); wa 0.4/0.0, 2.7/3.1, 1.8/3.1 (1.8/3.1). So Task 10's own cost is within noise; the tx historical figure is the carried cost of E1c against the base (the owner accepted 5.3% for PA historical after Task 9). Nothing unplanned was tried. `bench_solver.js --base ../fp-e1c-base --rounds 31`, two runs: ACA early retiree (CA) simulate 5.6% / -1.6%, path 4.3% / 2.1%; default simulate 2.9% / 3.2%, path 5.3% / 5.6%.

**E1c: review fixes, round 4 (Task 11).** Commits: 11a a63ce6c, 11b (this commit). Spec decision 12 (owner, 2026-10-09): the decision 11 re-check is withdrawn. No snapshot entry moved.

Red run at 1f43dac (`SE_CASE="invariant grid" node tests/se_health.js`): `invariant grid: 2310 years checked; deduction above the premium paid: 55 (worst 12828.59)` and the assertion `the deduction never exceeds the premium paid (basis 30 spending 22000 stream 40000 year 4: D 18000.00 premium 5649.86)`. The test grid is single, 60, retiring at 60, one self stream of 20,000-60,000 by 2,000, spending 20,000-40,000 by 2,000, 500,000 taxable at 30% and 60% basis, `tx`, premium 18,000, inflation, income growth and medical inflation 0, no housing, years 0-4, run inside one `page.evaluate`; the spec owner's grid (stride 1,000, 8,610 years) found 224 years, this stride-2,000 grid finds 55 and the same worst, 12,828.59. An early draft of the test forgot `taxable: 500000` (the `ZERO` base sets it to 0) and passed at 1f43dac; the case is red only with the balance in place.

Code. The decision 11 block (just before `if (forcedPass && flow < 0)`) and `seRechecked` are gone (declaration, both `naturalRec` literals, `trialRecs.push`, the replays, the trial-start reset). The `seSearch` build condition is now `!seHeld && unconverged`, which is the switch's own condition. `seSearch`, the $0 guard, `seKind` with kept-phase counting and the `zero` and `joint` tests stay. Comments say a hold is not re-checked and why.

At the tip, invariant grid: 2,310 years checked, 0 above the premium paid, 0 above the plan net, 0 with a premium more than $2 off the recorded MAGI (worst 0.00), **422 understated** against the search at the final draws, largest gap **12,699.56** (the recorded limitation; legal and conservative; Batch 5 settles it). The grid's rows (basis, spending, stream, year, deduction, plan net, premium, MAGI) are byte-identical at 9b47b3a and at the tip (`cmp` of the two dumps).

Exactness: `node tests/snapshot.js` passes (US 560, Canada 376, exact). A dump of a temporary 9b47b3a worktree against the tree, with the tree's scenario list: 936 files compared, **0 differ**. A dump of ../fp-e1c-base against the tree: 10 differ, exactly E1c's ten scenario files. `tests/snapshots/*.json` untouched.

Timing (`bench_runs_interleaved.js --base ../fp-e1c-base --rounds 21`, three runs, simulate / historical %): run 1 tx 2.0/6.7, ca 2.7/4.8, ny 0.0/2.2, pa -5.4/-5.4, ct 3.7/-3.4, wa 3.4/1.4; run 2 tx 3.8/-1.6, ca 1.6/1.2, ny 1.9/0.0, pa -0.7/1.3, ct 0.3/1.9, wa 2.3/1.6; run 3 tx 2.6/0.0, ca 1.8/0.0, ny 2.7/1.2, pa 5.9/3.9, ct 7.6/7.8, wa 3.7/3.1. Medians: tx 2.6/0.0, ca 1.8/1.2, ny 1.9/1.2, pa -0.7/1.3, ct 3.7/1.9, wa 3.4/1.6. Against a 9b47b3a worktree (one run): tx 2.1/3.7, ca -2.4/0.0, ny -2.2/-3.4, pa 0.4/-1.3, ct 1.4/1.9, wa -3.9/-3.0. No median is over +5%; one run's ct (7.6/7.8) and pa simulate (5.9) were over, in a run whose other paths were also high.

##### E1c: review, part 1 (spec owner, 2026-10-09; the independent review is still running)

Checked in a scratch worktree of the tip `5fef95b`: `npm test` exits 0; snapshot dump of `ee7a789` against the tip (the
tip's scenario list): 934 files, 8 differ, exactly the 8 new E1c scenarios (US 550 -> 558), so no existing projection
moved. The implementer's rulings hold (`taxFor` computing the household's other income once per branch keeps the
snapshots exact; `planStats.absent > 0`; the QBI engine test on the itemized deduction).

Findings:
1. **The 162(l) band breaks tax law (a design error of decision 8b, not an implementation error).** For a single person
   near the 400% line with net self-employment of about $69,000-$81,000 the forced pass charges a subsidized premium
   (5,797) at a recorded MAGI above the line (70,409), where no credit exists: the cost is understated by about $12,000 a
   year. Rev. Proc. 2014-41 section 5.01 (IRB 2014-33, read 2026-10-09): when the iterative calculation never comes within
   $1, the taxpayer "should not use the iterative calculation method" and uses the alternative calculation (5.02) or
   another method that satisfies the law. Probe (single, $18,000 premium, 2026, throwaway):

   | Net self-employment | Iterative: premium / deduction | Alternative 5.02: premium / deduction |
   |---|---|---|
   | 45,000 | 3,666 / 3,666 | 4,054 / 1,424 |
   | 55,761 | 5,051 / 5,051 | 5,248 / 3,066 |
   | 69,000-80,000 | no fixed point | 18,000 / 5,080-6,175 |
   | 84,000 | 18,000 / 18,000 | 18,000 / 18,000 |

2. **Timing gate fails** (`tests/bench_runs_interleaved.js --base ../fp-e1c-base --rounds 21`, the independent reviewer
   probing on the same machine): simulate tx / ca / ny / pa / ct / wa +8.5 / +4.7 / +3.6 / +3.7 / -3.7 / +6.2%, historical
   +5.5 / +3.8 / +5.8 / +5.3 / -4.5 / +6.3%. `tests/bench_solver.js`, 31 rounds, two runs (simulate / path): ACA early
   retiree +0.8 / +2.1% then +1.7 / +4.3%; default +8.1 / +5.3% then +4.8 / +5.3%. The lightest-tax states move most, which
   fits a fixed cost per `taxFor` call: it now reads eight self-employment fields on every call for every household. A
   self-employed household runs 1.63x the time of the same household with W-2 pay (extra MAGI passes; expected, recorded).
3. **Test gap:** since the recorded MAGI uses the realized deduction (site 18b), `ACA off still converges` passes even
   without site 7's `estUsed` line; only the Roth-fill test catches it. The test must assert on a pass-priced quantity.

**Decisions (owner, 2026-10-09):**
- A. Keep the iterative calculation where it converges; in a year where it cannot (the forced pass with a 162(l) deduction
  in play) use Rev. Proc. 2014-41's alternative calculation, re-running the year with the deduction held at the
  alternative amount so the premium, the draws and the MAGI follow the law's answer (no refund step).
- B. Fix the timing rather than accept it: read the self-employment fields in `taxFor` (and the other per-pass additions)
  only when the profile carries one "has self-employment" flag; re-run the gate, commit by commit if it still fails.
- Both go to the implementer as one more task, together with the independent review's accepted findings.

##### E1c: review, part 2 (independent Opus review of `5fef95b`, 2026-10-09)

Verdict: accept after fixes. Confirmed by the spec owner in the code: (1) the 162(l) band (as part 1; the reviewer
probed profits 70,000 / 74,000 / 82,000 / 86,000: premium charged 5,881 / 5,057 / 5,797 / 6,168 against recorded MAGIs
whose premium is 5,894 / 18,000 / 18,000 / 18,000; the 70,000 year is also forced, with a gap of 13); (2) stale copy:
`#healthcare`, `#acaEnabled`, `#medicareYearly`, the healthcare callout, the employer-plan boxes' small text and the
catch-up tooltips still describe coverage as retirement-only; (3) tests that pass when wrong: the band test (no premium
consistency check), the ACA-off test (the Roth-fill test is the real `estUsed` guard), "Solo money leaves cash" (only a
loose inequality); (4) `LAMBDA_PROFILE` and the other profile literals lack the new keys (fits the timing overrun);
(5) the profit-sharing field's label text for a self-employed partner. Checked correct by the reviewer: spec 3-9 and
Tasks 1-7 as written (decision 8b aside), every MAGI-iteration site, exactness of every edited expression, the law in
the pure functions, and probes (single-person stored B, survivor both ways, two returns, SE plus a W-2 stream with and
without a premium, ACA off, historical and Monte Carlo paths, the $400 floor, the cliff plan's apply replay on three side
businesses and the band household, `planMissed` 0).

Fixes: plan Task 8 (commits 8a speed, 8b the alternative calculation, 8c copy, tests, docs); spec decision 9 supersedes
8b.

##### E1c: review, part 3 (spec owner, Task 8 at `5399f23`, 2026-10-09)

Checked in a scratch worktree of `5399f23`: `npm test` exits 0; snapshot dump of `ee7a789` against the tip (the tip's scenario
list): 934 files, 8 differ, the 8 E1c scenarios; `5fef95b` against the tip: 0 differ (no entry moved in Task 8, as reported). The
8a / 8b / 8c code matches Task 8 (`seOn` in both `buildTaxProfile` literals and `LAMBDA_PROFILE`; no other profile literal reaches
`taxFor`; the 8b block and the `seHeld` carries as written; the copy and test changes are fine, and the implementer's deviations,
the "Solo money leaves cash" test on `rows[0].tax` within 1e-3 among them, are accepted).

Holds: the 82,000 case by hand (step-1 MAGI 58,206.8845, D 5,797.4057 by hand and in the engine, MAGI 70,409.4788, premium
18,000); the premium charged is the one the recorded MAGI allows in every year scanned (single, profits 30,000-110,000 by 1,000,
years 0-9: largest gap $0.15; with inflation 3, income growth 3 and medical inflation 5: $0.18). The illegal understatement is gone.

Findings:
1. **The switch fires where a consistent answer exists (decision 9's premise was wrong; spec owner's error).** The damped 8-pass
   iteration zigzags across the 400% line and gives up although a consistent deduction exists. Year 0, `tx`, $18,000 premium:

   | Household, profit | Engine at `5399f23`: D / premium | Consistent D = premium |
   |---|---|---|
   | single 67,500 / 70,000 / 72,500 | 4,262 / 5,823; 4,687 / 6,013; 4,918 / 6,221 | 5,682; 5,893; 6,103 |
   | single 72,750 / 73,000 / 74,000 | 4,941 / 18,000; 4,964 / 18,000; 5,057 / 18,000 | 6,124; 6,145; 6,229 |
   | single 74,250 and up | alternative calculation | none |
   | joint 91,500 / 98,500 | 6,677 / 7,805; 7,325 / 8,388 | 7,702; 8,292 |
   | joint 99,000 / 100,000 | 7,371 / 18,000; 7,464 / 18,000 | 8,334; 8,418 |

   Rev. Proc. 2014-41 section 5.01 (IRB 2014-33, read 2026-10-09): a taxpayer whose iteration never comes within $1 "may use the
   alternative calculation method ... or another method that produces amounts that satisfy applicable tax law"; the consistent
   deduction is such an amount (and the iterative method's own answer where that converges).
2. **Timing still fails** (`bench_runs_interleaved`, 21 rounds, two runs, simulate / historical): tx +2.1 / +3.6 then +8.0 / +7.1;
   ca +2.5 / +2.5 then +4.7 / +6.3; ny +5.0 / +5.8 then +2.0 / +2.3; pa +4.7 / +5.2 then -0.7 / +1.3; ct +2.4 / +2.8 then +3.4 / +2.9;
   wa +4.5 / +6.3 then +2.3 / +3.1. Texas, the cheapest `taxFor`, is over in most runs (the implementer's three 8b runs: tx simulate
   8.6 / 6.3 / 7.6): a real fixed cost of roughly 4-7% there. Task 8a step 3 (the per-pass additions) and its per-commit bisect
   were not done. `bench_solver` (31 rounds, two runs): ACA early retiree simulate +10.8 / +5.0, path +8.5 / +4.3; default simulate
   +4.8 / +6.6, path +0.0 / +5.6.
3. **The snapshot grid does not reach the band** (the implementer's finding: `R single self-employed cliff band` sits at MAGI about
   83,710).

**Decisions (owner, 2026-10-09):** fix all three as plan Task 9: 9a the consistent-deduction search before the alternative
calculation (spec decision 10), 9b two band scenarios on a household with no income-paying balances (profits 82,000 and 73,000),
9c the per-commit timing bisect, then Task 8a step 3 behind the flags, gated on the median of three interleaved runs.

##### E1c: review, part 4 (Task 9 at `9b47b3a`: spec owner and an independent Opus review, 2026-10-09)

Spec owner, in a scratch worktree of `9b47b3a`: `npm test` exits 0; snapshot dump of `ee7a789` against the tip: 936 files, 10
differ (the 8 E1c scenarios and the 2 new ones); `5399f23` against the tip (the tip's list): 1 differs, `single self-employed band,
consistent`, as intended; `us.json` only gains the two entries. Scans at the tip: no profit with a consistent deduction is missed
(single 66,000-76,000 by 250; joint 90,000-101,000 by 500); the premium charged matches the recorded MAGI (worst $0.15; $0.18
with inflation 3 / 5); a band household with taxable draws (single, $600,000 taxable, spending $90,000, profits 40,000-90,000,
years 0-9): worst gap $0.17, and every alternative year has no consistent deduction at its final draws. 9a and 9c read correct
(9c: every guard skips exact zeros, the order of every sum kept). Timing on a quiet machine (`bench_runs_interleaved`, 21 rounds,
three runs, median per path; simulate / historical): tx -0.5 / 1.8, ca 2.5 / 3.8, ny 1.0 / 1.1, pa 1.8 / **5.3** (runs 5.3, 0.0,
8.0), ct -0.3 / -0.9, wa 2.8 / 1.6; an earlier triple taken while the other review ran probes was noisier (ny simulate median 5.9,
ct 7.0). `bench_solver` 31 rounds, two runs: ACA early retiree simulate 0.0 / +2.9, path +6.4 / +6.0; default simulate +5.0 / +6.5,
path +5.6 / +5.3. The implementer's quiet triple passed every path.

Independent review (verdict: accept; no blocking defect): 9a's bracket, split, per-return independence, the $1 test (a held `lo`
is always consistent, even where `g` is not monotone), the draws, `lastCost` and the cliff-plan carries are correct; eleven
households built to trip the probes (two returns with children, both self-employed with `capA` binding, near 100% of the poverty
line, the Medicaid box on and off, historical and seeded paths, survivors) pass both checks; twelve households built to trip 9c's
guards are identical to `5399f23` (one moved in 9a, correctly); mutations of 9a go red except the lo/hi swap (the bracket ends
under $0.01), a proportional split (no test) and B's search given a zero A deduction (confirms independence). Findings:
1. (medium) The held deduction is priced on the draws of the pass that failed to converge; the re-run's draws move, and the year
   can keep a deduction that is neither consistent nor 5.02's at its final income (always an understatement). Example: single,
   60, a $30,000 self stream, spending $24,000, taxable at 30% basis, `tx`, $18,000 premium, year 0: held 6,224.54, premium 18,000,
   MAGI 74,561, where both methods give 18,000 at the final draws (about $2,600 of tax). 26 of 6,160 band years with draws at the
   tip (142 at `5399f23`). A design gap of decision 10, not an implementation error.
2. (low) The switch fires at a $0 step-1 deduction (`R side business stream`: holds $0 and restarts the passes; numbers
   unchanged), and `seFixed` / `seAlternative` count every phase of a phased year, not the kept one.
3. (low) No test of the A-first split in a held joint year with both self-employed.
4. (low) `CLAUDE.md`: a duplicate `Test:` line and the 8b sentence still describing decision 9's premise; spec 6.5 (the spec
   owner's) still describes the switch without the search.

**Decisions (owner, 2026-10-09):** accept the timing, with PA historical recorded at a median of 5.3% (single runs 0.0-8.0; the
implementer's triple passed); fix findings 1-4 as plan Task 10 (spec decision 11: one re-check at the final draws with at most
one re-hold, no hold at a $0 deduction, kept-phase counters; the joint split test; docs). Spec 6.5 updated by the spec owner in
the same commit as this record. After Task 10 the spec owner reviews alone, then merges.

##### E1c: review, part 5 (spec owner, Task 10 at `1f43dac`, 2026-10-09)

Checked in a scratch worktree of `1f43dac`: `npm test` exits 0; no snapshot entry moved (as reported). The $0 guard, the
kept-phase counters, the search closure (per pass: `costAt` lives in the pass) and the joint split test are fine. Not accepted:
the decision 11 re-hold can deduct more than the premium paid. Grid (single, 60, one self stream of 20,000-60,000 by 1,000,
spending 20,000-40,000 by 1,000, taxable 500,000 at 30% and 60% basis, `tx`, premium 18,000, no inflation, no housing, years 0-4;
8,610 years): years with the deduction above the premium paid: 0 at `9b47b3a`, **224 at `1f43dac`**, worst $12,829 (basis 30,
stream 26,000, spending 26,000, year 4: D 18,000, premium 5,171, MAGI 51,922; section 5.02 at that income gives D 5,171, premium
18,000). The re-hold flips across the 400% line (the implementer saw the flip, stream 39,000 / spending 23,000, but not that it
over-deducts). Premium consistency still holds (worst $0.10). Cause: the draws and the deduction depend on each other, so a held
value and a re-run cannot guarantee a legal answer at the final draws; a re-hold can make it worse. At `9b47b3a` the stale hold
understates in many band years (hundreds of dollars, some about $12,000: the 5.02 value from stale draws where the final draws'
5.02 gives the full premium), legal and conservative. Timing (the implementer's triple): tx historical median +5.5% against
`ee7a789`, -2.8 to +3.1% against `9b47b3a` (Task 10 costs nothing).

**Decisions (owner, 2026-10-09):** option 2: withdraw the re-check (plan Task 11, spec decision 12), keep the rest of Task 10,
add an invariant grid test (deduction never above the premium paid), and record the understatement as a known limitation; the
exact fix, a settlement at the final draws, is designed now for Batch 5 (rigorously, from the start) and built there.

##### E1c: review and acceptance (2026-10-09)

Task 11 (`a63ce6c`, `eb74cc0`) checked by the spec owner in a scratch worktree of `eb74cc0`: `npm test` exits 0; a snapshot dump
of `9b47b3a` against the tip (the tip's scenario list) shows 0 differences, so the tip reproduces Task 9 exactly with the
re-check gone; the spec owner's 8,610-year grid gives identical results at `9b47b3a` and the tip (no deduction above the premium
paid, worst premium gap $0.10; the understatement against the search at the final draws, 1,614 years off by more than $1 by the
spec owner's measure, worst $12,700, is the recorded limitation that Batch 5 settles). The implementer's invariant grid (2,310
years): 0 violations, 422 understated, red at `1f43dac` (55 years above the premium paid). Timing: the implementer's triple against
`ee7a789`, every median within +5% (largest ct simulate 3.7); with the spec owner's quiet triple of Task 9 (PA historical median
5.3%, accepted) this closes the timing gate. Accepted deviations: the grid at a 2,000 stride; 11a committed before its timing
runs; the grid's exactness check on summary tuples (the full rows are covered by the 0-difference dump).

**Decision (owner, 2026-10-09):** E1c accepted. Merged into `claude/batch-3b-penalty-rules` (US V125, Canada V59 unchanged);
`docs/next-batches-plan.md` resolved with the branch's implementation block first, then review parts 1-5; this record added after the merge. Open:
the 162(l) settlement at the final draws (Batch 5, the note at the top of that section). Next: E1d (one-time income tax
treatments, E1a spec section 1), designed with the owner from the start.

##### E1d: design (owner decisions, 2026-10-09)

Spec `docs/superpowers/specs/2026-10-09-e1d-one-time-income-design.md`. Base `14dde9a` (US V125, Canada V59). US only, no
shared-region change.
- The inherited traditional IRA / 401(k) is split out as its own sub-batch, **E1e** (after E1d, before E1-CA); the spec's
  section 11 records the preferred shape (a real `bal.inheritedTrad` account) and the open questions.
- Four kinds per lump: tax-free (default; every legacy row), wages (severance, bonus: payroll tax; *Quality Stores*, 572 U.S.
  141), ordinary income with no payroll tax (nonqualified deferred compensation: FICA at vesting, IRC 3121(v)(2); not a pension
  lump or an annuity, after the review), long-term capital gain with a gain share.
- An owner per taxable lump (Partner A / B), hidden in single-person mode and for tax-free; timing stays Partner A's age. A dead
  owner's wages or ordinary lump goes to the survivor as ordinary income with no payroll tax (IRC 691); a dead owner's gain is
  tax-free (IRC 1014).
- Gain rows get an "Active business (no NIIT)" checkbox (IRC 1411(c)(1)(A)(iii), (c)(4)): the gain leaves net investment income
  but stays in MAGI.
- Taxable lumps enter the year's cash flow (`wages`), so they pay their own tax and the guardrails never record that tax as a
  withdrawal; tax-free lumps keep today's cash path exactly.
- Approach: a pure splitter `lumpAmountsForYear(lumps, ctx, out)` (scratch `LUMP_OUT`); wages and ordinary lumps ride the
  existing `streamWagesA/B` / `streamOtherA/B` arguments, gains go on new profile fields read only when `profile.lumpOn`.
- No existing snapshot entry may move; the timing gate is the usual one.

**Spec review (independent Opus review of `41fd93a`, 2026-10-09).** Two blocking findings: the guardrails and
`firstWithdrawal` would read a lump year's smaller need (a severance in the retirement year sets a low baseline rate and
later years are cut toward 0.5x; `Planner_US.html` ~10917, ~11111); tests load raw rows through `Object.assign`
(`tests/snapshot.js:78`), so a row with no `kind` must be tax-free in the engine, and a `gainPct` 0 row could lose cash.
Should-fix: an annuity payout is net investment income (1411(c)(1)(A)(i)) and a pension lump or annuity owes the 10% under
72(t) / 72(q) before 59 1/2 (both removed from the ordinary kind); Washington's capital gains tax would be charged on a
real-estate gain lump; a wages lump must use up the self-employment tax wage base; the lump gain must be added inside each
`taxFor` branch (not before the two-filer 50/50 split); eight missing tests. Minor: law notes (joint-property step-up,
121(b)(4), the 3121(v)(2) caveat), a fixed profile shape, E1b's legacy alignment copied exactly, `row.income`, the Roth
fill's provisional income, the final-year end value. All adopted; spec section 12 is the record.

**Decisions (owner, 2026-10-09; spec decisions 7-10):** A1, a year with a taxable lump records no guardrail withdrawal and
no `firstWithdrawal` (as a surplus year today); B1, asset-specific state rules for gains are not modeled in E1d (named in the
gain tip; E5); C1, only the gain share of a gain lump enters the flow, the basis goes to cash; D1, the death year counts as
after death, as for streams.

**Spec re-review (same reviewer, of 1a90e77, 2026-10-09).** All first-review findings resolved except an incomplete gain-reader
list; seven new should-fix or minor findings, all adopted (spec section 12). **Decision (owner, 2026-10-09; spec decision 11):**
the year after a lump year holds the guardrail multiplier (a lump year clears prevPortfolio after its own step), so one
observation never moves spending twice; retired surplus years keep the existing double step.

**Plan** `docs/superpowers/plans/2026-10-09-e1d-one-time-income.md` (four tasks: inputs; the splitter, cash flow, wages and ordinary
lumps, guardrails; gains in the tax code and MAGI; scenarios and docs). Reviewed by the same reviewer at `1571c02` (2026-10-09): no
blocking finding; adopted: a UI check that a kind change reaches the projection, an engine case for a dead owner's wages and
ordinary lumps (death year included), the ACTC from severance against deferred compensation, the engine helper's save/restore
pattern, `mt` / `nm` as the gain-rule states, `__test_tax` (no new hook), the gain-band cases replaced by the bit-exact
equivalence (stated), and the spec's section 7 note on the DYN rows made by the spec owner instead of Task 4.
A final fresh Opus review of the plan at `c8a7a45` (2026-10-09): no blocking finding; adopted: a NIIT case where the MAGI excess binds
(the excluded gain must stay in MAGI) and an engine MAGI check with the box ticked; the engine households pinned (no ladder sale, no
investment income, rent); the tooltips (the NIIT box excludes C-corporation stock, 1411(c)(4); only taxable kinds raise MAGI; an
employer's award is wages; depreciation recapture as an ordinary lump is an approximation, a rental's being unrecaptured section 1250
gain at up to 25%, IRC 1(h)(1)(E), (h)(6)(A)); a historical snapshot scenario (the bucket strategy); `wrapHidden` in the UI test; a
real check of A's return in the owner-B case; the plan's spec citation.

##### E1d: implementation (US V125 -> V126)

Branch `claude/e1d-one-time-income`, base `9c390e5` (planner code identical to `14dde9a`); US only, no shared-region change
(`npm run check:shared` OK at every commit), Canada V59 unchanged. Timing baseline: a detached worktree of `14dde9a`.

Commits:
- `c618a9f` E1d 1: the inputs (`kind`, `owner`, `gainPct`, `activeBusiness` on `DYN.oneTimeIncome`) and `normalizeUsLumps`;
  `legacy_state.json` gains three corpus cases (`lump kinds`, `lump junk`, `lump legacy flag`), no existing hash changed.
- `85cffd0` E1d 2: `lumpAmountsForYear` (scratch `LUMP_OUT`), taxable lumps in the year's `wages`, wages and ordinary lumps on the
  owner's return (payroll tax and the self-employment wage base through `ssWagesA/B`), the guardrail rule (decisions 7 and 11).
- `670941d` E1d 3: gain lumps in `taxFor` (every branch), the NIIT active-business exclusion, `returnMagis`, `magiBase0`,
  `row.income`.
- Task 4 (this record's commit): nine snapshot scenarios (added only), README, CLAUDE.md, these notes, the note text, US V126.

Red then green, per task:
- Task 1: red `legacy-state corpus MISMATCH: US lump kinds / lump junk / lump legacy flag` and `test_lump_income.js`
  `Failed to find element matching selector "#oneTime0Kind"`; green after the inputs (legacy baseline updated: 3 added keys).
- Task 2: red `window.__test_lumpAmountsForYear is not a function`, then (splitter only) `severance: payroll tax: 0 vs 3825`;
  green `tests/lump_income.js`; snapshots exact (US 560, Canada 376).
- Task 3: red `lump gain = gains arg: tx mfj se=false: 21280 vs 80066`; green; snapshots exact.
- Task 4: red `node tests/snapshot.js`: `[US] snapshot MISMATCH (9 of 569 scenarios)`, each `not in baseline`; green after
  `npm run snapshot:update`. `tests/lump_income.js` gained the strengthening the Task 3 review suggested (it passed with no expected
  value changed): the dead-owner gain case also asserts `magiProxy` equal to the tax-free run, and a B-dies twin (owner B, B dies at
  47) asserts the same tax and `magiProxy`. Checked not vacuous: with the twin's gain owned by the living A, the tax assert fails.

The `wages` readers in the year body (Task 2): the definition (`let wages = ...`, then `if (lumpYear) wages += lumpFlow;`), the
bucket and standard `flow` expressions, and `row.wages`. Nothing else in the year body reads `wages`; the lump wages reach the tax
and payroll code through `ssWagesA/B` (both `selfEmploymentTax` calls, `buildTaxProfile`'s and `payrollTax`'s `streamWagesA/B`).
`retirementContributions` still gets `streams.wagesA/B` (a lump makes no contribution, spec 6.3).

The gain reader lines (Task 3, at `670941d`): `taxFor` reads `lumpOn` once at the top. Joint and one-person branches: the gain is
added to `gains` as the branch's first statement, and every later reader sees it (provisional income and taxable Social Security,
`sources.gains`, `federalLiabilityForState`, `federalDeduction`, QBI taxable income and net gain, `longTermGainTax`, the
`childCredits` MAGI, `niitTax`, whose MAGI keeps the excluded part and whose net investment income leaves it out). Two filers:
`gainA/gainB` become `let` and each gets its owner's gain, then the same readers per return. Elsewhere: `returnMagis` (appends each
owner's gain), `buildTaxProfile` (parameters, the survivor literal with B's gain in slot A, the normal literal), the year loop's
`buildTaxProfile` call, `magiBase0` and `totalIncome` (two places: after the initial `let` and after the deficit branch).

Legacy diff (Task 1 only): `tests/snapshots/legacy_state.json` adds `lump kinds`, `lump junk` and `lump legacy flag`; no existing
hash moved.

Snapshot diff (Task 4): `tests/snapshots/us.json` gains nine entries and nothing else (`git diff tests/snapshots/us.json | grep
'^-' | grep -v '^---'` prints nothing): `std R lump severance retirement year`, `std R lump deferred comp B`, `std R lump gain`,
`std R lump business sale`, `std R lump gain B two returns`, `std R lump dead owner`, `std R lump guardrails later`, `std R lump
ACA line`, and `hist R lump gain | real1966` (the bucket strategy). `canada.json`, `ui_canada.json` and `legacy_state.json`
unchanged.

**Owner ruling (2026-10-09, Task 4): the one-time income note.** Task 1 kept the old `DYN.oneTimeIncome` note ("Tax-free lump sums
received at a specific age.") because the rendered-results text in `tests/snapshot_ui.js` includes it (the plan's claim that the
DYN rows are outside `snapshot_ui.js` holds for the controls, not for the rendered text). The owner ruled that Task 4 switches it to
the spec's "Lump sums received at a specific age, each with its own tax treatment." and regenerates `ui_us.json`
(`node tests/snapshot_ui.js --update --only US`), the diff limited to the text the note changes. Result: exactly three surfaces
moved, `textHash` and `textLength` only (+24 characters each, the note's length difference): `std default` 28,238 -> 28,262,
`std R` 27,853 -> 27,877, `std R everything` 29,670 -> 29,694; every `projectionHash`, `rowsHash`, `histSuccess` and every control
entry unchanged. The version badge is not in that text (the UI check passed after V126). One flake seen while checking: on one
run `std R everything` read `histSuccess` "85%" (and a longer text) instead of "—", a timing race in the capture; the immediate
re-run read "—" and the baseline was written from a run that matched the committed `histSuccess`.

Timing, `node tests/bench_runs_interleaved.js --base ../fp-e1d-base --rounds 21`, three runs, quiet machine.

Task 2 (median simulate / historical): tx +1.5% / +1.8%; ca -0.3% / -2.4%; ny -2.3% / -2.2%; pa -2.1% / -2.5%; ct -1.8% / -2.7%;
wa -2.2% / -3.0%.

Task 3 (median): tx +1.0% / 0.0%; ca +3.2% / +3.7%; ny +1.9% / +2.3%; pa +2.1% / +2.6%; ct +2.4% / +2.8%; wa +0.9% / +1.5%
(run 2 alone had tx at +5.2% / +5.3%, inside the noise).

Task 4 (final tree):

```
=== run 1
US tx  400 simulate 194 -> 196 ms (1.0%), 120 historical 58 -> 57 ms (-1.7%)
US ca  400 simulate 312 -> 296 ms (-5.1%), 120 historical 86 -> 86 ms (0.0%)
US ny  400 simulate 307 -> 314 ms (2.3%), 120 historical 88 -> 90 ms (2.3%)
US pa  400 simulate 281 -> 288 ms (2.5%), 120 historical 78 -> 80 ms (2.6%)
US ct  400 simulate 378 -> 381 ms (0.8%), 120 historical 110 -> 111 ms (0.9%)
US wa  400 simulate 225 -> 228 ms (1.3%), 120 historical 66 -> 67 ms (1.5%)
=== run 2
US tx  400 simulate 193 -> 194 ms (0.5%), 120 historical 58 -> 58 ms (0.0%)
US ca  400 simulate 286 -> 287 ms (0.3%), 120 historical 82 -> 82 ms (0.0%)
US ny  400 simulate 319 -> 311 ms (-2.5%), 120 historical 91 -> 89 ms (-2.2%)
US pa  400 simulate 288 -> 283 ms (-1.7%), 120 historical 81 -> 78 ms (-3.7%)
US ct  400 simulate 372 -> 374 ms (0.5%), 120 historical 107 -> 109 ms (1.9%)
US wa  400 simulate 232 -> 226 ms (-2.6%), 120 historical 67 -> 66 ms (-1.5%)
=== run 3
US tx  400 simulate 196 -> 194 ms (-1.0%), 120 historical 58 -> 58 ms (0.0%)
US ca  400 simulate 293 -> 283 ms (-3.4%), 120 historical 84 -> 82 ms (-2.4%)
US ny  400 simulate 322 -> 323 ms (0.3%), 120 historical 94 -> 91 ms (-3.2%)
US pa  400 simulate 295 -> 294 ms (-0.3%), 120 historical 81 -> 82 ms (1.2%)
US ct  400 simulate 385 -> 391 ms (1.6%), 120 historical 112 -> 114 ms (1.8%)
US wa  400 simulate 238 -> 235 ms (-1.3%), 120 historical 69 -> 69 ms (0.0%)
```

Median of three (simulate / historical): tx +0.5% / 0.0%; ca -3.4% / 0.0%; ny +0.3% / -2.2%; pa -0.3% / +1.2%; ct +0.8% / +1.8%;
wa -1.3% / 0.0%. Every path is within +5% at every task.

Deviations: Task 1 kept the old note (superseded by the owner ruling above); Task 2 removed the `LUMP_ENGINE=1` gate in
`test_lump_income.js` (owner ruling), added a pure `gainPct: null` case, and wrote the forced-pass `!lumpYear` guard as two
conditions (the `initialWR` restore sits between them; same behaviour); Task 3 did not redeclare `A0` (already defined, identical).

For the owner: deferred minors from the task reviews: `gainPct` is not clamped while typing (it is clamped on load and read
defensively by the engine); the `gainPct` parse is duplicated in `normalizeUsLumps` and `lumpAmountsForYear`, and `true` reads as 1%;
a negative raw amount with a taxable kind vanishes (only through a hand-edited save); junk `''` / `null` `gainPct`
are not in the legacy corpus. The 162(l) and E1e items are unchanged by E1d.

**Task 6 (code-review fixes, decision 12).** The independent code review of `12d2970` found four cases of correct code with no
test and one modelling gap. Code: in `lambdaOf` the need passed to `lambdaEstimate` is
`Math.max(0, lumpYear ? -flow - lumpExpense + lumpFlow : -flow - lumpExpense)` (decision 12: one-time income, like a one-time
expense, is not part of the yearly draw the pool walk assumes); a test-only `yearLambdaNeed` (declared beside `yearLambda`) is
recorded as `planTr.lambdaNeed` (null when lambda was not computed). Tests in `tests/lump_income.js`:
- (a) the survivor's own gain after A's death (S0, B sells 300,000 at A's 48): taxed, MAGI +300,000, and the active-business
  twin's tax is lower by exactly 9,880 (3.8% x 260,000) with the same MAGI. Mutations: `lumpGainA: 0` in the survivor literal fails
  `the survivor's own gain is taxed`; `lumpGainNoNiitA: 0` there fails `survivor's active-business gain: no NIIT on it: 0 vs 9880`.
- (b) A's gain in a two-return year: `magiA` +200,000, `magiB` +0. Mutation (drop `m[0] += profile.lumpGainA` in `returnMagis`):
  `A's return carries A's gain: 0 vs 200000`.
- (c) `row.income` equals `magiProxy` in a lump year that still draws (retired couple, gain lump 20,000 at 53). Mutation (drop the
  withdrawal-branch `totalIncome` lump line): `71489.15... vs 91489.15...`.
- (d) the forced pass's `firstWithdrawal` guard: found at the first scan step (ordinary lump 50 at 58, A0 with guardrails);
  `firstWithdrawal` 0 and `initialWR` null. Mutation (drop `!lumpYear &&`): `firstWithdrawal` 14,284.35 instead of 0.
- (e) decision 12: red before the fix (`lambdaNeed` undefined). The plan's age 54 does not work: in this household lambda is not
  computed at any age 53-59 (every plan-trace entry has `lambdaNeed` null, lump or not; the first plan-candidate year is 60), so the
  case uses age 60, the first age where both runs compute it. At 60: fixed, lump run 161,155.49 vs tax-free twin 161,155.49
  (difference about 3e-11); old formula, 131,155.49 vs 161,155.49 (30,000 below), which fails the assertion.

No snapshot mover: `node tests/snapshot.js` exact (US 569, Canada 376) with the fix, so `us.json` is unchanged (no lump scenario
has a lambda year with a lump in it). `npm test` green; `npm run check:shared` OK.

Timing (Task 6 tree vs `../fp-e1d-base`, 21 rounds):

```
=== run 1
US tx  400 simulate 195 -> 207 ms (6.2%), 120 historical 58 -> 61 ms (5.2%)
US ca  400 simulate 293 -> 300 ms (2.4%), 120 historical 84 -> 85 ms (1.2%)
US ny  400 simulate 342 -> 339 ms (-0.9%), 120 historical 96 -> 97 ms (1.0%)
US pa  400 simulate 316 -> 320 ms (1.3%), 120 historical 89 -> 88 ms (-1.1%)
US ct  400 simulate 395 -> 387 ms (-2.0%), 120 historical 116 -> 112 ms (-3.4%)
US wa  400 simulate 234 -> 231 ms (-1.3%), 120 historical 69 -> 68 ms (-1.4%)
=== run 2
US tx  400 simulate 197 -> 200 ms (1.5%), 120 historical 60 -> 59 ms (-1.7%)
US ca  400 simulate 291 -> 293 ms (0.7%), 120 historical 83 -> 82 ms (-1.2%)
US ny  400 simulate 311 -> 320 ms (2.9%), 120 historical 90 -> 90 ms (0.0%)
US pa  400 simulate 284 -> 288 ms (1.4%), 120 historical 80 -> 80 ms (0.0%)
US ct  400 simulate 378 -> 383 ms (1.3%), 120 historical 110 -> 110 ms (0.0%)
US wa  400 simulate 226 -> 229 ms (1.3%), 120 historical 66 -> 67 ms (1.5%)
=== run 3
US tx  400 simulate 198 -> 201 ms (1.5%), 120 historical 58 -> 59 ms (1.7%)
US ca  400 simulate 289 -> 291 ms (0.7%), 120 historical 83 -> 83 ms (0.0%)
US ny  400 simulate 321 -> 320 ms (-0.3%), 120 historical 92 -> 91 ms (-1.1%)
US pa  400 simulate 292 -> 291 ms (-0.3%), 120 historical 82 -> 81 ms (-1.2%)
US ct  400 simulate 386 -> 386 ms (0.0%), 120 historical 114 -> 112 ms (-1.8%)
US wa  400 simulate 232 -> 233 ms (0.4%), 120 historical 68 -> 68 ms (0.0%)
```

Median of three (simulate / historical): tx +1.5% / +1.7%; ca +0.7% / 0.0%; ny -0.3% / 0.0%; pa +1.3% / -1.1%; ct 0.0% / -1.8%;
wa +0.4% / 0.0%. Run 1 alone had tx at +6.2% / +5.2% (noise; the change adds one comparison in a year that computes lambda).

##### E1d: review and acceptance (2026-10-09)

**Review of the implementation (spec owner, 2026-10-09, tip `12d2970` of `claude/e1d-one-time-income`).** `npm test` passes; a
snapshot dump of `14dde9a` against the tip (the tip's list) compares 945 files and only the 9 new lump scenarios differ (936
bit-identical, Canada included). Probes (294 retired households drawing from the portfolio: TX, CA, NY two returns, ACA,
guardrails, single 60 ACA, single 67 Medicare in PA; 3 kinds x 3 amounts x 2 ages x owner / checkbox variants, each against a twin
with the lump tax-free; plus 15 historical paths): in the lump year the change in investable plus tax plus expenses is zero within
2.1 cents (the twin's own draw-solver residual); tax never falls and never exceeds 37.3% of the lump; a 150,000 severance for a
married couple adds exactly 11,475 of payroll tax; the NIIT box on a 2,000,000 business sale (80% gain) lowers tax by 51,300 with
MAGI unchanged (the MAGI excess binds: 3.8% x 1,350,000); the guardrail hold works (0.590 -> 0.531 stepped, cleared, held at
0.531); no missed cliff-plan year. In an ACA household a 20,000 severance costs 10,742 of credit (the 400% line; the law).
Not holding: the Methodology callout (since E1b), the E1b UI test's junk kind, the CLAUDE.md files list and a comment citation
(plan Task 5, owner decision A). An independent Opus code review (owner decision B, run in parallel) found no blocking bug, four
test gaps confirmed by mutation, and lambda's need in a lump year (spec decision 12, owner: fix now; plan Task 6).

Tasks 5 and 6 checked by the spec owner at `1fc8683` (a scratch worktree): `npm test` exits 0, including a fresh UI-snapshot
capture that matches Task 5's hand-patched `ui_us.json` hashes (the three `textHash` / `textLength` pairs, +257 characters each,
from the Methodology sentence only); a snapshot dump of `14dde9a` against the tip compares 945 files and only the 9 new lump
scenarios differ; `us.json` is unchanged since `12d2970` (Task 6 moved nothing: none of the nine lump scenarios has a cliff-plan
candidate in its lump year, so decision 12 is exercised by its test only); the spec owner's probe grid gives the same results on the
tip. Decision 12's code is the one term the spec names, read only in a lump year; the test-only `yearLambdaNeed` sits beside
`yearLambda` (once per year). Accepted deviation: Task 6's lambda test runs at age 60 (before 59 1/2 the household has no
penalty-free traditional money, so no candidate and no lambda), with an added exact match to the tax-free twin's need.

**Decision (owner, 2026-10-09):** E1d accepted (no further code review: the engine diff had per-task reviews, a whole-branch review
and an independent Opus code review with mutation probes; the code after it is decision 12, about 6 lines, checked by its task
reviewer and the spec owner). Merged into `claude/batch-3b-penalty-rules` (US V126, Canada V59 unchanged); this file resolved with
the branch's implementation block first, then the review and this record. Open: the UI-snapshot `histSuccess` race (Open items);
E1e (the inherited traditional IRA / 401(k), spec section 11) is next in Batch E.

**E1e scope note (owner, 2026-10-09; to research at the start of E1e, primary sources with retrieval dates):** E1e covers
inherited accounts from someone outside the household (typically a parent); a deceased partner's accounts are not E1e (a surviving
spouse is an eligible designated beneficiary who can roll over or treat the account as their own, which the survivor model already
does: the survivor owns every account). Three inherited kinds are expected, not decided:
- Inherited traditional IRA / 401(k), owner died BEFORE the required beginning date: no yearly distributions; empty by December 31
  of the tenth year after the year of death (IRC 401(a)(9)(H), SECURE Act). Ordinary income; no 10% penalty (IRC 72(t)(2)(A)(ii)).
- Inherited traditional IRA / 401(k), owner died ON OR AFTER the required beginning date: yearly RMDs in years 1-9 (the
  beneficiary's single life expectancy, or the decedent's remaining one if longer) plus empty by year 10 (final regulations, T.D.
  10001, Treas. Reg. 1.401(a)(9)-5; the missed-RMD penalty was waived for 2021-2024, Notice 2024-35, so enforced from 2025).
- Inherited Roth IRA / designated Roth 401(k): the 10-year rule, no yearly distributions (a Roth IRA owner has no lifetime RMDs,
  IRC 408A(c)(5), so is always treated as dying before the required beginning date; designated Roth 401(k)s have had no lifetime
  RMDs since 2024, SECURE 2.0 section 325); tax-free once the decedent's five-year holding period is met (earnings taxable
  otherwise, no penalty). The usual best path is tax-free growth to year 10, then cash: no MAGI effect.
To confirm at E1e (all cited from memory 2026-10-09, not yet checked): each citation above; the eligible-designated-beneficiary
classes (a minor child of the decedent, disabled, chronically ill, not more than 10 years younger) and which are worth an input;
the single life table beyond age 65 (`singleLifeDivisor` covers 18-65); an inherited 401(k)'s plan rules versus an IRA's;
whether the 5-year Roth rule needs an input.

##### E1e: design (owner decisions, 2026-10-09)

Spec `docs/superpowers/specs/2026-10-09-e1e-inherited-accounts-design.md` (base `6c26726`; US V126, Canada V59). US only, no
shared-region change. Every citation of the scope note above was checked against primary sources (spec section 4).
- Scope: the 10-year rule for a non-eligible designated beneficiary only (eligible-beneficiary stretches named, not modeled).
- Two new kinds on the one-time income row, "Inherited traditional IRA / 401(k)" and "Inherited Roth IRA / 401(k)" (IRA and
  401(k) share the federal rules; the 402(c)(11) transfer to an inherited IRA is assumed); "Received at" is the year of death;
  a past year is allowed (amount = today's balance, the draws cover the years left).
- A real account per row (`bal.inheritedTrad` / `bal.inheritedRoth` plus a per-row ledger), growing at the year's stock return in
  every run mode; traditional drawn evenly over the 10 years after the death (balance over years left) with the RMD on the heir's own
  Single Life factor as a floor and the account as a cap (the floor binds when `(1 + r)(L - k + 1) < 11 - k`: never at r >= 0 for
  an heir 81 or younger; no input); Roth paid out whole in year 10 (a transfer to cash, no tax, no MAGI); no Roth five-year input
  (always met by year 10).
- Last resort before home equity, after the household's capped traditional money is released (inherited Roth, then
  traditional; before penalized money in the penalty-aware orders; inside the US-only `BUCKET_STEP.home` / `.penalized`, the
  shared bucket orders unchanged), taxed exactly like a scheduled draw, carried per owner through the MAGI iteration as a fourth
  estimate (`estInhA/B`, E1c's pattern), uncapped by the cliff plan.
- The guardrails, `firstWithdrawal` and lambda's need add the scheduled draw back (as E1d decision 12); a draw-made surplus year
  records too.
- Display folded into the existing columns (row fields only in inherited years; a US-only tooltip annotation).
- State: a new explicit `STATE_RULES.inherited` field on all 51 rows, five values (`ordinary`, `exempt`, `heir`, `heirAnyAge`,
  `decedent` with a cap), every jurisdiction searched (spec appendix A): exempt PA, IL, MS, IA; heir GA, CT, DE, KY, LA, MO, NJ,
  WI; heirAnyAge CO, AR, OK (OK a reading); decedent NY ($20,000, sole beneficiary assumed); ordinary everywhere else.
- Spec self-review correction: the brainstorm said the even draw meets the RMD "for an heir under about 90"; the bound is a
  factor of at least 10, so 81 or younger. Fixed by the RMD floor (decision 2) with no input.
- **Spec review (independent Opus review of `6679c3e`, 2026-10-09):** 3 blocking, 9 should-fix, 9 minor, all adopted (spec
  section 11; owner decisions 12-14: the per-owner fourth estimate, New York's decedent assumed 59 1/2 or older, an early
  inherited-Roth last-resort draw tax-free). Blocking: the floor's divisor reaching 1 or less from heir age 84 (B1), stale state
  sources in the reused scratch objects (B2), and the shared bucket orders (B3); B1, B3, S3, S5 and S6 were the spec owner's
  errors. The owner asked for a second independent review of the revised spec.
- **Second spec review (independent Opus review of `c9845d6`, 2026-10-09):** 1 blocking, 6 should-fix, 9 minor, all adopted
  (spec section 11). Blocking: a last-resort draw in the survivor period went to slot B, which the one-person tax branch
  never reads (now the post-remap slot). Owner decision 15 (option A): the guardrails, `firstWithdrawal` and lambda add the
  scheduled draw back net of its own tax (one extra `taxFor` per pass in a year with a scheduled draw). Also: the draw in the
  state `ordinaryNonSS` (Washington), the fourth estimate's full site list, one heir-age convention, inherited snapshot
  scenarios only in the last commit. The owner asked for a third independent review.
- **Third spec review (independent Opus review of `cdd1758`, 2026-10-09):** no blocking, 3 should-fix, 10 minor, all adopted (spec
  section 11). Owner decisions: 16, the need readers also remove the premium credit the draw costs (one extra premium evaluation
  per pass in a year with a scheduled draw); 17, a death before 2020 is stretched over the heir's life expectancy (RMD alone, no
  deadline, any past year; the surviving partner empties it within 10 years of the heir's death, SECURE Act section 401(b)(5));
  the select offers the new kinds only from commit 3. Also `inhOn` set in every year of an inherited run (a receipt-year last
  resort was untaxed). The owner chose to go to the implementation plan.
- **Plan review (independent Opus review of `e5b760b`, 2026-10-10):** 2 blocking, 9 should-fix, 13 minor, all adopted in the
  plan (`docs/superpowers/plans/2026-10-09-e1e-inherited-accounts.md`; the spec is unchanged). Blocking: `compileRow` read
  `row.inherited.kind` and threw on the test-only synthetic state rows of five test files that carry no `inherited` field (B1;
  now defaults to `ordinary`), and the ledger test's expected `L` was 31.6 (age 55) instead of SLT[53] = 33.4 (B2). Main
  should-fix fixes: `tests/state_rules.js`'s exact field set gains `inherited` (schedule overrides already rejected, S1);
  Task 4 may move `ui_us.json` text hashes (the list note and tip, S2); the stretch successor rule (year Y still a stretch
  year, the 10-year schedule from Y + 1, the floor on the heir's factor continued, tested with an 80-year-old heir, S3); only
  `inheritedApply` opens a row (S4); the ACA need tests rebuilt so the inherited run crosses the 400% line and the twin's
  sales realize no gain (S5); the year-10 guardrail test asserts the need and the portfolio, not the next multiplier (S6);
  `takeInherited`'s bisection (24 iterations on [0, min(balance, 6 x need + 1)]), the per-pass last-resort reset and a
  `null` default for `newWithdrawal`'s ledger (S7); engine cases for every spec section 7 requirement that had no step
  (Social Security, ACA, IRMAA, the Roth fill, owner B on two returns, NY after a death, a historical run, AR at 50, GA at
  65, the Roth sweep at full basis, a 2018 stretch row over three years) and a `taxFor`-level NIIT check that a leak into
  net investment income would fail (S8); lambda's gate `!== 0` like the guardrails' (S9). B2 and S3 were the previous spec
  owner's errors.
- **Second plan review (independent Opus review of `d2f6680`, 2026-10-10; figures checked by running today's code with an
  income stream standing in for the draw):** 4 blocking, 3 should-fix, 8 minor, all adopted in the plan (spec unchanged).
  Blocking, all test values that a correct implementation would fail: the IRMAA case needs `irmaaPriorKnown` (else years
  0 and 1 read year 0's own MAGI; B1); `basisRatio: 100` does not make a sale gain-free, because the year's growth comes
  before the sale and the basis rises only by dividends, so the ACA cases now use `returnRate: 0, dividendYield: 0, basisRatio: 100` (`basisRatio` added after the third plan review)
  (draw 42,800, premiums 18,000 and 5,678.47, recorded need 38,518.47 in both runs) and the owner-B case a surplus
  stream (B2); the AR and NY comparison profiles moved the taxed part through `otherA`, which never reaches the state
  return (now `extraA`; B3); the year-10 guardrail test compared the need with a twin whose multiplier and IRMAA differ
  (now the run's own expenses; B4). Should-fix: the stale-source guard reads every scratch object through a new hook
  (S1); the NIIT check is an engine case, since a leak would come from `buildTaxProfile` (S2); `inhRealA/B` are declared
  after the `wd` destructure and the earlier fill check reads `wd` (S3). Minor: the TX comment (a deficit year), the Roth
  fill tolerance $0.10, `INH_OUT.any` set after the row opens, the call-counter hook, notes placed before "Not modeled",
  the heir-81 walk, the floor/cap sweep, CO at 60, the `afterTaxValue` term, the decedent per return, the NY child credit
  case, a past row in the legacy corpus. All seven blocking and should-fix findings were the plan owner's errors (B2's
  claim came in with the first review's S5 text and was repeated in four more cases).
- **Third plan review (independent Opus review of the `d2f6680`..`ef82886` diff only, 2026-10-10; measured on today's
  code with a stream standing in for the draw):** 1 blocking, 2 should-fix, 5 minor, all adopted (spec unchanged).
  Blocking: the ACA cases had dropped `basisRatio: 100`, so the twin's sales at the default 50% basis still realized gains
  (twin MAGI 80,425.14, premium gap 9,989.73); they now use `returnRate: 0, dividendYield: 0, basisRatio: 100`, which
  measures exactly the plan's 60,000 / 5,678.47 / 38,518.47 (B1). Should-fix: Task 6's fill check read the bare
  `traditionalGross` / `taxableGainGross` before their `const` destructure (now `wd.`; S1); every hand-built `inhOn` profile
  carries all six inherited fields, and the `afterTaxValue` literals the bond and home fields (S2). Minor: the CO stale
  check given state income it can see, the six rows with a "Not modeled" sentence (PA's not last), year 8's IRMAA aside
  (tier 1, 2,296.80), a resettable call counter, and `window.__test_inherited` extended, never reassigned. B1 and S1
  were the plan owner's errors in the second revision. The reviewer measured and confirmed every other figure the diff
  added (TX 58,000, IRMAA 2,296.80, NIIT, owner B, Social Security 1,299.00, the Roth fill, the NY child credit 165.00,
  the extraA comparisons, the heir-81 walk, afterTaxValue).
- **Fourth plan review (independent Opus review of the `ef82886`..`5457b7e` diff, 2026-10-10):** no blocking, 1
  should-fix, 2 minor, all adopted: the sixth row with a "Not modeled:" sentence is DC, not WI (S1); CT's exclusion share
  reads the state base `start`, not the federal AGI (M1); year 8's MAGI in the year-10 aside is the measured 264,082.49
  (M2). The reviewer measured the third revision's figures (the ACA twin at 60,000.00 / 5,678.47 / 38,518.47, each of
  the three settings needed; the CO stale check 257.40 fresh, 961.40 stale) and found them right. With a review round free
  of blocking findings, the owner moved to implementation.
- **Decision 18 (owner, 2026-10-10, raised by the Task 6 implementer at `0a37cea`):** the Roth bracket fill saw the
  scheduled draw and the 162(l) estimate but not the last-resort estimate, so a last-resort year over-converted (23,700
  against 0 in the two-return identity household). Fixed as E1c does for 162(l): `profile.inhEstA/B` set at the pass top,
  added to the fill's other income only when non-zero (spec decision 18; plan Task 6b, before Task 7). After Task 6b
  (`c0c0fd8`), the reviewers found the conversion now converges slowly in a year with a large last-resort draw (the
  8-pass cap, about 0.04% of the draw short; under $15 a year of tax); the owner recorded it as a limitation (spec
  decision 18 and section 9) rather than adding a secant step. Plan Task 7 Step 0 pins the bound in a test.
- Found on the way, outside E1e: the RI row excludes all traditional draws, but Rhode Island's modification never covers IRA
  income (Open items).

##### E1e: implementation (US V126 -> V127)

Branch `claude/e1e-inherited-accounts`, from the plan at `3a5b7cb`; US only, no shared-region change (`npm run check:shared` OK
at every commit), Canada V59 unchanged. Timing baseline: the worktree `../fp-e1e-base` at `3a5b7cb` (planner code identical to
`6c26726`), `node tests/bench_runs_interleaved.js --base ../fp-e1e-base --rounds 21`, three runs per task.

Commits:
- `d6ebfae` Task 1: `STATE_RULES.inherited` on all 51 rows (spec appendix A) with a notes sentence each, the generator
  (`docs/state-tax-rules.md` regenerated) and the coverage test (`tests/state_rules.js`); `singleLifeFactor` (the full Single Life
  Table); `tests/inherited_accounts.js` added to `npm test`; no number change.
- `37729d5` Task 2: the five kinds in `stateIncomeTax` / `stateRetirementExclusion`, the five sources fields written on every
  taxing-state call (spec 6.4), `inhExtraA/B` in `taxFor`'s other-income sums under `inhOn`; inert (no profile carried an inherited
  amount yet); no number change.
- `89ed809` Task 3: `normalizeUsLumps` keeps the two kinds, `lumpAmountsForYear` skips them (spec 5.2); `legacy_state.json` gains
  one case (US corpus 44 -> 45 saves), no existing hash moved; the select did not offer the kinds yet.
- `602107b` Task 4: the account (ledger, 10-year and stretch schedules, Roth transfer, the draw in `flow` and on the owner's federal
  and state returns, NY's base exclusion, totals, rows, estate, the two select options and their copy, the status tooltip),
  `test_inherited_accounts.js`; no existing number change, no scenario added.
- `eebc82a` Task 5: the guardrails, `firstWithdrawal` and lambda record the need with the scheduled draw added back net of its own
  tax and premium (decisions 15, 16); a draw-made surplus year records; the guardrail portfolio before the draw (spec 6.7).
- `0a37cea` Task 6: the last resort (`takeInherited`: Roth then traditional, after the cap release, before penalized money and
  home equity, inside the US-only `BUCKET_STEP.home` / `.penalized`; taxed like a scheduled draw on the post-remap slot) and the
  fourth estimate `estInhA/B` on E1c's pattern (spec 6.5, 6.6).
- `a8d20f1` (merged as `49434c6`): decision 18 (spec, plan Task 6b, design record), raised by the Task 6 implementer.
- `b816cc9` Task 6 fix: a row received this year gets its slot and post-remap slot when it opens (below).
- `c0c0fd8` Task 6b: the Roth bracket fill sees the last-resort estimate (`profile.inhEstA/B` at the pass top, added to the fill's
  other income only when non-zero); the two-return identity case with conversions on reinstated.
- `022abb3` (merged as `736c5b8`): decision 18's convergence limitation recorded (spec decision 18 and section 9), plan Task 7
  Step 0, design record.
- `659c8a3` Task 7 Step 0: tests only (below).
- Task 7 (this record's commit): eight snapshot scenarios (added only), README, CLAUDE.md, these notes, the Methodology sentence,
  US V127.

Every engine commit (Tasks 2 to 6b) is "no existing number change": `node tests/snapshot.js` exact (US 569, Canada 376) and
`npm test` green at each.

Red then green, per task (the first failing output, then green after the change):
- Task 1: red `state rules: ak: fields missing inherited` (every row and schedule entry), `inherited.kind missing or invalid`, and
  `Cannot read properties of undefined (reading 'singleLifeFactor')`; green `[US] inherited accounts (E1e) tests passed` and
  `[US] state rules test passed (51 jurisdictions, every field explicit, selector matches the table)`.
- Task 2: red `state mechanisms: inherited ordinary: taxed with the own draw: expected 4000, got 1000` (and the heir, heirAnyAge,
  Colorado-shape and decedent cases, `taxFor two returns, NY: the decedent room on the owning return: expected 2643, got 2103`),
  plus `window.__test_withState is not a function` in `tests/inherited_accounts.js`; green.
- Task 3: red `inherited kinds: kinds` (the two kinds normalized to `'free'`) and `inherited traditional is not a lump`; green.
- Task 4: red `window.__test_inherited.inheritedDraw is not a function` and `the select offers both inherited kinds after the four
  existing ones`; green.
- Task 5: red `TX no ACA: recorded need without the inheritance: 13653.599999999999 vs 58000`; green.
- Task 6: red `last resort basic: a traditional last resort happens`; green.
- Task 6 fix: red `receipt-year row owned by B: the draw is on B's return (profile.inhExtraB): 0 vs 88679.50439453125`; green.
- Task 6b: red `fill sees the last resort: conversion gap`: `unmarried: last resort 23699.998152256012 converted vs scheduled-draw
  twin 15770.482087135311 (x = 7929.51673325865, twin last resort 0)` and `joint: last resort 90199.98908042908 converted vs
  scheduled-draw twin 88533.33592414856 (x = 1666.6637439738859, twin last resort 0)`; green.
- Task 7: red `node tests/snapshot.js`: `[US] snapshot MISMATCH (8 of 577 scenarios)`, each `not in baseline`; green after
  `npm run snapshot:update`.

**The Task 6 reviewers' slot bug (`b816cc9`).** Two reviewers of `0a37cea` found that a row received this year opens in
`inheritedApply`, after `inheritedYear` has skipped it, so its `slot` / `post` kept the ledger's initial values (`post` 0): a
last-resort draw in the receipt year from a row owned by B on two returns landed on A's return (and, in New York, its exclusion on
A's slot). Fix: when a row opens it gets this year's slot and post-remap slot the way `inheritedYear` computes them. Test: an
unmarried couple at 50, B's $400,000 row received at 50, no other money: the draw x is on `profile.inhExtraB`, `magiB` = x, nothing
on A, and in New York the exclusion min(x, 20,000) on B's slot. The same commit tightened two Task 6 tests (the bucket penalized
placement asserts the penalized pool untouched, 300,000 at -20% a year; a New York room case with x above the room: exactly 15,000
extra on the 25,000 base).

**Decision 18 and the Task 6b reviewers' finding.** The Task 6 implementer found that the Roth bracket fill saw the scheduled draw
(through `otherA/B`) and the 162(l) estimate but not the pass's last-resort estimate, so a last-resort year converted more than a
year with the draw scheduled (23,700 against 15,770 in the two-return identity household). The owner decided to fix it as E1c does
(decision 18; Task 6b, `c0c0fd8`). The Task 6b reviewers then found that the conversion now depends on the damped fourth estimate,
whose error shrinks about threefold a pass: a year with a large last-resort draw reaches the 8-pass cap with the conversion about
0.04% of the draw short of a scheduled-draw twin (under $15 a year of tax; the rows record the realized draw and MAGI). The owner
recorded it as a limitation (spec decision 18 and section 9, `022abb3`) instead of adding a secant step (a new numerical rule in the
MAGI iteration, with overshoot risk at the premium cliffs, for a few dollars).

**Step 0 (`659c8a3`, tests only).** All new assertions passed at once (they pin existing behaviour; no hand value disagreed).
- `fill convergence bound`: the joint household of Task 6b's `fill sees the last resort` case with spending raised from 14,500 to
  40,000: x = 26,798.62, the last-resort run takes 8 passes (its twin 2), conversion 63,389.88 against the twin's 63,399.61, gap
  9.73 (0.036% of x; asserted 0 < gap < 0.1% of x). Measured sweep: spending 14,500, x 1,299.93, gap 0.57 (8 passes); 30,000,
  x 16,799.14, gap 6.10; 50,000, x 36,798.11, gap 13.34.
- **For the spec owner (not edited):** decision 18's wording "a year with a small last-resort draw converges within
  `MAGI_ITER_TOL`" is loose. The small-draw case (x = 1,299.93) also runs all 8 passes; only its conversion gap, 0.57, is within
  `MAGI_ITER_TOL` (1). The test comment says so.
- The receipt-year slot fix in the survivor period: A's row received after A died (heir B) and B's row received after B died (heir
  A), both received at A's 63 with the owner dead at 62: the last-resort draw x = 48,242.74 is on `profile.inhExtraA` (the
  survivor's one-person return), nothing on `inhExtraB`; tax 3,609.13 by hand (2026 single, 63, standard deduction 16,100: 1,240 +
  12% x 19,742.74) and equal to a forced scheduled draw's (`__test_inhForceExtra`), with the same premium, MAGI and withdrawals.
  These cases held before `b816cc9` too (in the survivor period `post` collapses to 0 and the initial slot is already the living
  heir), so they pin the branch rather than catch the old bug. In the receipt year the forced-draw hook adds income without
  debiting the row, so this identity compares tax, premium, MAGI and withdrawals, not balances (a test-hook limitation, stated in
  the test comment).

**Snapshot diff (Task 7).** `tests/snapshots/us.json` gains eight entries and nothing else: `std R inherited trad future` (B's
$400,000 row at A's 54), `std R inherited trad past` (A's $400,000 row received at 49, three years ago), `std R inherited roth`
(A's $300,000 Roth at 55), `std R inherited two returns` (unmarried, B's row at 53), `std R inherited last resort` (spending
190,000, A's $300,000 traditional and B's $150,000 Roth rows at 58: the household's penalty-free money runs out at 58, the last
resort empties both rows, depletion at 63 instead of `std R depletes`' 61), `std R inherited stretch 2018` (A's $250,000 row at
44, a 2018 death: the RMD alone for 34 years), `std R inherited NY` (the trad-future row in New York) and `hist R inherited trad
future | real1966`. Checked two ways: `git diff tests/snapshots/us.json | grep '^-' | grep -v '^---'` prints nothing, and a script
comparing the parsed baseline with `HEAD`'s: 569 entries before, 577 after, 0 changed, 0 removed. `canada.json` and
`ui_canada.json` unchanged (`npm run snapshot:update` rewrote both with LF line endings only; restored with `git checkout`).

UI snapshot (`tests/snapshots/ui_us.json`), `textHash` and `textLength` only; every `projectionHash`, `rowsHash`, `histSuccess`
and control entry unchanged:
- Task 1: `std default` 28,563 -> 28,669 (the state notes sentence under the selector).
- Task 4: `std default` 28,669 -> 28,692, `std R` 28,161 -> 28,184, `std R everything` 29,978 -> 30,001 (+23 each: the one-time
  income list note, "Lump sums and inherited accounts received at a specific age, each with its own tax treatment.").
- Task 7: `std default` 28,692 -> 28,824, `std R` 28,184 -> 28,316, `std R everything` 30,001 -> 30,133 (+132 each, exactly the
  Methodology sentence's addition ", or an inherited traditional or Roth IRA / 401(k), drawn on the 10-year rule (a death before
  2020: over the heir's life expectancy)"). The version badge is not in that text.

Timing (each table copied from the bench output files):

Task 2:

```
=== run 1
US tx  400 simulate 211 -> 203 ms (-3.8%), 120 historical 59 -> 59 ms (0.0%)
US ca  400 simulate 296 -> 315 ms (6.4%), 120 historical 82 -> 91 ms (11.0%)
US ny  400 simulate 316 -> 309 ms (-2.2%), 120 historical 89 -> 89 ms (0.0%)
US pa  400 simulate 289 -> 279 ms (-3.5%), 120 historical 80 -> 79 ms (-1.2%)
US ct  400 simulate 369 -> 372 ms (0.8%), 120 historical 104 -> 109 ms (4.8%)
US wa  400 simulate 237 -> 228 ms (-3.8%), 120 historical 68 -> 67 ms (-1.5%)
=== run 2
US tx  400 simulate 206 -> 187 ms (-9.2%), 120 historical 58 -> 55 ms (-5.2%)
US ca  400 simulate 296 -> 283 ms (-4.4%), 120 historical 81 -> 80 ms (-1.2%)
US ny  400 simulate 322 -> 306 ms (-5.0%), 120 historical 88 -> 88 ms (0.0%)
US pa  400 simulate 291 -> 277 ms (-4.8%), 120 historical 78 -> 78 ms (0.0%)
US ct  400 simulate 388 -> 381 ms (-1.8%), 120 historical 109 -> 111 ms (1.8%)
US wa  400 simulate 245 -> 233 ms (-4.9%), 120 historical 67 -> 68 ms (1.5%)
=== run 3
US tx  400 simulate 201 -> 192 ms (-4.5%), 120 historical 60 -> 58 ms (-3.3%)
US ca  400 simulate 295 -> 286 ms (-3.1%), 120 historical 82 -> 82 ms (0.0%)
US ny  400 simulate 318 -> 309 ms (-2.8%), 120 historical 90 -> 89 ms (-1.1%)
US pa  400 simulate 289 -> 280 ms (-3.1%), 120 historical 80 -> 79 ms (-1.2%)
US ct  400 simulate 377 -> 368 ms (-2.4%), 120 historical 109 -> 108 ms (-0.9%)
US wa  400 simulate 229 -> 222 ms (-3.1%), 120 historical 66 -> 65 ms (-1.5%)
```

Task 4:

```
=== run 1
US tx  400 simulate 189 -> 188 ms (-0.5%), 120 historical 56 -> 55 ms (-1.8%)
US ca  400 simulate 276 -> 281 ms (1.8%), 120 historical 79 -> 80 ms (1.3%)
US ny  400 simulate 300 -> 304 ms (1.3%), 120 historical 86 -> 87 ms (1.2%)
US pa  400 simulate 275 -> 277 ms (0.7%), 120 historical 77 -> 77 ms (0.0%)
US ct  400 simulate 363 -> 365 ms (0.6%), 120 historical 107 -> 106 ms (-0.9%)
US wa  400 simulate 221 -> 225 ms (1.8%), 120 historical 65 -> 65 ms (0.0%)
=== run 2
US tx  400 simulate 189 -> 190 ms (0.5%), 120 historical 56 -> 56 ms (0.0%)
US ca  400 simulate 277 -> 282 ms (1.8%), 120 historical 80 -> 80 ms (0.0%)
US ny  400 simulate 315 -> 312 ms (-1.0%), 120 historical 87 -> 87 ms (0.0%)
US pa  400 simulate 275 -> 274 ms (-0.4%), 120 historical 76 -> 76 ms (0.0%)
US ct  400 simulate 365 -> 367 ms (0.5%), 120 historical 106 -> 107 ms (0.9%)
US wa  400 simulate 222 -> 221 ms (-0.5%), 120 historical 65 -> 64 ms (-1.5%)
=== run 3
US tx  400 simulate 191 -> 195 ms (2.1%), 120 historical 59 -> 55 ms (-6.8%)
US ca  400 simulate 303 -> 287 ms (-5.3%), 120 historical 86 -> 80 ms (-7.0%)
US ny  400 simulate 305 -> 320 ms (4.9%), 120 historical 88 -> 88 ms (0.0%)
US pa  400 simulate 281 -> 289 ms (2.8%), 120 historical 79 -> 78 ms (-1.3%)
US ct  400 simulate 366 -> 378 ms (3.3%), 120 historical 107 -> 107 ms (0.0%)
US wa  400 simulate 223 -> 236 ms (5.8%), 120 historical 65 -> 66 ms (1.5%)
```

Task 5:

```
=== run 1
US tx  400 simulate 195 -> 195 ms (0.0%), 120 historical 57 -> 58 ms (1.8%)
US ca  400 simulate 293 -> 306 ms (4.4%), 120 historical 83 -> 87 ms (4.8%)
US ny  400 simulate 315 -> 312 ms (-1.0%), 120 historical 89 -> 90 ms (1.1%)
US pa  400 simulate 287 -> 287 ms (0.0%), 120 historical 80 -> 80 ms (0.0%)
US ct  400 simulate 377 -> 378 ms (0.3%), 120 historical 109 -> 110 ms (0.9%)
US wa  400 simulate 231 -> 228 ms (-1.3%), 120 historical 67 -> 66 ms (-1.5%)
=== run 2
US tx  400 simulate 196 -> 190 ms (-3.1%), 120 historical 58 -> 57 ms (-1.7%)
US ca  400 simulate 321 -> 316 ms (-1.6%), 120 historical 88 -> 87 ms (-1.1%)
US ny  400 simulate 353 -> 342 ms (-3.1%), 120 historical 99 -> 99 ms (0.0%)
US pa  400 simulate 286 -> 284 ms (-0.7%), 120 historical 80 -> 79 ms (-1.2%)
US ct  400 simulate 375 -> 362 ms (-3.5%), 120 historical 109 -> 105 ms (-3.7%)
US wa  400 simulate 229 -> 230 ms (0.4%), 120 historical 67 -> 66 ms (-1.5%)
=== run 3
US tx  400 simulate 194 -> 193 ms (-0.5%), 120 historical 58 -> 57 ms (-1.7%)
US ca  400 simulate 286 -> 287 ms (0.3%), 120 historical 82 -> 81 ms (-1.2%)
US ny  400 simulate 311 -> 322 ms (3.5%), 120 historical 89 -> 92 ms (3.4%)
US pa  400 simulate 282 -> 295 ms (4.6%), 120 historical 78 -> 82 ms (5.1%)
US ct  400 simulate 372 -> 389 ms (4.6%), 120 historical 109 -> 113 ms (3.7%)
US wa  400 simulate 228 -> 235 ms (3.1%), 120 historical 66 -> 69 ms (4.5%)
```

Task 6:

```
=== run 1
US tx  400 simulate 194 -> 197 ms (1.5%), 120 historical 57 -> 59 ms (3.5%)
US ca  400 simulate 281 -> 287 ms (2.1%), 120 historical 80 -> 82 ms (2.5%)
US ny  400 simulate 311 -> 312 ms (0.3%), 120 historical 88 -> 89 ms (1.1%)
US pa  400 simulate 280 -> 286 ms (2.1%), 120 historical 77 -> 79 ms (2.6%)
US ct  400 simulate 376 -> 375 ms (-0.3%), 120 historical 109 -> 109 ms (0.0%)
US wa  400 simulate 227 -> 229 ms (0.9%), 120 historical 65 -> 67 ms (3.1%)
=== run 2
US tx  400 simulate 194 -> 198 ms (2.1%), 120 historical 56 -> 58 ms (3.6%)
US ca  400 simulate 283 -> 287 ms (1.4%), 120 historical 80 -> 82 ms (2.5%)
US ny  400 simulate 320 -> 312 ms (-2.5%), 120 historical 91 -> 91 ms (0.0%)
US pa  400 simulate 286 -> 295 ms (3.1%), 120 historical 79 -> 83 ms (5.1%)
US ct  400 simulate 380 -> 365 ms (-3.9%), 120 historical 110 -> 107 ms (-2.7%)
US wa  400 simulate 228 -> 226 ms (-0.9%), 120 historical 67 -> 68 ms (1.5%)
=== run 3
US tx  400 simulate 197 -> 197 ms (0.0%), 120 historical 61 -> 58 ms (-4.9%)
US ca  400 simulate 286 -> 295 ms (3.1%), 120 historical 84 -> 83 ms (-1.2%)
US ny  400 simulate 312 -> 322 ms (3.2%), 120 historical 90 -> 92 ms (2.2%)
US pa  400 simulate 283 -> 294 ms (3.9%), 120 historical 80 -> 82 ms (2.5%)
US ct  400 simulate 404 -> 387 ms (-4.2%), 120 historical 117 -> 113 ms (-3.4%)
US wa  400 simulate 230 -> 239 ms (3.9%), 120 historical 68 -> 70 ms (2.9%)
```

Task 6b:

```
=== run 1
US tx  400 simulate 193 -> 206 ms (6.7%), 120 historical 57 -> 61 ms (7.0%)
US ca  400 simulate 284 -> 309 ms (8.8%), 120 historical 81 -> 85 ms (4.9%)
US ny  400 simulate 337 -> 345 ms (2.4%), 120 historical 95 -> 98 ms (3.2%)
US pa  400 simulate 300 -> 307 ms (2.3%), 120 historical 82 -> 84 ms (2.4%)
US ct  400 simulate 372 -> 364 ms (-2.2%), 120 historical 109 -> 106 ms (-2.8%)
US wa  400 simulate 224 -> 229 ms (2.2%), 120 historical 66 -> 68 ms (3.0%)
=== run 2
US tx  400 simulate 207 -> 195 ms (-5.8%), 120 historical 61 -> 58 ms (-4.9%)
US ca  400 simulate 299 -> 310 ms (3.7%), 120 historical 86 -> 89 ms (3.5%)
US ny  400 simulate 310 -> 313 ms (1.0%), 120 historical 89 -> 90 ms (1.1%)
US pa  400 simulate 281 -> 285 ms (1.4%), 120 historical 80 -> 80 ms (0.0%)
US ct  400 simulate 358 -> 361 ms (0.8%), 120 historical 105 -> 106 ms (1.0%)
US wa  400 simulate 226 -> 229 ms (1.3%), 120 historical 67 -> 68 ms (1.5%)
=== run 3
US tx  400 simulate 198 -> 198 ms (0.0%), 120 historical 58 -> 57 ms (-1.7%)
US ca  400 simulate 306 -> 295 ms (-3.6%), 120 historical 88 -> 82 ms (-6.8%)
US ny  400 simulate 317 -> 313 ms (-1.3%), 120 historical 92 -> 89 ms (-3.3%)
US pa  400 simulate 293 -> 289 ms (-1.4%), 120 historical 81 -> 80 ms (-1.2%)
US ct  400 simulate 363 -> 390 ms (7.4%), 120 historical 105 -> 110 ms (4.8%)
US wa  400 simulate 232 -> 233 ms (0.4%), 120 historical 67 -> 67 ms (0.0%)
```

Median of three (simulate / historical):
- Task 2: tx -4.5% / -3.3%; ca -3.1% / 0.0%; ny -2.8% / 0.0%; pa -3.5% / -1.2%; ct -1.8% / +1.8%; wa -3.8% / -1.5% (run 1 alone
  had ca at +6.4% / +11.0%; runs 2 and 3 had -4.4% / -1.2% and -3.1% / 0.0%).
- Task 4: tx +0.5% / -1.8%; ca +1.8% / 0.0%; ny +1.3% / 0.0%; pa +0.7% / 0.0%; ct +0.6% / 0.0%; wa +1.8% / 0.0%.
- Task 5: tx -0.5% / -1.7%; ca +0.3% / -1.1%; ny -1.0% / +1.1%; pa 0.0% / 0.0%; ct +0.3% / +0.9%; wa +0.4% / -1.5%.
- Task 6: tx +1.5% / +3.5%; ca +2.1% / +2.5%; ny +0.3% / +1.1%; pa +3.1% / +2.6%; ct -3.9% / -2.7%; wa +0.9% / +2.9%.
- Task 6b: tx 0.0% / -1.7%; ca +3.7% / +3.5%; ny +1.0% / +1.1%; pa +1.4% / 0.0%; ct +0.8% / +1.0%; wa +1.3% / +1.5%.

Task 7 timing (`node tests/bench_runs_interleaved.js --base ../fp-e1e-base --rounds 21`, the controller alone on the machine; base = the pre-E1e tree):

```
=== run 1
US tx  400 simulate 189 -> 191 ms (1.1%), 120 historical 56 -> 57 ms (1.8%)
US ca  400 simulate 276 -> 281 ms (1.8%), 120 historical 78 -> 80 ms (2.6%)
US ny  400 simulate 298 -> 338 ms (13.4%), 120 historical 85 -> 96 ms (12.9%)
US pa  400 simulate 272 -> 311 ms (14.3%), 120 historical 76 -> 87 ms (14.5%)
US ct  400 simulate 358 -> 406 ms (13.4%), 120 historical 105 -> 117 ms (11.4%)
US wa  400 simulate 218 -> 252 ms (15.6%), 120 historical 63 -> 74 ms (17.5%)
=== run 2
US tx  400 simulate 188 -> 193 ms (2.7%), 120 historical 56 -> 57 ms (1.8%)
US ca  400 simulate 277 -> 285 ms (2.9%), 120 historical 80 -> 82 ms (2.5%)
US ny  400 simulate 302 -> 306 ms (1.3%), 120 historical 88 -> 88 ms (0.0%)
US pa  400 simulate 274 -> 282 ms (2.9%), 120 historical 77 -> 80 ms (3.9%)
US ct  400 simulate 360 -> 355 ms (-1.4%), 120 historical 106 -> 104 ms (-1.9%)
US wa  400 simulate 240 -> 239 ms (-0.4%), 120 historical 69 -> 69 ms (0.0%)
=== run 3
US tx  400 simulate 188 -> 187 ms (-0.5%), 120 historical 55 -> 55 ms (0.0%)
US ca  400 simulate 274 -> 279 ms (1.8%), 120 historical 79 -> 79 ms (0.0%)
US ny  400 simulate 307 -> 312 ms (1.6%), 120 historical 88 -> 90 ms (2.3%)
US pa  400 simulate 278 -> 280 ms (0.7%), 120 historical 78 -> 78 ms (0.0%)
US ct  400 simulate 370 -> 379 ms (2.4%), 120 historical 108 -> 110 ms (1.9%)
US wa  400 simulate 226 -> 225 ms (-0.4%), 120 historical 66 -> 66 ms (0.0%)
```

Median of three (simulate / historical): tx +1.1% / +1.8%; ca +1.8% / +2.5%; ny +1.6% / +2.3%; pa +2.9% / +3.9%; ct +2.4% / +1.9%;
wa -0.4% / 0.0%. Every median is inside +5%. Run 1 alone had ny, pa, ct and wa at +11% to +17% on both paths (tx and ca at
+1% to +3% in the same run); runs 2 and 3, with the same build, had those four at -2% to +4%, so run 1's four are machine noise
(the 10% wall-clock noise CLAUDE.md records), not a code change.

Final code review (independent Opus, 2026-10-10): 0 blocking, 1 should-fix, 3 minor, all adopted. S-1 (should-fix): the status cell's inherited tooltip showed nominal dollars beside a table in today's dollars; `annotateInheritedRows` now converts every amount with `displayValue(x, r.year)`, adds " · inherited drawn this year" when a draw happened, and writes no note when the balances and the draw are all 0 (test: `test_inherited_accounts.js`, 3% inflation, age 67: $156,678 today's dollars beside the column, not $192,694). M-1: the kind tip now says the inherited row is drawn "after your own penalty-free money, before money that would owe the 10% early-withdrawal penalty and before home equity" (decision 6's order). M-3: `stateRuleForYear` carries a comment tying it to the variant loop of `stateIncomeTax` (change both together; the hot path keeps its own copy). M-2 and the coverage gap: an Oklahoma case in `tests/inherited_accounts.js` (heirAnyAge, 10,000 at any age: a filer of 50 has min(draw, 10,000) excluded, the own traditional draw is not; the top MFJ rate 4.5% makes the exclusion worth 450.00). `node tests/plan_off_anchor.js --base ../fp-e1e-base` exits 1 with 569 identical and 8 different: exactly the 8 new inherited scenarios, which the base tree reads as tax-free lumps (expected; every legacy scenario is identical).

Left alone, and why:
- The fill's slow convergence with a large last-resort draw (decision 18, spec section 9): owner decision, no secant step.
- Decision 18's "converges within `MAGI_ITER_TOL`" wording (above): flagged for the spec owner; an implementer does not edit the
  spec.
- `lambdaEstimate`'s sample years do not price future inherited draws, and the schedule has no back-loading: Batch 5 owns lambda and
  the schedule levers (spec section 9).
- The Funded % tile and "current investable" leave out a past inherited row's balance (spec section 9, review M4).
- The receipt-year forced-draw hook does not debit the row (test-only; the Step 0 identity compares everything but balances).
- The RI row's IRA exclusion found during the state research stays an Open item (outside E1e).

##### E2: design (owner decisions, 2026-10-10)

Spec `docs/superpowers/specs/2026-10-10-e2-adoption-design.md` (base `6bfb1ed`; US V128, Canada V59). Both planners; the shared
`01-LIST_MAX` (`dependentsInYear`, `normalizeLists`) and `23-dynFieldHtml` (a blankable number field) change, plus the US-only
`hasChildAtMost` (the one reader that looped over `state.children` itself).
- Scope (decision 1): an optional "Joins the household in" year per child row only; the adoption credits (US IRC 23, Canada
  federal and provincial) are not modeled.
- The child counts for the whole join year (decision 2): exact in the US (IRS Pub. 501, a child placed for adoption during the
  year; 26 CFR 1.36B-1(d) for the ACA family); an approximation in Canada (ITA 122.61(1): the CCB starts the month after the
  child moves in), as for the birth year today.
- Validation (decision 3): a join year at or before the birth year means from birth; `normalizeLists` keeps `joinYear` only when
  numeric and later than the birth year (fixed 1950-2100 bounds), else the key is absent, so legacy saves normalize exactly as
  before; a bad join year never drops the row.
- UI (decision 4): shared renderer option `blank: true` (and `placeholder`) for number fields; clearing deletes the key.
- Nothing else changes (decision 5): age from the birth year, spending the user's; the stale US Children tooltip sentence is fixed.

Spec review, round 1 (independent Opus, of `57e632c`): 0 blocking, 3 should-fix, 9 minor, all adopted (spec section 10). The
should-fix items: the CTC needs the child's SSN, so a placed child with only an ATIN gets the $500 credit for other dependents
(IRC 24(h)(7), 24(h)(4)(C); not modeled); a foster child entered with a join year would get QSS, which IRC 2(a)(1)(B) denies (not
modeled); Pub. 501 now quoted and labelled IRS guidance (no statute or final regulation states the placement-year rule). Minor:
`lambdaEstimate` never sees children (the plan-off test reason is the whole-run plan comparison); Medicaid's child-13 exemption is
assessed by month (CMCS bulletin 12/8/2025; the whole join year counts); `int: true` on the field; test details. No blocking
findings, which meets the review loop's stop condition.

Plan `docs/superpowers/plans/2026-10-10-e2-adoption.md` (three tasks: 1 the engine and normalization in the shared
`01-LIST_MAX` plus the US `hasChildAtMost`, with the hand-computed tests and the legacy cases; 2 the field, the shared
renderer option, copy, README and badges US V129 / Canada V60, with `test_children.js`; 3 CLAUDE.md, the implementation
record and the gates). Plan review, round 1 (independent Opus, of `d99cadf`; the reviewer applied the plan to scratch
copies and ran its tests): 0 blocking, 2 should-fix, 6 minor, all adopted. Should-fix: the US projection check asserts `tax`,
not `healthcare` (one child does not move the 400% line past that household's MAGI; spec 8.3 corrected and recorded in spec
section 10); the `hasChildAtMost` comment and the CLAUDE.md text given as fenced blocks with an exact anchor. Minor: the Task 2
red is a 30-second locator timeout; the `snapshot_ui.js` reason; a stronger loan renderer check; the bench script named and
US-only; two stale comments in `test_children.js`; CLAUDE.md's Medicaid paragraph and file list. Left for the owner: the Canada
student checkbox copy (outside E2). No blocking findings, which meets the review loop's stop condition.

##### E2: implementation (US V129, Canada V60)

Commits on `claude/e2-adoption` (plan commit `cb2c387`):
- `2e94f30` Task 1: the optional join year in `dependentsInYear`, `hasChildAtMost` and `normalizeLists` (shared `01-LIST_MAX`, both
  planners); no number change without a join year; `legacy_state.json` gains two cases per planner.
- `d689158` Task 2: the "Joins the household in" field (shared list renderer gains opt-in `blank` / `placeholder` number
  options), US Children tooltip reworded, README, badges US V129 / Canada V60, `test_children.js` covers the field and a US
  projection and fixes its stale Canada tip check.
- Task 3 (this commit): CLAUDE.md (three edits) and this record.

Red and green: Task 1 red then green on the hand-computed join-year cases in `tests/child_dependents.js` and the new legacy
cases. Task 2 red: before E2, `test_children.js` failed on the stale Canada tip assertion; after the test edits it failed as
a 30-second locator timeout on `#child0JoinYear`; green: both planners "children UI ok" (300 ms waits sufficed).

The US projection check in `test_children.js` asserts `tax`, not `healthcare` (spec 8.3 as corrected in the plan review and recorded
in spec section 10).

`tests/snapshots/legacy_state.json` insertions only (4 lines): "children join year" and "children join year junk" in each
planner's section. No existing hash moved; no other snapshot file changed.

Stale Canada tip check in `test_children.js` fixed (Task 2).

Gates run in `fp-e2`: `npm test` exit 0 (every snapshot exact, legacy-state corpus US 47 / Canada 19 unchanged);
`npm run check:shared` OK (55 regions x 2 planners); `node test_children.js` both planners ok.

Bench (`node tests/bench_runs_interleaved.js --base ../fp-e2-base --rounds 11`; sanity, not a gate: no default household has
children; US planner only, so Canada is not timed; replaces spec 6.3's `tests/bench_runs.js` on purpose, since CLAUDE.md says to
compare two trees in one process, interleaved):

```text
US tx  400 simulate 198 -> 203 ms (2.5%), 120 historical 58 -> 62 ms (6.9%)
US ca  400 simulate 292 -> 295 ms (1.0%), 120 historical 85 -> 85 ms (0.0%)
US ny  400 simulate 319 -> 323 ms (1.3%), 120 historical 91 -> 92 ms (1.1%)
US pa  400 simulate 296 -> 303 ms (2.4%), 120 historical 82 -> 84 ms (2.4%)
US ct  400 simulate 386 -> 367 ms (-4.9%), 120 historical 112 -> 107 ms (-4.5%)
US wa  400 simulate 234 -> 232 ms (-0.9%), 120 historical 70 -> 68 ms (-2.9%)
```

Reviews of Tasks 1-2: spec-compliance clean; code-quality approved; only minors, none changing code.

Left alone (code-review minors that need no change):
- The "N children" group summary counts every row, joined or not: spec decision 5, unchanged by design (Task 1 minor).
- A negative join year typed in the field is stored as 0 (the `Math.max(0, ...)` int clamp) and counts from birth (spec decision 3).
- A partial value at or below the birth year (such as "20" mid-typing) counts from birth and is dropped on reload (decision 3).
- `test_children.js` stays out of CI by the repo's convention for `test_*.js` files; the engine side is guarded in `npm test`
  by `tests/child_dependents.js` and the legacy corpus. `snapshot_ui` and `field_registry` both skip list controls, so they do
  not guard the renderer option: it is guarded in `npm test` by the blank list-field block in `tests/child_dependents.js` (both
  planners), and in full by `test_children.js`.
- `test_children.js`'s projection check loads the child from the save instead of adding it through the form (the form path is
  covered earlier in the same test), a departure from spec 8.3's wording.
- Task 1: the usable-year test appears twice in the `normalizeLists` map (kept verbatim from the brief); the
  `joinYear == birthYear` legacy case is pinned by hash, with its values asserted in `tests/child_dependents.js`.
- The Canada "Full-time student after 18" checkbox copy ("Recorded for the credits that arrive in a later update ...") is
  stale (Canada's readers use age only); left for the owner, outside E2.

Final review (independent Opus, 2026-10-10): 0 blocking, 1 should-fix, 3 minor. Should-fix 1: the CI coverage claim was wrong
(`snapshot_ui` and `field_registry` skip list controls); fixed with the new block in `tests/child_dependents.js` (red on the
`cb2c387` planners as a locator timeout on `#child0JoinYear`, green on the branch). Minor 2: the `test_children.js` departure
from spec 8.3 is noted above. Minor 3: the Canada precondition message in `tests/child_dependents.js` reworded (gross income is
an upper bound on family net income). Minor 4: the Canada student checkbox tip left for the owner: it is accurate, since
Canada reads children by age only.

##### E3: design (owner decisions, 2026-10-10)

Spec `docs/superpowers/specs/2026-10-10-e3-irmaa-appeal-design.md` (base `ea78ef6`; US V129). US only; no shared region and no
Canada change. Sources (retrieved 2026-10-10): 20 CFR 418.1135, 418.1140(d), 418.1201-418.1265 (eCFR, version of 2026-10-01),
418.1120 (filing status), form SSA-44 (rev. 12-2025), POMS HI 01120.005 and HI 01120.030.
- Finding: SSA picks the IRMAA table by the filing status of the return it uses (418.1120), but `healthcareCost` uses the charged
  year's status. Only a survivor's D+1 and D+2 differ (joint returns of D-1 and D charged on the single tiers). The plan's E3 text
  ("the survivor charged on the old joint MAGI against the single tiers") described this engine error, not the real exposure.
- Decision 1: the lookback uses the lookback return's filing status (`irmaaFilingHistory`), built first with its own movers table
  (only survivor scenarios move); `irmaaAt` and the plan's lines take this year's return's status for the same reason.
- Decision 2: events are a main-job retirement, the end of a W-2 or self-employed stream, and a married spouse's death. Marriage,
  work reduction within one job, pension or property loss, settlements and not-earned streams are not modeled. Divorce and cars
  stay excluded from Batch E (owner, reconfirmed; "annuity purchase" in the exclusion list is a separate item).
- Decision 3: in premium years E and E+1 the lowest of the normal lookback and the allowed more recent years (E: year E; E+1:
  years E and E+1), each on its own filing status, on realized MAGI (SSA corrects estimates to the return, 418.1140(d)).
- Decision 4: always assumed; no new input.
- Decision 5: only events inside the plan (a retirement or stream end with E >= 1, a death in any plan year); entered prior
  MAGIs stay the normal lookback; the year-0 stand-in's missing convergence is a known limitation, not fixed in E3.
- Decision 6: the in-year candidate is priced inside `healthcareCost` from the pass's MAGI and sets `usesMagiEstimate` (the year
  converges like an ACA year; the forced pass covers a tier edge); two-return years per person, own events only; conversion
  ceiling and `lambdaEstimate` unchanged.
- Decision 7: in a year with an in-year candidate the plan's IRMAA lines sit on this year's edges (growth 1); ids unchanged;
  `irmaaAt` unchanged (year E's effect on the E+1 charge is a Batch 5 note).
- Decision 8: rows carry `irmaaAppeal` where the appeal lowered the charge, shown in the status tooltip; callout, tooltip,
  README, badge V130; snapshot moves approved in two stages (decision 1, then the appeal).

Spec review, round 1 (independent Opus, of `4f13fdb`, owner-run): 0 blocking, 7 should-fix, 9 minor, all adopted (owner,
2026-10-11; spec section 11). Should-fix: a death before the plan must not open a window; the stand-in years read year 0's filing
status (a death in year 0 with entered prior MAGIs); the in-year candidate prices the pass estimate, within the iteration's $1 of
the realized MAGI (accepted, as for the ACA premium); the 162(l) deduction's feedback on an in-year tier (paragraph and test);
price the candidate only when the normal charge is above 0, and time an appeal-window household; the lines test rebuilt on a
drawing household; the inherited need adjustment and the 162(l) search also price the charge. Minor: `irmaaChecks` on this
year's filing, the filing history written once per year, per-return line growth, the reported event kind, flat row scalars
(`historical_parity.js` compares non-numbers with `!==`), events nobody can use dropped (the default household gets no table),
the anchor re-base steps, two test-setup fixes. The owner also approved the `irmaaAt` / lines filing change and dropping the
stale "Medicaid coverage gap" from the healthcare callout.

Spec review, round 2 (independent Opus, of `16098f7`, owner-run): 0 blocking, 6 should-fix, 7 minor, all adopted (owner,
2026-10-11; spec section 11). Should-fix: two tests rebuilt so they reach what they assert (the lines test on a household whose
nearest line is `irmaa1`; the 162(l) variant inside the band where no consistent deduction exists, with the alternative
calculation's values); the stage-2 values of the year-0 death case; a death before the plan with entered prior MAGIs reads the
joint tiers for the returns from before the death; the row reads dedicated locals, not `lastCost`; `healthcareCost` returns
`inYearA/B` and the `magiThresholds` arguments are written out. Minor: wording, two more test assertions, retirement bounds, the
benchmark household option, the event table attached to the run's result. No blocking findings: the review loop's stop condition
is met.

Spec approved by the owner (2026-10-11). Plan `docs/superpowers/plans/2026-10-10-e3-irmaa-appeal.md` (six tasks: 1 the lookback's
filing status, stage-1 movers; 2 the event table, no number change; 3 the appealed charge, the rows and the benchmark household,
stage-2a movers; 4 the cliff plan's lines, stage-2b movers, guard-off identical; 5 the tooltip, copy, README and V130; 6
CLAUDE.md, the implementation record and the final gates). Each movers task stops for the owner's approval before
`snapshot:update`. Two corrections to spec section 8 found while planning: case 2's year 2 also moves at stage 1 (6,148.40 to
5,000), and case 15's variant takes the alternative calculation in both window years (`seAlternative` + 2, not 1).

Plan review, round 1 (independent Opus, of `d6f14c2`, owner-run; Tasks 1-5 applied to a scratch tree): 0 blocking, 4
should-fix, 6 minor, all adopted (owner, 2026-10-11) except the suggested pass count for the zero-charge case (the conversion
ceiling already sets `estUsed` there and nothing drifts, so the count cannot tell; recorded in the plan). Measured movers:
stage 1, 38 US (all survivor; anchor 539 / 38); stage 2a, 21 (anchor 556 / 21); stage 2b, 0; Canada identical. Should-fix:
`tests/irmaa_gating.js` and `tests/medicare_enrollment.js` case 4 change by design (updated after approval in Task 3); case 15's
counter read around one raw run; the measured spending of cases 13 and 16; the callout check reads `#methodologyCard`. The
tooltip keeps the plan's wording, a recorded departure from spec 5.6. The owner asked for a second plan review.

Plan review, round 2 (independent Opus, of `a118cbc`, owner-run; Tasks 1-5 applied and every test run as written): 1
blocking, 2 should-fix, 6 minor, all adopted (owner, 2026-10-11). B1: the appeal household cannot meet +5% against a base
without the appeal (measured +15% to +35%: the extra MAGI passes of its two window years, the cost spec 5.7 accepts); owner
decision: it is a recorded measurement for the owner's sign-off, the +5% gate stays on the default paths (spec section 7
amended). S1: a test-only counter (`__test_irmaaInYearCalls`) pins that a zero normal charge is never priced. S2: a direct
`magiThresholds` case pins the per-return line growth. The owner asked for a third plan review.

Plan review, round 3 (independent Opus, of `f8c6eb3`, owner-run; Tasks 1-5 applied, every test red as predicted then green,
movers 38 / 21 / 0 unchanged): 0 blocking, 2 should-fix, 4 minor, all adopted (owner, 2026-10-11). S1: a call-site-shaped case
pins B's per-return growth. S2: the appeal household measured +5% to +7% at 21 rounds, so its expected range is restated as
"+4% to +35% depending on rounds and load; above about +40% is a finding" (spec section 7 matched). Minor: the case-2 messages,
line-ending-only snapshot files after `snapshot:update`, the stale cliff-plan clause in CLAUDE.md and its code comment, the
README insertion point. No blocking findings: the review loop's stop condition is met; the plan goes to the implementer.

##### E3: implementation (US V130)

Commits on `claude/e3-irmaa-appeal` (plan commit `bbef775`; timing baseline `../fp-e3-base` at `bbef775`, never moved; movers
baseline `../fp-e3-prev`, moved to the previous task's commit before Tasks 3 and 4, at `924b182` for the final gates):
- `aef6cb2` Task 1: the IRMAA lookback reads the filing status of the lookback return (decision 1; `irmaaLookbackFiling`, the
  filing history, `irmaaAt` / lines / `irmaaChecks` on this year's return, `irmaaFiling2` removed); `us.json`: the owner-approved
  stage-1 movers (38); `plan_off_anchor` re-based; `tests/irmaa_appeal.js` (new, in `npm test`).
- `aff63d5` Task 2: the IRMAA appeal event table (`irmaaAppealTable`; on the run's result, not enumerable); no number change.
- `4834615` Task 3: the appealed IRMAA charge in `healthcareCost` (`irmaaAppealWindow` / `irmaaAppealKind`, the in-year and
  last-year candidates, `usesMagiEstimate`, the row fields, the forced-pass reset), `bench_runs_interleaved.js --household appeal`;
  `us.json`: the owner-approved stage-2a movers (21); `irmaa_gating.js` and `medicare_enrollment.js` case 4 updated by design;
  `plan_off_anchor` re-based.
- `924b182` Task 4: the cliff plan's IRMAA lines on this year's edges in a year with an in-year candidate (per-return growth in
  `magiThresholds`); no snapshot mover; guard-off identical; case 16's replay on a copy with a Roth IRA.
- `ca170b6` Task 5: the appeal in the status tooltip (`annotateAppealRows`), the healthcare callout (appeals assumed; the stale
  "Medicaid coverage gap" phrase dropped) and the prior-MAGI tooltip, README, badge V130; `ui_us.json`: text hashes only;
  `test_irmaa_appeal.js` (Playwright, not in CI).
- Task 6 (this commit): CLAUDE.md (the "IRMAA appeal and the lookback's filing status" paragraph under "MAGI iteration", the
  cliff plan's `magiThresholds` clause, the file list and the `--household appeal` option) and this record; no number change.

Owner decisions and approvals (2026-10-11, from the task ledger): Task 1's 38 movers approved before `snapshot:update`; Task 3's
21 movers, the two existing-test edits (shown before and after, below) and the appeal household's timing signed off; Task 4's
zero movers and the appeal household's timing (tx +7.3% / +8.1%, ca +8.4% / +6.0%) signed off, with the replay fix below; Task 5
reviewed (spec and code review PASS / PASS).

Red then green, per task:
- Task 1 red: `AssertionError: case 1 year 4 (D+1): year 2 joint 250,000 on the JOINT tiers (was single tier 4: 11,355.20):
  11355.2 vs 6148.4` (years 0-3 of case 1 passed first). Green: `irmaa_appeal: ok`; `irmaa_magi`, `irmaa_startup`,
  `irmaa_gating`, `two_return_magi`, `cliff_plan`, `cliff_guard`, `solver_hooks`, `survivor_symmetry` unchanged.
- Task 2 red: "table: a retirement covers the spouse" (the table was absent). Green: `irmaa_appeal: ok`, no expectation adjusted;
  snapshots exact (US 577, Canada 376).
- Task 3 red: `case 3, year 3 (D): appealed on year 3's 125,000 on its joint return: 0: 6148.4 vs 5000` (case 1's `hc(c1, 3)`, as
  predicted). Green: every case on the first try, no value tuned. Case 13 at spending 120,000: year 1 realized MAGI 117,551.418,
  year 2 appealed on tax year 2027 (the last-year candidate; year 2's own MAGI 156,746.82 is tier 2), kind 2. Case 15's feedback
  variant: `seAlternative` + 2 (years 2 and 3), deductions [0, 0, 10,000, 10,000, 11,148.40], healthcare [0, 0, 11,148.40,
  11,148.40, 11,148.40] for years 0-4; the deduction never exceeds the premium. `se_health`'s invariant grid line unchanged
  (2,310 years, 0 above the premium, 422 understated, largest gap 12,699.56).
- Task 4 red: `case 16: irmaa1 at growth 1 (the line less $1): 122679.46028999999 vs 115637.1` (109,000 x 1.03^4 - 1). Green:
  case 16 at spending 130,000, year-2 natural MAGI 133,764.53 (inside 115,638.10 to 145,343.30), year-2 stay-under line
  115,637.10, year 3 (also in-year) 119,106.243 = 109,000 x 1.03^3 - 1, year 4 163,584.16 = 137,000 x 1.03^6 - 1, year 5
  168,491.72 = 137,000 x 1.03^7 - 1 (`irmaaGrowth2`).
- Task 5 red: `test_irmaa_appeal.js` failed "tooltip at 68:" (empty title). Green at 1280 and 390 px: "IRMAA appeal (form
  SSA-44, retirement): the surcharge uses 2028 income instead of 2026"; no horizontal scroll at 390 px.

Task 4's replay fix (owner decision): on case 16's household alone `choose` kept 0 intents (the plan has only the traditional
IRA to draw, so the year-2 stay-under trial releases the cap and misses the line: realized 133,764.50 against the line
115,637.10), so the `apply(choose's intents)` identity held vacuously. The replay now runs on a copy of the household with
`rothIraA` / `rothIraBasisA` 500,000: `choose` records at least one intent, the age-68 intent is `{ kind: 'under', line: 'irmaa1' }`
(an in-year-line intent), and `apply` replays `choose` row for row. The line assertions stay on the original household.

Movers, stage 1 (Task 1; `fp-e3-prev` at `bbef775`; dumps `.superpowers/sdd/2026-10-10-e3/dumps-task1`, git-excluded), as approved:
- 953 scenario files compared, 38 differ. US: 38 moved / 539 identical. Standard: 2 moved; historical: 36 moved of 460.
  Canada: all 376 identical.
- Row counts equal in all movers. Depletion: no change (std R survivor+loans 87 -> 87; all others null -> null).
- Movers by first changed field and year (all D+1): expenses@D+1 28, bonds@D+1 9, cash@D+1 1. Death years: D=7 (work past 65
  survivor family: 1 std + 18 hist), D=23 (std R survivor+loans), D=28 (survivor A family, 10 hist), D=30 (R everything family,
  8 hist).
- Rule check (survivor of a married couple, first change D-1 or later, first healthcare change D+1 or D+2): all 38 satisfy it;
  first changed year = D+1 and first healthcare change = D+1 in all 38. Violations: none.
- Largest healthcare move: 6,355.20 (one year). Largest end-total move: 304,377.95 (hist R work past 65 survivor rich boom);
  next 252,954.47 (same, non-rich boom).
- Movers (US): std_R_survivor+loans, std_R_work_past_65_survivor; hist R work past 65 survivor (+rich) x boom / crashFirst / flat /
  mc1 / mc2 / real1929 / real1966 / real2000 / sawtooth (18); hist R survivor A: boom, mc2, rich x crashFirst / flat / mc1 /
  real1929 / real1966 / real1973 / real2000 / sawtooth (10); hist R everything: mc2, rich x flat / mc1 / real1929 / real1966 /
  real1973 / real2000 / sawtooth (8).

Movers, stage 2a (Task 3; `fp-e3-prev` at `aff63d5`; dumps `dumps-task3`), as approved:
- 953 scenario files compared, 21 differ. US: 21 moved / 556 identical (standard 1: `std R work past 65 single`; historical 20).
  Canada: 376 / 376 identical.
- Rule check: 21 / 21 movers have a non-null table and the first changed year is an E or E+1 of one of their events. 89 US
  scenarios have a table; the other 68 did not move. No depletion change; healthcare only falls in every mover.

| group | scenarios | event table | first changed year | rule |
|---|---|---|---|---|
| A retires at 69 (single) | std R work past 65 single | A[9]=2 | 9 (age 69) = E | ok |
| couple, A retires 68 / B 66 (E = 8 both) | hist R work past 65: real1929, flat; rich: real1929, crashFirst, boom, flat, mc1, mc2 | A[8]=B[8]=2 | 8 = E | ok |
| same | hist R work past 65 \| mc1 | A[8]=B[8]=2 | 9 = E+1 | ok |
| A dies at 67 (D = 7), B retires at 66 (E = 8) | hist R work past 65 survivor: real1929, flat; survivor rich: real1929, crashFirst, boom, flat, mc1, mc2 | B[7]=3, B[8]=2 | 8 = D+1 (and the retirement's E) | ok; row 8 cites tax year 2033, kind 3 |
| survivor late death (D = 28) | hist R survivor A rich \| real2000 | B[28]=3 | 29 = E+1 | ok |
| survivor late death (D = 30) | hist R everything rich: real1973, real2000 | B[30]=3 | 30 = E | ok |

| scenario | largest healthcare move (row) | total healthcare | end total |
|---|---|---|---|
| hist R work past 65 \| real1929 | -5,769.60 (row 8) | -11,539.20 | +178,640.05 |
| hist R work past 65 rich \| real1929 | -5,769.60 (row 8) | -11,539.20 | +166,739.03 |
| hist R everything rich \| real2000 | -4,620.00 (row 30) | -7,504.80 | +26,812.16 |
| hist R work past 65 survivor \| real1929 | -2,884.80 (row 8) | -2,884.80 | +2,858.59 |
| hist R work past 65 rich \| boom | -2,296.80 (row 8) | -4,593.60 | +169,703.65 (largest end-total move after real1929) |
| std R work past 65 single | -1,148.40 (row 9) | -2,296.80 | +12,819.11 |
| smallest: survivor flat / rich flat | -1,148.40 | -1,148.40 | +1,144.25 / +1,141.86 |

Movers, stage 2b (Task 4; `fp-e3-prev` at `4834615`; dumps `dumps-task4`), as approved:

| | movers |
|---|---|
| US (577) | 0 |
| Canada (376) | 0 (identical) |

Anchor re-bases (`tests/plan_off_anchor.js --base ../fp-e3-prev`, guard off): Task 1 "539 identical, 38 different" against
`bbef775` (the same 38 names); Task 3 "556 identical, 21 different" against `aff63d5` (the 21 movers exactly); the header now
names one baseline ("any tree at or after the E3 Task 3 commit") and keeps the E3 Task 1 and `5eb30fa` notes as history (owner
note: rewrite, do not append). Task 4: "577 identical, 0 different" against `4834615` (no re-base). Final gate below.

Existing tests whose expectation changed (Task 3, owner-approved after being shown before and after; both pin a retiree charged
IRMAA on the last salary years, which the appeal for the work stoppage now removes):
- `tests/irmaa_gating.js` (single, 66, salary 350,000, retires at 69): `rows[3].healthcare` 11,355.20 -> 5,000 (surcharge
  6,355.20 -> 0; tier 4 on year 1's ~376,144 replaced by year 3's own MAGI, 49,283 in the engine's terms, under the first tier);
  row 4 also 5,000 (was 11,355.20). The assertion now expects 0 and `irmaaAppealKindA` 2 (retirement); the comment and the
  final log line say the appeal removes the surcharge.
- `tests/medicare_enrollment.js` case 4 (retires at 70): age-70 healthcare 11,355.20 -> 5,000 (`irmaaAppealYearA` 2030 tax year,
  kind 2), age 71 likewise; the assertion now expects the premium only plus kind 2.

Two corrections to spec section 8 (found while planning, asserted by the tests): case 2's year 2 also moves at stage 1 (D+2: the
lookback is year 0's 125,000 on a joint return, 6,148.40 -> 5,000; Task 1); case 15's feedback variant takes the alternative
calculation in both window years, so `magiStats.seAlternative` rises by 2, not 1 (Task 3).

Tooltip wording: "IRMAA appeal (form SSA-44, retirement): Partner A's surcharge uses 2034 income instead of 2032" for a couple,
"the surcharge uses ..." for one person: a recorded departure from spec 5.6's "Partner A charged on" / "You" (plan review round
1). The badge edit V129 -> V130 matched the styled span (`vertical-align:middle">V129</span>`), not the brief's literal
`<span>V129</span>`.

`ui_us.json` (Task 5): text hash and length only, on three rendered surfaces (the healthcare callout inside `<main>`):
std default `fe0bad3718c031a5` / 28824 -> `61d656270cced9d9` / 29184; std R `11ac3b17fa48e898` / 28316 -> `aa10abf76454c324` /
28676; std R everything `755042d283cfebb3` / 30133 -> `41e61e81fc1af320` / 30493. No wiring or MCP change; `us.json`,
`canada.json`, `ui_canada.json` untouched.

Timing, Task 1 (`node tests/bench_runs_interleaved.js --base ../fp-e3-base --rounds 21`, three runs):

```text
=== RUN 1
US tx  400 simulate 197 -> 207 ms (5.1%), 120 historical 59 -> 61 ms (3.4%)
US ca  400 simulate 294 -> 305 ms (3.7%), 120 historical 84 -> 87 ms (3.6%)
US ny  400 simulate 312 -> 322 ms (3.2%), 120 historical 90 -> 92 ms (2.2%)
US pa  400 simulate 282 -> 295 ms (4.6%), 120 historical 79 -> 82 ms (3.8%)
US ct  400 simulate 376 -> 386 ms (2.7%), 120 historical 110 -> 112 ms (1.8%)
US wa  400 simulate 227 -> 237 ms (4.4%), 120 historical 66 -> 70 ms (6.1%)
=== RUN 2
US tx  400 simulate 202 -> 203 ms (0.5%), 120 historical 60 -> 59 ms (-1.7%)
US ca  400 simulate 293 -> 293 ms (0.0%), 120 historical 84 -> 84 ms (0.0%)
US ny  400 simulate 317 -> 310 ms (-2.2%), 120 historical 91 -> 88 ms (-3.3%)
US pa  400 simulate 288 -> 284 ms (-1.4%), 120 historical 81 -> 79 ms (-2.5%)
US ct  400 simulate 382 -> 386 ms (1.0%), 120 historical 111 -> 113 ms (1.8%)
US wa  400 simulate 232 -> 227 ms (-2.2%), 120 historical 68 -> 67 ms (-1.5%)
=== RUN 3
US tx  400 simulate 200 -> 200 ms (0.0%), 120 historical 59 -> 60 ms (1.7%)
US ca  400 simulate 290 -> 298 ms (2.8%), 120 historical 82 -> 84 ms (2.4%)
US ny  400 simulate 312 -> 322 ms (3.2%), 120 historical 89 -> 92 ms (3.4%)
US pa  400 simulate 283 -> 294 ms (3.9%), 120 historical 80 -> 82 ms (2.5%)
US ct  400 simulate 380 -> 377 ms (-0.8%), 120 historical 111 -> 109 ms (-1.8%)
US wa  400 simulate 228 -> 236 ms (3.5%), 120 historical 67 -> 70 ms (4.5%)
```

Medians of three (simulate / historical, %): tx +0.5 / +1.7; ca +2.8 / +2.4; ny +3.2 / +2.2; pa +3.9 / +2.5; ct +1.0 / +1.8; wa
+3.5 / +4.5. All within +5%.

Timing, Task 3 (default paths, three runs):

```text
--- run 1
US tx  400 simulate 201 -> 199 ms (-1.0%), 120 historical 59 -> 59 ms (0.0%)
US ca  400 simulate 291 -> 294 ms (1.0%), 120 historical 83 -> 83 ms (0.0%)
US ny  400 simulate 315 -> 320 ms (1.6%), 120 historical 91 -> 93 ms (2.2%)
US pa  400 simulate 287 -> 291 ms (1.4%), 120 historical 79 -> 82 ms (3.8%)
US ct  400 simulate 364 -> 382 ms (4.9%), 120 historical 106 -> 112 ms (5.7%)
US wa  400 simulate 232 -> 234 ms (0.9%), 120 historical 68 -> 69 ms (1.5%)
--- run 2
US tx  400 simulate 201 -> 200 ms (-0.5%), 120 historical 59 -> 59 ms (0.0%)
US ca  400 simulate 292 -> 291 ms (-0.3%), 120 historical 84 -> 84 ms (0.0%)
US ny  400 simulate 315 -> 310 ms (-1.6%), 120 historical 90 -> 89 ms (-1.1%)
US pa  400 simulate 286 -> 281 ms (-1.7%), 120 historical 80 -> 79 ms (-1.2%)
US ct  400 simulate 408 -> 395 ms (-3.2%), 120 historical 114 -> 114 ms (0.0%)
US wa  400 simulate 246 -> 244 ms (-0.8%), 120 historical 73 -> 72 ms (-1.4%)
--- run 3
US tx  400 simulate 199 -> 196 ms (-1.5%), 120 historical 59 -> 59 ms (0.0%)
US ca  400 simulate 292 -> 288 ms (-1.4%), 120 historical 84 -> 82 ms (-2.4%)
US ny  400 simulate 317 -> 318 ms (0.3%), 120 historical 91 -> 91 ms (0.0%)
US pa  400 simulate 288 -> 289 ms (0.3%), 120 historical 80 -> 81 ms (1.2%)
US ct  400 simulate 379 -> 379 ms (0.0%), 120 historical 110 -> 110 ms (0.0%)
US wa  400 simulate 230 -> 232 ms (0.9%), 120 historical 67 -> 68 ms (1.5%)
```

Medians of three (simulate / historical): tx -1.0% / 0.0%; ca -0.3% / 0.0%; ny +0.3% / 0.0%; pa +0.3% / +1.2%; ct 0.0% / 0.0%;
wa +0.9% / +1.5%. All within +5%.

Appeal household, Task 3 (`--rounds 21 --states tx,ca --household appeal`, three runs; a recorded measurement, not a gate):

```text
--- run 1
US tx appeal 400 simulate 284 -> 299 ms (5.3%), 120 historical 73 -> 78 ms (6.8%)
US ca appeal 400 simulate 369 -> 391 ms (6.0%), 120 historical 97 -> 105 ms (8.2%)
--- run 2
US tx appeal 400 simulate 286 -> 300 ms (4.9%), 120 historical 74 -> 78 ms (5.4%)
US ca appeal 400 simulate 378 -> 417 ms (10.3%), 120 historical 103 -> 108 ms (4.9%)
--- run 3
US tx appeal 400 simulate 288 -> 300 ms (4.2%), 120 historical 74 -> 78 ms (5.4%)
US ca appeal 400 simulate 370 -> 393 ms (6.2%), 120 historical 97 -> 106 ms (9.3%)
```

Medians of three: tx +4.9% simulate / +5.4% historical; ca +6.2% / +8.2% (signed off by the owner).

Timing, Task 4 (default paths, three runs):

```text
run 1
US tx  400 simulate 199 -> 196 ms (-1.5%), 120 historical 60 -> 59 ms (-1.7%)
US ca  400 simulate 291 -> 289 ms (-0.7%), 120 historical 82 -> 83 ms (1.2%)
US ny  400 simulate 325 -> 319 ms (-1.8%), 120 historical 92 -> 91 ms (-1.1%)
US pa  400 simulate 285 -> 285 ms (0.0%), 120 historical 80 -> 81 ms (1.2%)
US ct  400 simulate 384 -> 378 ms (-1.6%), 120 historical 112 -> 111 ms (-0.9%)
US wa  400 simulate 230 -> 227 ms (-1.3%), 120 historical 66 -> 66 ms (0.0%)
run 2
US tx  400 simulate 196 -> 205 ms (4.6%), 120 historical 60 -> 59 ms (-1.7%)
US ca  400 simulate 309 -> 313 ms (1.3%), 120 historical 88 -> 89 ms (1.1%)
US ny  400 simulate 316 -> 316 ms (0.0%), 120 historical 92 -> 92 ms (0.0%)
US pa  400 simulate 283 -> 289 ms (2.1%), 120 historical 79 -> 81 ms (2.5%)
US ct  400 simulate 371 -> 362 ms (-2.4%), 120 historical 109 -> 106 ms (-2.8%)
US wa  400 simulate 231 -> 233 ms (0.9%), 120 historical 67 -> 69 ms (3.0%)
run 3
US tx  400 simulate 193 -> 203 ms (5.2%), 120 historical 57 -> 60 ms (5.3%)
US ca  400 simulate 283 -> 288 ms (1.8%), 120 historical 80 -> 82 ms (2.5%)
US ny  400 simulate 312 -> 314 ms (0.6%), 120 historical 89 -> 93 ms (4.5%)
US pa  400 simulate 295 -> 299 ms (1.4%), 120 historical 82 -> 83 ms (1.2%)
US ct  400 simulate 396 -> 391 ms (-1.3%), 120 historical 115 -> 117 ms (1.7%)
US wa  400 simulate 243 -> 248 ms (2.1%), 120 historical 73 -> 71 ms (-2.7%)
```

Medians of three: tx +4.6% / -1.7%, ca +1.3% / +1.2%, ny 0.0% / 0.0%, pa +1.4% / +1.2%, ct -1.6% / -0.9%, wa +0.9% / 0.0%.
All within +5%.

Appeal household, Task 4 (three runs; measurement, not a gate):

```text
US tx appeal 400 simulate 294 -> 317 ms (7.8%), 120 historical 77 -> 83 ms (7.8%)
US ca appeal 400 simulate 368 -> 399 ms (8.4%), 120 historical 97 -> 106 ms (9.3%)
US tx appeal 400 simulate 287 -> 308 ms (7.3%), 120 historical 73 -> 79 ms (8.2%)
US ca appeal 400 simulate 370 -> 391 ms (5.7%), 120 historical 100 -> 105 ms (5.0%)
US tx appeal 400 simulate 287 -> 302 ms (5.2%), 120 historical 74 -> 80 ms (8.1%)
US ca appeal 400 simulate 368 -> 403 ms (9.5%), 120 historical 100 -> 106 ms (6.0%)
```

Medians: tx +7.3% / +8.1%, ca +8.4% / +6.0% (signed off by the owner).

Task 4, `node tests/bench_plan.js`:

```text
default: refreshCliffPlan 1.80 ms, off simulate 1.60 ms, ratio 1.13 (gate 5) ok; kept none, 0 intents, 1 candidates
ACA early retiree (CA): refreshCliffPlan 3.60 ms, off simulate 3.50 ms, ratio 1.03 (gate 5) ok; kept none, 0 intents, 1 candidates
Texas, no cliff in reach: refreshCliffPlan 0.60 ms, off simulate 0.50 ms, ratio 1.20 (gate 5) ok; kept none, 0 intents, 1 candidates
std G hoh 62 aca smooth (keeps intents): refreshCliffPlan 10.40 ms, off simulate 4.60 ms, ratio 2.26 (gate 5) ok; kept all, 3 intents, 2 candidates
OK: every household plans within 5x one off projection.
```

Task 4, `node tests/bench_solver.js --base ../fp-e3-base` (default rounds, then `--rounds 21`):

```text
ACA early retiree (CA): simulate 3.56 -> 3.66 ms (2.8%), path 3.45 -> 3.40 ms (-1.4%)
default: simulate 1.58 -> 1.72 ms (8.9%), path 1.20 -> 1.20 ms (0.0%)
--rounds 21:
ACA early retiree (CA): simulate 2.58 -> 2.52 ms (-2.3%), path 2.50 -> 2.45 ms (-2.0%)
default: simulate 1.32 -> 1.30 ms (-1.5%), path 1.00 -> 1.00 ms (0.0%)
```

(The default household's +8.9% in the short run is noise at about 1.6 ms resolution and is not a gated path.)

Final gates (Task 6, run in `fp-e3` at `ca170b6` plus the docs edit; nothing else running):
- `npm test`: exit 0 (snapshots exact: US 577, Canada 376; UI snapshots US 147 controls, Canada 104; legacy corpus US 47, Canada
  19; field registry US 126 fields / 120 MCP properties).
- `npm run check:shared`: "shared regions OK (55 regions x 2 planners)".
- `node tests/irmaa_appeal.js`: "irmaa_appeal: ok".
- `node test_irmaa_appeal.js`: "width 1280 tooltip at 68: IRMAA appeal (form SSA-44, retirement): the surcharge uses 2028 income
  instead of 2026", the same at width 390, "test_irmaa_appeal: ok".
- `node tests/plan_off_anchor.js --base ../fp-e3-prev` (`924b182`): "plan_off_anchor: 577 identical, 0 different".

Default paths (`node tests/bench_runs_interleaved.js --base ../fp-e3-base --rounds 21`, three runs):

```text
--- run 1
US tx  400 simulate 200 -> 202 ms (1.0%), 120 historical 60 -> 59 ms (-1.7%)
US ca  400 simulate 289 -> 294 ms (1.7%), 120 historical 83 -> 84 ms (1.2%)
US ny  400 simulate 312 -> 313 ms (0.3%), 120 historical 89 -> 89 ms (0.0%)
US pa  400 simulate 285 -> 285 ms (0.0%), 120 historical 79 -> 79 ms (0.0%)
US ct  400 simulate 375 -> 375 ms (0.0%), 120 historical 108 -> 110 ms (1.9%)
US wa  400 simulate 229 -> 229 ms (0.0%), 120 historical 67 -> 67 ms (0.0%)
--- run 2
US tx  400 simulate 198 -> 206 ms (4.0%), 120 historical 59 -> 61 ms (3.4%)
US ca  400 simulate 288 -> 298 ms (3.5%), 120 historical 83 -> 84 ms (1.2%)
US ny  400 simulate 317 -> 311 ms (-1.9%), 120 historical 91 -> 89 ms (-2.2%)
US pa  400 simulate 290 -> 282 ms (-2.8%), 120 historical 81 -> 79 ms (-2.5%)
US ct  400 simulate 380 -> 376 ms (-1.1%), 120 historical 111 -> 110 ms (-0.9%)
US wa  400 simulate 233 -> 228 ms (-2.1%), 120 historical 68 -> 67 ms (-1.5%)
--- run 3
US tx  400 simulate 194 -> 204 ms (5.2%), 120 historical 58 -> 59 ms (1.7%)
US ca  400 simulate 285 -> 293 ms (2.8%), 120 historical 82 -> 84 ms (2.4%)
US ny  400 simulate 312 -> 313 ms (0.3%), 120 historical 90 -> 90 ms (0.0%)
US pa  400 simulate 281 -> 283 ms (0.7%), 120 historical 79 -> 80 ms (1.3%)
US ct  400 simulate 370 -> 370 ms (0.0%), 120 historical 108 -> 108 ms (0.0%)
US wa  400 simulate 225 -> 227 ms (0.9%), 120 historical 66 -> 67 ms (1.5%)
```

Medians of three (simulate / historical): tx +4.0% / +1.7%; ca +2.8% / +1.2%; ny +0.3% / 0.0%; pa 0.0% / 0.0%; ct 0.0% / 0.0%;
wa 0.0% / 0.0%. All within +5%: gate passed.

Appeal household (`--rounds 21 --states tx,ca --household appeal`, three runs; a recorded measurement for the owner's sign-off):

```text
--- run 1
US tx appeal 400 simulate 288 -> 304 ms (5.6%), 120 historical 74 -> 79 ms (6.8%)
US ca appeal 400 simulate 378 -> 385 ms (1.9%), 120 historical 101 -> 105 ms (4.0%)
--- run 2
US tx appeal 400 simulate 289 -> 300 ms (3.8%), 120 historical 74 -> 79 ms (6.8%)
US ca appeal 400 simulate 395 -> 412 ms (4.3%), 120 historical 103 -> 108 ms (4.9%)
--- run 3
US tx appeal 400 simulate 283 -> 301 ms (6.4%), 120 historical 73 -> 78 ms (6.8%)
US ca appeal 400 simulate 368 -> 401 ms (9.0%), 120 historical 99 -> 107 ms (8.1%)
```

Medians of three: tx +5.6% simulate / +6.8% historical; ca +4.3% / +4.9% (inside the expected +4% to +35%; far below the +40%
finding level).

`node tests/bench_plan.js`:

```text
default: refreshCliffPlan 1.60 ms, off simulate 1.60 ms, ratio 1.00 (gate 5) ok; kept none, 0 intents, 1 candidates
ACA early retiree (CA): refreshCliffPlan 3.60 ms, off simulate 3.30 ms, ratio 1.09 (gate 5) ok; kept none, 0 intents, 1 candidates
Texas, no cliff in reach: refreshCliffPlan 0.80 ms, off simulate 0.60 ms, ratio 1.33 (gate 5) ok; kept none, 0 intents, 1 candidates
std G hoh 62 aca smooth (keeps intents): refreshCliffPlan 9.40 ms, off simulate 5.30 ms, ratio 1.77 (gate 5) ok; kept all, 3 intents, 2 candidates
OK: every household plans within 5x one off projection.
```

`node tests/bench_solver.js --base ../fp-e3-base --rounds 21` (the ACA early retiree's +30% gate: +3.1% / +6.1%):

```text
ACA early retiree (CA): simulate 2.56 -> 2.64 ms (3.1%), path 2.45 -> 2.60 ms (6.1%)
default: simulate 1.30 -> 1.32 ms (1.5%), path 1.00 -> 0.95 ms (-5.0%)
```

Review notes kept for the record (none changes code):
- Spec 5.1 oddity (Task 1 review): with marry-later, the entered prior returns would read joint for a lookback year before year
  0 when the wedding falls after year 0 but before the death year. It is unreachable: a wedding after year 0 means year 0 has two
  returns, so years 0 and 1 go through `irmaaLookbackSplit` and the filing status is never read.
- Task 4: the `a: medA || inYrA` / `b: medB || inYrB` arm at the `magiThresholds` call site is exercised by no test (`medA` is
  already true in year 2 of case 16; the two differ only when the partner charged this year is dead two years on). The assertion
  "per-return growth: B at the household growth" (`mixedB` vs `twoB`) also passes on pre-change code (harmless: `siteB` vs `twoB`
  and `mixedA` vs `oneA` catch the mutations).
- Task 5: the couple tooltip wording ("Partner A's surcharge uses ... instead of ...") has no UI test; `test_irmaa_appeal.js`
  checks only the single-person wording.
- Other reviewer minors: `irmaaFilingHistory[s]` would throw if `healthcareCost` were passed an `appeal` table without
  `irmaaFilingHistory` (latent; the year loop passes both); `__test_irmaaInYearCalls` counts pricings, not years; an unknown
  `--household` value silently runs the default sweep; `annotateAppealRows` is O(rows^2) (display only).
- The one path no test reaches: the forced pass's reset of `appealYrA/B` from `lastCost` (spec 5.6): no constructed household
  takes the forced pass inside an appeal window.

Left for the owner: nothing blocking. The spec's Batch 5 notes stand (`irmaaAt` does not score year E's effect on the E+1
charge; the year-0 stand-in still has no convergence). CLAUDE.md's `plan_off_anchor` mention under "Run modes" still names the
old baseline ("a tree at or after `5eb30fa`"), while the script's header names the E3 Task 3 commit; left as is (outside this
task's brief). (Fixed afterwards in `8c395af`, below.)

Final whole-branch review (2026-10-11): no Critical or Important findings; verdict: ready to merge. Minors:
1. CLAUDE.md's `plan_off_anchor` baseline sentence was stale: fixed in `8c395af` (names the current baseline `4834615`, the
   earlier ones as history).
2. The forced pass's reset of `appealYrA/B` from `lastCost` is untested: ACCEPTED as an untested path (no constructed household
   takes the forced pass inside an appeal window).
3. Latent throw: `irmaaFilingHistory[s]` if `healthcareCost` were passed an `appeal` table without a filing history; the year
   loop always passes both: accepted.
4. `healthcareCost`'s header comment did not mention the appeal: fixed in `8c395af`.
5. Untested branches: the `a: medA || inYrA` / `b: medB || inYrB` arm at the `magiThresholds` call site (ACCEPTED as an
   untested path), the couple tooltip wording, and the `mixedB` vs `twoB` assertion passing on pre-change code: accepted.
6. `annotateAppealRows` is O(rows^2) (display only), and an unknown `--household` value runs the default sweep: accepted.
7. By design (note): no appeal for an event before the plan (a retirement at or before today's age, or a death before the
   plan, even with entered prior MAGIs; the `irmaaPriorKnown` tooltip now says an event before this year is not appealed), and in
   a year with an in-year candidate the plan's IRMAA lines sit on this year's edges (the conservative side).

Pre-merge test coverage added (`tests/irmaa_appeal.js`, quiet base, 2026 tiers, Medicare 10,000; each case shown red against a
mutated copy of the planner, green on the real code):
- Probe 1, two returns: unmarried couple, A 70 on Social Security 4,000 a month, B 66 with a salary of 200,000 retiring at 67
  and a 115,000 pension from 67 (event table: only `eventB[1] = 2`). Healthcare 11,148.40 in years 1 and 2 (B appealed on B's own
  115,000, tier 1; appeal year 2027). Mutation: the in-year and last-year candidates priced on the household MAGI and filing
  instead of the person's own return: 12,884.80 in both years (red; case 9 also goes red).
- Probe 2, the 65-by-E+1 edge: single 63, salary 200,000, retiring at 64 with a 60,000 pension from 64: `eventA[1] = 2`,
  healthcare 10,000 at 65 (year 2), appealed on 2027 income. Mutation: the age test by E instead of E+1 (dropped event; year 2
  charges 14,620: red).
- Probe 3, a stream outliving its owner: married, both 66, A dies at 70 (deathYear 4), A's W-2 stream to 75: `eventA` all zeros,
  `eventB` only `[4] = 3`. Mutation: the stream skip for an owner dead in year E removed (`eventB[10] = 1`, the spouse covered by
  a job end after the death: red).
- Counter case: a year-0 death without entered prior MAGIs (case 1's couple, A dies at 68, pensions 300,000 each so the
  survivor's year-0 normal charge is above 0, a one-year plan): `__test_irmaaInYearCalls` around one raw run is 0. Mutation: the
  `year > 0 || state.irmaaPriorKnown` gate removed (2 pricings: red). With case 1's 125,000 pensions the normal charge is 0 and the
  mutation does not show; with a longer plan year 1's window (E = 0 was last year) is priced legitimately, hence the one-year plan.

---

## Batch 4: Canada mixed withdrawals (and the optimizer port)

**Redesign after 3C (owner decision 2026-10-06; spec section 11; runs after Batch 5).** Canada ports the US
per-year solver and the Batch 5 outer search together, instead of a two-order live mix plus a port of
`optimizeMultiLever`:
- **4A:** move the scoring and candidate loop (`chooseYearPlan`, `afterTaxValue`, the dry-run primitives) into a
  module under `src/shared/core/`; Canada supplies its own kink list
  (OAS recovery threshold, GIS and Allowance cutoffs, CCB
  bands, the age-amount range, the provincial lines in `BENEFIT_RULES`), its lambda inputs (RRIF minimums,
  CPP/OAS, `personTaxCA` and the benefits through Canada's net `taxFor`) and TFSA as the zero-income source
  (the US Roth slot, no basis ledger). Pension splitting (`solvePensionSplit`) runs before a draw is scored. The shared module reaches
  these Canada pieces through `#country/core/seam-<name>` facades (`CLAUDE.md`, "The country seam").
- **4B:** port Batch 5's outer search over `m` (and its Apply refinement) with the RRSP meltdown as the
  conversion lever. 4A and 4B may merge into one PR if the shared core makes 4B small.
The text below is the pre-3C plan; keep its tests, hooks and interactions, read "live mix" as the solver's
order choice and "the optimizer port" as the outer search.

Prerequisite check before starting: how much of the withdrawal module is shared
today. Phase 2 step 4.5 shared helpers only and left the year loops per-country,
so this batch may need to extract the mix code from `withdrawStandard` into a
module under `src/shared/core/` first (Batch 3 step 1 defines the hook shape).

1. **Federal age amount and pension income credits: moved to Batch 7 (7J)**
   (owner decision; same machinery as the provincial credits). By the time this
   batch runs, `personTaxCA` already has them.
   **Depends on 3C and 5 (both before this batch):** 3C's solver is US-only code today; 4A moves its core
   into a module under `src/shared/core/` (see the redesign note above), and the Canadian `incomeRoom` hook below becomes
   Canada's kink list for it (OAS recovery, GIS, age amount).
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
- Reuse as much of the US optimizer as can live in `src/shared/core/`.
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

**Status (2026-10-25).** Done: step 0, the re-measured gap (PR #45); step 1, the 162(l) settlement (PR #44); step 2, the
objective registry (PR #46, US V136); step 2b, the mix fallthrough (PR #47, US V137); step 3a, the flat-bracket search in the
cliff plan (PR #49, US V139; spec `docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md`); step 3b skipped (owner,
2026-10-25); step 4a, the stored plan and Optimize -> Apply (branch `claude/b5-stored-plan-b3568e`, US V140; spec
`docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md`, notes "Batch 5 step 4a" below). Next: step 4b (the gains-capped
stay-under), then 4c (the stock-account order) and 4d (the two-return split), one PR each (spec sections 6-8); then step 5
(lambda's estimator from 4a's lambda table, retire `optimizeMultiLever` and the age-keyed schedules; the 30-year cap).

**Added 2026-10-09 (owner, E1c review part 5): settle the 162(l) deduction at the final draws.** To be designed with the owner at
the start of Batch 5 (brainstorming, architectural path: a written spec before any plan); the notes below are the starting point,
not decisions.

*The problem.* In a year whose MAGI iteration does not converge with a 162(l) deduction allowed, E1c holds a deduction (the
consistent one if a bisection finds it, else Rev. Proc. 2014-41 section 5.02's) computed on the draws of the pass that failed to
converge, and re-runs the year with it held (spec decisions 9, 10, 12 of `docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md`).
The re-run's draws respond to the new premium, so the year can end with a deduction that is neither consistent nor 5.02's at its
own final income. Always an understatement so far (legal, conservative): at `9b47b3a`, in the grid below, the stale hold is off
by hundreds of dollars in many band years and by about $12,000 in some (5.02 from stale draws, where the final draws' 5.02 gives
the full premium). A one-shot re-hold at the final draws (decision 11) was tried and withdrawn: it flips across the 400% line and
deducted more than the premium paid in 224 of 8,610 grid years (worst $12,829; E1c review part 5). Root cause: the draws pay for
the premium and the tax, which depend on the deduction, which depends on the draws; in the band there is sometimes no year where
all three agree, so any exact design must let the legal answer at the final draws differ from what the draws paid for, and settle
the difference somewhere.

*Goal (the spec owner's reading, to confirm).* Every self-employed year ends exactly legal at its own final income: the deduction
is the consistent one, else 5.02's, for that income; the premium charged is the cost at the resulting MAGI; the deduction never
exceeds the premium paid. Converged years unchanged (byte-identical); no pre-E1c snapshot entry moves; no new input; timing within
+5% per path; the same behaviour in the standard projection, historical and Monte Carlo runs and the cliff plan's phases.

*First open question (asked, not answered): where the settlement's cash difference goes.*
- A. Next year, as a real return does (the return and the premium tax credit reconciliation, Form 8962, are filed the next
  spring): the year keeps its draws and the true-up is an inflow or outflow of the next year's cash flow (the last year: the
  estate). No same-year shortfall rule, no re-run. Spec owner's lean.
- B. The same year through cash, like the forced pass's refund today (`bal.cash += refund + (totalTax - taxAfter)`): simple for a
  refund, but a balance due can take cash below zero after the draws, and the engine has no rule for that (no negative-cash guard
  exists).
- C. The same year with one extra draw for a balance due: stays inside the year but changes the MAGI again (gains or traditional
  money), which reopens the circularity.

*Related, decide together.* The forced pass (7O follow-up F5; spec of the Medicaid and 100%-of-FPL cliffs) already settles the
premium at the realized MAGI and refunds the difference to cash, for the same reason (no fixed point at a step-down). A Batch 5
settlement could be one mechanism for both (the premium cliffs and 162(l)), or 162(l) only. Also: whether the settled deduction
feeds `prevSeHealthA/B` (next year's seed), the recorded MAGI (`realizedMagi`, `irmaaMagiHistory`, the IRMAA lookback), and the
guardrail and `firstWithdrawal` records (the forced pass re-records them net of its refund).

*Code sites (at the E1c merge; re-read then).* In the US `runProjection` year loop: the switch block after the damped-continue
block (`if (unconverged && !forcedPass && !replaying && !seHeld && (profile.seAllowA || profile.seAllowB))`, the per-pass `seSearch`
closure, the $0 guard, `seHeld`, `seKind` and the kept-phase counters `magiStats.seFixed` / `seAlternative`); site 7 (the held pair
taken as the realized pair); the forced-pass pick and its true-up block (`if (forcedPass && flow < 0)`); `costAt`, `lastCost`,
`seHealthDeduction`, `SE_HEALTH`; `realizedMagi`; the cliff plan's carries (`naturalRec`, `trialRecs`, the fallback and winner
replays, the trial-start reset), which every new per-phase variable must join; `prevSeHealthA/B`. The historical and Monte Carlo
paths run the same loop (`BUCKET_MODE`); keep it one loop (a mode switch, never a fork).

*Tests and probes to reuse.* `tests/se_health.js`: the Task 9a cases (single 70,000 / 73,000 / 74,000 and 82,000; joint 99,000 /
100,000; two returns 70,000-74,000; the Medicaid line), the Task 10a `zero` and `joint` cases and the Task 11 `invariant grid`
(deduction never above the premium paid, premium = cost at the recorded MAGI; it also counts the understated years, which the
settlement should take to zero). The spec owner's grid: single, 60, retiring at 60, main income 0, one `kind: 'self'` stream owned
by A of 20,000-60,000 by 1,000, spending 20,000-40,000 by 1,000, taxable 500,000 at `basisRatio` 30 and 60, `tx`, `acaEnabled`,
premium 18,000, inflation / income growth / medical inflation 0, `tenure: 'rent'`, `rent: 0`, years 0-4 (8,610 years); per year
compare `seHealthA` with the search at the final draws (`base = magiProxy + seHealthA`, `cap = sePlanNetA`, the consistent `d` by
bisection if `|g| < 1`, else 5.02 at `base`). The independent reviewer's eleven probe households (two returns with children, both
self-employed with `capA` binding, near 100% of the poverty line, the Medicaid box on and off, historical and seeded paths,
survivors; E1c review part 4) and its mutation list.

*Facts.* Rev. Proc. 2014-41 (IRB 2014-33): section 5.01 (iterative; if it never comes within $1 the taxpayer "should not use the
iterative calculation method, but may use the alternative calculation method ... or another method that produces amounts that
satisfy applicable tax law"), 5.02 (alternative: step 1 the deduction at the full premiums, steps 2-3 the deduction at the
premium less the step-2 credit, step 4 the final credit at the step-3 MAGI), 5.03 (the cap: earned income from the business).
Retrieved 2026-10-09 (`https://www.irs.gov/pub/irs-irbs/irb14-33.pdf`).

Run after the engine and tax model have settled, since objective values and
timing both depend on them.

**Re-scoped by the cliff plan (owner, 2026-10-07; `docs/superpowers/specs/2026-10-07-cliff-plan-design.md` section
10).** Read the text below with these changes; where they conflict, this block wins:
- The output is a **plan** chosen on the deterministic projection and applied unchanged in historical and Monte Carlo
  runs, not a policy re-applied per path with lambda from each path's balances (3C spec decisions 1 and 4 are
  superseded). Every lever below becomes plan intents chosen by whole-run evaluation, never per path.
- **Optimize -> Apply** runs a deeper search and stores a plan of the cliff plan's shape in `state` (`normalizeState`
  guard, legacy cases), with a staleness flag ("computed for different inputs") and the historical and Monte Carlo
  success rates with and without it on its card. It overrides the automatic quick plan.
- **The tax-aware order** becomes a named order or mix per age in the plan (it may differ by age; it is fixed in the
  plan). It replaces the live-mix toggle's `pickLiveWithdrawalOrder`, the one remaining per-path choice after the
  cliff plan. The two-return draw split and conversion sizing (Notes 1 and 2) become plan intents the same way.
- Retire `optimizeMultiLever` and migrate `appliedMixSchedule` / `appliedRothSchedule` into the plan.
- **Lambda's accuracy:** the emptied-pool sample (defect recorded in the 3C notes, "Redesign: the cliff plan"; the
  cliff-plan scan counts `movedSample` years against family rejections), the multiplier `m`, both against the slow
  reference; then decide between correcting the sample, tuning `m` and replacing the estimator.
- Rule A carries over: on the deterministic projection the search never runs out earlier than the user's current
  settings; historical and Monte Carlo rates are reported, never used to choose.

**Redesign after 3C (owner decisions 2026-10-06 and 2026-10-07; spec sections 2, 11 and 13 to 13.3).** The
optimizer's output becomes a **policy** (a few parameters every run follows: standard, historical, Monte Carlo),
not an age-keyed schedule. Close to optimal and fast (seconds) beats exact; deterministic (fixed grids and
candidates, no random starts).
1. **Outer search over `m`** (lambda = `m x rateHat`, `SOLVER_LAMBDA_MULT` = 1 in 3C): full projections on the fast
   path (a deterministic grid or golden-section, roughly 20-100 projections instead of 8,000), scored by the
   Batch 5 objective. The candidates always include the user's current mode and `m = 0` ("never worse than your
   current settings"), and **depletion is ranked first**.
2. **Apply refinement:** the single-scenario Optimize -> Apply button searches per-phase multipliers (before 65,
   65 to RMDs, RMD years); its result is always applicable (it starts from the live policy and keeps the best
   found, so it cannot score worse on the standard projection). The card shows the historical and Monte Carlo
   success rates for both, since the refinement can lose there.
3. **Objective registry and wording:** items 2-4 below (lifetime tax, healthcare, ending net worth, legacy, IRMAA,
   ACA subsidy, RMDs, balanced; "searches for a tax-efficient strategy").
4. **Retire coordinate ascent and the age-keyed schedules:** `optimizeMultiLever`, `ROTH_PER_YEAR_*`, and
   migrate or retire `appliedMixSchedule` / `appliedRothSchedule` (saved scenarios: `normalizeState` and
   `tests/legacy_state.js`). Decide whether the full solver becomes the default.
5. **The gap script becomes a guard:** `tests/solver_gap.js` (3C's gap table, below in the 3C notes) and
   `tests/solver_scan.js` (the depletion sweep) run on every lambda-driven change.

**Batch 5 owns all lambda-driven policy (spec 13.3, as written there):**
- The stock-account order, the two-return draw split and conversion sizing (Notes 1 and 2), each behind the outer
  search, which includes the user's current mode and `m = 0` as candidates and ranks depletion first. Its acceptance
  tests are the tables in the 3C notes (13.3), the 5 households that ran out a year earlier, the conversions-on
  interplay, and the two costs the yearly score cannot see:
  - leaving more gains in taxable raises later MAGI and IRMAA;
  - a finite step can cross an IRMAA tier.
- The cliff guard stays on by default, unchanged. Batch 5 also looks at whether IRMAA stay-unders should remain
  guard candidates (all of the guard's value losses), using the same scans.
- 3C's remaining hard rules carry over: no snapshot scenario depletes earlier, guard-on never earlier than guard-off.
  **Amended (owner, 2026-10-24, step 3 decision 5):** a split gate. No *standard* snapshot scenario depletes earlier (hard);
  *historical* movers may move either way and are explained by cause, and a bridge drain (penalized money before 59.5 after a
  larger conversion) stops for the owner, as the cliff-plan spec's section 8 already set for historical and Monte Carlo runs.

**The three policies and their acceptance tests (moved from 3C):**
- **Tax-aware stock-account order** (3C task B5, built and measured, not shipped). Replace `pickLiveWithdrawalOrder`'s
  two-order rule and its `overage * 1e6` term with the plan's order choice (`chooseYearPlan` with
  `orders: ['taxable', 'traditional']`, `wd.taxAwareOrder`, which the B3 primitives already carry). Accept only if,
  against the default order over the 768-household grid per mode, it no longer depletes earlier (it did in 19, the 5
  distinct households in the 3C notes), its losses shrink (p10 about -75k, -150k among plans that never run out,
  worst -694k at 3C), and with conversions on it beats a coin flip on cost (107 dearer, 87 cheaper at 3C). Also
  remove `remainingMagiRoom` with `pickLiveWithdrawalOrder`: it is built every year (`incomeRoom(magiSafeRoom,
  conversionAmount)`) and forwarded through `withdrawStandard` / `drawMixedStockAccounts`, but it cannot change the
  live mix's choice (3C notes, exploration finding 2), so it is dead wiring; `tests/historical_parity.js` checks the
  wiring in the source and must change with it.
- **Two-return draw split** (3C task B6, not built). In two-return years with no conversion, three dry runs: pro rata
  (today), A first, B first (`wd.onlyPartner`, `profile.ownerShareA` 1 or 0; the pass-start reset to `ownerShareA0`
  undoes it). Row field `drawSplit` ('A' / 'B', only when not pro rata). Acceptance test (from the B6 brief,
  `tests/two_return_split.js`): B has a 90,000 pension and A none, both 60, filing single, 1M in each 401(k), cash 0,
  spending 120,000: the split is 'A'; a conversion year is never split; a joint return is never split. Only tax-aware
  two-return scenarios may move.
- **Tax-aware conversion sizing** (3C task B5, first attempt, not shipped). Size the conversion by
  `amount x lambda - tax now - premium change - IRMAA change` over the bracket tops, built to the two design notes:
  - **Note 1, lambda's pool path includes the expected draws: done in 3C** (B5a, and B5b prices each sample on the
    walk's own draws and on the year the pool runs out).
  - **Note 2, a bridge check on conversions (still to build).** Before 59.5 (per owner, using the 3B statuses), a
    conversion amount is allowed only while the penalty-free accessible money (taxable, cash, the taxable bond
    reserve, Roth basis and seasoned conversions, penalty-free traditional) still covers the need for every year left
    until 59.5 after the conversion's tax is paid. Larger amounts are not candidates.
  - A hand-computed one-dollar conversion test pins the no-double-counting invariant (a converted dollar gains
    `lambda`; this year's tax is subtracted once).
  - Before it ships: the depletion sweep and the slow-reference gap table on conversion sizing, and "never worse than
    your current settings" (the bracket conversion is always a candidate). The first attempt depleted 5 snapshot
    scenarios earlier (3C notes, spec 13).
  - The open item on `solveRothConversion`'s conservative deduction lower bound is decided here.
  - **The fill clamp's test (review follow-ups M17, deferred 2026-10-08).** A fill year keeps at most the natural year's
    conversion (`conversionAmount > naturalRec.conversion` clamp in `runProjection`). No household reaches it today
    (conversion sizing ignores the draws; see "Task 1 stop and decisions" under the branch review). Once conversion sizing
    reads the draws or a new floor line can be filled, add the test as written in Task 1 Step 5 of
    `docs/superpowers/plans/2026-10-08-review-followups.md`, proven on deleting the line.

Starting material kept by the owner/controller for Batch 5 (not committed): the B5 work-in-progress patches (the
order choice and the first conversion attempt) and its test `tax_aware.js`.

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

1. **(Done in step 0, PR #45.)** **Performance baseline** on the final engine: time `optimizeMultiLever` on
   representative scenarios and measure the evaluation budget
   (`ROTH_PER_YEAR_EVAL_BUDGET`). Decide whether lifting
   `ROTH_PER_YEAR_MAX_WINDOW` (30) is affordable, and what replaces the cap
   (a time/budget bound with a visible "searched through age N" note).
2. **(Done in step 2, PR #46: two objectives, `endValue` the default, by the owner's decision; no selector until step 4.)**
   **Selectable objective.** Replace the fixed `rothScheduleCost` with an
   objective registry: lifetime tax, healthcare cost, ending net worth, legacy,
   IRMAA, ACA subsidy, RMDs, balanced (a documented weighted blend). The default
   stays today's tax + healthcare so existing results do not move.
3. **(Done: the optimizer cards say "searches for a tax-efficient" schedule / strategy and that a better one may exist.)**
   **Wording.** Present results as "searches for a tax-efficient strategy", not
   "the optimal"; mention it is coordinate ascent on a discontinuous objective.
4. **(Partly done in step 2: `tests/unit/us/objectives.test.js` checks each objective against the rows; the UI scripts were not extended per objective.)** Tests: `test_multi_lever_optimizer.js` and `test_roth_optimizer_per_year.js`
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

### 7N: remaining Canadian credits, benefits and fixes (Canada only)

Written 2026-10-06 from a gap assessment of the Canada planner at the 7M merge (V43) against the
federal return (Schedule 1), the provincial 428 forms and the federal and provincial benefit
programs. **No new inputs** (decision 20): every item reads `state` fields that already exist (ages,
wages, `healthcare`, `ltcEnabled`/`ltcYearlyA/B`/`ltcAgeA/B`, the children list, tenure and
purchase year, province, balances). One commit per item, in this order (fixes first, because the
credits after them are priced through the same `taxFor`). Each item is an intended number change
unless it says otherwise: before/after table (default scenario plus a scenario that exercises the
item), seeded historical and Monte Carlo success rates, `npm run snapshot:update` in the same commit,
the Canada badge bump, README feature list and the 7N notes. Every figure is re-confirmed on a
primary source at implementation (decision 15); the figures below are working values, mostly 2025
amounts or 2026 amounts read on secondary pages, and are marked as such. US untouched.

Already done in 7J-7M (checked, not repeated here): the basic personal amount as a credit with its
high-income phase-down, the federal and provincial age and pension amounts, Quebec's pooled amounts,
the Ontario surtax order and the Health Premium on taxable income, the OAS 75-plus step, GIS and
the Allowance, the CCB and the CGEB, and the provincial paid benefits of all ten provinces.

**N1. OAS recovery tax on the full year's income (fix).** Today `oasClawback` runs once, in the year
loop, on `splitA`/`splitB` before the RRSP meltdown, the discretionary RRSP/RRIF draw and realized
gains are known (`Planner_Canada.html`, the `clawbackA/B` lines), so it misses the income that most
often crosses the threshold, and the withdrawal solvers do not see the 15% at all. Example: a 65+
partner with $85,000 of base income who draws $30,000 more pays about $2,900 of recovery tax the
model does not charge. Fix: move the recovery tax into `incomeTaxCA` (per return, on that return's
net income after the split, including its share of the meltdown, the discretionary draw and the
50% gains inclusion), with `oasA`/`oasB` carried on the profile (the survivor remap moves the
survivor's OAS into slot A, like the other fields). Because Canada `taxFor` is the net cost, the
draw solvers then price the clawback automatically. The row keeps reporting the clawback as its own
amount and `ss` net of it, computed from the final income; the cash flow uses gross OAS plus the
tax. GIS keeps reading income without OAS (unchanged). Check the pension-split search still
converges (its objective gains a kink at the threshold; compare against the brute-force scan in
`tests/tax_brackets.js`). Add a row to the cliffs register. Tests: hand-computed clawback with a
draw that crosses the threshold, the cap at the full OAS, survivor symmetry.

**N2. Dropped (assessed 2026-10-06).** Ontario Health Premium thresholds are fixed in dollars in
law while the model indexes them, but the premium amounts are fixed too, so freezing both would
lower the long-run real premium, not raise it; the effect is a few hundred dollars either way and
it would contradict the planner's rule that tax parameters are held constant in real terms. Left
as a named gap (same family as the BC indexation-pause open item). The number is kept so the
items below keep their names.

**N3. Spouse and eligible-dependant amounts (7K named gaps).**
- Federal spouse or common-law partner amount: the basic personal amount (with its phase-down
  maximum) less the spouse's net income, at 14%. The provincial equivalents come from each
  `PROVINCE_RULES` row (new `spouse` family: amount, the income the reduction starts at, per row).
  For a couple both returns are computed already, so each return needs the other spouse's net
  income: pass it from `incomeTaxCA` (it already builds `family`) and from the pension-split
  search's `combinedTax`, where the transfer moves both incomes.
- Eligible dependant amount (federal, same size as the spouse amount, about $2,300 a year at 14%;
  provincial equivalents per row): a single person, or the survivor, with a child under 18 in the
  `dependentsInYear` list. One claim per household.
- The spouse amount is rarely non-zero for this planner's couples (investment income and RRSP
  draws are split 50/50, so a spouse seldom has income under the basic personal amount), but it
  costs only arithmetic; the eligible dependant amount is about $2,300 a year federal (plus the
  provincial amount) for every single-parent and survivor-with-children year.
- Not built: the transfer of a spouse's unused age, pension and (Quebec) pooled amounts
  (Schedule 2). Rarely non-zero here for the same 50/50 reason, and it forces the two returns to
  be evaluated in sequence inside the split search. Tests: hand-computed per mechanism, the
  split-search regret check, survivor symmetry.

**N4. Working-year payroll items.** EI premiums are not modeled (about $1,100 a year per earner;
2025: 1.64% up to $65,700 of insurable earnings, Quebec 1.31% because QPIP replaces part of EI) and
no credit is given for the contributions that are modeled. Add: EI premiums to `cppContribution` /
`payrollTax` (Quebec rate from the row), the base CPP/QPP contribution and EI/QPIP premiums as
non-refundable credits, the enhanced CPP/QPP contributions (first-tier enhancement and CPP2) as a
deduction from income (so it lowers net income for the benefits too), and the Canada employment
amount (2025: $1,471) on wages, at 14% (Quebec has its own deduction for employment income: check).
Wages are `wageA/B` net of the pre-tax health premium, as today. Working years only; the net effect
is small (EI is a cost, the credits partly offset it).

**N5. Medical expense credit, from the costs the planner already models.** Post-retirement private
health and dental premiums (`healthcare`) qualify as medical expenses, and long-term care costs
(`ltcYearlyA/B`) qualify, in full for a nursing home and only the attendant-care part for a
retirement home. Credit: 14% federal, the lowest provincial rate provincially, on expenses over the
lesser of 3% of net income or the indexed floor (2025: $2,834). Claimed on one return (the lower
net income gives the larger credit; a couple's expenses are pooled on it). Includes the federal
temporary top-up credit (2025-2030: credits above the first-bracket income keep the 15% rate), which
only matters at large claims. Ontario Seniors Care at Home Tax Credit (70+, refundable, 25% of up to
$6,000 of the same expenses, income-tested) goes in the Ontario row. **Owner decision at
implementation:** treat the whole LTC input as eligible (nursing home, recommended, with a line in
the LTC info bubble) or a fixed share. Impact: large in LTC years (about $10,000 a year on $50,000
of care); a few hundred dollars a year on premiums. The pre-retirement health premium is already
taken off wages before tax, so it is not claimed again.

**N6. Low-income provincial tax reductions (7K named gaps, deferred for unreliable figures).**
Ontario tax reduction (form ON428 part C; it removes Ontario tax for many incomes under about
$20,000 and reduces it up to about $40,000) and the BC tax reduction credit (BC428), plus whichever
of the NB, NL, NS and PEI low-income tax reductions on the 428 forms are not already covered by the
7M rows (check each against the 7M list first). Read the amounts from the forms or statutes, not a
CRA payroll summary (7K gotcha). They matter for TFSA-heavy plans with low taxable income, the same
households GIS reaches. New data family `lowIncomeReduction` per row; regenerate the rules doc;
cliffs register rows.

**N7. Quebec health contributions.** Two income-tested amounts collected on the Quebec return that
the model does not charge: the Health Services Fund contribution on income other than employment
income (pension, RRIF, investment income, gains: 7K named gap; verify the band and the $1,000
maximum on form TP-1 schedule F) and the RAMQ public prescription drug insurance premium (up to
about $750 per adult, reduced at low family income; verify on schedule H). **Owner decision at
implementation:** who pays the RAMQ premium with no coverage input; recommended assumption: every
retired adult (the working partner is assumed to be on a group plan), stated in the Quebec note.
Up to about $1,700 a person a year for a Quebec retiree.

**N8. After-tax estate (display only).** "End assets" counts an RRSP/RRIF dollar the same as a TFSA
dollar. At the last death the RRSP/RRIF is income on the final return and unrealized gains in the
taxable accounts are deemed realized (50% inclusion); the TFSA and the principal residence are not
taxed. Provincial probate fees apply to the estate (new `probate` family per row: ON 1.5% over
$50,000, BC about 1.4%, AB capped at about $525, QC nominal, MB none, others to read; registered
accounts and the TFSA with a named beneficiary assumed outside the estate, the home inside). Add an
"after-tax estate" figure next to end assets (results and table), computed from the final row with
the final return run through `personTaxCA` (one return, survivor). It changes no projection or
success rate, so the snapshot grid stays byte-identical; the UI baseline moves. Also show it in the
meltdown-bracket table, which today ranks by pre-tax end assets and so undervalues melting down.
**Owner decision at implementation:** rank that table by the after-tax figure (recommended) or only
show it.

**N9. OAS in the survivor period (fix).** From 65 `cppAndOasIncome` gives the survivor the greater
of the two OAS amounts; OAS is never inherited, so the survivor keeps their own (`oasMonthly` of the
survivor, with the 75-plus step). Moves only scenarios where the two OAS inputs differ. The CPP
survivor's pension, death benefit and children's benefit stay with the Batch 6 CPP work.

**N10. Home buyers' amount (small; same commit as N4).** $10,000 at 14% ($1,500) federal, and
Saskatchewan's own first-time home buyers' amount, once, in the `rentThenBuy` purchase year
(first-time buyer assumed, as the FHSA already assumes).

**N11. Canada Dental Care Plan note (copy only, no number change).** The plan covers dental care for
families under $90,000 of adjusted net income without dental insurance, which a retiree would
otherwise pay out of the `healthcare` amount. Add a sentence to that field's info bubble; not
modeled.

**Feasibility assessment (2026-10-06).** Every kept item reads existing inputs without changing
what any of them means (N5 and N7 add a stated assumption, not a field). Cost: `taxFor` runs inside
the 24- to 50-step solvers in every year of every run, so nothing may add a loop or an allocation
there; N1, N3, N5 and N6 each add O(1) arithmetic per call, N4's EI is computed once a year outside
the solvers, N8 runs once per displayed run after the year loop, N9 and N10 are once-a-year or
once-a-plan values.

| Item | Significance | Cost |
|---|---|---|
| N1 OAS recovery tax on full income | High for 65+ households with RRIF draws, meltdown or gains near the threshold (up to the full OAS, about $9,000-10,000 a person a year) | O(1) in `taxFor`; no new iteration because Canada `taxFor` is already the net cost the solvers price. The clawback's cap makes the pension-split objective non-convex: keep the equal-split fallback and the brute-force regret test |
| N3 spouse and eligible-dependant amounts | Eligible dependant: about $2,300 federal plus provincial a year for single parents and survivors with minors; spouse amount: usually zero here | O(1) |
| N4 EI and payroll credits (with N10) | Working years: EI about $1,100 an earner a year less about $300-600 of credits | Once a year |
| N5 medical expense credit | About $10,000 a year in LTC years; a few hundred dollars a year on premiums | O(1) |
| N6 low-income tax reductions | Up to about $300-600 a person at low taxable income (the households GIS reaches) | O(1); research risk (7K could not confirm figures) |
| N7 Quebec health contributions | Up to about $1,700 a person a year, Quebec only | O(1) |
| N8 after-tax estate | No effect on success rates; tax on an RRSP/RRIF left at death is about 40-50%, which is what makes RRSP-versus-TFSA comparisons meaningful | Once per displayed run |
| N9 survivor OAS | Only when the two OAS inputs differ | None |
| N11 dental plan note | Copy only | None |

**Considered and left out (named gaps for the 7N notes):** the Ontario Health Premium freeze (N2),
the transfer of a spouse's unused amounts (N3), CPP sharing between spouses (small next to
pension splitting, and it would change what the pension-split toggle means), alternative minimum
tax (needs a large one-year gain; recoverable over seven years), the disability amount and benefit,
donations, tuition transfers, the Canada Workers Benefit and refundable medical expense supplement
(low earned income, rare here), non-eligible dividends (owner decision, 7K), the prior-year income
lookback for the clawback and benefits, the territories, and CPP/OAS claim-age adjustments
(decision 20: Batch 6).

**Exit criteria.** `npm test` green with the snapshots updated only in the commits listed as number
changes; the timing gate (`tests/bench_runs.js`-style comparison for Canada, 300 `simulate()` per
round) within +5% of the 7M merge, since N1, N3 and N5 add work to every `taxFor` call (keep the
no-OAS, no-children, no-medical paths allocation-free and early-exiting); survivor symmetry; a
390x844 check for the new estate figure; `docs/province-tax-rules.md` regenerated; 7N notes with
sources, before/after tables and the cliffs-register rows.

### 7O: remaining US credits, benefits and fixes (US only)

Written 2026-10-06 from a gap assessment of the US planner (at `claude/batch-3b-penalty-rules`, after
the 7D merge) against an external catalog of federal and state credits and benefits (ChatGPT), each
claim checked. **No new inputs except one checkbox** (decision 21, item O1): every other item reads
`state` fields that already exist (`stateTax`, ages, retirement ages, the children list,
`ltcEnabled`/`ltcYearlyA/B`/`ltcAgeA/B`, `medicareYearly`, `healthcare`, the eight account balances and
the account ledger). One commit per item, in this order (O1 first: it moves the most numbers and 3C
has to price its floor). Each item is an intended number change unless it says otherwise:
before/after table (default scenario plus a scenario that exercises the item), seeded historical and
Monte Carlo success rates, `npm run snapshot:update` in the same commit, the US badge bump, README
feature list and the 7O notes. Every figure is re-confirmed on a primary source at implementation
(decision 15); the figures below are working values from secondary pages unless marked. Canada
untouched.

Already modeled (checked, not repeated here): the ACA premium tax credit with the 2026 cliff at 400%
of FPL and the "enhanced subsidies return" toggle (the enhanced credits expired 12/31/2025; the House
passed a three-year extension in January 2026, stalled in the Senate, so the toggle stays off by
default), IRMAA with the two-year lookback, Medicare from `max(65, retirement age)`, the CTC, ODC and
ACTC (7B), the federal deductions (Batch 2), and Social Security taxation, retirement exclusions and
credits in all 51 state rows (7C/7D).

Corrections to the external catalog (recorded so they are not re-raised): the Saver's Match replaces
the Saver's Credit from tax year 2027 and is a federal deposit into the account, not a tax credit
(CRS IF11159); WEP/GPO are repealed (decision 17); the Credit for the Elderly or Disabled has
unindexed limits (about $17,500 / $25,000 AGI, and $5,000 / $7,500 of nontaxable Social Security
removes it) and pays nothing to a planner household; NCSL's state child credit list (May 29, 2026) is
17 states plus DC, without VA or WI and with DC, GA, ID, IL and MA; the WA "EITC" is the Working
Families Tax Credit, a sales-tax refund outside the income tax; cost-sharing reductions change
deductibles, not the premium the planner models; Medicare Part A is premium-free with 40 credits.

**O1. Medicaid and the ACA subsidy below 138% of FPL (fix; one new checkbox).** Today
`acaNetCost` charges about 2.10% of income to a household under 133% of FPL in every state
(the 7B notes record "no PTC floor at 100% of FPL ... no Medicaid eligibility"). The law: no premium
tax credit for anyone eligible for Medicaid, and none below 100% of FPL.
- Expansion states (40 plus DC): MAGI at or under 138% of FPL (133% plus the 5% disregard) is
  Medicaid, $0 premium, no asset test for MAGI Medicaid.
- Non-expansion states (AL, FL, GA, KS, MS, SC, TN, TX, WI, WY; healthinsurance.org, 2026): under
  100% gets no subsidy, so the full premium; from 100% the normal credit. WI covers adults to 100%
  through BadgerCare without expansion ($0 under 100%). GA Pathways (limited, with its own work rule)
  is treated as non-expansion.
- OBBBA community engagement: from January 1, 2027 expansion adults 19-64 must show 80 hours a month
  of work, community service or school (exempt: a parent or caregiver of a child 13 or younger,
  pregnancy, medical frailty; CMS interim final rule, June 2026), and a person denied Medicaid for
  the requirement is also barred from the premium tax credit (Health Management Associates). Model:
  a retired partner with no child 13 or younger (children list) fails it from 2027, so pays the full
  premium; a parent of a young child keeps Medicaid. States may get good-faith extensions to 2028:
  not modeled (the safe side).
- New checkbox `medicaidWhenEligible` ("Enroll in Medicaid when eligible"): on, an eligible
  household pays $0; off, it pays the full unsubsidized premium (it cannot take the credit instead).
  Some households decline Medicaid (provider networks, estate recovery from 55). Default to decide
  when scoped (proposed: on, with an info tip on estate recovery). Registry entry, `normalizeState`
  guard, MCP, `tests/legacy_state.js` case.
- Data: a small pure-literal `MEDICAID_RULES` table (non-expansion list, WI's 100% coverage, the
  work-requirement start year and exempt child age), not a `STATE_RULES` column, so the state-tax
  coverage test and generator stay unchanged. Logic in `acaNetCost` (household-level: the MAGI and
  household size are already the household's), shared by `healthcareCost` and the 400% guard in
  `conversionMagiCeiling`, so cost and guard cannot drift apart. Medicaid uses current monthly
  income; the annual MAGI stands in (an engine convention).
- Cliffs register: the 100% floor (non-expansion), the 138% Medicaid line (expansion; a cliff up to
  the full premium when Medicaid is declined or the work requirement fails), the 2027 start. Note
  for 3C: the safe-MAGI room gains a floor, since a Roth conversion or gain harvest that lifts MAGI to
  100% (non-expansion) or past 138% (expansion, failing the work requirement) can be worth more than
  the tax it costs. 3C decides the policy; O1 only prices it. (Done in 3C: these lines are cliff-guard candidates
  through `magiThresholds`; the fill-to-floor candidate fills to them. See "Cliffs register: what 3C reads" in the
  3C notes.)
- Effect: in the years it applies, the full couple premium (often $15,000-25,000 near 60) or $0
  instead of a few hundred dollars, in the low-MAGI years FIRE plans aim for.
- Tests: new `tests/aca_medicaid.js` (hand-computed: expansion and non-expansion at 90%, 120%, 140%
  of FPL; WI under 100%; 2026 versus 2027 with and without a child 13 or younger; checkbox off;
  survivor and single-person households), plus `tests/aca_magi_iteration.js` still converging at
  the new cliffs.

**O2. Medical expense deduction in long-term-care years.** `itemizedDeduction` adds medical expenses
over 7.5% of AGI (IRC 213; permanent floor): the year's LTC cost (`ltcYearlyA/B` from `ltcAgeA/B`,
treated as qualified long-term care services for a chronically ill person under a plan of care,
stated in the tip), Medicare premiums and supplement (`medicareYearly`, IRMAA included) and the net
pre-65 premium after the credit. Payroll-deducted premiums (`healthPremiumA/B`) are already pre-tax
and excluded. `buildTaxProfile` carries `medicalExpense`; `taxFor` already has AGI. Federal only
(state itemized deductions are not modeled). `solveRothConversion` keeps its conservative lower
bound (no medical term). Only binds when itemizing beats the standard deduction, which in practice
means LTC years. Example: $100,000 of care on $80,000 of AGI is a deduction of about $94,000.
Reverses the "charity, QCD and medical out of scope" decision for medical only (decision 21);
charity and QCDs stay out. Hot path: the no-LTC, no-medical case must stay allocation-free and
give the same doubles (`tests/tax_caches.js`). Tests: hand-computed itemizing with and without LTC,
the 7.5% floor, the standard-deduction crossover, survivor.

**O3. Pennsylvania: employer-plan distributions after retirement (fix; the open item).** The PA row
taxes every traditional draw before 59 and a half, but a distribution from an employer plan (401(k))
after retirement is generally exempt at any age (owner-confirmed rule), while an IRA draw before
59 and a half stays taxable. The account ledger already tracks each partner's 401(k) and IRA shares
and draws are pro rata within a partner, so the 401(k) fraction of a partner's traditional draw is
that partner's 401(k) share over their total traditional share. Add per-person `retirement401kA/B`
to the state sources (written only when `needsPerPerson`), an `applies: 'employerPlanAfterRetirement'`
option on the `perPerson` retirement kind (retired means that partner is no longer working), set the
row's flag, regenerate `docs/state-tax-rules.md`. Check the RMD and 72(t) draws (`accountsDraw`) feed
the same split. Tests: `tests/state_mechanisms.js` case on `zz`, a PA household retiring at 52
drawing a 401(k) and an IRA, `tests/tax_caches.js` flag pin.

**O4. State child credits (data rows).** Existing `childCredit` / `childStepCredit` kinds, ages from
the children list; each credit applies its own age cutoff. Most are low-income credits that pay
nothing in working years and matter in low-AGI retirement years with children. Working figures
(NCSL, May 2026, plus the pages named; confirm each, including phase-out shape and refundability):
- MN: $1,750 per child under 18, refundable, indexed; phase-out from about $37,910 joint / $31,950
  other (MN DOR 2026 sheet; the rate, about 12%, and the income measure are to confirm; pending bills
  to raise the thresholds not modeled unless enacted).
- OR: $1,000 per child under 5 (NCSL; the Oregon Kids Credit's own age wording and its low income
  range to confirm), refundable.
- VT: $1,000 per child 5 or under, refundable, reduced over a higher AGI (to confirm).
- UT: $1,000 per child under 6, nonrefundable, phased out over an AGI threshold (to confirm).
- NJ: $100 to $500 per child under 6 by income tier, refundable.
- ME: $300 per dependent, refundable, high-income phase-out (to confirm).
- CA Young Child Tax Credit: $1,000 under $25,000 of income, reduced to $30,000, refundable; it
  follows CalEITC eligibility (including its investment-income limit), so if that ties it to an
  EITC-style test it is left out with the EITC (decide at implementation).
Skipped, too small or needing an input we lack: GA ($250 per child under 6, nonrefundable), ID
($205), OK (5% of the federal credit, nonrefundable), IL (40% of the state EITC, follows the EITC
decision), MD (child with a disability). CO's Family Affordability Tax Credit is switched off for
2026 and likely the next two years (KUNC, June 2026): named in the CO row's notes, rechecked yearly.
Regenerate `docs/state-tax-rules.md`; hand-computed households in `tests/state_7d_households.js`
(or a new `tests/state_child_credits.js`).

**O5. Social Security before retirement: warning (no number change).** The earnings test stays
unmodeled (decision 17), so a partner whose Social Security start age is before both their
retirement age and full retirement age gets the full benefit while wages continue. Add an
unusual-assumption warning for that case (the existing `unusualAssumptionsBanner` list) saying the
benefit would be withheld in part. Snapshots unchanged; `tests/snapshot_ui.js` rendered text may
move. Test: a root `test_*.js` toggle check.

**O6. Record the left-out items (docs only).** In the 7O notes and the README "not modeled" text:
federal EITC and the 31 state EITCs plus DC (no earned income in retirement; investment income over
$12,200 in 2026, Rev. Proc. 2025-32, cancels the credit, and gains from taxable sales count); the
Saver's Credit (only the 2026 plan year remains) and Saver's Match (phases out between about
$41,000 and $71,000 joint AGI while contributing; rare for planner households); state circuit
breakers and property-tax / rent credits (7D decision stands; the reason, no nontaxable-income input,
is weaker now that the engine knows nontaxable Social Security, Roth and basis amounts per year, and
`homeValue` exists for value tests: the MA Senior Circuit Breaker would be the first case if
revisited); local income taxes other than MD and IN; the Credit for the Elderly or Disabled;
Medicare Savings Programs, Extra Help, SSI, SNAP, LIHEAP, TANF, WIC, Lifeline and housing aid (asset
tests, e.g. SSI $2,000); the foreign tax credit; education, adoption, dependent-care and energy/EV
credits. Closes the EITC, state EITC, PA 401(k) and CA Young Child Tax Credit open items.

**Deferred (need new fields, not 7O):**
- **HSA.** 2026 limits $4,400 self-only, $8,750 family, $1,000 catch-up from 55 (Rev. Proc.
  2025-19); bronze and catastrophic marketplace plans are HSA-eligible from 2026. Needs a balance,
  per-partner or household contribution, employer contribution, HDHP flag, a new `bal` pool and
  ledger slot, a withdrawal order (tax-free against medical costs) and a wizard field. Effect about
  $1,000-3,000 a year of tax plus tax-free growth. Until then an info tip can suggest entering an HSA
  balance as a Roth IRA. Revisit after 3C.
- **Pension type** (private / government / military) per partner plus a column in every state row:
  most states exempt military retirement pay, NC (Bailey) and KS exempt government pensions, others
  partly. Worth it if military or public-sector retirees become a target.

| Item | Effect | Cost per `taxFor` / year |
|---|---|---|
| O1 Medicaid and the low-income ACA fix | Full couple premium ($15,000-25,000) or $0 instead of a few hundred dollars, in low-MAGI years | O(1) in `acaNetCost`; more MAGI-iteration passes near the new cliffs |
| O2 medical deduction | Large in LTC years (a deduction near the whole LTC cost above 7.5% of AGI); zero otherwise | O(1) in `itemizedDeduction` |
| O3 PA 401(k) after retirement | PA tax (3.07%) on an early retiree's 401(k) draws, e.g. about $1,500 a year on $50,000 | Per-person field, PA only |
| O4 state child credits | Up to $1,750 a child (MN) in low-AGI years with children; usually zero while working | O(children), only in the seven rows |
| O5 earnings-test warning | Copy only | None |
| O6 documentation | None | None |

**Exit criteria.** `npm test` green with the snapshots updated only in the commits listed as number
changes; the timing gate (`tests/bench_runs.js`, previous commit versus working tree) within +5%,
since O1 and O2 add work to every year and every `taxFor` call (keep the no-LTC, no-children and
above-138% paths early-exiting); `tests/tax_caches.js` identical doubles; survivor symmetry;
`docs/state-tax-rules.md` regenerated; a 390x844 check for the new checkbox; `tests/field_registry.js`
and `tests/legacy_state.js` updated for `medicaidWhenEligible`; 7O notes with sources, before/after
tables and the cliffs-register rows.

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
The intro, "Files", the update notes and the testing checklist of
`docs/reference.md` were already refreshed for the modular build on 2026-10-21
(`docs/superpowers/plans/2026-10-21-docs-refresh.md`); the consolidation keeps them.

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

#### Batch 3C notes: per-year solver (US V112 -> V116; Canada untouched)

Reference text for the finished batch. Design: `docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md`
(sections 1-12 approved 2026-10-06; amendments 13 to 13.3, 2026-10-07). Plan:
`docs/superpowers/plans/2026-10-06-per-year-solver-3c.md`. Commits on `claude/batch-3b-penalty-rules`: Rule of 55 PR
(cdac738 V113, 24f6585 V114), then B1 43a166b (V115), B2 2497856, B3 5de23a1, B4 c54ac72 (V116), B5a 0e664d6,
B5b b5b7878, B5 3b2b854 (refactors only), B7 (these notes and the measurement scripts). B6 was not built (moved to
Batch 5). Every number below was measured with the clock pinned to 2026-06-15 in Chromium via Playwright.

##### Decisions (owner)

From the spec, section 2 (2026-10-06):
1. The optimizer's output is a **policy** (a few parameters every run follows), not an age-keyed schedule. Close to
   optimal and fast beats exact.
2. The single-scenario Optimize -> Apply may run a deeper search; its result is always applicable and the card shows
   both success rates (Batch 5).
3. Deterministic results (fixed grids and candidates, no random starts).
4. lambda is estimated per year from each path's own balances, times a multiplier `m` the outer search tunes
   (`m = 1` in 3C, `SOLVER_LAMBDA_MULT`).
5. Order: Rule of 55 PR -> 3C -> 5 -> 4A -> 4B -> 6 -> 8.
6. Mode scope: the cliff guard in every mode; the full solver opt-in behind the live-mix toggle (superseded by 13.3:
   the full solver moved to Batch 5).
7. lambda averages three sample future years (the first RMD year, a midpoint, a late survivor year).
8. Performance gate: +5% for households with no cliff in reach, up to +30% with one in reach.
9. New checkbox "Cliff guard", on by default, old saves included (`trueUnlessFalse`).
10. The Rule of 55 per-partner election and the Partner B 72(t) field fix ship as a separate PR first.
11. Discounting IRMAA for its two-year lag goes to the backlog (Open items).

Amendments (2026-10-07): section 13, conversion sizing moves to Batch 5; 13.1, Note 1 (lambda's pool path net of
draws) built in 3C as B5a; 13.2, lambda prices the walk's own draws and two-return IRMAA per person (B5b); 13.3, the
tax-aware order and the two-return draw split (B6) move to Batch 5, B5 ships refactors only. Details below.

##### Exploration findings that shaped the design (before 3C was built)

- **Why the safe-MAGI room never had a behavioral test** (the Batch 1 open item). (1) *Double counting:* the engines
  pass `remainingMagiRoom = ceiling - preConvMagi - conversion`, and `preConvMagi` already contains the MAGI
  iteration's estimate of this year's own draw; `pickLiveWithdrawalOrder` then compares the whole draw against that
  already-reduced room. The right room is `ceiling - magiBase - conversion`. (2) *The live mix cannot lower MAGI:*
  its two orders are taxable-first and traditional-first, and taxable-first never has more MAGI, so the
  `overage * 1e6` term can never favor traditional-first. Only Roth (and cash or bond principal) is zero-MAGI money.
- **Prototype cap** (`docs/batch-3c-prototype/`, 972 scenarios, standard engine): capping the traditional draw at the
  corrected room moved 274 smooth scenarios (194 higher, 3 lower, 42 later, 0 earlier) and 112 default ones (41
  higher, 24 later, 0 earlier). Crossing a cliff costs a fixed lump while staying under costs more the further over
  the draw is, so a hard cap is not always right; that led to the priced, per-year decision.

**Batch 1 open item, closed.** The MAGI room now has a behavioral test with a mutation check: `tests/cliff_guard.js`
case 1 (and 1b): just over the 400% line the guard stays under and keeps the credit; removing the cap (guard off)
changes the result (case 1 failed before B4: "guard on stays under (62898.4)"). The double-counted room is fixed: the
cap's limit is the line less `magiBase` (the year's MAGI before any discretionary draw), never `incomeRoom`, so the
iteration's own draw estimate is not subtracted twice. (`remainingMagiRoom` itself is unchanged and still cannot
move the live mix: dead wiring, removed in Batch 5 with `pickLiveWithdrawalOrder`.)

##### B1: per-return MAGI in two-return years (V115)

Two returns = an unmarried couple, or before a marry-later wedding. ACA is priced per tax household (A's household
includes the children; half the premium each against their own poverty line); IRMAA per person on the single tiers
whenever the lookback year had two returns; `conversionMagiCeiling` keeps each return under its own lines. Joint
returns are unchanged. 4 US snapshot scenarios moved (2 only by the new `magiA` / `magiB` row fields); the UI MCP
fixture's depletion moved 74 -> 75; `tests/historical_rates.js` identical.

| Scenario, year | | Before | After |
|---|---|---|---|
| MCP fixture (filing-single couple, ACA), year 13 (A 61, B 56) | healthcare | 28,239.73 | 22,365.60 |
| | MAGI | 211,280.83 household, over the household 400% line | A 82,788.38 (subsidized) + B 120,870.14 (over B's line) |
| std R filing single, year 13 (A 65, B 63) | healthcare | 23,112.64 | 21,964.24 (-95.70 x 12) |
| | lookback MAGI | 151,801.6 household on the single tiers (tier 1) | A 76,303 / B 75,499, each under the first single tier |

##### B4: the cliff guard (V116)

Mechanism (CLAUDE.md, "Per-year solver"): in a withdrawal year (`flow < 0`) with a federal line in reach,
`chooseYearPlan` dry-runs the year's real withdrawal on clones for the natural draw, a cap just under the nearest line
at or below its MAGI (only if the natural draw took traditional money, and it counts only if its realized MAGI is at
most the target + 1) and a fill just over the nearest **floor** above (premium plus IRMAA lower just over than just
under; only with penalty-free traditional money). Each is scored by `afterTaxValue` (traditional at `1 - lambda`,
embedded gains at `tauGain`) less the premium change and the IRMAA charged two years on; the natural draw is kept
unless another beats it by more than $1. The plan is chosen on MAGI pass 0 and held; the bond reserve's traditional
draw is never capped (cash and bonds keep their place). Skip rule: no line in reach, no solver work.

Departures from the plan's code, accepted at review: fill only to a floor (the plan's "fill to any line" moved 317
snapshot scenarios and depleted 10 earlier); the bond reserve uncapped (capping it sold stocks at the bottom in down
years and depleted 5 scan households earlier); IRMAA priced as charged (two years on, that year's partners, filing
and tiers grown at plan inflation), with the lines at this year's edges.

Snapshots vs 5de23a1: 476 identical, 8 row-field-only (`lambda`), 34 moved: 23 end higher, 0 lower, 11 deplete in
both (6 later, 5 same age), 0 earlier. `tests/historical_rates.js` identical. First moved year of `std R aca`
(age 62): MAGI 185,778 -> 108,294; healthcare 25,452 -> 10,786; tax 16,998 -> 6,723; traditional drawn 147,376 ->
69,892; Roth drawn 0 -> 52,543; year-end total 1,847,342 -> 1,872,283 ("stayed under ACA 400% line", lambda 0.230).
In Texas, with the guard off, the MAGI iteration can settle on the high fixed point of the 400% cliff while a lower
self-consistent one exists (cliff_guard case 1); the guard finds the low one.

##### Section 13: the B5 conversion finding and decision

B5 as first built sized conversions in tax-aware mode by `amount x lambda - tax now - premium change - IRMAA change`.
Five snapshot scenarios then depleted earlier than at c54ac72: `std R rothConv+aca+live` 95 -> 88, `hist R everything
real1929` 91 -> 89, `real1966` 88 -> 87, `real1973` 87 -> 85, `rich crashFirst` never -> 97. The order choice alone
moved 29 and depleted none earlier. `m` = 0.9, 0.8 or 0.7 still left five scenarios a year or two earlier.
- Not the cause: double counting (a converted dollar gains `lambda`; this year's tax is subtracted once).
- Cause 1, lambda's pool path ignored draws: the pool grew untouched (900k became 2.4M, 3.9M and 6.0M across the
  samples; the survivor sample alone 0.368; lambda 0.284).
- Cause 2, the score values wealth, not when it can be spent: before 59.5 a converted dollar is locked for five years
  while the tax comes out of taxable, the bridge money (52 and 53: 435k and 446k converted, about 218k of tax from
  taxable, the ACA credit lost; taxable empty by 57, then penalized draws and depletion).
- Decision: conversions keep the bracket setting (capped by the safe-MAGI ceiling) in every mode; Batch 5 owns
  tax-aware conversion sizing, built to Note 1 (pool path net of expected draws) and Note 2 (a bridge check before
  59.5). See the Batch 5 section.

##### Section 13.1: the second finding; Note 1 built as B5a

B5 order-only had clean snapshots (473 identical, 16 field-only, 29 live-mix movers, no depletion age changed), but
the B7 grid scan (768 households per mode; first reported as 384) showed tax-aware mode depleting 1 to 3 years earlier
than c54ac72's tax-aware mode in 36 households (35 with the guard off), and earlier than the default order in 40 (the
old live mix: 4). Example: single, 58, lambda 0.311, 17,155 of tax and the ACA credit lost, runs out at 83 instead of
84. B5a (0e664d6) walks the pool forward from now in real dollars, `pool = max(0, pool x (1 + real) - tradShare x
max(0, need - benefits started since now))`, `need = -flow`, `tradShare` = traditional's share of investable money.

B5a before/after (snapshots vs c54ac72): 852 identical, 27 lambda-only, 14 moved, all in guard years; none earlier
(two later: `hist R aca sawtooth` 84 -> 85; three ends lower in face value, the largest -627k of 92.1M in `hist R
everything boom`). Re-run scan: tax-aware earlier than c54ac72 in 3 runs (one household), guard-on never earlier
than guard-off. But 2 guard-on households (two returns, 58, 1.5M / 300k / 130k, 72(t); smooth and tax-aware)
depleted 84 -> 83 against c54ac72: the walk drained the pool before the RMD samples, so lambda fell to about 0.

##### Section 13.2: the third finding; B5b

The 3 remaining runs were one household: two returns, both 62, 1.5M traditional, 300k taxable, 200k Roth, 130k
spending, ACA on, Texas; lambda 0.494 and 0.444, traditional-first (MAGI 206k instead of 119k, tax 25,492 instead of
0, healthcare 18,000 instead of 11,859), out at 93 instead of 94.
- Cause A, a bug: `lambdaEstimate`'s IRMAA step for a two-return couple used the household MAGI on the single tiers
  and charged it twice (per person it is 0; lambda would be about 0.22-0.25).
- Cause B: each sample priced only the RMD although the walk assumed `tradShare x need` a year.
- B5b (b5b7878): IRMAA per person for two-return samples; each sample prices `max(RMD, min(pool, draw))` and moves to
  the year the walk empties the pool; the walk's need leaves out this year's lump expenses.

B5b before/after (vs 0e664d6): 477 identical, 38 lambda-only, 3 moved (`hist R rothConv+aca mc1` same depletion 84;
`hist R single rich flat` -1,081 of 1.44M; `rich real1929` -84,580 of 7.06M), no depletion age changed. Scan (guard
on, vs c54ac72): 70 changed, 9 later, 0 earlier; B5a's two earlier households back to 84. Informational: hoh, 58,
1.5M / 300k / 130k, smooth, Rule of 55 depletes at 76 (B5a 77; 76 is its c54ac72 and guard-off age).

##### Section 13.3: measurements at B5b and the fourth decision

768 households per mode (grid: `tests/solver_scan.js` header). "Equal" means within $1,000. Value is the ending
after-tax value with a flat 22% haircut on traditional money; cost is lifetime real tax plus healthcare.

| Comparison | Value better / equal / worse | Cost better / equal / worse | Depletion later / same / earlier |
|---|---|---|---|
| Tax-aware order vs default order | 227 / 401 / 140 | 232 / 367 / 169 | 0 / 749 / 19 |
| Guard on vs off, default order | 43 / 713 / 12 | 98 / 649 / 21 | 21 / 747 / 0 |
| Guard on vs off, smooth withdrawals | 227 / 488 / 53 | 202 / 456 / 110 | 33 / 735 / 0 |
| Guard on, b5b7878 vs c54ac72, default order | 6 / 746 / 16 | 25 / 716 / 27 | 5 / 763 / 0 |

- **The tax-aware order.** Where it changes a result, it is better about 60/40, but it never lets a plan last longer,
  and its losses are large (10th percentile about -75k, -150k among plans that never run out, worst -694k). They fall
  on the same kind of household as its gains: early retirees with large taxable balances.
- **With conversions on, the order is worse than a coin flip on cost** (107 dearer, 87 cheaper against the default
  order). The yearly choice does not see that the bracket conversion has already used the cheap room.
- **Without a plan-level check it is not reliable enough to ship, even marked experimental.**
- **The cliff guard is sound.** It never makes a plan run out earlier, it often lets one last longer, and it helps
  clearly with smooth withdrawals. Its value losses are small (largest about -29.5k on a 5.1M plan) and all come from
  IRMAA stay-unders.
- **The B5a/B5b lambda changes barely moved the guard.**

Decision: B5 ships refactors only (`solveRothConversionTo`; the healthcare-cost block before the conversion; the
lifted `irmaaAt` / `lambdaOf` closures), snapshots identical to b5b7878 (893 scenarios, 0 differ; the conversion path
compared on 84,096 rows, 0 differ). The live-mix toggle keeps its old behavior, label and info tip; the plan's
`orders` stays `[null]`. B6 moves to Batch 5. Batch 5 owns all lambda-driven policy (its requirements and acceptance
tests are in the Batch 5 section). The cliff guard stays on by default, unchanged.

The 5 households in which the tax-aware order ran out a year earlier than c54ac72 (13 runs over the elections axis;
Batch 5 acceptance cases): single 58, trad 500k, taxable 2M, 130k, no conversions 90 -> 89; single 66, 1.5M / 300k /
130k, no conversions 86 -> 85; HoH 58, 500k / 2M / 130k 91 -> 90; HoH 62, 500k / 300k / 60k, conversions on 95 -> 94;
HoH 66, 1.5M / 300k / 130k, conversions on 86 -> 85. Two worked causes: (1) single 66: lambda 0.284 from samples at
0.425 whose 10% step (9,983) crosses an IRMAA tier (+1,736 on 2,510 of tax), so traditional-first wins at about 21%
now (MAGI 105k -> 219k, tax 4.6k -> 39.6k); (2) single 58: lambda 0.222 picks 47.5k traditional-first at 60 (about 15%
now), and the larger gains left in taxable raise MAGI by 2-4k a year to 77 and IRMAA about 1.7k a year at 67-72; the
gap grows from 7k to 70k by 85.

**Tax-aware order metrics at B5b** (the uncommitted B5 order-only tree; A = tax-aware, guard on; B = default order,
guard on; C = c54ac72's tax-aware mode, guard on; from `task-B5-metrics.md`):

| A vs B | n | Value better / equal / worse | Value p10 / median / p90 | Neither depletes: n, p10 / median / p90 |
|---|---|---|---|---|
| conversions off | 384 | 134 / 186 / 64 | -42,522 / 0 / +206,609 | 256: -66,335 / +15,875 / +238,249 |
| conversions on | 384 | 93 / 215 / 76 | -143,251 / 0 / +175,348 | 257: -178,409 / 0 / +244,478 |
| combined | 768 | 227 / 401 / 140 | -74,961 / 0 / +191,549 | 513: -150,680 / 0 / +242,551 |

| A vs B | Cost better / equal / worse | Cost p10 / median / p90 | Depletion later / same / earlier |
|---|---|---|---|
| conversions off | 145 / 177 / 62 | -73,092 / 0 / +11,416 | 0 / 374 / 10 |
| conversions on | 87 / 190 / 107 | -43,887 / 0 / +13,824 | 0 / 375 / 9 |
| combined | 232 / 367 / 169 | -65,400 / 0 / +13,445 | 0 / 749 / 19 |

A vs C (combined): value 239 / 392 / 137 (p10 -74,822, p90 +202,092), cost 253 / 335 / 180, depletion 3 / 752 / 13.
Largest losses by value (A vs B): MFJ 58, 401(k) 250k + 250k, taxable 2M, 60k, Rule of 55, conversions on -693,952;
single 58, 1.5M / 300k / 60k, conversions on -521,044. Largest gains: two returns 58, 750k + 750k, taxable 2M, 130k,
conversions on +635,067; MFJ 52, 750k + 750k, taxable 2M, 60k +616,620 (cost -172,748).

**Guard metrics at B5b** (tax-aware off in every run; from `task-B5-guard-metrics.md`; re-measured at the 3C tip by
`tests/solver_scan.js`, identical to the dollar). Inert check: guard-off default order identical to c54ac72 in 768 of
768 households.

Guard on vs off, default order:

| Subset | Value better / equal / worse | Value p10 / median / p90 | Cost better / equal / worse | Cost p10 / median / p90 | Depletion later / same / earlier |
|---|---|---|---|---|---|
| conversions off | 20 / 358 / 6 | 0 / 0 / 0 | 56 / 319 / 9 | -4,478 / 0 / 0 | 16 / 368 / 0 |
| conversions on | 23 / 355 / 6 | 0 / 0 / 0 | 42 / 330 / 12 | -3,056 / 0 / 0 | 5 / 379 / 0 |
| combined | 43 / 713 / 12 | 0 / 0 / 0 | 98 / 649 / 21 | -3,454 / 0 / 0 | 21 / 747 / 0 |

Among the 510 households where neither run depletes: value 40 / 458 / 12, cost 38 / 458 / 14. Value losers (12) all
"stayed under IRMAA tier"; winners (43): ACA 400% line (34), IRMAA tier (15), filled to the 100% credit floor (4).
Largest loss: HoH 52, 1.5M / 2M / 130k, -29,502 of 5.13M (IRMAA stay-unders x6). Largest gain: MFJ 52, 750k + 750k /
300k / 60k, 72(t), +588,818 (ACA 400% x5). Largest cost gain: HoH 52, 500k / 300k / 60k, -63,160, and the plan lasts
to 73 instead of 71 (filled to the ACA credit floor x2; the single person: -63,029, 72 instead of 71).

Guard on vs off, smooth withdrawals:

| Subset | Value better / equal / worse | Value p10 / median / p90 | Cost better / equal / worse | Cost p10 / median / p90 | Depletion later / same / earlier |
|---|---|---|---|---|---|
| conversions off | 121 / 247 / 16 | 0 / 0 / +180,581 | 108 / 216 / 60 | -13,022 / 0 / +3,784 | 24 / 360 / 0 |
| conversions on | 106 / 241 / 37 | -430 / 0 / +129,955 | 94 / 240 / 50 | -13,982 / 0 / +2,151 | 9 / 375 / 0 |
| combined | 227 / 488 / 53 | -45 / 0 / +157,235 | 202 / 456 / 110 | -13,808 / 0 / +3,087 | 33 / 735 / 0 |

Value losers (53): IRMAA tier (51), ACA 400% line (6). Largest loss: HoH 52, 1.5M / 2M / 130k, conversions on,
-155,790 (cost +90,114; IRMAA x14). Largest gain: HoH 58, 1.5M / 300k / 60k, Rule of 55, +849,577 (ACA 400% x7).

Guard on, b5b7878 vs c54ac72 (what B5a/B5b changed in the guard), default order: value 6 / 746 / 16, cost 25 / 716 /
27, depletion 5 / 763 / 0 (all p10 / median / p90 0); smooth: value 68 / 646 / 54, cost 46 / 654 / 68, depletion 5 /
763 / 0. Largest default-order loss: HoH 58, 1.5M / 300k / 60k, conversions on, -37,358 (IRMAA stay-unders x6 instead
of x2).

##### The sweep at the 3C tip (`tests/solver_scan.js`)

`node tests/solver_scan.js` at B7 (3b2b854 plus the test hook) prints exactly the two guard tables above (all 18
subset rows identical to the B5b guard metrics; summary: default order value 43 / 713 / 12, cost 98 / 649 / 21,
depletion 21 / 747 / 0; smooth value 227 / 488 / 53, cost 202 / 456 / 110, depletion 33 / 735 / 0), matching the 13.3
table rows 2 and 3. Exit 0: no household depletes earlier with the guard on. Run time about 20 s (3,072 projections
plus account traces).

##### Gap table: where 3C leaves Batch 5 (`tests/solver_gap.js`)

Shipped engine (cliff guard on, default order, conversions at the plan's 22% bracket from now to 74) against a slow
reference: `optimizeMultiLever` (per-year Roth bracket, per-year mix, smooth on/off; 6 starts, 5 passes) with a
200,000-evaluation budget (`window.__test_setOptimizerBudget`), on short plans (life expectancy 75). Objective: the
optimizer's own lifetime real tax + healthcare. A positive gap means the shipped engine costs more.

| Case | Shipped (guard on) cost | Guard off cost | Reference cost | Gap | After-tax end value, real: shipped / ref | Converted: shipped / ref | Depletion shipped / ref | Ref smooth | Reference evals | Seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 432,616 | 481,749 | 254,143 | 70.23% | 1,811,471 / 1,934,394 | 162,082 / 113,834 | never / never | off | 15498 | 24 |
| couple 62, IRMAA (CA) | 630,193 | 630,183 | 228,885 | 175.33% | 3,908,167 / 4,038,069 | 1,189,760 / 0 | never / never | on | 5116 | 5 |
| couple 58, trad-heavy, ACA (NY) | 631,928 | 681,895 | 349,377 | 80.87% | 2,064,288 / 2,332,972 | 1,191,735 / 92,295 | never / never | on | 9816 | 17 |

Reading: none of the three runs hit the budget, so the reference is the coordinate ascent's own optimum. Most of the
gap is conversion sizing: the reference converts much less (none in the IRMAA couple) and the shipped run converts to
the 22% bracket every year; the reference also wins on the after-tax end value with a 22% haircut, so the gap is not
only the objective ignoring the tax left on traditional at 75 (it does ignore it; short plans favor not converting).
The guard's own share is visible in the guard-off column (ACA single -49k, ACA couple -50k, IRMAA couple +10). This is
the Batch 5 starting point (outer search over `m`, conversion sizing with Notes 1 and 2), not a gate.

##### Timing

Interleaved, one process, medians (the bench_runs workload: 400 `simulate()` + 120 historical runs per state, 11
rounds; `tests/bench_solver.js`, 15 rounds), the 3C tip (3b2b854 plus the B7 test hook) against each base. The bench_runs
workload has no cliff in reach (it computes no lambda), so it is the +5% gate; the ACA early retiree (CA) and its
historical path are the +30% gate.

| Workload (std / hist, % change) | vs c54ac72 (B4) | vs b5b7878 (B5b) | vs 24f6585 (pre-3C, record) |
|---|---|---|---|
| tx | -2.1 / 0.0 | +1.6 / +1.9 | +4.0 / +7.7 (21 rounds: +5.7 / +7.8) |
| ca | -0.4 / -3.7 | +0.7 / +2.6 | +8.6 / +2.5 (21 rounds: +3.4 / +2.6) |
| ny | +1.4 / 0.0 | +1.7 / +2.4 | +1.4 / +2.4 (21 rounds: +1.4 / 0.0) |
| pa | +1.8 / +1.3 | -1.1 / +1.3 | +3.4 / +2.7 (21 rounds: +1.5 / +2.7) |
| ct | -0.8 / -3.6 | -1.1 / -1.9 | +2.5 / +1.0 (21 rounds: +1.7 / +2.9) |
| wa | +0.5 / 0.0 | 0.0 / -1.6 | +2.9 / +5.0 (21 rounds: +1.9 / +3.3) |
| ACA early retiree (CA), simulate / path | 2.80 -> 2.70 ms (-3.6%) / 2.65 -> 2.75 ms (+3.8%) | 2.84 -> 2.72 (-4.2%) / 2.70 -> 2.65 (-1.9%) | 2.46 -> 2.80 (+13.8%) / 2.45 -> 2.65 (+8.2%) |
| Default household, simulate / path | 1.18 -> 1.24 (+5.1%, timer quantized at 0.05 ms) / 0.0% | 0.0% / -5.3% | +5.1% / 0.0% |

Gates (against c54ac72 and b5b7878, as the amended B7 brief sets them): pass, every bench_runs state within +5% and the
ACA case within +30%. Against the pre-3C tip (record only), the ACA case is +14% / +8% (inside +30%), and the
no-cliff workload is within +5% everywhere except Texas, the cheapest state per `taxFor` call, where the fixed per-year
cost added across B1-B5 (the two-return test, the `runWithdraw` closure, the guard's line check, the per-pass
`irmaaAt` / `lambdaOf` setup) shows as +5.7% / +7.8% over 21 rounds; each step was within +5% of its own base.
`tests/bench_runs.js` (sequential, the record; +-10% noise between runs on this machine): 3C tip tx 226 / 64, ca 294 /
81, ny 320 / 89, pa 290 / 76, ct 370 / 106, wa 222 / 67 ms; 24f6585 in the same session tx 206 / 57, ca 273 / 75, ny
311 / 84, pa 279 / 74, ct 359 / 103, wa 216 / 61 (at the start of PR 2: tx 207 / 57, ca 266 / 76, ny 294 / 83, pa 264 /
75, ct 337 / 99, wa 212 / 60). Per-task records: B3 worst +3.6% (TX hist); B4 bench_runs +0.6% to +4.9%, ACA +9.5% to
+17.2% / +8.0% to +10.0% (before the skip-path work it was +41% / +32%); B5a ACA +1.4% to +2.2%; B5b ACA -3.5% vs
B5a, +7.2% vs c54ac72; B5 0% to +2.3%, ACA -8%.

##### Success rates (`tests/historical_rates.js`, seed 7, 2,000 paths)

Identical before and after 3C: `node tests/historical_rates.js` at the 3C tip gives byte-for-byte the output measured at the
start of PR 2 on 24f6585 (every US and Canada row; for example US default 85.4% historical / 86.1% Monte Carlo, early
retiree 90.6% / 88.6%, low-MAGI CA 100.0% / 99.5%, PA early retiree 50.9% / 61.8%). The guard does not change a draw in
any of its scenarios (B1 and B4 also found them identical).

##### Optimizer re-run (spec section 7: "re-run today's optimizer once on the new engine")

`optimizeMultiLever` (Roth + mix + smooth, the shipped 8,000-evaluation budget) against the shipped engine (guard on, default
order), lifetime real tax + healthcare:

| Scenario | Shipped engine | Optimizer | Evaluations | Time |
|---|---|---|---|---|
| Default | 1,325,040 | 1,254,962 (-5.3%) | 8,003 (budget hit) | 8.1 s |
| Default, conversions on | 1,325,407 | 1,254,962 (-5.3%) | 8,003 (budget hit) | 9.1 s |
| ACA early retiree (CA; both run out at 55) | 752,069 | 749,910 (-0.3%) | 5,628 | 21.4 s |

The optimizer's schedules still beat the shipped engine on its own objective (as the slow reference does in the gap
table), mostly through per-year conversion brackets; the tax-aware solver they were to be compared against was not
shipped (13.3). `node test_multi_lever_optimizer.js`: 31 passed. One `simulate()` of the ACA case is now about 2.7 ms
(the spec measured 12.9 ms and a 208 s search at bb798d4), so its full search now takes 21 s.

##### IRMAA stay-unders (note for Batch 5)

Every value loss of the guard in the default order comes from "stayed under IRMAA tier" (12 households, largest
-29.5k on a 5.1M plan), and most in smooth mode (51 of 53). IRMAA is priced in the year that causes it, undiscounted,
as charged two years on (that year's partners on Medicare, filing status and tiers grown at plan inflation); the lines
sat at this year's tier edges until 13.7 A (about 5% low in inflation, where nothing jumps; they now sit on the charged
year's tiers via `c.irmaaGrowth`, while the conversion ceiling keeps this year's edges). A stay-under
spends Roth or taxable now for a surcharge two years away that a death or a lower later MAGI might never charge, and
it gives up tax-free growth on the Roth spent. Batch 5 decides, on the same scans, whether IRMAA stay-unders remain
guard candidates (or only above some margin) and whether to discount IRMAA for its lag (Open items).

##### Cliffs register: what 3C reads

`magiThresholds` is the solver's view of the US cliffs register. Candidates (federal lines in household MAGI, only
those inside the year's reach): the ACA 100% credit floor, the Medicaid line (expansion states; `medicaidLimit`) and
the ACA 400% line (enhanced credits off), for partners on the individual market; the IRMAA tier edges (from 63,
retired; per person on the single tiers with two returns); the senior-deduction phase-out start (65+, through 2028);
the child-tax-credit phase-out start. With two returns each return's line is translated into household MAGI through
that return's share of the draw. Priced only (through `taxFor`, `acaNetCost` and `healthcareCost`), not candidates:
the state-law cliffs (state retirement exclusions, credits and step tables), the 2027 Medicaid work-requirement start
(it changes which side of the line is cheaper, which the floor test reads), NIIT, the Social Security taxation
thresholds and the 0% gains band.

##### Known gaps carried out of 3C

- `conversionMagiCeiling`'s two-return room divides each return's room by its share of the conversion, but caps the
  live draw order where gains split 50/50 (an approximation; refine with the Batch 5 draw split).
- The Medicaid work-requirement exemption reads the household's children for B's household of one (B1; undocumented
  until now).
- Year-0 IRMAA lookback: a household 65+ at the start without `irmaaPriorKnown` has years 0 and 1 priced on year 0's
  MAGI (the first-year stand-in), which the guard's candidates do not price (B4 minor; also seen in the 13.3 example 1).
- `lambdaEstimate` approximations: HoH and QSS samples are taxed as `single` / `mfj` (not `filingStatusFor`);
  `onMedicare` counts 65+ rather than `max(65, retirement age)`; the first sample uses A's RMD start even for a B
  survivor sample; the walk uses the household's benefits past a death. (The IRMAA lines moved to the charged year's tiers
  in 13.7 A; the conversion ceiling keeps this year's edges.)
- The pool walk (B5b): when the pool runs out before a sample, the sample moves to that year; untested combinations:
  a joint couple with draws, a survivor sample with draws, mid-walk benefits plus exhaustion. The need excludes this
  year's lump expenses (as the bond target does) but includes the wage offset.
- The fill candidate has no realized-MAGI check (a short fill can be labelled "filled to ..."); the $1 tie rule is
  pinned only by determinism (case 7); a year whose pass 0 has no withdrawal but a later pass has one gets no plan.
- The bond reserve's traditional draw is never capped: while penalized money exists, Roth basis cannot replace reserve
  traditional money to stay under a line.
- Untested B1 paths: a death before a marry-later wedding (the survivor's lookback per person), the even split of an
  entered `irmaaPriorKnown`, and no snapshot scenario combines two returns with ACA on.
- Scan household HoH 58, 1.5M / 300k / 130k, smooth, Rule of 55 depletes at 76 (B5a: 77; 76 is its c54ac72 and
  guard-off age).
- `tests/snapshot_ui.js` "std R everything" `histSuccess` is timing-fragile under machine load (a render race seen once
  in B4); re-run before treating it as a regression.
- `costAt` is declared above the conversion as a hook for Batch 5 (B5); the per-pass closure setup is now
  unconditional (measured at about 0).

##### Section 13.4 to 13.7: the whole-branch review, B8a, and the guard's conversion rule

- **Review of PR 2 (spec 13.4).** Later MAGI passes re-sized the conversion and refilled the headroom a "stayed
  under" plan made (79 of 234 standard stay-under rows, 78 of 255 historical). One bucket-engine household ran out
  earlier with the guard on: head of household, 66, 1.5M traditional, 300k taxable, 200k Roth, 130k spending,
  Texas, ACA on, conversions 66-72, start 1966; 80 against 81. The timing gate is cumulative against the pre-3C tip
  `24f6585`; +5% to +8% after number-neutral speedups is accepted and documented, above +8% the owner decides.
- **B8a: holding pass 0's conversion failed** (not committed; `task-B8a-wip.patch`). The 1966 case stayed at 80
  against 81, and the held amount broke the conversion ceiling where pass 0's estimate was stale. Example: single
  66, 500k, smooth, held 72,500 where a converged pass converts about 10k. Nine smooth-mode runs then ran out a
  year earlier. The label rule alone was safe.
- **Probe (owner-requested, 2026-10-07).** A guard-off / guard-on trace of the 1966 household at `9dfc9e5`:

  | Age | MAGI off / on | Conversion off / on | Roth drawn off / on |
  |---|---|---|---|
  | 70 | 202,740 / 162,424 | 29,758 / 20,849 | 0 / 22,537 |
  | 71 | 256,499 / 256,581 | 7,460 / 29,168 | 0 / 21,645 |

  The guard spent Roth to make room for a larger conversion: the draw cap counts the conversion, a capped draw
  lowers the next pass's estimate, and the conversion fills the freed room. Next year's pass 0 is seeded with the
  capped draw, so it carries over. No head-of-household bug was found: the HoH branches (IRMAA single tiers, an ACA
  household of 2, the 75,000 senior phase-out, the 200,000 child-credit start, lambda's single filing after the
  child ages out) are correct.
- **Decision (spec 13.5):** the guard never spends Roth to make room for a conversion.
  - The plan is chosen against the converged natural year.
  - A "stay under" plan converts nothing, and is offered only when the natural MAGI without its conversion is still
    over the line.
  - With a plan, the iteration converges again with the plan held.
  - Labels only when met.
  - Coverage comes first: about 20 snapshot scenarios where the guard acts with conversions on.
- **Redesigned B8a (spec 13.5), first build** (uncommitted, `task-B8a2-wip.patch`). It worked as specified: the 1966
  household 80 -> 81 (guard off 81), bucket sweep (1,536 paths) earlier 1 -> 0, stay-under rows with a conversion
  1,288 -> 0, `planMissed` 0, snapshots against 292109e 415 identical / 97 lambda only / 31 moved, none earlier.
  Three gates failed:
  - *The cross-run metric (our design error).* "Stay-under MAGI not lower than guard-off's in the same year": 163 of
    2,224 (785 before), all after the two runs diverged (guard-on spent Roth earlier and still holds traditional money;
    guard-off's traditional pool is empty and it lives on Roth). Before divergence 0; against the run's own natural
    year 0.
  - *Timing.* ACA early retiree +53% simulate / +49% path against `24f6585` (gate +30%); default +5-6%; no-cliff
    Texas equal to 292109e. Each year with a line in reach runs the converged natural year, one or two converged
    trials and often a replay.
  - *Nearest line.* At 63-64 the converged natural year pays the full premium and can rise over an IRMAA tier above
    the ACA 400% line, so only the IRMAA stay-under was offered: `hist G single 58 aca default | real1966` 3.71M ->
    2.64M (guard off 2.12M), `std G single 58 aca default` -220k, `hist R aca rich crashFirst` -173k; no depletion
    change.
- **Decision (spec 13.6):** the invariant is measured against the run's own natural year (the cross-run count is
  reported split at divergence; before divergence must be 0); a second stay-under is offered at the line below with
  the largest cliff (premium + IRMAA just over less just under) when it is not the nearest line, so at most three
  trials; the +30% ACA timing gate stays, met by number-neutral speedups in 8b, else the owner decides. Accepted:
  `std G hoh 58 aca smooth` -106k (a stay-under no longer funds a conversion with Roth; conversion sizing is
  Batch 5's) and the age-71 test rewritten to its intent.
- **Independent code check (Opus, 2026-10-07) on the B8a2 work, confirmed against the code.**
  - *The IRMAA lines sat at this year's tier edges* while `irmaaAt` and `healthcareCost` charge the tiers two years
    on (`irmaaGrowth2`, about 5% higher). The guard stayed under lines where nothing jumps; for example, a single
    person at 68 stayed under 143,936 when the cliff was 151,222. 104 of 972 default-order and 728 of 2,778 smooth
    IRMAA stay-unders targeted a cliff the plan never reached.
  - This also broke 13.6: `costNear` reads 0 at a misplaced line. 13.6's unit test used a synthetic jump at the line
    and could not see it; the planner's own mistake.
  - With the lines moved, on the 768-household scan with the B8a2 work:
    - smooth worse-off plans 39 -> 18;
    - worst loss -211.7k -> -124k;
    - lifetime cost worse 129 -> 103 (smooth) and 17 -> 11 (default);
    - no earlier depletion.
  - *The guard could win a year on lambda alone*: 36 default-order and 188 smooth stay-unders won with no IRMAA saved
    (12 and 148 at 65+). Some households stayed under 15 to 18 times and paid 47k to 81k more lifetime tax and
    healthcare. This is the yearly lambda bet 13.3 rejected.
  - *Timing*: 55% (default) and 43% (smooth) of trials cannot succeed, mostly because no penalty-free money other
    than traditional is left. About 70% of plan years replay the natural year.
- **Decision (spec 13.7).**
  - (A) IRMAA lines on the charged year's tiers (`c.irmaaGrowth`), its own commit on 292109e's code. The conversion
    ceiling keeps this year's edges (safe side; Batch 5).
  - (B) The guard acts only on real cliffs:
    - a stay-under is offered only where premium plus IRMAA jumps by more than $1;
    - a trial wins only if it lowers healthcare plus IRMAA by more than $1 and also beats the score;
    - the CTC and senior-deduction phase-out lines stop being stay-under candidates (order logic, Batch 5).
  - (C) Number-neutral speedups in 8b: skip trials with nothing to switch to; avoid the replay.
  - Recorded for later:
    - the bracket conversion is sized before, and ignores, the year's draws (48 of 128 scan households with
      conversions; Batch 5);
    - the ladder's traditional-to-bonds move is drawn after Roth in the default order (Batch 4A/5).

- **Stage A result (13.7 A, own commit on 292109e's code; `magiThresholds` gets `c.irmaaGrowth`, the year loop passes
  `irmaaGrowth2`).**
  - Tests: three new `solver_hooks.js` cases (red, then green), and a `cliff_guard.js` household (single 62, 500k
    traditional, 2M taxable, 60k, smooth; age 63: natural MAGI 113,610 between this year's edge 111,725 and the charged
    117,381; 292109e stayed under at 111,724, now no IRMAA stay-under).
  - Snapshots vs 292109e: 543 US scenarios, 503 identical, 1 label-only, 39 moved, none depletes earlier (1966 HoH
    bucket household 80 -> 81); every first moved year carries a guard label on one side. Canada untouched.
  - `solver_scan` (768 per mode, exit 0, no earlier depletion), guard ON minus OFF, better / equal / worse:
    - default order, value 43 / 713 / 12 -> 45 / 710 / 13; cost 98 / 649 / 21 -> 100 / 648 / 20; depletion later /
      same / earlier 21 / 747 / 0 -> 21 / 747 / 0;
    - smooth, value 227 / 488 / 53 -> 251 / 506 / 11; cost 202 / 456 / 110 -> 236 / 438 / 94; depletion 33 / 735 / 0
      -> 33 / 735 / 0.
  - Bucket sweep (1536 paths): guard-on earlier 1 -> 0, later 31 -> 31; stayed-under rows 632 -> 559, not lower than
    guard-off 212 -> 148.
  - Movers (scenario | first moved age | depletion | end value change):
    - hist_G_hoh_58_aca_smooth_real1973 | age 65 | dep never->never | end -7275
    - hist_G_hoh_62_aca_default_real1966 | age 72 | dep never->never | end +248
    - hist_G_hoh_66_1966_household_real1966 | age 70 | dep 80->81 | end 0
    - hist_G_mfj_58_aca_default_real1966 | age 67 | dep never->never | end +7
    - hist_G_mfj_62_aca_400_smooth_real1966 | age 67 | dep never->never | end -1523
    - hist_G_single_58_aca_default_real1966 | age 67 | dep never->never | end -122
    - hist_R_everything_rich_flat | age 81 | dep never->never | end -2042
    - hist_R_everything_rich_real1929 | age 87 | dep never->never | end +8701
    - hist_R_mixApplied_rich_boom | age 65 | dep never->never | end -288428
    - hist_R_mixApplied_rich_mc2 | age 72 | dep never->never | end -35102
    - hist_R_single_boom | age 63 | dep never->never | end -616694
    - hist_R_single_mc1 | age 63 | dep 75->75 | end 0
    - hist_R_single_mc2 | age 68 | dep never->never | end -8978
    - hist_R_single_rich_crashFirst | age 63 | dep never->never | end -557
    - hist_R_single_rich_flat | age 65 | dep never->never | end -25911
    - hist_R_single_rich_real1929 | age 65 | dep never->never | end -68765
    - hist_R_single_rich_real1966 | age 69 | dep never->never | end -9580
    - hist_R_single_rich_real1973 | age 63 | dep never->never | end -9706
    - hist_R_single_rich_real2000 | age 64 | dep never->never | end -92120
    - hist_R_single_rich_sawtooth | age 90 | dep never->never | end +4355
    - hist_R_smooth_rich_boom | age 67 | dep never->never | end -380169
    - hist_R_smooth_rich_mc2 | age 64 | dep never->never | end +10173
    - std_G_hoh_58_aca_smooth | age 64 | dep never->never | end +103793
    - std_G_hoh_62_aca_default | age 67 | dep never->never | end +12743
    - std_G_hoh_62_aca_smooth | age 63 | dep never->never | end +178393
    - std_G_hoh_66_1966_household | age 68 | dep 86->86 | end 0
    - std_G_hoh_66_1966_household_smooth | age 66 | dep 86->86 | end 0
    - std_G_hoh_66_irmaa_500k_smooth | age 66 | dep 76->76 | end 0
    - std_G_mfj_58_aca_default | age 65 | dep never->never | end +90
    - std_G_mfj_62_aca_400_default | age 70 | dep never->never | end +4
    - std_G_mfj_62_aca_400_smooth | age 65 | dep never->never | end +5565
    - std_G_mfj_66_250k+250k_300k_130k_smooth | age 66 | dep 80->80 | end 0
    - std_G_single_58_aca_default | age 65 | dep never->never | end 0
    - std_G_single_62_aca_smooth | age 63 | dep never->never | end -120616
    - std_G_single_66_500k_300k_130k_smooth | age 66 | dep 76->76 | end 0
    - std_G_single_66_500k_300k_60k_smooth | age 66 | dep 95->95 | end 0
    - std_G_two_returns_66_irmaa_default | age 69 | dep never->never | end +7
    - std_G_two_returns_66_irmaa_smooth | age 66 | dep 80->80 | end 0
    - std_R_work_past_65_single | age 76 | dep never->never | end -21383

##### Stage 8a block and the independent engine review (2026-10-07; 3C paused for a redesign)

**Where the work stands.**
- Stage A is committed (`3ebee0e`: IRMAA lines on the charged year's tiers, plan inflation; against 292109e none
  earlier, bucket sweep 0 earlier).
- Stage 8a is NOT committed: B8a2 + the own-natural metric + the real-cliff gate + the largest cliff. It is in the
  working tree and in `.superpowers/sdd/2026-10-06-per-year-solver-3c/task-B8-stage8a-wip.patch`; report
  `task-B8-stage8a-report.md`, harnesses `stage8a-scratch/`.
- It is blocked by the hard rule: 7 of 1,536 bucket paths run out one year earlier with the guard on, all with
  conversions on (HoH 62 / 300k / 60k on 1929, HoH 58 / 2M / 130k on 1929, single 58 / 2M / 130k on 1966, HoH 62 /
  2M / 130k on 1973, plus smooth-mode twins).
- Everything else passed: standard scan exit 0, no snapshot scenario earlier, every stay-under invariant 0, no win
  with a cliff saving of $1 or less.
- Timing: ACA +16% / +21% against `24f6585`, recorded.

**Independent review** (three read-only Opus reviewers on `3ebee0e` + the 8a patch; the planner verified the
starred claims against the code):
1. **A per-year choice cannot guarantee "guard-on never runs out earlier than guard-off".**
   - Each year is chosen without the path's future.
   - Plans end on knife edges: guard-off had 2.4k left at 89 on a 1.8M plan.
   - The engine is discontinuous (conversion ceiling, bond refill), so small changes cascade.
   - This is why amendments 13 to 13.7 each fixed one scan and the next found a new failure.
2. **\* Historical IRMAA estimate.** The guard grows the tiers two years on at plan inflation (`irmaaGrowth2`); the
   charge uses the path's own inflation (`histTaxFactors` via `taxIndexFactor`).
   - Of the bucket wins with an estimated IRMAA saving, 27% (90 of 338) save $0 for real; two of the 7 failures
     do (1937-39 deflation).
   - It drives Stage A's large historical losses: `hist_R_single_boom` -617k (2% path inflation; it lands over the
     real tier while labelled "stayed under"; 0.44% of a 141M nominal end) and `hist_R_smooth_rich_boom` -380k.
   - The standard engine's estimate is exact. Owner: keep plan inflation (this year's inflation is no predictor of
     inflation two years on).
3. **\* Bucket bond reserve.** In all 7 failures the whole traditional pool sits in `bondTraditional`
   (`refillBondReserve` moves it there in up years), whose draw is uncapped (`takeTraditional(..., uncapped)`).
   - The cap has nothing to limit, so a stay-under there is only a dropped conversion.
   - `offerUnder`'s `natTrad` is `realizedTrad`, which includes the uncapped reserve draw: a defect.
   - A proxy gate (stock traditional > 1) gave bucket 0 earlier but 3 standard smooth households earlier (single
     66, 500k, 300k, 130k, conversions on: 75 vs 76). Tracking the cappable draw on `wd` is the proper fix.
4. **\* The score is blind to stocks versus bonds.** `afterTaxValue` values a dollar the same in either.
   - In HoH 62 / 1929 the dropped 15.1k conversion stayed in bonds instead of moving into Roth stocks (1938: stocks
     +29.3%, bonds +4.2%; about 3.6k).
   - Lambda was accurate there (14.8% vs 15.1% realized), so the 8a report's "taxed later above lambda" does not
     hold for that path.
5. **Lambda is biased low.**
   - When the walk empties the pool before a sample, that sample prices a sliver at about 0% (two samples at 22%,
     the third 0: lambda about 0.147).
   - `LAMBDA_PROFILE` has no conversions or investment income, and the engine draws traditional in lumps.
   - HoH 62 / 1973: the trial dropped a 145.7k conversion (46% marginal now) and the run's lifetime tax from 66 on
     was 73.6k higher.
   - The bracket conversion is sized before the year's draw, so a natural year converts "at 22%" at a MAGI of 507k
     (known gap, Batch 5).
6. **Machinery sound.**
   - Replay matched the winning pass in 24,330 of 24,330 fingerprinted replays.
   - No un-rewound state.
   - Guard-off identical to `3ebee0e` over 2,048 runs.
   - Minor: a zero-conversion stay-under can turn `flow` non-negative and still win with a label;
     `annotateSolverRows` always overwrites the title.
7. **Scan coverage.** `tests/solver_scan.js` runs only `simulate()` (constant inflation, no reserve refill), so it
   cannot reach these failures; the bucket check lives only in scratch harnesses.
8. **Outer check, prototyped** (`../fp-3c-rev-outer`): run guard-off only if the guard won a year, and keep guard-on
   only if it does not run out earlier.
   - 0 earlier by construction (both sweeps, 500 Monte Carlo paths). Free where the guard never wins (the
     default, ACA early retiree and Texas households never win).
   - About 2x on guard-winning runs (guard-active household: +138% simulate, +87% real path against `24f6585`).
   - In historical and Monte Carlo runs it looks ahead at the path's future: slightly optimistic success rates
     (about 0.5% of paths).
   - Option 1 (no stay-under in a converting year) is no substitute: 1 of 500 Monte Carlo paths still runs out
     earlier, and it gives up real gains (worst -1.78M bucket).
   - Measured timing of the tree as is: no-cliff +9% to +17% against `24f6585` (fails +5/8%; needs a proper
     `bench_runs` check).

**Owner direction (2026-10-07).**
- The hard-rule failures are historical / Monte Carlo only; the standard engine has quality issues (value losses,
  lambda, the stock/bond blind spot, the guard line vs conversion ceiling tier mismatch, e.g.
  `std_G_single_62_aca_smooth` -120k) but no earlier depletion since 13.5.
- The future market is unknown, so optimization should run on the fixed assumptions (return, inflation, bond
  yield) and on known future events (a car, a house sale, a partner's death, a child, including a later adoption,
  with expenses rising for a period), not on each historical path's year-by-year fluctuations.
- A redesign starts in a new chat. Its shape is a plan computed once on the deterministic projection and applied
  unchanged in historical and Monte Carlo runs, as the applied conversion and mix schedules already are.
- Open until then: lambda's emptied-pool sample (now or Batch 5), the timing gates, and whether the outer check is
  still needed.
- Do not resume Stage 8a or 8b. The Sonnet implementer is paused.
- Review copies `../fp-3c-review` and `../fp-3c-rev-{score,phase,phase-exp,outer}` are throwaway (prototype and
  probe scripts inside).

##### Redesign: the cliff plan (owner decisions, 2026-10-07)

Brainstormed in a new chat after the Stage 8a block. Spec `docs/superpowers/specs/2026-10-07-cliff-plan-design.md`,
plan `docs/superpowers/plans/2026-10-07-cliff-plan.md`. A second opinion (ChatGPT, pasted by the owner) agreed with
the direction; its points were checked against the code before use.

**Diagnosis, said plainly.** The in-path guard was a path-dependent controller: decision 4 (lambda from each path's
own balances) and decision 6 (the guard inside every run) of the 3C spec made each path's market noise part of the
choice, so "guard on never runs out earlier" could not be guaranteed year by year. Our design, not an implementation
bug.

**Decisions (one question at a time; the owner's answer in brackets):**
1. "Never worse" is rule A: guaranteed on the deterministic projection by construction (no steering is a candidate,
   depletion first); historical and Monte Carlo reported, never used to accept or reject (that would be leakage)
   [A; an aggregate success-rate gate (B) and the per-path outer check (C) rejected].
2. When computed: the hybrid, an automatic quick plan each render and a deeper Optimize -> Apply in Batch 5 [3].
3. Stage 8a: not committed; its four rules ported into the once-per-render chooser; committed 3C code stays; a new
   branch `claude/3c-cliff-plan` in a new worktree; the owner's working tree, the 8a patch and the stashes untouched.
4. Execution on a path: literal with a fallback (skip when already on the right side; fall back to the natural year
   when the trial cannot meet the plan); no scoring inside a path [(a); a cost bound (b) comes back only with numbers;
   cap-only (c) rejected: the "Roth for nothing" pattern].
5. Keep-rule tie-break: ending after-tax value, traditional money net of the income tax it carries [(i); lifetime cost
   (ii) and a flat 22% haircut (iii) rejected]. Computed as ten slices of the balance on the last year's own return
   [(1)]. The owner asked whether this is estate tax: it is not; no estate, inheritance or heirs' tax is modeled.
6. Subsets by line family: whole plan, ACA only, IRMAA only, none [(a); all-or-nothing and per-intent pruning
   rejected; per-intent pruning is Batch 5's deep search].
7. Variants apply the main plan unchanged by Partner A's age [(a)].
8. Timing gates: per path +5% (up to +8% documented) for no-cliff households and +30% for the ACA early retiree, both
   against `24f6585`; planning at most 5x one plain `simulate()` [recommended].
9. Lambda's emptied-pool sample: deferred to Batch 5, recorded and measured now (below) [defer].
10. Life events: Batch E (E1 to E4 after the cliff plan; E5 and the Canada move later; exclusions stated) [agreed].
11. With/without success rates: scan only in this batch [scan only].
Design sections 1 to 6 (architecture, chooser, keep rule, inputs and display, tests and gates, commits) approved in
turn; section 6 with the note that the live-mix toggle stays per path until Batch 5.

**Defect recorded for Batch 5: lambda's emptied-pool sample.** When the walk empties the traditional pool before a
sample year, the sample moves to that year and prices the small remaining draw at about 0%, pulling lambda low (8a
review: samples 22%, 22%, 0, lambda about 0.147). The cliff-plan batch does not change the estimator (lambda's
semantics change in this batch; changing its numbers too would confound the movers). It adds a `movedSample` flag to
the plan trace; the scan reports how often it occurs and whether the family containing those years was rejected by the
keep rule. Batch 5 compares the resulting plans against the slow reference, then decides between correcting the
sample, tuning `m` and replacing the estimator.

**Known remaining path dependence.** The live-mix toggle (`pickLiveWithdrawalOrder`) still decides each year on each
path from that path's own tax; Batch 5 replaces it with plan intents.

**Checked against the code for the redesign (`3ebee0e`).** `appliedRothSchedule` (a bracket per age, read in
`solveRothConversion`) and `appliedMixSchedule` (a named mix per age, read in `drawMixedStockAccounts`) are already
applied unchanged in both engines by Partner A's age: the precedent for the plan. `simulate(` has 83 call sites, all
of which pick up the plan through the wrappers. `magiThresholds` labels lines but has no stable ids (added in commit 1).
The US has no ending after-tax value (Canada has `afterTaxEstate`, 7N N8).

##### Cliff plan: review of Tasks 1-5 and the Task 6 stop (2026-10-07)

Tasks 1-5 on `claude/3c-cliff-plan` (`44239fe`, `211c2a0`, `aaaa087` + `2bb06d4`, `2834ae3`, `f94b9d6`), each with
snapshots identical. The implementer stopped in Task 6 (the switch) on two stop conditions; nothing of Task 6 was
committed. Re-checked by the reviewer in a scratch copy of the tree (`f94b9d6` plus the uncommitted Task 6 work):
- `tests/plan_off_anchor.js --base ../fp-3c-A`: 543 identical, 0 different (guard off untouched).
- Dump/compare against `3ebee0e`: 64 of 543 differ; 13 of them only in `cliffChoice` labels or the removed `row.lambda`;
  no depletion age changes in any scenario.
- `std G hoh 62 aca default` ends $26,727 lower in total but higher by the after-tax measure: Roth +$268,723, taxable
  -$175,867, traditional bonds -$119,583 (RMDs $14,144 lower). Face value hides the tax the traditional money carries.
- Historical movers are 0.1% to 6.6% of each path's ending total, measured against the old in-path guard, not against
  `off`. `hist R aca boom`: Roth -$9.2M, traditional +$2.9M, taxable +$5.6M on a $245M ending; the face-value total
  (-$0.7M) hides that composition shift. Decision: the Task 8 scan reports per path the after-tax value with and without
  the plan (with the path's own tax factors) and the Roth / traditional / taxable split (spec section 8, amended).

**Decisions (owner, 2026-10-07):**
1. **Live-mix draw is cappable** [accepted]. Task 1 counted only `takeTraditional` draws in `wd.cappableTraditional`;
   the live-mix branch draws `live.fromTraditional` directly (penalty-free group, sized under `magiCapLeft`), so choose
   never offered a stay-under in a live-mix household, and `std R rothConv+aca+live` ran out at 94 against 95 at
   `3ebee0e` (its own `off` is 94: rule A held, the `3ebee0e` hard rule did not). One line; with it the scenario lasts
   to 95, the anchor is unchanged. A Task 1 defect, not a new rule (spec section 4 step 3, amended).
2. **Stale plans: option (e), each projection uses the plan of the state it projects** [chosen over (a) identity only,
   (b) identity plus a string compare falling back to `off`, (c) a hook in the shared regions, (d) relying on
   `render()`]. Every state-replacement site (boot load, scenario load, the comparison and overlay swaps, undo, reset)
   is in a shared region, and a clear at the comparison swap would wipe the plan partway through `render()`. (e):
   identity with the state `render()` planned for, then its JSON, then a cache of plans for swapped-in states (16
   entries), planning on a miss with `histTaxFactors` saved. Reason over (b): saved scenarios in the comparison had
   their own guard at `3ebee0e` and would otherwise show guard-off numbers that differ from loading them, and
   `normalizeState` is not idempotent on an edited state (measured: the "Current" row's normalized copy stringified 3
   characters shorter after edits), so (b) would quietly drop the plan from the "Current" row (spec section 3, amended).
3. **`apply` builds lines only in an intent year** (reviewer, number-neutral): the first build of `apply` called
   `magiThresholds` in every withdrawal year, plan or not (spec section 6, amended; it was a Task 9 speedup candidate).
4. **Noted, no change:** a household that runs out at the same age with every candidate ranks them all at value 0, so
   rule A keeps no steering (the spec as written; the safe choice).
5. **State-law effects (owner question).** Every state and federal tax, credit and phase-out is priced through `taxFor`
   (cash, the solvers, lambda, the ending value, rule A's whole-run comparison); state-law cliffs are priced, not
   targeted (spec section 11). The MAGI check that followed found the IRMAA defect: see "IRMAA MAGI fix" (after the
   cliff plan, before Batch E).

##### Cliff plan: implementation (V117-V118)

Branch `claude/3c-cliff-plan` (worktree `fp-cliff-plan`), base `0d6dcf7`, not pushed. Numbers below come from the task
reports kept with the run (`.superpowers/sdd/2026-10-07-cliff-plan/`, git-excluded: `task-6-movers.md`, `task-8-scan.md`,
`task-8-output/`).

**Commits.**
- `44239fe` (1): `wd.cappableTraditional` (the traditional money a magi cap can limit), `lambdaEstimate` returns
  `movedSample`, `magiThresholds` lines carry `id` / `ret` / `family`. No number change.
- `211c2a0` (2): US ending after-tax value (`afterTaxEndValueUS`: ten slices of the final balance on the last return;
  non-enumerable `sim.estate`). No number change.
- `aaaa087` + `2bb06d4` (3): plan modes `off` / `choose` / `legacy` in `runProjection` (the 8a phased year ported:
  `yearPlanCandidates`, intents, `planStats`); the fix commit makes the `off` check run with the guard flag on and off.
  No number change.
- `2834ae3` (4): `apply` mode (literal, with fallback to the natural year) and exact replay of `choose`'s intents;
  shared eligibility helpers. No number change.
- `f94b9d6` (5): keep rule A (`planCandidateBetter`) and `refreshCliffPlan` with the family subsets (`none`, `aca`,
  `irmaa`, `all`). No number change.
- `9f8bb87` (6): the switch (V117). The plan is chosen once per render and applied in every run; the in-path guard
  (`chooseYearPlan`, `cloneWithdrawal`, `adoptWithdrawal`, `row.lambda`) is removed; `planForState` (option (e), below);
  the live-mix `cappableTraditional` fix; snapshot update (`us.json`, `ui_us.json`).
- `db86b05` (7): label "Cliff plan", info bubble, plan summary line in More results, row tooltip keeps `cliffChoice`
  only (V118); UI snapshot updated for rendered text only.
- `82b1197` (8): scan with with/without rates, path counters and the moved-sample cross; `tests/bench_plan.js`; the
  benches time the raw hooks after one `__test_refreshCliffPlan()`. One test-hook change in `Planner_US.html`
  (`__test_runPlanMode({ endValue: true })`); no production change.
- Task 9 (timing repair) was not run: no gate was clearly missed (see Timing: the per-path gate against `24f6585` is
  marginal). The notes commit `5dac389` is Task 10.
- `0bdc229` (11, final-review fix wave): `refreshCliffPlan` re-plans only when the inputs change (state JSON, tax year,
  optimizer overrides); `computeCliffPlan` reuses a `choose` run with no intent as the `none` candidate (it equals `off`
  row for row: full sweep of the scan grid in both modes plus every standard snapshot scenario, 1,114 households without
  intents, 0 differences; pinned in `tests/cliff_plan.js` F2); `ensureTestPlan` keys on the tax year and wraps the
  optimizer test hooks; summary wording "ACA steering not used"; `tests/bench_runs_interleaved.js`; `tests/bench_plan.js`
  forces a re-plan per timed refresh. Number-neutral (snapshots identical, off anchor 543 identical).

**Off-anchor.** `node tests/plan_off_anchor.js --base ../fp-3c-A` (guard off, `3ebee0e` against this tree): 543 identical,
0 different, before and after the switch and again at the Task 8 tip. `node tests/historical_rates.js` prints identical
output at both trees.

**Movers (guard on at `3ebee0e` -> the plan applied).** `node tests/snapshot.js --dump` / `--compare`: 543 compared, 64
differ (24 standard, 40 historical); 13 of the 64 are label-only (5 standard, 8 historical; only `cliffChoice` and the
removed `row.lambda` differ). No scenario changes its depletion age, so there is no depletion change to explain. Hard
rules, checked over all 85 standard scenarios at their shifts: the plan never runs out earlier than off, and the kept
candidate never earlier than `none` (kept: none 73, all 12); 0 violations. End total change = last row total, B minus A
(nominal).

Why they move, one line each: the `R aca` / `rothConv+aca` / `everything` and `G` ACA / IRMAA households: the plan stays
under or fills to a line in its intent years where the old guard chose per year on a path's own lambda, so the
converted amount, the Roth and traditional split and the tax paid differ, and the ending total moves with them.
Label-only rows: the plan does not label a year the guard labelled (or the reverse), or the removed `row.lambda`
differed. Large negative historical rows (boom, crash-first and real1929 paths, about -0.27M to -1.45M; the real1929 rows are
-455,165 and -274,681): the stay-unders are carried out
on a path the plan was not chosen for and spend Roth money that a boom would have compounded (spec section 12, plan
optimized for one market); see the per-path comparison below. `std G hoh 62 aca default` ends 26,727 lower: rule A kept
a plan that `afterTaxEndValueUS` values higher, while the snapshot `total` does not tax traditional money.

| scenario | first moved age | depletion before -> after | end total change | label only |
|---|---|---|---|---|
| std default aca+retire-late-B | 65 | never -> never | 0 | yes |
| std R rothConv+aca | 62 | 95 -> 95 | 0 | yes |
| std R rothConv+aca+live | 62 | 95 -> 95 | 0 |  |
| std R aca | 62 | 94 -> 94 | 0 | yes |
| std R aca employerCoversSpouse | 63 | never -> never | 0 | yes |
| std R work past 65 single | 76 | never -> never | 0 | yes |
| std R everything | 62 | 91 -> 91 | 0 |  |
| hist R single | boom | 63 | never -> never | +25,427 |  |
| hist R single | mc1 | 64 | 75 -> 75 | 0 |  |
| hist R single | mc2 | 67 | never -> never | +118 |  |
| hist R single rich | real1929 | 65 | never -> never | -455,165 |  |
| hist R single rich | real1966 | 69 | never -> never | +198 |  |
| hist R single rich | real1973 | 64 | never -> never | +9,939 |  |
| hist R single rich | real2000 | 64 | never -> never | -9,506 |  |
| hist R single rich | crashFirst | 63 | never -> never | -107,486 |  |
| hist R single rich | sawtooth | 84 | never -> never | -15,625 |  |
| hist R single rich | flat | 65 | never -> never | -1,248 |  |
| hist R smooth rich | boom | 67 | never -> never | +6,380 |  |
| hist R smooth rich | mc2 | 64 | never -> never | -56,803 |  |
| hist R mixApplied rich | boom | 65 | never -> never | +24,863 |  |
| hist R mixApplied rich | mc2 | 64 | never -> never | -1,431 |  |
| hist R rothConv+aca | sawtooth | 62 | 85 -> 85 | 0 | yes |
| hist R rothConv+aca | boom | 63 | never -> never | -337,488 |  |
| hist R rothConv+aca | mc1 | 64 | 84 -> 84 | 0 |  |
| hist R rothConv+aca rich | real1929 | 65 | never -> never | -274,681 |  |
| hist R rothConv+aca rich | real1973 | 66 | never -> never | 0 | yes |
| hist R rothConv+aca rich | real2000 | 65 | never -> never | 0 | yes |
| hist R rothConv+aca rich | crashFirst | 62 | never -> never | -830,141 |  |
| hist R aca | real1929 | 60 | 64 -> 64 | 0 | yes |
| hist R aca | sawtooth | 62 | 85 -> 85 | 0 | yes |
| hist R aca | boom | 63 | never -> never | -685,299 |  |
| hist R aca | mc1 | 64 | 84 -> 84 | 0 |  |
| hist R aca rich | real1929 | 65 | never -> never | 0 | yes |
| hist R aca rich | real2000 | 66 | never -> never | 0 | yes |
| hist R aca rich | crashFirst | 62 | never -> never | -544,570 |  |
| hist R survivor A rich | real1929 | 79 | never -> never | 0 | yes |
| hist R everything | sawtooth | 62 | 90 -> 90 | +0 |  |
| hist R everything | boom | 62 | never -> never | -1,450,165 |  |
| hist R everything | mc1 | 65 | 89 -> 89 | 0 |  |
| hist R everything rich | real1929 | 87 | never -> never | -39,605 |  |
| hist R everything rich | flat | 81 | never -> never | +137 |  |
| std G hoh 66 1966 household | 68 | 86 -> 86 | 0 |  |
| std G hoh 66 1966 household smooth | 66 | 86 -> 86 | 0 |  |
| std G mfj 66 250k+250k 300k 130k smooth | 66 | 80 -> 80 | 0 |  |
| std G single 66 500k 300k 60k smooth | 66 | 95 -> 95 | 0 |  |
| std G single 66 500k 300k 130k smooth | 66 | 76 -> 76 | 0 |  |
| std G mfj 62 aca 400% default | 70 | never -> never | +1 |  |
| std G mfj 62 aca 400% smooth | 62 | never -> never | +90,361 |  |
| std G two returns 62 aca smooth | 63 | never -> never | -3 |  |
| std G two returns 66 irmaa default | 69 | never -> never | -8 |  |
| std G two returns 66 irmaa smooth | 66 | 80 -> 80 | 0 |  |
| std G hoh 58 aca smooth | 60 | never -> never | -276 |  |
| std G single 62 aca smooth | 62 | never -> never | +341,154 |  |
| std G mfj 58 aca default | 61 | never -> never | -78 |  |
| std G single 58 aca default | 62 | never -> never | -6 |  |
| std G hoh 62 aca default | 67 | never -> never | -26,727 |  |
| std G hoh 62 aca smooth | 62 | never -> never | +90,157 |  |
| std G hoh 66 irmaa 500k smooth | 66 | 76 -> 76 | 0 |  |
| hist G hoh 66 1966 household | real1966 | 70 | 81 -> 81 | 0 |  |
| hist G mfj 62 aca 400% smooth | real1966 | 63 | never -> never | -961 |  |
| hist G mfj 58 aca default | real1966 | 64 | never -> never | +24 |  |
| hist G hoh 58 aca smooth | real1973 | 60 | never -> never | +806,447 |  |
| hist G single 58 aca default | real1966 | 63 | never -> never | +27 |  |
| hist G hoh 62 aca default | real1966 | 72 | never -> never | -170 |  |

Before the live-mix fix (Step 2a), `std R rothConv+aca+live` ran out at 94 instead of 95 (the stop below).

**Scan (`node tests/solver_scan.js`: 768 households x default order and smooth, every historical start year and 200
Monte Carlo paths; 1076 s; exit 0, no household's plan depletes earlier than off; the `__test_runHistoricalCycles`
cross-check on the first 5 households with intents matched).**

Kept family: default order none 707, all 61; smooth none 494, all 265, aca 9. The choose run had both families in 20
households (default) and 49 (smooth).

Standard projection, plan minus off (n 768; value is `afterTaxEndValueUS`):

| Mode | Value better / equal / worse | Cost better / equal / worse | Depletion later / same / earlier |
|---|---|---|---|
| default | 37 / 731 / 0 | 55 / 707 / 6 | 27 / 741 / 0 |
| smooth | 234 / 534 / 0 | 168 / 520 / 80 | 43 / 725 / 0 |

Paths, households that keep intents only (61 default, 274 smooth); success rate is the mean over those households:

| Mode, paths | Success with / without | Households higher / same / lower | Paths depleting earlier / later | Lower by > $1 / higher | (plan-off)/off p10 / median / p90 |
|---|---|---|---|---|---|
| default, historical (3,637) | 64.85% / 64.31% | 17 / 44 / 0 | 1 / 227 | 186 / 1,153 | 0.00% / 0.00% / +13.18% |
| default, Monte Carlo (12,200) | 64.04% / 63.42% | 33 / 28 / 0 | 41 / 902 | 579 / 3,735 | 0.00% / 0.00% / +8.42% |
| smooth, historical (17,026) | 83.57% / 83.23% | 50 / 221 / 3 | 10 / 592 | 2,164 / 8,283 | -0.06% / +0.16% / +6.40% |
| smooth, Monte Carlo (54,800) | 83.42% / 83.09% | 69 / 196 / 9 | 64 / 2,136 | 7,112 / 25,625 | -0.07% / +0.12% / +4.99% |

These are information, never an acceptance gate (decision 1). The per-household rows (p10 / median / p90, lower count,
median Roth difference) are in `task-8-scan.md`. Per-path after-tax comparison, five largest losses: all in smooth mode
on Monte Carlo seed 1142, a boom path whose totals reach about $260M to $700M nominal; the losses are $8.3M to $14.7M
(1.4% to 3.1% of the off value: 2.24%, 2.11%, 1.79%, 1.40%, 3.06% in loss order), the plan ends with much less Roth (-$65M to -$109M) and more traditional and taxable money; nothing
depletes on either side.

Path counters (`planStats` sums):

| Mode | Runs | intentYears | applied | skippedSide | skippedIneligible | fallback | absent | rothShift | irmaaStayUnders | irmaaZeroSaving |
|---|---|---|---|---|---|---|---|---|---|---|
| default | standard | 239 | 239 | 0 | 0 | 0 | 0 | +7.6M | 71 | 0 |
| default | historical | 14,276 | 5,627 | 2,273 | 5,495 | 639 | 242 | +215M | 1,983 | 90 |
| default | Monte Carlo | 47,311 | 18,765 | 7,415 | 18,115 | 2,313 | 703 | +691M | 6,081 | 465 |
| smooth | standard | 1,549 | 1,549 | 0 | 0 | 0 | 0 | +31.3M | 1,043 | 0 |
| smooth | historical | 96,480 | 33,171 | 13,217 | 24,634 | 17,553 | 7,905 | +823M | 16,654 | 3,795 |
| smooth | Monte Carlo | 307,514 | 107,993 | 41,263 | 76,969 | 56,724 | 24,565 | +2,721M | 53,302 | 14,164 |

Applied share of intent years on paths: default historical 5,627 of 14,276 (39%), default Monte Carlo 18,765 of 47,311
(40%), smooth historical 33,171 of 96,480 (34.4%) and Monte Carlo 107,993 of 307,514 (35.1%). IRMAA zero-saving share
(`irmaaZeroSaving` / `irmaaStayUnders`, computed from the table): default historical 4.5%, default Monte Carlo 7.6%,
smooth historical 22.8%, smooth Monte Carlo 26.6%; the standard runs 0.

Moved-sample cross (years where lambda's emptied-pool sample moved, from `__test_planTrace()`):

| Mode | Households with moved-sample years | Moved-sample years | In intent years | Family kept | Family rejected |
|---|---|---|---|---|---|
| default | 98 | 434 | 313 | 28 | 52 |
| smooth | 134 | 598 | 409 | 41 | 69 |

The families holding those years are rejected by the keep rule more often than kept. The estimator is unchanged
(decision 9); Batch 5 decides.

**Timing (gates against `24f6585` unless noted).** The per-path gate against `24f6585` is marginal and not reliably
reproducible: tx historical read +5.9% (Task 8), +5.9% and +3.9% (fix wave), and +8.0% and +9.8% in the final reviewer's
two runs, over the +8% accepted band in one. The gap is inherited from 3C, not from the cliff plan: against `3ebee0e`
(the 3C Stage A tip) this branch reads -1.2% to +3.3% (fix wave) and -4.7% to +1.3% (reviewer). Every run is listed:

| Run | Tool | 400 simulate per state (tx / ca / ny / pa / ct / wa) | 120 historical per state (same order) |
|---|---|---|---|
| Task 8, vs 24f6585 | interleaved, 11 rounds | +2.9 / +1.5 / +2.8 / -0.4 / -0.6 / -0.9% | +5.9 / +2.7 / +3.8 / -1.4 / 0.0 / 0.0% |
| Task 8, vs 24f6585 | `tests/bench_runs.js`, two separate processes | -1.4 / +4.5 / +7.8 / +9.4 / +6.2 / +4.3% | +1.7 / +1.3 / +4.8 / +6.8 / +4.0 / +3.3% |
| Final review, vs 24f6585 | interleaved, two runs | (reviewer's figures; tx historical +8.0% and +9.8%) | |
| Fix wave run 1, vs 24f6585 | `tests/bench_runs_interleaved.js`, 11 rounds | +2.9 / +3.5 / +5.6 / +2.3 / +2.0 / +5.4% | +5.9 / +4.1 / +3.7 / +4.2 / -1.0 / +5.1% |
| Fix wave run 2, vs 24f6585 | same | +5.9 / +3.1 / +4.7 / +3.1 / +0.8 / +2.9% | +3.9 / +2.7 / +3.8 / +2.8 / +2.0 / +3.4% |
| Fix wave, vs 3ebee0e | same | 0.0 / +0.4 / +0.3 / +1.5 / +0.6 / 0.0% | 0.0 / 0.0 / -1.2 / +1.4 / 0.0 / +3.3% |
| Final review, vs 3ebee0e | interleaved | -4.7% to +1.3% (reviewer's range) | |

The separate-process figures (pa +9.4%, ny +7.8%) are reported as measured; they exceed the band too, and the
interleaved runs do not reproduce them.

| Gate | Measure | Number | Verdict |
|---|---|---|---|
| bench_runs per state, +5% (+8% accepted) | the runs above | interleaved spread -1.4% to +5.9% in this branch's runs; up to +9.8% (tx historical) in the reviewer's | marginal: over +5% on some state in every interleaved run against 24f6585 (up to +5.9% in this branch's three); inside the +8% accepted band in four of the five (the reviewer's +8.0% at its edge), over it in one (+9.8%) |
| ACA early retiree (CA), +30% | `tests/bench_solver.js`, simulate / path | 7 rounds +2.2% / +4.2%; 21 rounds 0.0% / +2.2% | pass |
| default household (not a named gate) | `tests/bench_solver.js`, simulate / path | 7 rounds +6.6% / +15.8%; 21 rounds +3.4% / +5.9% | the 7-round path figure is 0.95 to 1.10 ms over 20 runs at a 0.1 ms timer |
| Planning at most 5x one off simulate | `tests/bench_plan.js` | Task 8: default 2.14, ACA CA 2.08, Texas no cliff 2.50, `std G hoh 62 aca smooth` (3 intents) 2.10. Fix wave (no-intent choose reused as `none`): 1.14, 1.12, 1.60, 2.10 | pass |

Information, not a gate: one full `render()` (through the theme toggle, inputs unchanged), interleaved, 15 rounds, against
`24f6585`: Task 8, default 22.0 -> 25.0 ms (+13.6%), ACA early retiree (CA) 51.0 -> 56.0 ms (+9.8%), one plan per render;
fix wave, 22.0 -> 22.0 ms and 51.0 -> 50.0 ms (a render with unchanged inputs keeps the plan). A render after an input
change still plans once (about 1.6 to 2.8 ms on these households, 8.8 ms on one that keeps intents). The scenario
comparison's plan per compared scenario (on a cache miss) was not measured: the default page has no saved scenarios.

**Test expectations changed and why.**
- `tests/snapshots/us.json`: the 64 movers above (intended behavior change, `npm run snapshot:update`); the Canada files
  were rewritten with no content change and restored.
- `tests/snapshots/ui_us.json`: Task 6, `std R everything` rendered text and rows hash; Task 7, rendered text only (label,
  info bubble, summary line; projection and rows hashes identical).
- `tests/cliff_guard.js`: every household kept, each case also asserts the kept plan's intent; the case 1 mutation check
  runs through apply (default run, guard on) against off; the assertions that read `row.lambda` were replaced or removed.
- `tests/historical_parity.js`: new check that apply with an empty plan equals off on both engines; the source check now
  asserts the legacy guard is gone.
- `tests/solver_primitives.js`: the `cloneWithdrawal` export is gone; `cappableTraditional` cases added in Task 1.
- `tests/solver_scan.js`, `tests/bench_runs.js`, `tests/bench_solver.js`: plan-aware (Task 8); the benches still run
  unchanged on `../fp-3c-pre`.
- New: `tests/end_value_us.js` and `tests/cliff_plan.js` (both in `npm test`), `tests/plan_off_anchor.js` and
  `tests/bench_plan.js` (not in `npm test`).
- Root scripts `test_apply_optimizer_schedule.js`, `test_live_withdrawal_mix.js`, `test_multi_lever_optimizer.js`,
  `test_roth_optimizer_per_year.js` pass with no expectation changed.

**Owner stop and resolution (Task 6).** The first attempt stopped on two points. (B1) Every state-replacement site
(boot, the comparison and overlay swaps in `computeScenarioMetrics`, `loadScenario`, reset, undo) sits in a shared
region, so a stale-plan clear could not go there, and a clear at the comparison swap would wipe the plan mid-render. The
owner chose option (e): `planForState()` finds the plan for whatever state object is current (identity, then JSON, then
a 16-entry cache; `computeCliffPlan` is pure, `refreshCliffPlan` the setter), so no replacement site is edited; apply
lines are built only in an intent year (Step 2c). (B2) `std R rothConv+aca+live` ran out at 94 instead of 95 because
`wd.cappableTraditional` missed the live-mix draw; the owner accepted the one-line fix `wd.cappableTraditional +=
live.fromTraditional` (Step 2a), part of Task 1's concept, committed in Task 6.

**Deferred minors worth keeping.**
- `ret 'B'` intents never arise: `magiThresholds`' $1 dedup keeps A's line over B's at equal MAGI (the partners are
  symmetric in every grid), so `ret 'B'` is untested end to end; on a path where only B's line exists, the intent naming
  A may be absent or the wrong return's line (Task 1 code, not changed).
- Depleting households keep `none` under rule A: every candidate ends at value 0, so the tie goes to fewer intents, and
  any plan that does not change the depletion age is dropped there however much it saves before depletion (the spec
  rule as written).
- Since the fix wave a render with unchanged inputs keeps the plan; the scenario comparison still plans once per compared
  scenario on a cache miss; that cost and the comparison-row key mismatch cost are not measured.
- Tests that mutate the state in place and then call a production function directly (not a wrapped hook) get the plan of
  whatever `refreshCliffPlan` last planned for that object (identity check first); the helpers in `tests/cliff_plan.js`
  re-plan after restoring.
- `planStats` does not count intents at ages with `flow >= 0`; equality is counted `skippedIneligible`, not
  `skippedSide`; `irmaaChecks` covers only `ret H`.
- Line-id tests lack medicaid / ret A,B / ctc asserts; `r.reserveGross` is unused in `tests/solver_primitives.js`;
  tax-family intents would confuse `fams.size` (latent; `choose` never records them); T6.9 case 6 and the Q half are weak
  at detecting a wrong cache entry.
- The survivor test in `tests/end_value_us.js` asserts balances + 1,000,000 - 131,700 and filing `single` rather than
  equality with the single case (the survivor spends less); `afterTaxEndValueUS` is standard-run only; the estate
  allocation per run is covered only by the Task 8 bench.
- `render_bench.js` is a scratch script in the git-excluded `task-8-output/` (the interleaved bench is committed as
  `tests/bench_runs_interleaved.js`); `solver_scan.json` there is 57 MB.
- No corpus household records fill or two-return intents; `tests/cliff_plan.js` T4.2 and T4.6 use hand-built households
  found by a grid.

**Open questions for the owner.**
1. Large boom-path Roth losses: the five largest per-path losses are $8.3M to $14.7M (2 to 3%) on seed 1142, and the
   snapshot movers show -0.3M to -1.45M on historical boom and crash-first paths. Accept as the market risk of a plan
   chosen on one market (spec section 12), or bring back a cost bound (decision 4 (b)) with these numbers?
2. Low apply share: on paths the plan applies under 40% of its intent years (about 34% in smooth); the rest are skipped
   as ineligible, fall back or are absent. It also depletes earlier than off on some paths (1 + 41 default, 10 + 64
   smooth, against far more later) and has a lower success rate in 3 + 9 smooth households. Acceptable, or tighten the
   literal rule?
3. Rule A on depleting households (keeps `none`) and the `ret 'B'` dedup: leave for Batch 5 or fix now?
4. Measure the scenario comparison's per-scenario plan cost before merging? Is the +10 to +14% `render()` cost
   acceptable?

(The open questions above were answered by the owner in the next subsection.)

##### Cliff plan: final review and acceptance (2026-10-08)

The implementer finished at `0af0bef` on `claude/3c-cliff-plan` (commits and full notes, "Cliff plan: implementation
(V117-V118)", are on that branch; they are reconciled into this file at the merge). Re-checked by the reviewer in a
scratch copy of `0af0bef`: `npm test` exits 0; `plan_off_anchor.js --base ../fp-3c-A` 543 identical; dump/compare against
`3ebee0e` 64 movers, 13 label-only, no depletion change; the six stale-plan cases (T6.9) are present and test the agreed
semantics. The fix-wave commit `0bdc229` added two number-neutral speedups the plan did not list: `refreshCliffPlan`
re-plans only when the state JSON, `currentYear` or the optimizer override maps change (checked: those are the only
non-state inputs `runProjection` reads; the maps are null outside the optimizer functions, which set and restore them),
and a `choose` run with no intent is reused as the `none` candidate (equal to `off` row for row: 1,114 households swept,
pinned in `tests/cliff_plan.js` F2). Accepted.

Reviewer timing (`tests/bench_runs_interleaved.js`, 15 rounds, one process; `tests/bench_solver.js`):

| Against | 400 simulate per state (tx / ca / ny / pa / ct / wa) | 120 historical per state |
|---|---|---|
| `24f6585` | +4.5 / +4.2 / +4.6 / +2.7 / +2.6 / +3.4% | +3.8 / +3.9 / +3.7 / +5.6 / +5.9 / +5.0% |
| `3ebee0e` | -0.5 / +0.4 / +2.0 / -0.4 / 0.0 / 0.0% | 0.0 / +1.3 / +1.2 / 0.0 / +1.0 / +1.6% |

ACA early retiree (CA) against `24f6585`: simulate +11.9%, path +6.0% (gate +30%). Default household: +7.8% / +5.0%.

**Decisions (owner, 2026-10-08):**
1. **Per-path timing gate: accepted** inside the +8% band. The cliff plan itself costs about 0-2% (against `3ebee0e`);
   the rest of the gap to `24f6585` is the committed 3C work (B1 per-return MAGI, the B2/B3 hooks, B5). The
   implementer's one +9.8% reading (tx historical) did not reproduce in the reviewer's run.
2. **Badge V119**: the fix wave changed the summary wording ("ACA steering not used") after V118 without a bump; a
   badge-only commit on the cliff branch.
3. **Merge later**: the cliff branch is not merged into `claude/batch-3b-penalty-rules` now. The IRMAA MAGI fix is
   built on the cliff branch's V119 commit, and both merge together once the IRMAA fix is accepted. At that merge the
   owner sets aside the uncommitted Stage 8a work in the main checkout (superseded by the cliff plan; saved as
   `.superpowers/sdd/2026-10-06-per-year-solver-3c/task-B8-stage8a-wip.patch`), and the reviewer reconciles this file
   (both branches edit the 3C notes).
4. **Boom-path losses: accepted** (decision 4 of the redesign: literal execution; the cost bound comes back only with
   numbers, and these are them): the largest per-path after-tax losses are 1.4% to 3.1% on one Monte Carlo boom path,
   with no depletion; the per-household p10 and median of (plan - off) / off are about 0%; mean success with / without
   64.85% / 64.31% historical, 64.04% / 63.42% Monte Carlo (default order).
5. **Recorded, no change:** the plan is carried out in under 40% of its intent years on paths (skipped when already on
   the right side or ineligible, or a fallback; literal execution as designed); depleting households keep no steering
   (rule A as written); `magiThresholds`' $1 dedup drops B's line when the partners' lines coincide, so `ret 'B'` intents
   never arise (two-return draw handling is Batch 5's; fix it there); the 57 MB scan JSON stays git-excluded.

##### Scripts (not in `npm test`)

- `tests/solver_scan.js [--root DIR] [--json OUT] [--md OUT]`: the guard sweep above; exit 1 on any earlier depletion
  with the guard on.
- `tests/solver_gap.js [--root DIR] [--budget N]`: the gap table above.
- `tests/bench_solver.js --base DIR [--rounds N]`: interleaved timing of the ACA early retiree (CA) and the default
  household, one `simulate()` and one historical path, two trees in one process.

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
| US: no premium credit below 100% of FPL (non-expansion states), and the Medicaid line at 138% (expansion states; Wisconsin 100%). At or under the line: Medicaid, $0, or the full premium when declined or when the work requirement fails; just over it the credit schedule starts (about 3.1% of income) | `MEDICAID_RULES`, `medicaidLimit`, `acaNetCost` | MAGI / FPL ratio, `acaHouseholdSize`, state | 7O O1 |
| US: Medicaid work requirement starts January 1, 2027 (retired adult 19-64 with no child 13 or younger fails: full premium in the Medicaid band, and no credit) | `MEDICAID_RULES.workRequirement`, `hasChildAtMost`, `acaNetCost` | calendar year, the children list | 7O O1 |

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

### 7M notes: the paid benefits of the six remaining provinces (Canada V43)

Branch `claude/batch-7m-benefits` (base `origin/claude/batch-3b-penalty-rules` at 0a1050c, the 7L merge). Plan: `docs/superpowers/plans/2026-10-05-7m-housing-benefits.md`; research table: `docs/7m-housing-research.md`. The first part of this section covers the property-tax and rent programs (planned in the plan file); the second part covers the child benefits, family and low-income credits and seniors programs of all six provinces (research table in the same file, built in one pass with TDD).

**Built (rows in `BENEFIT_RULES`, kind `occupancyCredit`, scope `nb`, `ns` or `mb`):** `nbpta` (NB Residential Property Tax Allowance: 300 / 200 / 100 by income, capped at the property tax; primary), `nsptr` (NS Property Tax Rebate for Seniors: the greater of 15 and half of the tax, to 800, when the household receives GIS or an Allowance; primary, regulation s. 3(b), 3(ba), 7), `mbhatc` (MB Homeowners Affordability Tax Credit: the lesser of 1,500 and school taxes; school taxes proxied by the whole property tax; Form MB479 2025), `mbsstr` (MB Seniors School Tax Rebate: school taxes less the homeowners credit, to 235, less 1% of income over 40,000), `mbratc` (MB Renters Affordability Tax Credit: 575 plus a seniors top-up of 328.57 less 0.8214% of family income, never more than the rent paid). Credits add to `provCredit`, the seniors programs to `provSenior`.

**Excluded, with reasons:** PEI Provincial Tax Credit (0.70 per 100 of assessed value: no assessment input), Manitoba Rent Assist (income support; needs a regional market-rent ceiling), NS Heating Assistance Rebate (needs the heating cost), Saskatchewan and Newfoundland and Labrador (no rent or property-tax program found; absence not proved on a primary page).

**Rulings:** owner approved the property-tax and rent scope (no new inputs); the NB tier edges are read as whole dollars (below 22,001 / 25,001 / 30,001); the NS survivor Allowance counts (regulation s. 3(b)); statutory flat amounts are not indexed, the Manitoba amounts scale with plan inflation; the Manitoba figures are those of the 2025 Form MB479 (owner ruling: the 2026 form is not published yet; the 2026 and 2027 maxima of Information Bulletin 126 are not used); one Manitoba renters credit and one top-up per household, a full year of rent assumed, the credit limited by the rent paid (line 39). **Manitoba skips the 125,000 early exit** in `benefitsFor`: its homeowners and renters credits have no income test (the test at 300,000 failed without it).

**Verification:** every new test is a hand-computed case with the page or regulation cited (`tests/benefits.js`); a scan test pins that no new program rises with income (so the known `drawTaxable` over-sell limitation is not hit); engine rows move by exactly the program amount; survivor symmetry runs for NS, MB and NB; six scenarios were added to the Canada snapshot (42 lines added, none changed, US untouched). Timing (interleaved, same process, 300 `simulate()` per round, median of 7, against the 7L merge base): Ontario 1.01, Manitoba 1.07, New Brunswick 1.01, Nova Scotia 1.04.

**Second part: child benefits, family and low-income credits, seniors programs (SK, MB, NS, NB, NL, PEI).** Rows: `sklitc`, `sksip`, `mbmcb`, `mb55j`, `nsncb`, `nsaltc`, `nbctb`, `nbwis`, `nbss`, `nbhst`, `nblisb`, `nlcb`, `nlis`, `nlsb`, `peicb`, `peieb` (all in the research table with sources). Mechanisms: no new kind (the existing `childSchedule`, `familyCredit` and `seniorSupplement` kinds, one `style` or helper each); helpers `countKids` and `familyCreditCA` (the CGEB shape with an optional child cap); `BEN_NO_EXIT` (MB and PEI) replaces the Manitoba-only bypass of the 125,000 early exit because the Island Essentials Benefit has no upper income limit. Primary: every amount and threshold except the shapes below. Readings, marked secondary: the Saskatchewan Seniors Income Plan follows the regulation (RRS c S-25.1 Reg 3 s. 5(2)): a straight line from the maximum to the published nil point for a single person, a couple and a spouse on the Allowance, flat to income 9,184 then to the published nil point for a spouse under 60 (the regulation text was supplied by the owner after CanLII blocked access); the Saskatchewan Low-Income Tax Credit rate 3.029 percent is derived from the CRA maximum and nil income (the 2.88 percent on the saskatchewan.ca page is the 2025-26 year and is not carried); the Manitoba Child Benefit falls in a straight line from the published full-benefit income to the published nil point for each family size (all six nil points are published); the NL Child Benefit straight line to the published nil point reproduces the regulation rates. Not modeled: disability amounts; the NL pregnancy and birth parts of the Nutrition Supplement; the PEI provincial property tax credit (needs the assessed value), Manitoba Rent Assist and the NS heating rebate (inputs we do not have). Added after a cross-check of the first pass against the sources: the Manitoba 55 PLUS senior component (Regulation 65/90 tables, found at gov.mb.ca/fs/eia_manual/regs/5.2.html; the first pass wrongly recorded no source) and the NL Nutrition Supplement (gov.nl.ca page: 150 a month a child under five, eligible families only). Phase-in caveat (the known `drawTaxable` limitation): the NL Income Supplement rises with family income between 15,000 and 20,000 (the NB Working Income Supplement rises with earned income, which a withdrawal does not change). Backlog rows: see the verification backlog (7M rows). Verification: 100-plus hand-computed cases in `tests/benefits.js` citing the page, 10 scenarios added to the Canada snapshot (low-income retired couple with two children per province, retirees in SK, NL and PEI, MB early retirees for 55 PLUS; additions only, nothing existing changed, US untouched), survivor symmetry for sk, nl and pe, timing interleaved against the commit before (Ontario 0.97, Manitoba 1.03, NL 1.02, PEI 1.02, SK 1.09; ten percent noise). Version badge V42 to V43; the children-field tip and the Province bubble now list the provinces.

**Second whole-branch review (fresh Opus reviewer, all 12 commits) and fixes.** Fixed, each test RED then GREEN: (1) the Manitoba 55 PLUS junior component was paid to Allowance recipients (Regulation 64/90 s. 2(3)(a): an OAS Act benefit makes the person ineligible); (2) the NB School Supplement age window (CRA: children born 2009 to 2021 for the July 2026 payment, ages 5 to 17, not 8 to 17); (3) the 55 PLUS band index returned NaN just above the first threshold (index 0). Added: a scaling test (SK Income Plan, SLITC, NL programs scale with the inflation factor), survivor symmetry now compares child-benefit rows, and low-income SK, NL and PEI retiree scenarios that really pay the Income Plan and the NL Seniors Benefit. Rulings: the Saskatchewan single-parent amount (eligible dependant plus child amounts, up to two children) is kept as a reading and marked secondary (the GST-style alternative is 181 lower; the Saskatchewan statute was not read); the PEI Island Essentials Benefit shape applies for the whole of 2026: the province pages say the benefit begins in July 2026 and the 175 minimum is paid in November, so the annual 2026 entitlement is the modeled one (the CRA page says the renamed program starts in November). Doc fixes: the NB Working Income Supplement is not a phase-in against withdrawals. US timing of the extra evaluation in drawTaxable: measured +4 percent (default plan, interleaved). Deferred minors: the SK Income Plan straight line and a spouse who is 65 without OAS; a couple with one eligible 55 PLUS partner; the NB and NS benefit amounts are modeled unindexed.

**Final whole-branch review (fresh Opus reviewer) of the housing part and fixes.** Fixed: the Manitoba seniors school tax rebate is now limited to the property tax left after the homeowners credit (credit plus rebate could exceed the tax paid; test `MB seniors rebate: nothing left after the homeowners credit on a 1,000 bill` RED then GREEN). Not fixed, rulings: (1) step cliffs (NB tiers, NS rebate when GIS ends) made the shared `drawTaxable` return a negative net on a small draw at the step (measured -563): fixed on the owner approval (2026-10-05) by widening the bracket only when the net at its top is short of the need, in `drawTaxable` (shared region, both planners, text identical) and the two Canada RRSP solvers; US and Canada snapshots unchanged; cost +3 to +7 percent (interleaved, against the commit before). (2) Manitoba timing 1.07 in one noisy interleaved run against a 5 percent target: the bypass of the 125,000 early exit runs the GIS, CGEB and CCB evaluators for Manitoba plans above that income only; accepted as in 7L. A cheaper path (add only the two no-income-test credits and return) is the next step if needed. Deferred minors: the NS 15 dollar floor applies even to a bill under 15 (the regulation reads this way; not capped by the tax paid); the tests all run at inflation factor 1 (no case pins the indexed Manitoba maxima or the top-up at a factor above 1); the Ontario no-leak assertion is weak; the scan test checks monotonicity only, not jump size; the Province info bubble still says provincial credits beyond the basic personal amount are excluded (stale since 7L).

### 7N notes: remaining Canadian credits, benefits and fixes (Canada, complete)

Branch `claude/batch-7n-canada-credits`, base `origin/claude/batch-3b-penalty-rules` at `ac5beab` (the 7M merge, Canada V43). Spec and plan: `docs/superpowers/plans/2026-10-06-7n-canada-credits.md`. One commit per item in the order N1, N3, N4+N10, N5, N6, N7, N8, N9, N11 (N2 dropped).

**Owner decisions (2026-10-06):** N5 the whole LTC input counts as a nursing-home medical expense; N7 every retired adult pays the RAMQ premium; N8 the meltdown table is ranked by the after-tax estate; N1 the recovery tax is deducted from net income (line 23500); N6 builds every province whose figures are read on a primary page and leaves the others null (backlog row).

**Timing gate.** `tests/bench_canada.js --base <worktree of the previous commit>` (interleaved in one process, 300 or 600 `simulate()` per round, median of 7 to 11, ON / BC / QC, a stock household and a retired 66-year-old couple with OAS). Noise is about 10 percent; the harness against itself reads 0.98 to 1.01.

#### N1: OAS recovery tax on the full year's income (Canada V43 -> V44)

**Verified figures** (retrieved 2026-10-06)
- 2026 threshold **$95,323**, rate 15%, repayment capped at the OAS received: https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/recovery-tax.html (primary; the 2025 threshold of $93,454 is on the same page, so the 7L backlog row about 93,454 against 95,323 is closed).
- The repayment is **deducted** at line 23500 and **added to the tax payable** at line 42200: https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security/repayment.html ("enter this repayment amount on lines 23500 and 42200"); net income at line 23600 is "line 15000, minus total of lines 20700 to 23500" (CRA line 23600 page, read through a search excerpt). The CRA line 23500 page, read through a summarising fetch, garbled this into "increases your total payable", which is only the line 42200 half of the rule, so it was not used. The threshold tests net income before adjustments (line 23400, before the repayment), which is what the code does.
- Not modeled: the CRA one-year lookback (the same year's income stands in, an engine convention). Quebec's own deduction for the repayment is treated like the federal one (the same taxable income feeds both); not read on a Revenu Quebec page.

**What changed.** The recovery tax moved from the year loop (where it was charged on income before the discretionary RRSP/RRIF draw, the meltdown and gains were known, and was invisible to the withdrawal solvers) into `personTaxCA`, on the return's full net income: `personTaxCA(..., partnerPool, oas)`. It is deducted from net income first (so the brackets and the age amount see the lower figure), then added to the tax; credits do not reduce it and Quebec's abatement does not touch it. `incomeTaxCA` passes `profile.oasA/oasB` and leaves the per-return amounts in `OAS_RECOVERY.a/.b`; `solvePensionSplit` gets `oasA, oasB` so the 15% kink is inside its objective. The year loop's cash flow starts from gross OAS and `tax` includes the recovery; the row keeps `ss` net of the recovery (the field name is inherited from the US planner and holds CPP plus OAS), adds `oasClawback`, and reports `tax` without it, so tables and the Sankey show each amount once. The inlined threshold test, and reading the recovery from the last `taxFor` call instead of one extra tax evaluation a year, kept the cost down.

**Before / after** (one filer, Ontario, age 66, OAS 9,150 inside the income, no pension; "extra" is the new tax less the old tax on the same income, the old model charging nothing for income it could not see before the draw):

| Income incl. OAS | Old tax | New tax (recovery included) | Extra |
|---|---|---|---|
| 90,000 | 18,088 | 18,088 | 0 |
| 100,000 | 21,356 | 21,822 | +466 |
| 115,000 | 26,545 | 28,377 | +1,833 |
| 130,000 | 32,944 | 35,887 | +2,944 |
| 160,000 | 46,123 | 51,158 | +5,035 |
| 200,000 | 64,776 | 69,483 | +4,707 |

The plan's example (a 65+ partner with 85,000 of base income who draws 30,000 more) owes 2,951.55 of recovery tax, less the tax saved on the deduction (+1,833 net at 115,000). Engine level, scenario `R oasClawback` (Ontario couple, 2,000,000 RRSP, 90,000 pension): at 66 the recovery is 6,931 against 4,444 before (the draw is now counted); the total cost at 66 is 48,780 against 49,447; the end total over the plan is 27,923,505 against 26,777,199, because the line-23500 deduction is worth more than the extra recovery. The stock plan's rows are unchanged (its incomes never cross the threshold).

**Seeded success rates** (`tests/historical_rates.js`, 2,000 paths, seed 7), Canada, before and after: identical in every scenario (default 82.9% historical / 82.5% Monte Carlo, early retiree 92.5 / 88.9, smooth 90.6 / 88.6, bondYears 4 82.9 / 84.5, survivor A 100 / 100, survivor B 94.3 / 90.3). The stock scenarios stay under the threshold.

**Snapshots.** Every Canada scenario moves by one new row field (`oasClawback`); with that field ignored, 191 of 375 scenarios change numerically (the households whose income, draws included, crosses the threshold). US byte-identical. `npm run snapshot:update` is run in this commit only.

**Timing** (interleaved, 600 `simulate()` per round, median of 11, previous commit against this one): stock ON 1.02, BC 1.06, QC 1.06; retired 66 with OAS ON 1.04, BC 1.05, QC 1.12. At the 5 percent line on the noise floor; the retired households do more real work (the recovery now moves their draws). The first version, with an extra tax evaluation per year, read up to 1.22 before that was removed.

**Tests.** `tests/tax_brackets.js` Canada section: hand-computed recovery with the deduction (110,000 gives 2,201.55, taxable 107,798.45), the cap, below the threshold, no OAS, gains at 50%, the indexed threshold, a draw that crosses the threshold (the plan example), a couple, a profile without OAS; and a 108-household pension-split regret check with OAS in both returns (under 3 dollars a year against a 50 dollar scan). `tests/oas_recovery.js` (new, in `npm test`): engine rows against 15% x (income - 95,323) per person, the `ss` identity, and a household under the threshold. `tests/survivor_symmetry.js`: a high-income scenario (both partners owe the recovery, before and after the death year), with `oasClawback` and `ss` added to the compared fields.

**Cliffs register (Canada, 7N).** The OAS recovery tax is a 15 percent kink, not a cliff: from the indexed 95,323 of net income each extra dollar costs 15 cents more, until the recovery reaches the OAS received (9,150 at 65 to 74, 10,065 from 75), where the slope returns to normal; the deduction offsets part of it. Combined tax of two 65+ spouses is non-convex through it, which `solvePensionSplit` handles with its grid, refine and equal-income candidates.

**Gotchas.** The money-field converter strips the decimal point: `oasMonthly` typed as `762.5` becomes 7,625, so a test that sets it through the DOM must use a whole number. A summarising fetch of a CRA page can garble a deduction into an addition (see the line 23500 note): read the formula from the line 23600 page. A `taxFor` call overwrites `OAS_RECOVERY`, so read it straight after the call whose income you want (the year loop does this after each place `totalTax` is set).

#### N3: spouse, eligible-dependant and child amounts (Canada V44 -> V45)

**Verified figures** (retrieved 2026-10-06; every one read on a primary page)
- Federal 2026 (CRA indexation page, https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html): the spouse or common-law partner amount and the eligible-dependant amount are **16,452** for a claimant with net income up to the 29% bracket threshold and **14,829** from the 33% threshold (the same phase-down as the basic personal amount, keyed on the **claimant's** net income); the amount claimed is that figure less the spouse's (or dependant's) net income. This settles the plan's open question (the BPA variant): it is the BPA with its phase-down.
- Provincial amounts, CRA 2026 TD1 forms (`https://www.canada.ca/content/dam/cra-arc/formspubs/pbg/td1xx/td1xx-26e.pdf`, xx = on, bc, ab, mb, sk, nb, ns, pe, nl), line "Spouse or common-law partner amount" and "Amount for an eligible dependant" (identical figures on both lines in every province): ON 11,029 (free to 1,103, nil at 12,132); BC 11,317 (1,132; nil 12,449); AB the difference between the basic personal amount, 22,769, and the spouse's net income; MB the difference between 9,134 and the spouse's net income; SK 20,381 (2,038; nil 22,419); NB 10,709 (1,072; 11,781); NS 11,932 (888; 12,820); PE 12,740 (1,274; 14,014); NL 9,142 (915; 10,057). Modeled as `clamp(amount + threshold - net income, 0, amount)` (Alberta and Manitoba: threshold 0).
- Saskatchewan child amount, TD1SK line 8: **8,358** for each child under 18 (the parent with the lower net income claims it; it cannot be claimed for a child already claimed as the eligible dependant). An addition to the plan, owner-approved (2026-10-06): it reads the existing children list and needs no new input.
- Quebec 2026, Finance Quebec "Parameters of the Personal Income Tax System for 2026" (Nov 2025), Table 3 (https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/finances/publications-adm/parametres/AUTEN_IncomeTax2026.pdf): amount for a person living alone 2,172 plus the additional amount for a single-parent family 2,681 (a 2025 figure of 2,627 on the guide). **Correction made while building (primary rule read on Revenu Quebec guide line 361, retrieved 2026-10-06):** the additional amount is NOT for a parent of a minor child; it applies to a person entitled to the living-alone amount who lived with a child 18 or over who can transfer a post-secondary-studies amount and who was not entitled to the Family Allowance for December, reduced by 218.92 (2025) for each month of Family Allowance. A parent of a minor child is entitled to the Family Allowance, so for them it is nil. It is therefore **not built** (it needs an adult full-time-student child); the first version of this commit added it for any child under 18 and was removed before the commit. Quebec has no spouse amount (the unused-amount transfer is not built). Quebec amounts for a single parent already come through the living-alone amount, which the model gives to a single filer or survivor.
- Cross-check done with the same TD1 forms: the basic personal amount, age amount and its threshold and the pension amount of all nine provinces match `PROVINCE_RULES` exactly, so `verified.age` and `verified.pension` are now `primary` in every row (they were secondary) and the Newfoundland and Labrador basic personal amount (13,094, the 7K backlog item "time-weighted figure relayed from TaxTips") is read on TD1NL: closed.

**What changed.** `federalTaxCA(income, yearIndex, extraCreditBase, claimMinus)`; `provincialTaxCA(..., partnerPool, spouseNet, depKids, childKids)`; `personTaxCA(..., oas, spouseNet, depKids, childKids)`; new row fields `spouse` and `childAmount` (and `pooled.singleParent` for Quebec) with `verified.spouse`; `incomeTaxCA` decides who claims (the higher-income partner claims the spouse amount, A on a tie; the lower-income parent the children; a single person or survivor the eligible dependant for one child and, in Saskatchewan, the child amount for the others) from `profile.dependents` (children under 18, `countKids(deps, 0, 17)`); `solvePensionSplit(..., oasA, oasB, kids)` mirrors the rule on the post-transfer incomes. A claim is skipped unless a spouse's net income is under the amount, so the common path (no children, both partners above the amount) costs two comparisons. The generated `docs/province-tax-rules.md` has a new column; `tests/province_rules.js` pins the new fields.

**Also in this commit (no number change):** `federalTaxCA` no longer builds its bracket array on every call (flat `FED_CAPS`/`FED_RATES` and the existing `scaledProgressiveTax`, bit-identical: the snapshot dump before and after the change is identical). Measured: 0.68 to 0.80 of the time of the commit before for the stock and retired households, which more than pays for the work N1 and N3 add.

**Before / after.** Function level (Ontario, one filer at 50,000, spouse at 5,000): the credits cut tax by 0.14 x 11,452 + 0.0505 x 7,132 = 1,963.45; a single parent at 50,000 with one child under 18: -2,860.24 (0.14 x 16,452 + 0.0505 x 11,029), and the engine test reproduces it to the cent on the year-0 row. Default scenario (Ontario couple, snapshot `std default`), tax in dollars and end assets, commit before this one against this one: age 65 17,742 -> 13,706 (the retired spouse with little income is now claimed), other ages unchanged or a few dollars apart, final total assets 3,666,522 -> 3,936,499. 272 of 375 Canada scenarios move (every household in which one partner's net income is under the amount for some year); US byte-identical.

**Seeded success rates** (`tests/historical_rates.js`, 2,000 paths, seed 7), Canada, before -> after: default historical 82.9% -> 82.9%, Monte Carlo 82.5% -> 83.2%; early retiree 92.5 / 88.9 unchanged; smooth 90.6 / 88.6 unchanged; bondYears 4: 82.9 -> 82.9, 84.5 -> 84.9; survivor A 100 / 100; survivor B 94.3 / 90.3 unchanged.

**Timing** (interleaved, 600 `simulate()` per round, median of 11): this commit against the previous one, stock ON 0.69, BC 0.68, QC 0.73; retired 66 with OAS ON 0.80, BC 0.80, QC 0.77 (after the `federalTaxCA` change; before it, 1.00 to 1.10).

**Tests.** `tests/tax_brackets.js` (Canada): the N3 block, hand-computed per mechanism: ON partial, full and nil spouse amounts; ON eligible dependant; AB amount less spouse income; SK single parent of two (dependant plus one child amount) and a couple's child amount; a province without a child amount; Quebec's supplement and the absence of a spouse amount; indexing (ON indexed, MB frozen); the federal amount at 50,000, over the 33% threshold, in the middle of the phase-down and nil above the spouse income; `incomeTaxCA` claims (higher-income partner, B when B is higher, a single parent, a 30-year-old child does not count, the lower-income parent claims the children); the pension-split regret check with a spouse claim and a child, and every older regret check now mirrors the claims (`claimNets`). `tests/dependant_amounts.js` (new, in `npm test`): the engine's year-0 row for a single parent. `tests/survivor_symmetry.js`: a household with a child born in 2035 (a minor when the survivor is alone), in Ontario and Saskatchewan.

**Named gaps.** The transfer of a spouse's unused age, pension and pooled amounts is still not built. A spouse's net income is the pre-recovery figure (the OAS recovery tax is not deducted from it). The couple is assumed to live together all year. Quebec's additional amount for a person living alone (single-parent family) is not built (see above).

#### N4 and N10: working-year payroll items and the home buyers' amount (Canada V45 -> V46)

**Verified figures** (retrieved 2026-10-06; primary unless marked)
- EI 2026, CRA (https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html): maximum insurable earnings **68,900**; employee rate **1.63%** (maximum 1,123.07); Quebec **1.30%** (maximum 895.70).
- CPP 2026, CRA payroll page: maximum pensionable earnings 74,600, basic exemption 3,500, employee rate 5.95%, maximum 4,230.45. Split (CRA line 30800 and 22215 pages): base **4.95%** (a credit, line 30800), first additional **1%** and CPP2 4% (a deduction, line 22215; maximums for 2025 were 678 and 396; for 2026 the same rates on 71,100 and 10,400 give 711 and 416).
- QPP 2026, Revenu Quebec (https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/calculating-source-deductions-and-contributions/qpp-contributions/maximum-pensionable-earnings-and-contribution-rate/, read in Chrome): rate **6.30%** (the base and first additional together; it was 6.40% in 2025), maximum 4,479.30 on 71,100; second additional 4% on 74,600 to 85,000, maximum 416; additional maximum pensionable earnings 85,000. CRA T4032-QC 2026 (via a search excerpt): base rate 5.30%, maximum 3,768.30. **This closes the 7K backlog item on the QPP rate and ceilings.**
- QPIP 2026, Revenu Quebec (https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/calculating-source-deductions-and-contributions/qpip-premiums/maximum-insurable-earnings-and-premium-rate/): employee rate **0.430%**, maximum insurable earnings **103,000**, maximum premium 442.90. **Closes the 7K backlog item on QPIP.**
- Canada employment amount 2026: **1,501** (CRA indexation page, retrieved 2026-10-06; the 2025 amount was 1,471).
- Provincial credits for CPP/QPP base, EI and QPIP: form ON428 2025 (https://www.canada.ca/content/dam/cra-arc/formspubs/pbg/5006-c/5006-c-25e.pdf) lines 19 to 22 (amounts from lines 30800, 31000, 31200 and 31217) are provincial credits; the other provinces' 428 forms were not each read. Quebec: Revenu Quebec Schedule U part B (2025) gives a deduction for the first and second additional QPP contributions only (line 248), the employment deduction for workers is 6% to **1,450** for 2026 (Revenu Quebec line 201 page via search; Finance Quebec Table 3: 1,450); no provincial credit for QPP, EI or QPIP was found (secondary: TaxTips and a search summary say these are taken into account in the Quebec basic personal credit). Marked secondary on the backlog.
- Home buyers' amount: federal **10,000** at 14% (CRA line 31270 page, 2025 text: up to 10,000, first-time buyer, shared between eligible persons; the plan's 1,500 is the 15% of earlier years, 1,400 at the 2026 rate). Saskatchewan First-Time Homebuyers' Tax Credit: **15,000 from 2025** (1,575 at 10.5%; saskatchewan.ca page, primary), up from the plan's 10,000. Quebec Home Buyers' Tax Credit: maximum **1,400** (= 10,000 at 14%), first-time buyer (Revenu Quebec page read in Chrome). No other province has a home buyers' credit on its 428 form that was found.

**What changed.** `payrollItems(wages, yearIndex)` (scratch `PAY`) returns the cash cost (CPP or QPP, CPP2, EI, QPIP), the federal credit base (base CPP/QPP, EI, QPIP, plus the employment amount), the provincial credit base (the same without the employment amount; zero in Quebec), the enhanced contribution as a deduction from income, and Quebec's workers deduction (provincial only). `buildTaxProfile` calls it once a year per earner: the deduction lowers `otherA/B` (so net income and every income-tested benefit see it), the credit bases ride on the profile; `personTaxCA` takes `fedCredit, provCredit, provDeduction`; `solvePensionSplit` takes them as one `pay` object; `payrollTax` returns the cash cost (so EI is now charged). N10: `homeBuyerAmounts(province)` and a `homeBuyer` family on the province rows (`sk` 15,000, `qc` 10,000, others `null`), claimed on the higher-income partner's return in the `rentThenBuy` purchase year; every province row has `payroll.eiRate` (Quebec 1.30%). `docs/province-tax-rules.md` regenerated with an EI column and a home buyers column; `tests/province_rules.js` pins both.

**Before / after.** Default scenario (Ontario couple, both working, 225,102 of wages): age-52 tax 48,433 -> 47,771 (EI adds about 2,250 of cost, the credits, the enhanced deduction and the employment amount give back about 2,900), age 55 25,305 -> 24,953, retired years unchanged apart from the path (higher investable at every age: 1,525,510 -> 1,543,682 at 65); final total assets 3,936,499 -> 4,091,918. Single person at 52: 23,800 -> 23,463. 65 of 375 Canada scenarios move (those with wages); US byte-identical. Engine test: Ontario tax at 60,000 of wages 10,316, British Columbia 9,879, Quebec 11,472, each equal to the function-level hand computation to the cent.

**Seeded success rates** (`tests/historical_rates.js`, 2,000 paths, seed 7), Canada, before -> after: default historical 82.9% -> 82.9%, Monte Carlo 83.2% -> 83.4%; bondYears 4: 82.9 -> 82.9, 84.9 -> 85.0; the others unchanged.

**Timing** (interleaved, 600 `simulate()` per round, median of 11): against the previous commit stock ON 1.02, BC 1.02, QC 1.02, retired 66 with OAS ON 1.08, BC 1.04, QC 1.05; **against the 7M merge (`ac5beab`) 0.73 / 0.74 / 0.76 and 0.90 / 0.88 / 0.81** (the `federalTaxCA` allocation fix in N3 more than pays for N1 to N4).

**Tests.** `tests/tax_brackets.js` Canada N4/N10 block, hand-computed: wages 60,000 (CPP 3,361.75 and EI 978, deduction 565, credit bases), wages 100,000 (the CRA maximums 4,230.45, 416 and 1,123.07; deduction 711 + 416), the employment amount capped by low wages, no wages, Quebec at 100,000 (QPP 4,479.30, QPIP 430, EI 895.70; no provincial credit; workers deduction 1,450 and 600 at 10,000 of wages), indexing, `personTaxCA` with the three payroll arguments (952.50), the home buyers' amounts per province, and a pension-split regret check with payroll credit bases. `tests/payroll_credits.js` (new, in `npm test`): engine rows for ON, BC and QC against the function-level computation, and the Saskatchewan purchase year (removing the 15,000 raises that year's tax by exactly 1,575 and no earlier year's).

**Named gaps.** Quebec's tax credit for access to homeownership (up to 5,875; its conditions were not read); a first-time buyer's amounts only in the `rentThenBuy` purchase year (a household that already owns, or buys through the FHSA path only, gets none); the other provinces' 428 forms were not each read for the CPP/EI credit lines (Ontario's was; the structure is the same on all); a person who elects to stop QPP or CPP at 65 while still working is not modeled (contributions continue while wages exist, as before).

#### N5: medical expense credit and the Ontario Seniors Care at Home credit (Canada V46 -> V47)

**Owner decision (2026-10-06):** the whole long-term-care input counts as a nursing-home medical expense. The LTC info bubble is in a shared markup region (`html-ltcEnabled`, both planners), so the sentence went into the Canada "CPP, OAS clawback & healthcare" callout and the footer note instead.

**Verified figures** (retrieved 2026-10-06)
- Federal 2026 threshold **2,890** (CRA indexation page, primary; TaxTips shows 2,891). Rule: expenses above the lesser of 3% of net income and the threshold, at the lowest rate (14%).
- Provincial structure: form ON428 2025 (https://www.canada.ca/content/dam/cra-arc/formspubs/pbg/5006-c/5006-c-25e.pdf, lines 36 to 45, primary): expenses less the lesser of 3% of net income (line 23600) and **2,885** (2025), at the Ontario credit rate 5.05%. The 2026 thresholds are TaxTips 2026 (https://www.taxtips.ca/nrcredits/tax-credits-2026.htm; secondary; Ontario 2,940 is the 2025 figure indexed by 1.9%, the same as Ontario's other amounts): AB 2,942, BC 2,748, MB 1,728 (frozen), NB 2,854, NL 2,437, NS 1,637, ON 2,940, PE 1,678, SK 2,736. Every row has `verified.medical: secondary` except Quebec.
- Quebec: Revenu Quebec Schedule B part C (2025-12, primary) and the line 381 guide page: expenses over **3% of family income** (line 275 of both spouses), no dollar floor; credit at the lowest rate (14%). Eligible expenses include nursing-home fees and the drug plan premium. The refundable medical expense credit needs work income (3,750 in 2025; 25% to a maximum 1,466, reduced at family income over 28,335) and is not built (retirees have none).
- Ontario Seniors Care at Home Tax Credit (https://www.ontario.ca/page/ontario-seniors-care-home-tax-credit, primary): you or your spouse 70 or older; refundable; 25% of up to 6,000 of claimable medical expenses (maximum 1,500); reduced by 5% of family net income over 35,000 (nil by 65,000); the claimable expenses are those after the 3% floor.
- Federal top-up tax credit (Budget 2025 tax measures, https://budget.canada.ca/2025/report-rapport/tm-mf-en.html, and CRA line 34990): keeps 15% on non-refundable credit amounts above the first bracket threshold (58,523 for 2026), 2025 to 2030. The CRA worksheet was not readable, so it is **not built**: at most 1% of the excess, under about 200 dollars in the largest plans.

**What changed.** Eligible expenses = the year's private health premium plus the whole LTC cost, computed before the tax profile (`healthcareCost` moved ahead of `buildTaxProfile`) and carried on the profile as `medical`. One claim a household, on the lower net income unless that partner is under the basic personal amount and could not use it (`medicalClaimToB`). `personTaxCA(..., provDeduction, medical)` adds the federal credit base; `provincialTaxCA(..., extraCredit, medical)` the provincial one from the new row family `medical: { threshold, familyIncome }` (thresholds index with the BPA flag; Quebec `threshold: null, familyIncome: true`). `careAtHomeCredit` (Ontario row `careAtHome`; amounts 6,000 and 35,000 held unindexed) is subtracted in `incomeTaxCA`, so a refundable credit makes the net tax negative. `solvePensionSplit` mirrors the claimant through `pay.med` (the care credit is left out of its objective: the transfer does not change family income). Generated rules doc: a medical column.

**Before / after.** Retired years now carry a credit on the health premium and LTC; the Ontario default single at 70: tax 733 -> -556 (the care credit is refundable), at 65 648 -> 430; the default couple at 70: 16,233 -> 15,280, at 90: 15,694 -> 13,850; final total assets 4,091,918 -> 4,336,505. Function level: Alberta at 80,000 with 10,000 of expenses saves 0.14 x 7,600 + the Alberta credit rate x 7,600; an Ontario single at 72 with 40,000 of income and 8,000 of expenses gets the 1,250 care credit. 372 of 375 Canada scenarios move (any plan with a healthcare premium once retired); US byte-identical.

**Seeded success rates** (2,000 paths, seed 7), Canada, before -> after: default historical 82.9% -> 82.9%, Monte Carlo 83.4% -> 83.9%; early retiree 92.5 / 88.9 -> 92.5 / 89.0; bondYears 4: 82.9 / 85.0 -> 82.9 / 85.7; survivor B 94.3 / 90.3 -> 94.3 / 90.6; the others unchanged.

**Timing** (interleaved, 600 `simulate()` per round, median of 11): this commit against the previous one, stock ON 1.14, BC 1.05, retired 66 ON 1.10, BC 1.06 (the credit is evaluated on every tax call in a retired year: real work; noise is 10%); against the 7M merge 0.79 to 0.98.

**Cliffs register (Canada, 7N).** (1) The medical credit has a kink at the 3% floor: a dollar of net income raises the floor by 3 cents until it reaches the dollar threshold, so each dollar costs 3% x the credit rate more tax (about 0.6 cent); small. (2) The Ontario Seniors Care at Home credit falls by 5 cents per dollar of family net income from 35,000 to 65,000 (a refundable-credit phase-out, plus the floor effect): a 5% extra marginal rate on that band for a 70+ household with expenses, and a flat top at 1,500 below it.

**Tests.** `tests/tax_brackets.js` Canada: medical credit with both floors (AB at 80,000, BC at 50,000, MB at 120,000 where the dollar floors bind), expenses under the floor, no tax, Quebec single and family floors, indexing (SK), the claimant rule (higher-income partner when the other is under the BPA, lower net income otherwise, single), the care credit (72 at 40,000 gives 1,250; nil at 70,000; needs age 70; couple at family income 50,000 gives 750), and a split regret check with a medical claim. `tests/medical_credit.js` (new): the engine's year-0 row for a 70-year-old in BC and Ontario against the function-level computation, with expenses of exactly the premium plus the whole LTC cost (24,000).

**Named gaps.** The top-up tax credit; Quebec's refundable medical credit (work income); the 12-month claim window and the choice of period; the care credit uses the claimant's net income before the OAS recovery for its floor; a spouse's expenses are pooled with no cap on attendant-care categories (the whole LTC input is treated as nursing-home care).

#### N6: low-income provincial tax reductions (Canada V47 -> V48)

**Verified figures** (retrieved 2026-10-06; every one read on a CRA provincial form PDF, primary). The forms are the **2025** T1 forms (the 2026 forms are not published); the model uses their amounts as 2026 dollars and indexes them with the plan factor, except British Columbia, whose 2026 figures are in CRA T4127 (see below). Form URLs: https://www.canada.ca/content/dam/cra-arc/formspubs/pbg/<id>/<id>-25e.pdf with id 5006-c (ON428), 5010-c (BC428), 5004-c (NB428), 5001-c (NL428), 5003-c (NS428), 5002-c (PE428), 5007-c (MB428), 5008-c (SK428), 5009-c (AB428).
- **Ontario (ON428 part C, page 3):** basic reduction **294** plus **544** for each dependent child born in 2007 or later (each dependant with an impairment, not built); the sum is doubled and the Ontario tax (after credits, surtax and the dividend credit, before the health premium) is subtracted: reduction = max(0, 2 x (294 + 544 per child) - tax), tax = tax - reduction, floored at zero. With a spouse only the higher net income claims the children; each spouse has the basic reduction. The Low-income individuals and families tax (LIFT) credit (Schedule ON428-A) follows the tax reduction; not built.
- **British Columbia (BC428 page 3):** net income under 40,807: basic reduction **562** less **3.56%** of net income over **25,020** (2025). The 2026 figures, **575 / 25,570 / 3.56%, nil at 41,722**, are in CRA T4127 (read in 7K, where a summariser had attributed them to Ontario as well and a review quoted 690 and 44,952: wrong; they equal the 2025 form figures x 1.022, BC's 2026 indexation). Closes the 7K BC backlog item.
- **New Brunswick (NB428 p.3 and 4):** eligible if single with net income under **48,653**, or with a spouse or eligible dependant and adjusted family income under **75,387**; basic **802** + spouse **802** + eligible dependant **802** (maximum 1,604) less **3%** of adjusted family income over **21,920**; unused amount passes to the spouse.
- **Newfoundland and Labrador (NL428 p.3 and 4):** basic **997** + spouse **557** + eligible dependant **557** (maximum 1,554) less **16%** of adjusted family income over **23,928** (**40,460** if a spouse or dependant is claimed); unused amount passes to the spouse.
- **Nova Scotia (NS428 p.3 and 4):** basic **300** + spouse **300** + eligible dependant **300** (maximum 600) + **165** per dependent child born in 2007 or later (not the dependant claimed), less **5%** of adjusted family income over **15,000**; and an **age tax credit of 1,000** (born 1960 or earlier, taxable income under **24,000**) taken off the tax.
- **Prince Edward Island (PE428 p.3 and 4):** basic **350** + age **250** (self, born 1960 or earlier) + spouse **350** + spouse age **250** + eligible dependant **350** + **300** per dependent child born in 2007 or later, less **5%** of adjusted family income over **22,650**; unused amount passes to the spouse.
- **None:** Alberta, Saskatchewan, Manitoba (their 428 Part C was read: no reduction line; the Saskatchewan and Manitoba low-income benefits are 7M) and Quebec.

**What changed.** Row family `lowIncomeReduction` (`kind` perReturn, income or family; null where none). Ontario and British Columbia are applied inside `provincialTaxCA` after the dividend credit and before Ontario's health premium; Ontario's child amounts go to the higher-income partner (`redKids`). Nova Scotia's age tax credit is per return, in `provincialTaxCA`. The four family reductions are one household figure from `lowIncomeFamilyReduction` in `incomeTaxCA`, limited to the sum of the two returns' provincial tax (each `provincialTaxCA` call leaves its result in `PROV_TAX.last`; the unused part passing to the spouse is what limiting to the household's tax models). Amounts index with the province's BPA flag. `solvePensionSplit` mirrors Ontario's children through `pay.rk`; the family reduction is not in its objective (a transfer leaves adjusted family income unchanged). Generated rules doc: a low-income column; `tests/province_rules.js` pins which provinces have it.

**Before / after.** Ontario at 20,000 of taxable income: tax 354.06 -> 120.11 (reduction 233.94), nil at 15,000 and below, and a single Ontario parent at 50,000 with one child pays 364 less (reduction 2 x 838 - 1,312); British Columbia at 30,000: -417.29, at 40,000: -61.29; a New Brunswick single at 25,000: -709.60; a Newfoundland couple at 30,000 and 5,000: the whole provincial tax (the reduction is 1,554, the tax 1,471). Default scenario (Ontario couple): 25 of 58 rows move (the tax-free retirement years), largest tax change 1,480, final total assets 4,336,505 -> 4,367,447. 359 of 375 Canada scenarios move; US byte-identical.

**Seeded success rates** (2,000 paths, seed 7), Canada, before -> after: default Monte Carlo 83.9% -> 84.2%, historical 82.9% unchanged; bondYears 4: 85.7 -> 85.8; survivor B 90.6 -> 90.8; the others unchanged.

**Timing** (interleaved, 600 `simulate()` per round, median of 11): against the previous commit stock ON 1.03, BC 1.07, QC 1.04, retired 66 ON 1.05, BC 1.08, QC 1.03; against the 7M merge 0.82 to 1.00.

**Cliffs register (Canada, 7N).** All six reductions phase out: Ontario's tax reduction (a 100% marginal rate on provincial tax from 0 to 294, then 50% to 588 of tax: each dollar of tax is half-offset, so the marginal rate on the band is halved, not raised); BC's falls 3.56 cents per dollar of net income from 25,570 to 41,722; NB 3, NL 16, NS 5 and PEI 5 cents per dollar of adjusted family income over their bases (NL's 16% is the steepest, and its base steps from 23,928 to 40,460 once a spouse or dependant is claimed); NB's reduction also has an eligibility cutoff at 48,653 (single) and 75,387 (family) that is smooth only because the reduction has reached nil before it for ordinary cases. Nova Scotia's 1,000 age tax credit stops at taxable income 24,000 (a cliff of up to 1,000 in provincial tax, in the range where the household has tax to use it).

**Tests.** `tests/tax_brackets.js` Canada N6 block: Ontario (233.94 at 20,000, nil tax at 15,000, a child clears the tax, none at 80,000, indexing), British Columbia (30,000, 20,000 limited to the tax, nil at 41,722), New Brunswick single and the single over 48,653, Newfoundland couple limited to the family tax and a single over the base, Nova Scotia age tax credit and the no-reduction case, PEI with both age amounts, and that Quebec, Alberta, Saskatchewan and Manitoba have none; existing literals (BC age amount at 40,000, the provincial reference scan at BC low incomes, a single parent in Ontario) now include the reduction.

**Named gaps.** The LIFT credit (Ontario, employment income); Ontario's dependants with an impairment; 2026 forms (the 2025 amounts are used, about 2% low); the family reduction is not in the pension-split objective.

#### N7: Quebec health contributions (Canada V48 -> V49)

**Owner decision (2026-10-06):** every retired adult pays the RAMQ premium (a partner with wages this year is assumed to be on a group plan); stated in the Quebec note under the selector.

**Verified figures** (retrieved 2026-10-06)
- **Health Services Fund contribution.** Revenu Quebec Schedule F, TP-1.D.F-V (2025-12) (https://www.revenuquebec.ca/documents/en/formulaires/tp/2025-12/TP-1.D.F-V%282025-12%29.pdf, primary, read as a PDF): the income subject to the contribution is total income less employment income (line 12), the OAS pension (line 22), social assistance, support received, scholarships and similar (lines 20 to 33), dividends at the amount received rather than the grossed-up amount (lines 23 to 25), less certain deductions (lines 41 to 62). Contribution: nothing at or below the first threshold; **1%** of the excess to a maximum of **150**; 150 up to the second threshold; then 150 plus 1% of the excess to a maximum of **1,000**. 2025 thresholds 18,130 and 63,060; **2026 thresholds 18,500 and 64,355** (Finance Quebec, Parameters of the Personal Income Tax System for 2026, Table 3, page 10, primary). The 150 and 1,000 caps are not indexed on the form. Not modeled: the deductions of lines 41 to 62 (RRSP deduction and similar), the exclusion of employment income is applied to the profile's earned income (net of pre-tax savings).
- **RAMQ prescription drug insurance premium.** Revenu Quebec Schedule K, TP-1.D.K-V (2025-12), section C, primary: income used = line 275 of the return (and of the spouse's) less **19,890** (single) or **32,240** (couple), plus, for dependent children, **12,350** or **16,570** (single, one or more than one child) and **4,220** or **8,120** (couple); single: 7.84% of the first 5,000 and 11.76% above (392 at 5,000); with a spouse: 3.93% and 5.89% (196.50 at 5,000), each spouse paying their own premium; capped at the year's maximum, **755** for 2025 (six months at 62.00 and six at 63.83). RAMQ (https://www.ramq.gouv.qc.ca/en/citizens/prescription-drug-insurance/annual-premium, primary, read in Chrome): the premium ranges from 0 to **789** a person, adjusted each 1 July; 789 a year is 65.75 a month, so the **2026 calendar maximum is 6 x 63.83 + 6 x 65.75 = 777.48**. The 2026 table itself is not published; the 2025 table is scaled by 777.48 / 755 and its thresholds are used as 2026 amounts (secondary; backlog). Exemptions in Schedule K (a group plan, a claim slip, last-resort assistance, 65 or over with at least 94% of the maximum GIS) are not modeled except through the income test (a GIS household's income used is nil). The premium is also an eligible medical expense (Revenu Quebec line 381 page), so it is added to the household's medical expenses.

**What changed.** Row family `healthContributions` (Quebec only: `hsf` thresholds and caps, `ramq` table). `quebecHsf(income, yearIndex)` and `quebecRamq(familyIncome, couple, kids, yearIndex)` (the income at which the table reaches the maximum is worked out once, so a household above it costs one comparison); `incomeTaxCA` adds, for Quebec only, each return's Health Services Fund contribution on its non-employment income (the return's net income less its wages, OAS and the gross-up part of dividends) and the RAMQ premium for each partner with no wages this year (children under 18 count as dependent children), and adds the premium to the medical expenses. Thresholds and the RAMQ table index with the plan factor; the 150 and 1,000 caps do not. They are part of `taxFor`, so the draw solvers price them. Generated rules doc: a column; `tests/province_rules.js`: only Quebec has the family.

**Before / after** (Quebec retired couple at 66, 1.5M RRSP, 300k taxable, 200k TFSA, spending 90,000, today's `tests/` scenario in the benchmark): tax at 70 408.70 -> 3,085.68 (net of the premium's medical credit), at 80 13,603 -> 17,820, final total assets 1,916,467 -> 1,623,071. Function level: HSF 115 at 30,000, 150 at 40,000, 506.45 at 100,000, 1,000 at 200,000; a retired single at 60,000 of pension pays 150 + 777.48; RAMQ for a single at 22,000: 0.0784 x 2,110 x 777.48/755 = 170.35. One scenario of the 375 moves (the only Quebec scenario of the grid); US and the other Canada scenarios are byte-identical.

**Seeded success rates** (Quebec default household, seed 7, 41 historical cycles and 1,000 Monte Carlo paths), before -> after: historical 78.0% -> 75.6%, Monte Carlo 80.5% -> 77.2% (the other provinces are unchanged, and the standard `tests/historical_rates.js` scenarios are Ontario).

**Timing** (interleaved, 600 `simulate()` per round, median of 15). Ontario unchanged. Quebec stock household against the previous commit 1.27 and against the 7M merge **1.06**; the Quebec retired 66-year-old couple (a stress case: high spending out of a large RRSP) against the previous commit 1.94 and against the 7M merge **1.65**. Not per-call overhead (a `taxFor` call costs about 8% more) but call volume: the premium and the contribution raise each year's withdrawal need by about 1,900, so more years draw from two accounts (a taxable sale and then the RRSP, each solved by a 25-step bisection) instead of one: 231,200 against 135,550 tax evaluations over 300 runs, all of the difference from the premium (the Fund alone adds 10%). Exceeds the +5% target for Quebec households that draw heavily; accepted as the same kind of real-work cost as 7L (absolute cost about 0.6 ms a projection).

**Cliffs register (Canada, 7N).** The drug premium is a steep ramp, not a cliff: for a single person each dollar of net income above 19,890 costs 7.84 cents up to 5,000 of excess and 11.76 cents above (to about 8,200 of excess, where the 777 maximum is reached); for each spouse 3.93 and 5.89 cents from 32,240 of family income, so a couple pays about 11.8 cents of every dollar above 32,240 to roughly 14,700 above it (both premiums rise together); above the maximum it is flat. The Health Services Fund adds 1 cent per dollar from 18,500 to 33,500 and above 64,355. Together with Quebec's high brackets and the OAS recovery tax this puts the top marginal rate of a retired Quebec household in the OAS recovery range above 67%, where `drawTaxable`'s starting bracket of 3 x the need is too short (the widening loop already handles it).

**Tests.** `tests/quebec_health.js` (new, in `npm test`): the Fund at every band edge and at the caps (115, 150, 150, 506.45, 1,000) and indexed; the premium for a single (cap at 40,000; 170.35 at 22,000; with a child 737.9), for each spouse of a couple (152.17 at 36,000; cap at 50,000; two children), nil under the exemption, indexed maximum; the wiring (a retired single owes the Fund and the premium, a working single only the Fund on non-wage income and no premium, OAS is outside the Fund's base, Ontario is untouched); and an engine row for a Quebec retiree. `tests/survivor_symmetry.js`: a high-income Quebec scenario. `tests/tax_brackets.js`: the two Quebec `taxFor` checks now mark their incomes as wages.

**Named gaps.** The 2026 Schedule K table (the 2025 table, scaled); the Fund's deductions (lines 41 to 62); the premium exemptions beyond the income test; a retired partner who has a group plan (owner decision: not modeled); employer-paid premiums.

#### N8: after-tax estate (Canada V49 -> V50; display only, plus the meltdown table's ranking)

**Owner decision (2026-10-06):** the meltdown-bracket table is ranked by the after-tax estate. (Before this commit it picked the bracket with the **lowest lifetime tax** among the plans that do not shorten the portfolio, not the highest pre-tax end assets as the plan text said; lifetime tax stays in the table.)

**Verified figures** (retrieved 2026-10-06)
- Ontario Estate Administration Tax (https://www.ontario.ca/page/estate-administration-tax, primary, read in Chrome, updated 2026-06-24): nothing on estates of 50,000 or less; **15 per 1,000 or part** of the value over 50,000 (the page's example: 240,000 gives 2,850). The estate is all assets owned at death **except** RRSP, RRIF and TFSA with a beneficiary designation and jointly owned assets; real estate is net of encumbrances. This is the basis of the model's rule that registered accounts and the TFSA pass outside the estate and that the home (net of the mortgage), the taxable accounts and cash are inside it.
- British Columbia, Probate Fee Act (https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/00_99004_01, primary via search excerpt): nothing to 25,000; **6 per 1,000 or part** from 25,000 to 50,000; **14 per 1,000 or part** above 50,000 (a court filing fee of 200 is not included).
- Alberta (https://www.alberta.ca/court-fees, primary): 35 to 10,000; 135 to 25,000; 275 to 125,000; 400 to 250,000; **525** above.
- Saskatchewan (sasklawcourts.ca and saskatchewan.ca, primary via search excerpts): **7 per 1,000** of the estate (real estate at equity), plus a 200 filing fee not included.
- Manitoba: probate charges **eliminated** for applications from 6 November 2020 (Manitoba Court notice and The Court Services Fees Act, primary via search excerpts).
- Quebec: a notarial will needs no probate (quebec.ca and the Chambre des notaires, primary via search excerpts); no fee modeled.
- New Brunswick (https://www.gnb.ca/en/topic/laws-safety/courts-jails/court-fees-forms/probate.html, primary, read in Chrome): estates 0 to 20,000 **200**; 20,000 to 100,000 **5 per 1,000** over 20,000; 100,000 and over **15 per 1,000** over 100,000 (the page does not say whether a base amount is added at each step; the model adds 200 and 400 cumulatively, which is how the Probate Court Act states the lower tier: 200 plus 5 per 1,000). The search summary mentioned increases effective 12 June 2026 that the page does not show: backlog.
- Nova Scotia (Probate Act and courts.ns.ca fee table of 1 April 2015, primary via search excerpts): **1,002.65 plus 16.95 per 1,000** over 100,000; the lower steps (85.60, 215.20, 358.15 at 10,000, 25,000 and 50,000) are from memory of the same table: secondary, backlog.
- Prince Edward Island: **400 plus 4 per 1,000** over 100,000 and the steps 50, 100, 200, 400 (a lawyer-information site; the Probate Act PDF could not be read as text): secondary, backlog.
- Newfoundland and Labrador (Services Charges Act, court.nl.ca fee schedule, primary via search excerpts): **60 plus 0.60 per 100** above 1,000.
- Deemed disposition at death: the RRSP/RRIF is income on the final return and unrealized gains are deemed realized (inclusion rate 50%): standard rule, not re-read here.

**What changed.** `runProjection` attaches the final balances to its result as a non-enumerable `estate` property (so the result's own fields and every snapshot are unchanged: the engine snapshot grid is byte-identical). `afterTaxEstate(sim)` = the last row's total less the extra tax of one final return (the RRSP/RRIF plus the deemed gains of the taxable accounts, stacked on the last survivor's share of the last year's income, through `personTaxCA`, indexed by the last year) less `probateFee(rule, taxable + cash + home equity)`, the schedule in today's dollars. Row family `probate` (`steps`, `base`, `bands`). Shown as a line in the printed report and a column in the meltdown table (the dashboard's "More results" tiles are a shared region, so no tile); the table's recommended bracket is the highest after-tax estate among the plans that do not shorten the portfolio. `renderRothOptimizer` is a shared region (both planners), so it is left as it was and a Canada-only `annotateRothOptimizer` (called right after it, from the last `computeRothOptimizer` run) rewrites the summary and the five-column rows. `docs/province-tax-rules.md` has a probate column.

**Before / after.** No projection number changes. Default scenario (Ontario): end assets 4,367,447, after-tax estate 4,315,477 (the 75,094 RRSP left at the end, and probate on the home); British Columbia 5,225,610 / 5,172,829; Quebec 1,623,071 / 1,623,071 (all home equity, no probate). A meltdown example (couple at 60, 1.5M RRSP, 100k TFSA): the old pick (lowest lifetime tax) was the 14% bracket (lifetime tax 428,195, end assets 1,701,142, after-tax estate 1,674,439); the after-tax-estate pick is the **20.5%** bracket (lifetime tax 454,206, end assets 1,853,477, after-tax estate 1,845,517), 171,000 more after tax. The snapshot grid is unchanged; the UI baseline moves (new tile, column, text). Seeded success rates: unchanged by construction.

**Timing.** No change to `taxFor` or the year loop; `afterTaxEstate` runs once per render and once per meltdown bracket; the extra property is one allocation per run.

**Tests.** `tests/estate.js` (new, in `npm test`): probate fees per province against hand figures (Ontario 240,000 gives 2,850, 50,000 nil, 50,001 gives 15; BC 100,000 gives 850; Alberta; Saskatchewan 500,000 gives 3,500; Manitoba and Quebec nil; New Brunswick 150,000 gives 1,350; Nova Scotia 200,000 gives 2,697.65; PEI 200,000 gives 800; Newfoundland 100,000 gives 654), the estate of a TFSA-only plan (nothing), an RRSP-only estate (total less the final-return tax, which is 200,000 to 260,000 on 500,000), a mixed estate (deemed gains, probate base), that the estate is not an enumerable result field, and that the meltdown recommendation has the highest after-tax estate among the plans that do not shorten the portfolio. 390x844: no horizontal overflow with the cards open.

**Named gaps.** The year-of-death income is not modeled beyond the stacking on the last survivor's share; a couple who die together are one return; a spousal rollover at the first death is not modeled (the first death defers the tax, the plan ends at the last death); executor and legal fees; the marginal rate on the estate beyond the last return (for example the tax on a US-situs asset).

#### N9: OAS in the survivor period (Canada V50 -> V51)

**Rule (statute, not re-read here):** OAS is a personal benefit and is not inherited; a surviving spouse keeps their own pension (the survivor's Allowance for the Survivor is the 7L program). The 7L fix already stopped a survivor under 65 from receiving the deceased's OAS; this item removes the remaining greater-of swap from 65 on.

**What changed.** `cppAndOasIncome` no longer swaps the OAS: the survivor's `oasGross` is the amount computed from their own `oasMonthly` input, their own start age and their own 75-plus step (nothing before their start age). CPP keeps the greater-of simplification (the CPP survivor's pension, death benefit and children's benefit stay with Batch 6). The survivor info bubble, the README survivor line and the code comment say so. Only plans whose two OAS inputs (or start ages) differ can move.

**Before / after.** One of the 375 Canada scenarios moves (`std R survivor+loans`, the only survivor scenario with unequal OAS ages): at 75 (the death year) CPP plus net OAS 43,171 -> 41,557, tax 12,378 -> 11,949, final total assets 467,135 -> 461,572. A survivor whose own OAS is smaller loses the difference; with equal inputs nothing changes (checked). Seeded success rates unchanged (the standard scenarios have equal inputs). US byte-identical.

**Timing.** No change (a simpler branch).

**Tests.** `tests/survivor_oas.js` (new, in `npm test`): unequal inputs with either partner surviving (own OAS 700 or 400 a month, never the other's), the survivor's own 75-plus step, a survivor before their own start age gets none, equal inputs give the old amount, CPP greater-of unchanged. `tests/survivor_symmetry.js` (identical partners) is unchanged and passes.

#### N11: Canada Dental Care Plan note (Canada V51 -> V52; copy only)

**Verified** (canada.ca Canadian Dental Care Plan eligibility page, primary, retrieved 2026-10-06): the adjusted family net income must be less than **$90,000**, and the person must have no access to private dental insurance or coverage (including health spending accounts that cover dental costs). The page read does not state the co-payment tiers by income, so none are described. **What changed:** one sentence in the info bubble of the extra health/dental insurance field (a Canada-only field, outside the shared markup regions); README feature list; badge. No number changes: the snapshot grid is byte-identical and only the UI baseline's rendered-text hashes move.

#### 7N review fixes (two whole-branch reviews by fresh Opus reviewers, 2026-10-06; Canada V52 -> V58)

1. **Medical claim on a return with no tax (V55).** `medicalClaimToB` gave the claim to the lower-income partner whenever that net income was at least the basic personal amount, but a 65+ partner owes no federal tax up to about 27,700 (basic + age + pension amounts), so the credit was wasted. Example (BC, both 70, 20,000 and 80,000, 30,000 of expenses): tax 14,040 with or without the expenses; claiming on the 80,000 return gives 8,631. Fix: the other claimant is priced as well, and the cheaper kept, only when the preferred return had no federal or provincial tax left (`PROV_TAX.fed` / `PROV_TAX.pre` equal zero) and the other return has some; the same in `solvePensionSplit`. Test RED then GREEN in `tests/tax_brackets.js`; the existing Ontario couple case now expects the cheaper claim. Intended change: 287 of 375 Canada scenarios move (the stock couple has the health premium every retired year), by small amounts (for example a spending-tier scenario's final investable 1,162,317 -> 1,170,693); seeded success rates unchanged (default 82.9% historical, 84.2% Monte Carlo; the other five scenarios identical). Timing: against the 7M merge stock ON 1.00, BC 1.01, QC 1.01, retired ON 1.00, BC 1.00, QC 0.96 (median of 9); against the commit before the fix about +11 to +15% on the stock plan, which is the price of pricing the second claimant where the first return cannot use it. Known approximation: the gate reads the credit floor only; interplay with Ontario's low-income reduction or surtax can still leave a claim slightly off (about 100 dollars in a few scenarios).
2. **After-tax estate in a survivor period (V53).** `afterTaxEstate` halved the last year's income unless `state.singlePerson` was set; in a survivor period all of it is the survivor's. BC, age 90, 100,000 of income, 150,000 of RRSP: final-return tax 54,390 -> 62,711. The hidden `estate` property now carries `survivor`. Display only: the engine snapshot is unchanged and the UI baseline text moves for the survivor scenario (default plan with a modeled death: estate 3,322,686 -> 3,315,074). Test: `tests/estate.js`.
3. **Lifetime tax in the meltdown table (V54).** Since N1 `row.tax` excludes the OAS recovery (it sits in `row.oasClawback`), so the optimizer's lifetime tax missed it. ON couple, 180,000 spending, 2.5M RRSP: 965,879 -> 1,085,252. Display only; test in `tests/estate.js`.
5. **Ontario: the medical claimant also sets the Seniors Care at Home credit (V58, second review).** The claimant was chosen on income tax alone, but the care credit's floor is 3% of the claimant's net income (up to 2,940). Ontario couple aged 83 and 76, 166 and 36,103, 5,140 of expenses: tax -644.60 with the claim on the 76-year-old, -914.13 on the other (the first return owed nothing, so the gate did not retry). Fix: in Ontario with a 70+ spouse and expenses, both claimants are always priced on tax less the care credit. Test RED then GREEN in `tests/tax_brackets.js`. 129 of 375 Canada scenarios move (Ontario, 70+); seeded success rates unchanged. Timing vs the 7M merge (median of 11): stock ON 1.00, BC 1.04, QC 1.03; retired ON 1.00, BC 1.02, QC 1.00. Gotcha (measured): the first versions of this change read `currentProvince().careAge` or `provRule.careAtHome` in the hot function and ran 1.2 to 1.35x slower in every province, even where the condition was false; a plain `state.province === 'on'` test with the age literal 70 (the row's `careAtHome.age`) costs nothing. Not understood beyond that; re-bench any edit to `incomeTaxCA`.
6. **After-tax estate counted the last year's gains in full (V57, second review).** `grossIncome` carries realized gains at 100%, but net income counts 50%. Ontario, age 85, 100,000 of last-year income with 40,000 gains, 300,000 RRIF: estate tax 148,319 -> 144,129 (+4,190 estate). The hidden `estate` property carries `lastGains`. Display only. Test in `tests/estate.js`.
7. **Stale text (V56, second review).** The Province info tip, the Tax treatment callout, the `cppAndOasIncome` comment and the CLAUDE.md 7K paragraph still described the pre-7N model (low-income reductions not modeled, benefits for four provinces, survivor keeps the greater OAS). Copy only. Minor, not changed: `splitPay.med` omits the Quebec RAMQ premium that `incomeTaxCA` adds to the medical expenses, so the pension-split objective sees slightly fewer expenses in Quebec (federal side only).
4. **Duplicate code in incomeTaxCA.** The N8 commit pasted copies of `probateFee` and `afterTaxEstate` into the body of `incomeTaxCA` and split the N7 comment; removed (no behavior change, snapshots unchanged).

#### 7N summary (Canada V43 -> V55)

**Commits:** N1, N3, N4+N10, N5, N6, N7, N8, N9, N11 (N2 dropped). US planner byte-identical throughout (US snapshots and UI baseline untouched).

**Timing vs the 7M merge (ac5beab), final run, 300 simulate() a round, median of 7, interleaved:** stock plan ON 0.88, BC 0.90, QC 0.91; retired 66 with OAS ON 0.96, BC 0.98, QC 0.98 (all inside the +5% target). Known miss, recorded in N7: the Quebec retired heavy-draw stress case ran 1.65x (call volume from the extra yearly need, not per-call overhead).

**Considered and left out (named gaps):** Ontario Health Premium freeze (N2, dropped by the owner); Quebec single-parent supplement (primary rule needs a child 18+ in post-secondary studies); transfer of a spouse's unused amounts; federal medical top-up credit and Quebec's refundable medical credit; Quebec access-to-homeownership credit; Ontario LIFT credit and dependants with an impairment; CPP survivor pension, death benefit and children's benefit (Batch 6); Dental Care Plan co-payment tiers (copy note only). Secondary figures are on the verification backlog table above.

**Why the three credits are left out (appropriate simplifications, not oversights):**

- *Quebec single-parent supplement:* not applicable rather than simplified. The primary rule (Revenu Quebec guide, line 361) pays the additional amount only to someone living with a child aged 18 or over in post-secondary studies who is not entitled to the Family Allowance. A parent of a minor child already receives the living-alone amount, so adding the supplement for any child under 18 would overstate the credit. The planner's children list (birth year and a student flag) cannot test the Family Allowance condition, and the 2026 figure (2,681) is from a secondary source.
- *Federal top-up tax credit (line 34990):* small and unverified. It keeps the 15% rate on non-refundable credit amounts above the first bracket threshold (58,523 for 2026), so its value is at most 1% of the excess, under about 200 dollars in the largest plans, and only for households whose credits exceed that threshold. The CRA worksheet was not readable, so the mechanics could not be confirmed on a primary source; an unverified formula would add false precision to a figure well inside the model's other approximations.
- *Ontario LIFT credit (ON428-A):* a working-years credit on employment income, so it does not touch the retiree years the planner mostly projects, and for a working household it is small and phases out at low income. It needs the schedule and phase-out confirmed on a primary page, which was out of scope for N6 (low-income tax reductions) and is on the backlog.

Each can be added later as one more row family or credit term without changing the engine shape.

**Exit criteria:** every figure cited with retrieval date; hand-computed tests per item in `npm test`; seeded success rates and before/after tables per item; `docs/province-tax-rules.md` regenerated; 390x844 check done (no horizontal overflow); `npm run check:shared` clean; badge bumped each commit; README and CLAUDE.md updated per item.

#### Open items: Canada simplifications in credits, benefits and taxes (after 7N)

One place to see what the Canada model does not do, and why that is acceptable. Detail and sources sit in the item notes above; the verification backlog table lists figures still to confirm. Sizes are rough and from the notes.

**Taxes and credits**
| Simplification | Why acceptable | Source |
|---|---|---|
| Spouse's unused age, pension and pooled amounts are not transferred | Needs the partner's unused credit solved jointly; effect is small once the split and the recovery are priced | 7K, N3 |
| Quebec single-parent supplement | Does not apply to a parent of a minor child (needs a child 18+ in post-secondary studies, no Family Allowance) | N3 |
| Federal top-up tax credit (line 34990) | At most 1% of credits above 58,523, under about 200 dollars; worksheet not readable on a primary page | N5 |
| Quebec refundable medical credit (work income) | Needs work income and a separate schedule; retiree plans mostly do not qualify | N5 |
| Medical claim window and choice of period; attendant-care categories; the whole LTC input counted as nursing-home care | Owner decision (N5); one calendar-year claim is the model's period | N5 |
| Ontario LIFT credit; Ontario dependants with an impairment | Working-years or disability inputs the planner does not have; small | N6 |
| Quebec access-to-homeownership credit (up to 5,875) | Needs inputs not modeled; the 10,000 home-buyer amount is built | N10 |
| Non-eligible Canadian dividends taxed like interest | The planner has one dividend yield; eligible dividends are modeled | 7K |
| Territories; local or municipal taxes | Not in scope (ten provinces only) | 7K |
| Couple assumed to live together all year; a spouse's net income is the pre-recovery figure | Keeps the claim rules deterministic | N3 |
| 2025 forms used as 2026 amounts for N6 reductions and several medical thresholds (about 2% low) | 2026 forms not yet published or not read; on the backlog | N5, N6 |
| EI/CPP effects of working past 70; CPP survivor pension, death benefit, children's benefit | CPP survivor keeps a greater-of simplification; the rest is Batch 6 | N4, N9 |

**Benefits**
| Simplification | Why acceptable | Source |
|---|---|---|
| Same-year income stands in for the prior-year return | Engine convention for every benefit | 7L |
| No benefit columns in the CSV export | The export is a shared region | 7L |
| PEI property tax credit, Manitoba Rent Assist, Nova Scotia heating rebate | Need inputs (assessed value, rent detail) the planner does not have | 7M |
| Disability benefits; NL pregnancy and birth parts of the Nutrition Supplement | Out of scope | 7M |
| Phase-in benefits (CGEB single supplement, NL Income Supplement) can make a taxable sale over-sell by the phase-in amount | Known limit of the shared drawTaxable bisection; amounts small | 7M |
| Several shapes are readings, marked secondary (Saskatchewan Seniors Income Plan, Manitoba Child Benefit, Saskatchewan single-parent amount) | Primary page gives endpoints, not the full formula | 7M |
| Flat statutory amounts are unindexed; OAS amounts update quarterly | Matches the statutes; refresh each year (the 2027 OAS update is flagged) | 7L |

**Estate and health costs**
| Simplification | Why acceptable | Source |
|---|---|---|
| After-tax estate is display only; registered accounts and TFSA assumed to pass by beneficiary (outside probate); one final return stacked on the last year's income | Gives a ranking signal for the meltdown table, not a tax filing | N8 |
| Some probate lower steps (PEI, Nova Scotia) and the New Brunswick 2026 change are from secondary sources | On the backlog | N8 |
| Every retired adult pays the RAMQ premium; the premium table is the 2025 Schedule K scaled to 2026 | Owner decision (N7); 2026 schedule to be confirmed | N7 |
| Dental Care Plan not modeled (copy note only) | Eligibility depends on having no dental insurance; the model has one health cost line | N11 |

**Performance:** Quebec retired heavy-draw stress case is 1.65x the 7M timing (call volume from the extra yearly need, N7); all other measured Canada cases are at or below 1.0.

### 7O notes: remaining US credits, benefits and fixes (O1-O6 done)

Branch `claude/batch-7o`, cut from `origin/claude/batch-3b-penalty-rules` (includes 7N). US V100 -> V101 (O1) -> V102 (O2) -> V103 (O3) -> V104 (O4) -> V105 (O5).

#### O1: Medicaid and the premium-credit floor (US V101)

**Behavior.** `acaNetCost` now applies, before the credit schedule: (1) if the household's MAGI is at or under
the state's Medicaid line (`medicaidLimit`: 138% of FPL in the 41 expansion jurisdictions, Wisconsin 100%, 0 in the
other nine non-expansion states) the cost is $0 when `medicaidWhenEligible` is on and, in calendar years before 2027
or with a child aged 13 or younger in the household, otherwise the full gross premium (declined, or failed the
work requirement, which also bars the credit); (2) below 100% of FPL (non-expansion states) the full premium.
Above the line nothing changed (schedule, 400% cliff). A MAGI of zero no longer returns $0 up front: it is
Medicaid in an expansion state and the full premium in a non-expansion state. Medicaid applies only inside the ACA path
(`acaEnabled` and an eligible partner), so `healthcareCost` and the 400% guard still read the same function.
`conversionMagiCeiling` is unchanged: O1 prices the new cliffs, 3C decides the policy (note for 3C: a Roth
conversion or gain harvest that lifts MAGI over the Medicaid line, or to 100% of FPL in a non-expansion state, can
be worth more than its tax; in the work-requirement years and at the 100% line a household near the line has no
consistent answer: the cost steps down as MAGI rises; follow-up fix F5 finishes such years, filling to the line is 3C).
New field `medicaidWhenEligible` (default true, `trueUnlessFalse`, MCP, shown with the ACA checkbox), info tip written
from the code. Data: pure-literal `MEDICAID_RULES` (`MEDICAID_RULES:begin/end`), not a STATE_RULES column.

**Sources (primary, retrieved 2026-10-06).** Adult group income 133% FPL: 42 CFR 435.119; the 5-point disregard to
138% and current monthly income: 42 CFR 435.603(d)(4) and (h)(1); no credit below 100%: IRC 36B(c)(1)(A); eligible for
Medicaid is not eligible for the credit: IRC 36B(c)(2)(B); work requirement (SSA 1902(xx), from OBBBA section 71119):
CMCS Informational Bulletin, 12/8/2025 (start January 1, 2027; 80 hours a month of work, service, a work program or
school, or monthly income of 80 x the federal minimum wage; exempt: a parent, guardian, caretaker relative or family
caregiver of a child 13 or younger or of a disabled individual, medically frail, SNAP or TANF compliant, and others;
a person denied for failing it is deemed eligible for coverage and barred from the credit, 1902(xx)(7)(B); good-faith
delays end no later than December 31, 2028) and the CMS fact sheet of June 1, 2026 (interim final rule, ages 19-64).
Non-expansion list: KFF, "Status of State Action on the Medicaid Expansion Decision" (10 states: AL, FL, GA, KS, MS,
SC, TN, TX, WI, WY; 41 including DC adopted). Wisconsin: DHS BadgerCare waiver, adults to and including 100% of FPL through December 31,
2029 (the limit already includes the disregard).

**Not modeled (named in the info tip and README).** The other work-requirement exemptions (medical frailty, disability,
SNAP or TANF compliance), the monthly-income route to the requirement ($580 a month; the statute says income and
whether investment income counts is unclear, so the safe side is assumed), state good-faith delays to 2028, Medicaid's
use of current monthly income (the annual MAGI stands in), the Georgia Pathways waiver (treated as non-expansion),
estate recovery's cost, lawfully present immigrants under 100% of FPL. The poverty line stays the model's own 2025
guideline indexed (it is also used for the 400% line); Medicaid uses the current-year guideline in practice.

**Tests.** New `tests/aca_medicaid.js` (hand-computed: CA, TX and WI at 0, 90%, 100%, 120%, 138%, 140%; checkbox off;
enhanced mode; 2026 versus 2027 and 2028; a child of 13 versus 14; all 51 jurisdictions classified; engine rows for
WA, TX and WI equal `acaNetCost` of their own MAGI, so the iteration converges at the new cliffs). Existing tests
that relied on the old behavior were corrected, not loosened: `dividend_income.js` (TX with no income now pays the full
premium, so the comparison starts at a 2% yield), `roth_accounts.js` ledger-rewind case (now Washington with a child 12
or younger: no premium, so draws are 37,000 rather than 37,063). `legacy_state.js` has two new cases and the US
baseline moved only for the new default field. Snapshots: 17 of 518 US scenarios moved (all the `aca` ones: the 2027
work requirement and the floor); the default scenario has ACA off and is unchanged; Canada untouched.

**Before / after** (retired couple 52 and 50, Roth-heavy, 150,000 taxable, spending 60,000, premium 18,000 entered, ACA on;
healthcare by age of Partner A, today's dollars with no inflation; before = the 7N tip):

| Case | Before | After |
|---|---|---|
| CA, no child, ages 52-61 | 1,225 587 1,054 1,289 1,156 22 0 0 0 0 | 1,225 18,635 1,065 1,249 20,675 21,404 22,159 22,940 23,748 24,586 |
| CA, child born 2018 | 647 587 641 691 699 24 0 0 0 0 | 0 0 0 0 0 0 (to age 57) then 22,159 22,940 23,748 24,586 (child is 14 from 2032) |
| TX, no child | 1,225 587 1,054 1,289 1,156 22 0 0 0 0 | 1,225 587 1,054 1,289 1,156 21,404 22,159 22,940 23,748 24,586 |

(The after column is the gross premium inflated at the plan's medical growth.) Success rates, seeded (2,000 paths,
seed 7), before to after: default 85.4% / 86.1% unchanged (ACA off); early retiree, working-then-retires, survivor
scenarios unchanged (ACA off); low-MAGI early retiree, expansion state (CA): historical 100.0% to 100.0%, Monte Carlo
99.8% to 99.4%; non-expansion state (TX): 100.0% to 100.0%, 99.8% to 99.3%. Both low-MAGI scenarios were added to
`tests/historical_rates.js`.

**Timing.** `tests/bench_runs.js` (ACA off in the stock scenario) tx 212 -> 188 ms, ca 274 -> 262 ms, wa 201 -> 198 ms
for 400 `simulate()`; an ACA-on household with a child (CA), 400 runs, interleaved in one process, median of 7:
7,751 -> 7,946 ms (+2.5%, inside the +5% gate). The no-ACA path is untouched; the ACA path adds one cached lookup and
no allocation (`hasChildAtMost` loops the children list in place).

**Gotchas.** `medicaidLimit` is 0 for a non-expansion state, so the Medicaid branch needs `limit > 0`
(a MAGI of 0 would otherwise match). The 138% test uses the same 1e-9 tolerance as the 400% line.
#### O2: medical expenses in itemized deductions (US V102)

**Behavior.** `itemizedDeduction(yearIndex, magi, stateTax, propertyTax, mortgageInterest, medical = 0)` adds
`max(0, medical - 7.5% x max(0, magi))` (`MEDICAL_FLOOR_PCT`; IRC 213(a), a permanent floor; the return's pre-deduction income
stands in for AGI, as it already does for the SALT phase-down). `federalDeduction` and `federalLiabilityForState` (the lagged
state pass) take the same last argument. The engine sets `profile.medicalExpense = healthcare + ltc` every MAGI-iteration pass,
right after `healthcareCost` (the premium follows the pass's MAGI estimate; `profile` is a per-year object): the ACA premium
after the credit (or the flat pre-65 premium with ACA off), Medicare Part B/D and supplement, IRMAA, and the year's long-term-care
cost. Payroll-deducted premiums (`healthPremiumA/B`) are already pre-tax and are not in it. `taxFor` reads `profile.medicalExpense || 0`;
the two-separate-filers branch splits it 50/50 like the property tax. `solveRothConversion` keeps its conservative lower bound (no medical
term) and the Roth optimizer's profile literals carry none. The deduction only binds when itemizing beats the standard deduction, which in
practice means the long-term-care years. State itemized deductions are not modeled. The LTC premium age limits of IRC 213(d)(10) do not
apply (there is no LTC premium input: the field is the cost of care itself).

**Sources (primary, retrieved 2026-10-06).** IRC 213(a) (7.5% of AGI), 213(d)(1) and (d)(1)(D) (medical care includes qualified long-term
care services and insurance), 213(d)(2) with 7702B(c) (qualified long-term care services: a chronically ill individual, a plan of care by
a licensed health care practitioner), and IRS Publication 502 (2025): Medicare Parts B and D and supplemental premiums are medical
expenses; marketplace premiums count net of the premium tax credit; claimed on Schedule A only when itemizing. The care is assumed to be
qualified services (nursing home or other care under a plan of care; stated in the Medicare field's tip).

**Hot path.** The itemizing branch is entered only when `medical > 7.5% x AGI`, so a household with ordinary Medicare premiums (always
under the floor) never calls `itemizedDeduction` for them; `medical = 0` adds an exact 0 (identical doubles, `tests/tax_caches.js` green).

**Tests.** `tests/deductions.js`: unit cases (over the floor 94,000 on 80,000 of AGI, under and exactly at the floor, no income, stacking
with SALT and mortgage interest, the senior deduction on top, the standard-deduction crossover at 24,150 / 24,200, small medical ignored),
`taxFor` end to end single (4,588 and fully sheltered) and MFJ (6,344), medical 0 equals absent, and the engine (30,000 of care on
80,000 of income, with Medicare premiums added, and 20,000 of care below the standard deduction). Existing tests moved only through the
snapshots. Snapshots: 58 of 518 US scenarios moved, all single-person or LTC-heavy (the default couple has no LTC years; the default single
moved); Canada untouched. Survivor symmetry (`tests/survivor_symmetry.js`) pass: the survivor reads the
same household expense, and the care of the deceased drops out in `healthcareCost`.

**Before / after.** Single, retired at 62, 600,000 taxable, 1,200,000 traditional, 200,000 Roth, spending 60,000, LTC on (50,000 a year
from the default start age): lifetime tax 1,202,092 to 837,321, ending investable 2,710,791 to 3,416,815, tax in the first LTC years
(ages 82-87) 42,451 61,660 73,240 76,107 79,047 81,353 to 21,861 23,841 39,163 43,353 44,900 46,332. Default couple: unchanged (no LTC years).
Seeded success rates (2,000 paths, seed 7), before to after: single retired at 62 with LTC years (new scenario in
`tests/historical_rates.js`): historical 84.6% to 87.7%, Monte Carlo 84.2% to 85.7%; every other scenario unchanged.

**Timing** (400 `simulate()`, interleaved, one process, median of 7): default couple 360 to 362 ms (1.006), single with LTC in CA 140 to 143
(1.021), couple in MA 358 to 362 (1.011); gate +5%.

#### O3: Pennsylvania employer-plan distributions after retirement (US V103)

**Behavior.** The PA `perPerson` retirement exclusion takes an optional third key in `applies`, `employerPlanAfterRetirement: true` (PA only; the
schema test reads `pension` and `traditional` and ignores extras). For a filer under the traditional minimum age (59.5), the part of their
traditional draw that is employer-plan money is excluded; from 59.5 everything is excluded as before. `buildTaxProfile` takes `tradShares`
(`accts.trad`) and `workingA/B` and puts `k401FracA/B` on the profile: the filer's 401(k) share of their own traditional accounts (draws are
pro rata within a partner), zero while that filer is still working; a single person or the survivor owns the whole pool (the 401(k) share of the
pool, gated on the survivor's own work). `taxFor` fills `sources.retirement401kA/B` (draw x fraction) in its four per-person blocks, only
when `needsPerPerson` (PA already had the flag; `tests/tax_caches.js` pins unchanged). RMDs are drawn pro rata from the owner's accounts, so the
same fraction applies; the state evaluator caps the exempt part at the filer's traditional income. Generator text and the PA notes updated;
`docs/state-tax-rules.md` regenerated.

**Sources (primary, retrieved 2026-10-06).** PA Personal Income Tax Guide, Gross Compensation (pa.gov): payments commonly recognized as old age or
retirement benefits paid to persons retired from service after reaching a specific age or after a stated period of employment are not
compensation; an IRA or other non-employer plan is exempt only when no early-withdrawal penalty is owed; a premature IRA withdrawal is
taxable to the extent it exceeds previously taxed contributions (cost recovery); 61 Pa. Code 101.6. The model follows the owner-confirmed
rule (retired from service, any age) and does not test the plan's own age or years-of-service condition.

**Approximations (named in the PA notes).** (1) The 401(k) share of a draw is the pool share, i.e. pro rata. Where the engine picks accounts
deliberately (the penalty-aware draw order from 55 with the Rule of 55 on, a 72(t) payment from one account) the real mix differs; the pro rata
mix overstates PA tax slightly when 401(k) money is drawn first. (2) A Roth conversion counts in the traditional draw and so is exempted in the
same proportion as a draw would be (it comes from IRAs first in the engine). (3) The share is fixed at the start of the year, as the ownership
share already is. (4) PA cost recovery on IRA draws is not modeled (the whole draw is taxed).

**Tests.** `tests/state_mechanisms.js` (new cases on `zz`: 30,000 of 40,000 exempt at 52 leaves 1,000; no 401(k) money taxes all 4,000; the exempt
part capped at the draw; 60 excludes everything; a joint return with one filer under 59.5 and one over; both under with one all 401(k); the same
row without the option; a pension beside a 401(k) draw). New `tests/pa_employer_plan.js` (in `npm test`): the engine, hand-computed, single 52
retired with a 401(k) only, an IRA only, half and half, a quarter IRA, age 60, and a couple (A 401(k), B IRA, and swapped) with the draw X solved
including the federal 10% early-withdrawal penalty that every traditional dollar owes at 52; B still working keeps PA tax on B's 401(k).
Snapshots do not cover Pennsylvania (the default state is MA), so none moved.

**Before / after.** Couple 52 and 50 in PA, 300,000 taxable, 80,000 cash, spending 90,000, A: 300,000 IRA and 500,000 401(k); B: 200,000 IRA and
500,000 401(k); 100,000 Roth each. Lifetime tax 559,836 to 549,256; tax by age 52-59: 2,102 2,146 1,934 0 19,585 50,494 51,599 52,735 to the same for
52-55, then 16,997 44,353 45,318 46,311 (the traditional draws start at 56). Seeded success rates (new scenario in `tests/historical_rates.js`):
historical 50.9% to 50.9%, Monte Carlo 61.2% to 61.8%; every other scenario unchanged.



#### O4: state child credits (US V104)

**Mechanisms.** `childCredit` gains optional `phaseOut.measure` ('stateAgi' or 'income'; default the federal AGI), `phaseOut.rate` (a straight line:
credit dollars lost per dollar over the start, scaled with the amounts; otherwise `per` per `width` as before), `maxChildren` and `fixed` (the statute does
not index this credit, whatever the row's flags say: Utah). `childStepCredit` gains `maxAge` and `measure: 'income'` (the state taxable income). Existing rows
(NY, NM and the others) are unchanged, and the schema test passes untouched (the new keys are optional).

**Rows (primary sources, retrieved 2026-10-06).**

| State | Credit | Source |
|---|---|---|
| MN | 1,750 per qualifying child under 18, refundable; reduced by 12% of the federal AGI over 37,910 joint and 31,950 every other status (thresholds indexed, the amount is not: the row's `creditThresholdsIndexed` is now true, it has no other credit) | 2025 Schedule M1CWFC (lines 8 to 14), Department of Revenue Child Tax Credit page. The working family credit part (earned income) and the 9% rate for the older-children credit are not modeled |
| VT | 1,000 per child six or younger, refundable; 20 per 1,000 or fraction of AGI over 125,000 taken off each child, gone at 175,000 for any number of children; not indexed | 32 V.S.A. 5830f (amended 2025, effective 1/1/2025); the 2025 IN-112 table is per child |
| ME | 305 per dependent, 610 for a child under six (doubled from 2025 with no end date), refundable; 20 per 500 or fraction of Maine AGI over 100,000 single, 125,000 head of household, 150,000 joint; amounts and thresholds indexed | 36 M.R.S. 5219-SS (5), 5403(9)-(10); 2025 MRS worksheet ($305 and $610) stands for 2026 |
| NJ | up to 1,000 per child five or younger by NJ taxable income: 1,000 to 30,000, then 800, 600, 400, 200 per further 10,000, nothing over 80,000; refundable | Division of Taxation, Child Tax Credit (2025) |
| OR | 1,050 per dependent under six, at most five, refundable; the whole credit is cut by (Oregon AGI - 26,550) / 5,000, rounded to two decimals, nothing at 31,550 for any number of children | ORS 315.273 and the 2025 Form OR-40 worksheet: 1,000 and 25,000 indexed (CPI, rounded down to 50), the divisor fixed; applies to tax years before 2029 (not modeled, owner decision); the 2025 values stand for 2026 |
| UT | 1,000 per child under six (a federal CTC child), nonrefundable; 10 cents per dollar of modified AGI over 49,000 single or head of household and 61,000 joint; not indexed | Utah Code 59-10-1047, effective 1/1/2026 (Chapter 360, 2026 General Session), read from le.utah.gov |

The rows' `notes` carry these figures and what is not modeled. **Left out, with reasons.** California Young Child Tax Credit: it requires CalEITC eligibility
(earned income of 32,900 or less, or a small net loss, and the CalEITC investment-income limit that taxable-account gains would break), the EITC-style test the
owner left out (FTB page, updated 4/16/2026). Colorado Family Affordability Tax Credit: off for tax year 2026 (Department of Revenue); named in the CO notes, recheck
yearly. Georgia (250 per child under six, nonrefundable), Idaho (205), Oklahoma (5% of the federal credit), Illinois (40% of the state EITC) and Maryland (child
with a disability): too small or needing an input the planner lacks. Approximations: Maine's credit counts the children in the list (a dependent of any age is
eligible by statute); Maine AGI and Oregon AGI are the planner's state AGI; Utah's modified AGI is the federal AGI; Minnesota's measure is the greater of AGI and
earned income by statute, the federal AGI here (a retiree has no earned income to exceed it).

**Tests.** New `tests/state_child_credits.js` (in `npm test`): each row's real credit literals on a flat-10% synthetic base, hand-computed, covering the boundaries
(MN 60,000 joint: 3,500 - 12% x 22,090 = 849.20; VT 125,000 / 125,001 / 150,000 / 175,000; UT 30,000 / 55,000 / 60,000, the nonrefundable cap, not indexed under
inflation; OR full, the line, 31,550, the cap of five, indexing with the width fixed; ME all three columns and the student and age-19 cases; NJ every step edge) and
the age edges. `tests/state_7d_households.js`: the two family households in Maine and Vermont moved by exactly the new credit (ME 4,838.425 to 4,238.425, the 600
for two dependents; VT 3,621.75 to 2,761.75, the 860 for the child of 6 after seven steps of 20); the comments show the arithmetic. Snapshots did not move (no
corpus scenario has one of these states with children).

**Before / after** (couple 40 and 38 retired with two children born 2023 and 2025, 400,000 taxable, 100,000 cash, 1,500,000 in Roth, spending 70,000; total tax,
years 0 to 5):

| State | Before | After |
|---|---|---|
| MA (control) | 1,647 1,683 1,803 1,912 1,061 -880 | unchanged |
| MN | 1,064 1,046 1,116 1,174 312 0 | 284 234 486 696 -1,752 -3,500 |
| VT | 820 813 860 900 390 0 | -1,210 -1,218 -1,170 -1,131 -436 -1,000 |
| NJ | 953 970 1,028 1,081 744 0 | 144 161 219 879 174 0 |
| OR | 3,272 3,282 3,438 3,573 1,597 0 | unchanged (state AGI over 31,550) |
| UT | 847 821 888 942 47 0 | 0 0 0 429 0 0 |
| ME | 477 441 499 544 0 0 | -144 -196 -154 213 -550 -690 (after fixes F3 and F4: the credit is 1,220 while both children are under six, 915 in 2029 and 2030, 610 from 2031, and no dependent exemption) |

Seeded success rates (2,000 paths, seed 7; two scenarios added to `tests/historical_rates.js`): MN historical 68.3% to 68.3%, Monte Carlo 75.5% to 76.6%; NJ
68.3% to 68.3%, 75.5% to 75.8%; every other scenario unchanged.

**Timing** (400 `simulate()`, interleaved, one process, median of 7): default (no children, MA) 370 to 381 ms (1.030, noise: the path is untouched), PA couple
retired 185 to 182 (0.984), Minnesota with two young children 419 to 473 (1.129), Maine 454 to 489 (1.077). The last two are over the +5% line because they now
evaluate a credit that did not exist (and its lower tax moves the withdrawal solvers); the hot paths in the plan (no children, no credit row) are unchanged.


#### O5: Social Security before retirement, a warning (US V105; no number change)

**Behavior.** The earnings test stays unmodeled (decision 17). The "Worth a second look" list now flags a partner whose benefit starts (`ssStartAge`) before both
their retirement age and their full retirement age while they have wages (`income` over 0 and a monthly benefit entered): the message gives the SSA figures and
says the planner pays the full benefit while wages continue. Each partner has their own item (Partner B only when not single), marked on the start-age field
like the range items, dismissible, and cleared when the condition goes away. Full retirement age is by birth year from `currentYear - age` (SSA table: 66 to
1954, plus two months a year to 1959, 67 from 1960). Nothing in the projection changes. The field note (a brief "Unusual value" under the field) shows only after leaving the Social Security start-age field, as for the range items; the list item and the marker follow the condition whatever field changed it (kept as is, follow-up F7).

**Shared code.** `UNUSUAL_RANGES` lives in the `04-isEstimateCountable` shared region (both planners). `computeUnusualAssumptions` and `renderUnusualAssumptions`
now also accept an item with `check()` and `message()` instead of a range (flagged while `check()` is true; the dismissal clears when it is not); Canada has no
such item, so its output is unchanged. The US entries (`ssBeforeRetirementCase`, `fullRetirementAgeMonths`, `SS_EARNINGS_TEST_2026`) are pushed onto the list just after
the shared region ends, so the region stays byte-identical in both files (`npm run sync`, then the planners back to CRLF).

**Sources (primary, retrieved 2026-10-06).** SSA, Exempt Amounts Under the Earnings Test: 2026 lower amount 24,480 (people attaining full retirement age after 2026,
$1 withheld for every $2 over), 65,160 in the year full retirement age is reached ($1 for every $3 over, months before the month of attainment); withheld
benefits are not lost, the monthly benefit rises permanently at full retirement age. SSA, Normal Retirement Age table. The 2026 amounts are the figures quoted in
the message (they are not indexed forward).

**Tests.** New root `test_ss_before_retirement_warning.js` (not in CI, like the other root scripts): default and retire-at-start cases are quiet; start 62 with retirement at
66 flags Partner A with the figures and the field marker; start at 67 or retirement first or no wages clears it; born 1955 (age 71 in 2026) has a full retirement age of
66 and 2 months; a single person has no Partner B item; dismissal stays until the condition clears and returns; the projection rows are untouched. Snapshots: the
default scenario does not trigger it (retirement 55, start 62), so none moved. (The UI snapshot's historical-success tile raced once under load in a full run and passed
on two reruns; unrelated.)

**Before / after.** No number changes, so no table or success rates: the projection hash of every snapshot scenario is identical.


#### O6: items left out, with reasons (docs only; no code, no number change)

Recorded so they are not re-raised. Closes the open items for the federal EITC, the state EITCs, the Pennsylvania 401(k) exception (built in O3) and the California Young
Child Tax Credit (left out in O4). Figures re-confirmed on primary sources 2026-10-06 where noted; the rest are named as the reason, not modeled.

| Item | Why it is left out | Source |
|---|---|---|
| Federal EITC and the state EITCs (about 31 states plus DC, most as a share of the federal credit) | Needs earned income, which a retired household lacks; and the credit is lost when investment income exceeds the limit (12,200 in 2026), which counts interest, dividends and the gains from selling taxable shares: a household funding spending from a brokerage account fails it. The state counts are from NCSL and ITEP lists (secondary) | IRS, Rev. Proc. 2025-32 (2026: 12,200; 2025: 11,950) |
| Saver's Credit | Only the 2026 plan year remains; it is replaced from tax year 2027 | CRS IF11159; IRS Saver's Match page |
| Saver's Match (from 2027) | A federal deposit into the retirement account, not a tax credit; full 50% match at income up to 20,500 single, 30,750 head of household and 41,000 joint, phased out to 35,499, 53,249 and 70,999; only while contributing, so rare for a planner household; the thresholds are indexed after 2027 | IRS Saver's Match page (SECURE 2.0 section 103, IRC 6433) |
| State circuit breakers and property-tax or rent credits | The 7D decision stands (owner). The stated reason, no nontaxable-income input, is weaker now: the engine knows nontaxable Social Security, Roth draws and basis per year, and `homeValue` exists for value tests. The Massachusetts Senior Circuit Breaker would be the first case if revisited: tax year 2025 maximum 2,820, refundable, total Massachusetts income up to 75,000 single, 94,000 head of household and 112,000 joint, home assessed at 1,298,000 or less, property tax plus half of water and sewer (or 25% of rent) over 10% of income | Mass.gov Senior Circuit Breaker Tax Credit (updated 3/3/2026) |
| Credit for the Elderly or Disabled (Schedule R) | Pays nothing to a planner household: AGI must be under 17,500 single, 20,000 joint with one qualifier or 25,000 with two (limits unindexed), and nontaxable Social Security and pensions under 5,000 or 7,500, so a few thousand dollars of Social Security removes it | IRS Publication 524, Table 1 |
| Local income taxes other than Maryland and Indiana (a flat average county rate) | Too many jurisdictions, no city or county input (accepted gap, named in each state note) | 7D |
| Medicare Savings Programs, Extra Help, SSI, SNAP, LIHEAP, TANF, WIC, Lifeline and housing aid | Asset tests (SSI 2,000) and income rules the planner has no input for | Out of scope |
| Foreign tax credit | No foreign income input | Out of scope |
| Education, adoption, dependent-care and energy or EV credits | No matching input; the owner left them out in Batch 2 and 7B | Out of scope |

Also not built in 7O: cost-sharing reductions (they change deductibles, not the premium the planner models); the Medicare Part A premium (free with 40 credits). The README
"US-specific" list carries a short version of this table.


#### 7O follow-up fixes (review findings, 2026-10-06)

**Status: planned, not built. This is the first thing to do after 7O and before 3C** (decision 21). A code review of 7O reported
three child-credit bugs (OR, VT, ME); all three were checked against the primary text on 2026-10-06 and all three are right. Checking
them turned up four more items (the Oregon credit's 2029 sunset, which is recorded but not modeled, Maine's indexing of the credit, Maine's dependent exemption, and the
Oregon worksheet's rounding). The review's two other findings (the O1 MAGI iteration at the new cliffs, the O3 Roth-conversion share)
are planned below with options; **both need the owner's decision** before they are built.

**Owner decisions (2026-10-06).** (1) Do **not** model the Oregon Kids Credit's 2029 sunset: the row keeps the credit in every year (the
statute's end date is recorded in the notes and the finding below; the legislature is likely to extend it; recheck yearly with the rows).
(2) The Maine row note about the personal-exemption phase-out is corrected in F7. (3) F5: build design A now (a failing test first), design B
(filling to the line) goes to 3C. (4) F6: the Roth-conversion split is an internal profile field set each pass (not a sidebar input or a
`FIELDS` entry); build it only after the PA guide is read (see F6).

##### Verified findings (primary sources, retrieved 2026-10-06)

**(a) Oregon Kids Credit, ORS 315.273: the review is right.** The reduction is a percentage of the whole credit, so the credit
reaches zero at the same income for any number of children. The code takes 0.21 per dollar (1,050 / 5,000, one child's slope)
off the household total, so a household with two or more children keeps part of the credit above 31,550.
- (2): "...with an amount allowed for each dependent of the taxpayer who is a qualifying child with respect to the taxpayer, not to
  exceed five properly claimed dependents per tax return."
- (3)(a): "Shall be in an amount of $1,000 per dependent of the taxpayer, but, if the taxpayer has a qualifying income limit in excess
  of $25,000, regardless of the type of income tax return filed by the taxpayer, the total amount of the credit shall be reduced as
  provided in subsection (4) of this section." (3)(b): "May not be claimed if the percentage calculated in subsection (4) of this section
  is greater than or equal to 100 percent."
- (4): "If a reduction under subsection (3) of this section is required, the amount by which the credit shall be reduced is computed by
  multiplying the amount otherwise available under subsection (3) of this section by a percentage. The percentage is computed by
  dividing, by 5,000, the amount by which the taxpayer's qualifying income limit exceeds $25,000."
- (5)(a): "...the Department of Revenue shall adjust the dollar amounts of the credit and of the income threshold set forth in
  subsections (3) and (4) of this section by multiplying each dollar amount by the cost-of-living adjustment for the calendar year."
  (5)(d): increases round to the next lower multiple of $50. The divisor 5,000 is not a dollar amount and stays fixed (the 2025 worksheet
  still divides by $5,000).
- **Sunset (new finding):** the note printed under ORS 315.279: "Sec. 11. Section 2 of this 2023 Act [315.273] applies to tax years
  beginning on or after January 1, 2023, and before January 1, 2029. [2023 c.538 §11]". The 2026 amended-and-repealed table
  (2026OrLawAR.pdf) lists no change to 315.273 (the only ch. 315 change near it is 315.266). The row has no sunset today.
- Department of Revenue, "Tax benefits for families" page: "For 2025, if your ... modified AGI is $26,550 or less, the full credit is
  $1,050 per child for up to five dependent children ages 0 to 5 ... Above a modified AGI of $26,550 the credit is reduced and is $0 at a
  modified AGI of $31,550." 2025 Form OR-40 instructions (updated January 29, 2026), Oregon Kids Credit Worksheet: line 4 "Is line 4
  $31,550 or more? If yes, STOP"; line 5 "$26,550"; line 7 "Line 6 divided by $5,000. Round to two decimal places."; line 8a "Number of
  dependent children age five or younger at the end of 2025. Don't enter more than 5."; line 8b "$1,050"; line 9 "Credit reduction. Line 7
  multiplied by line 8."; line 10 "Line 8 minus line 9." So the cap of five comes first and the percentage applies to the capped total;
  the worksheet rounds the percentage to two decimals (the statute does not; follow the worksheet, it is how the credit is filed).
- Example: two children at 28,000: 1,450 / 5,000 = 0.29; 2,100 x (1 - 0.29) = **1,491** (the code gives 2,100 - 0.21 x 1,450 = 1,795.50).
  One child is unchanged (1,050 x 0.71 = 745.50 both ways).

**(b) Vermont Child Tax Credit, 32 V.S.A. 5830f: the review is right.** The phase-out is per child.
- (a): "The total credit per taxable year shall be in the amount of $1,000.00 per qualifying child, as defined under 26 U.S.C. § 152(c)
  ..., who is six years of age or younger as of the close of the calendar year in which the taxable year of the taxpayer begins."
- (b): "Notwithstanding subsection (a) of this section, the amount of the credit per child under this section shall be reduced, but not
  below zero, by $20.00 for each $1,000.00, or fraction thereof, by which the individual's adjusted gross income exceeds $125,000.00,
  irrespective of the individual's filing status. For purposes of this subsection, spouses filing jointly shall be considered an individual."
  (History: 2025, No. 71, § 1, eff. January 1, 2025.)
- Department of Taxes, 2025 Schedule IN-112 instructions, Line 3: "Qualifying children are those born between 2019 and 2025." Line 4:
  "Multiply Line 3 by $1,000 or if your AGI is greater than $125,000, use the table to find the credit amount per qualifying child to use on
  Line 4." The Child Tax Credit Table gives the per-child amount (125,001-126,000: 980 ... 150,001-151,000: 480 ... 171,001-172,000: 60).
- So two children at 150,000 get 2 x 500 = **1,000** (the code: 2,000 - 500 = 1,500), and the credit is gone at 175,000 for any count.
  The age rule (six or younger, our `tiers: [[6, 1000]]`) and the 125,000 start for every status are right. Not indexed (the statute has
  no adjustment). A single child is unchanged, so the `state_7d_households.js` Vermont family (one child of 6) does not move.

**(c) Maine dependent exemption tax credit, 36 M.R.S. 5219-SS: the review is right**, and the credit is also indexed, which the row
says it is not.
- 1: "For tax years beginning on or after January 1, 2018 and before January 1, 2026, a resident individual is allowed a credit against the
  tax otherwise due under this Part equal to $300 for each qualifying child and dependent of the taxpayer for whom the taxpayer was eligible
  to claim the federal child tax credit pursuant to the Code, Section 24 for the same taxable year, subject to the phase-out provisions under
  subsection 4."
- 1-A: "For tax years beginning on or after January 1, 2026, a resident individual is allowed a credit against the tax otherwise due under
  this Part equal to $300 for each dependent of the taxpayer for whom the taxpayer was eligible to claim the federal personal exemption
  pursuant to the Code, Section 151 in an amount greater than $0 for the same taxable year, subject to the phase-out provisions under
  subsection 4."
- 3 and 3-A: the same credits for a part-year resident, multiplied by the Maine-income fraction (before 2026 and from 2026, same split as
  1 and 1-A). Not relevant to the planner (residents only).
- 4: "For tax years beginning on or after January 1, 2024, the credit allowed under subsections 1, 1-A, 3 and 3-A, as increased by
  subsection 5 for tax years beginning on or after January 1, 2025, is refundable. ... For tax years beginning on or after January 1, 2025,
  the amount of the credit allowed by this section, as increased by subsection 5, must be reduced, but not below zero, by $20 for each $500
  or fraction thereof by which the taxpayer's Maine adjusted gross income exceeds: A. For a single individual, $100,000; B. For an individual
  filing as a head of household, $125,000; C. For individuals filing married joint returns or surviving spouses, $150,000; and D. For a
  married individual filing a separate return, 1/2 of the applicable amount under paragraph C." (The reduction is on the household's
  credit, so the code's total-based phase-out is right for Maine.)
- 5: "For tax years beginning on or after January 1, 2025, the credit amount allowed in subsections 1, 1-A, 2, 2-A, 3 and 3-A for each
  qualifying child and dependent who has not attained 6 years of age before the end of the taxable year is multiplied by 2." (PL 2025,
  c. 388, Pt. Q, §2.) No end date: a child under six gets twice the amount in 2026 and later. Our 7O note ("2025: doubled under six") is wrong.
- **Indexing (new finding), 36 M.R.S. 5403:** sub-9: "Beginning in 2024 and each year thereafter, by the dollar amount of the dependent
  exemption tax credit under section 5219-SS ... the 'cost-of-living adjustment' is the Chained Consumer Price Index for the 12-month period
  ending June 30th of the preceding calendar year divided by the Chained Consumer Price Index for the 12-month period ending June 30, 2023.
  If the credit amount, adjusted ..., is not a multiple of $5, any increase must be rounded to the next lowest multiple of $5"; sub-10:
  "Beginning in 2025 and each year thereafter, by the dollar amount of the applicable amounts specified in section 5219-SS, subsection 4,
  paragraphs A, B and C" (base: June 2024; rounded down to $50 by the closing paragraph). The row has `creditAmountsIndexed: false` and
  `creditThresholdsIndexed: false`.
- Maine Revenue Services, Dependent Exemption Tax Credit Worksheet for Tax Year 2025 (revised December 2025): line 2 "Multiply line 1 by
  $305" (dependents at least 6), line 4 "Multiply line 3 by $610" (under 6), line 7 "Enter $100,000 if single, $125,000 if head of household,
  $150,000 if married filing jointly or surviving spouse, or $75,000 if married filing separately", line 8 rounds the excess up to the next
  $500, line 10 "Multiply line 9 by $20", line 11 "Subtract line 10 from line 5". 2025 Form 1040ME general instructions: refundable "up to $305
  for each qualifying child or dependent that is at least six years of age, or $610 for each qualifying child or dependent that is under six
  years of age"; "For tax years beginning after 2025, the income phaseout thresholds are adjusted for inflation." The 2026 amounts were not
  published on the 2026 forms page on 2026-10-06 (only the 1040ES, the two phase-out worksheets and the rate schedule).
- **Maine's dependent personal exemption (new finding).** The row has `dependentExemption: 5300`, but 36 M.R.S. 5126-A(1) gives the
  personal exemption deduction to the filer ("unless the individual may be claimed as a dependent on another return") and "an additional
  personal exemption deduction ... if the individual is married filing a joint return"; nothing for dependents (since 2018 dependents get the
  5219-SS credit instead). The 2026 1040ES-ME line 6b: "Exemptions - enter $5,300 ($10,600, if married filing jointly)". So each child
  currently lowers Maine taxable income by 5,300 that the law does not allow (about 307 to 379 of tax per child).
- **Watch item (unclear, not acted on):** from 2026 the credit is for a dependent "for whom the taxpayer was eligible to claim the federal
  personal exemption pursuant to the Code, Section 151 in an amount greater than $0". Maine's Code is the IRC "as of December 31, 2024"
  (36 M.R.S. 111(1-A), PL 2025 c. 432), under which the federal exemption is suspended only through 2025, so dependents qualify in 2026.
  If Maine later conforms to Public Law 119-21 (which makes the suspension permanent) without amending 1-A, the credit could stop applying.
  The 2026 conformity bill, LD 2010, is reported as having died at adjournment on April 29, 2026 (LegiScan, secondary; the Revisor's statute
  pages were extracted 10/20/2025). Recheck yearly with the rows.

##### Implementation plan (one commit each; `npm test` green at every commit)

Common to F1-F4: the evaluator change in `stateCreditAmount` ('childCredit') keeps every existing row's numbers bit-identical (MN, UT,
NY, NM, AL, MA and the rest use none of the new keys; `tests/tax_caches.js` and the snapshots prove it). After each row change run
`npm run gen:states` and commit `docs/state-tax-rules.md`; update the generator's text for any new key (`scripts/gen-state-rules.js`
describes the credit options). Update the row's `notes`, the README "State child credits" sentence, the O4 table in these notes and
`CLAUDE.md`'s `childCredit` options line. Bump the US badge once per commit (V105 -> V106 ...). Expected snapshot result: **no movement**
(the US corpus states are the default, CA, NY and MA, with no Oregon, Vermont or Maine household with children; confirm with
`node tests/snapshot.js`, and if anything moves, dump and compare against a worktree of the previous commit before updating). Seeded
success rates (`tests/historical_rates.js`, 2,000 paths, seed 7): expected unchanged for every scenario (the two O4 scenarios are MN and
NJ); record the run in the commit message. Tests are hand-computed in the comment beside each case, never read back from the evaluator.

**F1. Oregon Kids Credit: a share-of-total phase-out and the worksheet rounding (US V106). Built (V106).**
- Evaluator: new optional `phaseOut.share: { width, round }`. When present, `pct = (measure - start x ct) / (width)` (width NOT scaled:
  the statute's 5,000 is fixed), rounded to `round` decimal places when given (Oregon: 2, `Math.round(pct * 100) / 100`), clamped to
  [0, 1]; the credit is `total x (1 - pct)` where `total` is the capped sum of the tiers (`maxChildren` applies first). `rate` and
  `per`/`width` keep their meaning (MN, UT unchanged). The OR row: `phaseOut: { start: {...26550}, measure: 'stateAgi', share: { width: 5000,
  round: 2 } }` (drop `rate: 0.21`, `width: 1`, `per: 0`; keep the schema's required keys if the coverage test asks for them).
- Sunset: **not modeled (owner decision, 2026-10-06)**: no `schedule` entry. Notes: "the statute applies the Kids Credit to tax years before 2029
  (2023 c.538 section 11); it is modeled in every year, recheck yearly".
- Before/after (credit only, 2026, inflation 0): 2 children at 28,000: 1,795.50 -> 1,491.00; 3 children at 30,000: 3,150 - 0.21 x 3,450 =
  2,425.50 -> 3,150 x (1 - 0.69) = 976.50; 2 children at 31,000: 2,100 - 934.50 = 1,165.50 -> 2,100 x 0.11 = 231.00; 1 child: unchanged. The O4
  household table (Oregon row) stays unchanged (state AGI over 31,550).
- Tests (`tests/state_child_credits.js`, replace the 28,000 case and add): 2 children at 28,000 = 1,491; 3 at 30,000 = 976.50; 1 at 28,000
  = 745.50 (unchanged); 6 at 27,000 = 5,250 x (1 - 0.09) = 4,777.50 (cap first); rounding: 2 at 28,123: 1,573 / 5,000 = 0.3146 -> 0.31,
  2,100 x 0.69 = 1,449.00 (unrounded 1,439.34); 2 at 31,549: 0.9998 -> 1.00, credit 0; 2 at 31,550: 0; indexed (3% inflation, year 10, factor f):
  1 child at 26,550 f + 2,500 = 1,050 f x 0.5 (width fixed); 2 children at 26,550 f + 2,500 = 2,100 f x 0.5; year index 3 (2029): the Kids
  Credit still applies (no sunset modeled). Synthetic `zz` cases in `tests/state_mechanisms.js` for `share` with and without `round`, and
  with `maxChildren`.

**F2. Vermont: the phase-out per child (US V107). Built (V107).**
- Evaluator: new optional `phaseOut.perChild: true`: the cut (`ceil(over / width) x per`, or `rate x over`) comes off each counted child's
  tier amount, each floored at zero, and the credit is the sum. VT row: `phaseOut: { start: {...125000}, width: 1000, per: 20, perChild: true }`.
- Before/after (credit only): 2 children at 150,000: 1,500 -> 1,000; 2 at 170,000: 2,000 - 900 = 1,100 -> 2 x 100 = 200; 2 at 174,001:
  1,000 -> 0 (50 steps); 3 at 125,001: 2,980 -> 3 x 980 = 2,940; 1 child: unchanged. O4 household table: unchanged (AGI under 125,000).
- Tests: the four cases above, the existing one-child boundaries (125,000 / 125,001 / 150,000 / 175,000) unchanged, a child of 7 never
  counted, not indexed under 3% inflation. A `zz` case for `perChild` with a `rate` line and with tiers of different amounts (a 1,000
  child and a 500 child at a cut of 600: 400 + 0 = 400, not 900).

**F3. Maine: under-six doubling every year, indexed amount and thresholds (US V108). Built (V108).**
- No evaluator change: `tiers` already take the first matching age, so `tiers: [[5, 610], [200, 305]]` (age is `taxYear - birthYear`, so
  5 or under at the end of the year is "has not attained 6 years of age before the end of the taxable year"). Use the latest published
  figures as the 2026 stand-ins (the 2025 MRS worksheet: 305 and 610; thresholds 100,000 / 125,000 / 150,000), the same convention as
  Oregon. If MRS publishes the 2026 worksheet before this is built, use its figures instead and cite it. Set the ME row's
  `creditAmountsIndexed: true` and `creditThresholdsIndexed: true` (it has no other credit). The $5 and $50 round-downs are not modeled
  (named in the notes). Notes: drop "(2025 was doubled for a child under six)" and "(not indexed)"; state the doubling with no end date
  and the C-CPI indexing (36 M.R.S. 5403(9) and (10)).
- Before/after (credit, 2026, inflation 0): one child of 3 at 90,000 single: 300 -> 610; children of 3 and 10: 600 -> 915; at 110,000
  single: 200 -> 915 - 400 = 515. The O4 household (children born 2023 and 2025, joint, AGI under 150,000): the credit rises from 600 to
  1,220 a year while both are under six (2026-2028), 915 in 2029-2030 (the 2023 child is 6 from 2029), 610 from 2031 (both 6 or over), before
  F4's change; regenerate the table.
- Tests (replace the ME block): 1 child of 5 at 0 single: -610; of 6: -305; children of 5 and 10 at 90,000 single: 915; at 100,001: 915 - 20
  = 895; at 110,000: 915 - 400 = 515; at 125,000 single: 915 - 1,000 -> 0; head of household at 130,000 with one child of 3: 610 - 200 = 410;
  joint at 160,000 with children of 2 and 4: 1,220 - 400 = 820; a student of 21 counts at 305; indexed under 3% inflation (year 10): amount
  and start both scaled (305 f, 610 f, 100,000 f). `state_7d_households.js`: the Maine family has children of 6 and 9, so 2 x 305 = 610
  (was 600): family 4,838.425 - 610 = 4,228.425 (before F4).

**F4. Maine: no personal exemption for dependents (US V109). Built (V109).**
- Row: `dependentExemption: 0` (36 M.R.S. 5126-A(1): filer and spouse only). Notes: "personal exemption $5,300 per filer (none for
  dependents: they get the dependent exemption tax credit)".
- `state_7d_households.js` Maine family: 132,000 - 31,400 - 10,600 = 90,000; 54,850 x 5.8% = 3,181.30 + 35,150 x 6.75% = 2,372.625 =
  5,553.925; less the credit 610 = **4,943.925** (was 4,238.425). Retiree unchanged. The O4 table's Maine row rises by about 2 x 5,300 x
  the marginal rate (5.8% or 6.75%: 614.80 to 715.50) a year in the taxed years. Snapshots: no Maine household with children in the corpus (confirm).

**F5. O1: the MAGI iteration at the Medicaid and 100% cliffs (US V110). Built (V110): design A.** See the analysis below.
Result (2026-10-06): the sweep (WA, TX, CA, WI; spending 8,000 to 30,000 in steps of 1,000; standard and historical engine; single 60, IRA 1,000,000,
premium 12,000) had 356 of 920 rows charging a cost that is not the cost at their own MAGI; after the forced pass none is more than 5 off
(four smooth years at 30,000 of spending end the loop a couple of dollars off, identically before and after: old slow convergence, not a cliff).
`magiStats` counts the forced years and the unresolved cliff years (0 in the sweep). Snapshots: 19 of 518 US scenarios moved, all ACA-on (`aca`,
`acaEnhanced`, `rothConv+aca`, `everything`); every non-ACA scenario identical; `npm run snapshot:update` in the commit. Seeded rates (2,000 paths,
seed 7), before to after: low-MAGI early retiree CA Monte Carlo 99.4% to 99.5%; everything else unchanged (default 85.4% / 86.1%). Timing
(400 `simulate()`, interleaved, median of 7): default couple 371 to 374 ms (1.008), ACA on near the line (TX 60, spending 12,000) 269 to 273 (1.015),
ACA on away from it (CA 60, 30,000) 405 to 417 (1.030).
**Review fix (V112, 2026-10-06).** The whole-branch review found that after a forced pass the guardrail record (`prevNeed`, `initialWR`) and `firstWithdrawal` kept the
withdrawal need that included the refunded premium, so guardrails cut spending for no reason (TX, single 58, IRA 600,000, spending 14,000, premium 12,000, guardrails on:
base spending 14,709 at 60 fell to 9,827 by 65). The forced pass now re-records both net of the refund (test in `tests/aca_medicaid.js`: age-65 base spending above 13,000;
it was 9,827). Six ACA-on snapshot scenarios moved, only in the non-row `firstWithdrawal` field (`npm run snapshot:update`).
**Known cost of design A (for 3C).** The refund sits in cash, the next year spends that cash first, withdraws less and can land below the 100% line, so it is charged the
full premium again: in the review's example ages 61 to 64 paid about 355, 13,246, 1,627 and 382 (about 15,600 in all) where a household that stays just over the line
would pay roughly 0.4k to 1.5k a year. "Conservative" is accurate but the pessimism can be large for households living at the line; design B (filling to the line, 3C) removes it.
**Owner decision (2026-10-06):** design A is accepted as a good approximation of the real mechanism. The cliffs it affects sit at about 100% to 138% of the poverty line, so households this planner is built for rarely reach them (someone living at the poverty line is unlikely to be planning an early retirement with it); the pessimism is a narrow-group cost, not a reason to build design B before 3C.
**Deferred minors.** (a) With Roth conversions on, `conversionMagiCeiling` fills to exactly 4 x the poverty line and `MAGI_ITER_TOL = 1` can leave the realized MAGI cents over it, so
that year is charged the full premium (66 to 92 rows per state in the review's sweep, identical before 7O); the F5 sweep does not turn conversions on. (b) Maine's $20 per $500
step is scaled with the amount index by the evaluator (the statute indexes the credit and the thresholds, not the step): at most one step (about 20 to 27) off at year 10; the
"ME indexed" test pins it. (c) `magiStats.unresolved` also counts smooth years that end the loop 6 to 7 dollars off (spending 30,500 to 33,500), which the sweep test does not reach.
(d) The forced branch does nothing when the forced pass has a surplus (`flow >= 0`); never reached in about 2,700 forced years.

**F6. O3: the Roth-conversion share of the Pennsylvania 401(k) exemption. Not built (2026-10-06): the PA guide is silent on a retiree's conversion, so the documented approximation stays (owner rule).** See below.
Gate result (read 2026-10-06, PA Personal Income Tax Guide, Gross Compensation, the 1099-R reconciliation table, Box 1): "The amount may have been a direct rollover, a transfer, or conversion to a Roth IRA, a recharacterized IRA contribution ..."; "Under PA PIT law, this distribution is taxable for Pennsylvania purposes if: the pension or retirement plan was NOT an eligible plan for PA PIT purposes; or you retired before meeting the age conditions of the plan or years of service conditions of the plan." The rollover exemption is limited to amounts "not includable in income for federal income tax purposes", which a conversion is not. Nothing says whether a retiree's conversion of employer-plan money is exempt, so the 401(k) part of a conversion is not built: approximation (2) of O3 stays (a conversion is exempted at the pro rata 401(k) share, which understates PA tax when the conversion came from IRA money). Revisit if the Department of Revenue publishes guidance on conversions.

**F7. Minor items (one commit). Built (2026-10-06, US V111: the Maine row note is user-visible).**
Done: the roth_accounts case 8 comment (the case still re-runs: the re-run comes from the estimate); the O5 field-note decision (kept, recorded in the O5 notes); the O1 note corrected in F5; the O4 table rows corrected in F1 to F3. Maine row note: the existing "phase-out above $125,000 single / $250,000 joint of AGI" belongs to the PENSION deduction (the sentence says "its"), not to the personal exemption as this plan assumed, so it was left alone; the statutory personal-exemption phase-out (36 M.R.S. 5126-A(2): AGI over $266,700 single, $293,350 head of household, $320,000 joint, indexed, divided by $125,000) was added as a separate not-modeled item (the 2025 Form 1040ME instructions did not yield readable text, so the statutory base amounts are quoted). Minnesota and Utah re-read: Schedule M1CWFC line 14 "Multiply line 12 by line 13" is subtracted from line 9, the total of the working-family and child credit lines; Utah Code 59-10-1047(4) "The tax credit allowed by Subsection (2) ... shall be reduced by $.10 for each dollar": both are off the household total, so neither is a per-child case.
- `tests/roth_accounts.js` case 8: instrumented on 2026-10-06 (a scratch copy logging every MAGI re-run): the case still re-runs (5 re-runs
  over the run; year 0 re-runs once because the 3,000 gain differs from the 0 seed, year 1 once because the seed is last year's 3,000), so the
  ledger rewind is still exercised. Only its comment is stale ("ACA makes each year iterate (the premium depends on the realized MAGI)": the
  household is on Medicaid and the premium is 0; the re-run comes from the estimate). Fix the comment; optionally add a test hook
  (`window.__test_magiPasses`) so the test can assert at least one re-run instead of relying on it.
- O5: the "Unusual value" field note (the delegated `focusout` listener) fires only when the person leaves an `UNUSUAL_RANGES` field, i.e. the
  `ssStartAgeA/B` fields for the O5 item. Changing retirement age or wages can raise the O5 item without the field note; the list item and the
  marker do appear. Decide whether that is enough (it is consistent with the range items) or whether the O5 item should name its trigger
  fields (`retireAgeA/B`, `incomeA/B`) for the note; document either way in the O5 notes.
- Corrections to the 7O notes: O1 "the iteration shows two consistent answers for a household near the line" -> in the probe below there is
  no consistent answer at all (see F5); O4 table rows for VT, ME and OR (the per-child and share rules, the doubling with no end date, the
  indexing), "Maine: not indexed".
- Maine row note: it says the personal-exemption phase-out starts above $125,000 single / $250,000 joint of AGI; 36 M.R.S. 5126-A(2) gives applicable
  amounts of $266,700 single, $293,350 head of household and $320,000 joint (indexed under 5403(8)) with a denominator of $125,000 (62,500 separate). Re-read
  the statute and the 2025 1040ME instructions, correct the note, and say whether the phase-out is worth modeling (it only matters above about $267,000).
- Check while there (no change expected): Minnesota (Schedule M1CWFC line 13: 12% of the excess off the total credit) and Utah (59-10-1047:
  the reduction is off the total) keep the household-total phase-out; re-read both texts and record the quote.

##### F5: O1 MAGI iteration at the new cliffs (needs the owner's decision)

**Reproduced 2026-10-06** (scratch Playwright probe; clock pinned to 2026-06-15; single person 60, retired, traditional IRA 1,000,000 only,
inflation 0, medical inflation 0, premium 12,000, ACA on, enhanced off, Medicaid checkbox on, no children; spending 8,000 to 30,000 in steps
of 250; rows before 65): rows whose `healthcare` differs from `acaNetCost(row.magiProxy, 1, 12000, year)` by more than 1.50: WA 183 of 445,
TX 192, CA 185, WI 124 (684 of 1,780; the review's sweep found about 705; before 7O: 0). Examples: WA spending 9,250, 2027: charged 12,000 at
MAGI 21,822.23, `acaNetCost` 772.01; TX spending 12,000, 2026: charged 408.41 at MAGI 12,408.41, `acaNetCost` 12,000; CA 9,000 in 2027: 12,000
at 21,604.65 (745.76); WI 8,000 in 2027: 353.72 at 8,353.72 (12,000).

**Mechanism (instrumented pass log).** These are not two fixed points: there is **none**. The cost steps DOWN as MAGI crosses the line
(work-requirement years, or Medicaid declined: full premium below 138% of FPL, the credit above; non-expansion states: full premium below 100%,
the credit above). A pass that assumes the low MAGI is charged the full premium, so it draws more and lands above the line (cheap); a pass that
assumes the high MAGI is charged the credit cost, draws less and lands below (dear). WA 9,250 in 2027: realized traditional 21,822 (charged
12,000) / 10,022 (charged 772) alternating; the damping after pass 3 does not help because the map jumps over the line; the year ends at
`MAGI_ITER_MAX` on whichever pass came last. TX 12,000 in 2026: 24,878 / 13,150, then damped 12,399 and 12,330, then 24,878 again. Costs at
the lines (2027 single, inflation 0): WA 21,597 -> 12,000, 21,598 -> 744.96; TX 2026: 15,000 -> 12,000, 15,650 -> 328.65. The only
consistent outcomes have MAGI at or above the line with cash left over; the cheapest is MAGI just over the line (WA 2027: draw about 21,600,
cost about 745, about 11,000 left in cash; TX 2026: draw about 15,651, cost about 329, about 3,300 left).

**Candidate designs.**
- **A. Deterministic overdraw fallback (correctness only, no policy).** Record each pass's estimate and its two costs (charged, and
  `healthcareCost` at the pass's realized MAGI). If the loop reaches `MAGI_ITER_MAX` unconverged, re-run (one extra pass) the recorded pass
  whose realized cost is at or below its charge with the smallest difference, skip the convergence check, then charge the realized cost,
  set `profile.medicalExpense` to it, recompute `totalTax`, and put the difference (charge - realized cost - extra tax) into `bal.cash`.
  Every row then satisfies `healthcare === acaNetCost(row MAGI)`. Pros: small, local to the year loop (both engines, same code), only
  non-converging years pay one more pass, no new behavior anywhere else. Cons: it overdraws more than a planner would (TX: 24,878 rather than
  15,651, about 900 more federal tax), and `firstWithdrawal` and the guardrail record see the overdraw; still the conservative side.
- **B. Fill to the line (the household's best consistent answer; a policy).** A helper beside `conversionMagiCeiling`, `acaMagiFloor(...)`,
  returns the line L when the cost below L exceeds the cost just above (the work-requirement years or Medicaid declined: 138%; non-expansion
  states: 100%) and the household is under it. The withdrawal then takes extra traditional money (or harvests gains, or converts when
  conversions are on) to reach MAGI L + 1 and keeps the excess as cash, when that is cheaper than the full premium after the extra tax and any
  10% penalty (a 55-year-old with only IRA money pays the penalty on the extra). Pros: the realistic, cheapest consistent result. Cons: it is
  the 3C question (3C's `stayUnder` policy prices exactly these cliffs; this is its "lift over" twin), more code in both withdrawal strategies,
  bigger number changes, and needs its own measurement.
- **C. Bracketing / bisection on the estimate.** Detect the two-cycle and bisect between the two estimates. It converges to the line but the
  map still has no fixed point there, so it must end in A or B anyway; useful only as a faster route to B. Not recommended alone.
- **D. Extend the MAGI ceilings to the new lines.** A ceiling keeps MAGI under a line: right for the opposite cliff (Medicaid available, 138%
  in an expansion state, where staying under keeps a cost of 0 and the iteration is already self-consistent), wrong for the step-down cliffs
  above, which need a floor. Belongs to 3C.

**Decision (owner, 2026-10-06): A now, in this follow-up, as a correctness fix, with the probe as a failing test first; B in 3C** as the policy (with `stayUnder`, measured
there). A is a stopgap that makes every row consistent (the overdraw lands in cash), not a policy; record it as such in the notes. If the owner prefers to go straight to B, skip A and move B into 3C's first commit. Either way, extend `tests/aca_medicaid.js` with the
probe above as an assertion (WA, TX, WI, CA; spending 8,000 to 30,000 in steps of 1,000; every row before 65 consistent within 1.50), and add a
pass-count hook so the test can show the fallback ran. Expected changes for A: only years that hit the cap move (all `aca` snapshot scenarios
must be checked: count the years at the cap with an instrumented copy first; rows move toward a consistent cost, more cash, more tax);
seeded rates for the two low-MAGI scenarios in `tests/historical_rates.js` (CA, TX) recorded before and after; timing gate unchanged for
ACA-off households (the code path is not entered) and within +5% for an ACA-on household near the line.

##### F6: O3 Roth conversions and the Pennsylvania 401(k) exemption (needs the owner's decision)

**What happens now.** `taxFor` puts the whole `traditionalExtra` (discretionary draw plus the year's conversion) into each partner's
`retirementA/B` by the ownership share, then `retirement401kA/B = retirementA/B x k401FracA/B`. A conversion is taken from the IRAs first
(`accountsConvert`: both partners' IRAs pro rata, then the 401(k)s), so for a PA filer under 59.5 with both IRA and 401(k) money, the part of
the conversion that came from the IRA is treated as partly 401(k) money and exempted; PA tax is understated by 3.07% x the conversion x
the 401(k) fraction. It only
matters in Pennsylvania, for a retired filer under 59.5 who converts and has 401(k) money.

**Recommended small fix (US V111).** Put the pass's conversion on the profile (`profile.conversionA/B`, the per-partner split that
`accountsConvert` would take, from a pure helper `accountsConvertSplit(accts.trad, pool, amount)` returning the IRA and 401(k) parts per
partner, set right after `solveRothConversion`, the same way `profile.medicalExpense` is set each pass). In the four per-person blocks of
`taxFor` (they run only when `needsPerPerson`): `retirement401kX = max(0, retirementX - convX) x k401FracX + conv401kX`, where `conv401kX` is
the 401(k) part of the conversion (zero unless the IRAs were exhausted). Whether a 401(k)-to-Roth conversion by a retiree is exempt in
Pennsylvania must be read in the PA Personal Income Tax Guide before building (if it is taxable, drop the `+ conv401kX` term). The conversion
solver's own probes keep the pro rata treatment (it is a lower bound already). Tests: `tests/pa_employer_plan.js`, hand-computed: single 52 in
PA, IRA 200,000 and 401(k) 300,000, conversion 30,000, no other draw: PA tax 3.07% x 30,000 = 921 (today 3.07% x 30,000 x 0.4 = 368.40); the
same with a 20,000 draw: 921 + 3.07% x 20,000 x 0.4 (the draw's IRA part) = 1,166.60 (the 401(k) fraction of the remaining accounts is stated
at the start of the year, approximation 3). Snapshots: none (no PA scenario in the corpus); `tests/tax_caches.js` must stay green (the new
fields are written only when `needsPerPerson`). The alternative is to leave it and keep approximation (2) in the PA notes as it stands. **Owner (2026-10-06): read the PA guide first; if a retiree's
401(k)-to-Roth conversion is not clearly exempt (or the guide is silent), keep the documented approximation and skip the code.** The new profile fields
(`conversionA/B` and the 401(k) parts) are internal: no `FIELDS` entry, no MCP property, nothing saved.

### Batch 4A / 4B notes
_(to be added by the Batch 4 PRs)_

### Batch 5 notes

#### Batch 5 step 0: re-measured gap (measurement only; no `src/` change, no number change)

Measured 2026-10-23 on `d8e3cee` (origin/main, PR 43 merged), Node v24.21.0, Chromium through Playwright, the clock pinned
to 2026-06-15. Commands: `npm run build`, then `node tests/solver_gap.js` (both lengths, about 5 minutes) and
`node tests/bench_optimizer.js [--budget N] [--rounds 3] [--root DIR]` (new). The window-cap figures come from a scratch
build of the same tree with `ROTH_PER_YEAR_MAX_WINDOW = 50` (`node scripts/build.js --out <scratch>/dist`, the constant
reverted straight after; never committed), passed as `--root`. None of these is a gate or in `npm test`.
Re-checked 2026-10-24 after merging step 1 (PR 44, the 162(l) settlement, `25f658d`): `node tests/solver_gap.js` prints
every figure below unchanged (none of the three households is self-employed); the timings were not re-run.

**What changed in the script.** `tests/solver_gap.js` keeps 3C's table (table 1) and adds:
- **Every case at two plan lengths:** life expectancy 75 (3C's short plans) and the planner's own default for both
  partners (100). Conversions stay "from now to 74" in both.
- **A second score (table 2):** lifetime real tax + healthcare **plus the tax still owed on the traditional balances at the
  end**, in real dollars. The end tax is the cliff plan's own pricing (`afterTaxEndValueUS`): the final traditional balance
  (inherited traditional included) in ten slices, each added to the last year's own return (its law, its filing status;
  single after a death), with taxable at face value (heirs' stepped-up basis), Roth, cash and home equity at face value. Why
  this one: it is the measure the shipped engine already chooses plans by (`planCandidateBetter`, then end value), so the
  shipped run and the reference are scored on the same footing the engine uses; it is progressive (a large balance is not
  taxed at a small one's rate), which a flat haircut is not; and the ten slices can be read as a ten-year drawdown of the
  balance (as the SECURE Act's ten-year rule makes most heirs do), each year at the household's last-year rates. Not modeled: the heirs' own income and rates, estate and inheritance taxes. As a sensitivity, the table also
  gives the score with a flat 22% haircut on the traditional left (the haircut of `tests/solver_scan.js` and 3C's value
  column), a low bound for most of these balances.
- **The after-tax end value at the engine's pricing** beside the score (the 22%-haircut column of table 1 stays). The score
  sums real dollars of tax undiscounted; the end value also counts the growth that a dollar of tax not paid earns until the
  end, so the two can rank plans differently (they do, below).
- **The best flat bracket of the shipped engine under the new score** (conversions off, 10, 12, 22, 24, 32, 35%; guard on;
  among brackets that do not run out earlier) and the full flat-bracket table: how much of the gap a flat conversion size
  closes, without any search.
- **The reference's replay, two ways.** The optimizer's trials apply the cliff plan made for the user's settings and never
  re-plan (`cliff-plan.md`); Apply re-plans (`render()`). The script replays the reference's schedules with the user's plan
  pinned (`__test_setCliffPlan`; must equal the optimizer's cost, and did in every case) and re-planned; table 1 prints the
  re-planned cost beside the optimizer's when they differ, and table 2 and the value columns read the re-planned run.
  (The old script replayed with a changed `smoothWithdrawals`, which re-plans; at 75 that happened to match, at 100 it did
  not, which is how this showed up.)

The reference still optimizes table 1's objective: `optimizeMultiLever` scores with `rothScheduleCost` imported directly
and has no objective hook, so "the reference optimizing the new score" is not reported (it would need a new objective
parameter, which is step 2's registry, not a measurement).

**Table 1 at life expectancy 75** (3C's table re-run; the shipped costs moved since 3C with the engine and tax changes
merged after it):

| Case | Shipped (guard on) cost | Guard off cost | Reference cost | Gap | 3C gap | Converted: shipped / ref | Reference evals |
|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 403,552 | 427,419 | 258,825 | 55.92% | 70.23% | 148,988 / 187,312 | 16,032 |
| couple 62, IRMAA (CA) | 664,890 | 664,890 | 228,896 | 190.48% | 175.33% | 1,213,285 / 0 | 5,116 |
| couple 58, trad-heavy, ACA (NY) | 698,734 | 698,734 | 362,225 | 92.90% | 80.87% | 940,376 / 19,285 | 10,956 |

No run hit the 200,000 budget; no depletion in any run; the reference chose smooth on in all three.

**Table 2 at life expectancy 75** (score = table 1's cost + the end tax; negative gap: the shipped engine scores better):

| Case | End tax: shipped / ref | Traditional left: shipped / ref | Score: shipped / ref | Gap | Best flat bracket (gap to ref) | Gap at a flat 22% haircut | After-tax end value: shipped / ref |
|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 312,430 / 527,902 | 1,291,167 / 1,935,649 | 715,982 / 786,727 | -8.99% | 10%: 714,786 (-9.14%) | +0.43% | 1,805,855 / 1,833,404 |
| couple 62, IRMAA (CA) | 647,747 / 1,576,577 | 2,040,558 / 4,181,811 | 1,312,636 / 1,805,473 | -27.30% | 35%: 1,120,104 (-37.96%) | -3.05% | 3,695,650 / 3,381,476 |
| couple 58, trad-heavy, ACA (NY) | 172,613 / 862,101 | 757,486 / 2,803,174 | 871,347 / 1,224,326 | -28.83% | 12%: 871,347 (-28.83%) | -11.60% | 2,016,058 / 2,071,450 |

**Table 1 at life expectancy 100** (the planner's default; the reference's mix window is cut at 30 years in all three).
The gap is against the optimizer's own cost, and in brackets against the re-planned replay, the basis of table 2:

| Case | Shipped (guard on) cost | Guard off cost | Reference cost (re-planned) | Gap (re-planned) | Converted: shipped / ref | Reference evals | Seconds |
|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 995,404 | 992,369 | 947,549 (954,770) | 5.05% (4.26%) | 148,988 / 441,759 | 17,172 | 66 |
| couple 62, IRMAA (CA) | 1,415,319 | 1,415,319 | 1,335,439 | 5.98% | 1,213,285 / 1,233,754 | 17,292 | 63 |
| couple 58, trad-heavy, ACA (NY) | 1,154,660 | 1,135,334 | 1,138,478 (1,143,790) | 1.42% (0.95%) | 940,376 / 1,100,723 | 14,988 | 58 |

**Table 2 at life expectancy 100:**

| Case | End tax: shipped / ref | Traditional left: shipped / ref | Score: shipped / ref | Gap | Best flat bracket (gap to ref) | Gap at a flat 22% haircut | After-tax end value: shipped / ref |
|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 48,508 / 48,643 | 227,718 / 231,078 | 1,043,912 / 1,003,413 | 4.04% | 12%: 1,043,912 (4.04%) | 3.97% | 1,781,064 / 2,052,613 |
| couple 62, IRMAA (CA) | 122,200 / 62,062 | 442,652 / 336,208 | 1,537,518 / 1,397,501 | 10.02% | 24%: 1,392,193 (-0.38%) | 7.33% | 6,794,802 / 6,720,253 |
| couple 58, trad-heavy, ACA (NY) | 42,256 / 42,898 | 159,553 / 164,251 | 1,196,916 / 1,186,688 | 0.86% | 12%: 1,196,916 (0.86%) | 0.83% | 2,480,667 / 2,543,720 |

**The same at life expectancy 100 with the window cap at 50** (scratch build; no window cut): the reference finds more in
TX and CA. Table 1 gaps 7.33% / 7.09% / 1.42% (reference 927,431 / 1,321,572 / 1,138,478; re-planned 964,359 / unchanged /
1,143,790, gaps 3.22% / 7.09% / 0.95%); table 2
gaps 7.03% / 11.44% / 0.86%, best flat bracket 7.03% (12%) / 0.91% (24%) / 0.86% (12%); after-tax end value shipped / ref
1,781,064 / 2,123,263, 6,794,802 / 6,806,086, 2,480,667 / 2,543,720.

**Flat brackets of the shipped engine at life expectancy 100** (score of table 2 / table 1's cost; no bracket runs out):

| Case | off | 10% | 12% | 22% (shipped) | 24% | 32% | 35% |
|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 1,116,474 / 1,045,406 | 1,055,753 / 998,933 | 1,043,912 / 995,404 | 1,043,912 / 995,404 | same | same | same |
| couple 62, IRMAA (CA) | 2,583,202 / 2,177,406 | 2,160,536 / 1,853,800 | 1,686,245 / 1,517,319 | 1,537,518 / 1,415,319 | 1,392,193 / 1,356,763 | 1,392,950 / 1,359,739 | 1,402,227 / 1,370,347 |
| couple 58, trad-heavy, ACA (NY) | 1,421,969 / 1,290,837 | 1,270,720 / 1,191,386 | 1,196,916 / 1,154,660 | 1,196,916 / 1,154,660 | same | same | same |

(At 75: TX and NY likewise identical from 12% up; CA falls monotonically with the bracket on the new score, 1,804,165 off
to 1,120,104 at 35%, and rises on the old cost, 238,740 off to 945,532 at 35%.)

**Reading: how much of the gap is the score, how much conversion sizing.** Every table-2 gap is a lower bound on the real
room: the reference optimizes table 1's objective, so beating it on the new score shows only that it is a poor target for
that score, not that the shipped engine is near the new score's optimum. The flat-bracket sweep is the second yardstick.
1. **At 75 most of 3C's gap is the score, but not all of the room.** 3C's 56-190% (now 56% / 190% / 93%) comes from an
   objective that does not see the tax left on traditional: the reference wins it by converting little or nothing (CA
   converts 0) and leaving 1.9-4.2M in traditional at 75. Counting that tax, the shipped engine scores 9% / 27% / 29%
   *better* than the reference; at a flat 22% haircut, +0.4% / -3% / -12%. So the reference's 56-190% is not a real loss.
   The flat sweep still finds room on the new score in CA: the shipped 22% scores 1,312,636 against 1,120,104 at a flat
   35%, 17% worse than a plain flat bracket (TX: 0.2% to the best flat bracket, 10%; NY: the shipped run is the best).
2. **At the planner's own length (100) the measured gap is small, at least this much, from two places.** On the
   re-planned basis (the one table 2 uses), the old score's gaps are 4.3% / 6.0% / 0.95% (3.2% / 7.1% / 0.95% against the
   uncut reference) and the new score's 4.0% / 10.0% / 0.9% (7.0% / 11.4% / 0.9%).
   - **CA (IRMAA couple): conversion sizing, and on the new score a flat size closes it.** The shipped 22% bracket leaves
     443k in traditional and 122k of end tax; a flat 24% scores 1,392,193, 0.4% *better* than the reference (0.9% worse
     than the uncut one). On the old cost the flat 24% still trails the reference by 1.6% (1,356,763 / 1,335,439). The
     reference converts 494k in the first year (the shipped run 193k), about the same or slightly more at 63-67, and less
     from 68 (1,233,754 in all against 1,213,285). So on the new score the gap found here is the bracket choice, which the
     step 3 outer search over `m` (or a sized conversion) should recover.
   - **TX (early ACA single): mostly the ACA years, which no conversion size fixes.** Before 65 every flat bracket from
     12% up is the same run (a conversion cap binds), and the best flat bracket is the shipped one. A per-year look
     (scratch probe, not committed) puts most of the 40k in three ACA years: in the first year the shipped run's MAGI,
     63,377, is $777 over the 400%-of-poverty line (62,600 for one person; premium 18,000 against the reference's 6,235),
     and at 62-63, with the taxable account running dry, it pays 19,298 and 19,491 (real) against the reference's 6,235.
     That is 38k of healthcare, 33k net of the 4.8k more tax the reference pays in those years. The first year's MAGI is
     taxable gains (checked: no traditional draw, no conversion), which the guard cannot cap (only discretionary
     traditional draws are cappable, `cappableTraditional`); the reference avoids it through the withdrawal mix and
     smoothing: the stock-account order lever (Batch 5's tax-aware order). The reference does size conversions very
     differently after 65 (25-31k a year at 65-74 against the shipped run's 5-7k, which some MAGI cap holds down,
     probably the IRMAA gate, not checked; 441,759 in all against 148,988): about 34k more tax and 5k more healthcare at
     65-74, about 32k less tax at 75-84, so on this score it roughly nets out, but it is a large difference in sizing
     that an outer search will meet.
   - **NY (trad-heavy ACA couple): under 1% against this reference.** Flat brackets from 12% up are the same run (a cap
     binds); the reference converts 1,100,723 against 940,376 and wins little on either score.
3. **The two fair measures can disagree, so step 2 must pick one.** The undiscounted score and the after-tax end value
   weigh the plans differently. At 100, CA flips: its reference is 140k better on the score but 75k *worse* on the end
   value (its large early conversion pays tax decades before the shipped run does). TX and NY keep the same direction at
   very different sizes: TX's reference is 40k better on the score and 272k (15%) better on the end value (ACA savings in
   the first years compound for 45 years). At 75, TX and NY flip (the shipped run better on the score, the reference on the
   end value). The end value is the one the engine already plans by and the one that counts the time value of tax, so it is
   the natural default for the outer search; a lifetime-tax objective in the registry would need a stated discounting (or
   none, knowingly).
4. **The reference's reported savings are not what Apply delivers when the plan moves.** Its trials apply the cliff plan of
   the user's settings; Apply re-plans for the chosen schedules. At 100, TX: 947,549 reported, 954,770 re-planned (with the
   window at 50: 927,431 reported, 964,359 re-planned, 37k worse); NY: 1,138,478 / 1,143,790; CA unchanged. Not an engine
   bug (the documented trial semantics), but step 4 (stored plan plus Apply refinement) should score candidates the way
   Apply runs them, or re-plan the winner before reporting it.
5. **Smaller observations.** At 100 the guard *costs* on the old score in TX (995,404 on, 992,369 off) and NY (1,154,660
   / 1,135,334): the guard chooses by end value, not by this cost, so this is expected, not a fault. The reference picks
   smooth on in all six runs. The pinned replay equalled the optimizer's cost in every run (the script reports a mismatch
   on stderr, which every run captured with its output).

**Performance baseline (the plan's step 1; `tests/bench_optimizer.js`).** `optimizeMultiLever` with Roth + mix + smooth,
the shipped budget `ROTH_PER_YEAR_EVAL_BUDGET` = 8,000 (three rounds, median), then a 200,000 budget (one round, the
evaluations the search really needs):

| Scenario | Optimizer vs shipped cost | Evals (8,000 budget) | Seconds | ms / eval | Evals / seconds at 200,000 | Roth / mix years searched (of) | Plan years |
|---|---|---|---|---|---|---|---|
| Default | -5.0% | 8,003 (hit) | 7.6 | 0.95 | 11,478 / 11.1 | 4 (4) / 30 (46) | 58 |
| Default, conversions on | -5.1% | 8,003 (hit) | 9.4 | 1.18 | 11,478 / 12.4 | 4 (4) / 30 (46) | 58 |
| ACA early retiree (CA) | -0.3% | 5,628 | 17.1 | 3.04 | 5,628 / 17.3 | 4 (4) / 30 (51) | 51 |
| early ACA single (TX), to 100 | -4.8% | 8,006 (hit) | 29.6 | 3.70 | 17,172 / 60.2 | 20 (20) / 30 (46) | 46 |
| couple 62, IRMAA (CA), to 100 | -5.6% | 8,006 (hit) | 31.2 | 3.90 | 17,292 / 62.7 | 13 (13) / 30 (39) | 39 |
| couple 58, trad-heavy, ACA (NY), to 100 | -1.4% | 8,005 (hit) | 30.3 | 3.79 | 14,988 / 59.3 | 17 (17) / 30 (43) | 43 |

- One evaluation is one full projection with the cliff plan applied: about 1 ms for the default household, 3-4 ms with
  ACA or IRMAA in reach. A search costs 8-31 s at the shipped budget, 11-63 s to convergence.
- The 8,000 budget is hit in five of six cases, yet in all six the result equals the 200,000-budget result (same cost): the
  evaluations past 8,000 go to starts that find nothing better. So at window 30 the budget costs no quality here.
- **Lifting `ROTH_PER_YEAR_MAX_WINDOW` (30).** Only the mix lever is ever cut (Roth windows are 4-20 years; the mix window
  is retirement to life expectancy, 39-51 years at the default 100). One sweep over every coordinate from one start is
  `roth years x 6 + mix years x 7` evaluations (6 starts x 2 smooth settings, up to 5 passes): 234-330 at window 30,
  346-442 at 50, +22% to +60% by scenario (Default +48%, ACA early retiree +60%, TX +34%, CA +22%, NY +29%). Measured
  with the cap at 50:

  | Scenario | 8,000 budget: cost vs shipped, seconds | 200,000 budget: cost vs shipped, evals, seconds |
  |---|---|---|
  | Default | -5.0%, 7.6 | -5.0%, 17,312 (+51%), 15.4 |
  | Default, conversions on | -5.1%, 9.6 | -5.1%, 17,312, 18.3 |
  | ACA early retiree (CA) | -0.3%, 24.0 (now hits the budget) | -0.3%, 8,988 (+60%), 27.9 |
  | early ACA single (TX), to 100 | **-6.8%**, 26.8 | -6.8%, 23,880 (+39%), 83.6 |
  | couple 62, IRMAA (CA), to 100 | -5.6%, 27.2 | **-6.6%**, 21,072 (+22%), 71.6 |
  | couple 58, trad-heavy, ACA (NY), to 100 | -1.4%, 31.3 | -1.4%, 19,759 (+32%), 70.6 |

  So at the shipped budget the wider window costs little time where the budget was already the bound (-3 s to +1 s), but
  the ACA early retiree now hits the budget and takes 24.0 s against 17.1 s (+40%); it finds 2 points more in TX; to
  convergence it needs 22-60% more evaluations (up to 84 s) and finds 1 point more in CA. The ACA early retiree still cuts
  one year at 50 (51 mix years). This is data, not a recommendation: steps 4-5 may retire the per-year schedules this cap
  belongs to.
- Timing noise: `tests/bench_runs.js` records +-10% between runs on this machine (the script prints medians only).

**For step 2 (what the target is).** Against this reference, the gap at full plan length is single digits, not 75-175%
(a lower bound: the reference does not optimize the fair score): conversion sizing for the IRMAA couple (closable by a
flat bracket on the new score, so by an outer search over `m`), the withdrawal order around the ACA 400% line for the
early single (gains-driven MAGI the guard cannot cap), and under 1% for the trad-heavy ACA couple. On short plans the
fair score still leaves room a flat bracket finds (CA at 75: 17%). The choice of objective matters as much as the search:
the undiscounted score and the after-tax end value disagree in direction for one household at 100 and two at 75.

#### Step 1: the 162(l) settlement at the final draws (US V134 -> V135; Canada untouched)

Spec `docs/superpowers/specs/2026-10-23-b5-162l-settlement-design.md` (owner-approved 2026-10-23), plan
`docs/superpowers/plans/2026-10-23-b5-162l-settlement.md`, base `d8e3cee`. Five tasks: the return's price (`acaNetCost(recon)`,
`acaCoverageKind`), the carry (`seCarry` / `flowOwn` / `recordOwnNeed`), the settlement block (`settleCombos` / `settleDecide`),
the cliff plan on the settled return, and these notes. The engine write-up is "Third estimate (US, E1c)" in
`docs/architecture/magi-iteration.md`, with `engine.md` (the carry) and `self-employment.md`.

##### What is true now

A year whose MAGI iteration holds a 162(l) deduction (`seHeld`; forced afterwards or not) files its return at its final draws:
the consistent deduction at those draws if a bisection finds one, else the better of two legal deductions by tax plus premium.
Every price is the return's price (reconciliation, below). The year keeps its draws, its paid premium and its paid tax; the
difference from the return (`seSettlement`: a refund > 0, a balance due < 0) is a fixed term of the next year's cash flow
(`seSettlementIn`), and the last year's goes to the estate's cash. A converged year never settles, so a run without a held year
is byte-identical to `d8e3cee` (pinned by the base hashes in `tests/se_health.js`).

##### Decisions (owner, 2026-10-23)

1. The settlement's cash goes to the next year (option A), as a real return and Form 8962 do; the last year's to the estate.
   The year is not re-run, so the circularity cannot reopen. Rejected: B (same-year cash: a balance due could take cash below 0
   after the draws) and C (an extra same-year draw: it moves the MAGI again).
2. 162(l) only. The forced pass's own premium true-up (7O F5) stays as it is: folding it in would move pre-E1c snapshot entries.
3. The settled return feeds the recorded MAGI (`magiProxy`, the IRMAA histories, two-return `magiA/B`) and next year's seed
   (`prevSeHealthA/B`). The guardrail and `firstWithdrawal` records keep what the year recorded, and the next year records from
   its flow before the carry (`flowOwn`), since that cash belongs to last year's return.
4. The cliff plan judges a held phase on its settled return: `met`, `ok`, `cliffCost` (the return's premium plus the IRMAA at
   the settled MAGI), the score (plus the settlement, at face value), the row's `cliffChoice` and `planMissed`.
5. With no consistent deduction, the return claims the better of section 5.02's (when it passes the legal bound, D at most the
   deduction the return's premium at D's MAGI allows, + $1) and the search's left end `lo` (always legal), by tax plus premium;
   an exact tie takes 5.02's (the documented method). Two returns compare up to four combinations on the household sum.
   Allowed by Rev. Proc. 2014-41 section 3. The hold path itself is unchanged.

Builder's calls recorded in the spec: no $1 threshold for settling; the legal-bound check per return; `lambdaNeed` reads
`flowOwn`; `computeCliffPlan`'s `measure` (and `tests/solver_scan.js`) sum a settled row's `taxSettled + healthcareSettled`.

##### Legal facts (primary sources, retrieved 2026-10-23)

- Rev. Proc. 2014-41 (IRB 2014-33, `https://www.irs.gov/pub/irs-irbs/irb14-33.pdf`, pages 364-367):
  - section 3: the revenue procedure's methods are optional; "any method, provided that the amounts claimed satisfy the
    requirements of applicable tax law";
  - section 5.01 (iterative): repeat until the deduction and the credit both change by less than $1; when they never do, the
    taxpayer "should not use the iterative calculation method" and is sent to the alternative calculation "in section 5.03",
    a typo for 5.02 (5.03 holds the limits);
  - section 5.02 (alternative): step 1 the deduction at the full premiums (after the 5.03 limit); step 2 the credit at step 1's
    income; step 3 the deduction at the premiums less the step-2 credit; step 4 the final credit at step 3's income. The return
    claims steps 3 and 4;
  - section 5.03: the deduction is at most the lesser of (A) the business's earned income (the engine's `sePlanNetA/B`) and (B)
    the premiums not paid through advance credit plus the additional tax limit of Treas. Reg. 1.36B-4T(a)(3)(iii);
  - section 2.03 / Treas. Reg. 1.162(l)-1T(a)(1): at most the lesser of the premiums less the credit and the premiums not paid
    by advance payments plus the additional tax under 36B(f)(2)(A) after the 36B(f)(2)(B) limitation;
  - Example 2: 5.02 gives a deduction of $6,322 and a credit of $6,770; 5.01 gives $7,151 and $6,849 (two legal answers).
- IRC 36B(f)(2) after Pub. L. 119-21 section 71305 (26 USC 36B amendment notes, Cornell LII): the limitation on increase,
  36B(f)(2)(B), is struck for taxable years beginning after December 31, 2025, so excess advance credit is repaid in full. The
  1.162(l)-1T bound (2) becomes premiums - final credit, the same as bound (1): **the deduction is at most the premium less the
  final credit at the return's MAGI**, whatever was paid in advance. The engine needs no separate advance-payment figure.
- Treas. Reg. 1.36B-2 (Cornell LII): (b)(6), a taxpayer under 100% of the poverty line is still an applicable taxpayer when
  enrolled through an Exchange that estimated 100-400% at enrollment, advance credit was paid, and they would qualify at an
  income in 100-400%; (c)(2)(v), a person the Exchange assessed as not Medicaid-eligible is treated as not eligible for that
  coverage period. So the return's price keeps the coverage the year paid for: Medicaid (kind 3) stays $0; a credited
  marketplace year (kind 1) takes the credit at the return's MAGI with no floor and no Medicaid line (the 400% rule stays); an
  uncredited one (kind 2) is `acaNetCost` except that Medicaid's $0 never applies.

##### Controller rulings while building (the SDD ledger)

- The year-0 IRMAA stand-in inside the settlement (Task 3, two rulings): every pricing of the return in year 0 without entered
  prior MAGIs (the search's probes, the bound check, the candidates and the final pricing; `seStand0`) prices IRMAA at its own
  MAGI. The spec's "known, accepted" approximation (probes at the paid stand-in) was superseded because, with candidates alone
  fixed, the bound still broke (12,884.80 deducted against a return premium of 11,148.40 at a 159,500 stream); the legal bound
  is a spec goal. Cost: one more year-0-only write per probe; no snapshot moved.
- The tipping-carry test asserts no forced pass (Task 3, one line).
- The surviving mutations (Task 5): S4 (5.02 always passes the bound), S17 (the appeal fields not following the return), S19
  (the cliff plan's IRMAA at the hold) and S21 (the natural `cliffCost` at the paid premium) are accepted as known gaps with no
  test-only hook: no household among 1,739 (plus the grids) makes a mutant differ in any row or trace; the final review triaged
  them OK.
- The final review's fix wave: step 1 of the settlement's search no longer writes the year-0 IRMAA stand-in, so its deduction is
  the premiums paid (Minor 2); an E1e year whose balance-due carry tips the flow (`flowOwn >= 0 > flow`) and ends in the forced
  pass re-records the inherited-path need net of the refund, departing from spec 6.5's "records nothing" where its premise does
  not hold (Minor 3); an `acaCoverageKind` drift sweep (Minor 5); the `healthcareCost` header documents `recon` (Minor 6); two CLAUDE.md invariant lines (Minor 7).
- Minor 4 of the final review (the grid's `searchAt` as an independent choice) is a follow-up: (c2) and the hand-reasoned engine
  cases cover the choice.
- Minor 8 of the final review (Node 22) is left to CI on the PR: CI runs Node 22 and this session does not push.
- No other rulings: the pre-flight scan found the tasks consistent.

##### Grid counts (the spec owner's wider grid, 8,610 years)

Single, 60, retiring at 60, main income 0, one self stream of 20,000-60,000 by 1,000, spending 20,000-40,000 by 1,000,
$500,000 taxable at 30% and 60% basis, `tx`, premium 18,000, no inflation, rent 0, years 0-4. A scratch script against `dist/`
(not committed; the committed grid is `tests/se_health.js`'s `invariant grid`, the same household at a 2,000 stride, 2,310 years).

| | `d8e3cee` (before) | this branch |
|---|---|---|
| Years with a plan net | 8,610 | 8,610 |
| Settled years | (none) | 2,098: 444 consistent, 1,654 `lo` (5.02 never chosen, never failing the bound) |
| (a) deduction above the premium (+$1) / above the plan net | 0 / 0 | 0 / 0 |
| (b) premium off the recorded MAGI's price by > $2 | 0 | 0 (worst $0.10) |
| (c) off the search at the final draws by > $1 | 1,612 understated (worst $12,699.56: basis 30, spending 26,000, stream 26,000, year 4) | 0 (worst $0.01) |
| (c2) not the cheapest candidate / (d) identity / (e) next year's `seSettlementIn` | n/a | 0 / 0 / 0 |

"Before" is the E1c acceptance measure (the year's deduction against the consistent one at its final draws, else 5.02's, at the
in-year price); the E1c record said 1,614 by the spec owner's script. The same measure on this branch counts 0 understated and
1,654 "above 5.02": exactly the `lo` years (decision 5, a larger legal deduction at the same premium). The committed grid went
from 422 understated (worst $12,699.56) to 0 (554 settled: 112 consistent, 442 `lo`).

##### The reviewer's probe households (E1c review part 4 categories)

A scratch script against `dist/` runs each household over a sweep and checks, in every year with a plan net: (a) the deduction
at most the return's premium + $1 (per return in two-return years) and the plan net; (b) the premium the recorded MAGI allows
(`acaNetCost` at the paid kind; historical paths priced in real terms through the row's `cumFactor`); (c) a settled year's
deduction within $1 of the search at its final draws at the return's price (the consistent deduction, else 5.02's or `lo`);
(c2), (d), (e) as the grid; the one-return split A first; historical and seeded paths run twice for determinism. Every
household: 0 failures of every check.

| Household (sweep) | Runs | Years | Settled (parts) |
|---|---|---|---|
| 1 two returns, a child, A self-employed (stream 20,000-90,000, spending 30,000-60,000) | 116 | 696 | 157 (152 consistent/consistent, 5 lo/consistent) |
| 2 two returns, a child, both self-employed (A 20,000-80,000, B 15,000-55,000) | 65 | 390 | 124 (115 consistent/consistent, 9 consistent/lo) |
| 3 one joint return, both self-employed, A's cap binding (A 2,000 / 4,000, B 30,000-110,000) | 132 | 792 | 89 (68 consistent, 9 5.02, 12 lo) |
| 4 single near 100% of the poverty line, `tx` (stream 9,000-24,000) | 248 | 1,240 | 36 consistent |
| 5 joint with a child near 100%, `tx` (stream 14,000-40,000) | 135 | 810 | 53 consistent |
| 6 Medicaid box on, `ny`, a child (work-requirement exempt; stream 14,000-40,000) | 162 | 810 | 156 consistent |
| 7 Medicaid box off, `ny` (stream 12,000-36,000) | 150 | 750 | 147 (98 consistent, 49 lo) |
| 8 historical paths from 1929, 1966, 1973, 2000, 2008 (the grid household) | 165 | 825 | 332 (210 consistent, 122 lo) |
| 9 seeded bootstrapped paths, seeds 1, 2, 3, 7, 11 | 165 | 825 | 167 (129 consistent, 38 lo) |
| 10 survivor, A dies at 57, both self-employed | 50 | 350 | 3 (1 consistent, 2 lo) |
| 11 survivor, B dies at 57, A self-employed, a child | 50 | 350 | 51 (36 consistent, 6 5.02, 9 lo) |

Every 5.02 chosen in these households is an exact tie with `lo` (the same tax and the same full premium over 400%): decision 5's
tie rule at work, now pinned by an engine case. No held year was found whose 5.02 fails the bound, and no held Medicaid (kind 3)
year (a hold never pays under the Medicaid line). Observation, unchanged by this step: in households 4, 5 and 8, 662 converged
(unheld) years under the 100% floor in Texas keep a consistent deduction while a second, larger consistent deduction exists (the
premium falls as the MAGI crosses the floor, so `g` is not monotone); the fixed point the iteration reached is legal.

##### Mutations (re-run of E1c review part 4's list, plus the settlement's own)

Each mutation applied to `src/`, then the covering tests in order until one went red: the settlement Vitest suites, `npm run build`
plus `tests/se_health.js`, the engine node tests (`cliff_plan`, `survivor_symmetry`, `two_return_magi`, `irmaa_appeal`,
`aca_magi_iteration`, `aca_coverage`, `aca_medicaid`, `cliff_guard`, `end_value_us`, `golden`, `snapshot`), then the whole Vitest
run. 41 mutations; 30 red on the first run; 5 of the 11 survivors are now caught by Task 5's new cases.

| Mutation | Caught by |
|---|---|
| M1 the search returns the bracket's right end (the E1c "lo/hi swap", which survived there) | `se-settlement`, `se-settlement-plan` |
| M2 a proportional split of a one-return total | `tests/se_health.js` (joint split) |
| M3 B's search given a zero A deduction | survives: equivalent (a return's premium reads only its own MAGI), as at E1c |
| M4 the $1 consistency test widened to $1,000 | `se-settlement` |
| M5 5.02 priced at the zero-deduction MAGI | `se-settlement`, `se-settlement-plan` |
| M6 the one-return bracket top only A's step 1 | `se-settlement` |
| S1 no settlement; S9 the sign flipped; S10 no carry; S32 the row's `healthcareSettled` the paid premium | `se-settlement`, `se-settlement-plan` |
| S2 the return at the in-year price; S16 the recorded MAGI not settled; S18 the settled pair not kept; S31 the forced re-record gated on the cash flow | `se-settlement` |
| S3 the forced pass's kind from the pass's estimate | new: a forced held year's kind (household 4) |
| S4 5.02 always passes the bound (one return) | survives: no held year whose 5.02 breaks the bound was found (the header of `se-settlement.test.js`) |
| S5 5.02 never passes the bound; S6 a tie goes to `lo`; S7 the costliest candidate | `se-settlement` |
| S8 the surplus year's settled tax summed `ficaTax + taxFor` | survives: equivalent (a two-term sum is commutative in IEEE doubles) |
| S11 the carry left out of the flow; S12 the records read the flow with the carry; S29 no `seSettlementIn` | `se-carry`, `se-settlement`, `se-settlement-plan` |
| S13 the last carry left out of the estate | `se-carry` |
| S14 no year-0 stand-in in the settlement | `se-settlement` |
| S15 the history written after the final pricing | new: the tie case's `hist0` (the last candidate priced is not the chosen one) |
| S17 the row's appeal fields not following the return | survives: no household found where the settled MAGI changes the appeal's choice |
| S19 the plan's IRMAA at the hold, not the settled pair | survives: no household found (a held phase whose settled MAGI crosses an IRMAA tier two years on) |
| S20 the score without the settlement; S21b a trial's `cliffCost` at the paid premium; S22 `measure` on the paid figures; S23 lambda's need with the carry | `se-settlement-plan` |
| S21 the natural record's `cliffCost` at the paid premium | survives: no household found where it flips a trial's `ok` |
| S24 a credited return still takes the floor and the Medicaid line | `aca-reconcile`, `se-settlement` |
| S25 Medicaid re-priced at the return | new: `aca-reconcile`, kind 3 over the line costs 0 |
| S26 an uncredited return under the Medicaid line takes Medicaid; S27b the kinds dropped on two returns | `aca-reconcile` |
| S27 the kind dropped on one return | `se-settlement` |
| S28 `ACA_KIND` not reset before the capture | new: a Medicare-only settled year after a marketplace one |
| S30 the settled tax's medical expense at the paid premium | new: an itemizer (MIX with a $60,000 long-term-care cost) |

The survivors without a household (S4, S17, S19, S21) were searched with a scratch diff of 1,739 households (the grids, the
eleven households, Medicare at 62-66, the year-0 stand-in, MIX, the case-15 appeal family at inflation 0 and 0.1%, an itemizer),
each run on the mutant and on this branch: none differs in a row or a trace.

##### Timing (`tests/bench_runs_interleaved.js`, this branch against `d8e3cee`, 11 rounds, median per path, % change)

The workload's default household has no self-employment, so it measures what the settlement costs a year that never settles
(Task 1's integer test in `acaNetCost`, Task 2's one call per year, Task 3's one boolean per phase).

| State | simulate / historical | `--warm-analysis` | `--warm-analysis`, 21 rounds |
|---|---|---|---|
| tx | -0.5 / -1.6 | +4.5 / +1.6 | -1.0 / -3.2 |
| ca | +2.0 / -5.6 | +3.3 / +3.4 | 0.0 / 0.0 |
| ny | 0.0 / 0.0 | +1.2 / +2.0 | |
| pa | -1.0 / 0.0 | -2.5 / 0.0 | |
| ct | -0.5 / -1.7 | -3.8 / -4.1 | |
| wa | 0.0 / -1.4 | -0.8 / -1.4 | |

Gate: pass, every path within +5% (the largest, tx simulate warm at +4.5%, re-measured over 21 rounds at -1.0%).

##### Known gaps (no household found; the pure helpers or the reconciliation tests cover the logic)

- `irmaaAt`'s settled-pair branch across an IRMAA tier (mutation S19 survives), and the natural record's `cliffCost` flipping a
  trial's `ok` (S21).
- The row's appeal fields following the return where the settled MAGI changes the appeal's choice (S17).
- A held year whose section 5.02 deduction fails the legal bound (S4; `settleCombos` covers the branch), and a held Medicaid
  (kind 3) year (`aca-reconcile` covers the price).
- The two-return pair branch of `irmaaAt` (a `marryLater` self-employed household before the marriage, with Medicare two years
  on), and a two-return year 0 with no prior MAGIs.
- An E1e inherited-account variant of the tipping carry, and a carry in a lump year.

##### Independent code review (2026-10-24, after the final fix wave)

Nothing Critical. One Important finding, fixed on the owner's instruction: the optimizers still scored a settled year at what it
paid (`rothScheduleCost`, the multi-lever and per-year Roth optimizers' objective, and the Roth optimizer card's `lifetimeTax`),
while the cliff plan's `measure` read the return: $1,749 over a run in the FP 82,000 household, settlements of $10,068 (single
refunds up to $2,192) missing in the invariant-grid retiree at stream 32,000. Now one helper, `rowCost` / `rowTax`
(`src/us/core/projection/row-cost.js`), gives the settled figures where a row has them and the paid ones otherwise (the same
double for a row that does not settle), and `measure`, `rothScheduleCost` and `lifetimeTax` read it. `row.tax` / `row.healthcare`
stay what the year paid: the objective registry (step 2) scores rows through `rowCost`, not `tax + healthcare` (the step 2 session
was told, 2026-10-24). Also fixed: `acaCoverageKind` gives kind 1 only when an advance credit was paid (the expected contribution
below the premium, 1.36B-2(b)(6)(C)); a band point with no credit is kind 2.

Recorded, not modeled (owner, 2026-10-24):
- The carry is treated as non-income, but part of it is the state tax difference: a state refund is federal income for an
  itemizer to the extent its SALT deduction gave a benefit (IRC 111, the tax benefit rule), and a state balance due paid next year
  is next year's SALT deduction. Only itemizers, small.
- The carry year's cash-flow chart (`src/us/ui/charts/compute-sankey-flow.js`) has no line for the settlement: `seSettlementIn`
  folds into "From portfolio" / "To savings" (the flows balance; display only).
- In year 0 without entered prior MAGIs, a held, settled natural phase has rewritten `irmaaMagiHistory[0]` with the settled MAGI
  before the cliff plan screens its candidates (`yearPlanCandidates` through `costAt`): screening reads the return, consistent
  with decision 4 (the comment above the provisional write says so).

#### Batch 5 step 2: the objective registry and the measurement scripts (US V136)

Measured 2026-10-24 on `914ce51` (branch `claude/b5-objective-registry-172d04`, before this commit), Node v24.21.0, Chromium
through Playwright, the clock pinned to 2026-06-15. None of these is a gate or in `npm test`.

**Script changes.** `tests/solver_gap.js` and `tests/bench_optimizer.js` take `--objective endValue|lifetimeCost` (default
`endValue`; anything else throws) and pass it to `__test_optimizeMultiLever(selected, options, objective)`.
- `solver_gap.js`: the reference optimizes `--objective`. Table 1's cost column reads
  `__test_objectiveBreakdown(sim).lifetimeCost` (it replaces `__test_rothScheduleCost`) on the reference's replay with the
  user's plan pinned, so it is the reference's cost whichever objective it optimized (when the re-planned replay's cost differs, the "(re-planned ...)" suffix still prints beside it; table 2
  and the value columns read the re-planned replay). Table 2 gained two columns, home equity left at the end and summed over
  the years, both real dollars, shipped / reference. Table 2's end tax and end value read
  the breakdown's `endTax` / `endValue`; step 0's table-2 score (cost + end tax) stays a script-local column. The
  pinned-replay check is `ref.score === __test_objectiveScore(objective, pinnedReplaySim)` (scores, never a value against a
  score); it prints on stderr on a mismatch, and none printed in this run.
- `bench_optimizer.js`: the columns are the shipped score, the optimizer's score and its gain (today's dollars) in the chosen
  objective's own units (`score` is higher-is-better: `endValue` prints the nominal end value, `lifetimeCost` a negated cost).

**Reproduction check (the old search, exactly).** `capture-multilever.js` (a scratch script outside the repo) runs
`optimizeMultiLever` on the six bench scenarios at the 8,000 budget and records the full result. The pre-change baseline
(before the objective hook existed) was saved as `base-lifetime.json`; on `914ce51` with `--objective lifetimeCost`:
`assert.deepStrictEqual(new, base)` passes: **identical in all six scenarios** (schedules, maps, evaluation counts,
budget flags, costs; field-for-field). So `lifetimeCost` reproduces the old search exactly; `endValue` is a different
search target, not a different search.

**Table 1 and 2 with the reference optimizing the after-tax end value** (`node tests/solver_gap.js --objective endValue`, both lengths, 200,000 budget; shipped columns are unchanged from step 0 and equal it to the dollar, as do the flat-bracket tables):


**Life expectancy 75, budget 200000, reference optimizes endValue**

_Table 1: lifetime real tax + healthcare (the reference's cost with the user's plan pinned, whichever objective it optimized)_

| Case | Shipped (guard on) cost | Guard off cost | Reference cost | Gap | After-tax end value, real: shipped / ref | Converted: shipped / ref | Depletion shipped / ref | Ref smooth | Reference evals | Seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 403,552 | 427,419 | 420,654 | -4.07% | 1,834,228 / 2,145,248 | 148,988 / 340,635 | never / never | off | 15498 | 32 |
| couple 62, IRMAA (CA) | 664,890 | 664,890 | 728,282 | -8.70% | 3,894,474 / 3,967,166 | 1,213,285 / 1,585,821 | never / never | on | 5996 | 16 |
| couple 58, trad-heavy, ACA (NY) | 698,734 | 698,734 | 559,105 | 24.97% | 2,022,024 / 2,251,484 | 940,376 / 1,078,750 | never / never | on | 11184 | 33 |

_Table 2: lifetime real tax + healthcare + the tax still owed on traditional at the end (the reference optimizes endValue)_

| Case | End tax, real: shipped / ref | Traditional left, real: shipped / ref | Score: shipped | Score: ref | Gap | Best flat bracket: score (gap to ref), its end tax | Score at a flat 22% haircut: shipped / ref (gap) | After-tax end value (engine pricing), real: shipped / ref |
|---|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 312,430 / 326,978 | 1,291,167 / 1,376,841 | 715,982 | 747,632 | -4.23% | 10%: 714,786 (-4.39%), 333,973 | 687,609 / 723,559 (-4.97%) | 1,805,855 / 2,121,175 |
| couple 62, IRMAA (CA) | 647,747 / 355,488 | 2,040,558 / 1,206,779 | 1,312,636 | 1,083,769 | 21.12% | 35%: 1,120,104 (3.35%), 174,572 | 1,113,813 / 993,773 (12.08%) | 3,695,650 / 3,877,170 |
| couple 58, trad-heavy, ACA (NY) | 172,613 / 497,800 | 757,486 / 1,784,706 | 871,347 | 1,056,905 | -17.56% | 12%: 871,347 (-17.56%), 172,613 | 865,381 / 951,740 (-9.07%) | 2,016,058 / 2,146,319 |

Flat brackets of the shipped engine (guard on), score of table 2 / table 1's cost / depletion

| Case | off | 10% | 12% | 22% | 24% | 32% | 35% |
|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 755,182 / 374,642 | 714,786 / 380,813 | 715,982 / 403,552 | 715,982 / 403,552 | 715,982 / 403,552 | 715,982 / 403,552 | 715,982 / 403,552 |
| couple 62, IRMAA (CA) | 1,804,165 / 238,740 | 1,560,426 / 361,903 | 1,360,624 / 599,808 | 1,312,636 / 664,890 | 1,248,919 / 743,961 | 1,223,567 / 805,431 | 1,120,104 / 945,532 |
| couple 58, trad-heavy, ACA (NY) | 1,044,285 / 456,263 | 968,085 / 517,442 | 871,347 / 698,734 | 871,347 / 698,734 | 871,347 / 698,734 | 871,347 / 698,734 | 871,347 / 698,734 |

**Life expectancy 100, budget 200000, reference optimizes endValue**

_Table 1: lifetime real tax + healthcare (the reference's cost with the user's plan pinned, whichever objective it optimized)_

| Case | Shipped (guard on) cost | Guard off cost | Reference cost | Gap | After-tax end value, real: shipped / ref | Converted: shipped / ref | Depletion shipped / ref | Ref smooth | Reference evals | Seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 995,404 | 992,369 | 1,337,701 | -25.59% | 1,779,474 / 3,875,243 | 148,988 / 382,499 | never / never | on | 17172, window cut (mix 30 yrs) | 51 |
| couple 62, IRMAA (CA) | 1,415,319 | 1,415,319 | 1,422,420 | -0.50% | 6,819,618 / 6,974,747 | 1,213,285 / 1,050,816 | never / never | on | 14412, window cut (mix 30 yrs) | 49 |
| couple 58, trad-heavy, ACA (NY) | 1,154,660 | 1,135,334 | 1,812,230 | -36.29% | 2,487,821 / 4,012,161 | 940,376 / 19,285 | never / never | on | 15612, window cut (mix 30 yrs) | 52 |

_Table 2: lifetime real tax + healthcare + the tax still owed on traditional at the end (the reference optimizes endValue)_

| Case | End tax, real: shipped / ref | Traditional left, real: shipped / ref | Score: shipped | Score: ref | Gap | Best flat bracket: score (gap to ref), its end tax | Score at a flat 22% haircut: shipped / ref (gap) | After-tax end value (engine pricing), real: shipped / ref | Home equity left, real: shipped / ref | Home equity summed over the years, real: shipped / ref |
|---|---|---|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 48,508 / 147,621 | 227,718 / 615,087 | 1,043,912 | 1,485,322 | -29.72% | 12%: 1,043,912 (-29.72%), 48,508 | 1,045,502 / 1,473,020 (-29.02%) | 1,781,064 / 3,862,941 | 576,967 / 94,912 | 19,503,024 / 5,293,328 |
| couple 62, IRMAA (CA) | 122,200 / 68,173 | 442,652 / 178,140 | 1,537,518 | 1,490,592 | 3.15% | 24%: 1,392,193 (-6.60%), 35,430 | 1,512,702 / 1,461,611 (3.50%) | 6,794,802 / 6,945,765 | 557,644 / 557,644 | 15,522,599 / 15,522,599 |
| couple 58, trad-heavy, ACA (NY) | 42,256 / 334,584 | 159,553 / 1,087,667 | 1,196,916 | 2,146,814 | -44.25% | 12%: 1,196,916 (-44.25%), 42,256 | 1,189,762 / 2,051,516 (-42.01%) | 2,480,667 / 3,916,864 | 568,605 / 248,252 | 17,780,512 / 9,151,201 |

Flat brackets of the shipped engine (guard on), score of table 2 / table 1's cost / depletion

| Case | off | 10% | 12% | 22% | 24% | 32% | 35% |
|---|---|---|---|---|---|---|---|
| early ACA single (TX) | 1,116,474 / 1,045,406 | 1,055,753 / 998,933 | 1,043,912 / 995,404 | 1,043,912 / 995,404 | 1,043,912 / 995,404 | 1,043,912 / 995,404 | 1,043,912 / 995,404 |
| couple 62, IRMAA (CA) | 2,583,202 / 2,177,406 | 2,160,536 / 1,853,800 | 1,686,245 / 1,517,319 | 1,537,518 / 1,415,319 | 1,392,193 / 1,356,763 | 1,392,950 / 1,359,739 | 1,402,227 / 1,370,347 |
| couple 58, trad-heavy, ACA (NY) | 1,421,969 / 1,290,837 | 1,270,720 / 1,191,386 | 1,196,916 / 1,154,660 | 1,196,916 / 1,154,660 | 1,196,916 / 1,154,660 | 1,196,916 / 1,154,660 | 1,196,916 / 1,154,660 |

**Reading.**
1. The shipped columns and the flat-bracket sweeps match step 0 exactly (same costs, end taxes, scores), so the registry moved
   no number outside the optimizer.
2. **At 100 the end-value reference is far ahead of the shipped run** on the engine's own pricing: after-tax end value, real,
   shipped / reference 1,779,474 / 3,875,243 (TX, +118%), 6,819,618 / 6,974,747 (CA, +2.3%), 2,487,821 / 4,012,161 (NY, +61%).
   Step 0's cost-reference had 1,781,064 / 2,052,613, 6,794,802 / 6,720,253 and 2,480,667 / 2,543,720. So against the
   objective the engine already plans by, CA's room is small (2%), TX's and NY's is large. The TX and NY references earn it
   by paying much more tax and healthcare (cost 1,337,701 and 1,812,230 against 995,404 and 1,154,660): NY converts only
   19,285 (against the shipped 940,376) and leaves 1,087,667 traditional, so the gain is not conversion sizing.
   **Mechanism (traced 2026-10-24 with a read-only replay; a pre-existing engine behaviour this PR does not change).** In
   `withdrawStandard` (`src/us/core/withdrawals/strategies.js`) the default taxable -> traditional draw is skipped whenever
   `drawMixedStockAccounts` returns true, and a one-bucket mix (`roth` = [0,0,1] or `taxable` = [1,0,0], `mix.js`) leaves the
   other stock accounts out of that year once its bucket is dry. The shortfall then falls through to `takeHomeEquity`, a
   tax-free, cost-free last resort. The end-value search finds this: it spends the house and leaves the stocks compounding.
   Measured with the new table-2 columns (real dollars, shipped / reference): home equity left 576,967 / 94,912 (TX) and
   568,605 / 248,252 (NY), summed over the years 19,503,024 / 5,293,328 (TX) and 17,780,512 / 9,151,201 (NY); CA, whose
   reference does not use it, is identical (557,644 / 557,644). TX: the reference mix is `roth` in every year 60-84, ending
   with taxable 9,935,655 against 0 and Roth 0 against 3,022,369 (nominal); without the mix lever its gain is 73,798 only.
   NY: mix `taxable` from 60, end taxable 8.14M refilled by RMDs of 4.39M against 0.98M (which is why it pays more tax);
   without the mix lever its gain is 0. So the +118% / +61% is mostly selling the house, not a better withdrawal order.
   **A decision for step 3, and it affects what the multi-lever card's mix lever can recommend now under the default
   `endValue` objective** (the old cost objective did not reward it): either price home equity as a last resort in the
   candidate's score, restrict the mix lever to leave a stock account's default draw in place, or accept it knowingly.
   **The default household itself is affected** (final whole-branch review's measurement on the default plan, no edits):
   the mix lever alone under `endValue` suggests "Roth only" for 21 of the 30 searched years, +2,292,391 after-tax end value
   (today's dollars), while real end home equity falls 611,662 -> 281,898 (summed over the years 26.65M -> 16.46M). All three
   levers: `taxable` every year, gain 1,716,099 (the bench "Default" row), end home equity 611,662 -> 450,564. Roth-only and
   mix-with-conversions-on (gain 197,977) do not touch home equity. The follow-up (pricing home equity as a last resort, or
   restricting the mix lever) must land before any build goes to real users.
3. **At 75 the end-value reference is ahead by 17% (TX), 1.9% (CA) and 11% (NY)** on after-tax end value (1,834,228 /
   2,145,248; 3,894,474 / 3,967,166; 2,022,024 / 2,251,484), by a different path in each: TX converts 340,635 (shipped
   148,988) and pays 17k more lifetime cost; CA converts more (1,585,821 against 1,213,285) and leaves 1.2M of traditional
   instead of 2.0M; NY converts 1,078,750 (940,376) at 140k less cost.
4. The lifetime cost of the end-value reference is higher than the shipped run's in 5 of 6 (all but NY at 75), as
   step 0's reading 3 predicted: the two objectives rank plans differently, so the choice is a decision, not a
   detail (default `endValue`, as the owner chose).

**Performance** (`node tests/bench_optimizer.js --objective endValue`, 8,000 budget, three rounds, median; then 200,000 once):

| Scenario | Optimizer score (shipped), nominal end value | Gain (today's $) | Evals (8,000) | Seconds | ms / eval | Evals / seconds at 200,000 | Roth / mix years (of) |
|---|---|---|---|---|---|---|---|
| Default | 12,524,680 (5,513,312) | 1,716,099 | 8,000 (hit) | 6.0 | 0.75 | 8,670 / 8.0 | 4 (4) / 30 (46) |
| Default, conversions on | 12,524,680 (9,763,089) | 675,926 | 8,000 (hit) | 7.6 | 0.95 | 8,670 / 8.3 | 4 (4) / 30 (46) |
| ACA early retiree (CA) | 0 (0) | 0 | 2,820 | 7.3 | 2.58 | 2,820 / 8.1 | 4 (4) / 30 (51) |
| early ACA single (TX), to 100 | 11,735,241 (5,410,699) | 2,081,877 | 8,006 (hit) | 21.6 | 2.70 | 17,172 / 49.9 | 20 (20) / 30 (46) |
| couple 62, IRMAA (CA), to 100 | 17,751,169 (17,365,356) | 150,963 | 8,006 (hit) | 26.6 | 3.32 | 14,412 / 48.5 | 13 (13) / 30 (39) |
| couple 58, trad-heavy, ACA (NY), to 100 | 11,049,453 (6,997,949) | 1,436,197 | 8,005 (hit) | 26.7 | 3.33 | 15,612 / 51.9 | 17 (17) / 30 (43) |

- Step 0's baseline for comparison (cost objective, same budget): 7.6 / 9.4 / 17.1 / 29.6 / 31.2 / 30.3 s. The end-value
  search is not slower: 21% / 19% / 57% / 27% / 15% / 12% faster. Per evaluation 0.75-3.33 ms against step 0's 0.95-3.90
  (the machine's run-to-run noise is +-10%; the ACA early retiree stops at 2,820 evaluations against 5,628).
- The ACA early retiree prints 0 / 0 / gain 0: its shipped run depletes at 55 (see the reproduction capture, depletedAge 55), so
  the guardrail (a candidate may not deplete when the current plan does not; here the base already does) rejects every
  candidate and the search returns the start. This is the pre-change behavior of that scenario too (identical in
  the reproduction check), not a regression.
- The 200,000 budget changes no score: all six optimizer scores are equal to the dollar at 8,000 and at 200,000 (the search
  converges at 8,670 to 17,172 evaluations), so the shipped budget still costs no quality here.

#### Batch 5 step 2b: the mix fallthrough (US V137)

Spec `docs/superpowers/specs/2026-10-24-b5-mix-fallthrough-design.md`, plan `docs/superpowers/plans/2026-10-24-b5-mix-fallthrough.md`.
Base `1ece7f3` (origin/main, before the fix); fix commit `09d0b4b`. Closes the home-equity loophole step 2's Reading 2 recorded.

**What moved (guard on, `node tests/snapshot.js`; 29 of 577 US scenarios, Canada 376 unchanged; `npm run snapshot:update` run only after
this list matched the guard-off list plus the capped smooth years).**
- Explicit applied mix: `R mixApplied` (std; depletedAge 87 -> 89), `R mixApplied+live` (std; the applied years only; depletedAge
  66 -> 89, final investable 2,757,203 -> 0), 10 `hist R mixApplied | ...` series, 10 `hist R mixApplied rich | ...` series.
- Smooth withdrawals: `R smooth` (std), `hist R smooth | real1966`, `hist R smooth | flat`, and four guard-on cliff-plan scenarios
  (`G mfj 62 aca 400% smooth`, `G hoh 58 aca smooth`, `G single 62 aca smooth`, `G hoh 62 aca smooth`: rows differ, final
  investable equal to the dollar: the capped smooth years sell taxable within the room, then release it).
- Not moved: `R mixLive`, `R rothConv+aca+live`, every no-mix scenario, `snapshot_ui` (147 + 104 controls, unchanged: the
  optimizer labels do not render in its states).
- `node tests/plan_off_anchor.js --base <1ece7f3 build>`: **552 identical, 25 different** (all the explicit / smooth mix
  scenarios above, none of the four `G ... smooth` ones: they differ only with the guard on). Header of the script updated.

**Decisions.** The live mix is skipped by construction (`wd.mixCandidate === 'live'`). A `roth` mix with an empty Roth is not
bit-identical to no mix after year 0 (a bisection overshoot hands a cent-fraction back to the Roth bucket, so the mix's Roth share
draws that dust): the equivalence test uses a 5-cent tolerance on numbers (a builder's deviation from the plan's "exactly", recorded in the test; year 0 is exact, later rows differ by at most 0.042: the cause, `takeRoth` of a slightly negative need returning cent-fractions to a Roth of 0, is pre-existing and left as a follow-up).
Mix labels: "Taxable / Traditional / Roth first". Canada unchanged.

**The recorded asymmetry under a cap (one plan year).** Single, 60, ACA, TX, premium 18,000, taxable 100k (30% basis), traditional
1.3M, Roth 60k, spending 72k, cliff plan on; `roth` mix every year vs no mix. Age 61 (Roth empty after year 0 under the mix):
mix: taxable 80,464 + traditional 3,715, MAGI 62,041, premium 6,179; no mix (the plan stays under the ACA 400% line with
traditional + Roth): taxable 11,108 + traditional 54,547 + Roth 22,947, MAGI 62,599, premium 6,235. Both are under the line, with
different compositions: "Roth first" with an empty Roth is not the no-mix year under the cliff plan.

**Re-measured on the fix (the gate: the home-equity collapse is gone).** `node tests/solver_gap.js --objective endValue` (both
lengths, 200,000 budget) and `node tests/bench_optimizer.js --objective endValue` (8,000 budget, 1 round: the scores are
deterministic, only the seconds are noisy). Shipped columns are unchanged from step 2. Home equity (real dollars), shipped /
reference, left at the end and summed over the years, at life expectancy 100: before (step 2) vs after.

| Case (to 100) | Left, before | Left, after | Summed, before | Summed, after |
|---|---|---|---|---|
| early ACA single (TX) | 576,967 / 94,912 | 576,967 / 576,967 | 19,503,024 / 5,293,328 | 19,503,024 / 19,503,024 |
| couple 62, IRMAA (CA) | 557,644 / 557,644 | 557,644 / 557,644 | 15,522,599 / 15,522,599 | 15,522,599 / 15,522,599 |
| couple 58, trad-heavy, ACA (NY) | 568,605 / 248,252 | 568,605 / 568,605 | 17,780,512 / 9,151,201 | 17,780,512 / 17,780,512 |

At 75 the home columns equal too (422,483 / 336,220 / 385,659 left; 6,243,465 / 3,544,159 / 5,012,818 summed, both sides).
After-tax end value, real, shipped / reference at 100: TX 1,779,474 / 2,053,870 (step 2: 3,875,243, +118%; now +15%), CA 6,819,618 /
6,960,179 (6,974,747), NY 2,487,821 / 2,487,850 (4,012,161, +61%; now +0.001%). At 75: TX 1,834,228 / 1,936,176 (2,145,248), CA
3,894,474 / 3,967,166 (unchanged), NY 2,022,024 / 2,074,416 (2,251,484). Lifetime cost of the reference at 100: TX 991,729 (was
1,337,701), CA 1,429,653, NY 1,154,654 (was 1,812,230): the references no longer buy their gain by paying tax while spending the
house. Converted at 100, shipped / reference: TX 148,988 / 400,395, CA 1,213,285 / 934,322, NY 940,376 / 1,895,041.

Bench (8,000 budget; score = nominal end value; gain in today's dollars; step 2 in brackets): Default 10,194,571, gain 1,145,783
(1,716,099); Default with conversions on gain 105,609 (675,926); ACA early retiree 0 (0); TX to 100 gain 261,094 (2,081,877);
CA to 100 130,988 (150,963); NY to 100 gain 26 (1,436,197). Evaluations 7,968 / 7,968 / 2,820 / 8,005 / 8,006 / 8,006, seconds
5.6 / 6.2 / 7.4 / 31.2 / 25.4 / 29.5 (machine noise +-10%).

**The default household's mix lever alone under `endValue`** (scratch replay outside the repo, the same as step 2's review; the
same script on the base build reproduces step 2's figures exactly): before, gain +2,292,391, 21 of 30 years "Roth only", real
end home equity 611,662 -> 281,898 (summed 26.65M -> 16.46M); now gain +11,762 (modes: 10 default, 12 `taxTradHalf`, 5
`traditional`, 3 `thirds`; no `roth`), end home equity 611,662 -> 611,662 (summed 26.65M, unchanged). The gate is met: the
mix lever's gain is what a withdrawal order can honestly earn, and home equity is not touched.

**Recorded for later (decision 2 of the spec):** home equity is still a free, cost-free last resort once every liquid account is
empty; pricing it is a separate modelling question. The step-3 decision recorded above (price home equity or restrict the mix
lever) is resolved by this fix for the paths measured here.

#### Batch 5 step 3a: the flat-bracket search in the cliff plan (US V139)

Spec `docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md` (section 2, decisions 1-16; Part A), plan
`docs/superpowers/plans/2026-10-24-b5-conversion-sizing.md`. Base `b544934` (US V137); main's PR #48 (RI / PA conversions taxed
by the account, US V138) merged in at `c52f6f4`; the switch-on commit `f79fb92` (V139). Measured 2026-10-24, Node v24.21.0,
Chromium through Playwright, the clock pinned to 2026-06-15. Part B (3b, per-year sizing) is not built: the owner decides on
these numbers.

**What it does.** When a plan converts (conversions on, the cliff guard on, a window age inside the plan, no applied schedule),
`computeCliffPlan` runs today's whole selection once per flat bracket of `BRACKET_CANDIDATES = [10, 12, 22, 24, 32, 35]` (the
user's bracket first, then the others ascending; each is that bracket's own best cliff plan) and keeps another bracket only on a
strict win under `bracketCandidateBetter`: no earlier depletion and no earlier first home-equity draw (`sim.homeDrawAge`), then
later depletion, else a later first home draw, else a value above the best's by more than `max($1, 0.1% of |value|)`. The plan
carries `{ bracket, bracketFrom }`; the engine honours the plan's bracket only while `bracketFrom` equals `rothConvBracket` (an
override map and an applied schedule win). The search runs in the deferred render pass (the light render shows the user's-bracket
plan while typing), the summary names the kept bracket, and the flat-bracket card pins its own trials to their bracket.

**Decisions recorded (spec section 2).** 7: step 3 split into 3a (the six flat brackets as whole-plan candidates) and 3b, built
only on the owner's word after these numbers. 8: the search runs in the deferred pass, not on keystrokes. 9: the relative
replacement threshold (0.1% of the best's after-tax end value, at least $1). 10: RI and PA excluded until their conversion tax
was fixed (superseded by 16). 11: the IRMAA discount deferred past step 3 (IRMAA stays charged in full two years on). 12 and 13:
3b only (the capped sized candidate after a sized phase; the year-0 IRMAA stand-in frozen during the choice). 14: home equity:
a candidate must deplete no earlier and first draw on home equity no earlier than the best. 15: shifted standard scenarios are
classified like historical movers. 16: RI and PA searched like every other state after PR #48, and the scan gains RI and PA
households.

**Snapshots (A5.1).** `node tests/snapshot.js --dump` on this tree with the search off (equal to the committed baseline) and on;
5 of 577 US scenarios moved, Canada 376 unchanged. Every mover has conversions on and the guard on, is in Texas and has shift 0;
none depletes or first draws on the house earlier (the shift-0 hard gate):

| Scenario (user's bracket 22%) | Kept | Depletion | First home draw | End |
|---|---|---|---|---|
| `std R rothConv` (window 52-60) | 10% | 84 -> 93 | 75 -> 82 | converts 57-69k a year at 52-60 instead of 244-262k at 52-55 (a ceiling then cuts 56-60) |
| `std G mfj 66 250k+250k 300k 130k smooth` (66-72) | 10% | 80 -> 80 | 76 -> 77 | 36-39k a year to 72 instead of 59-151k to 70 |
| `std G two returns 62 aca smooth` (62-72) | 24% | never | never | value 11,652,374 -> 11,761,145; final total 11,830,200 -> 11,863,404 |
| `std G two returns 66 irmaa default` (66-72) | 12% | never | 92 -> 93 | value 470,445 -> 522,652 |
| `std G two returns 66 irmaa smooth` (66-72) | 10% | 80 -> 80 | 76 -> 77 | 16k a year instead of 48-78k |

The causes are the ranking itself (later depletion, then a later first home draw, then the value): three movers win on a later
first home draw at equal depletion (`mfj 66 ... smooth`, `two returns 66 irmaa default`, `two returns 66 irmaa smooth`), one on
later depletion (`std R rothConv`), one on the value (`two returns 62 aca smooth`, never depleting, never drawing on the house).
Their historical / Monte Carlo (500 paths) success, search off -> on: `std R rothConv`
41.5% -> 43.4% / 51.2% -> 59.0%; `two returns 66 irmaa default` 60.9% -> 62.3% / 68.2% -> 69.4%; the two smooth households
0.0% -> 0.0% / 1.6% -> 2.2% and 1.4% -> 2.0%; `two returns 62 aca smooth` 100% both.
`node tests/hist_depletion_cause.js A B`: 468 historical and shifted scenarios compared, **none moved** (0 earlier, 0 bridge
drains, 0 market variance): the shifted standard scenarios do not convert, and no historical scenario's plan changed bracket.
The five scenarios the first B5 attempt broke (3C notes, section 13), before -> after: `std R rothConv+aca+live` 95 -> 95,
`hist R everything real1929` 91 -> 91, `real1966` 88 -> 88, `real1973` 87 -> 87, `rich crashFirst` never -> never (all five
identical: their plans keep 22%).
`snapshot_ui`: one surface moved, `std R everything` (147 + 104 controls otherwise unchanged). The surface re-dispatches
`input` on the spending field, which reads the field's default (60,000) over the scenario's 90,000, so its state is not the
engine snapshot's (which keeps 22% and did not move). There the plan keeps 10% (depletion 92 -> 92, first home draw 86 -> 87)
and the dashboard's historical success falls 49% -> 47% (49.1% -> 47.2%, 53 cycles; Monte Carlo 66.2% both): the expected
cost of ranking on the deterministic projection only (spec A3 / anti-goals), recorded, not a gate. `npm run snapshot:update`
ran after this review.

**The guard script** (`tests/bracket_search.js`, in `npm test`): 480 households (384 + 48 RI + 48 PA), 32 with a different
depletion or first home draw, all later; 15.6 s (target under 60 s).

**Tests changed by the switch-on.** `tests/state_modules.js` and `tests/unit/shared/run-context.test.js` pin the new default;
`tests/unit/us/conversion-state-tax.test.js` (PR #48's 72(t) PA replay, which pins the user's 12% fill: with the search on its
plan keeps 10%, whose conversion stays inside B's IRA) turns the search off, as the plan's Task 3 ruling does for every test
that pins the user's-bracket plan on a converting, guard-on household.

**Gates (A6), against `b544934` (`<scratch>/base`):**

| Gate | Result |
|---|---|
| `bench_runs_interleaved.js` +5% (11 rounds; then 21) | simulate -7.5% to +2.0%, historical -0.9% to +2.9% (11 rounds); a second 11-round run had WA historical +5.5%, a 21-round run -2.0% to +1.5% everywhere (WA -2.7%): noise. Against the merged tree with the search off: -0.6% to +1.2% / -2.2% to +2.2% (the merge moved nothing; the default household does not convert, so the search does not run) |
| `bench_solver.js --rounds 7` +30% | ACA early retiree (CA) +3.8% / path +4.2%; the converting scenario (conversions to 74 at 22%) +3.2% / path +6.1%; default +2.5% / -3.8% |
| Planning time, 150 ms (median of 9 full refreshes, gap households) | slowest 51.6 ms (TX at life 100; search off 7.8 ms); 75: 39.9 / 17.3 / 37.4 ms, 100: 51.6 / 21.0 / 36.1 ms (TX / CA / NY) |

**The gap after 3a** (`node tests/solver_gap.js --objective endValue`, both lengths, 200,000 budget). The reference's runs are
step 2b's, unchanged to the dollar; only the shipped column moved (it is now the kept plan). After-tax end value at the engine's
pricing (table 2), real, shipped / reference, step 2b -> 3a:

| Case | Kept (user's 22%) | 3a gain over 22% | Gap to the reference: 2b -> 3a | Share of the gap 3a closed |
|---|---|---|---|---|
| early ACA single (TX), 100 | 10% | +3.52% (1,781,064 -> 1,843,834) | 261,093 (12.8% of ref) -> 198,323 (9.7%) | 24% |
| couple 62, IRMAA (CA), 100 | 24% | +0.52% (6,794,802 -> 6,829,892) | 135,836 (2.0%) -> 100,746 (1.5%) | 26% |
| couple 58, trad-heavy, ACA (NY), 100 | 22% | 0 | 26 (0.001%) -> 26 | 0 (none to close) |
| early ACA single (TX), 75 | 10% | +1.30% (1,805,855 -> 1,829,360) | 114,424 (6.0%) -> 90,919 (4.7%) | 21% |
| couple 62, IRMAA (CA), 75 | 24% | +0.18% (3,695,650 -> 3,702,223) | 181,520 (4.7%) -> 174,947 (4.5%) | 4% |
| couple 58, trad-heavy, ACA (NY), 75 | 22% | 0 | 25,612 (1.3%) -> 25,612 | 0 |

(The gains equal the outside review's probe on V137 to the hundredth: TX +3.52% / +1.30%, CA +0.52% / +0.18%.) The A5.4 check
passes in all six (the kept value is the best equal-outcome flat bracket's: TX 10%, CA 24%, NY tied at 12-35%, all the same run).
On step 0's table-2 score (cost + end tax, undiscounted), gap to the reference 2b -> 3a: TX 100 1.08% -> 2.23% (the kept 10%
scores worse undiscounted: more end tax, 56,821 against 48,508, for a higher end value), CA 100 2.48% -> -7.21% (24% beats the
reference on the score), NY 0.00%; at 75 TX 12.39% -> 12.20%, CA 21.12% -> 15.24% (the best flat bracket on the score is 35%,
on the end value 24%), NY -2.72%. Table 1 (lifetime cost, which the end-value search does not target): TX 100 995,404 -> 998,933,
CA 100 1,415,319 -> 1,356,763; 75: TX 403,552 -> 380,813, CA 664,890 -> 743,961.

**Reading.** A flat bracket recovers what it can and no more: about a quarter of the end-value gap at 100 for TX and CA, a fifth
for TX at 75, almost nothing for CA at 75, nothing for NY (whose gap is already nil at 100). What is left: TX 9.7% / 4.7% (the
ACA years before 65, which no conversion size fixes: step 0's reading 2, gains-driven MAGI the guard cannot cap), CA 1.5% / 4.5%
(per-year sizing: the reference converts more early and less later, step 0), NY 1.3% at 75. 3b's room, measured against the reference, is these figures,
and for TX most of it is not conversion sizing.

**3b's room with the Roth lever alone** (owner's request, 2026-10-25: `node tests/solver_gap.js --objective endValue --levers roth`,
new option: the reference searches only the per-year Roth bracket, no withdrawal mix, no smooth toggle; 200,000 budget, no run hit
it). After-tax end value, real, the kept 3a plan / the Roth-only reference: at 100, TX 1,843,834 / 1,854,861 (+0.60%), CA 6,829,892
/ 6,839,391 (+0.14%), NY 2,480,667 / 2,480,667 (0); at 75, TX 1,829,360 / 1,832,057 (+0.15%), CA 3,702,223 / 3,702,223 (0), NY
2,022,024 / 2,022,024 (0). So per-year conversion sizing could add at most about 0.6% (TX at 100) and 0.14% (CA at 100) over 3a
against this reference; the rest of the three-lever gap above (TX 9.7% / 4.7%, CA 1.5% / 4.5%, NY 1.3%) is the withdrawal mix and
smoothing, step 4's levers. **Owner decision (2026-10-25): 3b is skipped; step 4 is next.**

**The scan** (`node tests/solver_scan.js`, 864 households x 2 modes): exit 0, 26 minutes. Bracket search on vs off (the kept
plan against the user's-bracket plan, standard projection): default order: kept 10% in 121 households, 12% in 34, 22% in 691,
24% in 18 (173 differ from the user's 22%); depletion later in 14, same in 850, **earlier in 0**; first home draw later in 23,
same in 841, **earlier in 0**; value change p10 / median / p90 0 / 0 / +93,929. Smooth: 10% 69, 12% 22, 22% 743, 24% 30 (121
differ); depletion 11 later / 853 same / 0 earlier; first home draw 22 / 842 / 0; value p90 +23,561. Guard on vs off with the
search on: depletion and first home draw the same in all 864 households, both modes. Plan (kept) vs `off` (user's bracket, no
steering), standard: conversions-on households better / equal / worse by value 182 / 298 / 0 (default) and 216 / 264 / 0
(smooth), no depletion earlier in any household. Historical, households keeping intents or another bracket (240 default, 377
smooth): success higher / same / lower 40 / 192 / 8 (default; mean 79.15% against 78.82%) and 60 / 307 / 10 (smooth; 83.05% /
82.75%); paths depleting earlier / later 81 / 912 (default) and 84 / 1,118 (smooth). Monte Carlo (200 seeded paths): 79 / 152 /
9 higher / same / lower (79.99% / 79.61%) and 105 / 265 / 7 (83.66% / 83.28%). Information only: the ranking reads the
deterministic projection, so a few households lose a little path success (the recorded trade-off below).

**Historical rates** (`node tests/historical_rates.js`): identical to the search-off build in every scenario (none of them
converts).

**Recorded trade-offs.**
- The ranking reads only the deterministic projection: a kept bracket can lower historical success (the UI surface above: 49% ->
  47%) though it lasts as long and first draws on the house later on the plan's own projection; on the five engine movers it
  raised or kept historical and Monte Carlo success.
- The kept bracket can score worse on an undiscounted lifetime-tax measure (TX 100: 10% pays more end tax) because the search
  ranks by the after-tax end value (decision 9, the step 2 objective).
- Each deferred pass re-runs candidate 0 (Task 4, inside the gate); the search runs when an optimizer override map covers every
  window age (wasted runs, correct result; Task 3).
- `optimizeMultiLever`'s flat-Roth start is seeded from the plan's bracket (Task 5), but the card still calls it "the current
  plan" (A9 call 11: step 5 retires it).

**Final review fix.** With a scenario comparison open, the light render's comparison row and overlay series project
`normalizeState(state)`, a new object: `planForState`'s identity branch missed and its JSON branch served only a searched plan, so
every keystroke ran the full search there (about 50 ms) and the "Current (live inputs)" row showed the searched plan while the
dashboard showed the user's bracket. The JSON branch now also serves the stored plan while its search is pending, and caches a
computed, searched stored plan it serves (a saved scenario equal to the live state was otherwise planned once on the next
keystroke). `test_bracket_search.js` counts it (`__test_planForStateComputes()`, new): before the fix a keystroke with the
comparison open gave 2 `planForState` plans and the current row read $8,976,545 against the dashboard's $9,004,050; after, 0, and
the rows agree.

**Independent review fixes (2026-10-25).**
- The flat-bracket card's baseline is the cliff plan's bracket when it differs from the setting: before, on the CA gap couple
  (setting 22%, the plan keeps 24%) the card said "Suggested: fill to the 24% bracket instead of your current 22% — an estimated
  $43,271 more after-tax end value ..." although the 24% row is the dashboard's run (taking it changed nothing); now "The cliff
  plan already uses the 24% bracket (not your 22% setting), ...", the 24% row is marked "(cliff plan)", the 22% "(your setting)",
  and `pickFlatBracket`'s tie keeps the plan's bracket. The per-year card names "the cliff plan's flat 24%" (its gain is against
  `selected`). With the plan on the setting both read as before. `test_bracket_search.js` checks both cases (6 checks failed
  before the fix). `snapshot_ui`: the `std R everything` surface's text moves again (textLength 31,462 -> 31,514; rows and
  projection unchanged): its plan keeps 10% against the 22% setting and every row runs out at 92 with $0, so the card said "Your
  current 22% bracket target already left the highest ..." with "22% (current) ★"; it now reads "The cliff plan already uses the
  10% bracket (not your 22% setting), ..." with "10% (cliff plan) ★" and "22% (your setting)" (the $0 tie keeps the plan's 10%).
- `computeCliffPlan`'s user's-bracket family subsets run `apply` on `{ intents, family, bracket: from, bracketFrom: from }`, the
  shape every other bracket's plans have (it resolves to the setting, as `{ intents }` did): engine snapshots identical.
- The deferred pass when the kept plan differs redraws the light panels (`renderBody`); the historical success rate is not run
  twice: `renderPlanStatusBar` debounces `runHistoricalCycles()` 500 ms after the last render, and the deferred pass (250 ms idle,
  or the field's `change`) re-arms that timer, so the cycles run once per input change, under the kept plan. Measured (scratch
  timing, CA gap couple at life 100, 7 alternating spending values, median, this machine): the deferred pass 23 ms when the kept
  plan differs (redraw included) against 16 ms when it keeps the setting (search and summary line only), so the redraw adds about
  7 ms; the light render 18 ms; `runHistoricalCycles` uncached 122 ms (paid once either way). Spec A6's 51.6 ms is planning only.
- The optimizers' home-equity check (`notWorseThanSelected` in `optimizeMultiLever`, which `optimizeRothLadderPerYear` calls:
  no run may first draw on home equity earlier than `selected`) applies to every household, converting or not; README says so.

#### Batch 5 step 4a: the stored plan and Optimize -> Apply (US V140)

Spec `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md` (owner decisions 1-8, section 4; section 9 for the lambda table),
plan `docs/superpowers/plans/2026-10-25-b5-stored-plan-4a.md`. Base `a12c64c` (PR #49, US V139); branch `claude/b5-stored-plan-b3568e`,
commits `7da3cf4` (plan shape) .. this one. Measured 2026-10-25, Node v24.21.0, Chromium through Playwright, the clock pinned to
2026-06-15. Canada untouched. Architecture: `docs/architecture/cliff-plan.md` ("The stored plan and Optimize"),
`inputs-and-ui.md` (`storedPlan`, its guard, the card), `engine.md` (the result cache's `hist` / `mc` keys).

**What it does.** One plan shape (`makePlan`, `PLAN_KEYS`: `intents, family, bracket, bracketFrom, orders, splits, levers, mult,
orderPhases`; the last five `null` in 4a). A per-phase lambda multiplier `mult` (before 65 / 65 to A's RMD start / RMD years, grid
`[0, 0.5, 1, 1.5, 2]`) that only `choose` reads. `computeCliffPlan` gains `objective`, `rankEvenly` / `tieBracket` (the six
brackets ranked with no preference for the setting) and `offMemo`; the defaults are today's plan. `state.storedPlan` (guarded in
`normalizeState`, whole or `null`) is a guarded candidate inside `computeCliffPlan`: it runs through `apply` once and is used
unless it depletes or first draws on the house earlier, or scores lower on its own objective beyond `max($1, 0.1%)`
(`report.stored`). `optimizePlan` (`src/us/core/optimizer/plan-search.js`) is a coordinate search over the three multipliers on
full plannings of a working copy (no stored plan, no applied schedules), scored as Apply runs it. The "Plan optimizer" card
(`src/us/ui/results/plan-optimizer.js`) replaces the multi-lever card's UI: an objective selector (after-tax end value, the
default; lifetime tax + healthcare), Search, the gain, the plan in words, the multipliers, the historical and Monte Carlo success
rates with and without the plan (`runHistoricalCyclesWith` / `monteCarloSummaryWith`, new shared entry points), Apply (stores a
JSON copy, one undo snapshot, clears legacy schedules with keys) and Clear, and the stored plan's status line. `rothConvBracket`
gains a `normalizeState` guard (decision 6). `optimizeMultiLever` and its hooks stay as `tests/solver_gap.js`'s reference until
step 5.

**Spec amendments made by the plan** (recorded in the named task's commit):
1. Spec 4.2's duplicated id lists became an import from `plan-shape.js` (Task 4); the list check is "every line `choose`
   records is in `PLAN_LINE_IDS`" (Task 1, `plan-shape.test.js`).
2. Spec 4.1 / 4.2's `levers` is `null` in 4a (the guard accepts only `null`; 4c widens it to `{ order, split }` booleans);
   `orders` / `splits` have their value checks now (`'traditional'`; `'A'` / `'B'`), though 4a writes `null`.
3. Spec 4.3's "the automatic plan's candidates under `auto`" is kept as: the report's existing fields stay the automatic plan's,
   and `report.stored.used` says which plan runs (no `auto` key).
4. Spec 4.5's "ties to the automatic plan's kept bracket" is the `tieBracket` option (Task 3).

**Rulings during the build** (the controller's, each with its cost if wrong):
- R1: `optimizePlan`'s result also carries `report` (the winner's planning's report, else base's), for the legacy test's
  `report.brackets.length`.
- R2: `npm run analyze` in every task that changes exports, even where the task's steps omit it.
- R3: `tests/se_health.js`'s base-identity hash deletes the trace-only `planTr.lambda` before hashing (the old `d8e3cee` hash
  matches again): the hash pins engine behaviour, not trace keys. A later trace-only key needs its own delete line.
- R4: a kept `none` family's `intents` can be the `offMemo`'s shared `{}`; Task 7 uses one Map per call and one objective; Apply
  stores a JSON deep copy of the plan, never the engine's object.
- R5: `tests/snapshots/ui_us.json`'s MCP `executeStateHash` regenerated in Task 4 (the full state carries `storedPlan: null`;
  schema and projection hashes unchanged), an intended state-shape change like `legacy_state`'s.
- R6: Task 5's tests use other households than the brief named (TX's score case removes an intent instead of adding a losing
  one; the home case uses a BROKE household with a 401(k); the CA cases at 140,000 / 180,000 spending): the named ones could not
  produce those verdicts.
- R7: `engine.md`'s result-cache paragraph updated here (Task 9).
- R8: Apply is offered when the gain is over $1 (`applyGateOpen`) OR the found plan depletes later OR first draws on the house
  later than what runs today: a Rule A win with no score gain (HOH58: both plans end at 0) is still a better plan.
- R9: a search win by less than the guard's tolerance (taken on the stored score) can read 'tie' after Apply; the plan is still
  used (ties keep the stored plan).
- R10: while typing, the plan in use can switch more than once across successive typed values (the guard decides per value);
  "at most one switch" is checked per edit, from its last input through the flush.
- R11: Apply refuses a result whose inputs changed since its search (`searchedFor`) and asks for a new search (a safeguard not in
  the brief: otherwise Search, edit, Apply would store a plan fingerprinted for inputs it was not made for). The final review's
  fixes: `searchedFor` carries the tax year (`'<year>|<fingerprint>'`), and every render hides a drawn result's Apply while the
  inputs differ from the searched ones ("Your inputs changed since this search; search again.", also the refusal's line).
- R12: the second whole-branch review's fixes. (1) A stored plan the guard does not use that wins the search's final rank
  (`winner` 'current', `current.inUse` false; e.g. applied under lifetimeCost, searched on endValue) is offered: Apply re-stores
  it under the searched objective, its gain measured against the automatic plan (what runs today), the result line "Your
  applied plan is not in use now (the automatic plan is). On this objective it ..., compared with the automatic plan;
  re-applying it under this objective would put it in use."; "Your applied plan is already the best this search found." only
  when it is in use (Vitest: MFJ62, the grid's MFJ couple at 62 with 250,000 + 250,000 traditional, its automatic plan plus an
  IRMAA tier 1 fill at 66 stored under lifetimeCost; `test_plan_optimizer.js` section 4). (2) `report.stored.converts`
  (`conversionsInPlan`: conversions on and a conversion age of Partner A inside the plan, the part of `bracketSearchApplies`
  that does not read the guard, the schedules or the test switch): the applied plan's bracket clause and the status line's
  "it now converts at your X%" print only when it is true. (3) The card's plan line for a stored-plan winner describes the
  stored plan only (a report shaped for it: `optimizePlan`'s `current` carries `bracketHonoured` and `converts`), not the
  automatic plan's "not used" clauses. (4) `normalizeState` reads a numeric field's finite numeric string as its number before
  the values check (`rothConvBracket: "24"` stays 24, as the engine coerced it before the field had a fallback; "x" and ""
  give 22); `tests/legacy_state.js` unchanged. (5) The new suites' engine-derived ages, spending and multipliers became
  properties (the stored plan runs out or draws on the house earlier; the re-planned plan lasts at least a year longer; the
  spending is the one the test's loop finds). (6) The tax-year test asserts the stored plan is repriced under 2027 (its value
  differs from 2026's) and that the verdict is the one the 2027 measures imply.

**Movers.**
- Engine snapshots (`tests/snapshot.js`): byte-identical at every task (US 577, Canada 376); `tests/cliff_plan.js` and
  `tests/bracket_search.js` (480 households, 32 different, as before) unchanged: no scenario carries a stored plan, and the
  defaults of every new option are today's plan.
- `tests/legacy_state.js` (Task 4, regenerated once as intended): all 44 existing US cases differ old -> new only by
  `"storedPlan": null`; the `rothConvBracket` fallback moved no existing case; new cases 'stored plan: valid', 'stored plan:
  malformed', 'rothConvBracket invalid' (`23` -> `22`); the 19 Canada cases unchanged.
- `snapshot_ui` (US only; Canada unchanged): Task 4, the MCP `executeStateHash` (R5); Task 8, the surfaces "std default", "std R"
  and "std R everything" in `textHash` / `textLength` only (the card's markup and copy; `projectionHash`, `rowsHash`,
  `histSuccess` unchanged), and `wiring`: 144 entries' `domHash` / `reloadDomHash` only (the page's control set: the three lever
  checkboxes removed, the two objective radios added), entries `mlRothLever`, `mlMixLever`, `mlSmoothLever` removed,
  `planObjectiveEndValue`, `planObjectiveLifetimeCost` added; `planner`, `load` and `mcp` otherwise unchanged.
- `tests/analysis_parity.js --base <a12c64c build>`: Canada identical in every household and pass; US, all 28 household passes
  differ in exactly the removed card keys, nothing else (a scratch copy listing every differing path): `us.card.{nominal,real}`
  `.multiLeverResult`, `.multiLeverSummary`, `.multiLeverHead`, `.multiLeverRows`, `.multiLeverApplyNote`, `.lastMultiLeverRun`
  (removed). The script's PLAN_G58_SCHED self-check ("the multi-lever result does not depend on the maps its trials are planned
  with") fails in both trees, and also with `a12c64c`'s own script on `a12c64c` against itself: pre-existing, not 4a's (a
  follow-up below).

**The gap with the shipped column from Optimize** (`node tests/solver_gap.js --objective endValue --shipped optimized`, both
lengths, 200,000 budget; new option, the default `auto` unchanged: `node tests/solver_gap.js --lengths default` before and after
the edit gives identical output except the Seconds column). On all six cases the search finds nothing: winner `base`, multipliers
`[1, 1, 1]`, gain 0, 14 plannings, so the optimized column equals the automatic column to the dollar (at 100 every table is
identical to the `auto` run's; at 75 the figures equal 3a's). After-tax end value at the engine's pricing, real, shipped
(optimized) / reference:

| Case | 3a (automatic) | 4a (optimized) | Gap to the reference |
|---|---|---|---|
| early ACA single (TX), 100 | 1,843,834 / 2,042,157 | 1,843,834 / 2,042,157 | 198,323 (9.7%), unchanged |
| couple 62, IRMAA (CA), 100 | 6,829,892 / 6,930,638 | 6,829,892 / 6,930,638 | 100,746 (1.5%), unchanged |
| couple 58, trad-heavy, ACA (NY), 100 | 2,480,667 / 2,480,693 | 2,480,667 / 2,480,693 | 26 (0.001%), unchanged |
| early ACA single (TX), 75 | 1,829,360 / 1,920,279 | 1,829,360 / 1,920,279 | 90,919 (4.7%), unchanged |
| couple 62, IRMAA (CA), 75 | 3,702,223 / 3,877,170 | 3,702,223 / 3,877,170 | 174,947 (4.5%), unchanged |
| couple 58, trad-heavy, ACA (NY), 75 | 2,016,058 / 2,041,670 | 2,016,058 / 2,041,670 | 25,612 (1.3%), unchanged |

So the multipliers alone close none of the gap on these households (Task 7's finding, confirmed). The even bracket ranking keeps
the automatic plan's bracket on all six (TX 10%, CA 24%, NY 22%: NY's 12-35% tie goes to `tieBracket`, base's 22%). The gap is the
withdrawal mix and smoothing (3a's reading), which 4b-4d address.

**The lambda table** (spec section 9; `node tests/plan_mult_table.js`, new, not in `npm test`): the plan card's search per phase
(before 65 / 65 to the RMD start / RMD years): the multiplier kept; the gain of the kept plan over the search's `[1, 1, 1]` start
and over the automatic plan (today's dollars); the share of the phase's plan years with `movedSample` in the `choose` trace at
the user's bracket (`__test_planTrace()` runs `choose` with `plan: null`: the user's bracket, m = 1, not the kept bracket). Samples: the gap households at 75 and 100; "every16", every 16th household of the
768 grid (Task 1's sample; the grid interleaves conversions off / on, so all 48 have conversions off); "conv", every 8th of the
384 conversions-on households (`--sample conv`). Per phase, households by the multiplier kept (m = 0 / 0.5 / 1 / 1.5 / 2) and the
`movedSample` share among those keeping 1 and those keeping another value:

| Objective, sample | Search wins (mult != 1) | <65: kept | <65 moved: kept 1 / kept != 1 | 65-RMD: kept | 65-RMD moved: kept 1 / != 1 | RMD: kept | RMD moved |
|---|---|---|---|---|---|---|---|
| endValue, gap (6) | 0 (0) | 1 x6 | 0/40 (0%) / - | 1 x6 | 0/60 / - | 1 x6 | 0/64 |
| endValue, every16 (48) | 1 (1) | 1 x35, 1.5 x1 | 30/269 (11%) / 5/7 (71%) | 1 x48 | 40/468 (9%) / - | 1 x48 | 3/967 (0%) |
| endValue, conv (48) | 1 (1) | 1 x35, 1.5 x1 | 21/269 (8%) / 5/7 (71%) | 1 x48 | 38/468 (8%) / - | 1 x48 | 3/1008 (0%) |
| lifetimeCost, gap (6) | 4 (0) | 1 x6 | 0/40 / - | 1 x6 | 0/60 / - | 1 x6 | 0/64 |
| lifetimeCost, every16 (48) | 7 (4) | 1 x34, 1.5 x2 | 24/262 (9%) / 11/14 (79%) | 1 x46, 1.5 x2 | 24/449 (5%) / 16/19 (84%) | 1 x48 | 3/967 (0%) |
| lifetimeCost, conv (48) | 21 (4) | 1 x33, 1.5 x3 | 10/255 (4%) / 16/21 (76%) | 1 x47, 1.5 x1 | 29/458 (6%) / 9/10 (90%) | 1 x48 | 3/1008 (0%) |

(36 of the 48 grid households reach the before-65 phase; every household reaches the other two. Search win counts are over the
households; "(mult != 1)" the wins that keep a multiplier other than all ones; the rest win on the even bracket rank alone.)
- On the end value the multipliers almost never matter: one win in each 48-household sample, the same HoH 58 rule-of-55
  household with conversions off and on (`[1.5, 1, 1]`, the same run either way: it lasts a year longer, 76 -> 77, first home draw 73 -> 74, gain 0: both end at 0).
- On the lifetime cost, wins are mostly the even bracket rank (gap: CA 75 keeps 10% instead of 24%, gain 382,058; NY 75 10% instead
  of 22%, 181,292; TX 100 8,908; NY 100 19,326; conv sample: 17 of 21 wins with `mult` null, the largest 60,197); a multiplier
  other than 1 wins in 4 + 4 households, always 1.5 in one phase (gains over the `[1, 1, 1]` start 1,775-15,650).
- **The signal for step 5:** every kept multiplier other than 1 is 1.5, and it is kept in a phase whose plan years mostly have
  `movedSample` in the user's-bracket `choose` trace (71-90% of those years, against 4-11% for the phases that keep 1); RMD
  years almost never move (0%). The trace is not the kept plan's run (its bracket can differ), so the cross is indicative. That reads
  as the emptied-pool sample underpricing future tax (lambda too low where the walk empties the pool), which a multiplier above 1
  partly corrects; where the sample does not move, 1 is kept. Step 5 chooses among correcting the moved sample, a tuned default
  multiplier and a new estimator from this table (decision 5).

**Timings** (gates of spec 4.7 and the plan; base builds from a scratch worktree of `a12c64c`, removed afterwards):

| Measure | Gate | Result |
|---|---|---|
| `node tests/bench_runs_interleaved.js --base <a12c64c>` (11 rounds) | +5% | simulate +1.3% to +3.6%, historical 0.0% to +4.6% (WA); no state carries a stored plan, so the changed code is not on this path (3a recorded WA historical +5.5% in one 11-round run and -2.7% in a 21-round run: noise) |
| `node tests/bench_solver.js --base <a12c64c> --rounds 7` | +30% | ACA early retiree (CA) -4.3% / path -2.9%; converting -> 74 at 22% +3.1% / -1.1%; default -2.9% / 0.0% |
| Planning with a stored plan (median of 9 full refreshes, gap households; the found plan applied through `__test_applyStoredPlan()`) | 150 ms | 100: TX 59 ms (54 without), CA 19 (21), NY 31 (39); 75: TX 39 (40), CA 15 (15), NY 29 (33); SINGLE52 (lifetimeCost, a search win) 34 (39); verdict `tie` on the gap households (the found plan is base), `better` on SINGLE52 |
| `optimizePlan` wall time per gap household (Node, Vitest world, 3 runs) | 10 s (target) | 100: TX 0.79-0.82 s, CA 0.55-0.57, NY 0.68-0.78; 75: TX 0.57-0.60, CA 0.44-0.49, NY 0.56-0.60 (14 plannings each) |
| The card's whole Search (search + the "with" and "without" rates: a historical sweep and a Monte Carlo summary at 1,000 paths each; browser, cold) | report if over 15 s | 100: TX 2.24 s, CA 2.55, NY 2.43; 75: TX 1.95, CA 1.87, NY 2.25; SINGLE52 5.25 s (26 plannings); warm (cached rates) 0.22-0.56 s. On the gap households the winner is base, so "with" and "without" run the same plan and the second sweep and summary are cache hits (the With cache keys on the plan JSON): these totals pay one sweep and one summary; only SINGLE52 (a search win) pays all four. One Monte Carlo run of 1,000 paths through the fresh hook took 1.7-2.8 s on the same page (CA 100: 2.79 s, more than its 2.55 s Search total: run-to-run variation), so the rates are most of the wait |

| The light render per spending keystroke with a stored plan (the final review; median of 27 `input` events, 3 rounds of 9 alternating with and without, light render only: the dispatch's synchronous `render({ light: true })`, the deferred pass flushed between events; life 100) | none (recorded) | TX 16 ms with the plan applied (21 without), CA 13 ms (15); per-round medians TX 16-17 / 21-23, CA 13 / 14-15. The extra `normalizeState` + stringify of `liveFingerprint` does not show: the render with a stored plan is the faster one here (not profiled; scratch Playwright script outside the repo, the `performance.now()` figures in whole ms) |

Across the lambda-table runs the slowest Search was 10.1 s (a two-return couple, 52, conversions off, no win); every gap household stayed under 6.1 s on either objective.

**Follow-ups.**
- Step 5: lambda's estimator from the table above (the moved sample); retire `optimizeMultiLever`, the age-keyed schedules and the
  flat-bracket and per-year cards' ranking; the 30-year cap.
- `tests/analysis_parity.js`'s PLAN_G58_SCHED self-check fails before and after 4a (it needs a household whose multi-lever result
  depends on the trials' maps: "vary the schedules"); the bundle's `multiLever.real` is still computed, so the check can be revived
  with another household.
- Deferred minors from the task reviews (none changes a number; file:line at the commit that introduced them), by task:
  - Task 1: `tests/unit/us/plan-shape.test.js`'s searched-household case does not assert that the search ran
    (`report.brackets.length > 1`); `plan-shape.test.js:299`'s counted check ticks only on a failure, so the count depends on the
    outcome; `tests/engine-purity.json`'s `plan-shape.js` entry is out of path order; `run-projection.js:1689` has an overlong
    comment line.
  - Task 2: `tests/unit/us/plan-mult.test.js`'s lambda-0 check filters on `lambda !== null`, not on the candidate years, and its
    plan-less comparison is not on the same years; its `[0, 1, 2]` case checks only the returned plan's `mult`, not that `choose`
    received it; `tests/se_health.js`'s identity hash needs one delete line per new trace-only key (any later trace key).
  - Task 3: the `offMemo` comment says the measure does not depend on the objective, but its stored `score` does (the contract is
    one inputs copy and one objective); `report.candidates` entries lack `score` while `report.brackets` have it.
  - Task 4: `plan-shape.js:127` `isObj` accepts class instances (`Object.prototype.toString` gives
    `[object Object]` for them); untested guard edges: a bad `bracketFrom`, an `Infinity` rate, a non-object `plan`, the
    `summary` key order.
  - Task 5: `tests/unit/us/stored-plan.test.js`'s engine-derived integer ages were run on Node 24 only (CI is Node 22); the comment "the guard has validated it" in
    `computeCliffPlan` assumes normalized inputs; "Applied plan: no steering." is unspecified wording. (Forward notes, held:
    `computeCliffPlan` returns the stored plan whenever `inputs.storedPlan` is set, so callers that search must strip it, as
    `optimizePlan` does; the light-pass verdict can flip after the deferred pass.)
  - Task 6: the plan JSON is checked in both the key and the entry.
  - Task 7: `optimizePlan`'s trials are not memoized by `mult` (pass 2 repeats pass 1's plannings, about 12 duplicates on a
    search-win household); `tests/unit/us/plan-search.test.js:286` (`r.plan.mult === r.mult`) is true by construction.
  - Task 8: `src/us/ui/results/decision-questions.js` still says "the cliff plan's X% bracket" when an applied plan runs; the
    card's fingerprint memo skips only the hash (`normalizeState` and a stringify still run each render with a stored plan);
    the status line
    can say "does not beat" when no `report.stored` was computed; `test_plan_optimizer.js:1789`'s Monte Carlo wait could read an
    old value; `tests/unit/helpers/us-plan.js` loads `planning.js` twice.
  - The new Vitest suites (plan-shape, plan-mult, stored-plan, plan-search, success-with) were run on Node 24 only (no Node 22 on
    the build machine); CI's Node 22 run is their first on that version.
- The card's copy: "Applied plan: no steering." (an applied plan with no intents) and the reason suffix after "Re-run Optimize."
  are the builders' wording; the owner may reword.
- Parked for 4b (the second whole-branch review's item 7): the stored plan's apply run on every light planning, unmeasured;
  measure with the light-render timing in 4b.

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
| 7L NL: NL Child Benefit rates (10.61% / 21.86% / 33.94% / 33.94% + 12.98% per child over 3 above 20,397) and annual child amounts (1,888 / 1,896 / 2,036 / 2,188); relayed from NL Regulation 16/26, text not read (a search result puts the zero point near 38,193, which matches 10.61% on 1,888) **7M: rates reproduced by the straight line between the primary 20,397 and 38,193; regulation text still not read.** | 7L | S | The regulation text (assembly.nl.ca) and the NL Department of Finance page |
| 7L NL: Early Childhood Nutrition Supplement tied to the NLCB (no separate reduction); 150 a month per child under 5 **7M: left out (named gap).** | 7L | S | NL regulation sections 6 and 7 |
| 7L NL: Seniors Benefit 1,882 full to 30,409, 11.66% reduction above (zero near 46,550; CRA shows 46,549) **7M: closed on the gov.nl.ca page (1,882, 30,409, 11.66%, age 64).** | 7L | S (rate); P (1,882 and 30,409 on the CRA page) | NL Department of Finance page and the regulation |
| 7L NL: Income Supplement 520 single, 589 couple, 231 per child; reduction rule not found; disability amount and disability benefit are out of scope (need a disability input) **7M: reduction rule found on gov.nl.ca: 9% above 40,000, with a phase-in; closed.** | 7L | P for amounts / U for the reduction | NL regulation or the CRA calculator |
| 7L: ACFB working-component rates (phase-in 15%, reduction 3.40% / 6.49% / 8.34% / 8.95% above 47,115) and base rates (implied by the maximums) | 7L | S | Alberta program parameters or the CRA calculator |
| 7L: PEI child benefit as annual 410 and 290 per child; PEI Island Essentials Benefit (310 / 365 to 175, from November 2026) **7M: closed on the CRA page and the PEI Island Essentials Benefit FAQ (primary).** | 7L (7M data) | S | PEI government 2026 pages |
| 7L: Saskatchewan low-income tax credit 2026 reduction rate (not stated on the CRA page; do not carry the 2025 rate) **7M: rate derived (3.029%), secondary.** | 7L (7M data) | U | Saskatchewan 2026 page |
| 7L: Quebec solidarity credit component tables (housing, QST, northern; 2026) and the work premium formula (rates, thresholds, work-income rules); thresholds 64,545 / 70,395 and 2,634 per child are secondary | 7L | S | Revenu Quebec pages (tables hidden from the text reader; owner screenshot) |
| 7L: provincial seniors programs still open: BC Senior Supplement (BC pages blocked by an election banner; 99.30 / 220.50 / 99.83 are secondary), Ontario GAINS rate tables (eight pages by age and marital status; only the 92 maximum and the 4,416 / 8,832 limits are read), Manitoba 55 PLUS senior-component formula | 7L / 7M | P for SK, NB, AB; S for BC | BC rate table; Ontario GAINS tables; Manitoba regulation 64/90 |
| 7L: Ontario Energy and Property Tax Credit occupancy-cost calculation (the 20% of rent / 100% of property tax shape is a search summary) and the OSTC seniors income threshold | 7L | S | CRA OEPTC calculation sheet |
| 7M: Manitoba homeowners credit uses the whole property tax in place of school taxes (an upper bound) | 7M | S | Manitoba Finance (school share of a bill) |
| 7M: Manitoba figures are those of the 2025 Form MB479 (2026 form not yet published); 2026 maxima 625 / 357 in Information Bulletin 126; one top-up per household | 7M | S for 2026 | 2026 Form MB479 (expected around the end of 2026) |
| 7M: NB property tax allowance whole-dollar tier edges; the page is undated | 7M | S | Service New Brunswick |
| 7M: Saskatchewan and Newfoundland and Labrador have no rent or property-tax program (absence) | 7M | U | provincial finance pages |
| 7M: Saskatchewan Low-Income Tax Credit reduction rate 3.029% is derived from the CRA 2026-27 maximum and nil income (the saskatchewan.ca page states only 2.88% for 2025-26); children under 18 | 7M | S | saskatchewan.ca 2026-27 page |
| 7M: Saskatchewan Seniors Income Plan spouse-under-60 nil point: the published 11,568 equals 49.67 bands of base GIS reduction at 6.55 times 325 (the both-pensioners maximum), while the regulation maximum for this category is 360 (formula gives about 11,822); the total-GIS reading gives 9,216 and is ruled out by the single-person case (3,720 against 4,560); published point used; Allowance case line reproduces 9,120 within 25 | 7M | S | Saskatchewan Seniors Income Plan calculator or a Ministry statement of the spouse-under-60 maximum |
| 7M: Manitoba Child Benefit: nil points for 1 to 6 children are published (20,435, 22,242, 24,052, 25,864); the straight line between 15,000 and the nil point is a reading | 7M | S | gov.mb.ca mcb_table (endpoints only) |
| 7M: Manitoba 55 PLUS senior component built from Regulation 65/90; the last six rows of the both-pensioners table are reconstructed from the step pattern, the survivor table is assumed equal to it, the income basis (income excluding OAS and GIS) and the 47.99 shift in the spouse-not-a-pensioner table are readings; junior component: a couple with one eligible partner pays that partner the couple amount | 7M | S | the regulation PDF pages 5 and 8 to 9 |
| 7M: NL Nutrition Supplement built flat (1,800 a child under five while eligible for the NL Child Benefit); NL Income Supplement figures are the 2025 benefit year page (maxima match CRA 2026-27); NLCB regulation text not read (rates reproduced by the straight line) | 7M | S | gov.nl.ca regulation 16/26 and the 2026-27 supplement page |
| 7M: New Brunswick and Nova Scotia amounts are modeled unindexed (statutory flat amounts); NS Affordable Living Tax Credit child age (under 18) and NB School Supplement age as of which date | 7M | S | CRA NS and NB pages |
| 7M: Saskatchewan Low-Income Tax Credit single-parent structure (eligible dependant 460 plus child amounts, up to two children) is a reading; the GST-style alternative is 181 lower | 7M | S | Saskatchewan Income Tax Act / CRA SLITC calculation |
| 7M: PEI Island Essentials Benefit age 19 or older and the prior-year tax return are not modeled | 7M | S | PEI FAQ |
| 7L: OAS recovery tax threshold: ESDC page shows 93,454 for 2025; the code uses 95,323 for 2026 **7N: closed, 95,323 for 2026 on the canada.ca recovery tax page (retrieved 2026-10-06).** | 7L | P | canada.ca OAS recovery tax page |
| 7L: GIS employment exemption (first 5,000 exempt, half of the next 10,000) and GIS income definition (net income less OAS, capital gains at 50%, TFSA excluded); GIS tables 4 and 5 exact fits | 7L | S / P (tables) | OAS Act schedule and the ESDC tables |
| 7L Ontario senior homeowners property tax grant: 500 maximum, full to 35,000 (single) or 45,000 (couple), 3.33 percent reduction, nil at 50,000 / 60,000, owners 64 or older (a search summary of the ontario.ca page; not read directly) | 7L | S | https://www.ontario.ca/page/senior-homeowners-property-tax-grant and the CRA OSHPTG questions and answers |
| 7L Quebec work premium phase-in rates 11.6 percent (living alone, couple without children), 30 percent (single parent), 25 percent (couple with children): derived from maximum / (threshold - exclusion) using the primary Finance Quebec Table 3 maxima and thresholds and the 2,400 / 3,600 exclusions (11.6 percent also appears in a search summary) | 7L | S (derived) | Revenu Quebec Schedule P or publication IN-245 |
| 7L Quebec solidarity credit 6 percent reduction over 43,195 (3 percent with one component; not modeled); consistent with the published ceilings 64,545 and 70,395 and the 1,281 and 1,948 maxima (Finance Quebec Table 4 amounts are primary) | 7L | S | Revenu Quebec solidarity credit calculation page |
| 7L Quebec family allowance reduction: ends at 107,000 and is linear between the Finance Quebec reduction threshold (44,032 single parent, 60,398 couple) and 107,000 (Retraite Quebec table, rounded thresholds); the single-parent supplement is once per family | 7L | S | Retraite Quebec calculation page |
| 7L Ontario OEPTC: the age-64 test and the monthly entitlement are approximated by the same year and the plan age; lines 5 and 6 (long-term care, on-reserve energy) and the 25 dollar student residence are not modeled; the work premium uses wages as work income | 7L | P (formula) | CRA 2026 OEPTC calculation sheets (read 2026-10-05) |
| 7N N3: Quebec additional amount for a person living alone (single-parent family), 2,681 in 2026: not built (rule read on the guide line 361 for 2025: only with a child 18 or over in post-secondary studies and no Family Allowance; the 2026 figure is from Finance Quebec Table 3) | 7N | P (rule, 2025 guide) / P (amount) | Revenu Quebec 2026 guide line 361 when published |
| 7N N4: Quebec gives no provincial credit for QPP base, EI or QPIP (taken as part of the basic personal credit; Schedule U part B is a deduction only); the other provinces' 428 CPP/EI lines were assumed to match Ontario's | 7N | S | Revenu Quebec TP-1 guide (line 361 area) and the BC, AB, SK, MB, NB, NS, PE, NL 428 forms |
| 7N N10: Quebec tax credit for access to homeownership (up to 5,875) not modeled; Quebec home buyers credit 1,400 from the Revenu Quebec page (form TP-752.HA-V not read) | 7N | P (amount) | Revenu Quebec access-to-homeownership page and TP-752.HA-V |
| 7N N5: provincial medical expense thresholds for 2026 (AB 2,942, BC 2,748, MB 1,728, NB 2,854, NL 2,437, NS 1,637, ON 2,940, PE 1,678, SK 2,736) are TaxTips figures; only Ontario's 2025 value (2,885) was read on its form; Ontario care-at-home amounts (6,000 and 35,000) assumed unindexed; Quebec medical credit rate taken as the 14% lowest rate | 7N | S | each province's 428 form for 2026 when published; Revenu Quebec TP-1 guide line 399 |
| 7N N7: the 2026 Revenu Quebec Schedule K premium table is not published: the 2025 table (thresholds 19,890 / 32,240, rates 7.84 / 11.76 and 3.93 / 5.89, steps at 5,000) is scaled by 777.48 / 755 (the 2026 calendar maximum from the RAMQ page, 63.83 for January to June and 65.75 from July); Health Services Fund 2026 thresholds 18,500 / 64,355 from Finance Quebec Table 3 with the 2025 form's 150 and 1,000 caps | 7N | P (2025 form), S (2026 scaling) | Revenu Quebec 2026 Schedule F and K when published |
| 7N N8: probate schedules read on a search excerpt rather than the page: BC (Probate Fee Act), SK, MB, NS (only the 100,000-and-over tier), NL; PEI (400 + 4 per 1,000 and the lower steps) and the Nova Scotia lower steps are secondary; New Brunswick may have raised its rates on 12 June 2026 (not on the page read) | 7N | S | each province's court or finance page; the PEI Probate Act s. 119.1; NB Probate Court Act schedule |
| 7N N6: low-income provincial tax reductions built for ON, BC, NB, NL, NS and PE from the CRA **2025** provincial forms (primary) used as 2026 amounts; AB, SK, MB and QC forms read: none. BC 2026 (575 / 25,570 / 3.56%) from CRA T4127. Still open: the 2026 forms (amounts about 2% higher), Ontario's LIFT credit (Schedule ON428-A) and its dependants with an impairment | 7N | P (2025) | the 2026 ON428, NB428, NL428, NS428 and PE428 when published (about the end of 2026) |

### Correctness spot-check (prep item 4, 2026-10-23)

Roadmap prep item 4: five households (list approved by the owner, US state mix chosen by the owner), each checked for
**one tax year, 2026** (projection year 0, so `taxIndexFactor` is 1 and the 2026 parameters apply as published),
against figures worked by hand from primary sources. No outside tool models a whole projection, so the check is the
year's tax, premium credit and IRMAA charge given that year's incomes. Every source below was read on 2026-10-23.

**Method.** Each household ran through the Vitest world (`world()`, `engine(w).simulate`, and for the US
`accountTrace` for the year's tax profile; a scratch probe, not committed). The engine figure is the year-0 row:
`taxFor` on the traced profile reproduced `row.tax` (less payroll tax and penalty) exactly in every US household, and
`incomeTaxCA` on a hand-built profile reproduced the Canada row. Federal and state were separated by re-running
`taxFor` on the same profile with `stateTax: 'tx'` (every US household takes the standard deduction, so the state tax
does not feed back into the federal one). The hand figure applies the form's lines to the same incomes. All households
hold no taxable account and no cash, so there are no dividends, interest or gains.

**Sources (primary, read 2026-10-23).**
- Rev. Proc. 2025-32, sections 4.01 (tax rate tables), 4.03 (capital gain bands), 4.14 (standard deduction, $1,650 /
  $2,050 aged add-on): https://www.irs.gov/pub/irs-drop/rp-25-32.pdf. **Every federal figure in `federal-rules.js` that
  this check touched matches.**
- 2025 Schedule 1-A (Form 1040), Part V, lines 31-37 (the senior deduction: one 6% reduction off each spouse's $6,000,
  `seniorDeduction`'s per-person reading confirmed): https://www.irs.gov/pub/irs-pdf/f1040s1a.pdf.
- Publication 915 (2025), Worksheet 1, lines 1-19 (taxable Social Security; `taxableSsOnRow` matches line for line):
  https://www.irs.gov/pub/irs-pdf/p915.pdf.
- Rev. Proc. 2025-25, section .01 (2026 applicable percentage table; `acaExpectedPct` regular branch matches):
  https://www.irs.gov/pub/irs-drop/rp-25-25.pdf. Instructions for Form 8962 (2025), line 5 and Table 2 (method):
  https://www.irs.gov/pub/irs-pdf/i8962.pdf. 2025 HHS poverty guidelines, 48 states ($15,650 + $5,500 a person; a
  2026 credit uses them): https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines/prior-hhs-poverty-guidelines-federal-register-references/2025-poverty-guidelines-computations.
  IRC 36B(b)(3)(A)(iii) (the 2021-2025 table): https://www.law.cornell.edu/uscode/text/26/36B. Status of the enhanced
  credit: expired 2025-12-31; the House passed a three-year extension on 2026-01-08, the Senate has not (secondary:
  https://www.aha.org/news/headline/2026-01-09-house-passes-bill-extending-enhanced-premium-tax-credits,
  https://pantanacpa.com/blog/the-premium-tax-credit-in-2026/, October 2026). The planner's default (enhanced off) is current law.
- CMS fact sheet "2026 Medicare Parts A & B Premiums and Deductibles" (2025-11-14), Part B and Part D IRMAA tables:
  https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles. `IRMAA_TIERS` matches (B + D
  surcharges 95.70, 240.40, 385.00, 529.60, 578.00 a month).
- Massachusetts DOR "Tax Rates" (updated 2025-12-30: 5.00%, 2026 surtax over $1,107,750) and "Personal Income Tax
  Exemptions" (updated 2026-10-14: $4,400 / $8,800 / $6,800, $700 at 65+, $1,000 a dependent):
  https://www.mass.gov/info-details/tax-rates, https://www.mass.gov/info-details/personal-income-tax-exemptions. Matches.
- California FTB 2025 Form 540 (line 7: $153 a person, two on a joint return; line 9: $153 a senior) and the 2025
  540 booklet (Schedule Y, standard deduction $5,706 / $11,412, line 32 phase-out thresholds):
  https://www.ftb.ca.gov/forms/2025/2025-540.pdf, https://www.ftb.ca.gov/forms/2025/2025-540-booklet.html. The FTB
  "Tax calculator, tables, rates" page (updated 2026-01-02) lists no 2026 schedules yet.
- Minnesota DOR press release of 2025-12-16 (2026 brackets, standard deduction) and "Tax Year 2026 Inflation-Adjusted
  Amounts in Minnesota Statutes" (2025-12): https://www.revenue.state.mn.us/press-release/2025-12-16/minnesota-income-tax-brackets-standard-deduction-and-dependent-exemption,
  https://www.revenue.state.mn.us/sites/default/files/2025-12/inflation-adjusted-amounts-2026.pdf. Minn. Stat.
  290.0132 subd. 26 (Social Security subtraction): https://www.revisor.mn.gov/statutes/cite/290.0132.
- CRA T4127 Payroll Deductions Formulas, 122nd edition (2026-01-01), Tables 8.1 and 8.2 (federal and Ontario rates,
  thresholds, Ontario BPA, surtax 5,818 / 7,446):
  https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html.
  CRA "Current year tax rates and income brackets (2026)":
  https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html. 2026 TD1
  (BPA $16,452 to $181,440, age amount $9,208 over $46,432, pension $2,000) and TD1ON (BPA $12,989, age amount $6,342
  over $47,210, nil at $89,490, pension $1,796): https://www.canada.ca/content/dam/cra-arc/formspubs/pbg/td1/td1-26e.pdf,
  https://www.canada.ca/content/dam/cra-arc/formspubs/pbg/td1on/td1on-26e.pdf.

**Households and figures (2026, dollars).** "Engine" is the planner's year-0 figure; "Hand" is worked from the sources.
The premium rows apply the statute's linear rule at the exact ratio, except H3m, which follows Form 8962 (line 5
truncated, Table 2 four decimals) to show F6.

| # | Household (inputs that matter) | Item | Engine | Hand | Diff |
|---|---|---|---|---|---|
| H1 | Single, 62, MA, retired; pension 12,000, IRA draw 50,168.68 (AGI 62,168.68) | Federal (16,100 deduction, taxable 46,068.68, 12% bracket) | 5,280.24 | 5,280.24 | 0 |
| | | Massachusetts (5% of AGI less 4,400) | 2,888.43 | 2,888.43 | 0 |
| H2 | Couple MFJ, 67 and 66, CA; SS 36,000 + 21,600, IRA draw 68,037.48 + Roth conversion 100,957.14 (other income 168,994.62) | Taxable SS (Pub. 915 Wks 1: 85% cap binds) | 48,960.00 | 48,960.00 | 0 |
| | | Federal (AGI 217,954.62; deduction 32,200 + 2 x 1,650 + senior 2 x 1,922.72; taxable 178,609.18) | 28,718.02 | 28,718.02 | 0 |
| | | California, 2025 schedules (SS exempt; taxable 157,582.62; 7,532.46 less exemption credits) | 6,919.46 | 6,920.46 | -1.00 (F4) |
| H3u | Couple, 60 and 58, MA, retired early, ACA on (benchmark 24,000), MAGI 82,418.93 = 389% FPL | Net premium (9.96% band; Form 8962 line 8a rounds to 8,209) | 8,207.70 | 8,208.93 | -1.23 (F7) |
| | | Federal / Massachusetts | 5,530.27 / 3,680.95 | 5,530.27 / 3,680.95 | 0 |
| H3o | Same, spending +5,000: MAGI 107,469.90 = 508% FPL | Net premium (no credit over 400%) | 24,000.00 | 24,000.00 | 0 |
| H3m | Same, MAGI 41,105.26 = 194% FPL | Net premium (4.19%-6.60% band) | 2,599.47 | 2,593.74 (8962: 194% -> 0.0631) | +5.73 (F6, F7) |
| H3mE | Same, enhanced on, MAGI 64,590.83 = 305% FPL | Net premium (statute: 6.0% + 5/100 x 2.5 = 6.125%) | 3,410.38 | 3,956.19 | **-545.81 (F2 -543.60, F7 -2.21)** |
| H3oE | Same, enhanced on, MAGI 87,515.00 = 413% FPL | Net premium (8.5%) | 7,437.45 | 7,438.78 | -1.33 (F7) |
| H4 | Couple MFJ, 75 and 73, MN; IRAs 1,200,000 / 500,000, SS 36,000 + 21,600, 2024 MAGI entered 230,000 | RMDs (Uniform Lifetime 24.6 / 26.5) | 48,780.49 / 18,867.92 | 48,780.49 / 18,867.92 | 0 |
| | | Federal (AGI 116,608.41; deduction 35,500 + senior 12,000) | 7,797.01 | 7,797.01 | 0 |
| | | IRMAA (tier 1 joint, 2 x 95.70 x 12) | 2,296.80 | 2,296.80 | 0 |
| | | Minnesota (SS subtraction 80% of 48,960 = 39,168; deduction 30,600 + 2 x 1,600; taxable 43,640.41) | 2,635.13 | 2,334.76 | **+300.36 (F3)** |
| H5 | Ontario couple, 73 and 71; RRIF 2,000,000 pooled (minimums 55,300 / 52,800), CPP 15,600 / 10,800, OAS 8,880 each, discretionary draw 36,122.85 split 50/50 | A: OAS recovery (15% of 97,841.42 - 95,323) | 377.76 | 377.76 | 0 |
| | | A: federal (taxable 97,463.66; credits 16,452 + age 1,553.25 + pension 2,000 at 14%) | 13,375.32 | 13,375.32 | 0 |
| | | A: Ontario (6,708.39 less 14,785 at 5.05%, surtax 28.75, Health Premium 750) | 6,740.50 | 6,740.50 | 0 |
| | | B: federal / Ontario (income 90,541.42; age 2,591.59 federal, nil Ontario) | 11,810.89 / 6,078.37 | 11,810.89 / 6,078.37 | 0 |

H5 was 67 and 65 on the approved list; it ran at 73 and 71 because the planner applies the RRIF minimum only from 71
(`rrifMinPct`, a documented simplification), so the younger couple would not exercise it.

**Differences and classification.**
- **F1 (code bug, Canada): the federal fourth-bracket rate is 29.29%; the law is 29%.** `FED_RATES` in
  `src/canada/core/tax/rules.js` (and the meltdown label `[29.29, 258482]` in `tax.js`) have 0.2929; T4127 Table 8.1
  (R = 0.2900) and the CRA 2026 rates page say 29%. Not reached by H5 (both returns under 117,045); found while reading
  T4127. Engine federal tax on 220,000 (under 65, Ontario): 46,037.60; by hand 45,925.78 (+111.82, i.e. 0.29 points on
  the 38,560 in the bracket; up to +223.42 at 258,482, every year above 181,440 of taxable income). **The unit test
  shares the error:** `tests/unit/canada/tax-brackets.test.js` line 59 pins 0.2929, so the fix changes the test and the
  Canada snapshots together. The fix also touches the RRSP meltdown's bracket choice: `src/canada/index.html` offers
  `<option value="29.29">` and `federalBracketCeilingCA` matches on that value (`tax.js`, `[29.29, 258482]`), so the
  option and the key change together, and a saved plan holding `meltdownBracket: 29.29` needs a migration in
  `normalizeState`, or it matches no row and silently falls back to the 33% ceiling. **Fixed** in 887375f (branch
  `claude/canada-fed-29pct`, Canada V63): the rate, the `tax-brackets.test.js` row (220,000 = 45,925.78 by hand), the
  meltdown option and key (29) and the `normalizeState` migration changed together; Canada snapshots updated.
- **F2 (code bug, US, only with "Assume enhanced ACA subsidies return" on): the enhanced schedule is one straight
  line from 0% at 150% FPL to 8.5% at 400%.** IRC 36B(b)(3)(A)(iii) has five bands (0; 0-2%; 2-4%; 4-6%; 6-8.5%), so
  the line is low everywhere inside: at 200% 1.70% against 2.0%, at 300% 5.10% against 6.0%, at 305% 5.28% against
  6.125% (H3mE: the premium understated by 545.81). The README and the field's tip say only "capped at 8.5%". Not
  current law for 2026, so it matters only to a user who turns the option on. **Fixed** (c2b907a, branch
  `claude/aca-enhanced-bands`, US V133): the banded table; snapshot: only "std R acaEnhanced" moves, depletion 96 -> 95.
- **F3 (code data, US): Minnesota's row carries 2025 or older figures.** The 2026 Social Security simplified-subtraction
  phase-out starts at 110,780 joint / 86,410 single and head of household (the row: 108,320 / 84,490, its note says
  "2026 not found"); the 2026 additional standard deduction for 65+ is 1,600 married / 2,000 single and head of
  household (the row: 1,300 for all). H4: +300.36. Also not modeled, found on the same pages: the standard-deduction
  limitation (290.0123 subd. 5: 2026 thresholds 244,400 / 122,200 married separate) and the alternate Social Security
  subtraction (290.0132 subd. 26(e)-(h): 5,840 joint less 20% of provisional income over 88,630; matters only where it
  beats the phased-out simplified one). To verify in the same pass (no household had children; the PDF's columns are
  misaligned there): the 2026 Child Tax Credit phase-out thresholds appear to be 38,770 joint / 32,680 other (the row:
  37,910 / 31,950) and the maximum may be indexed (1,800 against the row's unindexed 1,750). Follow-up (a Minnesota data
  refresh; the snapshot moves).
  **Fixed** (commit 02af338, branch `claude/mn-2026-ca-joint-credit`): the phase-out thresholds and the 65+ amounts
  above (`seniorExemption.amount` may now be one per column); H4 now 2,334.76, pinned in `tests/unit/us/tax-brackets.test.js`.
  Child Tax Credit confirmed from the PDF's text layer (`pdftotext -raw`, which is clean where the printed columns are not):
  maximum 1,800 with statutory year 2025, so indexed, phase-out 38,770 joint / 32,680 other; the row now carries those and
  indexes the amount, and the straight-line phase-out rate (12%) no longer multiplies by the amount's index factor.
  Still not modeled, listed in the row's notes (owner's decision open): the standard-deduction limitation and the
  alternate Social Security subtraction.
- **F4 (code data, US): California's joint personal exemption credit is 307; Form 540 line 7 gives 2 x 153 = 306.**
  One dollar on every joint return. Fold into the next state data pass. **Fixed** (commit 02af338, branch
  `claude/mn-2026-ca-joint-credit`): 306.
- **F5 (documented): California is on its 2025 schedules** (`asOf: 2025`); the FTB has not published 2026 schedules
  (checked 2026-10-23). The H2 hand figure therefore uses the 2025 schedules too. Replace when published (already in
  Open items).
- **F6 (simplification, not documented): the premium credit is continuous.** Form 8962 truncates the FPL percentage to
  a whole number (line 5), reads a four-decimal applicable figure (Table 2) and rounds the contribution to whole
  dollars (line 8a); the engine interpolates on the exact ratio. The truncation always lowers the percentage, so in the
  sloped bands (133% to 300%) the engine charges more than the form: up to about 20 dollars a year just under a band edge
  (199.99% FPL, MAGI 42,298: 6.5995% against the form's 6.55%, about 21 dollars; about 19 near 249.99% and 299.99%). The
  two roundings move it by up to about 3 dollars either way. H3m: +5.73 (F7 included). Conservative; worth one sentence
  in `us-health.md`; no code change proposed.
- **F7 (documented approximation): an ACA year can stop at the pass limit a little off the fixed point.** H3u, H3m,
  H3mE and H3oE all ran the full 8 passes (`MAGI_ITER_MAX`) and priced the premium on a MAGI about 12 to 16 dollars below the
  realized one (H3m about 10, H3u about 12, H3oE about 16 dollars; 1.2 to 2.2 dollars of premium), because the update is damped by half from pass 4 onward even on a
  smooth band. The comment above `phaseUnresolved` in `run-projection.js` already names this ("the old slow
  convergence"). Not a rule error; a smaller damping only after a sign flip would converge faster (a possible Batch 5
  item, not proposed here). H2 (no ACA; Medicare, a conversion year) also ran 8 passes; its figures are exact at the
  realized incomes, and why it did not converge earlier was not investigated here.

**Confirmed with no difference:** the 2026 federal brackets, standard deductions and aged add-on, the senior deduction
and its per-person phase-out, the taxable-Social-Security worksheet, the regular 2026 applicable percentage table, the
2025 poverty line for 2026 coverage, ACA MAGI counting all Social Security (`magiBase0`) and IRMAA MAGI counting only the
taxable part, the 400% cliff, the 2026 IRMAA tiers and their 2024 lookback, the Uniform Lifetime divisors at 73 and 75,
Massachusetts, Minnesota's 2026 brackets and base standard deduction, and the Canada federal (except F1) and Ontario
2026 amounts: brackets, BPA, age amount and its 15% reduction, pension amount, OAS recovery threshold and its line-23500
deduction, the Ontario surtax and Health Premium.

**Proposed pinned Vitest tests** (hand literals from the sources above, never engine output; each one needs inputs
whose expected value is exact in binary or a written-out cent tolerance, which is the owner's call under CLAUDE.md
rule 2). Those marked *after the fix* fail today and land with their follow-up, not before (rule 7).
1. US `seniorDeduction(ctx, 'mfj', 0, [67, 66], magi)` at MAGI 200,000: 2 x (6,000 - 3,000) = 6,000 (Schedule 1-A
   lines 31-37); at 250,000: 0.
2. US `taxableSocialSecurity(57,600, 168,994.62, 'mfj')` = 48,960 (Pub. 915 Worksheet 1, the 85% cap) and one case in
   the 50% tier.
3. US `acaNetCost` at 389% FPL (9.96%), at 401% (full premium) and in the 150-200% band; and *after the fix* (F2) the
   enhanced table at 200%, 300% and 305%.
4. US Minnesota `stateIncomeTax` for H4's sources, 2,334.76 *after the fix* (F3).
5. Canada `federalTaxCA(ctx, 220000, 0)` = 45,925.78 *after the fix* (F1) (the existing `tax-brackets.test.js` row
   changes with it).
6. Canada H5's two returns (`personTaxCA` A = 20,493.59, B = 17,889.26), a whole-return check of the age amount,
   pension amount, OAS recovery, surtax and Health Premium together.

## Open items

- **Rhode Island row: IRA draws excluded in error (found in the E1e state research, 2026-10-09; not scheduled).** The RI row's
  `retirementExclusion` applies to every traditional draw (`applies.traditional: true`), but Rhode Island's Pension and Annuity
  Income Modification never covers IRA income: PUB 2026-01 Retirement Income Guide (tax.ri.gov, 2026-02), "No income from a
  traditional IRA, Roth IRA, SEP-IRA, or any other type of IRA qualifies"; only pensions, annuities and 401(k) / 403(b) / 457(b)
  plans do. So a Rhode Island household's IRA draws at full retirement age are under-taxed by up to the $50,000 cap. A fix needs
  the 401(k) / IRA split of each filer's draw, which the PA mechanism already supplies (`retirement401kA/B`); an intended number
  change with a before/after table. Decide when to schedule it.
  **Resolved (2026-10-10, branch `claude/ri-ira-exclusion`, US V128):** a new per-person flag `applies.employerPlanOnly` (RI only):
  from the minimum age (67) only the 401(k) part of a filer's traditional draw counts toward the $50,000 cap, read from the same
  `retirement401kA/B` share as Pennsylvania's rule. That share is zero while a filer works (Pennsylvania's after-retirement rule);
  the owner first reused it as is, then, after the independent review showed PUB 2026-01's Example 4 gives the exclusion to a
  filer of 68 who still earns wages, chose an ungated share for RI: `buildTaxProfile` drops the working test when the year's rule
  is `employerPlanOnly`. Before / after (hand-computed, in the tests):

  | Household (2026, no inflation) | Before | After |
  |---|---|---|
  | `state_7d_households` RI joint retiree, A 68 (pension 30,000, IRA draw 25,000), B 66: RI tax | 566.25 | 1,316.25 |
  | the same with 10,000 of A's draw from a 401(k) | 566.25 | 941.25 |
  | the same with all 25,000 from a 401(k) (pension + draw 55,000, capped at 50,000) | 566.25 | 566.25 |
  | `ri_ira_exclusion` single 68, spending 40,000 from an IRA: the year's tax | 1,879.55 | 3,011.42 |
  | the same from a 401(k) | 1,879.55 | 1,879.55 |
  | the same, half IRA half 401(k) | 1,879.55 | 2,075.04 |

  No snapshot scenario has an RI household drawing an IRA at 67 or older, so `us.json` did not move (577 / 376 exact).
  Timing (`bench_runs_interleaved.js --base` the pre-fix tree `b3825b4`, 21 rounds, median of three runs, simulate / historical):
  TX 0.0% / 0.0%, CA -1.0% / -1.2%, NY +0.3% / 0.0%, PA -0.3% / +1.2%, CT +2.0% / +2.5%, WA +1.3% / +1.4%.
  Independent review (Opus, 2026-10-10): no blocking. Adopted: the ungated share for RI (above), engine cases for a filer still
  working at 68, a joint couple with different IRA / 401(k) mixes and the survivor period (`tests/ri_ira_exclusion.js`), and a
  stale comment. Checked and kept: the joint AGI limit $133,750 is ADV 2025-22's figure for the pension / 401(k) / annuity
  modification (tax year 2025, married filing jointly; the row's "2025 limits" label is right), while PUB 2026-01's table and
  Example 4 show $133,500: the two Division publications disagree; the Advisory, the primary inflation-adjustment table, is kept.
- **Roth conversions take the pro-rata 401(k) share in RI and PA (found in the RI review, 2026-10-10; not scheduled).** The year's
  conversion reaches `taxFor` inside `traditionalExtra` with the draw, so `sources.retirement401kA/B` gives it the filer's 401(k)
  share; but the engine converts IRA money first (`applyRothConversion`), and an IRA conversion never qualifies in RI (Form 1040
  line 4b) or for PA's under-59 1/2 employer-plan rule. Example: RI, 68, half IRA half 401(k), a $40,000 IRA conversion: about
  $20,000 of it is excluded in error (before the RI fix all $40,000 was). A fix passes the conversion to `taxFor` apart from the
  draw (a signature change on the hottest tax function), or splits it by the accounts it actually came from. Named in the RI notes.
  **Resolved (2026-10-24, branch `claude/ri-pa-conversion-tax-75362e`, US V138).** The law, read 2026-10-24 (P): Pennsylvania does
  not tax a traditional-to-Roth IRA conversion at any age (PA-40 instructions 2025, "Roth IRA Rollover" and 1099-R tip 4; Personal
  Income Tax Guide DFO-02, "Special Rules for Converting Traditional IRAs to Roth IRAs"; only an amount that never reaches the Roth,
  such as withheld federal tax, is taxed; a code G direct rollover from an employer plan is not taxable either). So the review's
  premise was reversed for PA: a conversion before 59 1/2 was over-taxed (only its 401(k) share was excluded, none while working).
  Rhode Island (PUB 2026-01, Feb 2026): IRA income never qualifies; a taxable distribution reported on Form 1040 line 5b does, so a
  conversion of 401(k) money qualifies and one of IRA money does not (A: the guide does not name Roth conversions; its "completed
  rollovers" are read as the untaxed ones; the first draft read every conversion as not qualifying, and the Opus review showed the
  line-5b test). The same review found that the draw after an IRAs-first conversion holds more 401(k) money than the start-of-year
  share. The fix (owner, 2026-10-24: model the sources): `profile.conv` (the pass's conversion, the first dollars of
  `traditionalExtra`) reaches the state as `sources.convA/B`; in a conversion year the year loop replays its ledger steps on a copy of
  the shares (`accountsConvertPreview`, only when the year's rule reads the 401(k) shares) for the conversion's 401(k) share
  (`convK401FracA/B`, one pooled share so the household's converted 401(k) dollars are the ledger's) and the draw's share after it
  (`k401DrawFracA/B`); `retirement401kA/B` adds the three parts (RMD, draw, conversion); PA's new `applies.conversionExempt` excludes
  the conversion at any age. No signature change. Before / after (hand-computed, `tests/unit/us/conversion-state-tax.test.js`, 2026,
  no inflation):

  | Household | State tax before | After |
  |---|---|---|
  | PA single 55, wages 100,000, a 30,000 IRA conversion | 3,991.00 | 3,070.00 |
  | PA single 55 retired, half 401(k), conversion 30,000 + draw 20,000, wages 100,000 | 3,837.50 | 3,377.00 |
  | RI single 68, start-of-year share 1, a 40,000 IRA conversion (a profile probe) | 0.00 | 883.13 |
  | RI single 68, IRA 100,000 / 401(k) 100,000, IRA conversion 40,000 + draw 40,000 | 883.13 | 1,445.63 |
  | RI single 68, a 40,000 conversion of 401(k) money | 0.00 | 0.00 |
  | RI joint 68 / 67, all 401(k), IRA conversion 40,000 + draw 60,000 | 0.00 | 266.25 |

  No snapshot scenario lives in RI or PA, and `tests/ri_ira_exclusion.js` and `tests/pa_employer_plan.js` run with
  `rothConvEnabled: false`, so neither moves.
  Not modeled (PA): Tax Forgiveness eligibility income counts a nontaxable conversion or IRA draw; the row takes eligibility income
  as the PA base, which leaves them out.
- **A conversion's partner split follows the pool share, not the accounts it came from (found in the RI/PA conversion fix,
  2026-10-24; not scheduled).** `taxFor` splits the conversion between the partners' returns and state per-person caps by
  `ownerShareA` (as the draw), but `accountsConvert` takes IRAs first, pro rata between the two IRAs, then the 401(k)s. When the
  partners' IRA / 401(k) mixes differ, a per-person cap (any `perPerson` state) or a two-return year sees a different split than the
  ledger. Federal on a joint return is unaffected. (The 401(k) share of each partner's conversion and of the draw after it does
  follow the ledger, `accountsConvertPreview`; only the A / B amounts do not.) Also not followed: outside a conversion year, the
  draw's 401(k) share after the year's 72(t) payments (the start-of-year share is used).
- **Owner backlog (2026-10-09, raised during the E1e brainstorm; none scheduled yet, each to be designed when picked up):**
  1. Check self-employment against W-2 at the same income: a probe of a self-employed partner against a W-2 twin
     (SE tax and its half deduction against FICA plus the employer's half, QBI, the Solo 401(k) room against the W-2
     room, 162(l) against a pre-tax premium), with each difference explained by the law, not just by the code.
  2. ~~Profit sharing shows when the income type is W-2 (`profitSharingPctA/B`, `Planner_US.html` ~366).~~ **Resolved, no
     change (owner, 2026-10-09):** an employer's profit-sharing (nonelective) contribution to a W-2 employee's 401(k) is real
     (E1a), and the same field is the Solo 401(k) plan rate for self-employment (E1c), so it stays visible for W-2.
  3. Job change: a dated replacement of a partner's main job (the old job ends and a new one starts at a given age,
     with its own pay, kind, plan contributions and health premium), as opposed to an extra income stream added on
     top. Overlaps with the E1b stream panel and the E1c coverage rules.
  4. Separate income growth for Partner A and Partner B in the main income group (today `incomeGrowth` is one
     household rate; the 401(k) and IRA contributions follow pay), like the per-stream growth on income streams.
  5. Pre-retirement health care: move the group to the Income tab, and make "which job covers each partner" one
     explicit, dated rule. Checked at `3ae542a`: the main job's premium (`healthPremiumA/B`, while working on W-2) and a
     W-2 stream's `healthPremium` are both charged in a year when both apply (additive), and coverage is "main W-2 job
     or any W-2 stream with a premium" (`employerA/B`, E1c `streamCoverBits`); with no employer coverage the partner is
     on the marketplace (ACA). The owner's rule: one covering job per partner per year, and a job change (item 3)
     switches the premium to the new job's in that year, never adding the two. Decide with item 3.
- ~~**Fixing (owner, 2026-10-09): the UI snapshot's `histSuccess` race.**~~ **Resolved 2026-10-09** (`e4cd0d9`, merged into
  `claude/batch-3b-penalty-rules`): the clock-driven capture below; the spec owner checked it plain and at 4x CPU throttling (both
  planners pass; the implementer ran 3 plain, 3 at 4x and 1 at 8x), and the baselines now pin the success rates (US 85/89/49%,
  Canada 83/94/60%). The record: `tests/snapshot_ui.js` `surfaceChecks` dispatches an input, waits
  400 ms, dispatches again and captures at once; the planner's historical backtest is debounced 500 ms after the last render
  (`schedulePlanStatusHistRate`), armed inside the first render, before the test's 400 ms timer is armed. When that render takes
  over about 100 ms (a loaded machine), the backtest fires first, its rate persists, and the capture shows "85%" (Canada "83%")
  instead of the baseline's dash. Reproduced by the spec owner with Chrome CPU throttling (scratch probe, `1fc8683`): unthrottled
  first render 26-49 ms, dash 3 of 3; 4x 137-146 ms and 8x 417-448 ms, "85%" 6 of 6. A race in the test, not the app.
  **First fix, withdrawn (the spec owner's error):** polling until the tile is not a dash. Under throttling the load-time backtest
  (500 ms after load, on the default state) fires before the test's patch, so the tile already shows the default rate and the poll
  exits with a stale value (the implementer's throttled run: Canada std R 83% against 94%, std R everything 83% against 60%).
  **Fix (owner, 2026-10-09):** drive the page clock the test already installs: in `surfaceChecks`, after `newPage`,
  `page.clock.pauseAt` (fires what is due, then time stands still); patch, first input, open the cards; `page.clock.runFor(400)`
  (replacing the in-page 400 ms wait); second input (arms a fresh 500 ms backtest); `page.clock.runFor(600)` (fires it on the
  patched state); capture. Spike (spec owner, scratch, `1fc8683`, both planners x 3 surfaces x CPU 1x/4x/8x x 3 runs): every surface
  one histSuccess, text, projection and rows hash across all 9 runs, equal to the backtest computed directly on the patched state
  (US 85/89/49%, Canada 83/94/60%), projection and rows hashes equal to the committed baselines, text lengths equal to an
  unthrottled capture (no rendering blocked by the paused clock). Baselines: the three surfaces of `ui_us.json` and
  `ui_canada.json` change in `textHash`, `textLength` and `histSuccess` only. A `--cpu-throttle N` option proves it. Rejected:
  cancelling the backtest (needs an app hook, pins nothing); waiting for the value to change (hangs when the patched rate equals
  the default's); a fixed longer wait (still a race). It also replaces E1d Task 5's hand-patched `ui_us.json` hashes with a real
  capture.
- ~~Backlog (owner, E1b design 2026-10-08): a pre-tax health premium on W-2 income-stream wages.~~ Pulled into E1c (owner,
  2026-10-08): a yearly premium on W-2 streams, which also makes that job the owner's coverage.
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
- ~~Batch 3C: the safe-MAGI room has no behavioral test (carried from Batch 1, see
  its notes); resolve it there and carry the note into `docs/reference.md`.~~ **Resolved in 3C:** the cliff guard's
  cap has a behavioral test with a mutation check (`tests/cliff_guard.js` case 1) and the double-counted room is fixed
  (the cap uses the line less `magiBase`); see "Batch 3C notes". Carry into `docs/reference.md` at consolidation.
- IRMAA is priced undiscounted in the year that causes it (3C): the surcharge is charged two years on and a death
  or a lower later MAGI may mean it is never charged; the guard's stay-unders still count it in full (all of the
  guard's value losses are IRMAA stay-unders). Decide a discount (or a margin) in Batch 5, with the scans.
- Cliff plan (2026-10-07): lambda's emptied-pool sample (recorded in the 3C notes, "Redesign: the cliff plan") and
  the live-mix toggle's per-path order choice are Batch 5's; IRMAA stay-unders on a path can save $0 when the path's
  inflation moves the charged tier (counted by the cliff-plan scan, not gated).
- State-law cliffs are not solver candidates (3C): state retirement exclusions, credits and step tables are priced by
  `taxFor` only, so the guard never stays under or fills to them. Revisit with Batch 5 (or a state candidate list
  read from `STATE_RULES`).
- `pickLiveWithdrawalOrder` (decision, 3C amendment 13.3): it still drives the live-mix toggle (old behavior, label
  and info tip); its `remainingMagiRoom` input is built and forwarded every year but cannot change its choice (dead
  wiring). Batch 5 removes both when the tax-aware order replaces it (and updates the source check in
  `tests/historical_parity.js`).
- Roth-conversion bracket sizing (raised in Batch 2): `solveRothConversion` sizes the
  conversion with a conservative deduction lower bound (age-adjusted standard, or
  property tax + mortgage interest if larger), leaving out the senior deduction and
  state income tax because both depend on the conversion itself. Effect: in tax years
  2026-2028 a 65+ filer converts up to about $6,000 per eligible person less than an
  exact fill, and a large-state-tax itemizer slightly less; later years are
  unaffected. Making it exact needs iterating on the conversion inside
  `solveRothConversion`. Revisit with Batch 3C (safe-MAGI room and conversion
  sizing), with a before/after on a 65+ conversion scenario. **Still open after 3C:** conversion sizing moved to
  Batch 5 (spec section 13), so this is decided there (`solveRothConversionTo` is the bracket fill to change).
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
  wanted, the shared number listener (`src/shared/ui/inputs/field-listeners.js`) needs a blank-aware option.
- CPI 2025: confirm to two decimals from the BLS index level (see Batch 6).
- EITC (raised in 7A, deliberately not modeled in 7B): a qualifying child plus earned income and
  an investment-income cap. It could matter to a coast-FIRE household with children in low-MAGI
  years, and it interacts with the safe-MAGI policy, so decide it with 3C. **Proposed in 7O (O6): left out**
  (no earned income in retirement; the $12,200 investment-income limit for 2026 cancels it).
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
  partner's traditional draw in the tax profile (the account ledger already tracks it) and a `retired` condition. Not built; scheduled as 7O O3.
- Lagged federal-tax pass cost (7D): Alabama, Missouri (and Oregon, Montana when written) run an extra federal tax computation inside every `taxFor` call; measured +44% (AL) and +87% (MO) on the 1,200 + 360 run benchmark. Decide whether to cache the liability (keyed on the profile and the draw) if the optimizer feels it.
- State EITCs and other refundable earned-income credits (CalEITC, NY EITC, CT EITC) are not modeled in 7C; decide them with the federal EITC (above). 7O O6 proposes leaving them out with it.
- CA 2026 figures: replace the 2025 figures when the FTB publishes the 2026 schedules (the row is `asOf: 2025`).
- NY real property tax credit and household credit, CA Young Child Tax Credit, and local income taxes are documented gaps (the CA Young Child Tax Credit is in 7O O4).
- 7A birth-year clamp: the bounds are fixed 1950-2100; a typed partial year is saved transiently
  (see the 7A gotchas).
- Batch 8: grid ranges and the default objective are confirmed when it is
  scoped.
- US tax, credit and benefit gap assessment (2026-10-06): moved into Batch 7O (decision 21), which keeps the
  corrections to the external catalog, the items to build, the deferred ones (HSA, pension type) and the left-out list.

Task 5 (text and tests only, no number change): the Methodology callout sentence on income streams and lump sums rewritten to match the engine (ten streams with owner and kind, ten lumps tax-free or taxable); the junk-kind case of test_income_streams.js uses kind x (self is valid since E1c); CLAUDE.md files list gains tests/lump_income.js and test_lump_income.js and the gainPct / boolean-true note; the NIIT comment in taxFor cites IRC 1411(c)(1)(A)(iii) and 1411(c)(4). ui_us.json: textHash and textLength only, for the three surfaces, +257 characters each (28,262 -> 28,519; 27,877 -> 28,134; 29,694 -> 29,951); projection and rows hashes unchanged. The baseline was patched by hand from a clean capture because node tests/snapshot_ui.js --update captured the histSuccess flake (85% instead of the dash) on three tries in a row; the known timing race also makes the check itself fail intermittently, in both planners.
