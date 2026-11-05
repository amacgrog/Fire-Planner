// Cash-flow chart: the view, the Style row, the three styles, the remembered style, mobile width, the tooltip and touch.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const FIXTURE = require('./tests/fixtures/dana-and-chris.json');

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
    // Bars drew: count canvas pixels of the first legend swatch's exact color (grid lines never match it).
    const painted = await page.evaluate(() => {
      const sw = document.querySelector('#chartLegend .swatch');
      const [r, g, b] = getComputedStyle(sw).backgroundColor.match(/\d+/g).map(Number);
      const c = document.getElementById('chart');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b && d[i + 3] === 255) n++;
      return n;
    });
    assert(painted > 300, file + ' ' + id + ': bars painted (' + painted + ' pixels of the first segment color)');
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

// A plan that converts (US: the fixture couple at a 24% bracket; Canada: a couple with the meltdown on).
const CA_COUPLE = { singlePerson: false, province: 'on', ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 100000, traditional: 1500000, roth: 100000, cash: 30000, spending: 70000, meltdownStartAge: 60, meltdownEndAge: 70, meltdownBracket: 20.5 };
const US_COUPLE = { ...FIXTURE.state, rothConvBracket: 24, rothConvEndAge: 71, lifeExpectancyA: 95, lifeExpectancyB: 95 };
const PLANS = {
  'Planner_US.html': { conv: { ...US_COUPLE, rothConvEnabled: true }, off: { ...US_COUPLE, rothConvEnabled: false }, convLabel: 'Roth conversion' },
  'Planner_Canada.html': { conv: { ...CA_COUPLE, meltdownEnabled: true }, off: { ...CA_COUPLE, meltdownEnabled: false }, convLabel: 'RRSP meltdown' },
};
const STYLE_IDS = { bars: 'cashFlowStyleBarsBtn', inout: 'cashFlowStyleInOutBtn', simple: 'cashFlowStyleSimpleBtn' };

async function setPlan(page, patch) {
  await page.evaluate((p) => {
    const base = JSON.parse(JSON.stringify(window.__test_getState()));
    window.__test_replaceState({ ...base, ...p });
    document.getElementById('realBtn').click(); // a full render
    window.__test_flushRender();
  }, patch);
}
// The expected tooltip items of bar i in a style, from the hook's display parts (the threshold is one display dollar).
function expectedItems(parts, style) {
  const big = (v) => v >= 1;
  const get = (list, k) => list.find((x) => x.key === k)?.value ?? 0;
  const g = (list, k) => (big(get(list, k)) ? get(list, k) : 0);
  const out = {};
  if (style === 'simple') {
    const cand = {
      income: g(parts.in, 'income') + g(parts.in, 'lifetime'),
      required: g(parts.in, 'rmd'),
      other: ['traditional', 'roth', 'taxable', 'cash', 'home'].reduce((a, k) => a + g(parts.in, k), 0),
      shortfall: g(parts.in, 'shortfall'),
    };
    for (const k in cand) if (big(cand[k])) out[k] = cand[k];
  } else {
    parts.in.filter((x) => big(x.value)).forEach((x) => (out[x.key] = x.value));
  }
  if (style === 'inout') parts.out.filter((x) => big(x.value)).forEach((x) => (out[x.key] = x.value));
  else {
    const sp = g(parts.out, 'spending');
    const plus = sp + g(parts.out, 'tax') + g(parts.out, 'contributions') + g(parts.out, 'cashTopUp');
    if (big(sp)) out.spending = sp;
    if (big(plus)) out.spendPlus = plus;
    if (big(g(parts.out, 'reinvested'))) out.reinvested = g(parts.out, 'reinvested');
  }
  if (big(parts.conversion)) out.conversion = parts.conversion;
  return out;
}
async function barPoint(page, i) {
  return page.evaluate((idx) => {
    const c = document.getElementById('chart');
    c.scrollIntoView({ block: 'center' });
    const r = c.getBoundingClientRect(),
      n = window.fireProjectionRows.length,
      w = c.width / Math.min(2, window.devicePixelRatio || 1),
      sx = r.width / w;
    return { x: r.left + (66 + (idx + 0.5) * ((w - 84) / n)) * sx, y: r.top + 60 * sx };
  }, i);
}
async function readTooltip(page) {
  return page.evaluate(() => {
    const t = document.getElementById('cashFlowTooltip');
    return {
      shown: getComputedStyle(t).display !== 'none',
      header: t.querySelector('b')?.textContent,
      items: [...t.querySelectorAll('.cf-item')].map((e) => ({ key: e.dataset.key, value: Number(e.dataset.value), text: e.textContent })),
    };
  });
}
const displayOf = (page, i) => page.evaluate((idx) => window.__test_cashFlowParts(idx).display, i);

async function tooltipRun(browser, file) {
  const plan = PLANS[file];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'dist', file));
  await page.waitForFunction(() => typeof window.__test_cashFlowParts === 'function');
  await setPlan(page, plan.conv);
  await page.click('#chartGroupCashFlowBtn');
  const n = await page.evaluate(() => window.fireProjectionRows.length);
  const convIdx = await page.evaluate(() => window.fireProjectionRows.findIndex((r) => (r.conversionGross ?? r.conversionAmount ?? r.meltdown ?? 0) >= 1));
  assert(convIdx >= 0, file + ': the plan converts somewhere');
  assert((await page.locator('#chartLegend').textContent()).includes('* ' + plan.convLabel), file + ': legend has the conversion entry');
  for (const style of ['bars', 'inout', 'simple']) {
    await page.click('#' + STYLE_IDS[style]); // set the style explicitly: the reload check leaves In / out active
    for (const i of [0, convIdx, Math.floor(n / 2), n - 1]) {
      const pt = await barPoint(page, i);
      await page.mouse.move(pt.x, pt.y);
      const tip = await readTooltip(page);
      const tag = file + ' ' + style + ' bar ' + i;
      assert(tip.shown, tag + ': tooltip shown');
      const want = expectedItems(await displayOf(page, i), style);
      assert.deepStrictEqual(tip.items.map((x) => x.key).sort(), Object.keys(want).sort(), tag + ': item keys');
      tip.items.forEach((x) => {
        assert.strictEqual(x.value, want[x.key], tag + ': value of ' + x.key);
        assert(x.value >= 1, tag + ': no item under one dollar');
      });
      assert(/^\d{4} · ages \d+ \/ \d+$/.test(tip.header), tag + ': header ' + tip.header);
      if (i === convIdx) assert(tip.items.some((x) => x.key === 'conversion' && x.text.startsWith('* ')), tag + ': conversion line');
    }
  }
  // Future dollars: a later bar's values change and still equal the hook's display values.
  await page.click('#' + STYLE_IDS.bars);
  const late = n - 3;
  let pt = await barPoint(page, late);
  await page.mouse.move(pt.x, pt.y);
  const real = await readTooltip(page);
  await page.evaluate(() => document.getElementById('nominalBtn').click());
  pt = await barPoint(page, late);
  await page.mouse.move(pt.x, pt.y);
  const nom = await readTooltip(page);
  const nomWant = expectedItems(await displayOf(page, late), 'bars');
  assert(nom.items.some((x) => x.value !== real.items.find((y) => y.key === x.key)?.value), file + ': future dollars change a value');
  nom.items.forEach((x) => assert.strictEqual(x.value, nomWant[x.key], file + ': future-dollar value of ' + x.key));
  await page.evaluate(() => document.getElementById('realBtn').click());
  // The projection chart keeps its own tooltip.
  await page.click('#chartGroupProjectionBtn');
  const box = await page.locator('#chart').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  assert(await page.locator('#cashFlowTooltip').isHidden(), file + ': cash-flow tooltip hidden on Projection');
  assert(await page.locator('#chartTooltip').isVisible(), file + ': projection tooltip shown');
  // Conversions off: no asterisk legend entry.
  await setPlan(page, plan.off);
  await page.click('#chartGroupCashFlowBtn');
  assert(!(await page.locator('#chartLegend').textContent()).includes('* '), file + ': no conversion legend entry when off');
  // A single person: the header carries one age.
  await setPlan(page, { ...plan.conv, singlePerson: true });
  pt = await barPoint(page, 2);
  await page.mouse.move(pt.x, pt.y);
  const single = await readTooltip(page);
  assert(/^\d{4} · age \d+$/.test(single.header), file + ': single-person header ' + single.header);
  assert.deepStrictEqual(errors, [], file + ': page errors');
  await ctx.close();

  // Touch at 390 x 844: a tap on a bar shows the tooltip (it stays), a tap outside hides it.
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const tp = await tctx.newPage();
  const terrors = [];
  tp.on('pageerror', (e) => terrors.push(e.message));
  await tp.goto('file://' + path.resolve(__dirname, 'dist', file));
  await tp.waitForFunction(() => typeof window.__test_cashFlowParts === 'function');
  await setPlan(tp, plan.conv);
  await tp.click('#mobileTabDashboard');
  await tp.click('#chartGroupCashFlowBtn');
  const tpt = await barPoint(tp, convIdx);
  await tp.touchscreen.tap(tpt.x, tpt.y);
  await tp.locator('#cashFlowTooltip').waitFor({ state: 'visible' });
  await tp.waitForTimeout(300);
  assert(await tp.locator('#cashFlowTooltip').isVisible(), file + ": the tap's tooltip stays");
  assert((await readTooltip(tp)).items.length > 0, file + ': tap tooltip has items');
  const over = await tp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert(!over, file + ': no sideways scroll with the tooltip open');
  // Simple: a bar with two or more "other" accounts has a long sub-line; the tooltip must stay inside the chart and the page.
  await tp.click('#' + STYLE_IDS.simple);
  const multi = await tp.evaluate(() => {
    const others = ['traditional', 'roth', 'taxable', 'cash', 'home'];
    for (let i = 0; i < window.fireProjectionRows.length; i++) {
      const n = window.__test_cashFlowParts(i).display.in.filter((x) => others.includes(x.key) && x.value >= 1).length;
      if (n >= 2) return i;
    }
    return -1;
  });
  assert(multi >= 0, file + ': a bar with two or more other accounts exists');
  const mpt = await barPoint(tp, multi);
  await tp.touchscreen.tap(mpt.x, mpt.y);
  await tp.locator('#cashFlowTooltip').waitFor({ state: 'visible' });
  const fit = await tp.evaluate(() => {
    const t = document.getElementById('cashFlowTooltip').getBoundingClientRect(),
      c = document.getElementById('chart').getBoundingClientRect();
    return { l: t.left - c.left, r: t.right - c.right, sub: !!document.querySelector('#cashFlowTooltip .cf-sub'), over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  assert(fit.sub && fit.l >= -0.5 && fit.r <= 0.5, file + ': Simple tooltip inside the chart ' + JSON.stringify(fit));
  assert(!fit.over, file + ': no sideways scroll with the Simple tooltip');
  await tp.screenshot({ path: path.resolve(__dirname, '.superpowers/sdd/2026-11-04-cash-flow-chart/final-fix-mobile.png') });
  const tb = await tp.locator('#chartTitle').boundingBox();
  await tp.touchscreen.tap(tb.x + 4, tb.y + tb.height / 2);
  await tp.locator('#cashFlowTooltip').waitFor({ state: 'hidden' });
  assert.deepStrictEqual(terrors, [], file + ': touch page errors');
  await tctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const f of ['Planner_US.html', 'Planner_Canada.html']) {
      await run(browser, f);
      await tooltipRun(browser, f);
    }
    console.log('PASS test_cash_flow_chart');
  } catch (e) {
    console.error('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
