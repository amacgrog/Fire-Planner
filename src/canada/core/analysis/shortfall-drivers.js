// Finds which Canada inputs drive a projected shortfall, by what-if re-runs

import { findMinimalRetirementDelay, findMinimalSpendingCut } from '../../../shared/core/analysis/decisions.js';
import { simulate } from '../../../shared/core/projection/simulate.js';
import { state } from '../../../shared/core/store.js';

  // "What's driving this" shortfall analysis: when the selected projection
  // shows a depletion age, first tests "structural" single-lever changes tied
  // to a specific input (LTC off, healthcare premiums off) by temporarily
  // mutating state and re-running simulate(), then restoring state exactly —
  // same mutate/simulate/restore pattern as simulateAtRealCagr().
  export function analyzeShortfallDrivers(selected) {
    if (!selected.depletedAge) return null;
    const structuralCandidates = [];
    if (state.ltcEnabled) {
      structuralCandidates.push({
        label: 'long-term care costs',
        detail: 'modeling no long-term care costs at all',
        run: () => {
          const saved = state.ltcEnabled;
          state.ltcEnabled = false;
          const r = simulate();
          state.ltcEnabled = saved;
          return r;
        },
      });
    }
    if (state.healthcare > 0) {
      structuralCandidates.push({
        label: 'post-retirement extra health/dental insurance',
        detail: 'zeroing out the post-retirement extra health/dental insurance cost',
        run: () => {
          const saved = state.healthcare;
          state.healthcare = 0;
          const r = simulate();
          state.healthcare = saved;
          return r;
        },
      });
    }
    let bestStructural = null;
    for (const c of structuralCandidates) {
      const r = c.run();
      const improvement = r.depletedAge ? r.depletedAge - selected.depletedAge : 999;
      if (improvement <= 0) continue;
      if (!bestStructural || improvement > bestStructural.improvement) {
        bestStructural = { label: c.label, detail: c.detail, improvement, result: r, kind: 'structural' };
      }
    }
    if (bestStructural) return bestStructural;

    // No single cost assumption explains it — fall back to the two levers
    // everyone always has, and report the smaller of the two "asks".
    const genericCandidates = [findMinimalSpendingCut(selected), findMinimalRetirementDelay(selected)].filter(
      Boolean,
    );
    if (!genericCandidates.length) return null;
    const resolved = genericCandidates.filter((c) => c.resolved);
    const pool = resolved.length ? resolved : genericCandidates;
    let best = pool[0];
    for (const c of pool.slice(1)) {
      const better = resolved.length
        ? c.magnitude < best.magnitude
        : (c.improvement ?? 0) > (best.improvement ?? 0);
      if (better) best = c;
    }
    return { ...best, kind: 'generic' };
  }
