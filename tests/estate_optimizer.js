// The Canada Roth/RRSP optimizer's ranking by after-tax estate (Batch 7N, N8): the checks of tests/estate.js that need the ui/
// function computeRothOptimizer (it reads its bracket candidates from the DOM), so they stay in Playwright. The other 27 checks of
// the old tests/estate.js are tests/unit/canada/estate.test.js (Vitest); 27 + these 5 = the original 32.
//
// Run: node tests/estate_optimizer.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    const t = window.__test_tax;
    const st = window.__test_getState();
    const res = {};
    // The meltdown table: the recommended bracket has the highest after-tax estate among the plans that do not shorten the portfolio's life.
    Object.assign(st, { singlePerson: false, province: 'on', ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 100000, traditional: 1500000, roth: 100000, cash: 30000, spending: 70000, meltdownEnabled: true, meltdownStartAge: 60, meltdownEndAge: 70, meltdownBracket: 20.5 });
    const sim2 = window.__test_simulate();
    const opt = t.computeRothOptimizer(sim2);
    const pool = opt.results.filter((r) => (sim2.depletedAge ? !r.depletedAge || r.depletedAge >= sim2.depletedAge : !r.depletedAge));
    res.opt = { best: opt.best.afterTaxEstate, maxPool: Math.max(...(pool.length ? pool : opt.results).map((r) => r.afterTaxEstate)), n: opt.results.length, hasField: opt.results.every((r) => Number.isFinite(r.afterTaxEstate)), spread: Math.max(...opt.results.map((r) => r.afterTaxEstate)) - Math.min(...opt.results.map((r) => r.afterTaxEstate)) };
    // Lifetime tax in the optimizer table counts the OAS recovery tax (row.tax leaves it out, row.oasClawback carries it).
    Object.assign(st, { singlePerson: false, province: 'on', ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66, lifeExpectancyA: 80, lifeExpectancyB: 80, incomeA: 0, incomeB: 0, taxable: 0, cash: 0, roth: 0, traditional: 2500000, healthcare: 0, ltcEnabled: false, pensionYearlyA: 60000, pensionYearlyB: 60000, pensionStartAgeA: 60, pensionStartAgeB: 60, cppMonthlyA: 1000, cppMonthlyB: 1000, cppStartAgeA: 65, cppStartAgeB: 65, oasMonthlyA: 760, oasMonthlyB: 760, oasStartAgeA: 65, oasStartAgeB: 65, pensionSplitEnabled: false, spending: 180000, meltdownEnabled: true });
    const sim3 = window.__test_simulate();
    const opt3 = t.computeRothOptimizer(sim3);
    const cur3 = opt3.results.find((r) => r.bracket === opt3.currentBracket);
    res.life = {
      table: cur3.lifetimeTax,
      expected: sim3.rows.reduce((a, r) => a + t.displayValue(r.tax + (r.oasClawback || 0) - (r.benefits || 0), r.year), 0),
      clawback: sim3.rows.reduce((a, r) => a + (r.oasClawback || 0), 0),
    };
    return res;
  });
  assert(out.life.clawback > 1000, 'the scenario must pay OAS recovery tax, got ' + out.life.clawback);
  near(out.life.table, out.life.expected, 1e-6, 'lifetime tax in the meltdown table includes the OAS recovery tax');
  assert(out.opt.hasField && out.opt.n >= 4, 'the optimizer rows carry the after-tax estate');
  near(out.opt.best, out.opt.maxPool, 1e-6, 'the recommended bracket has the highest after-tax estate among the plans that do not shorten the portfolio');
  assert(out.opt.spread > 1000, 'the brackets must differ in after-tax estate');
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('[Canada] estate optimizer test passed (ranking by after-tax estate, OAS recovery in lifetime tax)');
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
