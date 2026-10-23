// UI check (CI: `npm run test:ui`, not `npm test`): with every cached simulation result frozen, no caller writes to a shared
// result (a write would throw a page error), and the Monte Carlo figure is identical after view, dollar-display and slider round trips.
//   node test_result_cache.js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const PLANNERS = [
  { file: 'Planner_US.html', slider: 'k401PctA' },
  { file: 'Planner_Canada.html', slider: 'rrspPctA' },
];

(async () => {
  const browser = await chromium.launch();
  for (const { file, slider } of PLANNERS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, 'dist', file));
    await page.waitForFunction(() => typeof window.__test_freezeSimResults === 'function');
    await page.evaluate(() => window.__test_freezeSimResults(true));
    const click = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
    const nudge = (id) => page.evaluate((i) => {
      const el = document.getElementById(i);
      const v = el.value;
      el.value = String(Number(v) === Number(el.max) ? Number(v) - Number(el.step || 1) : Number(v) + Number(el.step || 1));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, id);
    const openCards = () => page.evaluate(() => {
      for (const d of document.querySelectorAll('details')) { d.open = true; d.dispatchEvent(new Event('toggle')); }
    });
    const dollars = async () => { await click('nominalBtn'); await click('realBtn'); };
    const mcTexts = async () => {
      await page.waitForFunction(() => {
        const r = document.getElementById('mcSuccessRate'); const s = document.getElementById('mcSuccessSub');
        return r && s && r.textContent.trim().length > 0 && s.textContent.trim().length > 0;
      });
      return page.evaluate(() => ({
        rate: document.getElementById('mcSuccessRate').textContent,
        sub: document.getElementById('mcSuccessSub').textContent,
      }));
    };

    // A render with frozen results, then every card open.
    await nudge(slider);
    await openCards();
    for (const id of ['chartGroupProjectionBtn', 'chartView1Btn', 'chartView3Btn', 'chartViewCagrBtn', 'chartShiftGapBtn']) {
      await click(id);
      await dollars();
    }
    await click('chartGroupHistBtn');
    await dollars();
    await click('chartGroupMcBtn');
    for (const id of ['mcPaths500Btn', 'mcPaths1000Btn', 'mcPaths2000Btn']) {
      await click(id);
      await dollars();
    }
    await click('mcPaths1000Btn');
    const first = await mcTexts();

    // Round trips: a card closed and reopened, another view and back, the dollar display twice.
    await page.evaluate(() => { const d = document.querySelector('details'); d.open = false; d.dispatchEvent(new Event('toggle')); d.open = true; d.dispatchEvent(new Event('toggle')); });
    assert.deepStrictEqual(await mcTexts(), first, file + ': after a card close/reopen');
    await click('chartGroupProjectionBtn');
    await click('chartGroupMcBtn');
    assert.deepStrictEqual(await mcTexts(), first, file + ': after Projection and back');
    await dollars(); await dollars();
    assert.deepStrictEqual(await mcTexts(), first, file + ': after real/nominal twice');
    await nudge(slider);
    assert.deepStrictEqual(await mcTexts(), first, file + ': after a slider round trip');

    assert.deepStrictEqual(errors, [], file + ': page errors ' + errors);
    await page.close();
  }
  await browser.close();
  console.log('result cache: no write to a frozen cached result in either planner; the Monte Carlo figure is stable');
})().catch((e) => { console.error(e); process.exit(1); });
