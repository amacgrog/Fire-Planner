import { refillBondReserve } from '../../shared/core/refill-bond-reserve.js';
import { BUCKET_DOWN_PENALIZED_ORDER } from './bucket-down-penalized-order.js';
import { BUCKET_UP_PENALIZED_ORDER } from './bucket-up-penalized-order.js';

  export function withdrawBucketPenaltyAware(wd, opts) {
    const { yearReturn, bondTarget } = opts;
    for (const step of yearReturn < 0 ? BUCKET_DOWN_PENALIZED_ORDER : BUCKET_UP_PENALIZED_ORDER) if (wd.need > 0) step(wd, opts);
    if (yearReturn >= 0) refillBondReserve(wd, bondTarget, { maxMove: opts.refillCap });
  }
