// Employer-plan and IRA contribution limits (E1a). Task 2: the PLAN_LIMITS table and allocatePlanRoom, with tests that
// pin today's contribution math (no number change). Spec: docs/superpowers/specs/2026-10-08-e1a-plan-contribution-limits-design.md.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(200);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
  const rc = (patch, args) =>
    page.evaluate(
      ([p, a]) =>
        window.__test_retirementContributions(p, {
          wageB: 0, ageB: null, singlePerson: true, limitFactor: 1, matchA: 0, matchB: 0, ...a,
        }),
      [patch, args],
    );
  const alloc = (room, amounts) => page.evaluate(([r, a]) => window.__test_allocatePlanRoom(r, a), [room, amounts]);
  const P0 = {
    k401Type: 'traditional', iraType: 'roth', k401PctA: 100, catchupPctA: 100, iraPctA: 0,
    megaBackdoor: true, megaPctA: 100, matchA: 0,
  };

  // Under 50, no catch-up: deferral 24,500, then the mega-backdoor fills the 72,000 annual-additions limit.
  let r = await rc(P0, { wageA: 200000, age: 40 });
  assert.strictEqual(r.acct.trad[1], 24500, 'deferral');
  assert.strictEqual(r.acct.roth[1], 47500, 'mega-backdoor room');
  // Indexing: every limit scales with limitFactor.
  r = await rc(P0, { wageA: 200000, age: 40, limitFactor: 1.1 });
  near(r.acct.trad[1], 26950, 1e-9, 'indexed deferral');
  near(r.acct.roth[1], 52250, 1e-9, 'indexed mega room');
  // IRA limit, with and without the age-50 catch-up.
  const ira = { ...P0, iraPctA: 100, megaBackdoor: false };
  r = await rc(ira, { wageA: 200000, age: 55 });
  assert.strictEqual(r.acct.roth[0], 8600, 'IRA at 55');
  r = await rc(ira, { wageA: 200000, age: 40 });
  assert.strictEqual(r.acct.roth[0], 7500, 'IRA at 40');
  // Pay below the deferral limit.
  r = await rc({ ...P0, megaBackdoor: false }, { wageA: 20000, age: 40 });
  assert.strictEqual(r.acct.trad[1], 20000, 'pay below the limit');

  // ---- Task 3: the limit math and profit sharing (the matchA/matchB args of rc are ignored after the fix). ----
  // Catch-up outside the annual-additions limit (spec 2.1). At 55, pay 200,000: deferral 24,500 (traditional); catch-up
  // 8,000, Roth because pay 200,000 > 150,000; room 72,000 - 24,500 = 47,500, all mega backdoor. Roth 401(k)
  // 8,000 + 47,500 = 55,500 (before the fix the catch-up used the room: 72,000 - 32,500 = 39,500, Roth 47,500).
  r = await rc(P0, { wageA: 200000, age: 55 });
  assert.strictEqual(r.acct.trad[1], 24500, 'catch-up: deferral');
  assert.strictEqual(r.acct.roth[1], 55500, 'catch-up: Roth catch-up 8,000 + mega 47,500');
  // At 61: catch-up 11,250 (ages 60-63), mega 47,500: 58,750.
  r = await rc(P0, { wageA: 200000, age: 61 });
  assert.strictEqual(r.acct.roth[1], 58750, 'catch-up at 61: 11,250 + 47,500');
  // Compensation limit: pay 500,000 counts as 360,000; profit sharing 10% = 36,000, under the room 72,000.
  const comp = { ...P0, k401PctA: 0, megaBackdoor: false, profitSharingPctA: 10 };
  r = await rc(comp, { wageA: 500000, age: 40 });
  assert.strictEqual(r.profitA, 36000, 'compensation limit: profit sharing');
  assert.strictEqual(r.acct.trad[1], 36000, 'compensation limit: profit sharing in the traditional 401(k)');
  // The match the same way: 10% of 360,000.
  r = await rc({ ...comp, matchA: 10, profitSharingPctA: 0 }, { wageA: 500000, age: 40 });
  assert.strictEqual(r.matchA, 36000, 'compensation limit: match');
  // Order: pay 300,000, deferral 24,500, room 47,500; match 6% = 18,000; profit sharing min(25% = 75,000, 29,500) =
  // 29,500; mega 0. 401(k) A traditional 24,500 + 18,000 + 29,500 = 72,000.
  r = await rc({ ...P0, matchA: 6, profitSharingPctA: 25 }, { wageA: 300000, age: 40 });
  assert.strictEqual(r.matchA, 18000, 'order: match');
  assert.strictEqual(r.profitA, 29500, 'order: profit sharing cut to the room');
  assert.strictEqual(r.acct.roth[1], 0, 'order: no mega backdoor room');
  assert.strictEqual(r.acct.trad[1], 72000, 'order: 401(k) A traditional');
  assert.strictEqual(r.employerContrib, 47500, 'order: employer total');
  // Match cut to the room (100% of pay): pay 20,000, deferral 20,000 fills it, room 0, match 50% -> 0.
  r = await rc({ ...P0, megaBackdoor: false, matchA: 50 }, { wageA: 20000, age: 40 });
  assert.strictEqual(r.matchA, 0, '100% of pay: match');
  assert.strictEqual(r.acct.trad[1], 20000, '100% of pay: deferral only');
  // Indexing: compensation limit 396,000 x 10% = 39,600 (room 79,200).
  r = await rc(comp, { wageA: 1000000, age: 40, limitFactor: 1.1 });
  near(r.profitA, 39600, 1e-9, 'indexed compensation limit');
  // Retired (no pay): nothing, whatever the percentages.
  r = await rc({ ...P0, matchA: 6, profitSharingPctA: 10 }, { wageA: 0, age: 66 });
  assert.deepStrictEqual([r.matchA, r.profitA, r.acct.roth[1], r.acct.trad[1]], [0, 0, 0, 0], 'retired');
  // Single-person mode: B gets nothing.
  r = await rc(
    { ...P0, matchB: 6, profitSharingPctB: 10, k401PctB: 100 },
    { wageA: 100000, age: 40, wageB: 0, ageB: null, singlePerson: true },
  );
  assert.deepStrictEqual([r.matchB, r.profitB, r.acct.trad[3], r.acct.roth[3]], [0, 0, 0, 0], 'single: B');

  // Engine (Review Focus 4): profit sharing is untaxed employer money in the traditional 401(k) A. Pay 150,000 x 10%
  // = 15,000 in year 0; tax, wages and MAGI unchanged.
  const engine = (ps) =>
    page.evaluate((ps) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, { singlePerson: true, ageA: 40, retireAgeA: 60, incomeA: 150000, bondYears: 0, profitSharingPctA: ps });
      try {
        const rows = JSON.parse(JSON.stringify(window.__test_simulate(60).rows));
        const trace = window.__test_accountTrace();
        return { row: rows[0], trace: trace[0] };
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, ps);
  const e0 = await engine(0),
    e10 = await engine(10);
  for (const f of ['tax', 'wages', 'magiProxy'])
    assert(Object.is(e0.row[f], e10.row[f]), `engine: ${f} unchanged (${e0.row[f]} vs ${e10.row[f]})`);
  near(e10.trace.trad[1] - e0.trace.trad[1], 15000, 0.01, 'engine: 401(k) A higher by the profit sharing');
  assert(Object.is(e0.trace.trad[0], e10.trace.trad[0]), 'engine: IRA A unchanged');

  // Legacy saves: the two new keys are clamped 0 to 25 (junk reads as 0), and an income above the old slider cap is kept.
  const loadSaved = async (raw) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      ['fireCouplePlanner.massachusettsOffline.v1', JSON.stringify({ state: raw, mode: 'real' })],
    );
    await p.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
    await p.waitForTimeout(150);
    const st = await p.evaluate(() => {
      const s = window.__test_getState();
      return { a: s.profitSharingPctA, b: s.profitSharingPctB, incomeA: s.incomeA };
    });
    await ctx.close();
    return st;
  };
  let sv = await loadSaved({ profitSharingPctA: 'x', profitSharingPctB: 400 });
  assert.deepStrictEqual([sv.a, sv.b], [0, 25], 'legacy: profit sharing junk');
  sv = await loadSaved({ profitSharingPctA: -5 });
  assert.deepStrictEqual([sv.a, sv.b], [0, 0], 'legacy: profit sharing negative');
  sv = await loadSaved({ incomeA: 500000 });
  assert.strictEqual(sv.incomeA, 500000, 'legacy: income above the old slider cap');

  // allocatePlanRoom
  let a = await alloc(100, [30, 50, 40]);
  assert.deepStrictEqual(a, { out: [30, 50, 20], left: 0 });
  a = await alloc(100, [30, 20]);
  assert.deepStrictEqual(a, { out: [30, 20], left: 50 });
  a = await alloc(0, [10]);
  assert.deepStrictEqual(a, { out: [0], left: 0 });
  a = await alloc(-5, [10]);
  assert.deepStrictEqual(a, { out: [0], left: 0 });
  a = await alloc(50, [-10, 20]);
  assert.deepStrictEqual(a, { out: [0, 20], left: 30 });
  // Canada-shaped list: an employer DPSP contribution and a group-RRSP match ahead of the employee's RRSP in one yearly
  // room; nothing in the allocator is US-specific.
  a = await alloc(33810, [10000, 5000, 25000]);
  assert.deepStrictEqual(a, { out: [10000, 5000, 18810], left: 0 });

  assert.deepStrictEqual(errors, []);
  console.log('contribution_limits: all passed');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
