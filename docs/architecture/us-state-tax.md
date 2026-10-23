# US state income tax

Read before touching `STATE_RULES`, `stateIncomeTax`, the `sources` scratch objects or a state row.

Related: [us-federal-tax.md](us-federal-tax.md), [inherited-accounts.md](inherited-accounts.md), [engine.md](engine.md), [test-inventory.md](test-inventory.md), [us-accounts.md](us-accounts.md), [lists.md](lists.md).

## State income tax (`STATE_RULES`)

- **State income tax (US, `STATE_RULES` in `src/us/core/tax/state-rules.js`, evaluated by `stateIncomeTax`; Batch 7C).** One data row per jurisdiction (the
  50 states and DC, matching the `#stateTax` options) and one generic evaluator, `stateIncomeTax(ctx, sources, filing,
  yearIndex)`. A row declares every field explicitly (`tests/unit/us/state-rules.test.js` fails on
  a missing field or a state missing from the table): `status` (always `researched`: `source` URL + `asOf` year), `indexing` (one boolean per family: `bracketsIndexed`, `standardDeductionIndexed`, `personalExemptionIndexed`, `creditAmountsIndexed`,
  `creditThresholdsIndexed`, `retirementExclusionIndexed`, never one switch for the whole state: CA indexes its brackets, deduction and credits but not
  its $1 million surcharge, NY indexes nothing, WA indexes the deduction but not its $1 million tier; each `additions` entry has its own `indexed`;
  a true flag scales that family by `taxIndexFactor`), `statusAs` (which column `mfj`/`single`/`hoh`/`qss` read: HoH falls back to the
  single column and QSS to the joint one unless the row has its own `hoh` column; the old `FILING.state` family is gone),
  `tax` (`none`, `flat`, or `graduated` with `[start, rate]` columns), `surtax`, `base` (ordinary income yes/no, share
  of gains included, Social Security `exempt`/`taxed`/subtraction), `standardDeduction`, `exemption`, `retirementExclusion`
  (kinds in `stateRetirementExclusion`: `perPerson` and `agiPhasedShare`),
  `credits`, `federalTaxSubtraction`, `localTax` (local income taxes are an accepted, documented gap) and `notes`. Mechanisms
  (all data, evaluator in `stateIncomeTax`): `additions` (a threshold surtax, an AGI step table, NY's `benefitRecapture`),
  `exemptionPhaseOut` and `dependentExemption`, the AGI-tested Social Security kind, per-person retirement kinds
  (`perPerson`, `agiPhasedShare`), and `credits` of kind `exemptionCredits`, `renterCredit`, `childCredit`,
  `propertyTaxCredit`, `taxForgiveness`, `agiStepFraction` (a nonrefundable credit is capped by the tax; a `refundable` one
  can take the state tax negative, as the ACTC can). Step tables are `[[lowerBound, value], ...]` per column. The state
  inputs come from `taxFor`'s `sources`: besides the household sums it carries per-person pensions and traditional draws
  (`pensionA/B`, `retirementA/B`; the discretionary draw is split by `profile.ownerShareA`, the account-ledger share, 0.5 if
  absent), `ssBenefits` (plus per-person `ssBenefitsA/B` and the taxable part split in proportion, `taxableSSA/B`; a one-person return reads slot A), `dependents`, `propertyTax` and `rent` (`housingForYear` now returns `rent`). `taxFor` does not build
  `sources` at all for a no-tax state: that path stays as fast as before. For a taxing state it refills four module-level
  scratch objects (`SOURCES_JOINT/SINGLE/A/B`, one per return, same shape, `newStateSources`) instead of allocating, and
  writes the per-person fields (`pensionA/B`, `retirementA/B`, `ssBenefitsA/B`, `taxableSSA/B`) only when the row's
  `needsPerPerson` flag is set (`compileRow`: a per-person retirement kind or the age-and-AGI-tiered Social Security kind;
  `compileStateRule` ORs in the scheduled variants), so **a new mechanism that reads a per-person field must set that flag**
  (`tests/unit/us/tax-caches.test.js` runs every state with the flag forced on for all rows and fails on a difference, and pins which rows
  carry it). `stateIncomeTax` and its credit helpers must keep nothing from `sources` (it is reused on the next call). Each
  row is resolved once per state code into flat arrays (`compileStateRule`, cached), and the factor is applied inside
  `graduatedTax`, so the hot path allocates nothing. Order of evaluation is fixed, state first, federal second: the state
  tax feeds the federal SALT deduction, so a state base must never read a federal deduction or federal tax (a state that
  deducts federal tax gets one lagged pass, 7D). 7D mechanisms (all data, evaluator in `stateIncomeTax`, hand-computed cases in `tests/unit/us/state-mechanisms.test.js`): `schedule` (year-effective
  rule sets: `[{ fromYear, baseYear?, ...overrides }]`, each building on the one before; a scheduled family holds statutory dollars of its
  base year and indexes from there, `base / taxIndexFactor(baseYear - currentYear)`; only unconditional enacted changes, never revenue
  triggers), `standardDeductionPhase` (`stepDown` / `linear` by state AGI), `seniorExemption` (per filer, the amount a number or by column, optional AGI phase-out),
  `dependentExemption` as a number or an AGI-tiered table, `federalConformity` (the state deducts the federal standard deduction, optionally
  with the 65+ add-on and the senior deduction), additions with a `threshold` per column, and the per-person `perPerson` retirement kind
  now carries `applies` (pension / traditional), `tiers` (age-tiered caps), `reducedBy` (the filer's Social Security subtraction or all
  benefits received uses up the same cap) and `share` (an AGI step share). Second set: Social Security kinds `ageAgiTiered` (per filer by age, with an AGI limit and a cap over it),
  `agiShare` and `agiPhaseOut`; credits `incomeTestedCredit` and `ssCredit`; `base.gainsRate` / `gainsDeduction` (gains taxed separately or reduced by a dollar
  exclusion); `federalTaxSubtraction` as `{ kind: 'lagged', placement, cap, phase }` (taxFor runs one extra federal pass with state tax zero, only for a row that
  deducts federal tax: `rule.lagged`, `federalLiabilityForState`; the liability excludes NIIT, payroll tax and the ACTC; the small SALT-feedback
  inconsistency is accepted and named in the row); and `localTax: { kind: 'flat', rate }` (MD and IN only, a flat county rate on the state taxable income, which
  feeds the federal SALT deduction like the state tax). Third set: `exemptionPhaseOut` kind `linear` (every exemption, the filers' and `dependent` per child, loses `rate` x the federal AGI over `start`), `dependentExemption` `{ kind: 'afterFirst', amount }`, a `seniorExemption` phase-out with a rate per column and `basis: 'federal'`, and credit kind `childStepCredit` (per qualifying child, from a step table of the federal AGI). Circuit-breaker credits are deliberately not built (owner decision). The block between the `STATE_RULES:begin` / `end` comments is pure
  literals so `scripts/gen-state-rules.js` can evaluate it. Rows are `researched` (the six reference states CA, NY, PA, CT, WA, TX with tests in
  `tests/state_reference.js`; the 7D states with hand-computed households in `tests/state_7d_households.js`) and now all 51 rows are researched. Rows follow the
  state's real indexing (`none` for NY, PA and CT; `cpi` for CA and WA), HoH and QSS columns, and income tests; their `notes` text is what the
  planner shows under the selector. The generator also lists every parameter of the researched rows. Evaluating it: that script writes `docs/state-tax-rules.md` (the owner's review
  artifact: one row per jurisdiction with every rule and its source; `npm run gen:states`), and `npm test` fails if the file is
  stale. After changing a row, regenerate and commit the file. Not shared with Canada (US only).

## State rows, later additions

- **State rows, later additions (7O O3, O4).** The per-person retirement kind's `applies` takes an optional `employerPlanAfterRetirement: true` (Pennsylvania only,
  7O O3): below the traditional minimum age a retired filer's 401(k) part of their traditional draw is excluded at any age.
  `applies.employerPlanOnly: true` (Rhode Island only, PUB 2026-01: IRA income never qualifies) reads the same 401(k) part the other way:
  from the minimum age only that part of the traditional draw counts toward the cap, and RI has no "stopped working" test: for a state
  whose rule is `employerPlanOnly`, `buildTaxProfile` computes `k401FracA/B` while the filer works too (PUB 2026-01, Example 4)
  (`tests/ri_ira_exclusion.js`).
  `buildTaxProfile` puts `k401FracA/B` on the profile (the filer's 401(k) share of their own traditional accounts from the account ledger at the start
  of the year, zero while they work; a single person or survivor: the pool's 401(k) share) and `taxFor` fills `sources.retirement401kA/B` (draw x fraction,
  only when `needsPerPerson`); the draw is assumed pro rata, which the penalty-aware draw order and 72(t) payments can depart from. `childCredit` also
  takes `phaseOut.measure` ('stateAgi' | 'income'), `phaseOut.rate` (a straight line), `maxChildren` and `fixed` (unindexed whatever the row flags say), `phaseOut.share` ({ width, round }: a percentage of the whole credit, Oregon), `phaseOut.perChild` (the cut comes off each child, Vermont), and
  `childStepCredit` takes `maxAge` and `measure: 'income'` (7O O4: MN, VT, ME, NJ, OR, UT).
