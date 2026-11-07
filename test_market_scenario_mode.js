// UI check (CI: `npm run test:ui`, not `npm test`) of market scenario mode (src/shared/ui/plans/market-scenario-mode.js, the banner,
// the plan card line), both planners: Run changes the rows and shows the banner with its description; the Save scenario button is
// locked; the autosave keeps the real settings and the undo toast stays hidden; a reload brings the real plan back with no banner;
// Revert restores the rows exactly; Reset then Undo ends on the real state with no scenario; the notes on the historical and Monte
// Carlo cards; the CSV's first line; and (US) the plan card's status line for a plan made for the normal market, with Revert
// restoring the stored plan; 390 px.
//   node test_market_scenario_mode.js
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

// tests/unit/us/plan-search.test.js's SINGLE52 (the search wins on lifetimeCost with sizing off).
const SINGLE52 = {
  singlePerson: true, children: [], ageA: 52, ageB: 52, retireAgeA: 52, retireAgeB: 52, lifeExpectancyA: 95, lifeExpectancyB: 95,
  acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: 300000, spending: 60000, smoothWithdrawals: false,
  withdrawalMixEnabled: false, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 72, rothConvBracket: 22,
  ruleOf55A: false, ruleOf55B: false, sepp72tK401A: false, cliffGuardEnabled: true, tradIraA: 0, tradIraB: 0,
  trad401kA: 1500000, trad401kB: 0, rothIraA: 200000, rothIraB: 0, roth401kA: 0, roth401kB: 0, rothIraBasisA: 0, rothIraBasisB: 0,
};
const CANADA_SEED = { singlePerson: true, ageA: 50, retireAgeA: 55, lifeExpectancyA: 90 };
const PLANNERS = [
  { name: 'US', file: 'Planner_US.html', key: 'fireCouplePlanner.massachusettsOffline.v1', seed: SINGLE52 },
  { name: 'Canada', file: 'Planner_Canada.html', key: 'fireCouplePlanner.canadaOffline.v1', seed: CANADA_SEED },
];
const R8 = [
  "Applied plan (made for the normal market) in use: it beats the scenario's own plan.",
  "The scenario's own plan is in use; your applied plan was made for the normal market.",
];

async function open(browser, P, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(pathToFileURL(path.resolve(__dirname, 'dist', P.file)).href);
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [P.key, JSON.stringify({ state: P.seed, mode: 'real' })]);
  await reload(page);
  return { context, page };
}
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
}
const flush = (page) => page.evaluate(() => window.__test_flushRender());
const rows = async (page) => { await flush(page); return page.evaluate(() => JSON.stringify(window.fireProjectionRows)); };
// Writes the autosave now (the debounce timer is skipped): pagehide flushes it.
const saved = async (page, key) => {
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  return page.evaluate((k) => localStorage.getItem(k), key);
};
const getState = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState())));
const snapshot = (page) => page.evaluate(() => window.__test_marketScenarioSnapshot());
const run = (page, ms) => page.evaluate((ms) => window.__test_runMarketScenario(ms), ms);
const crash = (ageA) => ({ kind: 'crash', crashes: [{ age: ageA + 3, drop: 40, fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 9, bondReturn: 2 }] });
const setField = (page, id, v) => page.evaluate(({ id, v }) => {
  const el = document.getElementById(id);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, { id, v });
const hidden = (page, sel) => page.evaluate((s) => document.querySelector(s).hidden, sel);

async function planner(browser, P) {
  const n = P.name + ': ';
  const { context, page } = await open(browser, P);
  const ageA = P.seed.ageA;
  const stateBefore = await getState(page);
  const rowsBefore = await rows(page);
  const savedBefore = await saved(page, P.key);
  ok(n + 'the seeded plan is the live state, no scenario, no banner', stateBefore.ageA === ageA && !('marketScenario' in stateBefore) && (await hidden(page, '#marketScenarioBanner')) && (await snapshot(page)) === null);
  ok(n + 'the autosave holds the seeded plan', savedBefore !== null && JSON.parse(savedBefore).state.ageA === ageA);

  // Run: the rows differ, the banner and the lock show.
  ok(n + 'Run returns true', (await run(page, crash(ageA))) === true);
  const rowsOn = await rows(page);
  ok(n + 'while on: the rows differ', rowsOn !== rowsBefore);
  const bannerText = await page.textContent('#marketScenarioBannerText');
  ok(n + 'while on: the banner shows the description', !(await hidden(page, '#marketScenarioBanner')) && /^Market scenario on: 40% drop at age \d+ \(\d{4}\) over 2 years, 50% recovered over 3 years, inflation 9% and bonds \+2% a year during the fall; bonds first in down years/.test(bannerText), bannerText);
  ok(n + 'while on: the snapshot holds the real settings', isDeepStrictEqual(await snapshot(page), stateBefore));
  ok(n + 'while on: Save current is disabled', await page.evaluate(() => document.getElementById('saveScenarioBtn').disabled));
  await setField(page, 'spending', 61000);
  await flush(page);
  const savedOn = await saved(page, P.key);
  ok(n + 'while on: the autosave is unchanged by a field edit', savedOn === savedBefore, savedOn && savedOn.slice(0, 200));
  ok(n + 'while on: the save status says nothing is saved', (await page.textContent('#saveStatus')) === 'Market scenario on: changes here are not saved');
  ok(n + 'while on: the undo toast is hidden', await hidden(page, '#undoToast'));
  // The notes on the historical and Monte Carlo cards.
  await page.click('#chartGroupHistBtn');
  await flush(page);
  ok(n + 'while on: the historical card notes that it ignores the scenario', await page.evaluate(() => {
    const note = document.querySelector('#histSuccessCard .ms-note');
    return !document.getElementById('histSuccessCard').hidden && !note.hidden && note.textContent === 'Ignores the market scenario: these runs bring their own markets.';
  }));
  await page.click('#chartGroupMcBtn');
  await flush(page);
  ok(n + 'while on: the Monte Carlo card notes it too', await page.evaluate(() => !document.getElementById('mcSuccessCard').hidden && !document.querySelector('#mcSuccessCard .ms-note').hidden));
  await page.click('#chartGroupProjectionBtn');
  // The CSV's first line.
  const csv = await page.evaluate(() => {
    const orig = URL.createObjectURL;
    let blob = null;
    URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
    HTMLAnchorElement.prototype.click = function () {};
    document.getElementById('exportCsvBtn').click();
    URL.createObjectURL = orig;
    return blob.text();
  });
  ok(n + 'while on: the CSV starts with the scenario line', csv.split('\n')[0].startsWith('"Market scenario on: 40% drop at age '), csv.split('\n')[0]);

  // A reload: the real plan, no banner.
  await reload(page);
  ok(n + 'reload: no scenario and no banner', (await snapshot(page)) === null && (await hidden(page, '#marketScenarioBanner')) && !('marketScenario' in (await getState(page))));
  ok(n + 'reload: the rows equal the pre-Run rows', (await rows(page)) === rowsBefore);

  // Revert.
  await run(page, crash(ageA));
  await page.click('#marketScenarioRevertBtn');
  ok(n + 'Revert: the rows equal the pre-Run rows exactly', (await rows(page)) === rowsBefore);
  ok(n + 'Revert: the banner is hidden and the snapshot is null', (await hidden(page, '#marketScenarioBanner')) && (await snapshot(page)) === null);
  ok(n + 'Revert: Save current is enabled again', await page.evaluate(() => !document.getElementById('saveScenarioBtn').disabled));

  // Reset then Undo.
  await run(page, crash(ageA));
  await page.click('#resetBtn');
  await flush(page);
  ok(n + 'Reset: the scenario is off', (await snapshot(page)) === null && (await hidden(page, '#marketScenarioBanner')) && !('marketScenario' in (await getState(page))));
  await page.click('#undoToastBtn');
  await flush(page);
  const afterUndo = await getState(page);
  ok(n + 'Undo after Reset: the pre-Run state, no scenario', isDeepStrictEqual(afterUndo, stateBefore), afterUndo.ageA);
  ok(n + 'Undo after Reset: no snapshot, no banner', (await snapshot(page)) === null && (await hidden(page, '#marketScenarioBanner')));

  // 390 px with the banner shown.
  await page.setViewportSize({ width: 390, height: 844 });
  await run(page, crash(ageA));
  await flush(page);
  ok(n + '390 px: the banner shows and the page does not scroll sideways', !(await hidden(page, '#marketScenarioBanner')) && (await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)));
  ok(n + 'no page errors', page.errors.length === 0, page.errors);
  await context.close();
}

// US: the plan card line for a plan made before the scenario, and Revert restoring the stored plan.
async function usStoredPlan(browser, P) {
  const n = 'US plan card: ';
  const { context, page } = await open(browser, P);
  await page.evaluate(() => {
    window.__test_setConversionSizing(false);
    document.getElementById('themeToggleBtn').click();
    document.getElementById('themeToggleBtn').click();
  });
  const found = await page.evaluate(() => window.__test_optimizePlan('lifetimeCost'));
  ok(n + 'the search finds a plan', !!found.plan);
  ok(n + 'apply before Run', await page.evaluate(() => window.__test_applyStoredPlan()));
  const storedBefore = (await getState(page)).storedPlan;
  await run(page, crash(P.seed.ageA));
  await flush(page);
  const status = await page.textContent('#planOptimizerStatusText');
  ok(n + 'while on: the status is a "made for the normal market" line', R8.includes(status), status);
  const found2 = await page.evaluate(() => window.__test_optimizePlan('lifetimeCost'));
  ok(n + 'while on: the search under the scenario finds a plan', !!found2.plan);
  ok(n + 'while on: apply stores a new plan', await page.evaluate(() => window.__test_applyStoredPlan()));
  ok(n + 'while on: the stored plan changed', !isDeepStrictEqual((await getState(page)).storedPlan, storedBefore));
  await page.click('#marketScenarioRevertBtn');
  await flush(page);
  ok(n + 'Revert: the stored plan is the pre-Run plan', isDeepStrictEqual((await getState(page)).storedPlan, storedBefore));
  ok(n + 'no page errors', page.errors.length === 0, page.errors);
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const P of PLANNERS) await planner(browser, P);
  await usStoredPlan(browser, PLANNERS[0]);
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log('FAIL: ' + e.stack);
  process.exit(1);
});
