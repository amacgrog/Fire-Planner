// bench_runs.js's workload (400 simulate() + 120 simulateHistorical() on the default household, per state tax setting),
// two trees in ONE process, interleaved rounds (the order alternates), median per tree (CLAUDE.md: wall-clock noise
// between separate runs is about +-10%, so a decision compares two trees this way). Not part of `npm test`.
// On a tree with the cliff-plan hooks each round plans once for the state (outside the timing) and times the raw hooks;
// an older tree times the plain hooks.
//
//   node tests/bench_runs_interleaved.js --base DIR [--rounds 11] [--states tx,ca,ny,pa,ct,wa]
//   (--base: a `git worktree` of the "before" ref; the "after" tree is this one)

const { chromium } = require('playwright');
const path = require('path');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!opt('--base')) {
  console.error('usage: node tests/bench_runs_interleaved.js --base DIR [--rounds 11] [--states tx,ca,...]');
  process.exit(2);
}
const base = path.resolve(opt('--base')), head = path.resolve(__dirname, '..');
const rounds = Number(opt('--rounds', 11));
const STATES = opt('--states', 'tx,ca,ny,pa,ct,wa').split(',');
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

(async () => {
  const browser = await chromium.launch();
  const open = async (root) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    await page.goto('file://' + path.join(root, 'Planner_US.html'));
    await page.waitForTimeout(300);
    return page;
  };
  const pages = { base: await open(base), head: await open(head) };
  for (const code of STATES) {
    const t = { base: { std: [], hist: [] }, head: { std: [], hist: [] } };
    for (let r = 0; r < rounds; r++)
      for (const k of r % 2 ? ['head', 'base'] : ['base', 'head']) {
        const o = await pages[k].evaluate((code) => {
          const st = window.__test_getState();
          st.stateTax = code;
          if (window.__test_refreshCliffPlan) window.__test_refreshCliffPlan();
          const simulate = window.__test_simulateRaw || window.__test_simulate,
            simulateHistorical = window.__test_simulateHistoricalRaw || window.__test_simulateHistorical;
          let t0 = performance.now();
          for (let i = 0; i < 400; i++) simulate(55 + (i % 8), 55 + ((i >> 3) % 8));
          const std = performance.now() - t0;
          t0 = performance.now();
          const H = window.__test_HIST;
          for (let i = 0; i < 120; i++) simulateHistorical((y) => H[(i % 30) + y]);
          return { std, hist: performance.now() - t0 };
        }, code);
        t[k].std.push(o.std);
        t[k].hist.push(o.hist);
      }
    const p = (a, b) => ((median(a) / median(b) - 1) * 100).toFixed(1);
    console.log(`US ${code.padEnd(3)} 400 simulate ${median(t.base.std).toFixed(0)} -> ${median(t.head.std).toFixed(0)} ms (${p(t.head.std, t.base.std)}%), 120 historical ${median(t.base.hist).toFixed(0)} -> ${median(t.head.hist).toFixed(0)} ms (${p(t.head.hist, t.base.hist)}%)`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
