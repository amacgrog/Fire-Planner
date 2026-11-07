// UI check (CI: `npm run test:ui`, not `npm test`) of the market scenario card (src/shared/ui/plans/market-scenario-card.js), both
// planners: the defaults and garbage storage, the presets with and without the stock shape, edits that leave the projection and the
// saved plan alone, recovery at 0%, reload, a plan change after the card was set, Run and the disabled state, reload / Revert / Reset
// while on, real history, the banner copy, and 390 / 768 px.
//   node test_market_scenario.js
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

// tests/unit/us/plan-search.test.js's SINGLE52, with the plan's return at 7 (the preset shapes depend on it).
const SINGLE52 = {
  singlePerson: true, children: [], ageA: 52, ageB: 52, retireAgeA: 52, retireAgeB: 52, lifeExpectancyA: 95, lifeExpectancyB: 95,
  acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: 300000, spending: 60000, smoothWithdrawals: false,
  withdrawalMixEnabled: false, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 72, rothConvBracket: 22,
  ruleOf55A: false, ruleOf55B: false, sepp72tK401A: false, cliffGuardEnabled: true, tradIraA: 0, tradIraB: 0,
  trad401kA: 1500000, trad401kB: 0, rothIraA: 200000, rothIraB: 0, roth401kA: 0, roth401kB: 0, rothIraBasisA: 0, rothIraBasisB: 0,
  returnRate: 7,
};
const CANADA_SEED = { singlePerson: true, ageA: 50, retireAgeA: 55, lifeExpectancyA: 90, returnRate: 7 };
const PLANNERS = [
  { name: 'US', file: 'Planner_US.html', key: 'fireCouplePlanner.massachusettsOffline.v1', seed: SINGLE52 },
  { name: 'Canada', file: 'Planner_Canada.html', key: 'fireCouplePlanner.canadaOffline.v1', seed: CANADA_SEED },
];
const CARD_SUFFIX = '.marketScenarioCard';

async function open(browser, P, other, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(pathToFileURL(path.resolve(__dirname, 'dist', P.file)).href);
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
  await page.evaluate(([k, v, ck, ok2]) => {
    localStorage.setItem(k, v);
    localStorage.setItem(ck, 'not json');
    localStorage.setItem(ok2, 'other planner sentinel');
  }, [P.key, JSON.stringify({ state: P.seed, mode: 'real' }), P.key + CARD_SUFFIX, other.key + CARD_SUFFIX]);
  await reload(page);
  return { context, page };
}
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
}
const openCard = async (page) => {
  await page.click('#marketScenarioCard > summary');
  await flush(page);
};
const flush = (page) => page.evaluate(() => window.__test_flushRender());
const rows = async (page) => { await flush(page); return page.evaluate(() => JSON.stringify(window.fireProjectionRows)); };
// Writes the autosave now (the debounce timer is skipped): pagehide flushes it.
const saved = async (page, key) => {
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  return page.evaluate((k) => localStorage.getItem(k), key);
};
const getState = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState())));
const snapshot = (page) => page.evaluate(() => window.__test_marketScenarioSnapshot());
const setField = (page, id, v) => page.evaluate(({ id, v }) => {
  const el = document.getElementById(id);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, { id, v });
const val = (page, id) => page.evaluate((i) => document.getElementById(i).value, id);
const hidden = (page, sel) => page.evaluate((s) => document.querySelector(s).hidden, sel);
const disabled = (page, id) => page.evaluate((i) => document.getElementById(i).disabled, id);
const isActive = (page, id) => page.evaluate((i) => document.getElementById(i).classList.contains('active'), id);
const text = (page, id) => page.evaluate((i) => document.getElementById(i).textContent, id);
const cardKey = (page, key) => page.evaluate((k) => localStorage.getItem(k), key + CARD_SUFFIX);
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
// Every card control that must be disabled while a scenario runs.
const LOCKED = ['msCrashAge', 'msDrop', 'msFallYears', 'msRecover', 'msRecoverYears', 'msInflation', 'msBondReturn', 'msHistStart', 'msHistAge', 'msHistEnd',
  'msPresetShape', 'msKindCrash', 'msKindHistory', 'msOrderBucket', 'msOrderStandard', 'msPreset1929', 'msPreset1973', 'msPreset2000', 'msPreset2008', 'msPreset2022', 'msPresetCustom'];
const allDisabled = (page) => page.evaluate((ids) => ids.every((i) => document.getElementById(i).disabled), LOCKED);
const noneDisabled = (page) => page.evaluate((ids) => ids.every((i) => !document.getElementById(i).disabled || i === 'msRecoverYears'), LOCKED);
// The card is in its Run state: no scenario, no banner, the button says Run, the fields are enabled.
const runState = async (page) =>
  (await snapshot(page)) === null && (await hidden(page, '#marketScenarioBanner')) && (await text(page, 'msRunBtn')) === 'Run this scenario' &&
  (await hidden(page, '#marketScenarioOnTag')) && (await noneDisabled(page)) && (await disabled(page, 'msRunBtn')) === false;

async function planner(browser, P, other) {
  const n = P.name + ': ';
  const { context, page } = await open(browser, P, other);
  const ageA = P.seed.ageA, L = P.seed.lifeExpectancyA;
  ok(n + 'the page loads with garbage card storage and no page error', page.errors.length === 0, page.errors);
  await openCard(page);
  ok(n + 'defaults: drop 35, recovery 60, Like 2008 active, shape off',
    (await val(page, 'msDrop')) === '35' && (await val(page, 'msRecover')) === '60' && (await isActive(page, 'msPreset2008')) &&
    !(await page.isChecked('#msPresetShape')),
    [await val(page, 'msDrop'), await val(page, 'msRecover')]);
  ok(n + 'garbage storage was not rewritten by loading', (await cardKey(page, P.key)) === 'not json');

  // Presets with the stock shape (returnRate 7).
  await page.check('#msPresetShape');
  await page.click('#msPreset1929');
  ok(n + 'shape on, Like 1929-32: drop 73, falls 4 years, 17% back over 12 years',
    (await val(page, 'msDrop')) === '73' && (await val(page, 'msFallYears')) === '4' && (await val(page, 'msRecover')) === '17' && (await val(page, 'msRecoverYears')) === '12',
    [await val(page, 'msDrop'), await val(page, 'msFallYears'), await val(page, 'msRecover'), await val(page, 'msRecoverYears')]);
  ok(n + 'Like 1929-32 sets inflation -6.4', (await val(page, 'msInflation')) === '-6.4', await val(page, 'msInflation'));
  ok(n + 'the chip is active', await isActive(page, 'msPreset1929'));
  await page.uncheck('#msPresetShape');
  ok(n + 'unticking the shape changes no number',
    (await val(page, 'msDrop')) === '73' && (await val(page, 'msFallYears')) === '4' && (await val(page, 'msRecover')) === '17' && (await val(page, 'msRecoverYears')) === '12' && (await val(page, 'msInflation')) === '-6.4');
  ok(n + 'unticking keeps the chip', await isActive(page, 'msPreset1929'));
  await page.check('#msPresetShape');
  ok(n + 'ticking with a chip active applies its shape (same numbers)', (await val(page, 'msDrop')) === '73' && (await isActive(page, 'msPreset1929')));
  await setField(page, 'msDrop', 50);
  ok(n + 'editing the drop with the shape on switches the chip to Custom', await isActive(page, 'msPresetCustom') && !(await isActive(page, 'msPreset1929')));
  await page.click('#msPreset2008');
  await setField(page, 'msInflation', 3);
  ok(n + 'typing an inflation switches the chip to Custom', await isActive(page, 'msPresetCustom'));
  await page.uncheck('#msPresetShape');
  await page.click('#msPreset2008');
  ok(n + 'shape off, Like 2008: the chip sets only inflation and bonds',
    (await val(page, 'msInflation')) === '0.1' && (await val(page, 'msBondReturn')) === '20.1');

  // Edits leave the projection, the cliff plan and the saved plan alone.
  const rowsBefore = await rows(page);
  const savedBefore = await saved(page, P.key);
  const otherBefore = await page.evaluate((k) => localStorage.getItem(k), other.key + CARD_SUFFIX);
  await page.evaluate(() => { window.fireProjection.__mark = 1; });
  await setField(page, 'msDrop', 40);
  await setField(page, 'msRecover', 30);
  await page.click('#msPreset2000');
  await page.check('#msPresetShape');
  await page.click('#msPreset1973');
  await page.click('#msKindHistory');
  await page.click('#msOrderStandard');
  await page.click('#msKindCrash');
  await flush(page);
  ok(n + 'edits: no render ran (the sentinel survives)', await page.evaluate(() => window.fireProjection.__mark === 1));
  ok(n + 'edits: the rows are unchanged', (await rows(page)) === rowsBefore);
  ok(n + 'edits: the saved plan is unchanged', (await saved(page, P.key)) === savedBefore);
  const card = JSON.parse(await cardKey(page, P.key));
  ok(n + 'edits: the card key holds the new settings', card.kind === 'crash' && card.order === 'standard' && card.crash.preset === '1973' && card.crash.presetShape === true, card);
  ok(n + 'edits: the other planner\'s card key is untouched', (await page.evaluate((k) => localStorage.getItem(k), other.key + CARD_SUFFIX)) === otherBefore && otherBefore === 'other planner sentinel');
  ok(n + 'edits: the plan key does not hold card settings', !(savedBefore || '').includes('presetShape'));

  // Recovery at 0%.
  await page.uncheck('#msPresetShape');
  await setField(page, 'msRecover', 0);
  ok(n + 'recovery 0: "Comes back over" is disabled', await disabled(page, 'msRecoverYears'));
  ok(n + 'recovery 0: the description says no recovery', (await text(page, 'msDescription')).includes('no recovery'), await text(page, 'msDescription'));
  ok(n + 'recovery 0: the slider reads the permanent loss', (await text(page, 'msRecoverOut')) === '0% of the loss comes back');
  await setField(page, 'msRecover', 25);
  ok(n + 'recovery 25: "Comes back over" is enabled again', !(await disabled(page, 'msRecoverYears')));

  // Reload: the card shows the saved settings.
  await setField(page, 'msDrop', 40);
  await reload(page);
  await openCard(page);
  ok(n + 'reload: the card shows the saved settings',
    (await val(page, 'msDrop')) === '40' && (await val(page, 'msRecover')) === '25' && (await isActive(page, 'msKindHistory')) === false && (await isActive(page, 'msOrderStandard')),
    [await val(page, 'msDrop'), await val(page, 'msRecover')]);
  await page.click('#msOrderBucket');

  // A plan change after the card was set: the crash age follows the plan.
  await setField(page, 'msCrashAge', L);
  ok(n + 'the crash age can be the plan\'s last age', (await val(page, 'msCrashAge')) === String(L), await val(page, 'msCrashAge'));
  await setField(page, 'lifeExpectancyA', L - 5);
  await flush(page);
  ok(n + 'a shorter life expectancy pulls the crash age in', (await val(page, 'msCrashAge')) === String(L - 5), await val(page, 'msCrashAge'));
  await setField(page, 'lifeExpectancyA', L);
  await flush(page);
  await setField(page, 'msCrashAge', ageA + 3);
  await setField(page, 'msDrop', 40);
  const rowsPlan = await rows(page);
  const savedPlan = await saved(page, P.key);
  const statePlan = await getState(page);

  // Run.
  await page.click('#msRunBtn');
  await flush(page);
  const rowsOn = await rows(page);
  ok(n + 'Run: the rows differ', rowsOn !== rowsPlan);
  const banner = await text(page, 'marketScenarioBannerText');
  ok(n + 'Run: the banner is visible with the new copy', !(await hidden(page, '#marketScenarioBanner')) && /^Scenario on: .+\. Every number, chart and optimizer below assumes it\.$/.test(banner), banner);
  ok(n + 'Run: the banner button reads Revert to my plan', (await text(page, 'marketScenarioRevertBtn')) === 'Revert to my plan');
  ok(n + 'Run: the card controls are disabled', await allDisabled(page));
  ok(n + 'Run: the button reads Revert and is enabled', (await text(page, 'msRunBtn')) === 'Revert' && !(await disabled(page, 'msRunBtn')));
  ok(n + 'Run: the summary tag shows and the running note replaces the preview', !(await hidden(page, '#marketScenarioOnTag')) && !(await hidden(page, '#msRunningNote')) &&
    (await text(page, 'msRunningNote')) === 'This scenario is running. Revert to change it.');
  const savedOn = await saved(page, P.key);
  ok(n + 'Run: the autosave holds the real settings (no marketScenario, equal to before)', savedOn === savedPlan && !savedOn.includes('marketScenario'));

  // Reload while on: no scenario, the card in its Run state with the settings that were run.
  await reload(page);
  await openCard(page);
  ok(n + 'reload while on: the Run state', await runState(page));
  ok(n + 'reload while on: the fields show the settings that were run', (await val(page, 'msDrop')) === '40' && (await val(page, 'msCrashAge')) === String(ageA + 3) && (await val(page, 'msRecover')) === '25');
  ok(n + 'reload while on: the rows equal the real plan', (await rows(page)) === rowsPlan);

  // Revert from the card.
  await page.click('#msRunBtn');
  await flush(page);
  ok(n + 'run again: the rows differ', (await rows(page)) !== rowsPlan);
  await page.click('#msRunBtn');
  await flush(page);
  ok(n + 'Revert from the card: the rows equal the real rows exactly', (await rows(page)) === rowsPlan);
  ok(n + 'Revert from the card: the Run state', await runState(page));

  // Reset while on, then Undo.
  await page.click('#msRunBtn');
  await flush(page);
  await page.click('#resetBtn');
  await flush(page);
  ok(n + 'Reset while on: the Run state', await runState(page));
  await page.click('#undoToastBtn');
  await flush(page);
  ok(n + 'Undo after Reset: the real plan again', isDeepStrictEqual(await getState(page), statePlan));
  ok(n + 'Undo after Reset: the Run state', await runState(page));

  // Revert from the banner.
  await page.click('#msRunBtn');
  await flush(page);
  ok(n + 'run: the banner shows', !(await hidden(page, '#marketScenarioBanner')));
  await page.click('#marketScenarioRevertBtn');
  await flush(page);
  ok(n + 'Revert from the banner: the Run state', await runState(page));
  ok(n + 'Revert from the banner: the rows equal the real rows', (await rows(page)) === rowsPlan);

  // A plan change while on: the fields keep the running scenario's settings; Revert then clamps.
  await page.click('#msRunBtn');
  await flush(page);
  await setField(page, 'lifeExpectancyA', ageA + 2);
  await flush(page);
  ok(n + 'while on: a shorter life expectancy leaves the fields showing the run values', (await val(page, 'msCrashAge')) === String(ageA + 3), await val(page, 'msCrashAge'));
  await page.click('#msRunBtn');
  await flush(page);
  ok(n + 'after Revert: the real plan is back (edits made inside the scenario are dropped) and the card still shows the run age', (await val(page, 'msCrashAge')) === String(ageA + 3) && (await getState(page)).lifeExpectancyA === L, await val(page, 'msCrashAge'));

  // Real history.
  await page.click('#msKindHistory');
  ok(n + 'history: the crash fields hide and the history fields show', (await hidden(page, '#msCrashFields')) && !(await hidden(page, '#msHistoryFields')));
  ok(n + 'history: the start year descriptor names the data', (await text(page, 'msHistRange')) === '1928–2025', await text(page, 'msHistRange'));
  await setField(page, 'msHistStart', 2008);
  await setField(page, 'msHistAge', ageA + 2);
  const desc = await text(page, 'msDescription');
  ok(n + 'history: the description names the real years', /real markets 2008/i.test(desc) && /^R/.test(desc), desc);
  ok(n + 'history: the year output follows the age', (await text(page, 'msHistYear')) === `(${2026 + 2})`, await text(page, 'msHistYear'));
  await page.click('#msRunBtn');
  await flush(page);
  ok(n + 'history: Run changes the rows', (await rows(page)) !== rowsPlan);
  await page.click('#msRunBtn');
  await flush(page);
  ok(n + 'history: Revert restores the rows', (await rows(page)) === rowsPlan);

  // Mobile and tablet, the card open for each kind and the banner shown.
  for (const vp of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(vp);
    await page.click('#msKindCrash');
    ok(n + vp.width + ' px: crash fields do not scroll sideways', await noScroll(page));
    await page.click('#msKindHistory');
    ok(n + vp.width + ' px: history fields do not scroll sideways', await noScroll(page));
    await page.click('#msKindCrash');
    await page.click('#msRunBtn');
    await flush(page);
    ok(n + vp.width + ' px: card and banner shown do not scroll sideways', !(await hidden(page, '#marketScenarioBanner')) && (await noScroll(page)));
    await page.click('#msRunBtn');
    await flush(page);
  }
  ok(n + 'no page errors', page.errors.length === 0, page.errors);
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  await planner(browser, PLANNERS[0], PLANNERS[1]);
  await planner(browser, PLANNERS[1], PLANNERS[0]);
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log('FAIL: ' + e.stack);
  process.exit(1);
});
