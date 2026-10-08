// IRMAA MAGI: Medicare's MAGI is AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4)(A)), so only the TAXABLE part of
// Social Security counts; the ACA's MAGI (26 U.S.C. 36B(d)(2)(B)) counts all of it. The engine's MAGI is the ACA one;
// irmaaMagiOf converts, magiForIrmaaLine inverts. Spec: docs/superpowers/specs/2026-10-07-irmaa-magi-design.md.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  // The engine cases place a child by birth year: pin the clock (plan year 0 is 2026).
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(200);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

  // --- Hand-computed irmaaMagiOf (SS bases: single 25,000 / 34,000 / 4,500; joint 32,000 / 44,000 / 6,000) ---
  const r = await page.evaluate(() => {
    const t = window.__test_tax;
    return {
      // Single, benefit 30,000, no other income: provisional 15,000 <= 25,000, nothing taxable. MAGI 30,000 -> 0.
      lowSingle: t.irmaaMagiOf(30000, 30000, 'single'),
      // Single, benefit 20,000, other 20,000: provisional 30,000; 50% band: min(10,000, 2,500) = 2,500 -> 22,500.
      band50: t.irmaaMagiOf(40000, 20000, 'single'),
      // Single, benefit 40,000, pension 72,000 (MAGI 112,000): provisional 92,000; 85% band hits the cap 34,000 -> 106,000.
      capSingle: t.irmaaMagiOf(112000, 40000, 'single'),
      // Joint, benefit 70,000, other 200,000 (MAGI 270,000): cap 59,500 -> 259,500.
      capJoint: t.irmaaMagiOf(270000, 70000, 'mfj'),
      // Joint, benefit 30,000, other 40,000: provisional 55,000 > 44,000: 0.85 x 11,000 + min(6,000, 15,000) = 15,350
      // (under the cap 25,500) -> 55,350.
      band85: t.irmaaMagiOf(70000, 30000, 'mfj'),
      // Head of household and qualifying surviving spouse read the single bases (FILING 'ss' family): as single.
      hoh: t.irmaaMagiOf(40000, 20000, 'hoh'),
      qss: t.irmaaMagiOf(40000, 20000, 'qss'),
      noBenefit: t.irmaaMagiOf(123456.78, 0, 'mfj'),
      statusKid: t.returnStatusA([{ age: 10, qualifyingChild: true }]),
      statusNone: t.returnStatusA(undefined),
      ssJoint: t.irmaaSsOf({ singlePerson: false, ssA: 1, ssB: 2 }),
      ssOne: t.irmaaSsOf({ singlePerson: true, ssA: 5, ssB: 7 }),
    };
  });
  assert.strictEqual(r.lowSingle, 0, 'nothing taxable below the base');
  near(r.band50, 22500, 1e-9, '50% band');
  near(r.capSingle, 106000, 1e-9, '85% cap, single');
  near(r.capJoint, 259500, 1e-9, '85% cap, joint');
  near(r.band85, 55350, 1e-9, '85% band under the cap');
  near(r.hoh, 22500, 1e-9, 'hoh reads the single SS bases');
  near(r.qss, 22500, 1e-9, 'qss reads the single SS bases');
  assert.strictEqual(r.noBenefit, 123456.78, 'no benefit: the MAGI itself, bit for bit');
  assert.strictEqual(r.statusKid, 'hoh');
  assert.strictEqual(r.statusNone, 'single');
  assert.strictEqual(r.ssJoint, 3);
  assert.strictEqual(r.ssOne, 5);

  // --- The inverse: round trip and monotonicity over a grid (Review Focus 5: the exclusive top bound) ---
  const inv = await page.evaluate(() => {
    const t = window.__test_tax, bad = [];
    for (const filing of ['mfj', 'single', 'hoh', 'qss'])
      for (const ss of [0, 5000, 18000, 40000, 90000]) {
        let prev = -Infinity;
        const lines = [];
        for (let L = 0; L <= 800000; L += 7919) lines.push(L);
        lines.push(109000, 218000, 499999.99, 749999.99);
        lines.sort((a, b) => a - b);
        for (const L of lines) {
          const m = t.magiForIrmaaLine(L, ss, filing);
          if (Math.abs(t.irmaaMagiOf(m, ss, filing) - L) > 1e-6) bad.push({ filing, ss, L, m, back: t.irmaaMagiOf(m, ss, filing) });
          if (m < prev) bad.push({ filing, ss, L, m, prev, why: 'not monotone' });
          if (m < L - 1e-9 || m > L + ss + 1e-9) bad.push({ filing, ss, L, m, why: 'outside [L, L + ss]' });
          prev = m;
        }
      }
    return { bad: bad.slice(0, 5), inf: t.magiForIrmaaLine(Infinity, 40000, 'mfj'), zero: t.magiForIrmaaLine(150000, 0, 'single') };
  });
  assert.deepStrictEqual(inv.bad, [], 'round trip / monotone / bounds');
  assert.strictEqual(inv.inf, Infinity, 'Infinity passes through');
  assert.strictEqual(inv.zero, 150000, 'no benefit: the line itself');

  // --- Engine cases (Task 2): the charge, the lines, the conversion cap read Medicare's MAGI ---
  // Runs simulate() under a state patch (over a quiet base: Texas, no inflation, no investment income, no
  // investments unless the case sets them) and restores the state afterwards.
  const QUIET = {
    stateTax: 'tx', acaEnabled: false, inflation: 0, medicalInflation: 0, hysaRate: 0, dividendYield: 0, returnRate: 0, bondReturn: 0,
    bondYears: 0, taxable: 0, cash: 0, cashReserve: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0,
    roth401kA: 0, roth401kB: 0, tenure: 'rent', rent: 0, rentGrowth: 0, maintenance: 0, incomeA: 0, incomeB: 0, spending: 20000,
    medicareYearly: 10000, ltcEnabled: false, guardrailsEnabled: false, survivorEnabled: false, rothConvEnabled: false, irmaaPriorKnown: false,
    children: [], loans: [], incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
    pensionYearlyA: 0, pensionYearlyB: 0, ssMonthlyA: 0, ssMonthlyB: 0,
  };
  const sim = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        return JSON.parse(JSON.stringify(window.__test_simulate().rows));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...QUIET, ...patch });
  const SURCHARGE1 = 95.7 * 12;
  const drawn = (r) => r.traditionalWithdrawn + r.taxableWithdrawn + r.rothWithdrawn;
  const sameHealthcare = (a, b, from, msg) => {
    assert(a.length > from && a.length === b.length, `${msg}: row counts ${a.length} / ${b.length}`);
    for (let i = from; i < a.length; i++) near(a[i].healthcare, b[i].healthcare, 1e-6, `${msg}, year ${i}`);
  };

  // (a) The charge. Single, 70, retired; pension 72,000 and Social Security 40,000 (3,333.34 a month: 40,000.08).
  // Engine (ACA) MAGI 112,000.08; IRMAA MAGI = 72,000 + min(0.85 x 40,000.08, 0.85 x (92,000.04 - 34,000) + 4,500) =
  // 72,000 + 34,000.07 = 106,000.07 <= 109,000: no surcharge in any year (the stand-in for years 0 and 1 is year 0's
  // IRMAA MAGI). Compared with the same household on 1,000 a month (MAGI 84,000, far under the tier).
  const single70 = { singlePerson: true, ageA: 70, retireAgeA: 65, lifeExpectancyA: 75, pensionCoverage: 'a', pensionYearlyA: 72000, pensionStartAgeA: 65, ssStartAgeA: 67 };
  const aHigh = await sim({ ...single70, ssMonthlyA: 3333.34 }),
    aLow = await sim({ ...single70, ssMonthlyA: 1000 });
  near(aHigh[0].magiProxy, 112000.08, 1e-6, '(a) the engine MAGI stays the ACA one');
  assert.strictEqual(aHigh.some((r) => drawn(r) > 0), false, '(a) no withdrawals');
  near(aHigh[0].healthcare, 10000, 1e-6, '(a) year 0: Medicare only, no surcharge');
  sameHealthcare(aHigh, aLow, 0, '(a) no surcharge on IRMAA MAGI 106,000');

  // (e) The stand-in (Review Focus 3): with the user's own entries, year 0 reads 115,000 (> 109,000: first tier) and
  // year 1 reads 100,000 (none); from year 2 the projection's own IRMAA MAGI (106,000.07: none).
  const eKnown = await sim({ ...single70, ssMonthlyA: 3333.34, irmaaPriorKnown: true, irmaaMagiPrior2: 115000, irmaaMagiPrior1: 100000 });
  near(eKnown[0].healthcare, aLow[0].healthcare + SURCHARGE1, 1e-6, '(e) year 0 pays the entered tier');
  near(eKnown[1].healthcare, aLow[1].healthcare, 1e-6, '(e) year 1 pays none');
  sameHealthcare(eKnown, aLow, 1, '(e) from year 1');

  // (b) Two returns, A head of household (Review Focus 2): an unmarried couple, both 70, a child aged 15 at the start
  // (a qualifying child through the plan's last year, 73). Each: pension 72,000 + Social Security 40,000.08. A's return
  // is hoh, which reads the single Social Security bases, so both IRMAA MAGIs are 106,000.07, under the single first tier.
  const couple70 = {
    singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 70, ageB: 70, retireAgeA: 65, retireAgeB: 65,
    lifeExpectancyA: 73, lifeExpectancyB: 73, pensionCoverage: 'both', pensionYearlyA: 72000, pensionYearlyB: 72000,
    pensionStartAgeA: 65, pensionStartAgeB: 65, ssStartAgeA: 67, ssStartAgeB: 67, children: [{ birthYear: 2011, student: false }],
  };
  const bHigh = await sim({ ...couple70, ssMonthlyA: 3333.34, ssMonthlyB: 3333.34 }),
    bLow = await sim({ ...couple70, ssMonthlyA: 1000, ssMonthlyB: 1000 });
  near(bHigh[0].magiA, 112000.08, 1e-6, '(b) A keeps the ACA per-return MAGI');
  near(bHigh[0].healthcare, 10000, 1e-6, '(b) year 0: Medicare only (the household figure, half each), no surcharge');
  sameHealthcare(bHigh, bLow, 0, '(b) neither partner pays a surcharge');

  // (d) Survivor (Review Focus 1): a married couple, both 68, retired; A dies at 71 (year 3: joint that year, single after).
  // B's pension 72,000; both benefits 40,000.08, the survivor keeps 40,000.08. Year 3 (joint, MAGI 112,000.08): IRMAA MAGI
  // 72,000 + min(34,000.07, 0.85 x (92,000.04 - 44,000) + 6,000 = 46,833.73) = 106,000.07; years 4 on (single): the same
  // 106,000.07. Both under 109,000, so from year 5 (lookback year 3) on the survivor pays no surcharge, as with 1,000 a month.
  const survivor = {
    singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 68, ageB: 68, retireAgeA: 65, retireAgeB: 65,
    lifeExpectancyA: 80, lifeExpectancyB: 80, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 71, survivorSpendingPct: 75,
    pensionCoverage: 'b', pensionYearlyB: 72000, pensionStartAgeB: 65, ssStartAgeA: 67, ssStartAgeB: 67,
  };
  const dHigh = await sim({ ...survivor, ssMonthlyA: 3333.34, ssMonthlyB: 3333.34 }),
    dLow = await sim({ ...survivor, ssMonthlyA: 1000, ssMonthlyB: 1000 });
  near(dHigh[4].magiProxy, 112000.08, 1e-6, '(d) the survivor year keeps the ACA MAGI');
  near(dHigh[6].healthcare, 5000, 1e-6, '(d) survivor: half the Medicare figure, no surcharge');
  sameHealthcare(dHigh, dLow, 5, '(d) the survivor pays no surcharge');

  // (c) Lines (Review Focus 4): a single 66-year-old with a 40,000 benefit. The first tier, 109,000 of IRMAA MAGI, is at
  // x + 34,000 = 109,000 (the 85% cap binds: provisional 95,000), x = 75,000: engine MAGI 115,000. Ids and families unchanged.
  const lines = await page.evaluate(() => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, { inflation: 0, children: [], acaEnhanced: false, acaEnabled: false });
    const ctx = (ssA) => ({
      year: 0, filing: 'single', twoReturns: false, profile: { ownerShareA: 1, singlePerson: true, ssA, dependents: [] }, preMagi: 0, preMagiA: 0,
      preMagiB: 0, acaEligibleA: false, acaEligibleB: false, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false,
      workingA: false, workingB: false, age: 66, ageB: null, irmaa: { filing: 'single', a: true, b: false }, irmaaGrowth: 1,
    });
    try {
      return {
        withSs: window.__test_solver.magiThresholds(ctx(40000)).find((l) => l.id === 'irmaa1'),
        noSs: window.__test_solver.magiThresholds(ctx(0)).find((l) => l.id === 'irmaa1'),
        inverse: window.__test_tax.magiForIrmaaLine(109000, 40000, 'single'),
      };
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  });
  near(lines.inverse, 115000, 1e-6, '(c) the inverse by hand');
  near(lines.withSs.magi, lines.inverse, 1e-9, '(c) the irmaa1 line is the translated edge');
  assert.deepStrictEqual([lines.withSs.id, lines.withSs.family, lines.withSs.ret], ['irmaa1', 'irmaa', 'H'], '(c) id, family, ret unchanged');
  assert.strictEqual(lines.noSs.magi, 109000, '(c) no benefit: the edge itself');

  // (f) Conversion ceiling: single, 66, retired; traditional 1,000,000, pension 50,000, Social Security 40,000.08,
  // converting to the top of the 32% bracket (so the IRMAA cap binds). At the cap, IRMAA MAGI = 50,000 + C + 34,000.07 =
  // 109,000: C = 24,999.93 (engine MAGI 115,000.01). Before the fix the engine MAGI stopped at 109,000 (C = 18,999.92).
  const conv = { singlePerson: true, ageA: 66, retireAgeA: 60, lifeExpectancyA: 71, tradIraA: 1000000, pensionCoverage: 'a', pensionYearlyA: 50000, pensionStartAgeA: 60, ssStartAgeA: 62, rothConvEnabled: true, rothConvStartAge: 66, rothConvEndAge: 70, rothConvBracket: 32, spending: 60000 };
  const fRows = await sim({ ...conv, ssMonthlyA: 3333.34 });
  const fIrmaa = await page.evaluate((m) => window.__test_tax.irmaaMagiOf(m, 40000.08, 'single'), fRows[0].magiProxy);
  assert.strictEqual(drawn(fRows[0]) > 0, false, '(f) no withdrawal in year 0');
  assert(fIrmaa <= 109000 + 1e-6 && fIrmaa >= 109000 - 1, `(f) IRMAA MAGI at the first tier: ${fIrmaa}`);
  near(fRows[0].conversionAmount, 24999.93, 1, '(f) the conversion rises by the untaxed benefit');

  // (g) No benefit, no change: the same plan with no Social Security converts to an engine MAGI of 109,000 (C = 59,000).
  // Spending 20,000 here: at 60,000 the pension alone no longer covers the year, the draw enters the MAGI iteration and the
  // year ends within its tolerance of the edge (108,980.49, the same at CLIFF_TIP), not on it.
  const gRows = await sim({ ...conv, ssMonthlyA: 0, spending: 20000 });
  assert.strictEqual(drawn(gRows[0]), 0, '(g) no withdrawal in year 0');
  near(gRows[0].magiProxy, 109000, 1e-6, '(g) no benefit: the tier edge itself');
  near(gRows[0].conversionAmount, 59000, 1e-6, '(g) the conversion fills to the edge');

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('irmaa_magi: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
