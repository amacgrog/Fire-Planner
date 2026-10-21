import { state } from '../../../shared/core/store.js';
import { rmdDivisor, rmdStartAge, singleLifeDivisor } from '../niit-and-rmd.js';

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
