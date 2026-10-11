// IRMAA startup history + exact CMS threshold boundaries.
//  1. The surcharge in plan years 0 and 1 is assessed on the household's own
//     MAGI from before the plan (irmaaPriorKnown), not on a simulated stand-in;
//     from year 2 on the simulation's own MAGI is used.
//  2. The top-tier boundary is exact: $500,000 single / $750,000 MFJ is the top
//     tier ("or above"), one cent less is the tier below.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
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

  // --- Boundaries (year 0: CPI index factor is 1) ---
  const tax = await page.evaluate(() => {
    const t = window.__test_tax;
    return {
      mfjTop: t.irmaaSurcharge(750000, 'mfj', 0),
      mfjJustBelow: t.irmaaSurcharge(749999.99, 'mfj', 0),
      singleTop: t.irmaaSurcharge(500000, 'single', 0),
      singleJustBelow: t.irmaaSurcharge(499999.99, 'single', 0),
      singleFloor: t.irmaaSurcharge(109000, 'single', 0),
      singleFloorPlus: t.irmaaSurcharge(109000.01, 'single', 0),
      mfjFloor: t.irmaaSurcharge(218000, 'mfj', 0),
      mfjFloorPlus: t.irmaaSurcharge(218000.01, 'mfj', 0),
      tier4Edge: t.irmaaSurcharge(205000, 'single', 0),
      tier4EdgePlus: t.irmaaSurcharge(205000.01, 'single', 0),
      ceilTier5Single: t.irmaaTierCeiling(300000, 'single', 0),
      ceilTier5Mfj: t.irmaaTierCeiling(600000, 'mfj', 0),
      ceilTier4Single: t.irmaaTierCeiling(200000, 'single', 0),
      ceilTop: t.irmaaTierCeiling(900000, 'mfj', 0),
    };
  });
  assert.strictEqual(tax.mfjTop, 578.0 * 12, 'MFJ $750,000 is the top tier');
  assert.strictEqual(tax.mfjJustBelow, 529.6 * 12, 'MFJ $749,999.99 is the tier below');
  assert.strictEqual(tax.singleTop, 578.0 * 12, 'single $500,000 is the top tier');
  assert.strictEqual(tax.singleJustBelow, 529.6 * 12, 'single $499,999.99 is the tier below');
  assert.strictEqual(tax.singleFloor, 0, 'single $109,000 pays no surcharge (up to and including)');
  assert.strictEqual(tax.singleFloorPlus, 95.7 * 12);
  assert.strictEqual(tax.mfjFloor, 0);
  assert.strictEqual(tax.mfjFloorPlus, 95.7 * 12);
  assert.strictEqual(tax.tier4Edge, 385.0 * 12, 'lower tiers include their upper bound');
  assert.strictEqual(tax.tier4EdgePlus, 529.6 * 12);
  assert.strictEqual(tax.ceilTier5Single, 499999.99, 'tier ceiling is one cent under the exclusive bound');
  assert.strictEqual(tax.ceilTier5Mfj, 749999.99);
  assert.strictEqual(tax.ceilTier4Single, 205000, 'inclusive bounds are their own ceiling');
  assert.strictEqual(tax.ceilTop, Infinity);

  // --- Startup history: a retired 67-year-old living on a modest portfolio ---
  for (const [id, v] of translateFieldList([
    ['singlePerson', true],
    ['ageA', 67],
    ['retireAgeA', 67],
    ['lifeExpectancyA', 72],
    ['incomeA', 0],
    ['spending', 40000],
    ['taxable', 1500000],
    ['traditional', 0],
    ['roth', 0],
    ['cash', 0],
    ['medicareYearly', 5000],
    ['medicalInflation', 0],
    ['inflation', 0],
    ['dividendYield', 0],
    ['ssMonthlyA', 0],
    ['stateTax', 'tx'],
    ['acaEnabled', false],
    ['ltcEnabled', false],
  ], true))
    await set(id, v);
  await page.waitForTimeout(250);
  const surcharges = async () =>
    (await page.evaluate(() => window.fireProjectionRows)).map((r) => r.healthcare - 5000);
  const base = await surcharges();
  assert(base.slice(0, 4).every((x) => Math.abs(x) < 0.01), `no surcharge on a low-income plan (${base})`);

  await set('irmaaPriorKnown', true);
  await set('irmaaMagiPrior2', 250000); // tier $529.60/mo
  await set('irmaaMagiPrior1', 150000); // tier $240.40/mo
  await page.waitForTimeout(250);
  const withHistory = await surcharges();
  assert(Math.abs(withHistory[0] - 529.6 * 12) < 0.01, `year 0 uses MAGI two years ago (${withHistory[0]})`);
  assert(Math.abs(withHistory[1] - 240.4 * 12) < 0.01, `year 1 uses MAGI last year (${withHistory[1]})`);
  assert(Math.abs(withHistory[2]) < 0.01, `year 2 reverts to simulated MAGI (${withHistory[2]})`);

  await set('irmaaPriorKnown', false);
  await page.waitForTimeout(250);
  const off = await surcharges();
  assert(Math.abs(off[0]) < 0.01 && Math.abs(off[1]) < 0.01, 'unchecking restores the stand-in behavior');
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  console.log('[US] IRMAA startup-history and exact-threshold tests passed');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
