import { clamp, pct } from './basics.js';
import { state } from './store.js';

  export const taxFactorByYear = [];
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
