# FIRE Planner: features, modeled items and batch status

Snapshot of the `claude/batch-7o` working tree (2026-10-06), compiled from `README.md`, `CLAUDE.md` and `docs/next-batches-plan.md`. O1 (Medicaid) is in the working tree but uncommitted. This is a docs-based summary; the planner files were not opened and no tests were run for it.

# Part 1: What's built

## Shared by both planners (engine and UI)

**Projection engine**
- One year-by-year engine, `runProjection`, with two modes: a standard constant-assumption projection, and a historical backtest / Monte Carlo run on the same engine (batch 1 parity).
- Couple or single-person mode, with independent ages, income, retirement ages and life expectancy.
- Separate return assumptions for stocks, bonds and cash, and a real/nominal dollar toggle.
- Taxable-account cost-basis tracking, with taxed dividends and interest and reinvestment that raises basis.
- A MAGI iteration that re-solves each year until the income assumed for credits and cliffs matches what the withdrawals realized.
- A bond-ladder bucket strategy: a pre-retirement ramp funded from traditional/RRSP first, then Roth/TFSA, then taxable as a last resort. Retirement-time refill is gradual.
- Withdrawal waterfall: taxable → tax-deferred → tax-free → cash → bond reserve → home equity.
- Smoothed (proportional) withdrawals. A live "optimized withdrawal order" toggle is US-only.
- Guyton-Klinger guardrails, opt-in.
- Survivor planning, opt-in: filing status, benefit swap, spending cut, account consolidation, and OAS in Canada.
- Healthcare and LTC costs grow faster than CPI; LTC can be toggled off.
- Tax brackets, deductions and credits follow each historical path's own inflation.

**Housing and add-as-you-go lists** (up to 10 each)
- Housing modes: own, rent, and rent-then-buy. The mortgage payment is fixed from the original principal and term; property tax and insurance are separate lines.
- Lists: loans, income streams, recurring expenses, one-time expenses, one-time income, spending-tier changes, and children.
- Pre-tax health premium per paycheck.

**Results and UI**
- Dashboard: four headline tiles with an adjustable safe withdrawal rate, a plan status bar, and "What's driving this" / "On track" banners.
- Chart views: ±1/±3-year retirement shifts, a CAGR sweep, a historical backtest (1928–2025) and Monte Carlo (block bootstrap, 500/1,000/2,000 paths).
- Chart controls: x-axis picker, log scale, expand-to-fullscreen.
- Analysis cards: a tornado sensitivity chart, a cash-flow Sankey, and a "What do you want to figure out?" menu with delta previews.
- Exports and scenarios: CSV export, a print/PDF report, named scenarios with a comparison table and overlay chart, and JSON import/export.
- Setup and guidance: a first-run wizard, "Estimated" badges with a guided review, and unusual-assumption warnings.
- Layout: sidebar search, category rail and info bubbles, a mobile layout, light/dark mode, accessibility work, and MCP tool hooks.
- Everything stays local: nothing is transmitted, and inputs autosave to `localStorage` in the browser only.

## US planner: tax, credit and benefit mechanisms

| Area | What's modeled |
|---|---|
| Federal income tax | Brackets by filing status: MFJ, single, head of household, and qualifying surviving spouse. Separate return branch for pre-marriage couples. |
| Capital gains / NIIT / payroll | Long-term gain bands, NIIT, Social Security and Medicare payroll tax, and the 0.9% Additional Medicare Tax. |
| Social Security taxation | Provisional-income taxation of benefits. |
| Deductions | Age-based standard deduction, the temporary senior deduction (through 2028), and simple itemizing: state tax plus property tax under the SALT cap schedule, plus mortgage interest on up to $750K of debt. |
| Child credits | CTC ($2,200 per child, indexed, phase-out), refundable ACTC, and the $500 Credit for Other Dependents. Head-of-household and qualifying-surviving-spouse status follow from the children list. |
| State income tax | All 50 states plus DC from one data table, with each row researched and sourced. See the list below. |
| ACA | Premium tax credit with the 400% FPL cliff and an enhanced-subsidy toggle. Household size includes children. Spousal employer-coverage rules decide who buys ACA coverage. |
| Medicaid (O1, uncommitted) | $0 premium at or under 138% FPL in expansion states (Wisconsin 100%). Non-expansion states get no credit under 100% FPL. From 2027 the work requirement applies, with a child-13-or-younger exemption. An "Enroll in Medicaid when eligible" checkbox is on by default. |
| Medicare / IRMAA | Part B/D plus supplement from `max(65, retirement age)`. IRMAA tiers use the two-year MAGI lookback and the same-year MAGI iteration. |
| Retirement accounts | Four accounts per partner (traditional and Roth, 401(k) and IRA) with an ownership ledger, employer match, catch-ups, auto-Roth above the wage threshold, and mega-backdoor Roth. |
| Distributions | RMDs by birth year and per-partner share. |
| Early withdrawals | A per-account 10% penalty, Rule of 55 (opt-in, 401(k) only), and 72(t) SEPP per account. The Roth ledger orders withdrawals as contributions, then conversions with a 5-year clock, then earnings. |
| Roth conversion ladder | Fills a chosen bracket, capped by the ACA cliff and IRMAA tiers. Includes a bracket optimizer, a per-year optimizer, and a multi-lever withdrawal/conversion optimizer with an "Apply" button. |
| Social Security | Start age per partner, with a flat monthly amount used as entered. In the survivor period the household keeps the greater benefit. |

**State-tax mechanisms:**
- Flat and graduated tax, surtaxes, and filing-status columns (HoH and QSS).
- Standard deductions, exemptions, dependent exemptions, and phase-outs.
- Retirement-income exclusions: per person, age-tiered, and AGI-phased.
- Social Security exemptions and AGI tests.
- Credits: exemption, renter, child, property-tax, tax-forgiveness, AGI-step, income-tested, and Social Security credits.
- Gains treatment: separate rate or a dollar exclusion.
- Federal-tax subtraction, lagged one pass.
- Scheduled year-by-year rule changes.
- Flat county tax for Maryland and Indiana.
- NY benefit recapture.
- Washington's capital-gains tax.
- Local income taxes (except those two) are not modeled.

## Canada planner: tax, credit and benefit mechanisms

| Area | What's modeled |
|---|---|
| Federal tax | Brackets, with the basic personal amount as a 14% credit with its high-income phase-down. |
| Federal credits | Age amount (with clawback), pension income amount ($2,000, from 65), spouse and eligible-dependant amounts, medical expense credit, working-year payroll credits, and the home buyers' amount. |
| Provincial tax | All 10 provinces from one table: brackets, basic personal amount, age and pension credits, and eligible-dividend credit. |
| Provincial specifics | Ontario's surtax and Health Premium, Quebec's 16.5% abatement and pooled credit, Manitoba's BPA phase-down, and a spouse amount per province. |
| Dividends | Eligible-dividend gross-up and federal and provincial credits. Non-eligible dividends are not modeled. |
| OAS | Maximum amount, the 10% increase from age 75, and the recovery tax (clawback) on full income. The repayment is deducted from net income, as on the T1. |
| CPP / QPP | Start age 60–70. |
| Payroll items | EI, QPIP, enhanced CPP/QPP deduction, and Quebec's workers' deduction. |
| Quebec | Health Services Fund contribution and RAMQ premium. |
| Low-income reductions | Ontario, BC, NB, NL, NS and PEI. |
| Medical | One-claimant medical credit. Ontario's Seniors Care at Home credit. |
| Income-tested benefits | GIS and Allowance, CCB, Canada Groceries and Essentials Benefit, and provincial child, family, low-income and seniors programs for all 10 provinces. Manitoba, Nova Scotia and New Brunswick occupancy credits use rent and property tax. All are treated as tax-free cash and subtracted from tax, so the withdrawal solvers price lost benefits. |
| Registered accounts | RRSP and TFSA, FHSA, and RRIF minimums from 71. |
| Strategies | RRSP meltdown ladder with a bracket optimizer, and pension income splitting solved to minimize household tax. |
| Estate | After-tax estate (display only, and used to rank the meltdown optimizer), including province-by-province probate fees. |

**Deliberately not modeled in Canada:** an early-withdrawal penalty (none exists), the territories, and several smaller items. Those smaller items include the transfer of a spouse's unused amounts, the Ontario LIFT credit, disability benefits, the prior-year lookback, and Quebec's home-ownership credit.

# Part 2: Plan status

## Done and merged
Batch 1 (historical parity), Batch 2 (US tax and Medicare correctness), 3A and 3B (account model and penalty rules), and Batch 7: 7A, 7B, 7C, 7D plus its performance follow-up, 7J, 7K, 7L, 7M and 7N.

## In progress: 7O (this branch, US only)
- **O1: done in the working tree, uncommitted.** Medicaid and the premium-credit floor. US V101.
- **O2: not started.** Medical expense deduction in LTC years. Medical expenses above 7.5% of AGI go into itemizing: LTC cost, Medicare premiums and the net pre-65 premium.
- **O3: not started.** Pennsylvania treats 401(k) draws after retirement as exempt. Needs a per-person 401(k) split in the state-tax sources.
- **O4: not started.** State child credits as data rows: MN, OR, VT, UT, NJ and ME. The California Young Child Tax Credit is a conditional candidate.
- **O5: not started.** A warning (no number change) when Social Security starts before both retirement and full retirement age, since the earnings test is not modeled.
- **O6: not started.** Docs only. Records what's deliberately left out: federal and state EITC, Saver's Credit/Match, circuit breakers, other local taxes, the Credit for the Elderly or Disabled, means-tested aid, and education and energy credits.
- **Deferred past 7O (need new fields):** an HSA account, and a pension type (private, government or military) per partner.

## Upcoming, in order
1. **3C: safe-MAGI room.** Withdrawals avoid crossing the 400% FPL cliff or the next IRMAA tier. It also has to price the new Medicaid cliffs from O1, and add a behavioral test that has been missing. A related carried item is exact Roth-conversion sizing for 65+ filers.
2. **4A: Canada mixed withdrawals.** A live mix, applied schedules and smoothing for taxable, RRSP/RRIF and TFSA. The income-room hook covers the OAS clawback threshold, GIS limits and the age-amount phase-out.
3. **4B: Canada optimizer port.** The multi-lever optimizer with RRSP meltdown targets, "kink" targets (OAS, GIS, age-amount edges), and net cost including benefits.
4. **Batch 5: optimizer upgrades.**
   - A performance baseline.
   - A selectable objective: tax, healthcare, ending net worth, legacy, IRMAA, ACA, RMDs, or a blend.
   - Kink targets for the new US cliffs.
   - "Searches for a tax-efficient strategy" wording instead of "optimal".
5. **Batch 6: independent items.**
   - Social Security guided PIA entry, claim-age rules, spousal and survivor benefits, and a trustee benefit-cut what-if.
   - HSA.
   - Canada CPP/OAS claim-age adjustments, optionally with a CPP survivor pension.
   - Loose ends: the bond coupon proxy and confirming 2025 CPI to two decimals.
6. **Batch 8: Social Security survivor-claim optimizer.** A grid search over survivor and own-benefit start ages.
7. **Final step:** consolidate the batch notes into `docs/reference.md`.

## Open items without a batch
- Bracket-creep catch-up for the non-indexing states (NY, PA, CT).
- Social Security child benefits.
- Grandfathered pre-2018 mortgage debt.
- A true blank for Roth IRA basis, which currently uses 0 to mean "not entered".
- A primary-source verification backlog.
- A list of Canada simplifications in credits, benefits and taxes (the "Open items" section after 7N).
