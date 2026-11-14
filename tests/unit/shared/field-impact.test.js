// A field's realistic error in spending-room dollars: the nudges, the edge slope and the shown rounding.
import { it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';

const IMPACT = 'shared/core/analysis/field-impact.js';
const isUS = inject('country') === 'us';
const usIt = isUS ? it : it.skip;

const DRAW = { singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 74, incomeA: 0, inflation: 0, returnRate: 0,
  bondReturn: 0, hysaRate: 0, dividendYield: 0, healthcare: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0,
  tenure: 'rent', rent: 0, taxable: 0, cash: 0, emergencyCash: 0, bondYears: 0, trad401kA: 0,
  rothIraA: 400000, rothIraBasisA: 400000 };

async function draw(patch) {
  const w = await world();
  const state = await w.setState({ ...DRAW, ...patch });
  const { refreshCliffPlan } = await w.load('us/core/cliff-plan/planning.js');
  refreshCliffPlan();
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const m = await w.load(IMPACT);
  return { state, ctxFor, m };
}

usIt('setup measures the edge slope', async () => {
  const { state, ctxFor, m } = await draw({ spending: 30000 });
  const { runs, ...rest } = m.impactSetup(state, ctxFor);
  expect(rest).toStrictEqual({ d0: 10000, m0: 0, slope: 10 });
  expect(runs > 2).toBe(true);
});
usIt('a balance moves the room by a tenth of itself per year', async () => {
  const { state, ctxFor, m } = await draw({ spending: 30000 });
  const setup = m.impactSetup(state, ctxFor);
  expect(m.fieldImpact(state, 'rothIraA', 'money', undefined, setup, ctxFor)).toBe(4000);
});
usIt('spending moves the room by its own nudge', async () => {
  const { state, ctxFor, m } = await draw({ spending: 30000 });
  const setup = m.impactSetup(state, ctxFor);
  expect(m.fieldImpact(state, 'spending', 'money', undefined, setup, ctxFor)).toBe(3000);
});
usIt('a longer life is measured at the base slope', async () => {
  const { state, ctxFor, m } = await draw({ spending: 30000 });
  const setup = m.impactSetup(state, ctxFor);
  expect(m.fieldImpact(state, 'lifeExpectancyA', 'age', undefined, setup, ctxFor)).toBe(8000);
});
usIt('a zero balance has no effect', async () => {
  const { state, ctxFor, m } = await draw({ spending: 30000 });
  const setup = m.impactSetup(state, ctxFor);
  expect(m.fieldImpact(state, 'trad401kA', 'money', undefined, setup, ctxFor)).toBe(0);
});
usIt('setup on a plan that runs out', async () => {
  const { state, ctxFor, m } = await draw({ spending: 45000 });
  const { runs, ...rest } = m.impactSetup(state, ctxFor);
  expect(rest).toStrictEqual({ d0: -5000, m0: 0, slope: 10 });
});
usIt('setup on an unfixable plan', async () => {
  const { state, ctxFor, m } = await draw({ spending: 30000, rothIraA: 100000, rothIraBasisA: 100000, rent: 1000, rentGrowth: 0 });
  const { runs, ...rest } = m.impactSetup(state, ctxFor);
  expect(rest).toStrictEqual({ d0: -30000, m0: -20000, slope: 10 });
});

async function nudged(patch, id, kind, dir, bounds) {
  const w = await world();
  const state = await w.setState(patch);
  const before = structuredClone(state);
  const { nudgedInputs } = await w.load(IMPACT);
  const out = nudgedInputs(state, id, kind, dir, bounds);
  expect(state).toStrictEqual(before);
  return out;
}
it('nudgedInputs: money is a tenth of the value, exact', async () => {
  expect((await nudged({ spending: 30000 }, 'spending', 'money', 1)).spending).toBe(33000);
  expect((await nudged({ spending: 30000 }, 'spending', 'money', -1)).spending).toBe(27000);
});
it('nudgedInputs: a clamp that leaves the value gives null', async () => {
  expect(await nudged({ mortgageYears: 40 }, 'mortgageYears', 'age', 1, [1, 40])).toBe(null);
  expect(await nudged({ basisRatio: 100 }, 'basisRatio', 'share', 1)).toBe(null);
});
it('nudgedInputs: a later age raises the retire age and the life expectancy with it', async () => {
  const v = await nudged({ ageA: 65, retireAgeA: 65, lifeExpectancyA: 74 }, 'ageA', 'age', 1);
  expect([v.ageA, v.retireAgeA, v.lifeExpectancyA]).toStrictEqual([67, 67, 74]);
  const u = await nudged({ ageA: 65, retireAgeA: 65, lifeExpectancyA: 74 }, 'ageA', 'age', -1);
  expect([u.ageA, u.retireAgeA, u.lifeExpectancyA]).toStrictEqual([63, 65, 74]);
});
it('nudgedInputs: the retire age and life expectancy stay in their linked range', async () => {
  const s = { ageA: 65, retireAgeA: 66, lifeExpectancyA: 74 };
  expect((await nudged(s, 'retireAgeA', 'age', -1)).retireAgeA).toBe(65);
  expect((await nudged({ ...s, lifeExpectancyA: 67 }, 'lifeExpectancyA', 'age', -1)).lifeExpectancyA).toBe(66);
  expect((await nudged({ ...s, lifeExpectancyA: 109 }, 'lifeExpectancyA', 'age', 1)).lifeExpectancyA).toBe(110);
});
it('nudgedInputs: shares clamp to 100 and rates floor at 0', async () => {
  expect((await nudged({ basisRatio: 95 }, 'basisRatio', 'share', 1)).basisRatio).toBe(100);
  expect((await nudged({ mortgageRate: 0.5 }, 'mortgageRate', 'rate', -1)).mortgageRate).toBe(0);
});

it('shownImpact', async () => {
  const w = await world();
  const { shownImpact } = await w.load(IMPACT);
  for (const [x, o] of [[499, 0], [500, 500], [1649, 1600], [1650, 1700]]) expect(shownImpact(x)).toBe(o);
});

it('the edge method keeps the exact order: default household', async () => {
  const w = await world();
  const state = await w.setState({});
  if (isUS) (await w.load('us/core/cliff-plan/planning.js')).refreshCliffPlan();
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { findSpendingRoom } = await w.load('shared/core/analysis/spending-room.js');
  const { nudgedInputs, impactSetup, fieldImpact } = await w.load(IMPACT);
  const base = findSpendingRoom(simulateWith(ctxFor(state)), state, ctxFor).room;
  const setup = impactSetup(state, ctxFor);
  const fields = [[isUS ? 'ssMonthlyA' : 'cppMonthlyA', 'money'], ['retireAgeA', 'age'], ['taxable', 'money'],
    ['mortgageRate', 'rate'], ['incomeA', 'money']];
  const rows = fields.map(([id, kind]) => {
    let exact = 0;
    for (const dir of [1, -1]) {
      const v = nudgedInputs(state, id, kind, dir, undefined);
      if (v === null) continue;
      exact = Math.max(exact, Math.abs(findSpendingRoom(simulateWith(ctxFor(v)), v, ctxFor).room - base));
    }
    return { id, exact, approx: fieldImpact(state, id, kind, undefined, setup, ctxFor) };
  });
  const top = (k) => rows.reduce((a, b) => (b[k] > a[k] ? b : a)).id;
  expect(top('approx')).toBe(top('exact'));
  for (const r of rows) {
    if (r.exact >= 1000) {
      expect(r.approx >= r.exact / 2 && r.approx <= r.exact * 2, `${r.id}: exact ${r.exact}, approx ${r.approx}`).toBe(true);
    }
  }
});
