  // Cash above the reserve target is invested in the taxable account (at full
  // cost basis, since it was already-taxed cash).
  function sweepExcessCash(bal, reserveTarget) {
    if (bal.cash <= reserveTarget) return;
    const moved = bal.cash - reserveTarget;
    bal.taxable += moved;
    bal.taxableBasis += moved;
    bal.cash = reserveTarget;
  }

  // Pre-retirement bond-ladder build: ramps linearly over the years available
  // before retirement so the full ladderTarget is reached by rotationEndYear.
  // Each year it moves whatever the ramp still needs into the bond reserve:
  // traditional first, then Roth (reallocations inside a retirement account:
  // no income, no tax, no early-withdrawal penalty), then taxable brokerage
  // only as a last resort. The taxable move is a real sale (drawTaxable): the
  // tax on the realized gain is paid out of the proceeds, the new bonds are
  // bought at market (full basis), and the realized gain is returned so the
  // caller can add it to the year's gains (tax, MAGI). `conversionAmount` is
  // this year's ordinary income already in the profile (Roth conversion, US /
  // meltdown, Canada), which the gain stacks on.
  function rotateIntoBondLadder(bal, { year, ladderTarget, rotationStartYear, rotationEndYear }, profile, conversionAmount) {
    if (year < rotationStartYear || year > rotationEndYear) return 0;
    const windowLen = rotationEndYear - rotationStartYear + 1,
      progress = windowLen > 0 ? (year - rotationStartYear + 1) / windowLen : 1;
    let remaining = Math.max(0, ladderTarget * progress - (bal.bondTaxable + bal.bondTraditional + bal.bondRoth));
    const traditionalMove = Math.min(bal.traditional, remaining);
    bal.traditional -= traditionalMove;
    bal.bondTraditional += traditionalMove;
    remaining -= traditionalMove;
    if (remaining > 0) {
      const rothMove = Math.min(bal.roth, remaining);
      bal.roth -= rothMove;
      bal.bondRoth += rothMove;
      remaining -= rothMove;
    }
    if (remaining <= 0) return 0;
    const d = drawTaxable(bal.taxable, bal.taxableBasis, remaining, profile, 0, conversionAmount);
    bal.taxable -= d.taken;
    bal.taxableBasis -= d.basisTaken;
    bal.bondTaxable += d.net;
    bal.bondTaxableBasis += d.net;
    return d.gain;
  }
