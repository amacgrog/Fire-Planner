// SS claiming optimizer PR 1 (US): the Social Security basis choice. An amount entered at full retirement age is adjusted for the
// start age (70% at 62 for anyone born 1960 or later), a start age already past is a claim now unless the "already collecting"
// box is ticked, and the check line under the choice says what is paid. Checks that the projection rows move with the choice (not
// only the select), the guided-entry panel, the MCP tool, then the 390x844 layout.
// Run: node test_ss_basis.js

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
  // A single retiree at 62 (born 1964, full retirement age 67) with 2,000 a month of Social Security from 62.
  for (const [id, v] of [['singlePerson', true], ['ageA', 62], ['retireAgeA', 62], ['lifeExpectancyA', 90], ['ssMonthlyA', 2000], ['ssStartAgeA', 62]]) await set(id, v);
  return { page, errors, set };
}
const mcp = (page, input, keys) =>
  page.evaluate(async ({ input, keys }) => {
    await window.__tools.find((t) => t.name === 'update_fire_assumptions').execute(input);
    const s = window.__test_getState();
    return keys.map((k) => s[k]);
  }, { input, keys });

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  try {
    const { page, errors, set } = await open(browser, { width: 1280, height: 900 });
    // The US rows can change in the deferred pass, so every read of rows flushes the render first.
    const read = (age) =>
      page.evaluate((age) => {
        window.__test_flushRender();
        return {
          ss: window.fireProjectionRows.find((r) => r.age === age).ss,
          note: document.getElementById('ssBasisNoteA').textContent,
          collectingShown: !document.getElementById('ssCollectingAField').hidden && document.getElementById('ssCollectingAField').offsetParent !== null,
          noteBShown: document.getElementById('ssBasisNoteB').offsetParent !== null,
          summary: document.getElementById('retireIncomeHealthGroupState').textContent,
        };
      }, age);
    const near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));

    let r = await read(62);
    const asEntered = r.ss;
    assert(asEntered > 0, 'the start-age basis pays from 62');
    assert.strictEqual(r.note, '', 'start-age basis: no check line');
    assert(r.collectingShown, 'the collecting box is shown in the start-age basis too');
    assert(!r.noteBShown, 'single: Partner B\'s line takes no room');
    await set('ssCollectingA', true);
    assert.strictEqual((await read(62)).ss, asEntered, 'start-age basis: the collecting box changes no figure');
    await set('ssCollectingA', false);

    await page.selectOption('#ssBenefitBasisA', 'pia');
    r = await read(62);
    assert(near(r.ss, asEntered * 0.7), `full retirement age basis: 70% at 62 (got ${r.ss} of ${asEntered})`);
    assert.strictEqual(r.note, 'Paid from 62: $1,400 a month, 70% of your amount at full retirement age (67)', 'the check line at 62: ' + r.note);
    assert(/\(FRA amounts\)/.test(r.summary), 'the group summary says FRA amounts: ' + r.summary);

    // 65 with a start age of 62, not collecting: a claim now, at the factor of 65 (24 months early: 86.7%).
    await set('ageA', 65);
    await set('retireAgeA', 65);
    r = await read(65);
    assert(near(r.ss, asEntered * (3120 / 3600)), `claims now at 65 (got ${r.ss})`);
    assert(/^Claims now, at 65: .* 86\.7% of/.test(r.note), 'the claims-now line: ' + r.note);
    await set('ssCollectingA', true);
    r = await read(65);
    assert(near(r.ss, asEntered * 0.7), `collecting since 62: the factor of 62 (got ${r.ss})`);
    assert(/^Collecting since 62: .* 70% of/.test(r.note), 'the collecting line: ' + r.note);

    // Back to the start-age basis: paid as entered, no line.
    await page.selectOption('#ssBenefitBasisA', 'atClaim');
    r = await read(65);
    assert.strictEqual(r.ss, asEntered, 'start-age basis again: paid as entered');
    assert.strictEqual(r.note, '', 'start-age basis again: no line');

    // The guided-entry panel opens and links to SSA's Quick Calculator.
    await page.click('#ssGuide summary');
    assert(await page.isVisible('#ssGuide a[href="https://www.ssa.gov/OACT/quickcalc/"]'), 'the guide links to the Quick Calculator');

    // MCP: a basis on the list is written; one off the list is ignored.
    const keys = ['ssBenefitBasisA', 'ssCollectingA'];
    assert.deepStrictEqual(await mcp(page, { ssBenefitBasisA: 'pia', ssCollectingA: false }, keys), ['pia', false], 'MCP writes the basis and the box');
    assert.deepStrictEqual(await mcp(page, { ssBenefitBasisA: 'x' }, keys), ['pia', false], 'MCP ignores a basis off the list');

    // SS PR 5: a married couple of 62 (both born 1964), A 3,000 and B 1,000 at full retirement age: B's line adds the spousal
    // excess (1,500 - 1,000 = 500 a month) from the later of the two start ages.
    const noteB = () => page.evaluate(() => { window.__test_flushRender(); return document.getElementById('ssBasisNoteB').textContent; });
    for (const [id, v] of [['singlePerson', false], ['ageA', 62], ['retireAgeA', 62], ['ageB', 62], ['retireAgeB', 62], ['ssCollectingA', false], ['ssMonthlyA', 3000], ['ssMonthlyB', 1000], ['ssStartAgeA', 67], ['ssStartAgeB', 62]]) await set(id, v);
    await page.selectOption('#ssBenefitBasisA', 'pia');
    await page.selectOption('#ssBenefitBasisB', 'pia');
    assert.strictEqual(await noteB(), 'Paid from 62: $700 a month, 70% of your amount at full retirement age (67). Plus $500 a month as a spouse from 67 (half of Partner A\'s amount less your own, unreduced).', 'the spousal line, worker later');
    await set('ssStartAgeA', 62);
    await set('ssStartAgeB', 64);
    assert.strictEqual(await noteB(), 'Starts at 64: $800 a month, 80% of your amount at full retirement age (67). Plus $375 a month as a spouse from 64 (half of Partner A\'s amount less your own, reduced for 64).', 'the spousal line, reduced');
    await set('ssMonthlyB', 0);
    await page.selectOption('#ssBenefitBasisB', 'atClaim');
    assert.strictEqual(await noteB(), 'Spousal benefit from 64: $1,125 a month (half of Partner A\'s amount, reduced for 64).', 'no own benefit: the spousal line alone');
    await set('ssMonthlyB', 1000);
    assert.strictEqual(await noteB(), 'Enter this amount at full retirement age too to include any spousal benefit on Partner A\'s record.', 'the hint for an amount as paid at the start age');
    await page.selectOption('#ssBenefitBasisA', 'atClaim');
    assert.strictEqual(await noteB(), '', 'both as paid at the start age: no line');
    await set('ssMonthlyB', 0);
    assert.strictEqual(await noteB(), 'Enter Partner A\'s amount at full retirement age to include a spousal benefit on their record.', 'no own benefit beside a start-age amount: the hint');
    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join('; '));
    await page.close();

    // 390x844 with the basis switched and the guide open: no horizontal overflow.
    const m = await open(browser, { width: 390, height: 844 });
    await m.page.selectOption('#ssBenefitBasisA', 'pia');
    await m.page.evaluate(() => {
      document.getElementById('workspace').setAttribute('data-mobile-view', 'inputs');
      document.getElementById('ssBenefitBasisA').closest('details.group').open = true;
      document.getElementById('ssGuide').open = true;
    });
    assert(await m.page.isVisible('#ssBenefitBasisA'), 'mobile: the choice is shown');
    assert(await m.page.isVisible('#ssGuide ol'), 'mobile: the guide is shown');
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflow, false, 'mobile: no horizontal overflow');
    assert.deepStrictEqual(m.errors, [], 'mobile: no page errors: ' + m.errors.join('; '));
    console.log('test_ss_basis: all checks passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})();
