// The qualified business income deduction (IRC 199A) (E1c Task 6, US).
// Spec: docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md section 6.6. Hand-computed; the clock is pinned to 2026-06-15.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

  // ---- the pure function (year 0, no indexing) ----
  await page.evaluate(() => { window.__test_getState().inflation = 0; });
  const q = (qbi, taxable, gain, joint, y) => page.evaluate(([a, b, c, d, e]) => window.__test_qbiDeduction(a, b, c, d, e), [qbi, taxable, gain, !!joint, y || 0]);
  near(await q(50000, 80000, 0), 10000, 1e-9, '20% of QBI below the threshold');
  near(await q(100000, 239250, 0), 5000, 1e-9, 'inside the range: ap 0.5, 0.2 x 100,000 x 0.25');
  near(await q(100000, 300000, 0), 0, 1e-9, 'above the range: an SSTB gets nothing, not even the minimum');
  near(await q(1500, 239250, 0), 75, 1e-9, 'inside the range, only 750 of QBI counts (under 1,000): no minimum');
  near(await q(3000, 239250, 0), 400, 1e-9, 'inside the range, 1,500 counts: raised to the 400 minimum');
  near(await q(50000, 60000, 30000), 6000, 1e-9, 'cap: 20% x (60,000 - 30,000 net gain)');
  near(await q(1500, 50000, 0), 400, 1e-9, 'minimum: 300 raised to 400');
  near(await q(900, 50000, 0), 180, 1e-9, 'under 1,000 of QBI: no minimum');
  near(await q(100000, 478500, 0, true), 5000, 1e-9, 'joint: threshold 403,500, width 150,000 at 478,500 -> ap 0.5');

  // ---- indexing ----
  const f = await page.evaluate(() => { window.__test_getState().inflation = 10; return window.__test_tax.taxIndexFactor(1); });
  near(f, 1.1, 1e-12, 'taxIndexFactor(1) at 10% inflation');
  near(await q(100000, 201750 * f + 37500, 0, false, 1), 5000, 1e-9, 'indexed threshold, fixed width');
  near(await q(3000, 201750 * f + 37500, 0, false, 1), 400 * f, 1e-9, 'indexed minimum');
  await page.evaluate(() => { window.__test_getState().inflation = 0; });

  // ---- taxFor ----
  const res = await page.evaluate(() => {
    const t = window.__test_tax, st = window.__test_getState(), out = {};
    st.inflation = 0;
    const profile = (o) => Object.assign({ year: 0, filing: 'single', singlePerson: true, otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 40, ageB: 40, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [], seOn: true }, o);
    st.stateTax = 'tx';
    const one = { otherA: 50000, seNetA: 50000, sePlanNetA: 50000 };
    out.oneQ = t.taxFor(profile(one), 0, 0);
    out.oneNoQ = t.taxFor(profile({ ...one, sePlanNetA: 0 }), 0, 0);
    const two = { filing: 'single', singlePerson: false, sePlanNetA: 40000, seNetA: 40000, otherA: 40000, sePlanNetB: 60000, seNetB: 60000, otherB: 60000 };
    out.two = t.taxFor(profile(two), 0, 0);
    out.twoNoQ = t.taxFor(profile({ ...two, sePlanNetA: 0, sePlanNetB: 0 }), 0, 0);
    // Oregon deducts federal tax through the lagged pass.
    out.orLagged = t.STATE_RULES.or.federalTaxSubtraction && t.STATE_RULES.or.federalTaxSubtraction.kind;
    const orp = { otherA: 90000, seNetA: 90000, sePlanNetA: 90000 };
    out.txQ = t.taxFor(profile(orp), 0, 0);
    out.txNoQ = t.taxFor(profile({ ...orp, sePlanNetA: 0 }), 0, 0);
    st.stateTax = 'or';
    out.orQ = t.taxFor(profile(orp), 0, 0);
    out.orNoQ = t.taxFor(profile({ ...orp, sePlanNetA: 0 }), 0, 0);
    // an all-W-2 household: the new keys at zero change nothing
    st.stateTax = 'ca';
    const w2 = { wageA: 80000, otherA: 80000 };
    out.w2a = t.taxFor(profile(w2), 0, 0);
    out.w2b = t.taxFor(profile({ ...w2, sePlanNetA: 0, sePlanNetB: 0, seHealthA: 0, seHealthB: 0 }), 0, 0);
    return out;
  });
  // single, 2026: standard deduction 16,100; taxable before QBI 33,900; QBI = min(10,000, 0.2 x 33,900 = 6,780) = 6,780.
  // Ordinary tax on 33,900: 1,240 + 12% x (33,900 - 12,400) = 1,240 + 2,580 = 3,820;
  // on 27,120: 1,240 + 12% x (27,120 - 12,400) = 1,240 + 1,766.40 = 3,006.40; difference 813.60.
  near(res.oneNoQ - res.oneQ, 813.6, 1e-6, 'taxFor: QBI saves 3,820 - 3,006.40');
  // two separate returns: A taxable 40,000 - 16,100 = 23,900, QBI min(8,000, 4,780) = 4,780, taxable 19,120:
  // 1,240 + 12% x 6,720 = 2,046.40. B taxable 43,900, QBI min(12,000, 8,780) = 8,780, taxable 35,120: 1,240 + 12% x 22,720 = 3,966.40.
  near(res.two, 2046.4 + 3966.4, 1e-6, 'two returns: QBI on each return, not one joint figure');
  near(res.twoNoQ - res.two, (1240 + 0.12 * (23900 - 12400) - 2046.4) + (1240 + 0.12 * (43900 - 12400) - 3966.4), 1e-6, 'two returns: the saving');
  assert.strictEqual(res.orLagged, 'lagged', 'Oregon deducts federal tax through the lagged pass');
  const fedEffect = res.txNoQ - res.txQ, orEffect = res.orNoQ - res.orQ;
  console.log(`  lagged pass: federal QBI effect ${fedEffect.toFixed(4)}, Oregon total effect ${orEffect.toFixed(4)}`);
  assert(fedEffect > 0, 'federal QBI effect positive');
  assert(orEffect > 0 && orEffect <= fedEffect + 1e-9, 'Oregon: lower by less than (or as much as) the federal effect alone');
  assert(Object.is(res.w2a, res.w2b), 'all-W-2: new keys at zero change nothing');

  // ---- engine: the Task 3 single self-employed household ----
  const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
  const FP = {
    ...ZERO, singlePerson: true, ageA: 50, retireAgeA: 60, incomeA: 60000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000,
    stateTax: 'tx', inflation: 0, incomeGrowth: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, megaBackdoor: false,
  };
  const eng = await page.evaluate((p) => {
    window.__test_replaceState(p);
    const trace = window.__test_accountTrace();
    const t = window.__test_tax, pr = trace[0].profile;
    const a = t.taxFor(pr, 0, 0), b = t.taxFor({ ...pr, sePlanNetA: 0 }, 0, 0);
    const o = pr.otherA - (pr.seHealthA || 0) + (pr.invOrd || 0), d = t.federalDeduction('single', 0, [pr.ageA], o, 0, pr.propertyTax || 0, pr.mortgageInterest || 0, pr.medicalExpense || 0); // the real deduction: itemized medical may apply
    const qd = window.__test_qbiDeduction(pr.sePlanNetA - (pr.seHealthA || 0), o - d, 0, false, 0);
    const expect = -(t.ordinaryTax(o, 0, 'single', d) - t.ordinaryTax(o, 0, 'single', d + qd));
    return { diff: a - b, expect, qd, filing: pr.filing, single: pr.singlePerson, invOrd: pr.invOrd, invQual: pr.invQual, sePlan: pr.sePlanNetA, seHealth: pr.seHealthA };
  }, FP);
  console.log(`  engine: diff ${eng.diff.toFixed(6)} expected ${eng.expect.toFixed(6)} (qbi ${eng.qd.toFixed(4)}, plan ${eng.sePlan}, health ${eng.seHealth})`);
  assert(eng.qd > 0, 'engine: a QBI deduction');
  near(eng.diff, eng.expect, 1e-6, 'engine: taxFor with and without QBI');

  // all-W-2 household: identical rows with the self-employment machinery idle
  const R = { ageA: 52, ageB: 50, retireAgeA: 60, retireAgeB: 58, incomeA: 90000, incomeB: 60000 };
  const rowsOf = (patch) => page.evaluate((p) => { window.__test_replaceState(p); return JSON.stringify(window.__test_simulate().rows); }, { ...R, ...patch });
  assert.strictEqual(await rowsOf({}), await rowsOf({ incomeKindA: 'wages', incomeSources: [{ amount: 1000, startAge: 30, endAge: 31, kind: 'wages', healthPremium: 0 }] }), 'all-W-2 identical');

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('qbi: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
