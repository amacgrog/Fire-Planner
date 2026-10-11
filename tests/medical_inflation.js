// Healthcare and long-term-care costs grow at CPI plus state.medicalInflation
// (percentage points above inflation). With CPI pinned to 0%, the year-k
// cost is exactly the entered amount compounded at the medical rate alone.

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

const root = path.resolve(__dirname, '..');

async function rows(file, isUS, fields) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + file);
  await page.waitForTimeout(200);
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
  const base = [
    ['singlePerson', true],
    ['ageA', 65],
    ['retireAgeA', 65],
    ['lifeExpectancyA', 70],
    ['spending', 30000],
    ['inflation', 0],
    ['returnRate', 0],
    ['bondReturn', 0],
    ['hysaRate', 0],
    ['dividendYield', 0],
  ];
  if (isUS) base.push(['stateTax', 'tx'], ['ssMonthlyA', 0], ['acaEnabled', false]);
  else base.push(['cppMonthlyA', 0], ['oasMonthlyA', 0]);
  for (const [id, v] of base) await set(id, v);
  await page.evaluate(() => document.getElementById('rentBtn').click());
  for (const [id, v] of translateFieldList([
    ['rent', 0],
    ['traditional', 0],
    ['cash', 0],
    ['bondYears', 0],
    ['taxable', 0],
    ['roth', 2000000],
  ], isUS, { single: true }))
    await set(id, v);
  for (const [id, v] of fields) await set(id, v);
  await page.waitForTimeout(250);
  const out = await page.evaluate(() => window.fireProjectionRows);
  await browser.close();
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  return out;
}

const near = (a, e, label) => assert(Math.abs(a - e) < 0.01, `${label}: expected ${e}, got ${a}`);

(async () => {
  // US: Medicare + LTC, 3 points above a 0% CPI.
  let r = await rows(plannerPath('Planner_US.html', root), true, [
    ['medicalInflation', 3],
    ['medicareYearly', 10000],
    ['healthcare', 0],
    ['ltcEnabled', true],
    ['ltcYearlyA', 20000],
    ['ltcAgeA', 65],
  ]);
  for (let k = 0; k < 4; k++) {
    near(r[k].healthcare, 10000 * Math.pow(1.03, k), `US Medicare year ${k}`);
    near(r[k].ltc, 20000 * Math.pow(1.03, k), `US LTC year ${k}`);
  }
  // Zero extra growth reproduces the old flat-CPI behavior exactly.
  r = await rows(plannerPath('Planner_US.html', root), true, [
    ['medicalInflation', 0],
    ['medicareYearly', 10000],
    ['healthcare', 0],
  ]);
  near(r[3].healthcare, 10000, 'US Medicare with no extra growth');
  console.log('[US] medical inflation test passed');

  // Canada: supplemental healthcare + LTC.
  r = await rows(plannerPath('Planner_Canada.html', root), false, [
    ['medicalInflation', 3],
    ['healthcare', 6000],
    ['ltcEnabled', true],
    ['ltcYearlyA', 20000],
    ['ltcAgeA', 65],
  ]);
  for (let k = 0; k < 4; k++) {
    near(r[k].healthcare, 6000 * Math.pow(1.03, k), `Canada healthcare year ${k}`);
    near(r[k].ltc, 20000 * Math.pow(1.03, k), `Canada LTC year ${k}`);
  }
  console.log('[Canada] medical inflation test passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
