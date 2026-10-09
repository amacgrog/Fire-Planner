// Self-employment tax, payroll, the tax profile, the state base and the ACTC (E1c Task 3, US).
// Spec: docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md. Hand-computed; the clock is pinned to 2026-06-15.
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
  const setax = (se, w) => page.evaluate(([a, b]) => window.__test_selfEmploymentTax(a, b, 0), [se, w]);
  let r = await setax(100000, 0);
  near(r.ne, 92350, 1e-9, 'ne');
  near(r.tax, 14129.55, 1e-6, 'se 100,000 tax (11,451.40 + 2,678.15)');
  near(r.half, 7064.775, 1e-6, 'half');
  r = await setax(100000, 150000);
  near(r.tax, 6956.15, 1e-6, 'Social Security only on 184,500 - 150,000 = 34,500: 4,278 + 2,678.15');
  r = await setax(100000, 200000);
  near(r.tax, 2678.15, 1e-6, 'Medicare only above the wage base');
  r = await setax(400, 0);
  assert.deepStrictEqual([r.tax, r.half, r.ne], [0, 0, 0], '$400 floor: ne 369.40 owes nothing');
  r = await setax(434, 0);
  near(r.tax, 61.322247, 1e-6, 'just over the floor: ne 400.799 x 15.3%');
  near(r.ne, 400.799, 1e-6, 'ne over the floor');

  // ---- payroll ----
  const pay = (o) =>
    page.evaluate((a) => window.__test_payrollTax({ wageA: 0, wageB: 0, healthPremiumA: 0, healthPremiumB: 0, filing: 'single', year: 0, ...a }), o);
  r = await setax(100000, 180000);
  near(r.tax, 558 + 2678.15, 1e-6, 'selfEmploymentTax(100000, 180000): 558 + 2,678.15');
  near(
    await pay({ wageA: 180000, seTaxA: 3236.15, seNeA: 92350 }),
    13770 + 3236.15 + 0.009 * (272350 - 200000),
    1e-6,
    'payroll: FICA 13,770 + SE tax + Additional Medicare on wages plus net earnings',
  );
  near(await pay({ wageA: 180000, seTaxA: 3236.15, seNeA: 92350 }), 17657.3, 1e-6, 'payroll total');

  // ---- ACTC earned income, state base ----
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
      standardDeduction: { ...zero3 }, standardDeductionPhase: { kind: 'none' }, exemption: { ...zero3 }, exemptionPhaseOut: { kind: 'none' }, dependentExemption: 0,
      seniorExemption: { kind: 'none' }, federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false }, schedule: [],
      retirementExclusion: { kind: 'none' }, credits: [], federalTaxSubtraction: 'none', localTax: 'notModeled', notes: '',
    };
    st.inflation = 0;
    const profile = (o) => Object.assign({ year: 0, filing: 'mfj', singlePerson: false, otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 40, ageB: 40, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [] }, o);
    st.stateTax = 'tx';
    const kid = [{ age: 5, student: false, qualifyingChild: true }];
    out.actcSe = t.taxFor(profile({ wageA: 0, otherA: 9293.5225, seNetA: 9293.5225, seEarnedA: 9293.5225, dependents: kid }), 0, 0);
    out.actcNoEarned = t.taxFor(profile({ wageA: 0, otherA: 9293.5225, seNetA: 9293.5225, seEarnedA: 0, dependents: kid }), 0, 0);
    st.stateTax = 'zzx';
    out.state = t.taxFor(profile({ filing: 'single', singlePerson: true, otherA: 50000, seNetA: 50000, wageA: 0 }), 0, 0);
    st.stateTax = 'tx';
    out.stateTx = t.taxFor(profile({ filing: 'single', singlePerson: true, otherA: 50000, seNetA: 50000, wageA: 0 }), 0, 0);
    delete R.zzx;
    return out;
  });
  near(taxChecks.actcSe, -1019.028375, 1e-6, 'ACTC: 15% x (9,293.5225 - 2,500)');
  near(taxChecks.actcNoEarned, 0, 1e-6, 'no seEarned: no ACTC');
  near(taxChecks.state - taxChecks.stateTx, 5000, 1e-6, 'state base: 10% of 50,000 of self-employment net');

  // ---- engine ----
  const BASE = {
    singlePerson: true, ageA: 45, retireAgeA: 60, incomeA: 100000, incomeKindA: 'self', inflation: 0, incomeGrowth: 0, stateTax: 'tx',
    k401PctA: 0, catchupPctA: 0, iraPctA: 0, profitSharingPctA: 0, megaBackdoor: false, healthPremiumA: 0,
    survivorEnabled: false, incomeSources: [],
  };
  const engine = (patch) =>
    page.evaluate((p) => {
      const st = window.__test_getState();
      Object.assign(st, p);
      const trace = window.__test_accountTrace();
      const rows = window.__test_simulate().rows;
      return { trace: trace.map((t) => ({ profile: t.profile, ficaTax: t.ficaTax })), rows: rows.map((x) => ({ wages: x.wages })) };
    }, { ...BASE, ...patch });

  let e = await engine({});
  near(e.trace[0].ficaTax, 14129.55, 1e-6, 'engine year 0: SE tax, no W-2 wages');
  near(e.trace[0].profile.seNetA, 92935.225, 1e-6, 'seNetA');
  near(e.trace[0].profile.sePlanNetA, 92935.225, 1e-6, 'sePlanNetA');
  assert.strictEqual(e.trace[0].profile.wageA, 0, 'no W-2 wages');
  assert.strictEqual(e.rows[0].wages, 100000, 'cash: the profit');

  e = await engine({ retireAgeA: 45 });
  assert.strictEqual(e.trace[0].ficaTax, 0, 'retired self-employed: no SE tax');
  assert.strictEqual(e.trace[0].profile.seNetA || 0, 0, 'retired self-employed: no seNet');

  e = await engine({ singlePerson: false, incomeB: 0, ageB: 45, retireAgeB: 45, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 47 });
  near(e.trace[1].ficaTax, 14129.55, 1e-6, 'dies: year 1 SE tax');
  assert.strictEqual(e.trace[2].ficaTax, 0, 'dies: year 2 nothing');

  e = await engine({ matchA: 50, healthPremiumA: 200 });
  near(e.trace[0].ficaTax, 14129.55, 1e-6, 'stale W-2 fields: SE tax unchanged');
  assert.strictEqual(e.rows[0].wages, 100000, 'stale W-2 fields: no premium');

  // legacy identical
  const R = { singlePerson: false, ageA: 52, ageB: 50, retireAgeA: 60, retireAgeB: 58, incomeA: 90000, incomeB: 60000 };
  const a = await engine({ ...R, incomeKindA: 'wages' });
  const b = await page.evaluate((p) => {
    const st = window.__test_getState();
    Object.assign(st, p);
    delete st.incomeKindA;
    delete st.incomeKindB;
    const trace = window.__test_accountTrace();
    const rows = window.__test_simulate().rows;
    return { trace: trace.map((t) => ({ profile: t.profile, ficaTax: t.ficaTax })), rows: rows.map((x) => ({ wages: x.wages })) };
  }, { ...BASE, ...R, incomeKindA: 'wages' });
  assert.strictEqual(JSON.stringify(a.trace), JSON.stringify(b.trace), 'legacy identical: trace');
  assert.strictEqual(JSON.stringify(a.rows), JSON.stringify(b.rows), 'legacy identical: rows');

  assert.deepStrictEqual(errors, [], 'page errors');
  await browser.close();
  console.log('self_employment: SE tax passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
