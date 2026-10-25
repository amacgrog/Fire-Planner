// takeStockTaxable (US, Batch 5 step 4b): every stock-account taxable sale is capped under a stay-under's MAGI cap and its gain
// counted in wd.cappableGain; the bond reserve's sales, the ladder gain and the release's sale are not counted. And the
// gains-capped stay-under (Task 2): underEligible offers a household-line stay-under when gains, not traditional money, put the
// natural year over the line (owner ruling R0 (c): no free-money bound).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { usPlan } from '../helpers/us-plan.js';
import { engine } from '../helpers/engine.js';
import { GAP_CASES, scanHouseholds } from '../helpers/scan-grid.mjs';

const c = makeCounter();
// Single, 60, Texas, nothing else: a gain of 10,000 is taxed at 0% (2026 deduction 16,100), so a sale nets its gross.
const PROFILE = {
  filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0,
  ageA: 60, ageB: null, singlePerson: true, seOn: false, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0,
  mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [],
};
const BAL0 = { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, traditional: 0, roth: 0, cash: 0, home: 0, mortgage: 0 };
// The ladder gain a withdrawal starts with (the engine sets wd.taxableGainGross to it) and the cap: limit 12,000 less the ladder
// gain leaves a room of 10,000.
const LADDER = 2000;
const LIMIT = 12000;
const ROOM = 10000;
// A taxable account of 200,000 on a basis of 100,000: gain ratio 0.5, so the room sells 20,000 gross (basis 10,000).
const TAX = { taxable: 200000, taxableBasis: 100000 };

// newTestWithdrawal of src/us/ui/install-test-hooks.js, through the exported newWithdrawal, as the engine builds one.
async function setup(patch = {}) {
  const w = await world();
  await w.setState({ stateTax: 'tx', inflation: 0, singlePerson: true, tenure: 'rent', ...patch });
  const store = await w.load('shared/core/store.js');
  const draws = await w.load('us/core/withdrawals/draws.js');
  const strategies = await w.load('us/core/withdrawals/strategies.js');
  const shared = await w.load('shared/core/withdrawals/draws.js');
  const { withdrawBucket } = await w.load('shared/core/withdrawals/bucket-order.js');
  const { rothAccountsNew } = await w.load('us/core/accounts/roth-ledger.js');
  const { hasPenalizedMoney } = await w.load('us/core/accounts/penalty-status.js');
  const ctx = await w.ctx();
  const mk = (balPatch, { ladder = 0, limit = null } = {}) => {
    const wd = draws.newWithdrawal(ctx, {
      bal: { ...BAL0, ...balPatch },
      rothAccts: rothAccountsNew(store.state),
      accts: { trad: [1, 0, 0, 0], roth: [1, 0, 0, 0] },
      seppActive: [false, false, false, false],
      profile: { ...PROFILE },
      conversionAmount: 0,
      rmd: 0,
    });
    wd.taxableGainGross = ladder;
    if (limit !== null) wd.magiCap = { limit, off: false };
    return wd;
  };
  return { draws, strategies, shared, withdrawBucket, hasPenalizedMoney, mk };
}

it('no cap: takeStockTaxable is takeTaxable to the bit and counts the sale gain', async () => {
  const { draws, shared, mk } = await setup();
  for (const cap of [null, 'off']) {
    const a = mk({ taxable: 100000, taxableBasis: 37000 }),
      b = mk({ taxable: 100000, taxableBasis: 37000 });
    if (cap === 'off') a.magiCap = { limit: 0, off: true };
    const na = draws.takeStockTaxable(a, 40000),
      nb = shared.takeTaxable(b, 'taxable', 40000);
    c.expect(na).toBe(nb);
    c.expect(a.bal).toStrictEqual(b.bal);
    c.expect(a.taxableGainGross).toBe(b.taxableGainGross);
    c.expect(a.taxableWithdrawn).toBe(b.taxableWithdrawn);
    c.expect(a.taxableGainGross > 0).toBe(true);
    c.expect(a.cappableGain).toBe(b.taxableGainGross);
    c.expect(Number.isFinite(a.cappableGain)).toBe(true);
  }
});

it('a binding cap: the gain realized is the room, and cappableGain counts it', async () => {
  const { draws, mk } = await setup();
  const wd = mk(TAX, { ladder: LADDER, limit: LIMIT });
  const net = draws.takeStockTaxable(wd, 60000);
  c.expect(wd.taxableGainGross).toBe(LADDER + ROOM);
  c.expect(wd.cappableGain).toBe(10000);
  c.expect(wd.bal.taxable).toBe(180000);
  c.expect(wd.bal.taxableBasis).toBe(90000);
  c.expect(net).toBe(20000);
  c.expect(Number.isFinite(wd.cappableGain)).toBe(true);
  // the room is used up: a second sale sells nothing and counts nothing
  c.expect(draws.takeStockTaxable(wd, 10000)).toBe(0);
  c.expect(wd.cappableGain).toBe(10000);
  c.expect(wd.bal.taxable).toBe(180000);
});

it('a cap on an empty taxable account sells nothing and stays finite', async () => {
  const { draws, mk } = await setup();
  const wd = mk({ cash: 5000 }, { limit: LIMIT });
  c.expect(draws.takeStockTaxable(wd, 10000)).toBe(0);
  c.expect(wd.cappableGain).toBe(0);
  c.expect(Number.isFinite(wd.cappableGain)).toBe(true);
  c.expect(wd.bal).toStrictEqual({ ...BAL0, cash: 5000 });
});

it('withdrawStandard, no cap: one counted sale; the ladder gain and the bond reserve sale are not counted', async () => {
  const { strategies, shared, mk } = await setup();
  // taxable only: cappableGain is the realized gain less the starting ladder gain
  const wd = mk(TAX, { ladder: LADDER });
  wd.need = 30000;
  strategies.withdrawStandard(wd, { age: 60, remainingMagiRoom: Infinity });
  c.expect(wd.need <= 1).toBe(true);
  c.expect(wd.taxableGainGross > LADDER).toBe(true);
  c.expect(wd.cappableGain).toBe(wd.taxableGainGross - LADDER);
  c.expect(Number.isFinite(wd.cappableGain)).toBe(true);
  // taxable runs dry and the bond reserve pays the rest: only the stock sale is counted. The counted increment is computed the
  // same way on a twin withdrawal (the default order's first sale is takeTaxable(wd, 'taxable', need)).
  const bal = { taxable: 20000, taxableBasis: 10000, bondTaxable: 100000, bondTaxableBasis: 50000 };
  const a = mk(bal, { ladder: LADDER }),
    b = mk(bal, { ladder: LADDER });
  a.need = 50000;
  strategies.withdrawStandard(a, { age: 60, remainingMagiRoom: Infinity });
  shared.takeTaxable(b, 'taxable', 50000);
  c.expect(a.need <= 1).toBe(true);
  c.expect(a.bal.taxable).toBe(0);
  c.expect(a.bal.bondTaxable < 100000).toBe(true);
  c.expect(a.cappableGain).toBe(b.taxableGainGross - LADDER);
  c.expect(a.taxableGainGross > b.taxableGainGross).toBe(true);
  c.expect(Number.isFinite(a.cappableGain)).toBe(true);
});

// Under a cap with a non-MAGI source able to cover the rest, every strategy sells taxable within the room, the release sells
// nothing and the need is met. Traditional (300,000, penalty-free) is held at 0 by the used-up room.
async function cappedCase(patch, run, extra = {}) {
  const S = await setup(patch);
  const wd = S.mk({ ...TAX, traditional: 300000, ...extra }, { ladder: LADDER, limit: LIMIT });
  wd.need = 60000;
  run(S, wd);
  c.expect(wd.taxableGainGross - LADDER <= ROOM + 1).toBe(true);
  c.expect(wd.bal.taxable).toBe(180000);
  c.expect(wd.bal.taxableBasis).toBe(90000);
  c.expect(wd.cappableGain).toBe(10000);
  c.expect(wd.traditionalGross).toBe(0);
  c.expect(wd.need <= 1).toBe(true);
  c.expect(Number.isFinite(wd.cappableGain)).toBe(true);
  return wd;
}
const STD = (S, wd) => S.strategies.withdrawStandard(wd, { age: 60, remainingMagiRoom: Infinity });
const bucketOpts = (yearReturn) => ({ yearReturn, bondTarget: 0, refillCap: Infinity, age: 60, remainingMagiRoom: Infinity });

it('capped: the default order', async () => {
  const wd = await cappedCase({}, STD, { cash: 100000 });
  c.expect(wd.bal.cash).toBe(60000);
});

it('capped: smoothing', async () => {
  const wd = await cappedCase({ smoothWithdrawals: true }, STD, { cash: 100000 });
  c.expect(wd.mixCandidate).toBe(null);
  c.expect(wd.bal.cash).toBe(60000);
});

it('capped: an explicit mix (taxable)', async () => {
  const wd = await cappedCase({ appliedMixSchedule: { 60: 'taxable' } }, STD, { cash: 100000 });
  c.expect(wd.mixCandidate).toBe('taxable');
  c.expect(wd.bal.cash).toBe(60000);
});

it('capped: the bucket strategy, up year (stocks, then cash)', async () => {
  const wd = await cappedCase({}, (S, w) => S.withdrawBucket(w, bucketOpts(10)), { cash: 100000 });
  c.expect(wd.bal.cash).toBe(60000);
});

it('capped: the bucket strategy, down year (cash empty: stocks, then Roth)', async () => {
  const wd = await cappedCase({}, (S, w) => S.withdrawBucket(w, bucketOpts(-10)), { roth: 100000 });
  c.expect(wd.rothWithdrawn).toBe(40000);
});

it('capped: the penalty-aware bucket strategy, up year', async () => {
  const wd = await cappedCase({}, (S, w) => {
    // every traditional account penalized: penalized money exists, so the penalty-aware order runs
    w.status = [0, 1, 2, 3].map(() => ({ free: false, qualified: false }));
    w.penaltyAware = S.hasPenalizedMoney(w);
    c.expect(w.penaltyAware).toBe(true);
    S.strategies.withdrawBucketPenaltyAware(w, bucketOpts(10));
  }, { cash: 100000 });
  c.expect(wd.bal.cash).toBe(60000);
  c.expect(wd.earlyPenalty).toBe(0);
});

// ---- The gains-capped eligibility (Task 2) ----
it('underEligible: traditional-driven as before; gains-driven on a household line only (R0 (c)); natGain absent is the old answer', async () => {
  const w = await world();
  const { underEligible } = await w.load('us/core/cliff-plan/solver.js');
  const nat = (p) => ({ natMagi: 90000, natConv: 0, natTrad: 0, natGain: 0, lo: 20000, hi: 300000, canFill: false, ...p });
  const H = { magi: 80000, ret: 'H' },
    A = { magi: 80000, ret: 'A' },
    B = { magi: 80000, ret: 'B' };
  // traditional-driven: any return
  c.expect(underEligible(H, nat({ natTrad: 5000 }))).toBe(true);
  c.expect(underEligible(A, nat({ natTrad: 5000 }))).toBe(true);
  c.expect(underEligible(B, nat({ natTrad: 5000 }))).toBe(true);
  // gains-driven: a household line only
  c.expect(underEligible(H, nat({ natGain: 10000 }))).toBe(true);
  c.expect(underEligible(A, nat({ natGain: 10000 }))).toBe(false);
  c.expect(underEligible(B, nat({ natGain: 10000 }))).toBe(false);
  // no free-money bound: a gain far larger than the excess still offers
  c.expect(underEligible(H, nat({ natGain: 1000000 }))).toBe(true);
  // neither traditional nor gain
  c.expect(underEligible(H, nat({}))).toBe(false);
  // the natural MAGI less its conversion not over the line (only the conversion puts the year over it)
  c.expect(underEligible(H, nat({ natGain: 10000, natConv: 15000 }))).toBe(false);
  c.expect(underEligible(H, nat({ natTrad: 5000, natConv: 15000 }))).toBe(false);
  c.expect(underEligible(H, nat({ natGain: 10000, natConv: 10000 }))).toBe(false);
  // the target below the reach, and just inside it
  c.expect(underEligible(H, nat({ natGain: 10000, lo: 80000 }))).toBe(false);
  c.expect(underEligible(H, nat({ natGain: 10000, lo: 79999 }))).toBe(true);
  // a caller with no natGain (an old test hook) gets the old answer
  const old = { natMagi: 90000, natConv: 0, lo: 20000, hi: 300000, canFill: false };
  c.expect(underEligible(H, { ...old, natTrad: 0 })).toBe(false);
  c.expect(underEligible(H, { ...old, natTrad: 1 })).toBe(true);
});

// The gap table's early ACA single (TX): 55, 600,000 taxable, 1.2M traditional, 100,000 Roth, converting 55-74 at 22%, life 100.
const TX = GAP_CASES.find((g) => g.name === 'early ACA single (TX)').patch(100, 100);
const rowAt = (age, run) => run.rows.find((r) => r.age === age);
const traceAt = (trace, year) => trace.find((t) => t.year === year);
const depOf = (d) => (d === null || d === undefined ? Infinity : d);
const STAY = { kind: 'under', line: 'aca400', ret: 'H' };

// A fresh world on `patch` with the bracket search on (it ships off in tests), as bracket-search.test.js sets it.
async function searched(patch) {
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testBracketSearchOff = false;
  await w.setState(patch);
  const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const { magiStats } = await w.load('us/core/projection/engine-state.js');
  return { w, P: await usPlan(w), makePlan, magiStats, computeCliffPlan };
}
// The plan every run at bracket B carries (null at the user's 22%).
const heldAt = (makePlan, B) => (B === 22 ? null : makePlan({ bracket: B, bracketFrom: 22 }));

it('TX: ages 62 and 63 become kept aca400 stay-unders on the kept bracket, cheaper than off and met', async () => {
  const { w, P, makePlan, magiStats, computeCliffPlan } = await searched(TX);
  const missed0 = magiStats.planMissed;
  const { plan, report } = computeCliffPlan(await w.ctx());
  const B = report.keptBracket;
  c.expect(plan.bracket).toBe(B);
  const held = heldAt(makePlan, B);
  const off = P.runPlanMode({ planMode: 'off', plan: held, endValue: true });
  const applied = P.runPlanMode({ planMode: 'apply', plan, endValue: true });
  const chosen = P.runPlanMode({ planMode: 'choose', plan: held, planTrace: true });
  for (const age of [62, 63]) {
    c.expect(plan.intents[age]).toStrictEqual(STAY);
    const row = rowAt(age, applied);
    c.expect(row.cliffChoice).toBe('stayed under ACA 400% line');
    c.expect(rowAt(age, off).healthcare - row.healthcare > 1).toBe(true);
    // the winning candidate of the choose trace at B met its target (the line less 1)
    const tr = traceAt(chosen.trace, age - 55);
    c.expect(tr.intent).toStrictEqual(STAY);
    c.expect(tr.natGain > 0).toBe(true);
    const win = tr.candidates.find((x) => x.kind === 'under' && x.label === 'ACA 400% line' && x.score === tr.chosenScore);
    c.expect(win.realized <= win.magi + 1).toBe(true);
    c.expect(win.ok).toBe(true);
  }
  // never earlier than off at B; at equal ages worth at least as much
  c.expect(depOf(applied.depletedAge) >= depOf(off.depletedAge)).toBe(true);
  c.expect(depOf(applied.sim.homeDrawAge) >= depOf(off.sim.homeDrawAge)).toBe(true);
  const sameAges = applied.depletedAge === off.depletedAge && applied.sim.homeDrawAge === off.sim.homeDrawAge;
  c.expect(!sameAges || applied.value >= off.value).toBe(true);
  c.expect(magiStats.planMissed - missed0).toBe(0);
});

it('TX year 0 at 22%: the choose trace offers a gains-driven aca400 stay-under that meets the line (also with no cash)', async () => {
  for (const patch of [TX, { ...TX, cash: 0 }]) {
    const { P, magiStats } = await searched(patch);
    const missed0 = magiStats.planMissed;
    const tr = traceAt(P.runPlanMode({ planMode: 'choose', planTrace: true }).trace, 0);
    c.expect(tr.natTrad).toBe(0);
    c.expect(tr.natGain > 0).toBe(true);
    const under = tr.candidates.filter((x) => x.kind === 'under' && x.label === 'ACA 400% line');
    c.expect(under.length).toBe(1);
    c.expect(under[0].realized <= under[0].magi + 1).toBe(true);
    c.expect(under[0].ok).toBe(true);
    c.expect(magiStats.planMissed - missed0).toBe(0);
  }
});

// apply of choose's intents at the same bracket reproduces choose row for row.
async function replayEqual(P, makePlan, held) {
  const chosen = P.runPlanMode({ planMode: 'choose', plan: held, planTrace: true });
  const applied = P.runPlanMode({ planMode: 'apply', plan: makePlan({ ...(held || {}), intents: chosen.intents, family: 'all' }) });
  c.expect(applied.rows).toStrictEqual(chosen.rows);
  c.expect(applied.depletedAge).toBe(chosen.depletedAge);
  c.expect(applied.sim.homeDrawAge).toBe(chosen.sim.homeDrawAge);
  return chosen;
}
// A run whose choose trace records a stay-under intent in a year with no cappable traditional draw.
const gainsDriven = (chosen) => chosen.trace.some((t) => t.intent && t.intent.kind === 'under' && t.natTrad === 0);

it('replay: apply of choose reproduces choose with gains-driven intents (TX at its kept bracket, two scan-grid households)', async () => {
  {
    const { w, P, makePlan, computeCliffPlan } = await searched(TX);
    const B = computeCliffPlan(await w.ctx()).report.keptBracket;
    c.expect(gainsDriven(await replayEqual(P, makePlan, heldAt(makePlan, B)))).toBe(true);
  }
  let found = 0;
  for (const h of scanHouseholds().filter((_, i) => i % 16 === 0)) {
    const w = await world();
    await w.setState(h.patch);
    const P = await usPlan(w);
    if (!gainsDriven(P.runPlanMode({ planMode: 'choose', planTrace: true }))) continue;
    const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
    await replayEqual(P, makePlan, null);
    if (++found === 2) break;
  }
  c.expect(found).toBe(2);
});

it('TX: no missed plan over its planning and its historical cycles', async () => {
  const { w, magiStats } = await searched(TX);
  const E = await engine(w);
  const missed0 = magiStats.planMissed;
  E.simulate();
  E.runHistoricalCycles();
  c.expect(magiStats.planMissed - missed0).toBe(0);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(147);
});
