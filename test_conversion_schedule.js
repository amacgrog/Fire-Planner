// UI check (CI: `npm run test:ui`, not `npm test`) of the conversion schedule on the Roth conversion bracket card (Batch 5 step 5,
// Task 5; spec section 5; src/us/ui/results/roth-optimizer.js renderConversionSchedule, src/us/ui/results/render.js renderOpenCards).
// The table (Age | Conversion | Why) is built from the dashboard's own run (window.fireProjectionRows): one row per year with a
// conversion of at least $1, the amount in the dashboard's dollars, the why cell the row's own convChoice / cliffChoice or the
// plan's flat bracket. Sections: (1) the gap table's CA couple at life 100 (real dollars; the heading; the why cell); (2) future
// dollars (amounts differ, each follows its row); (3) a spending `input` then the flush (the table follows the new rows, and is
// marked stale with the card in between); (4) Apply the searched plan (the heading names it; the table is its run), then Clear;
// (5) a sized plan (TX single at life 100, $60k, 5-year reserve): the why cells carry the sized years' convChoice;
// (6) a household that converts nothing (the line shows, the table is hidden); conversions off (the card is hidden); (7) 390 px.
// S4 Task 11, the card's two lines (#rothOptimizerHeld, #rothOptimizerOverLine; ruling 7, the owner's wording): (8) the fixture
// (tests/fixtures/dana-and-chris.json): the over-the-line line names the 22%, 24%, 32% and 35% rows at 60-61, the held line the
// ACA line at 59 and the plan's stay-under at 64-66; (9) both
// lines at 390 px; (10) a spending input: stale with the card, then the lines follow the new run; (11) the 'aca' couple of
// tests/unit/us/conv-held-by.test.js: the held line names the ACA line and the balance; (11b) one row named (singular); (12) a run held by nothing: both lines hidden.
// The cliffChoice "Filled to" why cell (ruling 8) is tested in tests/unit/us/roth-optimizer-ages.test.js (no household converts
// in a phased fill year).
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
  await page.evaluate(() => { window.__startState = JSON.parse(JSON.stringify(window.__test_getState())); });

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
  // This household's rows are all unsized (flat); a change in sizing here fails the check instead of silencing it.
  ok('1: an unsized year says the plan\'s bracket, not the setting', real.whyKinds.every((k) => k === 'flat') && real.drawn.every((r) => r[2] === flat(real.bracket)), [real.drawn, real.bracket, real.whyKinds]);
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

  await page.setViewportSize({ width: 1280, height: 900 });

  // S4 Task 11: the card's two lines (ruling 7). Each household is set on the page's starting state (the defaults), as the Vitest
  // suite tests/unit/us/conv-held-by.test.js sets it on the defaults, so the held kinds there are the ones drawn here.
  const setupFresh = (patch) => page.evaluate((p) => {
    window.__test_setBracketSearch(true);
    window.__test_replaceState({ ...JSON.parse(JSON.stringify(window.__startState)), ...p });
    window.__test_syncControls();
    document.getElementById('themeToggleBtn').click(); // a full render
    window.__test_flushRender();
  }, patch);
  const lines = () => page.evaluate(() => {
    const el = (id) => document.getElementById(id);
    const card = el('rothOptimizerCard');
    return {
      held: el('rothOptimizerHeld').hidden ? null : el('rothOptimizerHeld').textContent,
      over: el('rothOptimizerOverLine').hidden ? null : el('rothOptimizerOverLine').textContent,
      inCard: card.contains(el('rothOptimizerHeld')) && card.contains(el('rothOptimizerOverLine')),
      heldMap: Object.fromEntries(window.fireProjectionRows.filter((r) => r.convHeldBy).map((r) => [r.age, r.convHeldBy])),
      overAny: window.fireProjectionRows.some((r) => r.convOverAca),
    };
  });
  // In the page: the two lines ruling 7 asks for, computed here from the rows and the card's runs (no code of the app formats them).
  function expectedLines() {
    const ranges = (ages) => {
      const s = [...new Set(ages)].sort((a, b) => a - b), out = [];
      for (let i = 0; i < s.length; ) { let j = i; while (s[j + 1] === s[j] + 1) j++; out.push(j > i ? s[i] + '-' + s[j] : String(s[i])); i = j + 1; }
      return out.join(', ');
    };
    const rows = window.fireProjectionRows, dep = window.fireProjection.depletedAge;
    const byKind = {};
    for (const r of rows) if (r.convHeldBy) (byKind[r.convHeldBy] ||= []).push(r.age);
    const phrase = { aca: 'the ACA 400% line', irmaa: 'the IRMAA tier', stayUnder: "the cliff plan's stay-under", sized: 'tax-aware sizing', plan: "the cliff plan's fill", balance: 'the balance' };
    const kinds = Object.keys(byKind).sort((a, b) => byKind[a][0] - byKind[b][0]); // by first age
    const held = kinds.length ? `What holds the conversions: ${kinds.map((k) => `${phrase[k]} at ${ranges(byKind[k])}`).join(', ')}.` : null;
    const card = window.__test_rothOptimizerCard();
    const conv = Object.fromEntries(rows.map((r) => [r.age, r.conversionAmount]));
    const names = [], ages = [];
    for (const r of card.results) {
      if (r.bracket === card.currentBracket || (dep ? !r.depletedAge || r.depletedAge >= dep : !r.depletedAge)) continue;
      const a = [...r.overAca].filter(([age, c]) => c - (conv[age] || 0) >= 1).map(([age]) => age);
      if (a.length) { names.push(r.bracket + '%'); ages.push(...a); }
    }
    const many = names.length > 1;
    const list = many ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0];
    const over = names.length ? `The ${list} row${many ? 's' : ''} run${many ? '' : 's'} out sooner: ${many ? 'they' : 'it'} convert${many ? '' : 's'} at ${ranges(ages)}, when you're already over the ACA 400% line, so the extra tax buys no premium savings.` : null;
    return { held, over };
  }
  const expected = () => page.evaluate(`(${expectedLines})()`);
  const FIXTURE = require('./tests/fixtures/dana-and-chris.json');
  const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };

  // 8. The fixture (Dana and Chris): the plan keeps the 10% bracket for the 22% setting and runs out at 95. Every row above it runs
  // out earlier (22% at 94, 24% at 92, 32% at 90, 35% at 88; measured 2026-11-03) and converts at 60 and 61 with the MAGI already
  // over the ACA line (convOverAca; the 22% row $87,579 / $80,666, Task 10), where the dashboard's run converts 0: the line names
  // all four. The dashboard's run is held at 59 (the ACA line) and 64-66 (the plan's stay-under): the held line lists both, by
  // first age.
  await setupFresh(FIXTURE.state);
  await openCard();
  const fx = await lines();
  ok('8: premise: the held kinds (conv-held-by.test.js)', JSON.stringify(fx.heldMap) === JSON.stringify({ 59: 'aca', 64: 'stayUnder', 65: 'stayUnder', 66: 'stayUnder' }), fx.heldMap);
  ok('8: the over-the-line line names the 22%-35% rows at 60-61', fx.over === "The 22%, 24%, 32% and 35% rows run out sooner: they convert at 60-61, when you're already over the ACA 400% line, so the extra tax buys no premium savings.", fx.over);
  ok('8: the held line names the ACA line at 59 and the stay-under at 64-66', fx.held === "What holds the conversions: the ACA 400% line at 59, the cliff plan's stay-under at 64-66.", fx.held);
  ok('8: both lines are as the rows and the card\'s runs say', JSON.stringify(await expected()) === JSON.stringify({ held: fx.held, over: fx.over }));
  ok('8: both lines sit inside the card', fx.inCard);

  // 9. Phone width with both lines shown (the dashboard tab, where the card is).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#mobileTabDashboard');
  const fxNarrow = await lines();
  ok('9: 390x844: both lines shown', fxNarrow.held !== null && fxNarrow.over !== null, fxNarrow);
  ok('9: 390x844: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.setViewportSize({ width: 1280, height: 900 });

  // 10. The light render: a spending input marks the card (the lines inside it) stale; after the flush the lines follow the new run.
  const fxTyped = await page.evaluate(`(() => {
    const el = document.getElementById('spending');
    el.focus();
    el.value = '150000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const stale = document.getElementById('rothOptimizerCard').classList.contains('stale');
    window.__test_flushRender();
    return { stale, fresh: !document.getElementById('rothOptimizerCard').classList.contains('stale') };
  })()`);
  ok('10: between the keystroke and the flush the card (with the lines) is stale', fxTyped.stale === true);
  ok('10: after the flush the card is fresh', fxTyped.fresh === true);
  const fxAfter = await lines(), fxExp = await expected();
  ok('10: after the flush the lines follow the new run', fxAfter.held === fxExp.held && fxAfter.over === fxExp.over, [fxAfter, fxExp]);
  ok('10: the new run draws other lines than before the input', fxAfter.held !== fx.held || fxAfter.over !== fx.over, fxAfter);

  // 11. The held line's positive 'aca' case: conv-held-by.test.js's couple 60/60 on the marketplace, guard on (held 60-64 by the
  // ACA line, 65-66 by the balance).
  await setupFresh({ ...ZERO, singlePerson: false, filingStatus: 'mfj', children: [], ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 90, lifeExpectancyB: 90, acaEnabled: true, acaEnhanced: false, ssMonthlyA: 0, ssMonthlyB: 0, stateTax: 'tx', rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 70, rothConvBracket: 22, tradIraA: 300000, taxable: 400000, spending: 40000, cliffGuardEnabled: true });
  await openCard();
  const aca = await lines();
  ok('11: premise: the held kinds (conv-held-by.test.js)', JSON.stringify(aca.heldMap) === JSON.stringify({ 60: 'aca', 61: 'aca', 62: 'aca', 63: 'aca', 64: 'aca', 65: 'balance', 66: 'balance' }), aca.heldMap);
  ok('11: the held line names the ACA line at 60-64 and the balance at 65-66', aca.held === 'What holds the conversions: the ACA 400% line at 60-64, the balance at 65-66.', aca.held);
  ok('11: the over-the-line line is as the card\'s runs say', aca.over === (await expected()).over, aca.over);

  // 11b. One row named: the fixture at $125,000 spending (found 2026-11-03 by a spending sweep; Node 24): only the 35% row runs out
  // sooner with a conversion over the line (60-61), so the line is singular.
  await setupFresh({ ...FIXTURE.state, spending: 125000 });
  await openCard();
  const one = await lines();
  ok('11b: the singular line names the 35% row', one.over === "The 35% row runs out sooner: it converts at 60-61, when you're already over the ACA 400% line, so the extra tax buys no premium savings.", one.over);
  ok("11b: the line is as the rows and the card's runs say", JSON.stringify(await expected()) === JSON.stringify({ held: one.held, over: one.over }), one);

  // 12. No limit: a single person, 60, retired, ACA off, the guard off, $1.5M traditional, conversions 60-62 at 12%, life 70:
  // no year held (premise), both lines hidden.
  await setupFresh({ ...ZERO, singlePerson: true, children: [], ageA: 60, retireAgeA: 60, lifeExpectancyA: 70, acaEnabled: false, cliffGuardEnabled: false, tradIraA: 1500000, rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 62, rothConvBracket: 12 });
  await openCard();
  const none2 = await lines();
  ok('12: premise: no row has convHeldBy, none convOverAca', JSON.stringify(none2.heldMap) === '{}' && !none2.overAny, none2);
  ok('12: both lines hidden', none2.held === null && none2.over === null, none2);

  ok('no page errors', errors.length === 0, errors);
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
