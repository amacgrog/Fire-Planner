// Employer coverage and the W-2 stream premium (E1c Task 2, US). Spec: docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md.
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

  const W2 = (o) => ({ amount: 30000, startAge: 50, endAge: 60, followGrowth: false, growth: 0, owner: 'A', kind: 'wages', healthPremium: 6000, ...o });
  const ctx0 = { ageA: 55, ageB: 55, deadA: false, deadB: false, single: false, year: 0, factor: 1, incomeFactor: 1, premiumFactor: 1 };
  const fn = (streams, c = {}) => page.evaluate(([s, x]) => window.__test_streamAmountsForYear(s, x), [streams, { ...ctx0, ...c }]);
  const bits = (streams, c = {}) => page.evaluate(([s, x]) => window.__test_streamCoverBits(s, x), [streams, { ...ctx0, ...c }]);

  // ---- the pure functions ----
  let r = await fn([W2({ owner: 'B' })], { premiumFactor: 1.5 });
  assert.deepStrictEqual([r.wagesB, r.premiumB, r.coverB, r.coverA], [30000, 9000, true, false], 'W-2 stream premium');
  r = await fn([W2({ owner: 'B', kind: 'self' })]);
  assert.deepStrictEqual([r.selfB, r.premiumB, r.coverB, r.wagesB], [30000, 0, false, 0], 'self stream premium ignored');
  const wb = [W2({ owner: 'B' })];
  assert.strictEqual(await bits(wb, { ageB: 61 }), 0, 'cover bits: out of window');
  assert.strictEqual(await bits(wb, { deadB: true }), 0, 'cover bits: owner dead');
  assert.strictEqual(await bits(wb, { single: true }), 1, 'cover bits: single reads the owner as A');
  assert.strictEqual(await bits(wb), 2, 'cover bits: B');

  // ---- engine ----
  const BASE = {
    singlePerson: false, ageA: 55, ageB: 55, retireAgeA: 55, retireAgeB: 55, incomeA: 0, incomeB: 0, inflation: 0, incomeGrowth: 0,
    medicalInflation: 0, healthPremiumA: 0, healthPremiumB: 0, stateTax: 'tx', acaEnabled: false, healthcare: 18000, medicareYearly: 10000,
    survivorEnabled: false, incomeSources: [], incomeKindA: 'wages', incomeKindB: 'wages', employerCoversSpouseA: true, employerCoversSpouseB: true,
  };
  const engine = (patch) =>
    page.evaluate((p) => {
      const st = window.__test_getState();
      Object.assign(st, p);
      const trace = window.__test_accountTrace();
      const rows = window.__test_simulate().rows;
      return {
        trace: trace.map((t) => ({ profile: t.profile, ficaTax: t.ficaTax, medA: t.medA, medB: t.medB })),
        rows: rows.map((x) => ({ healthcare: x.healthcare, wages: x.wages })),
      };
    }, { ...BASE, ...patch });

  let e = await engine({ incomeSources: [W2({})], employerCoversSpouseA: false });
  assert.strictEqual(e.rows[0].healthcare, 9000, 'stream premium covers A; B alone on the marketplace (half of 18,000)');
  const covered = await engine({ incomeSources: [W2({})], employerCoversSpouseA: true });
  assert.strictEqual(covered.rows[0].healthcare, 0, "B rides on A's stream job");
  near(covered.trace[0].ficaTax, (30000 - 6000) * 0.0765, 1e-6, 'payroll tax on pay less the premium');
  assert.strictEqual(covered.trace[0].profile.wageA, 24000, 'premium is pre-tax');
  assert.strictEqual(covered.rows[0].wages, 30000 - 6000, 'cash: pay less the premium');

  const med = { ageA: 63, retireAgeA: 63 };
  const withS = await engine({ ...med, incomeSources: [W2({ startAge: 60, endAge: 70 })] });
  const without = await engine({ ...med, incomeSources: [] });
  assert(withS.rows[2].healthcare < without.rows[2].healthcare, `Medicare while covered: ${withS.rows[2].healthcare} vs ${without.rows[2].healthcare}`);
  assert.strictEqual(withS.rows[8].healthcare, without.rows[8].healthcare, 'Medicare once the stream ends (A 71)');

  const lk = { ageA: 62, retireAgeA: 62 };
  const l1 = await engine({ ...lk, incomeSources: [W2({ startAge: 60, endAge: 66 })] });
  const l0 = await engine({ ...lk, incomeSources: [] });
  for (const y of [1, 2]) assert.strictEqual(l1.trace[y].medA, false, `IRMAA lookback covered y${y}`);
  for (const y of [3, 4]) assert.strictEqual(l1.trace[y].medA, true, `IRMAA lookback after the stream y${y}`);
  assert.strictEqual(l0.trace[1].medA, true, 'without the stream medA from y1');

  const se = await engine({ singlePerson: true, ageA: 64, retireAgeA: 68, incomeKindA: 'self', incomeA: 50000 });
  assert.strictEqual(se.rows[0].healthcare, 18000, 'self-employed A: marketplace');
  assert.strictEqual(se.rows[1].healthcare, 10000, 'self-employed A at 65: Medicare');

  // legacy identical
  const R = { ageA: 52, ageB: 50, retireAgeA: 60, retireAgeB: 58, incomeA: 90000, incomeB: 60000 };
  const a = await engine({ ...R });
  const b = await engine({ ...R, incomeKindA: 'wages', incomeSources: [{ amount: 1000, startAge: 30, endAge: 31, kind: 'wages', healthPremium: 0 }] });
  assert.strictEqual(JSON.stringify(a.rows), JSON.stringify(b.rows), 'legacy identical');
  console.log('se_health: coverage passed');

  // ==== Task 5: the self-employed health insurance deduction (IRC 162(l)) inside the MAGI iteration ====
  // ---- pure ----
  const sed = (h, a, b, two, p) => page.evaluate(([h, a, b, two, p]) => window.__test_seHealthDeduction(h, a, b, two, p), [h, a, b, two, p]);
  assert.deepStrictEqual(await sed(12000, 0, 0, false, { seAllowA: true, sePlanNetA: 8000, seAllowB: false, sePlanNetB: 50000 }), [8000, 0], 'joint, A allowed');
  assert.deepStrictEqual(await sed(12000, 0, 0, false, { seAllowA: true, sePlanNetA: 8000, seAllowB: true, sePlanNetB: 50000 }), [8000, 4000], 'joint, both allowed');
  assert.deepStrictEqual(await sed(12000, 7000, 5000, true, { seAllowA: true, sePlanNetA: 3000, seAllowB: true, sePlanNetB: 10000 }), [3000, 5000], 'two returns');
  assert.deepStrictEqual(await sed(12000, 0, 0, false, { seAllowA: true, sePlanNetA: 8000, seNetA: 500 }), [8000, 0], 'the cap is the plan net, not the AGI net');
  assert.deepStrictEqual(await sed(12000, 7000, 5000, false, { seAllowA: false, sePlanNetA: 8000, seAllowB: false, sePlanNetB: 8000 }), [0, 0], 'not allowed');

  // ---- engine: every case starts from the planner's defaults (replaceState), no balances unless given ----
  const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
  const FP = {
    ...ZERO, singlePerson: true, ageA: 50, retireAgeA: 60, incomeA: 60000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000,
    stateTax: 'tx', inflation: 0, incomeGrowth: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, megaBackdoor: false,
  };
  const run = (patch, hist = null) =>
    page.evaluate(([p, hist]) => {
      window.__test_replaceState(p);
      const rowFn = hist ? (y) => [2000 + y, hist[0], hist[1], hist[2], hist[3]] : undefined;
      const trace = window.__test_accountTrace(undefined, undefined, rowFn);
      const rows = rowFn ? window.__test_simulateHistorical(rowFn).rows : window.__test_simulate().rows;
      return JSON.parse(JSON.stringify({
        trace: trace.map((t) => ({ profile: t.profile, ficaTax: t.ficaTax, conversionAmount: t.conversionAmount })),
        rows: rows.map((x) => ({ healthcare: x.healthcare, magiProxy: x.magiProxy, magiA: x.magiA, magiB: x.magiB, tax: x.tax, expenses: x.expenses, cash: x.cash, total: x.total })),
        allRows: JSON.stringify(rows),
      }));
    }, [patch, hist]);
  const aca = (m, n, g, y) => page.evaluate(([m, n, g, y]) => window.__test_tax.acaNetCost(m, n, g, y), [m, n, g, y]);

  // fixed point: se 60,000 -> half 4,238.865, seNet 55,761.135; D = min(H, seNet), M = seNet - D, H = premium at M.
  let f = await run(FP);
  let H = f.rows[0].healthcare, M = f.rows[0].magiProxy, D = f.trace[0].profile.seHealthA;
  near(f.trace[0].profile.sePlanNetA, 55761.135, 1e-6, 'fixed point: sePlanNet');
  near(D, Math.min(H, 55761.135), 1e-9, 'fixed point: D = min(H, seNet)');
  near(M, 55761.135 - D, 2, 'fixed point: MAGI = seNet - D');
  near(H, await aca(M, 1, 18000, 0), 2, 'fixed point: H = premium at M');
  assert(D > 0, 'fixed point: a deduction');
  console.log(`  fixed point: H ${H.toFixed(2)} D ${D.toFixed(2)} M ${M.toFixed(2)}`);
  // no double count: the deducted premium is not also a medical expense.
  near(f.trace[0].profile.medicalExpense, H - D, 1e-9, 'no double count');

  // ACA off still converges: the flat premium grows with medical inflation and the income grows; the deduction changes every
  // year, and each year's MAGI is built from that year's deduction.
  f = await run({ ...FP, acaEnabled: false, incomeGrowth: 5, medicalInflation: 1 });
  for (let y = 0; y < 10; y++) {
    const p = f.trace[y].profile;
    near(f.rows[y].magiProxy, p.seNetA - p.seHealthA, 1, `ACA off: MAGI year ${y}`);
    assert(p.seHealthA > 0, `ACA off: deduction year ${y}`);
  }

  // cap: sePlanNet 2,788.05675 binds (Texas has no Medicaid expansion: the full premium under 100% of the poverty line).
  f = await run({ ...FP, incomeA: 3000 });
  near(f.trace[0].profile.sePlanNetA, 2788.05675, 1e-6, 'cap: sePlanNet');
  assert.strictEqual(f.trace[0].profile.seHealthA, f.trace[0].profile.sePlanNetA, 'cap binds');

  // ticked spouse plan, married: A self-employed on B's employer plan: no premium, no deduction. Unticked: A on the marketplace.
  const CPL = { ...ZERO, singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 60, retireAgeB: 60, incomeA: 80000, incomeKindA: 'self', incomeB: 90000, incomeKindB: 'wages', acaEnabled: true, stateTax: 'tx', inflation: 0, incomeGrowth: 0, filingStatus: 'mfj', k401PctA: 0, catchupPctA: 0, iraPctA: 0, k401PctB: 0, iraPctB: 0, healthPremiumB: 0 };
  f = await run({ ...CPL, employerCoversSpouseB: true });
  assert.strictEqual(f.rows[0].healthcare, 0, 'ticked: no premium');
  assert.strictEqual(f.trace[0].profile.seHealthA, 0, 'ticked: no deduction');
  f = await run({ ...CPL, employerCoversSpouseB: false });
  assert(f.rows[0].healthcare > 0 && f.trace[0].profile.seHealthA > 0, `unticked: marketplace and a deduction (${f.rows[0].healthcare}, ${f.trace[0].profile.seHealthA})`);

  // survivor self-employed (the Task 2 base: inflation 0, income growth 0): A dies at 51, B self-employed 60,000.
  f = await run({ ...BASE, ...ZERO, ageA: 50, ageB: 50, retireAgeA: 50, retireAgeB: 60, incomeB: 60000, incomeKindB: 'self', survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 51, k401PctB: 0, catchupPctB: 0, iraPctB: 0, profitSharingPctB: 0 });
  {
    const p1 = f.trace[1].profile, p0 = f.trace[0].profile;
    near(p1.seNetA, p0.seNetB, 1e-9, 'survivor: seNet in slot A');
    near(p1.sePlanNetA, p0.sePlanNetB, 1e-9, 'survivor: sePlanNet in slot A');
    assert(p1.seHealthA > 0 && p1.seHealthA <= p1.sePlanNetA, `survivor: deduction ${p1.seHealthA}`);
    assert.strictEqual(p1.seHealthB, 0, 'survivor: nothing in slot B');
    const se1 = await page.evaluate(() => window.__test_selfEmploymentTax(60000, 0, 1).tax);
    near(f.trace[1].ficaTax, se1, 1e-9, 'survivor: SE tax once');
  }

  // unmarried Medicare: A 66 self-employed on Medicare, B 60 on an employer plan with the box ticked; two returns: A's half
  // of Medicare is deductible. Married: B's employer plan bars it.
  const UM = { ...BASE, ...ZERO, ageA: 66, ageB: 60, retireAgeA: 70, retireAgeB: 65, incomeA: 50000, incomeKindA: 'self', incomeB: 60000, incomeKindB: 'wages', employerCoversSpouseB: true, medicareYearly: 10000, k401PctA: 0, catchupPctA: 0, iraPctA: 0, k401PctB: 0, iraPctB: 0 };
  f = await run({ ...UM, filingStatus: 'single' });
  assert(f.trace[0].profile.seHealthA >= 5000 - 1e-9, `unmarried Medicare: deductible (${f.trace[0].profile.seHealthA})`);
  f = await run({ ...UM, filingStatus: 'mfj' });
  assert.strictEqual(f.trace[0].profile.seHealthA, 0, 'married Medicare: barred by the spouse plan');

  // two returns under 65 with a child: A's part (A and the child, half the premium) up to A's cap; B has no self-employment.
  f = await run({ ...ZERO, singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 60, retireAgeB: 50, incomeA: 40000, incomeKindA: 'self', incomeB: 0, filingStatus: 'single', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, k401PctA: 0, catchupPctA: 0, iraPctA: 0, children: [{ birthYear: 2018, student: false }] });
  {
    const p = f.trace[0].profile, partA = await aca(f.rows[0].magiA, 2, 9000, 0);
    near(p.seHealthA, Math.min(partA, p.sePlanNetA), 2, 'two returns: A part');
    assert.strictEqual(p.seHealthB, 0, 'two returns: B none');
    console.log(`  two returns: magiA ${f.rows[0].magiA.toFixed(2)} A part ${partA.toFixed(2)} D ${p.seHealthA.toFixed(2)}`);
  }

  // ==== Task 8b (decision 9): where the 162(l) iteration has no consistent answer, Rev. Proc. 2014-41's alternative
  // calculation (section 5.02). The premium charged is always the one the recorded MAGI allows. ====
  const stats = () => page.evaluate(() => ({ ...window.__test_magiStats }));
  // band, consistent premium: single, 400% line 62,600 (1 person, 2026); below it the deduction lifts MAGI over it, above
  // it pulls MAGI under.
  for (const profit of [70000, 74000, 82000, 86000]) {
    f = await run({ ...FP, incomeA: profit });
    for (const r of f.rows) assert(Object.values(r).every((v) => v === undefined || Number.isFinite(v)), `band ${profit}: finite rows`);
    const want = await aca(f.rows[0].magiProxy, 1, 18000, 0);
    near(f.rows[0].healthcare, want, 2, `band, consistent premium (${profit}): H vs the premium at the recorded MAGI ${f.rows[0].magiProxy}`);
  }
  // band, the alternative calculation by hand (82,000; sePlanNet 76,206.8845): step 1 deduction 18,000 (the full premium),
  // MAGI 58,206.8845; steps 2-3 deduction D = the premium after the credit at that MAGI; step 4: MAGI 76,206.8845 - D
  // (over the 400% line), premium 18,000. (Task 5 asserted decision 8b here: H = D = 5,797.41 at MAGI 70,409, a
  // subsidized premium above the 400% line.)
  {
    f = await run({ ...FP, incomeA: 82000 });
    const sp = f.trace[0].profile.sePlanNetA;
    near(sp, 76206.8845, 1e-6, 'band: sePlanNet');
    const m1 = sp - 18000, Dh = await aca(m1, 1, 18000, 0);
    D = f.trace[0].profile.seHealthA; M = f.rows[0].magiProxy; H = f.rows[0].healthcare;
    near(D, Dh, 1e-6, 'band: D = the premium after the credit at the step-1 MAGI');
    near(M, sp - Dh, 1, 'band: MAGI = sePlanNet - D');
    assert.strictEqual(H, 18000, 'band: premium 18,000 (the MAGI is over the 400% line)');
    console.log(`  band: step-1 MAGI ${m1.toFixed(4)} D ${D.toFixed(4)} M ${M.toFixed(4)} H ${H.toFixed(2)}`);
  }
  // joint band: married, both 50, A self-employed, B retired with no pay; 400% line 84,600 (2 persons); sePlanNet 98,000.
  {
    const k = 1 - (await page.evaluate(() => window.__test_selfEmploymentTax(100000, 0, 0).half)) / 100000;
    const profit = 98000 / k;
    const JB = { ...ZERO, singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 60, retireAgeB: 50, incomeA: profit, incomeKindA: 'self', incomeB: 0, filingStatus: 'mfj', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, k401PctB: 0, iraPctB: 0, megaBackdoor: false };
    f = await run(JB);
    near(f.trace[0].profile.sePlanNetA, 98000, 1e-6, 'joint band: sePlanNet');
    const want = await aca(f.rows[0].magiProxy, 2, 18000, 0);
    near(f.rows[0].healthcare, want, 2, 'joint band: consistent premium');
    console.log(`  joint band: profit ${profit.toFixed(4)} D ${f.trace[0].profile.seHealthA.toFixed(2)} M ${f.rows[0].magiProxy.toFixed(2)} H ${f.rows[0].healthcare.toFixed(2)}`);
  }
  // Medicaid line (California, an expansion state): 1.38 x the 2026 poverty line for one (15,650) = 21,597; sePlanNet $300 above.
  {
    const line = 1.38 * 15650;
    assert.strictEqual(await page.evaluate(([m]) => { window.__test_replaceState({ stateTax: 'ca' }); return window.__test_tax.acaNetCost(m, 1, 18000, 0); }, [line]), 0, 'Medicaid line: $0 at the line');
    assert(await page.evaluate(([m]) => window.__test_tax.acaNetCost(m, 1, 18000, 0), [line + 1]) > 0, 'Medicaid line: a premium just over it');
    const k = 1 - (await page.evaluate(() => window.__test_selfEmploymentTax(100000, 0, 0).half)) / 100000;
    f = await run({ ...FP, stateTax: 'ca', incomeA: (line + 300) / k });
    near(f.trace[0].profile.sePlanNetA, line + 300, 1e-6, 'Medicaid line: sePlanNet');
    const want = await aca(f.rows[0].magiProxy, 1, 18000, 0);
    near(f.rows[0].healthcare, want, 2, 'Medicaid line: consistent premium');
    console.log(`  Medicaid line ${line.toFixed(2)}: profit ${((line + 300) / k).toFixed(4)} D ${f.trace[0].profile.seHealthA.toFixed(2)} M ${f.rows[0].magiProxy.toFixed(2)} H ${f.rows[0].healthcare.toFixed(2)}`);
  }
  // converged years unchanged: the fixed-point household keeps the Task 5 values and is never forced.
  {
    const before = await stats();
    f = await run(FP);
    const after = await stats();
    near(f.trace[0].profile.seHealthA, 5050.71, 0.005, 'converged: D (Task 5)');
    near(f.rows[0].magiProxy, 50710.43, 0.005, 'converged: MAGI (Task 5)');
    assert.strictEqual(after.forced, before.forced, 'converged: magiStats.forced does not grow');
    assert.strictEqual(after.unresolved, before.unresolved, 'converged: magiStats.unresolved does not grow');
  }
  // tests below use Texas again
  await page.evaluate(() => window.__test_replaceState({ stateTax: 'tx' }));

  // cliff plan replay: the side-business household (R with a self stream, ACA on).
  {
    const { legacyToAccounts } = require('./legacy_balances');
    const US_R = { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 700000, traditional: 900000, roth: 200000, cash: 60000, spending: 90000, stateTax: 'tx' };
    const stream = (amount) => ({ amount, startAge: 52, endAge: 60, followGrowth: true, growth: 3, owner: 'A', kind: 'self', contribute: true, deferralType: 'traditional', deferralPct: 100, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 25, healthPremium: 0 });
    const replay = (amount) =>
      page.evaluate((p) => {
        window.__test_replaceState(p);
        window.__test_refreshCliffPlan();
        const ch = window.__test_runPlanMode({ planMode: 'choose' });
        const ap = window.__test_runPlanMode({ planMode: 'apply', plan: { intents: ch.intents } });
        const off = window.__test_runPlanMode({ planMode: 'off' });
        const bogus = {};
        for (const [age, it] of Object.entries(ch.intents || {})) bogus[age] = { ...it, line: 'noSuchLine' };
        const absent0 = window.__test_planStats.absent;
        const ab = window.__test_runPlanMode({ planMode: 'apply', plan: { intents: bogus } });
        const absent1 = window.__test_planStats.absent;
        return { n: Object.keys(ch.intents || {}).length, same: JSON.stringify(ap.rows) === JSON.stringify(ch.rows), absent: absent1 - absent0, absentOff: JSON.stringify(ab.rows) === JSON.stringify(off.rows) };
      }, { ...legacyToAccounts({ ...US_R, acaEnabled: true }, { singlePerson: false }), incomeSources: [stream(amount)] });
    let amount = 40000, r = await replay(amount);
    for (const a of [60000, 80000, 100000, 120000]) {
      if (r.n > 0) break;
      amount = a;
      r = await replay(amount);
    }
    assert(r.n > 0, 'cliff plan replay: choose records an intent');
    assert(r.same, 'cliff plan replay: apply(choose intents) equals choose');
    assert(r.absent > 0, `cliff plan replay: absent lines counted (${r.absent})`);
    assert(r.absentOff, 'cliff plan replay: absent lines replay the natural year (= off)');
    console.log(`  cliff plan replay: stream ${amount}, ${r.n} intents, absent +${r.absent}`);
  }

  // historical path: a constant-return path (the plan's own assumptions); year 0 matches the standard run.
  {
    const std = await run(FP);
    const st = await page.evaluate(() => window.__test_getState());
    const h = await run(FP, [st.returnRate, st.inflation, st.bondReturn, st.bondReturn]);
    for (let y = 0; y < h.trace.length; y++) {
      const p = h.trace[y].profile;
      assert(Number.isFinite(p.seHealthA) && p.seHealthA <= (p.sePlanNetA || 0) + 1e-9, `historical: year ${y} D ${p.seHealthA}`);
    }
    near(h.trace[0].profile.seHealthA, std.trace[0].profile.seHealthA, 2, 'historical: year 0 D');
  }

  // Roth-conversion bracket fill (decision 8c): the fill sees AGI lower by the 162(l) deduction (ACA off: the flat 18,000).
  {
    const RC = { ...FP, acaEnabled: false, rothConvEnabled: true, rothConvStartAge: 50, rothConvEndAge: 55, rothConvBracket: 22, tradIraA: 500000 };
    const c1 = await run(RC), c0 = await run({ ...RC, healthcare: 0 });
    const d = c1.trace[0].conversionAmount - c0.trace[0].conversionAmount;
    near(c1.trace[0].profile.seHealthA, 18000, 1e-9, 'Roth fill: the deduction is the flat premium');
    near(d, 18000, 1, `Roth fill: conversion higher by the deduction (${c1.trace[0].conversionAmount} vs ${c0.trace[0].conversionAmount})`);
  }

  // legacy identical: an all-W-2 ACA household with and without the new keys.
  {
    const RL = { ageA: 52, ageB: 50, retireAgeA: 60, retireAgeB: 58, incomeA: 90000, incomeB: 60000, acaEnabled: true };
    const x = await run(RL), y = await run({ ...RL, incomeKindA: 'wages', incomeKindB: 'wages', incomeSources: [{ amount: 1000, startAge: 30, endAge: 31, kind: 'wages', healthPremium: 0, profitSharingPct: 0 }] });
    assert.strictEqual(x.allRows, y.allRows, 'legacy identical (ACA)');
  }

  assert.deepStrictEqual(errors, [], 'page errors');
  await browser.close();
  console.log('se_health: all passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
