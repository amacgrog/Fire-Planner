// IRMAA is gated on Medicare enrollment, which starts at max(65, retirement
// age) (Batch 2; it used to be age 65 alone). A high earner still working at 66
// is on the employer plan and pays no Part B/D premium or surcharge. Once they
// retire they enroll, and the surcharge is assessed on the MAGI two years
// earlier, which still includes their wages.

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
    ['retireAgeA', 69],
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
  // Working at 66-68: no Medicare, so no premium and no surcharge, however high
  // the wages. Retired at 69 (index 3): enrolls, and the lookback is year 1's
  // MAGI (~$350k of wages, above the $205k single tier floor, below $500k), so
  // the surcharge is the $529.60/month tier = $6,355.20/year.
  for (const i of [0, 1, 2]) {
    assert(rows[i].working, `precondition: still working at ${66 + i}`);
    assert.strictEqual(rows[i].healthcare, 0, `no Medicare or IRMAA while working (age ${66 + i})`);
  }
  assert(!rows[3].working, 'precondition: retired at 69');
  const surcharge = rows[3].healthcare - 5000;
  assert(
    Math.abs(surcharge - 529.6 * 12) < 0.01,
    `IRMAA should start with Medicare, on the wages two years back (surcharge ${surcharge})`,
  );
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  console.log('[US] IRMAA age-gating test passed (none while working, applies once on Medicare)');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
