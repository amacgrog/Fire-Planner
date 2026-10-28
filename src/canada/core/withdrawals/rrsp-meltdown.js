// Canada RRSP meltdown: fills a tax bracket with RRSP withdrawals each year

import { federalBracketCeilingCA } from '../tax/tax.js';
import { taxIndexFactor } from '../../../shared/core/projection/year-factors.js';

  export function solveMeltdown(ctx, otherIncome, maxAvailable, yearIndex) {
    if (maxAvailable <= 0) return 0;
    const factor = taxIndexFactor(ctx, yearIndex);
    // Brackets apply to income itself (credits come off the tax), so the top of
    // the chosen bracket is the income to fill up to.
    const targetGross = federalBracketCeilingCA(ctx.inputs.meltdownBracket) * factor;
    if (otherIncome >= targetGross) return 0;
    return Math.min(maxAvailable, targetGross - otherIncome);
  }
  // The RRSP meltdown ladder: moves the year's meltdown amount from the pooled
  // RRSP balance (then the RRSP bond bucket) into the TFSA, after it has been
  // withdrawn and taxed as income. The part taken from the RRSP bond bucket lands
  // in the TFSA bond bucket (Batch 5 step 5b): the meltdown does not move the
  // bond reserve into stocks.
  export function applyRrspMeltdown(bal, meltdownAmount) {
    if (meltdownAmount <= 0) return;
    const fromTradMelt = Math.min(bal.traditional, meltdownAmount),
      fromBondMelt = meltdownAmount - fromTradMelt;
    bal.traditional -= fromTradMelt;
    bal.bondTraditional = Math.max(0, bal.bondTraditional - fromBondMelt);
    bal.roth += fromTradMelt;
    bal.bondRoth += fromBondMelt;
  }
