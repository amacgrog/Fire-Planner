// Batch 5 step 5 Task 7: the cost of a full (deferred) planning per input change. Per gap household (tests/unit/helpers/scan-grid.mjs
// GAP_CASES, life 75 and 100) with the withdrawal-mix toggle off and on, one cold page per household (clock pinned to 2026-06-15):
// 9 rounds x 3 input changes (the spending field +7 dollars each time, a state the plan cache has not seen), each timed as
// window.__test_refreshCliffPlan() (the whole planning, sizing as shipped). Median of the 27 per row. A tree is one
// dist/Planner_US.html; with --base DIR the "before" tree runs the same rows first and the table shows both. Not part of `npm test`.
//
//   node tests/bench_planning.js [--base DIR] [--rounds 9] [--household NAME] [--out FILE.json]
//   (--base: a `git worktree` of the "before" ref, built; the "after" tree is this one; --household keeps the gap cases whose
//   name contains NAME; --rounds N is the number of 3-change rounds, 27 samples at the default 9)

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const head = path.resolve(__dirname, '..');
const trees = [];
if (opt('--base')) trees.push(['base', path.resolve(opt('--base'))]);
trees.push(['head', head]);
const ROUNDS = Number(opt('--rounds', 9));
const FILTER = opt('--household', '');
const OUT = opt('--out', '');
const STORAGE_KEY = 'fireCouplePlanner.massachusettsOffline.v1';
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

(async () => {
  const { GAP_CASES } = await import(pathToFileURL(path.join(__dirname, 'unit/helpers/scan-grid.mjs')).href);
  const browser = await chromium.launch();
  console.log(`node ${process.version}, chromium ${browser.version()}, cores ${require('os').cpus().length} (${require('os').cpus()[0].model})`);
  const out = [];
  let failed = false;
  for (const g of GAP_CASES) {
    if (FILTER && !g.name.includes(FILTER)) continue;
    for (const life of [75, 100]) for (const toggle of [false, true]) for (const [tree, root] of trees) {
      const name = `${(g.name.match(/\((\w+)\)/) || [, g.name])[1]} @${life} toggle ${toggle ? 'on' : 'off'}`;
      const patch = { ...g.patch(life, life), withdrawalMixEnabled: toggle };
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(pathToFileURL(plannerPath('Planner_US.html', root)).href);
      await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify({ state: patch, mode: 'real' })]);
      await page.reload();
      await page.waitForFunction(() => typeof window.__test_refreshCliffPlan === 'function');
      const r = await page.evaluate((rounds) => {
        window.__test_flushRender();
        const raw = JSON.parse(localStorage.getItem('fireCouplePlanner.massachusettsOffline.v1')).state;
        const spend0 = Number(raw.spending || 0);
        const t = [];
        let i = 0;
        for (let r = 0; r < rounds; r++) for (let j = 0; j < 3; j++) {
          i++;
          window.__test_replaceState({ ...raw, spending: spend0 + i * 7 });
          const t0 = performance.now();
          window.__test_refreshCliffPlan();
          t.push(performance.now() - t0);
        }
        return t;
      }, ROUNDS);
      await context.close();
      const s = r.slice().sort((a, b) => a - b);
      out.push({ name, tree, median: med(r), times: r, errors });
      if (errors.length) failed = true;
      console.log(`${tree.padEnd(4)} ${name.padEnd(26)} median ${med(r).toFixed(1)} ms (min ${s[0].toFixed(1)}, max ${s[s.length - 1].toFixed(1)})${errors.length ? ' ERR ' + errors.join('|') : ''}`);
      if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    }
  }
  await browser.close();
  if (trees.length > 1) {
    console.log('\n| Row | base | head |');
    console.log('|---|---|---|');
    for (const o of out.filter((o) => o.tree === 'base')) {
      const h = out.find((x) => x.tree === 'head' && x.name === o.name);
      const p = (h.median / o.median - 1) * 100;
      console.log(`| ${o.name} | ${o.median.toFixed(1)} | ${h.median.toFixed(1)} (${p >= 0 ? '+' : ''}${p.toFixed(1)}%) |`);
    }
  }
  if (failed) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
