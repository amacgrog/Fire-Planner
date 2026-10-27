// The split draw (US, Batch 5 step 4d, Task 3): with wd.splitFirst set (0 = Partner A, 1 = B), every penalty-free traditional
// draw (takeTraditional, fillTraditional) takes that partner's free accounts first (wd.onlyPartner), then the other's, and
// profile.ownerShareA follows the realized share of the year's traditional income: on every bisection probe
// (solveSplitForNet) and after each piece. With splitFirst -1 nothing changes.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
// A couple filing two single returns, both 60, Texas, nothing else.
const PROFILE = {
  filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0,
  ageA: 60, ageB: 60, singlePerson: false, seOn: false, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 0.5, k401FracA: 0, k401FracB: 0,
  k401DrawFracA: 0, k401DrawFracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [],
};
const BAL0 = { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, traditional: 0, roth: 0, cash: 0, home: 0, mortgage: 0 };

async function setup() {
  const w = await world();
  await w.setState({ stateTax: 'tx', inflation: 0, singlePerson: false, filingStatus: 'single', tenure: 'rent' });
  const store = await w.load('shared/core/store.js');
  const draws = await w.load('us/core/withdrawals/draws.js');
  const { rothAccountsNew } = await w.load('us/core/accounts/roth-ledger.js');
  const { taxFor } = await w.load('us/core/tax/federal-tax.js');
  const ctx = await w.ctx();
  // A's IRA holds `a`, B's IRA `b` (slots 0 and 2; the 401(k) slots hold nothing).
  const mk = (a, b, { first = -1, limit = null } = {}) => {
    const pool = a + b;
    const wd = draws.newWithdrawal(ctx, {
      bal: { ...BAL0, traditional: pool },
      rothAccts: rothAccountsNew(store.state),
      accts: { trad: [a / pool, 0, b / pool, 0], roth: [1, 0, 0, 0] },
      seppActive: [false, false, false, false],
      profile: { ...PROFILE },
      conversionAmount: 0,
      rmd: 0,
    });
    wd.splitFirst = first;
    if (limit !== null) wd.magiCap = { limit, off: false };
    return wd;
  };
  // Each slot's dollars, read from the ledger.
  const dollars = (wd) => wd.accts.trad.map((sh) => sh * (wd.bal.traditional + wd.bal.bondTraditional));
  return { ctx, draws, taxFor, mk, dollars };
}

it('the new fields start off', async () => {
  const S = await setup();
  const wd = S.mk(100000, 100000);
  c.expect(wd.splitFirst).toBe(-1);
  c.expect(wd.splittable).toBe(false);
  c.expect(wd.onlyPartner).toBe(-1);
});

it('A first, A covers the need: every dollar from A, share 1', async () => {
  const S = await setup();
  const wd = S.mk(300000, 300000, { first: 0 });
  const before = S.dollars(wd);
  const net = S.draws.takeTraditional(wd, 'traditional', 50000);
  const after = S.dollars(wd);
  c.expect(net >= 50000).toBe(true);
  c.expect(wd.traditionalGross > 50000).toBe(true);
  c.expect(before[0] - after[0] > 50000).toBe(true);
  c.expect(after[2]).toBe(before[2]);
  c.expect(after[3]).toBe(before[3]);
  c.expect(wd.profile.ownerShareA).toBe(1);
  c.expect(wd.onlyPartner).toBe(-1);
  c.expect(wd.cappableTraditional).toBe(wd.traditionalGross);
});

it('A first, A runs out: the rest from B, share = A drawn / gross', async () => {
  const S = await setup();
  const wd = S.mk(20000, 300000, { first: 0 });
  const before = S.dollars(wd);
  const net = S.draws.takeTraditional(wd, 'traditional', 50000);
  const after = S.dollars(wd);
  const drawnA = before[0] - after[0];
  c.expect(Math.abs(after[0]) <= 0.01).toBe(true);
  c.expect(before[2] - after[2] > 30000).toBe(true);
  c.expect(net >= 50000 - 1).toBe(true);
  c.expect(wd.traditionalWithdrawn).toBe(wd.traditionalGross);
  c.expect(wd.bal.traditional).toBe(320000 - wd.traditionalGross);
  c.expect(wd.profile.ownerShareA).toBe(drawnA / wd.traditionalGross);
  c.expect(wd.onlyPartner).toBe(-1);
});

it('B first mirror: share 0 when B covers it', async () => {
  const S = await setup();
  const wd = S.mk(300000, 300000, { first: 1 });
  const before = S.dollars(wd);
  S.draws.takeTraditional(wd, 'traditional', 50000);
  const after = S.dollars(wd);
  c.expect(after[0]).toBe(before[0]);
  c.expect(after[1]).toBe(before[1]);
  c.expect(before[2] - after[2] > 50000).toBe(true);
  c.expect(wd.profile.ownerShareA).toBe(0);
  c.expect(wd.onlyPartner).toBe(-1);
});

it('a fill in an A-first pass draws A only, share 1', async () => {
  const S = await setup();
  const wd = S.mk(300000, 300000, { first: 0 });
  const before = S.dollars(wd);
  const got = S.draws.fillTraditional(wd, 30000);
  const after = S.dollars(wd);
  c.expect(got).toBe(30000);
  c.expect(wd.traditionalGross).toBe(30000);
  c.expect(wd.bal.traditional).toBe(570000);
  c.expect(after[2]).toBe(before[2]);
  c.expect(after[3]).toBe(before[3]);
  c.expect(wd.profile.ownerShareA).toBe(1);
  c.expect(wd.onlyPartner).toBe(-1);
  // The cash is the fill less the tax it adds on A's return alone.
  const P = { ...PROFILE, ownerShareA: 1 };
  c.expect(wd.bal.cash).toBe(30000 - (S.taxFor(S.ctx, P, 0, 30000) - S.taxFor(S.ctx, P, 0, 0)));
});

it('a fill past A draws the rest from B, share = 20,000 / 30,000', async () => {
  const S = await setup();
  const wd = S.mk(20000, 300000, { first: 0 });
  const got = S.draws.fillTraditional(wd, 30000);
  c.expect(Math.abs(got - 30000) <= 1e-6).toBe(true);
  c.expect(wd.profile.ownerShareA).toBe(20000 / wd.traditionalGross);
  c.expect(wd.onlyPartner).toBe(-1);
});

it('splitFirst -1: takeTraditional is the pro-rata solver', async () => {
  const S = await setup();
  const wd = S.mk(100000, 300000);
  const net = S.draws.takeTraditional(wd, 'traditional', 50000);
  const r = S.draws.solveTraditionalForNet(S.ctx, 400000, 50000, 0, 0, { ...PROFILE }, 0);
  c.expect(net).toBe(r.tradNet);
  c.expect(wd.traditionalGross).toBe(r.fromTrad);
  c.expect(wd.profile.ownerShareA).toBe(0.5);
  c.expect(wd.onlyPartner).toBe(-1);
});

it('under a MAGI cap the split stops at the room across both partners', async () => {
  const S = await setup();
  const wd = S.mk(6000, 300000, { first: 0, limit: 10000 });
  S.draws.takeTraditional(wd, 'traditional', 50000);
  c.expect(S.draws.magiCapLeft(wd)).toBe(0);
  c.expect(wd.traditionalGross).toBe(10000);
  c.expect(wd.cappableTraditional).toBe(10000);
  c.expect(wd.profile.ownerShareA).toBe(0.6);
  c.expect(wd.onlyPartner).toBe(-1);
});

it('the probe share: solveSplitForNet from zero on A is the pro-rata solver at share 1', async () => {
  const S = await setup();
  const p = { ...PROFILE };
  const r = S.draws.solveSplitForNet(S.ctx, 300000, 50000, 0, 0, p, 0, 0, false);
  const q = S.draws.solveTraditionalForNet(S.ctx, 300000, 50000, 0, 0, { ...PROFILE, ownerShareA: 1 }, 0);
  c.expect(r.fromTrad).toBe(q.fromTrad);
  c.expect(r.tradNet).toBe(q.tradNet);
  // The from-need bracket matches solveTraditionalForNetFromNeed the same way.
  const rn = S.draws.solveSplitForNet(S.ctx, 300000, 50000, 0, 0, { ...PROFILE }, 0, 0, true);
  const qn = S.draws.solveTraditionalForNetFromNeed(S.ctx, 300000, 50000, 0, 0, { ...PROFILE, ownerShareA: 1 }, 0);
  c.expect(rn.fromTrad).toBe(qn.fromTrad);
  c.expect(rn.tradNet).toBe(qn.tradNet);
  // B's probes put nothing on A's return: the pro-rata solver at share 0.
  const rb = S.draws.solveSplitForNet(S.ctx, 300000, 50000, 0, 0, { ...PROFILE }, 0, 1, false);
  const qb = S.draws.solveTraditionalForNet(S.ctx, 300000, 50000, 0, 0, { ...PROFILE, ownerShareA: 0 }, 0);
  c.expect(rb.fromTrad).toBe(qb.fromTrad);
  c.expect(rb.tradNet).toBe(qb.tradNet);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(49);
});
