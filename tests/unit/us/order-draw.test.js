// The draw step reads the plan's order intent (US, Batch 5 step 4c, Task 1): drawMixedStockAccounts runs an explicit mix, then
// the order intent (wd.taxAwareOrder 'traditional': penalty-free traditional first, then taxable), then smoothing, else the
// caller's taxable-first default; wd.orderable records whether the order could apply (need, taxable and penalty-free
// traditional money). The withdrawal-mix toggle no longer changes the draw.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
// Single, 60, Texas, nothing else: 2026 standard deduction 16,100, so a traditional draw up to 16,100 nets its gross and a
// long-term gain inside it is taxed at 0%.
const PROFILE = {
  filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0,
  ageA: 60, ageB: null, singlePerson: true, seOn: false, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0,
  mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [],
};
const BAL0 = { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, traditional: 0, roth: 0, cash: 0, home: 0, mortgage: 0 };
// The first case's household: taxable 200,000 on a basis of 100,000 (gain ratio 0.5), 10,000 in A's IRA (penalty-free at 60).
const HH = { taxable: 200000, taxableBasis: 100000, traditional: 10000 };
const NEED = 15000;
// At zero tax drawTaxable bisects on [need, 3 need + 1] and keeps the top: need + (2 need + 1) / 2**24.
const sale = (need) => need + (2 * need + 1) / 2 ** 24;

// newTestWithdrawal of src/us/ui/install-test-hooks.js, through the exported newWithdrawal, as the engine builds one.
// `mix`: a per-age withdrawal-mix map (optimizerState.withdrawalMixByAge, written before the context is built).
async function setup(patch = {}, mix = null) {
  const w = await world();
  await w.setState({ stateTax: 'tx', inflation: 0, singlePerson: true, tenure: 'rent', ...patch });
  if (mix) (await w.load('us/core/optimizer-state.js')).optimizerState.withdrawalMixByAge = mix;
  const store = await w.load('shared/core/store.js');
  const draws = await w.load('us/core/withdrawals/draws.js');
  const strategies = await w.load('us/core/withdrawals/strategies.js');
  const { withdrawBucket } = await w.load('shared/core/withdrawals/bucket-order.js');
  const { rothAccountsNew } = await w.load('us/core/accounts/roth-ledger.js');
  const { hasPenalizedMoney } = await w.load('us/core/accounts/penalty-status.js');
  const ctx = await w.ctx();
  const mk = (balPatch, { order = null, limit = null } = {}) => {
    const wd = draws.newWithdrawal(ctx, {
      bal: { ...BAL0, ...balPatch },
      rothAccts: rothAccountsNew(store.state),
      accts: { trad: [1, 0, 0, 0], roth: [1, 0, 0, 0] },
      seppActive: [false, false, false, false],
      profile: { ...PROFILE },
      conversionAmount: 0,
      rmd: 0,
    });
    wd.need = NEED;
    wd.taxAwareOrder = order;
    if (limit !== null) wd.magiCap = { limit, off: false };
    return wd;
  };
  return { strategies, withdrawBucket, hasPenalizedMoney, mk };
}
const STD = (S, wd, age = 60) => S.strategies.withdrawStandard(wd, { age });

// Traditional first on the first household: 10,000 of traditional nets its gross, then 5,000 of taxable.
function expectTraditionalFirst(wd) {
  const T = sale(NEED - 10000);
  c.expect(wd.traditionalWithdrawn).toBe(10000);
  c.expect(wd.traditionalGross).toBe(10000);
  c.expect(wd.taxableWithdrawn).toBe(T);
  c.expect(wd.taxableGainGross).toBe(T * 0.5);
  c.expect(wd.cappableTraditional).toBe(10000);
  c.expect(wd.cappableGain).toBe(T * 0.5);
  c.expect(wd.earlyPenalty).toBe(0);
  c.expect(wd.orderable).toBe(true);
  return T;
}

it('traditional-first draws penalty-free traditional, then taxable', async () => {
  const S = await setup();
  const wd = S.mk(HH, { order: 'traditional' });
  STD(S, wd);
  const T = expectTraditionalFirst(wd);
  // The sale's overshoot, 5,000 - T, is handed to takeRoth (rothDraw returns a negative target even with nothing in Roth).
  const left = NEED - 10000 - T;
  c.expect(wd.need).toBe(0);
  c.expect(wd.rothWithdrawn).toBe(left);
  c.expect(wd.mixCandidate).toBe(null);
  c.expect(wd.bal).toStrictEqual({ ...BAL0, taxable: 200000 - T, taxableBasis: 100000 - T * 0.5, traditional: 0, roth: 0 - left });
});

it('taxable-first is unchanged with taxAwareOrder null', async () => {
  const S = await setup();
  const wd = S.mk(HH);
  STD(S, wd);
  const T = sale(NEED),
    left = NEED - T;
  c.expect(wd.taxableWithdrawn).toBe(T);
  c.expect(wd.taxableGainGross).toBe(T * 0.5);
  c.expect(wd.traditionalWithdrawn).toBe(0);
  c.expect(wd.cappableTraditional).toBe(0);
  c.expect(wd.orderable).toBe(true);
  c.expect(wd.need).toBe(0);
  c.expect(wd.rothWithdrawn).toBe(left);
  c.expect(wd.bal).toStrictEqual({ ...BAL0, taxable: 200000 - T, taxableBasis: 100000 - T * 0.5, traditional: 10000, roth: 0 - left });
});

it('an explicit mix wins over the order and is not orderable', async () => {
  const S = await setup({}, new Map([[60, 'taxable']]));
  const wd = S.mk(HH, { order: 'traditional' });
  STD(S, wd);
  const T = sale(NEED);
  c.expect(wd.mixCandidate).toBe('taxable');
  c.expect(wd.taxableWithdrawn).toBe(T);
  c.expect(wd.traditionalWithdrawn).toBe(0);
  c.expect(wd.orderable).toBe(false);
  c.expect(wd.bal.traditional).toBe(10000);
});

it('smoothing runs when no order is set (A1)', async () => {
  const S = await setup({ smoothWithdrawals: true, withdrawalMixEnabled: true });
  // No order: the smoothing proportions, taxable 200,000 and penalty-free traditional 10,000 (the toggle no longer skips it).
  const wd = S.mk(HH);
  STD(S, wd);
  const share = 15000 * (200000 / 210000),
    tradShare = 15000 * (10000 / 210000);
  c.expect(wd.mixCandidate).toBe(null);
  c.expect(wd.taxableWithdrawn).toBe(sale(share));
  c.expect(wd.taxableGainGross).toBe(sale(share) * 0.5);
  // The traditional share's bisection on [0, 6 share + 1] keeps its top: at zero tax within one step of the share.
  c.expect(wd.traditionalWithdrawn >= tradShare).toBe(true);
  c.expect(wd.traditionalWithdrawn - tradShare <= (6 * tradShare + 1) / 2 ** 23).toBe(true);
  c.expect(wd.need).toBe(0);
  c.expect(wd.orderable).toBe(true);
  // The order wins over smoothing.
  const wo = S.mk(HH, { order: 'traditional' });
  STD(S, wo);
  expectTraditionalFirst(wo);
  c.expect(wo.need).toBe(0);
});

it('under a cap: traditional is capped at the room, taxable at the room left', async () => {
  const S = await setup();
  // No gain (basis = value), so the sale is not limited by the room left (0).
  const wd = S.mk({ taxable: 200000, taxableBasis: 200000, traditional: 20000 }, { order: 'traditional', limit: 12000 });
  wd.need = 30000;
  STD(S, wd);
  const T = sale(30000 - 12000),
    left = 30000 - 12000 - T;
  c.expect(wd.traditionalWithdrawn).toBe(12000);
  c.expect(wd.cappableTraditional).toBe(12000);
  c.expect(wd.taxableWithdrawn).toBe(T);
  c.expect(wd.taxableGainGross).toBe(0);
  c.expect(wd.cappableGain).toBe(0);
  c.expect(wd.orderable).toBe(true);
  c.expect(wd.need).toBe(0);
  c.expect(wd.magiCap.off).toBe(true);
  // Nothing drawn by the release: traditional keeps all but the room, taxable all but the sale.
  c.expect(wd.bal).toStrictEqual({ ...BAL0, taxable: 200000 - T, taxableBasis: 200000 - T, traditional: 20000 - 12000, roth: 0 - left });
});

it('penalized money stays last', async () => {
  const S = await setup({ ageA: 50, retireAgeA: 50 });
  // A at 50: every traditional account penalized (A's IRA holds it all), so no penalty-free traditional to order.
  const run = (order) => {
    const wd = S.mk({ taxable: 5000, taxableBasis: 2500, traditional: 100000 }, { order });
    wd.profile.ageA = 50;
    wd.status = [0, 1, 2, 3].map(() => ({ free: false, qualified: false }));
    wd.penaltyAware = S.hasPenalizedMoney(wd);
    STD(S, wd, 50);
    return wd;
  };
  const a = run('traditional'),
    b = run(null);
  c.expect(a.penaltyAware).toBe(true);
  c.expect(a.orderable).toBe(false);
  c.expect(b.orderable).toBe(false);
  c.expect(a.earlyPenalty > 0).toBe(true);
  c.expect({ ...a, taxAwareOrder: null }).toStrictEqual(b);
});

it('bucket stocks step reads the order', async () => {
  const S = await setup();
  const wd = S.mk({ ...HH, cash: 0 }, { order: 'traditional' });
  S.withdrawBucket(wd, { yearReturn: 0.05, bondTarget: 0, refillCap: Infinity, age: 60 });
  const T = expectTraditionalFirst(wd);
  // The bucket's Roth step runs only on a positive need: the overshoot stays in need.
  c.expect(wd.need).toBe(NEED - 10000 - T);
  c.expect(wd.bal).toStrictEqual({ ...BAL0, taxable: 200000 - T, taxableBasis: 100000 - T * 0.5, traditional: 0 });
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(65);
});
