// Per-account Roth rules (US, Batch 3B step 2): each Roth account has its own owner, status and
// ledger. Zero returns/inflation and exact dollars so every number is hand-derivable. Single
// 2026 filer with only Roth income: the $16,100 deduction covers the earnings in these cases
// unless a test says otherwise (tests/roth_early_access.js covers the tax gross-up).
//
//   node tests/roth_accounts.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, e, tol, label) => assert(Math.abs(a - e) <= tol, `${label}: expected ${e} (+/-${tol}), got ${a}`);

const BASE = {
  singlePerson: true, ageA: 45, retireAgeA: 45, lifeExpectancyA: 60, ageB: 45, retireAgeB: 45, lifeExpectancyB: 60,
  returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, dividendYield: 0, incomeGrowth: 0, medicalInflation: 0,
  healthcare: 0, medicareYearly: 0, acaEnabled: false, ltcEnabled: false, stateTax: 'tx', ssMonthlyA: 0, ssMonthlyB: 0,
  tenure: 'rent', rent: 0, rentGrowth: 0, incomeA: 0, incomeB: 0, taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, spending: 10000,
  tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0,
  rothIraBasisA: 0, rothIraBasisB: 0, roth401kBasisPctA: 100, roth401kBasisPctB: 100, ruleOf55Enabled: false,
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
          const rows = fn === 'std' ? window.__test_simulate().rows : window.__test_simulateHistorical((y) => [1970 + y, 0, 0, 0]).rows;
          return rows.map((r) => ({ age: r.age, roth: r.roth, rothWithdrawn: r.rothWithdrawn, earlyPenalty: r.earlyPenalty, tax: r.tax, investable: r.investable }));
        } finally {
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, saved);
        }
      },
      { patch, fn },
    );
  const trace = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        return window.__test_accountTrace();
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, patch);
  const rows = (patch, fn) => run({ ...BASE, ...patch }, fn);

  // 1. Each account is judged by its own owner's age. A is 60 (qualified), B is 45 with a $1 basis: the
  //    two Roth IRAs are drawn pro rata, so only B's half owes the 10%: net 10,000 = g - 0.1 * (g/2 - 1).
  {
    const couple = { singlePerson: false, ageA: 60, retireAgeA: 60, lifeExpectancyA: 70, rothIraA: 100000, rothIraBasisA: 1, rothIraB: 100000, rothIraBasisB: 1 };
    for (const fn of ['std', 'hist']) {
      const r = (await rows(couple, fn))[0];
      near(r.rothWithdrawn, 9999.9 / 0.95, 0.05, `${fn}: gross with only Partner B's half penalized`);
      near(r.earlyPenalty, 0.1 * (9999.9 / 0.95 / 2 - 1), 0.05, `${fn}: penalty only on Partner B's half`);
    }
    // Both under 59.5: both halves penalized.
    const both = (await rows({ ...couple, ageA: 45, retireAgeA: 45, lifeExpectancyA: 60 }))[0];
    near(both.earlyPenalty, 0.1 * (9998 / 0.9), 0.05, 'both partners early: the whole draw less the $1 bases is penalized');
  }
  // 2. Roth IRA ordering inside one account: basis first (free), then earnings. Basis 40,000 covers four
  //    10,000 draws; year 4 is all earnings, g = 10,000 / 0.9.
  {
    const r = await rows({ rothIraA: 100000, rothIraBasisA: 40000 });
    for (let y = 0; y < 4; y++) {
      near(r[y].rothWithdrawn, 10000, 0.01, `year ${y}: inside the basis`);
      near(r[y].earlyPenalty, 0, 0.01, `year ${y}: no penalty inside the basis`);
    }
    near(r[4].earlyPenalty, 10000 / 0.9 * 0.1, 0.05, 'year 4: basis gone, the draw is all earnings');
  }
  // 3. Rule of 55 covers a Roth 401(k): no 10%, but the earnings stay taxable. Age 56 single, 40% basis,
  //    spending 40,000: earnings are 60% of the draw, above the standard deduction, so tax is owed.
  {
    const base = { ageA: 56, retireAgeA: 56, lifeExpectancyA: 70, roth401kA: 500000, roth401kBasisPctA: 40, spending: 40000 };
    const on = (await rows({ ...base, ruleOf55Enabled: true }))[0];
    near(on.earlyPenalty, 0, 0.01, 'Rule of 55: no 10% on the Roth 401(k)');
    assert(on.tax > 100, `Rule of 55: Roth 401(k) earnings are still taxed (${on.tax})`);
    assert(on.rothWithdrawn > 40100, `Rule of 55: gross is grossed up for the tax (${on.rothWithdrawn})`);
    const off = (await rows({ ...base, ruleOf55Enabled: false }))[0];
    assert(off.earlyPenalty > 1000, `no Rule of 55: the 10% applies (${off.earlyPenalty})`);
    // A Roth IRA never gets Rule of 55.
    const ira = (await rows({ ...base, roth401kA: 0, rothIraA: 500000, rothIraBasisA: 1, ruleOf55Enabled: true }))[0];
    assert(ira.earlyPenalty > 1000, `Rule of 55 does not cover a Roth IRA (${ira.earlyPenalty})`);
    // Someone who stopped working before 55 never qualifies, even when they are 55 or older later.
    const early = (await rows({ ...base, ageA: 50, retireAgeA: 50, ruleOf55Enabled: true, lifeExpectancyA: 70 })).find((x) => x.age === 56);
    assert(early.earlyPenalty > 0, 'retired at 50: Rule of 55 never applies');
  }
  // 4. The deceased partner's accounts are inherited by the spouse (penalty-free): A died at 50, B is 45 with no Roth.
  //    A's Roth IRA (basis $1) is drawn with no penalty; with no death the same draw at A's age 50 owes it.
  {
    const couple = { singlePerson: false, ageA: 50, retireAgeA: 50, lifeExpectancyA: 60, ageB: 45, retireAgeB: 45, lifeExpectancyB: 60, rothIraA: 100000, rothIraBasisA: 1 };
    const dead = await rows({ ...couple, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 50 });
    near(dead[0].earlyPenalty, 0, 0.01, 'survivor: the deceased partner\'s Roth is inherited, no penalty');
    const alive = await rows({ ...couple, survivorEnabled: false });
    assert(alive[0].earlyPenalty > 500, 'no death: Partner A at 50 owes the penalty');
  }
  // 5. A conversion lands in the converting partner's Roth IRA and ages on its own 5-year clock.
  {
    const t = await trace({ ...BASE, singlePerson: false, ageB: 45, retireAgeB: 45, tradIraA: 500000, rothConvEnabled: true, rothConvStartAge: 45, rothConvEndAge: 45, spending: 0, rothIraA: 0, rothIraB: 0 });
    assert(t[0].rothConv[0] > 1000, `A's conversion is queued on A's Roth IRA (${t[0].rothConv[0]})`);
    assert(t[0].rothConv[2] === 0 && t[0].rothConv[1] === 0 && t[0].rothConv[3] === 0, 'no other account holds converted money');
    near(t[3].rothConv[0], t[0].rothConv[0], 1e-6, 'unseasoned through year 4');
    near(t[5].rothConv[0], 0, 1e-6, 'seasoned into basis from year 5');
    near(t[5].rothBasis[0], t[0].rothConv[0], 1e-6, 'the seasoned amount became A\'s Roth IRA basis');
  }
  // 6. Contributions raise the owner's basis: Roth 401(k) deferrals by A, none elsewhere.
  {
    const t = await trace({ ...BASE, ageA: 40, retireAgeA: 60, lifeExpectancyA: 45, incomeA: 100000, k401Type: 'roth', k401PctA: 10, spending: 0 }); // 10% of the 24,500 limit
    near(t[0].rothBasis[1], 2450, 0.5, 'Roth 401(k) deferral is basis in A\'s Roth 401(k)');
    near(t[0].rothBasis[0] + t[0].rothBasis[2] + t[0].rothBasis[3], 0, 1e-6, 'no basis elsewhere');
  }
  // 7. A deficit year (spending above wages) still adds the year's Roth contribution to the owner's basis.
  {
    const t = await trace({ ...BASE, ageA: 40, retireAgeA: 60, lifeExpectancyA: 45, incomeA: 50000, k401Type: 'roth', k401PctA: 100, taxable: 2000000, spending: 200000 });
    near(t[0].rothBasis[1], 24500 - 0, 0.5, 'deficit year: the Roth 401(k) deferral is still basis');
  }
  // 8. The MAGI iteration rewinds the ledgers. ACA makes each year iterate (the premium depends on the
  //    realized MAGI): 3,000 of taxable stock with no basis is sold first (its gain differs from the
  //    estimate, so the year re-runs) and the rest of the need comes from a Roth IRA with 40,000 of basis.
  //    If the ledger were not rewound, the repeated passes would consume the basis several times.
  {
    const aca = { acaEnabled: true, acaEnhanced: false, healthcare: 12000, ageA: 50, retireAgeA: 50, lifeExpectancyA: 58, taxable: 3000, basisRatio: 0, rothIraA: 100000, rothIraBasisA: 40000, spending: 8000 };
    const r = await rows(aca);
    // Year 0 takes 5,063 from the Roth IRA (the taxable sale covers the rest), then 8,000 a year: 37,063 through
    // age 54, inside the 40,000 basis. At age 55 only 2,937 of basis is left, the rest is earnings.
    const through54 = r.filter((x) => x.age <= 54).reduce((sum, x) => sum + x.rothWithdrawn, 0);
    near(through54, 37063, 1, 'draws through age 54');
    for (const x of r.filter((x) => x.age <= 54)) near(x.earlyPenalty, 0, 0.01, `age ${x.age}: inside the basis`);
    const at55 = r.find((x) => x.age === 55);
    near(at55.earlyPenalty, 0.1 * (at55.rothWithdrawn - (40000 - through54)), 1, 'age 55: the 10% applies to the part past the basis');
  }
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('roth accounts tests passed');
})();
