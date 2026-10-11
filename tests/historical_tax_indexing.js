// Regression test for tax-parameter indexing in the historical engine
// (backtest + Monte Carlo).
//
// Brackets, deductions, FPL and IRMAA tiers (US) / brackets, credits and CPP
// limits (Canada) used to index through state.inflation (a steady 2.5%) even
// inside simulateHistorical(), while spending followed the path's own CPI. In
// a high-inflation sequence spending ballooned but the tax schedule barely
// moved, so the model overtaxed exactly the sequences that decide the
// success rate.
//
// The invariant: a retiree funded only by a traditional/RRSP balance, with no
// Social Security/CPP/OAS, no state tax, no healthcare and no capital gains,
// faces a fully-indexed tax system. With a 0% real return and no RMDs
// (life expectancy kept under 75), the real amount drawn from the account each
// year (spending plus tax, in start-of-year dollars) must therefore be the same
// at every inflation rate. Before the fix, 10% inflation made the tax bill a
// much larger share of real spending than 2.5% did.
//
// (The engine grows balances first and withdraws at year end, so the balance
// path itself is not inflation-invariant by 1/(1+inflation); that is a timing
// convention, not a tax effect, so the test compares the implied real
// withdrawal instead of the balance.)

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

async function run(file, label, extra) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Plan year 0 is tax year 2030. The US temporary senior deduction ($6,000,
  // tax years 2025-2028) is a fixed nominal amount that is deliberately not
  // indexed, so it would break this fully-indexed invariant for a 65-year-old;
  // after it ends the retiree faces only indexed parameters again (including
  // the indexed 65+ additional standard deduction).
  await page.clock.install({ time: new Date('2030-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(200);

  await setChecked(page, 'singlePerson', true);
  await setInput(page, 'ageA', 65);
  await setInput(page, 'retireAgeA', 65);
  await setInput(page, 'lifeExpectancyA', 74);
  await setInput(page, 'spending', 70000);
  await setInput(page, 'healthcare', 0);
  if (await page.evaluate(() => !!document.getElementById('medicareYearly')))
    await setInput(page, 'medicareYearly', 0);
  await setChecked(page, 'ltcEnabled', false);
  for (const [id, value] of extra) {
    if (typeof value === 'boolean') await setChecked(page, id, value);
    else if (id === 'stateTax' || id === 'province')
      await page.evaluate(
        ({ id, value }) => {
          const el = document.getElementById(id);
          el.value = value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        { id, value },
      );
    else await setInput(page, id, value);
  }
  await click(page, 'rentBtn');
  await setInput(page, 'rent', 0);
  await setInput(page, 'taxable', 0);
  await setBalance(setInput, page, 'roth', 0, true);
  await setInput(page, 'cash', 0);
  await setInput(page, 'bondYears', 0);
  await setBalance(setInput, page, 'traditional', 2000000, true);
  await page.waitForTimeout(200);

  const start = 2000000;
  const draws = await page.evaluate((start) => {
    const out = {};
    for (const infl of [0.025, 0.1]) {
      // 0% real return: nominal return equals inflation.
      const res = window.__test_simulateHistorical((year) => [
        1970 + year,
        infl * 100,
        infl * 100,
        infl * 100,
      ]);
      let prev = start;
      out[infl] = res.rows.map((r) => {
        // cumFactor on a row is the factor at the *start* of that year.
        const b = r.traditional / (r.cumFactor * (1 + infl));
        const d = (prev - b) * (1 + infl);
        prev = b;
        return d;
      });
    }
    return out;
  }, start);

  const lo = draws[0.025],
    hi = draws[0.1];
  assert(lo.length >= 8 && lo.length === hi.length, `${label}: unexpected row count ${lo.length}`);
  for (let t = 0; t < lo.length; t++) {
    assert(lo[t] > 70000, `${label}: year ${t} draw should exceed spending (${lo[t]})`);
    const rel = Math.abs(hi[t] - lo[t]) / lo[t];
    // Canada's $2,000 pension income amount is not indexed (statute), so a 65+ filer's tax
    // drifts with inflation by a few thousandths; every indexed parameter must still cancel.
    const tol = label === 'Canada' ? 3e-3 : 1e-6;
    assert(
      rel < tol,
      `${label}: year ${t} real draw should not depend on inflation when taxes are indexed ` +
        `(2.5%: ${lo[t].toFixed(2)}, 10%: ${hi[t].toFixed(2)})`,
    );
  }
  console.log(
    `[${label}] historical tax-indexing test passed (${lo.length} years; year-8 real draw ${lo[lo.length - 1].toFixed(2)} at both 2.5% and 10% inflation)`,
  );
  assert.deepStrictEqual(errors, [], `${label}: page errors ${errors}`);
  await browser.close();
}

(async () => {
  const root = path.resolve(__dirname, '..');
  await run(plannerPath('Planner_US.html', root), 'US', [
    ['stateTax', 'tx'],
    ['ssMonthlyA', 0],
    ['acaEnabled', false],
  ]);
  await run(plannerPath('Planner_Canada.html', root), 'Canada', [
    ['cppMonthlyA', 0],
    ['oasMonthlyA', 0],
  ]);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
