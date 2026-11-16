// Feedback B2 (US): the Social Security benefit-cut what-if. Checks the defaults, the "Use the Trustees' projection" button
// (22% from 2033), that the projection rows move with the cut (not only the boxes), the percent's clamp, the start year's
// rounding on change, the MCP limits, then the 390x844 layout.
// Run: node test_ss_benefit_cut.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const fileFor = (planner) => 'file://' + path.resolve(__dirname, 'dist', planner);

async function open(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  // A stub model context, so the MCP tools register (as tests/field_registry.js does).
  await page.addInitScript(() => {
    window.__tools = [];
    document.modelContext = { registerTool: (t) => window.__tools.push(t) };
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fileFor('Planner_US.html'));
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
  // A single retiree at 60 in 2026 with 2,000 a month of Social Security from 62 (2028).
  for (const [id, v] of [['singlePerson', true], ['ageA', 60], ['retireAgeA', 60], ['lifeExpectancyA', 90], ['ssMonthlyA', 2000], ['ssStartAgeA', 62]]) await set(id, v);
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
    // The US rows can change in the deferred pass, so every read of rows flushes the render first. Rows are by projection
    // year (0 = 2026); only `ss` is compared before the cut, since the cliff plan's look-ahead may move other fields.
    const read = () =>
      page.evaluate(() => {
        window.__test_flushRender();
        const ss = (cal) => window.fireProjectionRows.find((r) => r.year === cal - 2026).ss;
        return {
          pct: document.getElementById('ssBenefitCutPct').value,
          year: document.getElementById('ssBenefitCutStartYear').value,
          note: document.getElementById('ssTrusteesCutNote').textContent,
          ss2032: ss(2032), ss2033: ss(2033), ss2040: ss(2040),
        };
      });

    const before = await read();
    assert.strictEqual(before.pct, '0', 'the cut is 0 by default');
    assert.strictEqual(before.year, '2033', 'the start year is 2033 by default');
    assert(/22% cut from 2033/.test(before.note) && /2026 Trustees Report/.test(before.note), 'the note names the preset: ' + before.note);
    assert(before.ss2032 > 0 && before.ss2033 > 0, 'Social Security is paid in 2032 and 2033');

    // The button sets 22% from 2033, and the rows move from 2033 on, not before.
    await page.click('#ssTrusteesCutBtn');
    let r = await read();
    assert.strictEqual(r.pct, '22', 'the button sets 22%');
    assert.strictEqual(r.year, '2033', 'the button sets 2033');
    assert.strictEqual(r.ss2032, before.ss2032, '2032 is not cut');
    assert(Math.abs(r.ss2033 - 0.78 * before.ss2033) < 0.01, `2033 pays 78% (got ${r.ss2033}, uncut ${before.ss2033})`);
    assert(Math.abs(r.ss2040 - 0.78 * before.ss2040) < 0.01, '2040 pays 78%');
    assert.strictEqual(await page.evaluate(() => window.__test_getState().ssBenefitCutPct), 22, 'the state holds 22');

    // Back to 0: the rows are the uncut ones again. 150 is clamped to 100: nothing is paid from 2033.
    await page.fill('#ssBenefitCutPct', '0');
    r = await read();
    assert.strictEqual(r.ss2033, before.ss2033, '0: the uncut benefit again');
    await page.fill('#ssBenefitCutPct', '150');
    r = await read();
    assert.strictEqual(r.pct, '100', 'a typed 150 reads 100, got ' + r.pct);
    assert(r.ss2033 === 0 && r.ss2032 === before.ss2032, '100% from 2033: nothing paid from 2033, 2032 untouched');

    // The start year is rounded up once the box is left (normalizeState's rule): 2034.4 cuts from 2035.
    await page.fill('#ssBenefitCutPct', '22');
    await page.fill('#ssBenefitCutStartYear', '2034.4');
    await page.locator('#ssBenefitCutStartYear').blur();
    r = await read();
    assert.strictEqual(r.year, '2035', 'a typed 2034.4 reads 2035 after change, got ' + r.year);
    assert.strictEqual(r.ss2033, before.ss2033, 'a cut from 2035 leaves 2033 alone');

    // MCP: the percent is limited to 0-100.
    const keys = ['ssBenefitCutPct', 'ssBenefitCutStartYear'];
    assert.deepStrictEqual(await mcp(page, { ssBenefitCutPct: 30, ssBenefitCutStartYear: 2040 }, keys), [30, 2040], 'MCP: 30% from 2040 is accepted');
    assert.deepStrictEqual(await mcp(page, { ssBenefitCutPct: 120 }, keys), [30, 2040], 'MCP: 120 is outside 0-100 and ignored');
    assert.deepStrictEqual(await mcp(page, { ssBenefitCutStartYear: 1990 }, keys), [30, 2040], 'MCP: 1990 is outside 2000-2200 and ignored');
    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join('; '));
    await page.close();

    // 390x844 with the cut on: no horizontal overflow, the button shown.
    const m = await open(browser, { width: 390, height: 844 });
    await m.set('ssBenefitCutPct', 22);
    // The phone opens on the dashboard: show the inputs, so the rows with the fields are laid out.
    await m.page.evaluate(() => {
      document.getElementById('workspace').setAttribute('data-mobile-view', 'inputs');
      document.getElementById('ssBenefitCutPct').closest('details').open = true;
    });
    assert(await m.page.isVisible('#ssTrusteesCutBtn'), 'mobile: the button is shown');
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflow, false, 'mobile 390x844: no horizontal overflow');
    assert.deepStrictEqual(m.errors, [], 'mobile: no page errors: ' + m.errors.join('; '));
    await m.page.close();
    console.log('Social Security benefit cut checks passed.');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
