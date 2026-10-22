// Canada withdrawal object and the RRSP/RRIF and TFSA draw solvers

import { taxFor } from '../tax/tax.js';
import { LIVE_CTX } from '../projection/live-context.js';

  // How much RRSP to withdraw to net `targetNet` after tax, by bisection over
  // [0, min(balance, 3*target + 1)]. Used for the smooth-withdrawal RRSP share.
  export function solveTraditionalForNet(traditionalBal, targetNet, taxableGainGross, traditionalGross, profile) {
    const baseTax = taxFor(LIVE_CTX, profile, taxableGainGross, traditionalGross);
    let lo = 0,
      hi = Math.min(traditionalBal, targetNet * 3 + 1);
    // Widen the bracket only when a benefit step leaves the net at its top short of the target (see drawTaxable).
    for (let w = 0; w < 12 && hi < traditionalBal && hi - (taxFor(LIVE_CTX, profile, taxableGainGross, traditionalGross + hi) - baseTax) < targetNet; w++) {
      lo = hi;
      hi = Math.min(traditionalBal, hi * 2);
    }
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net = mid - (taxFor(LIVE_CTX, profile, taxableGainGross, traditionalGross + mid) - baseTax);
      if (net < targetNet) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      tradNet = fromTrad - (taxFor(LIVE_CTX, profile, taxableGainGross, traditionalGross + fromTrad) - baseTax);
    return { fromTrad, tradNet };
  }
  // Same job, but bisecting from [need, 6*need + 1]. The two brackets converge to
  // slightly different values (~1e-7 relative), so both are kept until the
  // numerics are unified deliberately; the default draw, the bond-reserve draw
  // and the historical engine use this one.
  export function solveTraditionalForNetFromNeed(traditionalBal, need, taxableGainGross, traditionalGross, profile) {
    if (traditionalBal <= 0 || need <= 0) return { fromTrad: 0, tradNet: 0 };
    const baseTax = taxFor(LIVE_CTX, profile, taxableGainGross, traditionalGross);
    let lo = need,
      hi = need * 6 + 1;
    // Widen the bracket only when a benefit step leaves the net at its top short of the need (see drawTaxable).
    for (let w = 0; w < 12 && hi < traditionalBal && hi - (taxFor(LIVE_CTX, profile, taxableGainGross, traditionalGross + hi) - baseTax) < need; w++) {
      lo = hi;
      hi = Math.min(traditionalBal, hi * 2);
    }
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net = mid - (taxFor(LIVE_CTX, profile, taxableGainGross, traditionalGross + mid) - baseTax);
      if (net < need) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      tradNet = fromTrad - (taxFor(LIVE_CTX, profile, taxableGainGross, traditionalGross + fromTrad) - baseTax);
    return { fromTrad, tradNet };
  }
  // A year's discretionary withdrawal in progress. `need` is the cash still to
  // be raised; the other fields accumulate what the draws did, for tax and the
  // cash-flow display. traditionalGross starts at the RRSP meltdown (ordinary
  // income already this year) and traditionalWithdrawn at the mandatory RRIF
  // minimum; traditionalWithdrawn / taxableWithdrawn fold the bond-reserve
  // buckets into their parent tax status so the Sankey does not undercount them.
  export function newWithdrawal({ bal, profile, meltdownAmount, rmd }) {
    return {
      bal,
      profile,
      need: 0,
      taxableGainGross: 0,
      traditionalGross: meltdownAmount,
      traditionalWithdrawn: rmd,
      taxableWithdrawn: 0,
    };
  }
  // TFSA withdrawals are tax-free, so the net cash is simply what is taken.
  // `bucket` is 'roth' | 'bondRoth' (the TFSA and its bond bucket).
  export function takeRoth(wd, bucket, amount) {
    const from = Math.min(wd.bal[bucket], amount);
    wd.bal[bucket] -= from;
    return from;
  }
  // RRSP/RRIF withdrawals are fully taxable income. `bucket` is 'traditional' |
  // 'bondTraditional'; `solver` picks the bisection bracket.
  export function takeTraditional(wd, bucket, amount, solver = solveTraditionalForNet) {
    const { bal } = wd;
    const { fromTrad, tradNet } = solver(bal[bucket], amount, wd.taxableGainGross, wd.traditionalGross, wd.profile);
    bal[bucket] -= fromTrad;
    wd.traditionalGross += fromTrad;
    wd.traditionalWithdrawn += fromTrad;
    return tradNet;
  }
