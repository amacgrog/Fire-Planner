import { decisionDeltaPhrase } from './decision-end-assets.js';
import { simulate } from './monte-carlo-paths-2.js';
import { state } from './store.js';
import { ESTIMATE_ALWAYS_IDS, ESTIMATE_GATED_GROUPS } from '#country/core/seam';

  export function isEstimateCountable(id) {
    if (ESTIMATE_ALWAYS_IDS.includes(id)) return true;
    const group = ESTIMATE_GATED_GROUPS.find((g) => g.ids.includes(id));
    return !!group && group.gate();
  }
  // Quantifies the impact of one flagged assumption by comparing the
  // current simulation against the same simulation with just that one
  // field nudged back to the nearer edge of its realistic range — the same
  // mutate/simulate/restore idiom SENSITIVITY_LEVERS uses, reusing the
  // "Explore a question" comparison helpers (decisionDeltaPhrase already
  // handles the depleted-portfolio/depletion-age wording) rather than
  // inventing a second delta phrasing.
  export function unusualAssumptionImpact(item, currentSim) {
    const saved = state[item.id];
    state[item.id] = saved < item.min ? item.min : item.max;
    const typicalSim = simulate();
    state[item.id] = saved;
    return decisionDeltaPhrase(currentSim, typicalSim);
  }
