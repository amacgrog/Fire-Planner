// Ratchet for the stateless engine: runs are repeatable, independent of order, never write to the state,
// and a historical run planned nested equals one planned after a refresh. Holds on today's code (spec section 3).
import { it, expect, afterAll, inject } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const require = createRequire(import.meta.url);
const { PLAN_G58, LOAN, DEPLETING, households } = require('../../helpers/plan-households.js');

const country = inject('country');
const isUS = country === 'us';
const c = makeCounter();

const LISTS = {
  children: [{ birthYear: 2015 }],
  oneTimeIncome: [{ amount: 50000, age: 60, flat: true }],
  loans: [LOAN],
  incomeSources: [{ amount: 20000, startAge: 55, endAge: 66, followGrowth: true, growth: 3 }],
  extraExpenses: [{ amount: 8000, startAge: 53, endAge: 80, followGrowth: true, growth: 2.5 }],
  lumpExpenses: [{ amount: 30000, age: 58, repeatEvery: 10, untilAge: 90, flat: false, followGrowth: true, growth: 2.5 }],
  spendingTiers: [{ amount: 70000, startAge: 65, endAge: 120, followGrowth: true, growth: 2.5 }],
};

const SCENARIOS = households(isUS);

const patchOf = (name) => SCENARIOS.find(([n]) => n === name)[1];

// Each pair: two households and, optionally, the tax year the second runs under (US). The last pairs vary the memo keys:
// a different inflation (the taxIndexFactor memo) and, in the US, a different tax year between the runs.
const PAIRS = [
  ...(isUS
    ? [['default', 'survivor'], ['child', 'ny'], ['PLAN_G58', 'default']]
    : [['default', 'survivor'], ['child', 'qc'], ['ns', 'single with OAS']]
  ).map(([na, nb]) => ({ label: na + '/' + nb, pa: patchOf(na), pb: patchOf(nb) })),
  { label: 'inflation 4', pa: patchOf('default'), pb: { ...patchOf('default'), inflation: 4 } },
  ...(isUS ? [{ label: 'tax year 2027', pa: patchOf('default'), pb: patchOf('default'), yb: 2027 }] : []),
];

async function setup(w, patch) {
  return w.setState(patch);
}
function runAll(eng, HIST) {
  return JSON.stringify([eng.simulate(), eng.simulateHistorical((y) => HIST[(y + 10) % HIST.length])]);
}
async function start(patch) {
  const w = await world();
  const { HIST } = await w.load('shared/core/projection/historical-data.js');
  const eng = await engine(w);
  await setup(w, patch);
  return { w, HIST, eng };
}
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

it('identical inputs give identical output', async () => {
  for (const [name, patch] of SCENARIOS) {
    const { w, HIST, eng } = await start(patch);
    if (isUS && name.startsWith('PLAN_')) {
      const { refreshCliffPlan } = await w.load('us/core/cliff-plan/planning.js');
      const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
      refreshCliffPlan();
      c.expect(Object.keys(cliffPlanStore.plan.intents).length > 0, name + ' plans').toBe(true);
    }
    const a = runAll(eng, HIST);
    const b = runAll(eng, HIST);
    c.expect(b, name).toBe(a);
  }
});

it('order does not matter', async () => {
  for (const { label, pa, pb, yb } of PAIRS) {
    // The first household always runs under the default year, the second under yb when given.
    const yearA = (w) => (yb ? w.setTaxYear(2026) : undefined);
    const yearB = (w) => (yb ? w.setTaxYear(yb) : undefined);
    let a1, b1, a2, a0, b0;
    {
      const { w, HIST, eng } = await start(pa);
      a1 = runAll(eng, HIST);
      yearB(w);
      await setup(w, pb);
      b1 = runAll(eng, HIST);
      yearA(w);
      await setup(w, pa);
      a2 = runAll(eng, HIST);
    }
    {
      const { w, HIST, eng } = await start(pb);
      yearB(w);
      await setup(w, pb);
      b0 = runAll(eng, HIST);
      yearA(w);
      await setup(w, pa);
      a0 = runAll(eng, HIST);
    }
    c.expect(a2, label + ' first again').toBe(a1);
    c.expect(a0, label + ' second world').toBe(a1);
    c.expect(b0, label + ' second household, second world').toBe(b1);
  }
});

it('a deep-frozen state runs', async () => {
  const patches = isUS
    ? [['lists', LISTS], ['PLAN_G58 lists', { ...PLAN_G58, ...LISTS, children: [] }]]
    : [['lists', LISTS]];
  for (const [name, patch] of patches) {
    const { w, HIST, eng } = await start(patch);
    if (isUS && name.startsWith('PLAN_')) {
      const { refreshCliffPlan } = await w.load('us/core/cliff-plan/planning.js');
      const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
      refreshCliffPlan();
      c.expect(Object.keys(cliffPlanStore.plan.intents).length > 0, name + ' plans').toBe(true);
    }
    const store = await w.load('shared/core/store.js');
    const s = store.state;
    for (const k of Object.keys(LISTS)) {
      if (name === 'PLAN_G58 lists' && k === 'children') continue;
      c.expect(s[k].length > 0, name + ' ' + k + ' non-empty').toBe(true);
    }
    deepFreeze(s);
    expect(() => runAll(eng, HIST)).not.toThrow();
    c.tick();
    c.expect(store.state, name + ' same state').toBe(s);
    c.expect(Object.isFrozen(s), name + ' frozen').toBe(true);
  }
});

it('the analysis functions run variants on copies of a deep-frozen base', async () => {
  const patches = isUS
    ? [['lists depleting', { ...LISTS, ...DEPLETING }], ['PLAN_G58 lists', { ...PLAN_G58, ...LISTS, children: [] }]]
    : [['lists depleting', { ...LISTS, ...DEPLETING }]];
  for (const [name, patch] of patches) {
    const { w } = await start(patch);
    if (isUS) {
      const { refreshCliffPlan } = await w.load('us/core/cliff-plan/planning.js');
      refreshCliffPlan();
    }
    const store = await w.load('shared/core/store.js');
    const { stateContextFor } = await w.load('shared/ui/results/state-context.js');
    const { simulateWith } = await w.load('shared/core/projection/runs.js');
    const { simulateAtRealCagr } = await w.load('shared/core/projection/simulate.js');
    const { SENSITIVITY_LEVERS } = await w.load(`${country}/core/analysis/sensitivity-levers.js`);
    const { analyzeShortfallDrivers } = await w.load(`${country}/core/analysis/shortfall-drivers.js`);
    const { findMinimalSpendingCut, findMinimalRetirementDelay } = await w.load('shared/core/analysis/decisions.js');
    const { UNUSUAL_RANGES, unusualAssumptionImpact } = await w.load('shared/core/inputs/estimates.js');
    const base = deepFreeze(store.state);
    // The UI's factory: one context per variant, with the store's (frozen) state as the plan's identity.
    const contextFor = stateContextFor();
    const selected = simulateWith(contextFor(base));
    if (name.startsWith('lists')) c.expect(selected.depletedAge > 0, name + ' depletes').toBe(true);
    const endValue = (sim, inputs) => sim.rows.at(-1).total / (1 + inputs.inflation / 100);
    for (const l of SENSITIVITY_LEVERS) {
      expect(() => l.run(base, contextFor, endValue), name + ' ' + l.id).not.toThrow();
      c.tick();
    }
    expect(() => findMinimalSpendingCut(selected, base, contextFor), name + ' spending cut').not.toThrow();
    c.tick();
    expect(() => findMinimalRetirementDelay(selected, base, contextFor), name + ' retirement delay').not.toThrow();
    c.tick();
    expect(() => analyzeShortfallDrivers(selected, base, contextFor), name + ' shortfall').not.toThrow();
    c.tick();
    expect(() => [2, 4, 6].map((r) => simulateAtRealCagr(base, contextFor, r)), name + ' real CAGR').not.toThrow();
    c.tick();
    // The parity bundle's call: every range item with an id and both edges, on the current projection.
    for (const item of UNUSUAL_RANGES.filter((it) => it.id && it.min !== undefined && it.max !== undefined)) {
      expect(() => unusualAssumptionImpact(item, selected, base, 'real'), name + ' unusual ' + item.id).not.toThrow();
      c.tick();
    }
    c.expect(store.state, name + ' same state').toBe(base);
  }
});

it('variants of a frozen base that was never planned plan for themselves (US, no refresh)', async () => {
  if (!isUS) return;
  const { w, HIST, eng } = await start({ ...PLAN_G58, ...LISTS, children: [] });
  // No refreshCliffPlan here: no kept plan belongs to the store's state, so every variant goes through planForState(variant).
  const store = await w.load('shared/core/store.js');
  const { stateContextFor } = await w.load('shared/ui/results/state-context.js');
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { SENSITIVITY_LEVERS } = await w.load('us/core/analysis/sensitivity-levers.js');
  const { findMinimalSpendingCut } = await w.load('shared/core/analysis/decisions.js');
  const { UNUSUAL_RANGES, unusualAssumptionImpact } = await w.load('shared/core/inputs/estimates.js');
  const base = deepFreeze(store.state);
  const contextFor = stateContextFor();
  const selected = simulateWith(contextFor(base));
  const endValue = (sim, inputs) => sim.rows.at(-1).total / (1 + inputs.inflation / 100);
  for (const l of SENSITIVITY_LEVERS) {
    expect(() => l.run(base, contextFor, endValue), 'no-refresh ' + l.id).not.toThrow();
    c.tick();
  }
  expect(() => findMinimalSpendingCut(selected, base, contextFor), 'no-refresh spending cut').not.toThrow();
  c.tick();
  for (const item of UNUSUAL_RANGES.filter((it) => it.id && it.min !== undefined && it.max !== undefined)) {
    expect(() => unusualAssumptionImpact(item, selected, base, 'real'), 'no-refresh unusual ' + item.id).not.toThrow();
    c.tick();
  }
  expect(() => runAll(eng, HIST), 'no-refresh runs').not.toThrow();
  c.tick();
  c.expect(store.state, 'no-refresh same state').toBe(base);
});

it('nested planning gives the same historical run (US)', async () => {
  if (!isUS) return;
  const pathOf = (HIST) => (y) => HIST[(y + 18) % HIST.length];
  const w1 = await world();
  const { HIST: H1 } = await w1.load('shared/core/projection/historical-data.js');
  const e1 = await engine(w1);
  const { planStats } = await w1.load('us/core/projection/engine-state.js');
  await setup(w1, PLAN_G58);
  const intentYears0 = planStats.intentYears;
  const applied0 = planStats.applied;
  const run1 = e1.simulateHistoricalRaw(pathOf(H1));
  const json1 = JSON.stringify(run1);
  // Offset 18 (scanned): the nested plan is carried out in 3 years, so a missing or wrong plan would change the run.
  c.expect(planStats.intentYears > intentYears0, 'nested run planned').toBe(true);
  c.expect(planStats.applied > applied0, 'nested plan was applied').toBe(true);
  c.expect(run1.rows.some((r) => r.cliffChoice), 'a row carries cliffChoice').toBe(true);

  const w2 = await world();
  const { HIST: H2 } = await w2.load('shared/core/projection/historical-data.js');
  const e2 = await engine(w2);
  await setup(w2, PLAN_G58);
  const { refreshCliffPlan } = await w2.load('us/core/cliff-plan/planning.js');
  refreshCliffPlan();
  const json2 = JSON.stringify(e2.simulateHistoricalRaw(pathOf(H2)));
  c.expect(json2, 'nested equals refreshed').toBe(json1);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(isUS ? 139 : 58);
});
