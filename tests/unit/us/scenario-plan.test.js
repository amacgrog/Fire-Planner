// The cliff plan and the plan optimizer under a market scenario (PR 1 of the market scenarios, Task 3): planning runs through
// the run choke point (runSourceFor), so the kept measure, Optimize's measure, current and gain are all the scenario's apply runs,
// and a `choose` run replays as `apply` in both orders. The objectives still price with the plan's own factors (no tax factors).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { GAP_CASES } from '../helpers/scan-grid.mjs';

// The gap table's NY couple (58, trad-heavy, ACA), at a life of 75 (the shorter plan keeps the plannings quick).
const NY = GAP_CASES.find((g) => g.name === 'couple 58, trad-heavy, ACA (NY)').patch(75, 75);
// Task 2 test A's crash two years in (A's 60): a 75% drop over two years, a full recovery over two; its 100% inflation is
// clamped to the normalizer's 30% ceiling, so the literal says 30.
const CRASH = { kind: 'crash', order: 'bucket', crashes: [{ age: NY.ageA + 2, drop: 75, fallYears: 2, recoverPct: 100, recoverYears: 2, inflation: 30, bondReturn: 20 }] };
const pick = (m) => ({ depletedAge: m.depletedAge, homeDrawAge: m.homeDrawAge, score: m.score, value: m.value, cost: m.cost });
const stored = (r) => ({ v: 1, plan: r.plan, objective: r.objective, mult: r.mult, madeFor: 'test', taxYear: 2026, summary: { gain: r.gain, success: { hist: [null, null], mc: [null, null] } } });

async function setup() {
  const w = await world();
  const store = await w.load('shared/core/store.js');
  const { optimizePlan } = await w.load('us/core/optimizer/plan-search.js');
  const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { US_OBJECTIVES, gainInTodaysDollars } = await w.load('us/core/optimizer/objectives.js');
  const { makePlan, PLAN_LEVERS } = await w.load('us/core/cliff-plan/plan-shape.js');
  // The working copy's contexts (no stored plan), as optimizePlan and computeCliffPlan build theirs.
  const copy = async () => {
    const ctx = await w.ctx(),
      inputs = { ...ctx.inputs, storedPlan: null };
    return (planMode, p) => newRunContext({ inputs, taxYear: ctx.taxYear, taxFactors: null, plan: p, planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test });
  };
  // The plan's apply run through the choke point (simulateWith goes through runSourceFor, so the scenario applies); never
  // runProjection with the standard mode and source directly, which would skip it.
  const applySim = async (plan) => simulateWith((await copy())('apply', plan));
  // That run measured as computeCliffPlan measures (priced with the plan's own factors: the `off` context, no tax factors).
  const applyMeasure = async (plan, objective = 'endValue') => {
    const at = await copy(),
      sim = simulateWith(at('apply', plan)),
      price = at('off', null),
      value = US_OBJECTIVES.endValue.value(price, sim),
      cost = US_OBJECTIVES.lifetimeCost.value(price, sim);
    return { depletedAge: sim.depletedAge, homeDrawAge: sim.homeDrawAge, score: objective === 'lifetimeCost' ? (cost === 0 ? 0 : -cost) : value, value, cost };
  };
  // A planning's kept candidate (the report's entry for its kept bracket), as plan-search.js's keptMeasure scores it on endValue.
  const keptMeasure = (report) => {
    const k = report.brackets.find((b) => b.bracket === report.keptBracket);
    return { depletedAge: k.depletedAge, homeDrawAge: k.homeDrawAge, score: k.value, value: k.value, cost: k.cost };
  };
  return { w, store, optimizePlan, computeCliffPlan, simulateWith, US_OBJECTIVES, gainInTodaysDollars, makePlan, PLAN_LEVERS, copy, applySim, applyMeasure, keptMeasure };
}

it('the cliff plan plans on the scenario: its kept measure is the scenario apply run', async () => {
  const S = await setup();
  await S.w.setState({ ...NY, marketScenario: CRASH });
  const out = S.computeCliffPlan(await S.w.ctx());
  expect(out.plan !== null).toBe(true);
  expect(await S.applyMeasure(out.plan)).toStrictEqual(S.keptMeasure(out.report));
}, 180000);

it('optimizePlan under a scenario: measure, current and gain all priced on the scenario', async () => {
  const S = await setup();
  await S.w.setState({ ...NY, marketScenario: CRASH });
  const first = S.optimizePlan(await S.w.ctx());
  expect(await S.applyMeasure(first.plan)).toStrictEqual(first.measure);
  const sp = stored(first);
  await S.w.setState({ ...NY, marketScenario: CRASH, storedPlan: sp });
  expect(S.store.state.storedPlan !== null).toBe(true);
  const r = S.optimizePlan(await S.w.ctx());
  expect(r.current !== null).toBe(true);
  expect(await S.applyMeasure(r.plan)).toStrictEqual(r.measure);
  expect(await S.applyMeasure(sp.plan)).toStrictEqual(pick(r.current));
  // the gain is measured against the plan in use (the stored plan when the guard uses it, else base), plan-search.js's refPlan
  const reference = r.current.inUse ? r.current.plan : r.base.plan;
  const price = (await S.copy())('off', null);
  expect(r.gain).toBe(S.gainInTodaysDollars(S.US_OBJECTIVES.endValue, price, await S.applySim(r.plan), await S.applySim(reference)));
}, 300000);

it('the plan under a scenario differs from the plan without it', async () => {
  const S = await setup();
  await S.w.setState(NY);
  const without = S.computeCliffPlan(await S.w.ctx()).plan;
  await S.w.setState({ ...NY, marketScenario: CRASH });
  const withCrash = S.computeCliffPlan(await S.w.ctx()).plan;
  expect(JSON.stringify(withCrash) !== JSON.stringify(without)).toBe(true);
}, 180000);

// Planning has never run in BUCKET_MODE or with tax factors before (cliff-plan.md): a `choose` run's intents, orders, splits and
// conversion targets, fed to an `apply` run through the same choke point, must give the very same rows.
it('choose replays as apply under a scenario, in both orders (review S3)', async () => {
  const S = await setup();
  for (const order of ['bucket', 'standard']) {
    await S.w.setState({ ...NY, marketScenario: { ...CRASH, order } });
    const state = S.store.state;
    const plan = S.makePlan({ bracket: state.rothConvBracket, bracketFrom: state.rothConvBracket, levers: S.PLAN_LEVERS, conv: {} });
    const chosen = S.simulateWith(await S.w.ctx({ planMode: 'choose', plan }));
    const replay = { ...plan, conv: chosen.cliffConvIntents, intents: chosen.cliffIntents, orders: chosen.orderIntents, splits: chosen.splitIntents };
    const applied = S.simulateWith(await S.w.ctx({ planMode: 'apply', plan: replay }));
    // never vacuous: the choose run recorded something to replay
    expect(Object.keys(chosen.cliffIntents).length + Object.keys(chosen.cliffConvIntents || {}).length > 0, order).toBe(true);
    expect(applied.rows, order).toStrictEqual(chosen.rows);
    expect(applied.depletedAge, order).toBe(chosen.depletedAge);
    expect(applied.homeDrawAge, order).toBe(chosen.homeDrawAge);
  }
}, 180000);
