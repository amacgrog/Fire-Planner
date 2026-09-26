// Golden-value regression tests.
//
// Unlike the ad-hoc test_*.js scripts in the repo root (gitignored, log-and-eyeball
// scratch checks), these assert exact, hand-derived numbers and exit non-zero on
// failure, so they're safe to run in CI. Each scenario is deliberately built so the
// expected output can be computed by hand from the model's own documented rules
// (see README.md), isolating one piece of the engine at a time:
//
//  1. Pure drawdown: a fully-retired single person with every account zeroed
//     except a Roth/TFSA balance, 0% growth/inflation, and every other income or
//     cost knob (Social Security/CPP/OAS, healthcare, LTC, housing, bridge income)
//     zeroed out. Roth/TFSA withdrawals are tax-free, so each year's balance must
//     drop by exactly the spending figure — a direct check on the withdrawal
//     waterfall and the "no tax on Roth withdrawals" rule.
//
//  2. Pure compounding: a working-age person who never retires within the
//     projection window, with spending/income/all costs zeroed so nothing but the
//     taxable brokerage balance moves. It must compound by exactly
//     (1 + returnRate)^year each year — a direct check that no tax or contribution
//     logic is silently touching the balance during pure accumulation.
//
// If either of these ever drifts, the model's core arithmetic has changed.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const setInput = (page, id, value) =>
  page.evaluate(
    ({ id, value }) => {
      const el = document.getElementById(id);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { id, value },
  );

const setChecked = (page, id, checked) =>
  page.evaluate(
    ({ id, checked }) => {
      const el = document.getElementById(id);
      el.checked = checked;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { id, checked },
  );

const click = (page, id) => page.evaluate((id) => document.getElementById(id).click(), id);

const EPS = 0.01; // one cent, to absorb floating-point rounding only

function assertClose(actual, expected, label) {
  const diff = Math.abs(actual - expected);
  assert(
    diff < Math.max(EPS, Math.abs(expected) * 1e-9),
    `${label}: expected ${expected}, got ${actual} (diff ${diff})`,
  );
}

async function testDrawdown(file, label, ssFields) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(200);

  await setChecked(page, 'singlePerson', true);
  await setInput(page, 'ageA', 65);
  await setInput(page, 'retireAgeA', 65);
  await setInput(page, 'lifeExpectancyA', 75);
  await setInput(page, 'spending', 40000);
  await setInput(page, 'inflation', 0);
  await setInput(page, 'returnRate', 0);
  await setInput(page, 'bondReturn', 0);
  await setInput(page, 'hysaRate', 0);
  await setInput(page, 'healthcare', 0);
  await setChecked(page, 'ltcEnabled', false);
  for (const [id, value] of ssFields) {
    if (typeof value === 'boolean') await setChecked(page, id, value);
    else await setInput(page, id, value);
  }
  await click(page, 'rentBtn');
  await setInput(page, 'rent', 0);
  await setInput(page, 'taxable', 0);
  await setInput(page, 'traditional', 0);
  await setInput(page, 'cash', 0);
  await setInput(page, 'roth', 500000);
  await setInput(page, 'bondYears', 0);
  await page.waitForTimeout(200);

  const rows = await page.evaluate(() => window.fireProjectionRows);
  assert(Array.isArray(rows) && rows.length === 11, `${label} drawdown: expected 11 rows, got ${rows?.length}`);
  for (let i = 0; i < rows.length; i++) {
    const expected = 500000 - 40000 * (i + 1);
    assertClose(rows[i].roth, expected, `${label} drawdown year ${i} roth/TFSA balance`);
    assertClose(rows[i].total, expected, `${label} drawdown year ${i} total assets`);
    assertClose(rows[i].taxable, 0, `${label} drawdown year ${i} taxable (should stay 0)`);
    assertClose(rows[i].traditional, 0, `${label} drawdown year ${i} traditional (should stay 0)`);
  }
  const depletedAge = await page.evaluate(() => window.fireProjection.depletedAge);
  assert.strictEqual(depletedAge, null, `${label} drawdown: portfolio should never deplete, got depletedAge=${depletedAge}`);

  console.log(`[${label}] drawdown golden test passed (11 years, exact match to the cent)`);
  console.log(`[${label}] drawdown errors:`, errors.length ? errors : 'none');
  await browser.close();
  return errors;
}

async function testCompounding(file, label, ssFields) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(200);

  await setChecked(page, 'singlePerson', true);
  await setInput(page, 'ageA', 40);
  await setInput(page, 'retireAgeA', 90);
  await setInput(page, 'lifeExpectancyA', 50);
  await setInput(page, 'incomeA', 0);
  await setInput(page, 'spending', 0);
  await setInput(page, 'inflation', 0);
  await setInput(page, 'returnRate', 8);
  await setInput(page, 'bondReturn', 0);
  await setInput(page, 'hysaRate', 0);
  await setInput(page, 'healthcare', 0);
  await setChecked(page, 'ltcEnabled', false);
  for (const [id, value] of ssFields) {
    if (typeof value === 'boolean') await setChecked(page, id, value);
    else await setInput(page, id, value);
  }
  await click(page, 'rentBtn');
  await setInput(page, 'rent', 0);
  await setInput(page, 'taxable', 100000);
  await setInput(page, 'traditional', 0);
  await setInput(page, 'roth', 0);
  await setInput(page, 'cash', 0);
  await setInput(page, 'bondYears', 0);
  await page.waitForTimeout(200);

  const rows = await page.evaluate(() => window.fireProjectionRows);
  assert(Array.isArray(rows) && rows.length === 11, `${label} compounding: expected 11 rows, got ${rows?.length}`);
  for (let i = 0; i < rows.length; i++) {
    const expected = 100000 * Math.pow(1.08, i + 1);
    assertClose(rows[i].taxable, expected, `${label} compounding year ${i} taxable balance`);
  }

  console.log(`[${label}] compounding golden test passed (11 years, 8% compounding to the cent)`);
  console.log(`[${label}] compounding errors:`, errors.length ? errors : 'none');
  await browser.close();
  return errors;
}

(async () => {
  const allErrors = [];
  allErrors.push(...(await testDrawdown('Planner_US.html', 'US', [
    ['ssMonthlyA', 0],
  ])));
  allErrors.push(...(await testCompounding('Planner_US.html', 'US', [
    ['ssMonthlyA', 0],
  ])));
  allErrors.push(...(await testDrawdown('Planner_Canada.html', 'Canada', [
    ['cppMonthlyA', 0],
    ['oasMonthlyA', 0],
  ])));
  allErrors.push(...(await testCompounding('Planner_Canada.html', 'Canada', [
    ['cppMonthlyA', 0],
    ['oasMonthlyA', 0],
  ])));

  if (allErrors.length) {
    console.error('Console/page errors encountered during golden tests:', allErrors);
    process.exit(1);
  }
  console.log('\nAll golden-value tests passed.');
})().catch((err) => {
  console.error('GOLDEN TEST FAILURE:', err.message);
  process.exit(1);
});
