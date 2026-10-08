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
  // 13.7 A: the IRMAA lines sit on the tiers of the year the surcharge is charged (c.irmaaGrowth, default 1).
  assert.deepStrictEqual(magis(await call({ acaEnabled: false }, 'magiThresholds', ctx({ age: 63, acaEligibleA: false, irmaaGrowth: 1.05 }))), [114450, 143850, 179550, 215250, 525000]);
  assert.deepStrictEqual(magis(await call({ acaEnabled: false }, 'magiThresholds', ctx({ age: 66, acaEligibleA: false, irmaaGrowth: 1.05 }))), [75000, 114450, 143850, 179550, 215250, 525000]);
  const twoIr = { twoReturns: true, singlePerson: false, age: 66, ageB: 66, acaEligibleA: false, preMagi: 100000, preMagiA: 40000, preMagiB: 60000, profile: { ownerShareA: 0.5 } };
  const grown = magis(await call({ acaEnabled: false }, 'magiThresholds', ctx({ ...twoIr, irmaaGrowth: 1.05 })));
  assert(grown.includes(208900) && grown.includes(248900), `two-return growth: ${JSON.stringify(grown)}`);
  const plain = magis(await call({ acaEnabled: false }, 'magiThresholds', ctx(twoIr)));
  assert(plain.includes(198000) && plain.includes(238000), `two-return default: ${JSON.stringify(plain)}`);
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
  // Note 1 (spec 13.1): the pool walks forward net of the traditional share of the need. Single, 70,
  // 1,000,000 traditional, real return 0, Texas, life expectancy 74, need 50,000, tradShare 1.
  // 13.2: each sample prices the draw the walk assumes. The samples at 73 and 74 (pools 850,000 and 800,000
  // before the year's draw, RMDs 32,075 and 31,373) now price 50,000 of income (not the RMD), deduction
  // 16,100 + 2,050 + 6,000 = 24,150, taxable 25,850 (+5,000 step), 12% band: lambda 0.12.
  const drawn = await call(
    { singlePerson: true, ageA: 70, lifeExpectancyA: 74, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, pensionYearlyA: 0, survivorEnabled: false },
    'lambdaEstimate',
    { tradPool: 1000000, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1, need: 50000, tradShare: 1 },
  );
  near(drawn.lambda, 0.12, 1e-9, 'lambda prices the draw');

  const S70 = { singlePerson: true, ageA: 70, lifeExpectancyA: 74, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, pensionYearlyA: 0, survivorEnabled: false };
  const ctxL = (o) => ({ year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1, ...o });

  // 13.2 item 2, a draw larger than the RMD: 1,000,000, need 90,000. Samples 73, 74, 74 (pools 820,000 and
  // 730,000 before the draw, RMDs 30,943 and 28,627) price 90,000 of income: senior deduction 6,000 - 6% x
  // (90,000 - 75,000) = 5,100, deduction 23,250, taxable 66,750, 22% band; the 9,000 step costs 22% x 1.06 =
  // 23.32% (the senior deduction keeps phasing out). MAGI 99,000 stays under the first IRMAA tier (109,000).
  const bigDraw = await call(S70, 'lambdaEstimate', ctxL({ tradPool: 1000000, need: 90000, tradShare: 1 }));
  near(bigDraw.lambda, 0.2332, 1e-9, 'draw above the RMD');

  // 13.2 item 2, the pool runs out: 100,000, need 50,000: 50,000 left at 72, which that year's draw empties, so
  // every sample moves to 72 (before the RMD age) and prices 50,000: taxable 25,850 (+5,000 step), 12% band.
  // B5a gave about 0 here (no RMD left in the sample years).
  const out = await call(S70, 'lambdaEstimate', ctxL({ tradPool: 100000, need: 50000, tradShare: 1 }));
  near(out.lambda, 0.12, 1e-9, 'pool runs out: priced at the last draw year');
  assert.strictEqual(out.movedSample, true, 'pool emptied before a sample');
  assert.strictEqual((await call(S70, 'lambdaEstimate', ctxL({ tradPool: 30000 }))).movedSample, false, 'no draws: no sample moves');
  // Cliff plan, Task 1: every line carries id / ret / family.
  const idLines = await call({ acaEnabled: true, stateTax: 'tx' }, 'magiThresholds', ctx({}));
  assert.deepStrictEqual(idLines.map((l) => [l.id, l.ret, l.family]), [['acaFloor', 'H', 'aca'], ['aca400', 'H', 'aca']], 'ACA line ids');
  const irLines = await call({ acaEnabled: false }, 'magiThresholds', ctx({ age: 66, acaEligibleA: false }));
  assert.deepStrictEqual(irLines.map((l) => l.id), ['senior', 'irmaa1', 'irmaa2', 'irmaa3', 'irmaa4', 'irmaa5'], 'senior and IRMAA ids');
  assert(irLines.every((l) => l.ret === 'H' && (l.id === 'senior' ? l.family === 'tax' : l.family === 'irmaa')), 'ret and family');
  const twoLines = await call({ acaEnabled: false }, 'magiThresholds', ctx({ ...twoIr }));
  assert(twoLines.some((l) => l.ret === 'A' && l.id === 'irmaa1') && twoLines.some((l) => l.ret === 'B'), 'two returns: A and B lines');

  // 13.2 item 1, IRMAA per person on two returns: couple filing single, both 70, life expectancy 73, need 0.
  // Every sample is 73: RMD 3,551,000 / 26.5 = 134,000, 67,000 per return, under 109,000 even with the step.
  // Each return: deduction 24,150, taxable 42,850 (+6,700) in the 12% band. The old household-MAGI IRMAA step
  // made it about 0.379.
  const twoRet = await call(
    { singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 70, ageB: 70, lifeExpectancyA: 73, lifeExpectancyB: 73, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, ssMonthlyB: 0, pensionYearlyA: 0, pensionYearlyB: 0, survivorEnabled: false },
    'lambdaEstimate',
    ctxL({ tradPool: 3551000, singlePerson: false }),
  );
  near(twoRet.lambda, 0.12, 1e-9, 'two-return IRMAA per person');

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
