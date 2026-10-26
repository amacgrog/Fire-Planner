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
const { plannerPath } = require('./helpers/planner-path');
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
// income), and Ontario, the planner default province, adds the Ontario Sales Tax Credit of 378 for one adult
// (CRA Ontario page: 378 per adult, reduced only above 29,047); no indexation here because inflation is 0.
// The US has none.
async function testDrawdown(file, label, ssFields, benefitPerYear = 0) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('file://' + plannerPath(file));
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
  await page.goto('file://' + plannerPath(file));
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

// Regression guard for the "Tax-aware withdrawal order" toggle (state.withdrawalMixEnabled). It began as the V52 live
// withdrawal-order picker, added after an early version of it was shipped, found via manual comparison against an uploaded
// scenario (not caught by any automated test, see docs/reference.md's V52 writeup) to make plans ~$900k more expensive than doing
// nothing. Since Batch 5 step 4c the toggle turns on the order lever of the automatic cliff plan instead. These two checks stay
// as permanent CI-run invariants. US-only (the toggle doesn't exist on Planner_Canada.html).
//
//  3. Roth untouched when unnecessary: a scenario with ample combined
//     taxable+traditional balances relative to spending, toggle on.
//     The first broken design scored every candidate, including 100%
//     Roth, on "this year's own tax" alone, which trivially favors Roth
//     every time (it's always tax-free this year) and drains it
//     immediately with no regard for whether it's actually needed. Roth
//     is only reached once taxable+traditional together can't cover the
//     year, so Roth must come out of this scenario completely untouched:
//     an exact, hand-derivable value (its own untouched starting balance).
//
//  4. The order lever never makes the plan worse: the exact real-world
//     scenario (traditional-heavy, 90%-basis taxable, Massachusetts,
//     ACA-enhanced) that originally exposed the bug. The old live picker
//     never left taxable-first here, so this check used to demand a
//     lifetime tax+healthcare cost identical to the cent. The order lever
//     does keep traditional-first years for this household (its plan is
//     kept only when the whole plan lasts at least as long and ends
//     better), and the lifetime cost is then LOWER (controller ruling,
//     Batch 5 4c: -$98,177), so "identical" no longer applies. The check
//     pins the keep rule's promise instead, toggle on against toggle off,
//     each run under its own refreshed plan: depletedAge not earlier,
//     the first home draw not earlier (null = never, the latest), and the
//     ending after-tax value not lower by more than $1. The cost
//     difference is printed for information.
async function testLiveMixRothUntouched(file, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + plannerPath(file));
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
  await page.goto('file://' + plannerPath(file));
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

  // One run of the dashboard's plan for the current state: apply mode under the refreshed plan, with the ending after-tax value.
  const measure = async () =>
    page.evaluate(() => {
      const { plan } = window.__test_refreshCliffPlan();
      const r = window.__test_runPlanMode({ planMode: 'apply', plan, endValue: true });
      return {
        cost: r.rows.reduce((s, x) => s + x.tax + x.healthcare, 0),
        depletedAge: r.depletedAge,
        homeDrawAge: r.homeDrawAge,
        value: r.value,
        orders: plan && plan.orders ? Object.keys(plan.orders).length : 0,
      };
    });
  const never = (x) => (x === null || x === undefined ? Infinity : x);

  const off = await measure();
  await setChecked(page, 'withdrawalMixEnabled', true);
  await page.waitForTimeout(200);
  const on = await measure();

  assert(never(on.depletedAge) >= never(off.depletedAge), `${label} order lever: depletedAge ${on.depletedAge} is earlier than toggle off ${off.depletedAge}`);
  assert(never(on.homeDrawAge) >= never(off.homeDrawAge), `${label} order lever: first home draw ${on.homeDrawAge} is earlier than toggle off ${off.homeDrawAge}`);
  // The value is compared only when both ages are equal on and off (null counts as never): a plan that lasts longer or draws on the
  // house later may end lower, which is allowed (printed). Same rule as order-lever.test.js, A2.
  const sameAges = never(on.depletedAge) === never(off.depletedAge) && never(on.homeDrawAge) === never(off.homeDrawAge);
  if (!sameAges) console.log(`[${label}] order lever: an age is later with the toggle on (depletion ${on.depletedAge} vs ${off.depletedAge}, home draw ${on.homeDrawAge} vs ${off.homeDrawAge}); ending value ${on.value} on vs ${off.value} off, a lower value is allowed`);
  assert(!sameAges || on.value >= off.value - 1, `${label} order lever: ending after-tax value ${on.value} is lower than toggle off ${off.value} by more than $1`);
  console.log(`[${label}] order lever: lifetime tax+healthcare cost ${Math.round(on.cost)} on vs ${Math.round(off.cost)} off (difference ${Math.round(on.cost - off.cost)}; order years kept: ${on.orders})`);

  console.log(`[${label}] order-lever never-worse golden test passed (depletion, home draw and ending value not worse than toggle off)`);
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
  ], 445 + 378)));
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
