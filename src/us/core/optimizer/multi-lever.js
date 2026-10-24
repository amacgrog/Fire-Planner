// US multi-lever and per-year Roth ladder optimizers

import { simulateWith } from '../../../shared/core/projection/runs.js';
import { ROTH_PER_YEAR_CANDIDATES, ROTH_PER_YEAR_MAX_PASSES, ROTH_PER_YEAR_MAX_WINDOW } from './roth-schedule.js';
import { WITHDRAWAL_MIX_CANDIDATES } from '../withdrawals/mix.js';
import { gainInTodaysDollars, objectiveBreakdown, objectiveById } from './objectives.js';

  // The final pick of a list of runs ({ depletedAge, score, ... }): among those that pass notWorse(depletedAge), the
  // strict maximum score (the first of a tie); when none passes, the latest depletion (null = never) first, then the strict
  // maximum score among those.
  export function pickGuardedRun(runs, notWorse) {
    const passing = runs.filter((r) => notWorse(r.depletedAge));
    let pool = passing;
    if (!passing.length) {
      const depletion = (r) => (r.depletedAge == null ? Infinity : r.depletedAge);
      let latest = -Infinity;
      for (const r of runs) if (depletion(r) > latest) latest = depletion(r);
      pool = runs.filter((r) => depletion(r) === latest);
    }
    return pool.reduce((a, b) => (b.score > a.score ? b : a));
  }

  // selected: the projection of the plan as configured (the guardrail reference); base: the inputs it was run on (never
  // written); contextFor(variant, overrides): the caller's context factory (the UI's stateContextFor()), called once per trial
  // right before its run, with the trial's two override maps; budget: the evaluation budget; objective: an objective id of
  // the registry (src/us/core/optimizer/objectives.js), required. Each trial is scored with objective.score under the context
  // its run used; the steps keep the strictly-higher score rule (with 'lifetimeCost' the choices are the old real-mode
  // cost's). The result carries the winner's score, value, gain over selected (today's dollars) and breakdown, never a run.
  export function optimizeMultiLever(selected, base, contextFor, options, search) {
    const { budget, objective: objectiveId } = search || {};
    if (typeof budget !== 'number' || !(budget > 0)) throw new Error('optimizeMultiLever: budget must be a positive number');
    const objective = objectiveById(objectiveId);
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
      const trialCtx = contextFor(trialInputs, { rothBracketByAge: includeRoth ? rothMap : null, withdrawalMixByAge: includeMix ? mixMap : null });
      const sim = simulateWith(trialCtx);
      evalCount++;
      return { score: objective.score(trialCtx, sim), depletedAge: sim.depletedAge, sim, ctx: trialCtx };
    }
    function coordinateAscent(startRoth, startMix) {
      const rothMap = new Map(startRoth),
        mixMap = new Map(startMix);
      let current = evaluate(rothMap, mixMap);
      // The winning trial's run and context ride along (sim, ctx) only for the figures at the end; never returned.
      let bestOverall = {
        rothSchedule: new Map(rothMap),
        mixSchedule: new Map(mixMap),
        score: current.score,
        depletedAge: current.depletedAge,
        sim: current.sim,
        ctx: current.ctx,
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
          let best = { candidate: currentCandidate, score: current.score, depletedAge: current.depletedAge, sim: current.sim, ctx: current.ctx };
          for (const candidate of candidates) {
            if (candidate === currentCandidate) continue;
            if (evalCount >= budget) {
              budgetExhausted = true;
              break;
            }
            const trial = new Map(map);
            trial.set(age, candidate);
            const result = lever === 'roth' ? evaluate(trial, mixMap) : evaluate(rothMap, trial);
            if (notWorseThanSelected(result.depletedAge) && result.score > best.score) {
              best = { candidate, score: result.score, depletedAge: result.depletedAge, sim: result.sim, ctx: result.ctx };
            }
          }
          if (best.candidate !== currentCandidate) {
            map.set(age, best.candidate);
            current = { score: best.score, depletedAge: best.depletedAge, sim: best.sim, ctx: best.ctx };
            changedThisPass = true;
            if (current.score > bestOverall.score) {
              bestOverall = {
                rothSchedule: new Map(rothMap),
                mixSchedule: new Map(mixMap),
                score: current.score,
                depletedAge: current.depletedAge,
                sim: current.sim,
                ctx: current.ctx,
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
      return { ...pickGuardedRun(runs, notWorseThanSelected), smoothWithdrawals: smoothValue };
    }

    const smoothCandidates = includeSmooth ? [true, false] : [savedSmooth];
    const smoothRuns = smoothCandidates.map(runForSmooth);
    const { sim: winnerSim, ctx: winnerCtx, ...best } = pickGuardedRun(smoothRuns, notWorseThanSelected);
    // The gain is priced with the base's own context (no override maps); building it runs nothing.
    const baseCtx = contextFor(base, { rothBracketByAge: null, withdrawalMixByAge: null });

    return {
      ...best,
      objective: objective.id,
      value: objective.value(winnerCtx, winnerSim),
      gain: gainInTodaysDollars(objective, baseCtx, winnerSim, selected),
      breakdown: objectiveBreakdown(winnerCtx, winnerSim),
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
    const { budget, objective } = search || {};
    if (typeof budget !== 'number' || !(budget > 0)) throw new Error('optimizeRothLadderPerYear: budget must be a positive number');
    const r = optimizeMultiLever(selected, base, contextFor, { includeRoth: true }, { budget, objective });
    return {
      schedule: r.rothSchedule,
      objective: r.objective,
      score: r.score,
      value: r.value,
      gain: r.gain,
      breakdown: r.breakdown,
      depletedAge: r.depletedAge,
      truncated: r.truncated,
      budgetExhausted: r.budgetExhausted,
      activeYears: r.activeYears,
      evalCount: r.evalCount,
    };
  }
