// The one-year cash-flow diagram's columns (Canada, Sankey redesign task 5; spec 3 and 5.3): for every row of the planned run of
// each scenario, sankeyColumns (src/canada/core/income/sankey-columns.js) recomputes the list items from the inputs, and every
// group reconciles with the row: money in equals money out within $1, each group's value is the sum of its items, no group needed
// an "Other" band or lost its split (issues is empty), and the groups with a row figure (Retirement income, Extra & one-time, and
// the Earned + Other pair) match it within $1. Each scenario asserts that the items it exists for appear in at least one row, so
// no scenario can pass vacuously. The US counterpart is tests/unit/us/sankey-columns.test.js.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 6324;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const IN_GROUPS = [['earned', 'Earned income'], ['other', 'Other inflows'], ['retirement', 'Retirement income'], ['savings', 'From savings'], ['shortfall', 'Shortfall (not funded)']];
const OUT_GROUPS = [['taxes', 'Taxes'], ['essentials', 'Essentials'], ['everyday', 'Everyday spending'], ['extra', 'Extra & one-time'], ['saved', 'Savings']];
const sumItems = (items) => items.reduce((s, it) => s + it.value, 0);
const sumGroups = (groups) => groups.reduce((s, g) => s + g.value, 0);
const group = (cols, key) => cols.in.find((g) => g.key === key) || cols.out.find((g) => g.key === key);
const items = (cols) => [...cols.in, ...cols.out].flatMap((g) => g.items);
const item = (cols, key) => items(cols).find((it) => it.key === key);
const feature = (name, ok) => c.expect(ok, name).toBe(true);

async function setup(patch) {
  const w = await world();
  await w.setState(patch);
  const e = await engine(w);
  const { sankeyColumns } = await w.load('canada/core/income/sankey-columns.js');
  return { w, e, sankeyColumns };
}

// One row's columns, checked as the header says.
function check(at, row, k) {
  const sIn = sumGroups(k.in),
    sOut = sumGroups(k.out);
  c.expect(Math.abs(sIn - sOut) <= 1, `${at}: in ${sIn}, out ${sOut}`).toBe(true);
  c.expect(k.total, `${at}: total`).toBe(sIn);
  for (const g of [...k.in, ...k.out]) c.expect(g.value, `${at}: ${g.key} is the sum of its items`).toBe(sumItems(g.items));
  c.expect(k.issues, `${at}: issues`).toStrictEqual([]);
  const ret = group(k, 'retirement').value,
    extra = group(k, 'extra').value,
    // a Tax refund item (a negative year's tax) is outside the pair's row figure
    pair = group(k, 'earned').value + group(k, 'other').value - (item(k, 'taxRefund')?.value ?? 0),
    pairRow = row.wages + row.oneTimeCash + row.payrollPremiums + row.employerContrib;
  c.expect(Math.abs(ret - (row.ss + row.pension + row.benefits)) <= 1, `${at}: retirement ${ret} vs ${row.ss + row.pension + row.benefits}`).toBe(true);
  c.expect(Math.abs(extra - (row.extraExpense + row.lumpExpense)) <= 1, `${at}: extra ${extra} vs ${row.extraExpense + row.lumpExpense}`).toBe(true);
  c.expect(Math.abs(pair - pairRow) <= 1, `${at}: earned + other ${pair} vs ${pairRow}`).toBe(true);
}

// The planned run's rows and each row's columns.
async function planned(name, patch) {
  const S = await setup(patch);
  const rows = S.e.simulate().rows;
  const ctx = await S.w.ctx();
  const cols = rows.map((row) => {
    const k = S.sankeyColumns(ctx, row);
    check(`${name}: year ${row.year} (age ${row.age})`, row, k);
    return k;
  });
  c.expect(cols[0].in.map((g) => [g.key, g.label]), name + ': money-in groups').toStrictEqual(IN_GROUPS);
  c.expect(cols[0].out.map((g) => [g.key, g.label]), name + ': money-out groups').toStrictEqual(OUT_GROUPS);
  return { ...S, ctx, rows, cols };
}

const LISTS0 = { loans: [], spendingTiers: [], incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], children: [] };
const LOAN = { principal: 40000, balance: 30000, rate: 6, term: 10, extra: 500 };
const stream = (o) => ({ name: '', amount: 0, startAge: 0, endAge: 0, followGrowth: true, growth: 0, ...o });

it('working: a couple with a match, a premium, the FHSA, streams, one-time items, two loans and named rows', async () => {
  const { rows, cols } = await planned('working', {
    ...LISTS0, ageA: 45, ageB: 43, lifeExpectancyA: 90, lifeExpectancyB: 90, retireAgeA: 55, retireAgeB: 57, incomeA: 110000, incomeB: 70000,
    matchA: 4, matchB: 3, healthPremiumA: 40, rrspPctA: 50, rrspPctB: 50, tfsaPctA: 5, tfsaPctB: 5, tenure: 'rentThenBuy', buyAge: 50,
    fhsaPctA: 5, fhsaPctB: 5,
    incomeSources: [
      stream({ name: 'Rent', amount: 12000, startAge: 45, endAge: 80 }),
      stream({ amount: 8000, startAge: 47, endAge: 60 }),
    ],
    oneTimeIncome: [{ name: 'Inheritance', age: 50, amount: 80000, flat: false }, { age: 52, amount: 5000, flat: true }],
    extraExpenses: [{ name: 'Tuition', amount: 10000, startAge: 46, endAge: 50, flat: false, followGrowth: true, growth: 0 }],
    lumpExpenses: [{ name: 'Roof', amount: 25000, age: 52, repeatEvery: 0, untilAge: 52, flat: false, followGrowth: true, growth: 0 }],
    loans: [{ name: 'Car', ...LOAN }, { ...LOAN, balance: 10000, principal: 15000, term: 5 }],
    spendingTiers: [{ name: 'Travel years', amount: 90000, startAge: 56, endAge: 70, flat: false, followGrowth: true, growth: 0 }],
  });
  const any = (key, ok = () => true) => cols.some((k) => { const it = item(k, key); return it !== undefined && ok(it); });
  feature('working: wages A and B', any('wagesA', (it) => it.label === 'Wages · Partner A') && any('wagesB', (it) => it.label === 'Wages · Partner B'));
  feature('working: wages gross of the premium', cols.some((k, i) => rows[i].workingA && rows[i].payrollPremiums > 0 && item(k, 'wagesA').value === 110000 * Math.pow(1.03, rows[i].year)));
  feature('working: employer contributions', any('employer', (it) => it.label === 'Employer contributions'));
  feature('working: the named stream in Other inflows', cols.some((k) => group(k, 'other').items.some((it) => it.key === 'stream:0' && it.label === 'Rent' && it.sub === 'Income stream 1' && it.list === 'incomeSources')));
  feature('working: the unnamed stream in Other inflows', cols.some((k) => group(k, 'other').items.some((it) => it.key === 'stream:1' && it.label === 'Income stream 2' && it.sub === undefined)));
  c.expect(cols.filter((k) => group(k, 'earned').items.some((it) => it.key.startsWith('stream:'))).length, 'working: no stream in Earned income').toBe(0);
  feature('working: the named one-time income', any('lump:0', (it) => it.label === 'Inheritance' && it.sub === 'One-time income 1' && it.list === 'oneTimeIncome'));
  feature('working: the fixed one-time income', any('lump:1', (it) => it.label === 'One-time income 2' && it.value === 5000));
  feature('working: payroll premiums', any('premiums', (it) => it.label === 'Payroll health premiums'));
  feature('working: the extra expense', any('extraExp:0', (it) => it.label === 'Tuition' && it.list === 'extraExpenses'));
  feature('working: two loans', any('loan:0', (it) => it.label === 'Car' && it.sub === 'Loan 1') && any('loan:1', (it) => it.label === 'Loan 2'));
  feature('working: into RRSP (your contributions) beside the employer band', any('intoRrsp', (it) => it.label === 'Into RRSP (your contributions)'));
  feature('working: into RRSP (employer)', any('intoRrspEmployer', (it) => it.label === 'Into RRSP (employer)'));
  feature('working: into TFSA', any('intoTfsa', (it) => it.label === 'Into TFSA'));
  feature('working: into FHSA', any('intoFhsa', (it) => it.label === 'Into FHSA'));
  feature('working: into non-registered', any('intoNonRegistered', (it) => it.label === 'Into non-registered'));
  feature('working: the spending tier names Everyday spending', any('everyday', (it) => it.sub === 'Travel years' && it.list === 'spendingTiers'));
  const at = (age) => cols[rows.findIndex((r) => r.age === age)];
  const roof = item(at(52), 'lumpExp:0');
  c.expect(roof && [roof.label, roof.sub, roof.list], 'working: the roof at 52').toStrictEqual(['Roof', 'One-time expense 1', 'lumpExpenses']);
  c.expect(item(at(51), 'lumpExp:0'), 'working: no roof at 51').toBe(undefined);
  c.expect(item(at(53), 'lumpExp:0'), 'working: no roof at 53').toBe(undefined);
});

it('noMatch: without an employer band the RRSP band is "Into RRSP"', async () => {
  const { cols } = await planned('noMatch', { ...LISTS0, rrspPctA: 50, matchA: 0, matchB: 0 });
  feature('noMatch: into RRSP', cols.some((k) => item(k, 'intoRrsp')?.label === 'Into RRSP'));
  c.expect(cols.filter((k) => item(k, 'intoRrspEmployer') || item(k, 'intoRrsp')?.label === 'Into RRSP (your contributions)').length, 'noMatch: no employer band').toBe(0);
});

it('retired: CPP, OAS, pensions, the RRIF minimum, TFSA, non-registered and cash draws', async () => {
  const { cols } = await planned('retired', {
    ...LISTS0, ageA: 72, ageB: 70, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 95, lifeExpectancyB: 95, traditional: 300000, roth: 150000,
    taxable: 60000, cash: 40000, cashReserve: 10000, cppMonthlyA: 1100, cppStartAgeA: 65, cppMonthlyB: 800, cppStartAgeB: 65, oasStartAgeA: 65,
    oasStartAgeB: 65, pensionCoverage: 'both', pensionYearlyA: 8000, pensionStartAgeA: 65, pensionYearlyB: 6000, pensionStartAgeB: 65,
    spending: 90000, tenure: 'own', homeValue: 500000, mortgage: 0, mortgagePrincipal: 0,
  });
  for (const [key, label] of [['cppA', 'CPP · Partner A'], ['cppB', 'CPP · Partner B'], ['oas', 'OAS'], ['pensionA', 'Pension · Partner A'], ['pensionB', 'Pension · Partner B'],
    ['rmd', 'RRIF minimum'], ['traditional', 'RRSP / RRIF (beyond the minimum)'], ['roth', 'TFSA'], ['taxable', 'Non-registered'], ['cash', 'Cash'], ['home', 'Home equity']])
    feature('retired: ' + key, cols.some((k) => item(k, key)?.label === label));
});

it('oas: a recovery year nets the OAS band of the recovery tax', async () => {
  const { rows, cols } = await planned('oas', {
    ...LISTS0, singlePerson: true, ageA: 66, retireAgeA: 60, lifeExpectancyA: 85, pensionCoverage: 'a', pensionYearlyA: 100000, pensionStartAgeA: 60,
    oasStartAgeA: 65, spending: 60000, tenure: 'rent',
  });
  const i = rows.findIndex((r) => r.oasClawback > 0);
  feature('oas: a recovery year', i >= 0);
  if (i >= 0) {
    const o = item(cols[i], 'oas');
    feature('oas: the OAS band', o !== undefined && o.label === 'OAS');
    c.expect(o && o.value, 'oas: value = gross - recovery').toBe(o && o.gross - o.recovery);
    c.expect(o && o.recovery, 'oas: recovery = the row\'s oasClawback').toBe(rows[i].oasClawback);
    feature('oas: gross above the recovery', !!o && o.gross > o.recovery);
  }
});

it('benefits: a low-income senior receives the GIS, a low-income family the child benefits', async () => {
  const gis = await planned('benefitsGis', {
    ...LISTS0, singlePerson: true, ageA: 66, retireAgeA: 66, lifeExpectancyA: 90, taxable: 0, traditional: 20000, roth: 60000, cash: 5000,
    cashReserve: 5000, spending: 18000, tenure: 'rent', rent: 800, cppMonthlyA: 300, cppStartAgeA: 65, oasStartAgeA: 65,
  });
  feature('benefits: GIS / Allowance', gis.cols.some((k, i) => gis.rows[i].benefitGis > 0 && item(k, 'gis')?.label === 'GIS / Allowance'));
  feature('benefits: credits', gis.cols.some((k) => item(k, 'credits')?.label === "Credits and provincial seniors' programs"));
  const kids = await planned('benefitsKids', {
    ...LISTS0, ageA: 32, ageB: 32, retireAgeA: 60, retireAgeB: 32, lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 40000, incomeB: 0,
    children: [{ birthYear: 2022 }, { birthYear: 2024 }], spending: 20000, tenure: 'rent', rent: 0, rrspPctA: 0, tfsaPctA: 0,
  });
  feature('benefits: child benefits', kids.cols.some((k, i) => kids.rows[i].benefitCcb > 0 && item(k, 'childBenefits')?.label === 'Child benefits'
    && item(k, 'childBenefits').value === kids.rows[i].benefitCcb + kids.rows[i].benefitProvChild));
});

it('surplus: a pension above spending, reinvested, a cash top-up and a bond reserve', async () => {
  const { cols } = await planned('surplus', {
    ...LISTS0, singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 95, tenure: 'rent', rent: 1500, cash: 0, cashReserve: 50000,
    bondYears: 3, taxable: 400000, traditional: 300000, roth: 100000, spending: 50000, pensionCoverage: 'a', pensionYearlyA: 90000,
    pensionStartAgeA: 65, cppMonthlyA: 0, oasMonthlyA: 0,
  });
  feature('surplus: into non-registered', cols.some((k) => item(k, 'intoNonRegistered')?.label === 'Into non-registered'));
  feature('surplus: into cash', cols.some((k) => item(k, 'intoCash')?.label === 'Into cash'));
  feature('surplus: into the bond reserve', cols.some((k) => item(k, 'intoBonds')?.label === 'Into the bond reserve'));
  feature("surplus: a single person's pension label", cols.some((k) => item(k, 'pensionA')?.label === 'Pension'));
});

it('shortfall: a renter whose portfolio runs out', async () => {
  const { cols } = await planned('shortfall', {
    ...LISTS0, singlePerson: true, ageA: 70, retireAgeA: 70, lifeExpectancyA: 95, taxable: 50000, traditional: 50000, roth: 0, cash: 10000,
    cashReserve: 10000, spending: 70000, cppMonthlyA: 1000, cppStartAgeA: 65, oasStartAgeA: 65, tenure: 'rent',
  });
  feature('shortfall: a shortfall band', cols.some((k) => group(k, 'shortfall').items.length === 1 && group(k, 'shortfall').value > 0));
  feature("shortfall: a single person's CPP label", cols.some((k) => item(k, 'cppA')?.label === 'CPP'));
});

it('survivor: Partner A dies at 66 with a loan and a stream', async () => {
  // inflation 0: the survivor's CPP is a hand-computed literal (A's 1,500 a month)
  const { rows, cols } = await planned('survivor', {
    ...LISTS0, ageA: 60, ageB: 58, retireAgeA: 64, retireAgeB: 64, lifeExpectancyA: 90, lifeExpectancyB: 90, inflation: 0, survivorEnabled: true,
    survivorPartner: 'A', survivorDeathAge: 66, pensionCoverage: 'both', pensionYearlyA: 20000, pensionStartAgeA: 62, pensionYearlyB: 10000,
    pensionStartAgeB: 62, cppStartAgeA: 62, cppStartAgeB: 62, cppMonthlyA: 1500, cppMonthlyB: 700,
    incomeSources: [stream({ name: 'Annuity', amount: 9000, startAge: 60, endAge: 100, followGrowth: false })],
    // rate 0: loanSchedules passes the rate in percent to mortgagePayment, so a loan with interest is paid off in year 0 (reported)
    loans: [{ name: 'Boat', ...LOAN, rate: 0, extra: 0 }],
  });
  const deathYear = 6;
  const after = cols.filter((k, i) => rows[i].year > deathYear);
  feature('survivor: years after the death', after.length > 10);
  feature("survivor: A's wages before the death", cols.some((k, i) => rows[i].year < deathYear && item(k, 'wagesA')));
  c.expect(after.filter((k) => item(k, 'pensionA') || item(k, 'wagesA')).length, 'survivor: no pension or wages of A after the death').toBe(0);
  c.expect(after.filter((k) => !item(k, 'stream:0')).length, 'survivor: the stream after the death').toBe(0);
  c.expect(after.filter((k) => item(k, 'cppA') || item(k, 'cppB')?.value !== 18000).length, 'survivor: B keeps the greater CPP').toBe(0);
  feature('survivor: the loan paid off in the death year', item(cols[deathYear], 'loan:0')?.label === 'Boat' && rows[deathYear].loanPayment > 0);
  c.expect(after.filter((k) => item(k, 'loan:0')).length, 'survivor: no loan after the death').toBe(0);
});

it('survivor B: Partner B dies at 64', async () => {
  const { rows, cols } = await planned('survivorB', {
    ...LISTS0, ageA: 58, ageB: 60, retireAgeA: 64, retireAgeB: 64, lifeExpectancyA: 90, lifeExpectancyB: 90, inflation: 0, survivorEnabled: true,
    survivorPartner: 'B', survivorDeathAge: 64, pensionCoverage: 'both', pensionYearlyA: 10000, pensionStartAgeA: 62, pensionYearlyB: 20000,
    pensionStartAgeB: 62, cppStartAgeA: 62, cppStartAgeB: 62, cppMonthlyA: 700, cppMonthlyB: 1500,
  });
  const after = cols.filter((k, i) => rows[i].year > 4);
  feature('survivorB: years after the death', after.length > 10);
  c.expect(after.filter((k) => item(k, 'pensionB') || item(k, 'wagesB') || item(k, 'cppB')).length, 'survivorB: nothing of B after the death').toBe(0);
  c.expect(after.filter((k) => item(k, 'cppA')?.value !== 18000).length, 'survivorB: A keeps the greater CPP').toBe(0);
});

it("refund: a negative year's tax is a Tax refund in Other inflows", async () => {
  // An Ontario renter of 70 and over with supplemental health costs: the refundable Seniors Care at Home credit (tax.js
  // careAtHomeCredit) takes the year's tax below 0 once the portfolio runs out. A real row, as the US refund scenario.
  const { rows, cols } = await planned('refund', { ...LISTS0, singlePerson: true, ageA: 70, retireAgeA: 70, lifeExpectancyA: 95, taxable: 50000, traditional: 50000, roth: 0, cash: 10000, cashReserve: 10000, spending: 70000, tenure: 'rent' });
  const i = rows.findIndex((r) => r.tax < 0);
  feature('refund: a year with a negative tax', i >= 0);
  if (i >= 0) {
    const k = cols[i];
    c.expect(item(k, 'taxRefund')?.value, 'refund: the Tax refund').toBe(-rows[i].tax);
    feature('refund: in Other inflows', group(k, 'other').items.some((it) => it.key === 'taxRefund' && it.label === 'Tax refund'));
    c.expect(item(k, 'tax'), 'refund: no Taxes item').toBe(undefined);
  }
  const j = rows.findIndex((r) => r.tax > 0);
  c.expect(j >= 0 && item(cols[j], 'tax')?.value, "refund: a positive year's Taxes item").toBe(j >= 0 && rows[j].tax);
});
