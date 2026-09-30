// Ad-hoc Playwright test for the multi-lever withdrawal & conversion
// optimizer (optimizeMultiLever() in Planner_US.html), which extends the
// per-year Roth optimizer (see test_roth_optimizer_per_year.js) with two
// more independently toggleable levers: capital-gain harvesting
// (solveGainHarvest()) and a household-wide smoothed-withdrawals A/B.
// Not wired into `npm test`/CI — run directly with
// `node test_multi_lever_optimizer.js`.
//
// Relies on the window.__test_* hooks exposed at the bottom of the main
// IIFE: __test_simulate, __test_optimizeRothLadderPerYear,
// __test_optimizeMultiLever, __test_rothScheduleCost,
// __test_setRothOverride, __test_setGainHarvestOverride,
// __test_solveGainHarvest, __test_ROTH_PER_YEAR_CANDIDATES,
// __test_GAIN_HARVEST_CANDIDATES.
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

// Scenario used by several tests below: a large, mostly-unrealized taxable
// brokerage balance, a no-income-tax state (so the only tax on harvested
// gain is federal LTCG — isolates the 0%-bracket mechanics from state-tax
// noise), bridge income during the harvest window sized to just cover
// spending (a surplus/no-portfolio-withdrawal year, so the harvest doesn't
// have to compete with a same-year withdrawal-driven gain for the same
// 0% bracket room), and real withdrawals resuming once the bridge ends —
// which is what lets a reset cost basis actually pay off within the
// window this test looks at.
function setupHarvestFavorable(page) {
  return page.evaluate(() => {
    document.getElementById('stateTax').value = 'fl';
    document.getElementById('stateTax').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('taxable').value = '2000000';
    document.getElementById('taxable').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('basisRatio').value = 10;
    document.getElementById('basisRatio').dispatchEvent(new Event('input', { bubbles: true }));
    if (!document.getElementById('bridgeEnabled').checked) document.getElementById('bridgeEnabled').click();
    document.getElementById('bridgeIncomeA').value = '64000';
    document.getElementById('bridgeIncomeA').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('bridgeStartAgeA').value = '55';
    document.getElementById('bridgeStartAgeA').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('bridgeEndAgeA').value = '59';
    document.getElementById('bridgeEndAgeA').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('rothConvStartAge').value = 55;
    document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('rothConvEndAge').value = 59;
    document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
    // Harvest now has its own independent window (gainHarvestStartAge/
    // EndAge, decoupled from the Roth fields above — see docs/
    // reference.md) — scope it to match this scenario's favorable years
    // so harvest-only runs here stay tight instead of searching the much
    // wider life-long default (55-100, truncated to 30).
    document.getElementById('gainHarvestStartAge').value = 55;
    document.getElementById('gainHarvestStartAge').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('gainHarvestEndAge').value = 59;
    document.getElementById('gainHarvestEndAge').dispatchEvent(new Event('input', { bubbles: true }));
  });
}

(async () => {
  // 1. solveGainHarvest sizing matches a hand-computed 0%-bracket ceiling.
  // With no other ordinary income and no conversion, ordinaryTaxable is 0
  // (the 32200 standard deduction more than absorbs it), so the 0% LTCG
  // room is the full zeroLimit itself (98900 for MFJ, year 0, undeflated)
  // — the deduction is subtracted from income side, not added to the
  // bracket ceiling — capped by whatever gain the pool can actually
  // supply (gainRatio * pool).
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      const profile = { filing: 'mfj', otherA: 0, otherB: 0, ssA: 0, ssB: 0 };
      window.__test_setGainHarvestOverride(new Map([[60, 'zero']]));
      const result = window.__test_solveGainHarvest(profile, 1000000, 500000, Infinity, 0, 0, 60);
      window.__test_setGainHarvestOverride(null);
      return result;
    });
    // gainRatio = 1 - 500000/1000000 = 0.5; room = 98900 (zeroLimit, since
    // ordinaryTaxable clamps to 0 here); pool can supply up to
    // 1000000*0.5=500000 of gain, so the bracket room (98900) is binding.
    ok('solveGainHarvest: fills exactly to the 0% LTCG bracket ceiling', Math.abs(r.gain - 98900) < 1, r);
    ok('solveGainHarvest: harvest amount = gain / gainRatio', Math.abs(r.amount - 98900 / 0.5) < 1, r);
  });

  // 2. 0 is a real sentinel ("harvest nothing"), not "not found falling
  // through to something else" — mirrors the same guard the Roth override
  // needed (see rothBracketOverrideByAge's comment in Planner_US.html).
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      const profile = { filing: 'mfj', otherA: 0, otherB: 0, ssA: 0, ssB: 0 };
      window.__test_setGainHarvestOverride(new Map([[60, 0]]));
      const result = window.__test_solveGainHarvest(profile, 1000000, 500000, Infinity, 0, 0, 60);
      window.__test_setGainHarvestOverride(null);
      return result;
    });
    ok('solveGainHarvest: a mapped 0 harvests nothing', r.gain === 0 && r.amount === 0, r);
  });

  // 3. End-to-end basis correctness: harvesting in a favorable scenario
  // (see setupHarvestFavorable) actually lowers total tax+healthcare cost
  // versus not harvesting — proving the realized gain gets funded through
  // the real tax engine (confirmed ~$0 incremental tax at harvest time,
  // since it fits the 0% bracket and FL has no state tax) AND that the
  // basis reset persists to reduce a later year's real withdrawal tax
  // (otherwise cost would be unchanged, as it is in scenarios with no
  // later realization — see docs/reference.md for why that's correct,
  // not a bug).
  await withPage(async (page) => {
    await setupHarvestFavorable(page);
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const selectedCost = window.__test_rothScheduleCost(selected);
      window.__test_setGainHarvestOverride(new Map([[55, 'zero'], [56, 'zero'], [57, 'zero'], [58, 'zero'], [59, 'zero']]));
      const harvested = window.__test_simulate();
      window.__test_setGainHarvestOverride(null);
      const harvestedCost = window.__test_rothScheduleCost(harvested);
      return { selectedCost, harvestedCost };
    });
    ok(
      'harvesting in a favorable scenario (surplus year, later real withdrawal) lowers total cost',
      r.harvestedCost < r.selectedCost - 1,
      r,
    );
  });

  // 4. The harvest-only optimizer discovers that win on its own and never
  // recommends a schedule worse than doing nothing.
  await withPage(async (page) => {
    await setupHarvestFavorable(page);
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const selectedCost = window.__test_rothScheduleCost(selected);
      const opt = window.__test_optimizeMultiLever(selected, { includeHarvest: true });
      return { selectedCost, optCost: opt.cost, schedule: [...opt.harvestSchedule.entries()].filter(([, v]) => v !== 0) };
    });
    ok('harvest-only optimizer finds a real improvement here', r.optCost < r.selectedCost - 1, r);
    ok('harvest-only optimizer never worse than doing nothing', r.optCost <= r.selectedCost + 1, r);
    ok('harvest-only optimizer actually picked a non-zero year', r.schedule.length > 0, r);
  });

  // 5. Harvest never overrides the guardrail: in a stressed scenario where
  // the plan is already right at the edge, the optimizer must not pick a
  // harvest schedule that depletes the portfolio earlier than today's
  // configured plan — same guardrail contract as the Roth optimizer.
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      document.getElementById('taxable').value = '400000';
      document.getElementById('taxable').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('basisRatio').value = 5;
      document.getElementById('basisRatio').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('retireAgeA').value = 50;
      document.getElementById('retireAgeA').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('retireAgeB').value = 50;
      document.getElementById('retireAgeB').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvStartAge').value = 50;
      document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvEndAge').value = 60;
      document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('gainHarvestStartAge').value = 50;
      document.getElementById('gainHarvestStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('gainHarvestEndAge').value = 60;
      document.getElementById('gainHarvestEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeMultiLever(selected, { includeHarvest: true });
      return { selectedDepletedAge: selected.depletedAge, optDepletedAge: opt.depletedAge };
    });
    const notWorse = r.selectedDepletedAge ? !r.optDepletedAge || r.optDepletedAge >= r.selectedDepletedAge : !r.optDepletedAge;
    ok('harvest-only optimizer respects the depletion guardrail under stress', notWorse, r);
  });

  // 6. Combining levers is never worse than either alone — coordinate
  // ascent's zero-schedule candidate for the OTHER lever is always
  // reachable, so adding a lever to the search can only find as-good-or-
  // better schedules, never force a worse one.
  await withPage(async (page) => {
    await setupHarvestFavorable(page);
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const harvestOnly = window.__test_optimizeMultiLever(selected, { includeHarvest: true });
      const rothOnly = window.__test_optimizeMultiLever(selected, { includeRoth: true });
      const both = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeHarvest: true });
      return { harvestOnlyCost: harvestOnly.cost, rothOnlyCost: rothOnly.cost, bothCost: both.cost };
    });
    ok('roth+harvest together is never worse than harvest alone', r.bothCost <= r.harvestOnlyCost + 1, r);
    ok('roth+harvest together is never worse than roth alone', r.bothCost <= r.rothOnlyCost + 1, r);
  });

  // 7. The smoothed-withdrawals A/B actually tries both settings and
  // picks whichever is cheaper — verified by independently forcing each
  // setting and confirming the optimizer's pick matches the cheaper one.
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      document.getElementById('rothConvStartAge').value = 55;
      document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvEndAge').value = 55;
      document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      const selected = window.__test_simulate();

      // Force each setting through the real checkbox (no direct state
      // setter is exposed for this — and it keeps this test closer to how
      // a real user session would reach each setting) and read the cost
      // of each, then compare against what the optimizer itself picks.
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
    await setupHarvestFavorable(page);
    const r = await page.evaluate(() => {
      const selected = window.__test_simulate();
      const opt1 = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeHarvest: true, includeSmooth: true });
      const opt2 = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeHarvest: true, includeSmooth: true });
      return {
        same:
          JSON.stringify([...opt1.rothSchedule.entries()]) === JSON.stringify([...opt2.rothSchedule.entries()]) &&
          JSON.stringify([...opt1.harvestSchedule.entries()]) === JSON.stringify([...opt2.harvestSchedule.entries()]) &&
          opt1.smoothWithdrawals === opt2.smoothWithdrawals,
      };
    });
    ok('all-3-levers run is deterministic across repeated calls', r.same, r);
  });

  // 10. Performance: all 3 levers together over a realistic (20-year)
  // window stays well under what "smoothly, doesn't run for an
  // incredibly long time" requires — and either finishes within budget
  // or degrades gracefully (best-found-so-far, no hang) if it doesn't.
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      document.getElementById('rothConvStartAge').value = 55;
      document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvEndAge').value = 74;
      document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('gainHarvestStartAge').value = 55;
      document.getElementById('gainHarvestStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('gainHarvestEndAge').value = 74;
      document.getElementById('gainHarvestEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      if (!document.getElementById('acaEnabled').checked) document.getElementById('acaEnabled').click();
      const selected = window.__test_simulate();
      const t0 = performance.now();
      const opt = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeHarvest: true, includeSmooth: true });
      const t1 = performance.now();
      return { ms: t1 - t0, evalCount: opt.evalCount, budgetExhausted: opt.budgetExhausted };
    });
    ok('all-3-levers, 20-year window finishes in well under 10s', r.ms < 10000, r);
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

  // 12. The two per-year levers search their OWN configured windows, not
  // a shared one — set the Roth and harvest windows to disjoint age
  // ranges and confirm each lever's returned year list matches its own
  // field, never the other lever's, and the union (activeYears) covers
  // both disjoint ranges with no overlap-assumption baked in.
  await withPage(async (page) => {
    const r = await page.evaluate(() => {
      document.getElementById('rothConvStartAge').value = 60;
      document.getElementById('rothConvStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('rothConvEndAge').value = 62;
      document.getElementById('rothConvEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('gainHarvestStartAge').value = 70;
      document.getElementById('gainHarvestStartAge').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('gainHarvestEndAge').value = 73;
      document.getElementById('gainHarvestEndAge').dispatchEvent(new Event('input', { bubbles: true }));
      const selected = window.__test_simulate();
      const opt = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeHarvest: true });
      return {
        rothYears: opt.rothYears,
        harvestYears: opt.harvestYears,
        activeYears: opt.activeYears,
      };
    });
    ok(
      'decoupled windows: Roth lever searches only its own configured range',
      JSON.stringify(r.rothYears) === JSON.stringify([60, 61, 62]),
      r,
    );
    ok(
      'decoupled windows: harvest lever searches only its own configured range',
      JSON.stringify(r.harvestYears) === JSON.stringify([70, 71, 72, 73]),
      r,
    );
    ok(
      'decoupled windows: activeYears is the disjoint union of both',
      JSON.stringify(r.activeYears) === JSON.stringify([60, 61, 62, 70, 71, 72, 73]),
      r,
    );
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
