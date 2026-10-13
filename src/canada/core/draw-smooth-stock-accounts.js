import { takeTraditional } from './take-traditional.js';
import { state } from '../../shared/core/store.js';
import { takeTaxable } from '../../shared/core/take-taxable.js';

  // Smooth withdrawals (the only mix mode Canada has): the year's need is split
  // between taxable and RRSP/RRIF in proportion to their balances, shared by the
  // standard cascade and the bucket strategy. Returns false when smooth is off, so
  // the caller runs its own default order. `solver` is the bisection bracket for
  // the RRSP draw (the two strategies keep their own, see
  // solveTraditionalForNetFromNeed). Written against the take*() primitives so the
  // account model can change underneath.
  export function drawSmoothStockAccounts(wd, solver) {
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
