// Inherited traditional and Roth IRA / 401(k) accounts (E1e, US). Spec: docs/superpowers/specs/2026-10-09-e1e-inherited-accounts-design.md.
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

  // ---- Task 1: the Single Life Table ----
  // Treas. Reg. 1.401(a)(9)-9(b), Single Life Table (distribution calendar years from 2022), ages 0..120.
  const SLT = [84.6, 83.7, 82.8, 81.8, 80.8, 79.8, 78.8, 77.9, 76.9, 75.9, 74.9, 73.9, 72.9, 71.9, 70.9, 69.9, 69.0, 68.0,
    67.0, 66.0, 65.0, 64.1, 63.1, 62.1, 61.1, 60.2, 59.2, 58.2, 57.3, 56.3, 55.3, 54.4, 53.4, 52.5, 51.5, 50.5, 49.6, 48.6,
    47.7, 46.7, 45.7, 44.8, 43.8, 42.9, 41.9, 41.0, 40.0, 39.0, 38.1, 37.1, 36.2, 35.3, 34.3, 33.4, 32.5, 31.6, 30.6, 29.8,
    28.9, 28.0, 27.1, 26.2, 25.4, 24.5, 23.7, 22.9, 22.0, 21.2, 20.4, 19.6, 18.8, 18.0, 17.2, 16.4, 15.6, 14.8, 14.1, 13.3,
    12.6, 11.9, 11.2, 10.5, 9.9, 9.3, 8.7, 8.1, 7.6, 7.1, 6.6, 6.1, 5.7, 5.3, 4.9, 4.6, 4.3, 4.0, 3.7, 3.4, 3.2, 3.0, 2.8,
    2.6, 2.5, 2.3, 2.2, 2.1, 2.1, 2.1, 2.0, 2.0, 2.0, 2.0, 2.0, 1.9, 1.9, 1.8, 1.8, 1.6, 1.4, 1.1, 1.0];
  assert.strictEqual(SLT.length, 121);
  for (let age = 0; age <= 120; age++)
    assert.strictEqual(await page.evaluate((a) => window.__test_inherited.singleLifeFactor(a), age), SLT[age], `SLT ${age}`);
  assert.strictEqual(await page.evaluate(() => window.__test_inherited.singleLifeFactor(125)), 1.0, 'SLT above 120');
  assert.strictEqual(await page.evaluate(() => window.__test_inherited.singleLifeFactor(-3)), 84.6, 'SLT below 0');
  assert.strictEqual(await page.evaluate(() => window.__test_inherited.singleLifeFactor(60.4)), 27.1, 'SLT rounds');

  // ---- Task 2: the state sources fields are written on every taxing-state call (spec 6.4, review B2) ----
  // A profile with an inherited draw, then a legacy profile (no inh fields at all), in one page: the legacy tax equals a
  // fresh evaluation bit for bit (the sources scratch objects are reused between calls).
  for (const [code, extra] of [['ny', {}], ['co', { extraA: 30000 }], ['pa', {}], ['ct', {}]]) {
    const staleCheck = await page.evaluate(([c, ex]) => {
      const T = window.__test_tax;
      const base = { filing: 'single', singlePerson: true, otherA: 40000, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0,
        pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 70, ageB: null, invOrd: 0, invQual: 0, year: 0, ...ex };
      return window.__test_withState({ stateTax: c }, () => {
        const fresh = T.taxFor({ ...base }, 0, 10000);
        T.taxFor({ ...base, otherA: 70000, inhOn: true, inheritedA: 30000, inheritedB: 0, inhExtraA: 0, inhExtraB: 0, inhExclA: 20000, inhExclB: 0 }, 0, 10000);
        const after = T.taxFor({ ...base }, 0, 10000);
        return { same: Object.is(fresh, after), fresh, after };
      });
    }, [code, extra]);
    assert(staleCheck.same, `stale source ${code}: ${staleCheck.fresh} vs ${staleCheck.after}`);
  }
  // The comparison above cannot fail for PA or CT on that profile (a stale 30,000 is fully subtracted in PA, and CT's share is 1
  // at a state base of 40,000), and it covers only SOURCES_SINGLE: so every scratch object each taxFor branch uses must read all
  // zeros after a legacy call that follows an inherited one (joint: index 0; one-person: 1; two filers: 2 and 3).
  for (const code of ['ny', 'pa', 'ct']) {
    for (const [branch, o, idxs] of [
      ['joint', { filing: 'mfj', singlePerson: false }, [0]],
      ['one-person', { filing: 'single', singlePerson: true }, [1]],
      ['two filers', { filing: 'single', singlePerson: false }, [2, 3]],
    ]) {
      const zeros = await page.evaluate(([c, ov, ix]) => {
        const T = window.__test_tax;
        const base = { year: 0, otherA: 40000, otherB: 30000, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0,
          ssA: 0, ssB: 0, ageA: 70, ageB: 66, invOrd: 0, invQual: 0, ...ov };
        return window.__test_withState({ stateTax: c }, () => {
          T.taxFor({ ...base, inhOn: true, inheritedA: 30000, inheritedB: 25000, inhExtraA: 4000, inhExtraB: 3000, inhExclA: 20000, inhExclB: 15000 }, 0, 10000);
          const during = ix.map((i) => window.__test_inherited.sourcesInh()[i]);
          T.taxFor({ ...base }, 0, 10000);
          return { during, after: ix.map((i) => window.__test_inherited.sourcesInh()[i]) };
        });
      }, [code, o, idxs]);
      assert(zeros.during.every((r) => r[0] > 0), `${code} ${branch}: the inherited call wrote the sources (${JSON.stringify(zeros.during)})`);
      assert(zeros.after.every((r) => r.every((x) => x === 0)), `${code} ${branch}: stale sources after a legacy call: ${JSON.stringify(zeros.after)}`);
    }
  }
  // A legacy profile pays exactly what it paid before Task 2. The constants were produced by running this same evaluation on the
  // base tree (commit 3a5b7cb, Planner_US.html before Task 1) and are compared bit for bit: [single, joint, two filers] per state.
  const LEGACY = { ny: [6151, 6105.05, 5649.5], pa: [5595.9, 6180.8, 5655.799999999999], ca: [6020.53, 5942.38, 5507.780000000001],
    wa: [5074, 5444, 4919], co: [5947.4, 5488, 5462.4] };
  const legacyNow = await page.evaluate(() => {
    const T = window.__test_tax;
    const base = { filing: 'single', singlePerson: true, otherA: 40000, otherB: 0, extraA: 12000, extraB: 0, wageA: 0, wageB: 0, pensionA: 9000, pensionB: 0, rmdA: 15000, rmdB: 0, ssA: 20000, ssB: 0, ageA: 70, ageB: null, invOrd: 1500, invQual: 500, year: 0 };
    const joint = { ...base, filing: 'mfj', singlePerson: false, ageB: 66, otherB: 20000, pensionB: 5000, ssB: 10000, rmdB: 8000, extraB: 7000 };
    const sep = { ...joint, filing: 'single' };
    const out = {};
    for (const code of Object.keys({ ny: 1, pa: 1, ca: 1, wa: 1, co: 1 }))
      out[code] = window.__test_withState({ stateTax: code }, () => [T.taxFor({ ...base }, 3000, 10000), T.taxFor({ ...joint }, 3000, 10000), T.taxFor({ ...sep }, 3000, 10000)]);
    return out;
  });
  for (const code of Object.keys(LEGACY))
    LEGACY[code].forEach((v, i) => assert(Object.is(legacyNow[code][i], v), `legacy ${code}[${i}]: ${legacyNow[code][i]} vs base ${v}`));

  // ---- Task 4: the account (spec 6.1-6.3, 6.8). Every expected value is worked by hand in the comments. ----
  // Pure schedule (spec 6.2).
  const D = (b, r, k, L, roth = false, stretch = false) => page.evaluate((a) => window.__test_inherited.inheritedDraw(...a), [b, r, k, L, roth, stretch]);
  near(await D(100000, 0.07, 1, 26.2), 10700, 0.005, 'k1 even: 107,000 / 10');
  near(await D(100000, 0.07, 9, 26.2), 53500, 0.005, 'k9 even: 107,000 / 2');
  near(await D(100000, 0.07, 10, 26.2), 107000, 0.005, 'k10 all');
  assert.strictEqual(await D(100000, 0.07, 0, 26.2), 0, 'receipt year: no scheduled draw');
  near(await D(100000, 0.07, 9, 8.1), 107000, 0.005, 'heir 85, k9: d = 0.1 <= 1, whole account');
  near(await D(100000, -0.3, 8, 8.1), 70000, 0.005, 'heir 85, k8, -30%: d = 1.1, cap at the grown 70,000 (b/d = 90,909)');
  near(await D(100000, -0.3, 1, 10.5), 9523.81, 0.005, 'heir 81, k1, -30%: RMD 100,000 / 10.5 > 70,000 / 10');
  near(await D(100000, 0.0, 1, 10.5), 10000, 0.005, 'heir 81, k1, r = 0: even 10,000 >= 9,523.81');
  near(await D(100000, -0.3, 1, 14.8), 7000, 0.005, 'heir 75, k1, -30%: 70,000 / 10 > 100,000 / 14.8 = 6,756.76');
  near(await D(100000, -0.3, 5, 14.8), 11666.67, 0.005, 'heir 75, k5, -30%: 70,000 / 6 > 100,000 / 10.8 = 9,259.26');
  near(await D(100000, 0.06, 1, 9.9), 10600, 0.005, 'heir 82 at 6%: 106,000 / 10 = 10,600 >= 10,101.01');
  near(await D(100000, 0.06, 1, 9.3), 10752.69, 0.005, 'heir 83 at 6%: 100,000 / 9.3 = 10,752.69 > 10,600');
  near(await D(100000, 0.07, 3, 5.7), 100000 / 3.7, 0.005, 'heir 90, k3: d = 3.7');
  near(await D(100000, 0.07, 6, 5.7), 107000, 0.005, 'heir 90, k6: d = 0.7, whole');
  near(await D(100000, 0.07, 3, 2.8), 107000, 0.005, 'heir 100, k3: d = 0.8, whole');
  assert.strictEqual(await D(100000, 0.07, 9, 26.2, true), 0, 'Roth k9: nothing');
  near(await D(100000, 0.07, 10, 26.2, true), 107000, 0.005, 'Roth k10: all');
  near(await D(100000, 0.05, 3, 35.3, false, true), 100000 / 33.3, 0.005, 'stretch k3, L 35.3: d = 33.3');
  near(await D(100000, 0.05, 3, 35.3, true, true), 100000 / 33.3, 0.005, 'Roth stretch: same amount');
  near(await D(100000, 0.05, 40, 35.3, false, true), 105000, 0.005, 'stretch past the factor: whole');
  // Heir 81 (L 10.5) at -30% is bound by the RMD in every year k = 1..9: the floor binds when (1 + r)(L - k + 1) < 11 - k,
  // i.e. 0.7 x (11.5 - k) < 11 - k, i.e. 0.3k < 2.95, i.e. k <= 9. Walk: draw_k = b_k / (11.5 - k), b_{k+1} = 0.7 b_k - draw_k
  // (b_1 = 100,000: draw 9,523.81, b_2 = 60,476.19, draw 6,365.91 (d 9.5), b_3 = 35,967.42, draw 4,231.46 (d 8.5)).
  {
    let b = 100000;
    const hand = { 1: [9523.81, 60476.19], 2: [6365.91, 35967.42], 3: [4231.46, null] };
    for (let k = 1; k <= 9; k++) {
      const d = await D(b, -0.3, k, 10.5), rmd = b / (11.5 - k), even = (0.7 * b) / (11 - k);
      near(d, rmd, 0.005, `heir 81 at -30%, k${k}: the RMD ${rmd.toFixed(2)}`);
      assert(Math.abs(d - even) > 0.005, `heir 81 at -30%, k${k}: differs from the even draw`);
      if (hand[k]) {
        near(d, hand[k][0], 0.005, `heir 81 at -30%, k${k}: hand draw`);
        if (hand[k][1] !== null) near(0.7 * b - d, hand[k][1], 0.005, `heir 81 at -30%, k${k}: hand balance`);
      }
      b = 0.7 * b - d;
    }
    near(await D(b, -0.3, 10, 10.5), 0.7 * b, 0.005, 'heir 81 at -30%, k10: the whole grown balance');
  }
  // Sweep: draw <= grown, draw >= min(grown, b / d) when d > 1, else the whole grown balance; never negative.
  for (const L of [35.3, 18.8, 10.5, 8.1, 5.7, 2.8]) for (const r of [-0.3, 0, 0.07]) for (let k = 1; k <= 10; k++) {
    const grown = 100000 * (1 + r), d = L - k + 1, got = await D(100000, r, k, L);
    assert(got >= 0 && got <= grown + 0.005, `sweep L ${L} r ${r} k ${k}: within the account (${got})`);
    const floor = d > 1 ? Math.min(grown, 100000 / d) : grown;
    assert(got >= floor - 0.005, `sweep L ${L} r ${r} k ${k}: at least the RMD (${got} vs ${floor})`);
  }

  // Ledger (clock pinned to 2026; household A 55, B 53).
  const LG = (rows, c = {}) => page.evaluate(([r, x]) => {
    const g = window.__test_inherited.inheritedLedger(r, { ageA: 55, ageB: 53, single: false, currentYear: 2026, deathYear: Infinity, deceasedIsA: false, deceasedIsB: false, ...x });
    return g && { n: g.n, roth: g.roth, owner: g.owner, heir: g.heir, receiptYear: g.receiptYear, stretch: g.stretch, L: g.L, bal: Array.from(g.bal), open: Array.from(g.open) };
  }, [rows, c]);
  const R = (o) => ({ amount: 100000, age: 55, flat: true, kind: 'inheritedTrad', owner: 'A', ...o });
  assert.strictEqual(await LG([{ amount: 1, age: 55, kind: 'free' }]), null, 'no inherited row: null');
  let g = await LG([R({ age: 52 })]);
  assert.deepStrictEqual([g.receiptYear[0], g.stretch[0], g.open[0], g.bal[0]], [-3, false, 1, 100000], 'past row 3 years back: open now at today\'s balance');
  // receiptYear = 52 - 55 = -3 (2023); the heir's age in the year after receipt (2024) = 55 - 3 + 1 = 53; SLT[53] = 33.4.
  assert.strictEqual(g.L[0], 33.4, 'L: heir A aged 53 in the year after receipt (2024): SLT[53] = 33.4');
  g = await LG([R({ age: 47 })]);
  assert.deepStrictEqual([g.stretch[0], g.open[0]], [true, 1], 'stretch 2018');
  g = await LG([R({ age: 43 })]);
  assert.deepStrictEqual([g.stretch[0], g.open[0]], [true, 1], 'stretch 2014 still opens');
  g = await LG([R({ age: 49 })]);
  assert.deepStrictEqual([g.stretch[0], g.open[0]], [false, 1], 'ten-year 2020');
  g = await LG([R({ age: 44 })]);
  assert.strictEqual(g.stretch[0], true, 'closed 2015 is stretch');
  assert.strictEqual(await LG([R({ age: 43 })], { currentYear: 2032 }), null, 'closed ten-year window (clock 2032): a 2020 death, window closed in 2030');
  g = await LG([R({ age: 58, owner: 'b' })]);
  assert.deepStrictEqual([g.owner[0], g.open[0], g.bal[0]], [0, 0, 0], 'future row: not open yet, owner A');
  g = await LG([{ amount: 100000, age: 55, kind: 'inheritedTrad' }]);
  assert.deepStrictEqual([g.owner[0], g.receiptYear[0]], [0, 0], 'raw row');
  g = await LG([R({ owner: 'B' })], { single: true });
  assert.strictEqual(g.owner[0], 0, 'single-person: owner A');
  g = await LG([R({ age: 54.6 })]);
  assert.strictEqual(g.receiptYear[0], 0, 'Math.round(54.6) = 55');
  g = await LG([R({ age: 57, kind: 'inheritedRoth', owner: 'B' }), R({ age: 53 })]);
  assert.deepStrictEqual(g.receiptYear, [-2, 2], 'two rows, oldest receipt first (arrays of length n = 2)');
  assert.deepStrictEqual([g.owner, g.roth], [[0, 1], [false, true]], 'owner and kind follow the sort');
  assert.strictEqual(g.n, 2, 'n = 2');
  g = await LG([R({ age: 43 }), { amount: 1, age: 55, kind: 'free' }], { currentYear: 2032 });
  assert.strictEqual(g, null, 'every inherited row skipped: null');
  // owner dead at receipt: A (named owner) is dead from year 1, the row is received in year 3: the heir is B (slot 1), owner stays A
  g = await LG([R({ age: 58 })], { deathYear: 1, deceasedIsA: true });
  assert.deepStrictEqual([g.owner[0], g.heir[0]], [0, 1], 'owner dead at receipt: the named owner stays, the heir is the other partner');
  // B's age 53 + 3 + 1 = 57 in the year after receipt: SLT[57] = 29.8
  assert.strictEqual(g.L[0], 29.8, 'L from the heir (B, 57): SLT[57] = 29.8');

  // ---- engine cases ----
  const engine = (patch, rows, hist) =>
    page.evaluate(([p, l, h]) => {
      const s = window.__test_getState(), saved = JSON.parse(JSON.stringify(s));
      try {
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, JSON.parse(JSON.stringify(saved)), p, { oneTimeIncome: l });
        const rowFn = h ? (y) => [2000 + y, h.stock[y] === undefined ? h.dflt : h.stock[y], 0, 3] : null;
        const tr = rowFn ? window.__test_accountTrace(s.retireAgeA, s.retireAgeB, rowFn) : window.__test_accountTrace();
        const sim = rowFn ? window.__test_simulateHistorical(rowFn) : window.__test_simulate();
        return {
          trace: tr.map((t) => ({ profile: t.profile, conversionAmount: t.conversionAmount, inherited: t.inherited, taxable: t.taxable, taxableBasis: t.taxableBasis, ficaTax: t.ficaTax, guardrails: t.guardrails, firstWithdrawal: t.firstWithdrawal, inhNeedAdj: t.inhNeedAdj, gpBase: t.gpBase })),
          rows: sim.rows,
          sim: { firstWithdrawal: sim.firstWithdrawal },
          estate: JSON.parse(JSON.stringify(sim.estate)),
        };
      } finally {
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, saved);
      }
    }, [patch, rows, hist || null]);
  const stateOf = (profile, code, trad) =>
    page.evaluate(([p, c, t]) => {
      const T = window.__test_tax;
      const withCode = window.__test_withState({ stateTax: c }, () => T.taxFor({ ...p }, 0, t));
      const tx = window.__test_withState({ stateTax: 'tx' }, () => T.taxFor({ ...p }, 0, t));
      return withCode - tx;
    }, [profile, code, trad]);
  const Z0 = { accounts: 0 };
  const H = { singlePerson: false, ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 90, lifeExpectancyB: 90,
    incomeA: 0, incomeB: 0, stateTax: 'tx', acaEnabled: false, guardrailsEnabled: false, returnRate: 7, inflation: 0, spending: 40000,
    taxable: 1000000, cash: 0, bondYears: 0, tenure: 'rent', rent: 0, tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0,
    tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0, rothConvEnabled: false, cliffGuardEnabled: false, survivorEnabled: false,
    ssMonthlyA: 0, ssMonthlyB: 0, pensionCoverage: 'none', pensionYearlyA: 0, pensionYearlyB: 0, incomeSources: [], children: [] };
  const stream = (amount, owner = 'A') => ({ amount, startAge: 50, endAge: 90, followGrowth: false, growth: 0, owner, kind: 'other' });
  // The even schedule on a $400,000 row received at 60 (hand: b_k = grown - draw_k; draw_k = grown / (11 - k); k = 10 takes it all):
  // 42,800.00; 45,796.00; 49,001.72; 52,431.84; 56,102.07; 60,029.21; 64,231.26; 68,727.45; 73,538.37; 78,686.05.
  const EVEN = [42800, 45796, 49001.72, 52431.84, 56102.07, 60029.21, 64231.26, 68727.45, 73538.37, 78686.05];
  let e = await engine(H, [R({ amount: 400000, age: 60, owner: 'B' })]);
  const twin0 = await engine(H, []);
  near(e.rows[0].inheritedDraw || 0, 0, 0.005, 'receipt year: no draw');
  near(e.rows[0].inheritedTrad, 400000, 0.005, 'the receipt year opens at the entered amount, after growth');
  near(e.rows[0].investable - twin0.rows[0].investable, 400000, 0.01, 'investable includes the inherited balance in the receipt year');
  for (let k = 1; k <= 10; k++) near(e.rows[k].inheritedDraw, EVEN[k - 1], 0.01, `draw year ${k}`);
  assert.strictEqual(e.rows[10].inheritedTrad, 0, 'empty after the year-10 draw');
  assert.strictEqual(e.rows[11].inheritedTrad || 0, 0, 'no inherited field after year 10');
  near(e.trace[1].profile.otherB - e.trace[1].profile.wageB, 42800, 0.01, "the draw in B's other income");
  near(e.trace[1].profile.otherA - e.trace[1].profile.wageA, 0, 0.01, "nothing in A's other income");
  assert.strictEqual(e.trace[1].profile.inhOn, true, 'inhOn in an inherited run');
  near(e.rows[1].traditionalWithdrawn - twin0.rows[1].traditionalWithdrawn, 42800, 0.01, 'traditionalWithdrawn includes the draw');
  near(e.rows[1].traditional - twin0.rows[1].traditional, 385200, 0.01, 'row.traditional includes the inherited balance (400,000 x 1.07 - 42,800)');

  // NIIT (spec 6.3, review S4): TX, MFJ, both 60, dividendYield 1 on taxable 1,000,000 (net investment income 10,000), A's not-earned
  // stream 230,000, A's $400,000 row received at 59 (draw 400,000 x 1.07 / 10 = 42,800). Twin: the stream at 272,800 and no row.
  // MAGI 282,800 in both; NIIT = 3.8% x min(10,000, 282,800 - 250,000 = 32,800) = 380 in both runs; the draw and the twin's extra
  // stream are ordinary income on the federal return, so row.tax is equal. A leak into net investment income would add
  // 3.8% x min(52,800, 32,800) - 380 = 866.40.
  {
    const N = { ...H, dividendYield: 1 };
    const inh = await engine({ ...N, incomeSources: [stream(230000)] }, [R({ amount: 400000, age: 59 })]);
    const twin = await engine({ ...N, incomeSources: [stream(272800)] }, []);
    near(inh.rows[0].tax, twin.rows[0].tax, 0.01, 'NIIT: the draw raises MAGI, not net investment income');
  }

  // two rows: A's traditional received at 58 (k = 2 now, $200,000) and B's Roth received at 61 ($100,000, opens in year 1 after growth).
  {
    const rowsAB = [R({ amount: 200000, age: 58 }), R({ amount: 100000, age: 61, kind: 'inheritedRoth', owner: 'B' })];
    // a surplus household (a not-earned stream of 100,000): the payout is swept, not spent, so no sale changes the MAGI
    const T = { ...H, incomeSources: [stream(100000)] };
    const a = await engine(T, rowsAB), b = await engine(T, [rowsAB[0]]);
    near(a.rows[0].inheritedRoth || 0, 0, 0.005, 'two rows: the Roth is not open in year 0');
    near(a.rows[1].inheritedRoth, 100000, 0.005, 'two rows: the Roth opens in year 1 at the entered amount');
    near(a.rows[2].inheritedRoth, 107000, 0.005, 'two rows: the Roth grows at the stock return');
    near(a.rows[10].inheritedRoth, 100000 * Math.pow(1.07, 9), 0.01, 'two rows: untouched until its year 10 (1.07^9 x 100,000 = 183,845.92)');
    assert.strictEqual(a.rows[11].inheritedRoth || 0, 0, 'two rows: paid out in year 11 (k = 10)');
    near(a.rows[11].tax, b.rows[11].tax, 0.01, 'two rows: the Roth payout does not change the tax');
    near(a.rows[11].magiProxy, b.rows[11].magiProxy, 0.01, 'two rows: the Roth payout does not change MAGI');
    // the payout is a transfer: investable moves only by the year's growth of the Roth balance, 183,845.92 x 7% = 12,869.21
    near((a.rows[11].investable - a.rows[10].investable) - (b.rows[11].investable - b.rows[10].investable), 12869.21, 0.01, 'two rows: investable unchanged across the payout (only the year of growth)');
    // A's traditional draws land on A (the slot of the A row), B's slot carries nothing of it
    assert(a.trace[2].profile.otherA - a.trace[2].profile.wageA > 0, 'two rows: the traditional draw is on A');
    near(a.trace[2].profile.otherB - a.trace[2].profile.wageB, 0, 0.01, 'two rows: nothing on B before the Roth payout');
  }

  // owner dead at receipt: A dies at 62 (deathYear 2), A's row is received at 63 (year 3): the draws land on the survivor B,
  // whose return is the one-person return with B in slot A.
  {
    const S = { ...H, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 62 };
    const a = await engine(S, [R({ amount: 400000, age: 63 })]);
    // year 4 is k = 1: 400,000 x 1.07 / 10 = 42,800
    near(a.rows[4].inheritedDraw, 42800, 0.01, 'owner dead at receipt: the schedule is unchanged');
    assert.strictEqual(a.trace[4].profile.singlePerson, true, 'owner dead at receipt: a one-person return');
    near(a.trace[4].profile.otherA - a.trace[4].profile.wageA, 42800, 0.01, "owner dead at receipt: the draw on the survivor's return");
    near(a.trace[4].profile.inheritedA, 42800, 0.01, 'owner dead at receipt: profile.inheritedA after the remap');
    assert.strictEqual(a.trace[4].profile.inheritedB, 0, 'owner dead at receipt: nothing in slot B');
  }
  // owner dies in year 4: A's row received at 60, A dies at 64: the same schedule to the same deadline (year 10 empties it).
  {
    const S = { ...H, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 64 };
    const a = await engine(S, [R({ amount: 400000, age: 60 })]);
    for (let k = 1; k <= 10; k++) near(a.rows[k].inheritedDraw, EVEN[k - 1], 0.01, `owner dies in year 4: draw year ${k}`);
    assert.strictEqual(a.rows[10].inheritedTrad, 0, 'owner dies in year 4: empty at year 10');
    assert(a.trace[3].profile.singlePerson === false && a.trace[5].profile.singlePerson === true, 'owner dies in year 4: joint, then one person');
    near(a.trace[5].profile.otherA - a.trace[5].profile.wageA, EVEN[4], 0.01, "owner dies in year 4: the draw moves to the survivor's slot A");
  }

  // stretch 2018 (decision 17): A's $100,000 row received at 52 (receiptYear -8, a 2018 death; heir A's age in 2019 = 53, L = SLT[53] = 33.4).
  // draw = b / d, d = 33.4 - k + 1, k = year + 8: year 0 d 26.4: 3,787.88 -> end 103,212.12; year 1 d 25.4: 4,063.47 -> 106,373.50;
  // year 2 d 24.4: 4,359.57 (no deadline).
  {
    const a = await engine(H, [R({ amount: 100000, age: 52 })]);
    near(a.rows[0].inheritedDraw, 3787.88, 0.01, 'stretch 2018: year 0 draw');
    near(a.rows[0].inheritedTrad, 103212.12, 0.01, 'stretch 2018: year 0 end balance');
    near(a.rows[1].inheritedDraw, 4063.47, 0.01, 'stretch 2018: year 1 draw');
    near(a.rows[1].inheritedTrad, 106373.5, 0.01, 'stretch 2018: year 1 end balance');
    near(a.rows[2].inheritedDraw, 4359.57, 0.01, 'stretch 2018: year 2 draw');
    assert(a.rows[12].inheritedTrad > 0, 'stretch 2018: no deadline');
  }
  // stretch successor (spec 6.2): A 80, B 80, A dies at 83 (Y = 3), A's $100,000 row received at 72 (receiptYear -8, L = SLT[73] = 16.4).
  // Years 0-3 stretch (d = 16.4 - (year + 8) + 1): 10,638.30 / 11,471.63 / 12,383.16 / 13,385.42 (year 3 = Y is still a stretch year);
  // year 4 (k' 1, L' = 16.4 - 11 = 5.4): even 83,757.41 / 10 = 8,375.74, floor 78,277.95 / 5.4 = 14,495.92 -> 14,495.92; year 9
  // (k' 6, d = 0.4): the whole grown balance 10,524.73 x 1.07 = 11,261.46; empty from year 10.
  {
    const S = { ...H, ageA: 80, ageB: 80, retireAgeA: 80, retireAgeB: 80, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 83 };
    const a = await engine(S, [R({ amount: 100000, age: 72 })]);
    for (const [y, d] of [[0, 10638.3], [1, 11471.63], [2, 12383.16], [3, 13385.42], [4, 14495.92], [9, 11261.46]])
      near(a.rows[y].inheritedDraw, d, 0.01, `stretch successor: year ${y} draw`);
    assert.strictEqual(a.rows[10].inheritedTrad || 0, 0, 'stretch successor: empty in year 10');
    near(a.trace[3].profile.otherA - a.trace[3].profile.wageA, 13385.42, 0.01, 'stretch successor: year 3 draw on the survivor slot A (the survivor B remapped)');
  }

  // historical run (growth at the path's return): B's $400,000 row received this year, stock returns +10% except -20% in year 1 (percent).
  // Year 0: opened at 400,000. Year 1 (k 1, -20%): grown 320,000, even 32,000, floor 400,000 / SLT[61] 26.2 = 15,267.18: draw 32,000, end 288,000.
  // Year 2 (k 2, +10%): grown 316,800; even 316,800 / 9 = 35,200; floor 288,000 / 25.2 = 11,428.57: draw 35,200.
  {
    const a = await engine(H, [R({ amount: 400000, age: 60, owner: 'B' })], { stock: { 1: -20 }, dflt: 10 });
    near(a.rows[0].inheritedTrad, 400000, 0.01, 'historical: opened at 400,000, no growth in the receipt year');
    near(a.rows[1].inheritedDraw, 32000, 0.01, 'historical: year 1 draw');
    near(a.rows[1].inheritedTrad, 288000, 0.01, 'historical: year 1 end balance');
    near(a.rows[2].inheritedDraw, 35200, 0.01, 'historical: year 2 draw');
  }

  // afterTaxValue and estate.
  {
    const v = await page.evaluate(() => {
      const f = window.__test_inherited.afterTaxValue;
      const z = { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, traditional: 0, bondTraditional: 0, roth: 0, bondRoth: 0, cash: 0, home: 0 };
      const leg = { ...z, taxable: 1000, taxableBasis: 400, traditional: 2000, roth: 300, cash: 50 };
      return { inh: f({ ...z, inheritedTrad: 100000, inheritedRoth: 50000 }, 0.2, 0.15), none: f({ ...z, inheritedTrad: 0, inheritedRoth: 0 }, 0.2, 0.15),
        legacy: f({ ...leg, inheritedTrad: 0, inheritedRoth: 0 }, 0.2, 0.15), legacyNoFields: f({ ...leg }, 0.2, 0.15) };
    });
    // 100,000 x (1 - 0.2) + 50,000 = 130,000; a legacy bal: 1,000 - 600 x 0.15 + 2,000 x 0.8 + 300 + 50 = 2,860
    assert.strictEqual(v.inh, 130000, 'afterTaxValue: inherited terms');
    assert.strictEqual(v.none, 0, 'afterTaxValue: empty bal');
    assert.strictEqual(v.legacy, 2860, 'afterTaxValue: legacy bal with zero inherited fields');
    assert(Object.is(v.legacy, v.legacyNoFields), 'afterTaxValue: the very double of a bal without the fields');
    const a = await engine(H, [R({ amount: 400000, age: 60 })]);
    const t = await engine(H, []);
    // estate after year 30: the row emptied in year 10, so equal; a short run keeps it open
    const s2 = await engine({ ...H, lifeExpectancyA: 63, lifeExpectancyB: 63 }, [R({ amount: 400000, age: 60 })]);
    const s2t = await engine({ ...H, lifeExpectancyA: 63, lifeExpectancyB: 63 }, []);
    // after year 3 (row k = 3): b = 343,012.04 (hand recursion above); estate.traditional = that
    near(s2.estate.traditional - s2t.estate.traditional, 343012.04, 0.01, 'estate.traditional includes the open inherited balance');
    assert.strictEqual(a.estate.traditional, t.estate.traditional, 'estate: a row drained by year 10 leaves nothing');
  }

  // cash conservation in a working surplus year (incomeA 150,000, retireAgeA 65): total investable excluding the inherited balance
  // equals the twin with a tax-free lump equal to the draw, less the tax difference; the inherited balance at year end is start x 1.07
  // less the draw exactly. Row received at 59 (k = 1 in year 0): 400,000 x 1.07 = 428,000, draw 42,800, end 385,200.
  {
    const Wk = { ...H, incomeA: 150000, retireAgeA: 65 };
    const a = await engine(Wk, [R({ amount: 400000, age: 59 })]);
    const b = await engine(Wk, [{ amount: 42800, age: 60, flat: true, kind: 'free', owner: 'A' }]);
    near(a.rows[0].inheritedTrad, 385200, 0.005, 'cash conservation: inherited balance = start x 1.07 - draw');
    near(a.rows[0].investable - a.rows[0].inheritedTrad, b.rows[0].investable - (a.rows[0].tax - b.rows[0].tax), 0.01, 'cash conservation: investable excluding the inherited balance');
  }
  // Roth payout swept at full basis: A works to 70, a $100,000 Roth row of A's received at 58 (receiptYear -2: a 2024 death, a 10-year row;
  // payout in year 8 = 100,000 x 1.07^9 = 183,845.92). Against the twin with no row: the basis rises by the payout and the gain part
  // is unchanged; no tax, no MAGI.
  {
    const Wk = { ...H, incomeA: 150000, incomeB: 0, retireAgeA: 70, retireAgeB: 70, dividendYield: 0 };
    const a = await engine(Wk, [R({ amount: 100000, age: 58, kind: 'inheritedRoth' })]);
    const b = await engine(Wk, []);
    near((a.trace[8].taxableBasis - a.trace[7].taxableBasis) - (b.trace[8].taxableBasis - b.trace[7].taxableBasis), 183845.92, 0.01, 'Roth payout: swept at full basis');
    near((a.trace[8].taxable - a.trace[8].taxableBasis) - (b.trace[8].taxable - b.trace[8].taxableBasis), 0, 0.01, 'Roth payout: no gain created');
    near(a.rows[8].tax, b.rows[8].tax, 0.01, 'Roth payout: no tax');
    near(a.rows[8].magiProxy, b.rows[8].magiProxy, 0.01, 'Roth payout: no MAGI');
  }

  // ---- federal cases (TX) ----
  // Social Security taxation: ages 67, SS 1,500 a month each from 67 (36,000), no dividends, a not-earned stream for A of 20,000, A's
  // $200,000 row received at 66 (draw 214,000 / 10 = 21,400). SS_BASE mfj [32,000, 44,000, 6,000]: twin provisional 20,000 + 18,000 =
  // 38,000, taxable benefits 0.5 x 6,000 = 3,000; inherited provisional 59,400, taxable min(30,600, 0.85 x 15,400 + 6,000 = 19,090) =
  // 19,090. Deductions MFJ 67: 32,200 + 2 x 1,650 + 2 x 6,000 = 47,500: twin taxable 20,000 + 3,000 - 47,500 < 0; inherited
  // 20,000 + 19,090 + 21,400 - 47,500 = 12,990 at 10% = 1,299.00.
  {
    const S = { ...H, ageA: 67, ageB: 67, retireAgeA: 67, retireAgeB: 67, ssMonthlyA: 1500, ssMonthlyB: 1500, ssStartAgeA: 67, ssStartAgeB: 67,
      dividendYield: 0, basisRatio: 100, incomeSources: [stream(20000)] };
    const a = await engine(S, [R({ amount: 200000, age: 66 })]);
    const b = await engine(S, []);
    near(a.trace[0].profile.ssA + a.trace[0].profile.ssB, 36000, 0.005, 'Social Security: benefits 36,000');
    near(a.rows[0].tax - b.rows[0].tax, 1299, 0.01, 'Social Security taxation: the draw raises the tax by 1,299.00');
  }
  // ACA premium at the realized MAGI: both 61, the 60,000 stream, spending 90,000, taxable 600,000, A's $428,000 row received at 60
  // (draw 428,000 / 10 = 42,800). Twin MAGI 60,000, premium 5,678.47 (measured by the plan reviewer); inherited 102,800 over the
  // 400% line for two (84,600): the full premium 18,000. The difference 12,321.53 is the spec's decision-16 example.
  {
    const A = { ...H, ageA: 61, ageB: 61, retireAgeA: 61, retireAgeB: 61, acaEnabled: true, returnRate: 0, dividendYield: 0, basisRatio: 100,
      spending: 90000, taxable: 600000, medicalInflation: 0, incomeSources: [stream(60000)] };
    const a = await engine(A, [R({ amount: 428000, age: 60 })]);
    const b = await engine(A, []);
    near(a.rows[0].magiProxy - b.rows[0].magiProxy, 42800, 0.01, 'ACA: MAGI gap is the draw');
    near(b.rows[0].magiProxy, 60000, 0.01, 'ACA: twin MAGI 60,000');
    near(a.rows[0].healthcare, 18000, 0.01, 'ACA: the full premium over 400% of the poverty line');
    near(b.rows[0].healthcare, 5678.47, 0.01, 'ACA: the twin pays 5,678.47 (measured by the plan reviewer)');
  }
  // IRMAA two years on: ages 67, prior MAGIs entered as 0, a not-earned stream of 200,000 (a surplus year, no sale), A's $400,000 row
  // received at 66 (draws 42,800, 45,796): Medicare MAGI 242,800 in year 0 across the first MFJ line (218,000). Years 0 and 1: healthcare
  // equal (both read the entered priors); year 2: 2 people x 12 months x 95.70 = 2,296.80 more.
  {
    const I = { ...H, ageA: 67, ageB: 67, retireAgeA: 67, retireAgeB: 67, medicalInflation: 0, dividendYield: 0, irmaaPriorKnown: true,
      irmaaMagiPrior2: 0, irmaaMagiPrior1: 0, incomeSources: [stream(200000)] };
    const a = await engine(I, [R({ amount: 400000, age: 66 })]);
    const b = await engine(I, []);
    near(a.rows[0].healthcare - b.rows[0].healthcare, 0, 0.01, 'IRMAA: year 0 reads the entered prior MAGI');
    near(a.rows[1].healthcare - b.rows[1].healthcare, 0, 0.01, 'IRMAA: year 1 reads the entered prior MAGI');
    near(a.rows[2].healthcare - b.rows[2].healthcare, 2296.8, 0.01, 'IRMAA: year 2 pays the tier-1 surcharge for the draw of year 0');
  }
  // Roth fill converts less: rothConvEnabled at the 12% bracket, tradIraA 600,000, A's $400,000 row received at 59 (year 0 draw 42,800):
  // the fill takes the room dollar for dollar, so the twin's conversion less the inherited run's is 42,800 (within $0.10: the bracket
  // bisection is about $0.036 per run; the plan reviewer measured 42,800.009).
  {
    const C = { ...H, rothConvEnabled: true, rothConvBracket: 12, rothConvStartAge: 60, rothConvEndAge: 63, tradIraA: 600000, dividendYield: 0 };
    const a = await engine(C, [R({ amount: 400000, age: 59 })]);
    const b = await engine(C, []);
    assert(a.trace[0].conversionAmount > 0 && b.trace[0].conversionAmount > 0, 'Roth fill: both runs convert');
    near(b.trace[0].conversionAmount - a.trace[0].conversionAmount, 42800, 0.1, 'Roth fill converts less by the draw');
  }
  // owner B on two returns: filingStatus 'single' (two returns every year), dividendYield 0, A's stream of 70,000 in both runs, B's
  // $400,000 row received at 59 (heir B 60, draw 42,800). magiB gap = 42,800 and magiA equal; profile.otherB carries the draw.
  {
    const T2 = { ...H, filingStatus: 'single', dividendYield: 0, incomeSources: [stream(70000)] };
    const a = await engine(T2, [R({ amount: 400000, age: 59, owner: 'B' })]);
    const b = await engine(T2, []);
    near(a.rows[0].magiB - b.rows[0].magiB, 42800, 0.01, 'two returns: the draw is on B\'s return');
    near(a.rows[0].magiA - b.rows[0].magiA, 0, 0.01, 'two returns: A\'s return unchanged');
    near(a.trace[0].profile.otherB - a.trace[0].profile.wageB, 42800, 0.01, 'two returns: profile.otherB carries the draw');
  }

  // ---- state households (one draw year each; the row is received at A's age - 1 so year 0 is draw year 1) ----
  // stateOf(profile, code, t) = taxFor under the state minus under TX on the trace's profile; a comparison profile moves a taxed amount
  // through extraA (state wages), never otherA.
  const withSetup = async (patch, rows) => {
    const x = await engine(patch, rows);
    // medicalExpense 0: the flat premium would let a profile itemize on its own federal AGI, and the state tax feeds the SALT line,
    // so two profiles with different federal incomes could differ in the state-minus-Texas figure for a reason that is not the state rule.
    const p = { ...x.trace[0].profile, medicalExpense: 0 }, r = x.rows[0];
    return { p, r, t: r.traditionalWithdrawn - (r.inheritedDraw || 0) };
  };
  const asWages = (p, wages) => ({ ...p, inhOn: false, inheritedA: 0, inheritedB: 0, inhExtraA: 0, inhExtraB: 0, inhExclA: 0, inhExclB: 0, extraA: p.extraA + wages });
  const rate = (code) => page.evaluate((c) => window.__test_tax.STATE_RULES[c].tax.rate, code);
  // PA (exempt): the state tax equals the twin's.
  {
    const P = { ...H, stateTax: 'pa', ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, dividendYield: 0, incomeSources: [stream(60000)] };
    const a = await withSetup(P, [R({ amount: 400000, age: 61 })]);
    const b = await withSetup(P, []);
    near(a.r.inheritedDraw, 42800, 0.01, 'PA: the draw');
    near(await stateOf(a.p, 'pa', a.t), await stateOf(b.p, 'pa', b.t), 0.01, 'PA: the state tax equals the twin\'s (exempt)');
    assert((await stateOf(b.p, 'pa', b.t)) > 1500, 'PA: the twin pays state tax on its 60,000 stream');
  }
  // NY (decedent): a 30,000 draw at 62 (returnRate 0, $300,000 received at 61), the heir's own $20,000 pension exclusion used by a
  // 20,000 pension: the state taxes 10,000 of the draw (the decedent room 20,000), so it equals the profile with 10,000 of wages.
  {
    const P = { ...H, stateTax: 'ny', ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, returnRate: 0, dividendYield: 0, pensionCoverage: 'a', pensionYearlyA: 20000, pensionStartAgeA: 60 };
    const a = await withSetup(P, [R({ amount: 300000, age: 61 })]);
    near(a.r.inheritedDraw, 30000, 0.01, 'NY: the draw');
    near(a.p.inhExclA, 20000, 0.01, 'NY: the decedent room is the cap');
    near(await stateOf(a.p, 'ny', a.t), await stateOf(asWages(a.p, 10000), 'ny', a.t), 0.01, 'NY: 10,000 of the draw is taxed, beside the heir\'s own exclusion');
  }
  // CO at 50 (heirAnyAge): 30,000 draw, 20,000 excluded: equals 10,000 of wages. CO at 60 single person with an own IRA draw t: the
  // draw shares the $20,000 cap for 55-64: excluded min(t + 30,000, 20,000).
  {
    const P = { ...H, stateTax: 'co', ageA: 50, ageB: 50, retireAgeA: 50, retireAgeB: 50, returnRate: 0, dividendYield: 0 };
    const a = await withSetup(P, [R({ amount: 300000, age: 49 })]);
    near(a.r.inheritedDraw, 30000, 0.01, 'CO at 50: the draw');
    near(await stateOf(a.p, 'co', a.t), await stateOf(asWages(a.p, 10000), 'co', a.t), 0.01, 'CO at 50: 20,000 of the draw excluded');
    const P60 = { ...H, stateTax: 'co', singlePerson: true, ageA: 60, retireAgeA: 60, returnRate: 0, dividendYield: 0, taxable: 0, tradIraA: 400000, spending: 60000 };
    const c = await withSetup(P60, [R({ amount: 300000, age: 59 })]);
    assert(c.t > 0, 'CO at 60: the household also draws its own IRA (' + c.t + ')');
    const taxedPart = Math.max(0, c.t + c.r.inheritedDraw - 20000);
    near(await stateOf(c.p, 'co', c.t), await stateOf({ ...asWages(c.p, taxedPart) }, 'co', 0), 0.01, 'CO at 60: the draw shares the 20,000 cap with the own IRA draw');
  }
  // CT (heir, share 1 below the first step of the joint table, 100,000): the draw is fully excluded, so the state tax equals the twin's.
  {
    const P = { ...H, stateTax: 'ct', ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, dividendYield: 0, incomeSources: [stream(20000)] };
    const a = await withSetup(P, [R({ amount: 400000, age: 61 })]);
    const b = await withSetup(P, []);
    near(await stateOf(a.p, 'ct', a.t), await stateOf(b.p, 'ct', b.t), 0.01, 'CT: the draw is excluded at a share of 1');
  }
  // GA (heir) at 65: 42,800 <= the 65,000 cap, all excluded: 4.99% x (40,000 - 30,000) = 499.00, the twin's; at 62: 35,000 excluded, 7,800
  // taxed: 4.99% x (40,000 + 7,800 - 30,000) = 888.22.
  {
    for (const [age, want] of [[65, 499.0], [62, 888.22]]) {
      const P = { ...H, stateTax: 'ga', ageA: age, ageB: age, retireAgeA: age, retireAgeB: age, dividendYield: 0, incomeSources: [stream(40000)] };
      const a = await withSetup(P, [R({ amount: 400000, age: age - 1 })]);
      near(a.r.inheritedDraw, 42800, 0.01, `GA at ${age}: the draw`);
      near(await stateOf(a.p, 'ga', 0), want, 0.01, `GA at ${age}: the state tax`);
      const b = await withSetup(P, []);
      near(await stateOf(b.p, 'ga', 0), 499.0, 0.01, `GA at ${age}: the twin`);
    }
  }
  // MI (ordinary): taxed like wages: the difference from the twin is the rate x the draw (both bases are far over the exemptions).
  {
    const P = { ...H, stateTax: 'mi', ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, dividendYield: 0, incomeSources: [stream(60000)] };
    const a = await withSetup(P, [R({ amount: 400000, age: 61 })]);
    const b = await withSetup(P, []);
    near((await stateOf(a.p, 'mi', a.t)) - (await stateOf(b.p, 'mi', b.t)), 42800 * (await rate('mi')), 0.01, 'MI: the draw is taxed at the flat rate');
  }
  // WA (no ordinary income tax): the draw is never taxed.
  {
    const P = { ...H, stateTax: 'wa', ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, dividendYield: 0, incomeSources: [stream(60000)] };
    const a = await withSetup(P, [R({ amount: 400000, age: 61 })]);
    near(await stateOf(a.p, 'wa', a.t), 0, 0.01, 'WA: no state tax on the draw');
  }
  // AR at 50 (heirAnyAge): the inherited amount is excluded up to 6,000 while the filer's own traditional draw is not.
  {
    const P = { ...H, stateTax: 'ar', ageA: 50, ageB: 50, retireAgeA: 50, retireAgeB: 50, taxable: 0, cash: 0, tradIraA: 500000, spending: 60000, dividendYield: 0 };
    const a = await withSetup(P, [R({ amount: 400000, age: 49 })]);
    near(a.r.inheritedDraw, 42800, 0.01, 'AR: the draw');
    assert(a.t > 0, 'AR: the year also draws the own IRA (' + a.t + ')');
    near(await stateOf(a.p, 'ar', a.t), await stateOf(asWages(a.p, 36800), 'ar', a.t), 0.01, 'AR at 50: 6,000 of the draw excluded, the own draw fully taxed');
  }
  // NY after A dies (post-remap slot A): survivor B, A's $400,000 row received at 60 (year 2 draw 45,796 on the survivor's return);
  // inhExclA is the 20,000 cap, B has no pension or IRA draw of their own.
  {
    const P = { ...H, stateTax: 'ny', survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 62, dividendYield: 0 };
    const x = await engine(P, [R({ amount: 400000, age: 60 })]);
    const p = x.trace[2].profile;
    near(x.rows[2].inheritedDraw, 45796, 0.01, 'NY after A dies: the draw');
    assert.strictEqual(p.inhExclA, 20000, 'NY after A dies: inhExclA is the cap on slot A');
    assert.strictEqual(p.inhExclB, 0, 'NY after A dies: nothing on slot B');
    near(await stateOf(p, 'ny', 0), await stateOf(asWages(p, 25796), 'ny', 0), 0.01, 'NY after A dies: 25,796 of the draw taxed');
  }
  // state AGI line (spec 6.4 S8): the draw enters the state's federal-AGI stand-in before it is subtracted.
  // NY (decedent): the Empire State child credit reads the federal AGI: MFJ, both 62, one child aged 10, extraA 100,000, a 20,000 draw:
  // start 120,000, reduction ceil(10,000 / 1,000) x 16.50 = 165, credit 335 while the whole 20,000 is excluded (state AGI 100,000);
  // the twin (no draw, start 100,000) keeps 500: the difference is 165.00.
  {
    const base = { year: 0, filing: 'mfj', singlePerson: false, otherA: 100000, otherB: 0, extraA: 100000, extraB: 0, wageA: 0, wageB: 0, pensionA: 0,
      pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 62, ageB: 62, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0,
      dependents: [{ age: 10, student: false, qualifyingChild: true }] };
    const inhP = { ...base, otherA: 120000, inhOn: true, inheritedA: 20000, inheritedB: 0, inhExtraA: 0, inhExtraB: 0, inhExclA: 20000, inhExclB: 0 };
    near((await stateOf(inhP, 'ny', 0)) - (await stateOf(base, 'ny', 0)), 165, 0.01, 'state AGI line, NY: the draw reaches the child credit\'s AGI test');
  }
  // CT (agiPhasedShare) on a synthetic flat-10% row with CT's retirement table and kind: MFJ table [[0,1],[100000,0.85],[105000,0.7],
  // [110000,0.55],[115000,0.4],...]. extraA 82,000, own IRA draw 10,000: start 92,000, share 1: excluded 10,000, tax 10% x 82,000 =
  // 8,200. With a 20,000 draw: start 112,000, share 0.55 on BOTH the own draw and the draw: excluded 0.55 x 30,000 = 16,500, tax
  // 10% x 95,500 = 9,550. Difference 1,350.
  {
    const res = await page.evaluate(() => {
      const T = window.__test_tax, R2 = T.STATE_RULES, ct = R2.ct;
      R2.zzc = { ...ct, name: 'Synthetic CT', tax: { kind: 'flat', rate: 0.1 }, additions: [], credits: [], standardDeduction: { single: 0, mfj: 0 }, exemption: { single: 0, mfj: 0 },
        dependentExemption: 0, base: { ...ct.base, socialSecurity: 'exempt' }, schedule: [] };
      const prof = { year: 0, filing: 'mfj', singlePerson: false, otherA: 82000, otherB: 0, extraA: 82000, extraB: 0, wageA: 0, wageB: 0, pensionA: 0,
        pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 62, ageB: 62, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [] };
      const stateOnly = (p, t) => window.__test_withState({ stateTax: 'zzc' }, () => T.taxFor({ ...p }, 0, t)) - window.__test_withState({ stateTax: 'tx' }, () => T.taxFor({ ...p }, 0, t));
      const without = stateOnly(prof, 10000);
      const withDraw = stateOnly({ ...prof, otherA: 102000, inhOn: true, inheritedA: 20000, inheritedB: 0, inhExtraA: 0, inhExtraB: 0, inhExclA: 0, inhExclB: 0 }, 10000);
      delete R2.zzc;
      return { without, withDraw };
    });
    near(res.without, 8200, 0.01, 'state AGI line, CT shape: share 1 below the first step');
    near(res.withDraw, 9550, 0.01, 'state AGI line, CT shape: the draw moves the AGI to a share of 0.55 for both amounts');
  }

  // ---- Task 5: the need readers (decisions 15, 16; spec 6.7) ----
  // The recorded need equals the twin run's (no inherited row) in the same year. The twin has the same spending, other income and
  // taxes apart from the draw; its portfolio differs, so compare the need, not the rate.
  const needOf = (e, y) => e.trace[y].guardrails.prevNeed;
  // The two ACA cases: returnRate 0, dividendYield 0 and basisRatio 100 (no growth before a sale, no dividends and no starting gain, so
  // neither run realizes a gain; any one alone is not enough), a not-earned stream for A of $60,000 and spending $90,000, so the twin is
  // in deficit at a MAGI of 60,000, under the 400% line for two (fplForHousehold(2) x 4 = 84,600), and the inherited run is at
  // 60,000 + 42,800 = 102,800, over it. Printed by the run: ACA at 61: MAGI 102,800 vs 60,000, healthcare 18,000 vs 5,678.47.
  const ACA = { acaEnabled: true, returnRate: 0, dividendYield: 0, basisRatio: 100, spending: 90000, medicalInflation: 0,
    incomeSources: [{ amount: 60000, startAge: 50, endAge: 90, followGrowth: false, growth: 0, owner: 'A', kind: 'other' }] };
  for (const [label, patch] of [['TX no ACA', {}], ['ACA at 61', { ...ACA, ageA: 61, ageB: 61 }], ['ACA at 64', { ...ACA, ageA: 64, ageB: 64 }]]) {
    const H2 = { ...H, ...patch, guardrailsEnabled: true, taxable: 600000 };
    // received at A's age - 1: k = 1 this year. TX (7%): max(428,000 x 1.07 / 10 = 45,796, 428,000 / SLT[60] 27.1 = 15,793.36) = 45,796.
    // ACA (0%): max(428,000 / 10 = 42,800, 428,000 / SLT[61] 26.2 = 16,335.88 or / SLT[64] 23.7 = 18,059.07) = 42,800.
    const a = await engine(H2, [R({ amount: 428000, age: H2.ageA - 1, owner: 'A' })]);
    const b = await engine(H2, []);
    if (patch.acaEnabled) assert(a.rows[0].healthcare - b.rows[0].healthcare > 10000, `${label}: the draw costs more than $10,000 of premium credit`);
    near(needOf(a, 0), needOf(b, 0), 0.05, `${label}: recorded need without the inheritance`);
    near(a.sim.firstWithdrawal, b.sim.firstWithdrawal, 0.05, `${label}: firstWithdrawal equals the twin's`);
    if (label === 'TX no ACA') {
      // by hand (MFJ, the code's 2026 figures; worked by the plan reviewers): tax with the draw 10% x (45,796 + 900 ordinary dividends -
      // 32,200) = 1,449.60, taxNoDraw 0, so inhNeedAdj = 45,796 - 1,449.60 = 44,346.40; H keeps its $18,000 flat premium, so
      // flow = 45,796 - 40,000 - 18,000 - 1,449.60 = -13,653.60 (a deficit year); recorded 13,653.60 + 44,346.40 = 58,000.00.
      near(a.trace[0].inhNeedAdj, 44346.4, 0.01, 'TX no ACA: inhNeedAdj by hand');
      near(needOf(a, 0), 58000, 0.05, 'TX no ACA: recorded need 58,000.00');
      near(needOf(b, 0), 58000, 0.05, 'TX no ACA: the twin records 58,000.00');
    }
    if (label === 'ACA at 61') {
      // measured by the plan reviewer with a stream standing in for the draw: twin premium 5,678.47, inherited 18,000; recorded
      // 13,176 + (42,800 - (7,976 - 2,840) - (18,000 - 5,678.47)) = 38,518.47 = the twin's 38,518.47.
      near(a.rows[0].magiProxy, 102800, 0.01, 'ACA at 61: inherited MAGI');
      near(b.rows[0].magiProxy, 60000, 0.01, 'ACA at 61: twin MAGI');
      near(a.rows[0].healthcare, 18000, 0.01, 'ACA at 61: inherited premium');
      near(b.rows[0].healthcare, 5678.47, 0.01, 'ACA at 61: twin premium');
      near(needOf(a, 0), 38518.47, 0.05, 'ACA at 61: recorded need 38,518.47');
      near(needOf(b, 0), 38518.47, 0.05, 'ACA at 61: the twin records 38,518.47');
    }
  }
  // year 10 portfolio (spec 6.7): taxable 1,500,000, spending 60,000, guardrails on, no dividends, basisRatio 100, A's traditional row of
  // 1,530,000 received in year 0 (row age 60): the year-10 draw is the whole account, 1,530,000 x 1.07^10 / 10 = 300,974.16.
  // No twin: the two runs' multipliers diverge before year 10, and the inherited run's year-10 healthcare carries the IRMAA of year 8
  // (decision 16 leaves it in the need on purpose). With ACA off hcNoDraw = healthcare and the tax without the draw is 0 (the only
  // other income is about $1,200 of cash-reserve interest, under the standard deduction), so the recorded need is -flow + inhNeedAdj =
  // the year's expenses.
  {
    const Y = { ...H, taxable: 1500000, spending: 60000, guardrailsEnabled: true, dividendYield: 0, basisRatio: 100 };
    const a = await engine(Y, [R({ amount: 1530000, age: 60 })]);
    const t10 = a.trace[10], r10 = a.rows[10];
    near(r10.inheritedDraw, 300974.16, 0.01, 'year 10 portfolio: the whole account');
    near(t10.guardrails.prevNeed, r10.expenses, 0.05, 'year 10 portfolio: the recorded need is the year\'s own expenses (' + t10.guardrails.prevNeed + ' vs ' + r10.expenses + ')');
    near(t10.guardrails.prevPortfolio, t10.gpBase + r10.inheritedTrad + r10.inheritedRoth + r10.inheritedDraw, 0.01, 'year 10 portfolio: measured before the draw');
    assert(a.trace[11].guardrails.multiplier >= t10.guardrails.multiplier, 'year 10 portfolio: no capital-preservation cut in year 11 (' + a.trace[11].guardrails.multiplier + ' vs ' + t10.guardrails.multiplier + ')');
  }
  // draw-made surplus: a $1,000,000 row received at 59 draws 107,000 in year 0, more than the need; the year is a surplus year and still
  // records, and the record equals the twin's deficit year: 58,000 (spending 40,000 + the 18,000 flat premium; the tax on the 900 of
  // dividends is 0).
  {
    const Sx = { ...H, taxable: 600000, guardrailsEnabled: true };
    const a = await engine(Sx, [R({ amount: 1000000, age: 59 })]);
    const b = await engine(Sx, []);
    near(a.rows[0].inheritedDraw, 107000, 0.01, 'draw-made surplus: the draw');
    assert(a.rows[0].traditionalWithdrawn - a.rows[0].inheritedDraw === 0 && a.rows[0].taxableWithdrawn === 0, 'draw-made surplus: a surplus year (nothing else drawn)');
    assert(b.rows[0].taxableWithdrawn > 0, 'draw-made surplus: the twin is a deficit year');
    near(needOf(a, 0), 58000, 0.05, 'draw-made surplus: records 58,000');
    near(needOf(b, 0), 58000, 0.05, 'draw-made surplus: the twin records 58,000');
    near(a.sim.firstWithdrawal, b.sim.firstWithdrawal, 0.05, 'draw-made surplus: firstWithdrawal equals the twin\'s');
  }
  // lump year: a taxable lump in the same year as a scheduled draw records nothing (E1d decision 7).
  {
    const Lp = { ...H, taxable: 600000, guardrailsEnabled: true };
    const a = await engine(Lp, [R({ amount: 428000, age: 59 }), { amount: 20000, age: 60, flat: true, kind: 'ordinary', owner: 'A' }]);
    assert.strictEqual(a.trace[0].guardrails.prevNeed, null, 'lump year: nothing recorded');
    assert.strictEqual(a.sim.firstWithdrawal, 0, 'lump year: firstWithdrawal stays 0');
  }
  // lambda: the need passed to lambdaEstimate in a draw year equals the twin's. A household with a candidate in reach in year 1
  // (ACA, both 61, traditional 600,000, taxable 100,000, spending 90,000, the cliff plan on); a $50,000 row received at 60 draws every
  // year from year 0 (k = year + 1). Year 1 is before the guardrail multipliers of the two runs can diverge. With the step switched
  // off the inherited run's lambda need is lower by the draw's tax-net amount, so the test does see the adjustment.
  {
    const Lm = { ...H, ageA: 61, ageB: 61, retireAgeA: 61, retireAgeB: 61, acaEnabled: true, medicalInflation: 0, guardrailsEnabled: true,
      spending: 90000, taxable: 100000, tradIraA: 600000, cliffGuardEnabled: true };
    const lam = (rows, off) => page.evaluate(([p, l, o]) => {
      const s = window.__test_getState(), saved = JSON.parse(JSON.stringify(s));
      try {
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, JSON.parse(JSON.stringify(saved)), p, { oneTimeIncome: l });
        window.__test_inhNoNeedAdj(o);
        return window.__test_planTrace().map((t) => t.lambdaNeed);
      } finally { window.__test_inhNoNeedAdj(false); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, saved); }
    }, [Lm, rows, !!off]);
    const row = [R({ amount: 50000, age: 60 })];
    const la = await lam(row), lb = await lam([]), lc = await lam(row, true);
    assert(la[1] !== null && lb[1] !== null, 'lambda: a candidate is in reach in year 1 (' + la[1] + ', ' + lb[1] + ')');
    near(lb[1], 108000, 0.05, "lambda: the twin's need is 108,000 (a pure deficit year)");
    near(la[1], lb[1], 0.05, "lambda: the need equals the twin's (108,000 by hand: spending 90,000 + premium 18,000)");
    assert(Math.abs(lc[1] - lb[1]) > 1000, 'lambda: without the step the need would be lower by the draw (' + lc[1] + ' vs ' + lb[1] + ')');
  }
  // exact restore: in a draw year every key of the trace's profile is Object.is the same as in a run with the step switched off.
  // A draw with cents (123,456.78 x 1.07 / 10 = 13,209.88...) and New York, whose profile carries inhExclA.
  {
    const run = (off) => page.evaluate(([p, l, o]) => {
      const s = window.__test_getState(), saved = JSON.parse(JSON.stringify(s));
      try {
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, JSON.parse(JSON.stringify(saved)), p, { oneTimeIncome: l });
        window.__test_inhNoNeedAdj(o);
        const tr = window.__test_accountTrace();
        return tr.slice(0, 3).map((t) => t.profile);
      } finally { window.__test_inhNoNeedAdj(false); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, saved); }
    }, [{ ...H, stateTax: 'ny', taxable: 600000, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62 }, [R({ amount: 123456.78, age: 61 })], off]);
    const on = await run(false), off = await run(true);
    for (let y = 0; y < 3; y++) {
      const keys = new Set([...Object.keys(on[y]), ...Object.keys(off[y])]);
      for (const k of keys) {
        const same = typeof on[y][k] === 'object' ? JSON.stringify(on[y][k]) === JSON.stringify(off[y][k]) : Object.is(on[y][k], off[y][k]);
        assert(same, `exact restore, year ${y}, profile.${k}: ${JSON.stringify(on[y][k])} vs ${JSON.stringify(off[y][k])}`);
      }
    }
    assert(on[0].inheritedA > 0 && on[0].inheritedA % 1 !== 0, 'exact restore: the draw has cents (' + on[0].inheritedA + ')');
    assert(on[0].inhExclA > 0, 'exact restore: inhExclA is set (' + on[0].inhExclA + ')');
  }
  // call counter: the extra taxFor and healthcareCost run only in a year with a scheduled draw.
  {
    const count = (rows) => page.evaluate(([p, l]) => {
      const s = window.__test_getState(), saved = JSON.parse(JSON.stringify(s));
      try {
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, JSON.parse(JSON.stringify(saved)), p, { oneTimeIncome: l });
        window.__test_inhNoDrawCalls(true);
        window.__test_simulate();
        return window.__test_inhNoDrawCalls(false);
      } finally { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, saved); }
    }, [{ ...H, taxable: 600000 }, rows]);
    assert.strictEqual(await count([]), 0, 'call counter: 0 for a legacy household');
    assert((await count([R({ amount: 428000, age: 59 })])) > 0, 'call counter: above 0 for a run with a scheduled draw');
  }

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('[US] inherited accounts (E1e) tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
