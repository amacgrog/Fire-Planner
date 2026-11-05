// The IRC 219(g) traditional IRA deduction limit and the contribution coverage flags (PR 2 Tasks 1-2).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

it('iraDeductionLimit phases out and rounds up to $10 with a $200 floor', async () => {
  const w = await world();
  const { iraDeductionLimit: f } = await w.load('us/core/income/ira-deduction.js');
  expect(f(8600, 129000, 129000, 149000)).toBe(8600);
  expect(f(8600, 149000, 129000, 149000)).toBe(0);
  expect(f(8600, 150000, 129000, 149000)).toBe(0);
  expect(f(8600, 139000, 129000, 149000)).toBe(4300);
  expect(f(8600, 139005, 129000, 149000)).toBe(4300);
  expect(f(8600, 148900, 129000, 149000)).toBe(200);
  expect(f(7500, 247000, 242000, 252000)).toBe(3750);
});

it('iraRange picks the range', async () => {
  const w = await world();
  const { iraRange: r } = await w.load('us/core/income/ira-deduction.js');
  expect(r('mfj', true, false, false, 1)).toStrictEqual([129000, 149000]);
  expect(r('mfj', false, true, false, 1)).toStrictEqual([242000, 252000]);
  expect(r('mfj', false, false, false, 1)).toBe(null);
  expect(r('single', true, true, true, 1)).toStrictEqual([81000, 91000]);
  expect(r('single', true, false, false, 1.03)).toStrictEqual([81000 * 1.03, 91000 * 1.03]);
});

it('qss reads the single range', async () => {
  const w = await world();
  const { iraRange: r } = await w.load('us/core/income/ira-deduction.js');
  expect(r('qss', true, false, false, 1)).toStrictEqual([81000, 91000]);
  expect(r('qss', false, true, false, 1)).toBe(null);
});
