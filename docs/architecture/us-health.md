# US healthcare: ACA, Medicaid and Medicare

Read before touching `acaNetCost`, `MEDICAID_RULES`, ACA eligibility, Medicare gating or IRMAA charging.

Related: [magi-iteration.md](magi-iteration.md), [cliff-plan.md](cliff-plan.md), [self-employment.md](self-employment.md), [lists.md](lists.md).

## Medicaid and the premium-credit floor

- **Medicaid and the premium-credit floor (US, `MEDICAID_RULES`, 7O O1).** A pure-literal table in `src/us/core/healthcare/medicaid-rules.js`
  (`MEDICAID_RULES:begin/end`; not a `STATE_RULES` column): `expansionLimit` (1.38 of FPL: 133% plus the 5-point disregard),
  `nonExpansion` (ten states), `adultCoverage` (Wisconsin 1.0), `ptcFloor` (1.0) and `workRequirement` (`fromYear` 2027,
  `exemptChildMaxAge` 13). `acaNetCost` applies it before the credit schedule, so `healthcareCost` and the 400% guard still share one function:
  at or under the state's Medicaid line the cost is $0 (checkbox `medicaidWhenEligible`, default on) or the full premium (checkbox off, or from
  2027 a household with no child 13 or younger fails the work requirement, which also bars the credit); under 100% of FPL there is no credit.
  A MAGI of 0 is no longer a free pass. `medicaidLimit(code)` is cached per code and `hasChildAtMost` loops the children list in place (a child counts from its join year, E2), so the
  path allocates nothing. `conversionMagiCeiling` is unchanged: the new cliffs (the floor, the 138% line, the 2027 start) are priced by the cost
  and listed in the plan's cliffs register; 3C decides the policy. At the step-down cliffs the MAGI iteration has no fixed point: after the cap the pass that overpaid the least is re-run once (`forcedPass`), the cost at the realized MAGI is charged and the refund goes to cash (`magiStats`, 7O follow-up F5; filling to the line is 3C); the guardrail record and `firstWithdrawal` are re-recorded net of the refund so the guardrails do not cut spending for a premium that was never paid. Tests: `tests/aca_medicaid.js`.

## The applicable percentage

- **`acaExpectedPct(ratio, enhanced)`** (`src/us/core/healthcare/aca.js`) interpolates linearly between the points of a table. Regular
  (`REGULAR_PTS`, Rev. Proc. 2025-25): 2.10% under 133% of FPL, 3.14% to 9.96% by 300%, 9.96% to 400%; above 400% `acaNetCost` charges
  the full premium (the cliff). Enhanced (`ENHANCED_PTS`, the "Assume enhanced ACA subsidies return" option, the 2021-2025 table of IRC
  36B(b)(3)(A)(iii)): 0% to 150%, then 0-2% (150-200%), 2-4% (200-250%), 4-6% (250-300%), 6-8.5% (300-400%), 8.5% above 400% with no
  cliff. Until 2026-10 the enhanced branch was one straight line from 0% at 150% to 8.5% at 400%, which understated the premium inside
  the bands (at 305% 5.27% against the statute's 6.125%; spot-check F2). The 400% conversion guard and the cliff-plan's 400% line are off
  in enhanced mode and do not read the curve. Tests: `tests/unit/us/aca-enhanced.test.js`.
- **The return's price (reconciliation mode, 162(l) settlement).** `acaCoverageKind(ctx, magi, size, gross, yearIndex)` classifies a
  premium by `acaNetCost`'s own branches and tolerances: 0 no premium, 1 marketplace with an advance credit (in the band and the expected
  contribution below the premium, so a credit was paid: 1.36B-2(b)(6)(C)), 2 marketplace without one (full premium: under the 100%
  floor, under the Medicaid line not enrolled, over 400% without `acaEnhanced`, or a band point whose expected contribution reaches
  the premium), 3 Medicaid.
  `acaNetCost(..., recon)` takes a kind (0 = in-year, unchanged and allocation-free): 3 costs 0; 1 skips the Medicaid branch and the
  floor and takes the credit at the final MAGI (Treas. Reg. 1.36B-2(b)(6): eligibility is decided on the return), keeping the 400%
  rule; 2 pays the full premium under the Medicaid line, since a person eligible for Medicaid but not enrolled gets no credit
  ((c)(2)(v) protects only someone the Exchange assessed as not eligible). `healthcareCost` takes `recon` (-1 prices in-year and
  fills the scratch `ACA_KIND`: slot 0 the household or A's return, slot 1 B's; 1 prices with `reconKindA` / `reconKindB`).
  Tests: `tests/unit/us/aca-reconcile.test.js`.

## ACA and Medicare cost lines (no Canada equivalent)

- US splits post-retirement healthcare into two separate cost lines —
  `state.healthcare` (pre-65 ACA/retiree premium, gated on `acaEligibleA`/
  `acaEligibleB` from `acaEligibility()`: that partner retired AND under 65,
  AND either the other partner has also stopped working or that other
  partner's `employerCoversSpouseA/B` flag is off — the flags default to
  true, which is the old "both retired" rule; the same helper feeds the
  400%-FPL conversion guard, so cost and guard can't drift apart) and
  `state.medicareYearly` (Part B/D + supplement, gated per-partner on
  `age >= 65 && !working` (Medicare starts at `max(65, that partner's
  retirement age)`: a partner still working at 65 stays on the employer plan and
  enrolls the year they stop, no late-enrollment penalty modeled; independent of
  the other partner), and IRMAA follows the same gate) — unlike ACA marketplace
  eligibility, which also depends on the spouse. Canada has no equivalent split to
  build: `state.healthcare` there is a flat "supplemental private
  insurance once retired" figure with no age-65 transition at all, because
  provincial coverage (OHIP/MSP) is universal at every age — if anything,
  some provinces' senior drug programs (e.g. Ontario Drug Benefit at 65)
  argue for *lower* supplemental cost at 65, not a new mandatory expense —
  don't port `medicareYearly` to Canada.
