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
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
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
        trace: trace.map((t) => ({ profile: t.profile, ficaTax: t.ficaTax, conversionAmount: t.conversionAmount, seSettle: t.seSettle })),
        rows: rows.map((x) => ({ healthcare: x.healthcare, magiProxy: x.magiProxy, magiA: x.magiA, magiB: x.magiB, tax: x.tax, expenses: x.expenses, cash: x.cash, total: x.total, healthcareSettled: x.healthcareSettled, seDeductionA: x.seDeductionA, seDeductionB: x.seDeductionB, taxSettled: x.taxSettled, seSettlement: x.seSettlement, seSettlementIn: x.seSettlementIn })),
        allRows: JSON.stringify(rows),
      }));
    }, [patch, hist]);
  const aca = (m, n, g, y, recon = 0) => page.evaluate(([m, n, g, y, recon]) => window.__test_tax.acaNetCost(m, n, g, y, recon), [m, n, g, y, recon]);
  // B5: the premium a row's return says: a settled (held) year's healthcareSettled at the return's price (the coverage kind it
  // paid for), else the paid premium at the recorded MAGI.
  const rowPremium = (f, y) => (f.rows[y].healthcareSettled !== undefined ? f.rows[y].healthcareSettled : f.rows[y].healthcare);
  const rowKind = (f, y) => (f.trace[y].seSettle ? f.trace[y].seSettle.kindA : 0);

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

  // ACA off: the recorded MAGI follows the realized deduction. The flat premium grows with medical inflation and the income
  // grows; the deduction changes every year, and each year's MAGI is built from that year's deduction.
  f = await run({ ...FP, acaEnabled: false, incomeGrowth: 5, medicalInflation: 1 });
  for (let y = 0; y < 10; y++) {
    const p = f.trace[y].profile;
    near(f.rows[y].magiProxy, p.seNetA - p.seHealthA, 1, `ACA off: recorded MAGI follows the realized deduction, year ${y}`);
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
    // B5: a held year's return is settled; its premium is the return's at the recorded (settled) MAGI.
    const want = await aca(f.rows[0].magiProxy, 1, 18000, 0, rowKind(f, 0));
    near(rowPremium(f, 0), want, 2, `band, consistent premium (${profit}): H vs the premium at the recorded MAGI ${f.rows[0].magiProxy}`);
  }
  // band, the alternative calculation by hand (82,000; sePlanNet 76,206.8845): step 1 deduction 18,000 (the full premium),
  // MAGI 58,206.8845; steps 2-3 deduction Dh = the premium after the credit at that MAGI; step 4: MAGI 76,206.8845 - Dh
  // (over the 400% line), premium 18,000. (Task 5 asserted decision 8b here: H = D = 5,797.41 at MAGI 70,409, a
  // subsidized premium above the 400% line.) The year holds Dh and pays 18,000. B5 (decision 5): its return claims the better
  // legal deduction: the search's left end lo (the largest D whose MAGI stays over the 400% line, so the premium is still
  // 18,000 and D is legal) saves tax at the same premium, so D is lo, not Dh, and the recorded MAGI is sePlanNet - lo.
  {
    f = await run({ ...FP, incomeA: 82000 });
    const sp = f.trace[0].profile.sePlanNetA;
    near(sp, 76206.8845, 1e-6, 'band: sePlanNet');
    const m1 = sp - 18000, Dh = await aca(m1, 1, 18000, 0);
    const st = f.trace[0].seSettle;
    D = f.trace[0].profile.seHealthA; M = f.rows[0].magiProxy; H = f.rows[0].healthcare;
    near(st.d502A, Dh, 1e-6, 'band: 5.02 = the premium after the credit at the step-1 MAGI');
    assert.strictEqual(st.partsA, 'lo', 'band: the return claims lo');
    assert.strictEqual(D, st.loA, 'band: D = lo');
    assert.strictEqual(D, f.rows[0].seDeductionA, 'band: the row carries the settled deduction');
    assert(D > Dh, `band: lo ${D} above 5.02's ${Dh}`);
    near(M, sp - D, 1e-6, 'band: MAGI = sePlanNet - D');
    assert(M > 4 * 15650, `band: the settled MAGI ${M} is over the 400% line`);
    assert.strictEqual(H, 18000, 'band: premium 18,000 paid (the held MAGI is over the 400% line)');
    assert.strictEqual(f.rows[0].healthcareSettled, 18000, "band: the return's premium 18,000");
    console.log(`  band: step-1 MAGI ${m1.toFixed(4)} 5.02 ${Dh.toFixed(4)} D ${D.toFixed(4)} M ${M.toFixed(4)} H ${H.toFixed(2)}`);
  }
  // joint band: married, both 50, A self-employed, B retired with no pay; 400% line 84,600 (2 persons); sePlanNet 98,000.
  {
    const k = 1 - (await page.evaluate(() => window.__test_selfEmploymentTax(100000, 0, 0).half)) / 100000;
    const profit = 98000 / k;
    const JB = { ...ZERO, singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 60, retireAgeB: 50, incomeA: profit, incomeKindA: 'self', incomeB: 0, filingStatus: 'mfj', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, k401PctB: 0, iraPctB: 0, megaBackdoor: false };
    f = await run(JB);
    near(f.trace[0].profile.sePlanNetA, 98000, 1e-6, 'joint band: sePlanNet');
    const want = await aca(f.rows[0].magiProxy, 2, 18000, 0, rowKind(f, 0));
    near(rowPremium(f, 0), want, 2, 'joint band: consistent premium');
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
    const want = await aca(f.rows[0].magiProxy, 1, 18000, 0, rowKind(f, 0));
    near(rowPremium(f, 0), want, 2, 'Medicaid line: consistent premium');
    console.log(`  Medicaid line ${line.toFixed(2)}: profit ${((line + 300) / k).toFixed(4)} D ${f.trace[0].profile.seHealthA.toFixed(2)} M ${f.rows[0].magiProxy.toFixed(2)} H ${f.rows[0].healthcare.toFixed(2)}`);
  }
  // ==== Task 9a (decision 10): the consistent deduction first. A year whose iteration does not converge holds the deduction D
  // that equals the deduction the premium at D's MAGI allows (within $1), when there is one; else the alternative calculation. ====
  // Dfp: bisection on g(D) = min(cap, acaNetCost(sePlanNet - D, n, premium, 0)) - D, decreasing, on [0, min(cap, premium)]
  // (80 halvings); a consistent deduction exists when |g| < 1 at the end.
  const dfp = async (net, n, prem) => {
    let lo = 0, hi = Math.min(net, prem);
    const g = async (d) => Math.min(net, await aca(net - d, n, prem, 0)) - d;
    if ((await g(hi)) >= 0) return { D: hi, ok: true };
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if ((await g(mid)) >= 0) lo = mid;
      else hi = mid;
    }
    return { D: lo, ok: Math.abs(await g(lo)) < 1 };
  };
  // sliver, single: just below the band the iteration zigzags across the 400% line although a consistent deduction exists
  // (70,000: D 5,892.55; 73,000: D 6,145.08; 74,000: the engine charged the full 18,000 against a consistent 6,229).
  for (const profit of [70000, 73000, 74000]) {
    const s0 = await stats();
    f = await run({ ...FP, incomeA: profit });
    const s1 = await stats();
    const sp = f.trace[0].profile.sePlanNetA, c = await dfp(sp, 1, 18000);
    assert(c.ok, `sliver ${profit}: a consistent deduction exists`);
    near(f.trace[0].profile.seHealthA, c.D, 1, `sliver, single (${profit}): D vs the consistent ${c.D.toFixed(2)}`);
    near(rowPremium(f, 0), await aca(f.rows[0].magiProxy, 1, 18000, 0, rowKind(f, 0)), 2, `sliver, single (${profit}): premium at the recorded MAGI`);
    assert(f.rows[0].healthcare < 7000, `sliver, single (${profit}): a subsidized premium (${f.rows[0].healthcare})`);
    assert(s1.seFixed > s0.seFixed && s1.seAlternative === s0.seAlternative, `sliver, single (${profit}): counted as a consistent hold`);
  }
  // the alternative calculation is still the answer where no consistent deduction exists (82,000: counted as alternative)
  {
    const s0 = await stats();
    f = await run({ ...FP, incomeA: 82000 });
    const s1 = await stats();
    assert(!(await dfp(f.trace[0].profile.sePlanNetA, 1, 18000)).ok, '82,000: no consistent deduction');
    assert(s1.seAlternative > s0.seAlternative && s1.seFixed === s0.seFixed, '82,000: counted as the alternative calculation');
  }
  // sliver, joint: the Task 8 joint household with A's profit 99,000 (engine at 5399f23: premium 18,000; consistent D about 8,334)
  const JB9 = { ...ZERO, singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 60, retireAgeB: 50, incomeA: 99000, incomeKindA: 'self', incomeB: 0, filingStatus: 'mfj', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, k401PctB: 0, iraPctB: 0, megaBackdoor: false };
  for (const profit of [99000, 100000]) {
    f = await run({ ...JB9, incomeA: profit });
    const c = await dfp(f.trace[0].profile.sePlanNetA, 2, 18000);
    assert(c.ok, `sliver joint ${profit}: a consistent deduction exists`);
    near(f.trace[0].profile.seHealthA, c.D, 1, `sliver, joint (${profit}): D vs the consistent ${c.D.toFixed(2)}`);
    near(rowPremium(f, 0), await aca(f.rows[0].magiProxy, 2, 18000, 0, rowKind(f, 0)), 2, `sliver, joint (${profit}): premium at the recorded MAGI`);
    assert(f.rows[0].healthcare < 12000, `sliver, joint (${profit}): a subsidized premium (${f.rows[0].healthcare})`);
  }
  // the joint band case of Task 8b (sePlanNet 98,000): is there a consistent answer? (reported)
  {
    const k = 1 - (await page.evaluate(() => window.__test_selfEmploymentTax(100000, 0, 0).half)) / 100000;
    const c = await dfp(98000, 2, 18000);
    console.log(`  joint band (sePlanNet 98,000, profit ${(98000 / k).toFixed(4)}): consistent deduction exists: ${c.ok} (D ${c.D.toFixed(2)})`);
    assert(!c.ok, 'joint band 98,000: no consistent answer, so the 8b expectations stand');
  }
  // sliver, two returns: unmarried couple, both 50, A self-employed, B retired with no pay, no children, premium 18,000 so A's
  // part is 9,000 on a one-person line (B's 9,000 is the full premium: Texas, MAGI 0). Scanned at 5399f23 in 500 steps: A's
  // profits 67,500-74,000 switched with a consistent answer (engine D 5,768 at 72,000, consistent 6,061).
  {
    const TR = { ...ZERO, singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 60, retireAgeB: 50, incomeA: 0, incomeKindA: 'self', incomeB: 0, filingStatus: 'single', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, k401PctB: 0, iraPctB: 0, megaBackdoor: false, children: [] };
    for (const profit of [70000, 72000, 74000]) {
      const s0 = await stats();
      f = await run({ ...TR, incomeA: profit });
      const s1 = await stats();
      const p = f.trace[0].profile, c = await dfp(p.sePlanNetA, 1, 9000);
      assert(c.ok, `sliver two returns ${profit}: a consistent deduction exists`);
      near(p.seHealthA, c.D, 1, `sliver, two returns (${profit}): A's D vs the consistent ${c.D.toFixed(2)}`);
      near(p.seHealthA, await aca(f.rows[0].magiA, 1, 9000, 0), 1, `sliver, two returns (${profit}): A's part priced on magiA`);
      assert.strictEqual(p.seHealthB, 0, `sliver, two returns (${profit}): none for B`);
      assert(s1.seFixed > s0.seFixed, `sliver, two returns (${profit}): counted as a consistent hold`);
    }
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
  // ==== Task 10a/11a (decisions 11, 12): nothing is held at a $0 deduction; the counters count the kept phase; a hold is not
  // re-checked (the invariant grid). SE_CASE=<name> runs one case alone (used to record the red runs). ====
  const want = (n) => !process.env.SE_CASE || process.env.SE_CASE === n;
  const held = (s0, s1) => s1.seFixed + s1.seAlternative - s0.seFixed - s0.seAlternative;
  // S: the search at a row's final draws (decision 10 else 9): the consistent deduction if |g| < 1 there, else section 5.02 at those
  // draws. base = the row's MAGI with the deduction added back; cap = the plan net; the premium is the gross premium of the year.
  const dfpAt = async (base, cap, n, prem, y) => {
    let lo = 0, hi = Math.min(cap, prem);
    const g = async (d) => Math.min(cap, await aca(base - d, n, prem, y)) - d;
    if ((await g(hi)) >= 0) return { D: hi, ok: true };
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if ((await g(mid)) >= 0) lo = mid;
      else hi = mid;
    }
    return { D: lo, ok: Math.abs(await g(lo)) < 1 };
  };
  const searchAt = async (row, prof, y, prem, n) => {
    const base = row.magiProxy + prof.seHealthA, cap = prof.sePlanNetA;
    const c = await dfpAt(base, cap, n, prem, y);
    return c.ok ? c.D : Math.min(cap, await aca(base - Math.min(cap, prem), n, prem, y));
  };
  const NOHOUSE = { tenure: 'rent', rent: 0 };
  const selfStream = (amount, startAge, endAge) => ({ amount, startAge, endAge, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 0, healthPremium: 0 });
  const runS = (patch) =>
    page.evaluate((p) => {
      window.__test_replaceState(p);
      const s0 = { ...window.__test_magiStats };
      const trace = window.__test_accountTrace();
      const rows = window.__test_simulate().rows;
      return JSON.parse(JSON.stringify({ s0, s1: { ...window.__test_magiStats }, profiles: trace.map((t) => t.profile), rows }));
    }, patch);
  // invariant grid (decision 12; B5 spec section 8): single, 60, retiring at 60, one self stream owned by A (20,000-60,000 by
  // 2,000), spending 20,000-40,000 by 2,000, $500,000 taxable at 30% and 60% basis, Texas, premium 18,000, no inflation, no
  // housing, years 0-4. A held year is settled at its final draws (the row's seDeductionA, healthcareSettled, taxSettled and
  // seSettlement); a converged year keeps its paid figures. In every year with a plan net:
  // (a) the year's deduction (the settled one in a settled year) never exceeds its premium (the return's) + $1 or the plan net;
  // (b) the premium is the one the recorded MAGI allows (a settled year: at the return's price, the kind it paid for);
  // (c) a settled year's deduction is the search at its final draws at the return's price (base = the recorded MAGI plus the
  //     settled pair): within $1 of the consistent deduction where one exists, else within $1 of section 5.02's or the left end
  //     lo (the better of the two by tax plus premium is (c2));
  // (c2) the settled return's tax plus premium is no higher than any candidate's (the trace's sums);
  // (d) seSettlement is (healthcare - healthcareSettled) + (tax - taxSettled), the same doubles;
  // (e) the next row's seSettlementIn is that amount.
  if (want('invariant grid')) {
    const IG = { ...ZERO, singlePerson: true, ageA: 60, retireAgeA: 60, incomeA: 0, incomeKindA: 'wages', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, ssMonthlyA: 0, ...NOHOUSE };
    const grid = await page.evaluate(
      (IG) => {
        const stream = (amount) => ({ amount, startAge: 60, endAge: 70, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 0, healthPremium: 0 });
        const acaNet = window.__test_tax.acaNetCost;
        // the search at a settled row's final draws at the return's price (kind): the consistent deduction (bisection), else
        // section 5.02's and the left end lo; null at a step-1 deduction of 0
        const searchAt = (row, prof, y, kind) => {
          const base = row.magiProxy + row.seDeductionA + row.seDeductionB, cap = prof.sePlanNetA, prem = 18000;
          const d1 = Math.min(cap, acaNet(1e12, 1, prem, y, kind));
          if (!(d1 > 0)) return null;
          const g = (d) => Math.min(cap, acaNet(base - d, 1, prem, y, kind)) - d;
          let lo = 0, hi = d1;
          if (g(hi) >= 0) return { cons: hi };
          for (let i = 0; i < 80; i++) {
            const mid = (lo + hi) / 2;
            if (g(mid) >= 0) lo = mid;
            else hi = mid;
          }
          if (Math.abs(g(lo)) < 1) return { cons: lo };
          return { cons: null, d502: Math.min(cap, acaNet(base - d1, 1, prem, y, kind)), lo };
        };
        const out = { years: 0, settled: 0, overPremium: [], overNet: [], badPremium: [], understated: [], notBest: [], identity: [], nextIn: [], worstOver: 0, worstPremium: 0, gap: 0, parts: {}, rows: [] };
        for (const basisRatio of [30, 60])
          for (let spending = 20000; spending <= 40000; spending += 2000)
            for (let amt = 20000; amt <= 60000; amt += 2000) {
              window.__test_replaceState({ ...IG, taxable: 500000, spending, basisRatio, incomeSources: [stream(amt)] });
              const trace = window.__test_accountTrace();
              const rows = window.__test_simulate().rows;
              for (let y = 0; y < 5 && y < rows.length; y++) {
                const p = trace[y].profile, row = rows[y], st = trace[y].seSettle;
                if (!(p.sePlanNetA > 0)) continue;
                out.years++;
                const settled = row.healthcareSettled !== undefined;
                const D = settled ? row.seDeductionA : p.seHealthA, H = settled ? row.healthcareSettled : row.healthcare, kind = settled ? st.kindA : 0;
                const tag = `basis ${basisRatio} spending ${spending} stream ${amt} year ${y}`;
                out.rows.push([basisRatio, spending, amt, y, D, p.sePlanNetA, H, row.magiProxy, settled ? 1 : 0]);
                // (a)
                if (D > H + 1) {
                  out.overPremium.push(`${tag}: D ${D.toFixed(2)} premium ${H.toFixed(2)}`);
                  out.worstOver = Math.max(out.worstOver, D - H);
                }
                if (D > p.sePlanNetA + 1e-6) out.overNet.push(`${tag}: D ${D} net ${p.sePlanNetA}`);
                // (b)
                const dp = Math.abs(H - acaNet(row.magiProxy, 1, 18000, y, kind));
                if (dp > 2) {
                  out.badPremium.push(`${tag}: premium ${H.toFixed(2)} vs ${acaNet(row.magiProxy, 1, 18000, y, kind).toFixed(2)}`);
                  out.worstPremium = Math.max(out.worstPremium, dp);
                }
                if (!settled) continue;
                out.settled++;
                out.parts[st.partsA] = (out.parts[st.partsA] || 0) + 1;
                if (p.seHealthA !== D) out.identity.push(`${tag}: the profile's deduction ${p.seHealthA} is not the settled ${D}`);
                // (c)
                const s = searchAt(row, p, y, kind);
                const miss = s === null ? (D !== 0 ? D : 0) : s.cons !== null ? Math.abs(D - s.cons) : Math.min(Math.abs(D - s.d502), Math.abs(D - s.lo));
                if (miss > 1) {
                  out.understated.push(`${tag}: D ${D.toFixed(2)} vs the search ${JSON.stringify(s)}`);
                  out.gap = Math.max(out.gap, miss);
                }
                // (c2)
                const chosen = row.healthcareSettled + row.taxSettled;
                for (const v of st.sums) if (chosen > v) out.notBest.push(`${tag}: chosen ${chosen} above a candidate's ${v}`);
                // (d)
                if (row.seSettlement !== (row.healthcare - row.healthcareSettled) + (row.tax - row.taxSettled)) out.identity.push(`${tag}: seSettlement ${row.seSettlement}`);
                // (e)
                if (y + 1 < rows.length) {
                  const want = row.seSettlement !== 0 ? row.seSettlement : undefined;
                  if (rows[y + 1].seSettlementIn !== want) out.nextIn.push(`${tag}: next year's seSettlementIn ${rows[y + 1].seSettlementIn} vs ${want}`);
                }
              }
            }
        return out;
      },
      IG
    );
    console.log(`  invariant grid: ${grid.years} years checked, ${grid.settled} settled (${JSON.stringify(grid.parts)}); deduction above the premium: ${grid.overPremium.length} (worst ${grid.worstOver.toFixed(2)}); above the plan net: ${grid.overNet.length}; premium off the recorded MAGI by more than $2: ${grid.badPremium.length} (worst ${grid.worstPremium.toFixed(2)}); understated against the search at the final draws: ${grid.understated.length} (largest gap ${grid.gap.toFixed(2)}); not the best candidate: ${grid.notBest.length}; identity: ${grid.identity.length}; next year: ${grid.nextIn.length}`);
    if (process.env.SE_GRID_OUT) require('fs').writeFileSync(process.env.SE_GRID_OUT, JSON.stringify(grid.rows));
    for (const m of [...grid.overPremium, ...grid.understated, ...grid.notBest, ...grid.identity, ...grid.nextIn].slice(0, 5)) console.log('    ' + m);
    assert(grid.settled > 0, 'invariant grid: some years settle');
    assert.strictEqual(grid.overPremium.length, 0, 'invariant grid (a): the deduction never exceeds the premium (' + grid.overPremium[0] + ')');
    assert.strictEqual(grid.overNet.length, 0, 'invariant grid (a): the deduction never exceeds the plan net (' + grid.overNet[0] + ')');
    assert.strictEqual(grid.badPremium.length, 0, 'invariant grid (b): the premium is the one the recorded MAGI allows (' + grid.badPremium[0] + ')');
    assert.strictEqual(grid.understated.length, 0, 'invariant grid (c): the settled deduction is the search at the final draws (' + grid.understated[0] + ')');
    assert.strictEqual(grid.notBest.length, 0, 'invariant grid (c2): the settled return is the best candidate (' + grid.notBest[0] + ')');
    assert.strictEqual(grid.identity.length, 0, 'invariant grid (d): the settlement identity (' + grid.identity[0] + ')');
    assert.strictEqual(grid.nextIn.length, 0, "invariant grid (e): the next year's seSettlementIn (" + grid.nextIn[0] + ')');
  }
  // no hold at a $0 deduction: R side business stream (the Solo plan takes the whole net, so the step-1 deduction is 0).
  if (want('zero')) {
    const { legacyToAccounts } = require('./legacy_balances');
    const US_R = { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 700000, traditional: 900000, roth: 200000, cash: 60000, spending: 90000, stateTax: 'tx' };
    const stream = { amount: 40000, startAge: 52, endAge: 60, followGrowth: true, growth: 3, owner: 'A', kind: 'self', contribute: true, deferralType: 'traditional', deferralPct: 100, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 25, healthPremium: 0 };
    const x = await runS({ ...legacyToAccounts({ ...US_R, acaEnabled: true }, { singlePerson: false }), incomeSources: [stream] });
    assert.strictEqual(held(x.s0, x.s1), 0, 'no hold at a $0 deduction: nothing counted');
    // the rows pinned at 9b47b3a (sha256 of JSON.stringify(rows)): the $0 hold changed no number.
    const hash = require('crypto').createHash('sha256').update(JSON.stringify(x.rows)).digest('hex');
    assert.strictEqual(hash, '4f0cfe41da0fca0a2e6954151b77cb16c20af76af1c20d44676bec2c48d33940', 'no hold at a $0 deduction: rows identical to 9b47b3a');
  }
  // a held joint year, both self-employed, A's cap binding: the total is split A first (A = min(total, capA), B the rest).
  if (want('joint')) {
    const k = 1 - (await page.evaluate(() => window.__test_selfEmploymentTax(100000, 0, 0).half)) / 100000;
    const JS = { ...ZERO, singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 60, retireAgeB: 60, incomeA: 3000 / k, incomeKindA: 'self', incomeB: 90000, incomeKindB: 'self', filingStatus: 'mfj', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, k401PctB: 0, catchupPctB: 0, profitSharingPctB: 0, iraPctB: 0, megaBackdoor: false, ...NOHOUSE };
    const x = await runS(JS);
    const p = x.profiles[0];
    assert(held(x.s0, x.s1) > 0, 'joint split: year 0 holds a deduction');
    near(p.sePlanNetA, 3000, 1e-6, 'joint split: A\'s cap');
    const total = p.seHealthA + p.seHealthB;
    const c = await dfp(p.sePlanNetA + p.sePlanNetB, 2, 18000);
    assert(c.ok, 'joint split: a consistent total exists');
    near(total, c.D, 1, `joint split: the total ${total.toFixed(2)} vs the consistent ${c.D.toFixed(2)}`);
    assert.strictEqual(p.seHealthA, Math.min(total, p.sePlanNetA), 'joint split: A first, up to A\'s cap');
    near(p.seHealthB, total - p.seHealthA, 1e-9, 'joint split: B the rest');
    assert(p.seHealthB > 0, 'joint split: B gets a share');
    console.log(`  joint split: A ${p.seHealthA} B ${p.seHealthB.toFixed(2)} total ${total.toFixed(2)}`);
  }
  // B5 (spec 3, 8; decision 3): byte-identity against the base build (d8e3cee, before the settlement). SE_BASE_DIST=<base>/dist
  // runs these households on that build and prints the hashes and the base row (recorded below). E1c households with no held
  // year: their rows are unchanged. A held household with no phases: the years before its first held year are unchanged, and
  // the held year keeps its draws, its paid premium and its paid tax (only the MAGI fields, the appeal fields and the new fields
  // differ).
  if (want('base identity')) {
    const crypto = require('crypto');
    let idPage = page;
    if (process.env.SE_BASE_DIST) {
      idPage = await (await browser.newContext()).newPage();
      await idPage.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
      await idPage.goto('file://' + path.resolve(process.env.SE_BASE_DIST, 'Planner_US.html'));
      await idPage.waitForTimeout(300);
    }
    const rowsOf = (p) => idPage.evaluate((p) => { window.__test_replaceState(p); return JSON.parse(JSON.stringify(window.__test_simulate().rows)); }, p);
    const hashOf = (rows) => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    const NP = { cliffGuardEnabled: false };
    const solo = { ...selfStream(4000, 60, 70), contribute: true, deferralPct: 100, profitSharingPct: 25 };
    const IGB = { ...ZERO, singlePerson: true, ageA: 60, retireAgeA: 60, incomeA: 0, incomeKindA: 'wages', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, ssMonthlyA: 0, ...NOHOUSE, ...NP };
    const households = {
      // the fixed-point single (Task 5), converged in every year
      single: { ...FP, ...NP },
      // two returns under 65 with a child (A self-employed), converged
      twoReturns: { ...ZERO, singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 60, retireAgeB: 50, incomeA: 40000, incomeKindA: 'self', incomeB: 0, filingStatus: 'single', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, k401PctA: 0, catchupPctA: 0, iraPctA: 0, children: [{ birthYear: 2018, student: false }], ...NP },
      // forced unheld years near the 100% line (Texas): the Solo plan takes the whole net (a step-1 deduction of 0, never held)
      forcedUnheld: { ...IGB, tradIraA: 600000, spending: 15000, incomeSources: [solo] },
    };
    const want_ = {
      single: '51c54474cc09dd99678c523a66686e971f414a33e6cad109bf3bff9ea0dbad7f',
      twoReturns: '084c962ae81cbe98859c4f659d9ada69b346e8054841b37944afa6c35291ff18',
      forcedUnheld: '315fd36782d8c1d624240e2d2ca2a00307e81817291946b174e9c7c943e34f4e',
    };
    for (const [name, p] of Object.entries(households)) {
      const rows = await rowsOf(p);
      assert(rows.every((r) => !('seSettlement' in r)), `base identity ${name}: no settled year`);
      const h = hashOf(rows);
      console.log(`  base identity ${name}: ${h}`);
      if (!process.env.SE_BASE_DIST) assert.strictEqual(h, want_[name], `base identity ${name}: rows identical to d8e3cee`);
    }
    // B5 (spec 6.7): a phased E1c household with no held phase: a choose run (the cliff plan on) with candidates in years 0-4 is
    // judged as before; its plan trace and its rows identical to d8e3cee.
    {
      const PH = { ...IGB, cliffGuardEnabled: true, tradIraA: 900000, basisRatio: 100, spending: 50000, incomeSources: [selfStream(10000, 55, 75)] };
      const r = await idPage.evaluate((p) => {
        window.__test_replaceState(p);
        const x = window.__test_runPlanMode({ planMode: 'choose', planTrace: true });
        return JSON.parse(JSON.stringify({ rows: x.rows, trace: x.trace }));
      }, PH);
      // 4a added the trace-only key `lambda` (planTr.lambda); the identity claim is about the keys d8e3cee recorded
      for (const t of r.trace) delete t.lambda;
      assert(r.rows.every((x) => !('seSettlement' in x)), 'base identity phased: no settled year');
      assert(r.trace.filter((t) => t.candidates && t.candidates.length > 1).length >= 5, 'base identity phased: candidates in years 0-4');
      const h = hashOf(r);
      console.log(`  base identity phased: ${h}`);
      if (!process.env.SE_BASE_DIST) assert.strictEqual(h, '8143d866afc1e6eee53899fcfde2c944c7fb6795699770d0f2642417e158e0d1', 'base identity phased: plan trace and rows identical to d8e3cee');
    }
    // a held household: tests/irmaa_appeal.js's case 15 variant (single, 66, wages 200,000 to 68, then a self stream of 128,700;
    // no ACA, IRMAA appeal years 2 and 3 hold section 5.02's deduction): first held year 2
    const HELD = {
      stateTax: 'tx', acaEnabled: false, inflation: 0, medicalInflation: 0, hysaRate: 0, dividendYield: 0, returnRate: 0, bondReturn: 0, bondYears: 0, ...ZERO,
      cashReserve: 0, tenure: 'rent', rent: 0, rentGrowth: 0, maintenance: 0, incomeB: 0, spending: 120000, medicareYearly: 10000, ltcEnabled: false,
      guardrailsEnabled: false, survivorEnabled: false, rothConvEnabled: false, irmaaPriorKnown: false, children: [], loans: [], oneTimeIncome: [],
      extraExpenses: [], lumpExpenses: [], spendingTiers: [], pensionYearlyA: 0, pensionYearlyB: 0, ssMonthlyA: 0, ssMonthlyB: 0, incomeGrowth: 0,
      k401PctA: 0, k401PctB: 0, catchupPctA: 0, catchupPctB: 0, iraPctA: 0, iraPctB: 0, profitSharingPctA: 0, profitSharingPctB: 0, megaBackdoor: false,
      singlePerson: true, ageA: 66, lifeExpectancyA: 80, incomeA: 200000, incomeKindA: 'wages', retireAgeA: 68, ...NP,
      incomeSources: [{ amount: 128700, startAge: 60, endAge: 80, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, profitSharingPct: 0 }],
    };
    const Y = 2;
    const rows = await rowsOf(HELD);
    const before = hashOf(rows.slice(0, Y));
    console.log(`  base identity held: years before ${Y} ${before}; row ${Y} ${JSON.stringify(rows[Y])}`);
    if (!process.env.SE_BASE_DIST) {
      assert.strictEqual(rows.findIndex((r) => 'seSettlement' in r), Y, 'base identity held: the first held year');
      assert.strictEqual(before, '3ab0103a613902a67160eaaf506b2bc26c5d3a0980c306b039001934ade1aa0b', 'base identity held: the years before the held year identical to d8e3cee');
      // the base build's row 2 (d8e3cee)
      const baseRow = {"age":68,"ageB":null,"year":2,"taxable":195220.79964530788,"bonds":0,"traditional":0,"roth":0.0036658801036537625,"cash":0,"homeEquity":0,"loanBalance":0,"investable":195220.80331118798,"total":195220.80331118798,"working":false,"workingA":false,"workingB":false,"conversionAmount":0,"mixCandidate":null,"magiProxy":109607.634575,"expenses":131148.4,"tax":28302.731156312,"income":119607.634575,"wages":128700,"ss":0,"pension":0,"rmd":0,"sepp72":0,"earlyPenalty":0,"traditionalWithdrawn":0,"taxableWithdrawn":30751.1348221921,"rothWithdrawn":-0.0036658801036537625,"housing":0,"healthcare":11148.4,"ltc":0,"loanPayment":0,"extraExpense":0,"lumpExpense":0,"baseSpend":120000,"irmaaAppealYearA":2028,"irmaaAppealKindA":2};
      const moved = new Set(['magiProxy', 'magiA', 'magiB', 'irmaaAppealYearA', 'irmaaAppealYearB', 'irmaaAppealKindA', 'irmaaAppealKindB', 'seDeductionA', 'seDeductionB', 'healthcareSettled', 'taxSettled', 'seSettlement']);
      for (const k of new Set([...Object.keys(rows[Y]), ...Object.keys(baseRow)]))
        if (!moved.has(k)) assert.strictEqual(rows[Y][k], baseRow[k], `base identity held: row ${Y} field ${k}`);
      assert(rows[Y].magiProxy !== baseRow.magiProxy, 'base identity held: the recorded MAGI is the return\'s');
    }
    if (idPage !== page) await idPage.close();
  }
  if (process.env.SE_CASE) {
    await browser.close();
    console.log('se_health: case ' + process.env.SE_CASE + ' passed');
    process.exit(0);
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
  // This is the guard for the `estUsed` line at the convergence test (the one that reads estSeA/estSeB/seRealA/seRealB): with ACA
  // off nothing else asks for a second pass, so without that line the conversion is sized on a zero deduction and is 18,000 low.
  {
    const RC = { ...FP, acaEnabled: false, rothConvEnabled: true, rothConvStartAge: 50, rothConvEndAge: 55, rothConvBracket: 22, tradIraA: 500000 };
    // The cliff plan's bracket search off: both runs convert at the user's 22% fill.
    const searchWas = await page.evaluate(() => window.__test_setBracketSearch(false));
    const c1 = await run(RC), c0 = await run({ ...RC, healthcare: 0 });
    await page.evaluate((on) => window.__test_setBracketSearch(on), searchWas);
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
