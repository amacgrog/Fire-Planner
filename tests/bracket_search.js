// Bracket search guard (Batch 5 step 3a, spec A5.3): over the scan grid's conversions-on, default-order households (384) plus the
// first 48 of them with Rhode Island and with Pennsylvania (owner decision 16), the kept plan (bracket search on) against the
// user's-bracket plan (search off) on the standard projection: never an earlier depletion, never an earlier first draw on home
// equity (null = never = latest, for both). Exit 1 otherwise. Prints its seconds (target under 60).
const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const RI_PA_COUNT = 48;

(async () => {
  const t0 = Date.now();
  const { scanHouseholds } = await import(pathToFileURL(path.resolve(__dirname, 'unit/helpers/scan-grid.mjs')).href);
  const base = scanHouseholds({ conversions: true, mode: 'default' });
  const items = [...base];
  for (const stateTax of ['ri', 'pa'])
    for (const x of base.slice(0, RI_PA_COUNT)) items.push({ name: `${x.name}; ${stateTax.toUpperCase()}`, patch: { ...x.patch, stateTax }, g: x.g });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(plannerPath('Planner_US.html', ROOT)).href);
  await page.waitForTimeout(300);
  const failures = [];
  let moved = 0;
  const CHUNK = 24;
  for (let i = 0; i < items.length; i += CHUNK) {
    const out = await page.evaluate((patches) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      const was = window.__test_setBracketSearch(true);
      try {
        return patches.map((patch) => {
          Object.assign(st, patch);
          const read = () => { window.__test_refreshCliffPlan(); const s = window.__test_simulateRaw(); return { dep: s.depletedAge, home: s.homeDrawAge }; };
          window.__test_setBracketSearch(true);
          const on = read();
          const bracket = window.__test_cliffPlanState().bracket;
          window.__test_setBracketSearch(false);
          const off = read();
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, JSON.parse(JSON.stringify(saved)));
          return { on, off, bracket };
        });
      } finally {
        window.__test_setBracketSearch(was);
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
        window.__test_refreshCliffPlan();
      }
    }, items.slice(i, i + CHUNK).map((x) => x.patch));
    out.forEach((o, j) => {
      const never = (d) => (d == null ? Infinity : d);
      if (o.on.home === undefined || o.off.home === undefined) failures.push('homeDrawAge missing on the run: ' + items[i + j].name);
      if (o.on.dep !== o.off.dep || o.on.home !== o.off.home) moved++;
      if (never(o.on.dep) < never(o.off.dep)) failures.push(`earlier depletion ${o.on.dep} (kept ${o.bracket}%) vs ${o.off.dep}: ${items[i + j].name}`);
      if (never(o.on.home) < never(o.off.home)) failures.push(`earlier first home draw ${o.on.home} (kept ${o.bracket}%) vs ${o.off.home}: ${items[i + j].name}`);
    });
  }
  await browser.close();
  if (errors.length) failures.push('page errors: ' + errors.join('; '));
  const secs = (Date.now() - t0) / 1000;
  console.log(`bracket_search: ${items.length} households (${base.length} + ${RI_PA_COUNT} RI + ${RI_PA_COUNT} PA), ${moved} with a different depletion or first home draw, ${secs.toFixed(1)} s`);
  if (failures.length) {
    console.error('FAIL:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('OK: the kept plan never depletes, or first draws on the house, earlier than the user\'s bracket');
})();
