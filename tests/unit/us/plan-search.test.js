// The plan optimizer (Batch 5 step 4a, spec 4.5): optimizePlan's coordinate search over the per-phase lambda multipliers on
// full plannings of a working copy of the inputs (no stored plan). The winner never depletes or first
// draws on the house earlier than the copy's automatic plan (`base`), is scored as Apply runs it, and is deterministic; a
// stored winner passes the guarded comparison right after Apply.
import { it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, scanHouseholds } from '../helpers/scan-grid.mjs';

const require = createRequire(import.meta.url);
const { DEPLETING } = require('../../helpers/plan-households.js');

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
      inputs = { ...ctx.inputs, storedPlan: null },
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
      inputs = { ...ctx.inputs, storedPlan: null },
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
  c.expect('legacy' in r).toBe(false);
}

for (const [label, patch] of CASES)
  it(`${label}: never earlier than base, scored as Apply runs it, deterministic`, async () => {
    const S = await setup();
    const { r, ms } = await S.optimize(patch);
    console.log(`plan-search ${label} endValue: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, gain ${r.gain.toFixed(2)}`);
    await checkResult(S, r, 'endValue');
    // + sizedCount (Batch 5 step 5, Task 4): every gap household's base runs the sizing pass, so the best trials are re-planned sized
    c.expect(r.plannings).toBe(1 + r.trials.length + r.sizedCount);
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

// Sizing off (testConvSizingOff): the stored-winner path needs a search winner to store. With sizing on (shipped since V148) the
// base is sized and the trials are not (spec B0.11.4), and SINGLE52's sized base costs less than every trial, so base wins (the
// sized base winning, stored and used is the NY 75 case below).
it('the winner stored (right after Apply): the guard uses it (better), and a second optimizePlan returns the same plan with no gain', async () => {
  const S = await setup();
  (await S.w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = true;
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

// Batch 5 step 4c (A8): the search's plannings carry `levers` (default PLAN_LEVERS since 4d, the toggle on or off); candidate 0 stays the
// automatic plan. With the order lever off the search is 4b's (SINGLE52's win at mult [1.5, 1, 1], no lever in any plan); with
// the default it keeps the properties, and on the toggle-on H1 the automatic plan (base) carries the lever. Sizing off
// (testConvSizingOff): 4b's search is unsized, and with sizing on SINGLE52_MULT's sized base costs less than the [1.5, 1, 1] trial
// (B0.11.4: the base sized, the trials not), so base wins with mult null.
it('levers: the order off is the 4b search; the default keeps the properties (SINGLE52 lifetimeCost, H1 toggle on)', async () => {
  const S = await setup();
  (await S.w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = true;
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
// search's (Batch 5 step 5, Task 4: the best k trials are then also re-planned with the pass, `sized`). On NY at 75 (endValue) the
// base keeps its sized plan and wins, so the winner carries conv; on lifetimeCost, where the search wins on these households, the
// winner is a sized trial's plan and carries conv too (before Task 4 an unsized trial's, conv null).
it('per-year conversion sizing on: NY 75, the trials unsized, the sized base wins carrying conv; Apply stores it and the guard uses it', async () => {
  // S0 is the switch-off run the trials are compared with (sizing ships on since V148)
  const S0 = await setup();
  (await S0.w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = true;
  const { r: r0 } = await S0.optimize(CASES[5][1]);
  const S = await setup();
  (await S.w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = false;
  const { isValidStoredPlan } = await S.w.load('us/core/cliff-plan/plan-shape.js');
  const { r, ms } = await S.optimize(CASES[5][1]);
  console.log(`plan-search NY 75 endValue, sizing on: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, gain ${r.gain.toFixed(2)}`);
  await checkResult(S, r, 'endValue');
  // the trials run no pass: each one's unsized measure is the switch-off search's at that mult (Batch 5 step 5, Task 4: the trials
  // now also carry `sized`, set on the best k re-planned with the pass, null with the switch off; so the unsized fields are compared)
  const unsized = (t) => ({ mult: t.mult, measure: t.measure });
  c.expect(r.trials.map(unsized)).toStrictEqual(r0.trials.map(unsized));
  c.expect([r0.sizedCount, r0.trials.every((t) => t.sized === null)]).toStrictEqual([0, true]);
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
  // on lifetimeCost the search wins with a trial's plan; since Batch 5 step 5, Task 4, that is a sized trial's, which carries conv
  // (before: an unsized trial's, conv null)
  const { r: rc } = await S.optimize(CASES[5][1], { objective: 'lifetimeCost' });
  c.expect(rc.winner).toBe('search');
  c.expect(rc.sizedCount > 0 && rc.plan.conv !== null && Object.keys(rc.plan.conv).length > 0).toBe(true);
});

// Batch 5 step 5, Task 4 (spec section 4): Optimize re-plans its best k distinct unsized trials with the sizing pass on, and the
// best of them replaces the unsized best. SIZED66 (found by Step 0's measurement: Optimize on endValue at k = 1 over the conv sample,
// every 8th conversions-on grid household, and the yardstick's two-return couple): two single returns, 66, 250,000 + 250,000
// traditional, 300,000 taxable, spending 60,000, no elections. Unsized, the search loses to the sized base; its [1, 1, 1] trial
// sized (b12 at 66-68, as base's own conv, on the trial's own intents and bracket) beats it by about 7,000 in nominal end value, at
// every k >= 1 (the best trial of the rank's order is [1, 1, 1]; its 9 trials plan 2 distinct plans).
const SIZED66 = grid('single-couple', 66, 500000, 300000, 60000);
// The trials' rank order (plan-search.js): Rule A against base first, then the later depletion, the later first home draw, the
// higher score; ties keep the search order (Array.prototype.sort is stable).
const rankOrder = (trials, base) => {
  const okA = (m) => late(m.depletedAge) >= late(base.depletedAge) && late(m.homeDrawAge) >= late(base.homeDrawAge);
  return trials
    .map((t, i) => i)
    .sort((i, j) => {
      const a = trials[i].measure,
        b = trials[j].measure;
      if (okA(a) !== okA(b)) return okA(a) ? -1 : 1;
      if (late(a.depletedAge) !== late(b.depletedAge)) return late(a.depletedAge) > late(b.depletedAge) ? -1 : 1;
      if (late(a.homeDrawAge) !== late(b.homeDrawAge)) return late(a.homeDrawAge) > late(b.homeDrawAge) ? -1 : 1;
      return a.score === b.score ? 0 : a.score > b.score ? -1 : 1;
    });
};
// The search's rank (spec 4.5), written out: never earlier than ref on either age, then later depletion, later first home draw, a
// score higher by more than max($1, 0.1% of |best.score|).
const rankBetter = (c, best, ref) => {
  if (late(c.depletedAge) < late(ref.depletedAge) || late(c.homeDrawAge) < late(ref.homeDrawAge)) return false;
  if (late(best.depletedAge) < late(ref.depletedAge) || late(best.homeDrawAge) < late(ref.homeDrawAge)) return true;
  if (late(c.depletedAge) !== late(best.depletedAge)) return late(c.depletedAge) > late(best.depletedAge);
  if (late(c.homeDrawAge) !== late(best.homeDrawAge)) return late(c.homeDrawAge) > late(best.homeDrawAge);
  return c.score > best.score + Math.max(1, 0.001 * Math.abs(best.score));
};
// Each trial's unsized plan, re-planned as optimizePlan plans it (the working copy, the trial's mult, rankEvenly, base's bracket for
// ties, the default levers, sizing off), as the distinctness key the sized trials use.
async function trialPlanKeys(S, r, objective) {
  const { newRunContext } = await S.w.load('shared/core/projection/run-context.js');
  const { PLAN_LEVERS } = await S.w.load('us/core/cliff-plan/plan-shape.js');
  const ctx = await S.w.ctx(),
    inputs = { ...ctx.inputs, storedPlan: null },
    offMemo = new Map();
  return r.trials.map((t) => {
    const p = S.computeCliffPlan(newRunContext({ inputs, taxYear: ctx.taxYear, taxFactors: null, plan: null, planMode: 'off', overrides: ctx.overrides, stats: ctx.stats, test: ctx.test }), { mult: t.mult, objective, rankEvenly: true, tieBracket: r.base.plan.bracket, offMemo, levers: PLAN_LEVERS, sizing: false }).plan;
    return JSON.stringify({ intents: p.intents, family: p.family, bracket: p.bracket, orders: p.orders, orderPhases: p.orderPhases, splits: p.splits });
  });
}

it('sized trials: a sized search win with sizing on (R5 M2)', async () => {
  const S = await setup();
  const { SIZED_TRIALS } = await S.w.load('us/core/optimizer/plan-search.js');
  const { r, ms } = await S.optimize(SIZED66);
  console.log(`plan-search SIZED66 endValue: ${r.plannings} plannings, ${(ms / 1000).toFixed(2)} s, winner ${r.winner}, mult ${JSON.stringify(r.mult)}, sized ${r.sizedCount}, gain ${r.gain.toFixed(2)}`);
  await checkResult(S, r, 'endValue');
  c.expect(r.base.report.sized !== undefined).toBe(true);
  c.expect(r.winner).toBe('search');
  c.expect(r.plan.conv !== null && Object.keys(r.plan.conv).length > 0).toBe(true);
  c.expect(await S.applyMeasure(r.plan, 'endValue')).toStrictEqual(r.measure);
  c.expect(late(r.measure.depletedAge) >= late(r.base.depletedAge) && late(r.measure.homeDrawAge) >= late(r.base.homeDrawAge)).toBe(true);
  c.expect(r.gain > 0).toBe(true);
  // the sized trials are the first SIZED_TRIALS distinct plans of the rank's order, one planning each
  const keys = await trialPlanKeys(S, r, 'endValue'),
    expected = [],
    seen = new Set();
  for (const i of rankOrder(r.trials, r.base)) {
    if (expected.length === SIZED_TRIALS) break;
    if (seen.has(keys[i])) continue;
    seen.add(keys[i]);
    expected.push(i);
  }
  c.expect(r.sizedCount).toBe(Math.min(SIZED_TRIALS, new Set(keys).size));
  c.expect(r.sizedCount).toBe(expected.length);
  c.expect(r.trials.map((t, i) => (t.sized === null ? null : i)).filter((i) => i !== null)).toStrictEqual(expected.slice().sort((a, b) => a - b));
  c.expect(r.plannings).toBe(1 + r.trials.length + r.sizedCount);
  // each sized re-planning: no earlier on Rule A than its unsized self, and within $1 on score; the winner is their best by the rank
  let best = null;
  for (const i of expected) {
    const u = r.trials[i].measure,
      s = r.trials[i].sized.measure;
    c.expect(Object.keys(s)).toStrictEqual(MEASURE_KEYS);
    c.expect(late(s.depletedAge) >= late(u.depletedAge) && late(s.homeDrawAge) >= late(u.homeDrawAge)).toBe(true);
    if (s.depletedAge === u.depletedAge && s.homeDrawAge === u.homeDrawAge) c.expect(s.score >= u.score - 1).toBe(true);
    if (best === null || rankBetter(s, best, r.base)) best = s;
  }
  c.expect(r.measure).toStrictEqual(best);
});

it('sized trials: sizing off, or conversions off, is the unsized search (no trial sized)', async () => {
  for (const [label, patch, off] of [
    ['sizing off', SIZED66, true],
    ['conversions off', { ...SIZED66, rothConvEnabled: false }, false],
  ]) {
    const S = await setup();
    (await S.w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = off;
    const { r } = await S.optimize(patch);
    c.expect(r.base.report.sized, label).toBe(undefined);
    c.expect(r.trials.every((t) => t.sized === null), label).toBe(true);
    c.expect(r.sizedCount, label).toBe(0);
    c.expect(r.plannings, label).toBe(1 + r.trials.length);
    const { r: r0 } = await S.optimize(patch, { sizedTrials: 0 });
    c.expect(r, label).toStrictEqual(r0);
  }
});

// k = 0 (the option, or ctx.test.sizedTrials through testHooks.sizedTrials) is the search before Task 4: the winner is the trials'
// own best (the first trial, replaced by each later one that ranks strictly better, as the coordinate search walks them), then the
// final rank against base. SIZED66 on endValue (base wins) and NY 75 on lifetimeCost (the unsized search wins).
it('sized trials: k = 0 is the unsized search', async () => {
  for (const [label, patch, objective] of [
    ['SIZED66 endValue', SIZED66, 'endValue'],
    ['NY 75 lifetimeCost', CASES[5][1], 'lifetimeCost'],
  ]) {
    const S = await setup();
    const { r } = await S.optimize(patch, { objective, sizedTrials: 0 });
    c.expect(r.base.report.sized !== undefined, label).toBe(true);
    c.expect([r.sizedCount, r.plannings], label).toStrictEqual([0, 1 + r.trials.length]);
    c.expect(r.trials.every((t) => t.sized === null), label).toBe(true);
    let best = r.trials[0];
    for (const t of r.trials.slice(1)) if (rankBetter(t.measure, best.measure, r.base)) best = t;
    const searchWins = rankBetter(best.measure, r.base, r.base);
    c.expect(r.winner, label).toBe(searchWins ? 'search' : 'base');
    c.expect(r.measure, label).toStrictEqual(searchWins ? best.measure : pick(r.base));
    c.expect(r.mult, label).toStrictEqual(searchWins ? (best.mult.every((m) => m === 1) ? null : best.mult) : r.base.plan.mult);
    if (searchWins) c.expect(r.plan.conv, label).toBe(null);
    else c.expect(r.plan, label).toBe(r.base.plan);
    c.expect(await S.applyMeasure(r.plan, objective), label).toStrictEqual(r.measure);
    // the test field: testHooks.sizedTrials = 0 reaches optimizePlan through the store's run context
    (await S.w.load('us/core/test-hooks.js')).testHooks.sizedTrials = 0;
    const { r: viaHook } = await S.optimize(patch, { objective });
    c.expect(viaHook, label).toStrictEqual(r);
  }
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // 197 + 1: the stored-plan case now first asserts that the search found a winner to store (found.winner is 'search').
  // + 25: the sizing-on case (checkResult and its own checks; revision 2, Task R2: the trials unsized, the sized base wins).
  // - 6: the applied-schedules case (the `legacy` report) is gone with the retired schedules (Batch 5 step 5, Task 2).
  // + 1: the sizing-on case also checks that the switch-off run sizes nothing (Batch 5 step 5, Task 4).
  // + 56: the sized-trials cases (Task 4): the sized win 28 (checkResult 11, its own 11, 3 per sized trial: SIZED66 sizes 2 at
  // SIZED_TRIALS 3), sizing or conversions off 10, k = 0 18.
  expect(c.total).toBe(274);
});
