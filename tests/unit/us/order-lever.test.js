// The order lever (US, Batch 5 step 4c): the order phase of `choose` (traditional-first, kept on a strict lambda-score win) and
// its replay in `apply` (plan.orders), the drawOrder row label, the apply skip on a year that cannot carry the order (A7, A13) and
// the explicit mix's precedence (A6). The households are tests/helpers/plan-households.js's ORDER_H1 ... ORDER_H4.
import { it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';

const require = createRequire(import.meta.url);
const { ORDER_H1, ORDER_H2, ORDER_H3, ORDER_H4 } = require('../../helpers/plan-households.js');

const c = makeCounter();
const LEVER = { order: true, split: false };
// H1's one order age (its choose run keeps traditional-first at 67 only) and an age after its taxable account is gone (73).
const H1_ORDER_AGE = 67;
const H1_NO_TAXABLE_AGE = 74;

async function setup(patch) {
  const w = await world();
  await w.setState(patch);
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const { planStats } = await w.load('us/core/projection/engine-state.js');
  const P = await usPlan(w);
  const from = (await w.load('shared/core/store.js')).state.rothConvBracket;
  return { w, P, makePlan, planStats, from };
}
const ageOfYear = (rows, y) => rows.find((r) => r.year === y).age;
const delta = (s0, s1) => ({ orderYears: s1.orderYears - s0.orderYears, orderApplied: s1.orderApplied - s0.orderApplied, orderSkipped: s1.orderSkipped - s0.orderSkipped });

it('the lever off: choose with levers null or { order: false } is the 4b run row for row', async () => {
  for (const patch of [ORDER_H1, ORDER_H2]) {
    const { P, makePlan, from } = await setup(patch);
    const none = P.runPlanMode({ planMode: 'choose', plan: null });
    const held = P.runPlanMode({ planMode: 'choose', plan: makePlan({ bracket: from, bracketFrom: from }) });
    const off = P.runPlanMode({ planMode: 'choose', plan: makePlan({ bracket: from, bracketFrom: from, levers: { order: false, split: false } }) });
    c.expect(held.rows).toStrictEqual(none.rows);
    c.expect(off.rows).toStrictEqual(none.rows);
    for (const r of [none, held, off]) {
      c.expect(r.orderIntents).toBe(null);
      c.expect(Object.prototype.hasOwnProperty.call(r.sim, 'orderIntents')).toBe(false);
    }
  }
});

it('choose with the lever that records nothing is off row for row', async () => {
  // couple, MFJ; age 62; 401(k) 250k A + 250k B; taxable 2000k; spending 130k; elections none; conversions off
  const h = scanHouseholds({ conversions: false }).find((x) => x.g.filing === 'mfj' && x.g.age === 62 && x.g.trad === 500000 && x.g.taxable === 2000000 && x.g.spending === 130000 && x.g.elections === 'none');
  const { P, makePlan } = await setup(h.patch);
  const lever = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }), planTrace: true });
  const off = P.runPlanMode({ planMode: 'off' });
  c.expect(lever.orderIntents).toStrictEqual({});
  c.expect(lever.intents).toStrictEqual({});
  // not vacuous: the order phase ran (and was not kept)
  c.expect(lever.trace.some((t) => t.order && t.order.kept === false)).toBe(true);
  c.expect(lever.rows).toStrictEqual(off.rows);
  c.expect(lever.depletedAge).toBe(off.depletedAge);
  c.expect(lever.homeDrawAge).toBe(off.homeDrawAge);
});

it('replay: apply of choose reproduces choose (H1, H2, H3, H4)', async () => {
  for (const [name, patch] of [['H1', ORDER_H1], ['H2', ORDER_H2], ['H3', ORDER_H3], ['H4', ORDER_H4]]) {
    const { P, makePlan } = await setup(patch);
    const held = makePlan({ levers: LEVER });
    const chosen = P.runPlanMode({ planMode: 'choose', plan: held, planTrace: true });
    const applied = P.runPlanMode({ planMode: 'apply', plan: makePlan({ ...held, intents: chosen.intents, family: 'all', orders: chosen.orderIntents }), planTrace: true });
    const orderAges = Object.keys(chosen.orderIntents).map(Number);
    c.expect(orderAges.length > 0, name).toBe(true);
    c.expect(applied.rows, name).toStrictEqual(chosen.rows);
    c.expect(applied.depletedAge, name).toBe(chosen.depletedAge);
    c.expect(applied.homeDrawAge, name).toBe(chosen.homeDrawAge);
    // never vacuous: both runs have an order phase
    c.expect(chosen.trace.some((t) => t.order), name).toBe(true);
    c.expect(applied.trace.some((t) => t.order && t.order.kept), name).toBe(true);
    if (name === 'H1') c.expect(chosen.intents, name).toStrictEqual({});
    if (name === 'H2') {
      // the combined year: an order kept and a cliff intent recorded from it
      c.expect(chosen.trace.some((t) => t.order && t.order.kept && t.intent), name).toBe(true);
      // its row: the kept trial ran from the order phase (traditional-first) and met its plan
      const combined = chosen.trace.find((t) => t.order && t.order.kept && t.intent),
        row = chosen.rows.find((r) => r.year === combined.year);
      c.expect(row.drawOrder, name).toBe('traditional');
      c.expect('cliffChoice' in row, name).toBe(true);
    }
    if (name === 'H3') {
      // an order year on two returns (before the wedding at 70: the rows carry magiA / magiB)
      const two = orderAges.filter((a) => a < 70 && 'magiA' in chosen.rows.find((r) => r.age === a));
      c.expect(two.length > 0, name).toBe(true);
    }
    if (name === 'H4') {
      // a kept order year with no lines in reach (no candidates on the trace), and the year after it in the run
      const bare = chosen.trace.filter((t) => t.order && t.order.kept && t.candidates === undefined).map((t) => ageOfYear(chosen.rows, t.year));
      c.expect(bare.length > 0, name).toBe(true);
      c.expect(chosen.rows.some((r) => r.age === bare[0] + 1), name).toBe(true);
    }
  }
});

it('an order year draws traditional first and is labelled', async () => {
  const { P, makePlan } = await setup(ORDER_H1);
  const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }) });
  const off = P.runPlanMode({ planMode: 'off' });
  c.expect(chosen.orderIntents).toStrictEqual({ [H1_ORDER_AGE]: 'traditional' });
  const i = chosen.rows.findIndex((r) => r.age === H1_ORDER_AGE);
  c.expect(chosen.rows[i].drawOrder).toBe('traditional');
  c.expect(chosen.rows[i].traditionalWithdrawn > off.rows[i].traditionalWithdrawn).toBe(true);
  c.expect(chosen.rows.filter((r) => 'drawOrder' in r).length).toBe(1);
  c.expect(off.rows.some((r) => 'drawOrder' in r)).toBe(false);
});

it('apply on a path where the order year is not orderable keeps the natural year (Review Focus 3)', async () => {
  const { P, makePlan, planStats } = await setup(ORDER_H1);
  const orders = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }) }).orderIntents;
  // A standard run with the order moved to an age after the taxable account is gone: skipped, and the run is the plan without it.
  {
    const s0 = { ...planStats };
    const moved = P.runPlanMode({ planMode: 'apply', plan: makePlan({ orders: { [H1_NO_TAXABLE_AGE]: 'traditional' } }) });
    c.expect(delta(s0, planStats)).toStrictEqual({ orderYears: 1, orderApplied: 0, orderSkipped: 1 });
    const without = P.runPlanMode({ planMode: 'apply', plan: makePlan({ orders: {} }) });
    c.expect(moved.rows).toStrictEqual(without.rows);
    c.expect(moved.rows.find((r) => r.age === H1_NO_TAXABLE_AGE - 1).taxable).toBe(0);
    c.expect(moved.rows.some((r) => 'drawOrder' in r)).toBe(false);
  }
  // The bucket engine on two paths. 1966: age 67 is 1967, an up year, and the order is carried. 1973: age 67 is 1974, a down
  // year whose cash and bond reserve cover the need, so the draw never reaches the stock step (A13) and the order is skipped.
  // Either way the run is the plan without its skipped ages (those with no order phase on the trace).
  for (const [start, skips] of [[1966, 0], [1973, 1]]) {
    const rowFn = P.rowFnFor({ type: 'real', start });
    const s0 = { ...planStats };
    const path = P.runPlanMode({ planMode: 'apply', plan: makePlan({ orders }), rowFn, planTrace: true });
    const d = delta(s0, planStats);
    const phased = new Set(path.trace.filter((t) => t.order).map((t) => ageOfYear(path.rows, t.year)));
    const skipped = Object.keys(orders).map(Number).filter((a) => !phased.has(a));
    c.expect(d, String(start)).toStrictEqual({ orderYears: 1, orderApplied: 1 - skips, orderSkipped: skips });
    c.expect(skipped.length, String(start)).toBe(skips);
    c.expect(path.rows.find((r) => r.age === H1_ORDER_AGE).drawOrder, String(start)).toBe(skips ? undefined : 'traditional');
    const rest = Object.fromEntries(Object.entries(orders).filter(([a]) => !skipped.includes(Number(a))));
    const without = P.runPlanMode({ planMode: 'apply', plan: makePlan({ orders: rest }), rowFn });
    c.expect(path.rows, String(start)).toStrictEqual(without.rows);
  }
});

it('an explicit mix year never gets an order intent (Review Focus 2)', async () => {
  const { P, makePlan } = await setup({ ...ORDER_H1, appliedMixSchedule: { [H1_ORDER_AGE]: 'balanced' } });
  const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }), planTrace: true });
  c.expect(Object.prototype.hasOwnProperty.call(chosen.orderIntents, H1_ORDER_AGE)).toBe(false);
  // the explicit mix ran that year, and no order phase did
  c.expect(chosen.rows.find((r) => r.age === H1_ORDER_AGE).mixCandidate).toBe('balanced');
  c.expect(chosen.trace.some((t) => t.order && ageOfYear(chosen.rows, t.year) === H1_ORDER_AGE)).toBe(false);
});

it('the choose order phase is kept only on a strict lambda-score win, with no unmet need and no extra home draw', async () => {
  for (const patch of [ORDER_H1, ORDER_H2, ORDER_H3, ORDER_H4]) {
    const { P, makePlan } = await setup(patch);
    const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }), planTrace: true });
    const phases = chosen.trace.filter((t) => t.order);
    c.expect(phases.length > 0).toBe(true);
    c.expect(phases.every((t) => t.order.kept === (t.order.ok && t.order.score > t.order.natScore + 1))).toBe(true);
    // the record of every kept order is the run's orderIntents, and nothing else is
    c.expect(phases.filter((t) => t.order.kept).map((t) => String(ageOfYear(chosen.rows, t.year)))).toStrictEqual(Object.keys(chosen.orderIntents));
  }
  // H1's order year re-scored outside the engine: afterTaxValue of each phase's end balances at the year's lambda / tauGain,
  // less the IRMAA its MAGI sets (single: the surcharge on the Medicare MAGI of the row's MAGI, over two years' growth at the
  // plan's inflation).
  const { w, P, makePlan } = await setup(ORDER_H1);
  const { afterTaxValue } = await w.load('us/core/cliff-plan/solver.js');
  const { irmaaSurcharge } = await w.load('us/core/healthcare/irmaa.js');
  const { irmaaMagiOf } = await w.load('us/core/healthcare/irmaa.js');
  const st = (await w.load('shared/core/store.js')).state;
  const ctx = await w.ctx();
  const g2 = (1 + st.inflation / 100) * (1 + st.inflation / 100);
  const irmaaOf = (row) => irmaaSurcharge(ctx, irmaaMagiOf(row.magiProxy, row.ss, 'single') / g2, 'single', row.year);
  const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }), planTrace: true });
  const off = P.runPlanMode({ planMode: 'off' });
  const t = chosen.trace.find((x) => x.order && x.order.kept);
  const i = chosen.rows.findIndex((r) => r.year === t.year);
  c.expect(chosen.rows[i].age).toBe(H1_ORDER_AGE);
  const irmaaNat = irmaaOf(off.rows[i]),
    irmaaOrder = irmaaOf(chosen.rows[i]);
  c.expect(afterTaxValue(t.natBal, t.lambda, t.tauGain) - irmaaNat).toBe(t.order.natScore);
  c.expect(afterTaxValue(t.orderBal, t.lambda, t.tauGain) - irmaaOrder).toBe(t.order.score);
  // the balances are the rows' (the natural year is the off run's, the kept order phase the choose run's)
  c.expect(t.natBal.taxable).toBe(off.rows[i].taxable);
  c.expect(t.orderBal.taxable).toBe(chosen.rows[i].taxable);
  c.expect(t.orderBal.traditional).toBe(chosen.rows[i].traditional);
  c.expect(t.order.score > t.order.natScore + 1).toBe(true);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(92);
});
