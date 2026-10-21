import { clamp, pct } from '../format/numbers.js';
import { state } from '../store.js';
import { histTaxFactors } from '../tax-factors.js';

  // Real calendar year for row.year === 0 ("now"), used only to label the
  // chart x-axis in 'year' mode — computed once from the device clock
  // rather than hardcoded, unlike the "2026 dollars" real-dollar-mode
  // label elsewhere, since a chart axis that's visibly wrong past this
  // year would be a lot more obviously broken than a dollar-mode label.
  export const CURRENT_YEAR = new Date().getFullYear();
  const taxFactorByYear = [];
  // Healthcare and long-term-care costs grow faster than general
  // inflation. state.medicalInflation is the extra growth, in percentage
  // points above CPI, applied on top of the engine's own CPI factor to the
  // post-retirement healthcare premium, Medicare, LTC and pre-retirement
  // health premiums. It is a steady relative premium over CPI even inside the
  // historical backtest/Monte Carlo (where CPI itself follows the path).
  export function medicalGrowth(year) {
    return Math.pow(1 + pct(state.medicalInflation), year);
  }
  export function getBondYears() {
    const v = Number(state.bondYears);
    return Number.isFinite(v) ? clamp(v, 0, 15) : 5;
  }
  // US: Tax-parameter indexing. Brackets, deductions, FPL, IRMAA tiers and the
  // FICA wage base all index by this factor. In the deterministic projection
  // it is the steady state.inflation compounded by yearIndex; inside
  // simulateHistorical() (backtest and Monte Carlo) it is the path's own
  // cumulative CPI, so a 1970s-style inflation sequence raises the brackets
  // along with spending instead of leaving them on a 2.5% schedule.
  // Canada: Tax-parameter indexing. Brackets, credits, the OAS clawback threshold and
  // CPP contribution limits all index by this factor. In the deterministic
  // projection it is the steady state.inflation compounded by yearIndex;
  // inside simulateHistorical() (backtest and Monte Carlo) it is the path's
  // own cumulative CPI, so a 1970s-style inflation sequence raises the
  // brackets along with spending instead of leaving them on a 2.5% schedule.
  // The plan's own factor for a whole year index, remembered while state.inflation is the value it was computed
  // for (Math.pow was a visible share of a projection: every tax call asks for it). The key is the full input
  // (inflation, year index), so nothing is ever cleared and the value is the very double the pow returns.
  let taxFactorInflation = NaN;
  export function taxIndexFactor(yearIndex) {
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
