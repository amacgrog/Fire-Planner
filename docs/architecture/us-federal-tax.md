# US federal tax

Read before touching the federal deductions, QBI, the filing-status table, or the child credits.

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
  parameter family (brackets, deduction, extraAge, gains, ss, niit, medicare, irmaa, senior, ctc), which
  data row it reads (`ORDINARY_BRACKETS`, `STD_DEDUCTION`, `STD_EXTRA_65`, `GAIN_BANDS`, `SS_BASE`,
  `NIIT_THRESHOLD`, `IRMAA_TIERS`, `SENIOR_PHASE_START`), plus a `joint` flag for the structural branch in
  `taxFor`/`solveRothConversion`. Read through `filingKey(filing, family)` / `filingRow(filing)`; an unknown
  status reads as single. Never write `filing === 'mfj'` in new code; add a row or a family instead.
  Statuses: `mfj`, `single`, `hoh` and `qss`. `filingStatusFor` (US) picks the year's status: unmarried with a
  qualifying child that year is `hoh`, else `single`; a survivor of a married couple is `mfj` in the death year,
  `qss` for the next two tax years while a qualifying child exists, then as unmarried. `qss` mixes families (joint
  brackets, deduction and gain bands and the NIIT, single Social Security bases, Additional Medicare Tax, IRMAA and
  senior phase-out). An unmarried couple (marry-later before the wedding, or `filingStatus: single`) keeps household
  status `single`; the two-filer branch of `taxFor` gives Partner A (who claims the children) `hoh`. `taxFor`
  branches on `filingRow(f).joint`, then `profile.singlePerson` (single, hoh or qss), then two filers.

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
