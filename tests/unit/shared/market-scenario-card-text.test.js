// The market scenario card's crash-row summaries and the Depression entry's second-fall note (hand-written literals)
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const COUPLE = { ageA: 55, ageB: 53, singlePerson: false, lifeExpectancyA: 90, lifeExpectancyB: 95, retireAgeA: 62, returnRate: 7 };
const SINGLE = { ageA: 55, singlePerson: true, lifeExpectancyA: 90, retireAgeA: 62, returnRate: 7 };

async function setup() {
  const w = await world();
  return await w.load('shared/core/format/market-scenario-card-text.js');
}
const ROW = { age: 75, drop: 30, fallYears: 2, recoverPct: 60, recoverYears: 4, preset: 'custom', presetShape: false, inflation: 1, bondReturn: 2 };
const dep = (age, r) => ({ age, preset: '1929', presetShape: true, inflation: -6.4, bondReturn: 3.7, fallYears: 4, recoverYears: 4, ...r });

it('crashRowSummary: the fall and recovery, or the two-fall name', async () => {
  const S = await setup();
  expect(S.crashRowSummary(ROW)).toBe('30% at 75, 60% back over 4 yrs');
  expect(S.crashRowSummary({ ...ROW, recoverPct: 0 })).toBe('30% at 75, no recovery');
  expect(S.crashRowSummary({ ...ROW, recoverPct: 100, recoverYears: 1 })).toBe('30% at 75, all back over 1 yr');
  expect(S.crashRowSummary({ ...ROW, recoverPct: 100, recoverYears: 3 })).toBe('30% at 75, all back over 3 yrs');
  expect(S.crashRowSummary(dep(60, { drop: 73, recoverPct: 44 }))).toBe('Like 1929–44 at 60 (two falls)');
});

it('secondLegNote: the second fall at its age, after the plan ends, or none', async () => {
  const S = await setup();
  expect(S.secondLegNote(dep(60, { drop: 73, recoverPct: 44 }), COUPLE)).toBe('Then a second fall in 1937 (age 68): 40% drop, 15% back over 7 years.');
  expect(S.secondLegNote(dep(60, { drop: 76, recoverPct: 30 }), { ...COUPLE, returnRate: 10 })).toBe('Then a second fall in 1937 (age 68): 41% drop, no recovery.');
  expect(S.secondLegNote(dep(60, { drop: 65, recoverPct: 100 }), { ...COUPLE, returnRate: 0 })).toBe('Then a second fall in 1937 (age 68): 35% drop, all back over 7 years.');
  expect(S.secondLegNote(dep(85, { drop: 73, recoverPct: 44 }), SINGLE)).toBe('Then a second fall in 1937 (age 93), after the plan ends.');
  expect(S.secondLegNote({ ...ROW, preset: '2008' }, COUPLE)).toBe(null);
  expect(S.secondLegNote(ROW, COUPLE)).toBe(null);
});
