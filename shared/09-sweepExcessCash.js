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
  // before retirement so the full ladderTarget is reached by rotationEndYear,
  // moving half of each year's target from taxable and half from traditional
  // into their bond-reserve buckets (the taxable move carries its share of
  // cost basis).
  function rotateIntoBondLadder(bal, { year, ladderTarget, rotationStartYear, rotationEndYear }) {
    if (year < rotationStartYear || year > rotationEndYear) return;
    const windowLen = rotationEndYear - rotationStartYear + 1,
      progress = windowLen > 0 ? (year - rotationStartYear + 1) / windowLen : 1;
    const target = ladderTarget * progress,
      halfTarget = target / 2;
    const taxableMove = Math.min(bal.taxable, Math.max(0, halfTarget - bal.bondTaxable)),
      movedBasis = bal.taxable ? bal.taxableBasis * (taxableMove / bal.taxable) : 0;
    bal.taxable -= taxableMove;
    bal.taxableBasis -= movedBasis;
    bal.bondTaxable += taxableMove;
    bal.bondTaxableBasis += movedBasis;
    const traditionalMove = Math.min(bal.traditional, Math.max(0, halfTarget - bal.bondTraditional));
    bal.traditional -= traditionalMove;
    bal.bondTraditional += traditionalMove;
  }
