import { filingKey, NIIT_THRESHOLD, taxYearOf } from '../federal-deductions.js';
import { clamp, pct } from '../../../shared/core/basics.js';
import { state } from '../../../shared/core/store.js';
import { dependentsInYear } from '../../../shared/core/lists-and-children.js';

  // E1c: the qualified business income deduction (IRC 199A), federal only, below AGI. 2026 limits from Rev. Proc. 2025-32
  // section 4.26 (threshold indexed; the phase-in width is a fixed statutory amount since OBBBA section 70105). Every
  // business is treated as a specified service business with no W-2 wages and no property (owner decision): full 20%
  // up to the threshold, 20% x ap^2 inside the range, nothing above; capped at 20% of taxable income less net capital
  // gain (which includes qualified dividends). The $400 minimum (IRC 199A(i)) applies after the cap, to a taxpayer with
  // $1,000 of QBI from qualified businesses: an SSTB counts only at the applicable percentage, and not at all above the
  // range (199A(d)(1)(A), (d)(3)).
  export const QBI_LIMITS = { threshold: { joint: 403500, other: 201750 }, width: { joint: 150000, other: 75000 }, minimum: 400, minimumQbi: 1000 };
  export function niitTax(magi, netInvestmentIncome, filing = 'mfj') {
    return (
      0.038 *
      Math.min(
        Math.max(0, netInvestmentIncome),
        Math.max(0, magi - NIIT_THRESHOLD[filingKey(filing, 'niit')]),
      )
    );
  }
  // Annual taxable investment income on the taxable brokerage account and
  // the taxable bond reserve/cash. Dividends and interest are part of the
  // modeled total return (never added on top of it), but unlike unrealized
  // growth they are taxed in the year they are paid: non-qualified
  // dividends and interest as ordinary income, qualified dividends at
  // long-term gain rates. Computed on start-of-year balances. Reinvested
  // dividends/interest raise cost basis (see the callers) so the gain
  // realized at sale is not taxed a second time. Taxable-bond interest uses
  // the planner's bond return assumption as its yield in both engines.
  export function investmentIncome(taxableBal, bondTaxableBal, cashBal, bondRate, cashRate) {
    const divTotal = Math.max(0, taxableBal) * pct(state.dividendYield),
      qualified = divTotal * clamp(pct(state.qualifiedDivPct), 0, 1),
      bondInterest = Math.max(0, bondTaxableBal) * Math.max(0, bondRate),
      cashInterest = Math.max(0, cashBal) * Math.max(0, cashRate);
    return {
      ordinary: divTotal - qualified + bondInterest + cashInterest,
      qualified,
      divTotal,
      bondInterest,
    };
  }
  // Additional Medicare Tax (IRC 3101(b)(2)/1401(b)(2)): 0.9% of Medicare
  // wages above $250,000 (MFJ, combined) or $200,000 (single). The thresholds
  // are set by statute and are NOT inflation-indexed, so they deliberately skip
  // taxIndexFactor — bracket creep applies to them in nominal projections.
  // `filing === 'single'` covers both one person and two separate filers
  // (marry-later, before the wedding), each measured against their own $200k.
  export function additionalMedicareTax(wagesA, wagesB, filing) {
    const rate = 0.009;
    if (filingKey(filing, 'medicare') === 'mfj') return Math.max(0, wagesA + wagesB - 250000) * rate;
    return (Math.max(0, wagesA - 200000) + Math.max(0, wagesB - 200000)) * rate;
  }
  // Tax filing status for the year (a key of FILING).
  //  - Unmarried with a qualifying child that year: head of household; without: single.
  //    This covers a single person, a survivor after the window below, and an unmarried
  //    couple (the household return is then two separate filers, see taxFor, so its
  //    household status stays 'single' and Partner A, who claims the children, files HoH).
  //  - "Start single, then file MFJ" (marryLater): two single filers until Partner A reaches
  //    marriageAgeA.
  //  - Survivor, if the couple was married that year: MFJ for the year of death
  //    (IRC 6013(a)(3)); qualifying surviving spouse (MFJ brackets and deduction) for the next
  //    two tax years while a qualifying child exists that year; then as an unmarried person.
  export function filingStatusFor({ age, singlePerson, isSurvivorPeriod, year, deathYear }) {
    const married = state.marryLater ? age >= state.marriageAgeA : state.filingStatus === 'mfj';
    const hasChild = dependentsInYear(taxYearOf(year)).some((d) => d.qualifyingChild);
    const unmarried = hasChild ? 'hoh' : 'single';
    let filing;
    if (isSurvivorPeriod) {
      filing =
        !married ? unmarried : year === deathYear ? 'mfj' : year - deathYear <= 2 && hasChild ? 'qss' : unmarried;
    } else if (singlePerson) filing = unmarried;
    else if (state.marryLater) filing = age >= state.marriageAgeA ? 'mfj' : 'single';
    else filing = state.filingStatus;
    return { filing };
  }
  // E1c: self-employment tax (IRC 1401, 1402) on one person's year of self-employment profit se. Net earnings are 92.35%
  // of profit; nothing is due under $400 of net earnings. Social Security (12.4%) stops at the wage base less that person's
  // W-2 Social Security wages; Medicare is 2.9% of all net earnings. half (IRC 164(f)) is deducted from income; the 0.9%
  // Additional Medicare Tax is figured in payrollTax on wages plus ne. Pure; fills out.
  export const SE_OUT = { tax: 0, half: 0, ne: 0 };
