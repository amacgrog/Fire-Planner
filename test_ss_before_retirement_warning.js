// Batch 7O, O5: the "Worth a second look" list flags a Social Security start before both the partner's
// retirement age and their full retirement age while they still have wages (the earnings test is not modeled).
// Run: node test_ss_before_retirement_warning.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const set = (id, v) =>
    page.evaluate(
      ({ id, v }) => {
        const e = document.getElementById(id);
        if (e.type === 'checkbox') e.checked = v;
        else e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { id, v },
    );
  const banner = () =>
    page.evaluate(() => ({
      hidden: document.getElementById('unusualAssumptionsBanner').hidden,
      items: [...document.querySelectorAll('#unusualAssumptionsList li')].map((li) => li.textContent),
    }));
  const flagged = async (fragment) => (await banner()).items.some((t) => t.includes(fragment));

  // A couple in their late 40s: full retirement age 67. Defaults flag nothing about Social Security.
  for (const [id, v] of [['singlePerson', false], ['ageA', 50], ['ageB', 48], ['retireAgeA', 62], ['retireAgeB', 60], ['incomeA', 100000], ['incomeB', 60000], ['ssMonthlyA', 2500], ['ssMonthlyB', 1500], ['ssStartAgeA', 62], ['ssStartAgeB', 62]]) await set(id, v);
  await page.waitForTimeout(300);
  assert(!(await flagged('Social Security starts while working')), 'start at 62 with retirement at 62 is not flagged (not before retirement)');

  // Start at 62 while retiring at 66: before retirement and before the full retirement age of 67.
  await set('retireAgeA', 66);
  await page.waitForTimeout(300);
  assert(await flagged('Partner A Social Security starts while working'), 'Partner A: start 62, retire 66 is flagged');
  assert(!(await flagged('Partner B Social Security starts while working')), 'Partner B (start 62, retire 60) is not');
  const text = (await banner()).items.find((t) => t.includes('Partner A Social Security'));
  assert(text.includes('$24,480') && text.includes('$65,160') && text.includes('full retirement age (67)'), 'the message carries the 2026 limits and the full retirement age: ' + text);

  // The marker on the field itself.
  assert(await page.evaluate(() => document.getElementById('ssStartAgeA').closest('.field').classList.contains('unusual-value')), 'the start-age field is marked');

  // Starting at the full retirement age or after is fine; so is retiring first.
  await set('ssStartAgeA', 67);
  await page.waitForTimeout(300);
  assert(!(await flagged('Partner A Social Security starts while working')), 'start at 67 is at the full retirement age');
  await set('ssStartAgeA', 62);
  await set('retireAgeA', 62);
  await page.waitForTimeout(300);
  assert(!(await flagged('Partner A Social Security starts while working')), 'retire at 62, start at 62: not before retirement');
  await set('retireAgeA', 66);

  // No wages, no earnings test.
  await set('incomeA', 0);
  await page.waitForTimeout(300);
  assert(!(await flagged('Partner A Social Security starts while working')), 'no wages: not flagged');
  await set('incomeA', 100000);

  // Full retirement age by birth year: age 71 in 2026 (born 1955) is 66 and 2 months; start 66 retire 70 is flagged, start 67 is not.
  await set('ageA', 71);
  await set('retireAgeA', 73);
  await set('ssStartAgeA', 66);
  await page.waitForTimeout(300);
  const t66 = (await banner()).items.find((t) => t.includes('Partner A Social Security'));
  assert(t66 && t66.includes('66 and 2 months'), 'born 1955: full retirement age 66 and 2 months: ' + t66);
  await set('ssStartAgeA', 67);
  await page.waitForTimeout(300);
  assert(!(await flagged('Partner A Social Security starts while working')), 'start at 67 is past 66 and 2 months');
  await set('ageA', 50);
  await set('retireAgeA', 66);
  await set('ssStartAgeA', 62);
  await page.waitForTimeout(300);

  // Single person: Partner B is ignored.
  await set('singlePerson', true);
  await set('ssStartAgeB', 62);
  await set('retireAgeB', 70);
  await page.waitForTimeout(300);
  assert(!(await flagged('Partner B Social Security starts while working')), 'single person: no Partner B item');
  await set('singlePerson', false);
  await page.waitForTimeout(300);

  // Dismissal: the check mark hides it and it stays hidden until the condition clears and returns.
  assert(await flagged('Partner A Social Security starts while working'));
  await page.evaluate(() => document.querySelector('.unusual-dismiss[data-field="ssStartAgeA"]').click());
  await page.waitForTimeout(300);
  assert(!(await flagged('Partner A Social Security starts while working')), 'dismissed');
  await set('ssStartAgeA', 67);
  await page.waitForTimeout(200);
  await set('ssStartAgeA', 62);
  await page.waitForTimeout(300);
  assert(await flagged('Partner A Social Security starts while working'), 'back after the condition cleared and returned');

  // The projection is untouched: the warning changes no number.
  const rows1 = await page.evaluate(() => JSON.stringify(window.__test_simulate().rows.slice(0, 5).map((r) => r.ss)));
  await set('retireAgeA', 62);
  await set('retireAgeA', 66);
  const rows2 = await page.evaluate(() => JSON.stringify(window.__test_simulate().rows.slice(0, 5).map((r) => r.ss)));
  assert.strictEqual(rows1, rows2);

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('Social Security before retirement warning test passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
