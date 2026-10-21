import { state } from '../../../shared/core/store.js';
import { filingKey, SS_BASE } from '../tax/federal-rules.js';
import { taxableSsOnRow, taxableSocialSecurity } from '../tax/social-security-tax.js';
import { taxIndexFactor } from '../../../shared/core/projection/year-factors.js';

  // E3 (spec 5.2): the IRMAA appeal events of a run, per person, by first post-event year E (the year after the last
  // working year, or the death year): 0 none, 1 the end of a W-2 or self-employed stream, 2 a main-job retirement, 3 a
  // married spouse's death; the highest kind on a tie. An event covers its owner, and the owner's spouse when the couple is
  // married in year E (a death covers only the survivor); it is kept for a covered person alive in year E and 65 or over by
  // year E+1. Null when no event is kept (the default household, retiring at 55, allocates nothing).
  export function irmaaAppealTable({ singlePerson, retireAgeA, retireAgeB, deathYear, deceasedIsA, deceasedIsB, projectionYears }) {
    const married = (y) => !singlePerson && (state.marryLater ? state.ageA + y >= state.marriageAgeA : state.filingStatus === 'mfj');
    let eventA = null,
      eventB = null;
    const put = (b, E, kind) => {
      if ((b ? deceasedIsB : deceasedIsA) && E >= deathYear) return; // dead in year E
      if ((b ? state.ageB : state.ageA) + E + 1 < 65) return; // cannot be on Medicare by E+1
      if (eventA === null) {
        eventA = new Int8Array(projectionYears + 1);
        eventB = new Int8Array(projectionYears + 1);
      }
      const ev = b ? eventB : eventA;
      if (kind > ev[E]) ev[E] = kind;
    };
    const cover = (b, E, kind) => {
      put(b, E, kind);
      if (married(E)) put(!b, E, kind);
    };
    const eA = retireAgeA - state.ageA;
    if (state.incomeA > 0 && eA >= 1 && eA <= projectionYears) cover(false, eA, 2);
    if (!singlePerson) {
      const eB = retireAgeB - state.ageB;
      if (state.incomeB > 0 && eB >= 1 && eB <= projectionYears) cover(true, eB, 2);
    }
    for (const s of state.incomeSources) {
      if ((s.kind !== 'wages' && s.kind !== 'self') || !(s.amount > 0) || !(s.startAge <= s.endAge)) continue;
      const b = !singlePerson && s.owner === 'B',
        E = s.endAge + 1 - (b ? state.ageB : state.ageA);
      if (E < 1 || E > projectionYears) continue;
      if ((b ? deceasedIsB : deceasedIsA) && E >= deathYear) continue; // ended by its owner's death: the death event
      cover(b, E, 1);
    }
    if ((deceasedIsA || deceasedIsB) && deathYear >= 0 && deathYear <= projectionYears && married(deathYear)) put(deceasedIsA, deathYear, 3);
    return eventA === null ? null : { eventA, eventB };
  }
  // E3 (spec 5.2): partner P's appeal window in premium year `year` from P's event row: 2 when an event's E is last year
  // (last year's and this year's MAGI may replace the lookback), 1 when it is this year (this year's MAGI), else 0.
  export function irmaaAppealWindow(ev, year) {
    return year >= 1 && ev[year - 1] !== 0 ? 2 : ev[year] !== 0 ? 1 : 0;
  }
  // E3 (spec 5.2, round 1 M4): the kind of the event the chosen tax year s can cite in premium year t.
  export function irmaaAppealKind(ev, t, s) {
    return s === t - 1 ? ev[t - 1] : ev[t] !== 0 ? ev[t] : ev[t - 1];
  }
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
  // Medicare IRMAA — 2026 Part B + Part D surcharge tiers (CMS, Nov 2025),
  // applied per Medicare-enrolled partner against MAGI from two simulated
  // years prior (the household's own entries for the first two plan years, if
  // given — see irmaaLookbackMagi), as required by the actual two-year lookback rule.
  export const IRMAA_TIERS = {
    mfj: [
      [218000, 0, true],
      [274000, 95.7, true],
      [342000, 240.4, true],
      [410000, 385.0, true],
      [750000, 529.6, false],
      [Infinity, 578.0, true],
    ],
    single: [
      [109000, 0, true],
      [137000, 95.7, true],
      [171000, 240.4, true],
      [205000, 385.0, true],
      [500000, 529.6, false],
      [Infinity, 578.0, true],
    ],
  };
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
  // E3: the status cell also names an IRMAA appeal (form SSA-44) where one lowered a partner's charge (appended to the title;
  // US only, renderTable is shared).
  export const APPEAL_EVENT = ['', 'end of a job', 'retirement', "spouse's death"];
  export function irmaaTiers(filing, yearIndex) {
    const factor = taxIndexFactor(yearIndex);
    // [upper bound, monthly surcharge per enrolled partner, bound inclusive?].
    // CMS: the lower tiers read "greater than X, up to and including Y", but the
    // top tier starts AT $500,000 / $750,000 ("$500,000 or above"), so the
    // second-highest tier's bound is exclusive.
    return IRMAA_TIERS[filingKey(filing, 'irmaa')].map(([cap, amt, inclusive]) => [cap === Infinity ? Infinity : cap * factor, amt, inclusive]);
  }
  export function irmaaSurcharge(magi2yr, filing, yearIndex) {
    const tiers = irmaaTiers(filing, yearIndex);
    for (const [cap, amt, inclusive] of tiers)
      if (inclusive ? magi2yr <= cap : magi2yr < cap) return amt * 12;
    return tiers[tiers.length - 1][1] * 12;
  }
  // The highest MAGI that stays within magi0's current IRMAA tier (Infinity
  // if magi0 is already in the top tier, since there's no higher tier left
  // to protect against). An exclusive bound ("under $500,000") is one cent
  // below the bound itself.
  export function irmaaTierCeiling(magi0, filing, yearIndex) {
    const tiers = irmaaTiers(filing, yearIndex);
    for (const [cap, , inclusive] of tiers)
      if (inclusive ? magi0 <= cap : magi0 < cap) return cap === Infinity ? Infinity : inclusive ? cap : cap - 0.01;
    return Infinity;
  }
  // IRMAA is assessed on Medicare's MAGI: AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4)(A)), which counts only the
  // TAXABLE part of Social Security. The engine's MAGI is the ACA's (26 U.S.C. 36B(d)(2)(B): all of Social Security), so
  // IRMAA amounts convert with irmaaMagiOf and IRMAA lines and caps are translated into the engine's MAGI with its exact
  // inverse. `ss` and `filing` are the return's own benefit and filing status in the year the MAGI is earned (irmaaSsOf,
  // returnStatusA). magi - ss is all other income, the otherIncome taxFor passes to taxableSocialSecurity. Tax-exempt
  // interest is not modeled (no input).
  export function irmaaMagiOf(magi, ss, filing) {
    return ss > 0 ? magi - ss + taxableSocialSecurity(ss, magi - ss, filing) : magi;
  }
  // The highest engine MAGI that keeps a single-tier return's IRMAA MAGI inside the tier engine MAGI m puts it in.
  export function irmaaRoomFor(m, ss, st, year) {
    return magiForIrmaaLine(irmaaTierCeiling(irmaaMagiOf(m, ss, st), 'single', year), ss, st);
  }
