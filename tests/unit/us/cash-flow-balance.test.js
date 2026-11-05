// The yearly cash-flow chart's balance check (US, spec 5.3): in every row of the planned run the chart shows, money in equals
// money out within $1, read through cashFlowParts (src/shared/core/format/cash-flow-parts.js). Each scenario asserts that the
// feature it exists for is non-zero in at least one row, so no scenario can pass vacuously, and that every row carries the
// new fields as finite numbers (one row shape).
//
// Where each flow is recorded (run-projection.js unless named):
// - the year's flow (wages + ss + pension + rmd + the scheduled inherited draw + the 162(l) carry, less expenses, tax and the
//   employee contributions): a surplus lands in routeSurplus (year-modes.js, SURPLUS_OUT): cash up to the reserve (Cash top-up),
//   the bond reserve and the rest in taxable (Reinvested); a deficit is drawn (the draws' gross on the in side, their tax in
//   the row's tax), and what no account covers is the Shortfall (wd.need after every draw).
// - the one-time cash and the inherited Roth payout, credited to cash outside the flow: in (Wages / Roth) and Cash top-up.
// - the fill-to-the-line draw (fillTraditional, draws.js): its gross is a traditional draw, its tax in the row's tax, its
//   after-tax proceeds kept as cash (wd.cashKept, Cash top-up).
// - the forced pass's refund: the row's expenses and tax fall, the difference credited to cash (Cash top-up).
// - the pre-retirement ladder rotation and the deficit year's bond-reserve refill sell taxable stock and pay the sale's tax from
//   the proceeds (bond-ladder.js, LADDER_OUT / wd.saleForTax): the tax part is a Brokerage draw; the rest stays inside.
// - the 162(l) carry: a refund is income, a balance due is tax (cashFlowParts reads seSettlementIn).
// - internal moves (sweepExcessCash, the bond trims and stock-to-bond refills inside an account, the bucket mode's trims):
//   on neither side.
// Step 3's findings (2026-11-04): with the fields as the plan's Task 2 defines them, every year of every scenario below balanced
// on the first run; no flow was found that neither side covers, and no deficit-year path adds to taxable from the year's cash
// (so a deficit year's reinvested is 0). Each field was checked to be load-bearing by zeroing it in the row (or dropping its
// term): the balance then fails in at least one scenario (cashKept: fill; the forced cash credit: forced; the ladder's
// LADDER_OUT.saleTax: ladder and five others; the refill's wd.saleForTax: bucket; toBonds in reinvested: reserve and six
// others; the shortfall, cashWithdrawn, homeWithdrawn, the inherited Roth payout, the Roth contributions: their scenarios).
import { it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const require = createRequire(import.meta.url);
const { ACCOUNTS0, PLAN_G58, SPLIT_H1 } = require('../../helpers/plan-households.js');

const NEW_COUNT = 706;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const FIELDS = ['cashWithdrawn', 'homeWithdrawn', 'cashTopUp', 'reinvested', 'toBondReserve', 'contributions', 'oneTimeCash', 'inheritedRothPayout', 'taxableSaleForTax', 'shortfall'];
const sum = (parts) => parts.reduce((s, p) => s + p.value, 0);

// The new fields on every row, then the balance per row; returns the parts per row.
function balance(name, rows, cashFlowParts) {
  const bad = [];
  for (const r of rows) for (const k of FIELDS) if (typeof r[k] !== 'number' || !Number.isFinite(r[k])) bad.push(r.year + ':' + k);
  c.expect(bad.slice(0, 5), name + ': the new fields are finite numbers on every row').toStrictEqual([]);
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
  const { testHooks } = await w.load('us/core/test-hooks.js');
  return { w, e, cashFlowParts, testHooks };
}
// The planned run the chart shows (cached: read only).
async function planned(name, patch) {
  const S = await setup(patch);
  const rows = S.e.simulate().rows;
  return { ...S, rows, parts: balance(name, rows, S.cashFlowParts) };
}

// tests/unit/us/se-settlement.test.js's households.
const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
const FP = {
  ...ZERO, singlePerson: true, ageA: 50, retireAgeA: 60, incomeA: 60000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000,
  stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0,
  megaBackdoor: false, cliffGuardEnabled: false,
};
const selfStream = (amount) => ({ amount, startAge: 60, endAge: 70, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 0, healthPremium: 0 });
const IG = {
  ...ZERO, singlePerson: true, ageA: 60, retireAgeA: 60, incomeA: 0, incomeKindA: 'wages', acaEnabled: true, healthcare: 18000, stateTax: 'tx',
  inflation: 0, incomeGrowth: 0, medicalInflation: 0, ssMonthlyA: 0, tenure: 'rent', rent: 0, cliffGuardEnabled: false,
};
const FC = { ...IG, healthcare: 6000, taxable: 300000, basisRatio: 30, guardrailsEnabled: true, incomeSources: [selfStream(10000)] };

// A single retiree at 60, renting, cash 0 against a 50,000 reserve, a 3-year bond reserve; a pension from 65 above spending
// (surplus years that top up cash and the reserve), drawing before it.
const RESERVE = {
  ...ACCOUNTS0, singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 95, tenure: 'rent', rent: 1500, cash: 0, cashReserve: 50000,
  bondYears: 3, taxable: 400000, trad401kA: 300000, rothIraA: 100000, spending: 50000, pensionCoverage: 'a', pensionYearlyA: 90000,
  pensionStartAgeA: 65, ssMonthlyA: 0, children: [],
};
// A small portfolio and spending far above income (home: owns a paid-off house; depleted: rents).
const SMALL = {
  ...ACCOUNTS0, singlePerson: true, ageA: 70, retireAgeA: 70, lifeExpectancyA: 95, taxable: 50000, trad401kA: 50000, cash: 10000,
  cashReserve: 10000, spending: 70000, ssMonthlyA: 1500, ssStartAgeA: 70, children: [],
};

it('working: a couple saving into traditional and Roth, the surplus reinvested', async () => {
  const { rows } = await planned('working', { ageA: 45, ageB: 43, k401TypeA: 'traditional', k401TypeB: 'traditional', iraTypeA: 'roth', iraTypeB: 'roth' });
  feature('working: contributions in a working year', rows.some((r) => r.working && r.contributions > 0 && r.wages > 0));
  feature('working: a surplus reinvested', rows.some((r) => r.working && r.reinvested > 0));
});

it('surplus: a retiree whose pension covers spending reinvests the rest', async () => {
  const { rows } = await planned('surplus', { ...ACCOUNTS0, singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, pensionCoverage: 'a', pensionYearlyA: 120000, pensionStartAgeA: 65, spending: 40000, tenure: 'rent', children: [] });
  feature('surplus: reinvested in a retired year', rows.some((r) => !r.working && r.reinvested > 0));
});

it('reserve: the surplus tops cash up to the reserve and fills the bond reserve', async () => {
  const { rows } = await planned('reserve', RESERVE);
  feature('reserve: a cash top-up', rows.some((r) => r.cashTopUp > 0));
  feature('reserve: a bond-reserve fill', rows.some((r) => r.toBondReserve > 0));
  feature('reserve: a draw year', rows.some((r) => r.taxableWithdrawn + r.traditionalWithdrawn + r.rothWithdrawn + r.cashWithdrawn > 0));
});

it('rmd: a large traditional balance whose RMD exceeds the need', async () => {
  const { rows, parts } = await planned('rmd', { ...ACCOUNTS0, singlePerson: true, ageA: 72, retireAgeA: 72, lifeExpectancyA: 90, trad401kA: 3000000, taxable: 100000, spending: 50000, ssMonthlyA: 3000, ssStartAgeA: 70, tenure: 'rent', children: [] });
  feature('rmd: an RMD', rows.some((r) => r.rmd > 0));
  feature('rmd: an RMD beyond the need', parts.some((p) => p.excessRmd > 0));
});

it('conversion: the cliff plan converts', async () => {
  const { rows } = await planned('conversion', PLAN_G58);
  feature('conversion: a conversion', rows.some((r) => r.conversionAmount > 0));
});

it('fill: a cliff-plan year filled to a floor keeps the draw as cash', async () => {
  // tests/cliff_plan.js T4.6: PLAN_G58 with Medicaid declined, spending 30,000, traditional 300,000, taxable 0, no conversions
  // (the kept plan fills to the 100% credit floor at 61).
  const { rows } = await planned('fill', { ...PLAN_G58, medicaidWhenEligible: false, spending: 30000, trad401kA: 300000, taxable: 0, rothConvEnabled: false });
  const filled = rows.filter((r) => typeof r.cliffChoice === 'string' && r.cliffChoice.startsWith('filled to'));
  feature('fill: a filled year', filled.length > 0);
  feature('fill: its proceeds kept as cash', filled.some((r) => r.cashTopUp > 0 && r.oneTimeCash === 0 && r.reinvested === 0));
});

it('split: a two-return year drawing one partner first', async () => {
  // two-return-split.test.js's SPLIT_H1_PLAN: the kept plan draws A first from 60.
  // The per-row balance covers the per-draw tax sum in a split year: tax is on the out side and the gross draws on the in side,
  // so draw taxes that did not sum to tax would fail the balance.
  const { rows } = await planned('split', { ...SPLIT_H1, spending: 110000 });
  feature('split: a split year', rows.some((r) => r.drawSplit === 'A' || r.drawSplit === 'B'));
});

it('forced: an ACA year ending in the forced pass refunds to cash', async () => {
  // se-settlement.test.js's carryRun2: year 2 holds and ends in the forced pass.
  const S = await setup({ ...FC, basisRatio: 90, spending: 19000, incomeSources: [selfStream(8000)] });
  S.testHooks.testSeCarryAt = { year: 1, amount: 500 };
  const rows = S.e.simulate().rows,
    trace = S.e.accountTrace();
  S.testHooks.testSeCarryAt = null;
  balance('forced', rows, S.cashFlowParts);
  feature('forced: a refund', trace[2].forcedPass === true && trace[2].forcedRefund > 0);
  feature('forced: the refund kept as cash', rows[2].cashTopUp > 0);
});

it('home: an owner whose portfolio runs out draws on home equity', async () => {
  const { rows } = await planned('home', { ...SMALL, tenure: 'own', homeValue: 600000, mortgage: 0, mortgagePrincipal: 0 });
  feature('home: a home-equity draw', rows.some((r) => r.homeWithdrawn > 0));
});

it('depleted: a renter whose portfolio runs out has a shortfall', async () => {
  const { rows } = await planned('depleted', { ...SMALL, tenure: 'rent' });
  feature('depleted: a shortfall', rows.some((r) => r.shortfall > 0));
  feature('depleted: a cash draw', rows.some((r) => r.cashWithdrawn > 0));
});

it('survivor: Partner A dies at 75', async () => {
  const { rows } = await planned('survivor', { survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 75 });
  feature('survivor: years after the death', rows.some((r) => r.age > 75));
});

it('inherited: an inherited IRA and an inherited Roth', async () => {
  const { rows } = await planned('inherited', { oneTimeIncome: [{ age: 50, amount: 200000, kind: 'inheritedTrad', owner: 'A' }, { age: 52, amount: 100000, kind: 'inheritedRoth', owner: 'B' }] });
  feature('inherited: a scheduled inherited draw', rows.some((r) => r.inheritedDraw > 0));
  feature('inherited: an inherited Roth payout', rows.some((r) => r.inheritedRothPayout > 0));
});

it('selfEmployed: a settled 162(l) year carries a refund or balance due into the next', async () => {
  const { rows } = await planned('selfEmployed', { ...FP, incomeA: 82000 });
  feature('selfEmployed: a carry', rows.some((r) => (r.seSettlementIn ?? 0) !== 0));
});

it('selfEmployed: a balance due carried into a draw year', async () => {
  // tests/unit/us/se-carry.test.js's household and switch.
  const S = await setup({
    singlePerson: true, ageA: 50, retireAgeA: 52, lifeExpectancyA: 61, inflation: 0, acaEnabled: false, guardrailsEnabled: true, tenure: 'rent',
    cliffGuardEnabled: false, ssMonthlyA: 0, pensionYearlyA: 400000, pensionStartAgeA: 57, cash: 0, cashReserve: 0, taxable: 2000000,
    children: [], incomeSources: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
  });
  S.testHooks.testSeCarryAt = { year: 2, amount: -20000 };
  const rows = S.e.simulate().rows;
  S.testHooks.testSeCarryAt = null;
  balance('carryDue', rows, S.cashFlowParts);
  feature('carryDue: a balance due', rows[3].seSettlementIn === -20000);
});

it('ladder: the pre-retirement bond ladder sells taxable and pays its tax from the sale', async () => {
  const { rows } = await planned('ladder', {
    ...ACCOUNTS0, singlePerson: true, ageA: 50, retireAgeA: 55, lifeExpectancyA: 90, incomeA: 150000, k401PctA: 0, catchupPctA: 0, iraPctA: 0,
    taxable: 1500000, basisRatio: 20, bondYears: 5, spending: 60000, tenure: 'rent', children: [],
  });
  feature('ladder: a sale for tax', rows.some((r) => r.taxableSaleForTax > 0));
});

it('oneTime: a tax-free one-time income is credited to cash', async () => {
  const { rows } = await planned('oneTime', { oneTimeIncome: [{ age: 60, amount: 100000, kind: 'free' }] });
  feature('oneTime: one-time cash', rows.some((r) => r.oneTimeCash > 0));
});

it('bucket: the reserve household on one historical path from a down year', async () => {
  const S = await setup(RESERVE);
  const { HIST } = await S.w.load('shared/core/projection/historical-data.js');
  const i = HIST.findIndex((h) => h[0] === 1973);
  const rows = S.e.simulateHistoricalRaw((y) => HIST[i + y]).rows;
  balance('bucket', rows, S.cashFlowParts);
  feature('bucket: a draw in a down year', rows.some((r, y) => HIST[i + y][1] < 0 && r.taxableWithdrawn + r.traditionalWithdrawn + r.rothWithdrawn + r.cashWithdrawn > 0));
  feature('bucket: a bond-reserve fill', rows.some((r) => r.toBondReserve > 0));
});
