import { refillBondReserve } from './refill-bond-reserve.js';
import { BUCKET_STEP } from '#country/core/seam-BUCKET_STEP';

  const BUCKET_DOWN_YEAR_ORDER = ['cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'stocks', 'home'].map((k) => BUCKET_STEP[k]);
  const BUCKET_UP_YEAR_ORDER = ['stocks', 'cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'home'].map((k) => BUCKET_STEP[k]);
  // The bucket-strategy withdrawal used by simulateHistorical(): cash and bonds
  // are a sequence-risk reserve. In a market-down year (yearReturn < 0) spending
  // comes from cash, then the bond-reserve buckets, and only then from the
  // stock accounts (taxable, tax-deferred, tax-free) and home equity. In an up
  // year it comes from the stock accounts first, then cash, bonds and home, and
  // any shortfall in the bond reserve versus `bondTarget` is topped back up from
  // the same stock-account order. The stock accounts are one grouped step whose
  // split follows the user's mix mode (see BUCKET_STEP.stocks); `opts` carries
  // what that step needs (age, remainingMagiRoom). A draw that leaves a tiny
  // overshoot is clamped to zero remaining need.
  export function withdrawBucket(wd, opts) {
    const { yearReturn, bondTarget } = opts;
    for (const step of yearReturn < 0 ? BUCKET_DOWN_YEAR_ORDER : BUCKET_UP_YEAR_ORDER) if (wd.need > 0) step(wd, opts);
    if (yearReturn >= 0)
      refillBondReserve(wd, bondTarget, { maxMove: opts.refillCap });
  }
