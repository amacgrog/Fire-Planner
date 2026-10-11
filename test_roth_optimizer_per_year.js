// Ad-hoc Playwright test for the per-year multi-lever Roth conversion
// optimizer (optimizeRothLadderPerYear() in Planner_US.html). Not wired
// into `npm test`/CI — run directly with `node test_roth_optimizer_per_year.js`.
//
// Relies on the window.__test_* hooks exposed at the bottom of the main
// IIFE (see that block's comment for why they're a deliberate, permanent
// exposure, not scaffolding to strip): __test_simulate,
// __test_optimizeRothLadderPerYear, __test_rothScheduleCost,
// __test_setRothOverride, __test_ROTH_PER_YEAR_CANDIDATES.
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

// 0. Pure-algorithm trap test — no browser, no financial engine. Proves
// the multi-start safeguard actually matters (not just theoretically)
// by reimplementing the exact same cyclic-coordinate-ascent pattern the
// real optimizer uses (fix all other coordinates, sweep this one's
// candidates, keep strict improvements, repeat until a pass changes
// nothing) against a classic 2-variable trap: cost(0,0)=1, cost(1,0)=2,
// cost(0,1)=2, cost(1,1)=0. From (0,0), neither single-coordinate move
// improves (both cost 2 > 1), so single-start coordinate ascent is
// provably stuck at the local optimum (0,0)=1 and can never reach the
// true global optimum (1,1)=0 — exactly the failure mode the user asked
// about. Starting instead from (1,1) (this trap's analog of the "max"
// start) finds it immediately. This doesn't test optimizeRothLadderPerYear()
// itself (see test 1 below for that, on the real engine) — it validates
// that the general technique the function is built on actually escapes a
// real trap when one exists, which the real engine's default scenarios
// (tested below) turned out not to exercise on their own.
function coordinateAscentTrap(costFn, candidates, dims, start) {
  const schedule = start.slice();
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (let d = 0; d < dims; d++) {
      let best = { v: schedule[d], cost: costFn(schedule) };
      for (const c of candidates) {
        if (c === schedule[d]) continue;
        const trial = schedule.slice(); trial[d] = c;
        const cost = costFn(trial);
        if (cost < best.cost) best = { v: c, cost };
      }
      if (best.v !== schedule[d]) { schedule[d] = best.v; changed = true; }
    }
    if (!changed) break;
  }
  return { schedule, cost: costFn(schedule) };
}
function testTrap() {
  const cost = ([a, b]) => ({ '0,0': 1, '1,0': 2, '0,1': 2, '1,1': 0 })[`${a},${b}`];
  const candidates = [0, 1];
  const singleStart = coordinateAscentTrap(cost, candidates, 2, [0, 0]);
  ok('trap: single-start coordinate ascent gets stuck at the local optimum (proves the failure mode is real)',
    singleStart.cost === 1, singleStart);
  const starts = [[0, 0], [1, 1], [1, 0]].map((s) => coordinateAscentTrap(cost, candidates, 2, s));
  const multiBest = starts.reduce((a, b) => (b.cost < a.cost ? b : a));
  ok('trap: multi-start (including the "max" analog) escapes the trap and finds the true global optimum',
    multiBest.cost === 0, { starts, multiBest });
}

async function main() {
  testTrap();

  // 1. Brute-force cross-check on a small window: the strongest
  // correctness test, run against the REAL simulator (not a synthetic
  // stand-in). 3 years x 7 candidates = 343 evaluations, small enough to
  // compute directly and compare against the optimizer's answer.
  await withPage(async (page) => {
    await setupRoth(page, { start: 60, end: 62 });
    const result = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeRothLadderPerYear(selected);
      const years = opt.activeYears;
      const candidates = window.__test_ROTH_PER_YEAR_CANDIDATES;
      // Exhaustive brute force over every combination of candidates
      // across the 3 years.
      let bestCost = Infinity, bestSchedule = null, bestDepletedAge = null;
      const notWorse = (d) => (selected.depletedAge ? !d || d >= selected.depletedAge : !d);
      for (const c0 of candidates) for (const c1 of candidates) for (const c2 of candidates) {
        const schedule = new Map([[years[0], c0], [years[1], c1], [years[2], c2]]);
        window.__test_setRothOverride(schedule);
        const sim = window.__test_simulate();
        window.__test_setRothOverride(null);
        const cost = window.__test_rothScheduleCost(sim);
        if (notWorse(sim.depletedAge) && cost < bestCost) {
          bestCost = cost; bestSchedule = [...schedule.entries()]; bestDepletedAge = sim.depletedAge;
        }
      }
      return {
        optCost: opt.cost,
        bruteCost: bestCost,
        optSchedule: [...opt.schedule.entries()],
        bruteSchedule: bestSchedule,
      };
    });
    // Compare in whole dollars — the optimizer and the brute-force loop
    // here both run the exact same simulate()/rothScheduleCost() path, so
    // they should match near-exactly, not just "close".
    const delta = Math.abs(result.optCost - result.bruteCost);
    ok('3-year window: optimizer matches brute-force global optimum (within $1)', delta < 1, {
      delta, optCost: result.optCost, bruteCost: result.bruteCost,
      optSchedule: result.optSchedule, bruteSchedule: result.bruteSchedule,
    });
  });

  // 2. Regression vs the existing flat optimizer: with a 1-year window,
  // "per-year" and "flat bracket" are the same problem, so the per-year
  // optimizer's single-year choice should be at least as good (by the
  // wider tax+healthcare objective) as re-scoring the flat optimizer's
  // own recommended bracket on that same objective.
  await withPage(async (page) => {
    await setupRoth(page, { start: 65, end: 65 });
    // Drive the flat optimizer through the real UI (not an internal
    // hook) — open its card and read the bracket it marks as best (★)
    // straight out of the rendered table, exactly what a person sees.
    await page.click('#rothOptimizerCard summary');
    await page.waitForTimeout(150);
    const flatBracket = await page.evaluate(() => {
      const bestRow = [...document.querySelectorAll('#rothOptimizerRows tr')].find((tr) => tr.textContent.includes('★'));
      return Number(bestRow.children[0].textContent);
    });
    const result = await page.evaluate((flatBracket) => {
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeRothLadderPerYear(selected);
      // Re-score the flat optimizer's recommended bracket on the wider
      // tax+healthcare objective for an apples-to-apples comparison (the
      // flat optimizer itself only scores lifetime tax).
      window.__test_setRothOverride(new Map([[65, flatBracket]]));
      const flatSim = window.__test_simulate();
      window.__test_setRothOverride(null);
      const flatCost = window.__test_rothScheduleCost(flatSim);
      return { optCost: opt.cost, flatCost, flatBracket, optSchedule: [...opt.schedule.entries()] };
    }, flatBracket);
    ok('1-year window: per-year optimizer is never worse than the flat optimizer\'s pick', result.optCost <= result.flatCost + 1, result);
  });

  // 3. Guardrail: never recommend a schedule that depletes earlier than
  // the plan as currently configured.
  await withPage(async (page) => {
    // A deliberately stressed scenario (early retirement, modest assets)
    // more likely to actually deplete, so the guardrail has something to
    // bind against rather than trivially passing because nothing depletes.
    await page.evaluate(() => {
      document.getElementById('retireAgeA').value = 50;
      document.getElementById('retireAgeA').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await setupRoth(page, { start: 50, end: 58 });
    const result = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeRothLadderPerYear(selected);
      return { optDepletedAge: opt.depletedAge, selectedDepletedAge: selected.depletedAge };
    });
    const guardrailOk = result.selectedDepletedAge
      ? !result.optDepletedAge || result.optDepletedAge >= result.selectedDepletedAge
      : true; // nothing to violate if the baseline itself never depletes
    ok('guardrail: recommended schedule never depletes earlier than current plan', guardrailOk, result);
  });

  // 4. Convergence / idempotency: running the optimizer twice on the same
  // inputs gives the same schedule (determinism), and it terminates
  // within the pass cap (implicitly verified by not hanging).
  await withPage(async (page) => {
    await setupRoth(page, { start: 58, end: 66 });
    const result = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const opt1 = window.__test_optimizeRothLadderPerYear(selected);
      const opt2 = window.__test_optimizeRothLadderPerYear(selected);
      return {
        same: JSON.stringify([...opt1.schedule.entries()]) === JSON.stringify([...opt2.schedule.entries()]),
        cost1: opt1.cost, cost2: opt2.cost,
      };
    });
    ok('deterministic: re-running on identical inputs gives the identical schedule', result.same, result);
  });

  // 5. Performance: a realistic-to-generous window finishes quickly.
  await withPage(async (page) => {
    await setupRoth(page, { start: 55, end: 74 }); // 20 years
    const result = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const t0 = performance.now();
      const opt = window.__test_optimizeRothLadderPerYear(selected);
      const ms = performance.now() - t0;
      return { ms, evalCount: opt.evalCount, budgetExhausted: opt.budgetExhausted };
    });
    ok('performance: 20-year window finishes in under 5s', result.ms < 5000, result);
    ok('performance: 20-year window does not exhaust the eval budget', !result.budgetExhausted, result);
  });

  // 6. Edge cases.
  await withPage(async (page) => {
    // 0-year window (end < start, e.g. ladder disabled by an inverted range).
    await setupRoth(page, { start: 65, end: 64 });
    const zero = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeRothLadderPerYear(selected);
      return { windowSize: opt.activeYears.length, threw: false };
    }).catch((e) => ({ threw: true, error: String(e) }));
    ok('edge case: empty window returns gracefully with no years to optimize', !zero.threw && zero.windowSize === 0, zero);
  });
  await withPage(async (page) => {
    // Very wide window (46 years) gets truncated to the 30-year cap and
    // still finishes in bounded time.
    await setupRoth(page, { start: 45, end: 90 });
    const wide = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const t0 = performance.now();
      const opt = window.__test_optimizeRothLadderPerYear(selected);
      const ms = performance.now() - t0;
      return { windowSize: opt.activeYears.length, truncated: opt.truncated, ms };
    });
    ok('edge case: 46-year window truncates to the 30-year cap', wide.windowSize === 30 && wide.truncated, wide);
    ok('edge case: truncated 30-year window still finishes in under 5s', wide.ms < 5000, wide);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
