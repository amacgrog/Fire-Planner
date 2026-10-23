// UI check (CI: `npm run test:ui`, not `npm test`) of the deferred render (src/shared/ui/results/render-scheduler.js), both
// planners: a field `input` redraws the projection at once and leaves the historical and Monte Carlo views and the open analysis cards
// dimmed with their last picture; `__test_flushRender()`, the field's `change` event or 250 ms without input draws them,
// exactly as a full render would; a second input restarts the 250 ms; a full render clears a pending pass.
//   node test_deferred_render.js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  for (const file of ['Planner_US.html', 'Planner_Canada.html']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, 'dist', file));
    await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
    await page.clock.pauseAt(new Date('2026-06-15T12:01:00Z')); // fires whatever is due, then time stands still
    const click = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
    const spending = (factor) => page.evaluate((f) => {
      const el = document.getElementById('spending');
      el.value = String(Math.round(window.__test_getState().spending * f));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, factor);
    // Canvas pixels as a hash, so a deferred pass that skipped a chart cannot pass for a full render.
    const look = () => page.evaluate(() => {
      const pixels = (id) => {
        const url = document.getElementById(id).toDataURL();
        let h = 0x811c9dc5;
        for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 16777619);
        return h >>> 0;
      };
      return {
      chart: pixels('chart'),
      tornado: pixels('tornadoChart'),
      hist: document.getElementById('histSuccessRate').textContent,
      stale: [...document.querySelectorAll('.stale')].map((e) => e.id || e.className.replace(/\s*stale\s*/, '')).sort(),
      busy: document.querySelectorAll('[aria-busy="true"]').length,
      rate: document.getElementById('mcSuccessRate').textContent,
      sankey: document.getElementById('sankeySvg').textContent,
      rows: JSON.stringify(window.fireProjectionRows.map((r) => r.total)),
      };
    });
    const STALE = ['chart-wrap', 'mcSuccessCard', 'sankeyCard'];

    // Projection view, cards closed: nothing is deferred.
    await spending(1.1);
    let s = await look();
    assert.deepStrictEqual(s.stale, [], file + ': projection view, cards closed: nothing stale');

    // Monte Carlo view (500 paths), the Sankey card open.
    await click('chartGroupMcBtn');
    await click('mcPaths500Btn');
    await page.evaluate(() => { const d = document.getElementById('sankeyCard'); d.open = true; d.dispatchEvent(new Event('toggle')); });
    await click('realBtn');
    const before = await look();
    assert.deepStrictEqual(before.stale, [], file + ': a full render leaves nothing stale');

    // An input: the projection moves at once, the deferred panels keep their picture, dimmed.
    await spending(2);
    s = await look();
    assert.deepStrictEqual(s.stale, STALE, file + ': stale after an input');
    assert.strictEqual(s.busy, STALE.length, file + ': aria-busy on each stale panel');
    assert.notStrictEqual(s.rows, before.rows, file + ': the projection updates on input');
    assert.strictEqual(s.rate, before.rate, file + ': the Monte Carlo figure waits');
    assert.strictEqual(s.sankey, before.sankey, file + ': the Sankey waits');
    assert.strictEqual(s.chart, before.chart, file + ': the Monte Carlo chart waits');

    // The flush draws them, exactly as a full render does.
    await page.evaluate(() => window.__test_flushRender());
    const flushed = await look();
    assert.deepStrictEqual(flushed.stale, [], file + ': nothing stale after the flush');
    assert.strictEqual(flushed.busy, 0, file + ': no aria-busy after the flush');
    assert.notStrictEqual(flushed.rate, before.rate, file + ': the Monte Carlo figure moved with the doubled spending');
    assert.notStrictEqual(flushed.sankey, before.sankey, file + ': the Sankey moved');
    assert.notStrictEqual(flushed.chart, before.chart, file + ': the Monte Carlo chart moved');
    await click('realBtn');
    assert.deepStrictEqual(await look(), flushed, file + ': the flushed panels equal a full render');

    // 250 ms without input, restarted by each input.
    await spending(0.5);
    await page.clock.runFor(200);
    await spending(1.5);
    await page.clock.runFor(200);
    assert.deepStrictEqual((await look()).stale, STALE, file + ': a second input restarts the idle timer');
    await page.clock.runFor(60);
    s = await look();
    assert.deepStrictEqual(s.stale, [], file + ': drawn after 250 ms idle');
    await click('realBtn');
    assert.deepStrictEqual(await look(), s, file + ': the idle pass equals a full render');

    // The field's change event (slider released, text committed).
    await spending(0.8);
    await page.evaluate(() => document.getElementById('spending').dispatchEvent(new Event('change', { bubbles: true })));
    s = await look();
    assert.deepStrictEqual(s.stale, [], file + ': drawn on change');
    await click('realBtn');
    assert.deepStrictEqual(await look(), s, file + ': the change pass equals a full render');

    // A full render while a pass is pending clears it, and the timer does nothing afterwards.
    await spending(1.25);
    await click('realBtn');
    s = await look();
    assert.deepStrictEqual(s.stale, [], file + ': a full render clears the stale marks');
    await page.clock.runFor(300);
    assert.deepStrictEqual(await look(), s, file + ': nothing redraws after a full render');

    // The historical view: the backtest chart and its success card wait the same way.
    await click('chartGroupHistBtn');
    const histBefore = await look();
    await spending(1.6);
    s = await look();
    assert.deepStrictEqual(s.stale, ['chart-wrap', 'histSuccessCard', 'sankeyCard'], file + ': historical view stale after an input');
    assert.strictEqual(s.chart, histBefore.chart, file + ': the backtest chart waits');
    await page.evaluate(() => window.__test_flushRender());
    s = await look();
    assert.deepStrictEqual(s.stale, [], file + ': historical view drawn by the flush');
    assert.notStrictEqual(s.chart, histBefore.chart, file + ': the backtest chart moved');
    await click('realBtn');
    assert.deepStrictEqual(await look(), s, file + ': the historical pass equals a full render');

    // The projection view with the tornado open: the chart draws at once, only the cards wait.
    await click('chartGroupProjectionBtn');
    await page.evaluate(() => { const d = document.getElementById('sensitivityCard'); d.open = true; d.dispatchEvent(new Event('toggle')); });
    await click('realBtn');
    const projBefore = await look();
    await spending(0.7);
    s = await look();
    assert.deepStrictEqual(s.stale, ['sankeyCard', 'sensitivityCard'], file + ': projection view: only the open cards are stale');
    assert.notStrictEqual(s.chart, projBefore.chart, file + ': the projection chart draws on input');
    assert.strictEqual(s.tornado, projBefore.tornado, file + ': the tornado waits');
    await page.evaluate(() => window.__test_flushRender());
    s = await look();
    assert.deepStrictEqual(s.stale, [], file + ': the tornado drawn by the flush');
    assert.notStrictEqual(s.tornado, projBefore.tornado, file + ': the tornado moved');
    await click('realBtn');
    assert.deepStrictEqual(await look(), s, file + ': the tornado pass equals a full render');

    assert.deepStrictEqual(errors, [], file + ': page errors ' + errors);
    await page.close();
  }
  await browser.close();
  console.log('deferred render: input draws the projection at once; flush, change and 250 ms idle draw the deferred panels');
})().catch((e) => { console.error(e); process.exit(1); });
