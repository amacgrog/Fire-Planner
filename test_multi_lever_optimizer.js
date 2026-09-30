// Ad-hoc Playwright test for the multi-lever withdrawal & conversion
// optimizer (optimizeMultiLever() in Planner_US.html), which extends the
// per-year Roth optimizer (see test_roth_optimizer_per_year.js) with two
// more independently toggleable levers: an optimized per-year
// taxable/traditional/Roth withdrawal mix (withdrawalMixOverrideByAge/
// WITHDRAWAL_MIX_CANDIDATES/withdrawalMixWeights) and a household-wide
// smoothed-withdrawals A/B. A third lever, capital-gain harvesting, was
// removed (see docs/reference.md) after real-world testing found its
// effect was consistently negligible or zero in every scenario tried.
// Not wired into `npm test`/CI — run directly with
// `node test_multi_lever_optimizer.js`.
//
// Relies on the window.__test_* hooks exposed at the bottom of the main
// IIFE: __test_simulate, __test_optimizeRothLadderPerYear,
// __test_optimizeMultiLever, __test_rothScheduleCost,
// __test_setRothOverride, __test_setWithdrawalMixOverride,
// __test_withdrawalMixWeights, __test_ROTH_PER_YEAR_CANDIDATES,
// __test_WITHDRAWAL_MIX_CANDIDATES.
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
  await page.goto('file://' + path.resolve('Planner_US.html'));
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
function clickIfUnchecked(page, id) {
  return page.evaluate((id) => {
    if (!document.getElementById(id).checked) document.getElementById(id).click();
  }, id);
}

// Scenario used by several tests below: retiring well before Social
// Security, with a large traditional balance sitting idle and a large
// taxable balance that the plain taxable-first default drains hard during
// the gap — pushing MAGI straight through the ACA subsidy cliff (enhanced
// mode off, so the real 400% FPL cliff applies). This is the shape that
// earlier testing found smoothed withdrawals alone was worth ~$369k on
// (see the chat that led here) — a good stand-in for "a scenario where
// managing the withdrawal mix deliberately should matter a lot."
async function setupAcaCliffScenario(page) {
  await setVal(page, 'stateTax', 'fl');
  await page.evaluate(() => document.getElementById('stateTax').dispatchEvent(new Event('change', { bubbles: true })));
  await setVal(page, 'ageA', 45); await setVal(page, 'ageB', 45);
  await setVal(page, 'retireAgeA', 55); await setVal(page, 'retireAgeB', 55);
  await setVal(page, 'lifeExpectancyA', 90); await setVal(page, 'lifeExpectancyB', 90);
  await setVal(page, 'taxable', 1500000);
  await setVal(page, 'basisRatio', 20);
  await setVal(page, 'traditional', 900000);
  await setVal(page, 'roth', 200000);
  await setVal(page, 'cash', 80000);
  await setVal(page, 'cashReserve', 50000);
  await setVal(page, 'spending', 75000);
  await setVal(page, 'ssMonthlyA', 2800); await setVal(page, 'ssMonthlyB', 2200);
  await setVal(page, 'ssStartAgeA', 67); await setVal(page, 'ssStartAgeB', 67);
  await clickIfUnchecked(page, 'acaEnabled');
  await page.evaluate(() => {
    if (document.getElementById('acaEnhanced').checked) document.getElementById('acaEnhanced').click();
  });
  await setVal(page, 'rothConvStartAge', 55);
  await setVal(page, 'rothConvEndAge', 66);
}

(async () => {
  // 1. withdrawalMixWeights: each fixed candidate returns the expected
  // [taxable, traditional, roth] triple, and every candidate's weights
  // sum to 1 (a real split of the year's need, not over/under-allocating).
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      const w = window.__test_withdrawalMixWeights;
      return {
        taxable: w('taxable', 100, 100, 100),
        traditional: w('traditional', 100, 100, 100),
        roth: w('roth', 100, 100, 100),
        taxTradHalf: w('taxTradHalf', 100, 100, 100),
        thirds: w('thirds', 100, 100, 100),
        balanced: w('balanced', 300, 600, 100),
        smoothed: w('smoothed', 300, 600, 100),
        zero: w(0, 100, 100, 100),
      };
    });
    ok('withdrawalMixWeights: taxable-only is [1,0,0]', JSON.stringify(r.taxable) === JSON.stringify([1, 0, 0]), r);
    ok('withdrawalMixWeights: traditional-only is [0,1,0]', JSON.stringify(r.traditional) === JSON.stringify([0, 1, 0]), r);
    ok('withdrawalMixWeights: roth-only is [0,0,1]', JSON.stringify(r.roth) === JSON.stringify([0, 0, 1]), r);
    ok('withdrawalMixWeights: 0 sentinel returns null (no override)', r.zero === null, r);
    // balanced: pool = 300+600+100 = 1000 -> [0.3, 0.6, 0.1]
    ok('withdrawalMixWeights: balanced is 3-way proportional to live balances', Math.abs(r.balanced[0] - 0.3) < 1e-9 && Math.abs(r.balanced[1] - 0.6) < 1e-9 && Math.abs(r.balanced[2] - 0.1) < 1e-9, r);
    // smoothed: pool = 300+600 = 900 (roth excluded) -> [1/3, 2/3, 0]
    ok('withdrawalMixWeights: smoothed matches state.smoothWithdrawals\' own 2-way formula (roth excluded)', Math.abs(r.smoothed[0] - 1 / 3) < 1e-9 && Math.abs(r.smoothed[1] - 2 / 3) < 1e-9 && r.smoothed[2] === 0, r);
    for (const [name, w] of Object.entries(r)) {
      if (w) ok(`withdrawalMixWeights: ${name}'s weights sum to 1`, Math.abs(w[0] + w[1] + w[2] - 1) < 1e-9, w);
    }
  });

  // 2. End-to-end: forcing a specific mix candidate for a year with a real
  // withdrawal need actually draws from taxable/traditional/roth in
  // roughly that proportion (traditional/roth get bisection-solved for
  // NET amount after tax/penalty, so this checks direction and rough
  // magnitude, not exact equality).
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    const r = await page.evaluate(() => {
      window.__test_setWithdrawalMixOverride(new Map([[60, 'roth']]));
      const sim = window.__test_simulate();
      window.__test_setWithdrawalMixOverride(null);
      const row = sim.rows.find((r) => r.age === 60);
      return { mixCandidate: row.mixCandidate, fromTaxable: row.taxableWithdrawn, fromTraditional: row.traditionalWithdrawn - row.rmd, fromRoth: row.rothWithdrawn };
    });
    ok('forcing "roth" for a year draws primarily from Roth, not taxable/traditional', r.fromRoth > r.fromTaxable && r.fromRoth > r.fromTraditional, r);
    ok('the row records which candidate was actually used that year', r.mixCandidate === 'roth', r);
  });

  // 3. The mix-only optimizer finds a real improvement in the ACA-cliff
  // scenario, and never recommends worse than doing nothing.
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const selectedCost = window.__test_rothScheduleCost(selected);
      const opt = window.__test_optimizeMultiLever(selected, { includeMix: true });
      return { selectedCost, optCost: opt.cost, schedule: [...opt.mixSchedule.entries()].filter(([, v]) => v !== 0) };
    });
    ok('mix-only optimizer finds a real improvement in the ACA-cliff scenario', r.optCost < r.selectedCost - 1, r);
    ok('mix-only optimizer never worse than doing nothing', r.optCost <= r.selectedCost + 1, r);
    ok('mix-only optimizer actually picked a non-default candidate some year', r.schedule.length > 0, r);
  });

  // 4. Mix is a strict superset of smoothed withdrawals: the 'smoothed'
  // candidate exists specifically so mix-only can always at least match
  // whatever plain smoothWithdrawals finds on its own.
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const smoothOnly = window.__test_optimizeMultiLever(selected, { includeSmooth: true });
      const mixOnly = window.__test_optimizeMultiLever(selected, { includeMix: true });
      return { smoothOnlyCost: smoothOnly.cost, mixOnlyCost: mixOnly.cost };
    });
    ok('mix-only is never worse than smooth-only (mix is a superset)', r.mixOnlyCost <= r.smoothOnlyCost + 1, r);
  });

  // 5. Mix never overrides the guardrail: in a stressed scenario where the
  // plan is already right at the edge, the optimizer must not pick a mix
  // schedule that depletes the portfolio earlier than today's plan.
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      document.getElementById('taxable').value = '400000';
      document.getElementById('taxable').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('traditional').value = '400000';
      document.getElementById('traditional').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('roth').value = '100000';
      document.getElementById('roth').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('retireAgeA').value = 50;
      document.getElementById('retireAgeA').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('retireAgeB').value = 50;
      document.getElementById('retireAgeB').dispatchEvent(new Event('input', { bubbles: true }));
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeMultiLever(selected, { includeMix: true });
      return { selectedDepletedAge: selected.depletedAge, optDepletedAge: opt.depletedAge };
    });
    const notWorse = r.selectedDepletedAge ? !r.optDepletedAge || r.optDepletedAge >= r.selectedDepletedAge : !r.optDepletedAge;
    ok('mix-only optimizer respects the depletion guardrail under stress', notWorse, r);
  });

  // 6. Combining levers is never worse than either alone — coordinate
  // ascent's zero-schedule candidate for the OTHER lever is always
  // reachable, so adding a lever to the search can only find as-good-or-
  // better schedules, never force a worse one.
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const mixOnly = window.__test_optimizeMultiLever(selected, { includeMix: true });
      const rothOnly = window.__test_optimizeMultiLever(selected, { includeRoth: true });
      const both = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeMix: true });
      return { mixOnlyCost: mixOnly.cost, rothOnlyCost: rothOnly.cost, bothCost: both.cost };
    });
    ok('roth+mix together is never worse than mix alone', r.bothCost <= r.mixOnlyCost + 1, r);
    ok('roth+mix together is never worse than roth alone', r.bothCost <= r.rothOnlyCost + 1, r);
  });

  // 7. The smoothed-withdrawals A/B (the simple, non-tax-aware toggle,
  // kept alongside the mix lever) actually tries both settings and picks
  // whichever is cheaper.
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      document.getElementById('rothConvStartAge').value = 55;
      document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvEndAge').value = 55;
      document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      const selected = window.__test_simulate();

      const smoothCheckbox = document.getElementById('smoothWithdrawals');
      const wasChecked = smoothCheckbox.checked;
      if (!wasChecked) smoothCheckbox.click();
      const onCost = window.__test_rothScheduleCost(window.__test_simulate());
      if (smoothCheckbox.checked) smoothCheckbox.click();
      const offCost = window.__test_rothScheduleCost(window.__test_simulate());
      if (wasChecked !== smoothCheckbox.checked) smoothCheckbox.click();

      const opt = window.__test_optimizeMultiLever(selected, { includeSmooth: true });
      return { onCost, offCost, optCost: opt.cost, optSmooth: opt.smoothWithdrawals };
    });
    const cheaper = Math.min(r.onCost, r.offCost);
    ok('smooth-only optimizer cost matches the cheaper of on/off', Math.abs(r.optCost - cheaper) < 1, r);
    ok('smooth-only optimizer picked the setting that actually is cheaper', (r.optSmooth ? r.onCost : r.offCost) <= cheaper + 1, r);
  });

  // 8. Backward compatibility: the Roth-only convenience wrapper still
  // matches the generalized driver run with only the Roth lever included
  // (same schedule, same cost) — it's a thin adapter, not a fork.
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      if (!document.getElementById('rothConvEnabled').checked) document.getElementById('rothConvEnabled').click();
      document.getElementById('rothConvStartAge').value = 60;
      document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvEndAge').value = 63;
      document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      const selected = window.__test_simulate();
      const viaWrapper = window.__test_optimizeRothLadderPerYear(selected);
      const viaGeneral = window.__test_optimizeMultiLever(selected, { includeRoth: true });
      return {
        costsMatch: Math.abs(viaWrapper.cost - viaGeneral.cost) < 1,
        schedulesMatch: JSON.stringify([...viaWrapper.schedule.entries()]) === JSON.stringify([...viaGeneral.rothSchedule.entries()]),
      };
    });
    ok('optimizeRothLadderPerYear wrapper matches the general driver (cost)', r.costsMatch, r);
    ok('optimizeRothLadderPerYear wrapper matches the general driver (schedule)', r.schedulesMatch, r);
  });

  // 9. Determinism: identical inputs -> identical joint schedule, same as
  // the Roth-only optimizer's own guarantee, now under the wider 3-lever
  // search space.
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const opt1 = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeMix: true, includeSmooth: true });
      const opt2 = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeMix: true, includeSmooth: true });
      return {
        same:
          JSON.stringify([...opt1.rothSchedule.entries()]) === JSON.stringify([...opt2.rothSchedule.entries()]) &&
          JSON.stringify([...opt1.mixSchedule.entries()]) === JSON.stringify([...opt2.mixSchedule.entries()]) &&
          opt1.smoothWithdrawals === opt2.smoothWithdrawals,
      };
    });
    ok('all-3-levers run is deterministic across repeated calls', r.same, r);
  });

  // 10. Performance: all 3 levers together over a realistic (20-year Roth
  // window, automatic full-retirement mix window) stays well under what
  // "doesn't run for an incredibly long time" requires — and either
  // finishes within budget or degrades gracefully (best-found-so-far, no
  // hang) if it doesn't.
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    const r = await page.evaluate(() => {
      document.getElementById('rothConvStartAge').value = 55;
      document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvEndAge').value = 74;
      document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      const selected = window.__test_simulate();
      const t0 = performance.now();
      const opt = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeMix: true, includeSmooth: true });
      const t1 = performance.now();
      return { ms: t1 - t0, evalCount: opt.evalCount, budgetExhausted: opt.budgetExhausted, mixYears: opt.mixYears.length };
    });
    ok('all-3-levers, retire-55-to-90 window finishes in well under 15s', r.ms < 15000, r);
  });

  // 11. Edge case: no lever included at all -> no crash, empty per-year
  // window, current smoothWithdrawals setting kept as the only "candidate".
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeMultiLever(selected, {});
      return { threw: false, activeYears: opt.activeYears.length, cost: opt.cost };
    });
    ok('no levers included: returns cleanly with no active per-year window', r.activeYears === 0 && !r.threw, r);
  });

  // 12. The mix lever's window is NOT a user-configurable field (unlike
  // the Roth ladder) — it's derived automatically from retireAgeA/B
  // through lifeExpectancyA/B (a retiree funds spending every year of
  // retirement, not just during a chosen ladder window), capped at the
  // same 30-year safety rail. Confirm it tracks those fields and is
  // independent of the Roth ladder's own (possibly disjoint) window.
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      document.getElementById('retireAgeA').value = 60;
      document.getElementById('retireAgeA').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('retireAgeB').value = 62;
      document.getElementById('retireAgeB').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('lifeExpectancyA').value = 75;
      document.getElementById('lifeExpectancyA').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('lifeExpectancyB').value = 75;
      document.getElementById('lifeExpectancyB').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvStartAge').value = 60;
      document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvEndAge').value = 62;
      document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeMix: true });
      return { rothYears: opt.rothYears, mixYears: opt.mixYears };
    });
    // mixStartAge = min(retireAgeA=60, retireAgeB=62) = 60; mixEndAge =
    // max(lifeExpectancyA=75, lifeExpectancyB=75) = 75 -> ages 60..75.
    ok('decoupled windows: Roth lever searches only its own configured range', JSON.stringify(r.rothYears) === JSON.stringify([60, 61, 62]), r);
    ok(
      'mix window is derived automatically from retireAge/lifeExpectancy, not a shared/configured field',
      r.mixYears.length === 16 && r.mixYears[0] === 60 && r.mixYears.at(-1) === 75,
      r,
    );
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
