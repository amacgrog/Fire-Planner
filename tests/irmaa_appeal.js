// E3: the IRMAA appeal for a life-changing event (form SSA-44) and the lookback's filing status (US).
// Spec: docs/superpowers/specs/2026-10-10-e3-irmaa-appeal-design.md; "case N" is the spec's section 8 numbering. Hand-computed:
// 2026 tiers, no inflation, Medicare 10,000 a year for the household (half per partner), no Social Security.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') }); // plan year 0 is 2026
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(200);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

  // tests/irmaa_magi.js's quiet base, plus no wage growth and no plan contributions (spec 8, round 1 M9: a salary under the
  // Roth catch-up line would otherwise defer catch-ups pre-tax).
  const QUIET = {
    stateTax: 'tx', acaEnabled: false, inflation: 0, medicalInflation: 0, hysaRate: 0, dividendYield: 0, returnRate: 0, bondReturn: 0,
    bondYears: 0, taxable: 0, cash: 0, cashReserve: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0,
    roth401kA: 0, roth401kB: 0, tenure: 'rent', rent: 0, rentGrowth: 0, maintenance: 0, incomeA: 0, incomeB: 0, spending: 20000,
    medicareYearly: 10000, ltcEnabled: false, guardrailsEnabled: false, survivorEnabled: false, rothConvEnabled: false, irmaaPriorKnown: false,
    children: [], loans: [], incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
    pensionYearlyA: 0, pensionYearlyB: 0, ssMonthlyA: 0, ssMonthlyB: 0,
    incomeGrowth: 0, k401PctA: 0, k401PctB: 0, catchupPctA: 0, catchupPctB: 0, iraPctA: 0, iraPctB: 0, profitSharingPctA: 0,
    profitSharingPctB: 0, megaBackdoor: false,
  };
  // simulate() under a state patch; returns the rows and the run's event table (non-enumerable `irmaaAppeal`, Task 2:
  // 'absent' before Task 2, null or plain arrays after). Restores the state afterwards.
  const run = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        const sim = window.__test_simulate();
        const t = sim.irmaaAppeal;
        return JSON.parse(JSON.stringify({
          rows: sim.rows,
          table: t === undefined ? 'absent' : t === null ? null : { eventA: Array.from(t.eventA), eventB: Array.from(t.eventB) },
        }));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...QUIET, ...patch });
  const hc = (rows, y) => rows[y].healthcare;

  // --- Stage 1 (decision 1): the lookback reads the filing status of the return it uses (spec 5.1) ---
  // Case 1: married, both 68, retired at 65, pensions 125,000 each (joint MAGI 250,000: joint tier 1); A dies at 71
  // (deathYear 3; the deceased's pension stops; B's MAGI 125,000 from year 3).
  const C1 = {
    singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 68, ageB: 68, retireAgeA: 65, retireAgeB: 65,
    lifeExpectancyA: 80, lifeExpectancyB: 80, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 71, survivorSpendingPct: 75,
    pensionCoverage: 'both', pensionYearlyA: 125000, pensionYearlyB: 125000, pensionStartAgeA: 65, pensionStartAgeB: 65,
  };
  const c1 = (await run(C1)).rows;
  for (const y of [0, 1, 2]) near(hc(c1, y), 12296.8, 1e-6, `case 1 year ${y}: both on Medicare, joint tier 1 each`);
  near(hc(c1, 3), 6148.4, 1e-6, 'case 1 year 3 (D): B only, lookback year 1 joint 250,000');
  near(hc(c1, 4), 6148.4, 1e-6, 'case 1 year 4 (D+1): year 2 joint 250,000 on the JOINT tiers (was single tier 4: 11,355.20)');
  near(hc(c1, 5), 5000, 1e-6, 'case 1 year 5 (D+2): year 3 B 125,000 on a joint return, under 218,000 (was 6,148.40)');
  near(hc(c1, 6), 6148.4, 1e-6, 'case 1 year 6: year 4 B 125,000 single, tier 1');

  // Case 2: case 1's couple, A dies at 68 (deathYear 0), entered prior MAGIs 250,000 for both years (joint returns).
  const C2 = { ...C1, survivorDeathAge: 68, irmaaPriorKnown: true, irmaaMagiPrior2: 250000, irmaaMagiPrior1: 250000 };
  const c2 = (await run(C2)).rows;
  near(hc(c2, 0), 6148.4, 1e-6, 'case 2 year 0: entered joint 250,000 on the joint tiers');
  near(hc(c2, 1), 6148.4, 1e-6, 'case 2 year 1: entered joint 250,000 on the joint tiers (was single tier 4: 11,355.20)');
  near(hc(c2, 2), 5000, 1e-6, 'case 2 year 2 (D+2): year 0 B 125,000 on its joint return (was single tier 1: 6,148.40)');
  near(hc(c2, 3), 6148.4, 1e-6, 'case 2 year 3: year 1 B 125,000 single, tier 1');

  // Case 2b: A dies at 66 (deathYear -2: 2024's return joint, 2025's B's own; before the plan, not an event).
  const C2B = { ...C1, survivorDeathAge: 66, irmaaPriorKnown: true, irmaaMagiPrior2: 250000, irmaaMagiPrior1: 125000 };
  const c2b = (await run(C2B)).rows;
  near(hc(c2b, 0), 6148.4, 1e-6, 'case 2b year 0: the entered joint 2024 return on the joint tiers (was single tier 4: 11,355.20)');
  near(hc(c2b, 1), 6148.4, 1e-6, 'case 2b year 1: B 2025 125,000 on the single tiers (year 0 status)');
  near(hc(c2b, 2), 6148.4, 1e-6, 'case 2b year 2: year 0 B 125,000 single');

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('irmaa_appeal: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
