// The 162(l) settlement's carry (spec 6.5), driven by the test-only switch ctx.test.seCarryAt: the carry enters next year's
// cash flow, the records read the flow before it (flowOwn), and the last year's carry goes to the estate's cash.
// A single retiree with no ACA and no Medicare in the run (ages 50-61), so flowOwn does not depend on the draws and the
// records of a carry run equal the no-carry run's exactly. Retired at 52 (R = 2), drawing from a large taxable account; a
// pension from 57 makes the surplus years.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const HOUSEHOLD = {
  singlePerson: true, ageA: 50, retireAgeA: 52, lifeExpectancyA: 61, inflation: 0,
  acaEnabled: false, guardrailsEnabled: true, tenure: 'rent', cliffGuardEnabled: false,
  ssMonthlyA: 0, pensionYearlyA: 400000, pensionStartAgeA: 57, cash: 0, cashReserve: 0, taxable: 2000000,
  children: [], incomeSources: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
};
const R = 2, Y = 3, Z = 8, LAST = 11;
const drawn = (r) => r.traditionalWithdrawn + r.taxableWithdrawn + r.rothWithdrawn;

// One world: the no-carry run (rows, estate, trace), then a run with the switch at `at` (null: no switch).
async function runs(at) {
  const w = await world();
  await w.setState(HOUSEHOLD);
  const { testHooks } = await w.load('us/core/test-hooks.js');
  const e = await engine(w);
  testHooks.testSeCarryAt = null;
  const base = e.simulateRaw(), baseTrace = e.accountTrace();
  testHooks.testSeCarryAt = at;
  const sim = e.simulateRaw(), trace = e.accountTrace();
  testHooks.testSeCarryAt = null;
  return { base, baseTrace, sim, trace };
}

it('the household: retirement year R, draw years R..56, surplus years from 57, last year 11', async () => {
  const { base, baseTrace } = await runs(null);
  expect(base.rows.length).toBe(LAST + 1);
  expect(base.retirementYear).toBe(R);
  for (const y of [R, Y]) expect(baseTrace[y].flowOwn < 0 && drawn(base.rows[y]) > 0).toBe(true);
  expect(baseTrace[Z].flowOwn > 0 && drawn(base.rows[Z]) === 0).toBe(true);
  for (const t of baseTrace) expect(t.forcedRefund).toBe(0);
  for (const r of base.rows) expect('seSettlementIn' in r).toBe(false);
});

it('zero carry: the rows are the no-switch run', async () => {
  const { base, sim } = await runs({ year: 2, amount: 0 });
  expect(sim.rows).toStrictEqual(base.rows);
  expect(sim.estate).toStrictEqual(base.estate);
});

it('refund, no tip: the carry lowers the draw, the record is unchanged', async () => {
  const { baseTrace } = await runs(null);
  const N = -baseTrace[Y].flowOwn;
  const { base, sim, trace } = await runs({ year: Y - 1, amount: N / 2 });
  expect(sim.rows[Y].seSettlementIn).toBe(N / 2);
  expect('seSettlementIn' in sim.rows[Y - 1]).toBe(false);
  expect('seSettlementIn' in sim.rows[Y + 1]).toBe(false);
  expect(trace[Y].flowOwn).toBe(-N);
  expect(trace[Y].guardrails).toStrictEqual(baseTrace[Y].guardrails);
  expect(drawn(sim.rows[Y]) < drawn(base.rows[Y])).toBe(true);
  expect(sim.rows.slice(0, Y)).toStrictEqual(base.rows.slice(0, Y));
});

it('refund tips a draw year into a surplus: the year still records its need', async () => {
  const { baseTrace } = await runs(null);
  const N = -baseTrace[R].flowOwn;
  const { base, sim, trace } = await runs({ year: R - 1, amount: 3 * N });
  expect(sim.rows[R].seSettlementIn).toBe(3 * N);
  expect(trace[R].guardrails).toStrictEqual(baseTrace[R].guardrails);
  expect(trace[R].firstWithdrawal).toStrictEqual(baseTrace[R].firstWithdrawal);
  expect(trace[R].firstWithdrawal).toBe(N);
  expect(drawn(sim.rows[R])).toBe(0);
  expect(drawn(base.rows[R]) > 0).toBe(true);
});

it('balance due tips a surplus year into a draw: the year records nothing', async () => {
  const { baseTrace } = await runs(null);
  const S = baseTrace[Z].flowOwn;
  const { base, sim, trace } = await runs({ year: Z - 1, amount: -2 * S });
  expect(sim.rows[Z].seSettlementIn).toBe(-2 * S);
  expect(trace[Z].guardrails).toStrictEqual(baseTrace[Z].guardrails);
  expect(trace[Z].firstWithdrawal).toStrictEqual(baseTrace[Z].firstWithdrawal);
  expect(drawn(sim.rows[Z]) > 0).toBe(true);
  expect(drawn(base.rows[Z])).toBe(0);
});

it('last year to the estate: the rows are unchanged, the estate cash carries it', async () => {
  const { base, sim } = await runs({ year: LAST, amount: 1234.5 });
  expect(sim.rows).toStrictEqual(base.rows);
  expect(sim.estate.cash).toBe(base.estate.cash + 1234.5);
});
