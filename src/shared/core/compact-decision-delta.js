import { decisionDepletionLabel, decisionEndAssets } from './decision-end-assets.js';
import { compact } from './money-format.js';

  // button, so the likely answer is visible at a glance without clicking
  // in first — e.g. "3 yrs earlier → 3 yrs later: +$240k · lasts to age 98".
  // Deliberately reuses the two most extreme rows a compare-question's
  // run() already returns (rows[0]/rows.at(-1) — for a 2-row question
  // that's just both rows, for a 3-row question like retireTiming
  // it's the two endpoints, skipping the middle "current" row) rather than
  // introducing a second, separate metric: the full comparison table
  // behind the click uses the same decisionEndAssets()/depletedAge data,
  // so the preview and the detail it expands into never disagree with each
  // other. Doesn't use a success-rate delta (the "+6pts" a UX suggestion
  // proposed) on purpose — that would need a historical backtest per
  // question, and the whole reason the Plan Status Bar's own backtest is
  // debounced (see CLAUDE.md) is that it's too expensive to run this
  // casually; end-assets + depletion age are already computed as part of
  // run()'s normal simulate() calls, so this preview costs nothing extra.
  export function compactDecisionDelta(rows) {
    const left = rows[0],
      right = rows[rows.length - 1],
      fromEnd = decisionEndAssets(left.sim),
      toEnd = decisionEndAssets(right.sim),
      delta = toEnd - fromEnd,
      dollarPart =
        fromEnd <= 1 && toEnd <= 1
          ? 'depletes either way'
          : `${delta >= 0 ? '+' : '-'}${compact(Math.abs(delta))} end assets`,
      lastsPart =
        left.sim.depletedAge === right.sim.depletedAge
          ? ''
          : ` · lasts to ${decisionDepletionLabel(right.sim)}`,
      // Strip only the "(current)" annotation some labels carry — unlike a
      // substantive parenthetical (e.g. a conversion ladder's age window), that
      // tag is just noise once shown as A → B on a button.
      stripCurrent = (s) => s.replace(/\s*\(current\)\s*$/, '').trim();
    return `${stripCurrent(left.label)} → ${stripCurrent(right.label)}: ${dollarPart}${lastsPart}`;
  }
