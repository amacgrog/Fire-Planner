// Playwright checks of the Roth and multi-lever optimizers that need the page: the flat optimizer's starred row in its
// card, and the wall-clock limits of the per-year and multi-lever optimizers in the browser. The optimizers' engine
// checks are Vitest suites: tests/unit/us/roth-optimizer-per-year.test.js and tests/unit/us/multi-lever-*.test.js
// (converted from test_roth_optimizer_per_year.js and test_multi_lever_optimizer.js, which this script replaces).
// In CI through `npm run test:ui` (tests/ui_scripts.js runs it alone, after the others, so that nothing slows the timed
// runs), not `npm test`; run one directly with `node test_optimizer_ui.js`.
//
// Relies on the window.__test_* hooks: __test_simulate, __test_optimizeRothLadderPerYear, __test_optimizeMultiLever,
// __test_rothScheduleCost, __test_setRothOverride.
const { chromium } = require('playwright');
const path = require('path');

let pass = 0, fail = 0;
function ok(desc, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${desc}`); }
  else { fail++; console.log(`  FAIL ${desc}${detail ? ' — ' + JSON.stringify(detail) : ''}`); }
}

async function withPage(fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve('dist', 'Planner_US.html'));
  await page.waitForTimeout(250);
  await fn(page);
  if (errors.length) { fail++; console.log('  FAIL page errors:', errors); }
  await browser.close();
}

function setVal(page, id, val) {
  return page.evaluate(({ id, val }) => {
    const el = document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, val });
}

function setupRoth(page, { start, end, bracket = 22, aca = true }) {
  return page.evaluate(({ start, end, bracket, aca }) => {
    if (!document.getElementById('rothConvEnabled').checked) document.getElementById('rothConvEnabled').click();
    document.getElementById('rothConvStartAge').value = start;
    document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('rothConvEndAge').value = end;
    document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('rothConvBracket').value = String(bracket);
    document.getElementById('rothConvBracket').dispatchEvent(new Event('change', { bubbles: true }));
    if (aca && !document.getElementById('acaEnabled').checked) document.getElementById('acaEnabled').click();
  }, { start, end, bracket, aca });
}

// The ACA-cliff scenario of tests/unit/helpers/multi-lever.js (ACA_CLIFF), entered through the fields.
async function setupAcaCliffScenario(page) {
  await setVal(page, 'stateTax', 'fl');
  await page.evaluate(() => document.getElementById('stateTax').dispatchEvent(new Event('change', { bubbles: true })));
  await setVal(page, 'ageA', 45); await setVal(page, 'ageB', 45);
  await setVal(page, 'retireAgeA', 55); await setVal(page, 'retireAgeB', 55);
  await setVal(page, 'lifeExpectancyA', 90); await setVal(page, 'lifeExpectancyB', 90);
  await setVal(page, 'taxable', 1500000);
  await setVal(page, 'basisRatio', 20);
  await setVal(page, 'trad401kA', 450000);
  await setVal(page, 'trad401kB', 450000);
  await setVal(page, 'rothIraA', 100000);
  await setVal(page, 'rothIraB', 100000);
  await setVal(page, 'cash', 80000);
  await setVal(page, 'cashReserve', 50000);
  await setVal(page, 'spending', 75000);
  await setVal(page, 'ssMonthlyA', 2800); await setVal(page, 'ssMonthlyB', 2200);
  await setVal(page, 'ssStartAgeA', 67); await setVal(page, 'ssStartAgeB', 67);
  await page.evaluate(() => {
    if (!document.getElementById('acaEnabled').checked) document.getElementById('acaEnabled').click();
    if (document.getElementById('acaEnhanced').checked) document.getElementById('acaEnhanced').click();
  });
  await setVal(page, 'rothConvStartAge', 55);
  await setVal(page, 'rothConvEndAge', 66);
}

(async () => {
  // 1. With a 1-year window "per-year" and "flat bracket" are the same problem, so the per-year optimizer's choice is at
  // least as good, on its wider tax+healthcare objective, as the flat optimizer's recommended bracket re-scored on that
  // objective. The flat pick is read from the rendered card (the row marked ★), as a person sees it.
  await withPage(async (page) => {
    await setupRoth(page, { start: 65, end: 65 });
    await page.click('#rothOptimizerCard summary');
    const star = page.locator('#rothOptimizerRows tr', { hasText: '★' });
    await star.first().waitFor();
    const flatBracket = Number(await star.first().locator('td').first().textContent());
    const result = await page.evaluate((flatBracket) => {
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeRothLadderPerYear(selected);
      window.__test_setRothOverride(new Map([[65, flatBracket]]));
      const flatSim = window.__test_simulate();
      window.__test_setRothOverride(null);
      const flatCost = window.__test_rothScheduleCost(flatSim);
      return { optCost: opt.cost, flatCost, flatBracket, optSchedule: [...opt.schedule.entries()] };
    }, flatBracket);
    ok('1-year window: per-year optimizer is never worse than the flat optimizer\'s starred pick', result.optCost <= result.flatCost + 1, result);
  });

  // 2. Wall-clock limits: a realistic-to-generous per-year window, and a 46-year window truncated to the 30-year cap.
  await withPage(async (page) => {
    await setupRoth(page, { start: 55, end: 74 }); // 20 years
    const result = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const t0 = performance.now();
      const opt = window.__test_optimizeRothLadderPerYear(selected);
      return { ms: performance.now() - t0, evalCount: opt.evalCount, budgetExhausted: opt.budgetExhausted };
    });
    ok('performance: per-year 20-year window finishes in under 5s', result.ms < 5000, result);
  });
  await withPage(async (page) => {
    await setupRoth(page, { start: 45, end: 90 });
    const wide = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const t0 = performance.now();
      const opt = window.__test_optimizeRothLadderPerYear(selected);
      return { ms: performance.now() - t0, windowSize: opt.activeYears.length, truncated: opt.truncated };
    });
    ok('performance: per-year truncated 30-year window finishes in under 5s', wide.ms < 5000, wide);
  });

  // 3. All three levers over a 20-year Roth window and the automatic full-retirement mix window either finish within
  // budget or degrade gracefully (best found so far, no hang), well within the limit.
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    await setVal(page, 'rothConvEndAge', 74);
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const t0 = performance.now();
      const opt = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeMix: true, includeSmooth: true });
      return { ms: performance.now() - t0, evalCount: opt.evalCount, budgetExhausted: opt.budgetExhausted, mixYears: opt.mixYears.length };
    });
    ok('performance: all-3-levers, retire-55-to-90 window finishes in well under 15s', r.ms < 15000, r);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
