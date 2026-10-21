import { simulate } from '../../shared/core/simulate.js';
import { state } from '../../shared/core/store.js';
import { optimizerState } from './optimizer-state.js';
import { ROTH_PER_YEAR_CANDIDATES, ROTH_PER_YEAR_MAX_PASSES, ROTH_PER_YEAR_MAX_WINDOW, rothScheduleCost } from './roth-per-year.js';
import { WITHDRAWAL_MIX_CANDIDATES } from './withdrawals/mix.js';

  export function optimizeMultiLever(selected, options) {
    const includeRoth = !!(options && options.includeRoth),
      includeMix = !!(options && options.includeMix),
      includeSmooth = !!(options && options.includeSmooth);
    const rothYearsFull = [];
    for (let a = state.rothConvStartAge; a <= state.rothConvEndAge; a++) rothYearsFull.push(a);
    const mixStartAge = state.singlePerson ? state.retireAgeA : Math.min(state.retireAgeA, state.retireAgeB),
      mixEndAge = state.singlePerson ? state.lifeExpectancyA : Math.max(state.lifeExpectancyA, state.lifeExpectancyB);
    const mixYearsFull = [];
    for (let a = mixStartAge; a <= mixEndAge; a++) mixYearsFull.push(a);
    const rothTruncated = includeRoth && rothYearsFull.length > ROTH_PER_YEAR_MAX_WINDOW;
    const mixTruncated = includeMix && mixYearsFull.length > ROTH_PER_YEAR_MAX_WINDOW;
    const rothYears = includeRoth ? (rothTruncated ? rothYearsFull.slice(0, ROTH_PER_YEAR_MAX_WINDOW) : rothYearsFull) : [];
    const mixYears = includeMix ? (mixTruncated ? mixYearsFull.slice(0, ROTH_PER_YEAR_MAX_WINDOW) : mixYearsFull) : [];
    // Union, sorted — used for the "nothing to optimize" check and as the
    // table's row list downstream; the two lever windows don't have to
    // coincide or even overlap.
    const activeYears = Array.from(new Set([...rothYears, ...mixYears])).sort((a, b) => a - b);
    const truncated = rothTruncated || mixTruncated;

    const savedEnabled = state.rothConvEnabled,
      savedBracket = state.rothConvBracket,
      savedSmooth = state.smoothWithdrawals,
      savedRothOverride = optimizerState.rothBracketByAge,
      savedMixOverride = optimizerState.withdrawalMixByAge;
    if (includeRoth) state.rothConvEnabled = true;
    // Guardrail reference: the plan as it's actually configured right
    // now (selected), not a recomputed baseline — same reference point
    // the flat optimizer above uses, so "doesn't deplete earlier than
    // what you have today" means the same thing in every one of these
    // optimizers.
    const notWorseThanSelected = (depletedAge) =>
      selected.depletedAge ? !depletedAge || depletedAge >= selected.depletedAge : !depletedAge;

    let evalCount = 0;
    let budgetExhausted = false;
    function evaluate(rothMap, mixMap) {
      optimizerState.rothBracketByAge = includeRoth ? rothMap : null;
      optimizerState.withdrawalMixByAge = includeMix ? mixMap : null;
      const sim = simulate();
      evalCount++;
      return { cost: rothScheduleCost(sim), depletedAge: sim.depletedAge };
    }
    function coordinateAscent(startRoth, startMix) {
      const rothMap = new Map(startRoth),
        mixMap = new Map(startMix);
      let current = evaluate(rothMap, mixMap);
      let bestOverall = {
        rothSchedule: new Map(rothMap),
        mixSchedule: new Map(mixMap),
        cost: current.cost,
        depletedAge: current.depletedAge,
      };
      // One coordinate per (lever, age) pair that's actually active this
      // run — cyclic coordinate ascent sweeps every coordinate each pass,
      // regardless of which lever it belongs to, holding both maps fixed
      // except the one entry under test.
      const coords = [];
      if (includeRoth) rothYears.forEach((age) => coords.push({ lever: 'roth', age }));
      if (includeMix) mixYears.forEach((age) => coords.push({ lever: 'mix', age }));
      for (let pass = 0; pass < ROTH_PER_YEAR_MAX_PASSES && !budgetExhausted; pass++) {
        let changedThisPass = false;
        for (const { lever, age } of coords) {
          if (budgetExhausted) break;
          const map = lever === 'roth' ? rothMap : mixMap,
            candidates = lever === 'roth' ? ROTH_PER_YEAR_CANDIDATES : WITHDRAWAL_MIX_CANDIDATES;
          const currentCandidate = map.get(age);
          let best = { candidate: currentCandidate, cost: current.cost, depletedAge: current.depletedAge };
          for (const candidate of candidates) {
            if (candidate === currentCandidate) continue;
            if (evalCount >= optimizerState.rothPerYearEvalBudget) {
              budgetExhausted = true;
              break;
            }
            const trial = new Map(map);
            trial.set(age, candidate);
            const result = lever === 'roth' ? evaluate(trial, mixMap) : evaluate(rothMap, trial);
            if (notWorseThanSelected(result.depletedAge) && result.cost < best.cost) {
              best = { candidate, cost: result.cost, depletedAge: result.depletedAge };
            }
          }
          if (best.candidate !== currentCandidate) {
            map.set(age, best.candidate);
            current = { cost: best.cost, depletedAge: best.depletedAge };
            changedThisPass = true;
            if (current.cost < bestOverall.cost) {
              bestOverall = {
                rothSchedule: new Map(rothMap),
                mixSchedule: new Map(mixMap),
                cost: current.cost,
                depletedAge: current.depletedAge,
              };
            }
          }
        }
        if (!changedThisPass) break;
      }
      return bestOverall;
    }

    // Structured multi-starts, not random — reproducible/explainable for
    // a financial-planning recommendation. Six joint starting points cover
    // the corners a cliff-driven, two-lever cost landscape can create:
    // today's actual flat-bracket Roth setting with no mix override (also
    // useful on its own — "what would the flat optimizer recommend,
    // scored on the wider objective"), nothing at all, max Roth alone,
    // and the mix lever's two natural anchors (balance-proportional, and
    // taxable-preserve-traditional) each tried alone and combined with max
    // Roth — so a year where a deliberate mix choice beats converting, or
    // vice versa, isn't missed just because the other lever's aggressive
    // start crowded out its own room on the first pass. Harmless no-ops
    // for whichever lever isn't included this run.
    const flatRoth = new Map(rothYears.map((a) => [a, savedBracket])),
      zeroRoth = new Map(rothYears.map((a) => [a, 0])),
      maxRoth = new Map(rothYears.map((a) => [a, 35])),
      zeroMix = new Map(mixYears.map((a) => [a, 0])),
      balancedMix = new Map(mixYears.map((a) => [a, 'balanced'])),
      taxableMix = new Map(mixYears.map((a) => [a, 'taxable']));
    const starts = [
      [flatRoth, zeroMix],
      [zeroRoth, zeroMix],
      [maxRoth, zeroMix],
      [zeroRoth, balancedMix],
      [zeroRoth, taxableMix],
      [maxRoth, balancedMix],
    ];

    function runForSmooth(smoothValue) {
      if (includeSmooth) state.smoothWithdrawals = smoothValue;
      const runs = starts.map(([r, m]) => coordinateAscent(r, m));
      const notWorseRuns = runs.filter((r) => notWorseThanSelected(r.depletedAge));
      const pool = notWorseRuns.length ? notWorseRuns : runs;
      const best = pool.reduce((a, b) => (b.cost < a.cost ? b : a));
      return { ...best, smoothWithdrawals: smoothValue };
    }

    const smoothCandidates = includeSmooth ? [true, false] : [savedSmooth];
    const smoothRuns = smoothCandidates.map(runForSmooth);
    const notWorseSmoothRuns = smoothRuns.filter((r) => notWorseThanSelected(r.depletedAge));
    const smoothPool = notWorseSmoothRuns.length ? notWorseSmoothRuns : smoothRuns;
    const best = smoothPool.reduce((a, b) => (b.cost < a.cost ? b : a));

    state.rothConvEnabled = savedEnabled;
    state.rothConvBracket = savedBracket;
    state.smoothWithdrawals = savedSmooth;
    optimizerState.rothBracketByAge = savedRothOverride;
    optimizerState.withdrawalMixByAge = savedMixOverride;

    return {
      ...best,
      truncated,
      rothTruncated,
      mixTruncated,
      budgetExhausted,
      activeYears,
      rothYears,
      mixYears,
      evalCount,
      includeRoth,
      includeMix,
      includeSmooth,
    };
  }
  // Roth-only convenience wrapper, kept for the existing flat-window
  // single-lever card and its test suite — identical behavior/shape to
  // the original single-lever optimizer, implemented as the general
  // driver above with only the Roth lever included.
  export function optimizeRothLadderPerYear(selected) {
    const r = optimizeMultiLever(selected, { includeRoth: true });
    return {
      schedule: r.rothSchedule,
      cost: r.cost,
      depletedAge: r.depletedAge,
      truncated: r.truncated,
      budgetExhausted: r.budgetExhausted,
      activeYears: r.activeYears,
      evalCount: r.evalCount,
    };
  }
