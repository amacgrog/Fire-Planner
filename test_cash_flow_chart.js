// Cash-flow chart: the view, the Style row, the three styles, the remembered style, mobile width.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const STYLES = [
  ['cashFlowStyleBarsBtn', ['Spending', 'Spending + taxes']],
  ['cashFlowStyleInOutBtn', ['Taxes']],
  ['cashFlowStyleSimpleBtn', ['Income']],
];

async function run(browser, file) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const url = 'file://' + path.resolve(__dirname, 'dist', file);
  const load = async () => {
    await page.goto(url);
    await page.locator('#chartGroupCashFlowBtn').waitFor();
  };
  await load();
  await page.click('#chartGroupCashFlowBtn');
  assert(await page.locator('#cashFlowStyleRow').isVisible(), file + ': style row visible');
  assert(await page.locator('#projectionSubToggle').isHidden(), file + ': sub toggle hidden');
  assert(await page.locator('#chartLogScaleRow').isHidden(), file + ': log row hidden');
  assert.strictEqual(await page.locator('#chartTitle').textContent(), 'Yearly cash flow');
  for (const [id, labels] of STYLES) {
    await page.click('#' + id);
    assert.strictEqual(await page.locator('#' + id).getAttribute('aria-checked'), 'true', id);
    const painted = await page.evaluate(() => {
      const c = document.getElementById('chart');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    assert(painted > 500, file + ' ' + id + ': canvas painted (' + painted + ')');
    const legend = await page.locator('#chartLegend').textContent();
    for (const l of labels) assert(legend.includes(l), file + ' ' + id + ': legend has ' + l + ' in ' + legend);
  }
  await page.click('#cashFlowStyleInOutBtn');
  await load();
  await page.click('#chartGroupCashFlowBtn');
  assert.strictEqual(await page.locator('#cashFlowStyleInOutBtn').getAttribute('aria-checked'), 'true', 'style remembered');
  await page.click('#chartGroupProjectionBtn');
  assert(await page.locator('#chartLogScaleRow').isVisible(), 'log row back');
  assert(await page.locator('#projectionSubToggle').isVisible(), 'sub toggle back');
  assert(await page.locator('#cashFlowStyleRow').isHidden(), 'style row hidden');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#mobileTabDashboard');
  await page.click('#chartGroupCashFlowBtn');
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert(!over, file + ': no sideways scroll at 390');
  assert.deepStrictEqual(errors, [], 'page errors');
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const f of ['Planner_US.html', 'Planner_Canada.html']) await run(browser, f);
    console.log('PASS test_cash_flow_chart');
  } catch (e) {
    console.error('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
