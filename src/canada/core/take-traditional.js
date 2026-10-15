import { solveTraditionalForNet } from './federal-tax-ca.js';

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
