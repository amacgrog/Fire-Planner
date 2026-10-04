// Per-account traditional penalty status (US, Batch 3B step 3): each of the four traditional accounts is
// penalty-free or penalized on its own (owner 59.5+, or a 401(k) covered by Rule of 55), discretionary draws
// take penalty-free accounts first, and Rule of 55 never covers an IRA. Zero returns and inflation, a single
// 2026 filer ($16,100 deduction, 10% to $12,400 of taxable income, 12% to $50,400), no state tax.
//
//   node tests/traditional_penalty.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, e, tol, label) => assert(Math.abs(a - e) <= tol, `${label}: expected ${e} (+/-${tol}), got ${a}`);
const fedTax = (gross) => {
  const t = Math.max(0, gross - 16100);
  return Math.min(t, 12400) * 0.1 + Math.max(0, Math.min(t, 50400) - 12400) * 0.12;
};
// gross - tax(gross) - penaltyRate * gross = net
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
  singlePerson: true, ageA: 56, retireAgeA: 56, lifeExpectancyA: 62, ageB: 45, retireAgeB: 45, lifeExpectancyB: 62,
  returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, dividendYield: 0, incomeGrowth: 0, medicalInflation: 0,
  healthcare: 0, medicareYearly: 0, acaEnabled: false, ltcEnabled: false, stateTax: 'tx', ssMonthlyA: 0, ssMonthlyB: 0,
  tenure: 'rent', rent: 0, rentGrowth: 0, incomeA: 0, incomeB: 0, taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, spending: 40000,
  tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0,
  ruleOf55Enabled: true, sepp72tEnabledA: false, sepp72tEnabledB: false, withdrawalMixEnabled: false, smoothWithdrawals: false,
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
          return rows.map((r) => ({ age: r.age, traditional: r.traditional, traditionalWithdrawn: r.traditionalWithdrawn, earlyPenalty: r.earlyPenalty, rmd: r.rmd, tax: r.tax }));
        } finally {
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, saved);
        }
      },
      { patch, fn },
    );
  const rows = (patch, fn) => run({ ...BASE, ...patch }, fn);

  for (const fn of ['std', 'hist']) {
    // 1. Rule of 55 covers a 401(k) but not an IRA with the same balance.
    const k = (await rows({ trad401kA: 1000000 }, fn))[0];
    near(k.earlyPenalty, 0, 0.01, `${fn}: 401(k) with Rule of 55 owes no penalty`);
    near(k.traditionalWithdrawn, grossForNet(40000, 0), 0.05, `${fn}: 401(k) draw is grossed up for tax only`);
    const ira = (await rows({ tradIraA: 1000000 }, fn))[0];
    const G = grossForNet(40000, 0.1);
    near(ira.traditionalWithdrawn, G, 0.05, `${fn}: IRA draw is grossed up for tax and the 10%`);
    near(ira.earlyPenalty, 0.1 * G, 0.05, `${fn}: IRA owes the 10% although Rule of 55 is on`);
    // Without the Rule of 55 the 401(k) owes it too.
    const off = (await rows({ trad401kA: 1000000, ruleOf55Enabled: false }, fn))[0];
    near(off.earlyPenalty, 0.1 * G, 0.05, `${fn}: Rule of 55 off: the 401(k) owes the 10%`);
    // 2. A 401(k) and an IRA together: the 401(k) is drawn first (30,000 gross), only the IRA draw is penalized.
    const mix = await rows({ trad401kA: 30000, tradIraA: 1000000 }, fn);
    near(mix[0].earlyPenalty, 0.1 * (mix[0].traditionalWithdrawn - 30000), 0.01, `${fn}: the penalty is 10% of the IRA part only`);
    assert(mix[0].earlyPenalty > 500, `${fn}: the IRA part is real`);
    near(mix[1].earlyPenalty, 0.1 * mix[1].traditionalWithdrawn, 0.01, `${fn}: year 1: the 401(k) is empty, the whole draw is penalized`);
    // 3. Age 60 and over: every account is free.
    const old = (await rows({ ageA: 60, retireAgeA: 60, lifeExpectancyA: 66, tradIraA: 1000000 }, fn))[0];
    near(old.earlyPenalty, 0, 0.01, `${fn}: an IRA at 60 owes no penalty`);
    // 4. Retired before 55: Rule of 55 never applies, even in a year the owner is past 55.
    const early = (await rows({ ageA: 50, retireAgeA: 50, lifeExpectancyA: 58, trad401kA: 1000000 }, fn)).find((r) => r.age === 56);
    assert(early.earlyPenalty > 500, `${fn}: retired at 50, still penalized at 56`);
  }
  // 5. A deceased partner's traditional accounts are inherited (penalty-free); with no death the same draw at
  //    A's age 50 owes the 10%.
  {
    const couple = { singlePerson: false, ageA: 50, retireAgeA: 50, lifeExpectancyA: 58, ageB: 45, retireAgeB: 45, lifeExpectancyB: 58, tradIraA: 1000000, ruleOf55Enabled: false };
    const dead = await rows({ ...couple, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 50 });
    near(dead[0].earlyPenalty, 0, 0.01, 'survivor: the deceased partner\'s IRA is inherited, no penalty');
    const alive = await rows({ ...couple, survivorEnabled: false });
    assert(alive[0].earlyPenalty > 500, 'no death: A at 50 owes the penalty');
  }
  // 6. The live mix only plans over penalty-free money; the penalized remainder is still drawn afterwards.
  {
    const live = await rows({ tradIraA: 1000000, withdrawalMixEnabled: true });
    const G = grossForNet(40000, 0.1);
    near(live[0].traditionalWithdrawn, G, 0.05, 'live mix: the penalized IRA is drawn after the penalty-free planning');
    near(live[0].earlyPenalty, 0.1 * G, 0.05, 'live mix: penalty on the IRA draw');
  }
  // 7. The live mix draws from the penalty-free accounts and moves the ledger: A (60) holds 600,000 of 401(k),
  //    B (45) a 1,000,000 IRA. A runs out in year 1, so the rest of year 1 comes from B at 10%. A stale ledger
  //    would keep calling B's money penalty-free.
  {
    const couple = { singlePerson: false, ageA: 60, retireAgeA: 60, lifeExpectancyA: 63, ageB: 45, retireAgeB: 45, lifeExpectancyB: 63, trad401kA: 600000, tradIraB: 1000000, spending: 400000, withdrawalMixEnabled: true, ruleOf55Enabled: false };
    const { r, aEnd0, aEnd1 } = await page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        const rows = window.__test_simulate().rows, tr = window.__test_accountTrace();
        return { r: rows.map((x) => ({ earlyPenalty: x.earlyPenalty, traditionalWithdrawn: x.traditionalWithdrawn })), aEnd0: tr[0].trad[0] + tr[0].trad[1], aEnd1: tr[1].trad[0] + tr[1].trad[1] };
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...BASE, ...couple });
    near(r[0].earlyPenalty, 0, 0.01, 'live mix year 0: inside A\'s penalty-free account');
    assert(aEnd0 > 1000, `A has money left after year 0 (${aEnd0})`);
    near(aEnd1, 0, 0.01, 'live mix year 1: A is empty');
    near(r[1].earlyPenalty, 0.1 * (r[1].traditionalWithdrawn - aEnd0), 0.01, 'live mix year 1: 10% only on the part drawn from B');
  }
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('traditional penalty tests passed');
})();
