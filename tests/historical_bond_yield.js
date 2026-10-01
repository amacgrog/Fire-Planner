// Taxable bond interest in the historical backtest / Monte Carlo engine.
//
// Each dataset row carries the Treasury yield at the start of the year as a
// 5th element. Interest on the taxable bond reserve is taxed at that yield, not
// at the "Bond return" input and not at the year's bond total return (which
// includes price change and is negative in many years). Rows without a yield
// (2024-2025) fall back to the year's bond return floored at zero.
//
// Scenario: single retiree, $1M taxable (full basis), 10 years of spending in a
// bond reserve (carved out after the first withdrawal), 0% stocks, no other
// income. With a 10% yield the $300k reserve pays $30,000 of ordinary interest:
// US federal tax = 1,240 + 12% x (30,000 - 16,100 - 12,400) = 1,420.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

async function run(file, isUS) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', file));
  await page.waitForTimeout(300);
  const set = (id, v) =>
    page.evaluate(
      ({ id, v }) => {
        const el = document.getElementById(id);
        if (el.type === 'checkbox') el.checked = v;
        else el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { id, v },
    );
  const base = [
    ['singlePerson', true], ['ageA', 65], ['retireAgeA', 65], ['lifeExpectancyA', 68],
    ['spending', 30000], ['healthcare', 0], ['ltcEnabled', false], ['inflation', 0],
    ['returnRate', 0], ['hysaRate', 0], ['dividendYield', 0],
  ];
  if (isUS) base.push(['medicareYearly', 0], ['acaEnabled', false], ['stateTax', 'tx'], ['ssMonthlyA', 0]);
  else base.push(['cppMonthlyA', 0], ['oasMonthlyA', 0]);
  for (const [i, v] of base) await set(i, v);
  await page.evaluate(() => document.getElementById('rentBtn').click());
  for (const [i, v] of [['rent', 0], ['cash', 0], ['taxable', 1000000], ['basisRatio', 100], ['bondYears', 10]])
    await set(i, v);
  if (isUS) for (const [i, v] of [['traditional', 0], ['roth', 0]]) await set(i, v);
  await page.waitForTimeout(300);

  // Taxable balance after the first full year, given the dataset row.
  const taxableAfter = (assumedBondReturn, bondReturnPct, yieldPct) =>
    set('bondReturn', assumedBondReturn).then(() =>
      page.evaluate(
        ([r, y]) => window.__test_simulateHistorical((k) => [1970 + k, 0, 0, r, y]).rows[1].taxable,
        [bondReturnPct, yieldPct],
      ),
    );

  const none = await taxableAfter(0, -5, 0);
  const ten = await taxableAfter(0, -5, 10);
  // Independent of the planner's own Bond return input.
  assert.strictEqual(await taxableAfter(10, -5, 10), ten, `${file}: bond-return input must not affect historical bond interest tax`);
  assert(none - ten > 100, `${file}: 10% yield should cost tax (no interest ${none}, 10% ${ten})`);
  if (isUS) assert(Math.abs(none - ten - 1420) < 0.01, `${file}: expected $1,420 of tax on $30,000 interest, got ${none - ten}`);

  // No yield in the row: falls back to the bond return floored at zero.
  assert(Math.abs((await taxableAfter(0, -5, null)) - none) < 1e-6, `${file}: negative bond return with no yield should tax no interest`);
  assert(Math.abs((await taxableAfter(0, 10, null)) - (await taxableAfter(0, 10, 10))) < 1e-6, `${file}: positive bond return with no yield should tax at that return`);

  assert.deepStrictEqual(errors, [], `${file}: page errors ${errors}`);
  await browser.close();
  console.log(`[${isUS ? 'US' : 'Canada'}] historical bond-yield test passed`);
}

(async () => {
  await run('Planner_US.html', true);
  await run('Planner_Canada.html', false);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
