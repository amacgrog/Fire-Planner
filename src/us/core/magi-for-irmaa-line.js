import { filingKey, SS_BASE } from './federal-deductions.js';

  // The engine MAGI whose IRMAA MAGI is `line`. With x = magi - ss, f(x) = x + taxable(ss, x) is continuous, piecewise
  // linear and strictly increasing (slopes 1, 1.5, 1.85, 1); its kinks are where provisional income (x + ss / 2) reaches
  // the lower base, where the 50% part reaches half the benefit (lower base + ss), the upper base, and where the 85% cap
  // binds. A listed point that is not a kink in this case lies on a straight segment, so interpolation stays exact.
  export function magiForIrmaaLine(line, ss, filing) {
    if (!(ss > 0) || !Number.isFinite(line)) return line;
    const row = SS_BASE[filingKey(filing, 'ss')],
      lower = row[0],
      upper = row[1],
      base = row[2],
      h = ss * 0.5,
      k1 = lower - h,
      k2 = lower + h,
      k3 = upper - h,
      k4 = upper - h + Math.max(0, 0.85 * ss - Math.min(base, h)) / 0.85;
    // The kinks in ascending order without an array (hot path: the IRMAA lines of every planned year): k1 is always the
    // smallest and k4 >= k3, so only k2's place among k3 and k4 is open. Equal kinks are equal numbers, so the order
    // among them does not matter.
    let a, b, c;
    if (k2 <= k3) (a = k2), (b = k3), (c = k4);
    else if (k2 <= k4) (a = k3), (b = k2), (c = k4);
    else (a = k3), (b = k4), (c = k2);
    const pf = k1 + taxableSsOnRow(ss, k1, lower, upper, base);
    if (line <= pf) return line + ss; // at or below the first kink nothing is taxable: f(x) = x
    const af = a + taxableSsOnRow(ss, a, lower, upper, base);
    if (line <= af) return (af > pf ? k1 + ((line - pf) * (a - k1)) / (af - pf) : a) + ss;
    const bf = b + taxableSsOnRow(ss, b, lower, upper, base);
    if (line <= bf) return (bf > af ? a + ((line - af) * (b - a)) / (bf - af) : b) + ss;
    const cf = c + taxableSsOnRow(ss, c, lower, upper, base);
    if (line <= cf) return (cf > bf ? b + ((line - bf) * (c - b)) / (cf - bf) : c) + ss;
    return c + (line - cf) + ss; // above the last kink: slope 1
  }
  // taxableSocialSecurity on an SS_BASE row already read: the same arithmetic, for magiForIrmaaLine's four kinks.
  export function taxableSsOnRow(benefits, otherIncome, lower, upper, base) {
    const provisional = otherIncome + benefits * 0.5;
    if (provisional <= lower) return 0;
    if (provisional <= upper) return Math.min(benefits * 0.5, (provisional - lower) * 0.5);
    return Math.min(benefits * 0.85, (provisional - upper) * 0.85 + Math.min(base, benefits * 0.5));
  }
