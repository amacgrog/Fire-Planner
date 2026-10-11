// OAS in the survivor period (Batch 7N, N9). OAS is never inherited: the survivor keeps their OWN OAS (own monthly input, own start
// age, own 75-plus step), where the old model gave a survivor aged 65 or more the greater of the two partners' OAS. CPP keeps the
// greater-of simplification (the CPP survivor pension is Batch 6).
//
// Run: node tests/survivor_oas.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    const t = window.__test_tax;
    const st = window.__test_getState();
    Object.assign(st, { oasMonthlyA: 700, oasMonthlyB: 400, oasStartAgeA: 65, oasStartAgeB: 65, cppMonthlyA: 1000, cppMonthlyB: 600, cppStartAgeA: 65, cppStartAgeB: 65 });
    const base = { singlePerson: false, factor: 1, isSurvivorPeriod: true };
    const res = {};
    // B dies: the survivor A (70) keeps A's own OAS (700) and the greater CPP (A's 1,000).
    res.bDies = t.cppAndOasIncome({ ...base, age: 70, ageB: 68, deceasedIsA: false });
    // A dies: the survivor B (68) keeps B's own OAS (400), not A's 700; the CPP is the greater of the two (A's 1,000).
    res.aDies = t.cppAndOasIncome({ ...base, age: 70, ageB: 68, deceasedIsA: true });
    // The survivor is 75 or over: own 75-plus step (x 1.10).
    res.aDies75 = t.cppAndOasIncome({ ...base, age: 82, ageB: 76, deceasedIsA: true });
    // The survivor is under their own start age: no OAS at all, whatever the deceased received.
    st.oasStartAgeB = 67;
    res.beforeStart = t.cppAndOasIncome({ ...base, age: 70, ageB: 64, deceasedIsA: true });
    st.oasStartAgeB = 65;
    // Equal inputs: the survivor's own equals the old greater-of.
    st.oasMonthlyB = 700;
    res.equal = t.cppAndOasIncome({ ...base, age: 70, ageB: 68, deceasedIsA: true });
    return res;
  });
  const f = (age) => (age >= 75 ? 1.1 : 1);
  near(out.bDies.oasGrossA, 700 * 12, 1e-9, 'B dies: the survivor A keeps their own OAS');
  near(out.bDies.oasGrossB, 0, 1e-9, 'B dies: the deceased has none');
  near(out.bDies.cppA, 1000 * 12, 1e-9, 'B dies: CPP is the greater of the two');
  near(out.aDies.oasGrossB, 400 * 12, 1e-9, 'A dies: the survivor B keeps their own 400, not the 700');
  near(out.aDies.oasGrossA, 0, 1e-9, 'A dies: the deceased has none');
  near(out.aDies.cppB, 1000 * 12, 1e-9, 'A dies: CPP is the greater of the two');
  near(out.aDies75.oasGrossB, 400 * 12 * f(76), 1e-6, 'the survivor aged 76 gets their own 75-plus step');
  near(out.beforeStart.oasGrossB, 0, 1e-9, 'the survivor before their own OAS start age gets none');
  near(out.equal.oasGrossB, 700 * 12, 1e-9, 'equal inputs: the same amount as before');
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('[Canada] survivor OAS test passed (own OAS, 75-plus step, start age, equal inputs)');
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
