// `choose` sizing each conversion year at its bracket phase (Batch 5 step 5b piece 3, spec B5.1-B5.5, B0.2, B0.3, B0.7, Task 2):
// the one-dollar invariant and the score's order, the tie rule, the bridge check, apply reproducing choose, a `none` winner with a
// kept order phase, a per-return line target, and the switch and the exempt ages; revision 2 (spec B0.11.1, B0.11.6): ties to
// the bracket on the TX single at 75, year 0 keeping the bracket with the IRMAA stand-in priced (Fable I-4). Hand literals are
// the 2026 single figures (22% band 50,400-105,700 of taxable income, standard deduction 16,100) and the 400% FPL line (15,650 x
// 4 = 62,600 at year 0, times the year's tax factor 1.025^y); engine outputs are compared between runs in one process.
// Not reached (recorded for Task 4's notes): a sized year followed by a kept fill (M17: no fill intent in a sized year, and deleting
// the fill clamp moves no row, in the three gap households at 75 and 100 and the scan grid's 384 conversions-on households).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, legacyToAccounts } from '../helpers/scan-grid.mjs';

const c = makeCounter();
const gap = (name) => GAP_CASES.find((g) => g.name === name).patch(75, 75);
// The gap table's households at a life of 75: the TX early ACA single (55), the CA couple (62) and the NY couple (58).
const TX = gap('early ACA single (TX)');
const CA = gap('couple 62, IRMAA (CA)');
const NY = gap('couple 58, trad-heavy, ACA (NY)');
// tests/yardstick.mjs's two-return couple (both 60, two single returns until they marry at A's 63; B's pension 60,000), at 75.
const TWO = {
  singlePerson: false, filingStatus: 'single', marryLater: true, marriageAgeA: 63, children: [],
  ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 75, lifeExpectancyB: 75,
  pensionCoverage: 'b', pensionYearlyA: 0, pensionStartAgeA: 60, pensionYearlyB: 60000, pensionStartAgeB: 60,
  taxable: 300000, cash: 0, spending: 100000, acaEnabled: true, acaEnhanced: false, stateTax: 'tx',
  rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 74, rothConvBracket: 22,
  cliffGuardEnabled: true, withdrawalMixEnabled: false, smoothWithdrawals: false,
  ...legacyToAccounts({ traditional: 1600000, roth: 100000 }, { singlePerson: false }),
};
// A self-employment household (tests/unit/us/se-settlement-plan.test.js's NAT: single, 60, retired, a self stream of 43,000 on A,
// Texas, premium 18,000, no inflation), converting 60-74 at 22%, at 75.
const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
const stream = (amount) => ({ amount, startAge: 55, endAge: 75, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 0, healthPremium: 0 });
const SE = {
  ...ZERO, singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 75, incomeA: 0, incomeKindA: 'wages', acaEnabled: true, healthcare: 18000, stateTax: 'tx',
  inflation: 0, incomeGrowth: 0, medicalInflation: 0, ssMonthlyA: 0, tenure: 'rent', rent: 0, cliffGuardEnabled: true,
  taxable: 100000, tradIraA: 600000, basisRatio: 30, spending: 74000, incomeSources: [stream(43000)],
  rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 74, rothConvBracket: 22,
};
// The TX single at 66 on Medicare with no entered prior MAGIs (year 0's IRMAA stand-in is its own MAGI), converting 66-74, at 80.
const MED = { ...TX, ageA: 66, retireAgeA: 66, rothConvStartAge: 66, irmaaPriorKnown: false, lifeExpectancyA: 80 };

// A fresh world (sizing on unless `sizingOn` is false) with the state set. `choose(conv)` is the automatic plan's choose run at the
// state's bracket with the levers PLAN_LEVERS and that `conv`; `apply(plan, sim)` follows what a choose run recorded.
async function setup(patch, { sizingOn = true } = {}) {
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = !sizingOn;
  await w.setState(patch);
  const state = (await w.load('shared/core/store.js')).state;
  const { makePlan, PLAN_LEVERS } = await w.load('us/core/cliff-plan/plan-shape.js');
  const P = await usPlan(w);
  const plan = makePlan({ bracket: state.rothConvBracket, bracketFrom: state.rothConvBracket, levers: PLAN_LEVERS, conv: {} });
  const choose = (conv, trace = false) => P.runPlanMode({ planMode: 'choose', plan: { ...plan, conv }, planTrace: trace });
  const apply = (r) => P.runPlanMode({ planMode: 'apply', plan: { ...plan, conv: r.sim.cliffConvIntents, intents: r.intents, orders: r.orderIntents, splits: r.splitIntents } });
  return { w, P, plan, choose, apply };
}

it('the one-dollar test: a converted dollar inside the 22% band costs 22 cents; the score in its evaluation order', async () => {
  const w = await world();
  await w.setState({ ...TX, stateTax: 'tx' });
  const ctx = await w.ctx();
  const { taxFor } = await w.load('us/core/tax/federal-tax.js');
  const { NO_DEPENDENTS } = await w.load('shared/core/inputs/lists.js');
  const { convScore } = await w.load('shared/core/withdrawals/conversion-targets.js');
  // solver.js's LAMBDA_PROFILE, at 60 (no senior deduction), year 0 (factor 1)
  const profile = { filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: null, singlePerson: true, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0, k401DrawFracA: 0, k401DrawFracB: 0, conv: 0, convK401FracA: 0, convK401FracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: NO_DEPENDENTS, seOn: false };
  // the year's return at the conversion c (the profile's conv set as the choice sets it): 90,000 less 16,100 is 73,900 of taxable
  // income, inside the 22% band
  const tax = (x) => {
    profile.conv = x;
    return taxFor(ctx, profile, 0, x);
  };
  const t0 = tax(90000),
    t1 = tax(90001);
  c.expect(Math.round((t1 - t0) * 100)).toBe(22);
  // ((c x lambda - dTax) - dPremium) - dIrmaa: 1000 x 0.25 = 250; 250 - 220.25 = 29.75; 29.75 - 10 = 19.75; 19.75 - 4.75 = 15
  c.expect(convScore(1000, 0.25, 220.25, 10, 4.75)).toBe(15);
  // one dollar more at a 12.5% marginal: 1001 x 0.25 = 250.25; 250.25 - 220.375 = 29.875; - 10 = 19.875; - 4.75 = 15.125
  c.expect(convScore(1001, 0.25, 220.375, 10, 4.75)).toBe(15.125);
  // none: 0 x lambda less nothing
  c.expect(convScore(0, 0.25, 0, 0, 0)).toBe(0);
});

it('the tie rule: an equal score keeps the smaller amount, a win by exactly $1 does not replace it; dropped candidates are skipped', async () => {
  const w = await world();
  const { pickConvTarget } = await w.load('shared/core/withdrawals/conversion-targets.js');
  const k = (target, amt, score, dropped = false) => ({ target, c: amt, score, dropped });
  // the bracket target first at 0, then none at 0, both 0: the bracket target stays (the lists below have no bracket entry, which
  // only a unit test builds: the best starts at the first candidate not dropped; with one, see conversion-targets.test.js)
  c.expect(pickConvTarget([k(null, 0, 0), k('none', 0, 0)])).toBe(0);
  // equal scores: the smaller amount
  c.expect(pickConvTarget([k('none', 0, 0), k('b10', 1000, 50), k('b12', 5000, 50)])).toBe(1);
  // a larger amount winning by exactly $1 does not replace it; by more than $1 it does
  c.expect(pickConvTarget([k('none', 0, 0), k('b10', 1000, 50), k('b12', 5000, 51)])).toBe(1);
  c.expect(pickConvTarget([k('none', 0, 0), k('b10', 1000, 50), k('b12', 5000, 51.5)])).toBe(2);
  // a dropped candidate never wins, whatever its score
  c.expect(pickConvTarget([k('none', 0, 0), k('b10', 1000, 50, true), k('b12', 5000, 20)])).toBe(2);
  c.expect(pickConvTarget([k('b10', 1000, 50, true)])).toBe(-1);
});

// Ties go to the bracket (spec B0.11.1): a year whose candidates up to the bracket conversion all score $0 (to the cent; the TX
// single at 75, where lambda is the 22% bracket's 0.22 at 66-74) keeps the bracket: no intent, no sized phase, no convChoice, and
// the year converts the bracket phase's amount. The earlier years 55 and 65 size (b10, under IRMAA tier 4), so a tie year's row
// cannot equal the conv: null run's (its start differs, and no window of this household ties in every converting year: Task R1's
// report). The unsized year it is compared with is therefore apply's: apply follows the recorded targets and runs a year with no
// target as the unsized bracket year, from the same start.
const tieAges = (r, ageA) => {
  const out = [];
  for (const t of r.trace) {
    if (!t.conv) continue;
    const upTo = t.conv.candidates.filter((k) => k.c <= t.conv.bracketConv);
    if (upTo.length > 1 && upTo.every((k) => Math.round(k.score * 100) === 0)) out.push(ageA + t.year);
  }
  return out;
};

it('ties go to the bracket: the TX single at 75 records no intent in its $0-tie years, which are the unsized bracket years', async () => {
  const { choose, apply } = await setup(TX);
  const r = choose({}, true),
    a = apply(r),
    ties = tieAges(r, TX.ageA);
  c.expect(ties).toStrictEqual([66, 67, 68, 69, 70, 71, 72, 73, 74]);
  c.expect(Object.keys(r.sim.cliffConvIntents)).toStrictEqual(['55', '65']);
  for (const age of ties) {
    const tr = r.trace.find((t) => TX.ageA + t.year === age).conv,
      row = r.rows.find((x) => x.age === age);
    c.expect(tr.winner).toBe(null);
    c.expect(age in r.sim.cliffConvIntents).toBe(false);
    c.expect('convChoice' in row).toBe(false);
    c.expect(row.conversionAmount).toBe(tr.bracketConv);
    c.expect(row).toStrictEqual(a.rows.find((x) => x.age === age));
  }
});

// Fable I-4: the TX single at 66 on Medicare with no entered prior MAGIs (year 0's IRMAA stand-in priced at each candidate's own
// MAGI, then restored), bracket 10, taxable 100,000, spending 40,000: year 0 keeps the bracket, and its row is the unsized row.
it('the bracket wins year 0 with the stand-in priced: rows[0] of choose(conv: {}) is rows[0] of choose(conv: null)', async () => {
  const H = { ...TX, ageA: 66, retireAgeA: 66, rothConvStartAge: 66, irmaaPriorKnown: false, rothConvBracket: 10, taxable: 100000, spending: 40000 };
  const { choose } = await setup(H);
  const r = choose({}, true),
    ref = choose(null);
  const t0 = r.trace.find((t) => t.year === 0).conv;
  c.expect(t0.winner).toBe(null);
  c.expect(t0.candidates.length > 1).toBe(true);
  c.expect(66 in r.sim.cliffConvIntents).toBe(false);
  c.expect(r.rows[0]).toStrictEqual(ref.rows[0]);
});

it('a near tie is not offered: a target within $1 of the bracket conversion (convOffered, and in the engine)', async () => {
  const w = await world();
  const { convOffered } = await w.load('shared/core/withdrawals/conversion-targets.js');
  // $0.50 below the bracket amount, and exactly $1 above or below: not offered; $1.50 away: offered
  c.expect(convOffered(16058.25 - 0.5, 16058.25)).toBe(false);
  c.expect(convOffered(16057.25, 16058.25)).toBe(false);
  c.expect(convOffered(16059.25, 16058.25)).toBe(false);
  c.expect(convOffered(16056.75, 16058.25)).toBe(true);
  // the engine: the TX single at 52 (12%, taxable 150,000) has its year-0 bracket conversion capped just under the ACA 400% line,
  // where the line's "just under" target sat a fraction of a dollar below it: the bracket stands, no intent, no sized phase
  const H = { ...TX, ageA: 52, retireAgeA: 52, rothConvStartAge: 52, rothConvBracket: 12, taxable: 150000, spending: 60000, ...legacyToAccounts({ traditional: 1200000, roth: 100000 }, { singlePerson: true }) };
  const { choose } = await setup(H);
  const r = choose({}, true);
  const tr = r.trace.find((t) => t.year === 0).conv;
  c.expect(tr.candidates.every((x) => x.target === null || Math.abs(x.c - tr.bracketConv) > 1)).toBe(true);
  c.expect(tr.winner).toBe(null);
  c.expect(52 in r.sim.cliffConvIntents).toBe(false);
});

it('the bridge pieces: bridgeShort, bridgeNeed (with wages to retirement) and penaltyFreeMoney by hand', async () => {
  const w = await world();
  const { bridgeShort } = await w.load('shared/core/withdrawals/conversion-targets.js');
  // the early years only: left = accessible - extra x freeTradShare - taxIncrease against early. 100 - 20 x 0.5 - 30 = 60 >= 60: passes;
  // one dollar less accessible (59 < 60) trips
  c.expect(bridgeShort({ accessible: 100, extra: 20, freeTradShare: 0.5, taxIncrease: 30, early: 60 })).toBe(false);
  c.expect(bridgeShort({ accessible: 99, extra: 20, freeTradShare: 0.5, taxIncrease: 30, early: 60 })).toBe(true);
  // monotone: on the same figures, a larger extra and tax increase never passes where a smaller one trips (left only falls)
  let monotone = true;
  for (const [x, ti] of [[20, 30], [40, 45], [80, 70], [160, 120]]) {
    const smaller = bridgeShort({ accessible: 99, extra: 20, freeTradShare: 0.5, taxIncrease: 30, early: 60 }),
      larger = bridgeShort({ accessible: 99, extra: x, freeTradShare: 0.5, taxIncrease: ti, early: 60 });
    if (smaller && !larger) monotone = false;
  }
  c.expect(monotone).toBe(true);
  // Partner A at 52 earning 30,000 until 54, Social Security of 2,000 a month from 67, no pension; this year's reserve spending 50,000
  await w.setState({ ...TX, ageA: 52, retireAgeA: 54, incomeA: 30000, incomeKindA: 'wages', ssStartAgeA: 67, ssMonthlyA: 2000, pensionYearlyA: 0 });
  const ctx = await w.ctx();
  const { bridgeNeed, benefitIncomeAt } = await w.load('us/core/cliff-plan/solver.js');
  const wagesTo = { retireAgeA: 54, retireAgeB: 54 };
  // years 1..7 (ages 53..59): 53 earns 30,000 (need 20,000), 54..59 need 50,000; early = 20,000 + 3 x 50,000, late = 3 x 50,000
  c.expect(bridgeNeed(ctx, { year: 0, age: 52, ageB: null, singlePerson: true, factor: 1, reserveSpend: 50000, wagesTo })).toStrictEqual({ early: 170000, late: 150000 });
  // no living partner under 59.5 next year: nothing
  c.expect(bridgeNeed(ctx, { year: 7, age: 59, ageB: null, singlePerson: true, factor: 1, reserveSpend: 50000, wagesTo })).toStrictEqual({ early: 0, late: 0 });
  // at 67 (year 15) Social Security, 2,000 x 12 x factor 2 = 48,000; with wagesTo null no wages at 53
  c.expect(benefitIncomeAt(ctx, 15, true, 2, null)).toBe(48000);
  c.expect(benefitIncomeAt(ctx, 1, true, 1, null)).toBe(0);
  c.expect(benefitIncomeAt(ctx, 1, true, 1, wagesTo)).toBe(30000);
  // penaltyFreeMoney: taxable 100, taxable bonds 20, cash 5; the Roth pool 50 all in A's early Roth IRA (its basis 30 is free); the
  // traditional pool 1,000 half in A's IRA (penalized) and half in A's 401(k) (free, Rule of 55): 100 + 20 + 5 + 30 + 500
  const { penaltyFreeMoney } = await w.load('us/core/accounts/penalty-status.js');
  const st = (free) => ({ free, qualified: false });
  const allFree = [st(true), st(true), st(true), st(true)];
  const wd = {
    bal: { taxable: 100, bondTaxable: 20, cash: 5, roth: 50, bondRoth: 0, traditional: 1000, bondTraditional: 0 },
    accts: { trad: [0.5, 0.5, 0, 0], roth: [1, 0, 0, 0] },
    rothAccts: [{ basis: 30 }, { basis: 0 }, { basis: 0 }, { basis: 0 }],
    seppActive: [false, false, false, false],
    onlyPartner: -1,
    status: allFree,
  };
  c.expect(penaltyFreeMoney(wd, [st(false), st(true), st(false), st(false)])).toBe(655);
  // the statuses passed, never wd.status (all free: 100 + 20 + 5 + 50 + 1,000); wd is not written
  c.expect(penaltyFreeMoney(wd, allFree)).toBe(1175);
  c.expect(wd.status === allFree && wd.onlyPartner === -1).toBe(true);
});

it('the bridge (B9.6): at 52 with a 12% bracket, b32 is dropped and b22 (above the bracket conversion) is not; the drop is the need', async () => {
  // The brief's household (52, traditional 1.2M, spending 60,000, the user's bracket 12%) with taxable 400,000. Year 0's trace:
  // accessible 437,325 (taxable and the Roth basis), early 370,701 (four years of about 92,700 of reserve spending, healthcare and
  // housing included); b22 adds about 36,900 of tax, premium and IRMAA over the bracket's (left about 400,400 >= early: kept), b32
  // about 80,800 (left about 356,500 < early: dropped). (At taxable 150,000 every candidate above the bracket is dropped: left is
  // under early before any extra tax.)
  const H = { ...TX, ageA: 52, retireAgeA: 52, rothConvStartAge: 52, rothConvBracket: 12, taxable: 400000, spending: 60000, ...legacyToAccounts({ traditional: 1200000, roth: 100000 }, { singlePerson: true }) };
  const { w, choose } = await setup(H);
  const { bridgeShort } = await w.load('shared/core/withdrawals/conversion-targets.js');
  const tr = choose({}, true).trace.find((t) => t.year === 0).conv;
  const of = (target) => tr.candidates.find((k) => k.target === target);
  const bracket = of(null),
    b22 = of('b22'),
    b32 = of('b32');
  c.expect(b22.c > tr.bracketConv).toBe(true);
  c.expect(b22.dropped).toBe(false);
  c.expect(b32.dropped).toBe(true);
  c.expect(bracket.dropped).toBe(false);
  c.expect(of('none').dropped).toBe(false);
  // the years 57..59 are after the conversion seasons: traced, not tested
  c.expect(tr.bridge.late > 0).toBe(true);
  // the drop is monotone in the amount: every candidate above b32 is dropped, every one from the bracket to b22 kept
  c.expect(tr.candidates.every((k) => (k.c >= b32.c ? k.dropped : k.c > b22.c || !k.dropped))).toBe(true);
  const args = (k, early) => ({ accessible: tr.bridge.accessible, extra: k.c - tr.bracketConv, freeTradShare: tr.bridge.freeTradShare, taxIncrease: k.total - bracket.total, early });
  // the check removed (no need): not short; with the traced need: short (the engine's verdict)
  c.expect(bridgeShort(args(b32, 0))).toBe(false);
  c.expect(bridgeShort(args(b32, tr.bridge.early))).toBe(true);
  c.expect(bridgeShort(args(b22, tr.bridge.early))).toBe(false);
});

it('apply reproduces choose: the gap households, the two-return couple, a self-employment and a year-0 Medicare household', async () => {
  let sizedTotal = 0;
  for (const patch of [TX, NY, CA, TWO, SE, MED]) {
    const { choose, apply } = await setup(patch);
    const r = choose({});
    const ci = r.sim.cliffConvIntents;
    const n = Object.keys(ci).length;
    sizedTotal += n;
    c.expect(n > 0).toBe(true);
    const a = apply(r);
    c.expect(a.rows).toStrictEqual(r.rows);
    c.expect([a.sim.depletedAge, a.sim.homeDrawAge]).toStrictEqual([r.sim.depletedAge, r.sim.homeDrawAge]);
    // every sized year's row says what it sized to; no other row does
    c.expect(r.rows.every((row) => ('convChoice' in row) === (row.age in ci))).toBe(true);
  }
  c.expect(sizedTotal > 0).toBe(true);
  // the year-0 Medicare household sizes year 0 (choose ran the bracket phase, apply runs only the sized one)
  const { choose } = await setup(MED);
  c.expect(choose({}).sim.cliffConvIntents[66]).toBe('none');
});

it("a 'none' winner with a kept order phase: the CA couple at 62; apply reproduces the year", async () => {
  const { choose, apply } = await setup(CA);
  const r = choose({});
  c.expect(r.sim.cliffConvIntents[62]).toBe('none');
  c.expect(r.orderIntents[62]).toBe('traditional');
  const row = r.rows.find((x) => x.age === 62);
  c.expect(row.conversionAmount).toBe(0);
  c.expect(row.drawOrder).toBe('traditional');
  c.expect(row.convChoice).toBe('no conversion (tax-aware)');
  c.expect(apply(r).rows.find((x) => x.age === 62)).toStrictEqual(row);
});

it("a per-return line target in a two-return year: A's 400% line at 61, met on A's return", async () => {
  const { w, choose } = await setup(TWO);
  const { planMet } = await w.load('us/core/cliff-plan/solver.js');
  const r = choose({});
  c.expect(r.sim.cliffConvIntents[61]).toStrictEqual({ id: 'aca400', ret: 'A', side: 'under' });
  const row = r.rows.find((x) => x.age === 61);
  c.expect(row.convChoice).toBe("just under the ACA 400% line (Partner A's return)");
  c.expect(row.conversionAmount > 0).toBe(true);
  // A's own line at year 1: a household of one, 62,600 x 1.025 = 64,165; the plan's own is the line less 1
  c.expect(planMet({ kind: 'under', magi: row.magiProxy, own: 64165 - 1, ret: 'A' }, row.magiProxy, row.magiA, row.magiB)).toBe(true);
  c.expect(row.magiA < 64165).toBe(true);
});

it('the switch off and the exempt ages: choose with conv: {} records nothing and is the conv: null run', async () => {
  {
    const { choose } = await setup(TX, { sizingOn: false });
    const r = choose({}),
      ref = choose(null);
    c.expect(r.sim.cliffConvIntents).toBe(undefined);
    c.expect(r.rows).toStrictEqual(ref.rows);
    c.expect(r.rows.some((row) => 'convChoice' in row)).toBe(false);
  }
  {
    // every window age (55-74) held by the applied schedule: exempt, so nothing is sized
    const sched = {};
    for (let a = 55; a <= 74; a++) sched[a] = 22;
    const { choose } = await setup({ ...TX, appliedRothSchedule: sched });
    const r = choose({}),
      ref = choose(null);
    c.expect(r.sim.cliffConvIntents).toStrictEqual({});
    c.expect(r.rows).toStrictEqual(ref.rows);
  }
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // revision 2 (Task R1): the depletion and first home draw in apply == choose (6), the ties to the bracket (47), I-4 (4)
  expect(c.total).toBe(131);
});
