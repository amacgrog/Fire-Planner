import { state } from '../store.js';
import { compact } from '../format/numbers.js';
import { displayValue } from '../format/charts.js';
import { simulate } from '../projection/simulate.js';

  // Retirement-number multiplier for the safe withdrawal rate (4% -> 25x).
  export function fiMultiple() {
    return 100 / Math.max(0.5, Number(state.fiWithdrawalRate) || 4);
  }
  // "Explore a question" menu: a handful of pre-wired comparisons over
  // logic that already exists elsewhere (simulate()'s retireAgeA/B override
  // params, and the mutate/simulate/restore idiom SENSITIVITY_LEVERS uses),
  // presented as a plain-language answer instead of another chart to
  // interpret. `compare` questions render a small table + takeaway sentence
  // into #decisionAnswer; `open` questions just scroll to and open an
  // existing card. Keep this list short and additive — each entry should
  // reuse a comparison the app already knows how to run, not invent new
  // modeling.
  export function decisionEndAssets(sim) {
    const r = sim.rows.at(-1);
    return displayValue(r.total, r.year);
  }
  function decisionDepletionLabel(sim) {
    return sim.depletedAge ? `age ${sim.depletedAge}` : 'the end of the plan';
  }
  export function decisionDeltaPhrase(fromSim, toSim) {
    const fromEnd = decisionEndAssets(fromSim),
      toEnd = decisionEndAssets(toSim),
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
  // are reported whenever any of them helps, because they're a specific,
  // non-obvious diagnosis. Only when none of them help does it fall back to
  // the generic levers everyone always has (spending, retirement timing) —
  // for those it searches for the smallest magnitude of change that actually
  // resolves the shortfall (rather than testing one arbitrary fixed amount),
  // so the person can judge whether the "fix" is a minor tweak or a major
  // compromise, which is the real judgment call for someone genuinely
  // deciding between working longer and spending less.
  export function findMinimalSpendingCut(selected) {
    if (!(state.spending > 0)) return null;
    const saved = state.spending;
    let resolvedAt = null;
    for (let cutPct = 5; cutPct <= 90; cutPct += 5) {
      state.spending = saved * (1 - cutPct / 100);
      const r = simulate();
      if (!r.depletedAge) {
        resolvedAt = { cutPct, result: r };
        break;
      }
    }
    if (resolvedAt) {
      state.spending = saved;
      return {
        label: 'household spending',
        detail: `cutting household spending by ${resolvedAt.cutPct}%`,
        result: resolvedAt.result,
        magnitude: resolvedAt.cutPct / 90,
        resolved: true,
      };
    }
    state.spending = saved * 0.1; // largest tested cut: 90%
    const r90 = simulate();
    state.spending = saved;
    const improvement = r90.depletedAge ? r90.depletedAge - selected.depletedAge : 0;
    if (improvement <= 0) return null;
    return {
      label: 'household spending',
      detail: 'even a 90% cut to household spending',
      result: r90,
      improvement,
      magnitude: 1,
      resolved: false,
    };
  }
  export function findMinimalRetirementDelay(selected) {
    const secondAge = (yrs) => (state.singlePerson ? state.retireAgeB : state.retireAgeB + yrs);
    for (let yrs = 1; yrs <= 15; yrs++) {
      const r = simulate(state.retireAgeA + yrs, secondAge(yrs));
      if (!r.depletedAge) {
        return {
          label: 'retirement timing',
          detail: `retiring ${yrs} year${yrs === 1 ? '' : 's'} later`,
          result: r,
          magnitude: yrs / 15,
          resolved: true,
        };
      }
    }
    const r15 = simulate(state.retireAgeA + 15, secondAge(15));
    const improvement = r15.depletedAge ? r15.depletedAge - selected.depletedAge : 0;
    if (improvement <= 0) return null;
    return {
      label: 'retirement timing',
      detail: 'even retiring 15 years later',
      result: r15,
      improvement,
      magnitude: 1,
      resolved: false,
    };
  }
