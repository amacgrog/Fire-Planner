import { state } from '../../shared/core/store.js';
import { takeTaxable } from '../../shared/core/take-taxable.js';
import { magiCapLeft } from './after-tax-value.js';
import { optimizerState } from './optimizer-state.js';
import { pickLiveWithdrawalOrder } from './pick-live-withdrawal-order.js';
import { takeRoth, takeTraditional } from './standard-deduction.js';
import { rothFreeCaps, tradGroup } from './trad-group.js';
import { accountsDrawGroup, withdrawalMixWeights } from './withdrawal-mix-and-roth-accounts.js';

  // The mix modes that decide how a year's need is split across the stock accounts
  // (taxable / traditional / Roth), shared by the standard cascade and the bucket
  // strategy. Chosen in this order:
  //  1. an explicit per-year mix candidate (an optimizer override or an applied
  //     schedule): taxable, traditional AND Roth in that year's split;
  //  2. the live mix toggle: the cheaper of taxable-first or traditional-first,
  //     cascading fully into the other for any shortfall, respecting the
  //     remaining safe-MAGI room;
  //  3. smooth withdrawals: taxable and traditional in proportion to balances.
  // Returns false when no mix mode is active, so the caller runs its own default
  // order. `solver` is the bisection bracket for traditional draws (the two
  // strategies keep their own, see solveTraditionalForNetFromNeed). Written
  // against the take*() primitives so the account model can change underneath.
  export function drawMixedStockAccounts(wd, { age, remainingMagiRoom, solver }) {
    const { bal } = wd;
    const mixCandidate =
      optimizerState.withdrawalMixByAge && optimizerState.withdrawalMixByAge.has(age)
        ? optimizerState.withdrawalMixByAge.get(age)
        : state.appliedMixSchedule && Object.prototype.hasOwnProperty.call(state.appliedMixSchedule, age)
          ? state.appliedMixSchedule[age]
          : 0;
    // Mix weights see only the money this tier may use: penalty-free traditional (and, while penalized
    // money exists, penalty-free Roth).
    const freeTrad = bal.traditional * tradGroup(wd, false).share,
      freeRoth = wd.penaltyAware ? rothFreeCaps(wd, 'roth').reduce((sum, c) => sum + c, 0) : bal.roth;
    const mixWeights = withdrawalMixWeights(mixCandidate, bal.taxable, freeTrad, freeRoth);
    if (mixWeights && wd.need > 0) {
      wd.mixCandidate = mixCandidate;
      const [wTaxable, wTraditional, wRoth] = mixWeights;
      const taxableShare = wd.need * wTaxable,
        traditionalShare = wd.need * wTraditional,
        rothShare = wd.need * wRoth;
      wd.need -= takeTaxable(wd, 'taxable', taxableShare);
      if (traditionalShare > 0 && freeTrad > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', traditionalShare, solver));
      if (rothShare > 0 && freeRoth > 0) wd.need -= takeRoth(wd, 'roth', rothShare);
    } else if (state.withdrawalMixEnabled && wd.need > 0) {
      // 'live' is a display-only marker, not a WITHDRAWAL_MIX_CANDIDATES id.
      wd.mixCandidate = 'live';
      const free = tradGroup(wd, false),
        live = pickLiveWithdrawalOrder(
          wd.need,
          bal.taxable,
          wd.magiCap ? Math.min(freeTrad, magiCapLeft(wd)) : freeTrad,
          bal.taxableBasis,
          wd.profile,
          wd.taxableGainGross,
          wd.traditionalGross,
          0,
          remainingMagiRoom,
        );
      bal.taxable -= live.fromTaxable;
      bal.taxableBasis -= live.taxableBasisTaken;
      wd.taxableGainGross += live.taxableGain;
      wd.taxableWithdrawn += live.fromTaxable;
      accountsDrawGroup(wd.accts.trad, bal.traditional + bal.bondTraditional, free.slots, live.fromTraditional);
      bal.traditional -= live.fromTraditional;
      wd.traditionalGross += live.fromTraditional;
      wd.traditionalWithdrawn += live.fromTraditional;
      wd.cappableTraditional += live.fromTraditional;
      wd.earlyPenalty += live.penalty;
      wd.need = live.remainingNeed;
    } else if (state.smoothWithdrawals) {
      const pool = bal.taxable + freeTrad;
      if (pool > 0 && wd.need > 0) {
        const taxableShare = wd.need * (bal.taxable / pool),
          traditionalShare = wd.need * (freeTrad / pool);
        wd.need -= takeTaxable(wd, 'taxable', taxableShare);
        if (traditionalShare > 0 && freeTrad > 0)
          wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', traditionalShare, solver));
      }
    } else return false;
    return true;
  }
