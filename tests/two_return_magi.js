const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b} (+/-${tol}), got ${a}`);

async function openPlanner() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
  return { browser, page, errors };
}
// Runs simulate() under a state patch and restores the state afterwards. Returns the rows.
const rows = (page, patch) =>
  page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return JSON.parse(JSON.stringify(window.__test_simulate().rows));
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, patch);
// Calls window.__test_tax[fn](...args) under a state patch.
const taxCall = (page, patch, fn, args) =>
  page.evaluate(({ patch, fn, args }) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return window.__test_tax[fn](...args);
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, { patch, fn, args });

const BASE = {
  singlePerson: true, filingStatus: 'single', marryLater: false, survivorEnabled: false, children: [],
  ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 64, lifeExpectancyB: 64,
  inflation: 0, medicalInflation: 0, returnRate: 0, bondReturn: 0, hysaRate: 0, incomeA: 0, incomeB: 0,
  taxable: 0, basisRatio: 100, cash: 3000000, cashReserve: 0, bondYears: 0, spending: 40000,
  tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0, rothIraBasisA: 0,
  tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0, rothIraBasisB: 0,
  ssMonthlyA: 0, ssMonthlyB: 0, pensionCoverage: 'both', pensionYearlyA: 0, pensionYearlyB: 0, pensionStartAgeA: 0, pensionStartAgeB: 0,
  stateTax: 'tx', acaEnabled: false, acaEnhanced: false, medicaidWhenEligible: true, healthcare: 12000,
  medicareYearly: 0, ltcEnabled: false, irmaaPriorKnown: false, rothConvEnabled: false,
  withdrawalMixEnabled: false, smoothWithdrawals: false,
  guardrailsEnabled: false, incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
  sepp72tIraA: false, sepp72tK401A: false, sepp72tIraB: false, sepp72tK401B: false,
};

// 3C commit 1: two returns (an unmarried couple filing single, or before a marry-later wedding; Partner A
// head of household with a child): the ACA credit is per tax household, IRMAA per person on the single
// tiers. Hand-computed with inflation 0 (2026 figures, factor 1).
(async () => {
  const { browser, page, errors } = await openPlanner();
  // dividendYield 0: BASE's cash is swept into the taxable account after year 0 (cashReserve 0), and the
  // default 1.5% dividend yield on it would add about 46,500 to MAGI from year 1 on.
  const COUPLE = { ...BASE, singlePerson: false, filingStatus: 'single', dividendYield: 0 };

  // 1. ACA: 40,000 of pension each. Per return: 40,000 against a one-person line, half the premium each.
  const aca = { ...COUPLE, acaEnabled: true, pensionYearlyA: 40000, pensionYearlyB: 40000 };
  const r1 = (await rows(page, aca))[0];
  const perReturn = await taxCall(page, aca, 'acaNetCost', [40000, 1, 6000, 0]);
  const household = await taxCall(page, aca, 'acaNetCost', [80000, 2, 12000, 0]);
  assert(Math.abs(2 * perReturn - household) > 500, 'test discriminates old from new');
  near(r1.healthcare, 2 * perReturn, 0.01, 'two returns: each partner priced on their own MAGI and line');
  near(r1.magiA, 40000, 1e-6, 'magiA');
  near(r1.magiB, 40000, 1e-6, 'magiB');

  // 2. Head of household: A's tax household includes the child (size 2), B's does not.
  const kid = { ...aca, children: [{ birthYear: 2015, student: false }] };
  const r2 = (await rows(page, kid))[0];
  const a2 = await taxCall(page, kid, 'acaNetCost', [40000, 2, 6000, 0]);
  near(r2.healthcare, a2 + perReturn, 0.01, 'HoH: the child counts on A only');

  // 3. IRMAA per person: 160,000 and 40,000 at 66; single tiers: 240.4 a month for A, nothing for B.
  const irm = { ...COUPLE, ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66, lifeExpectancyA: 71, lifeExpectancyB: 71, pensionYearlyA: 160000, pensionYearlyB: 40000 };
  const r3 = await rows(page, irm);
  for (const r of r3) near(r.healthcare, 240.4 * 12, 0.01, `IRMAA per person, year ${r.year}`);

  // 4. Joint returns are unchanged: household 200,000 on the joint tiers is under the first tier.
  const r4 = await rows(page, { ...irm, filingStatus: 'mfj' });
  for (const r of r4) near(r.healthcare, 0, 1e-9, `joint, year ${r.year}`);
  assert.strictEqual(r4[0].magiA, undefined, 'no per-return MAGI on a joint return');

  // 5. Marry-later: two returns at 66 and 67, joint from 68. Year 2 and 3 look back at a two-return year
  //    (per person, single tiers), year 4 at a joint year (household, joint tiers).
  const r5 = await rows(page, { ...irm, marryLater: true, marriageAgeA: 68 });
  near(r5[2].healthcare, 240.4 * 12, 0.01, 'wedding year looks back at a two-return year');
  near(r5[3].healthcare, 240.4 * 12, 0.01, 'year 3 looks back at a two-return year');
  near(r5[4].healthcare, 0, 1e-9, 'year 4 looks back at a joint year');

  // 6. Conversion ceiling per return: A owns all the traditional money, so the conversion lands on A's
  //    return and stops at A's own 400% line (62,600 - 20,000), not the household's (84,600 - 70,000).
  //    Spending 0 so the pensions cover the year and no discretionary draw moves A's MAGI.
  const conv = { ...aca, spending: 0, pensionYearlyA: 20000, pensionYearlyB: 50000, tradIraA: 500000, rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 60, rothConvBracket: 35 };
  const r6 = (await rows(page, conv))[0];
  near(r6.traditionalWithdrawn, 0, 1e-9, 'precondition: no discretionary traditional draw');
  near(r6.conversionAmount, 42600, 0.01, 'conversion capped at A’s own ACA line');

  assert.deepStrictEqual(errors, []);
  console.log('two_return_magi: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
