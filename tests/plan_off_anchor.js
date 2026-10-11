// Regression anchor for the cliff plan (spec section 8): with `cliffGuardEnabled: false`, every US snapshot scenario is
// byte-identical to the same scenario with the guard off in another tree. The baseline is any tree at or after 5eb30fa (V120,
// the IRMAA MAGI fix); 3ebee0e was the baseline up to ce5fb56 (the IRMAA fix moved 204 guard-off scenarios by design:
// 339 identical, 204 different against 3ebee0e).
// E3 Task 1 (the lookback's filing status) moved 38 guard-off scenarios by design: 539 identical, 38 different against
// bbef775 (the baseline is now any tree at or after the E3 Task 1 commit).
//
// Usage: node tests/plan_off_anchor.js --base DIR   (DIR holds the reference Planner_US.html)
// Prints the count identical / different and the first differing scenarios; exits 1 on any difference. Not in `npm test`.

const { chromium } = require('playwright');
const path = require('path');
const { scenarios } = require('./snapshot_scenarios');
const { legacyToAccounts } = require('./legacy_balances');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
if (!opt('--base')) {
  console.error('usage: node tests/plan_off_anchor.js --base DIR');
  process.exit(2);
}
const BASE = path.resolve(opt('--base'));
const HERE = path.resolve(__dirname, '..');

// resetState, rowFnFor and canon are copied from tests/snapshot.js (keep them in step).
const PAGE_RUNNER = `(() => {
  const state = window.__test_getState();
  const base = JSON.parse(JSON.stringify(state));
  const legacyToAccounts = ${legacyToAccounts.toString()};
  const HAS_ACCOUNTS = base.trad401kA !== undefined;
  const HIST = window.__test_HIST;

  function resetState(patch) {
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, JSON.parse(JSON.stringify(base)), JSON.parse(JSON.stringify(HAS_ACCOUNTS ? legacyToAccounts(patch, base) : patch)));
    if (window.__test_setRothOverride) window.__test_setRothOverride(null);
    if (window.__test_setWithdrawalMixOverride) window.__test_setWithdrawalMixOverride(null);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rowFnFor(series) {
    const wrap = (i) => HIST[((i % HIST.length) + HIST.length) % HIST.length];
    switch (series.type) {
      case 'real': {
        const i0 = series.start - HIST[0][0];
        return (y) => wrap(i0 + y);
      }
      case 'crashFirst':
        return (y) => [2000 + y, [-30, -18, -5][y] ?? 9, y < 3 ? -3 : 3, y < 3 ? 6 : 4, y < 3 ? 2 : 4.5];
      case 'sawtooth':
        return (y) => [2000 + y, y % 2 ? -15 : 25, 3, y % 2 ? 6 : 2, 4];
      case 'boom':
        return (y) => [2000 + y, 15, 2, 3, null].slice(0, 4);
      case 'flat':
        return (y) => [2000 + y, 0, 0, 0, 0];
      case 'mc': {
        const rnd = mulberry32(series.seed), B = 5, out = [];
        const maxStart = HIST.length - B;
        while (out.length < 120) {
          const s = Math.floor(rnd() * (maxStart + 1));
          for (let i = 0; i < B; i++) out.push(HIST[s + i]);
        }
        return (y) => out[y];
      }
    }
    throw new Error('unknown series ' + series.type);
  }

  function canon(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined && typeof v[k] !== 'function') o[k] = canon(v[k]);
      return o;
    }
    return v;
  }

  function run(sc) {
    try {
      resetState({ ...sc.patch, cliffGuardEnabled: false });
      const res = sc.kind === 'std'
        ? window.__test_simulate(state.retireAgeA + sc.shift, state.retireAgeB + sc.shift)
        : window.__test_simulateHistorical(rowFnFor(sc.series));
      return JSON.stringify(canon(res));
    } catch (e) {
      return 'error: ' + String((e && e.message) || e);
    }
  }
  window.__anchor = { runBatch: (batch) => batch.map(run) };
  return true;
})()`;

async function runTree(browser, root, list) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.join(root, 'Planner_US.html'));
  await page.waitForTimeout(300);
  await page.evaluate(PAGE_RUNNER);
  const out = [];
  for (let i = 0; i < list.length; i += 20) out.push(...(await page.evaluate((b) => window.__anchor.runBatch(b), list.slice(i, i + 20))));
  await ctx.close();
  if (errors.length) throw new Error(`${root}: page errors: ${errors.join('; ')}`);
  return out;
}

(async () => {
  const list = scenarios(true);
  const browser = await chromium.launch();
  let a, b;
  try {
    a = await runTree(browser, BASE, list);
    b = await runTree(browser, HERE, list);
  } finally {
    await browser.close();
  }
  const diff = [];
  list.forEach((sc, i) => {
    if (a[i] !== b[i] || a[i].startsWith('error:')) diff.push(sc.name + (a[i].startsWith('error:') ? ' (' + a[i] + ')' : b[i].startsWith('error:') ? ' (' + b[i] + ')' : ''));
  });
  console.log(`plan_off_anchor: ${list.length - diff.length} identical, ${diff.length} different (guard off, ${BASE} vs this tree)`);
  diff.slice(0, 25).forEach((n) => console.log('  ' + n));
  process.exit(diff.length ? 1 : 0);
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
