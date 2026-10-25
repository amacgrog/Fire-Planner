// The plan optimizer (Batch 5 step 4a, spec 4.5): optimizePlan's coordinate search over the per-phase lambda multipliers on
// full plannings of a working copy of the inputs (no stored plan, no applied schedules). The winner never depletes or first
// draws on the house earlier than the copy's automatic plan (`base`), is scored as Apply runs it, and is deterministic; a
// stored winner passes the guarded comparison right after Apply; legacy schedules are reported beside the search.
import { it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, scanHouseholds } from '../helpers/scan-grid.mjs';

const require = createRequire(import.meta.url);
const { DEPLETING, PLAN_G58_SCHED } = require('../../helpers/plan-households.js');

const c = makeCounter();
const gap = (name, life) => GAP_CASES.find((g) => g.name === name).patch(life, life);
const CASES = [];
for (const life of [100, 75])
  for (const [tag, name] of [
    ['CA', 'couple 62, IRMAA (CA)'],
    ['TX', 'early ACA single (TX)'],
    ['NY', 'couple 58, trad-heavy, ACA (NY)'],
  ])
    CASES.push([`${tag} ${life}`, gap(name, life)]);
// Two grid households (tests/solver_scan.js's grid, conversions on, no elections) where the search wins: a single person, 52,
// 1,500,000 traditional, 300,000 taxable, spending 60,000 (on lifetimeCost, at mult [1.5, 1, 1]); and the HoH household, 58,
// 1,500,000 traditional, 300,000 taxable, spending 130,000 (on endValue, by a later depletion; both plans end at 0).
const grid = (filing, age, trad, taxable, spending) =>
  scanHouseholds({ conversions: true }).find((h) => h.g.filing === filing && h.g.age === age && h.g.trad === trad && h.g.taxable === taxable && h.g.spending === spending && h.g.elections === 'none').patch;
const SINGLE52 = grid('single-person', 52, 1500000, 300000, 60000);
const HOH58 = grid('hoh', 58, 1500000, 300000, 130000);
const late = (x) => (x === null ? Infinity : x);
const MEASURE_KEYS = ['depletedAge', 'homeDrawAge', 'score', 'value', 'cost'];
const pick = (m) => ({ depletedAge: m.depletedAge, homeDrawAge: m.homeDrawAge, score: m.score, value: m.value, cost: m.cost });
// A saved plan envelope (it passes isValidStoredPlan).
const stored = (r) => ({ v: 1, plan: r.plan, objective: r.objective, mult: r.mult, madeFor: 'test', taxYear: 2026, summary: { gain: r.gain, success: { hist: [null, null], mc: [null, null] } } });

async function setup() {
  const w = await world();
  const store = await w.load('shared/core/store.js');
  const { optimizePlan } = await w.load('us/core/optimizer/plan-search.js');
  const { computeCliffPlan, runProjection } = await w.load('us/core/projection/run-projection.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { US_OBJECTIVES } = await w.load('us/core/optimizer/objectives.js');
  const optimize = async (patch, opts) => {
    await w.setState(patch);
    if (patch.storedPlan) c.expect(store.state.storedPlan !== null).toBe(true);
    const t0 = performance.now();
    const r = optimizePlan(await w.ctx(), opts);
    return { r, ms: performance.now() - t0 };
  };
  // The plan run through `apply` on the working copy, measured as computeCliffPlan measures (score on the objective).
  const applyMeasure = async (plan, objective) => {
    const ctx = await w.ctx(),
      inputs = { ...ctx.inputs, storedPlan: null, appliedRothSchedule: null, appliedMixSchedule: null },
      at = (planMode, p) => newRunContext({ inputs, taxYear: ctx.taxYear, taxFactors: null, plan: p, planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test });
    const sim = runProjection(at('apply', plan), { mode: STANDARD_MODE, source: standardYearSource(inputs), retireAgeA: inputs.retireAgeA, retireAgeB: inputs.retireAgeB });
    const price = at('off', null),
      value = US_OBJECTIVES.endValue.value(price, sim),
      cost = US_OBJECTIVES.lifetimeCost.value(price, sim);
    return { depletedAge: sim.depletedAge, homeDrawAge: sim.homeDrawAge, score: objective === 'lifetimeCost' ? (cost === 0 ? 0 : -cost) : value, value, cost };
  };
  return { w, store, optimize, applyMeasure, computeCliffPlan };
}

// The properties every result holds: never earlier than base, at least base's score at equal ages, scored as Apply runs it.
async function checkResult(S, r, objective) {
  c.expect(Object.keys(r.measure)).toStrictEqual(MEASURE_KEYS);
  c.expect(r.objective).toBe(objective);
  c.expect(late(r.measure.depletedAge) >= late(r.base.depletedAge)).toBe(true);
  c.expect(late(r.measure.homeDrawAge) >= late(r.base.homeDrawAge)).toBe(true);
  if (r.measure.depletedAge === r.base.depletedAge && r.measure.homeDrawAge === r.base.homeDrawAge) c.expect(r.measure.score >= r.base.score).toBe(true);
  c.expect(await S.applyMeasure(r.plan, objective)).toStrictEqual(r.measure);
  c.expect(r.mult === null || r.mult.some((m) => m !== 1)).toBe(true);
  c.expect(r.plan.mult).toBe(r.mult);
  c.expect(['search', 'base', 'current'].includes(r.winner)).toBe(true);
  c.expect(r.current).toBe(null);
  c.expect(r.legacy).toBe(null);
}

for (const [label, patch] of CASES)
  it(`${label}: never earlier than base, scored as Apply runs it, deterministic`, async () => {
    const S = await setup();
    const { r, ms } = await S.optimize(patch);
    console.log(`plan-search ${label} endValue: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, gain ${r.gain.toFixed(2)}`);
    await checkResult(S, r, 'endValue');
    c.expect(r.plannings).toBe(1 + r.trials.length);
    const again = await S.optimize(patch);
    c.expect(again.r).toStrictEqual(r);
  });

it('TX 75 on lifetimeCost: the same properties', async () => {
  const S = await setup();
  const { r, ms } = await S.optimize(CASES[4][1], { objective: 'lifetimeCost' });
  console.log(`plan-search TX 75 lifetimeCost: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, gain ${r.gain.toFixed(2)}`);
  await checkResult(S, r, 'lifetimeCost');
});

it('the depleting household (no cliff in reach): every candidate equals base, no gain', async () => {
  const S = await setup();
  const { r, ms } = await S.optimize(DEPLETING);
  console.log(`plan-search DEPLETING: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s`);
  c.expect(r.base.depletedAge).toBe(62);
  c.expect(Object.keys(r.base.plan.intents).length).toBe(0);
  c.expect(r.trials.length > 1).toBe(true);
  for (const t of r.trials) c.expect(t.measure).toStrictEqual(pick(r.base));
  c.expect(r.winner).toBe('base');
  c.expect(r.plan).toBe(r.base.plan);
  c.expect(r.gain <= 1).toBe(true);
});

it('the winner stored (right after Apply): the guard uses it (better), and a second optimizePlan returns the same plan with no gain', async () => {
  const S = await setup();
  const opts = { objective: 'lifetimeCost' };
  const { r, ms } = await S.optimize(SINGLE52, opts);
  console.log(`plan-search SINGLE52 lifetimeCost: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, gain ${r.gain.toFixed(2)}`);
  await checkResult(S, r, 'lifetimeCost');
  c.expect(r.winner).toBe('search');
  c.expect(r.mult).toStrictEqual([1.5, 1, 1]);
  c.expect(r.gain > 1).toBe(true);
  c.expect(r.report.keptBracket).toBe(r.plan.bracket);
  const sp = stored(r);
  await S.w.setState({ ...SINGLE52, storedPlan: sp });
  c.expect(S.store.state.storedPlan !== null).toBe(true);
  const planned = S.computeCliffPlan(await S.w.ctx());
  c.expect([planned.report.stored.used, planned.report.stored.reason]).toStrictEqual([true, 'better']);
  c.expect(planned.plan).toBe(S.store.state.storedPlan.plan);
  const { r: again } = await S.optimize({ ...SINGLE52, storedPlan: sp }, opts);
  c.expect([again.current.inUse, again.current.reason]).toStrictEqual([true, 'better']);
  c.expect(pick(again.current)).toStrictEqual(r.measure);
  // the plan in use ties the search's best (the same plan), and a tie keeps it
  c.expect(again.winner).toBe('current');
  c.expect(again.plan).toBe(again.current.plan);
  c.expect(again.plan).toStrictEqual(r.plan);
  c.expect(again.mult).toStrictEqual(r.mult);
  c.expect(again.gain <= 1).toBe(true);
  // the stored plan is stripped from the working copy: the same base and the same search
  c.expect(again.base).toStrictEqual(r.base);
  c.expect(again.trials).toStrictEqual(r.trials);
});

it('a win by a later depletion (HoH 58, endValue): the winner lasts a year longer than base', async () => {
  const S = await setup();
  const { r, ms } = await S.optimize(HOH58);
  console.log(`plan-search HOH58 endValue: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, gain ${r.gain.toFixed(2)}`);
  await checkResult(S, r, 'endValue');
  c.expect(r.winner).toBe('search');
  c.expect([r.base.depletedAge, r.measure.depletedAge]).toStrictEqual([76, 77]);
});

it('applied schedules with keys: legacy reported, the search runs on the copy without them', async () => {
  const S = await setup();
  const { r, ms } = await S.optimize(PLAN_G58_SCHED);
  console.log(`plan-search PLAN_G58_SCHED: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}`);
  c.expect(r.legacy !== null).toBe(true);
  c.expect(Object.keys(r.legacy)).toStrictEqual(['depletedAge', 'homeDrawAge', 'score']);
  c.expect(r.report.brackets.length > 1).toBe(true);
  // the original inputs' own planning: the strict rule disables the bracket search while the schedule has keys
  c.expect(S.computeCliffPlan(await S.w.ctx()).report.brackets.length).toBe(1);
  c.expect(r.plannings).toBe(2 + r.trials.length);
  c.expect(await S.applyMeasure(r.plan, 'endValue')).toStrictEqual(r.measure);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(154);
});
