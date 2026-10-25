// UI check (CI: `npm run test:ui`, not `npm test`) of the cliff plan's bracket search in the deferred pass (Batch 5 step 3a,
// spec section A7; src/us/core/cliff-plan/planning.js, src/us/ui/results/render.js, src/shared/ui/results/render-scheduler.js).
// With the search on (`__test_setBracketSearch(true)`; it ships off), on the gap table's CA couple (tests/solver_gap.js) at life
// 100, conversions on: a full render runs the search at once; a spending `input` shows the user's-bracket plan (search pending, the
// rows are that plan's `apply` run); the field's `change` runs the search and redraws the rows with the kept plan; with no
// `change`, the idle pause (250 ms) does the same.
// The spending values are ones where this household keeps another bracket than 22 (24 at $90k-$110k; from $115k it keeps 22).
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
  }, ca.patch(100, 100));

  // The rows on screen against the `apply` run of the store's plan (planForState's identity branch: the plan drawn).
  const look = () => {
    const st = window.__test_cliffPlanState();
    const plan = window.__test_planForState();
    const rows = JSON.stringify(window.fireProjectionRows);
    const applied = plan ? JSON.stringify(window.__test_runPlanMode({ planMode: 'apply', plan }).rows) : null;
    return { ...st, plan, rows, matches: rows === applied };
  };
  const full = await page.evaluate(`(${look})()`);
  ok('full render: searched, nothing pending', full.searched === true && full.searchPending === false, full);
  ok('full render: the bracket is from the setting (22)', full.bracketFrom === 22, full.bracketFrom);
  ok('full render: the rows are the kept plan', full.matches);
  ok('full render: the search ran at once (this household keeps another bracket at its own spending)', full.bracket !== 22, full.bracket);

  // A keystroke-like input (one synchronous evaluate, so the idle timer cannot fire in between): the user's-bracket plan.
  const typed = async (value) => page.evaluate(`(() => {
    const el = document.getElementById('spending');
    el.focus();
    el.value = '${value}';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return (${look})();
  })()`);
  const pending = await typed(100000);
  ok('input: search pending', pending.searchPending === true && pending.searched === false, pending);
  ok('input: the user\'s bracket', pending.bracket === pending.bracketFrom && pending.bracketFrom === 22, [pending.bracket, pending.bracketFrom]);
  ok('input: the rows are the user\'s-bracket plan', pending.matches);

  const changed = await page.evaluate(`(() => {
    document.getElementById('spending').dispatchEvent(new Event('change', { bubbles: true }));
    return (${look})();
  })()`);
  ok('change: nothing pending, searched', changed.searchPending === false && changed.searched === true, changed);
  ok('change: the kept bracket is not 22', typeof changed.bracket === 'number' && changed.bracket !== 22, changed.bracket);
  ok('change: the rows moved', changed.rows !== pending.rows);
  ok('change: the rows are the kept plan', changed.matches);

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

  // The search off again: the next refresh re-plans with the user's bracket.
  const off = await page.evaluate(`(() => {
    window.__test_setBracketSearch(false);
    document.getElementById('themeToggleBtn').click();
    return (${look})();
  })()`);
  ok('search off: the user\'s bracket after a full render', off.bracket === 22 && off.searched === true && off.searchPending === false, off);
  ok('search off: the rows are that plan', off.matches);

  ok('no page errors', errors.length === 0, errors);
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
