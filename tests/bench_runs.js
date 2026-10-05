// Timing gate for hot-path changes (docs/next-batches-plan.md, 7C): 400 simulate() runs plus 120
// simulateHistorical() runs, median of 3 repeats, per planner and per state tax setting. Not part of
// `npm test` (wall-clock numbers are machine-dependent); run it on the "before" worktree and on the
// working tree and compare. The gate is +5% (docs/phase2-refactor-plan.md section 2.3).
//
//   node tests/bench_runs.js [--root DIR] [--states tx,ca,ny,pa,ct,wa] [--repeats 3] [--scale 1]
//   (--root: a `git worktree` of the "before" ref)

const { chromium } = require('playwright');
const path = require('path');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const STATES = opt('--states', 'tx,ca,ny,pa,ct,wa').split(',');
const REPEATS = Number(opt('--repeats', 3));
const SCALE = Number(opt('--scale', 1)); // multiplies both run counts, for a steadier reading on a noisy machine

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.join(ROOT, 'Planner_US.html'));
  await page.waitForTimeout(300);
  for (const code of STATES) {
    const out = await page.evaluate(({ code, REPEATS, SCALE }) => {
      const st = window.__test_getState();
      st.stateTax = code;
      // A working couple with children and some of every income source, so the state rules do real work.
      const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
      const std = [], hist = [];
      for (let r = 0; r < REPEATS; r++) {
        let t0 = performance.now();
        for (let i = 0; i < 400 * SCALE; i++) window.__test_simulate(55 + (i % 8), 55 + ((i >> 3) % 8));
        std.push(performance.now() - t0);
        t0 = performance.now();
        const H = window.__test_HIST;
        for (let i = 0; i < 120 * SCALE; i++) window.__test_simulateHistorical((y) => H[i % 30 + y]);
        hist.push(performance.now() - t0);
      }
      return { std: median(std), hist: median(hist) };
    }, { code, REPEATS, SCALE });
    console.log(`US ${code.padEnd(3)} ${400 * SCALE} simulate ${out.std.toFixed(0).padStart(6)} ms   ${120 * SCALE} historical ${out.hist.toFixed(0).padStart(6)} ms`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
