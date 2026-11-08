// UI check (CI: `npm run test:ui`) of the conversion start-age search (plan 2026-11-08-conversion-start-search.md): the select
// #rothConvStartSearch (Off / Quick / Thorough, Quick by default). Household H (tests/unit/helpers/start-search-household.json,
// the file tests/unit/us/conversion-start-search.test.js reads, so the two cannot drift): with the wide window 48-78 'off' converts
// nothing and Quick keeps a later start, so some row's conversion differs between the two; the choice survives a reload
// (autosave); the plan card's summary names the kept start and lists the per-age targets, not "Conversions: none"; and at 390 px
// the page does not scroll sideways.
//   node test_conversion_start_search.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

let fail = 0;
function ok(desc, cond, detail) {
  if (!cond) {
    fail++;
    console.log('FAIL: ' + desc + (detail !== undefined ? ' -- ' + JSON.stringify(detail) : ''));
  }
}

// H, the Vitest file's household.
const H = JSON.parse(fs.readFileSync(path.join(__dirname, 'tests', 'unit', 'helpers', 'start-search-household.json'), 'utf8'));

const convOf = (page) => page.evaluate(() => window.fireProjectionRows.map((r) => Math.round(r.conversionGross ?? r.conversionAmount ?? 0)));
async function choose(page, mode) {
  await page.evaluate(() => { document.getElementById('rothConvStartSearch').closest('details').open = true; }); // the select sits in a collapsed group
  await page.selectOption('#rothConvStartSearch', mode);
  await page.evaluate(() => window.__test_flushRender());
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
    await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
    await page.evaluate((h) => {
      window.__test_replaceState({ ...JSON.parse(JSON.stringify(window.__test_getState())), ...h });
      document.getElementById('realBtn').click();
      window.__test_flushRender();
    }, H);
    ok('the select offers Off, Quick, Thorough', (await page.locator('#rothConvStartSearch option').allTextContents()).join() === 'Off,Quick,Thorough');
    await choose(page, 'off');
    const off = await convOf(page);
    await choose(page, 'quick');
    ok('Quick is selected', (await page.inputValue('#rothConvStartSearch')) === 'quick');
    const quick = await convOf(page);
    ok('Off and Quick give different conversions', off.length === quick.length && off.some((v, i) => v !== quick[i]), { off: off.reduce((a, b) => a + b, 0), quick: quick.reduce((a, b) => a + b, 0) });
    ok('Quick converts somewhere', quick.some((v) => v >= 1));
    const summary = await page.evaluate(() => (document.getElementById('cliffPlanSummary') || {}).textContent || '');
    ok('the plan summary names the kept start', /Conversion start ages searched: starting at \d+ did best\./.test(summary), summary);
    // a kept start converts: the summary lists the per-age targets, never the no-conversion sentence
    ok('the Quick summary does not say Conversions: none', !summary.includes('Conversions: none'), summary);
    ok('the Quick summary lists the ages without a conversion', summary.includes('none at '), summary);
    await choose(page, 'off');
    const summaryOff = await page.evaluate(() => (document.getElementById('cliffPlanSummary') || {}).textContent || '');
    ok('Off prints no start sentence', !summaryOff.includes('Conversion start ages searched'), summaryOff);
    // the choice survives a reload (autosave), Off, Thorough and then Quick
    for (const mode of ['off', 'thorough', 'quick']) {
      await choose(page, mode);
      await page.reload();
      await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
      ok('the choice ' + mode + ' survives a reload', (await page.inputValue('#rothConvStartSearch')) === mode);
    }
    ok('no page errors', errors.length === 0, errors);
    await ctx.close();

    // a fresh browser context: the default is Quick
    const fresh = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await fresh.newPage();
    await p2.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
    await p2.waitForFunction(() => typeof window.__test_flushRender === 'function');
    ok('the default is Quick', (await p2.inputValue('#rothConvStartSearch')) === 'quick');
    await fresh.close();

    // 390 x 844: no horizontal scroll with the field in the sidebar
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mp = await mctx.newPage();
    await mp.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
    await mp.waitForFunction(() => typeof window.__test_flushRender === 'function');
    await mp.evaluate((h) => {
      window.__test_replaceState({ ...JSON.parse(JSON.stringify(window.__test_getState())), ...h });
      document.getElementById('realBtn').click();
      window.__test_flushRender();
    }, H);
    ok('390 px: no horizontal scroll', await mp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await mctx.close();
  } catch (e) {
    fail++;
    console.log('FAIL: ' + e.message);
  } finally {
    await browser.close();
  }
  console.log(fail ? `FAILED (${fail})` : 'PASS test_conversion_start_search');
  process.exit(fail ? 1 : 0);
})();
