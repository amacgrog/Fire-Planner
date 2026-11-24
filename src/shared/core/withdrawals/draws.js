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
    wd.cashWithdrawn += from;
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
  // A draw on bondTaxable (US, the bridge reserve's counter inside it): the bridge's bonds go first, so the counter falls by
  // what the draw took, to 0 at the least. The key is written only when the counter was held, so a balance without a bridge is
  // untouched.
  export function takeBondTaxable(wd, amount) {
    const { bal } = wd,
      before = bal.bondTaxable,
      net = takeTaxable(wd, 'bondTaxable', amount);
    if (bal.bridgeBonds > 0) bal.bridgeBonds = Math.max(0, Math.min(bal.bridgeBonds, before) - (before - bal.bondTaxable));
    return net;
  }
  // A draw on the bridge's bonds only (US, once the bridge is over for the retirement accounts' age but the retirement reserve
  // must stay): the pool is the bridge's dollars with their share of bondTaxable's basis, taken out of bondTaxable, its basis
  // and the counter. Gains and the amount sold go on `wd` as takeTaxable does; returns the net cash raised. `room` (default
  // Infinity: no limit, every expression then equals the uncapped one to the bit) is the most gain the sale may realize: the
  // pool is cut to the gross whose gain fits it, as takeTaxableCapped does (the caller knows what the room is; no cap here).
  export function takeBridgeOnly(wd, amount, room = Infinity) {
    const { bal } = wd;
    if (!(bal.bridgeBonds > 0) || !(bal.bondTaxable > 0)) return 0;
    const pool = Math.min(bal.bridgeBonds, bal.bondTaxable),
      basis = (bal.bondTaxableBasis * pool) / bal.bondTaxable,
      gainRatio = clamp(1 - basis / pool, 0, 1),
      poolCap = gainRatio === 0 ? pool : Math.min(pool, room / gainRatio);
    if (!(poolCap > 0)) return 0;
    const d = drawTaxable(wd.ctx, poolCap, poolCap >= pool ? basis : (basis * poolCap) / pool, amount, wd.profile, wd.taxableGainGross, wd.traditionalGross);
    bal.bondTaxable -= d.taken;
    bal.bondTaxableBasis -= d.basisTaken;
    bal.bridgeBonds = Math.max(0, pool - d.taken);
    wd.taxableGainGross += d.gain;
    wd.taxableWithdrawn += d.taken;
    return d.net;
  }
