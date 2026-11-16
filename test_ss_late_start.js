// Feedback B1 (US): the "If the law changes: allow a start age past 70" switch raises the Social Security start-age limit from
// 70 to 75; turning it off lowers a start age past 70 to 70. Checks the box's limit, the clamp, and that the projection rows move
// with it (not only the checkbox), then the 390x844 layout.
// Run: node test_ss_late_start.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'dist', 'Planner_US.html');

async function open(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => Array.isArray(window.fireProjectionRows) && window.fireProjectionRows.length > 0);
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
  // A single retiree at 60 with 2,000 a month of Social Security.
  for (const [id, v] of [['singlePerson', true], ['ageA', 60], ['retireAgeA', 60], ['lifeExpectancyA', 90], ['ssMonthlyA', 2000]]) await set(id, v);
  return { page, errors, set };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser, { width: 1280, height: 900 });
    // The US rows can change in the deferred pass, so every read of rows flushes the render first.
    const read = () =>
      page.evaluate(() => {
        window.__test_flushRender();
        const ss = (age) => window.fireProjectionRows.find((r) => r.age === age).ss;
        const box = document.getElementById('ssStartAgeA');
        return { value: box.value, max: box.max, checked: document.getElementById('ssLateStartEnabled').checked, ss70: ss(70), ss71: ss(71), ss72: ss(72) };
      });

    let r = await read();
    assert.strictEqual(r.checked, false, 'the switch is off by default');
    assert.strictEqual(r.max, '70', 'off: the start-age box stops at 70');

    // Off: a typed 72 is clamped to 70, and the benefit starts at 70.
    await page.fill('#ssStartAgeA', '72');
    r = await read();
    assert.strictEqual(r.value, '70', 'off: a typed 72 reads 70 in the box, got ' + r.value);
    assert(r.ss70 > 0, 'off: Social Security is paid at 70');

    // On: the limit is 75, and a start at 72 pays nothing at 70 and 71.
    await page.check('#ssLateStartEnabled');
    r = await read();
    assert.strictEqual(r.max, '75', 'on: the start-age box stops at 75');
    await page.fill('#ssStartAgeA', '72');
    r = await read();
    assert.strictEqual(r.value, '72', 'on: 72 is kept');
    assert(r.ss70 === 0 && r.ss71 === 0 && r.ss72 > 0, `on: nothing before 72, paid from 72 (got ${r.ss70}, ${r.ss71}, ${r.ss72})`);
    const paidAt72 = r.ss72;

    // On: a typed 76 is clamped to 75.
    await page.fill('#ssStartAgeA', '76');
    r = await read();
    assert.strictEqual(r.value, '75', 'on: a typed 76 reads 75');
    await page.fill('#ssStartAgeA', '72');

    // Off again: the age goes back to 70, and the projection with it.
    await page.uncheck('#ssLateStartEnabled');
    r = await read();
    assert.strictEqual(r.value, '70', 'off: the start age is lowered to 70, got ' + r.value);
    assert.strictEqual(r.max, '70', 'off: the box stops at 70 again');
    assert(r.ss70 > 0 && r.ss72 === paidAt72, 'off: Social Security is paid from 70 again');
    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join('; '));
    await page.close();

    // 390x844 with the switch on: no horizontal overflow.
    const m = await open(browser, { width: 390, height: 844 });
    await m.set('ssLateStartEnabled', true);
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflow, false, 'mobile 390x844: no horizontal overflow');
    assert.deepStrictEqual(m.errors, [], 'mobile: no page errors: ' + m.errors.join('; '));
    await m.page.close();
    console.log('Social Security start past 70 checks passed.');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
