// US traditional IRA after-tax basis (Form 8606): opening basis, the yearly pro-rata ratio and the taxable share of an outflow

import { pct } from '../../../shared/core/format/numbers.js';

  // Traditional IRA basis is tracked per partner ([A, B]) against the IRA slots of the account ledger (ACCOUNT_SLOTS
  // order [IRA A, 401(k) A, IRA B, 401(k) B]: IRA slots are 0 and 2). The ratio of basis to IRA dollars is the share of
  // every outflow from that IRA that comes out tax-free (pro rata, Form 8606). Nothing here keeps module state.

  // Opening basis per partner: the IRA balance times its slider (B is 0 in single-person mode).
  export function iraBasisOpening(inputs) {
    return [inputs.tradIraA * pct(inputs.tradIraBasisPctA), inputs.singlePerson ? 0 : inputs.tradIraB * pct(inputs.tradIraBasisPctB)];
  }
  // Writes each partner's basis ratio into `out` ([A, B]): basis over the IRA's dollars, at most 1, 0 for an empty IRA.
  export function iraBasisRatios(basis, accountDollars, out) {
    for (let p = 0; p < 2; p++) {
      const d = accountDollars[2 * p];
      out[p] = d > 0 ? Math.min(1, basis[p] / d) : 0;
    }
    return out;
  }
  // The taxable fraction of a pro-rata outflow from the accounts `slots`: 1 minus the basis share of their dollars.
  export function groupTaxableFraction(ratios, accountDollars, slots) {
    if (ratios[0] === 0 && ratios[1] === 0) return 1;
    let num = 0,
      den = 0;
    for (const s of slots) {
      den += accountDollars[s];
      if (s % 2 === 0) num += ratios[s / 2] * accountDollars[s];
    }
    return den > 0 ? 1 - num / den : 1;
  }
  // The IRA segment of a conversion (accountsConvert takes the non-excluded IRAs first, pro rata): its dollars `seg` and its
  // blended basis ratio `rho` (the dollar-weighted mean of the partners' ratios); the 401(k)s behind it are `k401`. Written out
  // in both functions below, which run on the year loop's hot path (no object per call).
  // The taxable part of a conversion of `amount` gross dollars: the IRA segment less its basis share, then the 401(k)s in full.
  export function conversionTaxable(ratios, d, excluded, amount) {
    if (ratios[0] === 0 && ratios[1] === 0) return amount;
    const d0 = excluded && excluded[0] ? 0 : d[0],
      d2 = excluded && excluded[2] ? 0 : d[2],
      seg = d0 + d2,
      k401 = (excluded && excluded[1] ? 0 : d[1]) + (excluded && excluded[3] ? 0 : d[3]),
      rho = seg > 0 ? (ratios[0] * d0 + ratios[1] * d2) / seg : 0,
      ira = Math.min(amount, seg);
    return ira * (1 - rho) + Math.min(Math.max(amount - ira, 0), k401);
  }
  // The inverse: the gross dollars converted for `taxable` taxable dollars. An all-basis segment (nothing taxable in it)
  // converts whole, so `taxable` of 0 gives the segment's dollars and `taxable` more comes from the 401(k)s.
  export function conversionGross(ratios, d, excluded, taxable) {
    if (ratios[0] === 0 && ratios[1] === 0) return taxable;
    const d0 = excluded && excluded[0] ? 0 : d[0],
      d2 = excluded && excluded[2] ? 0 : d[2],
      seg = d0 + d2,
      k401 = (excluded && excluded[1] ? 0 : d[1]) + (excluded && excluded[3] ? 0 : d[3]),
      rho = seg > 0 ? (ratios[0] * d0 + ratios[1] * d2) / seg : 0,
      segTaxable = seg * (1 - rho);
    if (!(1 - rho > 0)) return seg + Math.min(taxable, k401);
    if (taxable <= segTaxable) return taxable / (1 - rho);
    return seg + Math.min(taxable - segTaxable, k401);
  }
