// Shared draw primitives: taxable sale, cash, home equity and excess-cash sweep

import { clamp } from '../format/numbers.js';
import { taxFor } from '#country/core/seam-taxFor';
import { TAXABLE_BASIS_KEY } from '#country/core/seam-TAXABLE_BASIS_KEY';

  export function drawTaxable(ctx, pool, basis, need, profile, priorGains = 0, priorTraditionalExtra = 0) {
    if (pool <= 0 || need <= 0) return { taken: 0, net: 0, gain: 0, basisTaken: 0 };
    const gainRatio = clamp(1 - basis / pool, 0, 1),
      basisRatio = 1 - gainRatio;
    let lo = need,
      hi = need * 3 + 1;
    // The tax with nothing drawn is the same for every probe, so it is computed once.
    const baseTax = taxFor(ctx, profile, priorGains, priorTraditionalExtra);
    const incrementalTax = (gross) => taxFor(ctx, profile, priorGains + gross * gainRatio, priorTraditionalExtra) - baseTax;
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
  // Cash above the reserve target is invested in the taxable account (at full
  // cost basis, since it was already-taxed cash).
  export function sweepExcessCash(bal, reserveTarget) {
    if (bal.cash <= reserveTarget) return;
    const moved = bal.cash - reserveTarget;
    bal.taxable += moved;
    bal.taxableBasis += moved;
    bal.cash = reserveTarget;
  }
  export function takeCash(wd, amount) {
    const from = Math.min(wd.bal.cash, amount);
    wd.bal.cash -= from;
    return from;
  }
  // Last resort: home equity (value less mortgage) when the household owns.
  export function takeHomeEquity(wd, amount) {
    const { bal } = wd,
      tenure = wd.ctx.inputs.tenure;
    if (tenure !== 'own' && tenure !== 'rentThenBuy') return 0;
    const from = Math.min(Math.max(0, bal.home - bal.mortgage), amount);
    bal.home -= from;
    return from;
  }
  // Each take*() draws up to `amount` of net cash from one bucket, updates the
  // balances and the running totals on `wd`, and returns the NET cash raised
  // (after any tax or penalty the draw itself triggers). The caller subtracts
  // it from wd.need, because the strategies differ in whether a tiny overshoot
  // is clamped at zero. `bucket` is 'taxable' | 'bondTaxable'.
  export function takeTaxable(wd, bucket, amount) {
    const { bal } = wd;
    const basisKey = TAXABLE_BASIS_KEY[bucket];
    const d = drawTaxable(wd.ctx, bal[bucket], bal[basisKey], amount, wd.profile, wd.taxableGainGross, wd.traditionalGross);
    bal[bucket] -= d.taken;
    bal[basisKey] -= d.basisTaken;
    wd.taxableGainGross += d.gain;
    wd.taxableWithdrawn += d.taken;
    return d.net;
  }
