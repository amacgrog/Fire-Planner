// Feedback B2 (US): the Social Security benefit-cut what-if. Checks the defaults, the "Use the Trustees' projection" button
// (22% from 2033), that the projection rows move with the cut (not only the boxes), that the same button then removes the
// cut (the uncut rows, an undo entry, kept on reload), the percent's clamp, the start year's rounding on change, the MCP
// limits, then the 390x844 layout.
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
          btn: document.getElementById('ssTrusteesCutBtn').textContent,
          ss2032: ss(2032), ss2033: ss(2033), ss2040: ss(2040),
        };
      });

    const before = await read();
    assert.strictEqual(before.pct, '0', 'the cut is 0 by default');
    assert.strictEqual(before.year, '2033', 'the start year is 2033 by default');
    assert(/22% cut from 2033/.test(before.note) && /2026 Trustees Report/.test(before.note), 'the note names the preset: ' + before.note);
    assert.strictEqual(before.btn, "Use the Trustees' projection", 'no cut: the button applies the preset');
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
    assert.strictEqual(r.btn, 'Remove the benefit cut', 'with the cut on, the button removes it');
    assert(/back to 0/.test(r.note), 'with the cut on, the note says it goes back to 0: ' + r.note);

    // The same button takes the cut off: 0%, the uncut rows in every year, the preset label back, and an undo entry.
    const toast = () => page.evaluate(() => ({ hidden: document.getElementById('undoToast').hidden, text: document.getElementById('undoToastText').textContent }));
    await page.click('#ssTrusteesCutBtn');
    r = await read();
    assert.strictEqual(r.pct, '0', 'Remove sets 0%');
    assert.strictEqual(r.year, '2033', 'Remove leaves the start year');
    assert.strictEqual(r.ss2032, before.ss2032, 'removed: 2032 uncut');
    assert.strictEqual(r.ss2033, before.ss2033, 'removed: 2033 uncut');
    assert.strictEqual(r.ss2040, before.ss2040, 'removed: 2040 uncut');
    assert.strictEqual(r.btn, "Use the Trustees' projection", 'removed: the button applies the preset again');
    assert.strictEqual(r.note, before.note, 'removed: the preset note again');
    let t = await toast();
    assert(!t.hidden && /Removed the benefit cut/.test(t.text), 'Remove takes an undo entry: ' + JSON.stringify(t));
    // Undo brings the 22% back (rows and label).
    await page.click('#undoToastBtn');
    r = await read();
    assert.strictEqual(r.pct, '22', 'undo: 22% again');
    assert(Math.abs(r.ss2033 - 0.78 * before.ss2033) < 0.01, 'undo: 2033 pays 78% again');
    assert.strictEqual(r.btn, 'Remove the benefit cut', 'undo: the button removes it again');
    // Remove again, then reload: the autosave keeps the cut off.
    await page.click('#ssTrusteesCutBtn');
    await page.reload();
    await page.waitForFunction(() => Array.isArray(window.fireProjectionRows) && window.fireProjectionRows.length > 0);
    r = await read();
    assert.strictEqual(r.pct, '0', 'reload after Remove: 0%');
    assert.strictEqual(r.ss2033, before.ss2033, 'reload after Remove: 2033 uncut');
    assert.strictEqual(r.btn, "Use the Trustees' projection", 'reload after Remove: the preset label');
    // A cut typed by hand also turns the button into Remove, and typing 0 turns it back.
    await page.fill('#ssBenefitCutPct', '30');
    r = await read();
    assert.strictEqual(r.btn, 'Remove the benefit cut', 'a typed 30: the button removes it');
    await page.click('#ssTrusteesCutBtn');
    r = await read();
    assert.strictEqual(r.pct, '0', 'Remove after a typed cut: 0%');
    await page.click('#ssTrusteesCutBtn');
    r = await read();
    assert.strictEqual(r.pct, '22', 'the preset again');

    // Back to 0: the rows are the uncut ones again. 150 is clamped to 100: nothing is paid from 2033.
    await page.fill('#ssBenefitCutPct', '0');
    r = await read();
    assert.strictEqual(r.ss2033, before.ss2033, '0: the uncut benefit again');
    assert.strictEqual(r.btn, "Use the Trustees' projection", 'a typed 0: the preset label again');
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
    // An emptied box, once left, is the default 2033 (not 0, which would be a cut from now).
    await page.fill('#ssBenefitCutStartYear', '');
    await page.locator('#ssBenefitCutStartYear').blur();
    r = await read();
    assert.strictEqual(r.year, '2033', 'an emptied year reads 2033 after change, got ' + r.year);
    assert.strictEqual(r.ss2032, before.ss2032, 'an emptied year: 2032 is not cut');
    assert.strictEqual(await page.evaluate(() => window.__test_getState().ssBenefitCutStartYear), 2033, 'an emptied year: the state holds 2033');

    // MCP: the percent is limited to 0-100.
    const keys = ['ssBenefitCutPct', 'ssBenefitCutStartYear'];
    assert.deepStrictEqual(await mcp(page, { ssBenefitCutPct: 30, ssBenefitCutStartYear: 2040 }, keys), [30, 2040], 'MCP: 30% from 2040 is accepted');
    assert.deepStrictEqual(await mcp(page, { ssBenefitCutPct: 120 }, keys), [30, 2040], 'MCP: 120 is outside 0-100 and ignored');
    assert.deepStrictEqual(await mcp(page, { ssBenefitCutStartYear: 1990 }, keys), [30, 2040], 'MCP: 1990 is outside 2000-2200 and ignored');
    assert.deepStrictEqual(await mcp(page, { ssBenefitCutStartYear: 2034.5 }, keys), [30, 2035], 'MCP: 2034.5 is rounded up to 2035');
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
