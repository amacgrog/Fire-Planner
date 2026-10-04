// Medicare Part B/D + supplement (and IRMAA) start at max(65, the partner's
// retirement age): a partner who is not working at 65 enrolls at 65; one still
// working stays on the employer plan and enrolls the year they stop. No
// late-enrollment penalty is modeled. Rows are indexed by Partner A's age.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

const BASE = [
  ['inflation', 0],
  ['medicalInflation', 0],
  ['dividendYield', 0],
  ['stateTax', 'tx'],
  ['acaEnabled', false],
  ['ltcEnabled', false],
  ['healthcare', 0],
  ['medicareYearly', 6000],
  ['spending', 60000],
  ['taxable', 1500000],
  ['traditional', 500000],
  ['roth', 200000],
  ['cash', 50000],
];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function rowsFor(fields) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
    await page.waitForTimeout(200);
    for (const [id, v] of translateFieldList([...BASE, ...fields], true))
      await page.evaluate(
        ({ id, v }) => {
          const e = document.getElementById(id);
          if (e.type === 'checkbox') e.checked = v;
          else e.value = v;
          e.dispatchEvent(new Event('input', { bubbles: true }));
          e.dispatchEvent(new Event('change', { bubbles: true }));
        },
        { id, v },
      );
    await page.waitForTimeout(250);
    const rows = await page.evaluate(() => window.fireProjectionRows);
    await page.close();
    return rows;
  }
  const near = (a, b, msg) => assert(Math.abs(a - b) < 0.01, `${msg}: got ${a}, expected ${b}`);
  const at = (rows, age) => rows.find((r) => r.age === age);

  // 1. Retired before 65: Medicare from 65, unchanged from the old age-only rule.
  let rows = await rowsFor([['singlePerson', true], ['ageA', 62], ['retireAgeA', 62], ['lifeExpectancyA', 70]]);
  near(at(rows, 64).healthcare, 0, 'retired single, age 64');
  near(at(rows, 65).healthcare, 6000, 'retired single, age 65');

  // 2. Works to 68, single: nothing until 68, then full cost (income is under the first IRMAA tier).
  rows = await rowsFor([
    ['singlePerson', true], ['ageA', 64], ['retireAgeA', 68], ['lifeExpectancyA', 72], ['incomeA', 80000],
  ]);
  for (const age of [65, 66, 67]) {
    assert(at(rows, age).working, `precondition: working at ${age}`);
    near(at(rows, age).healthcare, 0, `working single, age ${age}`);
  }
  near(at(rows, 68).healthcare, 6000, 'single retired at 68, first retired year');

  // 3. One partner retired, one working: each follows their own date. Half the
  // household figure per partner.
  rows = await rowsFor([
    ['singlePerson', false], ['ageA', 66], ['ageB', 66], ['retireAgeA', 60], ['retireAgeB', 68],
    ['lifeExpectancyA', 72], ['lifeExpectancyB', 72], ['incomeB', 80000],
  ]);
  near(at(rows, 66).healthcare, 3000, 'A retired, B working at 66');
  near(at(rows, 67).healthcare, 3000, 'A retired, B working at 67');
  near(at(rows, 68).healthcare, 6000, 'both retired at 68');

  // 4. IRMAA only for partners on Medicare: no surcharge while working, and the
  // two-year lookback then charges it after retirement on the earlier wages.
  rows = await rowsFor([
    ['singlePerson', true], ['ageA', 66], ['retireAgeA', 70], ['lifeExpectancyA', 74],
    ['incomeA', 350000], ['medicareYearly', 5000],
  ]);
  for (const age of [66, 67, 68, 69]) near(at(rows, age).healthcare, 0, `no Medicare or IRMAA while working, age ${age}`);
  near(at(rows, 70).healthcare, 5000 + 529.6 * 12, 'first retired year: premium + IRMAA from wages two years back');

  // 5. Survivor: A (retired, on Medicare) dies at 67; B keeps working to 70.
  // B pays nothing until 70, and A's half drops out after death (the survivor's
  // half of the household figure, as before).
  rows = await rowsFor([
    ['singlePerson', false], ['ageA', 66], ['ageB', 66], ['retireAgeA', 60], ['retireAgeB', 70],
    ['lifeExpectancyA', 72], ['lifeExpectancyB', 72], ['incomeB', 80000],
    ['survivorEnabled', true], ['survivorPartner', 'A'], ['survivorDeathAge', 67],
  ]);
  near(at(rows, 66).healthcare, 3000, 'before death: only A on Medicare');
  near(at(rows, 68).healthcare, 0, 'survivor B still working at 68');
  near(at(rows, 70).healthcare, 3000, 'survivor B retired at 70: their half of the household figure');

  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  console.log('[US] Medicare enrollment test passed (starts at max(65, retirement age))');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
