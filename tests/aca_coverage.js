// ACA / individual-market coverage is explicit per partner: a retired partner
// under 65 only needs their own coverage if the still-working spouse's employer
// plan doesn't cover them (employerCoversSpouseA/B, default true = the old
// "pre-65 premium starts once both have stopped working" rule).

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(200);
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
  const near = (a, b, msg) => assert(Math.abs(a - b) < 0.01, `${msg}: got ${a}, want ${b}`);
  for (const [id, v] of [
    ['singlePerson', false],
    ['ageA', 50],
    ['ageB', 50],
    ['lifeExpectancyA', 70],
    ['lifeExpectancyB', 70],
    ['retireAgeA', 52],
    ['retireAgeB', 60],
    ['healthcare', 20000],
    ['medicareYearly', 0],
    ['healthPremiumA', 0],
    ['healthPremiumB', 0],
    ['medicalInflation', 0],
    ['inflation', 0],
    ['acaEnabled', false],
    ['ltcEnabled', false],
  ])
    await set(id, v);
  const hc = async () => {
    await page.waitForTimeout(200);
    return (await page.evaluate(() => window.fireProjectionRows)).map((r) => r.healthcare);
  };

  // Default (both flags on): nothing until both are retired (year 10), then the
  // full premium until each partner's own 65th birthday (year 15), then half.
  let rows = await hc();
  for (let y = 2; y <= 9; y++) near(rows[y], 0, `default: year ${y}, B still works, A is covered by B's plan`);
  for (let y = 10; y <= 14; y++) near(rows[y], 20000, `default: year ${y}, both retired`);

  // B's plan no longer covers A: A (retired at 52) buys coverage from year 2.
  await set('employerCoversSpouseB', false);
  rows = await hc();
  for (let y = 0; y <= 1; y++) near(rows[y], 0, `year ${y}: A still working`);
  for (let y = 2; y <= 9; y++) near(rows[y], 10000, `B's plan doesn't cover A: year ${y}`);
  for (let y = 10; y <= 14; y++) near(rows[y], 20000, `both retired: year ${y}`);

  // A's flag only matters when B is retired and A is still working: no effect here.
  await set('employerCoversSpouseB', true);
  await set('employerCoversSpouseA', false);
  rows = await hc();
  for (let y = 2; y <= 9; y++) near(rows[y], 0, `A's flag is irrelevant while A is the retired one: year ${y}`);

  // Swap who retires first: now A's plan (flag A) decides whether B is covered.
  await set('retireAgeA', 60);
  await set('retireAgeB', 52);
  rows = await hc();
  for (let y = 2; y <= 9; y++) near(rows[y], 10000, `A's plan doesn't cover B: year ${y}`);
  await set('employerCoversSpouseA', true);
  rows = await hc();
  for (let y = 2; y <= 9; y++) near(rows[y], 0, `A's plan covers B: year ${y}`);

  // With the ACA subsidy modeled, only the enrolled partner's premium is netted.
  await set('employerCoversSpouseA', false);
  await set('acaEnabled', true);
  rows = await hc();
  for (let y = 2; y <= 9; y++)
    assert(rows[y] > 0 && rows[y] <= 10000 + 0.01, `ACA net cost is capped by B's half-premium (year ${y}: ${rows[y]})`);

  // The checkboxes disappear for a single person, and an old saved scenario
  // without the fields loads with them on.
  await set('singlePerson', true);
  const hidden = await page.evaluate(
    () => document.getElementById('employerCoversSpouseA').closest('[data-partner-b]').hidden,
  );
  assert(hidden, 'checkboxes are hidden for a single person');
  // An old autosave that predates the fields loads with both set (old behavior).
  await set('singlePerson', false);
  await page.waitForTimeout(400); // autosave debounce
  const key = 'fireCouplePlanner.massachusettsOffline.v1';
  const saved = await page.evaluate((key) => localStorage.getItem(key), key);
  const raw = JSON.parse(saved);
  assert.strictEqual(raw.state.employerCoversSpouseA, false, 'precondition: flag was saved');
  delete raw.state.employerCoversSpouseA;
  delete raw.state.employerCoversSpouseB;
  const ctx2 = await browser.newContext();
  await ctx2.addInitScript(([key, value]) => localStorage.setItem(key, value), [key, JSON.stringify(raw)]);
  const old = await ctx2.newPage();
  old.on('pageerror', (e) => errors.push(e.message));
  await old.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await old.waitForTimeout(300);
  const flags = await old.evaluate(() => [
    document.getElementById('employerCoversSpouseA').checked,
    document.getElementById('employerCoversSpouseB').checked,
  ]);
  assert.deepStrictEqual(flags, [true, true], 'old saves load with employer coverage on');
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  console.log('[US] ACA coverage-model tests passed');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
