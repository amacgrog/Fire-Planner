// 72(t) SEPP per account (US, Batch 3B step 5). RMD method: the account's start-of-year balance over the Single
// Life Table factor for the owner's age that year, from the first-payment age (the owner's retirement age when
// blank) through the later of 5 years or age 59.5. A running plan is a hard cap: the account supplies exactly its
// payment (no discretionary draws, no Roth conversion); any further need comes from other accounts. Zero returns
// and inflation, a single 2026 filer, no state tax. Factors: 45 -> 41.0, 50 -> 36.2, 51 -> 35.3, 55 -> 31.6.
//
//   node tests/sepp_per_account.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, e, tol, label) => assert(Math.abs(a - e) <= tol, `${label}: expected ${e} (+/-${tol}), got ${a}`);

const BASE = {
  singlePerson: true, ageA: 50, retireAgeA: 50, lifeExpectancyA: 66, ageB: 45, retireAgeB: 45, lifeExpectancyB: 66,
  returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, dividendYield: 0, incomeGrowth: 0, medicalInflation: 0,
  healthcare: 0, medicareYearly: 0, acaEnabled: false, ltcEnabled: false, stateTax: 'tx', ssMonthlyA: 0, ssMonthlyB: 0,
  tenure: 'rent', rent: 0, rentGrowth: 0, incomeA: 0, incomeB: 0, taxable: 0, basisRatio: 100, cash: 0, cashReserve: 0, bondYears: 0, spending: 40000,
  tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0,
  rothIraBasisA: 0, rothIraBasisB: 0, roth401kBasisPctA: 100, roth401kBasisPctB: 100,
  ruleOf55A: false, ruleOf55B: false, withdrawalMixEnabled: false, smoothWithdrawals: false, appliedMixSchedule: null, rothConvEnabled: false,
  sepp72tIraA: false, sepp72tK401A: false, sepp72tIraB: false, sepp72tK401B: false,
  sepp72tIraAgeA: 0, sepp72tK401AgeA: 0, sepp72tIraAgeB: 0, sepp72tK401AgeB: 0,
  survivorEnabled: false,
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
          const res = fn === 'std' ? window.__test_simulate() : window.__test_simulateHistorical((y) => [1970 + y, 0, 0, 0]);
          return {
            depletedAge: res.depletedAge,
            rows: res.rows.map((r) => ({ age: r.age, sepp72: r.sepp72, rmd: r.rmd, conversionAmount: r.conversionAmount, taxableWithdrawn: r.taxableWithdrawn, traditionalWithdrawn: r.traditionalWithdrawn, rothWithdrawn: r.rothWithdrawn, earlyPenalty: r.earlyPenalty, traditional: r.traditional })),
          };
        } finally {
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, saved);
        }
      },
      { patch, fn },
    );
  const sim = (patch, fn) => run({ ...BASE, ...patch }, fn);

  for (const fn of ['std', 'hist']) {
    // 1. A 401(k) of 1,000,000 elected at 50, retired at 50: payments at 50..59 (the 5 years end before 59.5), each the
    //    start-of-year balance over the factor, recomputed every year. The rest of the spending comes from Roth basis.
    const { rows } = await sim({ trad401kA: 1000000, sepp72tK401A: true, rothIraA: 500000, rothIraBasisA: 500000 }, fn);
    let bal = 1000000;
    const factors = { 50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6, 56: 30.6, 57: 29.8, 58: 28.9, 59: 28.0 };
    for (const age of Object.keys(factors).map(Number)) {
      const r = rows.find((x) => x.age === age);
      near(r.sepp72, bal / factors[age], 0.01, `${fn} age ${age}: payment = start-of-year balance / ${factors[age]}`);
      near(r.traditionalWithdrawn, r.sepp72, 0.01, `${fn} age ${age}: the account gives exactly its payment`);
      near(r.earlyPenalty, 0, 0.01, `${fn} age ${age}: the payments are penalty-free`);
      bal -= r.sepp72;
    }
    near(rows.find((x) => x.age === 60).sepp72, 0, 0.01, `${fn} age 60: the plan has ended (later of 5 years or 59.5)`);
  }
  // 2. Hard cap: the SEPP account is the only money; spending 60,000 is more than the payment, and the account
  //    still gives only its payment (the plan is not broken), so the household runs short.
  {
    const { rows, depletedAge } = await sim({ tradIraA: 1000000, sepp72tIraA: true, spending: 60000 });
    near(rows[0].traditionalWithdrawn, 1000000 / 36.2, 0.01, 'cap: no more than the payment leaves the account');
    near(rows[0].earlyPenalty, 0, 0.01, 'cap: no penalty');
    near(rows[0].traditional, 1000000 - 1000000 / 36.2, 0.01, 'cap: the rest of the account is untouched');
    assert.strictEqual(depletedAge, 50, 'cap: the shortfall is a shortfall, not a modification');
  }
  // 3. The shortfall comes from other accounts: taxable covers what the payment does not.
  {
    const { rows } = await sim({ tradIraA: 1000000, sepp72tIraA: true, spending: 60000, taxable: 500000 });
    near(rows[0].traditionalWithdrawn, 1000000 / 36.2, 0.01, 'taxable: the account still gives only its payment');
    assert(rows[0].taxableWithdrawn > 25000, `taxable: covers the rest (${rows[0].taxableWithdrawn})`);
  }
  // 4. First-payment age: elected for 55 while retired at 50: nothing until 55, five payments (55..59), the
  //    balance untouched before (taxable pays the bills).
  {
    const { rows } = await sim({ trad401kA: 1000000, sepp72tK401A: true, sepp72tK401AgeA: 55, taxable: 5000000 });
    for (const x of rows.filter((x) => x.age < 55)) near(x.sepp72, 0, 0.01, `start 55: nothing at ${x.age}`);
    near(rows.find((x) => x.age === 55).sepp72, 1000000 / 31.6, 0.01, 'start 55: first payment at the age-55 factor');
    assert(rows.find((x) => x.age === 59).sepp72 > 0, 'start 55: five payments, 55 through 59');
    near(rows.find((x) => x.age === 60).sepp72, 0, 0.01, 'start 55: ends after five years (60 > 59.5)');
  }
  // 5. A start at 59.5 or later has no penalty to avoid: the election does nothing.
  {
    const { rows } = await sim({ trad401kA: 1000000, sepp72tK401A: true, sepp72tK401AgeA: 60, taxable: 5000000 });
    for (const x of rows) near(x.sepp72, 0, 0.01, `start 60: no plan at ${x.age}`);
  }
  // 6. No Roth conversion out of an account under a running plan.
  {
    const conv = { tradIraA: 1000000, rothConvEnabled: true, rothConvStartAge: 50, rothConvEndAge: 58, taxable: 5000000 };
    const free = await sim(conv);
    assert(free.rows[0].conversionAmount > 5000, `without 72(t) the IRA converts (${free.rows[0].conversionAmount})`);
    const locked = await sim({ ...conv, sepp72tIraA: true });
    for (const x of locked.rows.filter((x) => x.age <= 58)) near(x.conversionAmount, 0, 0.01, `72(t) running: no conversion at ${x.age}`);
  }
  // 6b. A conversion takes from the unlocked IRA only, never from the elected 401(k) beside it.
  {
    const patch = { ...BASE, trad401kA: 500000, tradIraA: 500000, sepp72tK401A: true, rothConvEnabled: true, rothConvStartAge: 50, rothConvEndAge: 58, taxable: 5000000 };
    const out = await page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        const tr = window.__test_accountTrace();
        return { trad: tr[0].trad, conv: tr[0].conversionAmount };
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, patch);
    assert(out.conv > 5000, `6b: a conversion happens (${out.conv})`);
    near(out.trad[1], 500000 - 500000 / 36.2, 0.01, '6b: the elected 401(k) gave only its payment');
    near(out.trad[0], 500000 - out.conv, 0.01, '6b: the conversion came out of the IRA');
  }
  // 7. Per account: the 401(k) is elected, the IRA is not. The payment is the 401(k)'s own balance over the factor;
  //    the IRA stays available (penalized) for the shortfall.
  {
    const { rows } = await sim({ trad401kA: 300000, tradIraA: 700000, sepp72tK401A: true, spending: 40000 });
    near(rows[0].sepp72, 300000 / 36.2, 0.01, 'per account: payment sized on the 401(k) only');
    assert(rows[0].traditionalWithdrawn > rows[0].sepp72 + 1000, 'per account: the IRA is drawn for the rest');
    assert(rows[0].earlyPenalty > 100, `per account: the IRA part owes the penalty (${rows[0].earlyPenalty})`);
    // The ledger: the payment left the 401(k), and only the IRA gave the discretionary rest.
    const tr = await page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        return window.__test_accountTrace()[0].trad;
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...BASE, trad401kA: 300000, tradIraA: 700000, sepp72tK401A: true, spending: 40000 });
    near(tr[1], 300000 - 300000 / 36.2, 0.01, 'ledger: the 401(k) gave exactly its payment');
    near(tr[0], 700000 - (rows[0].traditionalWithdrawn - rows[0].sepp72), 0.01, 'ledger: the IRA gave the discretionary rest');
  }
  // 8. Partner B: sized on B's own age and factor (45 -> 41.0), retirement at 45.
  {
    const { rows } = await sim({ singlePerson: false, ageA: 50, retireAgeA: 50, ageB: 45, retireAgeB: 45, trad401kB: 1000000, sepp72tK401B: true, taxable: 5000000 });
    near(rows[0].sepp72, 1000000 / 41.0, 0.01, 'partner B: payment at B\'s age-45 factor');
    // Single-person mode ignores B's election.
    const single = await sim({ singlePerson: true, trad401kB: 1000000, sepp72tK401B: true, taxable: 5000000 });
    near(single.rows[0].sepp72, 0, 0.01, 'single: Partner B\'s election is ignored');
  }
  // 9. A deceased partner's plan stops: A (50) dies at 52, so the second payment (age 51) is the last.
  {
    const { rows } = await sim({ singlePerson: false, ageA: 50, retireAgeA: 50, ageB: 50, retireAgeB: 50, trad401kA: 1000000, sepp72tK401A: true, taxable: 5000000, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 52 });
    assert(rows[1].sepp72 > 0, 'survivor: payment before death');
    near(rows[2].sepp72, 0, 0.01, 'survivor: no payment once A has died');
  }
  // 10. After A's death the plan is over and the account is free again: B inherits it and draws from it.
  {
    const { rows, depletedAge } = await sim({ singlePerson: false, ageA: 50, retireAgeA: 50, ageB: 50, retireAgeB: 50, trad401kA: 3000000, sepp72tK401A: true, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 52 });
    assert.strictEqual(depletedAge, null, '10: the survivor can use the inherited account');
    // The plan's surplus (payments of ~82,000 against 40,000 of spending) funds the first years; then B draws.
    const at55 = rows.find((x) => x.age === 55);
    assert(at55.traditionalWithdrawn > 10000, `10: a discretionary draw from the inherited account (${at55.traditionalWithdrawn})`);
    near(at55.earlyPenalty, 0, 0.01, '10: inherited, no penalty');
  }
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('sepp per account tests passed');
})();
