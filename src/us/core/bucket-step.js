import { takeCash, takeHomeEquity } from '../../shared/core/take-cash.js';
import { takeTaxable } from '../../shared/core/take-taxable.js';
import { drawMixedStockAccounts } from './draw-mixed-stock-accounts.js';
import { releaseMagiCap } from './release-magi-cap.js';
import { solveTraditionalForNetFromNeed, takeInherited, takeRoth, takeTraditional } from './standard-deduction.js';
import { takePenalized } from './take-penalized.js';

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
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed, false, true));
    },
    traditional: (wd) => {
      if (wd.bal.traditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solveTraditionalForNetFromNeed));
    },
    bondRoth: (wd) => {
      wd.need = Math.max(0, wd.need - takeRoth(wd, 'bondRoth', wd.need));
    },
    roth: (wd) => {
      wd.need = Math.max(0, wd.need - takeRoth(wd, 'roth', wd.need));
    },
    home: (wd) => {
      releaseMagiCap(wd, solveTraditionalForNetFromNeed);
      takeInherited(wd);
      if (wd.need > 0) wd.need -= takeHomeEquity(wd, wd.need);
    },
    // The stock accounts as one grouped step: a mix mode when one is active (the
    // same code the standard cascade uses), otherwise taxable -> traditional -> Roth.
    // Cash and the bond buckets keep their own place in the order.
    stocks: (wd, opts) => {
      if (!drawMixedStockAccounts(wd, { age: opts.age, remainingMagiRoom: opts.remainingMagiRoom, solver: solveTraditionalForNetFromNeed })) {
        BUCKET_STEP.taxable(wd);
        if (wd.need > 0) BUCKET_STEP.traditional(wd);
      }
      // While penalized money exists Roth is its own step later (withdrawBucketPenaltyAware).
      if (wd.need > 0 && !wd.penaltyAware) BUCKET_STEP.roth(wd);
    },
    penalized: (wd) => {
      releaseMagiCap(wd, solveTraditionalForNetFromNeed);
      takeInherited(wd);
      if (wd.need > 0) takePenalized(wd, solveTraditionalForNetFromNeed);
    },
  };
