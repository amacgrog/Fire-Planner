// The plan's per-phase lambda multipliers (Batch 5 step 4a): phaseOf, the multiplier in the choose trace, and [1, 1, 1] changing nothing.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, legacyToAccounts } from '../helpers/scan-grid.mjs';

const c = makeCounter();
const GAP = (name) => GAP_CASES.find((g) => g.name === name).patch(100, 100);
// tests/cliff_plan.js "std R rothConv+aca+live" (tests/snapshot_scenarios.js: US_R plus these fields), the legacy balances converted
const R_BASE = { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, spending: 90000, stateTax: 'tx' };
const R_LIVE = {
  ...R_BASE,
  rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 62, rothConvBracket: 24, acaEnabled: true, withdrawalMixEnabled: true,
  taxable: 700000, cash: 60000, ...legacyToAccounts({ traditional: 900000, roth: 200000 }, R_BASE),
};

it('phaseOf at tax year 2026: before 65, then to Partner A\'s RMD start age, then on', async () => {
  for (const [ageA, rows] of [[67, [[64, 0], [65, 1], [72, 1], [73, 2]]], [60, [[74, 1], [75, 2]]]]) {
    const w = await world();
    await w.setState({ ageA });
    const { phaseOf } = await w.load('us/core/cliff-plan/plan-shape.js');
    const ctx = await w.ctx();
    for (const [age, phase] of rows) c.expect(phaseOf(ctx, age)).toBe(phase);
  }
});

it('the choose trace: mult [0, 0, 0] gives lambda 0 in every year with a candidate; no plan gives a non-zero lambda', async () => {
  const w = await world();
  await w.setState(GAP('early ACA single (TX)'));
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const P = await usPlan(w);
  const from = (await w.load('shared/core/store.js')).state.rothConvBracket;
  const zero = P.runPlanMode({ planMode: 'choose', planTrace: true, plan: makePlan({ bracket: from, bracketFrom: from, mult: [0, 0, 0] }) }).trace.filter((t) => t.lambda !== null);
  const none = P.runPlanMode({ planMode: 'choose', planTrace: true, plan: null }).trace.filter((t) => t.lambda !== null);
  c.expect(zero.length > 0).toBe(true);
  c.expect(zero.every((t) => t.lambda === 0)).toBe(true);
  c.expect(none.some((t) => t.lambda > 0)).toBe(true);
});

it('choose with mult [1, 1, 1] gives the rows of no plan (CA, TX, NY, and the converting live-mix household)', async () => {
  const cases = [GAP('couple 62, IRMAA (CA)'), GAP('early ACA single (TX)'), GAP('couple 58, trad-heavy, ACA (NY)'), R_LIVE];
  for (const patch of cases) {
    const w = await world();
    await w.setState(patch);
    const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
    const P = await usPlan(w);
    const from = (await w.load('shared/core/store.js')).state.rothConvBracket;
    const base = P.runPlanMode({ planMode: 'choose', plan: null });
    const ones = P.runPlanMode({ planMode: 'choose', plan: makePlan({ bracket: from, bracketFrom: from, mult: [1, 1, 1] }) });
    c.expect(ones.rows.length > 0).toBe(true);
    c.expect(ones.rows).toStrictEqual(base.rows);
  }
});

it('computeCliffPlan: mult null or all ones keeps today\'s plan; another mult is carried by the returned plan', async () => {
  const w = await world();
  await w.setState({ ...GAP('couple 62, IRMAA (CA)'), cliffGuardEnabled: true });
  const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
  const base = computeCliffPlan(await w.ctx());
  c.expect(computeCliffPlan(await w.ctx(), { mult: [1, 1, 1] })).toStrictEqual(base);
  c.expect(base.plan.mult).toBe(null);
  c.expect(computeCliffPlan(await w.ctx(), { mult: [0, 1, 2] }).plan.mult).toStrictEqual([0, 1, 2]);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(20);
});
