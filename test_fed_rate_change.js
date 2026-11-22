// Feedback C2 (US): the federal income-tax rate what-if. Checks the defaults, the "Rates rise 20% from 2030" button, that the
// projection rows move from 2030 on (not only the boxes) and not before, the gains box, that the same button then removes the
// change (an undo entry), the percent's clamp, the group summary, the MCP limits, then the 390x844 layout.
// Run: node test_fed_rate_change.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const fileFor = (planner) => 'file://' + path.resolve(__dirname, 'dist', planner);

// A retired couple at 62 in 2026 (MFJ, Texas) with a 60,000 pension each and spending above them, so each year realizes taxable
// gains and qualified dividends over the 0% band. Conversions and the cliff plan off, so a year's tax depends on that year alone.
const HOUSEHOLD = {
  singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62,
  lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 0, incomeB: 0, spending: 160000, taxable: 1500000, cash: 100000,
  pensionCoverage: 'both', pensionYearlyA: 60000, pensionYearlyB: 60000, pensionStartAgeA: 62, pensionStartAgeB: 62,
  ssMonthlyA: 0, ssMonthlyB: 0, stateTax: 'tx', acaEnabled: false, survivorEnabled: false, rothConvEnabled: false,
  cliffGuardEnabled: false, withdrawalMixEnabled: false,
};

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
  await page.evaluate((patch) => {
    window.__test_replaceState({ ...JSON.parse(JSON.stringify(window.__test_getState())), ...patch });
    window.__test_syncControls();
    document.getElementById('themeToggleBtn').click(); // a full render
  }, HOUSEHOLD);
  return { page, errors };
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
    const read = () =>
      page.evaluate(() => {
        window.__test_flushRender();
        const tax = (cal) => window.fireProjectionRows.find((r) => r.year === cal - 2026).tax;
        return {
          pct: document.getElementById('fedRateChangePct').value,
          year: document.getElementById('fedRateChangeYear').value,
          gains: document.getElementById('fedRateChangeGains').checked,
          note: document.getElementById('fedRateChangeNote').textContent,
          btn: document.getElementById('fedRateChangeBtn').textContent,
          summary: document.getElementById('taxFilingGroupState').textContent,
          tax2029: tax(2029), tax2031: tax(2031),
        };
      });

    const before = await read();
    assert.strictEqual(before.pct, '0', 'the change is 0 by default');
    assert.strictEqual(before.year, '2030', 'the start year is 2030 by default');
    assert.strictEqual(before.gains, true, 'the gains box is ticked by default');
    assert(/20% higher from 2030/.test(before.note) && /not a forecast/.test(before.note), 'the note names the preset: ' + before.note);
    assert.strictEqual(before.btn, 'Rates rise 20% from 2030', 'no change: the button applies the preset');
    assert.strictEqual(before.summary, '', 'no change: the group summary is empty');
    assert(before.tax2029 > 0 && before.tax2031 > 0, 'the household pays federal tax in 2029 and 2031');

    // The button sets 20% from 2030: the 2031 row's tax rises, the 2029 row's does not.
    await page.click('#fedRateChangeBtn');
    let r = await read();
    assert.strictEqual(r.pct, '20', 'the button sets 20%');
    assert.strictEqual(r.year, '2030', 'the button sets 2030');
    assert.strictEqual(r.tax2029, before.tax2029, '2029 keeps today\'s rates');
    assert(r.tax2031 > before.tax2031 * 1.1, `2031 is taxed at the higher rates (got ${r.tax2031}, before ${before.tax2031})`);
    assert.strictEqual(r.btn, 'Remove the rate change', 'with a change on, the button removes it');
    assert(/back to 0/.test(r.note), 'with a change on, the note says it goes back to 0: ' + r.note);
    assert.strictEqual(r.summary, 'Federal rates +20% from 2030', 'the group summary names the change: ' + r.summary);
    const withGains = r.tax2031;

    // The gains box clear: the 2031 tax falls (the gains and dividends back at 15%) but stays above today's.
    await page.click('#fedRateChangeGains');
    r = await read();
    assert.strictEqual(r.gains, false, 'the box is clear');
    assert(r.tax2031 < withGains && r.tax2031 > before.tax2031, `without gains: between (${before.tax2031} < ${r.tax2031} < ${withGains})`);
    assert.strictEqual(r.summary, 'Federal rates +20% from 2030, not gains', 'the summary says the gains are left out: ' + r.summary);
    await page.click('#fedRateChangeGains');

    // The same button takes the change off: 0%, today's rows, an undo entry.
    await page.click('#fedRateChangeBtn');
    r = await read();
    assert.strictEqual(r.pct, '0', 'Remove sets 0%');
    assert.strictEqual(r.year, '2030', 'Remove leaves the start year');
    assert.strictEqual(r.tax2031, before.tax2031, 'removed: 2031 at today\'s rates');
    assert.strictEqual(r.btn, 'Rates rise 20% from 2030', 'removed: the button applies the preset again');
    const t = await page.evaluate(() => ({ hidden: document.getElementById('undoToast').hidden, text: document.getElementById('undoToastText').textContent }));
    assert(!t.hidden && /Removed the federal rate change/.test(t.text), 'Remove takes an undo entry: ' + JSON.stringify(t));

    // A typed cut turns the button into Remove, and the tax falls; 150 is clamped to 50, -80 to -50.
    await page.fill('#fedRateChangePct', '-20');
    r = await read();
    assert.strictEqual(r.btn, 'Remove the rate change', 'a typed -20: the button removes it');
    assert(r.tax2031 < before.tax2031, 'a cut lowers the 2031 tax');
    assert.strictEqual(r.summary, 'Federal rates -20% from 2030', 'the summary writes the sign: ' + r.summary);
    await page.fill('#fedRateChangePct', '150');
    r = await read();
    assert.strictEqual(r.pct, '50', 'a typed 150 reads 50, got ' + r.pct);
    await page.fill('#fedRateChangePct', '-80');
    r = await read();
    assert.strictEqual(r.pct, '-50', 'a typed -80 reads -50, got ' + r.pct);
    // The start year is rounded up once the box is left; an emptied box is the default 2030.
    await page.fill('#fedRateChangeYear', '2031.4');
    await page.locator('#fedRateChangeYear').blur();
    r = await read();
    assert.strictEqual(r.year, '2032', 'a typed 2031.4 reads 2032 after change, got ' + r.year);
    await page.fill('#fedRateChangeYear', '');
    await page.locator('#fedRateChangeYear').blur();
    r = await read();
    assert.strictEqual(r.year, '2030', 'an emptied year reads 2030 after change, got ' + r.year);

    // MCP: the percent is limited to -50 to 50; the box is a boolean.
    const keys = ['fedRateChangePct', 'fedRateChangeYear', 'fedRateChangeGains'];
    assert.deepStrictEqual(await mcp(page, { fedRateChangePct: 30, fedRateChangeYear: 2035, fedRateChangeGains: false }, keys), [30, 2035, false], 'MCP: 30% from 2035 without gains is accepted');
    assert.deepStrictEqual(await mcp(page, { fedRateChangePct: 120 }, keys), [30, 2035, false], 'MCP: 120 is outside -50 to 50 and ignored');
    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join('; '));
    await page.close();

    // 390x844 with the change on: no horizontal overflow, the button shown.
    const m = await open(browser, { width: 390, height: 844 });
    await m.page.evaluate(() => {
      const e = document.getElementById('fedRateChangePct');
      e.value = '20';
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('workspace').setAttribute('data-mobile-view', 'inputs');
      document.getElementById('taxFilingGroup').open = true;
    });
    assert(await m.page.isVisible('#fedRateChangeBtn'), 'mobile: the button is shown');
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflow, false, 'mobile 390x844: no horizontal overflow');
    assert.deepStrictEqual(m.errors, [], 'mobile: no page errors: ' + m.errors.join('; '));
    await m.page.close();
    console.log('Federal rate change checks passed.');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
