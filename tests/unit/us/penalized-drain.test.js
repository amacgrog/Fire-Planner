// takePenalized drains penalized money it chooses (US): a candidate's room is its accounts' whole dollars in the bucket
// (never more than the bucket), not their share of the bucket. With a share of the bucket, an account holding both buckets
// kept a geometrically shrinking room after every draw (the shares renormalize), so the cheapest candidate never emptied,
// the 40 passes ran out with the need unmet, and the year fell through to home equity with penalized money left.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
// Both 50 (every account penalized), Texas, nothing else: 2026 standard deduction 16,100, so a traditional draw of 1,024 owes
// no income tax, only the 10%.
const PROFILE = {
  filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0,
  ageA: 50, ageB: null, singlePerson: true, seOn: false, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0,
  mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [],
};
const BAL0 = { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, traditional: 0, roth: 0, cash: 0, home: 0, mortgage: 0 };
const PENALIZED = [0, 1, 2, 3].map(() => ({ free: false, qualified: false }));
const NEED = 5000;

async function setup() {
  const w = await world();
  await w.setState({ stateTax: 'tx', inflation: 0, singlePerson: true, tenure: 'rent' });
  const draws = await w.load('us/core/withdrawals/draws.js');
  const ctx = await w.ctx();
  const mk = (balPatch, accts, rothAccts, seppActive = [false, false, false, false]) => {
    const wd = draws.newWithdrawal(ctx, {
      bal: { ...BAL0, ...balPatch },
      rothAccts,
      accts,
      seppActive,
      profile: { ...PROFILE },
      conversionAmount: 0,
      rmd: 0,
    });
    wd.status = PENALIZED;
    wd.penaltyAware = true;
    wd.need = NEED;
    return wd;
  };
  return { draws, mk };
}
const noLedger = () => [0, 1, 2, 3].map(() => ({ basis: 0, conv: [] }));

it('two Roth IRAs holding both buckets are drained, not halved', async () => {
  const S = await setup();
  // Each IRA holds 1,024, all of it an unseasoned conversion (the 10% only, no income tax); the pool is 1,024 stock + 1,024 bonds.
  const R = noLedger();
  R[0].conv.push({ year: 0, amount: 1024 });
  R[2].conv.push({ year: 0, amount: 1024 });
  const wd = S.mk({ roth: 1024, bondRoth: 1024 }, { trad: [1, 0, 0, 0], roth: [0.5, 0, 0.5, 0] }, R);
  S.draws.takePenalized(wd, S.draws.solveTraditionalForNetFromNeed);
  // Pass 1: A's IRA, stock bucket, room min(0.5 x 2,048, 1,024) = 1,024: the stock bucket empties and A's IRA with it.
  // Pass 2: B's IRA, bond bucket, room 1,024. Each nets 1,024 - 102.4.
  c.expect(wd.bal.roth).toBe(0);
  c.expect(wd.bal.bondRoth).toBe(0);
  c.expect(wd.rothWithdrawn).toBe(2048);
  c.expect(wd.earlyPenalty).toBe(0.1 * 1024 + 0.1 * 1024);
  c.expect(wd.traditionalGross).toBe(0);
  c.expect(wd.need).toBe(NEED - (1024 - 0.1 * 1024) - (1024 - 0.1 * 1024));
  c.expect(R[0].conv).toStrictEqual([]);
  c.expect(R[2].conv).toStrictEqual([]);
});

it('a penalized traditional account beside a SEPP account is drained, not halved', async () => {
  const S = await setup();
  // A's IRA (penalized) and A's 401(k) (under SEPP, outside the penalized group) hold 1,024 each; the pool is 1,024 stock + 1,024 bonds.
  const wd = S.mk({ traditional: 1024, bondTraditional: 1024 }, { trad: [0.5, 0.5, 0, 0], roth: [1, 0, 0, 0] }, noLedger(), [false, true, false, false]);
  S.draws.takePenalized(wd, S.draws.solveTraditionalForNetFromNeed);
  // One pass: the IRA's room in the stock bucket is min(0.5 x 2,048, 1,024) = 1,024, all of its dollars. The SEPP 401(k) keeps
  // the rest of the pool (the bond bucket).
  c.expect(wd.bal.traditional).toBe(0);
  c.expect(wd.bal.bondTraditional).toBe(1024);
  c.expect(wd.accts.trad).toStrictEqual([0, 1, 0, 0]);
  c.expect(wd.traditionalWithdrawn).toBe(1024);
  c.expect(wd.traditionalGross).toBe(1024);
  c.expect(wd.earlyPenalty).toBe(1024 * 0.1);
  c.expect(wd.need).toBe(NEED - (1024 - 1024 * 0.1));
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(15);
});
