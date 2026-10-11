// Batch 7A: the children (dependents) list. Hand-computed expectations for
//  - how normalizeState cleans a saved `children` list (fixed 1950-2100 year bounds, junk rows dropped,
//    cap of 10, a student flag that is true only when it is literally true);
//  - dependentsInYear / qualifyingChildCount (qualifying child: age 18 or under at the end of the tax year,
//    23 or under for a full-time student; a child counts for the whole year of birth; unborn children not yet);
//  - the US ACA household size (adults plus qualifying children) and its effect on the 400%-FPL cliff.
// Default `[]` leaves every projection unchanged; the snapshot suite proves that. The wall clock is pinned
// to 2026, so plan year 0 is tax year 2026.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const PLANNERS = [
  { key: 'US', file: 'Planner_US.html', storage: 'fireCouplePlanner.massachusettsOffline.v1' },
  { key: 'Canada', file: 'Planner_Canada.html', storage: 'fireCouplePlanner.canadaOffline.v1' },
];

// Saved `children` value -> what normalizeState must produce.
const NORMALIZE = [
  ['absent', undefined, []],
  ['wrong type', 'two', []],
  ['empty', [], []],
  [
    'valid, order kept',
    [
      { birthYear: 2015, student: false },
      { birthYear: 2030, student: true },
    ],
    [
      { birthYear: 2015, student: false },
      { birthYear: 2030, student: true },
    ],
  ],
  [
    'junk rows dropped, years clamped to 1950-2100, student only when literally true',
    [{ birthYear: 'x' }, { birthYear: 1900, student: 'yes' }, { birthYear: 2500 }, { student: true }, null, 7, { birthYear: '2012.6', student: true }, { birthYear: null }, { birthYear: '' }, { birthYear: true }],
    [
      { birthYear: 1950, student: false },
      { birthYear: 2100, student: false },
      { birthYear: 2013, student: true },
    ],
  ],
  ['capped at ten', Array.from({ length: 14 }, (_, i) => ({ birthYear: 2000 + i })), Array.from({ length: 10 }, (_, i) => ({ birthYear: 2000 + i, student: false }))],
  ['join year kept when later than the birth year', [{ birthYear: 2027, joinYear: 2032 }], [{ birthYear: 2027, student: false, joinYear: 2032 }]],
  [
    'join year left off, row kept, when not later than the birth year or not a year',
    [
      { birthYear: 2027, joinYear: 2027 },
      { birthYear: 2027, joinYear: 2020 },
      { birthYear: 2027, joinYear: 'x' },
      { birthYear: 2027, joinYear: '' },
      { birthYear: 2027, joinYear: '  ' },
      { birthYear: 2027, joinYear: null },
      { birthYear: 2027, joinYear: true },
      { birthYear: 2027, joinYear: {} },
      { birthYear: 2033, joinYear: 2032 },
    ],
    [
      ...Array.from({ length: 8 }, () => ({ birthYear: 2027, student: false })),
      { birthYear: 2033, student: false },
    ],
  ],
  [
    'join year rounded and clamped like the birth year',
    [
      { birthYear: 2027, joinYear: '2032.4' }, // rounded to 2032
      { birthYear: 2027, joinYear: 2500 }, // clamped to 2100, later than 2027: kept
      { birthYear: 1950, joinYear: 1900 }, // clamped to 1950, not later than 1950: left off
      { birthYear: 1900, joinYear: 1960, student: true }, // birth clamped up to 1950; 1960 > 1950: kept
    ],
    [
      { birthYear: 2027, student: false, joinYear: 2032 },
      { birthYear: 2027, student: false, joinYear: 2100 },
      { birthYear: 1950, student: false },
      { birthYear: 1950, student: true, joinYear: 1960 },
    ],
  ],
];

// Children and the expected dependents in tax year 2026 (age = 2026 - birthYear).
const KIDS = [
  { birthYear: 2027, student: false }, // not born yet: excluded
  { birthYear: 2026, student: false }, // age 0, born this year: a dependent for the whole year
  { birthYear: 2010, student: false }, // 16
  { birthYear: 2009, student: false }, // 17
  { birthYear: 2008, student: false }, // 18: last year as a qualifying child
  { birthYear: 2007, student: false }, // 19, not a student: no longer qualifying
  { birthYear: 2007, student: true }, // 19, student: qualifying
  { birthYear: 2003, student: true }, // 23, student: last year
  { birthYear: 2002, student: true }, // 24: student extension over
  { birthYear: 2002, student: false }, // 24
];
const EXPECT_2026 = [
  { age: 0, student: false, qualifyingChild: true },
  { age: 16, student: false, qualifyingChild: true },
  { age: 17, student: false, qualifyingChild: true },
  { age: 18, student: false, qualifyingChild: true },
  { age: 19, student: false, qualifyingChild: false },
  { age: 19, student: true, qualifyingChild: true },
  { age: 23, student: true, qualifyingChild: true },
  { age: 24, student: true, qualifyingChild: false },
  { age: 24, student: false, qualifyingChild: false },
];

(async () => {
  const browser = await chromium.launch();
  try {
    for (const p of PLANNERS) {
      // ---- normalizeState -----------------------------------------------------------------
      for (const [name, saved, want] of NORMALIZE) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const raw = saved === undefined ? {} : { children: saved };
        await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [p.storage, JSON.stringify({ state: raw, mode: 'real' })]);
        await page.goto('file://' + path.resolve(__dirname, '..', p.file));
        await page.waitForTimeout(150);
        const got = await page.evaluate(() => window.__test_getState().children);
        assert.deepStrictEqual(got, want, `[${p.key}] normalize "${name}"`);
        assert.deepStrictEqual(errors, [], `[${p.key}] page errors: ${errors}`);
        await ctx.close();
      }

      // ---- dependentsInYear -----------------------------------------------------------------
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('file://' + path.resolve(__dirname, '..', p.file));
      await page.waitForTimeout(200);
      const got = await page.evaluate((kids) => {
        const st = window.__test_getState();
        const none = window.__test_children.dependentsInYear(2026);
        st.children = kids;
        return {
          none,
          y2026: window.__test_children.dependentsInYear(2026),
          count2026: window.__test_children.qualifyingChildCount(2026),
          y2027: window.__test_children.dependentsInYear(2027),
        };
      }, KIDS);
      assert.deepStrictEqual(got.none, [], `[${p.key}] no children: no dependents`);
      assert.deepStrictEqual(got.y2026, EXPECT_2026, `[${p.key}] dependents in 2026`);
      assert.strictEqual(got.count2026, 6, `[${p.key}] qualifying children in 2026: 0, 16, 17, 18, 19 student, 23 student`);
      // One year later: the 2027 baby is born (age 0, qualifying), the 2008 child turns 19, the 2003 student turns 24.
      assert.strictEqual(got.y2027.length, 10, `[${p.key}] all ten children exist in 2027`);
      assert.deepStrictEqual(got.y2027.map((d) => d.qualifyingChild), [true, true, true, true, false, false, true, false, false, false], `[${p.key}] qualifying flags in 2027`);
      // E2: a child with a join year counts from that year (spec 6.1); age is still from the birth year.
      const joined = await page.evaluate(() => {
        const st = window.__test_getState();
        const t = window.__test_children;
        const kid = { birthYear: 2027, student: false, joinYear: 2032 };
        st.children = [kid];
        const out = {
          y2026: t.dependentsInYear(2026),
          y2031: t.dependentsInYear(2031),
          y2032: t.dependentsInYear(2032),
          c2031: t.qualifyingChildCount(2031),
          c2032: t.qualifyingChildCount(2032),
        };
        kid.joinYear = 2; // a partly typed year, as a live row can hold it
        out.partial = t.dependentsInYear(2027);
        kid.joinYear = 0; // what the old input handler stored for an empty box
        out.zero = t.dependentsInYear(2027);
        st.children = [{ birthYear: 2033, student: false, joinYear: 2032 }]; // birth year edited past the join year
        out.birthAfter2032 = t.dependentsInYear(2032);
        out.birthAfter2033 = t.dependentsInYear(2033);
        st.children = [
          { birthYear: 2020, student: false },
          { birthYear: 2027, student: false, joinYear: 2032 },
        ];
        out.mixed2031 = t.dependentsInYear(2031).map((d) => d.age);
        out.mixed2032 = t.dependentsInYear(2032).map((d) => d.age);
        st.children = [];
        return out;
      });
      assert.deepStrictEqual(joined.y2026, [], `[${p.key}] joined child: not born in 2026`);
      assert.deepStrictEqual(joined.y2031, [], `[${p.key}] joined child: born 2027, not in the household before 2032`);
      assert.deepStrictEqual(joined.y2032, [{ age: 5, student: false, qualifyingChild: true }], `[${p.key}] joined child: 2032, age 2032 - 2027 = 5`);
      assert.strictEqual(joined.c2031, 0, `[${p.key}] no qualifying child in 2031`);
      assert.strictEqual(joined.c2032, 1, `[${p.key}] one qualifying child in 2032`);
      assert.deepStrictEqual(joined.partial, [{ age: 0, student: false, qualifyingChild: true }], `[${p.key}] join year 2 (typing): from birth`);
      assert.deepStrictEqual(joined.zero, [{ age: 0, student: false, qualifyingChild: true }], `[${p.key}] join year 0: from birth`);
      assert.deepStrictEqual(joined.birthAfter2032, [], `[${p.key}] birth 2033, join 2032: not born in 2032`);
      assert.deepStrictEqual(joined.birthAfter2033, [{ age: 0, student: false, qualifyingChild: true }], `[${p.key}] birth 2033, join 2032: from birth`);
      assert.deepStrictEqual(joined.mixed2031, [11], `[${p.key}] mixed list 2031: only the child born 2020 (age 11)`);
      assert.deepStrictEqual(joined.mixed2032, [12, 5], `[${p.key}] mixed list 2032: ages 12 and 5, list order`);
      assert.deepStrictEqual(errors, [], `[${p.key}] page errors: ${errors}`);
      await page.close();
    }

    // ---- Canada: the CCB starts in the join year (spec 8.1) -------------------------------------
    {
      const cpage = await browser.newPage();
      const cerrors = [];
      cpage.on('pageerror', (e) => cerrors.push(e.message));
      await cpage.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
      await cpage.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
      await cpage.waitForTimeout(300);
      const ca = await cpage.evaluate(() => {
        const st = window.__test_getState();
        Object.assign(st, {
          province: 'on', singlePerson: false, ageA: 40, ageB: 40, retireAgeA: 40, retireAgeB: 40, inflation: 0,
          taxable: 0, traditional: 0, roth: 2000000, cash: 0, cashReserve: 0, bondYears: 0, dividendYield: 0, hysaRate: 0,
          incomeA: 0, incomeB: 0, cppMonthlyA: 0, cppMonthlyB: 0, oasMonthlyA: 0, oasMonthlyB: 0, pensionYearlyA: 0,
          pensionYearlyB: 0, tenure: 'rent', spending: 40000,
        });
        const sameRow = (a, b) =>
          Object.keys(a).length === Object.keys(b).length &&
          Object.keys(a).every((k) => typeof a[k] !== 'number' || Object.is(a[k], b[k]));
        st.children = [{ birthYear: 2025, student: false, joinYear: 2028 }];
        const joined = window.__test_simulate().rows;
        st.children = [];
        const none = window.__test_simulate().rows;
        return {
          ccb: joined.slice(0, 3).map((r) => r.benefitCcb),
          income2: joined[2].grossIncome,
          same01: sameRow(joined[0], none[0]) && sameRow(joined[1], none[1]),
        };
      });
      // Precondition: no CCB reduction below $38,237 of family net income (BENEFIT_RULES.ccb.reduction.from1, factor 1).
      assert(ca.income2 <= 38237, `precondition: 2028 family income ${ca.income2} is under the CCB reduction threshold`);
      assert.deepStrictEqual(ca.ccb, [0, 0, 8157], 'CCB: nothing in 2026-2027, the full under-6 amount (8,157) from the 2028 join year (age 3)');
      assert.strictEqual(ca.same01, true, 'Canada: 2026 and 2027 rows equal the no-children rows, field for field');
      assert.deepStrictEqual(cerrors, [], `Canada page errors: ${cerrors}`);
      await cpage.close();
    }

    // ---- US: ACA household size ---------------------------------------------------------------
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
    await page.waitForTimeout(200);
    const res = await page.evaluate((kids) => {
      window.__test_setCurrentYear(2026);
      const st = window.__test_getState();
      const t = window.__test_children;
      const sizes = {};
      sizes.noKids = [t.acaHouseholdSize(true, false, 0), t.acaHouseholdSize(false, false, 0), t.acaHouseholdSize(false, true, 0)];
      st.children = kids;
      // 6 qualifying children in 2026 (see the table above).
      sizes.withKids2026 = [t.acaHouseholdSize(true, false, 0), t.acaHouseholdSize(false, false, 0), t.acaHouseholdSize(false, true, 0)];
      // Year index 1 is tax year 2027: flags [T,T,T,T,F,F,T,F,F,F] = 5 qualifying.
      sizes.withKids2027 = t.acaHouseholdSize(true, false, 1);

      // Engine: a single retiree on the individual market with a fixed $90,000 income stream. With no
      // children the household is 1 and 400% of the 2026 FPL ($15,650) is $62,600, so $90,000 is over the
      // cliff and the full $20,000 premium is owed. With two children the household is 3: 400% of
      // $15,650 + 2 x $5,500 = $26,650 is $106,600, so the same income gets the subsidy.
      st.inflation = 0;
      st.medicalInflation = 0;
      st.singlePerson = true;
      st.ageA = 50;
      st.retireAgeA = 50;
      st.lifeExpectancyA = 56;
      st.healthcare = 20000;
      st.medicareYearly = 0;
      st.healthPremiumA = 0;
      st.acaEnabled = true;
      st.acaEnhanced = false;
      st.ltcEnabled = false;
      st.stateTax = 'tx';
      st.spending = 30000;
      st.incomeSources = [{ amount: 90000, startAge: 50, endAge: 56, followGrowth: false, growth: 0 }];
      st.children = [];
      const row0 = (retire) => window.__test_simulate(retire, retire).rows[0];
      const none = row0(50);
      st.children = [
        { birthYear: 2020, student: false },
        { birthYear: 2022, student: false },
      ];
      const two = row0(50);
      st.children = [
        { birthYear: 2005, student: false }, // 21 in 2026, not a student: not a dependent
        { birthYear: 2030, student: false }, // not born yet
      ];
      const notDependents = row0(50);
      return { sizes, none: { hc: none.healthcare, magi: none.magiProxy }, two: { hc: two.healthcare, magi: two.magiProxy }, notDependents: { hc: notDependents.healthcare } };
    }, KIDS);
    assert.deepStrictEqual(res.sizes.noKids, [1, 2, 1], 'ACA household with no children: single 1, couple 2, survivor 1');
    assert.deepStrictEqual(res.sizes.withKids2026, [7, 8, 7], 'ACA household adds the 6 qualifying children');
    assert.strictEqual(res.sizes.withKids2027, 6, 'ACA household in 2027 (year index 1): 1 + 5 qualifying children');
    assert(res.none.magi > 62600 && res.none.magi < 106600, `precondition: MAGI ${res.none.magi} is between 400% of FPL for 1 and for 3`);
    assert.strictEqual(res.none.hc, 20000, 'no children: over the 400% cliff, the full premium is owed');
    assert(res.two.hc < 20000 && res.two.hc > 0, `two children: household of 3, same income is under the cliff, subsidy applies (got ${res.two.hc})`);
    assert.strictEqual(res.notDependents.hc, 20000, 'an adult non-student and an unborn child do not change the household');

    // E2, US: every reader of a child's presence follows the join year (spec 8.1).
    const usJoin = await page.evaluate(() => {
      window.__test_setCurrentYear(2026);
      const st = window.__test_getState();
      const t = window.__test_children;
      const tax = window.__test_tax;
      st.inflation = 0;
      st.marryLater = false;
      st.children = [{ birthYear: 2027, student: false, joinYear: 2032 }];
      const r = {
        aca5: t.acaHouseholdSize(true, false, 5), // tax year 2031
        aca6: t.acaHouseholdSize(true, false, 6), // tax year 2032
        med2031: t.hasChildAtMost(2031, 13),
        med2032: t.hasChildAtMost(2032, 13),
        single5: tax.filingStatusFor({ age: 45, singlePerson: true, isSurvivorPeriod: false, year: 5, deathYear: Infinity }).filing,
        single6: tax.filingStatusFor({ age: 46, singlePerson: true, isSurvivorPeriod: false, year: 6, deathYear: Infinity }).filing,
        cc5: tax.childCredits(t.dependentsInYear(2031), 'hoh', 5, 50000, 5000, 50000),
        cc6: tax.childCredits(t.dependentsInYear(2032), 'hoh', 6, 50000, 5000, 50000),
      };
      // Survivor: a married couple, death in plan year 4 (tax year 2030).
      st.filingStatus = 'mfj';
      const surv = (year) => tax.filingStatusFor({ age: 40 + year, singlePerson: false, isSurvivorPeriod: year >= 4, year, deathYear: 4 }).filing;
      r.surv4 = surv(4);
      r.surv5 = surv(5);
      r.surv6 = surv(6);
      st.children = [];
      return r;
    });
    assert.strictEqual(usJoin.aca5, 1, 'ACA household 2031: the child has not joined');
    assert.strictEqual(usJoin.aca6, 2, 'ACA household 2032: 1 adult + the joined child');
    assert.strictEqual(usJoin.med2031, false, 'Medicaid child-13 exemption: no child in the household in 2031');
    assert.strictEqual(usJoin.med2032, true, 'Medicaid child-13 exemption: the joined child (age 5) in 2032');
    assert.strictEqual(usJoin.single5, 'single', 'single person 2031: no qualifying child yet');
    assert.strictEqual(usJoin.single6, 'hoh', 'single person 2032: head of household from the join year');
    assert.deepStrictEqual(usJoin.cc5, { nonrefundable: 0, refundable: 0 }, 'no child credit in 2031');
    // 2032: one CTC child (age 5 <= 16): $2,200 x factor 1 (inflation 0); MAGI $50,000 is under the $200,000 hoh
    // phase-out start; the $5,000 tax absorbs all of it, so nothing is left to refund.
    assert.deepStrictEqual(usJoin.cc6, { nonrefundable: 2200, refundable: 0 }, 'CTC from the join year');
    assert.strictEqual(usJoin.surv4, 'mfj', 'death year 2030: joint');
    assert.strictEqual(usJoin.surv5, 'single', '2031: no qualifying child yet, so no QSS');
    assert.strictEqual(usJoin.surv6, 'qss', '2032: two tax years after the death and the child has joined: QSS');

    const usEngine = await page.evaluate(() => {
      window.__test_setCurrentYear(2026);
      const st = window.__test_getState();
      Object.assign(st, {
        inflation: 0, medicalInflation: 0, singlePerson: true, ageA: 50, retireAgeA: 50, lifeExpectancyA: 56,
        healthcare: 20000, medicareYearly: 0, healthPremiumA: 0, acaEnabled: true, acaEnhanced: false, ltcEnabled: false,
        stateTax: 'tx', spending: 30000,
        incomeSources: [{ amount: 90000, startAge: 50, endAge: 56, followGrowth: false, growth: 0 }],
      });
      const sameRow = (a, b) =>
        Object.keys(a).length === Object.keys(b).length &&
        Object.keys(a).every((k) => typeof a[k] !== 'number' || Object.is(a[k], b[k]));
      const kids = (j1, j2) => [
        { birthYear: 2020, student: false, ...(j1 === undefined ? {} : { joinYear: j1 }) },
        { birthYear: 2022, student: false, ...(j2 === undefined ? {} : { joinYear: j2 }) },
      ];
      // Default run (cliff plan on): the ACA cost by year.
      st.children = kids(2027, 2027);
      const joined = window.__test_simulate(50, 50).rows;
      // Plan off: row 0 (2026) is the no-children row 0.
      const offJoined = window.__test_runPlanMode({ planMode: 'off' }).rows;
      st.children = [];
      const offNone = window.__test_runPlanMode({ planMode: 'off' }).rows;
      // Join years equal to the birth years (a live row can hold them): every row as with no join year.
      st.children = kids(2020, 2022);
      const atBirth = window.__test_simulate(50, 50).rows;
      st.children = kids();
      const fromBirth = window.__test_simulate(50, 50).rows;
      st.children = [];
      return {
        hc0: joined[0].healthcare,
        hc1: joined[1].healthcare,
        magi1: joined[1].magiProxy,
        row0Same: sameRow(offJoined[0], offNone[0]),
        atBirthSame: atBirth.length === fromBirth.length && atBirth.every((r, i) => sameRow(r, fromBirth[i])),
      };
    });
    // 2026: household 1; 400% of $15,650 = $62,600 < MAGI: over the cliff, the full premium.
    assert.strictEqual(usEngine.hc0, 20000, 'joined children: 2026 pays the full premium (household 1)');
    // 2027: household 3; 400% of ($15,650 + 2 x $5,500) = $106,600 > MAGI: the credit applies.
    assert(usEngine.magi1 > 62600 && usEngine.magi1 < 106600, `precondition: 2027 MAGI ${usEngine.magi1} between the two lines`);
    assert(usEngine.hc1 > 0 && usEngine.hc1 < 20000, `joined children: 2027 is subsidized (got ${usEngine.hc1})`);
    // The cliff plan compares whole runs, so the identity is asserted with it off (spec 8.1).
    assert.strictEqual(usEngine.row0Same, true, 'plan off: 2026 row equals the no-children 2026 row, field for field');
    assert.strictEqual(usEngine.atBirthSame, true, 'join year equal to the birth year: every row as from birth');
    assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
    console.log('child dependents tests passed (US + Canada normalize, dependents and join year; US ACA household, filing status, credits and engine; Canada CCB)');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
