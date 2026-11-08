// Conversion sizing guard (Batch 5 step 5b piece 3, spec B9 / B0.8): over the scan grid's conversions-on, default-order households
// (384), the plan with the per-year conversion sizing on against the same plan with it off (the bracket search on in both) on the
// standard projection: never an earlier depletion, never an earlier first draw on home equity (null = never = latest, for both).
// Exit 1 otherwise, and also when the check is vacuous (Fable I-2): no household's sized planning carries report.sized (the
// whole-run pass never ran), or none keeps a sized plan, or the kept count falls below FLOOR (the keep floor, spec 4.3 D: 90% of
// the count measured when it was set, rounded down). Prints how many households keep a sized plan (the kept ratio), the pass's
// apply runs (report.sized.tried) and accepted ages in all, the households whose plan is the no-conversion candidate (report.sized.noConvKept,
// information: the kept count and FLOOR count the pass's own keeps, report.sized.kept), the planning's wall time with sizing on, and its seconds (target
// under 60; spec B0.11.5).
//
//   node tests/conversion_sizing.js [--root DIR] [--dump FILE.json] [--start-search off|quick|thorough]
//
// --root DIR measures the build of another tree (DIR/dist/Planner_US.html, as solver_scan.js has). --dump FILE writes, per household,
// { id, mode, runOut, firstHomeDraw, endValue, conv, inv, path } for the sizing-on plan (id: the household's description, never a grid index; runOut and
// firstHomeDraw: an age or null for never; endValue: the after-tax end value of the plan's run through __test_runPlanMode({ endValue: true });
// conv, inv: that run's yearly Roth conversions and investable end balances in whole dollars; path: a hash of the whole yearly path, tests/helpers/path-fingerprint.js),
// for tests/compare_household_dumps.js. The output and the exit code are the same with or without the flags.
// --start-search MODE (the conversion start-age search, plan 2026-11-08-conversion-start-search.md) sets rothConvStartSearch to MODE on
// every household (both plannings; only the sizing-on one reaches the search) and adds one line: the households whose sized planning
// kept a start (report.sized.starts.kept), each with its start, and the most starts one planning tried (information only: no gate).
// Without it the households keep the --root tree's default, and the output and the exit code are as before.
const { chromium } = require('playwright');
// The keep floor (spec 4.3, D; Batch 5 follow-ups S3, PR 3 ruling 30): the tip 6bab805 (2026-11-02, Task 9r) kept 145 sized
// plans over these 384 households; 90% of it, rounded down: floor(0.9 x 145) = 130. A change that keeps fewer fails here.
const FLOOR = 130;
const { plannerPath } = require('./helpers/planner-path');
const { installPathFingerprint } = require('./helpers/path-fingerprint');
const path = require('path');
const { pathToFileURL } = require('url');

const fs = require('fs');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const DUMP = opt('--dump', null);
const START_SEARCH = opt('--start-search', null);
if (START_SEARCH !== null && !['off', 'quick', 'thorough'].includes(START_SEARCH)) throw new Error('--start-search: off, quick or thorough');

(async () => {
  const t0 = Date.now();
  const { scanHouseholds } = await import(pathToFileURL(path.resolve(__dirname, 'unit/helpers/scan-grid.mjs')).href);
  const items = scanHouseholds({ conversions: true, mode: 'default' });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (DUMP) await installPathFingerprint(page);
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(plannerPath('Planner_US.html', ROOT)).href);
  await page.waitForFunction(() => typeof window.__test_setConversionSizing === 'function');
  const failures = [];
  const dump = [];
  let keptCount = 0, noConvCount = 0, ranCount = 0, moved = 0, sizedYears = 0, tried = 0, accepted = 0, budgetHits = 0, onMs = 0;
  const startsKept = [];
  let maxStartsTried = 0;
  const CHUNK = 24;
  for (let i = 0; i < items.length; i += CHUNK) {
    const out = await page.evaluate(({ patches, wantValue }) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      const wasSizing = window.__test_setConversionSizing(false);
      try {
        return patches.map((patch) => {
          Object.assign(st, patch);
          const read = () => {
            const { plan, report } = window.__test_refreshCliffPlan();
            const s = window.__test_simulateRaw();
            const sz = report && report.sized;
            return { plan, dep: s.depletedAge, home: s.homeDrawAge, ran: !!sz, kept: !!(sz && sz.kept), tried: sz ? sz.tried : 0, accepted: sz ? sz.accepted : 0, budgetHit: !!(sz && sz.budgetHit), noConv: !!(sz && sz.noConvKept), nConv: plan && plan.conv ? Object.keys(plan.conv).length : 0, startKept: sz && sz.starts ? sz.starts.kept : null, startsTried: sz && sz.starts ? sz.starts.tried.length : 0 };
          };
          window.__test_setConversionSizing(true);
          const t0 = performance.now();
          const on = read();
          on.ms = performance.now() - t0;
          // --dump only, outside the timed span: the after-tax end value of the sizing-on plan's run
          if (wantValue) {
            const run = window.__test_runPlanMode({ planMode: on.plan ? 'apply' : 'off', plan: on.plan, endValue: true });
            on.endValue = run.value;
            Object.assign(on, window.__pathFp(run.rows));
          } else on.endValue = null;
          delete on.plan;
          window.__test_setConversionSizing(false);
          const off = read();
          delete off.plan;
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, JSON.parse(JSON.stringify(saved)));
          return { on, off };
        });
      } finally {
        window.__test_setConversionSizing(wasSizing);
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
        window.__test_refreshCliffPlan();
      }
    }, { patches: items.slice(i, i + CHUNK).map((x) => (START_SEARCH === null ? x.patch : { ...x.patch, rothConvStartSearch: START_SEARCH })), wantValue: !!DUMP });
    out.forEach((o, j) => {
      const never = (d) => (d == null ? Infinity : d);
      dump.push({ id: items[i + j].name, mode: 'default', runOut: o.on.dep == null ? null : o.on.dep, firstHomeDraw: o.on.home == null ? null : o.on.home, endValue: o.on.endValue, conv: o.on.conv, inv: o.on.inv, path: o.on.path });
      if (o.on.home === undefined || o.off.home === undefined) failures.push('homeDrawAge missing on the run: ' + items[i + j].name);
      if (o.off.kept) failures.push('a sized plan kept with the switch off: ' + items[i + j].name);
      if (o.on.ran) ranCount++;
      tried += o.on.tried;
      accepted += o.on.accepted;
      if (o.on.budgetHit) budgetHits++;
      if (o.on.noConv) noConvCount++;
      if (o.on.startKept != null) startsKept.push(`${items[i + j].name} (start ${o.on.startKept})`);
      if (o.on.startsTried > maxStartsTried) maxStartsTried = o.on.startsTried;
      onMs += o.on.ms;
      if (o.on.kept) {
        keptCount++;
        sizedYears += o.on.nConv;
      }
      if (o.on.dep !== o.off.dep || o.on.home !== o.off.home) moved++;
      if (never(o.on.dep) < never(o.off.dep)) failures.push(`earlier depletion ${o.on.dep} (sized, ${o.on.nConv} years) vs ${o.off.dep}: ${items[i + j].name}`);
      if (never(o.on.home) < never(o.off.home)) failures.push(`earlier first home draw ${o.on.home} (sized, ${o.on.nConv} years) vs ${o.off.home}: ${items[i + j].name}`);
    });
  }
  await browser.close();
  if (DUMP) fs.writeFileSync(DUMP, JSON.stringify(dump));
  if (errors.length) failures.push('page errors: ' + errors.join('; '));
  if (ranCount === 0) failures.push('vacuous: no household carries report.sized (the sizing pass never ran)');
  if (keptCount === 0) failures.push('vacuous: no household keeps a sized plan');
  if (keptCount < FLOOR) failures.push('the kept count ' + keptCount + ' fell below the floor ' + FLOOR);
  const secs = (Date.now() - t0) / 1000;
  console.log(`conversion_sizing: ${items.length} households, the pass ran on ${ranCount}, ${keptCount} keep a sized plan (${((100 * keptCount) / items.length).toFixed(1)}%; ${sizedYears} sized years), ${moved} with a different depletion or first home draw, ${secs.toFixed(1)} s`);
  console.log(`  the pass: ${tried} apply runs tried, ${accepted} ages accepted, the budget hit on ${budgetHits}; the no-conversion candidate kept on ${noConvCount}; planning with sizing on ${(onMs / 1000).toFixed(1)} s in all (mean ${(onMs / items.length).toFixed(0)} ms, with the read-back run)`);
  if (START_SEARCH !== null) console.log(`  start search ${START_SEARCH}: a start kept on ${startsKept.length}; at most ${maxStartsTried} starts tried in one planning${startsKept.length ? ':\n    ' + startsKept.join('\n    ') : ''}`);
  if (failures.length) {
    console.error('FAIL:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('OK: the sized plan never depletes, or first draws on the house, earlier than the same plan with sizing off');
})();
