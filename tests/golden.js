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
//     cost knob (Social Security/CPP/OAS, healthcare, LTC, housing, additional income)
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
const { setBalance } = require('./legacy_balances');

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

// `benefitPerYear` is the tax-free income-tested benefit a person with no income receives each year. Canada: the
// Canada Groceries and Essentials Benefit pays a single person with no income 445 a year (Income Tax Act
// 122.5(3.005) as enacted by Bill C-19: 445 for the individual; the 2 percent single supplement is nil at zero
// income; no indexation here because inflation is 0). The US has none.
async function testDrawdown(file, label, ssFields, benefitPerYear = 0) {
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
  // Dividends are taxed every year, so the hand-derivable scenarios below
  // switch them off to isolate the one piece of the engine each one tests.
  await setInput(page, 'dividendYield', 0);
  await setInput(page, 'healthcare', 0);
  // US-only field (Canada has no Medicare Part B/D concept); guard so this
  // shared helper still works against Planner_Canada.html.
  if (await page.evaluate(() => !!document.getElementById('medicareYearly'))) {
    await setInput(page, 'medicareYearly', 0);
  }
  await setChecked(page, 'ltcEnabled', false);
  for (const [id, value] of ssFields) {
    if (typeof value === 'boolean') await setChecked(page, id, value);
    else await setInput(page, id, value);
  }
  await click(page, 'rentBtn');
  await setInput(page, 'rent', 0);
  await setInput(page, 'taxable', 0);
  await setBalance(setInput, page, 'traditional', 0, true);
  await setInput(page, 'cash', 0);
  await setBalance(setInput, page, 'roth', 500000, true);
  await setInput(page, 'bondYears', 0);
  await page.waitForTimeout(200);

  const rows = await page.evaluate(() => window.fireProjectionRows);
  assert(Array.isArray(rows) && rows.length === 11, `${label} drawdown: expected 11 rows, got ${rows?.length}`);
  for (let i = 0; i < rows.length; i++) {
    const expected = 500000 - (40000 - benefitPerYear) * (i + 1);
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
  // Dividends are taxed every year, so the hand-derivable scenarios below
  // switch them off to isolate the one piece of the engine each one tests.
  await setInput(page, 'dividendYield', 0);
  await setInput(page, 'healthcare', 0);
  // US-only field (Canada has no Medicare Part B/D concept); guard so this
  // shared helper still works against Planner_Canada.html.
  if (await page.evaluate(() => !!document.getElementById('medicareYearly'))) {
    await setInput(page, 'medicareYearly', 0);
  }
  await setChecked(page, 'ltcEnabled', false);
  for (const [id, value] of ssFields) {
    if (typeof value === 'boolean') await setChecked(page, id, value);
    else await setInput(page, id, value);
  }
  await click(page, 'rentBtn');
  await setInput(page, 'rent', 0);
  await setInput(page, 'taxable', 100000);
  await setBalance(setInput, page, 'traditional', 0, true);
  await setBalance(setInput, page, 'roth', 0, true);
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

// Regression guard for the V52 live withdrawal-order toggle
// (state.withdrawalMixEnabled), added after an early version of it was
// shipped, found via manual comparison against an uploaded scenario (not
// caught by any automated test — see docs/reference.md's V52 writeup) to
// make plans ~$900k more expensive than doing nothing. These two checks
// encode the two actual ways it broke, as permanent CI-run invariants
// rather than one-off ad-hoc scripts (test_live_withdrawal_mix.js is not
// wired into CI, so it alone would not have stopped this from shipping
// again). US-only (the toggle doesn't exist on Planner_Canada.html).
//
//  3. Roth untouched when unnecessary: a scenario with ample combined
//     taxable+traditional balances relative to spending, live toggle on.
//     The first broken design scored every candidate — including 100%
//     Roth — on "this year's own tax" alone, which trivially favors Roth
//     every time (it's always tax-free this year) and drains it
//     immediately with no regard for whether it's actually needed. The
//     fixed design never includes Roth in its decision at all unless
//     taxable+traditional together can't cover the year, so Roth must
//     come out of this scenario completely untouched — an exact,
//     hand-derivable value (its own untouched starting balance).
//
//  4. Never worse than the plain default: the exact real-world scenario
//     (traditional-heavy, 90%-basis taxable, Massachusetts, ACA-enhanced)
//     that originally exposed the bug — the live toggle's total lifetime
//     tax+healthcare cost must come out bit-for-bit identical to the
//     plain default's (taxable-first really is the cheapest choice nearly
//     every year here, so "identical" is the correct answer, not just an
//     acceptable one — any regression that makes the live toggle diverge
//     from this exact figure, in either direction, needs investigating).
async function testLiveMixRothUntouched(file, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(200);

  if (!(await page.evaluate(() => !!document.getElementById('withdrawalMixEnabled')))) {
    await browser.close();
    return errors; // Canada has no live withdrawal-mix toggle; nothing to check.
  }

  await setChecked(page, 'singlePerson', true);
  await setInput(page, 'ageA', 65);
  await setInput(page, 'retireAgeA', 65);
  await setInput(page, 'lifeExpectancyA', 75);
  await setInput(page, 'spending', 40000);
  await setInput(page, 'inflation', 0);
  await setInput(page, 'returnRate', 0);
  await setInput(page, 'bondReturn', 0);
  await setInput(page, 'hysaRate', 0);
  // Dividends are taxed every year, so the hand-derivable scenarios below
  // switch them off to isolate the one piece of the engine each one tests.
  await setInput(page, 'dividendYield', 0);
  await setInput(page, 'healthcare', 0);
  await setInput(page, 'medicareYearly', 0);
  await setChecked(page, 'ltcEnabled', false);
  await setInput(page, 'ssMonthlyA', 0);
  await click(page, 'rentBtn');
  await setInput(page, 'rent', 0);
  // Combined taxable+traditional ($600k) comfortably covers 11 years of
  // $40k spending ($440k net need) even after tax, well short of ever
  // needing to touch Roth.
  await setInput(page, 'taxable', 300000);
  await setBalance(setInput, page, 'traditional', 300000, true);
  await setBalance(setInput, page, 'roth', 500000, true);
  await setInput(page, 'cash', 0);
  await setInput(page, 'bondYears', 0);
  await setChecked(page, 'withdrawalMixEnabled', true);
  await page.waitForTimeout(200);

  const rows = await page.evaluate(() => window.fireProjectionRows);
  assert(Array.isArray(rows) && rows.length === 11, `${label} live-mix Roth-untouched: expected 11 rows, got ${rows?.length}`);
  assertClose(rows[10].roth, 500000, `${label} live-mix: Roth balance after 11 years (must stay untouched)`);
  assert(
    rows[10].taxable + rows[10].traditional < 600000,
    `${label} live-mix: combined taxable+traditional should have actually drawn down, not just left everything idle`,
  );
  const depletedAge = await page.evaluate(() => window.fireProjection.depletedAge);
  assert.strictEqual(depletedAge, null, `${label} live-mix Roth-untouched: portfolio should never deplete, got depletedAge=${depletedAge}`);

  console.log(`[${label}] live-mix Roth-untouched golden test passed (Roth balance exact, never touched)`);
  await browser.close();
  return errors;
}

async function testLiveMixNeverWorseThanDefault(file, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(200);

  if (!(await page.evaluate(() => !!document.getElementById('withdrawalMixEnabled')))) {
    await browser.close();
    return errors;
  }

  await setInput(page, 'stateTax', 'ma');
  await setInput(page, 'basisRatio', 90);
  await setInput(page, 'ageA', 33);
  await setInput(page, 'ageB', 34);
  await setInput(page, 'lifeExpectancyA', 85);
  await setInput(page, 'lifeExpectancyB', 85);
  await setInput(page, 'retireAgeA', 55);
  await setInput(page, 'retireAgeB', 50);
  await setInput(page, 'incomeA', 155000);
  await setInput(page, 'incomeB', 159000);
  await setInput(page, 'spending', 38500);
  await setInput(page, 'taxable', 204395);
  await setBalance(setInput, page, 'traditional', 433500, false);
  await setBalance(setInput, page, 'roth', 231000, false);
  await setInput(page, 'cash', 116000);
  await setInput(page, 'cashReserve', 50000);
  await setInput(page, 'ssMonthlyA', 0);
  await setInput(page, 'ssMonthlyB', 0);
  await setInput(page, 'pensionYearlyA', 33000);
  await setInput(page, 'pensionStartAgeA', 67);
  if (!(await page.evaluate(() => document.getElementById('acaEnabled').checked))) {
    await click(page, 'acaEnabled');
  }
  if (!(await page.evaluate(() => document.getElementById('acaEnhanced').checked))) {
    await click(page, 'acaEnhanced');
  }
  await page.waitForTimeout(200);

  const costOf = async () =>
    page.evaluate(() => window.fireProjectionRows.reduce((s, r) => s + r.tax + r.healthcare, 0));

  const defaultCost = await costOf();
  await setChecked(page, 'withdrawalMixEnabled', true);
  await page.waitForTimeout(200);
  const liveMixCost = await costOf();

  assertClose(
    liveMixCost,
    defaultCost,
    `${label} live-mix never-worse-than-default: lifetime tax+healthcare cost with the live toggle on`,
  );

  console.log(`[${label}] live-mix never-worse-than-default golden test passed (cost identical to the cent)`);
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
  ], 445)));
  allErrors.push(...(await testCompounding('Planner_Canada.html', 'Canada', [
    ['cppMonthlyA', 0],
    ['oasMonthlyA', 0],
  ])));
  allErrors.push(...(await testLiveMixRothUntouched('Planner_US.html', 'US')));
  allErrors.push(...(await testLiveMixNeverWorseThanDefault('Planner_US.html', 'US')));

  if (allErrors.length) {
    console.error('Console/page errors encountered during golden tests:', allErrors);
    process.exit(1);
  }
  console.log('\nAll golden-value tests passed.');
})().catch((err) => {
  console.error('GOLDEN TEST FAILURE:', err.message);
  process.exit(1);
});
