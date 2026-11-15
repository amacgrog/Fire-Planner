// Decision helpers: the FI multiple and the end-assets phrase the unusual-assumption warnings use

import { compact } from '../format/numbers.js';
import { displayValueOf } from '../format/display-value.js';

  // Retirement-number multiplier for the safe withdrawal rate (4% -> 25x).
  export function fiMultiple(inputs) {
    return 100 / Math.max(0.5, Number(inputs.fiWithdrawalRate) || 4);
  }
  // The display conversion takes the inputs whose inflation deflates the figure and the display mode, both explicit.
  export function decisionEndAssets(sim, inputs, displayMode) {
    const r = sim.rows.at(-1);
    return displayValueOf(displayMode, inputs.inflation, r.total, r.year, r.cumFactor);
  }
  function decisionDepletionLabel(sim) {
    return sim.depletedAge ? `age ${sim.depletedAge}` : 'the end of the plan';
  }
  export function decisionDeltaPhrase(fromSim, toSim, inputs, displayMode) {
    const fromEnd = decisionEndAssets(fromSim, inputs, displayMode),
      toEnd = decisionEndAssets(toSim, inputs, displayMode),
      delta = toEnd - fromEnd,
      // Once a plan is fully depleted, "end assets" is $0 either way — the
      // real story is the depletion age, not a meaningless $0 delta.
      assetsPart =
        fromEnd <= 1 && toEnd <= 1
          ? 'still depletes the portfolio either way'
          : `${delta >= 0 ? 'adds' : 'costs'} ${compact(Math.abs(delta))} in end assets`;
    if (fromSim.depletedAge === toSim.depletedAge) return assetsPart;
    return `${assetsPart} and moves your depletion point from ${decisionDepletionLabel(fromSim)} to ${decisionDepletionLabel(toSim)}`;
  }
