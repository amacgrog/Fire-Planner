// UI check (CI: `npm run test:ui`, not `npm test`) of the conversion schedule on the Roth conversion bracket card (Batch 5 step 5,
// Task 5; the schedule-why plan, 2026-11-03; spec section 5; src/us/ui/results/roth-optimizer.js renderConversionSchedule /
// scheduleRows / scheduleWhy, src/us/ui/results/render.js renderOpenCards).
// The table (Age | Conversion | Why) is built from the dashboard's own run (window.fireProjectionRows). Rulings 1-3 of the plan with
// revision 2: every year of the ladder window shows, and outside it a row that converts at least $1 or carries a held kind
// (convHeldBy); adjacent $0 rows with one why collapse into "62-66"; a converting row's why is the first of: the sized year's own
// target, filled to, the held kind, the target, the flat bracket (a row under $1: below). readSchedule (below) computes the expected
// table from the rows with no code of the app. Sections: (1) the gap table's CA couple at life 100 (real dollars; the heading; the
// why cells); (2) future dollars (each amount follows its row); (3) a spending `input` then the flush (stale in between, then the
// new rows); (4) Apply the searched plan (the heading names it), then Clear; (5) a sized plan (TX single at life 100, $60k, 5-year
// reserve): the sized years' convChoice; (6) a household that converts nothing (the line shows) whose plan stays under the line
// (the row under it, ruling 5); conversions off (the card is hidden); (6c) nothing shown (the table hidden); (6b) the cliff plan off
// ("your plan"); (7) 390 px.
// The held line is gone (ruling 4); the over-the-line line stays (S4 ruling 7, the owner's wording): (8) the fixture
// (tests/fixtures/dana-and-chris.json): the schedule reads 59 (held by the ACA line) and 62-66 (one collapsed stay-under row); the
// over-the-line line names the 22%, 24%, 32% and 35% rows at 60-61; (9) 390 px; (10) a spending input: stale with the card, then the
// schedule and the line follow the new run; (11) the 'aca' couple of tests/unit/us/conv-held-by.test.js: the ACA line at 60-64, the
// balance at 65-66; (11b) one row named (singular); (12) a run held by nothing: the schedule is the converting rows with the flat
// bracket, the line hidden; (13) the NY gap household at 100: the sized $0 rows and the IRMAA tier; (14) a run that holds but
// converts nothing (ruling 5): the line and the held rows under it; (15) the schedule never writes a cached row
// (__test_freezeSimResults); (16) the screenshot household (the fixture at a 24% setting the plan turns into 22%, the ladder
// 59-71): 59 held by the ACA line, 60-61 the bracket, 62-66 stayed under, 67-71 the IRMAA tier.
// Revision 2 (the owner, at the STOP): every window year shows (R2-1), a row under $1 says why (R2-3: stayed under, the split, the
// sizing's no conversion, the held kind, convZeroBy 'full' "No room left in the N% bracket" / 'empty' "Nothing left to convert", a
// fill, a target, the fallback "No conversion", which no household here reaches: every read checks it), and the table fits the card
// (R2-4: sections 8, 9 and 16 at 1280 and 390 px).
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

// In the page: the table as drawn, and what rulings 1-3 say it should be, computed here from the rows with no code of the app.
function readSchedule() {
  const s = window.__test_getState();
  const nominal = document.getElementById('nominalBtn').classList.contains('active');
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const cap = (t) => t[0].toUpperCase() + t.slice(1);
  const cp = window.__test_cliffPlanState();
  const bracket = cp.bracket != null && cp.bracketFrom === s.rothConvBracket ? cp.bracket : s.rothConvBracket;
  const title = document.getElementById('conversionScheduleTitle').textContent;
  const plan = title === 'Conversions in the applied plan' ? 'the applied plan' : 'the cliff plan';
  const LINES = { 'Medicaid line': 'the Medicaid line', 'ACA credit floor (100%)': 'the ACA credit floor', 'ACA 400% line': 'the ACA 400% line', 'IRMAA tier': 'an IRMAA tier' };
  const line = (l) => (Object.prototype.hasOwnProperty.call(LINES, l) ? LINES[l] : l);
  const HELD = { aca: 'Held by the ACA 400% line', irmaa: 'Held under an IRMAA tier', balance: 'The whole remaining balance', stayUnder: `Held by ${plan}'s stay-under`, plan: `Held by ${plan}'s fill` };
  const whyOf = (r) => {
    const cc = r.cliffChoice || '';
    if (r.conversionAmount < 1) {
      // revision 2 (R2-3): a row under $1
      if (cc.startsWith('stayed under ')) return ['under', 'Stayed under ' + line(cc.slice(13))];
      if (r.drawSplit) return ['split', `No conversion; Partner ${r.drawSplit}'s accounts drawn first`];
      if (r.convChoice === 'no conversion (tax-aware)') return ['none', 'No conversion (tax-aware)'];
      if (HELD[r.convHeldBy]) return ['held:' + r.convHeldBy, HELD[r.convHeldBy]];
      if (r.convZeroBy === 'full') return ['full', `No room left in the ${bracket}% bracket`];
      if (r.convZeroBy === 'empty') return ['empty', 'Nothing left to convert'];
      if (cc.startsWith('filled to ')) return ['filled', 'Filled to ' + line(cc.slice(10))];
      if (r.convChoice) return ['conv', cap(r.convChoice)];
      return ['fallback', 'No conversion'];
    }
    if (r.convChoice && (!r.convHeldBy || r.convHeldBy === 'sized')) return ['conv', cap(r.convChoice)];
    if (cc.startsWith('filled to ')) return ['filled', 'Filled to ' + line(cc.slice(10))];
    if (HELD[r.convHeldBy]) return ['held:' + r.convHeldBy, HELD[r.convHeldBy]];
    if (r.convChoice) return ['conv', cap(r.convChoice)];
    return ['flat', `Fill to the top of the ${bracket}% bracket`];
  };
  const shown = [];
  for (const r of window.fireProjectionRows) {
    const converts = r.conversionAmount >= 1;
    const inWindow = r.age >= s.rothConvStartAge && r.age <= s.rothConvEndAge;
    if (!(inWindow || converts || r.convHeldBy)) continue;
    const [kind, why] = whyOf(r), last = shown[shown.length - 1];
    if (!converts && last && !last.converts && last.to + 1 === r.age && last.why === why) { last.to = r.age; continue; }
    shown.push({ from: r.age, to: r.age, converts, kind, why, amount: converts ? fmt.format(nominal ? r.conversionAmount : r.conversionAmount / Math.pow(1 + s.inflation / 100, r.year)) : '$0' });
  }
  const root = document.getElementById('conversionSchedule');
  const table = root.querySelector('table');
  return {
    title,
    none: document.getElementById('conversionScheduleNone').hidden === false,
    noneText: document.getElementById('conversionScheduleNone').textContent,
    tableHidden: table.closest('.table-wrap').hidden,
    rootHidden: root.hidden,
    stale: document.getElementById('rothOptimizerCard').classList.contains('stale'),
    drawn: [...document.querySelectorAll('#conversionScheduleRows tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
    expected: shown.map((x) => [x.from === x.to ? String(x.from) : `${x.from}-${x.to}`, x.amount, x.why]),
    kinds: shown.map((x) => x.kind),
    fallback: shown.filter((x) => x.kind === 'fallback').map((x) => x.from),
    zeroBy: Object.fromEntries(window.fireProjectionRows.filter((r) => r.convZeroBy).map((r) => [r.age, r.convZeroBy])),
    converting: window.fireProjectionRows.filter((r) => r.conversionAmount >= 1).map((r) => String(r.age)),
    bracket: cp.bracket,
    setting: s.rothConvBracket,
  };
}

(async () => {
  const { GAP_CASES } = await import(pathToFileURL(path.resolve(__dirname, 'tests/unit/helpers/scan-grid.mjs')).href);
  const ca = GAP_CASES.find((c) => /\(CA\)/.test(c.name));
  const tx = GAP_CASES.find((c) => /\(TX\)/.test(c.name));
  const ny = GAP_CASES.find((c) => c.name === 'couple 58, trad-heavy, ACA (NY)');
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
  // every read: no tested household reaches the "No conversion" fallback (revision 2, R2-3 step 7)
  const read = async () => {
    const x = await page.evaluate(`(${readSchedule})()`);
    ok('no row reaches the "No conversion" fallback', x.fallback.length === 0, [x.title, x.fallback, x.drawn]);
    return x;
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const asExpected = (x) => same(x.drawn, x.expected);
  // revision 2 (R2-4): the schedule table fits its wrap (no horizontal scroll inside the card), its Why cells inside the wrap
  const fits = () => page.evaluate(() => {
    const t = document.querySelector('#conversionSchedule table'), wrap = t.closest('.table-wrap'), box = wrap.getBoundingClientRect();
    const whys = [...t.querySelectorAll('td:last-child')].map((td) => td.getBoundingClientRect());
    return t.scrollWidth <= wrap.clientWidth && wrap.scrollWidth <= wrap.clientWidth && whys.length > 0 && whys.every((r) => r.right <= box.right + 0.5 && r.left >= box.left - 0.5);
  });
  const setMode = (m) => page.evaluate((id) => document.getElementById(id).click(), m === 'real' ? 'realBtn' : 'nominalBtn');
  const openCard = async () => {
    if (!(await page.evaluate(() => document.getElementById('rothOptimizerCard').open))) await page.click('#rothOptimizerCard > summary');
    await page.locator('#rothOptimizerRows tr').first().waitFor();
  };
  const flat = (bracket) => `Fill to the top of the ${bracket}% bracket`;
  const amountsOf = (x) => x.drawn.filter((r) => r[1] !== '$0').map((r) => r[1]);

  // 1. The CA couple, real dollars.
  await setup({ ...ca.patch(100, 100), bondYears: 0 });
  await openCard();
  const real = await read();
  ok('1: the ladder converts in several years', real.converting.length >= 5, real.converting);
  ok('1: the table is rulings 1-3 on the rows (ages, amounts, whys)', asExpected(real), [real.drawn, real.expected]);
  ok('1: every converting row is listed', real.converting.every((a) => real.drawn.some((r) => r[0] === a)), [real.drawn, real.converting]);
  ok('1: heading names the plan', real.title === 'Conversions in the cliff plan', real.title);
  ok('1: the table shows, the nothing line does not', !real.none && !real.tableHidden && !real.rootHidden, real);
  ok('1: the search kept another bracket than the setting', real.bracket !== real.setting, [real.bracket, real.setting]);
  // This household converts at 62-74: 62 unheld and unsized (flat), 63-74 held by the IRMAA tier (measured 2026-11-03, Node 24); a
  // change in sizing or holding here fails the check instead of silencing it.
  ok('1: premise: the why kinds', same(real.kinds, ['flat', ...Array(12).fill('held:irmaa')]) && same(real.drawn.map((r) => r[0]), ['62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74']), [real.drawn, real.kinds]);
  ok("1: the unheld converting year says the plan's bracket, not the setting", real.drawn[0][2] === flat(real.bracket), [real.drawn, real.bracket]);
  ok('1: the held years say the IRMAA tier', real.drawn.slice(1).every((r) => r[2] === 'Held under an IRMAA tier'), real.drawn);
  ok('1: every why cell is a capitalised phrase', real.drawn.every((r) => /^[A-Z]/.test(r[2]) && r[2].length > 5), real.drawn);

  // 2. Future dollars.
  await setMode('nominal');
  await openCard();
  const nom = await read();
  ok('2: same rows', same(nom.drawn.map((r) => [r[0], r[2]]), real.drawn.map((r) => [r[0], r[2]])), [nom.drawn, real.drawn]);
  ok('2: amounts follow the rows in future dollars', asExpected(nom), [nom.drawn, nom.expected]);
  ok('2: the converting amounts differ from the real ones from the second year on', amountsOf(nom).slice(1).every((a, i) => a !== amountsOf(real)[i + 1]), [nom.drawn, real.drawn]);
  await setMode('real');
  const back = await read();
  ok('2: real again: the real amounts', same(back.drawn, real.drawn), back.drawn);

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
  ok('3: after the flush the table is the new rows', asExpected(typed.after), typed.after);
  ok('3: the new rows differ from before the input', !same(typed.after.drawn, real.drawn));

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
    ok('4: applied: the table is the rows', asExpected(ap), ap);
    await page.evaluate(() => document.getElementById('planOptimizerClearBtn').click());
    await openCard();
    const cl = await read();
    ok('4: cleared: the heading names the cliff plan', cl.title === 'Conversions in the cliff plan', cl.title);
    ok('4: cleared: the table is the rows', asExpected(cl), cl);
  } else ok('4: the searched plan could be applied (a better plan exists for this household)', false);

  // 5. A sized plan: the why cells carry the sized years' own targets.
  await setup({ ...tx.patch(100, 100), spending: 60000, bondYears: 5 });
  await openCard();
  const sized = await read();
  ok('5: sized: some year says its own target', sized.kinds.includes('conv'), sized.kinds);
  ok('5: sized: the table is rulings 1-3 on the rows', asExpected(sized), [sized.drawn, sized.expected]);

  // 6. Converts nothing: the CA couple with no traditional balance. Every window year shows (R2-1): the cliff plan still stays under
  // the ACA line at 62-64, and 65-74 have nothing to convert (convZeroBy 'empty'; measured 2026-11-03), so the line shows and, under it
  // (ruling 5), those rows.
  await setup({ ...ca.patch(100, 100), bondYears: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0 });
  await openCard();
  const none = await read();
  ok('6: the household converts nothing', none.converting.length === 0, none.converting);
  ok('6: the line shows', none.none && none.noneText === 'This plan converts nothing.', none);
  ok('6: under it the window years: stayed under, then nothing to convert', !none.tableHidden && same(none.drawn, [['62-64', '$0', 'Stayed under the ACA 400% line'], ['65-74', '$0', 'Nothing left to convert']]) && asExpected(none), none);
  ok("6: premise: every window year is 'empty' (no balance)", same(Object.keys(none.zeroBy), ['62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74']) && Object.values(none.zeroBy).every((k) => k === 'empty'), none.zeroBy);
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

  // 6c. Nothing shown: the same household with the ladder window before its first year (40-45; no window year, nothing converts or is
  // held outside it): the line shows, the table is hidden.
  await setup({ ...ca.patch(100, 100), bondYears: 0, rothConvStartAge: 40, rothConvEndAge: 45 });
  await openCard();
  const empty = await read();
  ok('6c: converts nothing, holds nothing', empty.converting.length === 0 && empty.expected.length === 0, empty);
  ok('6c: the line shows, the table is hidden and has no rows', empty.none && empty.tableHidden && empty.drawn.length === 0, empty);

  // 6b. The cliff plan off: no plan to name, the heading says "your plan"; the table is still the rows.
  await setup({ ...ca.patch(100, 100), bondYears: 0, cliffGuardEnabled: false });
  await openCard();
  const off = await read();
  ok('6b: cliff plan off in the state', await page.evaluate(() => window.__test_getState().cliffGuardEnabled === false));
  ok('6b: the heading says your plan', off.title === 'Conversions in your plan', off.title);
  ok('6b: the table is the rows', off.drawn.length > 0 && asExpected(off), off);

  // 7. Phone width with the card open and a long table.
  await setup({ ...ca.patch(100, 100), bondYears: 0 });
  await openCard();
  await page.setViewportSize({ width: 390, height: 844 });
  ok('7: 390x844: the table is there', (await read()).drawn.length >= 5);
  ok('7: 390x844: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  await page.setViewportSize({ width: 1280, height: 900 });

  // From here each household is set on the page's starting state (the defaults), as the Vitest suite
  // tests/unit/us/conv-held-by.test.js sets it on the defaults, so the held kinds there are the ones drawn here.
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
      heldGone: el('rothOptimizerHeld') === null && !/What holds the conversions/.test(card.textContent),
      over: el('rothOptimizerOverLine').hidden ? null : el('rothOptimizerOverLine').textContent,
      inCard: card.contains(el('rothOptimizerOverLine')),
      heldMap: Object.fromEntries(window.fireProjectionRows.filter((r) => r.convHeldBy).map((r) => [r.age, r.convHeldBy])),
      overAny: window.fireProjectionRows.some((r) => r.convOverAca),
      amount: Object.fromEntries(window.fireProjectionRows.map((r) => [r.age, r.conversionAmount])),
    };
  });
  // In the page: the over-the-line line S4 ruling 7 asks for, computed here from the rows and the card's runs (no code of the app
  // formats it).
  function expectedOver() {
    const ranges = (ages) => {
      const s = [...new Set(ages)].sort((a, b) => a - b), out = [];
      for (let i = 0; i < s.length; ) { let j = i; while (s[j + 1] === s[j] + 1) j++; out.push(j > i ? s[i] + '-' + s[j] : String(s[i])); i = j + 1; }
      return out.join(', ');
    };
    const rows = window.fireProjectionRows, dep = window.fireProjection.depletedAge;
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
    return names.length ? `The ${list} row${many ? 's' : ''} run${many ? '' : 's'} out sooner: ${many ? 'they' : 'it'} convert${many ? '' : 's'} at ${ranges(ages)}, when you're already over the ACA 400% line, so the extra tax buys no premium savings.` : null;
  }
  const expected = () => page.evaluate(`(${expectedOver})()`);
  // the dashboard's dollars of a row's conversion (real dollars, the page's default), formatted as the test formats them
  const dollars = (x, age) => page.evaluate(([a, amt]) => {
    const r = window.fireProjectionRows.find((q) => q.age === a), s = window.__test_getState();
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amt / Math.pow(1 + s.inflation / 100, r.year));
  }, [age, x.amount[age]]);
  const FIXTURE = require('./tests/fixtures/dana-and-chris.json');
  const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
  const STAY = 'Stayed under the ACA 400% line', ACA = 'Held by the ACA 400% line', IRMAA = 'Held under an IRMAA tier';

  // 8. The fixture (Dana and Chris): the plan keeps the 10% bracket for the 22% setting and runs out at 95. The dashboard's run
  // converts only at 59, held there by the ACA line; 60-61 (over the line) have no room left in the 10% bracket (convZeroBy 'full');
  // 62-63 stay under the line with a fill of 0 ('full') and 64-66 are the plan's stay-under ('stayUnder'), so 62-66 is one row (the
  // stayed-under why for both); 67, the window's last year, has no room left again. The over-the-line line names the 22%, 24%, 32% and
  // 35% rows at 60-61 (Task 10, measured 2026-11-03).
  await setupFresh(FIXTURE.state);
  await openCard();
  const fx = await lines(), fxs = await read();
  ok('8: premise: the held kinds (conv-held-by.test.js)', same(fx.heldMap, { 59: 'aca', 64: 'stayUnder', 65: 'stayUnder', 66: 'stayUnder' }), fx.heldMap);
  ok('8: the schedule: 59 held by the ACA line, 60-61 no room, 62-66 stayed under, 67 no room', same(fxs.drawn, [['59', await dollars(fx, 59), ACA], ['60-61', '$0', 'No room left in the 10% bracket'], ['62-66', '$0', STAY], ['67', '$0', 'No room left in the 10% bracket']]), fxs.drawn);
  ok("8: premise: convZeroBy 'full' at 60-63 and 67", same(fxs.zeroBy, { 60: 'full', 61: 'full', 62: 'full', 63: 'full', 67: 'full' }), fxs.zeroBy);
  ok('8: the schedule is rulings 1-3 on the rows', asExpected(fxs), [fxs.drawn, fxs.expected]);
  ok('8: the line and the table both show (it converts at 59)', !fxs.none && !fxs.tableHidden, fxs);
  ok('8: the over-the-line line names the 22%-35% rows at 60-61', fx.over === "The 22%, 24%, 32% and 35% rows run out sooner: they convert at 60-61, when you're already over the ACA 400% line, so the extra tax buys no premium savings.", fx.over);
  ok("8: the over-the-line line is as the rows and the card's runs say", fx.over === (await expected()));
  ok('8: the held line is gone (ruling 4)', fx.heldGone);
  ok('8: the over-the-line line sits inside the card', fx.inCard);
  ok('8: 1280: the schedule table fits the card, the Why column fully visible (R2-4)', await fits());

  // 9. Phone width with the line and the schedule shown (the dashboard tab, where the card is).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#mobileTabDashboard');
  const fxNarrow = await lines(), fxsNarrow = await read();
  ok('9: 390x844: the line and the schedule shown', fxNarrow.over !== null && same(fxsNarrow.drawn, fxs.drawn), [fxNarrow, fxsNarrow.drawn]);
  ok('9: 390x844: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  ok('9: 390x844: the schedule table fits the card, the Why column fully visible (R2-4)', await fits());
  await page.setViewportSize({ width: 1280, height: 900 });

  // 10. The light render: a spending input marks the card stale; after the flush the schedule and the line follow the new run.
  const fxTyped = await page.evaluate(`(() => {
    const el = document.getElementById('spending');
    el.focus();
    el.value = '150000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const stale = document.getElementById('rothOptimizerCard').classList.contains('stale');
    window.__test_flushRender();
    return { stale, fresh: !document.getElementById('rothOptimizerCard').classList.contains('stale'), after: (${readSchedule})() };
  })()`);
  ok('10: between the keystroke and the flush the card is stale', fxTyped.stale === true);
  ok('10: after the flush the card is fresh', fxTyped.fresh === true);
  const fxAfter = await lines();
  ok('10: after the flush the line follows the new run', fxAfter.over === (await expected()), fxAfter.over);
  ok('10: after the flush the schedule follows the new run', asExpected(fxTyped.after), fxTyped.after);
  ok('10: the new run draws another schedule or line than before the input', !same(fxTyped.after.drawn, fxs.drawn) || fxAfter.over !== fx.over);

  // 11. The 'aca' couple of conv-held-by.test.js: 60/60 on the marketplace, guard on (held 60-64 by the ACA line, 65-66 by the
  // balance). Every held year converts (the room, then the balance), so no row collapses.
  await setupFresh({ ...ZERO, singlePerson: false, filingStatus: 'mfj', children: [], ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 90, lifeExpectancyB: 90, acaEnabled: true, acaEnhanced: false, ssMonthlyA: 0, ssMonthlyB: 0, stateTax: 'tx', rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 70, rothConvBracket: 22, tradIraA: 300000, taxable: 400000, spending: 40000, cliffGuardEnabled: true });
  await openCard();
  const aca = await lines(), acas = await read();
  ok('11: premise: the held kinds (conv-held-by.test.js)', same(aca.heldMap, { 60: 'aca', 61: 'aca', 62: 'aca', 63: 'aca', 64: 'aca', 65: 'balance', 66: 'balance' }), aca.heldMap);
  const acaWant = [];
  for (const a of [60, 61, 62, 63, 64]) acaWant.push([String(a), await dollars(aca, a), ACA]);
  for (const a of [65, 66]) acaWant.push([String(a), await dollars(aca, a), 'The whole remaining balance']);
  acaWant.push(['67-70', '$0', 'Nothing left to convert']); // R2-1: the window's last years, the balance gone ('empty')
  ok('11: the schedule: the ACA line at 60-64, the balance at 65-66, nothing left at 67-70', same(acas.drawn, acaWant), [acas.drawn, acaWant]);
  ok('11: the schedule is rulings 1-3 on the rows', asExpected(acas), [acas.drawn, acas.expected]);
  ok("11: the over-the-line line is as the card's runs say", aca.over === (await expected()), aca.over);

  // 11b. One row named: the fixture at $125,000 spending (found 2026-11-03 by a spending sweep; Node 24): only the 35% row runs out
  // sooner with a conversion over the line (60-61), so the line is singular.
  await setupFresh({ ...FIXTURE.state, spending: 125000 });
  await openCard();
  const one = await lines();
  ok('11b: the singular line names the 35% row', one.over === "The 35% row runs out sooner: it converts at 60-61, when you're already over the ACA 400% line, so the extra tax buys no premium savings.", one.over);
  ok("11b: the line is as the rows and the card's runs say", one.over === (await expected()), one.over);

  // 12. No limit: a single person, 60, retired, ACA off, the guard off, $1.5M traditional, $400,000 taxable, $30,000 spending,
  // conversions 60-62 at 12%, life 70: no year held (premise), the line hidden, the schedule as before this change: the converting
  // rows, each the flat bracket.
  await setupFresh({ ...ZERO, singlePerson: true, children: [], ageA: 60, retireAgeA: 60, lifeExpectancyA: 70, acaEnabled: false, cliffGuardEnabled: false, tradIraA: 1500000, taxable: 400000, spending: 30000, rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 62, rothConvBracket: 12 });
  await openCard();
  const none2 = await lines(), none2s = await read();
  ok('12: premise: no row has convHeldBy, none convOverAca', same(none2.heldMap, {}) && !none2.overAny, none2);
  ok('12: the line hidden', none2.over === null, none2.over);
  const plainWant = [];
  for (const a of [60, 61, 62]) plainWant.push([String(a), await dollars(none2, a), flat(12)]);
  ok('12: the schedule: 60-62, each its own row and the flat 12% bracket', same(none2s.drawn, plainWant), [none2s.drawn, plainWant]);

  // 13. The NY gap household at 100 (conv-held-by.test.js): the sizing's 'none' years (66, 68, 69, 73) show at $0 with their own
  // target; the IRMAA tier's years say so; the plan's stay-under years (60-62, 64; $0) stay under the line.
  await setupFresh(ny.patch(100, 100));
  await openCard();
  const nyl = await lines(), nys = await read();
  ok('13: premise: the held kinds (conv-held-by.test.js)', same(nyl.heldMap, { 58: 'sized', 59: 'aca', 60: 'stayUnder', 61: 'stayUnder', 62: 'stayUnder', 63: 'irmaa', 64: 'stayUnder', 65: 'irmaa', 66: 'sized', 67: 'irmaa', 68: 'sized', 69: 'sized', 70: 'irmaa', 71: 'irmaa', 72: 'irmaa', 73: 'sized', 74: 'irmaa' }), nyl.heldMap);
  ok('13: the schedule is rulings 1-3 on the rows', asExpected(nys), [nys.drawn, nys.expected]);
  const nyAt = (age) => nys.drawn.find((r) => r[0] === age);
  ok('13: the sized $0 years show their target', ['66', '73'].every((a) => same(nyAt(a), [a, '$0', 'No conversion (tax-aware)'])) && same(nyAt('68-69'), ['68-69', '$0', 'No conversion (tax-aware)']), nys.drawn);
  ok('13: the IRMAA years say the tier', ['63', '65', '67', '70', '71', '72', '74'].every((a) => nyAt(a) && nyAt(a)[2] === IRMAA && nyAt(a)[1] !== '$0'), nys.drawn);
  ok('13: 60-62 stayed under the line, one row', same(nyAt('60-62'), ['60-62', '$0', STAY]), nys.drawn);

  // 14. Ruling 5: a run that holds but converts nothing. conv-held-by.test.js's guard-off brake couple (over the ACA line before
  // the conversion, held at $0 by the line at 60-64) with the ladder ending at 64: the nothing line shows, and under it the held
  // years as one row.
  await setupFresh({ ...ZERO, singlePerson: false, filingStatus: 'mfj', children: [], ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 90, lifeExpectancyB: 90, acaEnabled: true, acaEnhanced: false, ssMonthlyA: 0, ssMonthlyB: 0, stateTax: 'tx', rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 64, rothConvBracket: 22, tradIraA: 1000000, taxable: 400000, basisRatio: 0, spending: 150000, cliffGuardEnabled: false });
  await openCard();
  const brake = await lines(), brakes = await read();
  ok('14: premise: held by the ACA line at 60-64, converting nothing', same(brake.heldMap, { 60: 'aca', 61: 'aca', 62: 'aca', 63: 'aca', 64: 'aca' }) && brakes.converting.length === 0, [brake.heldMap, brakes.converting]);
  ok('14: the nothing line shows', brakes.none && brakes.noneText === 'This plan converts nothing.', brakes);
  ok('14: and under it the held years, one row', !brakes.tableHidden && same(brakes.drawn, [['60-64', '$0', ACA]]), brakes.drawn);

  // 15. The schedule never writes a cached row: with the results frozen, a full render with the card open throws on any write.
  const errs0 = errors.length;
  await page.evaluate(() => window.__test_freezeSimResults(true));
  await setupFresh(FIXTURE.state);
  await openCard();
  const frozen = await read();
  await page.evaluate(() => window.__test_freezeSimResults(false));
  ok('15: frozen results: no page error', errors.length === errs0, errors.slice(errs0));
  ok('15: frozen results: the schedule is drawn as before', same(frozen.drawn, fxs.drawn), frozen.drawn);
  ok('15: frozen results: the rows are frozen', (await page.evaluate(() => Object.isFrozen(window.fireProjectionRows[0]))) === true);

  // 16. The screenshot household (the owner's screenshot, 2026-11-03): the fixture with a 24% setting (the bracket search keeps 22%),
  // the ladder 59-71, traditional 401(k)s $1,482,000 / $779,000 and life 95 (found by a scratch search, 2026-11-03, Node 24): 59
  // held by the ACA line, 60-61 the 22% bracket, 62-66 the plan's stay-under (one row), 67-71 the IRMAA tier (one row each).
  await setupFresh({ ...FIXTURE.state, rothConvBracket: 24, rothConvEndAge: 71, trad401kA: 1482000, trad401kB: 779000, lifeExpectancyA: 95, lifeExpectancyB: 95 });
  await openCard();
  const shot = await lines(), shots = await read();
  ok('16: premise: the plan keeps 22% for the 24% setting', shots.bracket === 22 && shots.setting === 24, [shots.bracket, shots.setting]);
  const shotWant = [['59', await dollars(shot, 59), ACA], ['60', await dollars(shot, 60), flat(22)], ['61', await dollars(shot, 61), flat(22)], ['62-66', '$0', STAY]];
  for (const a of [67, 68, 69, 70, 71]) shotWant.push([String(a), await dollars(shot, a), IRMAA]);
  ok('16: the schedule', same(shots.drawn, shotWant), [shots.drawn, shotWant]);
  ok('16: the schedule is rulings 1-3 on the rows', asExpected(shots), [shots.drawn, shots.expected]);
  ok('16: 1280: the schedule table fits the card (R2-4)', await fits());
  await page.setViewportSize({ width: 390, height: 844 });
  ok('16: 390x844: the schedule table fits the card (R2-4)', await fits());
  ok('16: 390x844: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.setViewportSize({ width: 1280, height: 900 });

  ok('no page errors', errors.length === 0, errors);
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
