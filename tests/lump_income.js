// One-time income by kind and owner (E1d, US). Spec: docs/superpowers/specs/2026-10-09-e1d-one-time-income-design.md.
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

  // ---- the pure splitter ----
  const L = (o) => ({ amount: 10000, age: 60, flat: true, kind: 'free', owner: 'A', gainPct: 100, activeBusiness: false, ...o });
  const ctx0 = { ageA: 60, ageB: 58, deadA: false, deadB: false, single: false, year: 0, factor: 1.1, incomeFactor: 1 };
  const fn = (lumps, c = {}) => page.evaluate(([l, x]) => window.__test_lumpAmountsForYear(l, x), [lumps, { ...ctx0, ...c }]);
  const Z = { taxFree: 0, wagesA: 0, wagesB: 0, otherA: 0, otherB: 0, gainA: 0, gainB: 0, gainNoNiitA: 0, gainNoNiitB: 0, flowTotal: 0 };
  const is = (r, o, msg) => assert.deepStrictEqual(r, { ...Z, ...o }, msg);

  is(await fn([L({})]), { taxFree: 10000 }, 'free, flat');
  is(await fn([L({ flat: false })]), { taxFree: 11000 }, 'free, inflated by factor 1.1');
  is(await fn([L({ age: 61 })]), {}, 'not this age');
  is(await fn([L({ age: 59.6 })]), { taxFree: 10000 }, 'age rounds (Math.round(59.6) = 60)');
  is(await fn([{ amount: 10000, age: 60, flat: true }]), { taxFree: 10000 }, 'raw row (no kind, no owner) is tax-free');
  is(await fn([L({ kind: 'wages' })]), { wagesA: 10000, flowTotal: 10000 }, 'wages A');
  is(await fn([L({ kind: 'wages', owner: 'B' })]), { wagesB: 10000, flowTotal: 10000 }, 'wages B');
  is(await fn([L({ kind: 'ordinary', owner: 'B' })]), { otherB: 10000, flowTotal: 10000 }, 'ordinary B');
  is(await fn([L({ kind: 'wages', owner: 'b' })]), { wagesA: 10000, flowTotal: 10000 }, "owner 'b' reads as A");
  is(await fn([L({ kind: 'gain', gainPct: 40 })]), { gainA: 4000, taxFree: 6000, flowTotal: 4000 }, 'gain 40%: basis to taxFree');
  is(await fn([L({ kind: 'gain', gainPct: 0 })]), { taxFree: 10000 }, 'gainPct 0: all basis, no lump year');
  is(await fn([L({ kind: 'gain', gainPct: 'x' })]), { gainA: 10000, flowTotal: 10000 }, 'gainPct junk reads as 100');
  is(await fn([L({ kind: 'gain', gainPct: null })]), { gainA: 10000, flowTotal: 10000 }, 'gainPct null reads as 100');
  is(await fn([L({ kind: 'gain', gainPct: 250 })]), { gainA: 10000, flowTotal: 10000 }, 'gainPct clamped to 100');
  is(await fn([L({ kind: 'gain', owner: 'B', activeBusiness: true })]), { gainB: 10000, gainNoNiitB: 10000, flowTotal: 10000 }, 'active business B');
  is(await fn([L({ kind: 'gain', activeBusiness: 'yes' })]), { gainA: 10000, flowTotal: 10000 }, "activeBusiness 'yes' is not true");
  is(await fn([L({ kind: 'wages', owner: 'B' })], { single: true }), { wagesA: 10000, flowTotal: 10000 }, 'single stored B: A');
  // death year / dead owner (decision 10: deadX is true from the death year on)
  is(await fn([L({ kind: 'wages' })], { deadA: true }), { otherB: 10000, flowTotal: 10000 }, "death year: A's wages to B, no payroll");
  is(await fn([L({ kind: 'ordinary' })], { deadA: true }), { otherB: 10000, flowTotal: 10000 }, "A's ordinary to B");
  is(await fn([L({ kind: 'wages', owner: 'B' })], { deadB: true }), { otherA: 10000, flowTotal: 10000 }, "B's wages to A");
  is(await fn([L({ kind: 'gain', gainPct: 40 })], { deadA: true }), { taxFree: 10000 }, "dead owner's gain: stepped up, all tax-free");
  is(await fn([L({ kind: 'wages', owner: 'B' })], { deadA: true }), { wagesB: 10000, flowTotal: 10000 }, "survivor's own wages");
  // mixed kinds in one year, list order
  is(
    await fn([L({ kind: 'wages' }), L({ kind: 'gain', owner: 'B', gainPct: 50, amount: 30000 }), L({ amount: 5000 }), L({ kind: 'ordinary', amount: 2000 })]),
    { wagesA: 10000, gainB: 15000, otherA: 2000, taxFree: 20000, flowTotal: 27000 },
    'mixed kinds',
  );

  // the tax-free total is today's reduce bit for bit (raw rows, inflated and flat, non-round, other ages)
  const exact = await page.evaluate(([rows, c]) => {
    const out = window.__test_lumpAmountsForYear(rows, c);
    const old = rows.filter((o) => Math.round(o.age) === c.ageA).reduce((sum, o) => sum + o.amount * (o.flat ? 1 : c.factor), 0);
    return { same: Object.is(out.taxFree, old), a: out.taxFree, b: old };
  }, [[{ amount: 12345.67, age: 60 }, { amount: 999.99, age: 60, flat: true }, { amount: 50000, age: 61 }, { amount: 3333.33, age: 60.4 }], { ...ctx0, factor: 1.2189 }]);
  assert(exact.same, `raw-row exactness: ${exact.a} vs ${exact.b}`);

  // ---- engine ----
  // Runs the trace and the projection on a clean copy of the state with `patch` and the lump list; every key is deleted
  // before and after, so nothing leaks into the next run.
  const engine = (patch, lumps) =>
    page.evaluate(([p, l]) => {
      const s = window.__test_getState(),
        saved = JSON.parse(JSON.stringify(s));
      try {
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, JSON.parse(JSON.stringify(saved)), p, { oneTimeIncome: l });
        const tr = window.__test_accountTrace();
        const sim = window.__test_simulate();
        return {
          trace: tr.map((t) => ({ ficaTax: t.ficaTax, profile: t.profile, guardrails: t.guardrails, firstWithdrawal: t.firstWithdrawal, forcedPass: t.forcedPass })),
          rows: sim.rows,
          sim: { firstWithdrawal: sim.firstWithdrawal },
        };
      } finally {
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, saved);
      }
    }, [patch, lumps]);

  const W = { singlePerson: true, ageA: 45, retireAgeA: 60, lifeExpectancyA: 90, incomeA: 100000, incomeKindA: 'wages', inflation: 0,
    incomeGrowth: 0, stateTax: 'tx', k401PctA: 0, catchupPctA: 0, iraPctA: 0, profitSharingPctA: 0, megaBackdoor: false,
    healthPremiumA: 0, survivorEnabled: false, incomeSources: [], spending: 40000, guardrailsEnabled: false, acaEnabled: false,
    children: [], matchA: 0, bondYears: 0, tenure: 'rent', rent: 0, returnRate: 5, taxable: 0, cash: 0, tradIraA: 0, trad401kA: 0,
    rothIraA: 0, roth401kA: 0, tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0 };

  // severance, under the wage base: payroll +7.65% of 50,000 = 3,825 (2026 wage base 184,500)
  let a = await engine(W, []), b = await engine(W, [L({ age: 45, amount: 50000, kind: 'wages' })]);
  near(b.trace[0].ficaTax - a.trace[0].ficaTax, 3825, 1e-6, 'severance: payroll tax');
  near(b.trace[0].profile.wageA - a.trace[0].profile.wageA, 50000, 1e-6, 'severance: profile wage');
  near(b.rows[0].wages - a.rows[0].wages, 50000, 1e-6, 'severance in the flow (row.wages)');
  // shared wage base: salary 160,000 + 50,000 = 210,000 single: SS 184,500 x 6.2% = 11,439; Medicare 210,000 x 1.45% = 3,045;
  // AMT (210,000 - 200,000) x 0.9% = 90; total 14,574
  a = await engine({ ...W, incomeA: 160000 }, []);
  b = await engine({ ...W, incomeA: 160000 }, [L({ age: 45, amount: 50000, kind: 'wages' })]);
  near(a.trace[0].ficaTax, 12240, 1e-6, 'salary alone: 160,000 x 7.65%');
  near(b.trace[0].ficaTax, 14574, 1e-6, 'severance shares the wage base');
  // deferred compensation: no payroll tax, the same income tax as the wages kind (W at income 100,000)
  const none = await engine(W, []),
    wRun = await engine(W, [L({ age: 45, amount: 50000, kind: 'wages' })]),
    oRun = await engine(W, [L({ age: 45, amount: 50000, kind: 'ordinary' })]);
  assert.strictEqual(oRun.trace[0].ficaTax, none.trace[0].ficaTax, 'ordinary: no payroll tax');
  near(oRun.trace[0].profile.extraA, 50000, 1e-6, 'ordinary in extraA');
  assert.strictEqual(oRun.trace[0].profile.wageA, none.trace[0].profile.wageA, 'ordinary is not a wage');
  near(wRun.rows[0].tax - wRun.trace[0].ficaTax, oRun.rows[0].tax - oRun.trace[0].ficaTax, 1e-6, 'same income tax');

  // self-employed owner with a wages lump: SE Social Security only on the base left (184,500 - 150,000 = 34,500)
  // ne = 100,000 x 0.9235 = 92,350; SE = 34,500 x 12.4% + 92,350 x 2.9% = 4,278 + 2,678.15 = 6,956.15;
  // W-2 FICA 150,000 x 7.65% = 11,475; AMT (150,000 + 92,350 - 200,000) x 0.9% = 381.15; total 18,812.30
  const se = await engine({ ...W, incomeKindA: 'self' }, [L({ age: 45, amount: 150000, kind: 'wages' })]);
  near(se.trace[0].ficaTax, 18812.3, 1e-6, 'SE wage base used up by the severance');

  // owner B in a two-return year: a couple filing as two single returns, B earns 160,000; B's severance 50,000: B's FICA
  // rises from 12,240 to 14,574 (the shared-base arithmetic above), A's wage and A's return are untouched, and the child
  // credit stays on A
  const C2 = { ...W, singlePerson: false, ageB: 45, retireAgeB: 60, lifeExpectancyB: 90, incomeB: 160000, incomeKindB: 'wages',
    k401PctB: 0, catchupPctB: 0, iraPctB: 0, profitSharingPctB: 0, healthPremiumB: 0, filingStatus: 'single',
    children: [{ birthYear: 2020, student: false }] };
  const c0 = await engine(C2, []), cB = await engine(C2, [L({ age: 45, amount: 50000, kind: 'wages', owner: 'B' })]);
  near(cB.trace[0].ficaTax - c0.trace[0].ficaTax, 14574 - 12240, 1e-6, "B's payroll tax on B's wage base");
  assert.strictEqual(cB.trace[0].profile.wageA, c0.trace[0].profile.wageA, "A's wage untouched");
  near(cB.trace[0].profile.wageB - c0.trace[0].profile.wageB, 50000, 1e-6, "B's wage");
  // A's own return (with the children) is untouched by B's lump: price it as A's one-person hoh return from each run's profile
  const retA = await page.evaluate(([p0, p1]) => {
    const t = window.__test_tax,
      one = (p) => t.taxFor({ ...p, filing: 'hoh', singlePerson: true, otherB: 0, wageB: 0, extraB: 0, ssB: 0, ageB: null, lumpOn: false }, 0, 0);
    return [one(p0), one(p1)];
  }, [c0.trace[0].profile, cB.trace[0].profile]);
  assert.strictEqual(retA[0], retA[1], "A's return (and A's child credit) unchanged by B's lump");

  // cash conservation in a working surplus year (standard mode, no ACA or IRMAA line in reach)
  const free = await engine({ ...W, incomeA: 200000 }, [L({ age: 45, amount: 50000, kind: 'free' })]);
  const wag = await engine({ ...W, incomeA: 200000 }, [L({ age: 45, amount: 50000, kind: 'wages' })]);
  near(wag.rows[0].investable, free.rows[0].investable - (wag.rows[0].tax - free.rows[0].tax), 0.01, 'cash conservation: wages');
  const g0 = await engine({ ...W, incomeA: 200000 }, [L({ age: 45, amount: 50000, kind: 'gain', gainPct: 0 })]);
  assert.deepStrictEqual(g0.rows, free.rows, 'gainPct 0 is exactly the tax-free run');

  // ACTC from severance (spec section 7): severance is earned income, deferred compensation is not.
  // hoh, one child (age 6), wages 8,000; a 10,000 lump as wages (earned 18,000) or as ordinary (earned 8,000). Income tax is
  // 0 either way (the hoh standard deduction is above 18,000), so the unused credit is the full 2,200 and the refundable
  // part is min(1,700, 15% x (earned - 2,500)): wages 15% x 15,500 = 2,325 -> 1,700; ordinary 15% x 5,500 = 825.
  // So the wages profile's tax is lower by 1,700 - 825 = 875 (taxFor excludes payroll tax).
  const actc = await page.evaluate(() => {
    const t = window.__test_tax, st = window.__test_getState(), saved = st.stateTax;
    st.stateTax = 'tx';
    try {
      const kid = [{ age: 6, student: false, qualifyingChild: true }];
      const base = { year: 0, filing: 'hoh', singlePerson: true, otherB: 0, extraB: 0, wageB: 0, pensionA: 0, pensionB: 0,
        rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 40, ageB: null, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0,
        dependents: kid, seOn: false };
      const asWages = t.taxFor({ ...base, otherA: 18000, wageA: 18000, extraA: 0 }, 0, 0),
        asOrdinary = t.taxFor({ ...base, otherA: 18000, wageA: 8000, extraA: 10000 }, 0, 0);
      return asWages - asOrdinary;
    } finally { st.stateTax = saved; }
  });
  near(actc, -875, 1e-6, 'severance raises the refundable child credit; deferred compensation does not');
  // and the engine routes them that way
  const K = { ...W, incomeA: 8000, children: [{ birthYear: 2020, student: false }] };
  const kW = await engine(K, [L({ age: 45, amount: 10000, kind: 'wages' })]),
    kO = await engine(K, [L({ age: 45, amount: 10000, kind: 'ordinary' })]);
  near(kW.trace[0].profile.wageA, 18000, 1e-6, 'engine: a wages lump is earned income (profile.wageA)');
  assert.deepStrictEqual([kO.trace[0].profile.wageA, kO.trace[0].profile.extraA], [8000, 10000], 'engine: an ordinary lump is not earned (extraA)');

  // ---- guardrails (decisions 7 and 11) ----
  const G = { singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 90, incomeA: 0, inflation: 0, stateTax: 'tx', acaEnabled: false,
    medicareYearly: 0, ssMonthlyA: 0, tenure: 'rent', rent: 0, taxable: 600000, cash: 0, cashReserve: 0, bondYears: 0, returnRate: 5,
    tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0, tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0, spending: 30000,
    guardrailsEnabled: true, survivorEnabled: false, incomeSources: [], children: [] };
  // lump in the retirement year (year 0): no record that year, the baseline from the first deficit year without a lump
  const r0 = await engine(G, [L({ age: 60, amount: 20000, kind: 'wages' })]);
  assert.strictEqual(r0.trace[0].guardrails.initialWR, null, 'no baseline in the lump year');
  assert.notStrictEqual(r0.trace[1].guardrails.initialWR, null, 'baseline from year 1');
  assert.strictEqual(r0.sim.firstWithdrawal, 0, 'firstWithdrawal stays 0 (decision 7)');
  // a later lump after a year whose record steps the multiplier: spending doubles at 63 (a spending tier), so the
  // record at 63 is above 1.2 x the baseline; the lump at 64
  const tiers = [{ amount: 60000, startAge: 63, endAge: 120, followGrowth: true, growth: 0 }];
  const r1 = await engine({ ...G, spendingTiers: tiers }, [L({ age: 64, amount: 20000, kind: 'wages' })]);
  const m = (r, i) => r.trace[i].guardrails.multiplier;
  assert.strictEqual(m(r1, 3), 1, 'year 63 (index 3) still at 1 (its step reads year 62)');
  near(m(r1, 4), 0.9, 1e-12, 'the lump year steps from year 63 (not cleared before the step)');
  assert.strictEqual(r1.trace[4].guardrails.prevPortfolio, null, 'the lump year clears the record');
  near(m(r1, 5), 0.9, 1e-12, 'the year after holds (a second step would give 0.81)');
  // forced pass: the aca_medicaid guard household with guardrails on; scan ordinary lumps of 50, 100, ..., 2,000 at ages
  // 59-64 for a lump year that runs the forced pass, then check nothing was recorded that year
  const A0 = { singlePerson: true, ageA: 58, retireAgeA: 58, lifeExpectancyA: 90, returnRate: 5, bondReturn: 0, inflation: 2.5,
    hysaRate: 0, dividendYield: 0, medicalInflation: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0, tenure: 'rent', rent: 0,
    rentGrowth: 0, incomeA: 0, taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, tradIraA: 600000, trad401kA: 0, rothIraA: 0,
    roth401kA: 0, tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0, acaEnabled: true, acaEnhanced: false, healthcare: 12000,
    medicaidWhenEligible: true, children: [], rothConvEnabled: false, incomeSources: [], stateTax: 'tx', spending: 14000,
    guardrailsEnabled: false, survivorEnabled: false };
  const fp = await page.evaluate((base) => {
    const s = window.__test_getState(), saved = JSON.parse(JSON.stringify(s));
    try {
      for (let age = 59; age <= 64; age++)
        for (let amt = 50; amt <= 2000; amt += 50) {
          for (const k of Object.keys(s)) delete s[k];
          Object.assign(s, JSON.parse(JSON.stringify(saved)), base, { oneTimeIncome: [{ amount: amt, age, flat: true, kind: 'ordinary', owner: 'A', gainPct: 100, activeBusiness: false }] });
          const tr = window.__test_accountTrace(), i = age - 58;
          if (tr[i].forcedPass) return { found: true, age, amt, prev: tr[i - 1].guardrails, cur: tr[i].guardrails };
        }
      return { found: false };
    } finally { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, saved); }
  }, { ...A0, guardrailsEnabled: true });
  assert(fp.found, 'a lump year that runs the forced pass (widen the scan if this fails, and report)');
  console.log(`forced-pass lump year found: age ${fp.age}, ordinary lump ${fp.amt}`);
  assert.strictEqual(fp.cur.initialWR, fp.prev.initialWR, 'forced lump year: no baseline change');
  assert.strictEqual(fp.cur.prevPortfolio, null, 'forced lump year: no record');

  // ---- gain lumps in taxFor (Task 3) ----
  const tf = await page.evaluate(() => {
    const t = window.__test_tax, st = window.__test_getState(), saved = st.stateTax, out = { eq: [], two: [], niit: 0, ctc: 0 };
    const kids = [{ age: 13, student: false, qualifyingChild: true }, { age: 15, student: false, qualifyingChild: true }];
    const P = (o) => Object.assign({ year: 0, filing: 'single', singlePerson: true, otherA: 0, otherB: 0, extraA: 0, extraB: 0,
      wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 50, ageB: 50, invOrd: 0, invQual: 0,
      propertyTax: 0, mortgageInterest: 0, dependents: [], seOn: false, lumpOn: false, lumpGainA: 0, lumpGainB: 0,
      lumpGainNoNiitA: 0, lumpGainNoNiitB: 0 }, o);
    const SE = { seOn: true, seNetA: 120000, sePlanNetA: 120000, seEarnedA: 120000, seAllowA: false, seHealthA: 0, seHealthB: 0 };
    try {
      for (const code of ['tx', 'ca', 'al', 'wa', 'mt', 'nm']) { // al: lagged federal tax; wa: gains-only tax; mt, nm: gainsRate / gainsDeduction
        st.stateTax = code;
        // joint and one-person branches: a lump gain is taxed exactly like the same gain passed as `gains`
        // (invQual 0, so the branch's gains are arg + 0 + lump: the same double); with and without self-employment (QBI)
        for (const [filing, single] of [['mfj', false], ['single', true], ['hoh', true]])
          for (const se of [{}, SE]) {
            const p = P({ filing, singlePerson: single, otherA: 180000 + (se.seNetA || 0), wageA: 180000, ssA: 20000,
              dependents: filing === 'single' ? [] : kids, ...se });
            out.eq.push([code, filing, !!se.seOn, t.taxFor({ ...p, lumpOn: true, lumpGainA: 300000 }, 0, 0), t.taxFor(p, 300000, 0)]);
          }
        // two-filer branch = A's one-person return (hoh, the children, A's gain) + B's (single, B's gain), less the
        // active-business part of B's NIIT. A: other 180,000 + lump 40,000 = MAGI 220,000, past hoh's 200,000 CTC line.
        // B: other 300,000 + lump 250,000 (50,000 active): NII 250,000, MAGI 550,000 - 200,000 = 350,000 >= 250,000, so the
        // exclusion removes exactly 3.8% x 50,000 = 1,900.
        for (const se of [{}, SE]) {
          const two = t.taxFor(P({ singlePerson: false, otherA: 180000 + (se.seNetA || 0), wageA: 180000, otherB: 300000, wageB: 300000,
            dependents: kids, ...se, lumpOn: true, lumpGainA: 40000, lumpGainB: 250000, lumpGainNoNiitB: 50000 }), 0, 0);
          const a = t.taxFor(P({ filing: 'hoh', otherA: 180000 + (se.seNetA || 0), wageA: 180000, dependents: kids, ...se }), 40000, 0),
            b = t.taxFor(P({ otherA: 300000, wageA: 300000 }), 250000, 0);
          out.two.push([code, !!se.seOn, two, a + b - 1900]);
        }
      }
      st.stateTax = 'tx';
      // the joint lump crosses the 400,000 joint CTC line inside taxFor (other 380,000 + lump)
      {
        const p = P({ filing: 'mfj', singlePerson: false, otherA: 380000, wageA: 380000, dependents: kids });
        out.eq.push(['tx', 'mfj-ctc', false, t.taxFor({ ...p, lumpOn: true, lumpGainA: 40000 }, 0, 0), t.taxFor(p, 40000, 0)]);
      }
      // NIIT alone: single, other 300,000, lump 100,000: NII 100,000, MAGI - 200,000 = 200,000: 3.8% x 100,000 = 3,800
      const q = P({ otherA: 300000, wageA: 300000, lumpOn: true, lumpGainA: 100000 });
      out.niit = t.taxFor(q, 0, 0) - t.taxFor({ ...q, lumpGainNoNiitA: 100000 }, 0, 0);
      // the excluded gain stays in NIIT's MAGI: other 150,000, lump 100,000 of which 50,000 active. Correct: NII 50,000, MAGI
      // 250,000 - 200,000 = 50,000 -> NIIT 1,900, the same as with no exclusion (NII 100,000, excess 50,000 -> 1,900). A wrong
      // implementation that also took the excluded gain out of MAGI (200,000) would give 0.
      const m = P({ otherA: 150000, wageA: 150000, lumpOn: true, lumpGainA: 100000 });
      out.niitMagi = t.taxFor(m, 0, 0) - t.taxFor({ ...m, lumpGainNoNiitA: 50000 }, 0, 0);
      // child credit: joint, other 380,000; a 40,000 lump gain makes MAGI 420,000, over the 400,000 joint line by 20 x 1,000:
      // the credit falls by 20 x 50 = 1,000 (credits read through childCredits with the branch's MAGI)
      out.ctc = t.childCredits(kids, 'mfj', 0, 380000, 1e9, 380000).nonrefundable - t.childCredits(kids, 'mfj', 0, 420000, 1e9, 380000).nonrefundable;
    } finally { st.stateTax = saved; }
    return out;
  });
  for (const [code, filing, se, viaLump, viaArg] of tf.eq) assert(Object.is(viaLump, viaArg), `lump gain = gains arg: ${code} ${filing} se=${se}: ${viaLump} vs ${viaArg}`);
  for (const [code, se, two, sum] of tf.two) near(two, sum, 1e-6, `two-filer = A's + B's one-person returns: ${code} se=${se}`);
  near(tf.niit, 3800, 1e-6, 'active business removes the NIIT on that gain');
  assert.strictEqual(tf.niitMagi, 0, 'the excluded gain stays in the NIIT MAGI test');
  near(tf.ctc, 1000, 1e-6, 'CTC phase-out arithmetic (the joint equivalence above shows the branch passes the lump in the MAGI)');

  // ---- gain lumps in the engine (Task 3) ----
  // MAGI in a working surplus year: the realized MAGI rises by exactly the gain share (no draws that year)
  const base = await engine({ ...W, incomeA: 200000 }, []),
    gl = await engine({ ...W, incomeA: 200000 }, [L({ age: 45, amount: 100000, kind: 'gain', gainPct: 60 })]);
  near(gl.rows[0].magiProxy - base.rows[0].magiProxy, 60000, 1e-6, 'gain share in MAGI');
  near(gl.rows[0].income - base.rows[0].income, 60000, 1e-6, 'row.income carries the gain');
  near(gl.rows[0].investable, base.rows[0].investable + 100000 - (gl.rows[0].tax - base.rows[0].tax), 0.01, 'cash conservation: gain 60%');
  const ga = await engine({ ...W, incomeA: 200000 }, [L({ age: 45, amount: 100000, kind: 'gain', gainPct: 60, activeBusiness: true })]);
  near(ga.rows[0].magiProxy, gl.rows[0].magiProxy, 1e-6, 'active business: the gain stays in MAGI');
  // ACA: the aca_medicaid guard household (A0 above: TX single 58, IRA 600,000, spending 14,000, premium 12,000, ACA on,
  // enhanced off, guardrails off); an ordinary lump of 80,000 at 60 (index 2) puts MAGI over 400% of the poverty line: that
  // year's healthcare equals the same year's healthcare with ACA modeling off (the full premium)
  const acaLump = [L({ age: 60, amount: 80000, kind: 'ordinary', flat: true })];
  const on = await engine(A0, acaLump), off = await engine({ ...A0, acaEnabled: false }, acaLump), noL = await engine(A0, []);
  near(on.rows[2].healthcare, off.rows[2].healthcare, 0.01, 'over 400% FPL: the full premium');
  assert(on.rows[2].healthcare > noL.rows[2].healthcare + 5000, 'the lump costs the credit');
  // IRMAA: the same household at 66 on Medicare (medicareYearly 2,400, acaEnabled false), ordinary lump 250,000 at 68
  // (index 2; years 0 and 1 read the first-year stand-in, so keep the lump out of them): healthcare at 70 (index 4) is
  // higher than without the lump; at 69 (index 3) it is identical
  const M0 = { ...A0, ageA: 66, retireAgeA: 66, acaEnabled: false, medicareYearly: 2400 };
  const mL = await engine(M0, [L({ age: 68, amount: 250000, kind: 'ordinary', flat: true })]), m0 = await engine(M0, []);
  assert.strictEqual(mL.rows[3].healthcare, m0.rows[3].healthcare, 'IRMAA: nothing the next year');
  assert(mL.rows[4].healthcare > m0.rows[4].healthcare, 'IRMAA two years on');
  // two-return engine year (both working, a surplus year): owner-B gain 200,000 at A's 45 (index 0)
  const T2 = { ...C2, children: [] };
  const tL = await engine(T2, [L({ age: 45, amount: 200000, kind: 'gain', owner: 'B' })]), t0 = await engine(T2, []);
  near(tL.rows[0].magiB - t0.rows[0].magiB, 200000, 1e-6, "B's return carries B's gain");
  near(tL.rows[0].magiA - t0.rows[0].magiA, 0, 1e-6, "A's return does not");
  // a dead owner's gain: survivor scenario (A dies at 47, index 2); A's gain at 48 (index 3) is tax-free
  const S0 = { ...T2, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 47 };
  const sG = await engine(S0, [L({ age: 48, amount: 300000, kind: 'gain', gainPct: 70 })]),
    sF = await engine(S0, [L({ age: 48, amount: 300000, kind: 'free' })]);
  assert.strictEqual(sG.rows[3].tax, sF.rows[3].tax, "dead owner's gain is tax-free");
  assert.strictEqual(sG.rows[3].magiProxy, sF.rows[3].magiProxy, "dead owner's gain is not in MAGI");
  // the B-dies twin (both 45, so B also dies at index 2): B's gain at A's 48 (index 3) is tax-free and outside MAGI
  const SB = { ...S0, survivorPartner: 'B' };
  const bG = await engine(SB, [L({ age: 48, amount: 300000, kind: 'gain', gainPct: 70, owner: 'B' })]),
    bF = await engine(SB, [L({ age: 48, amount: 300000, kind: 'free', owner: 'B' })]);
  assert.strictEqual(bG.rows[3].tax, bF.rows[3].tax, "dead owner's gain is tax-free (B dies)");
  assert.strictEqual(bG.rows[3].magiProxy, bF.rows[3].magiProxy, "dead owner's gain is not in MAGI (B dies)");
  // a dead owner's ordinary lump in the death year (A's 47, index 2, decision 10) and wages lump the year after (48,
  // index 3): both reach the survivor's return as other income (extraA after the survivor remap), with no payroll tax
  const sN = await engine(S0, []),
    sO = await engine(S0, [L({ age: 47, amount: 30000, kind: 'ordinary' }), L({ age: 48, amount: 20000, kind: 'wages' })]);
  near(sO.trace[2].profile.extraA - sN.trace[2].profile.extraA, 30000, 1e-6, "death year: A's ordinary lump on the survivor's return");
  near(sO.trace[3].profile.extraA - sN.trace[3].profile.extraA, 20000, 1e-6, "A's wages lump after death: the survivor's other income");
  assert.strictEqual(sO.trace[2].ficaTax, sN.trace[2].ficaTax, 'no payroll tax on a dead owner\'s lump (death year)');
  assert.strictEqual(sO.trace[3].ficaTax, sN.trace[3].ficaTax, 'no payroll tax on a dead owner\'s lump');

  // ---- code-review cases (Task 6) ----
  // (a) the survivor's OWN gain after A's death (the remap of B's gain into slot A; a dead owner's gain is tax-free on
  // purpose, so every earlier survivor case missed this). S0: A dies at 47 (index 2); B (alive, working, 160,000) sells
  // at A's 48 (index 3), a surplus year, so MAGI rises by exactly the gain share.
  const sb = await engine(S0, [L({ age: 48, amount: 300000, kind: 'gain', owner: 'B' })]),
    sbF = await engine(S0, [L({ age: 48, amount: 300000, kind: 'free', owner: 'B' })]);
  assert(sb.rows[3].tax > sbF.rows[3].tax + 1000, "the survivor's own gain is taxed");
  near(sb.rows[3].magiProxy - sbF.rows[3].magiProxy, 300000, 1e-6, "the survivor's own gain is in MAGI");
  // the NIIT exclusion survives the remap: B files single after the death (threshold 200,000). Passive: NII 300,000 + i,
  // excess 160,000 + 300,000 + i - 200,000 = 260,000 + i -> NIIT 3.8% x (260,000 + i). Active: NII i -> 3.8% x i.
  // Difference 3.8% x 260,000 = 9,880 (i, the investment income, cancels); MAGI identical.
  const sbA = await engine(S0, [L({ age: 48, amount: 300000, kind: 'gain', owner: 'B', activeBusiness: true })]);
  near(sb.rows[3].tax - sbA.rows[3].tax, 9880, 1e-6, "survivor's active-business gain: no NIIT on it");
  near(sbA.rows[3].magiProxy, sb.rows[3].magiProxy, 1e-6, 'the excluded gain stays in MAGI after the remap');
  // (b) Partner A's gain in a two-return year: on A's return only (A's ACA household, A's IRMAA, A's conversion room)
  const tA = await engine(T2, [L({ age: 45, amount: 200000, kind: 'gain', owner: 'A' })]);
  near(tA.rows[0].magiA - t0.rows[0].magiA, 200000, 1e-6, "A's return carries A's gain");
  near(tA.rows[0].magiB - t0.rows[0].magiB, 0, 1e-6, "B's return does not");
  // (c) row.income in a year that still draws: R-like retired couple, a small gain lump that leaves a deficit. With no
  // conversion and no self-employment, the year's row.income equals its realized MAGI (both sum other income, Social
  // Security, investment income, the draws and the lump gain), so a missing lump term in either breaks the equality.
  const RD = { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, spending: 90000,
    stateTax: 'tx', taxable: 700000, cash: 60000, tradIraA: 450000, tradIraB: 450000, trad401kA: 0, trad401kB: 0, rothIraA: 100000,
    rothIraB: 100000, roth401kA: 0, roth401kB: 0, rothConvEnabled: false, acaEnabled: false, guardrailsEnabled: false,
    survivorEnabled: false, incomeSources: [], children: [] };
  const rd = await engine(RD, [L({ age: 53, amount: 20000, kind: 'gain' })]);
  assert(rd.rows[1].taxableWithdrawn + rd.rows[1].traditionalWithdrawn > 1000, 'the lump year still draws');
  near(rd.rows[1].income, rd.rows[1].magiProxy, 1e-6, 'row.income carries the lump gain in a withdrawal year');
  // (d) the forced pass's firstWithdrawal guard: a lump in the retirement year that runs the forced pass. A0 retires at 58
  // (index 0 is the retirement year); scan ordinary lumps of 50, 100, ..., 20,000 at 58 for trace[0].forcedPass.
  const fw = await page.evaluate((base) => {
    const s = window.__test_getState(), saved = JSON.parse(JSON.stringify(s));
    try {
      for (let amt = 50; amt <= 20000; amt += 50) {
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, JSON.parse(JSON.stringify(saved)), base, { oneTimeIncome: [{ amount: amt, age: 58, flat: true, kind: 'ordinary', owner: 'A', gainPct: 100, activeBusiness: false }] });
        const tr = window.__test_accountTrace();
        if (tr[0].forcedPass) return { found: true, amt, first: window.__test_simulate().firstWithdrawal, initialWR: tr[0].guardrails.initialWR };
      }
      return { found: false };
    } finally { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, saved); }
  }, { ...A0, guardrailsEnabled: true });
  if (fw.found) {
    console.log(`(d) forced retirement lump year found: ordinary lump ${fw.amt} at 58`);
    assert.strictEqual(fw.first, 0, 'forced retirement lump year: no firstWithdrawal');
    assert.strictEqual(fw.initialWR, null, 'forced retirement lump year: no baseline');
  } else console.log('NOTE (d): no forced retirement lump year in the scan; report it (the owner accepts the case as unreachable)');
  // (e) decision 12: lambda's need in a lump year adds back the lump's flow. Against a tax-free twin, the lump run's need
  // is the twin's need plus the extra tax (and any premium the lump's MAGI raises) the lump puts in the pre-draw `flow`
  // (0 <= that <= lumpFlow); without the fix it would be the twin's need LESS the lump (plus that), i.e. below the twin's.
  const LN = { ...RD, acaEnabled: true };
  const needAt = (lumps, age) => page.evaluate(([p, l, a]) => {
    const s = window.__test_getState(), saved = JSON.parse(JSON.stringify(s));
    try {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, JSON.parse(JSON.stringify(saved)), p, { oneTimeIncome: l });
      const tr = window.__test_planTrace();
      const e = tr.find((x) => x.year === a - p.ageA);
      return e ? e.lambdaNeed : undefined;
    } finally { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, saved); }
  }, [LN, lumps, age]);
  // Age 60: lambda is not computed at any age 53-59 in this household (no plan candidate before 59.5, every trace entry
  // has lambdaNeed null); 60 is the first age where both runs compute it (Task 6 report). Before the fix the lump run's
  // need was 131,155.49 against the twin's 161,155.49 (30,000 below).
  const lumpE = [L({ age: 60, amount: 30000, kind: 'ordinary' })];
  const nL = await needAt(lumpE, 60), nF = await needAt([{ ...lumpE[0], kind: 'free' }], 60);
  assert(typeof nL === 'number' && typeof nF === 'number', `lambda computed in both runs at 60 (got ${nL}, ${nF})`);
  assert(nL - nF >= -1e-6 && nL - nF <= 30000 + 1e-6, `lambda need adds back the lump: ${nL} vs twin ${nF}`);
  // In this fixture the lump is untaxed before the draw (the pre-draw `tax` and premium in `flow` do not move with it), so
  // the need is the twin's exactly; this also catches an over-add-back (e.g. 2 x lumpFlow), which the bounds above allow.
  near(nL, nF, 1e-6, 'lambda need in the lump year equals the tax-free twin (no pre-draw lump tax here)');

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('[US] one-time income (E1d) tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
