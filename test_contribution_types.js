// Per-partner 401(k) and IRA contribution types: the eight buttons, Partner B's hidden in single-person mode,
// clicking one changes the projection, the group summary for differing types, and a 390x844 width check.
// Root Playwright script: node test_contribution_types.js (build first: npm run build)
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
  await page.waitForFunction(() => window.__test_getState && window.fireProjectionRows && window.fireProjectionRows.length > 0);
  const st = (k) => page.evaluate((k) => window.__test_getState()[k], k);
  const flush = () => page.evaluate(() => window.__test_flushRender && window.__test_flushRender());
  // IRA deduction PR 2: B has no workplace plan (no 401(k) dollars), so B's traditional IRA is deductible (A is covered, so B
  // reads the spouse range, $242,000-$252,000 of joint MAGI, above this couple's); a fully phased-out traditional IRA would be
  // taxed like a Roth and the type click below would change nothing.
  await page.evaluate(() => {
    Object.assign(window.__test_getState(), { singlePerson: false, incomeA: 120000, incomeB: 120000, iraPctA: 100, iraPctB: 100, iraTypeA: 'traditional', iraTypeB: 'traditional', k401TypeA: 'traditional', k401TypeB: 'traditional', k401PctB: 0, catchupPctB: 0, matchB: 0 });
    window.__test_syncControls();
    document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
  });
  await flush();
  const active = (id) => page.evaluate((id) => document.getElementById(id).classList.contains('active'), id);
  assert.strictEqual(await active('iraTraditionalBtnB'), true, 'B IRA traditional is selected');

  // A real render of the patched state first (the setup patch did not render), so taxBefore and taxAfter differ only by the type.
  await page.click('#iraTraditionalBtnB');
  await flush();
  const taxBefore = await page.evaluate(() => window.fireProjectionRows[0].tax);
  // the premise: some of the year-1 traditional IRA dollars are deducted (B's)
  const ded = await page.evaluate(() => { const r = window.fireProjectionRows[0]; return { deducted: r.iraDeducted, nondeductible: r.iraNondeductible, magi: r.iraMagi }; });
  assert.ok(ded.deducted > 0, "B's traditional IRA is deducted: " + JSON.stringify(ded));
  await page.click('#iraTraditionalBtnB');
  await flush();
  assert.strictEqual(await page.evaluate(() => window.fireProjectionRows[0].tax), taxBefore, 'clicking the already-active button leaves the tax unchanged (control: the later change is the type)');
  await page.click('#iraRothBtnB');
  await flush();
  assert.strictEqual(await st('iraTypeB'), 'roth', 'click writes iraTypeB');
  assert.strictEqual(await st('iraTypeA'), 'traditional', 'and leaves A alone');
  assert.strictEqual(await active('iraRothBtnB'), true);
  assert.strictEqual(await active('iraTraditionalBtnB'), false);
  const taxAfter = await page.evaluate(() => window.fireProjectionRows[0].tax);
  assert.notStrictEqual(taxAfter, taxBefore, 'B IRA Roth changes the first-year tax');

  await page.click('#k401RothBtnA');
  assert.strictEqual(await st('k401TypeA'), 'roth');
  assert.strictEqual(await st('k401TypeB'), 'traditional');
  const summary = await page.evaluate(() => document.getElementById('retireContribGroupState').textContent);
  assert.ok(/Roth\/Traditional \(A\/B\)/.test(summary), 'summary shows A/B when they differ: ' + summary);
  await page.click('#k401RothBtnB');
  const same = await page.evaluate(() => document.getElementById('retireContribGroupState').textContent);
  assert.ok(/401\(k\) · Roth/.test(same) && !/\//.test(same.split('·')[1]), 'summary shows one type when they match: ' + same);

  const visible = (id) => page.evaluate((id) => { const e = document.getElementById(id); return !!(e.offsetParent); }, id);
  for (const id of ['k401TraditionalBtnB', 'k401RothBtnB', 'iraTraditionalBtnB', 'iraRothBtnB']) assert.strictEqual(await visible(id), true, id + ' visible for a couple');
  await page.check('#singlePerson');
  await flush();
  for (const id of ['k401TraditionalBtnB', 'k401RothBtnB', 'iraTraditionalBtnB', 'iraRothBtnB']) assert.strictEqual(await visible(id), false, id + ' hidden in single-person mode');
  for (const id of ['k401TraditionalBtnA', 'iraRothBtnA']) assert.strictEqual(await visible(id), true, id + ' still visible');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.uncheck('#singlePerson');
  await flush();
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'no horizontal overflow at 390x844');

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('test_contribution_types: OK');
})().catch((e) => { console.error(e); process.exit(1); });
