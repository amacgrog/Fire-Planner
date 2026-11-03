// S4 Task 11 (ruling 7): ageRanges, the bracket card's age lists (src/us/ui/results/roth-optimizer.js): distinct ages, ascending,
// consecutive runs joined with a hyphen and the runs with ", "; and (ruling 8's fallback) scheduleWhy, the conversion schedule's why
// cell. The module touches no DOM at load.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

it('ageRanges', async () => {
  const w = await world();
  const { ageRanges } = await w.load('us/ui/results/roth-optimizer.js');
  expect(ageRanges([60, 61, 62])).toBe('60-62');
  expect(ageRanges([59, 61, 62, 63])).toBe('59, 61-63');
  expect(ageRanges([60])).toBe('60');
  expect(ageRanges([])).toBe('');
  expect(ageRanges([62, 60, 61, 61])).toBe('60-62'); // unsorted, a repeat
  expect(ageRanges([64, 60, 66, 65])).toBe('60, 64-66');
});

// Ruling 8's fallback (the cliffChoice "Filled to" test): no household converts in a phased fill year (searched 2026-11-03: the
// fixture, the gap households of conversion-plan.test.js and its two-return couple at 75 and 100, the scan grid's 384
// converting households in both withdrawal modes), so the why cell's formatter is fed constructed rows.
it('scheduleWhy: the why cell', async () => {
  const w = await world();
  const { scheduleWhy } = await w.load('us/ui/results/roth-optimizer.js');
  // a phased fill year that converts
  expect(scheduleWhy({ conversionAmount: 12000, cliffChoice: 'filled to ACA 400% line' }, 22)).toBe('Filled to ACA 400% line');
  expect(scheduleWhy({ conversionAmount: 12000, cliffChoice: 'stayed under ACA 400% line' }, 22)).toBe('Stayed under ACA 400% line');
  // a sized year's own target wins over cliffChoice
  expect(scheduleWhy({ conversionAmount: 12000, convChoice: 'the 12% bracket', cliffChoice: 'filled to ACA 400% line' }, 22)).toBe('The 12% bracket');
  // neither: the flat bracket
  expect(scheduleWhy({ conversionAmount: 12000 }, 10)).toBe('Fill to the top of the 10% bracket');
});
