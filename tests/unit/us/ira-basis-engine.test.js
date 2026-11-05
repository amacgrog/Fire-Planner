// Traditional IRA after-tax basis in the year loop (US, IRA deduction PR 2, Task 5a): the pro-rata recovery on draws, RMDs and
// the year end (Form 8606). Every case sets the returns, inflation and the HYSA rate to 0, so the ratio is the slider exactly.
// Conversions (Task 5b) are not covered here.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

// A retired single person with nothing but a traditional IRA (no other money, no Social Security, no housing or healthcare
// costs), all at 0% returns and no bond reserve.
const FLAT = {
  singlePerson: true, filingStatus: 'single', returnRate: 0, bondReturn: 0, inflation: 0, medicalInflation: 0, hysaRate: 0,
  incomeGrowth: 0, dividendYield: 0, bondYears: 0, taxable: 0, cash: 0, cashReserve: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0,
  ssMonthlyA: 0, tenure: 'rent', rent: 0, healthcare: 0, medicareYearly: 0, cliffGuardEnabled: false, stateTax: 'tx',
};

// The rows of a fresh world's uncached run of `patch`; `off`: with ctx.test.iraPhaseoutOff.
async function rowsOf(patch, off = false) {
  const w = await world();
  await w.setState(patch);
  if (off) (await w.load('us/core/test-hooks.js')).assignIraPhaseoutOff(true);
  const e = await engine(w);
  return e.simulateRaw().rows;
}

// The owner case of ira-deduction-engine.test.js: MFJ, both covered by a Roth 401(k), a traditional IRA contribution each,
// fully phased out (17,200 nondeductible), no draw in the first year.
const OWNER = {
  filingStatus: 'mfj', ageA: 58, ageB: 56, incomeA: 115000, incomeB: 72000, retireAgeA: 65, retireAgeB: 65,
  k401TypeA: 'roth', k401TypeB: 'roth', k401PctA: 10, k401PctB: 10, catchupPctA: 0, catchupPctB: 0, iraTypeA: 'traditional',
  iraTypeB: 'traditional', iraPctA: 100, iraPctB: 100, taxable: 0, cash: 0, cashReserve: 0, spending: 20000, cliffGuardEnabled: false,
};

it('basis is recovered on an RMD', async () => {
  const r = (await rowsOf({ ...FLAT, ageA: 75, retireAgeA: 60, spending: 5000, tradIraA: 400000, tradIraBasisPctA: 50 }))[0];
  expect(r.rmd > 0).toBe(true);
  // the RMD is drawn pro rata from an IRA that is half basis
  expect(r.rmdTaxable).toBe(r.rmd * 0.5);
  // a surplus year: the basis recovered is the RMD's tax-free half
  expect(r.traditionalWithdrawn).toBe(r.rmd);
  expect(r.iraBasisRecovered).toBe(0.5 * (400000 - (400000 - r.rmd)));
  expect(r.iraBasis).toBe(200000 - r.iraBasisRecovered);
});

it('penalty on the taxable part only', async () => {
  const r = (await rowsOf({ ...FLAT, ageA: 50, retireAgeA: 45, spending: 30000, tradIraA: 300000, tradIraBasisPctA: 50 }))[0];
  expect(r.traditionalWithdrawn > 30000).toBe(true);
  // one penalized draw: the 10% falls on its taxable half only
  expect(r.earlyPenalty).toBe(r.traditionalWithdrawn * 0.5 * 0.1);
  expect(r.iraBasis).toBe(150000 - r.iraBasisRecovered);
  expect(r.iraBasisRecovered > 0).toBe(true);
});

it('nondeductible contributions become basis', async () => {
  const r = (await rowsOf(OWNER))[0];
  expect(r.traditionalWithdrawn).toBe(0);
  expect(r.iraNondeductible).toBe(17200);
  expect(r.iraBasis).toBe(17200);
  expect(r.iraBasisRecovered).toBe(0);
});

it('basis survives a loss year', async () => {
  const r = (await rowsOf({ ...FLAT, ageA: 60, retireAgeA: 55, spending: 0, returnRate: -20, tradIraA: 100000, tradIraBasisPctA: 100 }))[0];
  expect(r.traditionalWithdrawn).toBe(0);
  expect(r.traditional).toBe(80000);
  // basis above the fallen balance carries forward (Form 8606 line 14): never reset to the ratio times the balance
  expect(r.iraBasis).toBe(100000);
  expect(r.iraBasisRecovered).toBe(0);
});

it('basis off is the feature off', async () => {
  // MFJ, both past their RMD age, with draws from both partners' IRAs and 401(k)s and no conversion, at 0% basis
  const plan = {
    ...FLAT, singlePerson: false, filingStatus: 'mfj', ageA: 74, ageB: 73, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 90,
    lifeExpectancyB: 90, spending: 90000, tradIraA: 300000, trad401kA: 200000, tradIraB: 150000, trad401kB: 100000,
    rothIraB: 0, roth401kB: 0, ssMonthlyB: 0, tradIraBasisPctA: 0, tradIraBasisPctB: 0,
  };
  const on = await rowsOf(plan);
  const off = await rowsOf(plan, true);
  expect(on[0].rmd > 0).toBe(true);
  expect(on[0].traditionalWithdrawn > on[0].rmd).toBe(true);
  expect(on.length).toBe(off.length);
  for (let i = 0; i < on.length; i++) {
    expect(on[i].tax).toBe(off[i].tax);
    expect(on[i].traditional).toBe(off[i].traditional);
    expect(on[i].roth).toBe(off[i].roth);
    // no basis: the rows carry none of the basis fields
    expect(on[i].iraBasis).toBe(undefined);
    expect(on[i].rmdTaxable).toBe(undefined);
  }
});
