# Self-employment (US, E1c)

Read before touching `incomeKindA/B`, the SE tax, the Solo 401(k), the 162(l) deduction or `self` income streams.

Related: [magi-iteration.md](magi-iteration.md), [us-federal-tax.md](us-federal-tax.md), [us-accounts.md](us-accounts.md), [lists.md](lists.md), [us-health.md](us-health.md).

## Self-employment

- **Self-employment (US, E1c; spec `docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md`).** `incomeKindA/B` (`'wages'` default,
  `'self'`; a `choice` field with `manual: true` and `mcp: true`) says what the partner's main income is. In the year loop
  `seMainA/B` is the main income when the kind is `self` and the partner works (the same `incomeFactor` growth), `wageA/B` the W-2 amount
  (zero for a self-employed partner), so every payroll reader keeps reading wages only; `streamAmountsForYear` returns `self` stream
  profit separately (`seA/B` = main + streams, all of one person's self-employment is one business: one Schedule SE, one Solo 401(k)
  room). `employerA/B` replaces `workingA/B` in the health rules (`acaEligibility`, Medicare gating, the 400% guard): a W-2 job, or a
  W-2 stream with a `healthPremium` (`streamCoverBits(streams, yearCtx)`, bit 1 = A, bit 2 = B, the IRMAA lookback asks two years ahead),
  counts as employer coverage; a self-employed person does not. `seAllowA/B` (162(l) allowed) = self-employed profit, no employer
  coverage of their own, and no spouse-plan coverage in a joint year (`employerCoversSpouseA/B` ticked). Pure functions:
  `selfEmploymentTax(ctx, se, ssWages, yearIndex, out)` (scratch `SE_OUT`: `tax`, `half`, `ne`; 92.35%, nothing under $400 of net earnings,
  Social Security to `SS_WAGE_BASE` less the W-2 wages, Medicare uncapped; the Additional Medicare Tax is in `payrollTax` on wages plus
  `ne`), `soloPlanContributions(p, out)` (scratch `SOLO_PLAN`, `ACCOUNT_SLOTS` order; C = profit less half the SE tax; deferrals in the
  room the W-2 plans left, profit sharing P = C x r / (1 + r) with the compensation limit, one annual-additions room, after-tax money,
  then the IRA on W-2 pay plus C; every dollar is household cash; no Roth catch-up rule) and `seHealthDeduction(healthcare, premA,
  premB, twoReturns, profile, out)` (scratch `SE_HEALTH`; capped by `sePlanNetA/B`, the profit less half the SE tax and the Solo plan
  money, never reduced by a traditional IRA). `retirementContributions` takes `seA/B`, `seMainA/B`, `halfA/B` and returns the Solo money;
  `buildTaxProfile` takes the SE totals and the plan/IRA cuts and carries `seNetA/B` (taxable profit after half the SE tax and the
  cuts), `seEarnedA/B` (profit less half the SE tax: earned income for the ACTC), `sePlanNetA/B`, `seAllowA/B` and `seHealthA/B`
  (the survivor remap moves B's into slot A). `payrollTax` takes `seTaxA/B` (the SE tax joins the cash payroll cost) and `seNeA/B` (net earnings join the Additional Medicare Tax base with the wages). The main income's Solo 401(k) uses the existing partner fields (`profitSharingPctA/B` is the plan rate, `k401*` / `afterTax*` the employee side). A person who dies
  before retiring stops self-employing at death like a salary. A `self` stream carries `profitSharingPct` and joins the same rooms
  (no `healthPremium` on it: a self-employed stream is covered by the marketplace rule). Defaults reproduce today's numbers: an exact 0
  for every term, so no existing snapshot entry moved. Not modeled: S corporations, business losses, Social Security credit from
  self-employment earnings, a business with employees or property (QBI wage/property limits). Tests: `tests/unit/us/self-employment.test.js`,
  `tests/se_health.js`, `tests/unit/us/qbi.test.js`, `test_self_employment.js`.

## Self-employed income streams

**Streams in E1c (US).** The stream `kind` gains `'self'` (self-employed profit, normalized by `normalizeUsStreams` with a plan-rate
`profitSharingPct`, 0-25, the same panel and rooms as the salary's Solo 401(k) in `soloPlanContributions`) and a W-2 stream gets an
optional yearly `healthPremium` (pre-tax, reduces the stream's wages; above zero the job covers its owner, see `streamCoverBits`).
See "Self-employment" above.
