// E3 UI check (CI: `npm run test:ui`): the status tooltip names the IRMAA appeal; the healthcare callout says appeals are assumed; no
// horizontal overflow at 390px. Run: node test_irmaa_appeal.js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  for (const width of [1280, 390]) {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    const saved = {
      singlePerson: true, ageA: 66, retireAgeA: 68, lifeExpectancyA: 80, incomeA: 200000, incomeKindA: 'wages', incomeGrowth: 0,
      k401PctA: 0, catchupPctA: 0, iraPctA: 0, pensionCoverage: 'a', pensionYearlyA: 60000, pensionStartAgeA: 68, stateTax: 'tx',
      acaEnabled: false, inflation: 0, medicalInflation: 0, medicareYearly: 10000, ssMonthlyA: 0, spending: 20000, tenure: 'rent',
      rent: 0, taxable: 0, cash: 0, tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0,
    };
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['fireCouplePlanner.massachusettsOffline.v1', JSON.stringify({ state: saved, mode: 'real' })]);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
    await page.waitForTimeout(500);
    const title = await page.evaluate(() => {
      for (const tr of document.querySelectorAll('#projectionRows tr'))
        if (tr.cells[0] && tr.cells[0].textContent.trim() === '68') return (tr.querySelector('.table-status') || {}).title || '';
      return null;
    });
    console.log(`width ${width} tooltip at 68: ${title}`);
    assert(title !== null, 'the table has a row for age 68');
    assert(/IRMAA appeal \(form SSA-44, retirement\)/.test(title), `tooltip at 68: ${title}`);
    assert(/2028 income instead of 2026/.test(title), `tooltip years: ${title}`);
    // The callout sits inside the closed <details id="methodologyCard">: innerText would miss it (plan review round 1, S4).
    const callout = await page.evaluate(() => document.getElementById('methodologyCard').textContent);
    assert(/form SSA-44/.test(callout), 'the healthcare callout mentions the appeal');
    assert(!/Medicaid coverage gap/.test(callout), 'the stale Medicaid phrase is gone');
    if (width === 390) assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'no horizontal overflow at 390px');
    assert.deepStrictEqual(errors, [], `page errors at ${width}`);
    await page.close();
  }
  await browser.close();
  console.log('test_irmaa_appeal: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
