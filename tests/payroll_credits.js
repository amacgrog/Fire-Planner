// Working-year payroll items in the engine (Batch 7N, N4).
//
// A single earner in the first projection year, with no investment income so the row's gross income is exactly the
// wage less the pre-tax savings and the enhanced CPP/QPP deduction: the row's tax (gross, benefits added back) must
// equal the income tax on that income with the payroll credit bases and the Quebec workers deduction, plus the cash
// cost of CPP/QPP, QPIP and EI. Checked for Ontario, British Columbia and Quebec.
//
// Run: node tests/payroll_credits.js

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
    for (const province of ['on', 'bc', 'qc']) {
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, { province, singlePerson: true, ageA: 40, retireAgeA: 65, incomeA: 60000, inflation: 0, incomeGrowth: 0, taxable: 0, traditional: 0, roth: 0, bondYears: 0, cash: 50000, hysaRate: 0, dividendYield: 0, healthPremiumA: 0 });
      const row = window.__test_simulate().rows[0];
      for (const k of Object.keys(saved)) st[k] = saved[k];
      Object.assign(st, { province });
      const pay = t.payrollItems(60000, 0);
      const expected =
        t.personTaxCA(row.grossIncome, 0, 0, 0, 40, 0, null, 0, 0, -1, 0, 0, pay.fedCredit, pay.provCredit, pay.provDeduction) + pay.cash;
      res[province] = { tax: row.tax, expected, wages: row.wages, gross: row.grossIncome, cash: pay.cash, ded: pay.deduction };
      for (const k of Object.keys(saved)) st[k] = saved[k];
    }
    // N10: a first-time buyer in the rentThenBuy purchase year claims the home buyers amounts. Saskatchewan: with the province's amount
    // (15,000) removed from the table the purchase-year tax is higher by exactly 15,000 x 10.5%, and no other year's tax moves
    // before the purchase (the same history up to it).
    {
      const R = t.PROVINCE_RULES.sk;
      const run = () => {
        const saved = JSON.parse(JSON.stringify(st));
        Object.assign(st, { province: 'sk', singlePerson: true, ageA: 40, retireAgeA: 65, incomeA: 90000, inflation: 0, incomeGrowth: 0, taxable: 0, traditional: 0, roth: 0, bondYears: 0, cash: 300000, hysaRate: 0, dividendYield: 0, healthPremiumA: 0, tenure: 'rentThenBuy', buyAge: 43, buyCash: true });
        const rows = window.__test_simulate().rows;
        for (const k of Object.keys(saved)) st[k] = saved[k];
        return rows;
      };
      const withCredit = run();
      const keep = R.homeBuyer;
      R.homeBuyer = null;
      const without = run();
      R.homeBuyer = keep;
      res.homeBuyer = { diffs: without.slice(0, 5).map((r, i) => r.tax - withCredit[i].tax) };
    }
    return res;
  });
  for (const province of ['on', 'bc', 'qc']) {
    const r = out[province];
    assert(Math.abs(r.tax - r.expected) < 0.01, `${province}: row tax ${r.tax.toFixed(2)}, expected ${r.expected.toFixed(2)} (income ${r.gross.toFixed(2)}, payroll ${r.cash.toFixed(2)})`);
    assert(r.cash > 4000, `${province}: payroll cash cost should include CPP/QPP and EI (${r.cash})`);
  }
  // Years 0 to 2 are before the purchase (age 43 = year 3): no difference; the purchase year: 15,000 x 10.5% = 1,575; later years carry
  // only second-order balance effects, so only the first four years are asserted.
  const d = out.homeBuyer.diffs;
  assert(d.slice(0, 3).every((x) => Math.abs(x) < 1e-9), 'no home buyers amount before the purchase year: ' + d);
  assert(Math.abs(d[3] - 1575) < 0.01, 'purchase-year tax should rise by 1,575 without the Saskatchewan amount: ' + d[3]);
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log(`[Canada] payroll credits engine test passed (ON tax ${out.on.tax.toFixed(0)}, BC ${out.bc.tax.toFixed(0)}, QC ${out.qc.tax.toFixed(0)})`);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
