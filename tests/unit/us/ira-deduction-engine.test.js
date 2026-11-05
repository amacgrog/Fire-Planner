// The IRC 219(g) traditional IRA deduction phase-out in the year loop (PR 2 Task 3): the per-pass add-back of the
// nondeductible dollars, the single range on two returns, and the deduction converged with a draw year's MAGI.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

// The owner case: MFJ, ages 58 / 56, a Roth 401(k) each (coverage), a traditional IRA at 100% each, both working through the
// run's first years. No taxable or cash money and a low spending, so the first year has no investment income and no draw (at
// 100% the Roth 401(k) money would leave a deficit the traditional 401(k)s cover, so the deferral is 10% of the limit).
const OWNER = {
  filingStatus: 'mfj', ageA: 58, ageB: 56, incomeA: 115000, incomeB: 72000, retireAgeA: 65, retireAgeB: 65,
  k401TypeA: 'roth', k401TypeB: 'roth', k401PctA: 10, k401PctB: 10, catchupPctA: 0, catchupPctB: 0, iraTypeA: 'traditional',
  iraTypeB: 'traditional', iraPctA: 100, iraPctB: 100, taxable: 0, cash: 0, cashReserve: 0, spending: 20000, cliffGuardEnabled: false,
};

// The rows of a fresh world's uncached run of `patch`; `off`: with ctx.test.iraPhaseoutOff.
async function rowsOf(patch, off = false) {
  const w = await world();
  await w.setState(patch);
  if (off) (await w.load('us/core/test-hooks.js')).assignIraPhaseoutOff(true);
  const e = await engine(w);
  return e.simulateRaw().rows;
}

it('fully phased out equals no IRA deduction', async () => {
  const x = (await rowsOf(OWNER))[0];
  const y = (await rowsOf({ ...OWNER, iraPctA: 0, iraPctB: 0 }))[0];
  expect(x.traditionalWithdrawn).toBe(0);
  expect(x.tax).toBe(y.tax);
  expect(x.iraDeducted).toBe(0);
  expect(x.iraNondeductible).toBe(17200);
  // 219(g) MAGI: the wages (Roth 401(k) money is not deducted), over the joint covered range's top
  expect(x.iraMagi).toBe(187000);
  // the run without the IRA carries none of the fields
  expect(y.iraDeducted).toBe(undefined);
});

it('nobody covered keeps the full deduction', async () => {
  const patch = { ...OWNER, k401PctA: 0, k401PctB: 0, catchupPctA: 0, catchupPctB: 0, matchA: 0, matchB: 0 };
  const on = await rowsOf(patch);
  const off = await rowsOf(patch, true);
  expect(on[0].iraDeducted).toBe(17200);
  expect(on[0].iraNondeductible).toBe(0);
  expect(on[0].iraMagi).toBe(undefined);
  expect(on.length).toBe(off.length);
  for (let i = 0; i < on.length; i++) {
    expect(on[i].tax).toBe(off[i].tax);
    expect(on[i].magiProxy).toBe(off[i].magiProxy);
    expect(on[i].traditional).toBe(off[i].traditional);
  }
});

it('inside the range the deduction is partial', async () => {
  // 80,000 + 59,000 of wages: a 219(g) MAGI of 139,000, the joint covered range's midpoint (8,600 - 4,300 each)
  const rows = await rowsOf({ ...OWNER, incomeA: 80000, incomeB: 59000 });
  const off = await rowsOf({ ...OWNER, incomeA: 80000, incomeB: 59000 }, true);
  expect(rows[0].traditionalWithdrawn).toBe(0);
  expect(rows[0].iraMagi).toBe(139000);
  expect(rows[0].iraDeducted).toBe(8600);
  expect(rows[0].iraNondeductible).toBe(8600);
  // the nondeductible 8,600 is back in the year's MAGI
  expect(rows[0].magiProxy).toBe(off[0].magiProxy + 8600);
  expect(off[0].iraDeducted).toBe(17200);
});

it('two returns use the single range', async () => {
  // Before the wedding at A's 59 the couple files two single returns. A: 86,000 of wages, a 219(g) MAGI of 86,000 (the single
  // range's midpoint: 4,300 deducted); B: 60,000, under the range (8,600 deducted). The joint range on 146,000 would deduct 1,290 each.
  const rows = await rowsOf({ ...OWNER, incomeA: 86000, incomeB: 60000, marryLater: true, marriageAgeA: 59 });
  expect(rows[0].traditionalWithdrawn).toBe(0);
  expect(rows[0].iraMagi).toBe(86000);
  expect(rows[0].iraDeducted).toBe(12900);
  expect(rows[0].iraNondeductible).toBe(4300);
  // married from the second year: the joint range on the household's MAGI
  expect(rows[1].iraNondeductible > 4300).toBe(true);
});

it('a draw year converges the deduction', async () => {
  // A works (covered, contributing); B is retired at 60 and the household draws from the traditional 401(k)s.
  const w = await world();
  await w.setState({
    ...OWNER, ageA: 58, ageB: 60, incomeA: 100000, incomeB: 0, retireAgeA: 65, retireAgeB: 60, spending: 70000,
    trad401kA: 400000, trad401kB: 400000,
  });
  const { iraDeductionLimit } = await w.load('us/core/income/ira-deduction.js');
  const { MAGI_ITER_TOL } = await w.load('us/core/projection/engine-state.js');
  const e = await engine(w);
  const r = e.simulateRaw().rows[0];
  expect(r.traditionalWithdrawn > 0).toBe(true);
  expect(r.iraDeducted + r.iraNondeductible).toBe(8600);
  // a partial deduction: the draw put the year inside the joint covered range
  expect(r.iraDeducted > 0 && r.iraDeducted < 8600).toBe(true);
  expect(r.iraDeducted).toBe(Math.min(8600, iraDeductionLimit(8600, r.iraMagi, 129000, 149000)));
  // the final pass's 219(g) MAGI is the year's realized MAGI before the add-back plus the contribution, within the tolerance
  expect(Math.abs(r.iraMagi - (r.magiProxy - r.iraNondeductible + 8600)) <= MAGI_ITER_TOL).toBe(true);
});

it('Roth IRA partner is untouched', async () => {
  const r = (await rowsOf({ ...OWNER, iraTypeA: 'roth' }))[0];
  expect(r.iraNondeductible).toBe(8600);
  expect(r.iraDeducted).toBe(0);
});
