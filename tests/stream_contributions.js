// Retirement contributions from W-2 income streams (E1b, US). Spec section 5.4. Hand-computed, limitFactor 1.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);

  const L = { annualAdditions: 72000, compensation: 360000, rothCatchUpWages: 150000 };
  const item = (o) => ({
    owner: 0,
    pay: 30000,
    ...o,
    stream: { kind: 'wages', contribute: true, deferralType: 'traditional', deferralPct: 100, matchPct: 0, afterTaxPct: 0, personalPct: 0, ...(o.s || {}) },
  });
  const spc = (items, rooms, pretax = false) =>
    page.evaluate(([i, r, l, p]) => window.__test_streamPlanContributions(i, r, l, p), [items, rooms, L, pretax]);
  const rooms = (deferral, catchUp = [0, 0], personal = [0, 0]) => ({ deferral, catchUp, personal });

  // ---- the pure function ----
  let r = await spc([item({})], rooms([0, 0]));
  assert.deepStrictEqual(r.out.trad, [0, 0, 0, 0], 'no room: nothing');
  assert.deepStrictEqual(r.out.roth, [0, 0, 0, 0]);
  assert.strictEqual(r.out.employer, 0);

  r = await spc([item({})], rooms([12250, 0]));
  assert.strictEqual(r.out.trad[1], 12250, 'half room');
  assert.strictEqual(r.out.wageCut[0], 12250);
  assert.strictEqual(r.out.employeeTrad, 12250);

  r = await spc([item({ s: { deferralType: 'roth' } })], rooms([0, 0], [4000, 0]));
  assert.strictEqual(r.out.roth[1], 4000, 'catch-up shared, Roth');
  assert.strictEqual(r.out.trad[1], 0);
  assert.strictEqual(r.out.wageCut[0], 0);

  r = await spc([item({ pay: 200000 })], rooms([24500, 0], [8000, 0]));
  assert.strictEqual(r.out.trad[1], 24500, 'Roth catch-up line: base traditional');
  assert.strictEqual(r.out.roth[1], 8000, 'catch-up is Roth over 150,000 of pay');
  assert.strictEqual(r.out.wageCut[0], 24500);

  r = await spc([item({ pay: 20000, s: { matchPct: 50 } })], rooms([24500, 0]));
  assert.strictEqual(r.out.trad[1], 20000, 'match limited by own room: deferral takes all the pay');
  assert.strictEqual(r.out.employer, 0);
  r = await spc([item({ pay: 20000, s: { matchPct: 50, deferralPct: 50 } })], rooms([24500, 0]));
  assert.strictEqual(r.out.trad[1], 20000, 'deferral 10,000 + match 10,000');
  assert.strictEqual(r.out.employer, 10000);

  r = await spc([item({ pay: 40000, s: { afterTaxPct: 100 } })], rooms([24500, 0], [8000, 0]));
  assert.strictEqual(r.out.trad[1], 32500, 'after-tax capped: deferral and catch-up');
  assert.strictEqual(r.out.roth[1], 7500, 'after-tax = pay 40,000 less 32,500');

  r = await spc([item({ s: { deferralPct: 0, personalPct: 100 } })], rooms([0, 0], [0, 0], [5000, 0]), false);
  assert.strictEqual(r.out.roth[0], 5000, 'IRA, Roth');
  r = await spc([item({ s: { deferralPct: 0, personalPct: 100 } })], rooms([0, 0], [0, 0], [5000, 0]), true);
  assert.strictEqual(r.out.trad[0], 5000, 'IRA, traditional');
  assert.strictEqual(r.out.wageCut[0], 5000);

  r = await spc([item({ pay: 15000 }), item({ pay: 30000 })], rooms([24500, 0]));
  assert.strictEqual(r.out.trad[1], 24500, 'two streams in list order: 15,000 then 9,500');
  assert.strictEqual(r.rooms.deferral[0], 0);

  r = await spc([item({ owner: 1 })], rooms([0, 24500]));
  assert.strictEqual(r.out.trad[3], 24500, 'owner B: its own 401(k)');
  assert.strictEqual(r.out.wageCut[1], 24500);
  assert.strictEqual(r.out.trad[1], 0);

  // ---- rooms through retirementContributions ----
  const rc = (patch, args) =>
    page.evaluate(([p, a]) => window.__test_retirementContributions(p, a), [patch, args]);
  const P = { k401Type: 'traditional', k401PctA: 50, catchupPctA: 0, iraPctA: 60, iraType: 'roth', megaBackdoor: false, matchA: 0, profitSharingPctA: 0 };
  r = await rc(P, {
    wageA: 100000, age: 45, wageB: 0, ageB: null, singlePerson: true, limitFactor: 1, streamWagesA: 30000,
    streamList: [item({ s: { personalPct: 100 } })],
  });
  assert.strictEqual(r.acct.trad[1], 24500, 'salary 12,250 + stream 12,250');
  assert.strictEqual(r.acct.roth[0], 7500, 'IRA: salary 4,500 + stream 3,000');
  assert.strictEqual(r.streamWageCutA, 12250);
  assert.strictEqual(r.traditionalContrib, 24500);
  // no streams: the salary math is untouched
  r = await rc(P, { wageA: 100000, age: 45, wageB: 0, ageB: null, singlePerson: true, limitFactor: 1 });
  assert.strictEqual(r.acct.trad[1], 12250);
  assert.strictEqual(r.streamWageCutA, 0);

  // ---- engine ----
  const BASE = {
    singlePerson: false, survivorEnabled: false, ageA: 45, ageB: 43, retireAgeA: 45, retireAgeB: 43, incomeA: 0, incomeB: 0,
    inflation: 0, incomeGrowth: 0, returnRate: 0, bondReturn: 0, hysaRate: 0, bondYears: 0, rothConvEnabled: false,
    healthPremiumA: 0, healthPremiumB: 0, taxable: 2000000, spending: 50000, stateTax: 'tx',
  };
  const W2 = (o) => ({
    amount: 50000, startAge: 40, endAge: 60, followGrowth: false, growth: 0, owner: 'A', kind: 'wages', contribute: true,
    deferralType: 'traditional', deferralPct: 100, matchPct: 4, afterTaxPct: 0, personalPct: 0, ...o,
  });
  const engine = (patch) =>
    page.evaluate((p) => {
      const st = window.__test_getState();
      for (const k of Object.keys(p)) {
        if (!(k in st)) throw new Error('state has no key ' + k);
        st[k] = p[k];
      }
      const trace = window.__test_accountTrace();
      return { trad: trace[0].trad, roth: trace[0].roth, profile: trace[0].profile, ficaTax: trace[0].ficaTax, trad401kA: st.trad401kA, trad401kB: st.trad401kB };
    }, patch);

  let e = await engine({ ...BASE, incomeSources: [W2({})] });
  assert.strictEqual(Math.round((e.trad[1] - e.trad401kA) * 1e6) / 1e6, 26500, 'lands: deferral 24,500 + match 2,000 in A\'s 401(k)');
  assert.strictEqual(e.profile.wageA, 25500, 'income-tax wages: 50,000 less the traditional deferral (match is not wages)');
  assert(Math.abs(e.ficaTax - 3825) < 1e-6, 'payroll tax is on the full 50,000: ' + e.ficaTax);

  // the traditional deferral lowers income tax by hand-computed amounts: compare with contribute off
  const taxOf = (patch) =>
    page.evaluate((p) => {
      const st = window.__test_getState();
      for (const k of Object.keys(p)) st[k] = p[k];
      const rows = window.__test_simulate().rows;
      return rows[0].tax;
    }, patch);
  const taxOn = await taxOf({ ...BASE, incomeSources: [W2({})] });
  const taxOff = await taxOf({ ...BASE, incomeSources: [W2({ contribute: false })] });
  assert(taxOn < taxOff, `a traditional deferral lowers tax (${taxOn} vs ${taxOff})`);
  // Roth deferral: no change in tax
  const taxRoth = await taxOf({ ...BASE, incomeSources: [W2({ deferralType: 'roth' })] });
  assert(Math.abs(taxRoth - taxOff) < 1e-6, `a Roth deferral leaves tax unchanged (${taxRoth} vs ${taxOff})`);
  // payroll tax is unchanged by the deferral: the difference in tax is income tax only (FICA 3,825 in both)
  const fOn = (await engine({ ...BASE, incomeSources: [W2({})] })).ficaTax;
  const fOff = (await engine({ ...BASE, incomeSources: [W2({ contribute: false })] })).ficaTax;
  assert.strictEqual(fOn, fOff, 'payroll tax unchanged by contributions');

  // Review focus 2: switched back to Not earned while contribute is still true: no contribution at all
  const other = await engine({ ...BASE, incomeSources: [W2({ kind: 'other' })] });
  const none = await engine({ ...BASE, incomeSources: [W2({ kind: 'other', contribute: false })] });
  assert.deepStrictEqual(other.trad, none.trad, 'kind other ignores the panel (traditional)');
  assert.deepStrictEqual(other.roth, none.roth, 'kind other ignores the panel (Roth)');

  // single-person mode with a stored owner B: the dollars go to A's accounts
  e = await engine({ ...BASE, singlePerson: true, incomeSources: [W2({ owner: 'B' })] });
  assert.strictEqual(Math.round((e.trad[1] - e.trad401kA) * 1e6) / 1e6, 26500, 'single stored B: A\'s 401(k)');
  assert.strictEqual(e.trad[3], 0, "single stored B: nothing in B's 401(k)");

  assert.deepStrictEqual(errors, [], 'page errors');
  await browser.close();
  console.log('stream_contributions: all passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
