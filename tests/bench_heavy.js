// Heavy-path timing per state (docs/next-batches-plan.md, "7D part 2"). Not part of `npm test`
// (wall-clock numbers are machine-dependent); run it on the "before" worktree and on the working tree
// and compare, like tests/bench_runs.js. It uses only hooks that already exist at the 7C merge
// (__test_getState, __test_runMonteCarlo, __test_simulate, __test_optimizeRothLadderPerYear and the DOM
// controls), so the same script times the old and the new code.
//
//   node tests/bench_heavy.js [--root DIR] [--states tx,ma,or,mo] [--moves 5] [--paths 100]
//
// Reports, per state: a slider move (median ms of `moves` moves, each after a settle so the debounced
// historical-success pass has finished) with every results card closed, with only the tornado card open,
// and with every card open; then one Monte Carlo run (`paths` paths, seeded) and one per-year Roth
// optimizer run. Compare numbers only within one run configuration.

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const STATES = opt('--states', 'tx,ma,or,mo').split(',');
const MOVES = Number(opt('--moves', 5));
const PATHS = Number(opt('--paths', 100));
const SETTLE_MS = 900;

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + plannerPath('Planner_US.html', ROOT));
  await page.waitForTimeout(400);
  const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const cards = (open, only) => page.evaluate(({ open, only }) => {
    document.querySelectorAll('details.result-card').forEach((d) => {
      if (d.hidden) return;
      d.open = only ? d.id === only : open;
    });
  }, { open, only });
  const slider = async () => {
    const times = [];
    for (let i = 0; i < MOVES + 1; i++) {
      await page.waitForTimeout(SETTLE_MS);
      const ms = await page.evaluate((i) => {
        const el = document.getElementById('retireAgeA');
        el.value = String(Number(el.value) + (i % 2 ? 1 : -1));
        const t0 = performance.now();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return performance.now() - t0;
      }, i);
      if (i > 0) times.push(ms); // the first move warms the code up
    }
    return median(times);
  };
  // The Roth optimizer card only exists while conversions are on; turn them on once, for every state.
  await page.evaluate(() => {
    const c = document.getElementById('rothConvEnabled');
    if (!c.checked) c.click();
  });
  console.log(`state  slider(closed) slider(tornado) slider(all open)  MC ${PATHS} paths  Roth optimizer   [ms]`);
  for (const code of STATES) {
    await page.evaluate((code) => {
      const sel = document.getElementById('stateTax');
      sel.value = code;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, code);
    await cards(false);
    const closed = await slider();
    await cards(false, 'sensitivityCard');
    const tornado = await slider();
    await cards(true);
    const all = await slider();
    await cards(false);
    await page.waitForTimeout(SETTLE_MS);
    const heavy = await page.evaluate((PATHS) => {
      // Only matters against an older, unseeded tree; a seeded tree draws from its inputs.
      let seed = 12345;
      const realRandom = Math.random;
      Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      let t0 = performance.now();
      window.__test_runMonteCarlo(PATHS);
      const mc = performance.now() - t0;
      const selected = window.__test_simulate();
      t0 = performance.now();
      window.__test_optimizeRothLadderPerYear(selected, 'endValue');
      const roth = performance.now() - t0;
      Math.random = realRandom;
      return { mc, roth };
    }, PATHS);
    console.log(`${code.padEnd(5)}  ${closed.toFixed(0).padStart(12)} ${tornado.toFixed(0).padStart(15)} ${all.toFixed(0).padStart(17)} ${heavy.mc.toFixed(0).padStart(16)} ${heavy.roth.toFixed(0).padStart(16)}`);
  }
  if (errors.length) console.log('PAGE ERRORS:', errors);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
