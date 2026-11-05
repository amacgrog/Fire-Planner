// Traditional IRA basis slider (US, IRA deduction PR 2): present for A, hidden for B in single-person mode, no horizontal scroll at 390x844,
// the value reaches state, and moving A's slider changes the projection in the first year with a traditional draw (Task 6).
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
  await page.waitForFunction(() => typeof window.__test_getState === 'function');
  await page.evaluate(() => {
    const d = document.querySelector('#tradIraBasisPctA').closest('details');
    if (d) d.open = true;
  });
  const slider = page.locator('#tradIraBasisPctA');
  await slider.waitFor({ state: 'visible' });
  assert(await page.locator('#tradIraBasisPctB').isVisible(), 'B slider visible for a couple');
  // Task 6: give A a traditional IRA (the default plan has none), so the projection's later traditional draws come partly out of it
  await page.evaluate(() => {
    window.__test_getState().tradIraA = 300000;
    window.__test_syncControls();
  });
  await page.evaluate(() => window.__test_flushRender());
  const before = await page.evaluate(() => window.fireProjectionRows.map((r) => ({ ...r })));
  await slider.fill('40');
  await slider.dispatchEvent('change');
  assert.strictEqual(await page.evaluate(() => window.__test_getState().tradIraBasisPctA), 40, 'state follows the slider');
  await page.evaluate(() => window.__test_flushRender());
  const after = await page.evaluate(() => window.fireProjectionRows.map((r) => ({ ...r })));
  // the first year with a traditional draw: the slider moves its taxable income and recovers basis
  const i = after.findIndex((r) => r.traditionalWithdrawn > 0);
  assert(i >= 0, 'the plan draws from its traditional accounts');
  assert(after[i].iraBasisRecovered > 0, 'the draw recovers basis: ' + after[i].iraBasisRecovered);
  assert.notStrictEqual(after[i].income, before[i].income, 'the slider changes the draw year\'s taxable income');
  assert(after[i].income < before[i].income, 'basis lowers the draw year\'s taxable income');
  assert.strictEqual((await page.locator('#tradIraBasisPctAOut').textContent()).trim(), '40%', 'output shows the percent');
  await page.check('#singlePerson', { force: true }).catch(() => {});
  await page.evaluate(() => {
    const el = document.getElementById('singlePerson');
    if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.evaluate(() => window.__test_flushRender());
  assert(await page.locator('#tradIraBasisPctB').isHidden(), 'B slider hidden for a single person');
  assert(await page.locator('#tradIraBasisPctA').isVisible(), 'A slider still visible');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.strictEqual(overflow, false, 'no horizontal scroll at 390x844');
  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('test_ira_basis: ok');
})().catch((e) => { console.error(e); process.exit(1); });
