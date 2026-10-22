// After-tax estate and probate fees (Batch 7N, N8), Canada.
//
// Probate fee schedules (provincial pages and statutes, retrieved 2026-10-06): Ontario nil to 50,000 then 15 per 1,000 or part of the
// excess (the ontario.ca example: 240,000 -> 2,850); British Columbia (Probate Fee Act) nil to 25,000, 6 per 1,000 from 25,000 to
// 50,000, 14 per 1,000 above; Alberta a step schedule (35 / 135 / 275 / 400 / 525); Saskatchewan 7 per 1,000; Manitoba none (2020);
// Quebec none (notarial will); New Brunswick 200 to 20,000, 5 per 1,000 to 100,000, 15 per 1,000 above; Nova Scotia 1,002.65 at
// 100,000 plus 16.95 per 1,000; Prince Edward Island 400 at 100,000 plus 4 per 1,000; Newfoundland and Labrador 60 plus 0.60 per 100
// above 1,000.
// After-tax estate = final total assets - the tax the RRSP/RRIF and the deemed gains add to the last person's final return - probate.
// The plan's projection does not change (the estate is a non-enumerable field), the meltdown table is ranked by this figure.
//
// Converted from tests/estate.js (Playwright); the old script executed 32 near and assert checks (page-error check excluded).
// This file asserts 27 of them (NEW_COUNT tracks them); the other 5, which need the ui/ function computeRothOptimizer, stay in
// Playwright as tests/estate_optimizer.js. Each it block sets up its own world and state.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 27;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// Every failing check is reported, not only the first (expect.soft), and each one counts once.
const near = (a, b, tol, msg) => {
  c.tick();
  expect.soft(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`).toBe(true);
};
const check = (cond, msg) => {
  c.tick();
  expect.soft(cond, msg).toBe(true);
};
const eq = (a, b, msg) => {
  c.tick();
  expect.soft(a, msg).toStrictEqual(b);
};

async function setup() {
  const w = await world();
  const state = await w.setState();
  const estMod = await w.load('canada/core/analysis/estate.js');
  const taxMod = await w.load('canada/core/tax/tax.js');
  // personTaxCA takes the run context first: each call gets one built from the store as it is then.
  const now = await w.ctxBuilder();
  const tax = { ...taxMod, personTaxCA: (...a) => taxMod.personTaxCA(now(), ...a) };
  // afterTaxEstate takes the run context first too.
  const est = { ...estMod, afterTaxEstate: (sim) => estMod.afterTaxEstate(now(), sim) };
  const { PROVINCE_RULES } = await w.load('canada/core/tax/province-rules.js');
  const e = await engine(w);
  const fee = (code, v) => est.probateFee(PROVINCE_RULES[code], v);
  return { w, state, est, tax, fee, e };
}

it('probate fee schedules', async () => {
  const { fee } = await setup();
  near(fee('on', 240000), 2850, 1e-9, 'Ontario 240,000 (the ontario.ca example)');
  near(fee('on', 50000), 0, 1e-9, 'Ontario nil at 50,000');
  near(fee('on', 50001), 15, 1e-9, 'Ontario 50,001 rounds up to 51,000: 15');
  near(fee('bc', 100000), 6 * 25 + 14 * 50, 1e-9, 'BC 100,000: 6 x 25 + 14 x 50');
  near(fee('bc', 30000), 6 * 5, 1e-9, 'BC 30,000');
  near(fee('bc', 20000), 0, 1e-9, 'BC nil at 20,000');
  near(fee('ab', 100000), 275, 1e-9, 'Alberta 100,000');
  near(fee('ab', 300000), 525, 1e-9, 'Alberta over 250,000');
  near(fee('ab', 5000), 35, 1e-9, 'Alberta under 10,000');
  near(fee('sk', 500000), 3500, 1e-9, 'Saskatchewan 7 per 1,000');
  near(fee('mb', 900000), 0, 1e-9, 'Manitoba none');
  near(fee('qc', 900000), 0, 1e-9, 'Quebec none');
  near(fee('nb', 150000), 200 + 5 * 80 + 15 * 50, 1e-9, 'New Brunswick 150,000');
  near(fee('nb', 10000), 200, 1e-9, 'New Brunswick under 20,000');
  near(fee('ns', 200000), 1002.65 + 16.95 * 100, 1e-9, 'Nova Scotia 200,000');
  near(fee('pe', 200000), 400 + 4 * 100, 1e-9, 'PEI 200,000');
  near(fee('nl', 100000), 60 + 6 * 99, 1e-9, 'Newfoundland and Labrador 100,000');
});

const BASE = { traditional: 0, taxable: 0, taxableBasis: 0, roth: 0, cash: 0, homeEquity: 0 };

it('the after-tax estate of a synthetic final state', async () => {
  const { state, est, tax, fee } = await setup();
  // Ontario, last survivor age 90, 30,000 of income in the last year.
  state.province = 'on';
  state.singlePerson = true;
  const row = { year: 0, age: 90, ageB: null, grossIncome: 30000, total: 0 };
  const mk = (e) => ({ rows: [{ ...row, total: e.traditional + e.taxable + e.roth + e.cash + e.homeEquity }], estate: e });
  const tfsa = est.afterTaxEstate(mk({ ...BASE, roth: 400000 })) - 400000;
  const rrspAfter = est.afterTaxEstate(mk({ ...BASE, traditional: 500000 }));
  const rrspTax = tax.personTaxCA(30000 + 500000, 0, 0, 0, 90, 0) - tax.personTaxCA(30000, 0, 0, 0, 90, 0);
  const mixed = mk({ ...BASE, taxable: 300000, taxableBasis: 100000, cash: 20000, homeEquity: 400000, roth: 50000 });
  const mixedAfter = est.afterTaxEstate(mixed);
  const mixedTax = tax.personTaxCA(30000, 200000, 0, 0, 90, 0) - tax.personTaxCA(30000, 0, 0, 0, 90, 0);
  const mixedProbate = fee('on', 300000 + 20000 + 400000);
  const mixedTotal = mixed.rows[0].total;
  // A survivor's last year: the whole last-year income is one person's (the review fix), not half of it. BC, age 90, 100,000 of income.
  state.province = 'bc';
  state.singlePerson = false;
  const srow = { year: 0, age: 90, ageB: 88, grossIncome: 100000, total: 150000 };
  const survivor = est.afterTaxEstate({ rows: [srow], estate: { ...BASE, traditional: 150000, survivor: true } });
  const survivorTax = tax.personTaxCA(100000 + 150000, 0, 0, 0, 90, 0) - tax.personTaxCA(100000, 0, 0, 0, 90, 0);
  // A couple's last year (both alive): half each, as before.
  const couple = est.afterTaxEstate({ rows: [srow], estate: { ...BASE, traditional: 150000, survivor: false } });
  const coupleTax = tax.personTaxCA(50000 + 150000, 0, 0, 0, 90, 0) - tax.personTaxCA(50000, 0, 0, 0, 90, 0);
  state.province = 'on';
  state.singlePerson = true;
  // The last year's realized gains count at 50% in the final-return base (grossIncome carries them in full): Ontario, age 85, 100,000
  // of last-year income of which 40,000 is gains, 300,000 of RRIF left.
  const grow = { year: 0, age: 85, ageB: null, grossIncome: 100000, total: 300000 };
  const gainsYear = est.afterTaxEstate({ rows: [grow], estate: { ...BASE, traditional: 300000, lastGains: 40000 } });
  const gainsYearTax = tax.personTaxCA(80000 + 300000, 0, 0, 0, 85, 0) - tax.personTaxCA(80000, 0, 0, 0, 85, 0);

  near(tfsa, 0, 1e-9, 'a TFSA-only estate owes nothing (and no probate: registered plans pass by designation)');
  near(rrspAfter, 500000 - rrspTax, 1e-6, 'an RRSP/RRIF estate: total less the tax of the final return');
  check(rrspTax > 200000 && rrspTax < 260000, 'tax on 500,000 of RRSP at the top of the Ontario brackets, got ' + rrspTax);
  near(mixedAfter, mixedTotal - mixedTax - mixedProbate, 1e-6, 'mixed estate: gains (200,000 deemed, 50% included), probate on taxable + cash + home, TFSA and the residence untaxed');
  near(survivor, 150000 - survivorTax, 1e-6, 'a survivor year: the final-return tax stacks on ALL of the last-year income');
  near(couple, 150000 - coupleTax, 1e-6, 'a two-person last year: half the income each');
  check(survivorTax > coupleTax + 5000, 'the survivor case must cost more tax than the half-income reading');
  near(gainsYear, 300000 - gainsYearTax, 1e-6, "the last year's gains enter the final-return base at 50%");
});

it('the estate does not enumerate on the projection', async () => {
  const { state, e } = await setup();
  state.province = 'on';
  state.singlePerson = true;
  const sim = e.simulate();
  check(!Object.keys(sim).includes('estate'), 'the estate must not be an enumerable result field');
  eq(Object.keys(sim.estate || {}).sort(), ['cash', 'homeEquity', 'lastGains', 'roth', 'survivor', 'taxable', 'taxableBasis', 'traditional'], 'estate fields');
});
