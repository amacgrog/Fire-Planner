import { drawSmoothStockAccounts } from './draw-smooth-stock-accounts.js';
import { solveTraditionalForNetFromNeed, solveTraditionalForNet } from './withdrawals/draws.js';
import { takeRoth } from './take-roth.js';
import { takeTraditional } from './take-traditional.js';
import { takeCash, takeHomeEquity } from '../../shared/core/take-cash.js';
import { takeTaxable } from '../../shared/core/take-taxable.js';

  // The standard (non-bucket) withdrawal strategy, used by simulate(). First
  // the discretionary draw from taxable and RRSP/RRIF: with smooth withdrawals,
  // in proportion to balances; otherwise taxable first, then RRSP. Any
  // shortfall then falls through the TFSA, cash, the bond-reserve buckets (a
  // protected sequence-risk reserve, tapped only after everything else) and
  // finally home equity.
  export function withdrawStandard(wd) {
    const { bal } = wd;
    if (!drawSmoothStockAccounts(wd, solveTraditionalForNet)) {
      wd.need -= takeTaxable(wd, 'taxable', wd.need);
      if (wd.need > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solveTraditionalForNetFromNeed));
    }
    wd.need -= takeRoth(wd, 'roth', wd.need);
    wd.need -= takeCash(wd, wd.need);
    wd.need -= takeTaxable(wd, 'bondTaxable', wd.need);
    if (wd.need > 0 && bal.bondTraditional > 0)
      wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed));
    wd.need -= takeRoth(wd, 'bondRoth', wd.need);
    if (wd.need > 0) wd.need -= takeHomeEquity(wd, wd.need);
  }
