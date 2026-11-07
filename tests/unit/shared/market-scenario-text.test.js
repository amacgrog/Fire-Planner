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
    '35% drop at age 98: after the plan ends, 60% recovered over 4 years, inflation 0.1% and bonds +20% a year during the fall; bonds first in down years',
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
