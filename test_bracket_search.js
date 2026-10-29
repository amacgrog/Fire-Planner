// UI check (CI: `npm run test:ui`, not `npm test`) of the cliff plan's bracket search in the deferred pass (Batch 5 step 3a,
// spec section A7; src/us/core/cliff-plan/planning.js, src/us/ui/results/render.js, src/shared/ui/results/render-scheduler.js).
// With the search on (on by default since V139; the explicit `__test_setBracketSearch(true)` is kept on purpose, so the test does not
// depend on the default), on the gap table's CA couple (tests/solver_gap.js) at life
// 100, conversions on: a full render runs the search at once; a spending `input` shows the user's-bracket plan (search pending, the
// rows are that plan's `apply` run); the field's `change` runs the search and redraws the rows with the kept plan; with no
// `change`, the idle pause (250 ms) does the same. Task 5: the summary's conversion clause (spec A5.7; none while the search is
// pending), the deferred pass after a full refresh in between (a hook re-planning before the flush: the rows still follow the
// kept plan), the flat-bracket card's own-bracket row (the 22% run, pinned, not the plan's bracket), the flat-bracket and per-year
// cards' wording against the cliff plan's bracket (independent review items 1-2), conversions off, 390 px; then (R5 review I-A) a
// plan that keeps another bracket and its sizing: the card's "(cliff plan)" row is the dashboard's run.
// bondYears 0: this test is about the bracket search, not the bond reserve; with the default 5 years the maintained reserve (Batch 5
// step 5b) leaves the CA couple's 22% as the best bracket at these spendings, so the reserve is off (as tests/unit/us/bracket-search.test.js).
// The spending values are ones where this household keeps another bracket than 22 (with bondYears 0: 24 at $70k-$120k; from $125k to $140k it keeps 22).
// Since the per-year conversion sizing ships on (V148) the whole-run pass runs on every searched plan and is not kept for this
// couple (spec B0.11.3), so each searched clause ends with "tax-aware sizing found nothing better", merged into the bracket clause.
//   node test_bracket_search.js
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

(async () => {
  const { GAP_CASES } = await import(pathToFileURL(path.resolve(__dirname, 'tests/unit/helpers/scan-grid.mjs')).href);
  const ca = GAP_CASES.find((c) => /\(CA\)/.test(c.name));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // A fixed date (the tax year), with the timers running: the idle pause must fire on its own.
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname, 'dist', 'Planner_US.html')).href);
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
  ok('the hooks exist', await page.evaluate(() => typeof window.__test_setBracketSearch === 'function' && typeof window.__test_cliffPlanState === 'function'));
  if (fail) {
    console.log(`${pass} passed, ${fail} failed`);
    await browser.close();
    process.exit(1);
  }

  await page.evaluate((patch) => {
    window.__test_setBracketSearch(true);
    const base = JSON.parse(JSON.stringify(window.__test_getState()));
    window.__test_replaceState({ ...base, ...patch, withdrawalMixEnabled: false, cliffGuardEnabled: true });
    window.__test_syncControls();
    document.getElementById('themeToggleBtn').click(); // a full render
  }, { ...ca.patch(100, 100), bondYears: 0 });

  // The rows on screen against the `apply` run of the store's plan (planForState's identity branch: the plan drawn).
  const look = () => {
    const st = window.__test_cliffPlanState();
    const plan = window.__test_planForState();
    const rows = JSON.stringify(window.fireProjectionRows);
    const applied = plan ? JSON.stringify(window.__test_runPlanMode({ planMode: 'apply', plan }).rows) : null;
    const summary = document.getElementById('cliffPlanSummary').textContent;
    return { ...st, plan, rows, matches: rows === applied, summary };
  };
  const full = await page.evaluate(`(${look})()`);
  ok('full render: searched, nothing pending', full.searched === true && full.searchPending === false, full);
  ok('full render: the bracket is from the setting (22)', full.bracketFrom === 22, full.bracketFrom);
  ok('full render: the rows are the kept plan', full.matches);
  ok('full render: the search ran at once (this household keeps another bracket at its own spending)', full.bracket !== 22, full.bracket);
  ok('full render: the summary names the kept bracket', full.summary.includes(`Conversions: the cliff plan uses the ${full.bracket}% bracket, not your 22%, within your conversion ages; tax-aware sizing found nothing better.`), full.summary);
  ok('full render: one "Conversions:" clause (R5 I-3)', full.summary.split('Conversions:').length === 2, full.summary);

  // A keystroke-like input (one synchronous evaluate, so the idle timer cannot fire in between): the user's-bracket plan. The plan
  // counts are read inside the same evaluate (before the keystroke and after the look), so the deferred full pass cannot land
  // between the keystroke and the second read on a slow runner (CI once saw [[2,0],[4,0]]).
  const typed = async (value) => page.evaluate(`(() => {
    const countsNow = () => [window.__test_cliffPlanComputes(), window.__test_planForStateComputes()];
    const countsBefore = countsNow();
    const el = document.getElementById('spending');
    el.focus();
    el.value = '${value}';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const seen = (${look})();
    return { ...seen, countsBefore, countsAfter: countsNow() };
  })()`);
  const pending = await typed(100000);
  const counts0 = pending.countsBefore,
    counts1 = pending.countsAfter;
  // Direct: the keystroke plans once, the light refresh (no search), and planForState plans nothing.
  ok('input: one light refresh, no other planning', counts1[0] === counts0[0] + 1 && counts1[1] === counts0[1], [counts0, counts1]);
  ok('input: search pending', pending.searchPending === true && pending.searched === false, pending);
  ok('input: the user\'s bracket', pending.bracket === pending.bracketFrom && pending.bracketFrom === 22, [pending.bracket, pending.bracketFrom]);
  ok('input: the rows are the user\'s-bracket plan', pending.matches);
  ok('input: no conversion clause while the search is pending', !pending.summary.includes('Conversions:'), pending.summary);

  const changed = await page.evaluate(`(() => {
    document.getElementById('spending').dispatchEvent(new Event('change', { bubbles: true }));
    return (${look})();
  })()`);
  ok('change: nothing pending, searched', changed.searchPending === false && changed.searched === true, changed);
  ok('change: the kept bracket is not 22', typeof changed.bracket === 'number' && changed.bracket !== 22, changed.bracket);
  ok('change: the rows moved', changed.rows !== pending.rows);
  ok('change: the rows are the kept plan', changed.matches);
  ok('change: the summary clause (24%)', changed.summary.includes('Conversions: the cliff plan uses the 24% bracket, not your 22%, within your conversion ages; tax-aware sizing found nothing better.'), changed.summary);

  // Another value, no change: the idle pause runs the search.
  const pending2 = await typed(90000);
  ok('input 2: search pending', pending2.searchPending === true && pending2.bracket === 22, pending2);
  ok('input 2: the rows are the user\'s-bracket plan', pending2.matches);
  await page.waitForFunction(() => window.__test_cliffPlanState().searchPending === false, null, { timeout: 10000 });
  const idle = await page.evaluate(`(${look})()`);
  ok('idle: searched', idle.searched === true, idle);
  ok('idle: the kept bracket is not 22', typeof idle.bracket === 'number' && idle.bracket !== 22, idle.bracket);
  ok('idle: the rows moved', idle.rows !== pending2.rows);
  ok('idle: the rows are the kept plan', idle.matches);
  ok('idle: the summary clause (24%)', idle.summary.includes('Conversions: the cliff plan uses the 24% bracket, not your 22%, within your conversion ages; tax-aware sizing found nothing better.'), idle.summary);

  // A full refresh between the light render and the deferred pass (a hook that re-plans: __test_simulate's ensureTestPlan):
  // the deferred pass compares the kept plan with the plan drawn, not the store's, so the rows still move to the kept plan.
  const between = await page.evaluate(`(() => {
    const el = document.getElementById('spending');
    el.value = '100000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const drawn = JSON.stringify(window.fireProjectionRows);
    window.__test_simulate();
    window.__test_flushRender();
    return { drawn, ...(${look})() };
  })()`);
  ok('refresh in between: searched and kept 24', between.searched === true && between.bracket === 24, between);
  ok('refresh in between: the rows moved after the flush', between.rows !== between.drawn);
  ok('refresh in between: the rows are the kept plan', between.matches);
  ok('refresh in between: the summary clause', between.summary.includes('Conversions: the cliff plan uses the 24% bracket, not your 22%'), between.summary);

  // A scenario comparison open (spec A6/A7, final review item 1): its "Current (live inputs)" row and overlay series project a
  // normalized copy of the state (planForState's JSON branch). A keystroke plans once (the light refresh, no search) and nothing
  // else plans: the current row shows the user's-bracket plan, as the dashboard does; the `change` runs the search once, and the
  // current row then follows the kept plan. The counters: __test_cliffPlanComputes (refreshCliffPlan) and
  // __test_planForStateComputes (planForState's own computeCliffPlan calls).
  await page.evaluate(() => document.getElementById('spending').dispatchEvent(new Event('change', { bubbles: true })));
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const compareLook = `(() => {
    const st = window.__test_cliffPlanState();
    const row = document.querySelector('#scenarioCompareRows tr');
    const cells = row ? Array.from(row.children).map((td) => td.textContent) : [];
    return {
      ...st, refreshes: window.__test_cliffPlanComputes(), stateComputes: window.__test_planForStateComputes(),
      currentName: cells[0], currentEnd: cells[5], dashEnd: window.fireProjection.endAssets,
    };
  })()`;
  await page.evaluate(() => {
    document.getElementById('scenarioName').value = 'Saved at 100k';
    document.getElementById('saveScenarioBtn').click();
    const box = document.querySelector('#scenarioList [data-compare]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const cmp0 = await page.evaluate(compareLook);
  ok('comparison: the card is open with the current row', await page.evaluate(() => !document.getElementById('scenarioCompareCard').hidden) && cmp0.currentName === 'Current (live inputs)', cmp0);
  const cmpTyped = await page.evaluate(`(() => {
    const el = document.getElementById('spending');
    el.value = '95000'; // not 90000: its end value ($10.36M) shows as "$10M" in the table, so fmt() would not match
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return ${compareLook};
  })()`);
  ok('comparison input: search pending, the user\'s bracket', cmpTyped.searchPending === true && cmpTyped.bracket === 22, cmpTyped);
  ok('comparison input: one light refresh', cmpTyped.refreshes === cmp0.refreshes + 1, [cmp0.refreshes, cmpTyped.refreshes]);
  ok('comparison input: planForState plans nothing (no search on the keystroke)', cmpTyped.stateComputes === cmp0.stateComputes, [cmp0.stateComputes, cmpTyped.stateComputes]);
  ok('comparison input: the current row shows the dashboard\'s plan', cmpTyped.currentEnd === fmt(cmpTyped.dashEnd), [cmpTyped.currentEnd, fmt(cmpTyped.dashEnd)]);
  const cmpChanged = await page.evaluate(`(() => {
    document.getElementById('spending').dispatchEvent(new Event('change', { bubbles: true }));
    return ${compareLook};
  })()`);
  ok('comparison change: searched, kept 24', cmpChanged.searched === true && cmpChanged.searchPending === false && cmpChanged.bracket === 24, cmpChanged);
  ok('comparison change: one searched refresh', cmpChanged.refreshes === cmpTyped.refreshes + 1, [cmpTyped.refreshes, cmpChanged.refreshes]);
  ok('comparison change: planForState plans nothing', cmpChanged.stateComputes === cmpTyped.stateComputes, [cmpTyped.stateComputes, cmpChanged.stateComputes]);
  ok('comparison change: the current row follows the kept plan', cmpChanged.currentEnd === fmt(cmpChanged.dashEnd) && cmpChanged.currentEnd !== cmpTyped.currentEnd, [cmpTyped.currentEnd, cmpChanged.currentEnd, fmt(cmpChanged.dashEnd)]);
  // The idle pause instead of `change`: the deferred pass redraws the current row too.
  const cmpTyped2 = await page.evaluate(`(() => {
    const el = document.getElementById('spending');
    el.value = '100000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return ${compareLook};
  })()`);
  ok('comparison input 2: planForState plans nothing', cmpTyped2.stateComputes === cmpChanged.stateComputes && cmpTyped2.bracket === 22, cmpTyped2);
  await page.waitForFunction(() => window.__test_cliffPlanState().searchPending === false, null, { timeout: 10000 });
  const cmpIdle = await page.evaluate(compareLook);
  ok('comparison idle: kept 24, planForState planned nothing', cmpIdle.bracket === 24 && cmpIdle.stateComputes === cmpTyped2.stateComputes, cmpIdle);
  ok('comparison idle: the current row follows the kept plan', cmpIdle.currentEnd === fmt(cmpIdle.dashEnd) && cmpIdle.currentEnd !== cmpTyped2.currentEnd, [cmpTyped2.currentEnd, cmpIdle.currentEnd]);
  await page.evaluate(() => {
    const box = document.querySelector('#scenarioList [data-compare]');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // The flat-bracket card (spec A4): its 22% row is the 22% run with the kept plan's intents, not the plan's 24% bracket.
  await page.evaluate(() => document.getElementById('spending').dispatchEvent(new Event('change', { bubbles: true })));
  await page.click('#rothOptimizerCard > summary');
  await page.locator('#rothOptimizerRows tr').first().waitFor();
  const card = await page.evaluate(() => {
    const plan = window.__test_planForState();
    const r = window.__test_rothOptimizerCard();
    const row = (b) => r.results.find((x) => x.bracket === b);
    const own = window.__test_runPlanMode({ planMode: 'apply', plan: { intents: plan.intents, family: plan.family }, endValue: true }).value;
    const kept = window.__test_runPlanMode({ planMode: 'apply', plan, endValue: true }).value;
    return {
      bracket: plan.bracket, rowsShown: document.querySelectorAll('#rothOptimizerRows tr').length, own, kept,
      score22: row(22).score, score24: row(24).score,
    };
  });
  ok('card: six rows shown', card.rowsShown === 6, card);
  ok('card: the plan keeps 24', card.bracket === 24, card);
  ok('card: the 22% row is the 22% run with the kept intents', card.score22 === card.own, card);
  ok('card: the 24% row is the kept plan', card.score24 === card.kept, card);
  ok('card: the two differ (the pin matters)', card.own !== card.kept, card);
  // The card's wording (independent review items 1-2): its baseline is the cliff plan's 24% (the dashboard's run), not the
  // 22% setting; the 24% row is marked "(cliff plan)", the 22% row "(your setting)"; the per-year card names the plan's 24%.
  const cardWords = async () => page.evaluate(() => ({
    summary: document.getElementById('rothOptimizerSummary').textContent,
    labels: [...document.querySelectorAll('#rothOptimizerRows tr td:first-child')].map((td) => td.textContent),
    best: window.__test_rothOptimizerCard().best.bracket,
  }));
  // The per-year card on a small budget (the wording only): blanked first, so the text read is this run's.
  const perYearWords = async () => {
    await page.evaluate(() => {
      window.__test_setOptimizerBudget(40);
      document.getElementById('rothPerYearResult').hidden = true;
      document.getElementById('rothPerYearSummary').innerHTML = '';
      document.getElementById('rothPerYearOptimizeBtn').click();
    });
    await page.locator('#rothPerYearResult').waitFor({ state: 'visible', timeout: 60000 });
    return page.evaluate(() => document.getElementById('rothPerYearSummary').textContent);
  };
  const words = await cardWords();
  const label = (b) => words.labels.find((t) => t.startsWith(b + '%')) || '';
  ok('card words: the 24% row is the cliff plan', /^24% \(cliff plan\)/.test(label(24)), words.labels);
  ok('card words: the 22% row is your setting', /^22% \(your setting\)/.test(label(22)), words.labels);
  ok('card words: no "(current)" mark', !words.labels.some((t) => t.includes('(current)')), words.labels);
  ok('card words: not worded against the 22% setting', !words.summary.includes('your current 22%'), words.summary);
  ok('card words: worded against the cliff plan', words.best === 24
    ? words.summary.startsWith('The cliff plan already uses the 24% bracket (not your 22% setting)')
    : words.summary.includes(`fill to the ${words.best}% bracket instead of the cliff plan's 24%`), words);
  const perYear = await perYearWords();
  ok("per-year words: names the cliff plan's flat 24%", perYear.includes("the cliff plan's flat 24%") && !perYear.includes('flat 22%'), perYear);
  await page.click('#rothOptimizerCard > summary');
  // The decision question's ladder row names the plan's bracket (it runs with the plan).
  const ladder = await page.evaluate(() => {
    document.querySelector('#decisionQuestions button[data-question="rothLadder"]').click();
    return document.getElementById('decisionAnswer').textContent;
  });
  ok('decision question: the ladder label names the plan bracket', ladder.includes("to the cliff plan's 24% bracket, not your 22%"), ladder);

  // A spending at which the household keeps its own bracket.
  await typed(130000);
  const own = await page.evaluate(`(() => {
    document.getElementById('spending').dispatchEvent(new Event('change', { bubbles: true }));
    return (${look})();
  })()`);
  ok('own bracket kept: 22', own.bracket === 22 && own.searched === true, own);
  ok('own bracket kept: the summary clause', own.summary.includes('Conversions: your 22% bracket (no other flat bracket does better; tax-aware sizing found nothing better).'), own.summary);
  ok('own bracket kept: one "Conversions:" clause (R5 I-3)', own.summary.split('Conversions:').length === 2, own.summary);
  // The cards when the plan keeps the setting: worded against "your current 22%" as before (the rows blanked first, so the
  // ones read are this opening's).
  await page.evaluate(() => { document.getElementById('rothOptimizerRows').innerHTML = ''; });
  await page.click('#rothOptimizerCard > summary');
  await page.locator('#rothOptimizerRows tr').first().waitFor();
  const ownWords = await cardWords();
  ok('own bracket card: the 22% row is "(current)"', ownWords.labels.some((t) => /^22% \(current\)/.test(t)) && !ownWords.labels.some((t) => /cliff plan|your setting/.test(t)), ownWords.labels);
  ok('own bracket card: worded against your current 22%', !ownWords.summary.includes('cliff plan') && (ownWords.best === 22
    ? ownWords.summary.startsWith('Your current 22% bracket target already')
    : ownWords.summary.includes(`instead of your current 22%`)), ownWords);
  const ownPerYear = await perYearWords();
  ok('own bracket per-year: names your flat 22%', ownPerYear.includes('flat 22%') && !ownPerYear.includes('cliff plan'), ownPerYear);
  await page.click('#rothOptimizerCard > summary');

  // Back to a value that keeps 24, then conversions off: no clause, and the rows change.
  await typed(100000);
  const before = await page.evaluate(`(() => {
    document.getElementById('spending').dispatchEvent(new Event('change', { bubbles: true }));
    return (${look})();
  })()`);
  const convOff = await page.evaluate(`(() => {
    const box = document.getElementById('rothConvEnabled');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return (${look})();
  })()`);
  ok('conversions off: the state is off', await page.evaluate(() => window.__test_getState().rothConvEnabled === false));
  ok('conversions off: no conversion clause', before.summary.includes('Conversions:') && !convOff.summary.includes('Conversions:'), [before.summary, convOff.summary]);
  ok('conversions off: the rows changed', convOff.rows !== before.rows);
  ok('conversions off: the rows are the plan', convOff.matches);

  // Phone width: no horizontal scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  ok('390x844: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    const box = document.getElementById('rothConvEnabled');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // The search off again: the next refresh re-plans with the user's bracket.
  const off = await page.evaluate(`(() => {
    window.__test_setBracketSearch(false);
    document.getElementById('themeToggleBtn').click();
    return (${look})();
  })()`);
  ok('search off: the user\'s bracket after a full render', off.bracket === 22 && off.searched === true && off.searchPending === false, off);
  ok('search off: the rows are that plan', off.matches);

  // R5 review I-A: a plan that keeps another bracket than the setting and keeps its sizing (the gap table's TX single at life
  // 100, spending $60k, the 5-year bond reserve: the plan keeps 10%, not 22, sized by year). The card's "(cliff plan)" row is the
  // dashboard's run (unpinned, so the plan's sizing applies), not that bracket's flat run.
  const tx = GAP_CASES.find((c) => /\(TX\)/.test(c.name));
  const sized = await page.evaluate((patch) => {
    window.__test_setBracketSearch(true);
    const base = JSON.parse(JSON.stringify(window.__test_getState()));
    window.__test_replaceState({ ...base, ...patch, withdrawalMixEnabled: false, cliffGuardEnabled: true });
    window.__test_syncControls();
    document.getElementById('themeToggleBtn').click();
    window.__test_flushRender();
    const plan = window.__test_planForState();
    const r = window.__test_rothOptimizerCard();
    const row = r.results.find((x) => x.bracket === plan.bracket);
    return {
      bracket: plan.bracket, from: plan.bracketFrom, sizedAges: plan.conv ? Object.keys(plan.conv).length : 0,
      rowEnd: row.endAssets, dashEnd: window.fireProjection.endAssets,
      rowScore: row.score, kept: window.__test_runPlanMode({ planMode: 'apply', plan, endValue: true }).value,
      current: r.currentBracket,
    };
  }, { ...tx.patch(100, 100), spending: 60000, bondYears: 5 });
  ok('sized plan: keeps another bracket than the setting, with sized years', sized.bracket !== sized.from && sized.sizedAges > 0, sized);
  ok("sized plan: the card's baseline is the plan's bracket", sized.current === sized.bracket, sized);
  ok("sized plan: the cliff-plan row's end assets are the dashboard's", sized.rowEnd === sized.dashEnd, sized);
  ok("sized plan: the cliff-plan row's end value is the kept plan's run", sized.rowScore === sized.kept, sized);

  ok('no page errors', errors.length === 0, errors);
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
