// Hand-computed cases for the Canada income-tested benefits (7L). Cite the page, table row or statute section.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, b, tol, label) => assert(Math.abs(a - b) <= tol, `${label}: expected ${b}, got ${a}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const t = (fn, ...args) => page.evaluate(({ fn, args }) => window.__test_tax[fn](...args), { fn, args });

  // --- OAS: the 75-plus step (ESDC: 838.75 / 762.50 = 1.10 since July 2022) ---
  near(await t('oasAgeFactor', 64), 1, 0, 'factor at 64');
  near(await t('oasAgeFactor', 74), 1, 0, 'factor at 74');
  near(await t('oasAgeFactor', 75), 1.1, 1e-12, 'factor at 75');
  near(await t('oasAgeFactor', 95), 1.1, 1e-12, 'factor at 95');
  // The default is the 2026 maximum, 762.50 a month at 65 to 74.
  const def = await page.evaluate(() => [window.__test_getState().oasMonthlyA, window.__test_getState().oasMonthlyB]);
  near(def[0], 762.5, 0, 'default OAS A');
  near(def[1], 762.5, 0, 'default OAS B');

  // cppAndOasIncome: by actual age, gated by the start age, scaled by the inflation factor, 0 means none.
  const oas = (over) => page.evaluate((over) => {
    const s = window.__test_getState();
    const saved = { oasMonthlyA: s.oasMonthlyA, oasMonthlyB: s.oasMonthlyB, oasStartAgeA: s.oasStartAgeA, oasStartAgeB: s.oasStartAgeB };
    Object.assign(s, over.state);
    const r = window.__test_tax.cppAndOasIncome({ age: over.age, ageB: over.ageB, singlePerson: false, factor: over.factor || 1, isSurvivorPeriod: false, deceasedIsA: false });
    Object.assign(s, saved);
    return r;
  }, over);
  let r = await oas({ age: 66, ageB: 76, state: { oasMonthlyA: 762.5, oasMonthlyB: 762.5, oasStartAgeA: 65, oasStartAgeB: 65 } });
  near(r.oasGrossA, 762.5 * 12, 1e-9, 'A at 66: 762.50 x 12 = 9,150');
  near(r.oasGrossB, 762.5 * 12 * 1.1, 1e-9, 'B at 76: 9,150 x 1.10 = 10,065');
  r = await oas({ age: 66, ageB: 66, state: { oasMonthlyA: 762.5, oasMonthlyB: 762.5, oasStartAgeA: 70, oasStartAgeB: 65 } });
  near(r.oasGrossA, 0, 0, 'A deferring to 70 gets nothing at 66');
  near(r.oasGrossB, 9150, 1e-9, 'B starting at 65 gets 9,150 at 66');
  r = await oas({ age: 80, ageB: 80, state: { oasMonthlyA: 0, oasMonthlyB: 0, oasStartAgeA: 65, oasStartAgeB: 65 } });
  near(r.oasGrossA + r.oasGrossB, 0, 0, 'an OAS input of 0 means no OAS');
  r = await oas({ age: 80, ageB: 80, factor: 1.5, state: { oasMonthlyA: 700, oasMonthlyB: 0, oasStartAgeA: 65, oasStartAgeB: 65 } });
  near(r.oasGrossA, 700 * 12 * 1.1 * 1.5, 1e-9, 'inflation factor and 75-plus step compose');

  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('benefits tests ok');
})();
