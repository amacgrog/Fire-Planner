  // What the balances are worth after the taxes still owed on them: traditional at (1 - lambda), embedded
  // taxable gains at tauGain, Roth, cash, bond principal and home equity at face value.
  export function afterTaxValue(bal, lambda, tauGain) {
    const gain = Math.max(0, bal.taxable - bal.taxableBasis) + Math.max(0, bal.bondTaxable - bal.bondTaxableBasis);
    let v = bal.taxable + bal.bondTaxable - gain * tauGain + (bal.traditional + bal.bondTraditional) * (1 - lambda) + bal.roth + bal.bondRoth + bal.cash + bal.home;
    // E1e: the open inherited accounts (appended, and only when there are any: a legacy score is the same double).
    if (bal.inheritedTrad + bal.inheritedRoth > 0) v += bal.inheritedTrad * (1 - lambda) + bal.inheritedRoth;
    return v;
  }
  // MAGI room left under this year's target for MAGI-bearing draws (the conversion and any ladder gain
  // are already inside traditionalGross / taxableGainGross when the withdrawal starts).
  export function magiCapLeft(wd) {
    const c = wd.magiCap;
    return !c || c.off ? Infinity : Math.max(0, c.limit - wd.traditionalGross - wd.taxableGainGross);
  }
