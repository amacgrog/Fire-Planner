// Income streams by owner and kind (E1b, US). Spec: docs/superpowers/specs/2026-10-08-e1b-income-streams-design.md.
// Hand-computed; the clock is pinned to 2026-06-15.
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

  const S = (o) => ({ amount: 10000, startAge: 50, endAge: 70, followGrowth: false, growth: 0, owner: 'A', kind: 'other', ...o });
  const ctx0 = { ageA: 60, ageB: 55, deadA: false, deadB: false, single: false, year: 0, factor: 1, incomeFactor: 1 };
  const fn = (streams, c = {}) => page.evaluate(([s, x]) => window.__test_streamAmountsForYear(s, x), [streams, { ...ctx0, ...c }]);
  const only = (r, k) => {
    for (const key of ['wagesA', 'wagesB', 'otherA', 'otherB']) if (key !== k) assert.strictEqual(r[key], 0, key + ' should be 0');
  };

  // ---- the pure function ----
  let r = await fn([S({ owner: 'B', startAge: 56 })]);
  assert.strictEqual(r.total, 0, "owner's age: B is 55, window starts at 56");
  r = await fn([S({ owner: 'B', startAge: 56 })], { ageB: 56 });
  assert.strictEqual(r.otherB, 10000, "owner's age: B 56 is in the window");
  r = await fn([S({ kind: 'wages' }), S({ owner: 'B', kind: 'wages', amount: 5000 }), S({ amount: 3000 })]);
  assert.deepStrictEqual([r.wagesA, r.wagesB, r.otherA, r.otherB, r.total], [10000, 5000, 3000, 0, 18000], 'kinds');
  r = await fn([{ amount: 10000, startAge: 50, endAge: 70, followGrowth: false, growth: 0 }]);
  assert.strictEqual(r.otherA, 10000, 'missing keys read as owner A, not earned');
  only(r, 'otherA');
  assert.strictEqual(r.total, 10000);
  r = await fn([S({ kind: 'wages' })], { deadA: true });
  assert.strictEqual(r.total, 0, 'a dead owner has no W-2');
  r = await fn([S({})], { deadA: true });
  assert.strictEqual(r.otherB, 10000, "A's not-earned stream moves to the survivor");
  only(r, 'otherB');
  r = await fn([S({ owner: 'B', kind: 'wages' })], { deadA: true });
  assert.strictEqual(r.wagesB, 10000, "survivor's own W-2 continues");
  r = await fn([S({ owner: 'B' })], { deadB: true });
  assert.strictEqual(r.otherA, 10000, "B's not-earned stream moves to A");
  r = await fn([S({ owner: 'B', kind: 'wages' })], { deadB: true });
  assert.strictEqual(r.total, 0, 'a dead B has no W-2');
  r = await fn([S({ owner: 'B', startAge: 60 })], { single: true, ageB: null });
  assert.strictEqual(r.otherA, 10000, "single-person mode with a stored B: A's stream on A's age (60)");
  only(r, 'otherA');

  // total exactness against the old extraIncome expression (every stream owner A, not earned)
  const mixed = [
    S({ amount: 12345.67, followGrowth: true }),
    S({ amount: 8000.5, followGrowth: false, growth: 2.7 }),
    S({ amount: 3333.33, followGrowth: true, startAge: 61 }),
    S({ amount: 999.99, followGrowth: false, growth: -1.3 }),
    S({ amount: 50000, followGrowth: true, endAge: 59 }),
  ];
  const exact = await page.evaluate(
    ([streams, c]) => {
      const out = window.__test_streamAmountsForYear(streams, c);
      const old = streams
        .filter((s) => c.ageA >= s.startAge && c.ageA <= s.endAge)
        .reduce((sum, s) => sum + s.amount * (s.followGrowth ? c.incomeFactor : Math.pow(1 + (Number(s.growth) || 0) / 100, c.year)), 0);
      return { same: Object.is(out.total, old), total: out.total, old };
    },
    [mixed, { ...ctx0, year: 7, factor: 1.21, incomeFactor: 1.3 }],
  );
  assert(exact.same, `total is the old extraIncome bit for bit: ${exact.total} vs ${exact.old}`);

  r = await fn([S({ kind: 'wages', contribute: true })]);
  assert.deepStrictEqual(r.contrib, [{ owner: 0, pay: 10000 }]);
  r = await fn([S({ kind: 'other', contribute: true })]);
  assert.deepStrictEqual(r.contrib, []);
  r = await fn([S({ kind: 'wages', contribute: true })], { deadA: true });
  assert.deepStrictEqual(r.contrib, []);

  // ---- payroll tax ----
  const pay = (o) =>
    page.evaluate((a) => window.__test_payrollTax({ wageA: 0, wageB: 0, healthPremiumA: 0, healthPremiumB: 0, filing: 'mfj', year: 0, ...a }), o);
  // A 100,000: 7,650. B 150,000 + 50,000 stream = 200,000: Social Security capped at 184,500 (11,439) + Medicare 2,900;
  // combined 300,000 over 250,000: Additional Medicare 450.
  near(await pay({ wageA: 100000, wageB: 150000, streamWagesB: 50000 }), 22439, 1e-6, 'payroll with a stream over the wage base');
  near(await pay({ wageA: 100000, wageB: 150000 }), 19125, 1e-6, 'payroll without the stream');

  // ---- ACTC earned income, state-tax two returns ----
  const taxChecks = await page.evaluate(() => {
    const t = window.__test_tax,
      st = window.__test_getState(),
      R = t.STATE_RULES,
      out = {};
    const zero3 = { single: 0, mfj: 0, hoh: 0 };
    R.zzx = {
      name: 'Synthetic', status: 'migrated', sourceKind: 'none', source: null, asOf: null,
      indexing: { bracketsIndexed: false, standardDeductionIndexed: false, personalExemptionIndexed: false, creditAmountsIndexed: false, creditThresholdsIndexed: false, retirementExclusionIndexed: false },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' }, tax: { kind: 'flat', rate: 0.1 }, additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 10000, mfj: 0, hoh: 10000 }, standardDeductionPhase: { kind: 'none' }, exemption: { ...zero3 }, exemptionPhaseOut: { kind: 'none' }, dependentExemption: 0,
      seniorExemption: { kind: 'none' }, federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false }, schedule: [],
      retirementExclusion: { kind: 'none' }, credits: [], federalTaxSubtraction: 'none', localTax: 'notModeled', notes: '',
    };
    st.inflation = 0;
    const profile = (o) => Object.assign({ year: 0, filing: 'mfj', singlePerson: false, otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: 60, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [] }, o);
    st.stateTax = 'tx';
    const kid = [{ age: 5, student: false, qualifyingChild: true }];
    out.actcWages = t.taxFor(profile({ wageA: 10000, otherA: 10000, dependents: kid }), 0, 0);
    out.actcOther = t.taxFor(profile({ wageA: 0, otherA: 10000, extraA: 10000, dependents: kid }), 0, 0);
    const stateOf = (p) => {
      st.stateTax = 'zzx';
      const a = t.taxFor(p, 0, 0);
      st.stateTax = 'tx';
      return a - t.taxFor(p, 0, 0);
    };
    out.twoReturns = stateOf(profile({ filing: 'single', wageA: 20000, otherA: 20000, otherB: 30000, extraB: 30000 }));
    out.extraOnA = stateOf(profile({ filing: 'single', wageA: 20000, otherA: 20000, otherB: 30000, extraA: 30000 }));
    delete R.zzx;
    st.stateTax = 'tx';
    return out;
  });
  near(taxChecks.actcWages, -1125, 1e-6, 'ACTC: 15% x (10,000 - 2,500)');
  near(taxChecks.actcOther, 0, 1e-6, 'a not-earned stream is not earned income');
  near(taxChecks.twoReturns, 3000, 1e-6, "two returns: B's stream is taxed on B's return (A 1,000 + B 2,000)");
  near(taxChecks.extraOnA, 4000, 1e-6, "the same stream on A's return would be 4,000");

  // ---- engine ----
  const BASE = { singlePerson: false, ageA: 60, ageB: 58, retireAgeA: 60, retireAgeB: 58, incomeA: 0, incomeB: 0, inflation: 0, incomeGrowth: 0, healthPremiumA: 0, healthPremiumB: 0, stateTax: 'tx', survivorEnabled: false };
  const engine = (patch) =>
    page.evaluate((p) => {
      const st = window.__test_getState();
      Object.assign(st, p);
      const trace = window.__test_accountTrace();
      const rows = window.__test_simulate().rows;
      return { trace: trace.map((t) => ({ profile: t.profile, ficaTax: t.ficaTax })), rows: rows.map((x) => ({ wages: x.wages, magiA: x.magiA, magiB: x.magiB })) };
    }, { ...BASE, ...patch });

  let e = await engine({ filingStatus: 'single', incomeSources: [S({ owner: 'B', kind: 'wages', amount: 40000, startAge: 50 })] });
  assert.strictEqual(e.trace[0].profile.wageB, 40000, "unmarried: B's W-2 is B's wages");
  assert(e.trace[0].profile.otherB >= 40000, 'in otherB');
  assert.strictEqual(e.trace[0].profile.wageA, 0);
  near(e.trace[0].ficaTax, 3060, 1e-6, 'payroll tax on the stream (7.65%)');
  assert(e.rows[0].magiB >= 40000 && e.rows[0].magiA < 40000, "returnMagis splits: B's stream is in B's MAGI, not A's");

  e = await engine({ survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 62, incomeSources: [S({ kind: 'wages', amount: 20000 }), S({ amount: 5000 })] });
  near(e.trace[1].ficaTax, 1530, 1e-6, 'survivor: A alive in year 1, payroll on the 20,000');
  assert.strictEqual(e.trace[2].ficaTax, 0, "survivor: A's W-2 stops in the death year");
  assert(e.trace[2].profile.otherA >= 5000, "survivor: A's not-earned stream is taxed on the survivor's return");
  assert.strictEqual(e.trace[2].profile.extraA, 5000);
  assert.strictEqual(e.rows[2].wages, 5000, 'cash: the W-2 is gone, the not-earned stream stays');

  e = await engine({ survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 62, incomeSources: [S({ owner: 'B', kind: 'wages', amount: 20000 })] });
  near(e.trace[3].ficaTax, 1530, 1e-6, "survivor's own W-2 continues after A's death");
  assert.strictEqual(e.rows[3].wages, 20000);

  e = await engine({ survivorEnabled: true, survivorPartner: 'B', survivorDeathAge: 60, incomeSources: [S({ owner: 'B', amount: 5000 })] });
  assert.strictEqual(e.trace[2].profile.extraA, 5000, "B dies: B's not-earned stream is taxed, not dropped");
  assert(e.trace[2].profile.otherA >= 5000);

  // legacy-shaped states: identical rows with the new keys present or absent
  const legacy = [{ amount: 20000, startAge: 55, endAge: 66, followGrowth: true, growth: 3 }];
  const full = legacy.map((s) => ({ ...s, owner: 'A', kind: 'other' }));
  const a = await page.evaluate(([p, ls]) => { Object.assign(window.__test_getState(), p, { incomeSources: ls }); return JSON.stringify(window.__test_simulate().rows); }, [BASE, legacy]);
  const b = await page.evaluate(([p, ls]) => { Object.assign(window.__test_getState(), p, { incomeSources: ls }); return JSON.stringify(window.__test_simulate().rows); }, [BASE, full]);
  assert.strictEqual(a, b, 'legacy-shaped streams give identical rows');

  assert.deepStrictEqual(errors, [], 'page errors');
  await browser.close();
  console.log('income_streams: all passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
