// planBondLadder's year-0 window and bridge target, fillSplit, and placeHeldReserve (a reserve held from the start: a relabel, no tax).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const load = async () => {
  const w = await world();
  return w.load('shared/core/withdrawals/bond-ladder.js');
};
const bal = (o = {}) => ({
  taxable: 1000, taxableBasis: 600, traditional: 300, roth: 400,
  bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, cash: 50, bridgeBonds: 0, ...o,
});
const expense = () => 100;

it('planBondLadder retiring in year 0: an empty rotation window, the target unchanged', async () => {
  const { planBondLadder } = await load();
  const p = planBondLadder({ retirementYear: 0, bondYears: 5, projectedExpense: expense });
  expect(p.ladderTarget).toBe(500);
  expect(p.rotationStartYear).toBe(0);
  expect(p.rotationEndYear).toBe(-1);
  expect(p.bridgeTarget).toBe(0);
  expect(p.ladderTranches).toStrictEqual([100, 100, 100, 100, 100]);
});

it('planBondLadder retiring later: the window is unchanged', async () => {
  const { planBondLadder } = await load();
  const a = planBondLadder({ retirementYear: 3, bondYears: 5, projectedExpense: expense });
  expect(a.rotationStartYear).toBe(0);
  expect(a.rotationEndYear).toBe(2);
  const b = planBondLadder({ retirementYear: 10, bondYears: 5, projectedExpense: expense });
  expect(b.rotationStartYear).toBe(5);
  expect(b.rotationEndYear).toBe(9);
  expect(b.bridgeTarget).toBe(0);
});

it('planBondLadder with a bridge: the longer window and bridgeTarget as its own sum', async () => {
  const { planBondLadder } = await load();
  const p = planBondLadder({ retirementYear: 10, bondYears: 2, bridgeYears: 7, projectedExpense: expense });
  expect(p.rotationStartYear).toBe(3);
  expect(p.rotationEndYear).toBe(9);
  expect(p.bridgeTarget).toBe(700);
  expect(p.ladderTarget).toBe(200);
  expect(p.ladderTranches).toStrictEqual([100, 100]);
  const f = planBondLadder({ retirementYear: 4, bondYears: 1, bridgeYears: 2.5, projectedExpense: (y) => 10 * y });
  expect(f.bridgeTarget).toBe(40 + 50 + 30);
});

it('fillSplit with tradWant = amount: traditional, then Roth, nothing left', async () => {
  const { fillSplit } = await load();
  const b = bal();
  expect(fillSplit(b, 500, 500)).toBe(0);
  expect(b.bondTraditional).toBe(300);
  expect(b.bondRoth).toBe(200);
  expect(b.traditional).toBe(0);
  expect(b.roth).toBe(200);
});

it('fillSplit with tradWant < amount: traditional to the want, Roth, then traditional again; returns the unplaced rest', async () => {
  const { fillSplit } = await load();
  const b = bal({ roth: 150 });
  expect(fillSplit(b, 500, 100)).toBe(50);
  expect(b.bondTraditional).toBe(300);
  expect(b.bondRoth).toBe(150);
  expect(b.traditional).toBe(0);
  expect(b.roth).toBe(0);
});

it('placeHeldReserve fills traditional then Roth and leaves taxable alone', async () => {
  const { placeHeldReserve } = await load();
  const b = bal();
  placeHeldReserve(b, { target: 500 });
  expect(b.bondTraditional).toBe(300);
  expect(b.bondRoth).toBe(200);
  expect(b.traditional).toBe(0);
  expect(b.roth).toBe(200);
  expect(b.taxable).toBe(1000);
  expect(b.bondTaxable).toBe(0);
  expect(b.bridgeBonds).toBe(0);
});

it('placeHeldReserve relabels the rest from taxable with its basis share', async () => {
  const { placeHeldReserve } = await load();
  const b = bal({ roth: 100 });
  placeHeldReserve(b, { target: 500 });
  expect(b.bondTraditional).toBe(300);
  expect(b.bondRoth).toBe(100);
  expect(b.bondTaxable).toBe(100);
  expect(b.bondTaxableBasis).toBe(60);
  expect(b.taxable).toBe(900);
  expect(b.taxableBasis).toBe(540);
});

it('placeHeldReserve without a bridge never touches bridgeBonds, even when the key is missing', async () => {
  const { placeHeldReserve } = await load();
  const b = bal();
  delete b.bridgeBonds;
  placeHeldReserve(b, { target: 500 });
  expect('bridgeBonds' in b).toBe(false);
});

it('placeHeldReserve bridge: taxable first (basis share), then cash up to cashFree', async () => {
  const { placeHeldReserve } = await load();
  const a = bal();
  placeHeldReserve(a, { target: 0, bridgeTarget: 300, cashFree: 20 });
  expect(a.bondTaxable).toBe(300);
  expect(a.bondTaxableBasis).toBe(180);
  expect(a.taxable).toBe(700);
  expect(a.taxableBasis).toBe(420);
  expect(a.bridgeBonds).toBe(300);
  expect(a.cash).toBe(50);
  const b = bal();
  placeHeldReserve(b, { target: 0, bridgeTarget: 1040, cashFree: 30 });
  expect(b.taxable).toBe(0);
  expect(b.bondTaxable).toBe(1030);
  expect(b.bondTaxableBasis).toBe(630);
  expect(b.bridgeBonds).toBe(1030);
  expect(b.cash).toBe(20);
});
