// The cliff plan's one shape (Batch 5 step 4a): makePlan's key order and defaults, the plans computeCliffPlan builds, and the line ids it records.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, scanHouseholds } from '../helpers/scan-grid.mjs';

const c = makeCounter();
const KEYS = ['intents', 'family', 'bracket', 'bracketFrom', 'orders', 'splits', 'levers', 'mult', 'orderPhases'];
const LINES = ['medicaid', 'acaFloor', 'aca400', 'irmaa1', 'irmaa2', 'irmaa3', 'irmaa4', 'irmaa5'];
const CA = GAP_CASES.find((g) => g.name === 'couple 62, IRMAA (CA)').patch(100, 100);

it('makePlan: exactly PLAN_KEYS in order, with the defaults', async () => {
  const w = await world();
  const { makePlan, PLAN_KEYS, PLAN_LINE_IDS, PLAN_FAMILIES, PLAN_RETS, PLAN_KINDS, BRACKET_CANDIDATES, MULT_GRID } = await w.load('us/core/cliff-plan/plan-shape.js');
  c.expect(PLAN_KEYS).toStrictEqual(KEYS);
  c.expect(Object.keys(makePlan({}))).toStrictEqual(KEYS);
  c.expect(makePlan({})).toStrictEqual({ intents: {}, family: 'none', bracket: null, bracketFrom: null, orders: null, splits: null, levers: null, mult: null, orderPhases: null });
  c.expect(Object.keys(makePlan({ bracket: 24, family: 'aca', bracketFrom: 22 }))).toStrictEqual(KEYS);
  const p = makePlan({ bracket: 24, family: 'aca', bracketFrom: 22 });
  c.expect([p.bracket, p.family, p.bracketFrom]).toStrictEqual([24, 'aca', 22]);
  c.expect(() => makePlan({ nope: 1 })).toThrow();
  c.expect(PLAN_LINE_IDS).toStrictEqual(LINES);
  c.expect(PLAN_FAMILIES).toStrictEqual(['all', 'aca', 'irmaa', 'none']);
  c.expect(PLAN_RETS).toStrictEqual(['H', 'A', 'B']);
  c.expect(PLAN_KINDS).toStrictEqual(['under', 'fill']);
  c.expect(BRACKET_CANDIDATES).toStrictEqual([10, 12, 22, 24, 32, 35]);
  c.expect(MULT_GRID).toStrictEqual([0, 0.5, 1, 1.5, 2]);
  for (const l of [PLAN_KEYS, PLAN_LINE_IDS, PLAN_FAMILIES, PLAN_RETS, PLAN_KINDS, BRACKET_CANDIDATES, MULT_GRID]) c.expect(Object.isFrozen(l)).toBe(true);
});

it('computeCliffPlan builds the plan through makePlan (searched household and default household)', async () => {
  for (const [patch, searchOff] of [[CA, false], [{ cliffGuardEnabled: true }, true]]) {
    const w = await world();
    (await w.load('us/core/test-hooks.js')).testHooks.testBracketSearchOff = searchOff;
    await w.setState(patch);
    const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
    const { plan } = computeCliffPlan(await w.ctx());
    c.expect(Object.keys(plan)).toStrictEqual(KEYS);
  }
});

it('every recorded intent line and ret is in the plan id lists (gap households and 48 scan households)', async () => {
  const gaps = GAP_CASES.map((g) => g.patch(100, 100));
  const scan = scanHouseholds().filter((_, i) => i % 16 === 0).map((h) => h.patch);
  c.expect(scan.length).toBe(48);
  let seen = 0;
  for (const patch of [...gaps, ...scan]) {
    const w = await world();
    await w.setState(patch);
    const { makePlan, BRACKET_CANDIDATES, PLAN_LINE_IDS, PLAN_RETS, PLAN_KINDS } = await w.load('us/core/cliff-plan/plan-shape.js');
    const P = await usPlan(w);
    const from = (await w.load('shared/core/store.js')).state.rothConvBracket;
    for (const b of BRACKET_CANDIDATES) {
      const plan = b === from ? null : makePlan({ bracket: b, bracketFrom: from });
      const intents = P.runPlanMode({ planMode: 'choose', plan }).intents || {};
      for (const i of Object.values(intents)) {
        seen++;
        if (!PLAN_LINE_IDS.includes(i.line) || !PLAN_RETS.includes(i.ret) || !PLAN_KINDS.includes(i.kind)) c.expect(i).toBe('a recorded intent inside the id lists');
      }
    }
  }
  c.expect(seen > 0).toBe(true);
});

it('the order lever (Batch 5 step 4c): ORDER_LEVERS, and orderPhasesOf at tax year 2026, ageA 60', async () => {
  const w = await world();
  await w.setState({ ageA: 60 });
  const { ORDER_LEVERS, orderPhasesOf } = await w.load('us/core/cliff-plan/plan-shape.js');
  c.expect(ORDER_LEVERS).toStrictEqual({ order: true, split: false });
  c.expect(Object.isFrozen(ORDER_LEVERS)).toBe(true);
  const ctx = await w.ctx();
  c.expect(orderPhasesOf(ctx, { 60: 'traditional', 61: 'traditional', 66: 'traditional' })).toStrictEqual([0, 1]);
  c.expect(orderPhasesOf(ctx, { 75: 'traditional' })).toStrictEqual([2]);
  c.expect(orderPhasesOf(ctx, {})).toBe(null);
  c.expect(orderPhasesOf(ctx, null)).toBe(null);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(29);
});
