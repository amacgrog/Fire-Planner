// Ratchet for the stateless engine: runs are repeatable, independent of order, never write to the state,
// and a historical run planned nested equals one planned after a refresh. Holds on today's code (spec section 3).
import { it, expect, afterAll, inject } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const require = createRequire(import.meta.url);
const { scenarios } = require('../../snapshot_scenarios.js');
const { legacyToAccounts } = require('../../legacy_balances.js');

const country = inject('country');
const isUS = country === 'us';
const c = makeCounter();

const ACCOUNTS0 = { tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, rothIraBasisA: 0, rothIraBasisB: 0 };
const PLAN_G58 = {
  singlePerson: true, children: [], ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58, lifeExpectancyA: 95, lifeExpectancyB: 95,
  acaEnabled: true, acaEnhanced: false, stateTax: 'tx', rothConvEnabled: true, rothConvBracket: 22, rothConvStartAge: 58,
  rothConvEndAge: 72, withdrawalMixEnabled: false, smoothWithdrawals: false, ruleOf55A: false, ruleOf55B: false,
  sepp72tK401A: false, taxable: 300000, spending: 60000, ...ACCOUNTS0, trad401kA: 1500000, rothIraA: 200000,
};
const g62 = isUS ? scenarios(true).find((s) => s.name === 'std G mfj 62 aca 400% smooth') : null;
const PLAN_G62 = isUS ? legacyToAccounts(g62.patch, null) : null;

const LOAN = { principal: 40000, balance: 30000, rate: 6, term: 10, extra: 500 };
const LISTS = {
  children: [{ birthYear: 2015 }],
  oneTimeIncome: [{ amount: 50000, age: 60, flat: true }],
  loans: [LOAN],
  incomeSources: [{ amount: 20000, startAge: 55, endAge: 66, followGrowth: true, growth: 3 }],
  extraExpenses: [{ amount: 8000, startAge: 53, endAge: 80, followGrowth: true, growth: 2.5 }],
  lumpExpenses: [{ amount: 30000, age: 58, repeatEvery: 10, untilAge: 90, flat: false, followGrowth: true, growth: 2.5 }],
  spendingTiers: [{ amount: 70000, startAge: 65, endAge: 120, followGrowth: true, growth: 2.5 }],
};
const SURVIVOR = { survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 80 };
const CHILD = { children: [{ birthYear: 2015 }] };

const SCENARIOS = isUS
  ? [
      ['default', {}],
      ['survivor', SURVIVOR],
      ['child', CHILD],
      ['inherited IRA', { oneTimeIncome: [{ age: 50, amount: 100000, kind: 'inheritedTrad' }] }],
      ['self-employment', { incomeKindA: 'self' }],
      ['wages lump', { oneTimeIncome: [{ age: 50, amount: 50000, kind: 'wages', owner: 'A' }] }],
      ['loan', { loans: [LOAN] }],
      ['ny', { stateTax: 'ny' }],
      ['ca', { stateTax: 'ca' }],
      ['pa', { stateTax: 'pa' }],
      ['PLAN_G58', PLAN_G58],
      ['PLAN_G62', PLAN_G62],
    ]
  : [
      ['default', {}],
      ['survivor', SURVIVOR],
      ['child', CHILD],
      ['qc', { province: 'qc' }],
      ['ns', { province: 'ns' }],
      ['mb', { province: 'mb' }],
      ['single with OAS', { singlePerson: true, ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66 }],
    ];

const PAIRS = isUS
  ? [['default', 'survivor'], ['child', 'ny'], ['PLAN_G58', 'default']]
  : [['default', 'survivor'], ['child', 'qc'], ['ns', 'single with OAS']];

const patchOf = (name) => SCENARIOS.find(([n]) => n === name)[1];

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
  for (const [na, nb] of PAIRS) {
    const pa = patchOf(na);
    const pb = patchOf(nb);
    let a1, b1, a2, a0, b0;
    {
      const { w, HIST, eng } = await start(pa);
      a1 = runAll(eng, HIST);
      await setup(w, pb);
      b1 = runAll(eng, HIST);
      await setup(w, pa);
      a2 = runAll(eng, HIST);
    }
    {
      const { w, HIST, eng } = await start(pb);
      b0 = runAll(eng, HIST);
      await setup(w, pa);
      a0 = runAll(eng, HIST);
    }
    c.expect(a2, na + ' after ' + nb).toBe(a1);
    c.expect(a0, na + ' second world').toBe(a1);
    c.expect(b0, nb + ' second world').toBe(b1);
  }
});

it('a deep-frozen state runs', async () => {
  const patches = isUS
    ? [['lists', LISTS], ['PLAN_G58 lists', { ...PLAN_G58, ...LISTS, children: [] }]]
    : [['lists', LISTS]];
  for (const [name, patch] of patches) {
    const { w, HIST, eng } = await start(patch);
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

it('nested planning gives the same historical run (US)', async () => {
  if (!isUS) return;
  const pathOf = (HIST) => (y) => HIST[(y + 10) % HIST.length];
  const w1 = await world();
  const { HIST: H1 } = await w1.load('shared/core/projection/historical-data.js');
  const e1 = await engine(w1);
  const { planStats } = await w1.load('us/core/projection/engine-state.js');
  await setup(w1, PLAN_G58);
  const intentYears0 = planStats.intentYears;
  const run1 = e1.simulateHistoricalRaw(pathOf(H1));
  const json1 = JSON.stringify(run1);
  // The plan was made nested and followed: its intent years were counted (on this path they are skipped as ineligible).
  c.expect(planStats.intentYears > intentYears0, 'nested run followed a non-empty plan').toBe(true);

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
  expect(c.total).toBe(isUS ? 44 : 26);
});
