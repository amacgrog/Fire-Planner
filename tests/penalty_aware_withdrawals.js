// Penalty-aware withdrawal order (US, Batch 3B step 4). While any account would owe the 10% early-withdrawal
// penalty, discretionary draws run in this order: taxable (and penalty-free traditional), cash, taxable bond
// reserve, penalty-free retirement money (Roth basis), and only then penalized money, cheapest per dollar
// first (a tie goes to traditional), home equity last. Zero returns and inflation, a single 2026 filer
// ($16,100 deduction, 10% to $12,400 of taxable income, 12% to $50,400), no state tax, age 50.
//
//   node tests/penalty_aware_withdrawals.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, e, tol, label) => assert(Math.abs(a - e) <= tol, `${label}: expected ${e} (+/-${tol}), got ${a}`);
const fedTax = (gross) => {
  const t = Math.max(0, gross - 16100);
  return Math.min(t, 12400) * 0.1 + Math.max(0, Math.min(t, 50400) - 12400) * 0.12;
};
const grossForNet = (net, rate) => {
  let lo = net,
    hi = net * 3;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (mid - fedTax(mid) - rate * mid < net) lo = mid;
    else hi = mid;
  }
  return hi;
};

const BASE = {
  singlePerson: true, ageA: 50, retireAgeA: 50, lifeExpectancyA: 60, ageB: 45, retireAgeB: 45, lifeExpectancyB: 60,
  returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, dividendYield: 0, incomeGrowth: 0, medicalInflation: 0,
  healthcare: 0, medicareYearly: 0, acaEnabled: false, ltcEnabled: false, stateTax: 'tx', ssMonthlyA: 0, ssMonthlyB: 0,
  tenure: 'rent', rent: 0, rentGrowth: 0, incomeA: 0, incomeB: 0, taxable: 0, basisRatio: 100, cash: 0, cashReserve: 0, bondYears: 0, spending: 20000,
  tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0,
  rothIraBasisA: 0, rothIraBasisB: 0, roth401kBasisPctA: 100, roth401kBasisPctB: 100,
  ruleOf55A: false, ruleOf55B: false, withdrawalMixEnabled: false, smoothWithdrawals: false, appliedMixSchedule: null, rothConvEnabled: false,
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const run = (patch, fn = 'std') =>
    page.evaluate(
      ({ patch, fn }) => {
        const st = window.__test_getState();
        const saved = JSON.parse(JSON.stringify(st));
        Object.assign(st, patch);
        try {
          const rows = fn === 'std' ? window.__test_simulate().rows : window.__test_simulateHistorical((y) => [1970 + y, fn === 'histDown' && y === 0 ? -10 : 0, 0, 0]).rows;
          return rows.map((r) => ({ age: r.age, cash: r.cash, taxableWithdrawn: r.taxableWithdrawn, traditionalWithdrawn: r.traditionalWithdrawn, rothWithdrawn: r.rothWithdrawn, earlyPenalty: r.earlyPenalty, investable: r.investable }));
        } finally {
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, saved);
        }
      },
      { patch, fn },
    );
  const rows = (patch, fn) => run({ ...BASE, ...patch }, fn);

  // 1. The full order. Taxable 20,000 (all basis), cash 10,000, a penalized IRA of 1,000,000 and a Roth IRA
  //    of 100,000 with 30,000 of basis, spending 20,000 a year.
  //    year 0: taxable;  year 1: cash 10,000 then Roth basis 10,000;  year 2: Roth basis 20,000 (gone);
  //    year 3: penalized: the IRA (a tie with Roth earnings goes to traditional), tax plus 10%.
  const order = { taxable: 20000, cash: 10000, cashReserve: 10000, tradIraA: 1000000, rothIraA: 100000, rothIraBasisA: 30000 };
  const G = grossForNet(20000, 0.1);
  const firstFour = {};
  for (const fn of ['std', 'hist']) {
    const r = await rows(order, fn);
    near(r[0].taxableWithdrawn, 20000, 0.01, `${fn} year 0: taxable first`);
    near(r[0].traditionalWithdrawn + r[0].rothWithdrawn + r[0].earlyPenalty, 0, 0.01, `${fn} year 0: nothing else touched`);
    near(r[1].cash, 0, 0.01, `${fn} year 1: cash is used before Roth basis`);
    near(r[1].rothWithdrawn, 10000, 0.01, `${fn} year 1: Roth basis covers the rest after cash`);
    near(r[1].earlyPenalty + r[1].traditionalWithdrawn, 0, 0.01, `${fn} year 1: no penalty and no traditional`);
    near(r[2].rothWithdrawn, 20000, 0.01, `${fn} year 2: the rest of the basis`);
    near(r[2].earlyPenalty, 0, 0.01, `${fn} year 2: still no penalty`);
    near(r[3].traditionalWithdrawn, G, 0.05, `${fn} year 3: the penalized IRA, grossed up for tax and the 10%`);
    near(r[3].earlyPenalty, 0.1 * G, 0.05, `${fn} year 3: 10% penalty`);
    near(r[3].rothWithdrawn, 0, 0.01, `${fn} year 3: Roth earnings are not chosen on a tie`);
    firstFour[fn] = r.slice(0, 4);
  }
  // The historical engine matches the standard one where no bucket draw happens (flat returns, no bonds).
  for (let i = 0; i < 4; i++)
    for (const k of ['taxableWithdrawn', 'traditionalWithdrawn', 'rothWithdrawn', 'earlyPenalty', 'cash'])
      near(firstFour.hist[i][k], firstFour.std[i][k], 0.01, `engines agree: year ${i} ${k}`);

  // 1b. A down year in the bucket strategy: cash first, then the stock accounts (taxable) and only then Roth
  //     basis. Stocks fall 10% in year 0: cash 10,000, then 10,000 from taxable; Roth basis untouched.
  {
    const r = (await rows({ taxable: 20000, cash: 10000, cashReserve: 10000, tradIraA: 1000000, rothIraA: 100000, rothIraBasisA: 100000 }, 'histDown'))[0];
    near(r.cash, 0, 0.01, 'down year: cash first');
    near(r.taxableWithdrawn, 10000, 0.01, 'down year: then taxable');
    near(r.rothWithdrawn + r.traditionalWithdrawn + r.earlyPenalty, 0, 0.01, 'down year: Roth basis and the IRA untouched');
  }
  // 2. Cheapest first: a Roth 401(k) with 20% basis (80% of each draw is earnings: tax plus 10% on that share only)
  //    is cheaper per dollar than a penalized IRA (tax plus 10% on the whole draw), so it is emptied first.
  for (const fn of ['std', 'hist']) {
    const r = await rows({ spending: 40000, tradIraA: 1000000, roth401kA: 30000, roth401kBasisPctA: 20 }, fn);
    near(r[0].rothWithdrawn, 30000, 0.01, `${fn}: the cheaper Roth 401(k) is drawn out first`);
    assert(r[0].traditionalWithdrawn > 5000, `${fn}: the IRA covers the rest (${r[0].traditionalWithdrawn})`);
    near(r[1].rothWithdrawn, 0, 0.01, `${fn} year 1: nothing left in the Roth 401(k)`);
  }
  // 3. A schedule that asks for a penalized traditional draw is redirected down the list: 'traditional' at 50
  //    would draw the IRA at 10% first; with penalty-free Roth basis available, the basis is used instead.
  {
    const r = await rows({ tradIraA: 1000000, rothIraA: 100000, rothIraBasisA: 100000, appliedMixSchedule: { 50: 'traditional' } });
    near(r[0].rothWithdrawn, 20000, 0.01, 'schedule: redirected to the penalty-free Roth basis');
    near(r[0].earlyPenalty + r[0].traditionalWithdrawn, 0, 0.01, 'schedule: no penalized traditional draw');
  }
  // 4. Once every owner is 59.5 or older the order is the old one (taxable, traditional, Roth, cash, ...): the
  //    traditional IRA is drawn before Roth and before cash.
  {
    const r = await rows({ ageA: 60, retireAgeA: 60, lifeExpectancyA: 66, cash: 10000, cashReserve: 10000, tradIraA: 1000000, rothIraA: 100000, rothIraBasisA: 100000 });
    near(r[0].traditionalWithdrawn, grossForNet(20000, 0), 0.05, 'at 60: traditional first, as before');
    near(r[0].rothWithdrawn + r[0].earlyPenalty, 0, 0.01, 'at 60: Roth untouched');
    near(r[0].cash, 10000, 0.01, 'at 60: cash untouched');
  }
  // 5. Refilling the bond reserve is a reallocation inside an account: it never owes the penalty.
  //    An early retiree whose spending is covered by taxable money while the reserve is topped up from traditional.
  {
    const r = await rows({ taxable: 400000, bondYears: 2, tradIraA: 1000000, spending: 20000, lifeExpectancyA: 56 }, 'hist');
    for (const x of r) near(x.earlyPenalty + x.traditionalWithdrawn, 0, 0.01, `refill at ${x.age}: no withdrawal, no penalty`);
  }
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('penalty-aware withdrawals tests passed');
})();
