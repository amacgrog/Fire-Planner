  // Tops the bond reserve up to bondTarget from taxable, then traditional, then
  // Roth (taxable moves carry their share of cost basis).
  function refillBondReserve(bal, bondTarget) {
    const bondDeficit = Math.max(0, bondTarget - (bal.bondTaxable + bal.bondTraditional + bal.bondRoth));
    if (bondDeficit <= 0) return;
    const fromTaxable = Math.min(bal.taxable, bondDeficit),
      basisPortion = bal.taxable ? bal.taxableBasis * (fromTaxable / bal.taxable) : 0;
    bal.taxable -= fromTaxable;
    bal.taxableBasis -= basisPortion;
    bal.bondTaxable += fromTaxable;
    bal.bondTaxableBasis += basisPortion;
    let remaining = bondDeficit - fromTaxable;
    if (remaining > 0) {
      const fromTrad = Math.min(bal.traditional, remaining);
      bal.traditional -= fromTrad;
      bal.bondTraditional += fromTrad;
      remaining -= fromTrad;
    }
    if (remaining > 0) {
      const fromRoth = Math.min(bal.roth, remaining);
      bal.roth -= fromRoth;
      bal.bondRoth += fromRoth;
    }
  }
