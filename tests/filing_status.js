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
  console.log('[US] filing status tests passed (death-year MFJ)');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
