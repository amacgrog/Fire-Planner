// Rhode Island's Pension and Annuity Income Modification covers pensions, annuities and 401(k) / 403(b) / 457(b)
// payouts, never IRA income (PUB 2026-01 Retirement Income Guide, tax.ri.gov: "No income from a traditional IRA, Roth
// IRA, SEP-IRA, or any other type of IRA qualifies"). The engine hands each filer's 401(k) share of their traditional
// accounts (buildTaxProfile -> k401FracA/B -> sources.retirement401kA/B, the Pennsylvania mechanism) to the RI row,
// whose exclusion carries applies.employerPlanOnly.
// Hand-computed with the 2026 federal schedule (single at 68: standard deduction 16,100 + 2,050 (65 or older) + the
// 6,000 senior deduction = 24,150; 10% to 12,400 of taxable income, then 12%), RI's 2026 single standard deduction
// 11,200 and exemption 5,250 (16,450) at 3.75%, no other income, no inflation, no growth, renting, no health costs,
// spending 40,000 funded entirely from traditional accounts. The draw X solves X - federal(X) - RI(X) = 40,000.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b} (+/-${tol}), got ${a}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);

  const rows = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(
        st,
        {
          singlePerson: true, ageA: 68, retireAgeA: 68, lifeExpectancyA: 70, ageB: 66, retireAgeB: 66, lifeExpectancyB: 70,
          returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, dividendYield: 0, medicalInflation: 0, healthcare: 0, medicareYearly: 0,
          acaEnabled: false, ltcEnabled: false, ssMonthlyA: 0, ssMonthlyB: 0, tenure: 'rent', rent: 0, rentGrowth: 0, incomeA: 0, incomeB: 0,
          taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, spending: 40000, stateTax: 'ri', children: [], survivorEnabled: false,
          tradIraA: 0, trad401kA: 0, tradIraB: 0, trad401kB: 0, rothIraA: 0, roth401kA: 0, rothIraB: 0, roth401kB: 0,
          rothConvEnabled: false, ruleOf55A: false, ruleOf55B: false, incomeSources: [], oneTimeIncome: [],
        },
        patch,
      );
      try {
        return window.__test_simulate().rows.map((r) => ({ age: r.age, tax: r.tax, penalty: r.earlyPenalty }));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, patch);

  // Federal on X above 36,550 (= 24,150 + 12,400): 1,240 + 12% (X - 36,550). RI on the taxed part T of the draw:
  // 3.75% (T - 16,450).
  //   401(k) only (X <= 50,000, all excluded): X - 1,240 - 0.12 X + 4,386 = 40,000 -> 0.88 X = 36,854 -> X = 41,879.545
  //   IRA only (all taxed): 0.8425 X = 40,000 - 4,386 + 1,240 - 616.875 = 36,237.125 -> X = 43,011.424
  //   half and half (the draw is pro rata to the balances, so T = X / 2; X / 2 > 16,450):
  //     0.88 X - 0.01875 X = 40,000 - 4,386 + 1,240 - 616.875 -> 0.86125 X = 36,237.125 -> X = 42,075.036
  const X401 = 36854 / 0.88,
    XIRA = 36237.125 / 0.8425,
    XHALF = 36237.125 / 0.86125;
  let r = await rows({ trad401kA: 1000000 });
  near(r[0].tax, X401 - 40000, 0.05, 'single 68, 401(k) only: RI excludes the whole draw (federal tax only)');
  r = await rows({ tradIraA: 1000000 });
  near(r[0].tax, XIRA - 40000, 0.05, 'single 68, IRA only: RI taxes the whole draw (no IRA exclusion)');
  r = await rows({ tradIraA: 500000, trad401kA: 500000 });
  near(r[0].tax, XHALF - 40000, 0.05, 'single 68, half 401(k) half IRA: RI taxes the IRA half');
  // Under 67 nothing qualifies, a 401(k) included: the IRA-only figure (no penalty after 59 and a half).
  r = await rows({ trad401kA: 1000000, ageA: 66, retireAgeA: 66, lifeExpectancyA: 68 });
  near(r[0].tax, XIRA - 40000, 0.05, 'single 66, 401(k) only: under full retirement age RI taxes it');
  for (const x of r) assert.strictEqual(x.penalty || 0, 0, 'no early-withdrawal penalty at 66');

  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('; '));
  await browser.close();
  console.log('[US] Rhode Island IRA exclusion tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
