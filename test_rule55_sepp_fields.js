// The 72(t) first-payment age fields follow their checkbox for both partners, and Partner B's hide in
// single-person mode; the per-partner Rule of 55 boxes (enabled for a retirement age of 55-59, the 72(t)
// note under a covered 401(k)) and a 390x844 width check. Root ad-hoc Playwright script: node test_rule55_sepp_fields.js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
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
  assert.strictEqual(await page.evaluate(() => document.getElementById('ruleOf55B').closest('.field').hidden), true, 'B Rule of 55 hidden in single-person mode');

  // Rule of 55 per partner (3C PR 1): the box is enabled only for a retirement age of 55-59, follows the
  // retirement-age slider, and the 72(t) note under a 401(k) shows when Rule of 55 already covers it.
  await set({ singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 56, retireAgeB: 56, ruleOf55A: false, ruleOf55B: false, sepp72tK401A: true, sepp72tK401B: true });
  const shown = (id) => page.evaluate((id) => getComputedStyle(document.getElementById(id)).display !== 'none' && !document.getElementById(id).closest('[hidden]'), id);
  assert.strictEqual(await shown('sepp72tK401ARule55Note'), false, 'note hidden while Rule of 55 A is off');
  await page.evaluate(() => document.getElementById('withdrawalStrategyGroup')?.setAttribute('open', ''));
  await page.evaluate(() => document.getElementById('ruleOf55A').closest('details')?.setAttribute('open', ''));
  await page.click('#ruleOf55A');
  assert.strictEqual(await page.evaluate(() => window.__test_getState().ruleOf55A), true, 'clicking the A box sets ruleOf55A');
  assert.strictEqual(await page.evaluate(() => window.__test_getState().ruleOf55B), false, 'and leaves B alone');
  assert.strictEqual(await shown('sepp72tK401ARule55Note'), true, 'A note shown: Rule of 55 covers the 401(k)');
  assert.strictEqual(await shown('sepp72tK401BRule55Note'), false, 'B note hidden: B has no Rule of 55');
  const slide = (v) =>
    page.evaluate((v) => {
      const el = document.getElementById('retireAgeA');
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  await slide(60);
  assert.strictEqual(await page.evaluate(() => document.getElementById('ruleOf55A').disabled), true, 'retire 60 via slider: disabled');
  assert.match(await page.evaluate(() => document.getElementById('ruleOf55ANote').textContent), /No penalty to avoid/);
  assert.strictEqual(await shown('sepp72tK401ARule55Note'), false, 'A note hidden at retirement 60');
  await slide(54);
  assert.strictEqual(await page.evaluate(() => document.getElementById('ruleOf55A').disabled), true, 'retire 54 via slider: disabled');
  assert.match(await page.evaluate(() => document.getElementById('ruleOf55ANote').textContent), /Needs retirement at 55 or later \(now 54\)/);
  await slide(57);
  assert.strictEqual(await page.evaluate(() => document.getElementById('ruleOf55A').disabled), false, 'retire 57 via slider: enabled');

  // Mobile width: no horizontal page scroll with both Rule of 55 boxes and the notes shown.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForTimeout(300);
  await set({ singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 56, retireAgeB: 56, ruleOf55A: true, ruleOf55B: true, sepp72tK401A: true, sepp72tK401B: true });
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => d.setAttribute('open', '')));
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'no horizontal scroll at 390x844');
  assert.deepStrictEqual(errors, []);
  console.log('test_rule55_sepp_fields: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
