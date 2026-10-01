// RMD start age depends on birth year (SECURE 2.0): 73 for 1951-1959, 75 for
// 1960 or later. Birth year is estimated from today's age, so the test pins
// "today" with window.__test_setCurrentYear. Scenario: single retiree, $1M
// traditional, 0% return, so each year's RMD is last year's ending balance
// divided by the Uniform Lifetime divisor (73: 26.5, 74: 25.5, 75: 24.6).

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

async function rows(year, ageA, extra = []) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  await page.evaluate((y) => window.__test_setCurrentYear(y), year);
  const set = (id, v) =>
    page.evaluate(
      ({ id, v }) => {
        const el = document.getElementById(id);
        if (el.type === 'checkbox') el.checked = v;
        else el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { id, v },
    );
  const base = [
    ['singlePerson', true], ['ageA', ageA], ['retireAgeA', 60], ['lifeExpectancyA', 80],
    ['spending', 1000], ['healthcare', 0], ['medicareYearly', 0], ['ltcEnabled', false],
    ['acaEnabled', false], ['inflation', 0], ['returnRate', 0], ['bondReturn', 0],
    ['hysaRate', 0], ['dividendYield', 0], ['stateTax', 'tx'], ['ssMonthlyA', 0],
  ];
  for (const [i, v] of base.concat(extra)) await set(i, v);
  await page.evaluate(() => document.getElementById('rentBtn').click());
  for (const [i, v] of [['rent', 0], ['taxable', 0], ['cash', 0], ['roth', 0], ['bondYears', 0], ['traditional', 1000000]])
    await set(i, v);
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => window.fireProjectionRows.map((r) => ({ age: r.age, rmd: r.rmd, trad: r.traditional })));
  await browser.close();
  assert.deepStrictEqual(errors, [], `page errors ${errors}`);
  return out;
}
const at = (r, age) => r.find((x) => x.age === age);
const near = (a, e, label) => assert(Math.abs(a - e) < 0.01, `${label}: expected ${e}, got ${a}`);

(async () => {
  // Age 67 in 2026 -> born 1959 -> RMDs start at 73.
  let r = await rows(2026, 67);
  near(at(r, 72).rmd, 0, 'born 1959: no RMD at 72');
  near(at(r, 73).rmd, at(r, 72).trad / 26.5, 'born 1959: first RMD at 73 uses divisor 26.5');
  near(at(r, 74).rmd, at(r, 73).trad / 25.5, 'born 1959: RMD at 74 uses divisor 25.5');

  // Age 66 in 2026 -> born 1960 -> RMDs start at 75.
  r = await rows(2026, 66);
  near(at(r, 73).rmd, 0, 'born 1960: no RMD at 73');
  near(at(r, 74).rmd, 0, 'born 1960: no RMD at 74');
  near(at(r, 75).rmd, at(r, 74).trad / 24.6, 'born 1960: first RMD at 75 uses divisor 24.6');

  // Same age one year later is a 1960 birth: the start age moves to 75.
  r = await rows(2027, 67);
  near(at(r, 73).rmd, 0, 'age 67 in 2027 (born 1960): no RMD at 73');
  assert(at(r, 75).rmd > 0, 'age 67 in 2027 (born 1960): RMD at 75');
  console.log('[US] RMD start-age tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
