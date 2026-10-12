  // The plan's own factor for a whole year index, remembered while state.inflation is the value it was computed
  // for (Math.pow was a visible share of a projection: every tax call asks for it). The key is the full input
  // (inflation, year index), so nothing is ever cleared and the value is the very double the pow returns.
  let taxFactorInflation = NaN;
  function taxIndexFactor(yearIndex) {
    if (histTaxFactors) {
      const f = histTaxFactors[Math.floor(yearIndex)];
      if (f !== undefined) return f;
    }
    if (yearIndex >= 0 && yearIndex < 256 && yearIndex === Math.floor(yearIndex)) {
      if (state.inflation !== taxFactorInflation) {
        taxFactorInflation = state.inflation;
        taxFactorByYear.length = 0;
      }
      let v = taxFactorByYear[yearIndex];
      if (v === undefined) v = taxFactorByYear[yearIndex] = Math.pow(1 + pct(state.inflation), yearIndex);
      return v;
    }
    return Math.pow(1 + pct(state.inflation), yearIndex);
  }
