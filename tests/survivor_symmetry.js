// Survivor-period symmetry. With two identical partners, which one dies first
// must not change anything afterward: same tax, same income, same balances.
// A regression guard for survivor income being dropped from the tax profile when
// Partner A is the one who dies (Canada: B's CPP/OAS/pension/RRIF were never
// taxed and B's OAS clawback skipped; both planners: household extra-income
// streams, which ride on Partner A's slot, vanished from the profile).

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

async function run(browser, planner, isUS) {
  const file = path.resolve(__dirname, '..', planner);
  const rowsFor = async (deceased) => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + file);
    await page.waitForTimeout(250);
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
    const fields = [
      ['singlePerson', false],
      ['ageA', 62],
      ['ageB', 62],
      ['retireAgeA', 62],
      ['retireAgeB', 62],
      ['lifeExpectancyA', 90],
      ['lifeExpectancyB', 90],
      ['incomeA', 0],
      ['incomeB', 0],
      ['spending', 60000],
      ['taxable', 400000],
      ['traditional', 600000],
      ['roth', 100000],
      ['cash', 30000],
      ['inflation', 0],
      ['dividendYield', 0],
      ['pensionYearlyA', 30000],
      ['pensionYearlyB', 30000],
      ['pensionStartAgeA', 62],
      ['pensionStartAgeB', 62],
      ['survivorEnabled', true],
      ['survivorDeathAge', 75],
      ['survivorSpendingPct', 70],
      ['ltcEnabled', false],
      ['healthcare', 0],
    ];
    if (isUS)
      fields.push(['ssMonthlyA', 2500], ['ssMonthlyB', 2500], ['ssStartAgeA', 67], ['ssStartAgeB', 67], ['stateTax', 'tx'], ['acaEnabled', false]);
    else
      fields.push(
        ['cppMonthlyA', 1200],
        ['cppMonthlyB', 1200],
        ['cppStartAgeA', 65],
        ['cppStartAgeB', 65],
        ['oasMonthlyA', 800],
        ['oasMonthlyB', 800],
        ['oasStartAgeA', 65],
        ['oasStartAgeB', 65],
      );
    for (const [id, v] of translateFieldList(fields, isUS)) await set(id, v);
    await page.click('#pensionBothBtn');
    await set('survivorPartner', deceased);
    // A household income stream (it lives in Partner A's slot in the engines).
    await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => (d.open = true)));
    await page.click('[data-dyn-add="incomeSources"]');
    await page.fill('#incSrc0Amount', '15000');
    await page.fill('#incSrc0StartAge', '62');
    await page.fill('#incSrc0EndAge', '90');
    await page.waitForTimeout(400);
    const rows = await page.evaluate(() => window.fireProjectionRows.map((r) => ({ ...r })));
    assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
    await page.close();
    return rows;
  };
  const a = await rowsFor('A'),
    b = await rowsFor('B');
  assert.strictEqual(a.length, b.length);
  const diffs = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i].age < 75) {
      // Before the death year nothing differs by construction.
      if (Math.abs(a[i].tax - b[i].tax) > 0.01) diffs.push(`age ${a[i].age} (pre-death): tax ${a[i].tax} vs ${b[i].tax}`);
      continue;
    }
    for (const key of ['tax', 'income', 'investable']) {
      if (Math.abs(a[i][key] - b[i][key]) > 0.01)
        diffs.push(`age ${a[i].age}: ${key} when A dies = ${a[i][key].toFixed(2)}, when B dies = ${b[i][key].toFixed(2)}`);
    }
  }
  assert.deepStrictEqual(diffs.slice(0, 6), [], `${planner}: survivor outcome depends on who dies:\n${diffs.slice(0, 6).join('\n')}`);
  console.log(`[${isUS ? 'US' : 'Canada'}] survivor symmetry test passed (${a.length} years, A-dies == B-dies)`);
}

(async () => {
  const browser = await chromium.launch();
  await run(browser, 'Planner_US.html', true);
  await run(browser, 'Planner_Canada.html', false);
  await browser.close();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
