// Every row of ESDC GIS tables 1 to 5 (October to December 2026) against the fitted knots in BENEFIT_RULES.gis.
// Table rows are monthly amounts for an income band; the knots are annual, so compare annual values at the band
// midpoint. Tolerance: 12 dollars a year (1 dollar a month) for tables 1 to 3; 30 for tables 4 and 5, whose bands
// alternate widths and so carry up to 28 dollars a year of rounding stair.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const tables = require('../docs/sources/gis-tables-2026q4.json');

const SERIES = [
  ['table1.gistotal', 'single', 12],
  ['table2.gistotal', 'spouseOas', 12],
  ['table3.gistotal', 'spouseNoOas', 12],
  ['table4.gistotal', 'couplePensioner', 30],
  ['table4.alwtotal', 'coupleAllowance', 30],
  ['table5.alwstotal', 'survivorAllowance', 30],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  for (const [key, situation, tol] of SERIES) {
    const rows = tables[key];
    const mids = rows.map((r) => (r[0] + r[1]) / 2);
    const got = await page.evaluate(({ situation, mids }) => mids.map((m) => window.__test_tax.gisAnnual(situation, m)), { situation, mids });
    let worst = 0;
    rows.forEach((r, i) => {
      const want = r[2] * 12,
        d = Math.abs(got[i] - want);
      worst = Math.max(worst, d);
      assert(d <= tol, `${key} income ${mids[i]}: table ${want.toFixed(2)} a year, formula ${got[i].toFixed(2)} (off by ${d.toFixed(2)}, tolerance ${tol})`);
    });
    console.log(`${key} (${situation}): ${rows.length} rows, worst difference ${worst.toFixed(2)} a year`);
  }
  // Scaling: amounts and income cutoffs move together with the factor.
  const [a, b] = await page.evaluate(() => [window.__test_tax.gisAnnual('single', 10000), window.__test_tax.gisAnnual('single', 11000, 1.1)]);
  assert(Math.abs(b - a * 1.1) < 1e-9, 'factor scaling: gisAnnual(income * f, f) must equal f * gisAnnual(income)');
  // Past the cutoff and at zero.
  const edge = await page.evaluate(() => [window.__test_tax.gisAnnual('single', 23112), window.__test_tax.gisAnnual('single', 1e9), window.__test_tax.gisAnnual('single', 0), window.__test_tax.gisAnnual('couplePensioner', 42767), window.__test_tax.gisAnnual('couplePensioner', 42768)]);
  assert.strictEqual(edge[0], 0, 'zero at the single cutoff');
  assert.strictEqual(edge[1], 0, 'zero far above the cutoff');
  assert(Math.abs(edge[2] - 13666.8) < 1e-9, 'maximum at zero income (1,138.90 a month, 12 times)');
  assert(edge[3] > 3000 && edge[4] === 0, 'table 4 ends at 42,768, where the younger spouse Allowance ends (benefitsFor continues on table 3: tests/benefits.js)');
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('gis tables ok');
})();
