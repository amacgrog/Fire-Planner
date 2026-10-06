// Spouse, eligible-dependant and child amounts in the engine (Batch 7N, N3).
//
// Year-0 row tax of a working single parent with one child under 18 against the same person without the child:
// the federal eligible-dependant amount (the BPA variant, 16,452 below the 29% bracket, less the child's income of 0)
// at 14% and Ontario's 11,029 at 5.05% (CRA TD1ON 2026). The couple claims (spouse amount, child amount) are pinned at
// function level in tests/tax_brackets.js and the survivor case in tests/survivor_symmetry.js.
//
// Run: node tests/dependant_amounts.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    const st = window.__test_getState();
    const run = (patch) => {
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, { province: 'on', ageA: 40, ageB: 40, retireAgeA: 65, retireAgeB: 65, inflation: 0, taxable: 0, traditional: 0, roth: 0, bondYears: 0, cash: 50000, incomeGrowth: 0, healthPremiumA: 0, healthPremiumB: 0 }, patch);
      const row = window.__test_simulate().rows[0];
      for (const k of Object.keys(saved)) st[k] = saved[k];
      return row;
    };
    const year = new Date().getFullYear();
    const single = { singlePerson: true, incomeA: 50000 };
    const kid = [{ birthYear: year - 5, student: false }];
    return {
      noKid: run(single).tax,
      kid: run({ ...single, children: kid }).tax,
      adultKid: run({ ...single, children: [{ birthYear: year - 30, student: false }] }).tax,
    };
  });
  const credit = 0.14 * 16452 + 0.0505 * 11029;
  // The child also triggers the Canada Child Benefit and the Ontario Child Benefit, which row.tax adds back (gross tax).
  assert(Math.abs(out.noKid - out.kid - credit) < 0.01, `single parent: tax ${out.noKid.toFixed(2)} -> ${out.kid.toFixed(2)}, expected a fall of ${credit.toFixed(2)}`);
  assert(Math.abs(out.noKid - out.adultKid) < 1e-9, 'a 30-year-old child is not an eligible dependant');
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log(`[Canada] dependant amounts engine test passed (single parent tax ${out.noKid.toFixed(0)} -> ${out.kid.toFixed(0)})`);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
