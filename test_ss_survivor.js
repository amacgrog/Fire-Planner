// SS claiming optimizer PR 2 (US): a widowed single person's survivor benefit. The switch shows only in single-person mode; its
// group holds the amount at full retirement age, the start-age select (at full retirement age, or 60-70), the "already collecting"
// box and SSA's optional earlier quote. Checks that the projection rows move with the inputs (not only the controls), the two
// check lines, the earnings-test warning for the survivor start, the autosave keeping the null start, the MCP tool, then the
// 390x844 layout.
// Run: node test_ss_survivor.js

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
  return { page, errors, set };
}
// A single retiree of 59 (born 1967: both full retirement ages 67), own benefit 2,500 a month at full retirement age from 70.
const SETUP = [
  ['singlePerson', true], ['ageA', 59], ['retireAgeA', 59], ['lifeExpectancyA', 90], ['incomeA', 0], ['ssMonthlyA', 2500], ['ssStartAgeA', 70], ['inflation', 0],
];

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  try {
    const { page, errors, set } = await open(browser, { width: 1280, height: 900 });
    const shown = (id) => page.evaluate((id) => document.getElementById(id).offsetParent !== null, id);
    await set('singlePerson', false);
    assert(!(await shown('ssWidowedField')), 'couple: the widowed switch is hidden');
    for (const [id, v] of SETUP) await set(id, v);
    await page.selectOption('#ssBenefitBasisA', 'pia');
    // The US rows can change in the deferred pass, so every read of rows flushes the render first.
    const read = (age) =>
      page.evaluate((age) => {
        window.__test_flushRender();
        return {
          ss: window.fireProjectionRows.find((r) => r.age === age).ss,
          note: document.getElementById('ssSurvivorNote').textContent,
          check: document.getElementById('ssSurvivorCheck').textContent,
          summary: document.getElementById('retireIncomeHealthGroupState').textContent,
        };
      }, age);
    const near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
    const unwidowed67 = (await read(67)).ss;
    assert.strictEqual(unwidowed67, 0, 'not widowed: nothing at 67 (own from 70)');
    assert(await shown('ssWidowedField'), 'single: the widowed switch is shown');
    assert(!(await shown('ssWidowedFields')), 'the group is hidden until the switch is on');

    await set('ssWidowed', true);
    assert(await shown('ssWidowedFields'), 'widowed: the group shows');
    await set('ssSurvivorMonthlyFra', 2000);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#ssSurvivorStartAge option').textContent), 'At full retirement age (67)', 'the first option names the age');
    let r = await read(67);
    assert(near(r.ss, 24000), `survivor at full retirement age: 24,000 at 67 (got ${r.ss})`);
    assert(near((await read(70)).ss, 37200), 'own benefit at 70, the higher: 37,200');
    assert(/survivor at FRA/.test(r.summary), 'the group summary names the survivor start: ' + r.summary);

    await page.selectOption('#ssSurvivorStartAge', '60');
    r = await read(60);
    assert(near(r.ss, 2000 * 12 * 0.715), `survivor at 60: 71.5% (got ${r.ss})`);
    assert.strictEqual(r.note, 'Starts at 60: $1,430 a month, 71.5% of your amount at full retirement age (67)', 'the note: ' + r.note);
    assert.strictEqual(r.check, "At 60 this is $1,430 a month: compare it with SSA's quote.", 'the check: ' + r.check);
    await set('ssSurvivorQuoteMonthly', 1600);
    assert(/widow’s limit: the survivor benefit is at most \$2,000 a month/.test((await read(60)).check), 'a quote above 71.5% shows the limit');
    await set('ssSurvivorQuoteMonthly', 1425);
    assert(/disagree/.test((await read(60)).check), 'a quote too low disagrees');
    await set('ssSurvivorQuoteMonthly', 0);

    // The earnings-test warning: wages until 66 with the survivor benefit from 60.
    await set('incomeA', 50000);
    await set('retireAgeA', 66);
    await page.evaluate(() => window.__test_flushRender());
    const flagged = await page.evaluate(() => [...document.querySelectorAll('#unusualAssumptionsList li')].some((li) => li.textContent.includes('Survivor benefit starts while working')));
    assert(flagged, 'the survivor start before retirement and full retirement age is flagged');
    await set('incomeA', 0);
    await set('retireAgeA', 59);

    // Back to "at full retirement age": the null start survives the autosave and a reload.
    await page.selectOption('#ssSurvivorStartAge', '');
    assert.strictEqual(await page.evaluate(() => window.__test_getState().ssSurvivorStartAge), null, 'the first option stores null');
    await page.reload();
    await page.waitForFunction(() => Array.isArray(window.fireProjectionRows) && window.fireProjectionRows.length > 0);
    assert.deepStrictEqual(
      await page.evaluate(() => [window.__test_getState().ssSurvivorStartAge, window.__test_getState().ssWidowed, document.getElementById('ssSurvivorStartAge').value]),
      [null, true, ''],
      'after a reload: still widowed, start at full retirement age',
    );

    // Off again: the rows are the unwidowed plan's.
    await set('ssWidowed', false);
    assert.strictEqual((await read(67)).ss, unwidowed67, 'not widowed again: the rows go back');
    assert.strictEqual((await read(67)).note, '', 'not widowed: no note');

    // MCP: the switch and the amount are written.
    await page.evaluate(() => window.__tools.find((t) => t.name === 'update_fire_assumptions').execute({ ssWidowed: true, ssSurvivorMonthlyFra: 1800 }));
    assert.deepStrictEqual(await page.evaluate(() => [window.__test_getState().ssWidowed, window.__test_getState().ssSurvivorMonthlyFra]), [true, 1800], 'MCP writes the widowed inputs');
    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join('; '));
    await page.close();

    // 390x844 with the group open: no horizontal overflow.
    const m = await open(browser, { width: 390, height: 844 });
    for (const [id, v] of SETUP) await m.set(id, v);
    await m.set('ssWidowed', true);
    await m.page.evaluate(() => {
      document.getElementById('workspace').setAttribute('data-mobile-view', 'inputs');
      document.getElementById('ssWidowed').closest('details.group').open = true;
    });
    assert(await m.page.isVisible('#ssSurvivorStartAge'), 'mobile: the select is shown');
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflow, false, 'mobile: no horizontal overflow');
    assert.deepStrictEqual(m.errors, [], 'mobile: no page errors: ' + m.errors.join('; '));
    console.log('test_ss_survivor: all checks passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})();
