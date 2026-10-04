// Federal child credits (US, Batch 7B): the Child Tax Credit and the refundable Additional Child
// Tax Credit (children aged 16 or under at year end). Every expected value is worked by hand in
// the comment beside it. Wall clock pinned to 2026 (plan year 0 = tax year 2026), inflation 0
// unless a case says otherwise.
//
// Figures (2026): $2,200 per child, of which at most $1,700 is refundable (15% of earned income
// over $2,500); reduced by $50 per $1,000 (or part) of MAGI over $200,000, $400,000 on a joint
// return (not indexed). The nonrefundable part is limited to the federal income tax.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

function checks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const fails = [];
  const near = (a, b, label) => { if (!(Math.abs(a - b) <= 0.005)) fails.push(label + ': expected ' + b + ', got ' + a); };
  st.inflation = 0;
  st.stateTax = 'tx';
  const kid = (age, o) => Object.assign({ age, student: false, qualifyingChild: true }, o);
  const cc = (deps, filing, magi, fed, earned, yearIndex = 0) => {
    const r = t.childCredits(deps, filing, yearIndex, magi, fed, earned);
    return [r.nonrefundable, r.refundable];
  };
  const eqPair = (got, want, label) => { near(got[0], want[0], label + ' (nonrefundable)'); near(got[1], want[1], label + ' (refundable)'); };

  // --- Nonrefundable part, limited to the tax --------------------------------------------------
  eqPair(cc([kid(5)], 'hoh', 50000, 3000, 50000), [2200, 0], 'one child, tax covers it');
  eqPair(cc([kid(5)], 'hoh', 50000, 1000, 50000), [1000, 1200], 'tax 1,000: 1,000 used, ACTC min(1,200 unused, 1,700, 15% x 47,500)');
  // --- Refundable part (ACTC): min(unused, 1,700 per child, 15% x (earned - 2,500)) -------------
  eqPair(cc([kid(5)], 'hoh', 20000, 500, 20000), [500, 1700], 'tax 500, earned 20,000: unused 1,700; 15% x 17,500 = 2,625 -> 1,700');
  eqPair(cc([kid(5)], 'hoh', 10000, 0, 10000), [0, 1125], 'earned 10,000: 15% x 7,500 = 1,125');
  eqPair(cc([kid(5)], 'hoh', 2500, 0, 2500), [0, 0], 'earned exactly 2,500: nothing');
  eqPair(cc([kid(5)], 'hoh', 2000, 0, 2000), [0, 0], 'earned under 2,500: nothing');
  eqPair(cc([kid(5)], 'hoh', 0, 0, 0), [0, 0], 'no earned income (a retiree): nothing refundable');
  // Two children: cap 2 x 1,700 = 3,400 (earned 30,000: 15% x 27,500 = 4,125; unused 4,400).
  eqPair(cc([kid(5), kid(16)], 'mfj', 30000, 0, 30000), [0, 3400], 'two children, cap 3,400');
  // The refundable piece is limited by the unused credit too: tax 3,000 on two children leaves 1,400.
  eqPair(cc([kid(5), kid(16)], 'mfj', 60000, 3000, 60000), [3000, 1400], 'two children, tax 3,000: unused 1,400');
  // --- Who counts -------------------------------------------------------------------------------
  eqPair(cc([kid(16)], 'hoh', 50000, 3000, 50000), [2200, 0], 'age 16 counts');
  eqPair(cc([kid(17)], 'hoh', 50000, 3000, 50000), [0, 0], 'age 17 does not (Credit for Other Dependents, step 5)');
  eqPair(cc([kid(5, { qualifyingChild: false })], 'hoh', 50000, 3000, 50000), [0, 0], 'not a qualifying child');
  eqPair(cc([], 'hoh', 50000, 3000, 50000), [0, 0], 'no children');
  eqPair(cc(undefined, 'hoh', 50000, 3000, 50000), [0, 0], 'missing list');
  eqPair(cc([kid(0)], 'hoh', 50000, 3000, 50000), [2200, 0], 'a newborn counts');
  // --- Phase-out: $50 per $1,000 (or part) over $200,000 single / HoH / QSS, $400,000 joint -----
  eqPair(cc([kid(5)], 'single', 200000, 50000, 200000), [2200, 0], 'at the single threshold');
  eqPair(cc([kid(5)], 'single', 200001, 50000, 200001), [2150, 0], '$1 over: one step of $50');
  eqPair(cc([kid(5)], 'single', 230000, 50000, 230000), [700, 0], '30 steps: 2,200 - 1,500');
  eqPair(cc([kid(5)], 'single', 244000, 50000, 244000), [0, 0], '44 steps: gone');
  eqPair(cc([kid(5)], 'hoh', 230000, 50000, 230000), [700, 0], 'HoH uses the 200,000 start');
  eqPair(cc([kid(5)], 'qss', 230000, 50000, 230000), [700, 0], 'QSS uses the 200,000 start (single), not 400,000');
  eqPair(cc([kid(5)], 'mfj', 400000, 50000, 400000), [2200, 0], 'MFJ at 400,000');
  eqPair(cc([kid(5)], 'mfj', 410500, 50000, 410500), [1650, 0], 'MFJ 10,500 over -> 11 steps = 550');
  eqPair(cc([kid(5), kid(8)], 'mfj', 450000, 80000, 450000), [1900, 0], 'two children, 50 steps = 2,500 off 4,400');
  // A phased-out credit leaves nothing to refund, however much earned income there is.
  eqPair(cc([kid(5)], 'single', 244000, 0, 244000), [0, 0], 'phased out: no ACTC');
  // --- Indexing: the amounts scale with the tax-index factor; the phase-out thresholds do not ---
  st.inflation = 3;
  const f = t.taxIndexFactor(10);
  eqPair(cc([kid(5)], 'hoh', 50000, 9000, 50000, 10), [2200 * f, 0], 'credit indexed');
  eqPair(cc([kid(5)], 'hoh', 100000, 0, 100000, 10), [0, 1700 * f], 'refundable cap indexed');
  eqPair(cc([kid(5)], 'single', 200001, 50000, 200001, 10), [2200 * f - 50, 0], 'threshold not indexed');
  st.inflation = 0;

  // --- Through taxFor ----------------------------------------------------------------------------
  const prof = (o) =>
    Object.assign({ wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 40, ageB: 40 }, o);
  const deps = [kid(5)];
  // Single parent (HoH), pension 60,000, age 40: tax 3,948 (see filing_status.js) - 2,200.
  near(t.taxFor(prof({ singlePerson: true, filing: 'hoh', otherA: 60000, pensionA: 60000, dependents: deps }), 0, 0), 3948 - 2200, 'HoH 60k, one child');
  // Wages 20,000, HoH: deduction 24,150 > income, federal tax 0; ACTC min(2,200, 1,700, 15% x 17,500 = 2,625) = 1,700,
  // so the tax is NEGATIVE (a refund): -1,700.
  near(t.taxFor(prof({ singlePerson: true, filing: 'hoh', otherA: 20000, wageA: 20000, dependents: deps }), 0, 0), -1700, 'refundable credit makes the tax negative');
  // The same wages from a pension (not earned income) refund nothing.
  near(t.taxFor(prof({ singlePerson: true, filing: 'hoh', otherA: 20000, pensionA: 20000, dependents: deps }), 0, 0), 0, 'pension income is not earned income');
  // MFJ, 120,000 of wages, two children aged 5 and 16: deduction 32,200 -> taxable 87,800:
  //   10% x 24,800 = 2,480 + 12% x 63,000 = 7,560 -> 10,040; credit 4,400 -> 5,640.
  near(t.taxFor(prof({ filing: 'mfj', otherA: 60000, otherB: 60000, wageA: 60000, wageB: 60000, dependents: [kid(5), kid(16)] }), 0, 0), 10040 - 4400, 'MFJ two children');
  // Survivor profile (single person, QSS): 60,000 pension, taxable 27,800 -> 2,840 (see filing_status.js); one child -> 640.
  near(t.taxFor(prof({ singlePerson: true, filing: 'qss', otherA: 60000, pensionA: 60000, dependents: deps }), 0, 0), 2840 - 2200, 'QSS, one child');
  // State tax and NIIT are not reduced by the credit, and the nonrefundable part ignores them:
  //   HoH 150,000 pension + 100,000 gain... not needed; check the federal limit directly instead.
  near(t.taxFor(prof({ singlePerson: true, filing: 'hoh', otherA: 24150, pensionA: 24150, dependents: [kid(1), kid(2), kid(3)] }), 0, 0), 0, 'no income tax, no earned income: nothing refundable');
  return fails;
}

async function engineRows(browser, isoDate, fields, patch) {
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
  await page.evaluate((p) => Object.assign(window.__test_getState(), p), patch);
  await set('spending', 50000);
  await page.waitForTimeout(300);
  const rows = await page.evaluate(() => window.fireProjectionRows.map((r) => ({ age: r.age, tax: r.tax })));
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  await page.close();
  return rows;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const failures = await page.evaluate(`(${checks.toString()})()`);
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  assert.deepStrictEqual(failures, [], 'child credit checks:\n  ' + failures.join('\n  '));
  await page.close();

  // Engine: a single parent aged 61 (past 59.5, so Roth draws are free and the default housing cost
  // is met from the Roth balance) living on a $60,000 income stream (no earned income), one child
  // born 2010. Head of household: tax 3,948 before the credit. The child is 16 in tax year 2026
  // (credit) and 17 in 2027 (no child tax credit).
  const rows = await engineRows(
    browser,
    '2026-06-15T12:00:00Z',
    [
      ['singlePerson', true], ['ageA', 61], ['retireAgeA', 55], ['lifeExpectancyA', 70], ['spending', 50000],
      ['taxable', 0], ['traditional', 0], ['roth', 2000000], ['cash', 0], ['cashReserve', 0], ['dividendYield', 0],
      ['inflation', 0], ['stateTax', 'tx'], ['acaEnabled', false], ['ltcEnabled', false], ['healthcare', 0],
      ['medicareYearly', 0], ['ssMonthlyA', 0], ['hysaRate', 0], ['rent', 0],
    ],
    {
      incomeSources: [{ amount: 60000, startAge: 30, endAge: 100, followGrowth: false, growth: 0 }],
      children: [{ birthYear: 2010, student: false }],
    },
  );
  const near = (a, b, msg) => assert(Math.abs(a - b) < 0.01, `${msg}: got ${a}, expected ${b}`);
  near(rows[0].tax, 3948 - 2200, 'engine 2026: HoH less the child credit');
  near(rows[1].tax, 3948, 'engine 2027: child is 17, no child tax credit');

  console.log('[US] child credits test passed (CTC, ACTC, phase-out, indexing, taxFor, engine)');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
