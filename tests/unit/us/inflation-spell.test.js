// Feedback C3: an inflation spell in the US engine. Plan inflation 0, so the plan's factor is exactly 1 and a spell's factor is
// the spell's own product: a year's inflation raises the next year's prices, so a 25% spell in years 2-3 gives 1, 1, 1, 1.25,
// 1.5625, then 1.5625 for good. Everything entered in today's dollars (spending, Social Security) follows it; wages do not.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

// A single retiree at 65 (2026): 2,000 a month of Social Security from 65 (24,000 a year), 40,000 of spending, no healthcare, Medicare or home costs.
const SINGLE = {
  singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, incomeA: 0, spending: 40000, taxable: 800000, cash: 30000,
  inflation: 0, mortgage: 0, mortgagePrincipal: 0, maintenance: 0, medicareYearly: 0, ssMonthlyA: 2000, ssStartAgeA: 65, ssBenefitCutPct: 0, stateTax: 'tx', acaEnabled: false, healthcare: 0, rothConvEnabled: false,
};
const SPELL = { kind: 'inflation', order: 'standard', spell: { age: 67, years: 2, inflation: 25, bondReturn: 0, stockReturn: null } };
const rowsOf = async (patch) => {
  const w = await world();
  await w.setState(patch);
  return { w, rows: (await engine(w)).simulateRaw().rows };
};
const first6 = (rows, k) => rows.slice(0, 6).map((r) => r[k]);

it("a spell raises Social Security and spending from the year after it starts, and they stay raised", async () => {
  const { rows } = await rowsOf({ ...SINGLE, marketScenario: SPELL });
  expect(first6(rows, 'cumFactor')).toStrictEqual([1, 1, 1, 1.25, 1.5625, 1.5625]);
  expect(first6(rows, 'ss')).toStrictEqual([24000, 24000, 24000, 30000, 37500, 37500]);
  expect(first6(rows, 'expenses')).toStrictEqual([40000, 40000, 40000, 50000, 62500, 62500]);
  expect(rows.at(-1).ss).toBe(37500);
});

it("in today's dollars the spending is the entered figure every year", async () => {
  const { w, rows } = await rowsOf({ ...SINGLE, marketScenario: SPELL });
  const { displayValueOf } = await w.load('shared/core/format/display-value.js');
  for (const r of rows) expect(displayValueOf('real', 0, r.expenses, r.year, r.cumFactor)).toBe(40000);
});

it("a working partner's wages keep the plan's growth through a spell", async () => {
  const COUPLE = { ...SINGLE, singlePerson: false, ageB: 60, retireAgeB: 64, lifeExpectancyB: 90, incomeB: 80000, ssMonthlyB: 0, ssStartAgeB: 67 };
  const plain = (await rowsOf(COUPLE)).rows, spell = (await rowsOf({ ...COUPLE, marketScenario: SPELL })).rows;
  expect(spell.slice(0, 4).map((r) => r.wages)).toStrictEqual(plain.slice(0, 4).map((r) => r.wages));
  expect(spell[3].wages > 0).toBe(true);
  expect(spell[3].ss).toBe(30000);
});
