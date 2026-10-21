import { drawSmoothStockAccounts } from './draw-smooth-stock-accounts.js';
import { solveTraditionalForNetFromNeed } from './withdrawals/draws.js';
import { takeRoth } from './take-roth.js';
import { takeTraditional } from './take-traditional.js';
import { takeCash, takeHomeEquity } from '../../shared/core/take-cash.js';
import { takeTaxable } from '../../shared/core/take-taxable.js';

  // The bucket strategy's draws, one per bucket, in the two orders (built once, not per year).
  // A draw that leaves a tiny overshoot is clamped to zero remaining need.
  export const BUCKET_STEP = {
    cash: (wd) => (wd.need -= takeCash(wd, wd.need)),
    bondTaxable: (wd) => {
      if (wd.bal.bondTaxable > 0) wd.need -= takeTaxable(wd, 'bondTaxable', wd.need);
    },
    taxable: (wd) => {
      if (wd.bal.taxable > 0) wd.need -= takeTaxable(wd, 'taxable', wd.need);
    },
    bondTraditional: (wd) => {
      if (wd.bal.bondTraditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed));
    },
    traditional: (wd) => {
      if (wd.bal.traditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solveTraditionalForNetFromNeed));
    },
    bondRoth: (wd) => (wd.need -= takeRoth(wd, 'bondRoth', wd.need)),
    roth: (wd) => (wd.need -= takeRoth(wd, 'roth', wd.need)),
    home: (wd) => (wd.need -= takeHomeEquity(wd, wd.need)),
    // The stock accounts as one grouped step: smooth withdrawals when enabled (the same
    // code the standard cascade uses), otherwise taxable -> RRSP/RRIF -> TFSA. Cash and
    // the bond buckets keep their own place in the order.
    stocks: (wd) => {
      if (!drawSmoothStockAccounts(wd, solveTraditionalForNetFromNeed)) {
        BUCKET_STEP.taxable(wd);
        if (wd.need > 0) BUCKET_STEP.traditional(wd);
      }
      if (wd.need > 0) BUCKET_STEP.roth(wd);
    },
  };
