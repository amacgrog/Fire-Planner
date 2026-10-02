// Additional Medicare Tax: 0.9% of Medicare wages above $250,000 (MFJ,
// combined) / $200,000 (single, per person). Statutory, not CPI-indexed.

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
  const near = (a, b, msg) => assert(Math.abs(a - b) < 0.01, `${msg}: got ${a}, want ${b}`);

  // --- Unit values ---
  const u = await page.evaluate(() => {
    const f = window.__test_tax.additionalMedicareTax;
    return {
      mfjBelow: f(125000, 124999, 'mfj'),
      mfjAt: f(125000, 125000, 'mfj'),
      mfjCombined: f(150000, 150000, 'mfj'), // neither spouse is over $200k alone
      mfjOneEarner: f(400000, 0, 'mfj'),
      singleAt: f(200000, 0, 'single'),
      singleOver: f(300000, 0, 'single'),
      separateEach: f(150000, 150000, 'single'), // two separate filers: no tax
      separateOne: f(250000, 150000, 'single'),
      singleHigh: f(700000, 0, 'single'),
    };
  });
  near(u.mfjBelow, 0, 'MFJ just under $250k combined');
  near(u.mfjAt, 0, 'MFJ exactly $250k combined');
  near(u.mfjCombined, 0.009 * 50000, 'MFJ combines both spouses');
  near(u.mfjOneEarner, 0.009 * 150000, 'MFJ one earner');
  near(u.singleAt, 0, 'single exactly $200k');
  near(u.singleOver, 0.009 * 100000, 'single $300k');
  near(u.separateEach, 0, 'two separate filers each under $200k');
  near(u.separateOne, 0.009 * 50000, 'two separate filers, one over');
  near(u.singleHigh, 0.009 * 500000, 'single $700k');

  // --- Integration: the marginal rate on one more dollar of wages ---
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
  for (const [id, v] of [
    ['k401PctA', 0],
    ['k401PctB', 0],
    ['iraPctA', 0],
    ['iraPctB', 0],
    ['matchA', 0],
    ['matchB', 0],
    ['healthPremiumA', 0],
    ['healthPremiumB', 0],
    ['dividendYield', 0],
    ['inflation', 0],
    ['incomeGrowth', 0],
    ['stateTax', 'tx'],
    ['retireAgeA', 60],
    ['retireAgeB', 60],
    ['ageA', 40],
    ['ageB', 40],
  ])
    await set(id, v);
  const taxAt = async (cfg) => {
    for (const [id, v] of Object.entries(cfg)) await set(id, v);
    await page.waitForTimeout(150);
    return page.evaluate(() => window.fireProjectionRows[0].tax);
  };
  // Single at $300k (35% bracket, above the SS wage base): +$10k of wages costs
  // 35% income tax + 1.45% Medicare + 0.9% Additional Medicare.
  await set('singlePerson', true);
  const s1 = await taxAt({ incomeA: 300000 }),
    s2 = await taxAt({ incomeA: 310000 });
  near((s2 - s1) / 10000, 0.35 + 0.0145 + 0.009, 'single marginal rate at $300k');
  // Single at $150k is below the threshold: no 0.9%.
  await set('singlePerson', true);
  const b1 = await taxAt({ incomeA: 150000 }),
    b2 = await taxAt({ incomeA: 151000 });
  near((b2 - b1) / 1000, 0.24 + 0.062 + 0.0145, 'single marginal rate at $150k (no add\'l Medicare)');
  // MFJ couple, $150k each (combined $300k): B's next dollar triggers the 0.9%
  // even though B alone is under $200k.
  await set('singlePerson', false);
  const m1 = await taxAt({ incomeA: 150000, incomeB: 150000 }),
    m2 = await taxAt({ incomeA: 150000, incomeB: 151000 });
  near((m2 - m1) / 1000, 0.24 + 0.062 + 0.0145 + 0.009, 'MFJ marginal rate on B at $300k combined');
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  console.log('[US] Additional Medicare Tax tests passed');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
