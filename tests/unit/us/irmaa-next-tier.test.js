// An IRMAA stay-under whose tier is under the year's floor (apply): the year stays under the next tier in reach instead of running
// the natural draw. The household: a single 75-year-old in TX (inflation 0, renting, no ACA or LTC) whose RMD and Social Security put
// the MAGI before any discretionary draw over IRMAA tier 1, and whose natural draw (low-basis taxable) realizes gains over tier 2,
// with Roth money to replace them. A plan naming tier 1 at 75 runs exactly as a plan naming tier 2 there; an absent ACA intent
// keeps the natural year. Engine outputs are compared between runs in one process.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';

const HOUSEHOLD = {
  stateTax: 'tx', inflation: 0, singlePerson: true, tenure: 'rent', rent: 0, ageA: 75, retireAgeA: 60, lifeExpectancyA: 77,
  cliffGuardEnabled: true, rothConvEnabled: false, acaEnabled: false, ltcEnabled: false, spending: 150000, taxable: 1500000,
  basisRatio: 10, trad401kA: 2400000, rothIraA: 800000, ssMonthlyA: 2000, ssStartAgeA: 70, cash: 0, cashReserve: 0, bondYears: 0,
  dividendYield: 0, healthcare: 0, medicareYearly: 0,
};

async function setup() {
  const w = await world();
  await w.setState(HOUSEHOLD);
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const { planStats } = await w.load('us/core/projection/engine-state.js');
  const P = await usPlan(w);
  // One run in a plan mode, with the planStats it moved (only the counters that changed).
  const run = (planMode, plan = null) => {
    const s0 = { ...planStats };
    const r = P.runPlanMode({ planMode, plan });
    const d = {};
    for (const k of Object.keys(planStats)) if (planStats[k] !== s0[k]) d[k] = planStats[k] - s0[k];
    return { row: r.rows[0], rows: r.rows, d };
  };
  const under = (line) => makePlan({ intents: { 75: { kind: 'under', line, ret: 'H' } }, family: 'all' });
  return { run, under };
}

it('tier 1 under the floor: the year stays under tier 2 (a Roth draw replaces the gains)', async () => {
  const { run, under } = await setup();
  const off = run('off'),
    one = run('apply', under('irmaa1'));
  expect(one.d.nextTier).toBe(1);
  expect(one.d.absent).toBe(undefined);
  expect(one.d.applied).toBe(1);
  expect(one.row.cliffChoice).toBe('stayed under IRMAA tier');
  expect(one.row.magiProxy < off.row.magiProxy).toBe(true);
  expect(one.row.rothWithdrawn > off.row.rothWithdrawn).toBe(true);
  expect(one.row.taxableWithdrawn < off.row.taxableWithdrawn).toBe(true);
});

it('the fallback is exactly the tier-2 stay-under: every row equal', async () => {
  const { run, under } = await setup();
  const one = run('apply', under('irmaa1')),
    two = run('apply', under('irmaa2'));
  expect(two.d.nextTier).toBe(undefined);
  expect(two.d.applied).toBe(1);
  expect(one.rows).toStrictEqual(two.rows);
});

it('a planned tier above the reach (no higher tier in reach) still counts absent and keeps the natural year', async () => {
  const { run, under } = await setup();
  const off = run('off'),
    five = run('apply', under('irmaa5'));
  expect(five.d.absent).toBe(1);
  expect(five.d.nextTier).toBe(undefined);
  expect(five.rows).toStrictEqual(off.rows);
});

it('an absent ACA intent keeps the natural year', async () => {
  const { run, under } = await setup();
  const off = run('off'),
    aca = run('apply', under('aca400'));
  expect(aca.d.absent).toBe(1);
  expect(aca.d.nextTier).toBe(undefined);
  expect(aca.rows).toStrictEqual(off.rows);
});
