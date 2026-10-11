# 7K: 2026 provincial figures to verify (hand-off document)

> Status 2026-10-05: this was the hand-off sent for an independent check. Its results and the figures actually used are in the 7K notes in docs/next-batches-plan.md (verified table and verification backlog) and in the generated docs/province-tax-rules.md. Kept as a record.

Purpose: Claude collected these from secondary sources (TaxTips.ca, KPMG, search summaries) on 2026-10-05.
Nothing here is yet confirmed from a primary source (province finance or revenue site, CRA, Revenu Quebec).
Please check each row against the primary source, correct it, and add the URL and the date you retrieved it.

How to answer: return the same tables with a **Status** (OK / CORRECTED / CANNOT FIND), the **corrected value**,
and a **primary-source URL** for each row. Do not guess; write CANNOT FIND instead.

All figures are tax year 2026, in dollars, for a resident on December 31, 2026.

## A. Items where sources disagree (highest priority)

| # | Item | Value in the current code | Source says | Question |
|---|---|---|---|---|
| A1 | BC lowest bracket rate and credit rate | 5.60% | TaxTips: 5.60% (indexation factor 1.022); a KPMG search snippet: 5.06% | Is the 2026 BC lowest rate 5.06% or 5.60%? (BC lowest rate was 5.06% in 2025.) |
| A2 | Newfoundland and Labrador basic personal amount | 13,094 | TaxTips rate page: 13,094; TaxTips credits summary: 11,188 | Which is right? Note: the new PC government said it intends to raise the basic personal exemption to 15,000; has that been enacted for 2026? |
| A3 | Prince Edward Island lowest bracket / credit rate | 9.5% (bracket) | TaxTips credits summary: credit rate 9.65% | What is the 2026 PEI lowest rate and the credit rate, and are they the same? |
| A4 | Quebec: all 2026 parameters | BPA 18,952; brackets 54,345 / 108,680 / 132,245 | TaxTips says its Quebec 2026 figures "have not been confirmed" with the Ministry of Finance | Confirm the 2.05% indexation, the brackets, and the amounts in section C from Revenu Quebec or Finance Quebec. |

## B. Provincial non-refundable credit amounts (outside Quebec)

Source: TaxTips.ca "tax credits 2026" (https://www.taxtips.ca/nrcredits/tax-credits-2026.htm), retrieved 2026-10-05.
"Eliminated at" means the net income at which the credit reaches zero. Age amounts reduce at 15% of net income over the threshold
in the federal case; please also confirm each province's reduction **rate**, which this source did not give.

| Prov | Credit rate | Basic personal amount | Spouse / eligible dependant | Age 65+ amount | Age income threshold | Age eliminated at | Pension amount | Indexation factor 2026 |
|---|---|---|---|---|---|---|---|---|
| AB | 8% | 22,769 | 22,769 (reduced from 0 income) | 6,345 | 47,234 | 89,534 | 1,753 | 1.020 |
| BC | 5.60% (see A1) | 13,216 | 11,317 (reduced from 1,132) | 5,927 | 44,119 | 83,632 | 1,000 | 1.022 |
| MB | 10.8% | 15,780 (frozen, not indexed) | 9,134 | 3,728 | 27,749 | 52,602 | 1,000 | 1.000 |
| NB | 9.40% | 13,664 | 10,709 (reduced from 1,072) | 6,158 | 45,844 | 86,897 | 1,000 | 1.020 |
| NL | 8.7% | 13,094 or 11,188 (see A2) | 9,142 (reduced from 915) | 7,142 | 39,138 | 86,751 | 1,000 | 1.011 |
| NS | 8.79% | 11,932 | 11,932 (reduced from 888) | 5,826 | 30,828 | 69,668 | 1,173 | 1.016 |
| ON | 5.05% | 12,989 | 11,029 (reduced from 1,103) | 6,342 | 47,210 | 89,490 | 1,796 | 1.019 |
| PE | 9.65% (see A3) | 15,000 | 12,740 (reduced from 1,274) | 6,510 | 36,600 | 80,000 | 1,000 | 1.000 |
| SK | 10.50% | 20,381 | 20,381 (reduced from 2,038) | 5,901 | 43,927 | 83,267 | 1,000 | 1.020 |

Extra items to confirm:
- Saskatchewan senior supplementary amount: 2,569 (TaxTips). Confirm it applies to age 65+ and whether it phases out with income.
- Federal-style basic personal amount phase-downs: federal has one (16,452 down to 14,829 between 181,440 and 258,482). Which provinces
  also reduce the basic personal amount at high income for 2026 (Nova Scotia, Manitoba, Saskatchewan, Ontario, Newfoundland and Labrador, others), with the thresholds and reduced amounts?
- Whether each province's pension amount applies to RRIF/RRSP income at 65+ (federal does).
- Provincial bracket tables (current code values; confirm all ten): see `PROVINCE_TAX` in `Planner_Canada.html`
  (ON 53,891 / 107,785 / 150,000 / 220,000; BC as in A1 with 50,363 / 100,728 / 115,648 / 140,430 / 190,405 / 265,545;
  AB 61,200 / 154,259 / 185,111 / 246,813 / 370,220; SK 54,532 / 155,805; MB 47,000 / 100,000;
  NB 52,333 / 104,666 / 193,861; NS 30,995 / 61,991 / 97,417 / 157,124; PE 33,928 / 65,820 / 106,890 / 142,250 / 200,000;
  NL as in the TaxTips list: 44,678 / 89,354 / 159,528 / 223,340 / 285,319 / 570,638 / 1,141,275).

## C. Quebec (secondary sources only)

| Item | Value | Source |
|---|---|---|
| Indexation factor | 1.0205 (2.05%) | Quebec.ca news item and TaxTips |
| Basic amount | 18,952 at credit rate 14% | TaxTips, lifemoney.ca |
| Age 65+ amount | 3,986 | search summary of a Revenu Quebec / KPMG page (unconfirmed) |
| Amount for retirement income | 3,541 | same |
| Family-income reduction of the age and retirement amounts | NOT FOUND (rate and threshold) | needed |
| Amount for a person living alone | NOT FOUND | needed |
| Solidarity tax credit and other refundable credits | NOT FOUND | needed (7K covers credits against tax; paid benefits are 7L) |
| Federal abatement | 16.5% of basic federal tax | already in the code |
| QPP / QPIP contributions | NOT FOUND (2026 rates, maximums) | the plan names QPP/QPIP specifics |

Primary sources to try: https://www.revenuquebec.ca, the Finance Quebec indexation notice
(https://www.quebec.ca/en/news/actualites/detail/indexing-of-the-parameters-of-the-personal-income-tax-system-social-assistance-benefits-and-certain-government-fees-for-the-2026-taxation-year-67249),
and the Finance Quebec "Parameters of the personal income tax system" 2026 PDF (AUTEN_IncomeTax2026.pdf).

## D. Dividend tax credits

Eligible dividends (38% gross-up). TaxTips, "Eligible dividend tax credit rates 2022-2026", retrieved 2026-10-05,
as a percent of the grossed-up dividend. These match the code today; please confirm against each province.

| Prov | Eligible credit (% of grossed-up dividend) |
|---|---|
| Federal | 15.0198 |
| AB | 8.12 |
| BC | 12 |
| MB | 8 |
| NB | 14 |
| NL | 6.3 |
| NS | 8.85 |
| ON | 10 |
| PE | 10.5 |
| QC | 11.70 |
| SK | 11 |

Non-eligible dividends (15% gross-up; federal credit is 9/13 of the gross-up amount): **no provincial figures collected yet.** Please supply, for each of the
10 provinces, the 2026 provincial non-eligible credit rate and its basis. A TaxTips snippet says AB, BC, NS, ON, PE and SK base it on a percent of the grossed-up amount while
MB, NB, NL and QC base it on a percent of the taxable (actual) dividend. Also found: Ontario's 2026 budget lowers its non-eligible credit from 2.9863% to 1.9863% on January 1, 2027
(so 2.9863% applies throughout 2026; please confirm the base).

## E. Low-income and other provincial amounts to identify (names only, nothing collected)

For each province, please list any non-refundable or refundable **credit or tax reduction against tax** that depends on income and applies to a retired person
or a couple with children, and give its 2026 amounts, phase-out income range and primary source. Examples to check, not an exhaustive list:
Ontario tax reduction (basic reduction and the extra per dependent child), BC Low Income Tax Reduction, Manitoba's family tax benefit and renters/seniors school tax
rebate items, Saskatchewan low-income tax credit and its seniors/child supplements, Alberta (no such items beyond amounts above), NB low-income tax reduction, NS low-income and age amounts,
PEI low-income tax reduction, NL low-income tax reduction, property-tax and rent credits (for example Ontario Property Tax Credit within the Trillium Benefit is a **paid** benefit and is out of scope; list only credits applied against tax).
Paid benefits (Ontario Trillium Benefit, BC and Alberta family benefits, Quebec solidarity credit) are 7L and are out of scope.

## F. Ontario items needing a primary source

- Surtax thresholds 5,818 and 7,446 (rates 20% and 36% on Ontario tax over each): TaxTips confirms; please add the Ontario Finance or CRA URL.
- Ontario Health Premium schedule (maximum 900): in the code, unverified for 2026. Confirm brackets and amounts.
- Ontario Reduction (the basic tax reduction and the dependent-child increments): amount for 2026.

## G. Primary-source results (Claude, retrieved 2026-10-05)

| Item | Result | Primary source |
|---|---|---|
| Quebec 2026 brackets 54,345 / 108,680 / 132,245; BPA 18,952; indexing 2.05% | CONFIRMED | Finance Quebec, "Parameters of the Personal Income Tax System for 2026" (Nov 2025), Table 3, https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/finances/publications-adm/parametres/AUTEN_IncomeTax2026.pdf |
| Quebec living alone 2,172 (single-parent supplement 2,681), age 3,986, retirement income 3,541, reduction threshold for the three 42,955 | CONFIRMED (same table). The 18.75% reduction rate is NOT in that PDF; still needs a source (Revenu Quebec TP-1015.3). | same |
| Quebec solidarity credit, work premium, family allowance, senior assistance | Found in the same PDF (Tables 3 and 4); paid benefits are 7L | same |
| Manitoba BPA 15,780 for net income up to 200,000, reduced linearly to 0 at 400,000; brackets 47,000 / 100,000 not indexed | CONFIRMED | CRA T4127 122nd ed. (Jan 1 2026, rev. 26/05), https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html |
| Nova Scotia BPA at its maximum regardless of income (no 2026 phase-down) | CONFIRMED | same (T4127) |
| PEI brackets 33,928 / 65,820 / 106,890 / 142,520 (code has 142,250: ERROR); BPA 15,000; no indexing | CONFIRMED | same (T4127) |
| PEI 20% bracket over 200,000 applies from 2026 (T4127 lists 19% as the top rate; EY says the budget was corrected to 2026) | CONFLICT: kept 20% (matches code); needs the PEI Finance page, which blocked automated access | https://taxnews.ey.com/news/2026-0879-canada-prince-edward-island-budget-2026-updated |
| BC lowest rate 5.60% (CRA T4127 still shows 5.06%) | CONFIRMED 5.60% | BC government tax rates page (dated April 17, 2026), https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates |
| NL BPA: 11,188 Jan-Jun, 15,000 from July 1, 2026; 13,094 is the time-weighted 2026 amount | NOT confirmed from NL Finance; T4127 and budget summaries give the two period amounts | https://www.taxtips.ca/taxrates/nl.htm and the KPMG 2026 NL budget summary |
| Other provinces' brackets and BPAs (AB, NB, NS, ON, SK) | CONFIRMED against T4127 | same (T4127) |
| Eligible dividend credits (all ten) | Match TaxTips; no primary source retrieved yet | https://taxtips.ca/dtc/eligible-dividends/eligible-dividend-tax-credit-rates.htm |
| Provincial age amounts, spouse amounts, pension amounts (section B) | Secondary only (TaxTips); not found on a primary page | https://www.taxtips.ca/nrcredits/tax-credits-2026.htm |
| Saskatchewan senior supplementary 2,569; Ontario tax reduction; Ontario Health Premium; section E items | NOT confirmed | needed |
