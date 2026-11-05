// The IRC 219(g) traditional IRA deduction limit and the contribution coverage flags (PR 2 Tasks 1-2).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { usContributions } from '../helpers/us-contributions.js';

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

it('coverage follows any plan money', async () => {
  
  const BASE = { k401PctA: 100, k401PctB: 100, catchupPctA: 0, catchupPctB: 0, iraPctA: 100, iraPctB: 100, megaBackdoor: false, profitSharingPctA: 0, profitSharingPctB: 0, matchA: 0, matchB: 0, k401TypeA: 'roth', k401TypeB: 'roth', iraTypeA: 'traditional', iraTypeB: 'traditional', incomeA: 115000, incomeB: 72000, ageA: 58, ageB: 56 };
  const ARGS = { wageA: 115000, wageB: 72000, age: 58, ageB: 56, singlePerson: false, limitFactor: 1 };
  const run = async (patch, args = {}) => {
    const w = await world();
    await w.setState({ ...BASE, ...patch });
    w.setTaxYear(2026);
    const hooks = await usContributions(w);
    return hooks.retirementContributions({}, { ...ARGS, ...args });
  };
  // The owner case: Roth 401(k) and traditional IRA at 100% for both, ages 58 / 56.
  const r = await run({});
  expect([r.coveredA, r.coveredB]).toStrictEqual([true, true]);
  expect(r.iraTradA).toBe(8600);
  expect(r.iraTradB).toBe(8600);
  expect(r.iraLimitA).toBe(8600);
  expect(r.iraLimitB).toBe(8600);
  // No plan money for A: not covered; B still is.
  const n = await run({ k401PctA: 0, catchupPctA: 0, matchA: 0 });
  expect([n.coveredA, n.coveredB]).toStrictEqual([false, true]);
  // A Solo deferral covers a self-employed A.
  const s = await run({ incomeKindA: 'self' }, { wageA: 0, seA: 100000, seMainA: 100000 });
  expect(s.coveredA).toBe(true);
});
