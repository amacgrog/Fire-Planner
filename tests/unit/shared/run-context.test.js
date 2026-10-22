// The run context module and the store contexts: key order, defaults, and what storeContext reads.
import { it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';

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
    expect(ctx.test).toStrictEqual({ inhForce: null, inhNoNeedAdj: false });
    expect(ctx.overrides).toStrictEqual({ rothBracketByAge: null, withdrawalMixByAge: null });
  } else {
    expect(ctx.stats).toBe(null);
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
