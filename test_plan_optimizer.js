// UI check (CI: `npm run test:ui`, not `npm test`) of the plan optimizer card (Batch 5 step 4a, spec 4.4-4.6;
// src/us/ui/results/plan-optimizer.js): Search (optimizePlan) shows the gain and the historical and Monte Carlo success rates
// with and without the found plan; Apply stores it (state.storedPlan) and the dashboard runs it; undo; the autosave round trip;
// the card's states (fresh and used, stale and used, stale and not used with the reason, the cliff plan off); a drawn search
// gone stale (the inputs or the tax year changed: Apply hides and is refused); Clear; a
// household where the automatic plan is already the best (no Apply); Search right after Apply; a saved scenario carrying a stored plan in the comparison; 390 px; a stored plan
// the guard does not use that wins the search (Apply offered to re-store it under the searched objective); the same answer in
// nominal and real display mode; Optimize's sized trials (a sized search win, applied, its conversions in the year table).
// The households: tests/unit/us/plan-search.test.js's SINGLE52 (the search wins on lifetimeCost with sizing off, which sections 1
// and 3 set, as that test does) and the gap table's TX single
// at life 100 (tests/unit/helpers/scan-grid.mjs GAP_CASES; the search finds nothing better), as literal patches loaded through the autosave.
//   node test_plan_optimizer.js
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const { isDeepStrictEqual } = require('util');

let pass = 0, fail = 0;
function ok(desc, cond, detail) {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL: ' + desc + (detail !== undefined ? ' -- ' + JSON.stringify(detail).slice(0, 600) : ''));
  }
}

const STORAGE_KEY = 'fireCouplePlanner.massachusettsOffline.v1';
const URL = pathToFileURL(path.resolve(__dirname, 'dist', 'Planner_US.html')).href;
// tests/unit/us/plan-search.test.js's SINGLE52: the grid's single person, 52, 1,500,000 traditional, 300,000 taxable, spending
// 60,000, conversions on, no elections (the search wins on lifetimeCost).
const SINGLE52 = {
  singlePerson: true, children: [], ageA: 52, ageB: 52, retireAgeA: 52, retireAgeB: 52, lifeExpectancyA: 95, lifeExpectancyB: 95,
  acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: 300000, spending: 60000, smoothWithdrawals: false,
  withdrawalMixEnabled: false, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 72, rothConvBracket: 22,
  ruleOf55A: false, ruleOf55B: false, sepp72tK401A: false, cliffGuardEnabled: true, tradIraA: 0, tradIraB: 0,
  trad401kA: 1500000, trad401kB: 0, rothIraA: 200000, rothIraB: 0, roth401kA: 0, roth401kB: 0, rothIraBasisA: 0, rothIraBasisB: 0,
};
// The gap table's "early ACA single (TX)" at life 100 (tests/unit/helpers/scan-grid.mjs GAP_CASES), the guard on.
const TX100 = {
  singlePerson: true, ageA: 55, retireAgeA: 55, acaEnabled: true, stateTax: 'tx', spending: 60000, taxable: 600000,
  lifeExpectancyA: 100, rothConvEnabled: true, rothConvStartAge: 55, rothConvEndAge: 74, tradIraA: 0, tradIraB: 0,
  trad401kA: 1200000, trad401kB: 0, rothIraA: 100000, rothIraB: 0, roth401kA: 0, roth401kB: 0, rothIraBasisA: 0, rothIraBasisB: 0,
  cliffGuardEnabled: true, withdrawalMixEnabled: false,
};
const IN_USE = 'Applied plan in use.';
const STILL_BEATS = 'Applied plan in use. It was computed for different inputs; it still beats the automatic plan on these inputs. Re-run Optimize to refine it.';
const NO_LONGER = 'Your applied plan was computed for different inputs and no longer beats the automatic plan, which is in use. Re-run Optimize.';
const REASONS = [' (it runs out earlier)', ' (it draws on home equity earlier)', ' (it scores lower)'];
const GUARD_OFF = 'The cliff plan is off, so the applied plan is not used.';
const AUTO_BEST = 'The automatic plan is already the best this search found.';
const SEARCH_STALE = 'Your inputs changed since this search; search again.';
const APPLIED_BEST = 'Your applied plan is already the best this search found.';
const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// A household loaded through the autosave: a fresh context (empty storage), the save written, then a reload.
async function openHousehold(browser, patch) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify({ state: patch, mode: 'real' })]);
  await page.reload();
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
  return { context, page };
}
const hooksExist = (page) => page.evaluate(() => ['__test_optimizePlan', '__test_applyStoredPlan', '__test_clearStoredPlan', '__test_planOptimizerCard'].every((h) => typeof window[h] === 'function') && !!document.getElementById('planOptimizerCard'));
const card = (page) => page.evaluate(() => window.__test_planOptimizerCard());
const getStored = (page) => page.evaluate(() => window.__test_getState().storedPlan);
async function openCard(page) {
  if (!(await page.evaluate(() => document.getElementById('planOptimizerCard').open))) await page.click('#planOptimizerCard > summary');
}
// The card's Search button on an objective; waits for the result to show.
async function search(page, objective) {
  await openCard(page);
  await page.check(objective === 'lifetimeCost' ? '#planObjectiveLifetimeCost' : '#planObjectiveEndValue');
  await page.evaluate(() => { document.getElementById('planOptimizerResult').hidden = true; });
  await page.click('#planOptimizerSearchBtn');
  await page.locator('#planOptimizerResult').waitFor({ state: 'visible', timeout: 180000 });
  return card(page);
}
// The dashboard rows against the `apply` run of a plan (rows compared deep and strict).
async function rowsAre(page, plan) {
  const { rows, applied } = await page.evaluate((plan) => ({ rows: window.fireProjectionRows, applied: window.__test_runPlanMode({ planMode: 'apply', plan }).rows }), plan);
  return isDeepStrictEqual(rows, applied);
}
// Which plan the dashboard runs: the stored plan, or the automatic one (planForState for the live state).
const planInUse = (page) => page.evaluate(() => {
  const sp = window.__test_getState().storedPlan, p = window.__test_planForState();
  return { kind: sp && JSON.stringify(p) === JSON.stringify(sp.plan) ? 'stored' : 'auto', plan: p };
});
// A field set as the person types: `input`, then (change) the `change` that flushes the deferred pass.
const setField = (page, id, v, change = true) => page.evaluate(({ id, v, change }) => {
  const el = document.getElementById(id);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (change) el.dispatchEvent(new Event('change', { bubbles: true }));
}, { id, v, change });
const setGuard = (page, on) => page.evaluate((on) => {
  const el = document.getElementById('cliffGuardEnabled');
  el.checked = on;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, on);
// The cliff plan's per-year conversion sizing off on this page (it ships on since V148), then a full render (the theme toggle,
// twice, so the theme is unchanged). Sections 1 and 3 need SINGLE52's search win: with sizing on the base is sized and the trials are
// not (spec B0.11.4), and SINGLE52's sized base costs less than every trial, so the automatic plan wins. A reload resets it.
const sizingOff = (page) => page.evaluate(() => {
  window.__test_setConversionSizing(false);
  document.getElementById('themeToggleBtn').click();
  document.getElementById('themeToggleBtn').click();
});
const pctCells = (c) => c.rates.length === 2 && c.rates.every((r) => r.length === 3 && /^\d+%$/.test(r[1]) && /^\d+%$/.test(r[2]));

(async () => {
  const browser = await chromium.launch();
  const timings = {};

  // 1. SINGLE52: Search -> Apply -> the dashboard runs the plan; undo; reload; stale states; guard; Clear.
  {
    const { context, page } = await openHousehold(browser, SINGLE52);
    ok('the hooks and the card exist', await hooksExist(page));
    if (fail) {
      console.log(`${pass} passed, ${fail} failed`);
      await browser.close();
      process.exit(1);
    }
    ok('SINGLE52: loaded through the autosave', await page.evaluate(() => window.__test_getState().ageA === 52 && window.__test_getState().storedPlan === null));
    await sizingOff(page);
    const found = await search(page, 'lifetimeCost');
    timings.single52 = found.ms;
    ok('search: the search wins', found.winner === 'search', found);
    ok('search: a gain in lifetime tax + healthcare', /costs an estimated \$[\d,]+ less lifetime tax \+ healthcare \(today's dollars\)/.test(found.summary), found.summary);
    ok('search: four rates', pctCells(found), found.rates);
    ok('search: the multipliers line', /^How strongly the plan weighs future tax when choosing the years to stay under or fill a line: before 65 ×[\d.]+, 65 to RMDs ×[\d.]+, RMD years ×[\d.]+\.$/.test(found.mult), found.mult);
    ok('search: the plan in words', found.planText.startsWith('The plan found: '), found.planText);
    ok('search: Apply shown', found.applyShown);

    // The drawn result after the inputs change (no click): Apply hides and the card says to search again; back to the searched
    // inputs, Apply shows again. The same for the tax year (the test hook, then a render): Apply is refused under another year.
    await setField(page, 'spending', 61000, false);
    const edited = await card(page);
    ok('edited inputs: Apply hides on the light render', !edited.applyShown, edited);
    ok('edited inputs: the card says to search again', edited.applyNote === SEARCH_STALE, edited.applyNote);
    await setField(page, 'spending', 60000);
    const back = await card(page);
    ok('searched inputs again: Apply shows, no note', back.applyShown && back.applyNote === '', back);
    await page.evaluate(() => window.__test_setCurrentYear(2027));
    await setField(page, 'spending', 60000);
    const otherYear = await card(page);
    ok('another tax year: Apply hides, the card says to search again', !otherYear.applyShown && otherYear.applyNote === SEARCH_STALE, otherYear);
    ok('another tax year: Apply refused, no stored plan', (await page.evaluate(() => window.__test_applyStoredPlan())) === false && (await getStored(page)) === null);
    ok('another tax year: the refusal copy', (await card(page)).applyNote === SEARCH_STALE, (await card(page)).applyNote);
    await page.evaluate(() => window.__test_setCurrentYear(2026));
    await setField(page, 'spending', 60000);
    ok('the searched tax year again: Apply shows', (await card(page)).applyShown, await card(page));
    // A write with no render (a hook, test code): the memo is keyed on the live JSON, so this is already a miss and Apply passes
    // fresh anyway; the check guards against a memo keyed on cliffPlanStore.key (the state's JSON at the last refresh).
    await page.evaluate(() => { window.__test_getState().spending = 61000; });
    ok('a write with no render: Apply refused, no stored plan', (await page.evaluate(() => window.__test_applyStoredPlan())) === false && (await getStored(page)) === null);
    await page.evaluate(() => { window.__test_getState().spending = 60000; });
    await setField(page, 'spending', 60000);

    await page.click('#planOptimizerApplyBtn');
    const sp = await getStored(page);
    ok('apply: a stored plan', !!sp && sp.v === 1 && sp.objective === 'lifetimeCost' && sp.taxYear === 2026, sp);
    ok('apply: the summary holds the rates shown', !!sp && `${(sp.summary.success.mc[0] * 100).toFixed(0)}%` === found.rates[1][1] && `${(sp.summary.success.hist[1] * 100).toFixed(0)}%` === found.rates[0][2], sp && sp.summary);
    const applied = await card(page);
    ok('apply: "Applied plan in use."', applied.status === IN_USE && !applied.statusHidden, applied.status);
    ok('apply: the Apply button hides', !applied.applyShown);
    ok('apply: the dashboard rows are the stored plan\'s apply run', await rowsAre(page, sp.plan));
    ok('apply: the summary line names the applied plan', (await page.textContent('#cliffPlanSummary')).startsWith('Applied plan'), await page.textContent('#cliffPlanSummary'));
    await page.click('#chartGroupMcBtn');
    await page.locator('#mcSuccessRate', { hasText: '%' }).waitFor();
    ok('apply: the dashboard\'s Monte Carlo rate is the card\'s "with" rate', (await page.textContent('#mcSuccessRate')) === found.rates[1][1], [await page.textContent('#mcSuccessRate'), found.rates[1][1]]);
    await page.click('#chartGroupProjectionBtn');

    // Undo (the toast's button): no stored plan, the automatic plan's rows.
    await page.click('#undoToastBtn');
    const undone = await planInUse(page);
    ok('undo: no stored plan', (await getStored(page)) === null);
    ok('undo: the automatic plan runs', undone.kind === 'auto' && JSON.stringify(undone.plan) !== JSON.stringify(sp.plan), undone.kind);
    ok('undo: the rows are the automatic plan\'s', await rowsAre(page, undone.plan));
    ok('undo: the status hides', (await card(page)).statusHidden);
    ok('apply again (the hook, the last search)', await page.evaluate(() => window.__test_applyStoredPlan()));
    ok('apply again: in use', (await card(page)).status === IN_USE);

    // The last search's result after the inputs changed: not applied (the card asks for a new search); back to the searched
    // inputs, it applies, made for them.
    await setField(page, 'spending', 61000);
    ok('changed inputs: Apply refused', (await page.evaluate(() => window.__test_applyStoredPlan())) === false && isDeepStrictEqual(await getStored(page), sp));
    ok('changed inputs: the card says to search again', (await card(page)).applyNote === SEARCH_STALE, (await card(page)).applyNote);
    await setField(page, 'spending', 60000);
    ok('searched inputs again: Apply works, not stale', (await page.evaluate(() => window.__test_applyStoredPlan())) === true && (await card(page)).status === IN_USE, (await card(page)).status);

    // Reload: the autosave keeps the stored plan, and it runs.
    await page.reload();
    await page.waitForFunction(() => typeof window.__test_planOptimizerCard === 'function');
    await sizingOff(page);
    const reloaded = await getStored(page);
    ok('reload: the stored plan survives', isDeepStrictEqual(reloaded, sp), reloaded);
    ok('reload: "Applied plan in use." (not stale)', (await card(page)).status === IN_USE, (await card(page)).status);
    ok('reload: the rows are the stored plan\'s', await rowsAre(page, sp.plan));

    // Stale but still winning: Partner A's life expectancy one year off (the first of these values where it still wins).
    let stale = null;
    for (const v of [96, 94, 97, 93]) {
      await setField(page, 'lifeExpectancyA', v);
      const c = await card(page);
      if (c.status === STILL_BEATS) { stale = v; break; }
    }
    console.log(`stale and still winning at lifeExpectancyA ${stale}`);
    ok('stale: a life expectancy where the plan is stale and still wins', stale !== null, stale);
    if (stale !== null) ok('stale: the rows are the stored plan\'s', await rowsAre(page, sp.plan));
    await setField(page, 'lifeExpectancyA', 95);
    ok('stale: back to 95, fresh again', (await card(page)).status === IN_USE, (await card(page)).status);

    // Stale and losing: spending up (the first of these values where the stored plan no longer wins after the flush).
    let lose = null;
    for (const v of [80000, 100000, 120000, 70000, 90000, 140000]) {
      await setField(page, 'spending', v, false);
      await page.evaluate(() => window.__test_flushRender());
      const c = await card(page);
      if (c.status.startsWith(NO_LONGER)) { lose = v; break; }
    }
    ok('losing: a spending where the stored plan no longer wins', lose !== null, lose);
    await setField(page, 'spending', 60000);
    ok('losing: back to 60000, in use', (await card(page)).status === IN_USE, (await card(page)).status);
    if (lose !== null) {
      // Typed in steps (input only), then the flush: after each input the rows are the plan in use (the stored plan or the
      // automatic one; the guard decides per value, so the plan may change between values). For the last value, every rows
      // object drawn from its input through the flush is recorded: each is one of the two plans' runs, and the plan switches at
      // most once (the light render, then the deferred pass).
      const kinds = [];
      let rowsOk = true;
      for (let k = 1; k <= 4; k++) {
        if (k === 4)
          await page.evaluate(() => {
            let v = window.fireProjectionRows;
            window.__rowsLog = [];
            Object.defineProperty(window, 'fireProjectionRows', { configurable: true, get: () => v, set: (x) => { v = x; window.__rowsLog.push(x); } });
          });
        await setField(page, 'spending', 60000 + ((lose - 60000) * k) / 4, false);
        const u = await planInUse(page);
        kinds.push(u.kind);
        if (!(await rowsAre(page, u.plan))) rowsOk = false;
      }
      await page.evaluate(() => window.__test_flushRender());
      const after = await planInUse(page);
      const drawn = await page.evaluate((stored) => {
        const json = (x) => JSON.stringify(x);
        const s = json(window.__test_runPlanMode({ planMode: 'apply', plan: stored }).rows),
          a = json(window.__test_runPlanMode({ planMode: 'apply', plan: window.__test_planForState() }).rows);
        return window.__rowsLog.map((r) => (json(r) === s ? 'stored' : json(r) === a ? 'auto' : 'other'));
      }, sp.plan);
      const switches = drawn.slice(1).filter((k, i) => k !== drawn[i]).length;
      console.log(`typing: the plan in use per value ${JSON.stringify(kinds)}, the last value's drawn rows ${JSON.stringify(drawn)}`);
      ok('typing: the rows are the plan in use after each input', rowsOk);
      ok("typing: the last value's rows are each one of the two plans' runs", drawn.length > 0 && drawn.every((k) => k !== 'other'), drawn);
      ok('typing: the plan switches at most once from the last input through the flush', switches <= 1, drawn);
      const c = await card(page);
      console.log(`losing at spending ${lose}: ${c.status}`);
      ok('losing: the "no longer beats" copy with its reason', REASONS.some((r) => c.status === NO_LONGER + r), c.status);
      ok('losing: the automatic plan runs', after.kind === 'auto', after.kind);
      ok('losing: the rows are the automatic plan\'s', await rowsAre(page, after.plan));
      await setField(page, 'spending', 60000);
      ok('losing: edited back, used again', (await card(page)).status === IN_USE && (await planInUse(page)).kind === 'stored', (await card(page)).status);
    }

    // The guard off, then on.
    await setGuard(page, false);
    ok('guard off: the "cliff plan is off" copy', (await card(page)).status === GUARD_OFF, (await card(page)).status);
    await setGuard(page, true);
    ok('guard on: used again', (await card(page)).status === IN_USE, (await card(page)).status);

    // Clear.
    await openCard(page);
    await page.click('#planOptimizerClearBtn');
    ok('clear: the status hides', (await card(page)).statusHidden);
    ok('clear: no stored plan', (await getStored(page)) === null);


    ok('SINGLE52: no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }

  // 2. TX at life 100: the automatic plan is already the best; no Apply button.
  {
    const { context, page } = await openHousehold(browser, TX100);
    const r = await search(page, 'endValue');
    timings.tx100 = r.ms;
    ok('TX: the automatic plan wins', r.winner === 'base', r.winner);
    ok('TX: the "already the best" copy', r.summary === AUTO_BEST, r.summary);
    ok('TX: no Apply button', !r.applyShown);
    ok('TX: four rates, equal with and without', pctCells(r) && r.rates.every((row) => row[1] === row[2]), r.rates);
    const hook = await page.evaluate(() => { const x = window.__test_optimizePlan('endValue'); return { winner: x.winner, gain: x.gain, rates: !!x.rates }; });
    ok('TX: the hook gives the same verdict', hook.winner === 'base' && hook.gain === 0 && hook.rates, hook);
    ok('TX: no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }
  // The depleting household (tests/helpers/plan-households.js DEPLETING: the defaults, spending 120,000): nothing to offer.
  {
    const { context, page } = await openHousehold(browser, { spending: 120000 });
    const r = await search(page, 'endValue');
    ok('depleting: the "already the best" copy', r.winner === 'base' && r.summary === AUTO_BEST, [r.winner, r.summary]);
    ok('depleting: no Apply button', !r.applyShown);
    ok('depleting: no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }

  // 3. SINGLE52 applied through the card's button: Search right after Apply (the applied plan wins, no Apply button); a saved scenario with the stored plan in the comparison; 390 px.
  {
    const { context, page } = await openHousehold(browser, SINGLE52);
    await sizingOff(page);
    const r = await search(page, 'lifetimeCost');
    ok('applied: the search wins', r.winner === 'search' && r.applyShown, r);
    await page.click('#planOptimizerApplyBtn');
    ok('apply: a stored plan, in use', !!(await getStored(page)) && (await card(page)).status === IN_USE, (await card(page)).status);

    const again = await search(page, 'lifetimeCost');
    ok('search after apply: the applied plan wins', again.winner === 'current', again.winner);
    ok('search after apply: the "your applied plan" copy', again.summary === APPLIED_BEST, again.summary);
    ok('search after apply: no Apply button', !again.applyShown);

    // The comparison with a saved scenario carrying the stored plan: typing plans nothing for it, and its row is the dashboard
    // after loading it.
    await page.evaluate(() => {
      document.getElementById('scenarioName').value = 'With plan';
      document.getElementById('saveScenarioBtn').click();
      const box = document.querySelector('#scenarioList [data-compare]');
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const scenarioEnd = () => page.evaluate(() => {
      const row = [...document.querySelectorAll('#scenarioCompareRows tr')].find((tr) => tr.children[0] && tr.children[0].textContent === 'With plan');
      const m = row && /^\$[\d,]+/.exec(row.children[5].textContent);
      return m ? m[0] : null;
    });
    const c0 = await page.evaluate(() => window.__test_planForStateComputes());
    const end0 = await scenarioEnd();
    await setField(page, 'spending', 61000, false);
    const c1 = await page.evaluate(() => window.__test_planForStateComputes());
    ok('comparison: typing plans nothing for the saved scenario', c1 - c0 === 0, [c0, c1]);
    ok('comparison: the scenario row is shown and unchanged', end0 !== null && (await scenarioEnd()) === end0, [end0, await scenarioEnd()]);
    await page.evaluate(() => document.getElementById('spending').dispatchEvent(new Event('change', { bubbles: true })));
    await page.click('#scenarioList [data-load]');
    const loaded = await page.evaluate(() => ({ end: window.fireProjection.endAssets, sp: !!window.__test_getState().storedPlan }));
    ok('comparison: loading it gives the row\'s end assets', fmt(loaded.end) === end0 && loaded.sp, [fmt(loaded.end), end0, loaded.sp]);
    ok('comparison: loaded, the stored plan is in use', (await card(page)).status === IN_USE, (await card(page)).status);

    // 390 x 844 with the card open and a result shown.
    await page.setViewportSize({ width: 390, height: 844 });
    ok('390x844: the result is shown', !(await card(page)).resultHidden);
    ok('390x844: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    ok('applied: no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }

  // 4. COUPLE62 (tests/unit/us/plan-search.test.js): a stored plan the guard does not use (the search's own endValue winner,
  // stored under lifetimeCost, where it scores lower) wins the search on endValue: Apply is offered (the plan re-stored under
  // endValue), and once applied the guard uses it. (It was the MFJ couple, 62, with a constructed IRMAA fill at 66 stored under
  // lifetimeCost; since the maintained bond reserve of Batch 5 step 5b that fill changes nothing, so the plan stored is now the
  // endValue search's own winner, as the Vitest case does.)
  {
    const { scanHouseholds } = await import(pathToFileURL(path.resolve(__dirname, 'tests/unit/helpers/scan-grid.mjs')).href);
    // The grid's two-returns couple, 62, 750,000 + 750,000 traditional, 2,000,000 taxable, spending 130,000, conversions on, no elections.
    const COUPLE62 = scanHouseholds({ conversions: true }).find((h) => h.g.filing === 'single-couple' && h.g.age === 62 && h.g.trad === 1500000 && h.g.taxable === 2000000 && h.g.spending === 130000 && h.g.elections === 'none').patch;
    // The search's own endValue winner, applied in a first context (closed: its autosave on unload would overwrite a save
    // written under it), then the household with that plan stored under lifetimeCost loaded in a fresh one.
    const first = await openHousehold(browser, COUPLE62);
    const f = await search(first.page, 'endValue');
    ok('not in use: the search finds a winner to store', f.winner === 'search', f.winner);
    await first.page.click('#planOptimizerApplyBtn');
    const applied = await getStored(first.page);
    await first.context.close();
    const plan = applied.plan;
    const sp0 = { ...applied, objective: 'lifetimeCost', madeFor: 'test', summary: { gain: 0, success: { hist: [null, null], mc: [null, null] } } };
    const { context, page } = await openHousehold(browser, { ...COUPLE62, storedPlan: sp0 });
    ok('not in use: the stored plan loaded', isDeepStrictEqual(await getStored(page), sp0), await getStored(page));
    ok('not in use: the "no longer beats" copy, it scores lower', (await card(page)).status === NO_LONGER + ' (it scores lower)', (await card(page)).status);
    ok('not in use: the automatic plan runs', (await planInUse(page)).kind === 'auto');
    const r = await search(page, 'endValue');
    ok('not in use: the applied plan wins the search', r.winner === 'current', r.winner);
    ok('not in use: the re-apply copy', /^Your applied plan is not in use now \(the automatic plan is\)\. On this objective it leaves an estimated \$[\d,]+ more after-tax end value \(today's dollars\), compared with the automatic plan; re-applying it under this objective would put it in use\.$/.test(r.summary), r.summary);
    ok('not in use: Apply shown', r.applyShown);
    ok('not in use: the plan in words is the stored plan\'s (no "not used" clause)', r.planText.startsWith('The plan found: ') && !r.planText.includes('not used'), r.planText);
    await page.click('#planOptimizerApplyBtn');
    const sp = await getStored(page);
    ok('re-apply: stored under endValue, the same plan', !!sp && sp.objective === 'endValue' && isDeepStrictEqual(sp.plan, plan), sp);
    ok('re-apply: "Applied plan in use."', (await card(page)).status === IN_USE, (await card(page)).status);
    ok('re-apply: the rows are the stored plan\'s', await rowsAre(page, plan));
    const again = await search(page, 'endValue');
    ok('re-apply, search again: the "your applied plan" copy, no Apply', again.winner === 'current' && again.summary === APPLIED_BEST && !again.applyShown, again);
    ok('COUPLE62: no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }

  // 5. The decision question's ladder row with a stored plan in use (the GAP "CA" household keeps the 24% bracket over the
  // user's 22%): the automatic plan stored as the applied plan is a tie, so it is used, and the row names the applied plan.
  // The status line's "comparison not computed yet" case (a stored plan with no verdict for the state) is not reachable from
  // the UI: every render plans the state before the status is drawn, so `stored` is null only with the guard off (its own line).
  {
    const { GAP_CASES } = await import(pathToFileURL(path.resolve(__dirname, 'tests/unit/helpers/scan-grid.mjs')).href);
    const ca = GAP_CASES.find((c) => /\(CA\)/.test(c.name));
    // bondYears 0: this case is about the kept bracket, not the bond reserve; with the default 5 years the maintained reserve (Batch 5
    // step 5b) leaves the CA couple's 22% as the best bracket (as tests/unit/us/bracket-search.test.js).
    const patch = { ...ca.patch(100, 100), bondYears: 0, withdrawalMixEnabled: false, cliffGuardEnabled: true };
    const ladder = (page) => page.evaluate(() => {
      document.querySelector('#decisionQuestions button[data-question="rothLadder"]').click();
      return document.getElementById('decisionAnswer').textContent;
    });
    const first = await openHousehold(browser, patch);
    const auto = await first.page.evaluate(() => window.__test_planForState());
    const autoLadder = await ladder(first.page);
    await first.context.close();
    ok('ladder row: the automatic plan keeps another bracket', auto && auto.bracket !== auto.bracketFrom && auto.bracketFrom === 22, auto && [auto.bracket, auto.bracketFrom]);
    ok('ladder row: no stored plan says the cliff plan', autoLadder.includes(`to the cliff plan's ${auto.bracket}% bracket, not your ${auto.bracketFrom}%`), autoLadder);
    const sp0 = { v: 1, plan: auto, objective: 'endValue', mult: null, madeFor: 'test', taxYear: 2026, summary: { gain: 0, success: { hist: [null, null], mc: [null, null] } } };
    const { context, page } = await openHousehold(browser, { ...patch, storedPlan: sp0 });
    const status = (await card(page)).status;
    ok('ladder row: the stored plan is in use', status.startsWith('Applied plan in use'), status);
    const text = await ladder(page);
    ok('ladder row: names the applied plan', text.includes(`to the applied plan's ${auto.bracket}% bracket, not your ${auto.bracketFrom}%`) && !text.includes("cliff plan's"), text);
    ok('ladder: no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }

  // 6. The plan card gives the same answer in nominal and in real display mode (moved from the retired test_optimizer_ui.js,
  // section 4): its search ranks on the objective and reports the gain in today's dollars, and the success rates read no display
  // mode. The mode is switched with the display-mode buttons, as the other UI scripts do (test_result_cache.js); the card is run
  // with its Search button. The household is the ACA-cliff scenario of the retired optimizer suites, entered through the fields.
  {
    const { context, page } = await openHousehold(browser, {});
    const setVal = (id, v) => setField(page, id, v, false);
    await setVal('stateTax', 'fl');
    await page.evaluate(() => document.getElementById('stateTax').dispatchEvent(new Event('change', { bubbles: true })));
    for (const [id, v] of [['ageA', 45], ['ageB', 45], ['retireAgeA', 55], ['retireAgeB', 55], ['lifeExpectancyA', 90], ['lifeExpectancyB', 90],
      ['taxable', 1500000], ['basisRatio', 20], ['trad401kA', 450000], ['trad401kB', 450000], ['rothIraA', 100000], ['rothIraB', 100000],
      ['cash', 80000], ['cashReserve', 50000], ['spending', 75000], ['ssMonthlyA', 2800], ['ssMonthlyB', 2200],
      ['ssStartAgeA', 67], ['ssStartAgeB', 67]]) await setVal(id, v);
    await page.evaluate(() => {
      if (!document.getElementById('acaEnabled').checked) document.getElementById('acaEnabled').click();
      if (document.getElementById('acaEnhanced').checked) document.getElementById('acaEnhanced').click();
    });
    await setVal('rothConvStartAge', 55);
    await setVal('rothConvEndAge', 57);
    await openCard(page);
    const runIn = async (btnId) => {
      await page.evaluate((id) => document.getElementById(id).click(), btnId);
      await page.evaluate(() => { document.getElementById('planOptimizerResult').hidden = true; });
      await page.click('#planOptimizerSearchBtn');
      await page.locator('#planOptimizerResult').waitFor({ state: 'visible', timeout: 180000 });
      return page.evaluate(() => {
        const c = window.__test_planOptimizerCard();
        return { summary: c.summary, planText: c.planText, rates: c.rates, applyShown: c.applyShown };
      });
    };
    const nominal = await runIn('nominalBtn');
    const real = await runIn('realBtn');
    ok('plan card: the same result and Apply state in nominal and real mode', JSON.stringify(nominal) === JSON.stringify(real), { nominal, real });
    ok('plan card nominal/real: no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }

  // 7. Optimize's sized trials (Batch 5 step 5, Task 4) with the shipped switch (sizing on): SIZED66 of
  // tests/unit/us/plan-search.test.js, whose [1, 1, 1] trial re-planned with the sizing pass beats the sized base on endValue.
  // Search and Apply through the card: the stored plan carries its conversion targets, the dashboard runs it, and the year table's
  // status tooltip names a sized conversion.
  {
    const { scanHouseholds } = await import(pathToFileURL(path.resolve(__dirname, 'tests/unit/helpers/scan-grid.mjs')).href);
    // The grid's two-returns couple, 66, 250,000 + 250,000 traditional, 300,000 taxable, spending 60,000, conversions on, no elections.
    const SIZED66 = scanHouseholds({ conversions: true }).find((h) => h.g.filing === 'single-couple' && h.g.age === 66 && h.g.trad === 500000 && h.g.taxable === 300000 && h.g.spending === 60000 && h.g.elections === 'none').patch;
    const { context, page } = await openHousehold(browser, SIZED66);
    const r = await search(page, 'endValue');
    timings.sized66 = r.ms;
    ok('sized trials: the search wins', r.winner === 'search', r.winner);
    ok('sized trials: Apply shown', r.applyShown, r);
    await page.click('#planOptimizerApplyBtn');
    const sp = await getStored(page);
    ok('sized trials: the stored plan carries conversion targets', !!sp && sp.plan.conv !== null && Object.keys(sp.plan.conv).length > 0, sp && sp.plan.conv);
    ok('sized trials: "Applied plan in use."', (await card(page)).status === IN_USE, (await card(page)).status);
    await page.evaluate(() => window.__test_flushRender());
    ok('sized trials: the dashboard rows are the stored plan\'s apply run', !!sp && (await rowsAre(page, sp.plan)));
    const titles = await page.evaluate(() => [...document.querySelectorAll('#projectionRows tr .table-status')].map((c) => c.title));
    // The bracket card's conversion schedule shows the applied plan's per-year choice (the rows' convChoice) under the applied heading.
    if (!(await page.evaluate(() => document.getElementById('rothOptimizerCard').open))) await page.click('#rothOptimizerCard > summary');
    await page.locator('#rothOptimizerRows tr').first().waitFor();
    const sched = await page.evaluate(() => ({
      title: document.getElementById('conversionScheduleTitle').textContent,
      drawn: [...document.querySelectorAll('#conversionScheduleRows tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
      rowChoices: window.fireProjectionRows.filter((r) => r.conversionAmount >= 1).map((r) => [String(r.age), r.convChoice ? r.convChoice[0].toUpperCase() + r.convChoice.slice(1) : null]),
    }));
    const sizedRows = sched.rowChoices.filter((c) => c[1] !== null);
    ok('sized trials: the schedule heading names the applied plan', sched.title === 'Conversions in the applied plan', sched.title);
    ok('sized trials: the applied plan has sized years', sizedRows.length > 0, sched.rowChoices);
    ok('sized trials: the schedule shows each sized year\'s convChoice', sizedRows.every(([age, why]) => sched.drawn.some((r) => r[0] === age && r[2] === why)), { drawn: sched.drawn, sizedRows });
    ok('sized trials: the year table names a sized conversion', titles.some((t) => t.includes('Conversion: ')), titles.filter((t) => t));
    ok('sized trials: no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }

  console.log(`timing (search + four rates, ms): SINGLE52 ${timings.single52 && timings.single52.toFixed(0)}, TX100 ${timings.tx100 && timings.tx100.toFixed(0)}, SIZED66 ${timings.sized66 && timings.sized66.toFixed(0)}`);
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
