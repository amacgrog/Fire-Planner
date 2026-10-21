import { taxIndexFactor } from '../../../shared/core/tax-index-factor.js';
import { filingKey, STD_DEDUCTION, STD_EXTRA_65, ORDINARY_BRACKETS } from '../federal-deductions.js';
import { itemizedDeduction, MEDICAL_FLOOR_PCT, seniorDeduction } from '../itemized-deduction.js';

  export function standardDeduction(filing, yearIndex, ages = []) {
    const factor = taxIndexFactor(yearIndex);
    let deduction = STD_DEDUCTION[filingKey(filing, 'deduction')] * factor;
    const extra = STD_EXTRA_65[filingKey(filing, 'extraAge')] * factor;
    for (const a of ages) if (a >= 65) deduction += extra;
    return deduction;
  }
  // Roth conversion ladder — converts traditional balances to Roth each year
  // in the chosen window, solving for the gross conversion that fills
  // ordinary taxable income up to the top of the selected federal bracket
  // (recomputing taxable Social Security as the conversion is added).
  export function bracketCeilingReal(pctTarget, filing) {
    // Every bracket but the open-ended top one, as [percent, ceiling].
    const brackets = ORDINARY_BRACKETS[filingKey(filing, 'brackets')]
      .filter(([cap]) => cap !== Infinity)
      .map(([cap, rate]) => [Math.round(rate * 100), cap]);
    const found = brackets.find(([p]) => p === pctTarget);
    return found ? found[1] : brackets[brackets.length - 1][1];
  }
  // What one return deducts: the larger of the (age-adjusted) standard deduction
  // and the itemized total, plus the senior deduction on top of either. `agi` is
  // the return's income before the deduction (it stands in for MAGI).
  export function federalDeduction(filing, yearIndex, ages, agi, stateTaxPaid, propertyTax, mortgageInterest, medical = 0) {
    let deduction = standardDeduction(filing, yearIndex, ages);
    if (stateTaxPaid > 0 || propertyTax > 0 || mortgageInterest > 0 || (medical > 0 && medical > MEDICAL_FLOOR_PCT * agi))
      deduction = Math.max(
        deduction,
        itemizedDeduction(yearIndex, agi, stateTaxPaid, propertyTax, mortgageInterest, medical),
      );
    return deduction + seniorDeduction(filing, yearIndex, ages, agi);
  }
