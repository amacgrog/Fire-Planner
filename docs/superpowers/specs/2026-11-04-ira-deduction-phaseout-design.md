# Traditional IRA deduction phase-out, IRA basis and the backdoor Roth (US)

Status: design, awaiting the owner's approval. Brainstormed with the owner on 2026-11-04.

## Why

The US planner deducts every traditional IRA contribution at any income (`src/us/core/income/contributions.js:207-216`:
`iraType === 'traditional'` puts `iraA/iraB` into `traditionalContribA/B` with no test). The stream IRA
(`streamPlanContributions(..., iraType === 'traditional')`) and the Solo IRA (`P.iraPretax`) do the same. Under IRC 219(g), a
person covered by a workplace plan (an "active participant"), or married to one, loses the deduction as modified AGI rises.
The trigger case is the owner's scenario: an MFJ couple aged 58 and 56 with wages of $115k and $72k, each maxing a Roth 401(k)
and a traditional IRA with catch-up. Their MAGI is about $187k, above the $149k top of the covered-spouse range, so none of
their $17,200 of IRA contributions is deductible. The planner currently takes it off taxable income: about $3.8k of federal
tax a year at 22%, plus state tax.

The planner also has no notion of after-tax money (basis) in a traditional IRA. Every dollar drawn or converted is taxed, so
someone who really made nondeductible contributions is overtaxed later.

## What the law says (2026)

Source: IRS News Release IR-2025-111 (2025-11-13), with IRS Notice 2025-67.

Deduction phase-out ranges, by MAGI:

| Situation | 2026 range | Indexed |
|---|---|---|
| Single, head of household or qualifying surviving spouse (`qss`), covered | $81,000 - $91,000 | yes |
| MFJ, the contributor covered | $129,000 - $149,000 | yes |
| MFJ, the contributor not covered, the spouse covered | $242,000 - $252,000 | yes |
| MFS, covered | $0 - $10,000 | no (not modeled: the planner has no MFS) |
| Nobody covered (on that return) | no limit | |

- **The reduction** (219(g)(2)): the deduction limit (the 219(b)(5) limit for that person, catch-up included: $8,600 at 50+,
  $7,500 under) is reduced in proportion to `(MAGI - lower) / (upper - lower)`. The reduced limit is rounded **up** to the next
  multiple of $10, and is at least $200 while MAGI is below the top of the range (219(g)(2)(B), (C)). At or above the top it is 0.
- **MAGI** (219(g)(3)(A)) is AGI figured without the IRA deduction itself and without sections 135, 137, 221 and 911
  (none of which the planner models), after taxable Social Security (section 86). It **includes** Roth conversion income and every taxable draw of the year. On a joint
  return the couple's joint MAGI applies to each spouse.
- **Active participant** (219(g)(5)): covered by an employer plan for the year. That includes any 401(k) deferral, employer
  match, profit sharing, or SEP / Solo 401(k) contribution, and a defined-benefit pension accrual.
- **Basis** (IRC 408(d)(2), Form 8606): nondeductible contributions are after-tax basis. Every distribution from a person's
  traditional, SEP and SIMPLE IRAs, conversions included, is tax-free in the proportion basis / (year-end IRA value +
  the year's distributions and conversions). Each person's IRAs are pooled; 401(k)s and a spouse's IRAs are not.

## Goals

1. **Per-partner contribution types.** The Retirement contributions group gets a Roth / Traditional choice for the 401(k) and
   for the IRA **per partner** (`k401TypeA/B`, `iraTypeA/B`), replacing the household-wide `k401Type` and `iraType`.
2. **The deduction phases out.** For a partner whose IRA is Traditional, the deductible part of that partner's traditional IRA
   contributions for the year (the salary IRA, the W-2 stream IRA and the Solo IRA, summed) is capped by the 219(g) limit above.
   Only the deductible part reduces taxable income.
3. **Coverage is inferred** per partner per year (owner decision): a partner is covered when any 401(k) deferral or catch-up,
   match, profit sharing, after-tax (mega backdoor) money, W-2 stream plan money or Solo plan money goes in for them that
   year. A partner covered only by a pension they don't contribute to is not detected (accepted).
4. **A traditional IRA basis slider** per partner (`tradIraBasisPctA/B`, 0-100%, default 0), in Assets > Retirement accounts
   next to the Roth basis fields: the percent of that partner's opening traditional IRA balance that is after-tax money. The
   planner then tracks each partner's traditional IRA basis in dollars through the projection.
5. **A "Roll funds over the phase-out limit to Roth" checkbox** per partner (`iraBackdoorA/B`), shown only when that partner's
   IRA is Traditional (owner decision). Either way the partner contributes the full amount the IRA slider asks for; only the
   deductible part is deducted, and the rest (the nondeductible part) adds to that partner's traditional IRA basis.
   - **Unchecked:** the nondeductible part stays in the traditional IRA as basis.
   - **Checked:** the same year, the planner converts the nondeductible amount from that partner's traditional IRA to that
     partner's Roth IRA (a backdoor Roth). The conversion follows the pro-rata rule: its taxable part is
     `amount x (1 - basis / IRA value)` over that partner's own traditional IRA. An empty traditional IRA (apart from the
     contribution) makes it tax-free; a large pre-tax balance makes most of it taxable.
6. **Basis comes back pro rata on every IRA distribution.** Any money out of a partner's traditional IRA (a discretionary draw,
   an RMD, a 72(t) payment, the planner's own Roth conversions, the backdoor conversion) is tax-free in proportion to that
   partner's IRA basis over that partner's IRA balance. 401(k) money is never basis-bearing here. It changes taxable income
   and so the federal tax, every state that starts from federal income, MAGI for ACA and IRMAA, and the cliff plan's ending
   value (`endTaxUS` taxes the traditional balance net of the remaining basis).
7. **Roth conversions into the Roth ledger:** a conversion's tax-free (basis) part is still conversion money for the Roth
   ordering rules (408A(d)(4)(B)): it comes out after that same conversion's taxable part, not with regular contributions.
   It is never subject to the 10% recapture (408A(d)(3)(F) covers only the taxable part). So the Roth ledger records it with
   its conversion, never penalized, and `rothFreeCaps` counts it as penalty-free room only in that order. The taxable part is a
   seasoning conversion, as today.

## Non-goals

- **A partner set to Roth IRA** (owner decision): no income test there. The planner assumes the partner does a backdoor
  whenever their income is over the Roth IRA limit (MFJ $242k-$252k, single $153k-$168k, 2026) and keeps their traditional IRA
  empty for that reason. So a Roth IRA contribution stays a full Roth contribution at any income, and no pro-rata charge is
  made for it. Known simplification: a Roth-IRA partner who also holds a pre-tax traditional IRA is undertaxed.
- Married filing separately, and the defined-benefit pension test for coverage.
- Canada (no equivalent; RRSP room has no income phase-out).
- Choosing to skip the contribution when it isn't deductible: that stays the IRA slider at 0%.
- The Roth 401(k) and traditional 401(k) rules themselves (no income limits; unchanged apart from the per-partner type).

## Anti-goals

- No change to any run where no partner has a traditional IRA contribution or a nonzero traditional IRA basis, apart from the
  per-partner type split being a pure migration. Those runs must stay exact to the cent.
- No hot-path cost for a household without traditional IRA contributions and without basis: the new terms are skipped, not
  added as zeros (the `seOn` / `inh === null` pattern in CLAUDE.md).
- No hand-built context, no `state.x` reads in the engine, no new store imports (CLAUDE.md engine invariants).

## Constraints the builder must respect

- **The MAGI iteration** ([magi-iteration.md](../../architecture/magi-iteration.md)): the deduction depends on MAGI, which
  depends on the year's draws and conversions, which depend on the tax. The deduction is figured inside the existing MAGI
  passes. The new basis ledger is a mutable ledger: it gets a clone / restore pair next to `accountsClone/Restore` and
  `rothLedgerClone/Restore`, registered in `tests/engine-purity.json` if module-level. A converged estimate it introduces goes
  everywhere `estTrad` goes (`tests/estimate_sites.js`).
- **The filing table:** the ranges are a filing-status row read through `filingKey` / `filingRow` (a new `ira` key on the
  `FILING` rows), never `filing === 'mfj'`. The `qss` row reads the **single** range (219(g)(3)(B)(ii)), and the
  spouse-covered range (219(g)(7)) applies only on a joint return, even though `qss` reads the joint brackets elsewhere. Marry-later years before the wedding are two single returns, each with its own
  MAGI and the single range; the survivor years are single; the death year follows the engine's existing filing status.
- **Survivor remap** (CLAUDE.md "US vs. Canada"): the deceased partner's IRA and its basis pass to the survivor (a spousal
  rollover keeps basis). The remap into slot A carries basis like it carries balances; `tests/survivor_symmetry.js` must hold.
- **The traditional solvers and the cliff plan:** `solveTraditionalForNet`, `solveTraditionalForNetFromNeed`, `tradGroup`,
  `takePenalized`, `cappableTraditional` and the cliff plan's MAGI cap assume a traditional dollar is a taxable dollar. With
  basis, a draw from an IRA slot is only partly taxable. The builder must keep these consistent (the draw's taxable amount is
  what reaches `taxFor` and MAGI), and decide whether the 10% penalty applies to the basis part (it doesn't, in law: 72(t)
  applies only to the amount includible in income).
- **Indexing:** the ranges are indexed (219(g)(8)) and rounded to $1,000. Use the factor the planner already applies to the
  IRA limit (`limitFactor`) unless the tax-bracket factor is clearly the better fit. Builder's call; say which in the plan.
- **Inputs:** each new field gets markup, a `defaults` value and a `FIELDS` entry; the new enum fields (`k401TypeA/B`,
  `iraTypeA/B`) get `values` / `fallback` guards. `normalizeState` migrates an old save's `k401Type` / `iraType` into both
  partners' fields and deletes the old keys. The MCP tool exposes the new fields. Partner B's controls hide in single-person
  mode (`data-partner-b`).
- **Docs and version:** README feature list, `us-accounts.md` (basis ledger, per-partner types), `us-federal-tax.md` (the
  phase-out), the test inventory, `docs/roadmap.md:232` (that line is the *state* simplification: states such as PA and NJ that never allowed the IRA
  deduction and keep their own basis. This design builds federal basis only, and every state still starts from federal
  income, so the state item stays open; note the federal part as done), and the V badge on
  `src/us/index.html`.

## Expected behavior changes (intended, not regressions)

- **The default plan changes.** The defaults are an MFJ couple with $100k wages each, traditional 401(k)s at 100% and
  traditional IRAs at 100%. Their MAGI before the IRA deduction is roughly $151k (to be confirmed from a run), just over $149k, so the default IRA
  deduction falls to 0 or close to it and default taxes rise. The golden tests and snapshot baselines that use the defaults will move; the plan says
  which and the commit says the snapshot update is intended.
- The owner's scenario: the $17,200 is nondeductible, and taxable income rises by $17,200 in the working years.

## Owner decisions (from the brainstorm)

- Split the 401(k) and IRA types per partner.
- Traditional IRA basis is a per-partner percent slider; default 0%.
- The backdoor checkbox shows only when that partner's IRA is Traditional.
- Coverage is inferred from the year's plan contributions.
- A Roth IRA partner is assumed to backdoor as needed; no income test for them.

## Calls made in writing this up (the owner should check these)

- **The checkbox defaults to unchecked** (keep the nondeductible money in the traditional IRA), on the owner's point that a
  real person may not plan ahead.
- **The pro-rata fraction** uses each partner's IRA basis over that partner's IRA balance at the time of the draw, not
  Form 8606's year-end figure. The builder may keep it simpler (the balance at the start of the year plus the year's
  contributions) if the in-year version costs the hot path; say which in the plan.
- **The basis slider is a percent of the opening balance** (matching the Roth 401(k) slider), not a dollar field like the
  Roth IRA basis.

## Left to the builder

- Where the deduction cap is applied (in `retirementContributions` with MAGI passed in, or after it in the year loop), and how
  the backdoor conversion joins the year's existing conversions.
- The ledger's shape (dollars per IRA slot, as the Roth ledger does), and how basis splits between the stock and bond
  buckets of the pooled traditional bucket.
- The test plan: hand-computed Vitest cases for the 219(g) formula (each range, the $10 round-up, the $200 floor, the top
  of the range), the pro-rata conversion with and without a pre-tax balance, basis recovery on an RMD, the survivor remap, the
  migration of `k401Type` / `iraType`, and a Playwright check that the checkbox shows only for a Traditional IRA and changes
  `window.fireProjectionRows`.
