// A withdrawal mix's shortfall falls through to the other stock accounts (US): takeTaxableCapped (a taxable sale within the MAGI
// room) and the fallthrough in both strategies and releaseMagiCap.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const PROFILE = { wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 55, ageB: 55, singlePerson: true, filing: 'single' };

async function cappedSetup(taxable, basis) {
  const w = await world();
  await w.setState();
  w.setTaxYear(2026);
  const draws = await w.load('us/core/withdrawals/draws.js');
  const shared = await w.load('shared/core/withdrawals/draws.js');
  const ctx = await w.ctx();
  const mk = () => ({
    bal: { taxable, taxableBasis: basis, traditional: 0, roth: 0, cash: 0 },
    profile: { ...PROFILE }, taxableGainGross: 0, traditionalGross: 0, taxableWithdrawn: 0, ctx,
  });
  return { draws, shared, mk };
}

it('takeTaxableCapped: room binds', async () => {
  const { draws, mk } = await cappedSetup(100000, 50000);
  const wd = mk();
  const net = draws.takeTaxableCapped(wd, 'taxable', 60000, 10000);
  expect(wd.taxableGainGross).toBe(10000);
  expect(wd.bal.taxable).toBe(80000);
  expect(wd.bal.taxableBasis).toBe(40000);
  expect(net < 60000).toBe(true);
});

it('takeTaxableCapped: a loose room is takeTaxable to the bit', async () => {
  const { draws, shared, mk } = await cappedSetup(100000, 37000);
  const a = mk(), b = mk();
  const na = draws.takeTaxableCapped(a, 'taxable', 40000, 1e9);
  const nb = shared.takeTaxable(b, 'taxable', 40000);
  expect(na).toBe(nb);
  expect(a.bal).toStrictEqual(b.bal);
  expect(a.taxableGainGross).toBe(b.taxableGainGross);
  expect(a.taxableWithdrawn).toBe(b.taxableWithdrawn);
});

it('takeTaxableCapped: gain ratio 0 with the room used up sells without NaN', async () => {
  const { draws, mk } = await cappedSetup(100000, 100000);
  const wd = mk();
  const net = draws.takeTaxableCapped(wd, 'taxable', 30000, 0);
  expect(net >= 30000).toBe(true);
  for (const k of Object.keys(wd.bal)) expect(Number.isFinite(wd.bal[k])).toBe(true);
});

it('takeTaxableCapped: room 0 with gains sells nothing', async () => {
  const { draws, mk } = await cappedSetup(100000, 50000);
  const wd = mk();
  const before = { ...wd.bal };
  expect(draws.takeTaxableCapped(wd, 'taxable', 30000, 0)).toBe(0);
  expect(wd.bal).toStrictEqual(before);
  expect(wd.taxableWithdrawn).toBe(0);
});
