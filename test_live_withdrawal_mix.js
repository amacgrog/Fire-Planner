// Playwright test for the "Tax-aware withdrawal order" checkbox (state.withdrawalMixEnabled), in CI through
// `npm run test:ui`; run one directly with `node test_live_withdrawal_mix.js` (build first).
//
// Since Batch 5 step 4c the checkbox no longer picks a mix year by year inside the projection: it turns on the ORDER LEVER of
// the automatic cliff plan (computeCliffPlan). The plan chooses, on its own assumptions, the years to draw traditional before
// taxable (plan.orders; the rows of those years carry row.drawOrder === 'traditional') and keeps that only if the whole plan runs out no
// earlier and draws on the house no earlier, and lasts longer, first draws on the house later or ends higher. It needs the cliff plan: with cliffGuardEnabled false the toggle changes nothing (A9). The
// light plan (typing) and the deferred plan agree on the orders (they run the same select; checked on a household with a pending bracket search). The old pickLiveWithdrawalOrder
// hook is gone. The household is ORDER_H1 of tests/helpers/plan-households.js (MFJ 62, 250k + 250k traditional, taxable 300k,
// spending 60k, conversions off), whose kept plan has order years at 65-67 with the toggle on.
const { chromium } = require('playwright');
const path = require('path');

let pass = 0, fail = 0;
function ok(desc, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${desc}`); }
  else { fail++; console.log(`  FAIL ${desc}${detail ? ' — ' + JSON.stringify(detail) : ''}`); }
}

async function withPage(fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve('dist', 'Planner_US.html'));
  await page.waitForTimeout(250);
  await fn(page);
  if (errors.length) { fail++; console.log('  FAIL page errors:', errors); }
  await browser.close();
}

function setVal(page, id, val) {
  return page.evaluate(({ id, val }) => {
    const el = document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, val });
}
function setSelect(page, id, val) {
  return page.evaluate(({ id, val }) => {
    const el = document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { id, val });
}
function clickIfUnchecked(page, id) {
  return page.evaluate((id) => {
    if (!document.getElementById(id).checked) document.getElementById(id).click();
  }, id);
}
function clickIfChecked(page, id) {
  return page.evaluate((id) => {
    if (document.getElementById(id).checked) document.getElementById(id).click();
  }, id);
}


const { ORDER_H1, SPLIT_H1 } = require('./tests/helpers/plan-households.js');

// Loads the household into the live state (the way load does), syncs the controls and renders.
async function loadH1(page, patch) {
  await page.evaluate((raw) => {
    window.__test_replaceState(raw);
    window.__test_syncControls();
  }, { ...ORDER_H1, ...patch });
  await page.evaluate(() => document.getElementById('withdrawalMixEnabled').dispatchEvent(new Event('change', { bubbles: true })));
  await page.evaluate(() => window.__test_flushRender());
}
const dashRows = (page) =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.fireProjectionRows.map((r) => ({ age: r.age, drawOrder: r.drawOrder || null, tax: r.tax, taxable: r.taxable, traditional: r.traditional, roth: r.roth })))));
const orderAges = (rows) => rows.filter((r) => r.drawOrder === 'traditional').map((r) => r.age);

(async () => {
  // 1. Off by default.
  await withPage(async (page) => {
    const checked = await page.evaluate(() => document.getElementById('withdrawalMixEnabled').checked);
    ok('withdrawalMixEnabled checkbox is unchecked by default', checked === false);
  });

  // 2. On H1, toggling on gives order rows in the plan's order years and none toggle off; on then off restores the rows.
  await withPage(async (page) => {
    await loadH1(page, {});
    const off = await dashRows(page);
    ok('toggle off: no row carries drawOrder', orderAges(off).length === 0, orderAges(off));
    await clickIfUnchecked(page, 'withdrawalMixEnabled');
    await page.evaluate(() => window.__test_flushRender());
    const on = await dashRows(page);
    const plan = await page.evaluate(() => window.__test_planForState());
    const planAges = plan && plan.orders ? Object.keys(plan.orders).map(Number).sort((a, b) => a - b) : [];
    ok('toggle on: the plan keeps orders', planAges.length > 0, plan && plan.orders);
    ok('toggle on: drawOrder rows are exactly the plan order years', JSON.stringify(orderAges(on)) === JSON.stringify(planAges), { rows: orderAges(on), planAges });
    await clickIfChecked(page, 'withdrawalMixEnabled');
    await page.evaluate(() => window.__test_flushRender());
    const back = await dashRows(page);
    ok('toggling on then off reproduces the original rows exactly', JSON.stringify(back) === JSON.stringify(off), back.map((r, i) => JSON.stringify(r) === JSON.stringify(off[i]) ? null : [r, off[i]]).filter(Boolean).slice(0, 2));
  });

  // 3. With the cliff plan off the toggle changes no row (A9).
  await withPage(async (page) => {
    await loadH1(page, { cliffGuardEnabled: false });
    const off = await dashRows(page);
    await clickIfUnchecked(page, 'withdrawalMixEnabled');
    await page.evaluate(() => window.__test_flushRender());
    const on = await dashRows(page);
    ok('cliff plan off: toggling on changes no row', JSON.stringify(on) === JSON.stringify(off), on.map((r, i) => JSON.stringify(r) === JSON.stringify(off[i]) ? null : [r, off[i]]).filter(Boolean).slice(0, 2));
    ok('cliff plan off: no row carries drawOrder', orderAges(on).length === 0);
  });

  // 4. After typing a spending value, the light plan's orders equal the deferred plan's. Conversions on before the order years give
  // a bracket search, so the deferred pass has work (searchPending) and the light plan is a different computation.
  await withPage(async (page) => {
    await loadH1(page, { rothConvEnabled: true, rothConvStartAge: 62, rothConvEndAge: 64 });
    await clickIfUnchecked(page, 'withdrawalMixEnabled');
    await page.evaluate(() => window.__test_flushRender());
    await setVal(page, 'spending', 61000);
    const pending = await page.evaluate(() => window.__test_cliffPlanState().searchPending);
    const light = await page.evaluate(() => window.__test_planForState());
    await page.evaluate(() => window.__test_flushRender());
    const deferred = await page.evaluate(() => window.__test_planForState());
    ok('after typing, the bracket search is pending', pending === true, pending);
    ok('the deferred plan keeps orders', !!(deferred && deferred.orders), deferred && deferred.orders);
    ok(
      'after typing, the light plan orders equal the deferred plan orders',
      JSON.stringify(light && light.orders) === JSON.stringify(deferred && deferred.orders),
      { light: light && light.orders, deferred: deferred && deferred.orders },
    );
  });

  // 5. The info tip opens.
  await withPage(async (page) => {
    await page.evaluate(() => {
      const d = document.getElementById('withdrawalMixEnabled').closest('details');
      if (d) d.open = true;
    });
    await page.locator('label[for="withdrawalMixEnabled"] .info-tip').click();
    const text = await page.evaluate(() => (document.getElementById('infoBubble') || {}).textContent || '');
    ok('the info tip opens and describes the order lever', /cliff plan chooses/.test(text), text.slice(0, 80));
  });

  // 6. The split lever (Batch 5 step 4d): SPLIT_H1 (a couple filing single, two returns) with the toggle on draws Partner A's
  // traditional accounts first in the first year; with the toggle off no row carries drawSplit. No horizontal scroll at 390x844.
  await withPage(async (page) => {
    const splitAges = () => page.evaluate(() => window.fireProjectionRows.filter((r) => r.drawSplit).map((r) => r.age));
    await page.evaluate((raw) => {
      window.__test_replaceState(raw);
      window.__test_syncControls();
    }, { ...SPLIT_H1, withdrawalMixEnabled: false });
    await page.evaluate(() => window.__test_flushRender());
    ok('split household, toggle off: no row carries drawSplit', (await splitAges()).length === 0, await splitAges());
    await clickIfUnchecked(page, 'withdrawalMixEnabled');
    await page.evaluate(() => window.__test_flushRender());
    const first = await page.evaluate(() => window.fireProjectionRows[0].drawSplit);
    ok('split household, toggle on: the first row draws Partner A first', first === 'A', first);
    const plan = await page.evaluate(() => window.__test_planForState());
    ok('split household, toggle on: the plan keeps splits', !!(plan && plan.splits && plan.splits[60] === 'A'), plan && plan.splits);
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    ok('mobile 390x844: no horizontal scroll', overflow === false);
    await clickIfChecked(page, 'withdrawalMixEnabled');
    await page.evaluate(() => window.__test_flushRender());
    ok('split household, toggle switched back off: no row carries drawSplit', (await splitAges()).length === 0, await splitAges());
  });

  console.log(`
${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
