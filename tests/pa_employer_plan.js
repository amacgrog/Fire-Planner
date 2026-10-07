// Batch 7O, O3: Pennsylvania excludes employer-plan (401(k)) money drawn after retirement at any age, while an
// IRA draw before 59 and a half is taxable. The engine hands each filer's 401(k) share of their traditional
// accounts (buildTaxProfile -> k401FracA/B -> sources.retirement401kA/B) to the PA row.
// Hand-computed with the 2026 federal schedule (single: standard deduction 16,100, 10% to 12,400 then 12%;
// MFJ: 32,200 and 10% to 24,800), PA's flat 3.07%, no other income, no inflation, no growth, renting,
// no ACA, spending 40,000 funded entirely from traditional accounts. The draw X solves
// X - federal(X) - PA(X) - penalty(X) = 40,000 (the tax is paid out of the draw). At 52 every traditional dollar owes the
// federal 10% early-withdrawal penalty (Rule of 55 needs 55), which is part of the row's tax and sized the same way.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b} (+/-${tol}), got ${a}`);
const PA = 0.0307;

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
          singlePerson: true, ageA: 52, retireAgeA: 52, lifeExpectancyA: 54, ageB: 50, retireAgeB: 50, lifeExpectancyB: 54,
          returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, dividendYield: 0, medicalInflation: 0, healthcare: 0, medicareYearly: 0,
          acaEnabled: false, ltcEnabled: false, ssMonthlyA: 0, ssMonthlyB: 0, tenure: 'rent', rent: 0, rentGrowth: 0, incomeA: 0, incomeB: 0,
          taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, spending: 40000, stateTax: 'pa', children: [], survivorEnabled: false,
          tradIraA: 0, trad401kA: 0, tradIraB: 0, trad401kB: 0, rothIraA: 0, roth401kA: 0, rothIraB: 0, roth401kB: 0,
          rothConvEnabled: false, ruleOf55A: false, ruleOf55B: false, incomeSources: [],
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

  // Single, 52, retired. Federal on a draw X (X > 28,500): 1,240 + 12% (X - 28,500). PA: 3.07% of the taxed part.
  //   X (1 - 0.12 - PA x f) = 40,000 + 1,240 - 3,420, f the taxed share of the draw.
  const single = (f, penalty = 0.1) => {
    const X = (40000 + 1240 - 3420) / (1 - 0.12 - PA * f - penalty);
    return { X, tax: X - 40000 };
  };
  // A 401(k) only: nothing is taxed by PA; an IRA only: all of it; half and half: half.
  let r = await rows({ trad401kA: 1000000 });
  near(r[0].tax, single(0).tax, 0.05, 'single, 401(k) only: federal tax only');
  r = await rows({ tradIraA: 1000000 });
  near(r[0].tax, single(1).tax, 0.05, 'single, IRA only: PA taxes the whole draw before 59 and a half');
  r = await rows({ tradIraA: 500000, trad401kA: 500000 });
  near(r[0].tax, single(0.5).tax, 0.05, 'single, half 401(k) half IRA: PA taxes half');
  r = await rows({ tradIraA: 250000, trad401kA: 750000 });
  near(r[0].tax, single(0.25).tax, 0.05, 'single, a quarter IRA');
  // After 59 and a half everything is excluded as before.
  r = await rows({ tradIraA: 1000000, ageA: 60, retireAgeA: 60, lifeExpectancyA: 62 });
  near(r[0].tax, single(0, 0).tax, 0.05, 'single, 60: an IRA draw is excluded (and owes no penalty)');

  // Couple, both retired, A's traditional money all in a 401(k), B's all in an IRA, equal balances: the draw splits half and
  // half by ownership, so PA taxes half of it. MFJ federal: 10% (X - 32,200) below 57,000.
  const X = (40000 - 3220) / (1 - 0.1 - PA * 0.5 - 0.1);
  r = await rows({ singlePerson: false, trad401kA: 500000, tradIraB: 500000 });
  near(r[0].tax, X - 40000, 0.05, 'couple, A 401(k) and B IRA: PA taxes B\'s half only');
  // Swapped: the same.
  r = await rows({ singlePerson: false, tradIraA: 500000, trad401kB: 500000 });
  near(r[0].tax, X - 40000, 0.05, 'couple, A IRA and B 401(k): the same');
  // B still working (retires at 60): B's 401(k) draw is not retired money, so PA taxes it too.
  const Xall = (40000 - 3220) / (1 - 0.1 - PA * 1 - 0.1);
  r = await rows({ singlePerson: false, trad401kA: 500000, trad401kB: 500000, retireAgeB: 60, incomeB: 0 });
  assert(r[0].tax > X - 40000 - 0.05, 'couple, B working: B\'s 401(k) share is taxed by PA (' + r[0].tax + ' vs retired ' + (X - 40000) + ', all-taxed ' + (Xall - 40000) + ')');

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('[US] Pennsylvania employer-plan exclusion tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
