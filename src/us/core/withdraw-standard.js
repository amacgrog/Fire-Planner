import { takeCash, takeHomeEquity } from '../../shared/core/take-cash.js';
import { takeTaxable } from '../../shared/core/take-taxable.js';
import { drawMixedStockAccounts } from './draw-mixed-stock-accounts.js';
import { releaseMagiCap } from './release-magi-cap.js';
import { solveTraditionalForNet, solveTraditionalForNetFromNeed, takeInherited, takeRoth, takeTraditional } from './standard-deduction.js';
import { takePenalized } from './take-penalized.js';

  // The standard (non-bucket) withdrawal strategy, used by simulate(). First the
  // discretionary draw from taxable / traditional (and Roth, for an explicit
  // mix): a mix mode (drawMixedStockAccounts) or, by default, taxable first then
  // traditional. Any shortfall then falls through Roth, cash, the bond-reserve
  // buckets (a protected sequence-risk reserve, tapped only after everything
  // else) and finally home equity. `remainingMagiRoom` is the safe-MAGI headroom
  // left after this year's Roth conversion.
  export function withdrawStandard(wd, { age, remainingMagiRoom }) {
    const { bal } = wd;
    if (!drawMixedStockAccounts(wd, { age, remainingMagiRoom, solver: solveTraditionalForNet })) {
      wd.need -= takeTaxable(wd, 'taxable', wd.need);
      if (wd.need > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need));
    }
    // The bond reserve keeps its place under a MAGI cap (uncapped draw): the cliff plan steers the stock-account step
    // and what precedes the reserve, never the reserve's own order.
    const bondTrad = () => {
      if (wd.need > 0 && bal.bondTraditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed, false, true));
    };
    if (wd.penaltyAware) {
      // Penalized money exists: cash and the taxable bond reserve come before Roth basis (decision 10),
      // penalty-free Roth before anything penalized, home equity last. A bisection overshoot from the
      // draws above is dropped, not credited back to cash (the live mix clamps it the same way).
      wd.need = Math.max(0, wd.need);
      wd.need -= takeCash(wd, wd.need);
      wd.need -= takeTaxable(wd, 'bondTaxable', wd.need);
      bondTrad();
      wd.need -= takeRoth(wd, 'roth', wd.need);
      wd.need -= takeRoth(wd, 'bondRoth', wd.need);
      releaseMagiCap(wd, solveTraditionalForNet);
      takeInherited(wd);
      takePenalized(wd, solveTraditionalForNet);
    } else {
      wd.need -= takeRoth(wd, 'roth', wd.need);
      wd.need -= takeCash(wd, wd.need);
      wd.need -= takeTaxable(wd, 'bondTaxable', wd.need);
      bondTrad();
      wd.need -= takeRoth(wd, 'bondRoth', wd.need);
      releaseMagiCap(wd, solveTraditionalForNet);
      takeInherited(wd);
    }
    if (wd.need > 0) wd.need -= takeHomeEquity(wd, wd.need);
  }
