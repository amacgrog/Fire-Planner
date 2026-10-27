// US withdrawal strategies: standard cascade, penalty-aware bucket and step tables

import { takeTaxable, takeCash, takeHomeEquity } from '../../../shared/core/withdrawals/draws.js';
import { takeStockTaxable, takeTraditional, takeRoth, solveTraditionalForNetFromNeed, takeInherited, solveTraditionalForNet, releaseMagiCap, takePenalized } from './draws.js';
import { withdrawalMixWeights } from './mix.js';
import { rothFreeCaps, tradGroup, groupRoom } from '../accounts/penalty-status.js';
import { refillBondReserve } from '../../../shared/core/withdrawals/bond-ladder.js';

  // The mix modes that decide how a year's need is split across the stock accounts
  // (taxable / traditional / Roth), shared by the standard cascade and the bucket
  // strategy. Chosen in this order:
  //  1. an explicit per-year mix candidate (an optimizer override or an applied
  //     schedule): taxable, traditional AND Roth in that year's split;
  //  2. the plan's order intent (wd.taxAwareOrder 'traditional', set by the year
  //     body): penalty-free traditional first, then taxable, when the pass is
  //     orderable (wd.orderable: a need, taxable money and penalty-free
  //     traditional money; an explicit-mix pass leaves it false);
  //  3. smooth withdrawals: taxable and traditional in proportion to balances.
  // Returns false when no mix mode is active, so the caller runs its own default
  // order. When it returns true a mix's shares are drawn from their own buckets and a
  // share its bucket cannot cover is NOT dropped: the caller then runs mixFallthrough
  // (taxable, then penalty-free traditional, cap-aware) before Roth, cash, bonds,
  // inherited money and home equity, so a one-bucket mix means "this bucket first". Every taxable sale here goes through
  // takeStockTaxable and every traditional draw through takeTraditional (both capped under the cliff plan's MAGI cap), so
  // after the order a shortfall is left only when a cap held money back. `solver` is the bisection bracket for traditional draws (the two
  // strategies keep their own, see solveTraditionalForNetFromNeed). Written
  // against the take*() primitives so the account model can change underneath.
  function drawMixedStockAccounts(wd, { age, solver }) {
    const { bal, ctx } = wd,
      inputs = ctx.inputs,
      mixByAge = ctx.overrides.withdrawalMixByAge;
    const mixCandidate =
      mixByAge && mixByAge.has(age)
        ? mixByAge.get(age)
        : inputs.appliedMixSchedule && Object.prototype.hasOwnProperty.call(inputs.appliedMixSchedule, age)
          ? inputs.appliedMixSchedule[age]
          : 0;
    // Mix weights see only the money this tier may use: penalty-free traditional (and, while penalized
    // money exists, penalty-free Roth).
    const freeTrad = groupRoom(bal, 'traditional', tradGroup(wd, false).share, bal.traditional + bal.bondTraditional),
      freeRoth = wd.penaltyAware ? Math.min(bal.roth, rothFreeCaps(wd).reduce((sum, c) => sum + c, 0)) : bal.roth;
    const mixWeights = withdrawalMixWeights(mixCandidate, bal.taxable, freeTrad, freeRoth);
    if (mixWeights && wd.need > 0) {
      wd.mixCandidate = mixCandidate;
      const [wTaxable, wTraditional, wRoth] = mixWeights;
      const taxableShare = wd.need * wTaxable,
        traditionalShare = wd.need * wTraditional,
        rothShare = wd.need * wRoth;
      wd.need -= takeStockTaxable(wd, taxableShare);
      if (traditionalShare > 0 && freeTrad > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', traditionalShare, solver));
      if (rothShare > 0 && freeRoth > 0) wd.need -= takeRoth(wd, 'roth', rothShare);
      return true;
    }
    wd.orderable = wd.need > 0 && bal.taxable > 0 && freeTrad > 0;
    if (wd.taxAwareOrder === 'traditional' && wd.orderable) {
      wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solver));
      if (wd.need > 0) wd.need -= takeStockTaxable(wd, wd.need);
    } else if (inputs.smoothWithdrawals) {
      const pool = bal.taxable + freeTrad;
      if (pool > 0 && wd.need > 0) {
        const taxableShare = wd.need * (bal.taxable / pool),
          traditionalShare = wd.need * (freeTrad / pool);
        wd.need -= takeStockTaxable(wd, taxableShare);
        if (traditionalShare > 0 && freeTrad > 0)
          wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', traditionalShare, solver));
      }
    } else return false;
    return true;
  }
  // A withdrawal mix's shortfall (a share its bucket could not cover) falls through to the other stock accounts: taxable, then
  // penalty-free traditional, before Roth, cash, bonds, inherited money and home equity. Under the cliff plan's MAGI cap the taxable
  // sale is limited to the room left (takeStockTaxable) and the traditional draw is capped by takeTraditional itself; what the cap
  // held back is drawn by releaseMagiCap. After the order intent it is a no-op unless a cap held money back.
  function mixFallthrough(wd, solver) {
    if (wd.need > 0 && wd.bal.taxable > 0)
      wd.need -= takeStockTaxable(wd, wd.need);
    if (wd.need > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solver));
  }
  // The bucket strategy's draws, one per bucket, in the two orders (built once, not per year).
  // A draw that leaves a tiny overshoot is clamped to zero remaining need.
  export const BUCKET_STEP = {
    cash: (wd) => (wd.need -= takeCash(wd, wd.need)),
    bondTaxable: (wd) => {
      if (wd.bal.bondTaxable > 0) wd.need -= takeTaxable(wd, 'bondTaxable', wd.need);
    },
    taxable: (wd) => {
      if (wd.bal.taxable > 0) wd.need -= takeStockTaxable(wd, wd.need);
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
      if (wd.need > 0) {
        const home = takeHomeEquity(wd, wd.need);
        wd.need -= home;
        wd.homeDrawn += home;
      }
    },
    // The stock accounts as one grouped step: a mix mode or the order intent when one is active (the
    // same code the standard cascade uses), otherwise taxable -> traditional -> Roth.
    // Cash and the bond buckets keep their own place in the order.
    stocks: (wd, opts) => {
      if (!drawMixedStockAccounts(wd, { age: opts.age, solver: solveTraditionalForNetFromNeed })) {
        BUCKET_STEP.taxable(wd);
        if (wd.need > 0) BUCKET_STEP.traditional(wd);
      } else mixFallthrough(wd, solveTraditionalForNetFromNeed);
      // While penalized money exists Roth is its own step later (withdrawBucketPenaltyAware).
      if (wd.need > 0 && !wd.penaltyAware) BUCKET_STEP.roth(wd);
    },
    penalized: (wd) => {
      releaseMagiCap(wd, solveTraditionalForNetFromNeed);
      takeInherited(wd);
      if (wd.need > 0) takePenalized(wd, solveTraditionalForNetFromNeed);
    },
  };
  // load-time: maps step names to BUCKET_STEP entries; BUCKET_STEP is declared earlier in this file
  // The bucket strategy while penalized money exists (US): the same two years, but every step draws
  // only penalty-free money, cash and the bond reserve come before Roth basis in an up year too, and a
  // penalized tier (cheapest per dollar) runs just before home equity.
  const BUCKET_DOWN_PENALIZED_ORDER = ['cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'stocks', 'roth', 'penalized', 'home'].map((k) => BUCKET_STEP[k]);
  // load-time: maps step names to BUCKET_STEP entries; BUCKET_STEP is declared earlier in this file
  const BUCKET_UP_PENALIZED_ORDER = ['stocks', 'cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'roth', 'penalized', 'home'].map((k) => BUCKET_STEP[k]);
  export function withdrawBucketPenaltyAware(wd, opts) {
    const { yearReturn, bondTarget } = opts;
    for (const step of yearReturn < 0 ? BUCKET_DOWN_PENALIZED_ORDER : BUCKET_UP_PENALIZED_ORDER) if (wd.need > 0) step(wd, opts);
    if (yearReturn >= 0) refillBondReserve(wd, bondTarget, { maxMove: opts.refillCap });
  }
  // The standard (non-bucket) withdrawal strategy, used by simulate(). First the
  // discretionary draw from taxable / traditional (and Roth, for an explicit
  // mix): a mix mode or the order intent (drawMixedStockAccounts, whose shortfall falls through to taxable then traditional) or, by default, taxable first then
  // traditional (under a MAGI cap both capped: takeStockTaxable, takeTraditional). Any shortfall then falls through Roth, cash, the bond-reserve
  // buckets (a protected sequence-risk reserve, tapped only after everything
  // else) and finally home equity.
  export function withdrawStandard(wd, { age }) {
    const { bal } = wd;
    if (!drawMixedStockAccounts(wd, { age, solver: solveTraditionalForNet })) {
      wd.need -= takeStockTaxable(wd, wd.need);
      if (wd.need > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need));
    } else mixFallthrough(wd, solveTraditionalForNet);
    // The bond reserve keeps its place under a MAGI cap (uncapped draw): the cliff plan steers the stock-account step
    // and what precedes the reserve, never the reserve's own order.
    const bondTrad = () => {
      if (wd.need > 0 && bal.bondTraditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed, false, true));
    };
    if (wd.penaltyAware) {
      // Penalized money exists: cash and the taxable bond reserve come before Roth basis (decision 10),
      // penalty-free Roth before anything penalized, home equity last. A bisection overshoot from the
      // draws above is dropped, not credited back to cash.
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
    if (wd.need > 0) {
      const home = takeHomeEquity(wd, wd.need);
      wd.need -= home;
      wd.homeDrawn += home;
    }
  }
