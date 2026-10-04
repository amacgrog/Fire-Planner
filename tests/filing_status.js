// US filing status over the years (Batch 7B). Engine-level, hand-computed, wall
// clock pinned to 2026 (plan year 0 = tax year 2026), inflation 0 so every
// threshold stays at its 2026 value, state tax none, no investments.
//
// Step 2 (death-year MFJ): the survivor files jointly for the year of death
// (IRC 6013(a)(3)) and single afterwards. A couple aged 70 and 70 lives on a
// $60,000 income stream (spending $70,000, the gap met from a Roth balance so it adds no income); one partner dies in plan year 2 (tax year 2028).
//   2028 MFJ: standard 32,200 + 2 x 1,650 = 35,500; senior 2 x 6,000 = 12,000 (MAGI
//     60,000 is under the 150,000 start); taxable 60,000 - 47,500 = 12,500 -> 10% = 1,250.
//   2029 single (age 73 survivor): senior deduction gone; standard 16,100 + 2,050 = 18,150;
//     taxable 41,850 -> 1,240 + 12% x 29,450 = 4,774.
// The same numbers must come out whichever partner dies (the deceased's age is
// carried through the remap so the death-year deduction does not depend on it).

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

async function openPlanner(browser, isoDate, fields, patchState) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(isoDate) });
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const set = (id, v) =>
    page.evaluate(
      ({ id, v }) => {
        const e = document.getElementById(id);
        if (e.type === 'checkbox') e.checked = v;
        else e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { id, v },
    );
  for (const [id, v] of translateFieldList(fields, true)) await set(id, v);
  await page.evaluate((patch) => Object.assign(window.__test_getState(), patch), patchState || {});
  await set('spending', 70000);
  await page.waitForTimeout(300);
  return { page, errors, set };
}

const BASE = [
  ['singlePerson', false], ['ageA', 70], ['ageB', 70], ['retireAgeA', 60], ['retireAgeB', 60],
  ['lifeExpectancyA', 80], ['lifeExpectancyB', 80], ['incomeA', 0], ['incomeB', 0], ['spending', 70000],
  ['taxable', 0], ['traditional', 0], ['roth', 2000000], ['cash', 0], ['cashReserve', 0], ['dividendYield', 0],
  ['inflation', 0], ['stateTax', 'tx'], ['acaEnabled', false], ['ltcEnabled', false], ['healthcare', 0],
  ['medicareYearly', 0], ['ssMonthlyA', 0], ['ssMonthlyB', 0], ['hysaRate', 0], ['rent', 0],
];
const STREAM = [{ amount: 60000, startAge: 60, endAge: 100, followGrowth: false, growth: 0 }];

// ---- Step 3: head of household and qualifying surviving spouse --------------------------------
// Runs in the page (2026 clock, inflation 0). Every expected value is worked by hand in its comment.
function filingChecks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const fails = [];
  const eq = (a, b, label) => { if (a !== b) fails.push(label + ': expected ' + b + ', got ' + a); };
  const near = (a, b, label) => { if (!(Math.abs(a - b) <= 0.005)) fails.push(label + ': expected ' + b + ', got ' + a); };
  st.inflation = 0;
  st.stateTax = 'tx';
  const status = (year, o) =>
    t.filingStatusFor(Object.assign({ age: 60 + year, singlePerson: false, isSurvivorPeriod: false, year, deathYear: Infinity }, o)).filing;

  // Timeline. The couple is married (MFJ), the death is in plan year 3 (tax year 2029).
  st.filingStatus = 'mfj';
  st.marryLater = false;
  const surv = (year) => status(year, { isSurvivorPeriod: year >= 3, deathYear: 3 });
  // Child born 2012 (age 17 in 2029, 18 in 2030, 19 in 2031), not a student: qualifying through 2030.
  st.children = [{ birthYear: 2012, student: false }];
  eq(surv(2), 'mfj', 'alive, married');
  eq(surv(3), 'mfj', 'death year (2029) is joint');
  eq(surv(4), 'qss', '2030: child is 18, QSS');
  eq(surv(5), 'single', '2031: child is 19, no longer qualifying -> single');
  eq(surv(6), 'single', '2032: single');
  // Same child as a full-time student (qualifying through age 23 = 2035).
  st.children = [{ birthYear: 2012, student: true }];
  eq(surv(4), 'qss', 'student 2030: QSS');
  eq(surv(5), 'qss', 'student 2031: second QSS year');
  eq(surv(6), 'hoh', 'student 2032: window over, HoH');
  eq(surv(9), 'hoh', 'student 2035 (age 23): HoH');
  eq(surv(10), 'single', 'student 2036 (age 24): single');
  // No children: single right after the death year.
  st.children = [];
  eq(surv(3), 'mfj', 'no children, death year');
  eq(surv(4), 'single', 'no children, after');
  // An unmarried couple has no joint year and no QSS: the survivor is single (or HoH).
  st.filingStatus = 'single';
  eq(surv(3), 'single', 'unmarried couple, death year, no children');
  st.children = [{ birthYear: 2012, student: true }];
  eq(surv(3), 'hoh', 'unmarried couple, death year, child');
  eq(surv(4), 'hoh', 'unmarried couple, after');
  // Not a survivor: an unmarried couple is two separate filers (household status single).
  eq(status(0), 'single', 'unmarried couple, alive');
  // marryLater: single filers until Partner A reaches the marriage age; death before it is not a joint year.
  st.filingStatus = 'mfj';
  st.marryLater = true;
  st.marriageAgeA = 63;
  st.children = [];
  eq(status(2), 'single', 'marryLater, age 62');
  eq(status(3), 'mfj', 'marryLater, age 63');
  eq(status(2, { isSurvivorPeriod: true, deathYear: 2 }), 'single', 'death before the wedding: no joint year');
  eq(status(3, { isSurvivorPeriod: true, deathYear: 3 }), 'mfj', 'death in the wedding year: joint');
  st.marryLater = false;
  // A single person: HoH only while a qualifying child exists (born 2030: from 2030, age 0).
  st.children = [{ birthYear: 2030, student: false }];
  eq(status(3, { singlePerson: true }), 'single', 'single person, child not yet born (2029)');
  eq(status(4, { singlePerson: true }), 'hoh', 'single person, newborn (2030)');
  eq(status(22, { singlePerson: true }), 'hoh', 'single person, child 18 (2048)');
  eq(status(23, { singlePerson: true }), 'single', 'single person, child 19 (2049)');
  st.children = [];

  // Thresholds by hand (2026 figures, Rev. Proc. 2025-32 via secondary sources).
  const prof = (o) =>
    Object.assign({ wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 40, ageB: 40 }, o);
  // Standard deduction: HoH 24,150 (+2,050 at 65); QSS is the MFJ 32,200 with the married 1,650 add-on.
  near(t.standardDeduction('hoh', 0, []), 24150, 'HoH standard');
  near(t.standardDeduction('hoh', 0, [70]), 26200, 'HoH 65+');
  near(t.standardDeduction('qss', 0, []), 32200, 'QSS standard');
  near(t.standardDeduction('qss', 0, [70]), 33850, 'QSS 65+ gets the married add-on');
  // HoH age 40, 60,000: taxable 35,850 -> 10% x 17,700 = 1,770 + 12% x 18,150 = 2,178.
  near(t.taxFor(prof({ singlePerson: true, filing: 'hoh', otherA: 60000, pensionA: 60000 }), 0, 0), 3948, 'HoH 60k');
  // HoH age 70: deduction 24,150 + 2,050 + senior 6,000 (start 75,000) = 32,200; taxable 27,800
  //   -> 1,770 + 12% x 10,100 = 1,212.
  near(t.taxFor(prof({ singlePerson: true, filing: 'hoh', ageA: 70, otherA: 60000, pensionA: 60000 }), 0, 0), 2982, 'HoH 70, 60k');
  // QSS age 40, 60,000: taxable 60,000 - 32,200 = 27,800 on the MFJ brackets -> 10% x 24,800 = 2,480 + 12% x 3,000 = 360.
  near(t.taxFor(prof({ singlePerson: true, filing: 'qss', otherA: 60000, pensionA: 60000 }), 0, 0), 2840, 'QSS 60k');
  // QSS age 70: deduction 32,200 + 1,650 + senior 6,000 = 39,850; taxable 20,150 -> 2,015.
  near(t.taxFor(prof({ singlePerson: true, filing: 'qss', ageA: 70, otherA: 60000, pensionA: 60000 }), 0, 0), 2015, 'QSS 70, 60k');
  // The senior phase-out starts at the single 75,000 for QSS (150,000 only for a joint return):
  //   QSS 70 with 125,000: senior 6,000 - 6% x 50,000 = 3,000.
  near(t.seniorDeduction('qss', 0, [70], 125000), 3000, 'QSS senior phase-out uses the single start');
  near(t.seniorDeduction('mfj', 0, [70, 60], 125000), 6000, 'MFJ senior phase-out starts at 150,000');
  // Social Security: QSS uses the single 25,000 / 34,000 bases. Benefits 24,000 + other 20,000:
  //   provisional 20,000 + 12,000 = 32,000 -> min(12,000, 50% x 7,000) = 3,500 (MFJ would be 0).
  near(t.taxableSocialSecurity(24000, 20000, 'qss'), 3500, 'QSS Social Security bases');
  near(t.taxableSocialSecurity(24000, 20000, 'mfj'), 0, 'MFJ Social Security bases');
  // NIIT: QSS 250,000 (IRC 1411(b)(1)), HoH 200,000. MAGI 240,000, investment income 50,000.
  near(t.niitTax(240000, 50000, 'qss'), 0, 'QSS NIIT threshold');
  near(t.niitTax(240000, 50000, 'hoh'), 1520, 'HoH NIIT: 3.8% x min(50,000, 40,000)');
  // Additional Medicare Tax: the 200,000 threshold for HoH and QSS (only a joint return gets 250,000).
  near(t.additionalMedicareTax(300000, 0, 'qss'), 900, 'QSS Additional Medicare Tax');
  near(t.additionalMedicareTax(300000, 0, 'hoh'), 900, 'HoH Additional Medicare Tax');
  near(t.additionalMedicareTax(300000, 0, 'mfj'), 450, 'MFJ Additional Medicare Tax');
  // IRMAA: MAGI 120,000 is tier 1 on the single table (109,000-137,000: 95.70 x 12) and below the joint 218,000.
  near(t.irmaaSurcharge(120000, 'qss', 0), 1148.4, 'QSS IRMAA single table');
  near(t.irmaaSurcharge(120000, 'hoh', 0), 1148.4, 'HoH IRMAA single table');
  near(t.irmaaSurcharge(120000, 'mfj', 0), 0, 'MFJ IRMAA');
  // Long-term gains, HoH: 100,000 gain, no ordinary income. Standard deduction 24,150 shelters part
  //   (gain 75,850); 0% to 66,200; the other 9,650 at 15% = 1,447.50.
  near(t.longTermGainTax(100000, 0, 0, 'hoh'), 1447.5, 'HoH gain bands');
  // Two separate filers with a child: Partner A (who claims it) files HoH, B files single.
  //   A: 60,000 - 24,150 = 35,850 -> 3,948.  B: 60,000 - 16,100 = 43,900 -> 1,240 + 12% x 31,500 = 5,020.
  const kid = [{ age: 5, student: false, qualifyingChild: true }];
  near(t.taxFor(prof({ filing: 'single', singlePerson: false, otherA: 60000, otherB: 60000, wageA: 60000, wageB: 60000, dependents: kid }), 0, 0), 3948 + 5020 - 2200, 'two filers, A claims the child (HoH, then the 2,200 child credit on A)');
  near(t.taxFor(prof({ filing: 'single', singlePerson: false, otherA: 60000, otherB: 60000, wageA: 60000, wageB: 60000 }), 0, 0), 2 * 5020, 'two filers, no child');
  return fails;
}

async function rows(page) {
  return page.evaluate(() => window.fireProjectionRows.map((r) => ({ ...r })));
}

(async () => {
  const browser = await chromium.launch();
  const near = (a, b, msg) => assert(Math.abs(a - b) < 0.01, `${msg}: got ${a}, expected ${b}`);

  // ---- Step 2: death-year MFJ -------------------------------------------------
  for (const deceased of ['A', 'B']) {
    const { page, errors } = await openPlanner(
      browser,
      '2026-06-15T12:00:00Z',
      [...BASE, ['survivorEnabled', true], ['survivorDeathAge', 72], ['survivorSpendingPct', 70]],
      { incomeSources: STREAM, survivorPartner: deceased },
    );
    const r = await rows(page);
    assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
    near(r[0].tax, 1250, `${deceased}: MFJ before the death`);
    near(r[2].tax, 1250, `${deceased} dies: the death year is still joint`);
    near(r[3].tax, 4774, `${deceased} dies: single the year after`);
    near(r[4].tax, 4774, `${deceased} dies: single two years after`);
    await page.close();
  }
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
    await page.waitForTimeout(300);
    const failures = await page.evaluate(`(${filingChecks.toString()})()`);
    assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
    assert.deepStrictEqual(failures, [], 'filing status checks:\n  ' + failures.join('\n  '));
    await page.close();
  }
  console.log('[US] filing status tests passed (death-year MFJ, HoH, QSS timeline and thresholds)');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
