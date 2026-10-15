import { pct } from './basics.js';
import { simulate } from './monte-carlo-paths-2.js';
import { state } from './store.js';

  export function simulateAtRealCagr(realCagrPct) {
    const infl = pct(state.inflation),
      nominal = ((1 + realCagrPct / 100) * (1 + infl) - 1) * 100,
      saved = state.returnRate;
    state.returnRate = nominal;
    const result = simulate();
    state.returnRate = saved;
    return result;
  }
