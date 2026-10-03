  let histTaxFactors = null;
  function taxIndexFactor(yearIndex) {
    if (histTaxFactors) {
      const f = histTaxFactors[Math.floor(yearIndex)];
      if (f !== undefined) return f;
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
