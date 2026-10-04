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
19. The first-run wizard collects balances by account type, not by assumed
    shares: Traditional 401(k), Roth IRA and Roth 401(k) totals (each split
    between the partners 50/50, single person all to Partner A). No traditional
    IRA is assumed; it is entered only in the Retirement accounts group.

## Execution order

1 (historical parity) -> 2 (US tax and Medicare) -> 3A (account model) -> 3B
(penalty-aware rules, 72(t), Rule of 55) -> 3C (safe-MAGI room) -> 7A (children)
-> 7B (federal credits) -> 7C (state framework + reference states) -> 7D (all
remaining states and DC, one PR) -> 7J (Canada federal credits) -> 7K (all
provinces, one PR) -> 7L (income-tested benefits) -> 4A -> 4B -> 5 -> 6 -> 8
(survivor-benefit claim optimizer).

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
- Retirement accounts today: one pooled `traditional` and one pooled `roth`
  balance (plus `bondTraditional` / `bondRoth`), Partner A's share set by
  `traditionalSharePctA`. Roth early access is a pooled `rothLedger`
  (contribution basis from `rothBasisPct`, a conversion queue with 5-year
  seasoning, earnings). The early-withdrawal penalty is a blended
  `penalizedShare`; Rule of 55 and the 72(t) SEPP (`sepp72tEnabledA/B`,
  `singleLifeDivisor`) act on the pooled traditional balance. Property tax
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
- **Retired fields** (migrated and then deleted from the saved state):
  `traditional`, `roth`, `traditionalSharePctA`, `rothBasisPct`, and the
  `sepp72tEnabledA/B` pair in 3B. `normalizeState` migration maps legacy
  `traditional` into the **401(k)** buckets split A/B by the old slider (this
  preserves today's Rule-of-55-on-everything and SEPP behavior), legacy `roth`
  into the **Roth IRA** buckets split the same way, and legacy `rothBasisPct`
  into `rothIraBasisA/B` dollars (blank when it was 100). New `tests/legacy_state.js`
  cases cover each of those, and the baseline stays byte-identical.
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
- **First-run wizard (decided).** It asks for household totals by account type
  and splits each between the partners 50/50 (single person: all to Partner A),
  which reproduces today's default ownership: Traditional 401(k); Roth IRA;
  Roth 401(k). It never assumes a traditional IRA balance (many people, such as
  backdoor-Roth users, keep that at zero), so Traditional IRA is entered only in
  the Retirement accounts group, and the wizard says so. The group is where
  exact per-account, per-partner balances, Roth IRA basis, Roth 401(k) basis and
  72(t) elections live. Saved scenarios still migrate by the old ownership
  slider (traditional into the 401(k) buckets, Roth into the Roth IRA buckets).
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
- *Senior phase-out* reduces the return's total (6% of the excess MAGI against the
  sum of both spouses' $6,000), so a joint couple with both 65+ loses it entirely at
  $350,000, one eligible spouse at $250,000. Age is the planner's integer age
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
_(to be added by the Batch 3 PRs)_

### Batch 7 notes (7A, 7B, 7C, 7D, 7J, 7K, 7L)
_(to be added by the Batch 7 PRs)_

### Batch 4A / 4B notes
_(to be added by the Batch 4 PRs)_

### Batch 5 notes
_(to be added by the Batch 5 PR)_

### Batch 6 notes
_(to be added by the Batch 6 PR)_

### Batch 8 notes
_(to be added by the Batch 8 PR)_

---

## Open items

Everything raised so far is answered or recorded as a decision above. What
remains is detail to settle when the relevant batch is scoped:
- All batches: figures are confirmed against primary sources at implementation
  time (decided). The planning pass used secondary sources because irs.gov and
  bls.gov were not reachable.
- Pre-retirement bond-bucket strategy for early retirees (raised after Batch 1;
  look at it with Batch 3B): the ladder and the gradual refill now park the whole
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
- CPI 2025: confirm to two decimals from the BLS index level (see Batch 6).
- Batch 8: grid ranges and the default objective are confirmed when it is
  scoped.
