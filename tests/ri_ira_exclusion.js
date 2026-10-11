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
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
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

  // Year-0 trace cases: RI's part of the year's tax is read off the engine's own profile as taxFor under RI minus taxFor under
  // TX (renting, standard deduction: the state tax does not move the federal one), t = the year's traditional draw.
  const BASE = {
    singlePerson: true, ageA: 68, retireAgeA: 68, lifeExpectancyA: 70, ageB: 68, retireAgeB: 68, lifeExpectancyB: 70,
    returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, dividendYield: 0, medicalInflation: 0, healthcare: 0, medicareYearly: 0,
    acaEnabled: false, ltcEnabled: false, ssMonthlyA: 0, ssMonthlyB: 0, tenure: 'rent', rent: 0, rentGrowth: 0, incomeA: 0, incomeB: 0,
    taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, spending: 40000, stateTax: 'ri', children: [], survivorEnabled: false,
    tradIraA: 0, trad401kA: 0, tradIraB: 0, trad401kB: 0, rothIraA: 0, roth401kA: 0, rothIraB: 0, roth401kB: 0,
    rothConvEnabled: false, ruleOf55A: false, ruleOf55B: false, incomeSources: [], oneTimeIncome: [],
    k401PctA: 0, k401PctB: 0, catchupPctA: 0, catchupPctB: 0, iraPctA: 0, iraPctB: 0, profitSharingPctA: 0, profitSharingPctB: 0, megaBackdoor: false,
  };
  const year0 = (patch, i = 0) =>
    page.evaluate(([base, patch, i]) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, base, patch);
      try {
        const p = window.__test_accountTrace()[i].profile, row = window.__test_simulate().rows[i];
        const t = row.traditionalWithdrawn;
        const T = window.__test_tax;
        const stateOf = (prof, extra) =>
          window.__test_withState({ stateTax: 'ri' }, () => T.taxFor({ ...prof }, 0, extra)) - window.__test_withState({ stateTax: 'tx' }, () => T.taxFor({ ...prof }, 0, extra));
        return { t, fracA: p.k401FracA, fracB: p.k401FracB, shareA: p.ownerShareA, ri: stateOf(p, t), ri0: stateOf(p, 0) };
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, [BASE, patch, i]);

  // Still working at 68 (PUB 2026-01, Example 4: a filer who still earns wages qualifies; RI has no "stopped working" test, unlike
  // Pennsylvania's after-retirement rule): wages 30,000, spending 60,000, the rest drawn from a 401(k) (under 50,000), so the
  // whole draw is excluded and RI taxes only the wages: RI(t) = RI(0) = 3.75% x (30,000 - 16,450) = 508.125.
  let y = await year0({ retireAgeA: 70, incomeA: 30000, spending: 60000, trad401kA: 1000000 });
  assert(y.t > 20000 && y.t < 50000, 'working 68: a 401(k) draw between 20,000 and 50,000 (' + y.t + ')');
  assert.strictEqual(y.fracA, 1, 'working 68: the 401(k) share counts while working (RI)');
  near(y.ri0, 508.125, 0.01, 'working 68: RI on the wages alone');
  near(y.ri, y.ri0, 0.01, 'working 68: the whole 401(k) draw is excluded');
  // The same household with an IRA: nothing excluded, first bracket: RI(t) = 3.75% x (30,000 + t - 16,450).
  y = await year0({ retireAgeA: 70, incomeA: 30000, spending: 60000, tradIraA: 1000000 });
  near(y.ri, 0.0375 * (30000 + y.t - 16450), 0.01, 'working 68, IRA: the draw is taxed');

  // Joint, both 68 and retired, A's traditional money all in a 401(k), B's all in an IRA, equal balances: the draw splits by the
  // ownership share; A's part (under 50,000) is excluded, B's is not. Spending 80,000 keeps t / 2 under 50,000 and the MFJ
  // AGI under 133,750. RI joint: std 22,400 + 2 x 5,250 = 32,900. RI = 3.75% x (t - t x shareA - 32,900).
  y = await year0({ singlePerson: false, spending: 80000, trad401kA: 500000, tradIraB: 500000 });
  assert(y.fracA === 1 && y.fracB === 0, 'joint: A all 401(k), B all IRA');
  assert(y.t * y.shareA < 50000 && y.t < 133750, 'joint: under the cap and the AGI limit (' + y.t + ')');
  near(y.ri, 0.0375 * (y.t - y.t * y.shareA - 32900), 0.01, 'joint: A\'s 401(k) part excluded, B\'s IRA part taxed');

  // Survivor period, year 1 (A died at 68 in year 0, which is still a joint return; year 1 is the first single return): the
  // survivor's one-person return owns the whole pool, half 401(k) and half IRA
  // by balance, so half the draw is excluded. Spending 80,000 (the survivor spends its survivor share of it). RI single:
  // 16,450. RI = 3.75% x (t - t / 2 - 16,450).
  y = await year0({ singlePerson: false, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 68, spending: 80000, trad401kA: 500000, tradIraB: 500000 }, 1);
  assert(y.t / 2 > 16450 && y.t / 2 < 50000 && y.t < 107000, 'survivor: half the draw above the deduction, under the cap and the AGI limit (' + y.t + ')');
  near(y.fracA, 0.5, 1e-12, 'survivor: the pool\'s 401(k) share');
  near(y.ri, 0.0375 * (y.t / 2 - 16450), 0.01, 'survivor: half the draw (the 401(k) half) excluded');

  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('; '));
  await browser.close();
  console.log('[US] Rhode Island IRA exclusion tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
