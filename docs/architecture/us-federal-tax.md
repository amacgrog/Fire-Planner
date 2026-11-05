# US federal tax

Read before touching the federal deductions, QBI, the filing-status table, the IRA deduction phase-out, or the child credits.

Related: [us-state-tax.md](us-state-tax.md), [self-employment.md](self-employment.md), [magi-iteration.md](magi-iteration.md), [lists.md](lists.md), [us-health.md](us-health.md).

## Federal deductions, QBI and 162(l)

- **US federal deductions** (just above `ordinaryTax`): `standardDeduction(ctx, filing,
  yearIndex, ages)` (base + the 65+ additional amount per filer), `seniorDeduction`
  (the temporary $6,000, zero after `SENIOR_DEDUCTION_LAST_YEAR = 2028`; revisit if
  Congress extends it), `saltCap` (explicit year table to 2029, `SALT_CAP_LAST_YEAR`),
  `itemizedDeduction` (min(SALT cap, state tax + property tax) + mortgage interest,
  nothing else) and `federalDeduction` (max of standard and itemized, plus senior).
  `itemizedDeduction` and `federalDeduction` also take the year's medical expenses (7O O2): the part over 7.5% of AGI
  (`MEDICAL_FLOOR_PCT`) is added to the itemized total. The engine sets `profile.medicalExpense = healthcare + ltc` each MAGI pass,
  right after `healthcareCost` (premium after the credit, Medicare, IRMAA and the long-term-care cost); `taxFor` and the lagged
  federal pass read it (`|| 0`), the two-filer branch splits it 50/50, and the itemizing branch is entered only when `medical` exceeds
  the floor, so ordinary Medicare years add nothing to the hot path. `solveRothConversion` and the optimizer's profile literals carry no
  medical term (conservative).
  **QBI and 162(l) (US, E1c).** Both are deductions the engine supplies through the profile, not new filing-status families. The
  self-employed health insurance deduction reaches each return as `profile.seHealthA/B` (it lowers `sources.wages` and the other
  income that `returnMagis` and the Roth fill read, but is not part of the itemized/standard choice). `qbiDeduction(qbi, taxable,
  netGain, joint, yearIndex)` (just above `taxFor`; `QBI_LIMITS`, 2026 Rev. Proc. 2025-32) is subtracted below AGI beside the
  standard/itemized deduction in `ordinaryTax`/`longTermGainTax` calls and in `federalLiabilityForState`, on `sePlanNet - seHealth`
  per return (a joint return adds both; the two-filer branch gives each partner their own). Every business is a specified service
  business with no employees and no property, capped at 20% of taxable income less net gain, with the $400 minimum applied after the cap.
  The Roth-conversion bracket fill subtracts 162(l) but not QBI. See [self-employment.md](self-employment.md).
  The tax year is `ctx.taxYear + yearIndex` in both engines (`taxYearOf(ctx, yearIndex)`) (historical runs replay
  returns, not tax law). `taxFor()` computes each return's deduction itself from its
  own income (AGI stands in for MAGI), the state tax it just computed, and the
  `profile.propertyTax` / `profile.mortgageInterest` that `housingForYear()` supplies
  (interest already limited to $750,000 of original debt); `ordinaryTax` and
  `longTermGainTax` take it as an optional last argument. The two-single-filers
  branch splits housing deductions 50/50. `solveRothConversion` uses a conservative
  lower bound (age-adjusted standard, or property tax + interest if larger; no
  senior deduction, no state tax). `mortgageSchedule()` and `buildDeferredMortgage()`
  (now `src/shared/core/income/spending-and-loans.js`; see `docs/superpowers/inventory/stage2-region-map.md`) now also return a per-year `interest` array.
  Canada has no equivalent in this batch. The Annual property tax field line sits
  between two shared partials (`medicalInflation` ends before it,
  `propertyTaxGrowth` starts after it) so each planner can word its label
  differently; keep it outside the shared partials.

## Filing-status table

- **Filing-status table (US, `FILING`, in `src/us/core/tax/federal-rules.js`).** Each status row names, per
  parameter family (brackets, deduction, extraAge, gains, ss, niit, medicare, irmaa, senior, ctc, ira), which
  data row it reads (`ORDINARY_BRACKETS`, `STD_DEDUCTION`, `STD_EXTRA_65`, `GAIN_BANDS`, `SS_BASE`,
  `NIIT_THRESHOLD`, `IRMAA_TIERS`, `SENIOR_PHASE_START`, `IRA_PHASEOUT`), plus a `joint` flag for the structural branch in
  `taxFor`/`solveRothConversion`. Read through `filingKey(filing, family)` / `filingRow(filing)`; an unknown
  status reads as single. Never write `filing === 'mfj'` in new code; add a row or a family instead.
  Statuses: `mfj`, `single`, `hoh` and `qss`. `filingStatusFor` (US) picks the year's status: unmarried with a
  qualifying child that year is `hoh`, else `single`; a survivor of a married couple is `mfj` in the death year,
  `qss` for the next two tax years while a qualifying child exists, then as unmarried. `qss` mixes families (joint
  brackets, deduction and gain bands and the NIIT, single Social Security bases, Additional Medicare Tax, IRMAA and
  senior phase-out). An unmarried couple (marry-later before the wedding, or `filingStatus: single`) keeps household
  status `single`; the two-filer branch of `taxFor` gives Partner A (who claims the children) `hoh`. `taxFor`
  branches on `filingRow(f).joint`, then `profile.singlePerson` (single, hoh or qss), then two filers.

## The traditional IRA deduction phase-out (IRC 219(g), IRA deduction PR 2)

- **The rule.** A partner who is an active participant in a workplace plan (`coveredA/B`, inferred from 401(k)-slot dollars:
  [us-accounts.md](us-accounts.md)) deducts a traditional IRA contribution only up to `iraDeductionLimit(limit, magi, lower,
  upper)` (`src/us/core/income/ira-deduction.js`): the full 219(b) limit (`iraLimitA/B`, catch-up at 50, times `limitFactor`)
  at or under `lower`, 0 at or over `upper`, and in between `limit - floor10(limit x (magi - lower) / (upper - lower))`: the
  reduction is rounded **down** to a multiple of $10 (219(g)(2)(C), the statute's form; for a limit that is a multiple of $10
  this is the reduced limit rounded up, as Pub 590-A's worksheet puts it), never below $200 while MAGI is under the top
  (219(g)(2)(B)), and never above the limit. The $10 rounding and the $200 floor are not indexed.
- **The ranges** (`IRA_PHASEOUT`, 2026, IR-2025-111; Pub 590-A Tables 1-2 and 1-3), read through the filing table's `ira`
  family (`filingKey(filing, 'ira')`) and `iraRange(filing, covered, spouseCovered, twoReturns, f)`:

  | Return | Range | Row |
  |---|---|---|
  | MFJ or qualifying surviving spouse (`qss`), the contributor covered (Table 1-2) | $129,000 - $149,000 | `covered.mfj` |
  | Single or head of household, covered (Table 1-2) | $81,000 - $91,000 | `covered.single` |
  | MFJ, the contributor not covered, the spouse covered (Table 1-3) | $242,000 - $252,000 | `spouseCovered.mfj` |
  | Nobody covered on that return | no limit (`null`) | |

  `qss` reads the joint covered range (its `ira` family is `mfj`) and, with `joint: false`, never the spouse range. A
  two-return year (marry-later before the wedding) reads the single range with each partner's own MAGI, and never the spouse
  range. Both bounds are multiplied by `limitFactor` (deviation 3). MFS is not modeled (the planner has no MFS).
- **In the year loop** the deduction is applied per pass as an add-back of the nondeductible dollars to the partner's wages and
  to `magiBase` (see "The IRA deduction add-back" in [magi-iteration.md](magi-iteration.md)); the switch is the year constant
  `iraOn` (traditional IRA dollars and someone covered, and not `ctx.test.iraPhaseoutOff`). Rows of such a year carry
  `iraDeducted`, `iraNondeductible` and `iraMagi`; the nondeductible dollars become IRA basis
  ([us-accounts.md](us-accounts.md), "Traditional IRA basis in the year loop").
- **The deviations from the statute** (1-6 approved with the plan, 2026-11-04; 7 added with PR 3):
  1. The 219(g) MAGI leaves out the year's Roth conversions (the planner's own and, in PR 3, the backdoor's). Including them
     would need a new converged estimate carried through every record and replay of the MAGI iteration. Discretionary draws and
     RMDs are included. The error is limited to a covered person contributing to a traditional IRA inside the range in a year
     that also converts.
  2. State classification: the add-back is added to the partner's wages; PA's and RI's conversion-specific rules (`profile.conv`)
     do not see the backdoor's taxable part (PR 3), which is taxed like that partner's RMD. PA and RI may also read part of the
     backdoor's taxable part as 401(k) money (`k401Part` reads `rmdA`).
  3. The ranges are indexed by `limitFactor` without the statute's rounding down to $1,000, as every other `PLAN_LIMITS` entry.
     `convK401FracA/B` stays the 401(k) share of the gross conversion, so PA and RI may misclassify a conversion's 401(k) part in
     a basis year.
  4. The pro-rata basis ratio is fixed per partner per year at the start-of-year basis over the grown IRA; the year's
     nondeductible contribution first counts in the next year's ratio (Form 8606 counts it in the same year). The backdoor (PR 3)
     is the exception: it uses the 8606 form with the year's contribution in both the basis and the year-end value.
  5. Taxable traditional income is split between the partners by pool share (`ownerShareA`), as before. When the partners'
     basis ratios differ, a two-return year and the per-person state rules can put taxable dollars on the wrong partner; the
     household total and the joint federal return are right.
  6. The 219(g) MAGI counts all Social Security (the planner's `magiBase`, the ACA definition), not only the taxable part
     219(g)(3)(A) counts. It overstates MAGI only for someone covered, contributing and collecting Social Security in one year.
  7. (PR 3, the controller's ruling, for the owner to confirm) A survivor's backdoor pro rata covers only the survivor's own IRA.
     The deceased's IRA stays in its own ledger slot, treated as an inherited account (as `accountStatuses` already treats it),
     and an inherited IRA is outside the owner's Form 8606 pro rata; real survivors who keep backdooring do this on purpose. A
     spousal rollover keeping basis stays true for that slot's own draws.
- Tests: `tests/unit/us/ira-deduction.test.js` (the formula and the ranges), `tests/unit/us/ira-deduction-engine.test.js` (the
  year loop).

## Child credits

- **Child credits (US, `childCredits`, just above `taxFor`).** `childCredits(ctx, dependents, filing, yearIndex, magi,
  federalTax, earnedIncome)` returns `{ nonrefundable, refundable }`: the Credit for Other Dependents ($500, a qualifying
  child with `age >= 17`, nonrefundable, not indexed, shares the phase-out; the reduction comes off the CTC part first and
  the tax absorbs the ODC first) and the CTC ($2,200 per child with `age <= 16`,
  indexed by `taxIndexFactor`; phase-out $50 per $1,000 over the `ctc` family threshold, not indexed), limited to the
  federal income tax (ordinary + gains tax, not state/NIIT/payroll), plus the ACTC (min of the unused credit, $1,700
  per child indexed, 15% of earned income over $2,500). `taxFor` subtracts both from the federal tax, so a tax can
  be negative (only through the ACTC). Earned income is `profile.wageA (+ wageB)`, already net of pre-tax
  contributions; extra income streams are not earned income. The no-children path returns a shared constant and
  leaves the float order of the sum untouched (snapshot-exact). The two-filer branch puts the credits on Partner A.
