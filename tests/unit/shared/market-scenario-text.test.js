// describeMarketScenario: the one-line description (hand-computed strings; the data's last year is read as data)
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const INPUTS = { ageA: 55, ageB: 53, singlePerson: false, lifeExpectancyA: 90, lifeExpectancyB: 95 };
const CR = { age: 60, drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, inflation: 0.1, bondReturn: 20 };

async function setup() {
  const w = await world();
  const { describeMarketScenario } = await w.load('shared/core/format/market-scenario-text.js');
  const { HIST } = await w.load('shared/core/projection/historical-data.js');
  return { d: (ms, inputs = INPUTS) => describeMarketScenario(ms, inputs, 2026), last: HIST.at(-1)[0] };
}
const crash = (crashes, order = 'bucket') => ({ kind: 'crash', order, crashes });
const hist = (history, order = 'bucket') => ({ kind: 'history', order, history });

it('a crash with a partial recovery, the fall rates and the bucket order', async () => {
  const { d } = await setup();
  expect(d(crash([CR]))).toBe(
    '35% drop at age 60 (2031) over 2 years, 60% recovered over 4 years, inflation 0.1% and bonds +20% a year during the fall; bonds first in down years',
  );
});

it('the standard order suffix, a one-year fall and a negative bond return', async () => {
  const { d } = await setup();
  expect(d(crash([{ ...CR, fallYears: 1, recoverPct: 100, recoverYears: 1, bondReturn: -18 }], 'standard'))).toBe(
    '35% drop at age 60 (2031) over 1 year, back on the plan\'s line over 1 year, inflation 0.1% and bonds -18% a year during the fall; your normal withdrawal order',
  );
});

it('a crash before the first plan year reads the first age', async () => {
  const { d } = await setup();
  expect(d(crash([{ ...CR, age: 50 }]))).toBe(
    '35% drop at age 55 (2026) over 2 years, 60% recovered over 4 years, inflation 0.1% and bonds +20% a year during the fall; bonds first in down years',
  );
});

it('no recovery', async () => {
  const { d } = await setup();
  expect(d(crash([{ ...CR, recoverPct: 0 }]))).toBe(
    '35% drop at age 60 (2031) over 2 years, no recovery, inflation 0.1% and bonds +20% a year during the fall; bonds first in down years',
  );
});

it('two crashes are joined with "; then "', async () => {
  const { d } = await setup();
  expect(d(crash([CR, { ...CR, age: 70, drop: 20, fallYears: 1, recoverPct: 0, inflation: 5, bondReturn: 3 }]))).toBe(
    '35% drop at age 60 (2031) over 2 years, 60% recovered over 4 years, inflation 0.1% and bonds +20% a year during the fall; then ' +
      '20% drop at age 70 (2041) over 1 year, no recovery, inflation 5% and bonds +3% a year during the fall; bonds first in down years',
  );
});

it('a crash after the plan ends names the age and says so', async () => {
  const { d } = await setup();
  // L = 55 + (95 - 53) = 97
  expect(d(crash([{ ...CR, age: 98 }]))).toBe(
    '35% drop at age 98: after the plan ends; bonds first in down years',
  );
  expect(d(crash([{ ...CR, age: 97 }]))).toContain('at age 97 (2068) over');
});

it('the last age is the single person\'s own life expectancy', async () => {
  const { d } = await setup();
  const single = { ...INPUTS, singlePerson: true };
  expect(d(crash([{ ...CR, age: 91 }]), single)).toContain('at age 91: after the plan ends');
  expect(d(crash([{ ...CR, age: 90 }]), single)).toContain('at age 90 (2061) over');
});

it('history from the start year to the end of the data', async () => {
  const { d, last } = await setup();
  const a2 = 60 + last - 2008;
  expect(d(hist({ startYear: 2008, atAge: 60, endAge: null }))).toBe(
    `real markets 2008\u2013${last} at ages 60\u2013${a2}, then the plan's rates; bonds first in down years`,
  );
});

it('history that starts before the first plan year starts at the first age', async () => {
  const { d, last } = await setup();
  expect(d(hist({ startYear: 2008, atAge: 50, endAge: null }, 'standard'))).toBe(
    `real markets 2013\u2013${last} at ages 55\u2013${55 + last - 2013}, then the plan's rates; your normal withdrawal order`,
  );
});

it('history stops the year before the end age', async () => {
  const { d } = await setup();
  expect(d(hist({ startYear: 2008, atAge: 60, endAge: 63 }))).toBe(
    "real markets 2008\u20132010 at ages 60\u201362, then the plan's rates; bonds first in down years",
  );
});

it('history near the plan end stops at the last plan age', async () => {
  const { d } = await setup();
  expect(d(hist({ startYear: 2008, atAge: 90, endAge: null }))).toBe(
    "real markets 2008\u20132015 at ages 90\u201397, then the plan's rates; bonds first in down years",
  );
});

it('an empty window gives the empty-window text', async () => {
  const { d } = await setup();
  const none = 'real markets from 2008: no real years fall inside the plan; bonds first in down years';
  expect(d(hist({ startYear: 2008, atAge: 100, endAge: null }))).toBe(none);
  expect(d(hist({ startYear: 2008, atAge: 60, endAge: 60 }))).toBe(none);
});

it("kind 'plan' reads the plan's own rates, with either order suffix", async () => {
  const { d } = await setup();
  expect(d({ kind: 'plan', order: 'bucket' })).toBe("your plan's own rates; bonds first in down years");
  expect(d({ kind: 'plan', order: 'standard' })).toBe("your plan's own rates; your normal withdrawal order");
});

it('planLastAge: a single person and a couple whose B outlives A', async () => {
  const w = await world();
  const { planLastAge } = await w.load('shared/core/inputs/plan-last-age.js');
  expect(planLastAge({ ...INPUTS, singlePerson: true })).toBe(90);
  // A: 35 years left, B: 95 - 53 = 42 years left; the loop runs the longer gap from A's age
  expect(planLastAge(INPUTS)).toBe(97);
  expect(planLastAge({ ...INPUTS, lifeExpectancyB: 80 })).toBe(90);
  // a life expectancy below the current age gives no years
  expect(planLastAge({ ...INPUTS, singlePerson: true, lifeExpectancyA: 40 })).toBe(55);
});

it('marketScenarioWindows: the ages the scenario changes', async () => {
  const w = await world();
  const { marketScenarioWindows } = await w.load('shared/core/format/market-scenario-text.js');
  // 35% at 60 over 2 years, 60% back over 4: ages 60..65 inclusive
  expect(marketScenarioWindows(crash([CR]), INPUTS)).toStrictEqual([{ fromAge: 60, toAge: 65 }]);
  // no recovery: the fall alone
  expect(marketScenarioWindows(crash([{ ...CR, recoverPct: 0 }]), INPUTS)).toStrictEqual([{ fromAge: 60, toAge: 61 }]);
  // a crash before the first plan year starts at the first age; the window is capped at the last age (97)
  expect(marketScenarioWindows(crash([{ ...CR, age: 50 }]), INPUTS)).toStrictEqual([{ fromAge: 55, toAge: 60 }]);
  expect(marketScenarioWindows(crash([{ ...CR, age: 95 }]), INPUTS)).toStrictEqual([{ fromAge: 95, toAge: 97 }]);
  // a crash past the last age changes nothing; two windows are not merged
  expect(marketScenarioWindows(crash([{ ...CR, age: 100 }]), INPUTS)).toStrictEqual([]);
  expect(marketScenarioWindows(crash([CR, { ...CR, age: 62, recoverPct: 0 }]), INPUTS)).toStrictEqual([
    { fromAge: 60, toAge: 65 },
    { fromAge: 62, toAge: 63 },
  ]);
  // history 2008 at 60 until 63: ages 60, 61, 62
  expect(marketScenarioWindows(hist({ startYear: 2008, atAge: 60, endAge: 63 }), INPUTS)).toStrictEqual([{ fromAge: 60, toAge: 62 }]);
  // history with no end runs to the data's last year: 2008..2025 is 18 years, ages 60..77
  const { last } = await setup();
  expect(marketScenarioWindows(hist({ startYear: 2008, atAge: 60, endAge: null }), INPUTS)).toStrictEqual([{ fromAge: 60, toAge: 60 + (last - 2008) }]);
  // history starting past the plan's last age: an empty window
  expect(marketScenarioWindows(hist({ startYear: 2008, atAge: 98, endAge: null }), INPUTS)).toStrictEqual([]);
  expect(marketScenarioWindows({ kind: 'plan', order: 'bucket' }, INPUTS)).toStrictEqual([]);
});

it('crashes are described in age order, ties keep list order', async () => {
  const { d } = await setup();
  const a = { ...CR, age: 70, drop: 20 },
    b = { ...CR, age: 62, drop: 30 };
  expect(d(crash([a, b]))).toBe(d(crash([b, a])));
  expect(d(crash([a, b])).indexOf('30% drop')).toBeLessThan(d(crash([a, b])).indexOf('20% drop'));
  const x = { ...CR, age: 62, drop: 10 },
    y = { ...CR, age: 62, drop: 11 };
  expect(d(crash([y, x])).indexOf('11% drop')).toBeLessThan(d(crash([y, x])).indexOf('10% drop'));
  // ages below the current age tie at the current age
  const lo = { ...CR, age: 50, drop: 12 },
    lo2 = { ...CR, age: 40, drop: 13 };
  expect(d(crash([lo, lo2])).indexOf('12% drop')).toBeLessThan(d(crash([lo, lo2])).indexOf('13% drop'));
});

it('unionWindows merges overlapping and adjacent windows on copies', async () => {
  const w = await world();
  const { unionWindows } = await w.load('shared/core/format/market-scenario-text.js');
  expect(unionWindows([])).toStrictEqual([]);
  expect(unionWindows([{ fromAge: 60, toAge: 65 }, { fromAge: 62, toAge: 61 }])).toStrictEqual([{ fromAge: 60, toAge: 65 }]);
  expect(unionWindows([{ fromAge: 70, toAge: 72 }, { fromAge: 60, toAge: 65 }])).toStrictEqual([{ fromAge: 60, toAge: 65 }, { fromAge: 70, toAge: 72 }]);
  expect(unionWindows([{ fromAge: 60, toAge: 65 }, { fromAge: 66, toAge: 68 }])).toStrictEqual([{ fromAge: 60, toAge: 68 }]);
  const input = [{ fromAge: 66, toAge: 68 }, { fromAge: 60, toAge: 65 }];
  unionWindows(input);
  expect(input).toStrictEqual([{ fromAge: 66, toAge: 68 }, { fromAge: 60, toAge: 65 }]);
});
