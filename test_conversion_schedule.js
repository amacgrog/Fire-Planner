// UI check (CI: `npm run test:ui`, not `npm test`) of the conversion schedule on the Roth conversion bracket card (Batch 5 step 5,
// Task 5; spec section 5; src/us/ui/results/roth-optimizer.js renderConversionSchedule, src/us/ui/results/render.js renderOpenCards).
// The table (Age | Conversion | Why) is built from the dashboard's own run (window.fireProjectionRows): one row per year with a
// conversion of at least $1, the amount in the dashboard's dollars, the why cell the row's own convChoice / cliffChoice or the
// plan's flat bracket. Sections: (1) the gap table's CA couple at life 100 (real dollars; the heading; the why cell); (2) future
// dollars (amounts differ, each follows its row); (3) a spending `input` then the flush (the table follows the new rows, and is
// marked stale with the card in between); (4) Apply the searched plan (the heading names it; the table is its run), then Clear;
// (5) a sized plan (TX single at life 100, $60k, 5-year reserve): the why cells carry the sized years' convChoice;
// (6) a household that converts nothing (the line shows, the table is hidden); conversions off (the card is hidden); (7) 390 px.
// bondYears 0 for the CA couple, as test_bracket_search.js (the search keeps another bracket than the setting there).
//   node test_conversion_schedule.js
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
function ok(desc, cond, detail) {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL: ' + desc + (detail !== undefined ? ' -- ' + JSON.stringify(detail) : ''));
  }
}

// In the page: the table as drawn, and what it should say, computed here from the rows with no code of the app.
function readSchedule() {
  const inflation = window.__test_getState().inflation;
  const nominal = document.getElementById('nominalBtn').classList.contains('active');
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const rows = window.fireProjectionRows.filter((r) => r.conversionAmount >= 1);
  const root = document.getElementById('conversionSchedule');
  const table = root.querySelector('table');
  return {
    title: document.getElementById('conversionScheduleTitle').textContent,
    none: document.getElementById('conversionScheduleNone').hidden === false,
    noneText: document.getElementById('conversionScheduleNone').textContent,
    tableHidden: table.closest('.table-wrap').hidden,
    rootHidden: root.hidden,
    stale: document.getElementById('rothOptimizerCard').classList.contains('stale'),
    drawn: [...document.querySelectorAll('#conversionScheduleRows tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
    ages: rows.map((r) => String(r.age)),
    amounts: rows.map((r) => fmt.format(nominal ? r.conversionAmount : r.conversionAmount / Math.pow(1 + inflation / 100, r.year))),
    whyKinds: rows.map((r) => (r.convChoice ? 'conv:' + cap(r.convChoice) : r.cliffChoice ? 'cliff:' + cap(r.cliffChoice) : 'flat')),
    whys: rows.map((r) => (r.convChoice ? cap(r.convChoice) : r.cliffChoice ? cap(r.cliffChoice) : null)),
    bracket: window.__test_cliffPlanState().bracket,
    setting: window.__test_getState().rothConvBracket,
  };
}

(async () => {
  const { GAP_CASES } = await import(pathToFileURL(path.resolve(__dirname, 'tests/unit/helpers/scan-grid.mjs')).href);
  const ca = GAP_CASES.find((c) => /\(CA\)/.test(c.name));
  const tx = GAP_CASES.find((c) => /\(TX\)/.test(c.name));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname, 'dist', 'Planner_US.html')).href);
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');

  const setup = (patch) => page.evaluate((p) => {
    window.__test_setBracketSearch(true);
    const base = JSON.parse(JSON.stringify(window.__test_getState()));
    window.__test_replaceState({ ...base, withdrawalMixEnabled: false, cliffGuardEnabled: true, ...p });
    window.__test_syncControls();
    document.getElementById('themeToggleBtn').click(); // a full render
    window.__test_flushRender();
  }, patch);
  const read = () => page.evaluate(`(${readSchedule})()`);
  const setMode = (m) => page.evaluate((id) => document.getElementById(id).click(), m === 'real' ? 'realBtn' : 'nominalBtn');
  const openCard = async () => {
    if (!(await page.evaluate(() => document.getElementById('rothOptimizerCard').open))) await page.click('#rothOptimizerCard > summary');
    await page.locator('#rothOptimizerRows tr').first().waitFor();
  };
  const flat = (bracket) => `Fill to the top of the ${bracket}% bracket`;

  // 1. The CA couple, real dollars.
  await setup({ ...ca.patch(100, 100), bondYears: 0 });
  await openCard();
  const real = await read();
  ok('1: the ladder converts in several years', real.ages.length >= 5, real.ages);
  ok('1: the table lists exactly the converting rows', JSON.stringify(real.drawn.map((r) => r[0])) === JSON.stringify(real.ages), [real.drawn, real.ages]);
  ok('1: each amount is the row\'s display value', JSON.stringify(real.drawn.map((r) => r[1])) === JSON.stringify(real.amounts), [real.drawn, real.amounts]);
  ok('1: heading names the plan', real.title === 'Conversions in the cliff plan', real.title);
  ok('1: the table shows, the nothing line does not', !real.none && !real.tableHidden && !real.rootHidden, real);
  ok('1: the search kept another bracket than the setting', real.bracket !== real.setting, [real.bracket, real.setting]);
  ok('1: an unsized year says the plan\'s bracket, not the setting', real.whyKinds.every((k) => k === 'flat') ? real.drawn.every((r) => r[2] === flat(real.bracket)) : true, [real.drawn, real.bracket]);
  ok('1: every why cell is a capitalised phrase', real.drawn.every((r) => /^[A-Z]/.test(r[2]) && r[2].length > 5), real.drawn);

  // 2. Future dollars.
  await setMode('nominal');
  await openCard();
  const nom = await read();
  ok('2: same years', JSON.stringify(nom.ages) === JSON.stringify(real.ages), [nom.ages, real.ages]);
  ok('2: amounts follow the rows in future dollars', JSON.stringify(nom.drawn.map((r) => r[1])) === JSON.stringify(nom.amounts), [nom.drawn, nom.amounts]);
  ok('2: the amounts differ from the real ones from the second year on', nom.amounts.slice(1).every((a, i) => a !== real.amounts[i + 1]), [nom.amounts, real.amounts]);
  await setMode('real');
  const back = await read();
  ok('2: real again: the real amounts', JSON.stringify(back.drawn.map((r) => r[1])) === JSON.stringify(real.amounts), back.drawn);

  // 3. A spending input: stale with the card, then the flush redraws from the new rows.
  const typed = await page.evaluate(`(() => {
    const el = document.getElementById('spending');
    el.focus();
    el.value = '120000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const during = (${readSchedule})();
    window.__test_flushRender();
    return { during, after: (${readSchedule})() };
  })()`);
  ok('3: between the keystroke and the flush the card is stale', typed.during.stale === true, typed.during.stale);
  ok('3: after the flush the card is fresh', typed.after.stale === false);
  ok('3: after the flush the table is the new rows', JSON.stringify(typed.after.drawn.map((r) => [r[0], r[1]])) === JSON.stringify(typed.after.ages.map((a, i) => [a, typed.after.amounts[i]])), typed.after);
  ok('3: the new rows differ from before the input', JSON.stringify(typed.after.amounts) !== JSON.stringify(real.amounts));

  // 4. Apply the searched plan, then Clear.
  await setup({ ...ca.patch(100, 100), bondYears: 0 });
  await openCard();
  const applied = await page.evaluate(() => {
    window.__test_optimizePlan('endValue');
    return window.__test_applyStoredPlan();
  });
  if (applied) {
    await openCard();
    const ap = await read();
    ok('4: applied: the heading names the applied plan', ap.title === 'Conversions in the applied plan', ap.title);
    ok('4: applied: the table is the rows', JSON.stringify(ap.drawn.map((r) => [r[0], r[1]])) === JSON.stringify(ap.ages.map((a, i) => [a, ap.amounts[i]])), ap);
    await page.evaluate(() => document.getElementById('planOptimizerClearBtn').click());
    await openCard();
    const cl = await read();
    ok('4: cleared: the heading names the cliff plan', cl.title === 'Conversions in the cliff plan', cl.title);
    ok('4: cleared: the table is the rows', JSON.stringify(cl.drawn.map((r) => [r[0], r[1]])) === JSON.stringify(cl.ages.map((a, i) => [a, cl.amounts[i]])), cl);
  } else ok('4: the searched plan could be applied (a better plan exists for this household)', false);

  // 5. A sized plan: the why cells carry the sized years' own targets.
  await setup({ ...tx.patch(100, 100), spending: 60000, bondYears: 5 });
  await openCard();
  const sized = await read();
  ok('5: sized: some year has a convChoice', sized.whyKinds.some((k) => k.startsWith('conv:')), sized.whyKinds);
  ok('5: sized: each why cell is its row\'s choice (or the flat bracket)', sized.drawn.every((r, i) => r[2] === (sized.whys[i] ?? flat(sized.bracket === null ? sized.setting : sized.bracket))), [sized.drawn, sized.whys, sized.bracket]);
  ok('5: sized: the table lists the converting rows', JSON.stringify(sized.drawn.map((r) => [r[0], r[1]])) === JSON.stringify(sized.ages.map((a, i) => [a, sized.amounts[i]])), sized);

  // 6. Converts nothing; conversions off.
  await setup({ ...ca.patch(100, 100), bondYears: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0 });
  await openCard();
  const none = await read();
  ok('6: the household converts nothing', none.ages.length === 0, none.ages);
  ok('6: the line shows', none.none && none.noneText === 'This plan converts nothing.', none);
  ok('6: the table is hidden and has no rows', none.tableHidden && none.drawn.length === 0, none);
  await page.evaluate(() => {
    const box = document.getElementById('rothConvEnabled');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });
  ok('6: conversions off: the card is hidden', await page.evaluate(() => document.getElementById('rothOptimizerCard').hidden));
  await page.evaluate(() => {
    const box = document.getElementById('rothConvEnabled');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // 6b. The cliff plan off: no plan to name, the heading says "your plan"; the table is still the rows.
  await setup({ ...ca.patch(100, 100), bondYears: 0, cliffGuardEnabled: false });
  await openCard();
  const off = await read();
  ok('6b: cliff plan off in the state', await page.evaluate(() => window.__test_getState().cliffGuardEnabled === false));
  ok('6b: the heading says your plan', off.title === 'Conversions in your plan', off.title);
  ok('6b: the table is the rows', off.ages.length > 0 && JSON.stringify(off.drawn.map((r) => [r[0], r[1]])) === JSON.stringify(off.ages.map((a, i) => [a, off.amounts[i]])), off);

  // 7. Phone width with the card open and a long table.
  await setup({ ...ca.patch(100, 100), bondYears: 0 });
  await openCard();
  await page.setViewportSize({ width: 390, height: 844 });
  ok('7: 390x844: the table is there', (await read()).drawn.length >= 5);
  ok('7: 390x844: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  ok('no page errors', errors.length === 0, errors);
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
