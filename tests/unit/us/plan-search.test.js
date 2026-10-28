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
// 1,500,000 traditional, 300,000 taxable, spending 60,000 (on lifetimeCost, at mult [1.5, 1, 1]); and a couple, 58,
// 750,000 + 750,000 traditional, 300,000 taxable, spending 130,000 (on endValue, by a later depletion; see COUPLE58 below). Until Batch 5 step 4b
// the later-depletion case was the HoH household with the same money; its automatic plan now keeps gains-capped stay-unders at
// 58 and 59 and lasts as long as the search did (77, first home draw 74), so the search no longer wins there.
const grid = (filing, age, trad, taxable, spending, elections = 'none') =>
  scanHouseholds({ conversions: true }).find((h) => h.g.filing === filing && h.g.age === age && h.g.trad === trad && h.g.taxable === taxable && h.g.spending === spending && h.g.elections === elections).patch;
const SINGLE52 = grid('single-person', 52, 1500000, 300000, 60000);
// SINGLE52 at the default bondYears (5) wins on lifetimeCost with a bracket change only (mult null) since the maintained bond reserve
// (Batch 5 step 5b); at 6 reserve years (found by trying 0-8) its win is again at mult [1.5, 1, 1], which the levers case pins.
const SINGLE52_MULT = { ...SINGLE52, bondYears: 6 };
// The later-depletion case below is no longer the MFJ couple (58, same money, 130k): since the maintained bond reserve (Batch 5 step 5b)
// no MFJ household of the grid (found by running Optimize on the 460 households that deplete, both modes, all elections, conversions
// on and off, and on MFJ 58 variants over spending, traditional money and bondYears) has a search win that lasts longer than its
// automatic plan; the ones that do are two-returns couples and a smoothed single person. This one: two single returns, 58,
// 750,000 + 750,000 traditional, 300,000 taxable, spending 130,000, SEPP on (the winner holds two splits and depletes at 85 against
// base's 84).
const COUPLE58 = grid('single-couple', 58, 1500000, 300000, 130000, 'sepp');
// The grid's two-returns couple, 62, 750,000 + 750,000 traditional, 2,000,000 taxable, spending 130,000 (the stored-plan-not-in-use case;
// it was the MFJ couple, 62, 250,000 + 250,000, 300,000 taxable, 60,000 with a constructed IRMAA fill at 66, which since the
// maintained bond reserve of Batch 5 step 5b no longer changes anything; found by storing the search's own endValue winner under
// lifetimeCost for each grid household whose search wins: eight reject it on the score and rank it first on endValue).
const COUPLE62 = grid('single-couple', 62, 1500000, 2000000, 130000);
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
  // Two plans' `apply` runs on the working copy and the context that prices them: [ctx, simA, simB].
  const copyRuns = async (a, b) => {
    const ctx = await w.ctx(),
      inputs = { ...ctx.inputs, storedPlan: null, appliedRothSchedule: null, appliedMixSchedule: null },
      at = (planMode, p) => newRunContext({ inputs, taxYear: ctx.taxYear, taxFactors: null, plan: p, planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test }),
      runOf = (p) => runProjection(at('apply', p), { mode: STANDARD_MODE, source: standardYearSource(inputs), retireAgeA: inputs.retireAgeA, retireAgeB: inputs.retireAgeB });
    return [at('off', null), runOf(a), runOf(b)];
  };
  return { w, store, optimize, applyMeasure, copyRuns, computeCliffPlan };
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
  c.expect(r.plan).not.toStrictEqual(r.base.plan);
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

it('a win by a later depletion (two returns 58 SEPP, endValue): the winner lasts at least a year longer than base', async () => {
  const S = await setup();
  const { r, ms } = await S.optimize(COUPLE58);
  console.log(`plan-search COUPLE58 endValue: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, gain ${r.gain.toFixed(2)}`);
  await checkResult(S, r, 'endValue');
  c.expect(r.winner).toBe('search');
  c.expect(r.base.depletedAge !== null && late(r.measure.depletedAge) >= r.base.depletedAge + 1).toBe(true);
});

// A stored plan the guard does not use that wins the search's final rank (finding 1 of the second review): the search's own winner on
// endValue for COUPLE62, stored under lifetimeCost. On its own objective it costs more than the automatic plan (rejected on the
// score); on endValue it is worth more. optimizePlan on endValue ranks it first ('current', not in use), measures its gain against
// base (what runs today), and re-stored under endValue the guard uses it.
it('a stored plan not in use that wins on the searched objective: winner current, the gain against base, used once re-stored', async () => {
  const S = await setup();
  const found = (await S.optimize(COUPLE62)).r;
  c.expect(found.winner).toBe('search');
  const plan = found.plan;
  const sp = (objective) => ({ v: 1, plan, objective, mult: found.mult, madeFor: 'test', taxYear: 2026, summary: { gain: 0, success: { hist: [null, null], mc: [null, null] } } });
  await S.w.setState({ ...COUPLE62, storedPlan: sp('lifetimeCost') });
  const guarded = S.computeCliffPlan(await S.w.ctx()).report.stored;
  c.expect([guarded.used, guarded.reason]).toStrictEqual([false, 'score']);
  const { r, ms } = await S.optimize({ ...COUPLE62, storedPlan: sp('lifetimeCost') });
  console.log(`plan-search COUPLE62 stored lifetimeCost, endValue: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, gain ${r.gain.toFixed(2)}`);
  c.expect([r.current.inUse, r.current.reason]).toStrictEqual([false, 'score']);
  c.expect(r.winner).toBe('current');
  c.expect(r.plan).toBe(r.current.plan);
  c.expect(r.measure).toStrictEqual(pick(r.current));
  c.expect(await S.applyMeasure(r.plan, 'endValue')).toStrictEqual(r.measure);
  // the same ages as base, worth more on endValue by more than the rank's threshold, and the gain is against base
  c.expect([r.measure.depletedAge, r.measure.homeDrawAge]).toStrictEqual([r.base.depletedAge, r.base.homeDrawAge]);
  c.expect(r.measure.value > r.base.value + Math.max(1, 0.001 * Math.abs(r.base.value))).toBe(true);
  c.expect(r.gain > 1).toBe(true);
  const { gainInTodaysDollars, US_OBJECTIVES } = await S.w.load('us/core/optimizer/objectives.js');
  c.expect(r.gain).toBe(gainInTodaysDollars(US_OBJECTIVES.endValue, ...(await S.copyRuns(r.plan, r.base.plan))));
  c.expect([r.current.bracketHonoured, r.current.converts]).toStrictEqual([true, true]);
  // re-stored under the searched objective (as Apply stores it), the guard uses it
  await S.w.setState({ ...COUPLE62, storedPlan: sp('endValue') });
  const reapplied = S.computeCliffPlan(await S.w.ctx());
  c.expect(reapplied.report.stored.used).toBe(true);
  c.expect(reapplied.plan).toBe(S.store.state.storedPlan.plan);
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

// Batch 5 step 4c (A8): the search's plannings carry `levers` (default PLAN_LEVERS since 4d, the toggle on or off); candidate 0 stays the
// automatic plan. With the order lever off the search is 4b's (SINGLE52's win at mult [1.5, 1, 1], no lever in any plan); with
// the default it keeps the properties, and on the toggle-on H1 the automatic plan (base) carries the lever.
it('levers: the order off is the 4b search; the default keeps the properties (SINGLE52 lifetimeCost, H1 toggle on)', async () => {
  const S = await setup();
  const opts = { objective: 'lifetimeCost' };
  const { r: off } = await S.optimize(SINGLE52_MULT, { ...opts, levers: { order: false, split: false } });
  c.expect([off.winner, off.mult]).toStrictEqual(['search', [1.5, 1, 1]]);
  c.expect([off.plan.levers, off.plan.orders, off.plan.orderPhases]).toStrictEqual([null, null, null]);
  c.expect('keptOrderPhases' in off.report).toBe(false);
  const { r } = await S.optimize(SINGLE52_MULT, opts);
  console.log(`plan-search SINGLE52 lifetimeCost, default levers: ${r.plannings} plannings, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, orders ${JSON.stringify(r.plan.orders)}`);
  await checkResult(S, r, 'lifetimeCost');
  // the toggle is off, so candidate 0 is the same automatic plan with or without the lever in the search
  c.expect(r.base).toStrictEqual(off.base);
  c.expect(r.winner !== 'search' || 'keptOrderPhases' in r.report).toBe(true);
  const { ORDER_H1 } = require('../../helpers/plan-households.js');
  const { r: h1 } = await S.optimize({ ...ORDER_H1, withdrawalMixEnabled: true });
  await checkResult(S, h1, 'endValue');
  c.expect(h1.base.plan.levers).toStrictEqual({ order: true, split: true });
  c.expect(h1.base.plan.orders !== null).toBe(true);
});

// Per-year conversion sizing on (Batch 5 step 5b piece 3, revision 2, spec B0.11.4): the base planning runs the whole-run pass
// (base.report.sized), the mult trials do not (computeCliffPlan's sizing: false), so every trial's measure is the switch-off
// search's. On NY at 75 (endValue) the base keeps its sized plan and wins, so the winner carries conv (a trial's winner carries
// none: on lifetimeCost, where the search wins on these households, its plan has conv null).
it('per-year conversion sizing on: NY 75, the trials unsized, the sized base wins carrying conv; Apply stores it and the guard uses it', async () => {
  const S0 = await setup();
  const { r: r0 } = await S0.optimize(CASES[5][1]);
  const S = await setup();
  (await S.w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = false;
  const { isValidStoredPlan } = await S.w.load('us/core/cliff-plan/plan-shape.js');
  const { r, ms } = await S.optimize(CASES[5][1]);
  console.log(`plan-search NY 75 endValue, sizing on: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, gain ${r.gain.toFixed(2)}`);
  await checkResult(S, r, 'endValue');
  // the trials run no pass: each one's measure is the switch-off search's at that mult
  c.expect(r.trials).toStrictEqual(r0.trials);
  // the base is sized and kept; the switch-off base has no pass
  c.expect(r.base.report.sized !== undefined && r.base.report.sized.kept).toBe(true);
  c.expect(r0.base.report.sized).toBe(undefined);
  c.expect(r.base.plan.conv !== null && Object.keys(r.base.plan.conv).length > 0).toBe(true);
  c.expect(r.winner).toBe('base');
  c.expect(r.plan).toBe(r.base.plan);
  c.expect(r.report.sized.kept).toBe(true);
  // Apply: the stored envelope passes the guard, survives normalizeState, and is the plan the next planning runs (it ties the
  // automatic plan, which is the same plan)
  const sp = stored(r);
  c.expect(isValidStoredPlan(sp)).toBe(true);
  await S.w.setState({ ...CASES[5][1], storedPlan: sp });
  c.expect(S.store.state.storedPlan).toStrictEqual(sp);
  const planned = S.computeCliffPlan(await S.w.ctx());
  c.expect([planned.report.stored.used, planned.report.stored.reason]).toStrictEqual([true, 'tie']);
  c.expect(planned.plan).toBe(S.store.state.storedPlan.plan);
  c.expect(planned.plan.conv).toStrictEqual(r.plan.conv);
  // on lifetimeCost the search wins with a trial's plan, which carries no conv
  const { r: rc } = await S.optimize(CASES[5][1], { objective: 'lifetimeCost' });
  c.expect(rc.winner).toBe('search');
  c.expect(rc.plan.conv).toBe(null);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // 197 + 1: the stored-plan case now first asserts that the search found a winner to store (found.winner is 'search').
  // + 25: the sizing-on case (checkResult and its own checks; revision 2, Task R2: the trials unsized, the sized base wins).
  expect(c.total).toBe(223);
});
