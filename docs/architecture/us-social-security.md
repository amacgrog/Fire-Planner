# US Social Security

Read before touching `src/us/core/income/social-security.js`, any reader of a Social Security amount (the year loop, the cliff
plan's estimates, the Sankey), or the Social Security inputs.

Related: [engine.md](engine.md), [cliff-plan.md](cliff-plan.md), [inputs-and-ui.md](inputs-and-ui.md),
[us-federal-tax.md](us-federal-tax.md) (Pub. 915), [us-health.md](us-health.md) (the MAGI the ACA and IRMAA read),
[test-inventory.md](test-inventory.md), `docs/superpowers/specs/2026-11-21-ss-claiming-optimizer-design.md` (the claiming-age
optimizer: PR 1, the basis and factors, is built; PRs 2-5 are not), `docs/superpowers/plans/2026-11-21-ss-claiming-pr1-basis-factors.md`.

## The inputs

Per partner: `ssMonthlyX` (a money field), `ssStartAgeX` (62-70; 75 under `ssLateStartEnabled`, feedback B1, which only moves
the box's limit; the minimum of 62 is not enforced, `ss-start-age.js`), `ssBenefitBasisX` and `ssCollectingX` (SS PR 1, US V192).
Household: the benefit cut `ssBenefitCutPct` / `ssBenefitCutStartYear` (feedback B2, `ssPaidShare`).

- `ssBenefitBasisX`: `'atClaim'` (the default and every save from before it): the amount is paid as entered from the start age,
  which is everything before PR 1; or `'pia'`: the amount is the benefit at full retirement age (the PIA, today's dollars), and
  the planner applies the claim-age factor. A FIELDS choice (a `<select>`), so `normalizeState` falls an unknown value back to
  `'atClaim'`.
- `ssCollectingX` ("already collecting", default false; true only when `=== true` on load): the start age is when the benefit
  started. Shown in both bases (owner, 2026-11-21): in `'atClaim'` it changes no figure today; the claiming card (PRs 3-4) reads
  it to fix that benefit's axis or hide the card.

## The one formula

Every Social Security amount is read through `social-security.js`; no other module under `src/us/core/` outside `core/inputs/`
names `ssMonthly` (`tests/unit/us/ss-claim-basis.test.js` scans for it):

- `ssFullRetirementAgeMonths(birthYear)`: SSA's table (POMS RS 00615.003): 65 to 1937, +2 months a year to 66 for 1943-1954,
  +2 months a year to 67 for 1960 and later. The birth year is `ctx.taxYear - inputs.ageX`: the plan stores ages, not birth
  years, so a tax-year change can move a person across a row. The earnings-test warning (`ssBeforeRetirementCase`) reads it
  too; the rows before 1943 (age 84 and older) are new in PR 1 (they read 66 before).
- `ssClaimFactor(fraMonths, claimAge)`: the claim age is clamped to 62-70 (a start below 62 never extrapolates; a start past 70
  under B1's switch gets the factor of 70, since delayed credits stop at 70). Early: 5/9 of 1% a month for the first 36 months,
  5/12 of 1% beyond (POMS RS 00615.101); late: 2/3 of 1% a month (RS 00615.692, 20 CFR 404.313). Counted in whole units of
  1/3600 (20, 15 and 24 a month) and divided once, so 62 with an FRA of 67 is the double nearest 0.7 (`2520 / 3600`), where
  `1 - 0.2 - 0.1` is 0.7000000000000001.
- `ssFactorAge(ctx, p)`: the start age when collecting (and the start age is not after the current age; a later one is read as
  not collecting); otherwise the later of the start age and the current age (`ageX`, year 0): **claims now**, a start age
  already past is a claim this year (spec 7.1). The default start age of 62 for someone older is the usual case.
- `ssOwnFactor(ctx, p)`: 1 in `'atClaim'`; in `'pia'`, `ssClaimFactor` at `ssFactorAge`. The sidebar's check line
  (`src/us/ui/inputs/ss-basis-notes.js`) reads the same factor.
- `ownBenefitYearly(ctx, p, a, factor, paid)`: the partner's own benefit in the year they are `a`. Nothing before the start
  age; `'atClaim'` is `monthly * 12 * factor * paid`, the order every former copy had (so no figure moved in PR 1); `'pia'` is
  `monthly * 12 * ssOwnFactor * factor * paid`. The payment condition is the same in both bases: a start age below the current
  age is paid from year 0.
- `survivorBenefitYearly(ctx, deceasedIsA, deathYear, ageA, ageB, factor, paid)`: after a death, the greater of the two own
  benefits, each as if both were alive (the simplified swap). The deceased and the death year are arguments for PR 2's survivor
  rules (the deceased's base, the survivor's age reduction): `lambdaEstimate` passes the death its life expectancies imply even
  with survivor modeling off (`isSurvivorPeriod ? deathYear : firstDeath`).
- `socialSecurityIncome(ctx, { year, age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA, deathYear })`: the year
  loop's stage (`run-projection.js`) and the Sankey's (`sankey-columns.js`): the two own benefits, or in the survivor period
  the survivor's slot from `survivorBenefitYearly` and 0 in the deceased's.

The cliff plan's `benefitIncomeAt` (the bridge check and the lambda walk) and `lambdaEstimate`'s sample profiles call
`ownBenefitYearly` / `survivorBenefitYearly` directly (they had their own copies, `ssAt` and `ssOf`, before PR 1).

Whole years: a claim at x pays the whole projection year in which the person is x, and "claims now" pays the whole of year 0,
although a real claim starts in a month. The bias is nearly the same for every claim age, so a comparison barely moves.

## The guided entry

`#ssGuide`, one collapsed panel for both partners (owner, 2026-11-21), quotes SSA's Quick Calculator
(ssa.gov/OACT/quickcalc/, labels read 2026-11-21 in a browser: "Enter your date of birth", "Enter earnings in the current
year", the optional retirement date, "today's dollars", "See the earnings we used"; with no retirement date it shows three
ages). It tells the reader to zero the earnings from their planned retirement on, since the calculator otherwise assumes work
until the claim, which overstates an early retiree's benefit.

## Not modeled (known simplifications)

- Delayed credits are 8% a year for everyone; people born before 1943 (84 and older in 2026) earned less a year.
- The January lag of delayed credits; claiming in months rather than whole years.
- The earnings test (the "Worth a second look" warning names it); spousal and the full survivor benefits (PRs 2 and 5 of the
  claiming-age spec); the family maximum.

## The seed and the fingerprint

`monteCarloSeed` leaves the four keys out by name (as B1's and B2's), so no Monte Carlo figure moves, and with a basis switched
the same seed runs the same market paths. The stored plan's `fingerprintJson` appends each key after the rest only while it is
away from its default (`'atClaim'`, false): no saved plan went stale when they shipped, and a plan applied before a switch to
`'pia'` reads stale (spec 9's rule for every new key of the claiming-age work).
