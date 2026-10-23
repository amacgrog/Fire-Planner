// The store wrappers' result cache: hits are the identical object, every key part forces a fresh run, the LRU limits,
// the uncached functions, and the freeze switch.
import { it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const isUS = inject('country') === 'us';
const SIM = 'shared/core/projection/simulate.js';
const usIt = isUS ? it : it.skip;

// A world on the guard-off state (US: no cliff plan is computed), with the simulate module and the store.
async function setup(patch = {}) {
  const w = await world();
  const st = await w.setState(isUS ? { cliffGuardEnabled: false, ...patch } : patch);
  const sim = await w.load(SIM);
  const store = await w.load('shared/core/store.js');
  return { w, st, sim, store };
}

// US: installs `plan` as the kept plan of the store's state object (planForState's identity rule returns it).
async function installPlan(w, plan) {
  const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
  const store = await w.load('shared/core/store.js');
  cliffPlanStore.plan = plan;
  cliffPlanStore.forState = store.state;
  cliffPlanStore.year = 2026;
}
async function clearPlan(w) {
  const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
  cliffPlanStore.plan = null;
  cliffPlanStore.forState = null;
  cliffPlanStore.year = null;
}

const PLAN_70 = () => ({ intents: { 70: { kind: 'under', line: 'aca400', ret: 'H' } }, family: 'aca' });

it('hits return the identical object', async () => {
  const { sim } = await setup();
  expect(sim.simulate()).toBe(sim.simulate());
  expect(sim.simulate(60, 58)).toBe(sim.simulate(60, 58));
  expect(sim.runHistoricalCycles()).toBe(sim.runHistoricalCycles());
  expect(sim.monteCarloSummary(2)).toBe(sim.monteCarloSummary(2));
});

it('simulate() shares the entry of its resolved ages', async () => {
  const { sim, store } = await setup();
  const a = sim.simulate();
  expect(sim.simulate(store.state.retireAgeA, store.state.retireAgeB)).toBe(a);
});

it('a state change misses, and changing back hits', async () => {
  const { w, st, sim, store } = await setup();
  const a = sim.simulate();
  await w.setState({ ...st, spending: st.spending + 1000 });
  const b = sim.simulate();
  expect(b).not.toBe(a);
  store.assignState({ ...st });
  expect(sim.simulate()).toBe(a);
});

usIt('an equal plan in a new object is a hit', async () => {
  const { w, sim } = await setup();
  const P = PLAN_70();
  await installPlan(w, P);
  const a = sim.simulate();
  await installPlan(w, structuredClone(P));
  expect(sim.simulate()).toBe(a);
});

usIt('each key part forces a fresh run', async () => {
  const { w, sim } = await setup();
  const { optimizerState } = await w.load('us/core/optimizer-state.js');
  const { testHooks } = await w.load('us/core/test-hooks.js');
  let a = sim.simulate();

  w.setTaxYear(2027);
  expect(sim.simulate()).not.toBe(a);
  w.setTaxYear(2026);
  expect(sim.simulate()).toBe(a);

  await installPlan(w, PLAN_70());
  expect(sim.simulate()).not.toBe(a);
  await clearPlan(w);
  a = sim.simulate();

  // plan null (planMode off) against an empty plan (planMode apply)
  await installPlan(w, { intents: {} });
  expect(sim.simulate()).not.toBe(a);
  await clearPlan(w);
  a = sim.simulate();

  for (const field of ['rothBracketByAge', 'withdrawalMixByAge']) {
    optimizerState[field] = new Map([[60, 22]]);
    const m22 = sim.simulate();
    expect(m22).not.toBe(a);
    // the same entries in a new Map hit; different entries miss
    optimizerState[field] = new Map([[60, 22]]);
    expect(sim.simulate()).toBe(m22);
    optimizerState[field] = new Map([[60, 24]]);
    expect(sim.simulate()).not.toBe(m22);
    optimizerState[field] = null;
    a = sim.simulate();
  }

  testHooks.testInhNoNeedAdj = true;
  expect(sim.simulate()).not.toBe(a);
  testHooks.testInhNoNeedAdj = false;
  a = sim.simulate();

  testHooks.testInhForce = { year: 1, slot: 0, x: 1000 };
  expect(sim.simulate()).not.toBe(a);
  testHooks.testInhForce = null;
  a = sim.simulate();
  expect(sim.simulate()).toBe(a);
});

it('arguments are part of the key', async () => {
  const { sim } = await setup();
  expect(sim.simulate(60, 58)).not.toBe(sim.simulate(61, 58));
  expect(sim.monteCarloSummary(2)).not.toBe(sim.monteCarloSummary(3));
});

// Fills a cache to its limit with distinct calls run(0) .. run(limit - 1), touches entry 0, adds run(limit), and checks
// that entry 0 survived, the newest is a hit and entry 1 (the least recently used) was evicted.
function checkLru(limit, run) {
  const kept = [];
  for (let i = 0; i < limit; i++) kept.push(run(i));
  expect(run(0)).toBe(kept[0]);
  const newest = run(limit);
  expect(run(0)).toBe(kept[0]);
  expect(run(limit)).toBe(newest);
  expect(run(1)).not.toBe(kept[1]);
}

it('least recently used is evicted (sim)', async () => {
  const { st, sim } = await setup();
  expect(sim.RESULT_CACHE_LIMITS).toStrictEqual({ sim: 64, hist: 8, mc: 16 });
  expect(Object.isFrozen(sim.RESULT_CACHE_LIMITS)).toBe(true);
  checkLru(sim.RESULT_CACHE_LIMITS.sim, (i) => sim.simulate(st.ageA + (i % 20), st.ageB + Math.floor(i / 20)));
});

it('least recently used is evicted (mc)', async () => {
  const { sim } = await setup();
  checkLru(sim.RESULT_CACHE_LIMITS.mc, (i) => sim.monteCarloSummary(2 + i));
});

it('least recently used is evicted (hist)', async () => {
  const { st, sim, store } = await setup();
  const states = [];
  const run = (i) => {
    if (!states[i]) states[i] = { ...st, spending: st.spending + 1000 * i };
    store.assignState(states[i]);
    return sim.runHistoricalCycles();
  };
  checkLru(sim.RESULT_CACHE_LIMITS.hist, run);
});

it('raw functions are uncached', async () => {
  const { w, sim } = await setup();
  const e = await engine(w);
  expect(e.simulateRaw()).not.toBe(e.simulateRaw());
  expect(e.runHistoricalCyclesRaw()).not.toBe(e.runHistoricalCyclesRaw());
  const fresh = sim.simulateFresh();
  const cached = sim.simulate();
  expect(fresh).not.toBe(cached);
  expect(fresh.rows).toStrictEqual(cached.rows);
  expect(sim.runHistoricalCyclesFresh()).not.toBe(sim.runHistoricalCycles());
});

it('freezing', async () => {
  const { st, sim } = await setup();
  sim.assignFreezeResults(true);
  try {
    // Retiring at 65 with wages: the US run keeps an IRMAA appeal table (typed arrays).
    const r = sim.simulate(65, 65);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.rows)).toBe(true);
    expect(Object.isFrozen(r.rows[0])).toBe(true);
    const write = () => {
      'use strict';
      r.rows[0].total = 1;
    };
    expect(write).toThrow(TypeError);
    expect(Object.isFrozen(r.estate)).toBe(true);
    if (isUS) {
      const appeal = Object.getOwnPropertyDescriptor(r, 'irmaaAppeal').value;
      expect(appeal === null).toBe(false);
      expect(Object.isFrozen(appeal)).toBe(true);
      expect(ArrayBuffer.isView(appeal.eventA)).toBe(true);
      expect(Object.isFrozen(appeal.eventA)).toBe(false);
      expect(Object.isFrozen(appeal.eventB)).toBe(false);
    }
    // Later runs still work: freezing reached nothing the engine writes again.
    expect(Object.isFrozen(sim.simulate(st.retireAgeA + 1, st.retireAgeB + 1).rows[0])).toBe(true);
    expect(Object.isFrozen(sim.runHistoricalCycles().cycles[0].rows[0])).toBe(true);
    expect(Object.isFrozen(sim.monteCarloSummary(2).bands.real[0])).toBe(true);
  } finally {
    sim.assignFreezeResults(false);
  }
  expect(Object.isFrozen(sim.simulate(st.retireAgeA + 2, st.retireAgeB).rows[0])).toBe(false);
});
