// Interleaved timing of one scenario in two trees, one process (CLAUDE.md: +-10% wall-clock noise between
// runs). Usage: node tests/bench_solver.js --base <worktree> [--rounds 7]
// Cliff plan: each round plans once for the scenario (outside the timing), then times the raw hooks; a tree without the plan
// hooks times the plain ones.
const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const { legacyToAccounts } = require('./legacy_balances');
const args = process.argv.slice(2);
const base = path.resolve(args[args.indexOf('--base') + 1]);
const rounds = Number(args.includes('--rounds') ? args[args.indexOf('--rounds') + 1] : 7);
const TX_P = { singlePerson: true, ageA: 55, retireAgeA: 55, acaEnabled: true, stateTax: 'tx', spending: 60000, taxable: 600000 };
const SCENARIOS = {
  'ACA early retiree (CA)': { retireAgeA: 50, retireAgeB: 50, ageA: 50, ageB: 50, acaEnabled: true, stateTax: 'ca' },
  // Batch 5 step 3a: the converting scenario (gate +30% against the same scenario on b544934): the plan is made with the bracket
  // search on in the head tree (outside the timing), so the timed runs are the kept plan's.
  'ACA early retiree (CA), conversions to 74 at 22%': { retireAgeA: 50, retireAgeB: 50, ageA: 50, ageB: 50, acaEnabled: true, stateTax: 'ca', rothConvEnabled: true, rothConvStartAge: 50, rothConvEndAge: 74, rothConvBracket: 22, cliffGuardEnabled: true },
  'default': {},
  // Batch 5 step 4b: a guard-on ACA household whose MAGI is gains-driven (spec 5).
  'early ACA single (TX), gains-driven': { ...TX_P, lifeExpectancyA: 100, rothConvEnabled: true, rothConvStartAge: 55, rothConvEndAge: 74, cliffGuardEnabled: true, ...legacyToAccounts({ traditional: 1200000, roth: 100000 }, TX_P) },
  // Batch 5 step 4c: a toggle-on household (spec 5).
  'early ACA single (TX), order lever': { ...TX_P, lifeExpectancyA: 100, rothConvEnabled: true, rothConvStartAge: 55, rothConvEndAge: 74, cliffGuardEnabled: true, withdrawalMixEnabled: true, ...legacyToAccounts({ traditional: 1200000, roth: 100000 }, TX_P) },
};
// Batch 5 step 4d: the two-return split household (SPLIT_H1 at life 100, the default), toggle on.
const { SPLIT_H1 } = require('./helpers/plan-households.js');
SCENARIOS['two-return split (TX), toggle on'] = { ...SPLIT_H1 };
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
(async () => {
  const browser = await chromium.launch();
  const open = async (root) => {
    const page = await browser.newPage();
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    await page.goto('file://' + plannerPath('Planner_US.html', root));
    await page.waitForTimeout(300);
    return page;
  };
  const pages = { base: await open(base), head: await open(path.resolve(__dirname, '..')) };
  for (const [name, patch] of Object.entries(SCENARIOS)) {
    const t = { base: { sim: [], mc: [] }, head: { sim: [], mc: [] } };
    for (let r = 0; r < rounds; r++)
      for (const k of r % 2 ? ['head', 'base'] : ['base', 'head']) {
        const out = await pages[k].evaluate((patch) => {
          // Each scenario starts from the planner's own defaults (the page's state at load), then its patch.
          const st = window.__test_getState();
          window.__benchBase = window.__benchBase || JSON.parse(JSON.stringify(st));
          for (const key of Object.keys(st)) delete st[key];
          Object.assign(st, JSON.parse(JSON.stringify(window.__benchBase)), patch);
          if (window.__test_setBracketSearch) window.__test_setBracketSearch(true); // a tree without the search has no such hook
          if (window.__test_refreshCliffPlan) window.__test_refreshCliffPlan();
          const simulate = window.__test_simulateRaw || window.__test_simulate,
            simulateHistorical = window.__test_simulateHistoricalRaw || window.__test_simulateHistorical;
          const t0 = performance.now();
          for (let i = 0; i < 50; i++) simulate();
          const sim = (performance.now() - t0) / 50;
          const t1 = performance.now();
          for (let i = 0; i < 20; i++) simulateHistorical((y) => [1928 + ((y * 7) % 90), 7 - (y % 5) * 6, 2.5, 4]);
          return { sim, mc: (performance.now() - t1) / 20 };
        }, patch);
        t[k].sim.push(out.sim);
        t[k].mc.push(out.mc);
      }
    const pctOf = (a, b) => ((median(a) / median(b) - 1) * 100).toFixed(1);
    console.log(`${name}: simulate ${median(t.base.sim).toFixed(2)} -> ${median(t.head.sim).toFixed(2)} ms (${pctOf(t.head.sim, t.base.sim)}%), path ${median(t.base.mc).toFixed(2)} -> ${median(t.head.mc).toFixed(2)} ms (${pctOf(t.head.mc, t.base.mc)}%)`);
  }
  await browser.close();
})();
