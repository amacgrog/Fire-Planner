// Roth early-access rules (US only; Canada's TFSA has no equivalent).
//
// Roth contributions and conversions older than 5 years can always be taken
// with no tax or penalty. Conversions younger than 5 years owe the 10% penalty
// before 59.5 (no tax: they were taxed at conversion). Earnings owe ordinary
// income tax plus the 10% penalty before 59.5. After 59.5 everything is free.
// Scenarios use 0% inflation and 0% returns so every number is hand-derivable.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

const file = path.resolve(__dirname, '..', 'Planner_US.html');

async function open(fields) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + file);
  await page.waitForTimeout(200);
  const set = (id, v) =>
    page.evaluate(
      ({ id, v }) => {
        const e = document.getElementById(id);
        if (e.type === 'checkbox') e.checked = v;
        else e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { id, v },
    );
  const base = [
    ['singlePerson', true],
    ['ageA', 40],
    ['retireAgeA', 40],
    ['lifeExpectancyA', 50],
    ['spending', 40000],
    ['healthcare', 0],
    ['medicareYearly', 0],
    ['medicalInflation', 0],
    ['ltcEnabled', false],
    ['acaEnabled', false],
    ['inflation', 0],
    ['returnRate', 0],
    ['bondReturn', 0],
    ['hysaRate', 0],
    ['dividendYield', 0],
    ['stateTax', 'tx'],
    ['ssMonthlyA', 0],
  ];
  for (const [id, v] of base) await set(id, v);
  await page.evaluate(() => document.getElementById('rentBtn').click());
  for (const [id, v] of translateFieldList([
    ['rent', 0],
    ['taxable', 0],
    ['traditional', 0],
    ['cash', 0],
    ['bondYears', 0],
    ['roth', 500000],
    ['rothBasisPct', 100],
    ...fields,
  ], true, { single: true }))
    await set(id, v);
  await page.waitForTimeout(250);
  return { browser, page, errors };
}

const near = (a, e, tol, label) =>
  assert(Math.abs(a - e) <= tol, `${label}: expected ${e} (+/-${tol}), got ${a}`);

// Single 2026 federal tax with no other income: $16,100 deduction, 10% to
// $12,400 of taxable income, 12% to $50,400.
const fedTax = (gross) => {
  const t = Math.max(0, gross - 16100);
  return Math.min(t, 12400) * 0.1 + Math.max(0, Math.min(t, 50400) - 12400) * 0.12;
};
// Solve gross - tax(gross) - 10% penalty = net.
const grossForNet = (net) => {
  let lo = net,
    hi = net * 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (mid - fedTax(mid) - 0.1 * mid < net) lo = mid;
    else hi = mid;
  }
  return hi;
};

(async () => {
  // 1. All principal: free at any age.
  let { browser, page, errors } = await open([['rothBasisPct', 100]]);
  let rows = await page.evaluate(() => window.fireProjectionRows);
  near(rows[0].rothWithdrawn, 40000, 0.01, 'principal-only draw');
  near(rows[0].tax, 0, 0.01, 'principal-only tax+penalty');
  await browser.close();

  // 2. All earnings at 40: ordinary tax + 10% penalty, grossed up.
  ({ browser, page, errors } = await open([['rothBasisPct', 0]]));
  rows = await page.evaluate(() => window.fireProjectionRows);
  const G = grossForNet(40000);
  near(rows[0].rothWithdrawn, G, 1, 'earnings draw is grossed up for tax and penalty');
  near(rows[0].earlyPenalty, 0.1 * G, 0.5, 'earnings penalty is 10% of the draw');
  near(rows[0].tax - rows[0].earlyPenalty, fedTax(G), 1, 'earnings are ordinary income');
  // The same rule applies inside the historical backtest/Monte Carlo engine.
  const hist = await page.evaluate(() =>
    window.__test_simulateHistorical((y) => [1970 + y, 0, 0, 0]).rows[0].roth,
  );
  near(500000 - hist, G, 1, 'historical engine applies the same Roth rule');
  await browser.close();

  // 3. Same all-earnings Roth after 59.5: free.
  ({ browser, page, errors } = await open([
    ['rothBasisPct', 0],
    ['ageA', 60],
    ['retireAgeA', 60],
    ['lifeExpectancyA', 70],
  ]));
  rows = await page.evaluate(() => window.fireProjectionRows);
  near(rows[0].rothWithdrawn, 40000, 0.01, 'post-59.5 earnings draw');
  near(rows[0].tax, 0, 0.01, 'post-59.5 earnings tax+penalty');
  await browser.close();

  // 4. Conversion seasoning: convert in year 0, then draw from Roth only.
  // Principal converted in year 0 owes the penalty through year 4 (ages
  // 41-44) and is free from year 5 (age 45).
  ({ browser, page, errors } = await open([
    ['rothBasisPct', 0],
    ['roth', 0],
    ['traditional', 500000],
    ['spending', 10000],
    ['rothConvEnabled', true],
    ['rothConvStartAge', 40],
    ['rothConvEndAge', 40],
  ]));
  const seasoning = await page.evaluate(() => {
    const m = new Map();
    for (let a = 41; a <= 46; a++) m.set(a, 'roth');
    window.__test_setWithdrawalMixOverride(m);
    const rows = window.__test_simulate().rows;
    window.__test_setWithdrawalMixOverride(null);
    return rows.slice(0, 8).map((r) => ({
      age: r.age,
      conv: r.conversionAmount,
      roth: r.rothWithdrawn,
      pen: r.earlyPenalty,
    }));
  });
  assert(seasoning[0].conv > 60000, `precondition: converted at least $60k (got ${seasoning[0].conv})`);
  for (let k = 1; k <= 4; k++) {
    near(seasoning[k].roth, 10000 / 0.9, 1, `age ${seasoning[k].age} draw includes penalty`);
    near(seasoning[k].pen, 10000 / 0.9 * 0.1, 1, `age ${seasoning[k].age} unseasoned conversion penalty`);
  }
  near(seasoning[5].roth, 10000, 0.5, 'age 45 draw (seasoned)');
  near(seasoning[5].pen, 0, 0.5, 'age 45 conversion is seasoned: no penalty');
  await browser.close();

  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  console.log('[US] Roth early-access tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
