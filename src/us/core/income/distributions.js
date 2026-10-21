import { currentYear } from '../tax-year.js';
import { state } from '../../../shared/core/store.js';

  // SECURE 2.0: RMDs begin at 75 for people born in 1960 or later, and at 73 for
  // those born 1951-1959. Birth year is estimated from today's age (the planner
  // only collects age), so `currentYear` (from `core/tax-year.js`) is a live binding tests can pin.
  export function rmdStartAge(currentAge) {
    return currentYear - Math.round(currentAge) >= 1960 ? 75 : 73;
  }
  export function rmdDivisor(age) {
    const table = {
      72: 27.4,
      73: 26.5,
      74: 25.5,
      75: 24.6,
      76: 23.7,
      77: 22.9,
      78: 22.0,
      79: 21.1,
      80: 20.2,
      81: 19.4,
      82: 18.5,
      83: 17.7,
      84: 16.8,
      85: 16.0,
      86: 15.2,
      87: 14.4,
      88: 13.7,
      89: 12.9,
      90: 12.2,
      91: 11.5,
      92: 10.8,
      93: 10.1,
      94: 9.5,
      95: 8.9,
      96: 8.4,
      97: 7.8,
      98: 7.3,
      99: 6.8,
      100: 6.4,
    };
    return table[age] || Math.max(2.0, 6.4 - (age - 100) * 0.2);
  }
  // IRS Single Life Expectancy Table (Pub. 590-B, effective for distribution
  // calendar years beginning 2022+) — used only for the 72(t) SEPP "RMD
  // method" mandatory distribution below, not for actual RMDs (which use the
  // Uniform Lifetime Table via rmdDivisor() above; the two tables are
  // intentionally different and don't need to line up at any shared age).
  function singleLifeDivisor(age) {
    const table = {
      18: 67.0, 19: 66.0, 20: 65.0, 21: 64.1, 22: 63.1, 23: 62.1, 24: 61.1, 25: 60.2,
      26: 59.2, 27: 58.2, 28: 57.3, 29: 56.3, 30: 55.3, 31: 54.4, 32: 53.4, 33: 52.5,
      34: 51.5, 35: 50.5, 36: 49.6, 37: 48.6, 38: 47.7, 39: 46.7, 40: 45.7, 41: 44.8,
      42: 43.8, 43: 42.9, 44: 41.9, 45: 41.0, 46: 40.0, 47: 39.0, 48: 38.1, 49: 37.1,
      50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6, 56: 30.6, 57: 29.8,
      58: 28.9, 59: 28.0, 60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5, 64: 23.7, 65: 22.9,
    };
    const clamped = Math.max(18, Math.min(65, Math.round(age)));
    return table[clamped];
  }
  // E1e: the full Single Life Table (Treas. Reg. 1.401(a)(9)-9(b), distribution calendar years from 2022), ages 0-120: an
  // inherited account's yearly RMD divisor (spec 6.2). singleLifeDivisor above (72(t), 18-65) is unchanged.
  const SINGLE_LIFE_TABLE = [
    84.6, 83.7, 82.8, 81.8, 80.8, 79.8, 78.8, 77.9, 76.9, 75.9, 74.9, 73.9, 72.9, 71.9, 70.9, 69.9, 69.0, 68.0,
    67.0, 66.0, 65.0, 64.1, 63.1, 62.1, 61.1, 60.2, 59.2, 58.2, 57.3, 56.3, 55.3, 54.4, 53.4, 52.5, 51.5, 50.5,
    49.6, 48.6, 47.7, 46.7, 45.7, 44.8, 43.8, 42.9, 41.9, 41.0, 40.0, 39.0, 38.1, 37.1, 36.2, 35.3, 34.3, 33.4,
    32.5, 31.6, 30.6, 29.8, 28.9, 28.0, 27.1, 26.2, 25.4, 24.5, 23.7, 22.9, 22.0, 21.2, 20.4, 19.6, 18.8, 18.0,
    17.2, 16.4, 15.6, 14.8, 14.1, 13.3, 12.6, 11.9, 11.2, 10.5, 9.9, 9.3, 8.7, 8.1, 7.6, 7.1, 6.6, 6.1,
    5.7, 5.3, 4.9, 4.6, 4.3, 4.0, 3.7, 3.4, 3.2, 3.0, 2.8, 2.6, 2.5, 2.3, 2.2, 2.1, 2.1, 2.1,
    2.0, 2.0, 2.0, 2.0, 2.0, 1.9, 1.9, 1.8, 1.8, 1.6, 1.4, 1.1, 1.0,
  ];
  export function singleLifeFactor(age) {
    const a = Math.round(age);
    return a >= 120 ? 1.0 : a <= 0 ? SINGLE_LIFE_TABLE[0] : SINGLE_LIFE_TABLE[a];
  }
  // Mandatory traditional distributions for the year: each partner's RMD plus
  // any elected 72(t) SEPP payment, both taxed as ordinary income and
  // force-withdrawn from the pooled traditional balance. rmdA/rmdB include the
  // SEPP amount; sepp72A/B are returned separately only for display.
  // 72(t) SEPP elections, one per traditional account in ACCOUNT_SLOTS order (IRA A, 401(k) A,
  // IRA B, 401(k) B): the election flag, its first-payment age field, and the owner.
  export const SEPP_SLOTS = [
    { on: 'sepp72tIraA', from: 'sepp72tIraAgeA', partner: 0 },
    { on: 'sepp72tK401A', from: 'sepp72tK401AgeA', partner: 0 },
    { on: 'sepp72tIraB', from: 'sepp72tIraAgeB', partner: 1 },
    { on: 'sepp72tK401B', from: 'sepp72tK401AgeB', partner: 1 },
  ];
  // The accounts currently elected for 72(t) (Partner B's only for a couple).
  export function seppElections() {
    return SEPP_SLOTS.filter((sl) => state[sl.on] && !(sl.partner === 1 && state.singlePerson));
  }
  export function requiredDistributions({
    traditional,
    bondTraditional,
    age,
    ageB,
    singlePerson,
    isSurvivorPeriod,
    deceasedIsA,
    ownerShareA,
    workingA,
    workingB,
    retireAgeA,
    retireAgeB,
    accountDollars,
  }) {
    const traditionalBeforeRmd = traditional + bondTraditional,
      // Each partner's own share of the pooled traditional balance, per
      // the account ledger (ownerShareA above: Partner A's current share of
      // the pool, which moves with contributions, conversions and each
      // partner's own RMDs) — used for RMDs, 72(t) SEPP sizing, and the
      // early-withdrawal-penalty fraction below. During survivor period
      // or single-person mode, whichever partner remains is treated as
      // owning the whole pooled balance (the split only matters while
      // both partners are alive and the balance is genuinely shared).
      traditionalShareA =
        singlePerson || isSurvivorPeriod ? traditionalBeforeRmd : traditionalBeforeRmd * ownerShareA,
      traditionalShareB =
        singlePerson || isSurvivorPeriod
          ? traditionalBeforeRmd
          : traditionalBeforeRmd * (1 - ownerShareA);
    let rmdA = age >= rmdStartAge(state.ageA) ? traditionalShareA / rmdDivisor(age) : 0,
      rmdB =
        !singlePerson && ageB >= rmdStartAge(state.ageB)
          ? traditionalShareB / rmdDivisor(ageB)
          : 0;
    // 72(t) SEPP (IRC 72(t)(2)(A)(iv), Notice 2022-6 RMD method), elected per account: a mandatory,
    // penalty-free payment of that account's balance at the start of the year (accountDollars, before
    // growth) over the Single Life Table factor for the owner's age that year, recomputed every year.
    // It starts at the first-payment age (the owner's retirement age when blank, and never before it)
    // and runs through the later of 5 years or age 59.5. A start at 59.5 or later has no penalty to
    // avoid, so the election does nothing. The amount is folded into rmdA/rmdB so it is taxed and
    // force-withdrawn like an RMD (ordinary income); sepp72A/B are kept separately for display.
    // `seppActive` marks the accounts under a running plan: they supply exactly their payment, so
    // discretionary draws and Roth conversions must leave them alone (`seppLocked` is what is left in them).
    const seppSlots = [0, 0, 0, 0],
      seppActive = [false, false, false, false];
    let seppLocked = 0;
    const deadPartner = isSurvivorPeriod ? (deceasedIsA ? 0 : 1) : -1;
    SEPP_SLOTS.forEach((sl, i) => {
      const p = sl.partner;
      if (!state[sl.on] || p === deadPartner) return;
      const [ownerAge, working, retire] = p === 0 ? [age, workingA, retireAgeA] : [ageB, workingB, retireAgeB],
        entered = Number(state[sl.from]) || 0,
        start = Math.max(retire, entered > 0 ? entered : retire),
        end = Math.max(start + 5, 59.5);
      if (working || start >= 59.5 || ownerAge < start || ownerAge >= end) return;
      seppSlots[i] = accountDollars[i] / singleLifeDivisor(ownerAge);
      seppActive[i] = true;
      seppLocked += accountDollars[i] - seppSlots[i];
    });
    let sepp72A = seppSlots[0] + seppSlots[1],
      sepp72B = seppSlots[2] + seppSlots[3];
    if (isSurvivorPeriod) {
      if (deceasedIsA) {
        rmdA = 0;
        sepp72A = 0;
      } else {
        rmdB = 0;
        sepp72B = 0;
      }
    }
    rmdA += sepp72A;
    rmdB += sepp72B;
    const rmd = Math.min(traditionalBeforeRmd, rmdA + rmdB);
    return { traditionalBeforeRmd, rmdA, rmdB, rmd, sepp72A, sepp72B, seppSlots, seppActive, seppLocked };
  }
