// Planning gate for the cliff plan (Task 8; one tree): for each household, the median over interleaved rounds of one
// refreshCliffPlan() (the whole plan: the choose run, the off run, any family subsets, the after-tax values) and of one
// `off` standard projection (__test_runPlanMode({ planMode: 'off' })); prints the ratio. Exit 1 if any ratio is over 5
// (the gate: planning costs at most 5 off projections of the same household). Not in `npm test` (wall-clock numbers).
//
//   node tests/bench_plan.js [--root DIR] [--rounds 15]
//
// Each round times REFRESH_REPS plans and OFF_REPS off runs back to back (alternating which goes first) and keeps the
// per-call average, so a single call is not at the timer's resolution.

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const { scenarios } = require('./snapshot_scenarios');
const { legacyToAccounts } = require('./legacy_balances');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const ROUNDS = Number(opt('--rounds', 15));
const REFRESH_REPS = 5, OFF_REPS = 10, GATE = 5;

const TX_P = { singlePerson: true, ageA: 55, retireAgeA: 55, acaEnabled: true, stateTax: 'tx', spending: 60000, taxable: 600000 };
const ALL = scenarios(true);
const household = (name) => {
  const s = ALL.find((x) => x.name === name);
  if (!s) throw new Error('no scenario ' + name);
  return { ...legacyToAccounts(s.patch, { singlePerson: !!s.patch.singlePerson }) };
};
const HOUSEHOLDS = {
  default: {},
  'ACA early retiree (CA)': { retireAgeA: 50, retireAgeB: 50, ageA: 50, ageB: 50, acaEnabled: true, stateTax: 'ca' },
  'Texas, no cliff in reach': { stateTax: 'tx', acaEnabled: false, ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66, spending: 60000 },
  // The household whose plan keeps intents (Task 5 / Task 6 Step 9's P).
  'std G hoh 62 aca smooth (keeps intents)': household('std G hoh 62 aca smooth'),
  // Batch 5 step 4b: a guard-on ACA household whose MAGI is gains-driven (spec 5).
  'early ACA single (TX), gains-driven': { ...TX_P, lifeExpectancyA: 100, rothConvEnabled: true, rothConvStartAge: 55, rothConvEndAge: 74, cliffGuardEnabled: true, ...legacyToAccounts({ traditional: 1200000, roth: 100000 }, TX_P) },
};
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + plannerPath('Planner_US.html', ROOT));
  await page.waitForTimeout(300);
  let over = 0;
  for (const [name, patch] of Object.entries(HOUSEHOLDS)) {
    const plan = [], off = [];
    let info = null;
    for (let r = 0; r < ROUNDS; r++) {
      const o = await page.evaluate(({ patch, r, REFRESH_REPS, OFF_REPS }) => {
        const st = window.__test_getState();
        window.__benchBase = window.__benchBase || JSON.parse(JSON.stringify(st));
        for (const key of Object.keys(st)) delete st[key];
        Object.assign(st, JSON.parse(JSON.stringify(window.__benchBase)), JSON.parse(JSON.stringify(patch)));
        const timePlan = () => {
          const t0 = performance.now();
          let rep;
          // __test_setCliffPlan(null) first: refreshCliffPlan keeps a plan already computed for unchanged inputs, and the
          // gate is the cost of choosing one (the hook's own JSON.stringify is timed too: conservative).
          for (let i = 0; i < REFRESH_REPS; i++) {
            window.__test_setCliffPlan(null);
            rep = window.__test_refreshCliffPlan();
          }
          return [(performance.now() - t0) / REFRESH_REPS, rep];
        };
        const timeOff = () => {
          const t0 = performance.now();
          for (let i = 0; i < OFF_REPS; i++) window.__test_runPlanMode({ planMode: 'off' });
          return (performance.now() - t0) / OFF_REPS;
        };
        let p, o, rep;
        if (r % 2) { o = timeOff(); [p, rep] = timePlan(); } else { [p, rep] = timePlan(); o = timeOff(); }
        return { p, o, kept: rep.plan ? rep.plan.family : null, intents: rep.plan ? Object.keys(rep.plan.intents).length : 0, cands: rep.report ? rep.report.candidates.length : 0 };
      }, { patch, r, REFRESH_REPS, OFF_REPS });
      plan.push(o.p);
      off.push(o.o);
      info = o;
    }
    const ratio = median(plan) / median(off);
    if (ratio > GATE) over++;
    console.log(`${name}: refreshCliffPlan ${median(plan).toFixed(2)} ms, off simulate ${median(off).toFixed(2)} ms, ratio ${ratio.toFixed(2)} (gate ${GATE}) ${ratio > GATE ? 'OVER' : 'ok'}; kept ${info.kept}, ${info.intents} intents, ${info.cands} candidates`);
  }
  await browser.close();
  if (over) { console.error(`FAIL: ${over} household(s) over the ${GATE}x planning gate`); process.exitCode = 1; }
  else console.log(`OK: every household plans within ${GATE}x one off projection.`);
})().catch((e) => { console.error(e); process.exit(1); });
