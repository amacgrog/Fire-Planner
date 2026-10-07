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
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
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

// 3C hooks, hand-computed (2026 figures, inflation 0).
(async () => {
  const { browser, page, errors } = await openPlanner();
  const call = (patch, fn, arg) =>
    page.evaluate(({ patch, fn, arg }) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, { inflation: 0, children: [], acaEnhanced: false, ...patch });
      try {
        return window.__test_solver[fn](arg);
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { patch, fn, arg });
  const ctx = (o) => ({ year: 0, filing: 'single', twoReturns: false, profile: { ownerShareA: 1 }, preMagi: 0, preMagiA: 0, preMagiB: 0, acaEligibleA: true, acaEligibleB: false, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false, workingA: false, workingB: false, age: 60, ageB: null, ...o });
  const magis = (list) => list.map((t) => Math.round(t.magi * 100) / 100);

  // ACA, one person: Texas (no Medicaid for adults) has the 100% floor and the 400% cliff; California adds 138%.
  assert.deepStrictEqual(magis(await call({ acaEnabled: true, stateTax: 'tx' }, 'magiThresholds', ctx({}))), [15650, 62600]);
  assert.deepStrictEqual(magis(await call({ acaEnabled: true, stateTax: 'ca' }, 'magiThresholds', ctx({}))), [15650, 21597, 62600]);
  // IRMAA from 63 (retired), single tiers; senior-deduction phase-out start at 65 through 2028.
  assert.deepStrictEqual(magis(await call({ acaEnabled: false }, 'magiThresholds', ctx({ age: 63, acaEligibleA: false }))), [109000, 137000, 171000, 205000, 500000]);
  assert.deepStrictEqual(magis(await call({ acaEnabled: false }, 'magiThresholds', ctx({ age: 66, acaEligibleA: false }))), [75000, 109000, 137000, 171000, 205000, 500000]);
  // Child tax credit phase-out start (joint).
  assert.deepStrictEqual(
    magis(await call({ acaEnabled: false, children: [{ birthYear: 2016, student: false }] }, 'magiThresholds', ctx({ filing: 'mfj', singlePerson: false, ageB: 50, age: 50, acaEligibleA: false }))),
    [400000],
  );
  // Two returns: A's 400% line (62,600) at A-MAGI 40,000, half the traditional draw on A: household 100,000 + 22,600 / 0.5.
  const two = await call({ acaEnabled: true, stateTax: 'tx' }, 'magiThresholds', ctx({ twoReturns: true, singlePerson: false, ageB: 60, preMagi: 100000, preMagiA: 40000, preMagiB: 60000, profile: { ownerShareA: 0.5 } }));
  assert(magis(two).includes(145200), `two-return translation: ${JSON.stringify(magis(two))}`);

  // lambda: single, 70, 1,000,000 traditional, real return 0, Texas, life expectancy 74. Samples 73, 74, 74.
  // RMDs 37,735.85 and 39,215.69; deduction 16,100 + 2,050 + 6,000 senior: taxable income stays in the 12% band
  // with and without the step; gains stay in the 0% band.
  const lam = await call(
    { singlePerson: true, ageA: 70, lifeExpectancyA: 74, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, pensionYearlyA: 0, survivorEnabled: false },
    'lambdaEstimate',
    { tradPool: 1000000, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1 },
  );
  near(lam.lambda, 0.12, 1e-9, 'lambda at 12%');
  near(lam.tauGain, 0, 1e-9, 'gains in the 0% band');
  const big = await call(
    { singlePerson: true, ageA: 70, lifeExpectancyA: 74, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, pensionYearlyA: 0, survivorEnabled: false },
    'lambdaEstimate',
    { tradPool: 5000000, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1 },
  );
  assert(big.lambda > lam.lambda && big.lambda <= 0.6, `larger pool, larger lambda (${big.lambda})`);

  // After-tax value: taxable 100k with 40k gain at 15%, traditional 200k at lambda 0.2, Roth 50k, cash 10k.
  const value = await page.evaluate(() =>
    window.__test_solver.afterTaxValue({ taxable: 100000, taxableBasis: 60000, bondTaxable: 0, bondTaxableBasis: 0, traditional: 200000, bondTraditional: 0, roth: 50000, bondRoth: 0, cash: 10000, home: 0, mortgage: 0 }, 0.2, 0.15),
  );
  near(value, 100000 - 40000 * 0.15 + 200000 * 0.8 + 50000 + 10000, 1e-9, 'after-tax value');
  assert.deepStrictEqual(errors, []);
  console.log('solver_hooks: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
