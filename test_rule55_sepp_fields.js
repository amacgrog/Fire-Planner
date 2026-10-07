// The 72(t) first-payment age fields follow their checkbox for both partners, and Partner B's hide in
// single-person mode. Root ad-hoc Playwright script: node test_rule55_sepp_fields.js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'Planner_US.html'));
  await page.waitForTimeout(300);
  const hidden = (id) => page.evaluate((id) => document.getElementById(id).hidden, id);
  const set = (patch) =>
    page.evaluate((patch) => {
      Object.assign(window.__test_getState(), patch);
      window.__test_syncControls();
    }, patch);
  const fields = [['sepp72tK401A', 'sepp72tK401AAgeField'], ['sepp72tIraA', 'sepp72tIraAAgeField'], ['sepp72tK401B', 'sepp72tK401BAgeField'], ['sepp72tIraB', 'sepp72tIraBAgeField']];

  await set({ singlePerson: false, sepp72tK401A: false, sepp72tIraA: false, sepp72tK401B: false, sepp72tIraB: false });
  for (const [, field] of fields) assert.strictEqual(await hidden(field), true, `${field} hidden while its box is unchecked`);
  await set({ sepp72tK401A: true, sepp72tIraA: true, sepp72tK401B: true, sepp72tIraB: true });
  for (const [, field] of fields) assert.strictEqual(await hidden(field), false, `${field} shown while its box is checked`);
  await set({ singlePerson: true });
  assert.strictEqual(await hidden('sepp72tK401BAgeField'), true, 'B field hidden in single-person mode');
  assert.strictEqual(await hidden('sepp72tIraBAgeField'), true, 'B field hidden in single-person mode');
  assert.deepStrictEqual(errors, []);
  console.log('test_rule55_sepp_fields: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
