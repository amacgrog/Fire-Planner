// Batch 7A UI check (not run by CI): the Children group in both planners. Add / edit / remove a
// child through the real controls, the group summary, the reload round trip, that a child changes the
// US projection only through the ACA household, and the 390x844 overflow check.
//   node test_children.js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const PLANNERS = [
  { key: 'US', file: 'Planner_US.html' },
  { key: 'Canada', file: 'Planner_Canada.html' },
];

(async () => {
  const browser = await chromium.launch();
  try {
    for (const p of PLANNERS) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('file://' + path.resolve(__dirname, p.file));
      await page.waitForTimeout(300);
      // The first-run wizard / banner may cover the page; the group itself is in the DOM regardless.
      const group = page.locator('#childrenGroup');
      assert.strictEqual(await group.count(), 1, `[${p.key}] Children group exists`);
      await page.evaluate(() => (document.getElementById('childrenGroup').open = true));
      assert.strictEqual(await page.locator('#childFields .dyn-empty').count(), 1, `[${p.key}] starts empty`);
      assert.strictEqual(await page.locator('#childrenGroupState').innerText(), '', `[${p.key}] no summary when empty`);

      // Add a child: the row has a birth-year field defaulting to the current year, and a student box.
      await page.locator('#childFields [data-dyn-add="children"]').evaluate((b) => b.click());
      const year = new Date().getFullYear();
      assert.strictEqual(await page.inputValue('#child0BirthYear'), String(year), `[${p.key}] new child defaults to this year`);
      assert.strictEqual(await page.locator('#child0Student').isChecked(), false);
      await page.fill('#child0BirthYear', String(year - 5));
      await page.locator('#child0Student').evaluate((c) => c.click());
      await page.locator('#childFields [data-dyn-add="children"]').evaluate((b) => b.click());
      await page.fill('#child1BirthYear', String(year + 2));
      const st = await page.evaluate(() => window.__test_getState().children);
      assert.deepStrictEqual(st, [{ birthYear: year - 5, student: true }, { birthYear: year + 2, student: false }], `[${p.key}] state follows the controls`);
      assert.strictEqual(await page.locator('#childrenGroupState').innerText(), '✓ 2 children', `[${p.key}] summary`);

      // Round trip through autosave.
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(400);
      assert.deepStrictEqual(await page.evaluate(() => window.__test_getState().children), st, `[${p.key}] children survive a reload`);
      assert.strictEqual(await page.inputValue('#child1BirthYear'), String(year + 2), `[${p.key}] controls repopulate`);

      // The Canada copy says the list is not used yet; the US copy says what it is used for.
      const tip = await page.locator('#childFields .range-note .info-tip').getAttribute('data-tip');
      assert(p.key === 'Canada' ? /Not used by this planner/.test(tip) : /ACA household/.test(tip), `[${p.key}] list tip: ${tip.slice(0, 60)}`);

      // Remove one.
      await page.locator('#childFields [data-dyn-remove="0"]').evaluate((b) => b.click());
      assert.strictEqual(await page.locator('#childrenGroupState').innerText(), '✓ 1 child', `[${p.key}] singular summary`);
      assert.strictEqual((await page.evaluate(() => window.__test_getState().children)).length, 1);

      // The cap of ten disables the add button.
      for (let i = 0; i < 12; i++) await page.locator('#childFields [data-dyn-add="children"]').evaluate((b) => b.click());
      assert.strictEqual((await page.evaluate(() => window.__test_getState().children)).length, 10, `[${p.key}] capped at ten`);
      assert.strictEqual(await page.locator('#childFields [data-dyn-add="children"]').isDisabled(), true);

      // Phone width: no horizontal overflow.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(200);
      assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `[${p.key}] no horizontal overflow at 390px`);
      assert.deepStrictEqual(errors, [], `[${p.key}] page errors: ${errors}`);
      await ctx.close();
      console.log(`[${p.key}] children UI ok`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
