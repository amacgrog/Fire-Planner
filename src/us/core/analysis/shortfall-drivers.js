// Finds which US inputs drive a projected shortfall, by what-if re-runs

import { findMinimalRetirementDelay, findMinimalSpendingCut } from '../../../shared/core/analysis/decisions.js';
import { simulateWith } from '../../../shared/core/projection/runs.js';

  // "What's driving this" shortfall analysis: when the selected projection
  // shows a depletion age, first tests "structural" single-lever changes tied
  // to a specific input (LTC off, healthcare premiums off) by running a
  // shallow copy of `base` with that input changed, with the context its
  // caller's factory gives it (contextFor(variant)) — the same variant-on-a-copy
  // pattern as simulateAtRealCagr().
  export function analyzeShortfallDrivers(selected, base, contextFor) {
    if (!selected.depletedAge) return null;
    const structuralCandidates = [];
    if (base.ltcEnabled) {
      structuralCandidates.push({
        label: 'long-term care costs',
        detail: 'modeling no long-term care costs at all',
        run: () => simulateWith(contextFor({ ...base, ltcEnabled: false })),
      });
    }
    if (base.healthcare > 0) {
      structuralCandidates.push({
        label: 'post-retirement health insurance premiums',
        detail: 'zeroing out the post-retirement health insurance premium',
        run: () => simulateWith(contextFor({ ...base, healthcare: 0 })),
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
    const genericCandidates = [
      findMinimalSpendingCut(selected, base, contextFor),
      findMinimalRetirementDelay(selected, base, contextFor),
    ].filter(
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
