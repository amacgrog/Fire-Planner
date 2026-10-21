import { takeTraditional, solveTraditionalForNetFromNeed, solveTraditionalForNet, takeRoth } from './draws.js';
import { state } from '../../../shared/core/store.js';
import { takeTaxable, takeCash, takeHomeEquity } from '../../../shared/core/withdrawals/draws.js';

  // Smooth withdrawals (the only mix mode Canada has): the year's need is split
  // between taxable and RRSP/RRIF in proportion to their balances, shared by the
  // standard cascade and the bucket strategy. Returns false when smooth is off, so
  // the caller runs its own default order. `solver` is the bisection bracket for
  // the RRSP draw (the two strategies keep their own, see
  // solveTraditionalForNetFromNeed). Written against the take*() primitives so the
  // account model can change underneath.
  function drawSmoothStockAccounts(wd, solver) {
    if (!state.smoothWithdrawals) return false;
    const { bal } = wd;
    const pool = bal.taxable + bal.traditional;
    if (pool > 0 && wd.need > 0) {
      const taxableShare = wd.need * (bal.taxable / pool),
        traditionalShare = wd.need * (bal.traditional / pool);
      wd.need -= takeTaxable(wd, 'taxable', taxableShare);
      if (traditionalShare > 0 && bal.traditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', traditionalShare, solver));
    }
    return true;
  }
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
