import { state } from '../../shared/core/store.js';

  // MAGI that IRMAA is assessed on for a given plan year: the return filed two
  // years earlier. For the first two plan years that return predates the plan,
  // so use the household's own entries when provided (irmaaPriorKnown), else
  // fall back to the simulation's own earliest MAGI as a stand-in.
  export function irmaaLookbackMagi(magiHistory, year) {
    if (year < 2 && state.irmaaPriorKnown)
      return Math.max(0, Number(year === 0 ? state.irmaaMagiPrior2 : state.irmaaMagiPrior1) || 0);
    return magiHistory[Math.max(0, year - 2)] || 0;
  }
  // Two returns (an unmarried couple, or before a marry-later wedding): each partner's own MAGI. `trad` is
  // the year's discretionary traditional draw plus the conversion (split by the traditional-pool share, as
  // taxFor splits it), `gain` the realized gains (half each, as taxFor). The two sum to the household MAGI.
  export function returnMagis(profile, trad, gain, ia = 0, ib = 0) {
    const s = profile.ownerShareA === undefined ? 0.5 : profile.ownerShareA,
      inv = ((profile.invOrd || 0) + (profile.invQual || 0)) / 2;
    // E1c: each return's MAGI is net of its own 162(l) deduction (0 for everyone else).
    const m = [profile.otherA - (profile.seHealthA || 0) + profile.ssA + inv + trad * s + gain / 2, profile.otherB - (profile.seHealthB || 0) + profile.ssB + inv + trad * (1 - s) + gain / 2];
    // E1d: each owner's lump gain on their own return (appended: the sum order of the old terms is unchanged).
    if (profile.lumpOn === true) {
      m[0] += profile.lumpGainA;
      m[1] += profile.lumpGainB;
    }
    // E1e: each return's own last-resort inherited draw (never split by the ownership share).
    if (ia !== 0) m[0] += ia;
    if (ib !== 0) m[1] += ib;
    return m;
  }
  // IRMAA for a year whose lookback year (two years earlier) had two returns: each person's own MAGI from
  // that year, against the single tiers. Null when the lookback year was one return (household rule).
  // The household's own entries for the first two years are split evenly (approximation).
  export function irmaaLookbackSplit(magiHistoryA, magiHistoryB, twoReturnHistory, year) {
    const y = Math.max(0, year - 2);
    if (!twoReturnHistory[y]) return null;
    if (year < 2 && state.irmaaPriorKnown) {
      const v = Math.max(0, Number(year === 0 ? state.irmaaMagiPrior2 : state.irmaaMagiPrior1) || 0) / 2;
      return [v, v];
    }
    return [magiHistoryA[y] || 0, magiHistoryB[y] || 0];
  }
  // E3 (spec 5.1, decision 1): the filing status of the return IRMAA's lookback reads, whose tiers SSA uses (20 CFR
  // 418.1120). The lookback year's own status; for the plan's first two years year 0's stands for the earlier returns, except
  // that an entered return from a year in which a married partner (who dies in deathYear) was still alive was joint.
  export function irmaaLookbackFiling(filingHistory, year, filing, deathYear, marriedAtDeath) {
    const L = year - 2;
    if (L < 0 && state.irmaaPriorKnown && marriedAtDeath && L <= deathYear) return 'mfj';
    return filingHistory ? filingHistory[Math.max(0, L)] : filing;
  }
