// The plan optimizer (Batch 5 step 4a, spec 4.5): a coordinate search over the per-phase lambda multipliers on full plannings, scored as Apply runs the plan

import { newRunContext } from '../../../shared/core/projection/run-context.js';
import { standardYearSource } from '../../../shared/core/projection/year-sources.js';
import { computeCliffPlan, conversionsInPlan, runProjection } from '../projection/run-projection.js';
import { STANDARD_MODE } from '../projection/year-modes.js';
import { MULT_GRID, PLAN_LEVERS, isValidStoredPlan, phaseOf } from '../cliff-plan/plan-shape.js';
import { storedPlanVerdict } from '../cliff-plan/solver.js';
import { US_OBJECTIVES, gainInTodaysDollars, objectiveById } from './objectives.js';

// The search's passes: at most 3, each over the three phases in turn (spec 4.5).
const MAX_PASSES = 3;

const late = (x) => (x === null ? Infinity : x);
const pick = (m) => ({ depletedAge: m.depletedAge, homeDrawAge: m.homeDrawAge, score: m.score, value: m.value, cost: m.cost });

// Batch 5 step 5 (spec section 4): how many of the best distinct unsized trials Optimize re-plans with the sizing pass on (k: the
// largest of 1, 2, 3 within Optimize's +40% gate against cf22985 on the gap households, B0.11.5; the notes have the timings).
export const SIZED_TRIALS = 3;

// A measure `{ depletedAge, homeDrawAge, score, value, cost }` scored on the objective (computeCliffPlan's derivation: the value
// for endValue, minus the cost for lifetimeCost, 0 for a cost of 0, never -0).
function scored(byCost, depletedAge, homeDrawAge, value, cost) {
  return { depletedAge, homeDrawAge, score: byCost ? (cost === 0 ? 0 : -cost) : value, value, cost };
}

// A planning's kept candidate (the report's entry for its kept bracket), scored on the objective.
function keptMeasure(byCost, report) {
  const k = report.brackets.find((b) => b.bracket === report.keptBracket);
  return scored(byCost, k.depletedAge, k.homeDrawAge, k.value, k.cost);
}

// The candidates' rank (spec 4.5): a candidate that depletes or first draws on the house earlier than the automatic plan
// (`ref`, candidate 0) never wins; then the later depletion, then the later first home draw (null: never, the latest), then
// the score higher by more than max($1, 0.1% of the best's |score|). Only a strict win replaces the best.
function rankBetter(c, best, ref) {
  const cd = late(c.depletedAge),
    ch = late(c.homeDrawAge);
  if (cd < late(ref.depletedAge) || ch < late(ref.homeDrawAge)) return false;
  const bd = late(best.depletedAge),
    bh = late(best.homeDrawAge);
  if (bd < late(ref.depletedAge) || bh < late(ref.homeDrawAge)) return true;
  if (cd !== bd) return cd > bd;
  if (ch !== bh) return ch > bh;
  return c.score > best.score + Math.max(1, 0.001 * Math.abs(best.score));
}

// optimizePlan(ctx, { objective, levers, sizedTrials }): the best plan the search finds for ctx's inputs, never a run. Every planning and run uses
// one working copy of the inputs with the stored plan stripped (so no planning runs the guarded
// comparison), each run's context built by newRunContext from ctx's fields as
// computeCliffPlan's are (standard mode, no tax factors). Candidates: candidate 0, the copy's automatic plan (`base`); the
// stored plan when ctx.inputs carries a valid one (`current`, its plan run through `apply` on the copy); and the search's
// plannings (`mult` on MULT_GRID from [1, 1, 1], `rankEvenly`, ties to base's bracket, one off memo for the call, and `levers`:
// default PLAN_LEVERS, so the order and split levers run in the search with the withdrawal toggle on or off; Batch 5 step 4c,
// A8, and 4d, D10), each with the conversion-sizing pass off (`sizing: false`; Batch 5 step 5b piece 3, revision 2, spec B0.11.4);
// then, when base's planning ran the pass, the best `k` distinct trials re-planned with it on (the sized trials, below; `k` is
// `sizedTrials`, else ctx.test.sizedTrials when set, else SIZED_TRIALS), whose best is the search's best. The gain (today's dollars, on the objective) is the winner's apply run against the apply run of what runs
// today: `current` when the guard would use it (storedPlanVerdict on the stored plan's own objective, as computeCliffPlan
// decides), else `base`.
// The result: `plan` (the winner's plan; null with the cliff plan off, and then base and current are null, the gain 0, the
// winner 'base', the report null and no trials), `mult` (the winner plan's multipliers), `objective` (the objective's id),
// `measure` (the winner's { depletedAge, homeDrawAge, score, value, cost }), `base` (candidate 0: its plan, its planning's
// `report` and its measure), `current` (null without a valid stored plan, else its plan, `inUse` (the guard's verdict is
// 'better' or 'tie'), `reason` (that verdict), `bracketHonoured` and `converts` (as computeCliffPlan's report.stored has them,
// for a summary of the stored plan) and its measure), `gain` (when the winner is a stored plan not in use, against base), `plannings` (the count of computeCliffPlan calls),
// `winner` ('base', 'current' or 'search': the final rank's strict winner), `report` (the search's best planning's
// report when the search wins, else base's), `trials` (every unsized search planning in order: its `mult`, its kept `measure` and
// `sized`, null or `{ measure }`: its sized re-planning's kept measure) and `sizedCount` (how many trials were re-planned sized).
export function optimizePlan(ctx, { objective = 'endValue', levers = PLAN_LEVERS, sizedTrials } = {}) {
  const obj = objectiveById(objective),
    byCost = obj === US_OBJECTIVES.lifetimeCost;
  const orig = ctx.inputs,
    inputs = { ...orig, storedPlan: null };
  const ctxOver = (ins, planMode, plan) => newRunContext({ inputs: ins, taxYear: ctx.taxYear, taxFactors: null, plan, planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test });
  const copyCtx = ctxOver(inputs, 'off', null),
    runOn = (ins, plan) => runProjection(ctxOver(ins, 'apply', plan), { mode: STANDARD_MODE, source: standardYearSource(ins), retireAgeA: ins.retireAgeA, retireAgeB: ins.retireAgeB }),
    measureOn = (ins, sim) => {
      const priceCtx = ins === inputs ? copyCtx : ctxOver(ins, 'off', null);
      return scored(byCost, sim.depletedAge, sim.homeDrawAge, US_OBJECTIVES.endValue.value(priceCtx, sim), US_OBJECTIVES.lifetimeCost.value(priceCtx, sim));
    };
  let plannings = 0;
  const plan = (ins, opts) => {
    plannings++;
    return computeCliffPlan(ctxOver(ins, 'off', null), opts);
  };

  const baseOut = plan(inputs);
  if (!baseOut.plan) return { plan: null, mult: null, objective: obj.id, measure: null, base: null, current: null, gain: 0, plannings, winner: 'base', report: null, trials: [], sizedCount: 0 };
  const baseM = keptMeasure(byCost, baseOut.report),
    base = { plan: baseOut.plan, report: baseOut.report, ...baseM };

  // current: the stored plan through `apply` on the copy; in use when the guard (its own objective) keeps it against base.
  let current = null;
  const sp = orig.storedPlan;
  if (sp && isValidStoredPlan(sp)) {
    const sim = runOn(inputs, sp.plan),
      m = measureOn(inputs, sim),
      spByCost = objectiveById(sp.objective) === US_OBJECTIVES.lifetimeCost,
      own = (x) => (spByCost ? (x.cost === 0 ? 0 : -x.cost) : x.value),
      reason = storedPlanVerdict({ depletedAge: m.depletedAge, homeDrawAge: m.homeDrawAge, score: own(m) }, { depletedAge: base.depletedAge, homeDrawAge: base.homeDrawAge, score: own(base) });
    current = { plan: sp.plan, inUse: reason === 'better' || reason === 'tie', reason, ...m, sim };
  }

  // The search: phases the plan reaches (some age of A in ageA .. ageA + projectionYears, as bracketSearchApplies counts the
  // years: survivor years are keyed by A's age too).
  const years = inputs.singlePerson ? Math.max(0, inputs.lifeExpectancyA - inputs.ageA) : Math.max(0, inputs.lifeExpectancyA - inputs.ageA, inputs.lifeExpectancyB - inputs.ageB);
  const reached = [false, false, false];
  for (let age = inputs.ageA; age <= inputs.ageA + years; age++) reached[phaseOf(copyCtx, age)] = true;
  const offMemo = new Map(),
    trials = [],
    searched = [];
  const planTrial = (mult, sizing) => {
    const out = plan(inputs, { mult, objective: obj.id, rankEvenly: true, tieBracket: base.plan.bracket, offMemo, levers, sizing });
    return { mult, out, ...keptMeasure(byCost, out.report) };
  };
  const trial = (mult) => {
    const t = planTrial(mult, false);
    trials.push({ mult, measure: pick(t), sized: null });
    searched.push(t);
    return t;
  };
  let best = trial([1, 1, 1]);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (let p = 0; p < 3; p++) {
      if (!reached[p]) continue;
      const at = best.mult[p];
      for (const v of MULT_GRID) {
        if (v === at) continue;
        const mult = best.mult.slice();
        mult[p] = v;
        const t = trial(mult);
        if (rankBetter(t, best, base)) {
          best = t;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // The sized trials (Batch 5 step 5, spec section 4): only when base's planning ran the sizing pass (base.report.sized), else
  // none and the search is the unsized one above. The trials in the order the rank gives them (those no earlier than base on
  // depletion and the first home draw first, then the later depletion, the later first home draw, the higher score; ties keep
  // the search order); the first `k` with distinct plans (intents, family, bracket, orders, orderPhases, splits: `mult` is not
  // compared, so of a duplicate set the first in that order is sized, at its own multiplier) are re-planned with the same options
  // and the pass on. Each sized re-planning is no earlier on Rule A than its unsized self and within $1 on score (the pass keeps
  // a sized plan only over the planning's own unsized one; the toggle-off fallback can end up to $1 lower, which rankBetter's
  // margin makes moot). The best of them by rankBetter replaces the unsized best, so a search winner carries its sizing.
  const k = base.report.sized === undefined ? 0 : sizedTrials != null ? sizedTrials : ctx.test.sizedTrials != null ? ctx.test.sizedTrials : SIZED_TRIALS;
  let sizedCount = 0;
  if (k > 0) {
    const okA = (t) => late(t.depletedAge) >= late(base.depletedAge) && late(t.homeDrawAge) >= late(base.homeDrawAge);
    const order = searched.map((t, i) => i);
    order.sort((i, j) => {
      const a = searched[i],
        b = searched[j],
        ra = okA(a),
        rb = okA(b);
      if (ra !== rb) return ra ? -1 : 1;
      const ad = late(a.depletedAge),
        bd = late(b.depletedAge);
      if (ad !== bd) return ad > bd ? -1 : 1;
      const ah = late(a.homeDrawAge),
        bh = late(b.homeDrawAge);
      if (ah !== bh) return ah > bh ? -1 : 1;
      if (a.score !== b.score) return a.score > b.score ? -1 : 1;
      return 0;
    });
    const seen = new Set();
    let sizedBest = null;
    for (const i of order) {
      if (sizedCount === k) break;
      const p = searched[i].out.plan,
        key = JSON.stringify({ intents: p.intents, family: p.family, bracket: p.bracket, orders: p.orders, orderPhases: p.orderPhases, splits: p.splits });
      if (seen.has(key)) continue;
      seen.add(key);
      const t = planTrial(searched[i].mult, true);
      trials[i].sized = { measure: pick(t) };
      sizedCount++;
      if (sizedBest === null || rankBetter(t, sizedBest, base)) sizedBest = t;
    }
    best = sizedBest;
  }

  // The final rank: base, then the stored plan, then the search's best; a strict win replaces.
  let win = { kind: 'base', m: base };
  if (current && rankBetter(current, win.m, base)) win = { kind: 'current', m: current };
  if (rankBetter(best, win.m, base)) win = { kind: 'search', m: best };
  const winPlan = win.kind === 'base' ? base.plan : win.kind === 'current' ? current.plan : best.out.plan,
    report = win.kind === 'search' ? best.out.report : base.report;

  // The gain against what runs today, both runs on the copy (one run reused when they are the same plan).
  const refPlan = current && current.inUse ? current.plan : base.plan,
    refSim = current && current.inUse ? current.sim : runOn(inputs, refPlan),
    winSim = winPlan === refPlan ? refSim : runOn(inputs, winPlan),
    gain = gainInTodaysDollars(obj, copyCtx, winSim, refSim);

  return {
    plan: winPlan,
    mult: winPlan.mult,
    objective: obj.id,
    measure: pick(win.m),
    base,
    current: current && { plan: current.plan, inUse: current.inUse, reason: current.reason, bracketHonoured: current.plan.bracketFrom === inputs.rothConvBracket, converts: conversionsInPlan(inputs), ...pick(current) },
    gain,
    plannings,
    winner: win.kind,
    report,
    trials,
    sizedCount,
  };
}
