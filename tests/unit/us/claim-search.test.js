// SS claiming optimizer PR 3: the claiming-age search (src/us/core/optimizer/claim-search.js, and the axes, variant and stream
// key in src/us/core/income/social-security.js). The tax year is 2026 and every figure is invented. The hand-computed cases use
// ZERO_TAX: one cash balance at 0%, no home, no wages, no Medicare charge, inflation 0, Texas, and yearly Social Security of at
// most 37,200, so provisional income stays under $25,000 and no tax is due; each first checks that every distinct run pays the
// same tax and healthcare, so the after-tax end value orders as the sum of the yearly benefit. The sums in the comments count
// one row a year from the current age to the life expectancy, both included; the own factor is in units of 1/3600 (62: 2520,
// 63: 2700, 66: 3360, 67: 3600, 68: 3888, 69: 4176, 70: 4464 for a full retirement age of 67), the survivor factor in units of
// 1/84000 (60: 60060, 61: 63480, 62: 66900, 63: 70320, 64: 73740, 65: 77160, 66: 80580, 67: 84000).
import { it, afterAll, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 570;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// One cash balance, everything else zeroed (the defaults own a home with a mortgage, charge Medicare from 65 and carry wages
// and three retirement balances); the reserve holds all the cash, so nothing is swept into taxable.
const ZERO_TAX = {
  singlePerson: true, ageA: 62, retireAgeA: 62, lifeExpectancyA: 90, incomeA: 0, tenure: 'rent', rent: 0, homeValue: 0,
  mortgage: 0, mortgagePrincipal: 0, maintenance: 0, cash: 400000, cashReserve: 1000000, taxable: 0, tradIraA: 0, trad401kA: 0,
  rothIraA: 0, roth401kA: 0, returnRate: 0, hysaRate: 0, bondReturn: 0, bondYears: 0, dividendYield: 0, inflation: 0,
  spending: 10000, healthcare: 0, medicareYearly: 0, acaEnabled: false, cliffGuardEnabled: false, rothConvEnabled: false,
  stateTax: 'tx', ssMonthlyA: 2000, ssStartAgeA: 62, ssBenefitBasisA: 'pia',
};
// A widowed person of 60 (born 1966: full retirement age and survivor full retirement age both 67).
const WIDOWED = { ...ZERO_TAX, ageA: 60, retireAgeA: 60, ssMonthlyA: 2500, ssStartAgeA: 70, ssWidowed: true, ssSurvivorMonthlyFra: 2000, ssSurvivorStartAge: null };
// PR 2's couple (both 62, born 1964, 2,000 a month each at full retirement age), the cliff plan off.
const COUPLE = {
  singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62,
  lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 0, incomeB: 0, spending: 60000, taxable: 400000,
  tradIraA: 0, tradIraB: 0, trad401kA: 300000, trad401kB: 300000, rothIraA: 50000, rothIraB: 50000, roth401kA: 0, roth401kB: 0,
  cash: 30000, inflation: 0, dividendYield: 0, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 75, survivorSpendingPct: 70,
  ltcEnabled: false, healthcare: 0, ssMonthlyA: 2000, ssMonthlyB: 2000, ssStartAgeA: 62, ssStartAgeB: 62, ssLateStartEnabled: false,
  ssBenefitBasisA: 'pia', ssBenefitBasisB: 'pia', stateTax: 'tx', acaEnabled: false, cliffGuardEnabled: false,
};
const SPELL = { kind: 'inflation', order: 'standard', spell: { age: 67, years: 2, inflation: 25, bondReturn: 0, stockReturn: null } };

// A world with `patch` as the state (and the kept plan refreshed when the cliff plan is on), its factories and helpers.
async function setup(patch) {
  const w = await world();
  await w.setState(patch);
  const store = await w.load('shared/core/store.js');
  if (store.state.cliffGuardEnabled) (await w.load('us/core/cliff-plan/planning.js')).refreshCliffPlan();
  const state = store.state;
  const contextFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const { ownPlanContextFor } = await w.load('us/core/projection/store-context.js');
  const planContextFor = (p, r) => ownPlanContextFor(p)(r);
  const cs = await w.load('us/core/optimizer/claim-search.js');
  const ss = await w.load('us/core/income/social-security.js');
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { pricingContextFor } = await w.load('shared/core/projection/run-source.js');
  const { US_OBJECTIVES } = await w.load('us/core/optimizer/objectives.js');
  const { rowCost } = await w.load('us/core/projection/row-cost.js');
  const ctx = contextFor(state);
  const axes = ss.ssClaimAxes(ctx);
  const measured = (runCtx) => {
    const sim = simulateWith(runCtx);
    return { sim, value: US_OBJECTIVES.endValue.value(pricingContextFor(runCtx), sim), depletedAge: sim.depletedAge || null };
  };
  // A choice run directly, as the search runs it: the variant (or the state), guardrails off, any extra keys.
  const variant = (cell, extra = {}) => ({ ...(cell ? ss.ssClaimVariant(state, axes, cell) : state), guardrailsEnabled: false, ...extra });
  const direct = (cell, extra) => measured(contextFor(variant(cell, extra)));
  const run = () => {
    const yields = [];
    const gen = cs.claimSearchSteps(ctx, contextFor, planContextFor);
    for (;;) {
      const r = gen.next();
      if (r.done) return { res: r.value, yields };
      yields.push(r.value);
    }
  };
  return { w, store, state, ctx, contextFor, planContextFor, ownPlanContextFor, cs, ss, axes, measured, variant, direct, run, rowCost };
}
const cellOf = (res, survivor, a, b = null) => res.cells.findIndex((x) => x.survivor === survivor && x.a === a && x.b === b);
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

// ---- Task 1: axes, status, variant, stream key, ranking ----

it('the own axis of a single person', async () => {
  const axesOf = async (patch) => {
    const s = await setup({ ...ZERO_TAX, ...patch });
    return s.ss.ssClaimAxes(s.ctx).a;
  };
  c.expect(await axesOf({ ageA: 60, retireAgeA: 60 })).toStrictEqual({ ages: range(62, 70), fixed: null, current: 62 });
  c.expect(await axesOf({ ageA: 66, retireAgeA: 66 })).toStrictEqual({ ages: range(66, 70), fixed: null, current: 66 });
  c.expect(await axesOf({ ageA: 66, retireAgeA: 66, ssStartAgeA: 64, ssCollectingA: true })).toStrictEqual({ ages: [], fixed: 'collecting', current: 64 });
  c.expect(await axesOf({ ageA: 66, retireAgeA: 66, ssStartAgeA: 68, ssCollectingA: true })).toStrictEqual({ ages: range(66, 70), fixed: null, current: 68 });
  c.expect((await axesOf({ ageA: 72, retireAgeA: 72 })).fixed).toBe('past');
  c.expect((await axesOf({ ageA: 72, retireAgeA: 72, ssBenefitBasisA: 'atClaim' })).fixed).toBe('past');
  c.expect((await axesOf({ ssBenefitBasisA: 'atClaim' })).fixed).toBe('atClaim');
  c.expect((await axesOf({ ssMonthlyA: 0 })).fixed).toBe('none');
  c.expect(await axesOf({ ageA: 64, retireAgeA: 64, ssLateStartEnabled: true, ssStartAgeA: 72 })).toStrictEqual({ ages: range(64, 70), fixed: null, current: 72 });
});

it('the axes of a widowed person and a couple', async () => {
  let s = await setup({ ...WIDOWED, ageA: 59, retireAgeA: 59 });
  c.expect(s.axes.kind).toBe('widowed');
  c.expect(s.axes.survivor).toStrictEqual({ ages: range(60, 67), fixed: null, current: 67 });
  c.expect(s.axes.a).toStrictEqual({ ages: range(62, 70), fixed: null, current: 70 });
  c.expect(s.axes.b).toBe(null);
  // Born 1958: survivor full retirement age 66 and 4 months, rounded up to 67, already past at 68.
  s = await setup({ ...WIDOWED, ageA: 68, retireAgeA: 68 });
  c.expect(s.axes.survivor.fixed).toBe('past');
  c.expect(s.axes.a.ages).toStrictEqual(range(68, 70));
  s = await setup({ ...WIDOWED, ageA: 63, retireAgeA: 63, ssSurvivorStartAge: 60, ssSurvivorCollecting: true });
  c.expect(s.axes.survivor).toStrictEqual({ ages: [], fixed: 'collecting', current: 60 });
  s = await setup({ ...WIDOWED, ssSurvivorMonthlyFra: 0 });
  c.expect(s.axes.kind).toBe('single');
  c.expect(s.axes.survivor).toBe(null);
  s = await setup(COUPLE);
  c.expect(s.axes.kind).toBe('couple');
  c.expect(s.axes.a.ages).toStrictEqual(range(62, 70));
  c.expect(s.axes.b.ages).toStrictEqual(range(62, 70));
  s = await setup({ ...COUPLE, ssBenefitBasisB: 'atClaim' });
  c.expect(s.axes.b.fixed).toBe('atClaim');
  c.expect(s.axes.a.fixed).toBe(null);
});

it('the status (spec 7.4)', async () => {
  const statusOf = async (patch) => {
    const s = await setup(patch);
    return s.cs.claimStatus(s.axes);
  };
  c.expect(await statusOf({ ...ZERO_TAX, ssMonthlyA: 0 })).toBe('none');
  c.expect(await statusOf({ ...ZERO_TAX, ssCollectingA: true })).toBe('collecting');
  c.expect(await statusOf({ ...ZERO_TAX, ssBenefitBasisA: 'atClaim' })).toBe('atClaim');
  c.expect(await statusOf({ ...ZERO_TAX, ageA: 72, retireAgeA: 72 })).toBe('nothing');
  c.expect(await statusOf({ ...ZERO_TAX, ageA: 72, retireAgeA: 72, ssBenefitBasisA: 'atClaim' })).toBe('nothing');
  c.expect(await statusOf({ ...ZERO_TAX, ageA: 70, retireAgeA: 70, ssStartAgeA: 70 })).toBe('nothing');
  c.expect(await statusOf({ ...ZERO_TAX, ageA: 70, retireAgeA: 70, ssLateStartEnabled: true, ssStartAgeA: 72 })).toBe('ok');
  c.expect(await statusOf({ ...ZERO_TAX })).toBe('ok');
  c.expect(await statusOf({ ...WIDOWED, ssBenefitBasisA: 'atClaim' })).toBe('ok');
  c.expect(await statusOf({ ...WIDOWED, ageA: 63, retireAgeA: 63, ssBenefitBasisA: 'atClaim', ssSurvivorStartAge: 60, ssSurvivorCollecting: true })).toBe('atClaim');
  c.expect(await statusOf({ ...WIDOWED, ageA: 63, retireAgeA: 63, ssStartAgeA: 62, ssCollectingA: true, ssSurvivorStartAge: 60, ssSurvivorCollecting: true })).toBe('collecting');
  c.expect(await statusOf({ ...COUPLE, ssCollectingA: true, ssMonthlyB: 0 })).toBe('collecting');
  c.expect(await statusOf({ ...COUPLE, ssCollectingA: true, ssBenefitBasisB: 'atClaim' })).toBe('atClaim');
  // A one-cell grid that is the current choice, beside an own benefit in atClaim: 'atClaim' (entering it would give a choice).
  c.expect(await statusOf({ ...COUPLE, ageA: 70, retireAgeA: 70, ssStartAgeA: 70, ssBenefitBasisB: 'atClaim' })).toBe('atClaim');
});

it('the variant writes only the varied keys', async () => {
  let s = await setup(WIDOWED);
  const before = structuredClone(s.state);
  c.expect(s.ss.ssClaimVariant(s.state, s.axes, { survivor: 60, a: 70, b: null })).toStrictEqual({ ...s.state, ssSurvivorStartAge: 60, ssStartAgeA: 70 });
  c.expect(s.state).toStrictEqual(before);
  s = await setup({ ...WIDOWED, ssBenefitBasisA: 'atClaim' });
  c.expect(s.ss.ssClaimVariant(s.state, s.axes, { survivor: 60, a: 64, b: null })).toStrictEqual({ ...s.state, ssSurvivorStartAge: 60 });
});

it('the stream key', async () => {
  // Own 2,500 at 62 is 21,000; the survivor benefit at 62 (19,114.28...) and 63 (20,091.42...) is never higher, at 64
  // (21,068.57...) it is.
  const s = await setup({ ...WIDOWED, ssStartAgeA: 62 });
  const key = (survivor) => s.ss.ssStreamKey(s.contextFor(s.ss.ssClaimVariant(s.state, s.axes, { survivor, a: 62, b: null })));
  c.expect(key(62) === key(63)).toBe(true);
  c.expect(key(62) === key(64)).toBe(false);
  // A start of 60 at 64, not collecting, claims now: the stream of a start at 64.
  const t = await setup({ ...ZERO_TAX, ageA: 64, retireAgeA: 64, ssStartAgeA: 60 });
  c.expect(t.ss.ssStreamKey(t.ctx) === t.ss.ssStreamKey(t.contextFor({ ...t.state, ssStartAgeA: 64 }))).toBe(true);
});

it('the ranking', async () => {
  const { cs } = await setup(ZERO_TAX);
  const m = (depletedAge, value) => ({ depletedAge, value, today: value });
  c.expect(cs.claimBetter(m(null, 0), m(90, 1e9))).toBe(true);
  c.expect(cs.claimBetter(m(90, 1e9), m(null, 0))).toBe(false);
  c.expect(cs.claimBetter(m(null, 100.5), m(null, 100))).toBe(false);
  c.expect(cs.claimBetter(m(null, 101.5), m(null, 100))).toBe(true);
  c.expect(cs.claimBetter(m(85, 0), m(84, 1e9))).toBe(true);
  c.expect(cs.claimBetter(m(84, 1e9), m(85, 0))).toBe(false);
  c.expect(cs.claimBetter(m(85, 1e9), m(85, 0))).toBe(false);
  c.expect(cs.claimPick([m(null, 100), m(null, 100.6), m(null, 100.9)])).toBe(0);
  c.expect(cs.claimPick([m(90, 5), m(null, 100), m(null, 105)])).toBe(2);
  c.expect(cs.CLAIM_END_AGES).toStrictEqual([80, 85, 90, 95]);
  c.expect(Object.isFrozen(cs.CLAIM_END_AGES)).toBe(true);
});

// ---- Task 2: the grid, the dedupe, the hand-computed winners ----

// Every distinct run pays the same tax and healthcare (so the end value orders as the benefit sum), and none runs out.
function checkZeroCost(s, res, { runsOut = false } = {}) {
  const costs = new Set();
  res.cells.forEach((cell, i) => {
    if (cell.sameAs !== null) return;
    const { sim } = s.direct(cell);
    costs.add(sim.rows.reduce((t, r) => t + s.rowCost(r), 0));
    if (!runsOut) c.expect(sim.depletedAge || null).toBe(null);
  });
  c.expect(costs.size).toBe(1);
}
// Every "same as" pair is one run: the two variants' rows are equal.
function checkSameAs(s, res) {
  res.cells.forEach((cell) => {
    if (cell.sameAs === null) return;
    c.expect(s.direct(cell).sim.rows).toStrictEqual(s.direct(res.cells[cell.sameAs]).sim.rows);
  });
}
// The search's measure of cell i is the direct run's.
function checkDirect(s, res, i) {
  const d = s.direct(res.cells[i]);
  c.expect(res.cells[i].measure.value).toBe(d.value);
  c.expect(res.cells[i].measure.depletedAge).toBe(d.depletedAge);
}

it('survivor first, own at 70 wins', async () => {
  // Survivor 60, own 70: 10 x 17,160 + 21 x 37,200 = 952,800. Next: survivor 61, own 70: 9 x 18,137.14 + 781,200 = 944,434.29;
  // own 62 then survivor 67: 5 x 21,000 + 24 x 24,000 = 681,000.
  const s = await setup(WIDOWED);
  const { res } = s.run();
  c.expect(res.status).toBe('ok');
  c.expect(res.cells.length).toBe(72);
  checkZeroCost(s, res);
  c.expect(res.gridBest).toBe(cellOf(res, 60, 70));
  c.expect(res.current.cell).toBe(cellOf(res, 67, 70));
  // Survivor 62 and 63 under own 62 never pay more than the own 21,000: one run.
  c.expect(res.cells[cellOf(res, 63, 62)].sameAs).toBe(cellOf(res, 62, 62));
  c.expect(res.cells.filter((x) => x.sameAs === null).length < 72).toBe(true);
  checkSameAs(s, res);
  for (const i of [cellOf(res, 60, 70), cellOf(res, 61, 70), cellOf(res, 67, 62)]) checkDirect(s, res, i);
});

it('own first, survivor later wins', async () => {
  // Own 62, survivor 67: 5 x 16,800 + 24 x 36,000 = 948,000. Next: survivor 67, own 63: 4 x 18,000 + 864,000 = 936,000;
  // survivor 66, own 62: 4 x 16,800 + 25 x 34,534.28 = 930,557; survivor 60, own 70: 10 x 25,740 + 21 x 29,760 = 882,360.
  const s = await setup({ ...WIDOWED, ssMonthlyA: 2000, ssSurvivorMonthlyFra: 3000 });
  const { res } = s.run();
  checkZeroCost(s, res);
  c.expect(res.gridBest).toBe(cellOf(res, 67, 62));
  checkSameAs(s, res);
  for (const i of [cellOf(res, 67, 62), cellOf(res, 67, 63), cellOf(res, 60, 70)]) checkDirect(s, res, i);
});

it('a single person: the winner by end age, and ties to the current choice', async () => {
  // At 80: 68 gives 13 x 25,920 = 336,960; 67 14 x 24,000 and 66 15 x 22,400 both 336,000; 70 11 x 29,760 = 327,360.
  let s = await setup({ ...ZERO_TAX, lifeExpectancyA: 80, ssStartAgeA: 67 });
  let { res } = s.run();
  checkZeroCost(s, res);
  c.expect(res.gridBest).toBe(cellOf(res, null, 68));
  c.expect(res.current.cell).toBe(cellOf(res, null, 67));
  const m66 = res.cells[cellOf(res, null, 66)].measure,
    m67 = res.cells[cellOf(res, null, 67)].measure;
  c.expect(s.cs.claimPick([m67, m66])).toBe(0);
  c.expect(s.cs.claimPick([m66, m67])).toBe(0);
  for (const a of [62, 68, 70]) checkDirect(s, res, cellOf(res, null, a));
  // At 90: 70 gives 21 x 29,760 = 624,960 over 69's 22 x 27,840 = 612,480.
  s = await setup(ZERO_TAX);
  ({ res } = s.run());
  checkZeroCost(s, res);
  c.expect(res.gridBest).toBe(cellOf(res, null, 70));
  c.expect(res.cells.every((x) => x.sameAs === null)).toBe(true);
});

it('the current choice: claims now, and outside the grid', async () => {
  let s = await setup({ ...ZERO_TAX, ageA: 64, retireAgeA: 64, ssStartAgeA: 60 });
  let { res } = s.run();
  c.expect(res.current.cell).toBe(cellOf(res, null, 64));
  c.expect(res.current.a).toBe(64);
  s = await setup({ ...ZERO_TAX, ageA: 64, retireAgeA: 64, ssLateStartEnabled: true, ssStartAgeA: 72 });
  ({ res } = s.run());
  c.expect(res.current.cell).toBe(-1);
  c.expect(res.current.a).toBe(72);
  c.expect(res.current.sameAs).toBe(null);
  // Seven cells and the current choice, at the plan's end age and at 80, 85 and 95 (90 is the plan's).
  c.expect(res.runs).toBe(32);
  const d = s.direct(null);
  c.expect(res.current.measure.value).toBe(d.value);
  // A widowed person's survivor start of 69: the stream of no cell, an extra run.
  s = await setup({ ...WIDOWED, ssSurvivorStartAge: 69 });
  ({ res } = s.run());
  c.expect(res.current.cell).toBe(-1);
});

it('a tie goes to the current choice through the search', async () => {
  // A widowed person of 62 (born 1964), life expectancy 66, own 2,500 at 62 (21,000 a year) and a survivor benefit of 1,500
  // (18,000 at 67 at most): no survivor start ever pays more under own 62, so every survivor start with own 62 is one stream,
  // and own 62 wins (5 x 21,000 = 105,000 against 63's 4 x 22,500 = 90,000). The current choice, survivor 63 with own 62, is a
  // duplicate of the canonical (62, 62): it wins the tie, and neither is among the three re-measured others.
  const s = await setup({ ...WIDOWED, ageA: 62, retireAgeA: 62, lifeExpectancyA: 66, ssStartAgeA: 62, ssSurvivorMonthlyFra: 1500, ssSurvivorStartAge: 63 });
  const { res } = s.run();
  checkZeroCost(s, res);
  const cur = cellOf(res, 63, 62),
    canon = cellOf(res, 62, 62);
  c.expect(res.current.cell).toBe(cur);
  c.expect(res.cells[cur].sameAs).toBe(canon);
  c.expect(res.gridBest).toBe(cur);
  c.expect(res.best.cell).toBe(cur);
  c.expect(res.best.isCurrent).toBe(true);
  c.expect(res.best.gain).toBe(0);
  c.expect(res.top.slice(1).some((t) => t.cell === cur || t.cell === canon)).toBe(false);
});

it('a run-out case', async () => {
  // Claims at 62-66 drain more than 300,000 by 90 (62: 29 x 13,200 = 382,800; 66: 4 x 30,000 + 25 x 7,600 = 310,000); 67
  // drains 294,000 (end 6,000); 70 drains 8 x 30,000 + 21 x 240 = 245,040 (end 54,960, the best).
  const s = await setup({ ...ZERO_TAX, cash: 300000, spending: 30000 });
  const { res } = s.run();
  checkZeroCost(s, res, { runsOut: true });
  c.expect(res.gridBest).toBe(cellOf(res, null, 70));
  for (const a of range(62, 66)) c.expect(res.cells[cellOf(res, null, a)].measure.depletedAge === null).toBe(false);
  for (const a of range(67, 70)) c.expect(res.cells[cellOf(res, null, a)].measure.depletedAge).toBe(null);
  c.expect(s.cs.claimBetter(res.cells[cellOf(res, null, 66)].measure, res.cells[cellOf(res, null, 62)].measure)).toBe(true);
});

// ---- Task 3: the re-measure, the longevity row, guardrails, scenarios, couples ----

it('the longevity row', async () => {
  // At 85: 70 gives 16 x 29,760 = 476,160 over 69's 17 x 27,840 = 473,280; at 95 26 x 29,760 over 27 x 27,840.
  let s = await setup(ZERO_TAX);
  let { res } = s.run();
  c.expect(res.longevity.map((e) => e.endAge)).toStrictEqual([80, 85, 90, 95]);
  c.expect(res.longevity.map((e) => res.cells[e.cell].a)).toStrictEqual([68, 70, 70, 70]);
  c.expect(res.longevity[2].cell).toBe(res.gridBest);
  // The grid (9 runs) and three more end ages (9 each): 90 reuses the grid.
  c.expect(res.runs).toBe(36);
  c.expect(res.longevity[0].sameAsCurrent).toBe(false);
  s = await setup(WIDOWED);
  ({ res } = s.run());
  c.expect(res.longevity.length).toBe(4);
  s = await setup(COUPLE);
  ({ res } = s.run());
  c.expect(res.longevity).toBe(null);
});

it('the re-measure with each choice’s own plan', async () => {
  // On ACA coverage until 65 with Roth conversions on: each choice's own plan sizes its conversions anew, so the re-measure
  // moves the top cells (asserted below).
  const ACA = {
    ...WIDOWED, acaEnabled: true, cliffGuardEnabled: true, rothConvEnabled: true, spending: 45000, taxable: 200000,
    trad401kA: 700000, cash: 30000, cashReserve: 30000, returnRate: 7, dividendYield: 1.5, healthcare: 18000, medicareYearly: 10000,
  };
  const s = await setup(ACA);
  const { res, yields } = s.run();
  c.expect(res.top[0].cell).toBe(res.current.cell);
  c.expect(res.top.length).toBe(4);
  c.expect(res.plannings).toBe(4);
  // The current choice plans as the state itself: the kept plan.
  const cur = s.measured(s.ownPlanContextFor(s.state)(s.variant(null)));
  c.expect(res.top[0].measure.value).toBe(cur.value);
  // The three others are the best three distinct non-current grid runs by the sort key, in the earlier-ages order.
  const key = (m) => [m.depletedAge === null ? 0 : 1, m.depletedAge === null ? 0 : -m.depletedAge, -m.value];
  const less = (x, y) => {
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
    return false;
  };
  const curCanon = res.cells[res.current.cell].sameAs ?? res.current.cell;
  const pool = res.cells.map((x, i) => i).filter((i) => res.cells[i].sameAs === null && i !== res.current.cell && i !== curCanon);
  const chosen = res.top.slice(1).map((t) => t.cell);
  for (const i of pool) if (!chosen.includes(i)) for (const j of chosen) c.expect(less(key(res.cells[i].measure), key(res.cells[j].measure))).toBe(false);
  const sum = (x) => (x.survivor ?? 0) + (x.a ?? 0);
  for (let i = 1; i < chosen.length; i++) c.expect(sum(res.cells[chosen[i - 1]]) <= sum(res.cells[chosen[i]])).toBe(true);
  for (const t of res.top.slice(1)) {
    const cell = res.cells[t.cell],
      d = s.measured(s.ownPlanContextFor(s.ss.ssClaimVariant(s.state, s.axes, cell))(s.variant(cell)));
    c.expect(t.measure.value).toBe(d.value);
    c.expect(t.measure.depletedAge).toBe(d.depletedAge);
  }
  c.expect(res.top.slice(1).some((t) => t.measure.value !== res.cells[t.cell].measure.value)).toBe(true);
  c.expect(res.best.gain).toBe(res.best.measure.today - res.top[0].measure.today);
  // The yields: one 'run' a projection, a 'plan-next' and a 'plan' around each own-plan context.
  c.expect(yields.filter((y) => y === 'run').length).toBe(res.runs);
  c.expect(yields.filter((y) => y === 'plan-next').length).toBe(4);
  c.expect(yields.filter((y) => y === 'plan').length).toBe(4);
  yields.forEach((y, i) => {
    if (y === 'plan-next') c.expect(yields[i + 1]).toBe('plan');
  });
  // The cliff plan off: the grid measures stand, nothing is planned.
  const off = await setup({ ...ACA, cliffGuardEnabled: false });
  const o = off.run();
  c.expect(o.res.plannings).toBe(0);
  c.expect(o.yields.includes('plan-next')).toBe(false);
  for (const t of o.res.top.slice(1)) c.expect(t.measure).toStrictEqual(o.res.cells[t.cell].measure);
});

it('guardrails off and a market scenario reach every run', async () => {
  // Invested balances growing at 7%, so the guardrails' prosperity rule fires (they never do on the all-cash fixture).
  const INVESTED = { ...WIDOWED, taxable: 600000, trad401kA: 300000, cash: 30000, cashReserve: 30000, returnRate: 7, spending: 45000 };
  const plainG = (await setup(INVESTED)).run().res;
  const g = await setup({ ...INVESTED, guardrailsEnabled: true });
  const guard = g.run().res;
  c.expect(guard.cells).toStrictEqual(plainG.cells);
  // The fixture is guardrail-sensitive: the same choice run with guardrails on ends elsewhere.
  const cell = guard.cells[cellOf(guard, 60, 70)];
  c.expect(g.measured(g.contextFor({ ...g.ss.ssClaimVariant(g.state, g.axes, cell) })).value === cell.measure.value).toBe(false);
  const plain = (await setup(WIDOWED)).run().res;
  const s = await setup({ ...WIDOWED, marketScenario: SPELL });
  const { res } = s.run();
  for (const i of [cellOf(res, 60, 70), cellOf(res, 67, 62)]) checkDirect(s, res, i);
  c.expect(res.cells.some((x, i) => x.measure.value !== plain.cells[i].measure.value)).toBe(true);
});

it('couples run, and their dedupe', async () => {
  let s = await setup(COUPLE);
  let { res } = s.run();
  c.expect(res.kind).toBe('couple');
  c.expect(res.cells.length).toBe(81);
  c.expect(res.current.cell).toBe(cellOf(res, null, 62, 62));
  c.expect(res.cells.every((x) => x.sameAs === null)).toBe(true);
  for (const i of [cellOf(res, null, 62, 62), cellOf(res, null, 70, 66), cellOf(res, null, 65, 70)]) checkDirect(s, res, i);
  // Both life expectancies 67 and A dying at 65: starts of 68-70 are never paid, so they share a key.
  s = await setup({ ...COUPLE, lifeExpectancyA: 67, lifeExpectancyB: 67, survivorDeathAge: 65 });
  ({ res } = s.run());
  c.expect(res.cells[cellOf(res, null, 69, 62)].sameAs).toBe(cellOf(res, null, 68, 62));
  c.expect(res.cells[cellOf(res, null, 70, 70)].sameAs).toBe(cellOf(res, null, 68, 68));
  checkSameAs(s, res);
});

it('refusals run nothing, and the state is not written', async () => {
  for (const patch of [{ ...ZERO_TAX, ssMonthlyA: 0 }, { ...ZERO_TAX, ssCollectingA: true }, { ...ZERO_TAX, ssBenefitBasisA: 'atClaim' }, { ...ZERO_TAX, ageA: 72, retireAgeA: 72 }]) {
    const s = await setup(patch);
    const { res, yields } = s.run();
    c.expect(Object.keys(res)).toStrictEqual(['status', 'kind', 'axes', 'ownFixed']);
    c.expect(yields.length).toBe(0);
  }
  const s = await setup(WIDOWED);
  const before = structuredClone(s.state);
  s.run();
  c.expect(s.state).toStrictEqual(before);
});
