// How the retirement-account inputs feed the engine (US, Batch 3A): opening balances per account and
// partner, the Roth basis rules, single-person mode, and the opening ownership ratio that sizes RMDs.
// Zero returns/inflation and exact dollars so every number is hand-derivable.
//
//   node tests/account_inputs.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const file = path.resolve(__dirname, '..', 'Planner_US.html');
const near = (a, e, tol, label) => assert(Math.abs(a - e) <= tol, `${label}: expected ${e} (+/-${tol}), got ${a}`);

const BASE = {
  singlePerson: true, ageA: 40, retireAgeA: 40, lifeExpectancyA: 45, ageB: 40, retireAgeB: 40, lifeExpectancyB: 45,
  returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, dividendYield: 0, incomeGrowth: 0, medicalInflation: 0,
  healthcare: 0, medicareYearly: 0, acaEnabled: false, ltcEnabled: false, stateTax: 'tx', ssMonthlyA: 0, ssMonthlyB: 0,
  tenure: 'rent', rent: 0, rentGrowth: 0, incomeA: 0, incomeB: 0, taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, spending: 40000,
  tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0,
  rothIraBasisA: 0, rothIraBasisB: 0, roth401kBasisPctA: 100, roth401kBasisPctB: 100,
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + file);
  await page.waitForTimeout(300);
  const run = (patch, fn = 'std') =>
    page.evaluate(
      ({ patch, fn }) => {
        const st = window.__test_getState();
        const saved = JSON.parse(JSON.stringify(st));
        Object.assign(st, patch);
        try {
          const rows = fn === 'std' ? window.__test_simulate().rows : window.__test_simulateHistorical((y) => [1970 + y, 0, 0, 0]).rows;
          return rows.map((r) => ({ age: r.age, roth: r.roth, traditional: r.traditional, rothWithdrawn: r.rothWithdrawn, earlyPenalty: r.earlyPenalty, rmd: r.rmd, tax: r.tax, investable: r.investable }));
        } finally {
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, saved);
        }
      },
      { patch, fn },
    );
  const y0 = async (patch) => (await run({ ...BASE, ...patch }))[0];

  // 1. Opening balances: all eight accounts feed the pools (couple), each partner's traditional and Roth.
  {
    const r = await y0({
      singlePerson: false, spending: 0, ageB: 40, retireAgeB: 40,
      tradIraA: 1000, trad401kA: 20000, tradIraB: 300, trad401kB: 4000, rothIraA: 50, roth401kA: 600, rothIraB: 7, roth401kB: 80000,
    });
    near(r.traditional, 25300, 1, 'traditional pool is the sum of the four traditional accounts');
    near(r.roth, 80657, 1, 'Roth pool is the sum of the four Roth accounts');
  }
  // 2. Single-person mode ignores Partner B's accounts.
  {
    const r = await y0({ singlePerson: true, spending: 0, trad401kA: 20000, trad401kB: 999999, rothIraB: 999999, roth401kB: 999999, tradIraB: 999999 });
    near(r.traditional, 20000, 1, 'single: Partner B traditional ignored');
    near(r.roth, 0, 1, 'single: Partner B Roth ignored');
  }
  // 3. Roth IRA basis. Age 40, no other money: every spending dollar comes from Roth. Basis is penalty-free;
  //    the rest owes tax and the 10% penalty.
  {
    let r = await y0({ rothIraA: 500000, rothIraBasisA: 200000, spending: 40000 });
    near(r.rothWithdrawn, 40000, 0.01, 'basis entered: a draw inside the basis is taken dollar for dollar');
    near(r.earlyPenalty, 0, 0.01, 'basis entered: no penalty inside the basis');
    // Not entered (0): the planner assumes half of the balance is basis (250,000 of 500,000).
    r = await y0({ rothIraA: 500000, rothIraBasisA: 0, spending: 40000 });
    near(r.earlyPenalty, 0, 0.01, 'basis not entered: the assumed half covers a small draw');
    r = await y0({ rothIraA: 500000, rothIraBasisA: 0, spending: 250000 });
    near(r.earlyPenalty, 0, 0.01, 'basis not entered: exactly half of the balance is free');
    r = await y0({ rothIraA: 500000, rothIraBasisA: 0, spending: 260000 });
    assert(r.earlyPenalty > 0, 'basis not entered: past half of the balance reaches earnings and owes the penalty');
    // Basis of $1 is as good as none: the whole draw is earnings, grossed up, with the 10% penalty.
    r = await y0({ rothIraA: 500000, rothIraBasisA: 1, spending: 40000 });
    assert(r.earlyPenalty > 3500, `basis of $1: the draw is almost all earnings and pays the penalty (${r.earlyPenalty})`);
    // Entered basis larger than the balance is capped at the balance.
    r = await y0({ rothIraA: 100000, rothIraBasisA: 900000, spending: 40000 });
    near(r.earlyPenalty, 0, 0.01, 'basis above the balance is capped (the whole balance is basis)');
    // The cap matters once other Roth money sits beside it: an entered 900,000 on a 100,000 IRA is still only
    // 100,000 of basis, so 200,000 of spending (IRA 100,000 + a 0%-basis Roth 401(k)) reaches earnings.
    r = await y0({ rothIraA: 100000, rothIraBasisA: 900000, roth401kA: 500000, roth401kBasisPctA: 0, spending: 200000 });
    assert(r.earlyPenalty > 0, 'basis above the IRA balance does not leak into the rest of the Roth pool');
    r = await y0({ rothIraA: 100000, rothIraBasisA: 900000, roth401kA: 500000, roth401kBasisPctA: 0, spending: 100000 });
    near(r.earlyPenalty, 0, 0.01, 'the IRA balance itself is all basis');
    // Spending beyond the basis reaches earnings: 150,000 of basis, 250,000 spent.
    r = await y0({ rothIraA: 500000, rothIraBasisA: 150000, spending: 250000 });
    assert(r.earlyPenalty > 0, 'spending past the basis owes the penalty');
    r = await y0({ rothIraA: 500000, rothIraBasisA: 150000, spending: 150000 });
    near(r.earlyPenalty, 0, 0.01, 'spending exactly the basis owes nothing');
  }
  // 3b. Shipped defaults: Roth 401(k) basis slider 50%, Roth IRA basis not entered (0).
  {
    const d = await page.evaluate(() => {
      const st = window.__test_getState();
      return { a: st.roth401kBasisPctA, b: st.roth401kBasisPctB, ia: st.rothIraBasisA, ib: st.rothIraBasisB };
    });
    assert.deepStrictEqual(d, { a: 50, b: 50, ia: 0, ib: 0 }, 'default basis settings');
    // With the slider at its default, a 500,000 Roth 401(k) holds 250,000 of basis.
    const dflt = { singlePerson: true, roth401kA: 500000, roth401kBasisPctA: 50, spending: 250000 };
    let r = await y0(dflt);
    near(r.earlyPenalty, 0, 0.01, 'Roth 401(k) at the default 50%: 250,000 is free');
    r = await y0({ ...dflt, spending: 260000 });
    assert(r.earlyPenalty > 0, 'Roth 401(k) at the default 50%: past 250,000 owes the penalty');
  }
  // 4. Roth 401(k) basis slider: contributions = balance x slider, then the same basis-first rule.
  //    500,000 at 30% is 150,000 of basis.
  {
    let r = await y0({ roth401kA: 500000, roth401kBasisPctA: 30, spending: 150000 });
    near(r.earlyPenalty, 0, 0.01, 'Roth 401(k) at 30%: 150,000 of basis is free');
    r = await y0({ roth401kA: 500000, roth401kBasisPctA: 30, spending: 160000 });
    assert(r.earlyPenalty > 0, 'Roth 401(k) at 30%: the draw past 150,000 owes the penalty');
    r = await y0({ roth401kA: 500000, roth401kBasisPctA: 0, spending: 40000 });
    assert(r.earlyPenalty > 3500, 'Roth 401(k) at 0%: everything is earnings');
  }
  // 5. Basis adds up across accounts and partners (couple): IRA A 100,000 entered + 401(k) A 1,000,000 x 10% + IRA B 60,000 = 260,000.
  {
    const couple = { singlePerson: false, ageB: 40, retireAgeB: 40, rothIraA: 400000, rothIraBasisA: 100000, roth401kA: 1000000, roth401kBasisPctA: 10, rothIraB: 200000, rothIraBasisB: 60000 };
    let r = await y0({ ...couple, spending: 260000 });
    near(r.earlyPenalty, 0, 0.01, 'couple: basis of both partners and both account types is pooled');
    r = await y0({ ...couple, spending: 270000 });
    assert(r.earlyPenalty > 0, 'couple: past the pooled basis the penalty applies');
    // Single mode drops B's 60,000 of basis (and B's balance).
    r = await y0({ ...couple, singlePerson: true, spending: 200000 });
    assert(r.earlyPenalty === 0, 'single: A alone has 200,000 of basis (100,000 + 100,000), so 200,000 is free');
    r = await y0({ ...couple, singlePerson: true, spending: 210000 });
    assert(r.earlyPenalty > 0, 'single: Partner B basis is not counted');
  }
  // 6. Opening ownership ratio sizes the RMD: A is 76 and takes an RMD, B is 50 and does not. With the same
  //    4,000,000 traditional pool, A owning 3,000,000 gives 1.5x the RMD of A owning 2,000,000.
  {
    const rmdCase = { singlePerson: false, ageA: 76, retireAgeA: 76, lifeExpectancyA: 80, ageB: 50, retireAgeB: 50, lifeExpectancyB: 80, spending: 0, taxable: 5000000 };
    const even = await y0({ ...rmdCase, trad401kA: 2000000, trad401kB: 2000000 });
    const lopsided = await y0({ ...rmdCase, trad401kA: 3000000, trad401kB: 1000000 });
    assert(even.rmd > 0, 'A takes an RMD at 76');
    near(lopsided.rmd / even.rmd, 1.5, 1e-9, 'RMD scales with A\'s opening share of the pool');
    // The IRA/401(k) split inside a partner's own money does not matter: only the partner totals do.
    const viaIra = await y0({ ...rmdCase, tradIraA: 3000000, trad401kB: 1000000 });
    near(viaIra.rmd, lopsided.rmd, 1e-6, 'A\'s traditional IRA counts toward A\'s share just like a 401(k)');
  }
  // 7. The historical engine reads the same accounts.
  {
    const std = (await run({ ...BASE, rothIraA: 500000, rothIraBasisA: 150000, spending: 150000 }))[0];
    const hist = (await run({ ...BASE, rothIraA: 500000, rothIraBasisA: 150000, spending: 150000 }, 'hist'))[0];
    near(hist.earlyPenalty, std.earlyPenalty, 0.01, 'historical engine: basis inside the draw owes no penalty');
    const hist2 = (await run({ ...BASE, rothIraA: 500000, rothIraBasisA: 150000, spending: 250000 }, 'hist'))[0];
    assert(hist2.earlyPenalty > 0, 'historical engine: draw past the basis owes the penalty');
  }
  assert.deepStrictEqual(errors, [], 'page errors');
  await browser.close();
  console.log('account inputs tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
