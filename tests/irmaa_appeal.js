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
  near(hc(c1, 3), 5000, 1e-6, "case 3, year 3 (D): appealed on year 3's 125,000 on its joint return: 0");
  near(hc(c1, 4), 5000, 1e-6, "case 3, year 4 (D+1): min(1,148.40; year 3: 0; year 4 single: 1,148.40) = 0");
  assert.strictEqual(c1[3].irmaaAppealYearB, 2029); assert.strictEqual(c1[3].irmaaAppealKindB, 3);
  assert.strictEqual(c1[4].irmaaAppealYearB, 2029);
  for (const r of c1) assert.strictEqual(r.irmaaAppealYearA, undefined);
  assert.strictEqual(c1[5].irmaaAppealYearB, undefined);
  near(hc(c1, 5), 5000, 1e-6, 'case 1 year 5 (D+2): year 3 B 125,000 on a joint return, under 218,000 (was 6,148.40)');
  near(hc(c1, 6), 6148.4, 1e-6, 'case 1 year 6: year 4 B 125,000 single, tier 1');

  // Case 2: case 1's couple, A dies at 68 (deathYear 0), entered prior MAGIs 250,000 for both years (joint returns).
  const C2 = { ...C1, survivorDeathAge: 68, irmaaPriorKnown: true, irmaaMagiPrior2: 250000, irmaaMagiPrior1: 250000 };
  const c2 = (await run(C2)).rows;
  near(hc(c2, 0), 5000, 1e-6, "case 2 year 0: appealed on year 0's 125,000 on its joint return: 0");
  near(hc(c2, 1), 5000, 1e-6, "case 2 year 1: appealed on year 0's 125,000 (joint return): 0");
  assert.strictEqual(c2[0].irmaaAppealYearB, 2026); assert.strictEqual(c2[0].irmaaAppealKindB, 3);
  assert.strictEqual(c2[1].irmaaAppealYearB, 2026);
  near(hc(c2, 2), 5000, 1e-6, 'case 2 year 2 (D+2): year 0 B 125,000 on its joint return (was single tier 1: 6,148.40)');
  near(hc(c2, 3), 6148.4, 1e-6, 'case 2 year 3: year 1 B 125,000 single, tier 1');

  // Case 2b: A dies at 66 (deathYear -2: 2024's return joint, 2025's B's own; before the plan, not an event).
  const C2B = { ...C1, survivorDeathAge: 66, irmaaPriorKnown: true, irmaaMagiPrior2: 250000, irmaaMagiPrior1: 125000 };
  const c2b = (await run(C2B)).rows;
  near(hc(c2b, 0), 6148.4, 1e-6, 'case 2b year 0: the entered joint 2024 return on the joint tiers (was single tier 4: 11,355.20)');
  near(hc(c2b, 1), 6148.4, 1e-6, 'case 2b year 1: B 2025 125,000 on the single tiers (year 0 status)');
  near(hc(c2b, 2), 6148.4, 1e-6, 'case 2b year 2: year 0 B 125,000 single');

  // --- The event table (spec 5.2; cases 10 and 11) ---
  const zeros = (n) => new Array(n).fill(0);
  const withAt = (n, pairs) => { const a = zeros(n); for (const [i, v] of pairs) a[i] = v; return a; };
  // Case 11, case 7's couple: A 66 (salary 300,000, retires at 68: E = 2), B 70 retired on Medicare; married: B covered too.
  const C7 = {
    singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 66, ageB: 70, retireAgeA: 68, retireAgeB: 65,
    lifeExpectancyA: 80, lifeExpectancyB: 84, incomeA: 300000, pensionCoverage: 'b', pensionYearlyB: 60000, pensionStartAgeB: 65,
  };
  let t = (await run(C7)).table;
  assert.deepStrictEqual(t, { eventA: withAt(15, [[2, 2]]), eventB: withAt(15, [[2, 2]]) }, 'table: a retirement covers the spouse');
  // Case 8's single: a W-2 stream (ages 60-69) ends: E = 4, kind 1.
  const STREAM = { amount: 200000, startAge: 60, endAge: 69, followGrowth: false, growth: 0, owner: 'A', kind: 'wages', contribute: false, healthPremium: 0 };
  const C8 = {
    singlePerson: true, ageA: 66, retireAgeA: 60, lifeExpectancyA: 80, pensionCoverage: 'a', pensionYearlyA: 40000, pensionStartAgeA: 60,
    incomeSources: [STREAM],
  };
  t = (await run(C8)).table;
  assert.deepStrictEqual(t.eventA, withAt(15, [[4, 1]]), 'table: a job stream ends');
  // A married death at year 0: the survivor's [0] = 3.
  t = (await run({ ...C1, survivorDeathAge: 68 })).table;
  assert.deepStrictEqual(t, { eventA: zeros(13), eventB: withAt(13, [[0, 3]]) }, 'table: a death in year 0');
  // A retirement at 68 (E = 2) and a W-2 stream whose last working age is 68 (endAge 68: E = 3), same person aged 66.
  const C12 = {
    singlePerson: true, ageA: 66, retireAgeA: 68, lifeExpectancyA: 80, incomeA: 200000, incomeKindA: 'wages',
    pensionCoverage: 'a', pensionYearlyA: 60000, pensionStartAgeA: 68,
    incomeSources: [{ ...STREAM, amount: 50000, startAge: 68, endAge: 68 }],
  };
  t = (await run(C12)).table;
  assert.deepStrictEqual(t.eventA, withAt(15, [[2, 2], [3, 1]]), 'table: retirement then a stream end');
  // A retirement and a death in the same year: married couple both 66; A (salary 100,000, retiring at 70) dies at 70.
  t = (await run({
    singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 66, ageB: 66, retireAgeA: 70, retireAgeB: 60,
    lifeExpectancyA: 85, lifeExpectancyB: 85, incomeA: 100000, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 70,
    survivorSpendingPct: 75,
  })).table;
  assert.deepStrictEqual(t, { eventA: zeros(20), eventB: withAt(20, [[4, 3]]) }, 'table: retirement and death in one year: the higher kind');
  // An event at the plan's last year: single 66, life expectancy 70, retiring at 70 (E = 4 = projectionYears).
  t = (await run({ singlePerson: true, ageA: 66, retireAgeA: 70, lifeExpectancyA: 70, incomeA: 100000 })).table;
  assert.deepStrictEqual(t.eventA, withAt(5, [[4, 2]]), 'table: an event at the last plan year');
  // Round 2 minor 3: an unmarried couple; A's retirement is clamped to A's death (E = 4): covers only the dead partner.
  t = (await run({
    singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 66, ageB: 66, retireAgeA: 75, retireAgeB: 60,
    lifeExpectancyA: 85, lifeExpectancyB: 85, incomeA: 100000, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 70,
    survivorSpendingPct: 75,
  })).table;
  assert.strictEqual(t, null, 'table: a retirement clamped to an unmarried partner death covers nobody');
  // Case 10 (not events).
  const S200 = { singlePerson: true, ageA: 66, lifeExpectancyA: 80, incomeA: 200000, incomeKindA: 'wages' };
  let r = await run({ ...S200, retireAgeA: 66, irmaaPriorKnown: true, irmaaMagiPrior2: 200000, irmaaMagiPrior1: 200000 });
  assert.strictEqual(r.table, null, 'case 10(a): a retirement at today\'s age is not an event');
  near(hc(r.rows, 0), 14620, 1e-6, 'case 10(a) year 0: entered 200,000, tier 3');
  near(hc(r.rows, 1), 14620, 1e-6, 'case 10(a) year 1: entered 200,000, tier 3');
  assert.strictEqual((await run({ ...S200, incomeA: 0, retireAgeA: 68 })).table, null, 'case 10(b): a job with no pay');
  assert.strictEqual((await run({ ...C1, filingStatus: 'single' })).table, null, 'case 10(c): an unmarried partner death');
  t = (await run({
    ...C1, ageA: 66, ageB: 66, survivorDeathAge: 70, incomeSources: [{ ...STREAM, startAge: 66, endAge: 69 }],
  })).table;
  assert.deepStrictEqual(t, { eventA: zeros(15), eventB: withAt(15, [[4, 3]]) }, 'case 10(d): a stream ending in its owner\'s death year is the death event');
  assert.strictEqual((await run({ ...C1, survivorDeathAge: 66 })).table, null, 'case 10(e): a death before the plan');
  assert.strictEqual((await run({ singlePerson: true, ageA: 50, retireAgeA: 58, lifeExpectancyA: 90, incomeA: 100000 })).table, null,
    'case 10(f): nobody it covers is 65 by E+1');
  const def = await page.evaluate(() => { const sim = window.__test_simulate(); return sim.irmaaAppeal === null; });
  assert.strictEqual(def, true, 'case 10(g): the default state has no table');
  assert.strictEqual(Object.keys(await page.evaluate(() => window.__test_simulate())).includes('irmaaAppeal'), false,
    'the table is not an enumerable result field');

  // --- Stage 2a: the appealed charge (spec 5.3, 5.4) ---
  // Case 4: single, 66, salary 200,000 (year 0-1 MAGI 200,000: tier 3), retires at 68 (E = 2), pension 60,000 from 68.
  const S4 = { ...S200, retireAgeA: 68, pensionCoverage: 'a', pensionYearlyA: 60000, pensionStartAgeA: 68 };
  r = await run(S4);
  near(hc(r.rows, 2), 10000, 1e-6, 'case 4 year 2: min(4,620; year 2 60,000: 0)');
  assert.strictEqual(r.rows[2].irmaaAppealYearA, 2028); assert.strictEqual(r.rows[2].irmaaAppealKindA, 2);
  near(hc(r.rows, 3), 10000, 1e-6, 'case 4 year 3: min(4,620; year 2: 0; year 3: 0)');
  assert.strictEqual(r.rows[3].irmaaAppealYearA, 2028, 'case 4 year 3: the earlier year on a tie');
  near(hc(r.rows, 4), 10000, 1e-6, 'case 4 year 4: lookback year 2, no appeal');
  assert.strictEqual(r.rows[4].irmaaAppealYearA, undefined);
  const LUMP = (age) => ({ amount: 100000, age, flat: true, kind: 'ordinary', owner: 'A', gainPct: 100, activeBusiness: false });
  // Case 5: case 4 plus 100,000 ordinary at 69 (year 3 MAGI 160,000: tier 2).
  r = await run({ ...S4, oneTimeIncome: [LUMP(69)] });
  near(hc(r.rows, 3), 10000, 1e-6, 'case 5 year 3: min(4,620; year 2: 0; year 3: 2,884.80)');
  assert.strictEqual(r.rows[3].irmaaAppealYearA, 2028);
  near(hc(r.rows, 5), 12884.8, 1e-6, 'case 5 year 5: lookback year 3 160,000, tier 2');
  // Case 6: case 4 plus the 100,000 at 68 (year 2 MAGI 160,000).
  r = await run({ ...S4, oneTimeIncome: [LUMP(68)] });
  near(hc(r.rows, 2), 12884.8, 1e-6, 'case 6 year 2: min(4,620; 2,884.80)');
  assert.strictEqual(r.rows[2].irmaaAppealYearA, 2028);
  near(hc(r.rows, 3), 10000, 1e-6, 'case 6 year 3: min(4,620; year 2: 2,884.80; year 3: 0)');
  assert.strictEqual(r.rows[3].irmaaAppealYearA, 2029);
  // Case 7: a spouse's retirement covers both (C7: joint 360,000 in years 0-1, joint tier 3).
  r = await run(C7);
  near(hc(r.rows, 0), 9620, 1e-6, 'case 7 year 0: B only, 5,000 + 4,620');
  near(hc(r.rows, 1), 9620, 1e-6, 'case 7 year 1');
  near(hc(r.rows, 2), 10000, 1e-6, 'case 7 year 2: both appealed on year 2 60,000 (was 19,240)');
  near(hc(r.rows, 3), 10000, 1e-6, 'case 7 year 3 (was 19,240)');
  for (const y of [2, 3]) for (const P of ['A', 'B']) {
    assert.strictEqual(r.rows[y]['irmaaAppealYear' + P], 2028, `case 7 year ${y} ${P}`);
    assert.strictEqual(r.rows[y]['irmaaAppealKind' + P], 2);
  }
  // Case 8: a job stream ends (C8: MAGI 240,000 in years 0-3, single tier 4).
  r = await run(C8);
  for (const y of [0, 1, 2, 3]) near(hc(r.rows, y), 16355.2, 1e-6, `case 8 year ${y}`);
  near(hc(r.rows, 4), 10000, 1e-6, 'case 8 year 4: appealed (was 16,355.20)');
  near(hc(r.rows, 5), 10000, 1e-6, 'case 8 year 5: appealed (was 16,355.20)');
  assert.strictEqual(r.rows[4].irmaaAppealKindA, 1); assert.strictEqual(r.rows[4].irmaaAppealYearA, 2030);
  assert.strictEqual(r.rows[5].irmaaAppealYearA, 2030, 'case 8 year 5: last year and this year tie: the earlier');
  near(hc(r.rows, 6), 10000, 1e-6, 'case 8 year 6: lookback year 4 40,000');
  // Case 9: two returns, own events only (A: case 8's stream and pension; B: pension 150,000, single tier 2).
  r = await run({
    singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 66, ageB: 66, retireAgeA: 60, retireAgeB: 60,
    lifeExpectancyA: 80, lifeExpectancyB: 80, pensionCoverage: 'both', pensionYearlyA: 40000, pensionYearlyB: 150000,
    pensionStartAgeA: 60, pensionStartAgeB: 60, incomeSources: [STREAM],
  });
  for (const y of [0, 1, 2, 3]) near(hc(r.rows, y), 19240, 1e-6, `case 9 year ${y}: 10,000 + 6,355.20 + 2,884.80`);
  near(hc(r.rows, 4), 12884.8, 1e-6, 'case 9 year 4: A appealed, B tier 2');
  near(hc(r.rows, 5), 12884.8, 1e-6, 'case 9 year 5');
  for (const row of r.rows) assert.strictEqual(row.irmaaAppealYearB, undefined, 'case 9: B never appealed');
  // Case 12: the kind a row reports (C12: retirement at 68, a 50,000 W-2 stream at 68 only).
  r = await run(C12);
  near(hc(r.rows, 2), 11148.4, 1e-6, 'case 12 year 2: min(4,620; 110,000: 1,148.40)');
  assert.deepStrictEqual([r.rows[2].irmaaAppealYearA, r.rows[2].irmaaAppealKindA], [2028, 2]);
  near(hc(r.rows, 3), 10000, 1e-6, 'case 12 year 3: min(4,620; year 2: 1,148.40; year 3: 0)');
  assert.deepStrictEqual([r.rows[3].irmaaAppealYearA, r.rows[3].irmaaAppealKindA], [2029, 1]);
  near(hc(r.rows, 4), 10000, 1e-6, 'case 12 year 4: min(1,148.40; year 3: 0; year 4: 0)');
  assert.deepStrictEqual([r.rows[4].irmaaAppealYearA, r.rows[4].irmaaAppealKindA], [2029, 1]);
  r = await run({ ...C12, oneTimeIncome: [LUMP(69)] });
  near(hc(r.rows, 3), 11148.4, 1e-6, 'case 12 variant year 3: min(4,620; year 2: 1,148.40; year 3 160,000: 2,884.80)');
  assert.deepStrictEqual([r.rows[3].irmaaAppealYearA, r.rows[3].irmaaAppealKindA], [2028, 2]);
  near(hc(r.rows, 4), 10000, 1e-6, 'case 12 variant year 4: min(1,148.40; year 3: 2,884.80; year 4: 0)');
  assert.deepStrictEqual([r.rows[4].irmaaAppealYearA, r.rows[4].irmaaAppealKindA], [2030, 1]);
  // Review Focus 2: a zero normal charge in a window is never priced (no usesMagiEstimate, no row field). Case 4 with
  // a salary of 100,000 (year-0 MAGI under 109,000: the normal charge in years 2-3 is 0).
  r = await run({ ...S4, incomeA: 100000 });
  near(hc(r.rows, 2), 10000, 1e-6, 'zero normal charge: year 2');
  assert.strictEqual(r.rows[2].irmaaAppealYearA, undefined, 'zero normal charge: no appeal recorded');
  // The exact observable (plan review round 2, S1): how often the in-year candidate was priced, around one raw run (the
  // re-plan of a new state runs first, outside the count).
  const inYearCalls = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        window.__test_simulate();
        window.__test_irmaaInYearCalls(true);
        window.__test_simulateRaw();
        return window.__test_irmaaInYearCalls(true);
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...QUIET, ...patch });
  assert.strictEqual(await inYearCalls({ ...S4, incomeA: 100000 }), 0, 'zero normal charge: the in-year candidate is never priced');
  assert((await inYearCalls(S4)) > 0, 'case 4: the in-year candidate is priced');
  // Case 14: an inherited traditional IRA (10-year rule) of 600,000 received at 67 (year 1), heir A (factor 20.4 at 68):
  // draws 60,000 in years 2 and 3, MAGI 120,000 (tier 1).
  r = await run({ ...S4, oneTimeIncome: [{ amount: 600000, age: 67, flat: true, kind: 'inheritedTrad', owner: 'A' }] });
  near(hc(r.rows, 2), 11148.4, 1e-6, 'case 14 year 2: min(4,620; 120,000: 1,148.40)');
  assert.strictEqual(r.rows[2].irmaaAppealYearA, 2028);
  near(hc(r.rows, 3), 11148.4, 1e-6, 'case 14 year 3: min(4,620; year 2: 1,148.40; year 3: 1,148.40)');
  assert.strictEqual(r.rows[3].irmaaAppealYearA, 2028);

  // Case 13: an in-year candidate on a drawing year converges to the charge at the realized MAGI (round 1, S3). Single,
  // 66, salary 200,000 retiring at 67 (E = 1), traditional IRA 1,500,000, no pension. The salary surplus of year 0 stays in
  // cash and pays part of the first retired year, so the spending must be high for year 1 to draw into tier 1: at 120,000
  // year 1's realized MAGI is about 117,551 (measured in the plan review), inside tier 1 and at least $100 from 109,000 and
  // 137,000.
  const SPEND = 120000;
  r = await run({ singlePerson: true, ageA: 66, retireAgeA: 67, lifeExpectancyA: 85, incomeA: 200000, incomeKindA: 'wages', tradIraA: 1500000, spending: SPEND });
  const m1 = r.rows[1].magiProxy;
  assert(Math.min(Math.abs(m1 - 109000), Math.abs(m1 - 137000)) >= 100 && m1 > 109000 && m1 < 137000, `case 13 precondition: year 1 MAGI ${m1}`);
  near(hc(r.rows, 1) - 10000, 1148.4, 1e-6, 'case 13 year 1: the charge at the realized MAGI (tier 1), not the normal 4,620');
  assert.strictEqual(r.rows[1].irmaaAppealYearA, 2027);
  near(hc(r.rows, 2), 11148.4, 1e-6, 'case 13 year 2: appealed (tier 1), below the normal 14,620');
  assert(r.rows[2].irmaaAppealYearA !== undefined, 'case 13 year 2: appealed');

  // Case 15: the 162(l) deduction in an appeal year (round 1 S4, round 2 S2). Case 4 without its pension plus a
  // self-employed stream (owner A, ages 60-80, plan rate 0): after 68 no employer coverage, so the premiums are deductible.
  const SELF = (amount) => ({ amount, startAge: 60, endAge: 80, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, profitSharingPct: 0 });
  const trace = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        // __test_accountTrace / __test_simulate re-plan for a new state (the plan's own runs also count in magiStats), so the
        // counter is read around one raw run only (plan review round 1, S2).
        const tr = window.__test_accountTrace();
        const rows = window.__test_simulate().rows;
        const s0 = { ...window.__test_magiStats };
        window.__test_simulateRaw();
        const s1 = { ...window.__test_magiStats };
        return JSON.parse(JSON.stringify({ d: tr.map((x) => x.profile.seHealthA), rows, alt: s1.seAlternative - s0.seAlternative }));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...QUIET, ...patch });
  const S15 = { ...S200, retireAgeA: 68 };
  let f = await trace({ ...S15, incomeSources: [SELF(80000)] });
  for (const y of [2, 3]) {
    near(hc(f.rows, y), 10000, 1e-6, `case 15 year ${y}: appealed to 0 (MAGI 80,000 - 5,651.80 - 10,000 = 64,348.20)`);
    near(f.d[y], 10000, 1e-6, `case 15 year ${y}: deduction 10,000`);
  }
  // The feedback variant: MAGI before the deduction X = 0.92935 x profit in (119,000, 120,148.40]; profit 128,700: X =
  // 119,607.35. No consistent deduction exists in years 2 and 3 (the in-year charge flips at 109,000), so each takes the
  // alternative calculation: held deduction 10,000, charge tier 1 (X - 10,000 = 109,607.35 > 109,000).
  f = await trace({ ...S15, incomeSources: [SELF(128700)] });
  for (const y of [2, 3]) {
    near(hc(f.rows, y), 11148.4, 1e-6, `case 15 variant year ${y}: healthcare`);
    near(f.d[y], 10000, 1e-6, `case 15 variant year ${y}: held deduction`);
  }
  assert.strictEqual(f.alt, 2, 'case 15 variant: the alternative calculation in years 2 and 3');
  for (let y = 0; y < f.rows.length; y++) assert(f.d[y] <= hc(f.rows, y) + 1e-6, `case 15 variant year ${y}: deduction ${f.d[y]} above the premium ${hc(f.rows, y)}`);

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('irmaa_appeal: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
