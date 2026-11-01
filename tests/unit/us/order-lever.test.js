// The order lever (US, Batch 5 step 4c): the order phase of `choose` (traditional-first, kept on a strict lambda-score win) and
// its replay in `apply` (plan.orders), the drawOrder row label, the apply skip on a year that cannot carry the order (A7, A13) and
// the explicit mix's precedence (A6). The households are tests/helpers/plan-households.js's ORDER_H1 ... ORDER_H4 and
// ORDER_DROP; and (Task 3) the keep rule of computeCliffPlan: the lever-free selection, the lever run with every order held,
// the phase subsets and the plan without orders, the plan fields (levers, orders, orderPhases) and the summary clause.
import { it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, scanHouseholds } from '../helpers/scan-grid.mjs';

const require = createRequire(import.meta.url);
const { ORDER_DROP, ORDER_H1, ORDER_H2, ORDER_H3, ORDER_H4 } = require('../../helpers/plan-households.js');

const c = makeCounter();
const LEVER = { order: true, split: false };
// ORDER_DROP's one order age (its choose run keeps traditional-first at 68 only) and an age after its taxable account is gone
// (it is 0 from 71, and the order is skipped from 75 on; found by trying 70-77).
const DROP_ORDER_AGE = 68;
const DROP_NO_TAXABLE_AGE = 75;

// `sizingOn`: conversion sizing on (spec B0.11.9's checks); left out, the shipped switch (off until R4).
// `mix`: a per-age withdrawal-mix map (optimizerState.withdrawalMixByAge, written before any context is built).
async function setup(patch, { sizingOn, mix } = {}) {
  const w = await world();
  if (sizingOn !== undefined) (await w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = !sizingOn;
  await w.setState(patch);
  if (mix) (await w.load('us/core/optimizer-state.js')).optimizerState.withdrawalMixByAge = mix;
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

it('replay: apply of choose reproduces choose (H1, DROP, H2, H3, H4)', async () => {
  for (const [name, patch] of [['H1', ORDER_H1], ['DROP', ORDER_DROP], ['H2', ORDER_H2], ['H3', ORDER_H3], ['H4', ORDER_H4]]) {
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
    if (name === 'H1' || name === 'DROP') c.expect(chosen.intents, name).toStrictEqual({});
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
  const { P, makePlan } = await setup(ORDER_DROP);
  const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }) });
  const off = P.runPlanMode({ planMode: 'off' });
  c.expect(chosen.orderIntents).toStrictEqual({ [DROP_ORDER_AGE]: 'traditional' });
  const i = chosen.rows.findIndex((r) => r.age === DROP_ORDER_AGE);
  c.expect(chosen.rows[i].drawOrder).toBe('traditional');
  c.expect(chosen.rows[i].traditionalWithdrawn > off.rows[i].traditionalWithdrawn).toBe(true);
  c.expect(chosen.rows.filter((r) => 'drawOrder' in r).length).toBe(1);
  c.expect(off.rows.some((r) => 'drawOrder' in r)).toBe(false);
});

it('apply on a path where the order year is not orderable keeps the natural year (Review Focus 3)', async () => {
  const { P, makePlan, planStats } = await setup(ORDER_DROP);
  const orders = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }) }).orderIntents;
  // A standard run with the order moved to an age after the taxable account is gone: skipped, and the run is the plan without it.
  {
    const s0 = { ...planStats };
    const moved = P.runPlanMode({ planMode: 'apply', plan: makePlan({ orders: { [DROP_NO_TAXABLE_AGE]: 'traditional' } }) });
    c.expect(delta(s0, planStats)).toStrictEqual({ orderYears: 1, orderApplied: 0, orderSkipped: 1 });
    const without = P.runPlanMode({ planMode: 'apply', plan: makePlan({ orders: {} }) });
    c.expect(moved.rows).toStrictEqual(without.rows);
    c.expect(moved.rows.find((r) => r.age === DROP_NO_TAXABLE_AGE - 1).taxable).toBe(0);
    c.expect(moved.rows.some((r) => 'drawOrder' in r)).toBe(false);
  }
  // The bucket engine on two paths. 1966: age 68 is 1968, an up year, and the order is carried. 1972: age 68 is 1974, a down
  // year whose cash and bond reserve cover the need, so the draw never reaches the stock step (A13) and the order is skipped.
  // Either way the run is the plan without its skipped ages (those with no order phase on the trace).
  for (const [start, skips] of [[1966, 0], [1972, 1]]) {
    const rowFn = P.rowFnFor({ type: 'real', start });
    const s0 = { ...planStats };
    const path = P.runPlanMode({ planMode: 'apply', plan: makePlan({ orders }), rowFn, planTrace: true });
    const d = delta(s0, planStats);
    const phased = new Set(path.trace.filter((t) => t.order).map((t) => ageOfYear(path.rows, t.year)));
    const skipped = Object.keys(orders).map(Number).filter((a) => !phased.has(a));
    c.expect(d, String(start)).toStrictEqual({ orderYears: 1, orderApplied: 1 - skips, orderSkipped: skips });
    c.expect(skipped.length, String(start)).toBe(skips);
    c.expect(path.rows.find((r) => r.age === DROP_ORDER_AGE).drawOrder, String(start)).toBe(skips ? undefined : 'traditional');
    const rest = Object.fromEntries(Object.entries(orders).filter(([a]) => !skipped.includes(Number(a))));
    const without = P.runPlanMode({ planMode: 'apply', plan: makePlan({ orders: rest }), rowFn });
    c.expect(path.rows, String(start)).toStrictEqual(without.rows);
  }
});

it('an explicit mix year never gets an order intent (Review Focus 2)', async () => {
  const { P, makePlan } = await setup(ORDER_DROP, { mix: new Map([[DROP_ORDER_AGE, 'balanced']]) });
  const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }), planTrace: true });
  c.expect(Object.prototype.hasOwnProperty.call(chosen.orderIntents, DROP_ORDER_AGE)).toBe(false);
  // the explicit mix ran that year, and no order phase did
  c.expect(chosen.rows.find((r) => r.age === DROP_ORDER_AGE).mixCandidate).toBe('balanced');
  c.expect(chosen.trace.some((t) => t.order && ageOfYear(chosen.rows, t.year) === DROP_ORDER_AGE)).toBe(false);
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
  const { w, P, makePlan } = await setup(ORDER_DROP);
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
  c.expect(chosen.rows[i].age).toBe(DROP_ORDER_AGE);
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

// ---- Task 3: the keep rule in computeCliffPlan ----
const late = (x) => (x === null ? Infinity : x);
const CAND_KEYS = ['family', 'intents', 'depletedAge', 'homeDrawAge', 'value', 'cost'];
const LEVER_CAND_KEYS = ['family', 'intents', 'orders', 'orderPhases', 'splits', 'depletedAge', 'homeDrawAge', 'value', 'cost'];
async function planned(patch, opts) {
  const s = await setup(patch, opts);
  const { computeCliffPlan } = await s.w.load('us/core/projection/run-projection.js');
  const { PLAN_LEVERS, orderPhasesOf } = await s.w.load('us/core/cliff-plan/plan-shape.js');
  const ctx = await s.w.ctx();
  return { ...s, ctx, PLAN_LEVERS, orderPhasesOf, ...computeCliffPlan(ctx) };
}

it('the keep rule on H1 (toggle on): kept orders are choose\'s, no earlier than off, levers a copy of PLAN_LEVERS; toggle off: no lever fields', async () => {
  const on = await planned({ ...ORDER_H1, withdrawalMixEnabled: true });
  const { P, makePlan, from, plan, report } = on;
  const B = report.keptBracket;
  const held = makePlan({ bracket: B, bracketFrom: from });
  const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ ...held, levers: LEVER }) });
  // H1 keeps some orders (the re-check of its pin), each one an order intent of choose at the kept bracket
  c.expect(plan.orders !== null && Object.keys(plan.orders).length > 0).toBe(true);
  c.expect(Object.keys(plan.orders).every((a) => chosen.orderIntents[a] === 'traditional')).toBe(true);
  c.expect(plan.orderPhases).toStrictEqual(on.orderPhasesOf(on.ctx, plan.orders));
  c.expect(plan.levers).toStrictEqual(on.PLAN_LEVERS);
  c.expect(plan.levers === on.PLAN_LEVERS).toBe(false);
  c.expect(Object.isFrozen(plan.levers)).toBe(false);
  // the kept plan's apply run is no earlier than off at the kept bracket on either age
  const applied = P.runPlanMode({ planMode: 'apply', plan }),
    off = P.runPlanMode({ planMode: 'off', plan: B === from ? null : held });
  c.expect(late(applied.depletedAge) >= late(off.depletedAge)).toBe(true);
  c.expect(late(applied.homeDrawAge) >= late(off.homeDrawAge)).toBe(true);
  c.expect(applied.rows.some((r) => r.drawOrder === 'traditional')).toBe(true);
  // the report: keptIndex names the kept candidate, which holds the plan's orders; every candidate has the lever's fields
  const k = report.candidates[report.keptIndex];
  c.expect([k.family, k.orders, k.orderPhases]).toStrictEqual([plan.family, Object.keys(plan.orders).length, plan.orderPhases]);
  c.expect(report.keptOrderPhases).toStrictEqual(plan.orderPhases);
  c.expect(report.candidates.every((x) => Object.keys(x).join() === LEVER_CAND_KEYS.join())).toBe(true);
  const { computeCliffPlan } = await on.w.load('us/core/projection/run-projection.js');
  const leversOff = computeCliffPlan(on.ctx, { levers: { order: false, split: false } });
  // toggle off: no lever fields, the plan of today's shape, the report's candidates without the lever's fields
  const offPlan = await planned(ORDER_H1);
  c.expect([offPlan.plan.levers, offPlan.plan.orders, offPlan.plan.orderPhases]).toStrictEqual([null, null, null]);
  c.expect(offPlan.plan).toStrictEqual(offPlan.makePlan({ intents: offPlan.plan.intents, family: offPlan.plan.family, bracket: offPlan.plan.bracket, bracketFrom: offPlan.plan.bracketFrom }));
  c.expect('keptOrderPhases' in offPlan.report).toBe(false);
  c.expect(offPlan.report.candidates.every((x) => Object.keys(x).join() === CAND_KEYS.join())).toBe(true);
  c.expect(offPlan.report.candidates[offPlan.report.keptIndex].family).toBe(offPlan.report.kept);
  // a levers option with the order off is no lever at all: the toggle-on household plans as toggle off
  c.expect(leversOff).toStrictEqual({ plan: offPlan.plan, report: offPlan.report });
});

it('the keep rule drops every order (ORDER_DROP, toggle on): orders null, the lever candidate in the report lost', async () => {
  const { P, makePlan, plan, report } = await planned({ ...ORDER_DROP, withdrawalMixEnabled: true });
  const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }) });
  c.expect(chosen.orderIntents).toStrictEqual({ [DROP_ORDER_AGE]: 'traditional' });
  c.expect([plan.orders, plan.orderPhases, report.keptOrderPhases]).toStrictEqual([null, null, null]);
  c.expect(report.keptIndex).toBe(0);
  const lost = report.candidates.filter((x, i) => x.orders > 0 && i !== report.keptIndex);
  c.expect(lost.length > 0).toBe(true);
  // it lost on the depletion age: the order depletes the plan, where the lever-free best never does
  c.expect(report.candidates[0].depletedAge).toBe(null);
  c.expect(lost.every((x) => x.depletedAge !== null)).toBe(true);
});

it('stage 2 keeps one phase\'s orders: the grid household whose choose orders span three phases keeps phase 2\'s alone', async () => {
  // couple, MFJ; age 62; 401(k) 750k A + 750k B; taxable 2000k; spending 130k; elections none; conversions off
  const h = scanHouseholds({ conversions: false }).find((x) => x.g.filing === 'mfj' && x.g.age === 62 && x.g.trad === 1500000 && x.g.taxable === 2000000 && x.g.spending === 130000 && x.g.elections === 'none');
  const { w, P, makePlan, ctx, orderPhasesOf, plan, report } = await planned({ ...h.patch, withdrawalMixEnabled: true });
  const { phaseOf } = await w.load('us/core/cliff-plan/plan-shape.js');
  const all = P.runPlanMode({ planMode: 'choose', plan: makePlan({ bracket: report.keptBracket, bracketFrom: plan.bracketFrom, levers: LEVER }) }).orderIntents;
  c.expect(orderPhasesOf(ctx, all)).toStrictEqual([0, 1, 2]);
  c.expect(plan.orderPhases).toStrictEqual([2]);
  c.expect(plan.orders).toStrictEqual(Object.fromEntries(Object.entries(all).filter(([a]) => phaseOf(ctx, Number(a)) === 2)));
  // the kept candidate is a stage-2 one (after the lever run's candidates), holding fewer orders than the lever run recorded
  const k = report.candidates[report.keptIndex];
  c.expect(k.orders < Object.keys(all).length).toBe(true);
  c.expect(report.candidates.some((x) => x.orders === Object.keys(all).length)).toBe(true);
});

it('cliffPlanSummary: the order clause, alone and after the cliff clauses', async () => {
  const w = await world();
  const { cliffPlanSummary } = await w.load('us/core/cliff-plan/planning.js');
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const T = 'traditional';
  c.expect(cliffPlanSummary(makePlan({ orders: { 60: T, 61: T, 62: T, 63: T, 66: T }, orderPhases: [0, 1] }), null)).toBe('Cliff plan: draw traditional before taxable at 60-63, 66.');
  const intents = { 58: { kind: 'under', line: 'aca400', ret: 'H' }, 59: { kind: 'under', line: 'aca400', ret: 'H' } };
  c.expect(cliffPlanSummary(makePlan({ intents, family: 'all', orders: { 60: T, 61: T, 62: T, 63: T }, orderPhases: [0] }), null)).toBe('Cliff plan: stay under the ACA 400% line at 58-59; draw traditional before taxable at 60-63.');
  c.expect(cliffPlanSummary(makePlan({}), null)).toBe('Cliff plan: no steering helps this plan.');
});

// The whole-plan check (A2, review fix): a synthetic brackets pair, the review's example (no household was
// searched for: the pair pins the rule itself). Toggle off, 22% (depletes 90, home 80) against 24% (92, 85) keeps 24%; toggle on lifts 22% to (93, 80), which
// 24% no longer beats, so the lever ranking keeps 22% with a home draw at 80, earlier than toggle off's 85: the lever plan does
// not stand, and computeCliffPlan returns toggle off's plan.
it('the whole-plan check: a lifted bracket best that moves the kept bracket to an earlier home draw does not stand (synthetic pair)', async () => {
  const w = await world();
  const { keptBracketOf, leverPlanStands } = await w.load('us/core/cliff-plan/solver.js');
  const m = (bracket, depletedAge, homeDrawAge, n) => ({ bracket, depletedAge, homeDrawAge, score: 0, value: 0, n });
  const off22 = m(22, 90, 80, 0),
    off24 = m(24, 92, 85, 0),
    lev22 = m(22, 93, 80, 1);
  for (const even of [false, true]) {
    c.expect(keptBracketOf([off22, off24], even, null)).toBe(24);
    c.expect(keptBracketOf([lev22, off24], even, null)).toBe(22);
  }
  c.expect(leverPlanStands(lev22, off24)).toBe(false);
  // the toggle-off plan's own candidate stands, and a lever candidate later on both ages stands
  c.expect(leverPlanStands(off24, off24)).toBe(true);
  c.expect(leverPlanStands(m(24, 93, 86, 1), off24)).toBe(true);
  // a tie on both ages and the score keeps toggle off's (fewer intents)
  c.expect(leverPlanStands(m(24, 92, 85, 1), off24)).toBe(false);
});

// A2 (built in): the whole plan. With the toggle on, the kept plan (after the whole-plan check against toggle off's kept plan)
// never depletes or first draws on the house earlier than the toggle-off plan, and at equal ages never scores lower by more than
// $1 (the tie rule's margin): each household's kept toggle-on plan against its kept toggle-off plan, both through `apply`.
// The A2 check on the sample: `opts` reaches setup (sizing on for B0.11.9's variant).
async function checkA2(opts) {
  const scan = scanHouseholds().filter((_, i) => i % 16 === 0).map((h) => h.patch);
  const gaps = GAP_CASES.map((g) => g.patch(100, 100));
  c.expect(scan.length).toBe(48);
  let kept = 0;
  for (const patch of [...scan, ORDER_H1, ...gaps]) {
    const m = {};
    for (const on of [false, true]) {
      const { P, plan } = await planned({ ...patch, withdrawalMixEnabled: on }, opts);
      const r = P.runPlanMode({ planMode: 'apply', plan, endValue: true });
      m[on] = { d: late(r.depletedAge), h: late(r.homeDrawAge), v: r.value };
      if (on && plan.orders) kept++;
    }
    c.expect(m.true.d >= m.false.d).toBe(true);
    c.expect(m.true.h >= m.false.h).toBe(true);
    c.expect(m.true.d !== m.false.d || m.true.h !== m.false.h || m.true.v >= m.false.v - 1).toBe(true);
  }
  // not vacuous: some toggle-on plans keep orders
  c.expect(kept > 0).toBe(true);
}
it('A2: toggle on is never earlier than toggle off on either age, nor lower by more than $1 at equal ages (scan sample, H1, gap households)', async () => {
  await checkA2();
});

// B0.11.9: A2 after sizing. With conversion sizing on, the toggle's guarantee holds on the sized plans (sizePass, the
// whole-plan check after sizing).
it('A2 with conversion sizing on (B0.11.9): the same sample, the same contract on the sized plans', async () => {
  await checkA2({ sizingOn: true });
});

// B0.11.9, the TX at 100 failure (a2-diag): sized, toggle on kept orders at 75-81 that lose $887 once 64-69 convert. After the
// check, toggle on's plan is toggle off's sized plan (no orders), at toggle off's value; both passes were reported until S1, where
// toggle on's unsized best is already toggle off's and one pass runs. Two runs in one process (rule 6).
it('B0.11.9: TX at 100 with sizing on, toggle on keeps the toggle-off sized plan, no orders (one pass since S1)', async () => {
  const patch = GAP_CASES[0].patch(100, 100);
  c.expect(GAP_CASES[0].name.includes('TX')).toBe(true);
  const off = await planned({ ...patch, withdrawalMixEnabled: false }, { sizingOn: true });
  // read before the next world (a world is stale once a newer one exists)
  const vOff = off.P.runPlanMode({ planMode: 'apply', plan: off.plan, endValue: true }).value;
  const on = await planned({ ...patch, withdrawalMixEnabled: true }, { sizingOn: true });
  // not vacuous: toggle off keeps a sized plan
  c.expect(off.report.sized.kept).toBe(true);
  c.expect(off.plan.conv !== null).toBe(true);
  c.expect(on.plan.orders).toBe(null);
  c.expect(on.plan.splits).toBe(null);
  c.expect(on.plan.levers).toStrictEqual({ order: true, split: true });
  c.expect({ ...on.plan, levers: null }).toStrictEqual(off.plan);
  const vOn = on.P.runPlanMode({ planMode: 'apply', plan: on.plan, endValue: true }).value;
  c.expect(vOn).toBe(vOff);
  // S1 plan changed (the fill counts the draw): toggle on's unsized best is now toggle off's own (no orders), so its one sizing pass
  // is toggle off's pass and no second pass runs (offPass absent; before S1 it ran and was kept). The HoH 52 case below still
  // reaches the second pass.
  c.expect(on.report.sized.offPass).toBe(undefined);
  c.expect(on.report.sized).toStrictEqual(off.report.sized);
  c.expect(off.report.sized.offPass).toBe(undefined);
});

// B0.11.9, the builder's finding: the HoH 52 grid household's kept toggle-on plan holds no orders and no splits but the lever run's
// guard intents (16 against toggle off's 4, kept by stage 2's no-orders try), so a single pass from it is not toggle off's pass:
// sized, it ended $42,061 below toggle off's sized plan. The second pass runs whenever the kept best is not toggle off's own.
it('B0.11.9: a kept toggle-on plan with no orders but its own guard intents is checked after sizing (HoH 52)', async () => {
  const NAME = 'single person, HoH (1 child b. 2016); age 52; 401(k) 1500k A; taxable 2000k; spending 130k; elections none; conversions on';
  const h = scanHouseholds().find((x) => x.name === NAME);
  const off = await planned({ ...h.patch, withdrawalMixEnabled: false }, { sizingOn: true });
  const vOff = off.P.runPlanMode({ planMode: 'apply', plan: off.plan, endValue: true }).value;
  const unsizedOn = await planned({ ...h.patch, withdrawalMixEnabled: true }, { sizingOn: false });
  // the case: toggle on's unsized plan has no orders and no splits, and other intents than toggle off's
  c.expect(unsizedOn.plan.orders).toBe(null);
  c.expect(unsizedOn.plan.splits).toBe(null);
  c.expect(Object.keys(unsizedOn.plan.intents).length > Object.keys(off.plan.intents).length).toBe(true);
  const on = await planned({ ...h.patch, withdrawalMixEnabled: true }, { sizingOn: true });
  c.expect(off.report.sized.kept).toBe(true);
  c.expect({ ...on.plan, levers: null }).toStrictEqual(off.plan);
  c.expect(on.P.runPlanMode({ planMode: 'apply', plan: on.plan, endValue: true }).value).toBe(vOff);
  c.expect(on.report.sized.offPass.kept).toBe(true);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(473);
});
