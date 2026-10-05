  let histTaxFactors = null;
  // The plan's own factor for a whole year index, remembered while state.inflation is the value it was computed
  // for (Math.pow was a visible share of a projection: every tax call asks for it). The key is the full input
  // (inflation, year index), so nothing is ever cleared and the value is the very double the pow returns.
  let taxFactorInflation = NaN;
  const taxFactorByYear = [];
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
  // Healthcare and long-term-care costs grow faster than general
  // inflation. state.medicalInflation is the extra growth, in percentage
  // points above CPI, applied on top of the engine's own CPI factor to the
  // post-retirement healthcare premium, Medicare, LTC and pre-retirement
  // health premiums. It is a steady relative premium over CPI even inside the
  // historical backtest/Monte Carlo (where CPI itself follows the path).
  function medicalGrowth(year) {
    return Math.pow(1 + pct(state.medicalInflation), year);
  }
  function getBondYears() {
    const v = Number(state.bondYears);
    return Number.isFinite(v) ? clamp(v, 0, 15) : 5;
  }
