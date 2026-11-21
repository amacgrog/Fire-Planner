// Feedback C3: an inflation spell in the Canada engine. Plan inflation 0, so the plan's factor is exactly 1 and a spell's factor is
// the spell's own product: a year's inflation raises the next year's prices, so a 25% spell in years 2-3 gives 1, 1, 1, 1.25,
// 1.5625, then 1.5625 for good. CPP, OAS and spending entered in today's dollars follow it; wages do not.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

// A single retiree at 65 with CPP 1,000 and OAS 700 a month from 65 (20,400 a year, under the OAS recovery threshold), and
// 40,000 of spending, no healthcare or home costs. The years read are ages 65-70, before the 75+ OAS increase.
const SINGLE = {
  singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, incomeA: 0, spending: 40000, taxable: 800000, cash: 30000,
  inflation: 0, mortgage: 0, mortgagePrincipal: 0, maintenance: 0, healthcare: 0, cppMonthlyA: 1000, cppStartAgeA: 65, oasMonthlyA: 700, oasStartAgeA: 65,
};
const SPELL = { kind: 'inflation', order: 'standard', spell: { age: 67, years: 2, inflation: 25, bondReturn: 0, stockReturn: null } };
const rowsOf = async (patch) => {
  const w = await world();
  await w.setState(patch);
  return { w, rows: (await engine(w)).simulateRaw().rows };
};
// gross CPP and OAS: the row's ss is net of the OAS recovery
const gross = (r) => r.ss + r.oasClawback;

it('a spell raises CPP, OAS and spending from the year after it starts, and they stay raised', async () => {
  const { rows } = await rowsOf({ ...SINGLE, marketScenario: SPELL });
  expect(rows.slice(0, 6).map((r) => r.cumFactor)).toStrictEqual([1, 1, 1, 1.25, 1.5625, 1.5625]);
  expect(rows.slice(0, 6).map((r) => r.oasClawback)).toStrictEqual([0, 0, 0, 0, 0, 0]);
  expect(rows.slice(0, 6).map(gross)).toStrictEqual([20400, 20400, 20400, 25500, 31875, 31875]);
  expect(rows.slice(0, 6).map((r) => r.expenses)).toStrictEqual([40000, 40000, 40000, 50000, 62500, 62500]);
});

it("in today's dollars the spending is the entered figure every year", async () => {
  const { w, rows } = await rowsOf({ ...SINGLE, marketScenario: SPELL });
  const { displayValueOf } = await w.load('shared/core/format/display-value.js');
  for (const r of rows.slice(0, 6)) expect(displayValueOf('real', 0, r.expenses, r.year, r.cumFactor)).toBe(40000);
});

it("a working partner's wages keep the plan's growth through a spell", async () => {
  const COUPLE = { ...SINGLE, singlePerson: false, ageB: 60, retireAgeB: 64, lifeExpectancyB: 90, incomeB: 80000, cppMonthlyB: 0, oasMonthlyB: 0 };
  const plain = (await rowsOf(COUPLE)).rows, spell = (await rowsOf({ ...COUPLE, marketScenario: SPELL })).rows;
  expect(spell.slice(0, 4).map((r) => r.wages)).toStrictEqual(plain.slice(0, 4).map((r) => r.wages));
  expect(spell[3].wages > 0).toBe(true);
});
