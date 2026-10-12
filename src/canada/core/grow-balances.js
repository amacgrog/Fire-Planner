import { state } from '../../shared/core/store.js';
import { medicalGrowth } from '../../shared/core/year-factors.js';

  // One year of growth on every account. Stocks (taxable/RRSP/TFSA and the FHSA),
  // bonds (the three bond-reserve buckets) and cash each grow at their own rate;
  // the home appreciates only when owned. Dividends and interest were already
  // taxed this year (`inv`), so reinvesting them raises cost basis rather than
  // leaving untaxed embedded gain.
  export function growBalances(bal, { stockReturn, bondReturn, hysa, homeGrowth, inv }) {
    bal.taxable *= 1 + stockReturn;
    bal.traditional *= 1 + stockReturn;
    bal.roth *= 1 + stockReturn;
    bal.bondTaxable *= 1 + bondReturn;
    bal.bondTraditional *= 1 + bondReturn;
    bal.bondRoth *= 1 + bondReturn;
    bal.cash *= 1 + hysa;
    bal.taxableBasis = Math.min(bal.taxable, bal.taxableBasis + inv.divTotal);
    bal.bondTaxableBasis = Math.min(bal.bondTaxable, bal.bondTaxableBasis + inv.bondInterest);
    bal.fhsa *= 1 + stockReturn;
    if (state.tenure === 'own' || state.tenure === 'rentThenBuy') bal.home *= 1 + homeGrowth;
  }
  // The RRSP meltdown ladder: moves the year's meltdown amount from the pooled
  // RRSP balance (then the RRSP bond bucket) into the TFSA, after it has been
  // withdrawn and taxed as income.
  export function applyRrspMeltdown(bal, meltdownAmount) {
    if (meltdownAmount <= 0) return;
    const fromTradMelt = Math.min(bal.traditional, meltdownAmount);
    bal.traditional -= fromTradMelt;
    bal.bondTraditional = Math.max(0, bal.bondTraditional - (meltdownAmount - fromTradMelt));
    bal.roth += meltdownAmount;
  }
  // Healthcare and long-term-care cost for the year. Provincial coverage is
  // universal at every age, so `healthcare` is the supplemental private
  // insurance once retired (flat; no age-65 change in Canada).
    // A couple is assumed to have coverage available for both partners as
    // long as either one is still working — a retired partner isn't
    // paying for private supplemental insurance solo while their spouse
    // still has a job-based plan they can be added to. So for a couple,
    // this cost doesn't apply until BOTH partners have stopped working.
    // Single-person and survivor cases are unaffected — there's no
    // spouse's plan to fall back on.
  export function healthcareCost({ workingA, workingB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, factor, year, age, ageB }) {
    const bothRetired = !workingA && !workingB;
    const healthcare = singlePerson
      ? (workingA ? 0 : state.healthcare) * factor * medicalGrowth(year)
      : isSurvivorPeriod
        ? ((deceasedIsA ? workingB : workingA) ? 0 : state.healthcare / 2) * factor * medicalGrowth(year)
        : (bothRetired ? state.healthcare : 0) * factor * medicalGrowth(year);
    const ltc = state.ltcEnabled
      ? (age >= state.ltcAgeA && !(isSurvivorPeriod && deceasedIsA) ? state.ltcYearlyA : 0) *
          factor * medicalGrowth(year) +
        (!singlePerson && ageB >= state.ltcAgeB && !(isSurvivorPeriod && deceasedIsB)
          ? state.ltcYearlyB
          : 0) *
          factor * medicalGrowth(year)
      : 0;
    return { healthcare, ltc };
  }
