import { clamp, pct } from '../../../shared/core/format/numbers.js';
import { state } from '../../../shared/core/store.js';

  // The planner converts the RRSP to a RRIF at 71 (see rrifMinPct). CRA counts RRIF payments as
  // pension income from 65, but a withdrawal from an RRSP that is not an annuity or RRIF payment
  // is not pension income at any age, so the discretionary draw earns the pension income amount
  // only once the account is a RRIF (7K fix of the 7J rule, which counted it from 65).
  export const RRIF_PENSION_AGE = 71;
  // OAS recovery tax ("clawback"): 15% of net income (including OAS itself)
  // above the 2026 threshold, up to the full OAS amount received. Charged inside
  // personTaxCA (7N N1), on the return's full income. Modeled using the same
  // year's income rather than CRA's actual one-year lookback, as a planning-level
  // simplification (similar in spirit to the US planner's IRMAA lookback approximation).
  export const OAS_RECOVERY_THRESHOLD = 95323; // 2026 (CRA OAS recovery tax page, retrieved 2026-10-06)
  // Federal + provincial tax for one person. Capital gains use the 50%
  // inclusion rate (added directly to taxable ordinary income) rather than a
  // separate preferential bracket, per Canadian tax treatment. CPP and OAS
  // (gross, before any clawback) are fully taxable ordinary income.
  // Eligible-dividend tax credit. The grossed-up dividend (1.38x) is already
  // inside the ordinaryIncome passed to personTaxCA(); dtcBase is that
  // grossed-up amount. The federal credit (15.0198% of it) comes off the federal
  // tax and the provincial credit (PROVINCE_RULES[code].dividend.eligible) off the
  // provincial tax, each floored at zero. Ontario's surtax is computed before its
  // dividend credit, which is the order on form ON428; Quebec's 16.5% abatement
  // applies after the federal credits, the dividend credit included. Non-eligible
  // Canadian dividends (15% gross-up, small credit) are not modeled: they are
  // taxed like interest, like foreign dividends (named gap; they come mostly from
  // private-company shares).
  export const DIVIDEND_GROSS_UP = 1.38,
    FEDERAL_ELIGIBLE_DTC = 0.150198;
  // Annual taxable investment income on the taxable account, taxable bond
  // reserve and cash, on start-of-year balances. Dividends/interest are part
  // of the modeled total return (never added on top of it) but are taxed in
  // the year paid: interest and non-eligible/foreign dividends at ordinary
  // rates, eligible Canadian dividends grossed up with a credit. Reinvested
  // amounts raise adjusted cost base (see the callers) so the gain realized
  // at sale is not taxed again. Bond interest uses the bond return
  // assumption as its yield in both engines.
  export function investmentIncomeCA(taxableBal, bondTaxableBal, cashBal, bondRate, cashRate) {
    const divTotal = Math.max(0, taxableBal) * pct(state.dividendYield),
      eligible = divTotal * clamp(pct(state.qualifiedDivPct), 0, 1),
      bondInterest = Math.max(0, bondTaxableBal) * Math.max(0, bondRate),
      cashInterest = Math.max(0, cashBal) * Math.max(0, cashRate);
    return {
      ordinary: divTotal - eligible + bondInterest + cashInterest,
      eligGrossed: eligible * DIVIDEND_GROSS_UP,
      divTotal,
      bondInterest,
    };
  }
  // Federal age amount (65+): $9,208 reduced by 15% of net income over $46,432
  // (both indexed), and pension income amount: the first $2,000 of eligible
  // pension income (not indexed), both at the 14% credit rate. Net income here
  // is the person's own income after any pension split, with the 50% gains
  // inclusion and grossed-up dividends; the OAS recovery tax is not deducted
  // from it (planning-level simplification). The provincial age and pension
  // amounts are in PROVINCE_RULES and are applied by provincialTaxCA.
  export const AGE_AMOUNT = 9208,
    AGE_AMOUNT_THRESHOLD = 46432,
    AGE_AMOUNT_REDUCTION = 0.15,
    PENSION_INCOME_AMOUNT = 2000;
  // Working-year payroll items for one earner (7N N4), per CRA and Revenu Quebec 2026 figures. cash is the employee cost
  // (CPP or QPP, CPP2, EI, QPIP). The tax return treats the pieces differently: the base CPP/QPP contribution (CPP 4.95%,
  // QPP 5.30%: the rate less the 1% first additional), the EI premium and the QPIP premium are non-refundable credits at
  // the lowest rate (federal and, outside Quebec, provincial); the enhanced part (the 1% first additional and the 4%
  // second additional, CPP2) is a deduction from income, federal, provincial and Quebec's (Schedule U part B); the Canada
  // employment amount is a federal credit; Quebec has no credit for these but gives a workers deduction (6% of work
  // income to a maximum) at the provincial level only. The result is left in the scratch object PAY (allocation-free);
  // read it right after the call. Everything is zero without wages. Computed once a year (not inside the solvers).
  export const EI_MIE = 68900,
    CPP_ENHANCED_RATE = 0.01,
    EMPLOYMENT_AMOUNT = 1501,
    QC_WORKERS_DEDUCTION_MAX = 1450,
    QC_WORKERS_DEDUCTION_RATE = 0.06;
  export const PAY = { cash: 0, fedCredit: 0, provCredit: 0, deduction: 0, provDeduction: 0 };
  // Medical expense credit (7N N5). The eligible expenses are the household's private health premium plus the whole long-term-care
  // cost (owner decision: nursing-home care), claimed on ONE return: the lower net income's (a smaller 3% floor) unless that
  // partner is under the basic personal amount and could not use it, then the other. Federal: expenses above the lesser of 3% of
  // net income and 2,890 (2026) at the lowest rate; provincially the same shape with the province's own threshold; Quebec has no
  // dollar floor and takes 3% of family income. Not built: the federal top-up tax credit (it keeps 15 percent on credit amounts
  // above the first bracket, 58,523: at most 1 percent of the excess, so under about 200 dollars in the largest plans).
  export const FED_MEDICAL_THRESHOLD = 2890;
  function progressiveTax(income, brackets) {
    let tax = 0,
      prev = 0;
    for (const [cap, rate] of brackets) {
      const slice = Math.min(Math.max(0, income - prev), cap - prev);
      tax += slice * rate;
      prev = cap;
      if (income <= cap) break;
    }
    return tax;
  }
  // 2026 federal brackets (CRA), held constant in real terms like the rest of
  // this planner's tax parameters. Non-refundable credits are worth the lowest
  // rate (14% in 2026) of the credit amount, subtracted from the tax on the
  // brackets (they are not deductions at the marginal rate). The basic personal
  // amount is $16,452 up to the 29% bracket threshold and phases down linearly
  // to $14,829 at the 33% threshold (CRA indexation notice for 2026), keyed on
  // net income. `extraCreditBase` is further credit amounts (age amount, pension
  // income amount) the caller has already worked out; tax cannot go below zero.
  export const FED_CREDIT_RATE = 0.14,
    FED_BPA_MIN = 14829,
    FED_BPA_ENHANCED = 1623, // 16,452 - 14,829
    FED_BPA_PHASE_START = 181440,
    FED_BPA_PHASE_END = 258482;
  // The federal brackets as flat arrays (no per-call allocation); scaledProgressiveTax multiplies the caps by the index factor.
  export const FED_CAPS = [58523, 117045, 181440, 258482, Infinity],
    FED_RATES = [0.14, 0.205, 0.26, 0.2929, 0.33];
  // `oas` is the OAS this person received. The recovery tax (15% of net income, OAS included, over the
  // threshold, up to the OAS) is worked out here, on the return's full income, so every caller (the year
  // loop, the draw solvers through taxFor, the pension-split search) prices it. As on the T1 the repayment
  // is deducted from net income (line 23500, so net income at line 23600 and the age amount see the
  // lower figure) and added to the tax payable (line 42200); it is not reduced by credits and the Quebec
  // abatement does not touch it. The amount is left in OAS_RECOVERY.last for the caller to read.
  export const OAS_RECOVERY = { last: 0, a: 0, b: 0 };
  // Low-income provincial tax reductions (7N N6), read on the CRA 2025 provincial forms (British Columbia: the 2026 figures of CRA T4127,
  // which are the 2025 form figures indexed). Ontario and British Columbia work per return inside provincialTaxCA (Ontario: 2 x the
  // basic reduction and the child amounts, less the tax, off the tax; British Columbia: a maximum less a rate on net income over a base).
  // New Brunswick, Newfoundland and Labrador, Nova Scotia and Prince Edward Island have ONE family reduction (basic, spouse or eligible
  // dependant, children, PEI age amounts, less a rate on adjusted family income over a base), limited to the family's provincial tax (an
  // unused part passes to the spouse), worked out in incomeTaxCA from the provincial tax each return reports in PROV_TAX. Nova Scotia
  // also gives an age tax credit (65 and over, taxable income under 24,000), taken per return. Alberta, Saskatchewan, Manitoba and Quebec
  // have none (their forms were read). Not built: Ontario's dependants with an impairment, the LIFT credit (Schedule ON428-A), and the
  // reduction passing between spouses when the household's income is split unevenly beyond the family limit.
  export const PROV_TAX = { last: 0, pre: 0, fed: 0 };
  // Quebec health contributions (7N N7), charged on the Quebec return like the Ontario Health Premium. (1) The Health Services Fund
  // contribution on income other than employment income and OAS (Revenu Quebec Schedule F, 2025-12; the 2026 thresholds are in the Finance
  // Quebec parameters, Table 3): nil to the first threshold, 1% of the excess to 150, flat to the second threshold, then 150 plus 1% of the
  // excess to 1,000 (the dollar caps are statutory, not indexed). (2) The RAMQ prescription drug insurance premium (Schedule K, 2025-12,
  // premium table; the 2026 maximum from the RAMQ page): the income used is the family net income less 19,890 (single) or 32,240 (couple)
  // plus an amount for dependent children; 7.84% of the first 5,000 and 11.76% above for a single person, 3.93% and 5.89% for each spouse of
  // a couple, capped at the year's maximum. The 2025 table maximum is 755 (six months at 62.00 and six at 63.83); 2026 is six months at
  // 63.83 and six at 65.75 (789 a year from July 2026) = 777.48, so the table is scaled by 777.48 / 755. Every retired adult pays it (owner
  // decision: a working partner is assumed to be on a group plan); the premium is also an eligible medical expense. Not modeled: the
  // exemptions (a group plan, a claim slip, 65 and over with at least 94% of the maximum GIS: that household's income is nil here anyway).
  // The hot path: the rule is passed in (one province lookup per tax call) and the income at which the premium reaches its maximum is
  // worked out once per rule, so a household above it costs one comparison.
  export const RAMQ_CAP = new Map();
