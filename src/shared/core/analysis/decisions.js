import { state } from '../store.js';

  // Retirement-number multiplier for the safe withdrawal rate (4% -> 25x).
  export function fiMultiple() {
    return 100 / Math.max(0.5, Number(state.fiWithdrawalRate) || 4);
  }
