import { drawTaxable } from './draw-taxable.js';
import { TAXABLE_BASIS_KEY } from '#country/core/seam-TAXABLE_BASIS_KEY';

  // Each take*() draws up to `amount` of net cash from one bucket, updates the
  // balances and the running totals on `wd`, and returns the NET cash raised
  // (after any tax or penalty the draw itself triggers). The caller subtracts
  // it from wd.need, because the strategies differ in whether a tiny overshoot
  // is clamped at zero. `bucket` is 'taxable' | 'bondTaxable'.
  export function takeTaxable(wd, bucket, amount) {
    const { bal } = wd;
    const basisKey = TAXABLE_BASIS_KEY[bucket];
    const d = drawTaxable(bal[bucket], bal[basisKey], amount, wd.profile, wd.taxableGainGross, wd.traditionalGross);
    bal[bucket] -= d.taken;
    bal[basisKey] -= d.basisTaken;
    wd.taxableGainGross += d.gain;
    wd.taxableWithdrawn += d.taken;
    return d.net;
  }
