// The yearly cash-flow chart's balance check (Canada, spec 5.3): in every row of the run the chart shows, money in equals money
// out within $1, read through cashFlowParts (src/shared/core/format/cash-flow-parts.js). Each scenario asserts that the feature
// it exists for is non-zero in at least one row, so no scenario can pass vacuously, and that every row carries the new fields
// as finite numbers (one row shape) and no `conversionAmount` (cashFlowParts reads Canada's meltdown through its absence).
//
// Where each flow is recorded (run-projection.js unless named):
// - the year's flow (wages + CPP + gross OAS + pension + the RRIF minimum, less expenses, tax and the RRSP, TFSA and FHSA
//   contributions): a surplus lands in routeSurplus (year-modes.js, SURPLUS_OUT): cash up to the reserve (Cash top-up), the bond
//   reserve and the rest in taxable (Reinvested); a deficit is drawn (the draws' gross on the in side, their tax in the row's
//   tax), and what no account covers is the Shortfall (wd.need after every draw).
// - the tax: the row's `tax` is gross of the income-tested benefits and leaves out the OAS recovery, `ss` is net of the
//   recovery and `benefits` is on the in side, so ss + benefits - tax is CPP + gross OAS less the tax the flow charged.
// - the one-time cash, credited to cash outside the flow: in (Wages) and Cash top-up.
// - the meltdown moves RRSP money to the TFSA inside the investable (shown apart, cashFlowParts' `conversion`); its tax is in
//   the flow's tax.
// - the pre-retirement ladder rotation and the deficit year's bond-reserve refill sell taxable stock and pay the sale's tax from
//   the proceeds (bond-ladder.js, LADDER_OUT / wd.saleForTax): the tax part is a taxable draw; the rest stays inside.
// - internal moves (sweepExcessCash, the bond trims and stock-to-bond refills inside an account, the bucket mode's trims, the
//   buy year's FHSA to TFSA): on neither side.
// Step 3's findings (2026-11-04): with the fields as the plan's Task 3 defines them, every year of every scenario below balanced
// on the first run; no flow was found that neither side covers (the benefits, the OAS recovery and the meltdown's tax pair up as
// spec 3.2 says). Each field was checked to be load-bearing by zeroing it in the row (or dropping its term): the balance then
// fails in at least one scenario (cashWithdrawn: depleted and six others; homeWithdrawn: home; rothWithdrawn: survivor, benefits,
// meltdown; the one-time cash in cashTopUp: oneTime; the surplus's top-up: reserve, bucket; toBonds in reinvested: reserve and
// four others; the FHSA and the TFSA contributions: working; LADDER_OUT.saleTax: ladder and three others; the refill's
// wd.saleForTax: bucketRefill; the shortfall: depleted and four others).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 528;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const FIELDS = ['cashWithdrawn', 'homeWithdrawn', 'rothWithdrawn', 'cashTopUp', 'reinvested', 'toBondReserve', 'contributions', 'oneTimeCash', 'taxableSaleForTax', 'shortfall', 'meltdown'];
const sum = (parts) => parts.reduce((s, p) => s + p.value, 0);

// The new fields on every row, then the balance per row; returns the parts per row.
function balance(name, rows, cashFlowParts) {
  const bad = [];
  for (const r of rows) {
    for (const k of FIELDS) if (typeof r[k] !== 'number' || !Number.isFinite(r[k])) bad.push(r.year + ':' + k);
    if ('conversionAmount' in r) bad.push(r.year + ':conversionAmount');
  }
  c.expect(bad.slice(0, 5), name + ': the new fields are finite numbers on every row, and no conversionAmount').toStrictEqual([]);
  return rows.map((row, i) => {
    const p = cashFlowParts(row, i ? rows[i - 1].investable : null),
      sIn = sum(p.in),
      sOut = sum(p.out);
    c.expect(Math.abs(sIn - sOut) <= 1, `${name}: year ${row.year} (age ${row.age}): in ${sIn}, out ${sOut}, in - out ${sIn - sOut}`).toBe(true);
    return p;
  });
}
const feature = (name, ok) => c.expect(ok, name).toBe(true);

async function setup(patch) {
  const w = await world();
  await w.setState(patch);
  const e = await engine(w);
  const { cashFlowParts } = await w.load('shared/core/format/cash-flow-parts.js');
  return { w, e, cashFlowParts };
}
// The standard run the chart shows (cached: read only).
async function planned(name, patch) {
  const S = await setup(patch);
  const rows = S.e.simulate().rows;
  return { ...S, rows, parts: balance(name, rows, S.cashFlowParts) };
}

const LISTS0 = { loans: [], spendingTiers: [], incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], children: [] };
// A single retiree at 60, renting, cash 0 against a 50,000 reserve, a 3-year bond reserve; a pension from 65 above spending
// (surplus years that top up cash and the reserve), drawing before it.
const RESERVE = {
  ...LISTS0, singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 95, tenure: 'rent', rent: 1500, cash: 0, cashReserve: 50000,
  bondYears: 3, taxable: 400000, traditional: 300000, roth: 100000, spending: 50000, pensionCoverage: 'a', pensionYearlyA: 90000,
  pensionStartAgeA: 65, cppMonthlyA: 0, oasMonthlyA: 0,
};
// A small portfolio and spending far above income (home: owns a paid-off house; depleted: rents).
const SMALL = {
  ...LISTS0, singlePerson: true, ageA: 70, retireAgeA: 70, lifeExpectancyA: 95, taxable: 50000, traditional: 50000, roth: 0, cash: 10000,
  cashReserve: 10000, spending: 70000, cppMonthlyA: 1000, cppStartAgeA: 65, oasStartAgeA: 65,
};
const WORKING = { ageA: 30, ageB: 30, retireAgeA: 55, retireAgeB: 55, tenure: 'rentThenBuy', buyAge: 36, rrspPctA: 100, rrspPctB: 100, tfsaPctA: 5, tfsaPctB: 5, fhsaPctA: 5, fhsaPctB: 5 };

it('working: a couple saving into the RRSP, TFSA and FHSA, the surplus reinvested', async () => {
  const { rows } = await planned('working', WORKING);
  const noFhsa = (await setup({ ...WORKING, fhsaPctA: 0, fhsaPctB: 0 })).e.simulate().rows;
  feature('working: contributions in a working year', rows.some((r) => r.working && r.contributions > 0 && r.wages > 0));
  feature('working: the FHSA in the contributions', rows.some((r, i) => r.contributions > noFhsa[i].contributions));
  feature('working: a surplus reinvested', rows.some((r) => r.working && r.reinvested > 0));
});

it('surplus: a retiree whose pension covers spending reinvests the rest', async () => {
  const { rows } = await planned('surplus', { ...LISTS0, singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, pensionCoverage: 'a', pensionYearlyA: 120000, pensionStartAgeA: 65, spending: 40000, tenure: 'rent' });
  feature('surplus: reinvested in a retired year', rows.some((r) => !r.working && r.reinvested > 0));
});

it('reserve: the surplus tops cash up to the reserve and fills the bond reserve', async () => {
  const { rows } = await planned('reserve', RESERVE);
  feature('reserve: a cash top-up', rows.some((r) => r.cashTopUp > 0));
  feature('reserve: a bond-reserve fill', rows.some((r) => r.toBondReserve > 0));
  feature('reserve: a draw year', rows.some((r) => r.taxableWithdrawn + r.traditionalWithdrawn + r.rothWithdrawn + r.cashWithdrawn > 0));
});

it('rrif: a large RRIF whose minimum exceeds the need', async () => {
  const { rows, parts } = await planned('rrif', { ...LISTS0, singlePerson: true, ageA: 72, retireAgeA: 72, lifeExpectancyA: 90, traditional: 3000000, taxable: 100000, roth: 0, spending: 50000, tenure: 'rent' });
  feature('rrif: a RRIF minimum', rows.some((r) => r.rmd > 0));
  feature('rrif: a minimum beyond the need', parts.some((p) => p.excessRmd > 0));
});

it('meltdown: the RRSP meltdown moves RRSP money to the TFSA', async () => {
  const { rows, parts } = await planned('meltdown', { ...LISTS0, singlePerson: true, ageA: 58, retireAgeA: 58, lifeExpectancyA: 90, traditional: 800000, taxable: 300000, roth: 50000, spending: 50000, tenure: 'rent', meltdownEnabled: true, meltdownStartAge: 60, meltdownEndAge: 70 });
  feature('meltdown: a meltdown', rows.some((r) => r.meltdown > 0));
  feature('meltdown: shown as the conversion', parts.some((p) => p.conversion > 0));
});

it('home: an owner whose portfolio runs out draws on home equity', async () => {
  const { rows } = await planned('home', { ...SMALL, tenure: 'own', homeValue: 600000, mortgage: 0, mortgagePrincipal: 0 });
  feature('home: a home-equity draw', rows.some((r) => r.homeWithdrawn > 0));
});

it('depleted: a renter whose portfolio runs out has a shortfall', async () => {
  const { rows } = await planned('depleted', { ...SMALL, tenure: 'rent' });
  feature('depleted: a shortfall', rows.some((r) => r.shortfall > 0));
  feature('depleted: a cash draw', rows.some((r) => r.cashWithdrawn > 0));
  feature('depleted: a TFSA-free household draws taxable and the RRIF', rows.some((r) => r.taxableWithdrawn > 0 && r.traditionalWithdrawn > r.rmd));
});

it('survivor: Partner A dies at 75', async () => {
  const { rows } = await planned('survivor', { survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 75 });
  feature('survivor: years after the death', rows.some((r) => r.age > 75));
  feature('survivor: a TFSA draw', rows.some((r) => r.rothWithdrawn > 0));
});

it('benefits: a low-income senior receives the GIS', async () => {
  const { rows } = await planned('benefits', { ...LISTS0, singlePerson: true, ageA: 66, retireAgeA: 66, lifeExpectancyA: 90, taxable: 0, traditional: 20000, roth: 60000, cash: 5000, cashReserve: 5000, spending: 18000, tenure: 'rent', rent: 800, cppMonthlyA: 300, cppStartAgeA: 65, oasStartAgeA: 65 });
  feature('benefits: income-tested benefits', rows.some((r) => r.benefits > 0));
  feature('benefits: the GIS', rows.some((r) => r.benefitGis > 0));
});

it('oneTime: a one-time income is credited to cash', async () => {
  const { rows } = await planned('oneTime', { oneTimeIncome: [{ age: 60, amount: 100000 }] });
  feature('oneTime: one-time cash', rows.some((r) => r.oneTimeCash > 0));
});

it('ladder: the pre-retirement bond ladder sells taxable and pays its tax from the sale', async () => {
  const { rows } = await planned('ladder', {
    ...LISTS0, singlePerson: true, ageA: 50, retireAgeA: 55, lifeExpectancyA: 90, incomeA: 150000, rrspPctA: 0, tfsaPctA: 0,
    traditional: 0, roth: 0, taxable: 1500000, basisRatio: 20, bondYears: 5, spending: 60000, tenure: 'rent',
  });
  feature('ladder: a sale for tax', rows.some((r) => r.taxableSaleForTax > 0));
});

it('bucket: the reserve household on the first historical cycle (1928)', async () => {
  // A larger pension than RESERVE's, so the surplus years from 65 fill the bond reserve on this path.
  const S = await setup({ ...RESERVE, pensionYearlyA: 130000 });
  const { HIST } = await S.w.load('shared/core/projection/historical-data.js');
  const rows = S.e.simulateHistoricalRaw((y) => HIST[y]).rows;
  balance('bucket', rows, S.cashFlowParts);
  feature('bucket: a draw in a down year', rows.some((r, y) => HIST[y][1] < 0 && r.taxableWithdrawn + r.traditionalWithdrawn + r.rothWithdrawn + r.cashWithdrawn > 0));
  feature('bucket: a bond-reserve fill', rows.some((r) => r.toBondReserve > 0));
});

it('bucketRefill: the RESERVE household on 1928 refills the bond reserve with a taxable sale', async () => {
  const S = await setup(RESERVE);
  const { HIST } = await S.w.load('shared/core/projection/historical-data.js');
  const rows = S.e.simulateHistoricalRaw((y) => HIST[y]).rows;
  balance('bucketRefill', rows, S.cashFlowParts);
  feature('bucketRefill: a refill sale for tax', rows.some((r) => r.taxableSaleForTax > 0));
});
