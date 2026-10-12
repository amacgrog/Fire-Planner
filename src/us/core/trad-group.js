  // The accounts of the traditional pool that are penalty-free (or penalized) this year for a
  // discretionary draw, and their share of the pool.
  export function tradGroup(wd, penalized) {
    const slots = [0, 1, 2, 3].filter(
      (i) => !wd.seppActive[i] && wd.status[i].free === !penalized && (wd.onlyPartner < 0 || (i < 2 ? 0 : 1) === wd.onlyPartner),
    );
    return { slots, share: slots.reduce((sum, i) => sum + wd.accts.trad[i], 0) };
  }
  // True when some account holding money would owe the 10% on a discretionary draw: a penalized
  // traditional account, or a Roth account whose owner is neither 59.5+ nor covered by Rule of 55.
  // While it is true the withdrawal order protects the penalty-free money (see withdrawStandard).
  export function hasPenalizedMoney(wd) {
    const { bal, accts, status } = wd;
    if (bal.traditional + bal.bondTraditional > 0 && tradGroup(wd, true).share > 0) return true;
    return bal.roth + bal.bondRoth > 0 && [0, 1, 2, 3].some((i) => !status[i].free && accts.roth[i] > 0);
  }
  // Gross room per Roth account for a penalty-free draw from `bucket`: an account whose owner is
  // free (59.5+, inherited, or a 401(k) under Rule of 55) all of it; an early Roth IRA only its
  // basis (contributions and seasoned conversions); an early Roth 401(k) none (every draw is
  // partly earnings).
  export function rothFreeCaps(wd, bucket) {
    const { bal, accts, status, rothAccts } = wd,
      pool = bal.roth + bal.bondRoth;
    return accts.roth.map((sh, i) => {
      const dollars = sh * pool;
      if (!(dollars > 0)) return 0;
      const frac = status[i].free ? 1 : i % 2 === 1 ? 0 : Math.min(Math.max(0, rothAccts[i].basis), dollars) / dollars;
      return sh * bal[bucket] * frac;
    });
  }
