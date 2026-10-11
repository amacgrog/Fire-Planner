// Medical expense credit and the Ontario Seniors Care at Home credit in the engine (Batch 7N, N5).
//
// A single 70-year-old with an employer pension and tax-free money only (so no draw changes the income), a private health
// premium and long-term care switched on. The year-0 row's gross tax must equal the income tax on the row's income with the
// year's eligible expenses (the premium plus the WHOLE long-term-care cost: owner decision) claimed, less, in Ontario, the
// refundable Seniors Care at Home credit. Checked for British Columbia (credit only) and Ontario (credit plus the refundable one),
// and the expenses must really be on the row.
//
// Run: node tests/medical_credit.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    const st = window.__test_getState();
    const t = window.__test_tax;
    const res = {};
    for (const province of ['bc', 'on']) {
      const saved = JSON.parse(JSON.stringify(st));
      // Ontario at 40,000 (the care credit is income tested); British Columbia at 90,000 so the credit is really used.
      const pension = province === 'on' ? 40000 : 90000;
      Object.assign(st, {
        province, singlePerson: true, ageA: 70, retireAgeA: 65, lifeExpectancyA: 80, incomeA: 0, inflation: 0, taxable: 0, traditional: 0,
        roth: 400000, cash: 50000, bondYears: 0, hysaRate: 0, dividendYield: 0, healthcare: 4000, ltcEnabled: true, ltcYearlyA: 20000,
        ltcAgeA: 70, pensionCoverage: 'a', pensionYearlyA: pension, pensionStartAgeA: 65, cppMonthlyA: 0, oasMonthlyA: 0, medicalInflation: 0, spending: 40000,
      });
      const row = window.__test_simulate().rows[0];
      for (const k of Object.keys(saved)) st[k] = saved[k];
      Object.assign(st, { province });
      const med = row.healthcare + row.ltc;
      let expected = t.personTaxCA(row.grossIncome, 0, 0, 0, 70, pension, null, 0, 0, -1, 0, 0, 0, 0, 0, med);
      let care = 0;
      if (province === 'on') {
        const claimable = med - Math.min(0.03 * row.grossIncome, 2940);
        care = Math.max(0, 0.25 * Math.min(6000, claimable) - 0.05 * Math.max(0, row.grossIncome - 35000));
        expected -= care;
      }
      res[province] = { pension, tax: row.tax, expected, med, healthcare: row.healthcare, ltc: row.ltc, gross: row.grossIncome, care };
      for (const k of Object.keys(saved)) st[k] = saved[k];
    }
    return res;
  });
  for (const province of ['bc', 'on']) {
    const r = out[province];
    assert(Math.abs(r.med - 24000) < 1e-6, `${province}: eligible expenses should be the premium plus the whole LTC cost (24,000), got ${r.med}`);
    assert(Math.abs(r.tax - r.expected) < 0.01, `${province}: row tax ${r.tax.toFixed(2)}, expected ${r.expected.toFixed(2)} (income ${r.gross.toFixed(0)}, care credit ${r.care.toFixed(2)})`);
  }
  assert(out.bc.tax > 5000, 'the British Columbia tax must be positive after the credit: ' + out.bc.tax);
  assert(out.on.care > 0, 'the Ontario scenario must receive the Seniors Care at Home credit');
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log(`[Canada] medical credit engine test passed (BC tax ${out.bc.tax.toFixed(0)}, ON ${out.on.tax.toFixed(0)}, care credit ${out.on.care.toFixed(0)})`);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
