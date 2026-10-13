import { clamp } from './basics.js';
import { taxFor } from '#country/core/seam';

  export function drawTaxable(pool, basis, need, profile, priorGains = 0, priorTraditionalExtra = 0) {
    if (pool <= 0 || need <= 0) return { taken: 0, net: 0, gain: 0, basisTaken: 0 };
    const gainRatio = clamp(1 - basis / pool, 0, 1),
      basisRatio = 1 - gainRatio;
    let lo = need,
      hi = need * 3 + 1;
    // The tax with nothing drawn is the same for every probe, so it is computed once.
    const baseTax = taxFor(profile, priorGains, priorTraditionalExtra);
    const incrementalTax = (gross) => taxFor(profile, priorGains + gross * gainRatio, priorTraditionalExtra) - baseTax;
    // A benefit that stops in a step can leave the net at the top of the bracket below the need, and the bisection would then
    // return the top with a short net. Widen only in that case, so every other draw is unchanged.
    for (let w = 0; w < 12 && hi < pool && hi - incrementalTax(hi) < need; w++) {
      lo = hi;
      hi = Math.min(pool, hi * 2);
    }
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net = mid - incrementalTax(mid);
      if (net < need) lo = mid;
      else hi = mid;
    }
    const taken = Math.min(pool, hi),
      net = taken - incrementalTax(taken);
    return { taken, net, gain: taken * gainRatio, basisTaken: taken * basisRatio };
  }
