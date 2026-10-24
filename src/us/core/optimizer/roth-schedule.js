// US Roth bracket search: the per-year candidates, the window cap, the pass cap and the flat-bracket card's pick

import { pickBest } from '../../../shared/core/analysis/objectives.js';
import { notWorseThan } from './objectives.js';

  // Per-year multi-lever optimizer -------------------------------------
  // Extends the flat optimizer above (one bracket applied every year of
  // the ladder window) with three independently toggleable levers, each
  // off by default so the optimizer never changes anything you haven't
  // explicitly asked it to search over:
  //   - Roth conversion ladder: per-year bracket-fill target (as before).
  //   - Optimized withdrawal mix: per-year taxable/traditional/Roth split
  //     (see ctx.overrides.withdrawalMixByAge/WITHDRAWAL_MIX_CANDIDATES above).
  //     Unlike the Roth ladder (creates new discretionary income) this is
  //     about how to fund a spending need that's already mandatory that
  //     year, so it doesn't share the Roth ladder's MAGI-room gating —
  //     the tax and healthcare a MAGI-driven ACA cliff/IRMAA tier costs is
  //     already priced by the objective the search is given
  //     (src/us/core/optimizer/objectives.js).
  //   - Smoothed withdrawals: state.smoothWithdrawals is a single
  //     household-wide toggle, not a per-year choice, so "optimizing" it
  //     just means trying the whole search once with it forced on and
  //     once forced off and keeping whichever wins — it doesn't add a
  //     per-year coordinate, just a 2x outer loop. Kept alongside the mix
  //     lever (not replaced by it) as a fast, easy-to-reason-about
  //     baseline — see docs/reference.md.
  // The Roth lever searches its own configured rothConvStartAge/EndAge
  // window. The mix lever has no configurable window: a retiree funds
  // spending every year of retirement, not just during a conversion
  // ladder, so it automatically spans retirement through life expectancy
  // (capped at ROTH_PER_YEAR_MAX_WINDOW like the Roth lever).
  // See docs/reference.md for the full design writeup: why coordinate
  // ascent with structured multi-starts (not a general-purpose
  // metaheuristic) is the right algorithm for this problem shape, why it
  // provably terminates, and the performance budget these constants were
  // chosen against.
  export const ROTH_PER_YEAR_CANDIDATES = [0, 10, 12, 22, 24, 32, 35];
  export const ROTH_PER_YEAR_MAX_WINDOW = 30; // years — safety rail, not a realistic ladder length
  export const ROTH_PER_YEAR_MAX_PASSES = 5;

  // The flat-bracket card's pick. results: [{ bracket, depletedAge, score }] (score: the after-tax end value, nominal).
  // The brackets that pass the guardrail against the current plan (all of them when none passes), then pickBest: the latest
  // depletion, the highest score with a $1 tie; among the tied, the current bracket, else the lowest bracket.
  export function pickFlatBracket(results, selectedDepletedAge, currentBracket) {
    const pool = results.filter((r) => notWorseThan(selectedDepletedAge, r.depletedAge));
    return pickBest(pool.length ? pool : results, (tied) =>
      tied.find((r) => r.bracket === currentBracket) || tied.reduce((a, b) => (b.bracket < a.bracket ? b : a)),
    );
  }
