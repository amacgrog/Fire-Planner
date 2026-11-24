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
const near = (a, b) => Math.abs(a - b) <= 1e-3; // the bisection's own tolerance, written out

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
