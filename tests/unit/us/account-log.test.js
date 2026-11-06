// The opt-in accountLog of runProjection (the CSV export's per-account balances, simulateWithAccountLog in
// src/shared/core/projection/runs.js): one entry per row, the run's rows unchanged by it, each slot's year-end dollars in
// ACCOUNT_SLOTS order (IRA A, 401(k) A, IRA B, 401(k) B), and Partner B's slots empty for a single person.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 29;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// Retired at the start, eight distinct retirement balances, spending paid from a large brokerage account, no bonds,
// conversions, cliff plan, Social Security or RMDs (both under 73), so year 0 moves no retirement dollars but growth.
const PLAN = {
  ageA: 60, ageB: 58, retireAgeA: 60, retireAgeB: 58, lifeExpectancyA: 70, lifeExpectancyB: 70,
  tradIraA: 100000, trad401kA: 200000, tradIraB: 300000, trad401kB: 400000,
  rothIraA: 50000, roth401kA: 60000, rothIraB: 70000, roth401kB: 80000,
  taxable: 2000000, cash: 50000, cashReserve: 30000, bondYears: 0, returnRate: 5, inflation: 2,
  spending: 40000, ssMonthlyA: 0, ssMonthlyB: 0, tenure: 'rent', rent: 0, healthcare: 0, acaEnabled: false,
  rothConvEnabled: false, cliffGuardEnabled: false,
};
const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

async function run(patch) {
  const w = await world();
  await w.setState(patch);
  const { simulateWith, simulateWithAccountLog } = await w.load('shared/core/projection/runs.js');
  return { logged: simulateWithAccountLog(await w.ctx()), plain: simulateWith(await w.ctx()) };
}

it('one log entry per row, and the rows are the rows of a run without the log', async () => {
  const { logged, plain } = await run(PLAN);
  c.expect(logged.accountLog.length).toBe(logged.sim.rows.length);
  c.expect(logged.sim.rows.length).toBe(13);
  c.expect(logged.sim.rows).toStrictEqual(plain.rows);
  c.expect(logged.sim.depletedAge).toBe(plain.depletedAge);
});

it('year 0: each account is its opening balance grown at the plan return', async () => {
  const { logged } = await run(PLAN);
  const [y0] = logged.accountLog;
  const trad = [105000, 210000, 315000, 420000],
    roth = [52500, 63000, 73500, 84000];
  for (let i = 0; i < 4; i++) {
    c.expect(near(y0.trad[i], trad[i]), 'trad slot ' + i + ': ' + y0.trad[i]).toBe(true);
    c.expect(near(y0.roth[i], roth[i]), 'roth slot ' + i + ': ' + y0.roth[i]).toBe(true);
  }
  const row0 = logged.sim.rows[0];
  c.expect(row0.traditional).toBe(1050000);
  c.expect(row0.roth).toBe(273000);
});

it('every year: the slots add up to the row pools (no bonds, no inherited accounts)', async () => {
  const { logged } = await run(PLAN);
  logged.sim.rows.forEach((row, i) => {
    const e = logged.accountLog[i],
      t = e.trad[0] + e.trad[1] + e.trad[2] + e.trad[3],
      r = e.roth[0] + e.roth[1] + e.roth[2] + e.roth[3];
    c.expect(near(t, row.traditional) && near(r, row.roth), `year ${row.year}: ${t} vs ${row.traditional}, ${r} vs ${row.roth}`).toBe(true);
  });
});

it("a single person: Partner B's slots are 0 on every row", async () => {
  const { logged } = await run({ ...PLAN, singlePerson: true, filingStatus: 'single' });
  const nonzero = logged.accountLog.filter((e) => e.trad[2] || e.trad[3] || e.roth[2] || e.roth[3]).length;
  c.expect(nonzero).toBe(0);
  c.expect(logged.accountLog[0].trad[0] > 0).toBe(true);
});
