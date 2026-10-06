# 7N Spec and Implementation Plan: remaining Canadian credits, benefits and fixes

Branch `claude/batch-7n-canada-credits`, cut from `origin/claude/batch-3b-penalty-rules` at `ac5beab` (PR #16, "Plan: Batch 7N"; the code is the 7M merge, Canada V43). Baseline `npm test` on the tip: green (6m44s). Scope source: `docs/next-batches-plan.md`, "### 7N" and decision 20. Canada only, US untouched, no new inputs.

## Owner decisions (2026-10-06, at implementation start)

| Item | Decision |
|---|---|
| N5 | The **whole** LTC input (`ltcYearlyA/B`) counts as a nursing-home medical expense. The LTC info bubble gets a line saying so. |
| N7 | The RAMQ drug premium is paid by **every retired adult** (a partner with no wages this year; a working partner is assumed to be on a group plan). Stated in the Quebec note. |
| N8 | The meltdown-bracket table is **ranked by the after-tax estate**. |

## Global constraints (every item)

- One commit per item, in this order: **N1, N3, N4+N10, N5, N6, N7, N8, N9, N11**. N2 is dropped.
- No new inputs. If an item turns out to need one, stop and ask.
- Every figure is read on a primary source (CRA, Revenu Quebec, provincial finance pages, statutes) and cited with its retrieval date in a new "### 7N notes" section of `docs/next-batches-plan.md`. A figure found only on a secondary page is marked `secondary` in its data row and goes on the backlog.
- Each number-changing item: hand-computed tests, before/after table (default scenario plus one that exercises the item), seeded historical and Monte Carlo success rates (`tests/historical_rates.js --root <worktree of previous commit>` against the working tree), and `npm run snapshot:update` **only** in that item's commit after `git diff tests/snapshots/` is explained. Same commit: Canada badge bump (V43 to V44 and on), `README.md`, 7N notes, `CLAUDE.md` if the architecture changes, `npm run gen:provinces` when `PROVINCE_RULES` changes.
- `taxFor` stays allocation-free, with early exits on the no-OAS, no-children, no-medical, no-low-income paths. New per-call work is O(1) scalar arithmetic.
- Timing gate at the end of every commit that touches `taxFor`: interleaved, one process, previous commit's file against the working file, 300 `simulate()` per round, median of 7, ON / BC / QC, within +5% of the 7M merge (a worktree of `ac5beab` is the baseline; noise is about 10%, so repeat any ratio over 1.05 before acting).
- Windows: planners are CRLF. Write edit scripts with the file tool (no bash heredocs with apostrophes). After `npm run sync` (only if a `shared/` fragment is touched, which none of these items should need) convert both planners back to CRLF and re-run `npm run check:shared`.
- `npm test` at the end of every commit. Do not open a PR until asked. PR base when asked: `claude/batch-3b-penalty-rules`.

## What reading the code changed in the plan

1. **N1: the profile already carries the OAS.** 7L added `oasA/oasB` to the profile and the survivor remap already puts the survivor's OAS in slot A (`buildTaxProfile`). No profile change is needed; the plan text ("carry `oasA/oasB` on the profile") is already done. `incomeTaxCA` can read them.
2. **N1: three places read `oasClawback`.** The year loop (`clawbackA/B` on `splitA/splitB`, before the meltdown solve's draw, the discretionary draw and gains), `tests/tax_brackets.js:550` (unit literals of the function itself, unchanged) and the snapshot scenario `R oasClawback`.
3. **N1: the pension-split search ignores the recovery tax.** `solvePensionSplit.combinedTax` calls `personTaxCA` with no OAS, so with the recovery tax in `incomeTaxCA` the split would optimize a different objective than the one charged. It must receive the OAS amounts (two scalar arguments) so the kink is inside its objective.
4. **N1: net income for the age amount.** Today the recovery tax is not deducted from net income (named 7J simplification). On the return it is deducted at line 23500 before taxable income and before the age-amount reduction (CRA T1 line 23500 and 23600; verify on the CRA page). Moving the recovery tax inside `personTaxCA` makes this free to model correctly, and it lowers tax by roughly the marginal rate times the recovery. I will include it in N1 (it is the same function and the same hand cases) and report it as its own line in the before/after table. Tell me if you would rather keep the 7J simplification.
5. **N1: the row and cash-flow contract.** The year loop's cash flow switches from `oasNetA/B` to gross OAS, with the recovery tax inside `tax`. To avoid double counting in the table, Sankey and golden checks, the row keeps `ss` net of recovery (as today), gets a new `oasClawback` field, and `row.tax` is reported without it, exactly as `benefits` is added back today. The recovery amount at the final income comes from a once-a-year final `incomeTaxCA` call (the same pattern as the once-a-year final `benefitsFor`), with the per-person amounts written to module scratch fields, not allocated.
6. **N8: the meltdown table does not rank by pre-tax end assets today.** `computeRothOptimizer` picks `best` by **minimum lifetime tax** among "not worse" brackets; end assets is only a displayed column. Decision 3 becomes: the `best` pick maximizes the after-tax estate (same "not worse" filter), the lifetime-tax column stays, and the table gains an after-tax-estate column. The table's and best-row text change, so the UI snapshot moves; the engine snapshot does not.

## Item specs

### N1. OAS recovery tax on the full year's income (fix)

**Change.** `oasClawback` is applied inside `incomeTaxCA`, per return, on that return's net income including OAS, after the pension split, with this return's share of the meltdown, the discretionary RRSP/RRIF draw (`traditionalExtra`) and the 50% gains inclusion. Taxable income for the federal and provincial brackets and for the age-amount reduction is net income less the recovery tax (line 23500). The recovery tax itself is added to the tax. `taxFor = incomeTaxCA - benefitsFor` therefore prices it in every withdrawal solver with no solver change. GIS keeps reading income without OAS.

Cap: min(OAS received, 15% x (net income - threshold)). Threshold 2026 to be read on the CRA page (the code has 95,323, indexed; ESDC's page shows 93,454 for 2025). Early exit: no OAS on the profile (single or both slots) returns before any arithmetic.

**Engine.** Year loop drops the pre-draw `clawbackA/B`; cash flow uses `oasGrossA/B`; the row reports `ss` net of the final recovery, `oasClawback`, and `tax` without it. `solvePensionSplit` gets `oasA, oasB` (per-person amounts after the survivor remap is irrelevant: it only runs for two living spouses). Add the recovery tax to the cliffs register in `docs/next-batches-plan.md`.

**Verify.** CRA OAS recovery tax page and ITA s. 180.2 (threshold, 15%, cap), CRA line 23500 (deduction), 2026 threshold.

**Tests.** `tests/tax_brackets.js` (Canada): hand-computed `personTaxCA`/`incomeTaxCA` with a draw that crosses the threshold; the cap at the full OAS; the line-23500 deduction; the 65+ split regret check re-run with OAS (brute force $50 scan, bound stays under $3 a year); `taxFor` marginal cost of a draw above the threshold (about 15% extra) against a hand figure. `tests/survivor_symmetry.js`: identical partners with unequal-OAS-free recovery (A dies equals B dies). Engine check: row cash identity with a draw that crosses the threshold. Snapshot grid moves only where income crosses the threshold (scenario `R oasClawback` and the high-RRSP scenarios).

**Report.** The plan's example (a 65+ partner with 85,000 base income who draws 30,000 more owes about 2,900 not charged before) as the before/after, plus the default scenario and a 2,000,000 RRSP household.

### N3. Spouse and eligible-dependant amounts

**Change.** `personTaxCA` gains two scalar arguments (a spouse net income, `-1` for no spouse claim; a dependant-claim flag) so no allocation is added. Federal: spouse amount = amount less the spouse's net income, floored at zero, at 14% (which BPA variant applies, the enhanced maximum or the minimum, is read from Schedule 1 line 30300 before coding: the plan text says "BPA with its phase-down maximum"; I will not code it until the form says so). Eligible dependant amount (line 30400): same size, a single person or the survivor with a child under 18 in `dependentsInYear` (not both claims; one claim per household). Provincial: new `spouse` family per `PROVINCE_RULES` row (amount, threshold the reduction starts at), `eligibleDependant` where it differs; Quebec is checked separately because its pooled amounts already include the living-alone and single-parent supplement (the 7K note says the single-parent supplement of 2,681 needs children).

`incomeTaxCA` passes each spouse the other's net income (already computed for `family`); `solvePensionSplit.combinedTax` passes the moved incomes. Regenerate `docs/province-tax-rules.md`; extend `tests/province_rules.js` for the new family.

**Not built.** The transfer of a spouse's unused age, pension and pooled amounts.

**Verify.** CRA Schedule 1 (lines 30300, 30400), each province's 428 form or finance page for spouse and eligible-dependant amounts; Revenu Quebec TP-1015.3-V for the single-parent supplement.

**Tests.** Hand-computed federal and provincial cases per mechanism; a household with a non-earning spouse; single parent and survivor with a 12-year-old; survivor symmetry; split regret.

### N4 + N10. Working-year payroll items and the home buyers' amount (one commit)

**N4.** In `cppContribution`/`payrollTax`: add EI (rate and insurable maximum for 2026; the Quebec rate, which is lower, comes from the `payroll` family of the province row). Credits and deductions per wage earner: the base CPP/QPP and EI/QPIP contributions as non-refundable credits at 14% and the provincial rate; the enhanced CPP/QPP contribution (first-tier enhancement and CPP2) as a deduction from income; the Canada employment amount at 14%; Quebec's own deduction for employment income (checked). Computed **once a year** outside the solvers: the contribution deduction lowers `otherA/otherB` in `buildTaxProfile`, and the credits become a per-person constant credit base on the profile (a new scalar field, not an input). Wages remain net of the pre-tax health premium as today.

**N10.** Home buyers' amount: 10,000 at 14% federal, plus Saskatchewan's own first-time home buyers' amount, once, in the `rentThenBuy` purchase year (first-time buyer assumed, as the FHSA assumes).

**Verify.** CRA EI premium rates and maximum (2026), CPP/QPP and CPP2 rates and maxima (the 7K backlog item on QPP/QPIP stays open unless the Revenu Quebec page is readable), Schedule 1 lines for the CPP/EI credits, employment amount, home buyers' amount; Saskatchewan finance page.

**Tests.** Hand-computed: EI maximum and Quebec rate; CPP split into the base credit and enhanced deduction; employment amount cap; home buyers' amount only in the purchase year; no change without wages (retired years byte-identical except through path effects).

### N5. Medical expense credit (whole LTC input eligible)

**Change.** Expenses: the post-retirement `healthcare` premium and the whole LTC cost (`healthcare + ltc` from `healthcareCost`). Claimed on one return per household (the lower net income, pooled expenses). Federal: 14% (the lowest bracket rate; plus the temporary top-up credit through 2030 for credits above the first bracket, which only matters at large claims) of expenses above the lesser of 3% of net income and the indexed floor. Provincial: the lowest provincial rate on the same excess (each province's floor, read from its 428 form). Ontario Seniors Care at Home Tax Credit (70+, refundable, 25% of up to 6,000, income-tested) in the Ontario row. Computed per `taxFor` call from scalar profile fields (a per-year `medicalExpenses` scalar on the profile, set before the solvers run); early exit when it is zero, so a working or healthy household pays nothing extra per call.

Copy: the LTC info bubble says the whole amount is treated as a nursing-home expense.

**Verify.** CRA line 33099/33199 and Schedule 1 (floor, 3% rule, claimant rule), the top-up credit (ITA s. 118.92 or the CRA page), the Ontario ON479 form or ontario.ca page for the Seniors Care at Home credit, each province's floor and rate.

**Tests.** Hand-computed claims with and without the 3% rule binding; which spouse claims; Ontario credit; a household with LTC on and off; the cliff of the refundable credit in the cliffs register; solver check that the draw cost includes the shrinking credit.

### N6. Low-income provincial tax reductions

**Change.** New `lowIncomeReduction` family on each `PROVINCE_RULES` row (null where none), applied inside `provincialTaxCA` after the credits and before the surtax where the form says so: Ontario tax reduction (ON428 part C, includes the dependant adjustment, which reads `dependents`), BC tax reduction credit (BC428), and whichever of NB, NL, NS and PEI reductions are not already covered by the 7M rows (checked against the 7M list first). Early exit when net income is above the largest reduction threshold.

**Verify, and the risk.** The 7K note records that figures could not be confirmed (the CRA payroll excerpt returned the same text for Ontario and BC, and two sources disagreed on the BC maximum and nil point). Read the amounts from each 428 form or statute, not a payroll summary. If a province's figures cannot be read on a primary page, that province's row stays null and is named as a gap, not built on a secondary figure. Regenerate the rules doc and extend `tests/province_rules.js`.

**Tests.** Hand-computed at the threshold, in the phase-out and at nil; Ontario with a child; monotone and cliff-free scan; cliffs register rows.

### N7. Quebec health contributions

**Change.** Two Quebec-only charges on the Quebec return, in the `QC` data (a new `healthContributions` family, null elsewhere): the Health Services Fund contribution on income other than employment income (pension, RRIF, investment income, gains; band and 1,000 maximum from TP-1 schedule F, verified) and the RAMQ drug premium (up to about 750 per adult, reduced at low family income, schedule H, verified), charged to every retired adult (decision). Per-person charge from that person's non-employment income and the family income already passed for Quebec. Stated in the Quebec note.

**Tests.** Hand-computed at each band edge, the maximum, a low-income couple, a couple with one retired partner (premium for the retired partner only), survivor, Quebec only (other provinces byte-identical).

### N8. After-tax estate (display only; table ranking changes)

**Change.** After the last year, the final return is built once: the RRSP/RRIF balance as income, 50% of unrealized gains in the taxable accounts (balance less `taxableBasis`, bond bucket included) as gains, run through `personTaxCA` as one return (the survivor, or the last remaining person, at their age), plus provincial probate fees per a new `probate` family per row (ON 1.5% over 50,000, BC about 1.4%, AB capped at about 525, QC nominal, MB none, the rest read from their sources); registered accounts and the TFSA assumed outside the estate (named beneficiary), the home inside it. New figure `afterTaxEstate` next to end assets in the results and the table. `computeRothOptimizer` maximizes it (same not-worse filter) and shows it as a column. No projection value changes, so the engine snapshot grid stays byte-identical; the UI snapshot moves; a 390x844 overflow check covers the new figure.

**Verify.** Probate fee schedules from each province's court or finance page; the deemed-disposition rule (ITA s. 70(5), RRIF s. 146.3(6), CRA death-of-a-taxpayer pages).

**Tests.** Hand-computed estate for an RRSP-only and a TFSA-only household; probate per province; the table's best pick moves to a meltdown bracket where RRSP-versus-TFSA makes it worth it.

### N9. OAS in the survivor period (fix)

`cppAndOasIncome` gives the survivor their **own** OAS (own `oasMonthly`, own age factor), not the greater of the two; from 65, as now. Moves only scenarios where the two OAS inputs differ. CPP survivor pension, death benefit and children's benefit stay with Batch 6.

**Tests.** Unequal OAS inputs, A dies and B dies; equal inputs byte-identical (snapshot subset); survivor symmetry with identical partners unchanged.

### N11. Canada Dental Care Plan note (copy only)

One sentence in the `healthcare` field's info bubble: the plan covers families under 90,000 of adjusted net income without dental insurance; not modeled. Verify the figure on the CRA/Canada.ca CDCP page (retrieval date in the notes). Version badge and README move; UI snapshot may move (info text); no engine change.

## Per-commit checklist

1. Read the primary sources for the item, record each figure with its URL and date (draft the 7N notes entry first).
2. Hand-computed failing tests (RED), then the code (GREEN).
3. `tests/snapshot.js --dump` on a worktree of the previous commit and on the tree, `--compare`; explain every moved scenario.
4. Before/after table and the seeded success rates (`tests/historical_rates.js`).
5. Timing (if `taxFor`, `personTaxCA`, `provincialTaxCA` or `buildTaxProfile` changed).
6. `npm run snapshot:update` (only this commit, only if numbers moved), `npm run gen:provinces` (if `PROVINCE_RULES` changed), badge, README, CLAUDE.md, 7N notes.
7. `npm test` green, `npm run check:shared`, then commit with the trailer.

## End of batch (exit criteria)

`npm test` green with snapshots updated only in the number-changing commits; Canada timing within +5% of the 7M merge (ON/BC/QC); survivor symmetry; 390x844 check for the estate figure; `docs/province-tax-rules.md` regenerated; 7N notes with sources, before/after tables, the cliffs-register rows, the named gaps (Ontario Health Premium freeze, spouse unused-amount transfers, CPP sharing, AMT, disability, donations, tuition transfers, Canada Workers Benefit, non-eligible dividends, prior-year lookback, territories, CPP/OAS claim-age adjustments); a fresh whole-branch review before the PR.

## Owner rulings on the open points (2026-10-06)

- N1: **deduct the recovery tax from net income** (line 23500). Included in N1, reported as its own line in the before/after table.
- N6: **build every province whose figures can be read on a primary page; leave the others null** and list them as gaps. The null provinces are on the verification backlog in `docs/next-batches-plan.md` (7N N6 row), to be filled as each is read.
- N3: the BPA variant for the spouse and eligible-dependant amount is settled on Schedule 1 before coding; I will report what the form says.

Naming note: the row field `ss` is inherited from the US planner (Social Security). In Canada it holds CPP plus net OAS (`cppA + cppB + oasNetA + oasNetB`), and this plan keeps that meaning. N1 only changes what "net" means for the OAS part.
