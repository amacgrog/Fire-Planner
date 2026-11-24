// The bridge reserve's counter (bal.bridgeBonds, US) in the shared moves: trim, draw, end, surplus, ramp and growth.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const bal = (o = {}) => ({
  taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0,
  traditional: 0, roth: 0, cash: 0, home: 0, mortgage: 0, ...o,
});
const PROFILE = { wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 55, ageB: 55, singlePerson: true, filing: 'single' };
const wdOf = async (w, b) => ({ bal: b, ctx: await w.ctx(), profile: { ...PROFILE }, taxableGainGross: 0, traditionalGross: 0, taxableWithdrawn: 0, saleForTax: 0 });
const ladder = async (w) => w.load('shared/core/withdrawals/bond-ladder.js');
const near = (a, b) => Math.abs(a - b) <= 1e-3; // drawTaxable has no tolerance constant: it stops after a fixed number of halvings, so a net is near the ask by a margin that grows with the ask (about 0.007 at 60000; a thousandth at these small sizes, written out)

it('trimBondReserve leaves the bridge counter and its basis share, and trims the retirement part by its own total', async () => {
  const w = await world();
  const { trimBondReserve } = await ladder(w);
  const b = bal({ taxable: 1000, taxableBasis: 600, bondTaxable: 300, bondTaxableBasis: 150, bridgeBonds: 200, bondTraditional: 500 });
  trimBondReserve(b, 300);
  expect(b.bondTaxable).toBe(250);
  expect(b.bondTaxableBasis).toBe(125);
  expect(b.taxable).toBe(1050);
  expect(b.taxableBasis).toBe(625);
  expect(b.bondTraditional).toBe(250);
  expect(b.traditional).toBe(250);
  expect(b.bridgeBonds).toBe(200);
});

it('trimBondReserve with no bridge key is the old trim and writes no key', async () => {
  const w = await world();
  const { trimBondReserve } = await ladder(w);
  const b = bal({ bondTaxable: 100, bondTaxableBasis: 40, bondTraditional: 100 });
  trimBondReserve(b, 100);
  expect(b).toStrictEqual(bal({ bondTaxable: 50, bondTaxableBasis: 20, taxable: 50, taxableBasis: 20, bondTraditional: 50, traditional: 50 }));
});

it('refillBondReserve counts only the retirement part against the target', async () => {
  const w = await world();
  const { refillBondReserve } = await ladder(w);
  const b = bal({ bondTaxable: 200, bondTaxableBasis: 200, bridgeBonds: 200, traditional: 1000 });
  refillBondReserve(await wdOf(w, b), 300);
  expect(b.bondTraditional).toBe(300);
  expect(b.traditional).toBe(700);
  expect(b.bridgeBonds).toBe(200);
});

it('takeBondTaxable spends the bridge first, to 0 at the least, at zero gain', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { takeBondTaxable } = await w.load('shared/core/withdrawals/draws.js');
  const b = bal({ bondTaxable: 300, bondTaxableBasis: 300, bridgeBonds: 200 });
  const net = takeBondTaxable(await wdOf(w, b), 150);
  expect(near(net, 150)).toBe(true);
  expect(near(b.bridgeBonds, 50)).toBe(true);
  expect(near(b.bondTaxable, 150)).toBe(true);
  const c = bal({ bondTaxable: 300, bondTaxableBasis: 300, bridgeBonds: 100 });
  takeBondTaxable(await wdOf(w, c), 250);
  expect(c.bridgeBonds).toBe(0);
});

it('takeBondTaxable at a gain takes the basis share and keeps the counter in step', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { takeBondTaxable } = await w.load('shared/core/withdrawals/draws.js');
  // Half of bondTaxable is basis, so a sale of 100 takes 50 of basis (the gain is small enough to be untaxed at zero income).
  const b = bal({ bondTaxable: 400, bondTaxableBasis: 200, bridgeBonds: 300 });
  const wd = await wdOf(w, b);
  takeBondTaxable(wd, 100);
  expect(near(b.bondTaxable, 400 - wd.taxableWithdrawn)).toBe(true);
  expect(near(b.bondTaxableBasis, 200 - wd.taxableWithdrawn / 2)).toBe(true);
  expect(near(b.bridgeBonds, 300 - wd.taxableWithdrawn)).toBe(true);
  expect(near(wd.taxableGainGross, wd.taxableWithdrawn / 2)).toBe(true);
  // Literal anchors, by hand: at zero income the 100 sale nets 100 (the 50 gain is untaxed), so bondTaxable 400 -> 300, its basis
  // 200 -> 150, the counter 300 -> 200 and the gain is 50.
  expect(near(wd.taxableWithdrawn, 100)).toBe(true);
  expect(near(b.bondTaxable, 300)).toBe(true);
  expect(near(b.bondTaxableBasis, 150)).toBe(true);
  expect(near(b.bridgeBonds, 200)).toBe(true);
  expect(near(wd.taxableGainGross, 50)).toBe(true);
});

it('takeBondTaxable on a balance without the counter writes no key', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { takeBondTaxable } = await w.load('shared/core/withdrawals/draws.js');
  const b = bal({ bondTaxable: 300, bondTaxableBasis: 300 });
  takeBondTaxable(await wdOf(w, b), 100);
  expect('bridgeBonds' in b).toBe(false);
});

it('takeBridgeOnly draws the bridge dollars with their basis share out of bondTaxable and the counter', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { takeBridgeOnly } = await w.load('shared/core/withdrawals/draws.js');
  // bondTaxable 400 with basis 400 (no gain): the bridge's 100 carries 100 of basis.
  const b = bal({ bondTaxable: 400, bondTaxableBasis: 400, bridgeBonds: 100 });
  const wd = await wdOf(w, b);
  const net = takeBridgeOnly(wd, 60);
  expect(near(net, 60)).toBe(true);
  expect(near(b.bridgeBonds, 40)).toBe(true);
  expect(near(b.bondTaxable, 340)).toBe(true);
  expect(near(b.bondTaxableBasis, 340)).toBe(true);
  expect(wd.taxableGainGross).toBe(0);
  expect(near(wd.taxableWithdrawn, 60)).toBe(true);
});

it('takeBridgeOnly never takes more than the bridge', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { takeBridgeOnly } = await w.load('shared/core/withdrawals/draws.js');
  const b = bal({ bondTaxable: 400, bondTaxableBasis: 400, bridgeBonds: 100 });
  takeBridgeOnly(await wdOf(w, b), 1000);
  expect(b.bridgeBonds).toBe(0);
  expect(b.bondTaxable).toBe(300);
});

it('endBridge moves the bridge dollars and their basis share to the brokerage, no tax', async () => {
  const w = await world();
  const { endBridge } = await ladder(w);
  const b = bal({ taxable: 50, taxableBasis: 20, bondTaxable: 300, bondTaxableBasis: 240, bridgeBonds: 100 });
  endBridge(b);
  expect(b.taxable).toBe(150);
  expect(b.taxableBasis).toBe(100);
  expect(b.bondTaxable).toBe(200);
  expect(b.bondTaxableBasis).toBe(160);
  expect(b.bridgeBonds).toBe(0);
  const n = bal({ taxable: 5, bondTaxable: 9 });
  endBridge(n);
  expect(n).toStrictEqual(bal({ taxable: 5, bondTaxable: 9 }));
});

it('routeSurplus fills the retirement deficit first, then the bridge, and both count in toBonds', async () => {
  const w = await world();
  const { routeSurplus, SURPLUS_OUT } = await w.load('us/core/projection/year-modes.js');
  const b = bal({ bondTaxable: 250, bondTaxableBasis: 250, bridgeBonds: 200 });
  routeSurplus(b, { flow: 100, reserveTarget: 0, bondTarget: 100, traditionalContrib: 0, employerMatch: 0, rothContrib: 0, bridgeTarget: 230 });
  // Retirement part 50 against a target of 100: 50 to it; then 30 to the bridge (230 - 200); the last 20 to taxable.
  expect(b.bondTaxable).toBe(330);
  expect(b.bondTaxableBasis).toBe(330);
  expect(b.bridgeBonds).toBe(230);
  expect(b.taxable).toBe(20);
  expect(SURPLUS_OUT.toBonds).toBe(80);
  expect(SURPLUS_OUT.toTaxable).toBe(20);
});

it('routeSurplus with no retirement target goes straight to the bridge; without a bridge target it is the old body', async () => {
  const w = await world();
  const { routeSurplus, SURPLUS_OUT } = await w.load('us/core/projection/year-modes.js');
  const b = bal();
  routeSurplus(b, { flow: 100, reserveTarget: 0, bondTarget: null, traditionalContrib: 0, employerMatch: 0, rothContrib: 0, bridgeTarget: 60 });
  expect(b.bridgeBonds).toBe(60);
  expect(b.bondTaxable).toBe(60);
  expect(b.taxable).toBe(40);
  expect(SURPLUS_OUT.toBonds).toBe(60);
  const n = bal();
  routeSurplus(n, { flow: 100, reserveTarget: 0, bondTarget: null, traditionalContrib: 0, employerMatch: 0, rothContrib: 0 });
  expect(n).toStrictEqual(bal({ taxable: 100, taxableBasis: 100 }));
});

it('rotateIntoBondLadder ramps the bridge from the brokerage only, beside the retirement reserve', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { rotateIntoBondLadder, LADDER_OUT } = await ladder(w);
  const ctx = await w.ctx();
  // A 2-year window, first year: progress 1/2. Retirement target 400 -> 200 (from traditional); bridge 100 -> 50 (sold, no gain).
  const b = bal({ taxable: 1000, taxableBasis: 1000, traditional: 1000 });
  const gain = rotateIntoBondLadder(ctx, b, { year: 0, ladderTarget: 400, bridgeTarget: 100, rotationStartYear: 0, rotationEndYear: 1 }, { ...PROFILE }, 0);
  expect(b.bondTraditional).toBe(200);
  expect(b.traditional).toBe(800);
  expect(near(b.bridgeBonds, 50)).toBe(true);
  expect(near(b.bondTaxable, 50)).toBe(true);
  expect(b.roth).toBe(0);
  expect(near(b.taxable, 950)).toBe(true);
  expect(near(b.taxableBasis, 950)).toBe(true);
  expect(gain).toBe(0);
  expect(LADDER_OUT.saleTax).toBe(0);
  // The second year: the retirement reserve reaches 400 (bondTaxable's retirement part is 0), the bridge tops up to 100.
  rotateIntoBondLadder(ctx, b, { year: 1, ladderTarget: 400, bridgeTarget: 100, rotationStartYear: 0, rotationEndYear: 1 }, { ...PROFILE }, 0);
  expect(b.bondTraditional).toBe(400);
  expect(near(b.bridgeBonds, 100)).toBe(true);
});

it('rotateIntoBondLadder without a bridge target is the old move and writes no counter', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { rotateIntoBondLadder } = await ladder(w);
  const b = bal({ taxable: 1000, taxableBasis: 1000, traditional: 1000 });
  rotateIntoBondLadder(await w.ctx(), b, { year: 0, ladderTarget: 400, rotationStartYear: 0, rotationEndYear: 0 }, { ...PROFILE }, 0);
  expect('bridgeBonds' in b).toBe(false);
  expect(b.bondTraditional).toBe(400);
});

it('rotateIntoBondLadder fills the bridge before the retirement reserve takes the brokerage (a one-year window)', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { rotateIntoBondLadder, placeHeldReserve, LADDER_OUT } = await ladder(w);
  const ctx = await w.ctx();
  // Retirement 400: 150 from traditional, the gap of 250 wants the brokerage; the bridge 200 takes the brokerage first, so the
  // retirement reserve gets the 100 left and stays 150 short. Zero gain (basis = value).
  const b = bal({ taxable: 300, taxableBasis: 300, traditional: 150 });
  const gain = rotateIntoBondLadder(ctx, b, { year: 0, ladderTarget: 400, bridgeTarget: 200, rotationStartYear: 0, rotationEndYear: 0 }, { ...PROFILE }, 0);
  expect(b.bondTraditional).toBe(150);
  expect(b.traditional).toBe(0);
  expect(near(b.bridgeBonds, 200)).toBe(true);
  expect(near(b.bondTaxable, 300)).toBe(true);
  expect(b.taxable).toBe(0);
  expect(gain).toBe(0);
  expect(LADDER_OUT.saleTax).toBe(0);
  // Held, the same balances: the same split, exact (relabels).
  const h = bal({ taxable: 300, taxableBasis: 300, traditional: 150 });
  placeHeldReserve(h, { target: 400, bridgeTarget: 200 });
  expect(h.bondTraditional).toBe(150);
  expect(h.bridgeBonds).toBe(200);
  expect(h.bondTaxable).toBe(300);
  expect(h.taxable).toBe(0);
});

it('rotateIntoBondLadder stacks the retirement sale on the bridge sale gain, over a conversion', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { rotateIntoBondLadder, LADDER_OUT } = await ladder(w);
  const { taxFor } = await w.load('us/core/tax/federal-tax.js');
  const ctx = await w.ctx();
  const p = { ...PROFILE };
  const b = bal({ taxable: 200000, taxableBasis: 100000 });
  const gain = rotateIntoBondLadder(ctx, b, { year: 0, ladderTarget: 60000, bridgeTarget: 40000, rotationStartYear: 0, rotationEndYear: 0 }, p, 30000);
  expect(gain > 0).toBe(true);
  // Both sales are priced at the running gain, so the two sale taxes telescope to the tax of the whole gain over the conversion.
  expect(near(LADDER_OUT.saleTax, taxFor(ctx, { ...PROFILE }, gain, 30000) - taxFor(ctx, { ...PROFILE }, 0, 30000))).toBe(true);
  expect(Math.abs(b.bridgeBonds - 40000) <= 0.01).toBe(true);
  // The retirement sale's net stops within about 0.01 of the ask at this size (drawTaxable halves a fixed number of times), so 0.01 here.
  expect(Math.abs(b.bondTaxable - 100000) <= 0.01).toBe(true);
});

it('rotateIntoBondLadder with bridgeTarget 0 is the same as the key absent', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { rotateIntoBondLadder } = await ladder(w);
  const ctx = await w.ctx();
  const run = (extra) => {
    const b = bal({ taxable: 1000, taxableBasis: 500, traditional: 100 });
    const g = rotateIntoBondLadder(ctx, b, { year: 0, ladderTarget: 400, rotationStartYear: 0, rotationEndYear: 0, ...extra }, { ...PROFILE }, 0);
    return { b, g };
  };
  expect(run({ bridgeTarget: 0 })).toStrictEqual(run({}));
});

it('growBalances grows the counter with the bonds, only when held', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { growBalances } = await w.load('us/core/projection/balances.js');
  const ctx = await w.ctx();
  const g = { stockReturn: 0, bondReturn: 0.5, hysa: 0, homeGrowth: 0, inv: { divTotal: 0, bondInterest: 0 } };
  const b = bal({ bondTaxable: 200, bridgeBonds: 100 });
  growBalances(ctx, b, g);
  expect(b.bridgeBonds).toBe(150);
  expect(b.bondTaxable).toBe(300);
  const n = bal({ bondTaxable: 200 });
  growBalances(ctx, n, g);
  expect('bridgeBonds' in n).toBe(false);
});

// ---- Task 3.2: bridgeBondYears, the fill and the shortfall (runProjection) ----
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { legacyToAccounts } = require('../../legacy_balances.js');

async function run(patch, { scenario = false } = {}) {
  const w = await world();
  w.setTaxYear(2026);
  const st = await w.setState();
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { ensureTestPlan } = await w.load('us/core/cliff-plan/planning.js');
  const base = JSON.parse(JSON.stringify(st));
  for (const k of Object.keys(st)) delete st[k];
  Object.assign(st, base, legacyToAccounts(patch, base));
  ensureTestPlan();
  const ctx = await w.ctx();
  const trace = [];
  let src = { ctx, mode: STANDARD_MODE, source: standardYearSource(ctx.inputs) };
  if (scenario) {
    const { runSourceFor } = await w.load('shared/core/projection/run-source.js');
    src = runSourceFor(ctx);
  }
  const result = runProjection(src.ctx, { mode: src.mode, source: src.source, retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB, trace });
  return { result, trace };
}
// Her case: single, 59, retiring now, held; brokerage 80,000, cash 100,000 over a 50,000 reserve; spending 55,000.
const hers = (over = {}) => ({
  singlePerson: true, ageA: 59, retireAgeA: 59, lifeExpectancyA: 80, taxable: 80000, traditional: 600000, roth: 300000,
  cash: 100000, cashReserve: 50000, spending: 55000, bondYears: 5, bondReturn: 0, inflation: 3, stateTax: 'tx', bondStart: 'held', bridgeBondYears: 3, ...over,
});

it('getBridgeYears clamps 0-15 and is 0 when blank or absent', async () => {
  const w = await world();
  const { getBridgeYears } = await w.load('shared/core/projection/year-factors.js');
  expect(getBridgeYears({})).toBe(0);
  expect(getBridgeYears({ bridgeBondYears: '' })).toBe(0);
  expect(getBridgeYears({ bridgeBondYears: 'x' })).toBe(0);
  expect(getBridgeYears({ bridgeBondYears: -2 })).toBe(0);
  expect(getBridgeYears({ bridgeBondYears: 2.5 })).toBe(2.5);
  expect(getBridgeYears({ bridgeBondYears: 40 })).toBe(15);
});

it('bridgeOverAt: single at 59.5, a couple until both, a dead partner no longer counts', async () => {
  const w = await world();
  const { bridgeOverAt } = await w.load('shared/core/projection/year-factors.js');
  const one = { singlePerson: true, deceasedIsA: false, deceasedIsB: false, deathYear: Infinity };
  expect(bridgeOverAt({ ageA: 59 }, { year: 0, ...one })).toBe(false);
  expect(bridgeOverAt({ ageA: 59 }, { year: 1, ...one })).toBe(true);
  expect(bridgeOverAt({ ageA: 59.5 }, { year: 0, ...one })).toBe(true);
  const two = { singlePerson: false, deceasedIsA: false, deceasedIsB: false, deathYear: Infinity };
  expect(bridgeOverAt({ ageA: 62, ageB: 58 }, { year: 1, ...two })).toBe(false);
  expect(bridgeOverAt({ ageA: 62, ageB: 58 }, { year: 2, ...two })).toBe(true);
  // B dies in year 1: from then on only A counts.
  expect(bridgeOverAt({ ageA: 62, ageB: 50 }, { year: 0, ...two, deceasedIsB: true, deathYear: 1 })).toBe(false);
  expect(bridgeOverAt({ ageA: 62, ageB: 50 }, { year: 1, ...two, deceasedIsB: true, deathYear: 1 })).toBe(true);
  expect(bridgeOverAt({ ageA: 50, ageB: 62 }, { year: 1, ...two, deceasedIsB: true, deathYear: 1 })).toBe(false);
});

it('placeHeldReserve never takes negative cash for the bridge', async () => {
  const w = await world();
  const { placeHeldReserve } = await ladder(w);
  const b = bal({ taxable: 500, taxableBasis: 300, cash: 100 });
  placeHeldReserve(b, { target: 0, bridgeTarget: 200, cashFree: 80 });
  // 200 from the brokerage covers the target: nothing more is asked of cash.
  expect(b.bridgeBonds).toBe(200);
  expect(b.cash).toBe(100);
  const c = bal({ taxable: 500, taxableBasis: 300, cash: 100 });
  placeHeldReserve(c, { target: 0, bridgeTarget: 200, cashFree: -30 });
  expect(c.cash).toBe(100);
  expect(c.bridgeBonds).toBe(200);
});

it('held, her case: the bridge is the brokerage plus the free cash, the shortfall is the rest, retirement stocks untouched', async () => {
  const a = await run(hers());
  const noBridge = await run(hers({ bridgeBondYears: 0 }));
  // Three years of spending of 55,000 or more is over 165,000; the bridge holds 80,000 + (100,000 - 50,000) = 130,000.
  expect(a.result.bridgeFilled).toBe(130000);
  expect(a.result.bridgeShortfall >= 35000).toBe(true);
  // The target (filled + short) is the same number whatever the brokerage holds; the held fill is the 130,000 the accounts have.
  const richer = await run(hers({ taxable: 90000 }));
  expect(richer.result.bridgeFilled + richer.result.bridgeShortfall).toBe(a.result.bridgeFilled + a.result.bridgeShortfall);
  expect(richer.result.bridgeFilled).toBe(140000);
  // The target is the same number whatever the brokerage holds: 10,000 less brokerage is 10,000 more shortfall, and likewise for the free cash.
  const lessBrokerage = await run(hers({ taxable: 70000 }));
  expect(lessBrokerage.result.bridgeFilled).toBe(120000);
  expect(lessBrokerage.result.bridgeShortfall).toBe(a.result.bridgeShortfall + 10000);
  const lessCash = await run(hers({ cashReserve: 60000 }));
  expect(lessCash.result.bridgeFilled).toBe(120000);
  expect(lessCash.result.bridgeShortfall).toBe(a.result.bridgeShortfall + 10000);
  // The retirement reserve in the traditional and Roth accounts is what it is without a bridge.
  expect(a.trace[0].bondTraditional + a.trace[0].bondRoth).toBe(noBridge.trace[0].bondTraditional + noBridge.trace[0].bondRoth);
  expect(noBridge.result.bridgeShortfall).toBe(0);
  expect(noBridge.result.bridgeFilled).toBe(0);
});

it('held with a brokerage that covers the target: no shortfall', async () => {
  const r = await run(hers({ taxable: 1000000 }));
  expect(r.result.bridgeShortfall).toBe(0);
  expect(r.result.bridgeFilled > 165000).toBe(true);
});

it('a 62-year-old retiring now: the bridge is already over, nothing placed, no shortfall', async () => {
  const r = await run(hers({ ageA: 62, retireAgeA: 62 }));
  expect(r.result.bridgeShortfall).toBe(0);
  expect(r.result.bridgeFilled).toBe(0);
  expect(r.trace[0].bridgeBonds).toBe(0);
  // Rows as if there were no bridge: the brokerage and cash are untouched by it.
  const off = await run(hers({ ageA: 62, retireAgeA: 62, bridgeBondYears: 0 }));
  expect(r.trace[0].taxable).toBe(off.trace[0].taxable);
  expect(r.trace[0].cash).toBe(off.trace[0].cash);
});

it('bridge only (bondYears 0) held: the retirement part does nothing, the bridge is placed', async () => {
  const r = await run(hers({ bondYears: 0 }));
  expect(r.result.bridgeFilled).toBe(130000);
  expect(r.trace[0].bondTraditional).toBe(0);
  expect(r.trace[0].bondRoth).toBe(0);
});

it('a build plan retiring in 4 years with bondYears 0 ramps the bridge from the brokerage and its sale shows in the tax', async () => {
  const build = (over = {}) => ({
    singlePerson: true, ageA: 55, retireAgeA: 59, lifeExpectancyA: 80, incomeA: 120000, taxable: 800000, traditional: 600000, roth: 300000,
    cash: 50000, cashReserve: 30000, spending: 55000, bondYears: 0, bondReturn: 0, inflation: 3, stateTax: 'tx', bondStart: 'build', bridgeBondYears: 3, ...over,
  });
  const a = await run(build());
  const off = await run(build({ bridgeBondYears: 0 }));
  // The window is 3 years (the bridge's), so year 0 is untouched and the ramp starts in year 1.
  expect(a.trace[0].bridgeBonds).toBe(0);
  expect(a.trace[1].bridgeBonds > 0).toBe(true);
  expect(a.trace[3].bridgeBonds > a.trace[1].bridgeBonds).toBe(true);
  expect(a.result.bridgeShortfall).toBe(0);
  expect(a.result.bridgeFilled > 0).toBe(true);
  // Nothing comes from traditional or Roth.
  expect(a.trace[3].bondTraditional + a.trace[3].bondRoth).toBe(0);
  expect(a.trace[3].traditional).toBe(off.trace[3].traditional);
  // The brokerage's gain on the sale is taxed.
  expect(a.result.rows[1].tax > off.result.rows[1].tax).toBe(true);
});

it('a build plan with too small a brokerage reports the shortfall at the fill', async () => {
  const r = await run({
    singlePerson: true, ageA: 55, retireAgeA: 59, lifeExpectancyA: 80, incomeA: 120000, taxable: 20000, traditional: 600000, roth: 300000,
    cash: 50000, cashReserve: 30000, spending: 55000, bondYears: 0, bondReturn: 0, inflation: 3, stateTax: 'tx', bondStart: 'build', bridgeBondYears: 3,
  });
  expect(r.result.bridgeShortfall > 100000).toBe(true);
  expect(r.result.bridgeFilled < 25000).toBe(true);
});

// The bond readout's row: retirementYear - 1, or the year-0 row for a plan retiring now. bridgeAtRetirement is the bridge at that row's end.
const bondRowOf = (r) => r.result.rows.find((x) => x.year === r.result.retirementYear - 1) || r.result.rows[0];

it('bridgeAtRetirement is the counter at the bond row (a late-retiring held plan: after the growth years, not the fill)', async () => {
  const late = (over = {}) => ({
    singlePerson: true, ageA: 50, retireAgeA: 55, lifeExpectancyA: 80, incomeA: 120000, taxable: 800000, traditional: 600000, roth: 300000,
    cash: 50000, cashReserve: 30000, spending: 55000, bondYears: 4, bondReturn: 3, inflation: 3, stateTax: 'tx', bondStart: 'held', bridgeBondYears: 3, ...over,
  });
  const a = await run(late());
  const off = await run(late({ bridgeBondYears: 0 }));
  const row = bondRowOf(a);
  expect(a.result.bridgeAtRetirement).toBe(a.trace[row.year].bridgeBonds);
  expect(a.result.bridgeAtRetirement > a.result.bridgeFilled).toBe(true); // grown at the bond return for four years
  // The bridge-free buckets match the bridge-0 run's: the two retirement-account buckets exactly; the brokerage bond bucket less the counter
  // by a written-out tolerance of a millionth of a dollar ((taxable + bridge) - bridge is not the same summation as taxable alone).
  const offTrace = off.trace[bondRowOf(off).year];
  expect(a.trace[row.year].bondTraditional).toBe(offTrace.bondTraditional);
  expect(a.trace[row.year].bondRoth).toBe(offTrace.bondRoth);
  expect(Math.abs(a.trace[row.year].bondTaxable - a.trace[row.year].bridgeBonds - offTrace.bondTaxable) <= 1e-6).toBe(true);
});

it('bridgeAtRetirement for a build plan retiring now: the bond row is year 0, which holds only its share of the ramp', async () => {
  const now = (over = {}) => ({
    singlePerson: true, ageA: 59, retireAgeA: 59, lifeExpectancyA: 80, taxable: 800000, traditional: 600000, roth: 300000,
    cash: 50000, cashReserve: 30000, spending: 55000, bondYears: 0, bondReturn: 0, inflation: 3, stateTax: 'tx', bondStart: 'build', bridgeBondYears: 3, ...over,
  });
  const a = await run(now());
  const row = bondRowOf(a);
  expect(row.year).toBe(0);
  expect(a.result.bridgeAtRetirement).toBe(a.trace[0].bridgeBonds);
  expect(a.result.bridgeAtRetirement > 0).toBe(true);
  expect(row.bonds - a.result.bridgeAtRetirement).toBe(0);
});

// ---- Task 3.3: spending the bridge, ending it at 59 and a half, the surplus top-up ----
// A 52-year-old retired now: no income, no tax (basis 100%), no dividends, no bond return, no inflation, no cash: every dollar the plan
// spends is a sale of exactly what it spends, so a row's expenses are what its draws raised.
// A draw's net is within a thousandth of the ask (drawTaxable's fixed halvings) and the placement is reported in whole dollars: a dollar is the tolerance (written out).
const within = (a, b) => Math.abs(a - b) <= 1;
const frozen = (over = {}) => ({
  singlePerson: true, ageA: 52, retireAgeA: 52, lifeExpectancyA: 62, taxable: 2000000, basisRatio: 100, traditional: 600000, roth: 300000,
  cash: 0, cashReserve: 0, hysaRate: 0, dividendYield: 0, spending: 55000, bondYears: 0, bondReturn: 0, returnRate: 0, inflation: 0, medicalInflation: 0,
  stateTax: 'tx', acaEnabled: false, bondStart: 'held', bridgeBondYears: 3, ...over,
});
const crash = (order) => ({ kind: 'crash', order, crashes: [{ age: 52, drop: 30, fallYears: 2, recoverPct: 100, recoverYears: 3, inflation: 0, bondReturn: 0 }] });
// The two fall years of that crash are years 0 and 1 (a stock return below 0), the recovery years 2-4 are up years.

for (const order of ['bucket', 'standard']) {
  it(order + ' order under a crash at 52: the fall years draw the bridge, not the brokerage stocks', async () => {
    const a = await run(frozen({ marketScenario: crash(order) }), { scenario: true });
    const off = await run(frozen({ bridgeBondYears: 0, marketScenario: crash(order) }), { scenario: true });
    expect(a.result.bridgeFilled > 150000).toBe(true);
    // The bridge pays each fall year's spending in full (bonds earn 0%, no tax): the counter and the bond account both fall by the
    // year's expenses, so no brokerage stock was sold for it (the brokerage account's own fall is the market's).
    const spent0 = a.result.rows[0].expenses, spent1 = a.result.rows[1].expenses;
    expect(within(a.result.bridgeFilled - a.trace[0].bridgeBonds, spent0)).toBe(true);
    expect(within(a.trace[0].bridgeBonds - a.trace[1].bridgeBonds, spent1)).toBe(true);
    expect(within(a.trace[0].bondTaxable - a.trace[1].bondTaxable, spent1)).toBe(true);
    expect(within(a.trace[0].bridgeBonds, a.trace[0].bondTaxable)).toBe(true);
    // Not vacuous: without a bridge there are no bonds and the same spending is a brokerage sale.
    expect(off.trace[1].bondTaxable).toBe(0);
    // The first recovery year is an up year: stocks first again (basis falls), the bridge is left alone.
    expect(a.trace[2].bridgeBonds).toBe(a.trace[1].bridgeBonds);
    expect(a.trace[2].bondTaxable).toBe(a.trace[1].bondTaxable);
  });
}

it('the bridge is never refilled by a sale: through a crash and its recovery the counter never rises (no surplus), then ends at 60', async () => {
  const a = await run(frozen({ bondYears: 2, marketScenario: crash('bucket') }), { scenario: true });
  expect(a.trace[1].bridgeBonds < a.result.bridgeFilled).toBe(true);
  for (let k = 1; k <= 7; k++) expect(a.trace[k].bridgeBonds <= a.trace[k - 1].bridgeBonds).toBe(true);
  expect(a.trace[7].bridgeBonds > 0).toBe(true);
  expect(a.trace[8].bridgeBonds).toBe(0);
});

it('the plain projection (an up return every year) never spends the bridge; at 60 it ends as a relabel into the brokerage account', async () => {
  const a = await run(frozen());
  for (let k = 1; k <= 7; k++) expect(a.trace[k].bridgeBonds).toBe(a.trace[0].bridgeBonds);
  expect(a.trace[0].bridgeBonds > 150000).toBe(true);
  const held = a.trace[7].bridgeBonds;
  expect(a.result.rows[7].bonds).toBe(held);
  expect(a.trace[8].bridgeBonds).toBe(0);
  expect(a.result.rows[8].bonds).toBe(0);
  // The brokerage account gains exactly the moved bonds on top of the year's sale of its spending (no tax, no gain).
  expect(within(a.result.rows[8].taxable, a.result.rows[7].taxable - a.result.rows[8].expenses + held)).toBe(true);
  expect(a.result.rows[8].tax).toBe(a.result.rows[7].tax);
});

it('a couple, A 58 and B 50, A dies at 62: the bridge stays open while B is under 59 and a half and ends the year B is 60', async () => {
  const c = (over) => frozen({ singlePerson: false, ageA: 58, retireAgeA: 58, ageB: 50, retireAgeB: 50, lifeExpectancyA: 90, lifeExpectancyB: 90, survivorEnabled: true, ...over });
  const a = await run(c({ survivorPartner: 'A', survivorDeathAge: 62 }));
  for (let k = 0; k <= 9; k++) expect(a.trace[k].bridgeBonds > 0).toBe(true);
  expect(a.trace[10].bridgeBonds).toBe(0);
  // B dies at 55 (year 5), A is then 63: the bridge ends in the year of B's death.
  const b = await run(c({ survivorPartner: 'B', survivorDeathAge: 55 }));
  for (let k = 0; k <= 4; k++) expect(b.trace[k].bridgeBonds > 0).toBe(true);
  expect(b.trace[5].bridgeBonds).toBe(0);
});

it('a surplus tops the bridge up toward its target after the retirement reserve, from year 0 of a held plan retiring now', async () => {
  const lean = (over = {}) => frozen({ taxable: 50000, traditional: 0, roth: 0, pensionYearlyA: 120000, pensionStartAgeA: 52, ...over });
  const a = await run(lean());
  const off = await run(lean({ bridgeBondYears: 0 }));
  expect(a.result.bridgeFilled).toBe(50000);
  // Year 0's surplus (the pension over spending) is routed into the bridge: the counter rises above its placement, to at most its target.
  expect(a.trace[0].bridgeBonds > a.result.bridgeFilled).toBe(true);
  expect(a.trace[0].bridgeBonds <= 3 * a.result.rows[0].expenses + 1e-6).toBe(true);
  // What went into bonds did not go to the brokerage account.
  expect(a.trace[0].taxable < off.trace[0].taxable).toBe(true);
  expect(off.trace[0].bridgeBonds).toBe(0);
});

it('a build plan retiring now at 59 reaches 59 and a half inside its ramp: nothing more is bought, the bridge ends in year 1 and reports no shortfall', async () => {
  const a = await run(frozen({ ageA: 59, retireAgeA: 59, lifeExpectancyA: 65, bondStart: 'build' }));
  expect(a.trace[0].bridgeBonds > 0).toBe(true);
  expect(a.trace[1].bridgeBonds).toBe(0);
  expect(a.trace[2].bridgeBonds).toBe(0);
  expect(a.result.bridgeFilled).toBe(Math.round(a.trace[0].bridgeBonds));
  expect(a.result.bridgeShortfall).toBe(0);
  // Year 2 sold no stock for bonds: the bonds are gone from the bond account and the brokerage account fell by the year's spending only.
  expect(a.result.rows[2].bonds).toBe(0);
  expect(within(a.result.rows[2].taxable, a.result.rows[1].taxable - a.result.rows[2].expenses)).toBe(true);
});

it('a build plan retiring now at 58 turns 59 and a half in the last year of its ramp: no shortfall, filled is what year 1 left it', async () => {
  const a = await run(frozen({ ageA: 58, retireAgeA: 58, lifeExpectancyA: 65, bondStart: 'build' }));
  // The window is years 0-2; age 60 arrives in year 2, so year 2 buys nothing more and the bridge ends there (bonds earn 0%).
  expect(a.trace[1].bridgeBonds > 0).toBe(true);
  expect(a.trace[2].bridgeBonds).toBe(0);
  expect(a.result.bridgeShortfall).toBe(0);
  expect(a.result.bridgeFilled).toBe(Math.round(a.trace[1].bridgeBonds));
});

// ---- Final review fixes: a bridge over at retirement leaves the window alone; an unfunded one still shows its gap ----
it('a build plan whose bridge is over at retirement is the same plan as bridge 0: rows identical (retiring now at 62; retiring at 62 from 50)', async () => {
  for (const over of [
    { ageA: 62, retireAgeA: 62, lifeExpectancyA: 75 },
    { ageA: 50, retireAgeA: 62, lifeExpectancyA: 75 },
  ]) {
    const mk = (b) => hers({ ...over, bondStart: 'build', bondYears: 5, bridgeBondYears: b, taxable: 900000 });
    const a = await run(mk(8)), off = await run(mk(0));
    expect(a.result.rows).toStrictEqual(off.result.rows);
    expect(a.result.bridgeFilled).toBe(0);
    expect(a.result.bridgeShortfall).toBe(0);
    expect(a.result.bridgeYearsEff).toBe(0);
  }
  // 50 retiring at 62 with a 10-year bridge: the ramp starts at year 7 (the 5-year window), not year 2
  const b = await run(hers({ ageA: 50, retireAgeA: 62, lifeExpectancyA: 75, bondStart: 'build', bondYears: 5, bridgeBondYears: 10, taxable: 900000 }));
  expect(b.trace[6].bridgeBonds).toBe(0);
});

it('a build plan retiring now at 57 with an empty brokerage and a 5-year bridge: the bridge ends in year 3 unfunded and shows its gap', async () => {
  const mk = (over = {}) => frozen({ ageA: 57, retireAgeA: 57, lifeExpectancyA: 65, bondStart: 'build', bridgeBondYears: 5, ...over });
  const a = await run(mk({ taxable: 0 })), funded = await run(mk());
  expect(a.trace[2].bridgeBonds).toBe(0);
  expect(a.result.bridgeFilled).toBe(0);
  // The window is years 0-4 and age 60 arrives in year 3, so the ramp should have reached 3 of its 5 equal steps by the end of year 2:
  // three times what the funded run bought in year 0 (one step; no inflation, no bond return, no growth).
  expect(within(a.result.bridgeShortfall, 3 * funded.trace[0].bridgeBonds)).toBe(true);
  expect(a.result.bridgeShortfall > 0).toBe(true);
});

it('a well-funded build bridge that ends inside its window shows no shortfall (57, 5-year bridge, 2,000,000 in brokerage)', async () => {
  const a = await run(frozen({ ageA: 57, retireAgeA: 57, lifeExpectancyA: 65, bondStart: 'build', bridgeBondYears: 5 }));
  expect(a.result.bridgeShortfall).toBe(0);
  expect(a.result.bridgeFilled).toBe(Math.round(a.trace[2].bridgeBonds));
  expect(a.trace[3].bridgeBonds).toBe(0);
});

// ---- Task A2: the standard order's down-year bridge sale under the MAGI cap (takeBridgeBonds) ----
// Single, 60, Texas: a gain of 10,000 is taxed at 0% (2026 deduction 16,100). Ladder gain 2,000 and limit 12,000 leave a room of 10,000.
const WD_PROFILE = {
  filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0,
  ageA: 60, ageB: null, singlePerson: true, seOn: false, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0,
  mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [],
};
async function capSetup() {
  const w = await world();
  await w.setState({ stateTax: 'tx', inflation: 0, singlePerson: true, tenure: 'rent' });
  const store = await w.load('shared/core/store.js');
  const draws = await w.load('us/core/withdrawals/draws.js');
  const strategies = await w.load('us/core/withdrawals/strategies.js');
  const shared = await w.load('shared/core/withdrawals/draws.js');
  const { rothAccountsNew } = await w.load('us/core/accounts/roth-ledger.js');
  const ctx = await w.ctx();
  const mk = (balPatch, { ladder = 0, limit = null, off = false } = {}) => {
    const wd = draws.newWithdrawal(ctx, {
      bal: bal(balPatch), rothAccts: rothAccountsNew(store.state), accts: { trad: [1, 0, 0, 0], roth: [1, 0, 0, 0] },
      seppActive: [false, false, false, false], profile: { ...WD_PROFILE }, conversionAmount: 0, rmd: 0,
    });
    wd.taxableGainGross = ladder;
    if (limit !== null) wd.magiCap = { limit, off };
    return wd;
  };
  return { draws, strategies, shared, mk };
}
// 200,000 of bonds on a basis of 100,000, all of it the bridge: gain ratio 0.5, so a room of 10,000 sells 20,000 (basis 10,000).
const BRIDGED = { bondTaxable: 200000, bondTaxableBasis: 100000, bridgeBonds: 200000 };

it('a down year under a binding cap: the bridge sells only the room, stocks and the rest come from cash', async () => {
  const { strategies, mk } = await capSetup();
  const wd = mk({ ...BRIDGED, cash: 100000 }, { ladder: 2000, limit: 12000 });
  wd.need = 60000;
  strategies.withdrawStandard(wd, { age: 60, yearReturn: -0.2 });
  expect(wd.taxableGainGross).toBe(12000);
  expect(wd.cappableGain).toBe(10000);
  expect(wd.bal.bridgeBonds).toBe(180000);
  expect(wd.bal.bondTaxable).toBe(180000);
  expect(wd.bal.bondTaxableBasis).toBe(90000);
  expect(wd.bal.cash).toBe(60000);
  expect(wd.need).toBe(0);
  expect(wd.taxableWithdrawn).toBe(20000);
});

it('a down year under a binding cap with no cash: the reserve step then sells the rest of the bridge, uncapped, and cappableGain stays the bridge pre-step', async () => {
  const { strategies, mk } = await capSetup();
  const wd = mk({ ...BRIDGED }, { ladder: 2000, limit: 12000 });
  wd.need = 60000;
  strategies.withdrawStandard(wd, { age: 60, yearReturn: -0.2 });
  expect(wd.need <= 0.01).toBe(true);
  expect(wd.taxableGainGross > 12000).toBe(true);
  expect(Math.abs(wd.taxableGainGross - 32000) <= 10).toBe(true);
  expect(wd.cappableGain).toBe(10000);
  expect(Math.abs(wd.bal.bridgeBonds - 140000) <= 10).toBe(true);
});

it('a down year with no room left: the bridge sells nothing and cash pays', async () => {
  const { strategies, mk } = await capSetup();
  const wd = mk({ ...BRIDGED, cash: 100000 }, { ladder: 12000, limit: 12000 });
  wd.need = 60000;
  strategies.withdrawStandard(wd, { age: 60, yearReturn: -0.2 });
  expect(wd.bal.bridgeBonds).toBe(200000);
  expect(wd.bal.cash).toBe(40000);
  expect(wd.cappableGain).toBe(0);
  expect(wd.taxableGainGross).toBe(12000);
});

it('a zero-gain bridge is the same capped or not, and counts no gain', async () => {
  const { draws, mk } = await capSetup();
  const zero = { bondTaxable: 200000, bondTaxableBasis: 200000, bridgeBonds: 200000 };
  const a = mk(zero, { ladder: 2000, limit: 12000 }), b = mk(zero, { ladder: 2000 });
  const na = draws.takeBridgeBonds(a, 60000), nb = draws.takeBridgeBonds(b, 60000);
  expect(na).toBe(nb);
  expect(a.bal).toStrictEqual(b.bal);
  expect(a.taxableGainGross).toBe(b.taxableGainGross);
  expect(a.cappableGain).toBe(0);
  expect(b.cappableGain).toBe(0);
});

it('with no cap, or a cap that is off, takeBridgeBonds is takeBridgeOnly to the bit and counts the sale gain', async () => {
  const { draws, shared, mk } = await capSetup();
  for (const cap of [null, 'off']) {
    const a = mk(BRIDGED, { ladder: 2000 }), b = mk(BRIDGED, { ladder: 2000 });
    if (cap === 'off') a.magiCap = { limit: 0, off: true };
    const na = draws.takeBridgeBonds(a, 60000), nb = shared.takeBridgeOnly(b, 60000);
    expect(na).toBe(nb);
    expect(a.bal).toStrictEqual(b.bal);
    expect(a.taxableGainGross).toBe(b.taxableGainGross);
    expect(a.taxableWithdrawn).toBe(b.taxableWithdrawn);
    expect(a.taxableGainGross > 2000).toBe(true);
    expect(a.cappableGain).toBe(b.taxableGainGross - 2000);
  }
});

it('an up year under the cap leaves the bridge alone: nothing counted while cash pays', async () => {
  const { strategies, mk } = await capSetup();
  const wd = mk({ ...BRIDGED, cash: 100000 }, { ladder: 2000, limit: 12000 });
  wd.need = 60000;
  strategies.withdrawStandard(wd, { age: 60, yearReturn: 0.1 });
  expect(wd.cappableGain).toBe(0);
  expect(wd.bal.bridgeBonds).toBe(200000);
  expect(wd.bal.cash).toBe(40000);
});

// ---- Task A4: bridge dollars the cap held back are released last (the reserve step takes only the retirement part) ----
it('penalty-aware, capped down year, Roth room enough: the bridge sells only the room, Roth covers the rest, MAGI stays at the cap', async () => {
  const { strategies, mk } = await capSetup();
  const wd = mk({ ...BRIDGED, roth: 100000 }, { ladder: 2000, limit: 12000 });
  wd.penaltyAware = true;
  wd.need = 60000;
  strategies.withdrawStandard(wd, { age: 60, yearReturn: -0.2 });
  expect(wd.bridgeHeldBack).toBe(false); // the release reset it
  expect(wd.taxableGainGross).toBe(12000);
  expect(wd.bal.bridgeBonds).toBe(180000);
  expect(wd.bal.bondTaxable).toBe(180000);
  expect(wd.need).toBe(0);
  expect(wd.bal.roth <= 60000 + 0.01).toBe(true);
  expect(wd.bal.roth >= 60000 - 0.01).toBe(true);
});

it('penalty-aware, capped down year, Roth too small: the release sells the rest of the bridge, nothing stranded', async () => {
  const { strategies, mk } = await capSetup();
  const wd = mk({ ...BRIDGED, roth: 15000 }, { ladder: 2000, limit: 12000 });
  wd.penaltyAware = true;
  wd.need = 60000;
  strategies.withdrawStandard(wd, { age: 60, yearReturn: -0.2 });
  expect(wd.need <= 0.01).toBe(true);
  expect(wd.bal.roth).toBe(0);
  expect(wd.cappableGain).toBe(10000);
  expect(wd.taxableGainGross > 12000).toBe(true);
  expect(Math.abs(wd.bal.bridgeBonds - 155000) <= 0.05).toBe(true);
});

it('capped down year, not penalty-aware, retirement part present: the reserve step leaves the bridge, release sells it last', async () => {
  const { strategies, mk } = await capSetup();
  // 300,000 of bonds, 200,000 of it the bridge, basis 150,000 (gain ratio 0.5); Roth 15,000 pays after the pre-step's 20,000.
  const wd = mk({ bondTaxable: 300000, bondTaxableBasis: 150000, bridgeBonds: 200000, roth: 15000 }, { ladder: 2000, limit: 12000 });
  wd.need = 60000;
  strategies.withdrawStandard(wd, { age: 60, yearReturn: -0.2 });
  expect(wd.need <= 0.01).toBe(true);
  // Roth first (not penalty-aware), then the reserve's own 100,000 retirement part takes the remaining 25,000; the bridge is left at 180,000.
  expect(wd.bal.roth).toBe(0);
  expect(wd.bal.bridgeBonds).toBe(180000);
});

it('no cap: the standard order is unchanged (no flag, the bridge goes through the reserve step as before)', async () => {
  const { strategies, mk } = await capSetup();
  const wd = mk({ ...BRIDGED }, { ladder: 2000 });
  wd.need = 60000;
  strategies.withdrawStandard(wd, { age: 60, yearReturn: -0.2 });
  expect(wd.bridgeHeldBack).toBe(false);
  expect(wd.need <= 0.01).toBe(true);
  expect(Math.abs(wd.bal.bridgeBonds - 140000) <= 0.05).toBe(true);
});

// Run level (the A4 review's case): single 52, a held 3-year bridge at 40% basis, ACA on, the crash-at-52 standard-order scenario,
// spending 140,000, planMode choose. Year 0 is a down year under 59 and a half with a bridge: the capped pre-step holds back what
// the room does not fit, and the reserve step must not sell it, so the stay-under's trial holds. The no-bridge plan is the control.
async function chooseYear0(over) {
  const w = await world();
  w.setTaxYear(2026);
  const st = await w.setState();
  const { storeContext } = await w.load('us/core/projection/store-context.js');
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { runSourceFor } = await w.load('shared/core/projection/run-source.js');
  const base = JSON.parse(JSON.stringify(st));
  for (const k of Object.keys(st)) delete st[k];
  Object.assign(st, base, legacyToAccounts(frozen({ basisRatio: 40, acaEnabled: true, spending: 140000, marketScenario: crash('standard'), ...over }), base));
  const ctx = storeContext({ planMode: 'choose', plan: null });
  const src = runSourceFor(ctx);
  const planTrace = [];
  runProjection(src.ctx, { mode: src.mode, source: src.source, retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB, planTrace });
  return planTrace.find((t) => t.year === 0);
}
it('a held bridge keeps the ACA stay-under a no-bridge plan gets in the crash year (the held-back bridge is released last)', async () => {
  const noBridge = await chooseYear0({ bridgeBondYears: 0 });
  const bridged = await chooseYear0({});
  const stay = (tr) => (tr.candidates || []).filter((x) => x.kind === 'under');
  expect(stay(noBridge).length > 0).toBe(true);
  expect(stay(noBridge).some((x) => x.ok)).toBe(true);
  expect(bridged.natGain > 0).toBe(true);
  expect(stay(bridged).length > 0).toBe(true);
  expect(stay(bridged).every((x) => x.ok)).toBe(true);
});

it('a zero-gain bridge sells in full even at room 0 (the gain-ratio-0 guard)', async () => {
  const { draws, mk } = await capSetup();
  const wd = mk({ bondTaxable: 200000, bondTaxableBasis: 200000, bridgeBonds: 200000 }, { ladder: 12000, limit: 12000 });
  const net = draws.takeBridgeBonds(wd, 60000);
  expect(Math.abs(net - 60000) <= 0.01).toBe(true);
  expect(wd.taxableGainGross).toBe(12000);
  expect(wd.cappableGain).toBe(0);
});
