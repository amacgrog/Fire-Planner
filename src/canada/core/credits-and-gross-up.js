import { clamp, pct } from '../../shared/core/basics.js';
import { state } from '../../shared/core/store.js';

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
