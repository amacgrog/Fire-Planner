// UI check (CI: `npm run test:ui`, not `npm test`) of Try, the held move preview (src/shared/ui/plans/move-preview.js, its banner),
// both planners: Try shows the change and the banner; a reload brings the real plan back; Keep on a fresh page is saved; Revert
// restores the state and hides the undo toast; Keep offers an Undo back to the real settings; one preview at a time (a market
// scenario, the Run button, the goal chips); Reset reverts first; the scenario list is locked; 390 px.
//   node test_move_preview.js
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
function ok(desc, cond, detail) {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL: ' + desc + (detail !== undefined ? ' -- ' + JSON.stringify(detail).slice(0, 600) : ''));
  }
}

const PLANNERS = [
  { name: 'US', file: 'Planner_US.html', key: 'fireCouplePlanner.massachusettsOffline.v1', seed: { ageA: 50, ageB: 48, retireAgeA: 55, retireAgeB: 53, lifeExpectancyA: 90, lifeExpectancyB: 90 } },
  { name: 'Canada', file: 'Planner_Canada.html', key: 'fireCouplePlanner.canadaOffline.v1', seed: { ageA: 50, ageB: 48, retireAgeA: 55, retireAgeB: 53, lifeExpectancyA: 90, lifeExpectancyB: 90 } },
];
const PREVIEW_TEXT = 'Previewing: retire 2 years later. Everything below shows the plan with this change: Keep saves it, Revert puts your plan back.';
const CHIP_TITLE = 'Keep or revert the change you are previewing to change your goals.';

// seeded: the page starts personalized (the seed is in storage); otherwise it is a fresh page on the example data
async function open(browser, P, { seeded, viewport = { width: 1280, height: 900 } }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(pathToFileURL(path.resolve(__dirname, 'dist', P.file)).href);
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
  if (seeded) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [P.key, JSON.stringify({ state: P.seed, mode: 'real' })]);
    await reload(page);
  }
  return { context, page };
}
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
}
const flush = (page) => page.evaluate(() => window.__test_flushRender());
const getState = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState())));
const tryMove = (page, move) => page.evaluate((m) => window.__test_tryMove(m), move);
const bannerHidden = (page) => page.evaluate(() => document.getElementById('movePreviewBanner').hidden);
const toastHidden = (page) => page.evaluate(() => document.getElementById('undoToast').hidden);
const saved = async (page, key) => {
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  return page.evaluate((k) => localStorage.getItem(k), key);
};
const setField = (page, id, v) => page.evaluate(({ id, v }) => {
  const el = document.getElementById(id);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, { id, v });
const val = (page, id) => page.evaluate((i) => document.getElementById(i).value, id);

async function planner(browser, P) {
  const n = P.name + ': ';
  const A = P.seed.ageA, RA = P.seed.retireAgeA, RB = P.seed.retireAgeB;
  const move = { label: 'retire 2 years later', patch: { retireAgeA: RA + 2, retireAgeB: RB + 2 } };

  // try
  {
    const { context, page } = await open(browser, P, { seeded: true });
    ok(n + 'try: returns true', (await tryMove(page, move)) === true);
    await flush(page);
    ok(n + 'try: the banner shows the text', !(await bannerHidden(page)) && (await page.textContent('#movePreviewText')) === PREVIEW_TEXT);
    ok(n + 'try: the field shows A + 2', (await val(page, 'retireAgeA')) === String(RA + 2), await val(page, 'retireAgeA'));
    ok(n + 'try: the state has A + 2', (await getState(page)).retireAgeA === RA + 2);
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    ok(n + 'try: the save status says Keep it to save', (await page.textContent('#saveStatus')) === 'Previewing a change: Keep it to save', await page.textContent('#saveStatus'));
    ok(n + 'try: a second Try returns false', (await tryMove(page, move)) === false);

    // one preview at a time
    ok(n + 'one at a time: Run returns false', (await page.evaluate(() => window.__test_runMarketScenario({ kind: 'crash', crashes: [{ age: 60, drop: 40, fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 9, bondReturn: 2 }] }))) === false);
    ok(n + 'one at a time: the Run button is disabled', await page.evaluate(() => document.getElementById('msRunBtn').disabled));
    const chips = await page.evaluate(() => [...document.querySelectorAll('.guidance-chip')].map((c) => [c.disabled, c.title]));
    ok(n + 'one at a time: every chip is disabled with the preview title', chips.length > 0 && chips.every(([d, t]) => d && t === CHIP_TITLE), chips);

    // scenario list locked
    ok(n + 'scenario list: Save current is disabled', await page.evaluate(() => document.getElementById('saveScenarioBtn').disabled));
    const note = await page.evaluate(() => { const e = document.getElementById('scenarioLockNote'); return [e.hidden, e.textContent]; });
    ok(n + 'scenario list: the note says to keep or revert', !note[0] && note[1] === 'Keep or revert the change you are previewing to save or load scenarios.', note);

    // the CSV notes the preview on its first line
    const csv = await page.evaluate(() => {
      const orig = URL.createObjectURL, origClick = HTMLAnchorElement.prototype.click;
      let blob = null;
      URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
      HTMLAnchorElement.prototype.click = function () {};
      document.getElementById('exportCsvBtn').click();
      URL.createObjectURL = orig;
      HTMLAnchorElement.prototype.click = origClick;
      return blob.text();
    });
    ok(n + 'csv: the first line notes the preview', csv.split('\n')[0] === '"Previewing a change: retire 2 years later. Not saved."', csv.split('\n')[0]);

    // revert
    await page.evaluate(() => window.__test_revertMove());
    await flush(page);
    ok(n + 'revert: the banner is hidden and the Run button is enabled', (await bannerHidden(page)) && (await page.evaluate(() => !document.getElementById('msRunBtn').disabled)));
    ok(n + 'revert: the scenario list is unlocked', await page.evaluate(() => !document.getElementById('saveScenarioBtn').disabled && document.getElementById('scenarioLockNote').hidden));
    ok(n + 'no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }

  // with a scenario on, Try refuses
  {
    const { context, page } = await open(browser, P, { seeded: true });
    ok(n + 'scenario on: Run returns true', await page.evaluate((a) => window.__test_runMarketScenario({ kind: 'crash', crashes: [{ age: a + 3, drop: 40, fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 9, bondReturn: 2 }] }), A));
    ok(n + 'scenario on: Try returns false', (await tryMove(page, move)) === false);
    ok(n + 'scenario on: no preview', (await page.evaluate(() => window.__test_movePreview())) === null);
    await context.close();
  }

  // reload is the real plan
  {
    const { context, page } = await open(browser, P, { seeded: true });
    await setField(page, 'spending', 70000);
    await flush(page);
    await tryMove(page, move);
    await flush(page);
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    await reload(page);
    ok(n + 'reload: the real plan comes back, no banner', (await getState(page)).retireAgeA === RA && (await bannerHidden(page)) && (await page.evaluate(() => window.__test_movePreview())) === null);
    await context.close();
  }

  // keep on a fresh page is saved
  {
    const { context, page } = await open(browser, P, { seeded: false });
    const before = await getState(page);
    const a = before.retireAgeA;
    const m = { label: 'retire 2 years later', patch: { retireAgeA: a + 2, retireAgeB: before.retireAgeB + 2 } };
    ok(n + 'fresh: try', (await tryMove(page, m)) === true);
    ok(n + 'fresh: keep', (await page.evaluate(() => window.__test_keepMove())) === true);
    await flush(page);
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    await reload(page);
    ok(n + 'fresh: after a reload the kept change is there', (await getState(page)).retireAgeA === a + 2, (await getState(page)).retireAgeA);
    await context.close();
  }

  // revert and keep
  {
    const { context, page } = await open(browser, P, { seeded: true });
    const before = JSON.stringify(await getState(page));
    await tryMove(page, move);
    await setField(page, 'spending', 91000);
    await flush(page);
    await page.click('#movePreviewRevertBtn');
    await flush(page);
    ok(n + 'revert: the state equals the one before Try', JSON.stringify(await getState(page)) === before);
    ok(n + 'revert: the banner and the undo toast are hidden', (await bannerHidden(page)) && (await toastHidden(page)));

    await tryMove(page, move);
    await page.click('#movePreviewKeepBtn');
    await flush(page);
    ok(n + 'keep: the state has A + 2', (await getState(page)).retireAgeA === RA + 2);
    ok(n + 'keep: the banner is hidden', await bannerHidden(page));
    const toast = (await page.textContent('#undoToastText')).trim();
    ok(n + 'keep: the undo toast reads Kept', !(await toastHidden(page)) && toast === 'Kept: retire 2 years later.', toast);
    await page.click('#undoToastBtn');
    await flush(page);
    ok(n + 'keep: Undo restores A', (await getState(page)).retireAgeA === RA);
    ok(n + 'no page errors', page.errors.length === 0, page.errors);
    await context.close();
  }

  // reset reverts
  {
    const { context, page } = await open(browser, P, { seeded: true });
    const before = JSON.stringify(await getState(page));
    await tryMove(page, move);
    await page.click('#resetBtn');
    await flush(page);
    ok(n + 'reset: no preview, no banner', (await page.evaluate(() => window.__test_movePreview())) === null && (await bannerHidden(page)));
    ok(n + 'reset: the state is the defaults', (await getState(page)).retireAgeA !== RA + 2 && (await getState(page)).ageA !== A);
    await page.click('#undoToastBtn');
    await flush(page);
    ok(n + 'reset: Undo returns to the real settings, not the preview', JSON.stringify(await getState(page)) === before);
    await context.close();
  }

  // 390 px
  {
    const { context, page } = await open(browser, P, { seeded: true, viewport: { width: 390, height: 844 } });
    await tryMove(page, move);
    await flush(page);
    ok(n + '390 px: the banner shows and the page does not scroll sideways', !(await bannerHidden(page)) && (await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)));
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  for (const P of PLANNERS) await planner(browser, P);
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log('FAIL: ' + e.stack);
  process.exit(1);
});
