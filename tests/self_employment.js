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
    const profile = (o) => Object.assign({ year: 0, filing: 'mfj', singlePerson: false, otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 40, ageB: 40, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [], seOn: true }, o);
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

  // ---- Solo 401(k) (Task 4) ----
  const L = { deferral: 24500, catchUp: 8000, annualAdditions: 72000, compensation: 360000, ira: 7500 };
  const noPct = { deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 };
  const solo = (q) =>
    page.evaluate(
      (x) => window.__test_soloPlanContributions(x),
      {
        se: [0, 0], half: [0, 0], main: [0, 0], w2Comp: [0, 0], iraLeft: [L.ira, L.ira],
        mainPct: [noPct, noPct], list: [], rooms: { deferral: [L.deferral, L.deferral], catchUp: [0, 0], personal: [0, 0] },
        annualAdditions: L.annualAdditions, compensation: L.compensation, mainRoth: false, iraPretax: false, megaOn: false,
        ...q,
      },
    );
  const halfOf = async (se) => (await setax(se, 0)).half;
  const stream = ({ owner = 0, pay = 0, ...o }) => ({ owner, pay, stream: { kind: 'self', contribute: true, deferralPct: 0, deferralType: 'traditional', matchPct: 0, profitSharingPct: 0, afterTaxPct: 0, personalPct: 0, ...o } });

  const h100 = await halfOf(100000), C100 = 100000 - h100;
  near(C100, 92935.225, 1e-6, 'C for se 100,000');
  r = await solo({ se: [100000, 0], half: [h100, 0], main: [100000, 0], mainPct: [{ ...noPct, profit: 25 }, noPct] });
  near(r.out.trad[1], 18587.045, 1e-6, '25% profit sharing: C x 0.25 / 1.25');
  near(r.out.planCut[0], 18587.045, 1e-6, '25%: planCut');
  assert.strictEqual(r.out.iraCut[0], 0, '25%: no IRA cut');
  near(r.out.employeeTrad, 18587.045, 1e-6, '25%: employeeTrad');
  r = await solo({ se: [100000, 0], half: [h100, 0], main: [100000, 0], mainPct: [{ ...noPct, profit: 10 }, noPct] });
  near(r.out.trad[1], C100 / 11, 1e-6, '10%: C / 11 = 8,448.656818');
  r = await solo({ se: [100000, 0], half: [h100, 0], main: [100000, 0], mainPct: [{ ...noPct, deferral: 100, profit: 25, afterTax: 100 }, noPct], megaOn: true });
  near(r.out.roth[1], 28912.955, 1e-6, 'deferral + profit + after-tax: after-tax money');
  near(r.out.trad[1], 43087.045, 1e-6, 'deferral 24,500 + profit 18,587.045');
  near(r.out.trad[1] + r.out.roth[1], 72000, 1e-6, 'all additions 72,000');
  const h1m = await halfOf(1000000);
  r = await solo({ se: [1000000, 0], half: [h1m, 0], main: [1000000, 0], mainPct: [{ ...noPct, profit: 10 }, noPct] });
  near(r.out.trad[1], 36000, 1e-6, 'compensation limit: 10% x 360,000');
  r = await solo({ se: [1000000, 0], half: [h1m, 0], main: [1000000, 0], mainPct: [{ ...noPct, deferral: 100, profit: 25 }, noPct] });
  near(r.out.trad[1], 24500 + 47500, 1e-6, 'room binds: profit sharing limited to 72,000 - 24,500 = 47,500');
  r = await solo({ se: [100000, 0], half: [h100, 0], main: [100000, 0], mainPct: [{ ...noPct, deferral: 100 }, noPct], rooms: { deferral: [12250, 0], catchUp: [0, 0], personal: [0, 0] } });
  near(r.out.trad[1], 12250, 1e-9, 'deferral room after a W-2 job used 12,250');
  const h300 = await halfOf(300000);
  r = await solo({ se: [300000, 0], half: [h300, 0], main: [300000, 0], mainPct: [{ ...noPct, deferral: 100, catchUp: 100 }, noPct], rooms: { deferral: [24500, 0], catchUp: [8000, 0], personal: [0, 0] }, mainRoth: false });
  near(r.out.trad[1], 32500, 1e-9, 'catch-up at 55: traditional, no forced Roth');
  assert.strictEqual(r.out.roth[1], 0, 'catch-up: nothing forced to Roth');
  const h5 = await halfOf(5000);
  r = await solo({ se: [5000, 0], half: [h5, 0], main: [5000, 0], mainPct: [{ ...noPct, ira: 100 }, noPct], iraPretax: false });
  near(r.out.roth[0], 4646.76125, 1e-6, 'Roth IRA on self-employment pay (compensation C)');
  const h20 = await halfOf(20000);
  r = await solo({ se: [20000, 0], half: [h20, 0], main: [20000, 0], mainPct: [{ ...noPct, ira: 100 }, noPct], iraPretax: true });
  near(r.out.trad[0], 7500, 1e-9, 'traditional IRA 7,500');
  near(r.out.iraCut[0], 7500, 1e-9, 'IRA cut');
  assert.strictEqual(r.out.planCut[0], 0, 'IRA is not plan money');
  r = await solo({
    se: [100000, 0], half: [h100, 0], main: [60000, 0], mainPct: [{ ...noPct, profit: 25 }, noPct],
    list: [stream({ owner: 0, pay: 40000, profitSharingPct: 10 })],
  });
  near(r.out.trad[1], 0.6 * C100 * 0.2 + (0.4 * C100) / 11, 1e-6, 'two sources: P_main + P_stream');
  r = await solo({ se: [0, 100000], half: [0, h100], main: [0, 0], list: [stream({ owner: 1, pay: 100000, profitSharingPct: 10 })] });
  near(r.out.trad[3], C100 / 11, 1e-6, 'owner B: slot 3');
  near(r.out.planCut[1], C100 / 11, 1e-6, 'owner B: planCut[1]');
  assert.strictEqual(r.out.trad[1], 0, 'owner B: nothing in A slot');
  r = await solo({ se: [100000, 0], half: [h100, 0], main: [0, 0], list: [stream({ owner: 0, pay: 100000, matchPct: 50 })] });
  assert.strictEqual(r.out.trad[1], 0, 'self stream match ignored');

  // ---- engine: the money lands and leaves cash ----
  const SOLO = { k401PctA: 100, profitSharingPctA: 25, returnRate: 0, bondReturn: 0, hysaRate: 0, bondYears: 0, taxable: 2000000, spending: 50000 };
  const eng2 = (patch) =>
    page.evaluate((p) => {
      const st = window.__test_getState();
      Object.assign(st, p);
      const trace = window.__test_accountTrace();
      const rows = window.__test_simulate().rows;
      return { trad: trace[0].trad, roth: trace[0].roth, profile: trace[0].profile, tradStart: st.trad401kA, rows0: rows[0] };
    }, { ...BASE, ...SOLO, ...patch });
  const s1 = await eng2({});
  near(s1.trad[1] - s1.tradStart, 24500 + 18587.045, 1e-6, 'engine: Solo money in the traditional 401(k)');
  near(s1.profile.seNetA, 92935.225 - 24500 - 18587.045, 1e-6, 'engine: seNetA net of the plan money');
  near(s1.profile.sePlanNetA, 92935.225 - 24500 - 18587.045, 1e-6, 'engine: sePlanNetA net of the plan money');
  const s2 = await eng2({ iraPctA: 100, iraType: 'traditional' });
  near(s2.profile.sePlanNetA, s1.profile.sePlanNetA, 1e-6, 'IRA: sePlanNetA unchanged');
  near(s1.profile.seNetA - s2.profile.seNetA, 7500, 1e-6, 'IRA: seNetA 7,500 lower');
  const s0 = await eng2({ k401PctA: 0, profitSharingPctA: 0 });
  assert(s0.rows0.taxable !== undefined || s0.rows0.cash !== undefined, 'row has balances');
  const bal = (x) => (x.rows0.taxable || 0) + (x.rows0.cash || 0);
  // Hand difference: the Solo money (24,500 + 18,587.045) leaves cash and taxable, less the tax it saves. The saving is the
  // engine's own year-0 tax difference (row.tax: it includes the tax on the year's taxable sales, which taxFor on the bare
  // profile does not), and taxFor on each run's year-0 profile must show a saving of the same sign.
  const saved = s0.rows0.tax - s1.rows0.tax;
  const want = 24500 + 18587.045 - saved;
  assert(saved > 1000, `Solo money saves tax: ${saved}`);
  near(bal(s0) - bal(s1), want, 1e-3, 'Solo money leaves cash (hand difference; 1e-3: the taxable sale is solved by bisection)');
  const taxOf = (x) => page.evaluate((pr) => window.__test_tax.taxFor({ ...pr, seOn: true }, 0, 0), x.profile);
  assert((await taxOf(s0)) > (await taxOf(s1)), 'taxFor on the profiles also shows the saving');
  const s3 = await eng2({ matchA: 50 });
  near(s3.trad[1] - s3.tradStart, 24500 + 18587.045, 1e-6, 'stale W-2 fields: no match');

  assert.deepStrictEqual(errors, [], 'page errors');
  await browser.close();
  console.log('self_employment: SE tax passed');
  console.log('self_employment: all passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
