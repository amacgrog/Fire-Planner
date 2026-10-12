  // Cash above the reserve target is invested in the taxable account (at full
  // cost basis, since it was already-taxed cash).
  export function sweepExcessCash(bal, reserveTarget) {
    if (bal.cash <= reserveTarget) return;
    const moved = bal.cash - reserveTarget;
    bal.taxable += moved;
    bal.taxableBasis += moved;
    bal.cash = reserveTarget;
  }
