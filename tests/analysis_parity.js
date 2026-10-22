// Analysis parity for the stateless-engine refactor: every analysis function (the tornado, the decision questions, the
// shortfall searches, the CAGR sweep, the unusual-assumption impacts, the Roth optimizers and their card, the after-tax end
// value) gives byte-identical results in this tree and in a base tree, for each household, both after a refresh of the cliff
// plan and without one (window.__test_analysisBundle, src/shared/ui/install-test-hooks.js). The base must have the hook
// (the stage 1 commit or later).
//
// Usage: node tests/analysis_parity.js --base DIR [--households default,survivor,...]
//   DIR holds the reference build (DIR/dist/Planner_*.html, or the files at DIR itself). --households keeps only the
//   named households (in either country); an unknown name or an empty list exits 1.
// Prints identical / different per household and pass, with the first differing key; exits 1 on any difference or when a
// self-check fails (in either tree):
//   - PLAN_G58, PLAN_G62 and PLAN_G58_SCHED keep a plan with at least one intent;
//   - PLAN_G58's refresh and no-refresh tornado results differ (the no-refresh pass plans the variants for themselves);
//   - PLAN_G58_SCHED's no-refresh multi-lever result differs from the same call with the first trial planned with the
//     override maps null (the trials' planning depends on the maps).
// Not in `npm test`.

const { chromium } = require('playwright');
const path = require('path');
const { plannerPath } = require('./helpers/planner-path');
const { households, PLAN_G58_SCHED, DEPLETING } = require('./helpers/plan-households');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
if (!opt('--base')) {
  console.error('usage: node tests/analysis_parity.js --base DIR [--households a,b,...]');
  process.exit(2);
}
const BASE = path.resolve(opt('--base'));
const HERE = path.resolve(__dirname, '..');

const PLAN_HOUSEHOLDS = ['PLAN_G58', 'PLAN_G62', 'PLAN_G58_SCHED'];
const LISTS = {
  us: [...households(true), ['PLAN_G58_SCHED', PLAN_G58_SCHED], ['depleting', DEPLETING]],
  canada: [...households(false), ['depleting', DEPLETING]],
};
if (args.includes('--households')) {
  const raw = opt('--households');
  const names = raw && !raw.startsWith('--') ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const known = new Set([...LISTS.us, ...LISTS.canada].map(([n]) => n));
  const unknown = names.filter((n) => !known.has(n));
  if (!names.length || unknown.length) {
    console.error(!names.length ? '--households: no household named' : `--households: unknown ${unknown.join(', ')} (known: ${[...known].join(', ')})`);
    process.exit(1);
  }
  for (const c of Object.keys(LISTS)) LISTS[c] = LISTS[c].filter(([n]) => names.includes(n));
}

// One tree, one country: for each household, (a) replace the state, refresh the plan (US), bundle; (b) replace the state
// again with no refresh, bundle. Returns { name: { refresh, noRefresh, intents, control } } (bundles as JSON text).
async function runTree(browser, root, country, list) {
  const file = country === 'us' ? 'Planner_US.html' : 'Planner_Canada.html';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + plannerPath(file, root));
  await page.waitForTimeout(300);
  const ok = await page.evaluate(() => typeof window.__test_analysisBundle === 'function' && typeof window.__test_replaceState === 'function');
  if (!ok) throw new Error(`${root}: ${file} has no __test_analysisBundle (build a tree at or after the stage 1 commit)`);
  const out = {};
  for (const [name, patch] of list) {
    const r = await page.evaluate(
      ({ name, patch, isUS, control }) => {
        window.__test_replaceState(patch);
        let intents = null;
        if (isUS) {
          const kept = window.__test_refreshCliffPlan().plan;
          intents = kept ? Object.keys(kept.intents).length : 0;
        }
        const refresh = JSON.stringify(window.__test_analysisBundle());
        window.__test_replaceState(patch);
        const b = window.__test_analysisBundle(control ? { planningControl: true } : undefined);
        let ctl = null;
        if (control) {
          ctl = { normal: JSON.stringify(b.us.multiLever.real), control: JSON.stringify(b.us.planningControl.multiLever) };
        }
        return { refresh, noRefresh: JSON.stringify(b), intents, control: ctl };
      },
      { name, patch, isUS: country === 'us', control: country === 'us' && name === 'PLAN_G58_SCHED' },
    );
    out[name] = r;
    process.stdout.write('.');
  }
  await ctx.close();
  if (errors.length) throw new Error(`${root}: page errors: ${errors.join('; ')}`);
  return out;
}

// The path of the first difference between two JSON texts (parsed), e.g. "sensitivity.real.results[3].high".
function firstDiff(a, b, p = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object' || Array.isArray(a) !== Array.isArray(b))
    return `${p || '(root)'}: ${JSON.stringify(a)?.slice(0, 120)} vs ${JSON.stringify(b)?.slice(0, 120)}`;
  if (Array.isArray(a)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = firstDiff(a[i], b[i], `${p}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], p ? `${p}.${k}` : k);
    if (d) return d;
  }
  return null;
}

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  const fail = (msg) => {
    failed = true;
    console.log('  FAIL ' + msg);
  };
  try {
    for (const country of ['us', 'canada']) {
      const list = LISTS[country];
      if (!list.length) continue;
      process.stdout.write(`${country}: base `);
      const a = await runTree(browser, BASE, country, list);
      process.stdout.write(' head ');
      const b = await runTree(browser, HERE, country, list);
      process.stdout.write('\n');
      for (const [name] of list) {
        for (const pass of ['refresh', 'noRefresh']) {
          const same = a[name][pass] === b[name][pass];
          console.log(`  ${country} ${name} (${pass === 'refresh' ? 'refresh' : 'no refresh'}): ${same ? 'identical' : 'different'}`);
          if (!same) {
            failed = true;
            console.log('    first difference: ' + firstDiff(JSON.parse(a[name][pass]), JSON.parse(b[name][pass])));
          }
        }
      }
      if (country !== 'us') continue;
      // Self-checks, in each tree.
      for (const [tree, res] of [['base', a], ['head', b]]) {
        for (const name of PLAN_HOUSEHOLDS) {
          if (!res[name]) continue;
          if (!(res[name].intents > 0)) fail(`${tree}: ${name} no longer plans (${res[name].intents} intents); pick another plan household`);
        }
        if (res.PLAN_G58) {
          const s1 = JSON.stringify(JSON.parse(res.PLAN_G58.refresh).sensitivity);
          const s2 = JSON.stringify(JSON.parse(res.PLAN_G58.noRefresh).sensitivity);
          if (s1 === s2) fail(`${tree}: PLAN_G58's refresh and no-refresh tornado results are the same (the no-refresh pass no longer plans the variants for themselves)`);
          else console.log(`  self-check ${tree}: PLAN_G58 tornado differs between refresh and no refresh (ok)`);
        }
        if (res.PLAN_G58_SCHED) {
          const c = res.PLAN_G58_SCHED.control;
          if (c.normal === c.control) fail(`${tree}: PLAN_G58_SCHED's multi-lever result does not depend on the maps its trials are planned with; vary the schedules`);
          else console.log(`  self-check ${tree}: PLAN_G58_SCHED multi-lever differs from the maps-null planning control (ok)`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(failed ? 'analysis_parity: FAILED' : 'analysis_parity: all identical, self-checks pass');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
