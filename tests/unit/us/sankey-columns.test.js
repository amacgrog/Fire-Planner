// The one-year cash-flow diagram's columns (US, Sankey redesign task 4; spec 3 and 5.3): for every row of the planned run of each
// scenario, sankeyColumns (src/us/core/income/sankey-columns.js) recomputes the list items from the inputs, and every group
// reconciles with the row: money in equals money out within $1, each group's value is the sum of its items, no group needed an
// "Other" band or lost its split (issues is empty), and the groups with a row figure (Retirement income, Extra & one-time, and
// the Earned + Other pair) match it within $1. Each scenario asserts that the items it exists for appear in at least one row,
// so no scenario can pass vacuously. foldItems (src/shared/core/format/sankey-fold.js) is checked on its own and in a crowded year.
import { it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const require = createRequire(import.meta.url);
const { ACCOUNTS0, LOAN } = require('../../helpers/plan-households.js');

const NEW_COUNT = 5701;
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
  const { sankeyColumns } = await w.load('us/core/income/sankey-columns.js');
  const { foldItems } = await w.load('shared/core/format/sankey-fold.js');
  return { w, e, sankeyColumns, foldItems };
}

// The planned run's rows and each row's columns, checked as the header says.
async function planned(name, patch) {
  const S = await setup(patch);
  const rows = S.e.simulate().rows;
  const ctx = await S.w.ctx();
  const cols = rows.map((row) => {
    const k = S.sankeyColumns(ctx, row),
      at = `${name}: year ${row.year} (age ${row.age})`,
      sIn = sumGroups(k.in),
      sOut = sumGroups(k.out);
    c.expect(Math.abs(sIn - sOut) <= 1, `${at}: in ${sIn}, out ${sOut}`).toBe(true);
    c.expect(k.total, `${at}: total`).toBe(sIn);
    for (const g of [...k.in, ...k.out]) c.expect(g.value, `${at}: ${g.key} is the sum of its items`).toBe(sumItems(g.items));
    c.expect(k.issues, `${at}: issues`).toStrictEqual([]);
    const ret = group(k, 'retirement').value,
      extra = group(k, 'extra').value,
      pair = group(k, 'earned').value + group(k, 'other').value,
      pairRow = row.wages + row.oneTimeCash + Math.max(0, row.seSettlementIn ?? 0) + row.payrollPremiums + row.employerContrib;
    c.expect(Math.abs(ret - (row.ss + row.pension)) <= 1, `${at}: retirement ${ret} vs ${row.ss + row.pension}`).toBe(true);
    c.expect(Math.abs(extra - (row.extraExpense + row.lumpExpense)) <= 1, `${at}: extra ${extra} vs ${row.extraExpense + row.lumpExpense}`).toBe(true);
    c.expect(Math.abs(pair - pairRow) <= 1, `${at}: earned + other ${pair} vs ${pairRow}`).toBe(true);
    return k;
  });
  c.expect(cols[0].in.map((g) => [g.key, g.label]), name + ': money-in groups').toStrictEqual(IN_GROUPS);
  c.expect(cols[0].out.map((g) => [g.key, g.label]), name + ': money-out groups').toStrictEqual(OUT_GROUPS);
  return { ...S, rows, cols };
}

const stream = (o) => ({
  name: '', amount: 0, startAge: 0, endAge: 0, followGrowth: true, growth: 0, owner: 'A', kind: 'other', contribute: false, deferralType: 'traditional',
  deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 0, healthPremium: 0, ...o,
});

it('working: a couple with streams, one-time items, two loans and named rows', async () => {
  const { rows, cols } = await planned('working', {
    ageA: 45, ageB: 43, lifeExpectancyA: 90, lifeExpectancyB: 90, retireAgeA: 55, retireAgeB: 57, incomeKindB: 'wages', healthPremiumA: 150,
    k401TypeA: 'traditional', iraTypeA: 'roth',
    incomeSources: [
      stream({ name: 'Night shift', amount: 30000, startAge: 46, endAge: 52, owner: 'A', kind: 'wages', contribute: true, deferralPct: 5, matchPct: 4, healthPremium: 2400 }),
      stream({ amount: 15000, startAge: 47, endAge: 60, owner: 'B', kind: 'self' }),
      stream({ name: 'Rent', amount: 12000, startAge: 45, endAge: 80, owner: 'A', kind: 'other' }),
    ],
    oneTimeIncome: [{ name: 'Stock sale', age: 50, amount: 80000, kind: 'gain', gainPct: 40, owner: 'A' }],
    extraExpenses: [{ name: 'Tuition', amount: 10000, startAge: 46, endAge: 50, flat: false, followGrowth: true, growth: 0 }],
    lumpExpenses: [{ name: 'Roof', amount: 25000, age: 52, repeatEvery: 0, untilAge: 52, flat: false, followGrowth: true, growth: 0 }],
    loans: [{ name: 'Car', ...LOAN }, { ...LOAN, balance: 10000, principal: 15000, term: 5 }],
    spendingTiers: [{ name: 'Travel years', amount: 90000, startAge: 56, endAge: 70, flat: false, followGrowth: true, growth: 0 }],
  });
  const any = (key, ok = () => true) => cols.some((k) => { const it = item(k, key); return it !== undefined && ok(it); });
  feature('working: wages A and B', any('wagesA', (it) => it.label === 'Wages · Partner A') && any('wagesB', (it) => it.label === 'Wages · Partner B'));
  feature('working: the named W-2 stream', any('stream:0', (it) => it.label === 'Night shift' && it.sub === 'Income stream 1' && it.list === 'incomeSources'));
  feature('working: the unnamed self stream', any('stream:1', (it) => it.label === 'Income stream 2' && it.sub === undefined));
  feature('working: the not-earned stream in Other inflows', cols.some((k) => group(k, 'other').items.some((it) => it.key === 'stream:2' && it.label === 'Rent')));
  feature('working: the self stream in Earned income', cols.some((k) => group(k, 'earned').items.some((it) => it.key === 'stream:1')));
  feature('working: employer contributions', any('employer', (it) => it.label === 'Employer contributions'));
  feature('working: the gain one-time income', any('lump:0', (it) => it.label === 'Stock sale' && it.sub === 'One-time income 1'));
  feature('working: payroll premiums', any('premiums', (it) => it.label === 'Payroll health premiums'));
  feature('working: the extra expense', any('extraExp:0', (it) => it.label === 'Tuition' && it.list === 'extraExpenses'));
  feature('working: two loans', any('loan:0', (it) => it.label === 'Car' && it.sub === 'Loan 1') && any('loan:1', (it) => it.label === 'Loan 2'));
  feature('working: into traditional (your contributions) beside the employer band', any('intoTrad', (it) => it.label === 'Into traditional (your contributions)'));
  feature('working: into Roth', any('intoRoth', (it) => it.label === 'Into Roth'));
  feature('working: the spending tier names Everyday spending', any('everyday', (it) => it.sub === 'Travel years'));
  const at = (age) => cols[rows.findIndex((r) => r.age === age)];
  const roof = item(at(52), 'lumpExp:0');
  c.expect(roof && [roof.label, roof.sub, roof.list], 'working: the roof at 52').toStrictEqual(['Roof', 'One-time expense 1', 'lumpExpenses']);
  c.expect(item(at(51), 'lumpExp:0'), 'working: no roof at 51').toBe(undefined);
  c.expect(item(at(53), 'lumpExp:0'), 'working: no roof at 53').toBe(undefined);
});

it('retired: Social Security, pensions, RMDs, Roth, cash and home-equity draws', async () => {
  const { cols } = await planned('retired', {
    ...ACCOUNTS0, ageA: 72, ageB: 70, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 95, lifeExpectancyB: 95, children: [],
    trad401kA: 150000, tradIraB: 60000, rothIraA: 60000, taxable: 40000, cash: 30000, cashReserve: 10000,
    ssMonthlyA: 1500, ssStartAgeA: 70, ssMonthlyB: 1200, ssStartAgeB: 70, pensionCoverage: 'both', pensionYearlyA: 8000, pensionStartAgeA: 65,
    pensionYearlyB: 6000, pensionStartAgeB: 65, spending: 90000, tenure: 'own', homeValue: 500000, mortgage: 0, mortgagePrincipal: 0,
  });
  for (const [key, label] of [['ssA', 'Social Security · Partner A'], ['ssB', 'Social Security · Partner B'], ['pensionA', 'Pension · Partner A'], ['pensionB', 'Pension · Partner B'], ['rmd', 'RMD'], ['roth', 'Roth'], ['cash', 'Cash'], ['home', 'Home equity']])
    feature('retired: ' + key, cols.some((k) => item(k, key)?.label === label));
});

it('surplus: a pension above spending, reinvested and a bond reserve', async () => {
  const { cols } = await planned('surplus', {
    ...ACCOUNTS0, singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, pensionCoverage: 'a', pensionYearlyA: 120000, pensionStartAgeA: 65,
    spending: 40000, tenure: 'rent', children: [], bondYears: 3, taxable: 100000,
  });
  feature('surplus: into brokerage', cols.some((k) => item(k, 'intoBrokerage')?.label === 'Into brokerage'));
  feature('surplus: into the bond reserve', cols.some((k) => item(k, 'intoBonds')?.label === 'Into the bond reserve'));
  feature('surplus: a single person\'s pension label', cols.some((k) => item(k, 'pensionA')?.label === 'Pension'));
});

it('shortfall: a renter whose portfolio runs out', async () => {
  const { cols } = await planned('shortfall', {
    ...ACCOUNTS0, singlePerson: true, ageA: 70, retireAgeA: 70, lifeExpectancyA: 95, taxable: 50000, trad401kA: 50000, cash: 10000,
    cashReserve: 10000, spending: 70000, ssMonthlyA: 1500, ssStartAgeA: 70, children: [], tenure: 'rent',
  });
  feature('shortfall: a shortfall band', cols.some((k) => group(k, 'shortfall').items.length === 1 && group(k, 'shortfall').value > 0));
  feature('shortfall: a single person\'s Social Security label', cols.some((k) => item(k, 'ssA')?.label === 'Social Security'));
});

it('survivor: Partner A dies at 66 with a loan, a W-2 stream and a not-earned stream', async () => {
  const { rows, cols } = await planned('survivor', {
    ageA: 60, ageB: 58, retireAgeA: 64, retireAgeB: 64, lifeExpectancyA: 90, lifeExpectancyB: 90, survivorEnabled: true, survivorPartner: 'A',
    survivorDeathAge: 66, pensionCoverage: 'both', pensionYearlyA: 20000, pensionStartAgeA: 62, pensionYearlyB: 10000, pensionStartAgeB: 62,
    ssStartAgeA: 62, ssStartAgeB: 62, ssMonthlyA: 3000, ssMonthlyB: 1500,
    incomeSources: [
      stream({ name: 'Board seat', amount: 20000, startAge: 60, endAge: 75, owner: 'A', kind: 'wages' }),
      stream({ name: 'Annuity', amount: 9000, startAge: 60, endAge: 100, owner: 'A', kind: 'other' }),
    ],
    // rate 0: loanSchedules passes the rate in percent to mortgagePayment, so a loan with interest is paid off in year 0 (reported)
    loans: [{ name: 'Boat', ...LOAN, rate: 0, extra: 0 }],
  });
  const deathYear = 6;
  const after = cols.filter((k, i) => rows[i].year > deathYear);
  feature('survivor: years after the death', after.length > 10);
  feature('survivor: A\'s W-2 stream before the death', cols.some((k, i) => rows[i].year < deathYear && item(k, 'stream:0')));
  c.expect(after.filter((k) => item(k, 'stream:0')).length, 'survivor: no W-2 stream of A after the death').toBe(0);
  c.expect(after.filter((k) => item(k, 'pensionA')).length, 'survivor: no pension of A after the death').toBe(0);
  c.expect(after.filter((k) => !item(k, 'stream:1')).length, 'survivor: the not-earned stream after the death').toBe(0);
  c.expect(after.filter((k) => group(k, 'retirement').items.filter((it) => it.key === 'ssA' || it.key === 'ssB').length !== 1).length, 'survivor: one Social Security item').toBe(0);
  // A had the greater benefit: the survivor (B) keeps it, as row.ss.
  c.expect(after.filter((k, i) => !(item(k, 'ssB')?.value === rows[rows.length - after.length + i].ss)).length, 'survivor: B keeps the greater benefit').toBe(0);
  feature('survivor: the loan paid off in the death year', item(cols[deathYear], 'loan:0')?.label === 'Boat' && rows[deathYear].loanPayment > 0);
  c.expect(after.filter((k) => item(k, 'loan:0')).length, 'survivor: no loan after the death').toBe(0);
});

it('inherited: an inherited IRA and an inherited Roth', async () => {
  const { rows, cols } = await planned('inherited', {
    lifeExpectancyA: 90, lifeExpectancyB: 90,
    oneTimeIncome: [{ age: 50, amount: 200000, kind: 'inheritedTrad', owner: 'A' }, { age: 52, amount: 100000, kind: 'inheritedRoth', owner: 'B' }],
  });
  feature('inherited: a scheduled draw in Traditional', cols.some((k, i) => rows[i].inheritedDraw > 0 && item(k, 'traditional')?.label === 'Traditional (beyond the RMD)'));
  feature('inherited: the Roth payout in Roth', cols.some((k, i) => rows[i].inheritedRothPayout > 0 && item(k, 'roth')?.value >= rows[i].inheritedRothPayout));
  c.expect(cols.filter((k) => items(k).some((it) => it.key.startsWith('lump:'))).length, 'inherited: no one-time income item').toBe(0);
});

it('sepp: a 72(t) payment', async () => {
  const { rows, cols } = await planned('sepp', {
    ...ACCOUNTS0, singlePerson: true, ageA: 50, retireAgeA: 50, lifeExpectancyA: 85, tradIraA: 600000, taxable: 200000, sepp72tIraA: true,
    spending: 50000, tenure: 'rent', children: [],
  });
  feature('sepp: a 72(t) year', cols.some((k, i) => rows[i].sepp72 > 0 && item(k, 'rmd')?.label === 'RMD & 72(t)'));
});

it('selfEmployed: a self-employed main income with a 162(l) carry', async () => {
  // cash-flow-balance.test.js's FP household (se-settlement.test.js).
  const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
  const { rows, cols } = await planned('selfEmployed', {
    ...ZERO, singlePerson: true, ageA: 50, retireAgeA: 60, incomeA: 82000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000,
    stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0,
    megaBackdoor: false, cliffGuardEnabled: false,
  });
  feature('selfEmployed: the main self-employment profit', cols.some((k) => item(k, 'seA')?.label === 'Self-employment' && item(k, 'seA').value === 82000));
  feature('selfEmployed: a carry', rows.some((r) => (r.seSettlementIn ?? 0) !== 0));
  feature('selfEmployed: a refund is a settlement item', cols.every((k, i) => !((rows[i].seSettlementIn ?? 0) > 0) || item(k, 'settlement')?.value === rows[i].seSettlementIn));
});

it('fold: the smallest items fold into one', async () => {
  const S = await setup({});
  const ten = Array.from({ length: 10 }, (_, i) => ({ key: 'k' + (i + 1), label: 'L' + (i + 1), value: i + 1 }));
  const f = S.foldItems(ten);
  c.expect(f.length, 'fold: 8 items').toBe(8);
  c.expect(f.slice(0, 7).map((it) => it.value), 'fold: the 7 largest in order').toStrictEqual([4, 5, 6, 7, 8, 9, 10]);
  c.expect(f[7], 'fold: the fold item').toStrictEqual({ key: 'fold', label: 'Other (3 items)', value: 6, sub: 'L1, L2, L3' });
  const eight = ten.slice(0, 8);
  c.expect(S.foldItems(eight), 'fold: 8 items unchanged').toBe(eight);
  // A crowded year: ten extra expenses at 60.
  const { rows, cols } = await planned('crowded', {
    extraExpenses: Array.from({ length: 10 }, (_, i) => ({ name: 'Cost ' + (i + 1), amount: 1000 * (i + 1), startAge: 60, endAge: 60, flat: true, followGrowth: false, growth: 0 })),
  });
  const k = cols[rows.findIndex((r) => r.age === 60)],
    g = group(k, 'extra');
  c.expect(g.items.map((it) => it.label), 'crowded: the extra group folded').toStrictEqual(['Cost 4', 'Cost 5', 'Cost 6', 'Cost 7', 'Cost 8', 'Cost 9', 'Cost 10', 'Other (3 items)']);
  c.expect(g.items[7].value, 'crowded: the fold value').toBe(6000);
});
