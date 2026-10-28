// The run context module and the store contexts: key order, defaults, and what storeContext reads.
import { it, expect, inject } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';

const require = createRequire(import.meta.url);
const { PLAN_G58 } = require('../../helpers/plan-households.js');

const country = inject('country');
const isUS = country === 'us';
const KEYS = ['inputs', 'taxYear', 'taxFactors', 'plan', 'planMode', 'overrides', 'stats', 'test'];

it('newRunContext has the fixed key order and the defaults', async () => {
  const w = await world();
  const rc = await w.load('shared/core/projection/run-context.js');
  const s = { a: 1 };
  const ctx = rc.newRunContext({ inputs: s, taxYear: 2026 });
  expect(Object.keys(ctx)).toStrictEqual(KEYS);
  expect(ctx.inputs).toBe(s);
  expect(ctx.taxYear).toBe(2026);
  expect(ctx.taxFactors).toBe(null);
  expect(ctx.plan).toBe(null);
  expect(ctx.planMode).toBe('off');
  expect(ctx.overrides).toBe(rc.NO_OVERRIDES);
  expect(ctx.stats).toBe(null);
  expect(ctx.test).toBe(rc.NO_TEST);
  expect(Object.isFrozen(rc.NO_OVERRIDES)).toBe(true);
  expect(Object.isFrozen(rc.NO_TEST)).toBe(true);
});

it('storeContext reads the store', async () => {
  const w = await world();
  const store = await w.load('shared/core/store.js');
  const ctx = await w.ctx();
  expect(Object.keys(ctx)).toStrictEqual(KEYS);
  expect(ctx.inputs).toBe(store.state);
  expect(ctx.taxYear).toBe(2026);
  expect(ctx.plan).toBe(null);
  expect(ctx.planMode).toBe('off');
  if (isUS) {
    const es = await w.load('us/core/projection/engine-state.js');
    expect(ctx.stats.magi).toBe(es.magiStats);
    expect(ctx.stats.plan).toBe(es.planStats);
    expect(ctx.test).toStrictEqual({ inhForce: null, inhNoNeedAdj: false, seCarryAt: null, seNoSettle: false, bracketSearchOff: false, convSizingOff: true });
    expect(ctx.overrides).toStrictEqual({ rothBracketByAge: null, withdrawalMixByAge: null });
  } else {
    expect(ctx.stats).toBe(null);
    const rc = await w.load('shared/core/projection/run-context.js');
    expect(ctx.overrides).toBe(rc.NO_OVERRIDES);
    expect(ctx.test).toBe(rc.NO_TEST);
  }
});

it.runIf(isUS)('the US context follows the tax year and plans only when asked', async () => {
  const w = await world();
  w.setTaxYear(2027);
  expect((await w.ctx()).taxYear).toBe(2027);
  await w.setState({ cliffGuardEnabled: false });
  const ctx = await w.ctx({ withPlan: true });
  expect(ctx.plan).toBe(null);
  expect(ctx.planMode).toBe('off');
});

it.runIf(isUS)('the US context captures the overrides and test switches when built', async () => {
  const w = await world();
  const opt = await w.load('us/core/optimizer-state.js');
  const th = await w.load('us/core/test-hooks.js');
  const roth = { 60: 12 };
  const mix = { 60: 'taxable' };
  const force = { slot: 0, year: 1, x: 5 };
  const carry = { year: 2, amount: -100 };
  opt.optimizerState.rothBracketByAge = roth;
  opt.optimizerState.withdrawalMixByAge = mix;
  th.testHooks.testInhNoNeedAdj = true;
  th.testHooks.testInhForce = force;
  th.testHooks.testSeCarryAt = carry;
  th.testHooks.testSeNoSettle = true;
  const ctx = await w.ctx();
  expect(ctx.overrides.rothBracketByAge).toBe(roth);
  expect(ctx.overrides.withdrawalMixByAge).toBe(mix);
  expect(ctx.test.inhNoNeedAdj).toBe(true);
  expect(ctx.test.inhForce).toBe(force);
  expect(ctx.test.seCarryAt).toBe(carry);
  expect(ctx.test.seNoSettle).toBe(true);
  opt.optimizerState.rothBracketByAge = { 61: 22 };
  opt.optimizerState.withdrawalMixByAge = null;
  th.testHooks.testInhNoNeedAdj = false;
  th.testHooks.testInhForce = null;
  th.testHooks.testSeCarryAt = null;
  th.testHooks.testSeNoSettle = false;
  expect(ctx.overrides.rothBracketByAge).toBe(roth);
  expect(ctx.overrides.withdrawalMixByAge).toBe(mix);
  expect(ctx.test.inhNoNeedAdj).toBe(true);
  expect(ctx.test.inhForce).toBe(force);
  expect(ctx.test.seCarryAt).toBe(carry);
  expect(ctx.test.seNoSettle).toBe(true);
});

it.runIf(isUS)('the US plan options count only when planMode is given', async () => {
  const w = await world();
  const P = { intents: {} };
  const given = await w.ctx({ planMode: 'apply', plan: P });
  expect(given.plan).toBe(P);
  expect(given.planMode).toBe('apply');
  const choose = await w.ctx({ planMode: 'choose' });
  expect(choose.plan).toBe(null);
  expect(choose.planMode).toBe('choose');
  const ignored = await w.ctx({ plan: P });
  expect(ignored.plan).toBe(null);
  expect(ignored.planMode).toBe('off');
  const arr = [1, 2];
  expect((await w.ctx({ taxFactors: arr })).taxFactors).toBe(arr);
});

it.runIf(isUS)('with planMode undefined the plan is the planForState plan, whatever plan is passed', async () => {
  const w = await world();
  await w.setState(PLAN_G58);
  const ctx = await w.ctx({ withPlan: true });
  expect(ctx.planMode).toBe('apply');
  expect(Object.keys(ctx.plan.intents).length > 0).toBe(true);
  const again = await w.ctx({ withPlan: true, plan: null });
  expect(again.plan).toBe(ctx.plan);
  expect(again.planMode).toBe('apply');
});

it('variantContext follows the kept plan identity rule', async () => {
  const scPath = `${country}/core/projection/store-context.js`;
  if (!isUS) {
    const w = await world();
    const { variantContext } = await w.load(scPath);
    const state = await w.setState({});
    const v = { ...state, spending: 1 };
    const ctx = variantContext(state, v);
    expect(ctx.inputs).toBe(v);
    expect(ctx.plan).toBe(null);
    expect(ctx.planMode).toBe('off');
    expect(ctx.taxYear).toBe(2026);
    return;
  }
  // After a refresh: every variant of the planned-for state applies the kept plan.
  const w1 = await world();
  const { variantContext: vc1 } = await w1.load(scPath);
  const { refreshCliffPlan, planForState: pfs1 } = await w1.load('us/core/cliff-plan/planning.js');
  const { cliffPlanStore: store1 } = await w1.load('us/core/cliff-plan-store.js');
  const s1 = await w1.setState(PLAN_G58);
  refreshCliffPlan();
  const kept = store1.plan;
  expect(Object.keys(kept.intents).length > 0).toBe(true);
  const v1 = { ...s1, spending: 1 };
  const c1 = vc1(s1, v1);
  expect(c1.plan).toBe(kept);
  expect(c1.planMode).toBe('apply');
  expect(c1.inputs).toBe(v1);
  // The tax-year half of the rule: after setTaxYear (no new refresh) the variant is planned for itself.
  w1.setTaxYear(2027);
  const c1b = vc1(s1, v1);
  expect(c1b.plan === kept).toBe(false);
  expect(c1b.plan).toBe(pfs1(v1));
  expect(c1b.taxYear).toBe(2027);
  // Without a refresh (a new world, guard on): planForState(variant), the cached object, not another world's kept plan.
  const w2 = await world();
  const { variantContext: vc2 } = await w2.load(scPath);
  const { planForState: pfs2 } = await w2.load('us/core/cliff-plan/planning.js');
  const s2 = await w2.setState(PLAN_G58);
  expect(s2.cliffGuardEnabled).toBe(true);
  const v2 = { ...s2, spending: 1 };
  const c2 = vc2(s2, v2);
  expect(c2.plan === null).toBe(false);
  expect(c2.plan).toBe(pfs2(v2));
  expect(c2.plan === kept).toBe(false);
  expect(c2.planMode).toBe('apply');
});

it('every context factory gives the one context shape', async () => {
  const w = await world();
  const { storeContext, variantContext } = await w.load(`${country}/core/projection/store-context.js`);
  const { stateContextFor } = await w.load('shared/ui/results/state-context.js');
  const state = await w.setState({});
  const ctxs = [
    ['storeContext', storeContext()],
    ['variantContext', variantContext(state, { ...state, spending: 1 })],
    ['stateContextFor', stateContextFor()({ ...state, spending: 1 })],
    ['stateContextFor overrides', stateContextFor()({ ...state }, { rothBracketByAge: { 60: 12 }, withdrawalMixByAge: null })],
    ['w.ctx', await w.ctx()],
  ];
  const US_STATS = isUS ? (await w.load('us/core/cliff-plan/planning.js')).US_STATS : null;
  for (const [name, ctx] of ctxs) {
    expect(Object.keys(ctx), name).toStrictEqual(KEYS);
    if (isUS) {
      expect(Object.keys(ctx.overrides), name).toStrictEqual(['rothBracketByAge', 'withdrawalMixByAge']);
      expect(Object.isFrozen(ctx.overrides), name).toBe(false);
      expect(ctx.stats, name).toBe(US_STATS);
      expect(Object.keys(ctx.test), name).toStrictEqual(['inhForce', 'inhNoNeedAdj', 'seCarryAt', 'seNoSettle', 'bracketSearchOff', 'convSizingOff']);
    }
  }
});
