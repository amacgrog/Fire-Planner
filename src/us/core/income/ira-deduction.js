// US traditional IRA deduction limit under IRC 219(g) (the active-participant phase-out)

import { filingKey } from '../tax/federal-rules.js';

// 2026 ranges (IR-2025-111), before the limit factor. `covered`: the partner is an active participant in a workplace
// plan; `spouseCovered`: only the spouse is (joint return only).
export const IRA_PHASEOUT = {
  covered: { mfj: [129000, 149000], single: [81000, 91000] },
  spouseCovered: { mfj: [242000, 252000] },
};

// The deductible part of a `limit` contribution at `magi`: the full limit at or under `lower`, 0 at or over `upper`, in
// between the pro-rata share rounded up to $10 with a $200 floor (219(g)(2)(A)-(B)).
export function iraDeductionLimit(limit, magi, lower, upper) {
  if (magi <= lower) return limit;
  if (magi >= upper) return 0;
  return Math.min(limit, Math.max(200, Math.ceil((limit * (upper - magi)) / (upper - lower) / 10) * 10));
}

// The [lower, upper] range that applies, or null when the deduction is not limited. A two-return year files as single.
export function iraRange(filing, covered, spouseCovered, twoReturns, f) {
  const key = twoReturns ? 'single' : filingKey(filing, 'ira');
  let r = null;
  if (covered) r = IRA_PHASEOUT.covered[key];
  else if (key === 'mfj' && spouseCovered) r = IRA_PHASEOUT.spouseCovered.mfj;
  return r === null ? null : [r[0] * f, r[1] * f];
}
