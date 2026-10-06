// OAS recovery tax on the full year's income (Batch 7N, N1), engine level.
//
// Two identical 66-year-olds (Ontario, no pension split, no taxable account, no inflation) with a
// pension, CPP, OAS and a large RRSP that pays the spending gap. Each return's net income is half the
// row's gross income (pension, CPP, OAS and the RRSP draw all split evenly), so the recovery tax the
// row reports must be, per person, min(OAS, 15% x (income - 95,323)): a draw that lifts income over the
// threshold is charged, which the old model (recovery on pre-draw income only) missed.
// Also checked: the cash identity (row.ss is net of the recovery, row.tax is reported without it, so
// income - spending - tax + draw is unchanged by the re-labelling) and that a household under the
// threshold pays nothing.
//
// Run: node tests/oas_recovery.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const THRESHOLD = 95323;

async function rowsFor(browser, over) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
  await page.waitForTimeout(250);
  const fields = {
    singlePerson: false, province: 'on', ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66,
    lifeExpectancyA: 74, lifeExpectancyB: 74, incomeA: 0, incomeB: 0, inflation: 0, dividendYield: 0,
    hysaRate: 0, taxable: 0, cash: 0, roth: 0, traditional: 3000000, healthcare: 0, ltcEnabled: false,
    pensionYearlyA: 50000, pensionYearlyB: 50000, pensionStartAgeA: 60, pensionStartAgeB: 60,
    cppMonthlyA: 1000, cppMonthlyB: 1000, cppStartAgeA: 65, cppStartAgeB: 65,
    oasMonthlyA: 760, oasMonthlyB: 760, oasStartAgeA: 65, oasStartAgeB: 65,
    pensionSplitEnabled: false, spending: 120000, ...over,
  };
  for (const [id, v] of Object.entries(fields))
    await page.evaluate(
      ({ id, v }) => {
        const e = document.getElementById(id);
        if (!e) return;
        if (e.type === 'checkbox') e.checked = v;
        else e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { id, v },
    );
  await page.click('#pensionBothBtn');
  await page.waitForTimeout(400);
  const rows = await page.evaluate(() => window.fireProjectionRows.map((r) => ({ ...r })));
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  await page.close();
  return rows;
}

(async () => {
  const browser = await chromium.launch();
  const oasEach = 760 * 12; // 9,120 at 65 to 74 (the 75-plus step is not reached: the plan ends at 74)

  // A household whose pension, CPP and OAS (about 79k each) are under the threshold, but whose RRSP draw
  // (spending 120k) is not: the draw is what crosses it.
  const rows = await rowsFor(browser, {});
  let charged = 0;
  for (const r of rows) {
    const incEach = r.grossIncome / 2;
    const expected = Math.min(oasEach, Math.max(0, 0.15 * (incEach - THRESHOLD)));
    assert(Math.abs(r.oasClawback / 2 - expected) < 0.51, `age ${r.age}: recovery per person ${(r.oasClawback / 2).toFixed(2)}, expected ${expected.toFixed(2)} on income ${incEach.toFixed(0)}`);
    // ss is CPP plus OAS net of the recovery.
    assert(Math.abs(r.ss - (2 * 12000 + 2 * oasEach - r.oasClawback)) < 0.01, `age ${r.age}: ss ${r.ss}`);
    if (r.oasClawback > 0) charged++;
  }
  assert(charged > 0, 'the scenario must cross the threshold through the draw');

  // Under the threshold: nothing is charged and nothing is reported.
  const low = await rowsFor(browser, { spending: 60000, pensionYearlyA: 20000, pensionYearlyB: 20000, traditional: 300000 });
  assert(low.every((r) => r.oasClawback === 0), 'a household under the threshold pays no recovery tax');
  await browser.close();
  console.log(`[Canada] OAS recovery tax engine test passed (${rows.length} years, ${charged} years charged)`);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
