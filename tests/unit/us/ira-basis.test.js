// Traditional IRA after-tax basis helpers (US, IRA deduction PR 2, Task 4): opening basis, the pro-rata ratio, and the
// taxable share of an outflow. Everything is hand-computed. Nothing reads these in the year loop yet.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const load = async () => {
  const w = await world();
  return { w, B: await w.load('us/core/accounts/ira-basis.js') };
};
const DOLLARS = [200000, 100000, 0, 0];

it('iraBasisOpening is the IRA balance times the slider, 0 for B when single', async () => {
  const { B } = await load();
  expect(B.iraBasisOpening({ tradIraA: 200000, tradIraBasisPctA: 25, tradIraB: 80000, tradIraBasisPctB: 50, singlePerson: false })).toStrictEqual([50000, 40000]);
  expect(B.iraBasisOpening({ tradIraA: 200000, tradIraBasisPctA: 25, tradIraB: 80000, tradIraBasisPctB: 50, singlePerson: true })).toStrictEqual([50000, 0]);
});

it('iraBasisRatios is basis over dollars, capped at 1, 0 for an empty IRA', async () => {
  const { B } = await load();
  const out = [9, 9];
  B.iraBasisRatios([50000, 30000], [200000, 100000, 20000, 0], out);
  expect(out[0]).toBe(0.25);
  expect(out[1]).toBe(1);
  B.iraBasisRatios([50000, 30000], [200000, 0, 0, 0], out);
  expect(out[1]).toBe(0);
});

it('groupTaxableFraction', async () => {
  const { B } = await load();
  expect(B.groupTaxableFraction([0.25, 0], DOLLARS, [0, 1])).toBe(1 - (0.25 * 200000) / 300000);
  expect(B.groupTaxableFraction([0.25, 0], DOLLARS, [1])).toBe(1);
  expect(B.groupTaxableFraction([0.25, 0], DOLLARS, [])).toBe(1);
  expect(B.groupTaxableFraction([0, 0], DOLLARS, [0, 1])).toBe(1);
});

it('conversionTaxable and conversionGross follow the IRA-first order', async () => {
  const { B } = await load();
  const r = [0.25, 0];
  expect(B.conversionTaxable(r, DOLLARS, null, 100000)).toBe(75000);
  expect(B.conversionTaxable(r, DOLLARS, null, 250000)).toBe(150000 + 50000);
  expect(B.conversionGross(r, DOLLARS, null, 75000)).toBe(100000);
  expect(B.conversionGross(r, DOLLARS, null, 200000)).toBe(250000);
});

it('an excluded IRA converts nothing, so the 401(k)s come first', async () => {
  const { B } = await load();
  expect(B.conversionTaxable([0.25, 0], DOLLARS, [true, false, false, false], 50000)).toBe(50000);
  expect(B.conversionGross([0.25, 0], DOLLARS, [true, false, false, false], 50000)).toBe(50000);
});

it('mixed partners use the blended ratio', async () => {
  const { B } = await load();
  // IRAs 100000 (ratio 0.5) and 100000 (ratio 0): blended 0.25, so taxable 0.75 of the segment.
  const d = [100000, 0, 100000, 0];
  expect(B.conversionTaxable([0.5, 0], d, null, 100000)).toBe(75000);
  expect(B.conversionGross([0.5, 0], d, null, 75000)).toBe(100000);
});

it('an all-basis segment converts whole, then the 401(k)s', async () => {
  const { B } = await load();
  expect(B.conversionGross([1, 0], DOLLARS, null, 0)).toBe(200000);
  expect(B.conversionGross([1, 0], DOLLARS, null, 30000)).toBe(230000);
  expect(B.conversionTaxable([1, 0], DOLLARS, null, 250000)).toBe(50000);
});

it('zero ratios return the input unchanged', async () => {
  const { B } = await load();
  expect(B.conversionTaxable([0, 0], DOLLARS, null, 123456.789)).toBe(123456.789);
  expect(B.conversionGross([0, 0], DOLLARS, null, 123456.789)).toBe(123456.789);
  expect(B.groupTaxableFraction([0, 0], DOLLARS, [0, 1])).toBe(1);
});

it('bad basis falls back', async () => {
  const w = await world();
  const norm = await w.load('us/ui/inputs/normalize-state.js');
  expect(norm.normalizeState({ tradIraBasisPctA: 140 }).tradIraBasisPctA).toBe(100);
  expect(norm.normalizeState({ tradIraBasisPctA: 'x' }).tradIraBasisPctA).toBe(0);
  expect(norm.normalizeState({ tradIraBasisPctB: -5 }).tradIraBasisPctB).toBe(0);
});
