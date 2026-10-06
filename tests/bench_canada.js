// Canada timing gate (Batch 7N): the previous commit's Planner_Canada.html against the working tree,
// interleaved in ONE process (each tree in its own page, rounds alternate, so machine drift hits both),
// 300 simulate() per round, median of 7, for ON / BC / QC and two households (the stock plan, and a 66-year-old
// retired couple with OAS and a large RRSP, which exercises the 65+ paths). Not part of `npm test`.
// Wall-clock noise is about 10 percent: repeat any ratio over 1.05 before acting on it.
//
//   node tests/bench_canada.js --base DIR [--rounds 7] [--runs 300] [--provinces on,bc,qc]
//   (--base: a `git worktree` of the "before" ref)

const { chromium } = require('playwright');
const path = require('path');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = path.resolve(opt('--base', ''));
const NEW = path.resolve(__dirname, '..');
const ROUNDS = Number(opt('--rounds', 7)), RUNS = Number(opt('--runs', 300));
const PROVINCES = opt('--provinces', 'on,bc,qc').split(',');
const HOUSEHOLDS = {
  stock: {},
  'retired 66 with OAS': { ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66, lifeExpectancyA: 92, lifeExpectancyB: 92, traditional: 1500000, taxable: 300000, roth: 200000, spending: 90000, pensionSplitEnabled: false },
};

async function open(browser, root) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.join(root, 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  return page;
}
const round = (page, patch, province, runs) =>
  page.evaluate(({ patch, province, runs }) => {
    const st = window.__test_getState();
    Object.assign(st, patch, { province });
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) window.__test_simulate(st.retireAgeA + (i % 3), st.retireAgeB + ((i >> 2) % 3));
    return performance.now() - t0;
  }, { patch, province, runs });
const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];

(async () => {
  if (!opt('--base', '')) throw new Error('pass --base <worktree of the previous commit>');
  const browser = await chromium.launch();
  const before = await open(browser, BASE), after = await open(browser, NEW);
  for (const [name, patch] of Object.entries(HOUSEHOLDS))
    for (const province of PROVINCES) {
      await round(before, patch, province, 20); await round(after, patch, province, 20); // warm up
      const b = [], a = [];
      for (let r = 0; r < ROUNDS; r++) { b.push(await round(before, patch, province, RUNS)); a.push(await round(after, patch, province, RUNS)); }
      const mb = median(b), ma = median(a);
      console.log(`${name.padEnd(20)} ${province}  ${mb.toFixed(0).padStart(5)} ms -> ${ma.toFixed(0).padStart(5)} ms  ratio ${(ma / mb).toFixed(2)}`);
    }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
