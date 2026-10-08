// E1a: employer-plan contribution limits. Part 1: Partner A/B income are typed money fields (no 350,000 cap).
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'Planner_US.html'));
  await page.waitForTimeout(200);
  const type = async (sel, v) => {
    await page.fill(sel, String(v));
    await page.dispatchEvent(sel, 'input');
    await page.waitForTimeout(100);
  };
  const wages = () => page.evaluate(() => window.fireProjectionRows[0].wages);
  const income = () => page.evaluate(() => window.__test_getState().incomeA);

  // Part 1: income as a typed money field.
  await type('#incomeA', 100000);
  assert.strictEqual(await income(), 100000, 'incomeA 100000');
  const w100 = await wages();
  await type('#incomeA', 500000);
  assert.strictEqual(await income(), 500000, 'incomeA 500000 is not capped at 350,000');
  assert(await wages() > w100, 'wages grow with income');

  await page.reload();
  await page.waitForTimeout(300);
  assert.strictEqual(await income(), 500000, 'income survives a reload');
  assert.strictEqual(await page.inputValue('#incomeA'), '$500,000', 'income shown formatted');

  await page.evaluate(() => { const s = window.__test_getState(); s.incomeA = 600000; });
  await type('#spending', 70000);
  assert.strictEqual(await income(), 600000, 'income above 350,000 survives an edit of another field');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.strictEqual(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    false,
    'no horizontal overflow at 390 wide',
  );

  // Part 2 (Task 3): profit sharing, an employer contribution to the traditional 401(k).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const s = window.__test_getState();
    Object.assign(s, { singlePerson: false, ageA: 40, retireAgeA: 60, incomeA: 150000 });
    window.__test_syncControls();
    document.getElementById('profitSharingPctA').closest('details').open = true;
  });
  await type('#profitSharingPctA', 0);
  const lastWorking = () =>
    page.evaluate(() => {
      const s = window.__test_getState();
      return window.fireProjectionRows.find((r) => r.age === s.retireAgeA - 1).traditional;
    });
  const trad0 = await lastWorking();
  await type('#profitSharingPctA', 10);
  assert.strictEqual(await page.evaluate(() => window.__test_getState().profitSharingPctA), 10, 'profit sharing stored');
  assert(await lastWorking() > trad0, 'profit sharing raises the traditional balance at the last working age');
  // Strictly 0 to 25 while typing.
  await type('#profitSharingPctA', 40);
  assert.strictEqual(await page.evaluate(() => window.__test_getState().profitSharingPctA), 25, 'clamped to 25');
  assert.strictEqual(await page.inputValue('#profitSharingPctA'), '25', 'box shows 25');
  await type('#profitSharingPctA', -3);
  assert.strictEqual(await page.evaluate(() => window.__test_getState().profitSharingPctA), 0, 'clamped to 0');
  assert.strictEqual(await page.inputValue('#profitSharingPctA'), '0', 'box shows 0');
  // Partner B's field hides in single-person mode.
  assert.strictEqual(await page.isVisible('#profitSharingPctB'), true, 'B profit sharing shown for a couple');
  await page.evaluate(() => {
    const el = document.getElementById('singlePerson');
    if (!el.checked) el.click();
  });
  await page.waitForTimeout(150);
  assert.strictEqual(await page.isVisible('#profitSharingPctB'), false, 'B profit sharing hidden in single-person mode');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.strictEqual(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    false,
    'no horizontal overflow at 390 wide with the profit-sharing fields',
  );

  assert.deepStrictEqual(errors, [], 'no page errors');
  console.log('test_contribution_limits: parts 1 and 2 passed');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
