// US multi-lever and per-year Roth ladder optimizers

import { simulateWith } from '../../../shared/core/projection/runs.js';
import { ROTH_PER_YEAR_CANDIDATES, ROTH_PER_YEAR_MAX_PASSES, ROTH_PER_YEAR_MAX_WINDOW, rothScheduleCost } from './roth-schedule.js';
import { WITHDRAWAL_MIX_CANDIDATES } from '../withdrawals/mix.js';

  // selected: the projection of the plan as configured (the guardrail reference); base: the inputs it was run on (never
  // written); contextFor(variant, overrides): the caller's context factory (the UI's stateContextFor()), called once per trial
  // right before its run, with the trial's two override maps; budget: the evaluation budget; displayMode: 'real' or
  // 'nominal', for the cost.
  export function optimizeMultiLever(selected, base, contextFor, options, search) {
    const { budget, displayMode } = search || {};
    if (typeof budget !== 'number' || !(budget > 0)) throw new Error('optimizeMultiLever: budget must be a positive number');
    if (displayMode !== 'real' && displayMode !== 'nominal') throw new Error("optimizeMultiLever: displayMode must be 'real' or 'nominal'");
    const includeRoth = !!(options && options.includeRoth),
      includeMix = !!(options && options.includeMix),
      includeSmooth = !!(options && options.includeSmooth);
    const rothYearsFull = [];
    for (let a = base.rothConvStartAge; a <= base.rothConvEndAge; a++) rothYearsFull.push(a);
    const mixStartAge = base.singlePerson ? base.retireAgeA : Math.min(base.retireAgeA, base.retireAgeB),
      mixEndAge = base.singlePerson ? base.lifeExpectancyA : Math.max(base.lifeExpectancyA, base.lifeExpectancyB);
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

    const savedBracket = base.rothConvBracket,
      savedSmooth = base.smoothWithdrawals;
    // Every trial runs on a copy of base: the ladder on when the Roth lever is searched, and the smoothed-withdrawals
    // candidate of the current outer run (runForSmooth below).
    const rothEnabled = includeRoth ? true : base.rothConvEnabled;
    let smoothTrial = savedSmooth;
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
      const trialInputs = { ...base, rothConvEnabled: rothEnabled, smoothWithdrawals: smoothTrial };
      const sim = simulateWith(
        contextFor(trialInputs, { rothBracketByAge: includeRoth ? rothMap : null, withdrawalMixByAge: includeMix ? mixMap : null }),
      );
      evalCount++;
      return { cost: rothScheduleCost(sim, trialInputs, displayMode), depletedAge: sim.depletedAge };
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
            if (evalCount >= budget) {
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
      if (includeSmooth) smoothTrial = smoothValue;
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
  export function optimizeRothLadderPerYear(selected, base, contextFor, search) {
    const { budget, displayMode } = search || {};
    if (typeof budget !== 'number' || !(budget > 0)) throw new Error('optimizeRothLadderPerYear: budget must be a positive number');
    if (displayMode !== 'real' && displayMode !== 'nominal') throw new Error("optimizeRothLadderPerYear: displayMode must be 'real' or 'nominal'");
    const r = optimizeMultiLever(selected, base, contextFor, { includeRoth: true }, { budget, displayMode });
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
