// A row's return figures (src/us/core/projection/row-cost.js): the settled tax and healthcare of a 162(l)-settled year, else
// what the year paid; and the optimizers' cost reading them (rothScheduleCost), as the cliff plan's measure does.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
// tests/se_health.js's FP at 82,000 (single, working, self-employed): held years that settle (tests/unit/us/se-settlement.test.js).
const FP = {
  ...ZERO, singlePerson: true, ageA: 50, retireAgeA: 60, incomeA: 82000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000,
  stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0,
  megaBackdoor: false, cliffGuardEnabled: false,
};

it('rowCost / rowTax: the paid figures, or a settled row\'s return', async () => {
  const w = await world();
  const { rowCost, rowTax } = await w.load('us/core/projection/row-cost.js');
  expect(rowCost({ tax: 1000.5, healthcare: 250.25 })).toBe(1250.75);
  expect(rowTax({ tax: 1000.5, healthcare: 250.25 })).toBe(1000.5);
  const settled = { tax: 1000.5, healthcare: 250.25, taxSettled: 900.5, healthcareSettled: 100.25 };
  expect(rowCost(settled)).toBe(1000.75);
  expect(rowTax(settled)).toBe(900.5);
});

it('rothScheduleCost scores a settled run on its return, an unsettled row as paid', async () => {
  const w = await world();
  await w.setState(FP);
  const e = await engine(w);
  const { rothScheduleCost } = await w.load('us/core/optimizer/roth-schedule.js');
  const store = await w.load('shared/core/store.js');
  const sim = e.simulateRaw();
  const settled = sim.rows.filter((r) => 'seSettlement' in r);
  expect(settled.length > 0).toBe(true);
  let ret = 0,
    paid = 0;
  for (const r of sim.rows) {
    ret += r.taxSettled !== undefined ? r.taxSettled + r.healthcareSettled : r.tax + r.healthcare;
    paid += r.tax + r.healthcare;
  }
  expect(rothScheduleCost(sim, store.state, 'nominal')).toBe(ret);
  expect(ret !== paid).toBe(true);
});
