// Batch 5 step 5 Task 4: Optimize wall time (window.__test_optimizePlan: the search and the four rates) on the gap households
// (tests/unit/helpers/scan-grid.mjs GAP_CASES) at life 75 and 100, both objectives. A cold page per measurement (fresh context,
// household loaded through the autosave, the deferred pass flushed, clock pinned to 2026-06-15); the configs interleave within
// each round: the "before" tree (--base DIR, its dist/Planner_US.html) and this tree at k = 1, 2, 3 sized trials
// (window.__test_setSizedTrials). Median of the rounds per cell, printed as a table. Not part of `npm test`.
//
//   node tests/bench_optimize.js --base DIR [--rounds 3] [--household NAME] [--out FILE.json]
//   (--base: a `git worktree` of the "before" ref, built; --household keeps the gap cases whose name contains NAME, e.g. a
//   short test run is `--rounds 1 --household <part of a name>`)

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!opt('--base')) {
  console.error('usage: node tests/bench_optimize.js --base DIR [--rounds 3] [--household NAME] [--out FILE.json]');
  process.exit(2);
}
const base = path.resolve(opt('--base')), head = path.resolve(__dirname, '..');
const ROUNDS = Number(opt('--rounds', 3));
const FILTER = opt('--household', '');
const OUT = opt('--out', '');
const STORAGE_KEY = 'fireCouplePlanner.massachusettsOffline.v1';
const url = (root) => pathToFileURL(plannerPath('Planner_US.html', root)).href;
const CONFIGS = [['base', url(base), null], ['k1', url(head), 1], ['k2', url(head), 2], ['k3', url(head), 3]];
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

(async () => {
  const { GAP_CASES } = await import(pathToFileURL(path.join(__dirname, 'unit/helpers/scan-grid.mjs')).href);
  const HH = [];
  for (const g of GAP_CASES) {
    if (FILTER && !g.name.includes(FILTER)) continue;
    for (const life of [75, 100]) HH.push({ name: `${(g.name.match(/\((\w+)\)/) || [, g.name])[1]} @${life}`, patch: g.patch(life, life) });
  }
  if (!HH.length) { console.error(`no gap household matches "${FILTER}"`); process.exit(2); }
  const browser = await chromium.launch();
  const recs = [];
  console.log(`node ${process.version}, chromium ${browser.version()}, cores ${require('os').cpus().length} (${require('os').cpus()[0].model})`);
  for (let round = 0; round < ROUNDS; round++)
    for (const h of HH)
      for (const objective of ['endValue', 'lifetimeCost'])
        for (const [cfg, u, k] of CONFIGS) {
          const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
          const page = await context.newPage();
          await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await page.goto(u);
          await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
          await page.evaluate(([key, v]) => localStorage.setItem(key, v), [STORAGE_KEY, JSON.stringify({ state: h.patch, mode: 'real' })]);
          await page.reload();
          await page.waitForFunction(() => typeof window.__test_optimizePlan === 'function');
          const r = await page.evaluate(([objective, k]) => {
            window.__test_flushRender();
            if (k !== null) window.__test_setSizedTrials(k);
            const t0 = performance.now();
            const x = window.__test_optimizePlan(objective);
            const ms = performance.now() - t0;
            return { ms, winner: x.winner, plannings: x.plannings, sizedCount: x.sizedCount === undefined ? null : x.sizedCount, gain: x.gain };
          }, [objective, k]);
          await context.close();
          recs.push({ round, hh: h.name, objective, cfg, ...r, errors });
          console.log(`r${round} ${h.name.padEnd(8)} ${objective.padEnd(12)} ${cfg.padEnd(5)} ${r.ms.toFixed(0).padStart(6)} ms  ${r.winner} plannings ${r.plannings} sized ${r.sizedCount} gain ${r.gain.toFixed(0)}${errors.length ? ' ERR ' + errors.join('|') : ''}`);
          if (OUT) fs.writeFileSync(OUT, JSON.stringify(recs, null, 1));
        }
  await browser.close();
  console.log('\n| Household | Objective | base | k=1 | k=2 | k=3 |');
  console.log('|---|---|---|---|---|---|');
  for (const h of HH)
    for (const objective of ['endValue', 'lifetimeCost']) {
      const m = Object.fromEntries(CONFIGS.map(([c]) => [c, med(recs.filter((r) => r.hh === h.name && r.objective === objective && r.cfg === c).map((r) => r.ms))]));
      const d = (c) => { const p = (m[c] / m.base - 1) * 100; return `${m[c].toFixed(0)} (${p >= 0 ? '+' : ''}${p.toFixed(1)}%)`; };
      console.log(`| ${h.name} | ${objective} | ${m.base.toFixed(0)} | ${d('k1')} | ${d('k2')} | ${d('k3')} |`);
    }
  if (recs.some((r) => r.errors.length)) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
