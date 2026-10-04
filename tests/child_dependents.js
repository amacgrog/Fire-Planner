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
      assert.deepStrictEqual(errors, [], `[${p.key}] page errors: ${errors}`);
      await page.close();
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
    assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
    console.log('child dependents tests passed (US + Canada normalize and dependents; US ACA household size)');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
