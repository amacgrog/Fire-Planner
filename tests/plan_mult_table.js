// The lambda table (Batch 5 step 4a, spec section 9 / decision 5): on the gap table's three households at both plan lengths and
// a 48-household sample of the scan grid, the plan card's search (`__test_optimizePlan(objective)`, the per-phase lambda
// multipliers on MULT_GRID): per phase (before 65; 65 up to A's RMD start age; RMD years) the multiplier kept, the gain of the
// kept plan over the search's [1, 1, 1] start (the even-ranked planning at m = 1, in today's dollars on the objective), and the
// share of the phase's plan years whose lambda sample was moved (`movedSample` in `__test_planTrace()`, the standard `choose`
// run of the automatic plan at the user's bracket, m = 1). Step 5 decides the estimator from it. Measurement only: not a gate,
// not in `npm test`; about 2 minutes per objective.
//
// The sample: --sample every16 (default) is every 16th household of `scanHouseholds()` (Task 1's sample: index 0, 16, ...; the
// grid interleaves conversions off / on, so all 48 have conversions off); --sample conv is every 8th of the 384 conversions-on
// households (48). Phases: A's RMD start age by the rule of `rmdStartAge` (src/us/core/income/distributions.js), mirrored here and to be
// kept in step with it (75 when born 1960 or later, else 73; tax year 2026, the
// clock pinned to 2026-06-15); a phase the plan never reaches is printed as "-".
// Usage: node tests/plan_mult_table.js [--root DIR] [--objective endValue|lifetimeCost] [--sample every16|conv] [--no-gap] [--limit N]
const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const OBJECTIVE = opt('--objective', 'endValue');
if (OBJECTIVE !== 'endValue' && OBJECTIVE !== 'lifetimeCost') throw new Error(`--objective must be endValue or lifetimeCost, got ${OBJECTIVE}`);
const SAMPLE = opt('--sample', 'every16');
if (SAMPLE !== 'every16' && SAMPLE !== 'conv') throw new Error(`--sample must be every16 or conv, got ${SAMPLE}`);
const GAP = !args.includes('--no-gap');
const LIMIT = Number(opt('--limit', Infinity));

(async () => {
  const t0 = Date.now();
  const { GAP_CASES, scanHouseholds } = await import(pathToFileURL(path.resolve(__dirname, 'unit/helpers/scan-grid.mjs')).href);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(plannerPath('Planner_US.html', ROOT)).href);
  await page.waitForFunction(() => typeof window.__test_optimizePlan === 'function');
  const defaultLife = await page.evaluate(() => [window.__test_getState().lifeExpectancyA, window.__test_getState().lifeExpectancyB]);
  const items = [];
  if (GAP)
    for (const len of ['75', 'default']) {
      const [a, b] = len === 'default' ? defaultLife : [75, 75];
      for (const c of GAP_CASES) items.push({ group: 'gap', name: `${c.name}, ${a}`, patch: c.patch(a, b) });
    }
  const sample = SAMPLE === 'conv' ? scanHouseholds({ conversions: true }).filter((_, i) => i % 8 === 0) : scanHouseholds().filter((_, i) => i % 16 === 0);
  for (const h of sample.slice(0, LIMIT)) items.push({ group: 'sample', name: h.name, patch: h.patch });

  const rows = [];
  for (const it of items) {
    const out = await page.evaluate(({ patch, OBJECTIVE }) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      try {
        Object.assign(st, patch);
        const t1 = performance.now();
        const r = window.__test_optimizePlan(OBJECTIVE);
        const secs = (performance.now() - t1) / 1000;
        if (!r.plan) return { off: true };
        // rmdStartAge's rule (distributions.js) at tax year 2026, mirrored: keep in step with it.
        const rmdStart = 2026 - Math.round(st.ageA) >= 1960 ? 75 : 73;
        const phaseOf = (age) => (age < 65 ? 0 : age < rmdStart ? 1 : 2);
        // The plan years per phase and those whose lambda sample moved (the automatic plan's choose run, m = 1).
        const tr = window.__test_planTrace();
        const years = [0, 0, 0], moved = [0, 0, 0];
        for (const e of tr) {
          const p = phaseOf(st.ageA + e.year);
          years[p]++;
          if (e.movedSample) moved[p]++;
        }
        // The phases the search reaches (as optimizePlan counts them).
        const span = st.singlePerson ? Math.max(0, st.lifeExpectancyA - st.ageA) : Math.max(0, st.lifeExpectancyA - st.ageA, st.lifeExpectancyB - st.ageB);
        const reached = [false, false, false];
        for (let age = st.ageA; age <= st.ageA + span; age++) reached[phaseOf(age)] = true;
        // Today's dollars: the end value deflated over the projection (gainInTodaysDollars's factor); a cost is already real.
        const off = window.__test_runPlanMode({ planMode: 'off' });
        const f = Math.pow(1 + st.inflation / 100, off.rows.at(-1).year);
        const start = r.trials[0];
        const overStart = OBJECTIVE === 'endValue' ? (r.measure.value - start.measure.value) / f : start.measure.cost - r.measure.cost;
        return {
          winner: r.winner, mult: r.mult, gain: r.gain, overStart, plannings: r.plannings, secs, reached, years, moved,
          bracket: r.plan.bracket, baseBracket: r.base.plan.bracket, startMult: start.mult,
          dep: [r.measure.depletedAge, r.base.depletedAge], home: [r.measure.homeDrawAge, r.base.homeDrawAge],
        };
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { patch: it.patch, OBJECTIVE });
    rows.push({ it, out });
  }
  await browser.close();

  const fmt = (n) => (n == null ? 'never' : Math.round(n).toLocaleString('en-US'));
  const share = (o, p) => (o.years[p] ? `${o.moved[p]}/${o.years[p]} (${Math.round((100 * o.moved[p]) / o.years[p])}%)` : '0/0');
  const multOf = (o, p) => (!o.reached[p] ? '-' : String(o.mult ? o.mult[p] : 1));
  console.log(`\nThe lambda table (spec section 9), objective ${OBJECTIVE}, sample ${SAMPLE}\n`);
  for (const group of ['gap', 'sample']) {
    const list = rows.filter((r) => r.it.group === group);
    if (!list.length) continue;
    console.log(group === 'gap' ? 'Gap households (life 75 and the default)\n' : `Scan sample (${list.length} households)\n`);
    console.log(`| Household | Winner | Kept m: <65 / 65-RMD / RMD | Gain over [1,1,1] (today's $) | Gain over the automatic plan | movedSample years: <65 / 65-RMD / RMD | Bracket (auto) | Depletion / first home draw (auto) | Plannings | Seconds (search + the four rates) |`);
    console.log(`|---|---|---|---|---|---|---|---|---|---|`);
    for (const { it, out: o } of list) {
      if (o.off) { console.log(`| ${it.name} | guard off | | | | | | | | |`); continue; }
      console.log(`| ${it.name} | ${o.winner} | ${[0, 1, 2].map((p) => multOf(o, p)).join(' / ')} | ${fmt(o.overStart)} | ${fmt(o.gain)} | ${[0, 1, 2].map((p) => share(o, p)).join(' / ')} | ${o.bracket}% (${o.baseBracket}%) | ${fmt(o.dep[0])} / ${fmt(o.home[0])} (${fmt(o.dep[1])} / ${fmt(o.home[1])}) | ${o.plannings} | ${o.secs.toFixed(1)} |`);
    }
    // Per phase: how often each multiplier was kept (households reaching the phase), and the movedSample share among the
    // households that kept 1 and those that kept another value.
    const ok = list.filter((r) => !r.out.off).map((r) => r.out);
    console.log(`\nPer phase (${ok.length} households): households by the multiplier kept; movedSample share of the phase's plan years (all / kept m = 1 / kept m != 1)\n`);
    console.log(`| Phase | Reached | m = 0 | 0.5 | 1 | 1.5 | 2 | movedSample: all | kept 1 | kept != 1 |`);
    console.log(`|---|---|---|---|---|---|---|---|---|---|`);
    ['<65', '65-RMD', 'RMD'].forEach((label, p) => {
      const reach = ok.filter((o) => o.reached[p]);
      const m = (o) => (o.mult ? o.mult[p] : 1);
      const count = (v) => reach.filter((o) => m(o) === v).length;
      const pct = (set) => {
        const y = set.reduce((a, o) => a + o.years[p], 0), mv = set.reduce((a, o) => a + o.moved[p], 0);
        return y ? `${mv}/${y} (${Math.round((100 * mv) / y)}%)` : '-';
      };
      console.log(`| ${label} | ${reach.length} | ${[0, 0.5, 1, 1.5, 2].map(count).join(' | ')} | ${pct(reach)} | ${pct(reach.filter((o) => m(o) === 1))} | ${pct(reach.filter((o) => m(o) !== 1))} |`);
    });
    const wins = ok.filter((o) => o.winner === 'search');
    const gains = ok.map((o) => o.gain).sort((a, b) => a - b);
    console.log(`\nWinner search in ${wins.length} of ${ok.length} (with a multiplier other than [1,1,1]: ${wins.filter((o) => o.mult).length}); gain over the automatic plan max ${fmt(gains.at(-1))}, households gaining more than $1: ${gains.filter((g) => g > 1).length}; seconds max ${Math.max(...ok.map((o) => o.secs)).toFixed(1)}\n`);
  }
  if (errors.length) {
    console.error(`page errors: ${errors.join(' | ')}`);
    process.exitCode = 1;
  }
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
})();
