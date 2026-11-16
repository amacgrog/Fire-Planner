// Feedback B1 (US): the "If the law changes: allow a start age past 70" switch raises the Social Security start-age limit from
// 70 to 75; turning it off lowers a start age past 70 to 70. Checks the box's limit, the clamp, and that the projection rows move
// with it (not only the checkbox), then the 390x844 layout.
// Run: node test_ss_late_start.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const fileFor = (planner) => 'file://' + path.resolve(__dirname, 'dist', planner);

async function open(browser, viewport, planner = 'Planner_US.html') {
  const page = await browser.newPage({ viewport });
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  // A stub model context, so the MCP tools register (as tests/field_registry.js does).
  await page.addInitScript(() => {
    window.__tools = [];
    document.modelContext = { registerTool: (t) => window.__tools.push(t) };
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fileFor(planner));
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
  if (planner === 'Planner_US.html')
    for (const [id, v] of [['singlePerson', true], ['ageA', 60], ['retireAgeA', 60], ['lifeExpectancyA', 90], ['ssMonthlyA', 2000]]) await set(id, v);
  return { page, errors, set };
}
// Calls the update_fire_assumptions MCP tool and returns the keys asked for from the state afterwards.
const mcp = (page, input, keys) =>
  page.evaluate(async ({ input, keys }) => {
    await window.__tools.find((t) => t.name === 'update_fire_assumptions').execute(input);
    const s = window.__test_getState();
    return keys.map((k) => s[k]);
  }, { input, keys });

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

    // The MCP tool runs the same clamps after all its writes; a rejected value runs none.
    const keys = ['ssLateStartEnabled', 'ssStartAgeA'];
    assert.deepStrictEqual(await mcp(page, { ssStartAgeA: 73 }, keys), [false, 70], 'MCP, off: 73 is clamped to 70');
    assert.deepStrictEqual(await mcp(page, { ssStartAgeA: 73, ssLateStartEnabled: true }, keys), [true, 73], 'MCP: an age and the switch together keep 73');
    assert.deepStrictEqual(await mcp(page, { ssLateStartEnabled: false }, keys), [false, 70], 'MCP: the switch off alone lowers 73 to 70');
    assert.deepStrictEqual(await mcp(page, { ssLateStartEnabled: true, ssStartAgeA: 72 }, keys), [true, 72], 'MCP: either key order keeps 72');
    assert.deepStrictEqual(await mcp(page, { ssStartAgeA: 76 }, keys), [true, 72], 'MCP: 76 is outside 62-75 and ignored');
    assert.deepStrictEqual(await mcp(page, { ssStartAgeA: 60 }, keys), [true, 72], 'MCP: 60 is outside 62-75 and ignored');
    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join('; '));
    await page.close();

    // Canada: an MCP life expectancy below the age now gets the clamp typing gets (age + 1).
    const ca = await open(browser, { width: 1280, height: 900 }, 'Planner_Canada.html');
    const [ageA] = await mcp(ca.page, {}, ['ageA']);
    assert.deepStrictEqual(await mcp(ca.page, { lifeExpectancyA: ageA - 5 }, ['lifeExpectancyA']), [ageA + 1], 'Canada MCP: a life expectancy below the age is raised to age + 1');
    assert.deepStrictEqual(ca.errors, [], 'Canada: no page errors: ' + ca.errors.join('; '));
    await ca.page.close();

    // 390x844 with the switch on: no horizontal overflow.
    const m = await open(browser, { width: 390, height: 844 });
    await m.set('ssLateStartEnabled', true);
    // The phone opens on the dashboard: show the inputs, so the row with the switch is laid out.
    await m.page.evaluate(() => {
      document.getElementById('workspace').setAttribute('data-mobile-view', 'inputs');
      document.getElementById('ssLateStartEnabled').closest('details').open = true;
    });
    assert(await m.page.isVisible('#ssLateStartEnabled'), 'mobile: the switch is shown');
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
