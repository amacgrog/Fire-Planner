// IRMAA is gated on Medicare age (65+), not on retirement status. A high
// earner who is still working at 66 pays the Part B/D surcharge on a MAGI
// that includes their wages (two-year lookback).

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
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
  for (const [id, v] of [
    ['singlePerson', true],
    ['ageA', 66],
    ['retireAgeA', 72],
    ['lifeExpectancyA', 72],
    ['incomeA', 350000],
    ['spending', 60000],
    ['medicareYearly', 5000],
    ['medicalInflation', 0],
    ['inflation', 0],
    ['dividendYield', 0],
    ['stateTax', 'tx'],
    ['acaEnabled', false],
    ['ltcEnabled', false],
  ])
    await set(id, v);
  await page.waitForTimeout(250);
  const rows = await page.evaluate(() => window.fireProjectionRows);
  // MAGI is ~$350k (above the $205k single tier floor, below $500k), so the
  // surcharge is the $529.60/month tier = $6,355.20/year. Years 0-1 look back
  // to year 0 MAGI; by year 3 the lookback is two years of wages.
  assert(rows[3].working, 'precondition: still working at 69');
  const surcharge = rows[3].healthcare - 5000;
  assert(
    Math.abs(surcharge - 529.6 * 12) < 0.01,
    `IRMAA should apply to a working 69-year-old with $350k wages (surcharge ${surcharge})`,
  );
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  console.log('[US] IRMAA age-gating test passed (surcharge applies while still working)');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
