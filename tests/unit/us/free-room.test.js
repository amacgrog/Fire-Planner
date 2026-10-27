// The penalty-free draws (US) drain the free money they may use: a group's room in a bucket is its accounts' whole dollars
// (never more than the bucket), not their share of the bucket. Shares are shares of the pool (stock + bond bucket) and the ledger
// renormalizes them after every draw, so when the free group was only part of the pool (a SEPP slot, mixed penalty status, the
// split draw's one partner), a stock call followed by a bond call left free money undrawn: it then went to penalized money or
// home equity. The sites: takeTraditional, takeTraditionalSplit, fillTraditional(Split), rothFreeCaps.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
// Partner A 60, Texas, nothing else: 2026 standard deduction 16,100 (single), so a draw of a few thousand owes no income tax and
// every probe nets its gross (each bisection ends at its cap).
const PROFILE = {
  filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0,
  ageA: 60, ageB: 60, singlePerson: false, seOn: false, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 0.5, k401FracA: 0, k401FracB: 0,
  k401DrawFracA: 0, k401DrawFracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [],
};
const BAL0 = { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, traditional: 0, roth: 0, cash: 0, home: 0, mortgage: 0 };
const FREE = { free: true, qualified: true },
  PEN = { free: false, qualified: false };
const NEED = 5000;
const noLedger = () => [0, 1, 2, 3].map(() => ({ basis: 0, conv: [] }));

async function setup() {
  const w = await world();
  await w.setState({ stateTax: 'tx', inflation: 0, singlePerson: false, filingStatus: 'single', tenure: 'rent' });
  const draws = await w.load('us/core/withdrawals/draws.js');
  const ctx = await w.ctx();
  const mk = (balPatch, accts, { status = [FREE, FREE, FREE, FREE], sepp = [false, false, false, false], R = noLedger() } = {}) => {
    const wd = draws.newWithdrawal(ctx, {
      bal: { ...BAL0, ...balPatch },
      rothAccts: R,
      accts,
      seppActive: sepp,
      profile: { ...PROFILE },
      conversionAmount: 0,
      rmd: 0,
    });
    wd.status = status;
    wd.penaltyAware = true;
    return wd;
  };
  return { draws, mk };
}

it('takeTraditional beside a SEPP account drains the free IRA', async () => {
  const S = await setup();
  // A's IRA (free) and A's 401(k) (under SEPP) hold 1,024 each; the pool is 1,024 stock + 1,024 bonds.
  const wd = S.mk({ traditional: 1024, bondTraditional: 1024 }, { trad: [0.5, 0.5, 0, 0], roth: [1, 0, 0, 0] }, { sepp: [false, true, false, false] });
  const net = S.draws.takeTraditional(wd, 'traditional', NEED) + S.draws.takeTraditional(wd, 'bondTraditional', NEED);
  // Stock call: room min(1,024, 0.5 x 2,048) = 1,024, all of the IRA. The bond call finds the IRA empty. (With a share of the
  // bucket: 512 from stocks, then 1/3 x 1,024 from bonds, 170.67 stranded.)
  c.expect(wd.traditionalWithdrawn).toBe(1024);
  c.expect(net).toBe(1024);
  c.expect(wd.bal.traditional).toBe(0);
  c.expect(wd.bal.bondTraditional).toBe(1024);
  c.expect(wd.accts.trad).toStrictEqual([0, 1, 0, 0]);
});

it('fillTraditional beside a SEPP account fills from the whole free IRA', async () => {
  const S = await setup();
  const wd = S.mk({ traditional: 1024, bondTraditional: 1024 }, { trad: [0.5, 0.5, 0, 0], roth: [1, 0, 0, 0] }, { sepp: [false, true, false, false] });
  c.expect(S.draws.fillTraditional(wd, NEED)).toBe(1024);
  c.expect(wd.bal.cash).toBe(1024);
  c.expect(wd.bal.traditional).toBe(0);
  c.expect(wd.bal.bondTraditional).toBe(1024);
  c.expect(wd.accts.trad).toStrictEqual([0, 1, 0, 0]);
});

it('the split draw drains each partner, stock call then bond call', async () => {
  const S = await setup();
  // A's IRA and B's IRA hold 1,024 each; the pool is 1,024 stock + 1,024 bonds; A first.
  const wd = S.mk({ traditional: 1024, bondTraditional: 1024 }, { trad: [0.5, 0, 0.5, 0], roth: [1, 0, 0, 0] });
  wd.splitFirst = 0;
  const net = S.draws.takeTraditional(wd, 'traditional', NEED) + S.draws.takeTraditional(wd, 'bondTraditional', NEED);
  // Stock call: A's room min(1,024, 0.5 x 2,048) = 1,024 empties the stock bucket; B's room is then min(0, ...) = 0. Bond call:
  // A holds nothing, B's room min(1,024, 1 x 1,024) = 1,024.
  c.expect(wd.traditionalWithdrawn).toBe(2048);
  c.expect(net).toBe(2048);
  c.expect(wd.bal.traditional).toBe(0);
  c.expect(wd.bal.bondTraditional).toBe(0);
  c.expect(wd.profile.ownerShareA).toBe(0.5);
});

it('fillTraditional in a split pass drains both partners', async () => {
  const S = await setup();
  const wd = S.mk({ traditional: 1024, bondTraditional: 1024 }, { trad: [0.5, 0, 0.5, 0], roth: [1, 0, 0, 0] });
  wd.splitFirst = 0;
  c.expect(S.draws.fillTraditional(wd, NEED)).toBe(2048);
  c.expect(wd.bal.cash).toBe(2048);
  c.expect(wd.bal.traditional).toBe(0);
  c.expect(wd.bal.bondTraditional).toBe(0);
});

it('takeRoth drains a free Roth IRA beside a penalized one', async () => {
  const S = await setup();
  // A's Roth IRA (free) and B's Roth IRA (penalized, no basis) hold 1,024 each; the pool is 1,024 stock + 1,024 bonds.
  const wd = S.mk({ roth: 1024, bondRoth: 1024 }, { trad: [1, 0, 0, 0], roth: [0.5, 0, 0.5, 0] }, { status: [FREE, FREE, PEN, PEN] });
  const net = S.draws.takeRoth(wd, 'roth', NEED) + S.draws.takeRoth(wd, 'bondRoth', NEED);
  // Stock call: A's room min(1,024, 0.5 x 2,048) = 1,024. Bond call: A holds nothing, B's free room is 0.
  c.expect(wd.rothWithdrawn).toBe(1024);
  c.expect(net).toBe(1024);
  c.expect(wd.bal.roth).toBe(0);
  c.expect(wd.bal.bondRoth).toBe(1024);
  c.expect(wd.accts.roth).toStrictEqual([0, 0, 1, 0]);
  c.expect(wd.earlyPenalty).toBe(0);
});

it("an early Roth IRA's basis is free room in whichever bucket is drawn", async () => {
  const S = await setup();
  // B's Roth IRA (penalized, basis 1,024 of its 1,024) beside A's free Roth IRA; the pool is 1,024 stock + 1,024 bonds.
  const R = noLedger();
  R[2].basis = 1024;
  const wd = S.mk({ roth: 1024, bondRoth: 1024 }, { trad: [1, 0, 0, 0], roth: [0.5, 0, 0.5, 0] }, { status: [FREE, FREE, PEN, PEN], R });
  // Free caps in the stock bucket: A min(1,024, 1,024), B min(1,024, basis 1,024): 2,048 of room, more than the bucket.
  c.expect(S.draws.takeRoth(wd, 'roth', NEED)).toBe(1024);
  c.expect(wd.bal.roth).toBe(0);
  // The draw came half from each (in proportion to the room): A and B each hold 512, B's basis is 512.
  c.expect(wd.accts.roth).toStrictEqual([0.5, 0, 0.5, 0]);
  c.expect(R[2].basis).toBe(512);
  // Bond call: A min(1,024, 512), B min(1,024, basis 512): the rest of the pool, all of it penalty-free.
  c.expect(S.draws.takeRoth(wd, 'bondRoth', NEED)).toBe(1024);
  c.expect(wd.bal.bondRoth).toBe(0);
  c.expect(wd.rothWithdrawn).toBe(2048);
  c.expect(wd.earlyPenalty).toBe(0);
  c.expect(R[2].basis).toBe(0);
});

it("an early Roth IRA's whole basis is its room, not its share of the bucket", async () => {
  const S = await setup();
  // A's Roth IRA and B's (both penalized) hold 1,024 each, B's half basis (512); the pool is 1,024 stock + 1,024 bonds.
  const R = noLedger();
  R[2].basis = 512;
  const wd = S.mk({ roth: 1024, bondRoth: 1024 }, { trad: [1, 0, 0, 0], roth: [0.5, 0, 0.5, 0] }, { status: [PEN, PEN, PEN, PEN], R });
  // B's room min(basis 512, dollars 1,024) = 512, all of it in the stock bucket. (A share of the bucket: 0.5 x 1,024 x 512 / 1,024 = 256.)
  c.expect(S.draws.takeRoth(wd, 'roth', NEED)).toBe(512);
  c.expect(wd.rothWithdrawn).toBe(512);
  c.expect(wd.bal.roth).toBe(512);
  c.expect(R[2].basis).toBe(0);
  c.expect(wd.earlyPenalty).toBe(0);
});

it('free Roth rooms larger than the bucket keep the draw pro rata', async () => {
  const S = await setup();
  // A's Roth IRA (free) holds 3,072, B's (penalized, all basis) 1,024; the pool is 1,024 stock + 3,072 bonds.
  const R = noLedger();
  R[2].basis = 1024;
  const wd = S.mk({ roth: 1024, bondRoth: 3072 }, { trad: [1, 0, 0, 0], roth: [0.75, 0, 0.25, 0] }, { status: [FREE, FREE, PEN, PEN], R });
  // Rooms 3,072 and 1,024 (not each capped at the 1,024 bucket, which would weigh them 1:1): 512 comes 3/4 from A, 1/4 from B.
  c.expect(S.draws.takeRoth(wd, 'roth', 512)).toBe(512);
  c.expect(wd.bal.roth).toBe(512);
  c.expect(R[2].basis).toBe(896);
  c.expect(wd.accts.roth).toStrictEqual([0.75, 0, 0.25, 0]);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(43);
});
