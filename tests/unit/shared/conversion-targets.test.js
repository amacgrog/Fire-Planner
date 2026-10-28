// The conversion-sizing target resolver (Batch 5 step 5b piece 3, B6): one case per branch of resolveConvTarget, on hand-built
// lines, the line targets convLineTargets offers, and pickConvTarget's ties to the bracket (spec B0.11.1).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
// The plan's line ids (plan-shape.js PLAN_LINE_IDS), as a literal: shared code never imports us/.
const LINE_IDS = ['medicaid', 'acaFloor', 'aca400', 'irmaa1', 'irmaa2', 'irmaa3', 'irmaa4', 'irmaa5'];
const line = (id, ret, magi, own = magi) => ({ magi, label: id, id, ret, family: 'x', own });
// A pass's resolution inputs: the bracket tops are 1000 x the percentage.
const T = (lines, more = {}) => ({ lines, preMagi: 0, preMagiA: 0, preMagiB: 0, shareA: 0.5, convertible: 1e9, bracketTop: (pct) => pct * 1000, ...more });

it('resolveConvTarget: none, a bracket, a household under / over line, a per-return line, and the -1 and cap branches', async () => {
  const w = await world();
  const { resolveConvTarget: r } = await w.load('shared/core/withdrawals/conversion-targets.js');
  c.expect(r('none', T([]))).toBe(0);
  c.expect(r('b22', T([]))).toBe(22000);
  c.expect(r('b22', T([], { convertible: 5000 }))).toBe(5000);
  c.expect(r({ id: 'aca400', ret: 'H', side: 'under' }, T([line('aca400', 'H', 100000)], { preMagi: 60000 }))).toBe(39999);
  c.expect(r({ id: 'acaFloor', ret: 'H', side: 'over' }, T([line('acaFloor', 'H', 30000)], { preMagi: 20000 }))).toBe(10001);
  // Partner B's own line 50000, B's MAGI 20000, B's share 1 - 0.25 (the household magi is not read)
  c.expect(r({ id: 'aca400', ret: 'B', side: 'under' }, T([line('aca400', 'B', 1, 50000)], { shareA: 0.25, preMagiB: 20000 }))).toBe(29999 / 0.75);
  // Partner A's own line 50000, A's MAGI 20000, A's share 0.25
  c.expect(r({ id: 'aca400', ret: 'A', side: 'under' }, T([line('aca400', 'A', 1, 50000)], { shareA: 0.25, preMagiA: 20000 }))).toBe(29999 / 0.25);
  // a line at or below preMagi: under gives <= 0
  c.expect(r({ id: 'irmaa1', ret: 'H', side: 'under' }, T([line('irmaa1', 'H', 60000)], { preMagi: 60000 }))).toBe(-1);
  c.expect(r({ id: 'irmaa1', ret: 'H', side: 'under' }, T([line('irmaa1', 'H', 60001)], { preMagi: 60000 }))).toBe(-1);
  // absent: another id, or the same id on another return
  c.expect(r({ id: 'irmaa2', ret: 'H', side: 'under' }, T([line('irmaa1', 'H', 90000)]))).toBe(-1);
  c.expect(r({ id: 'aca400', ret: 'A', side: 'under' }, T([line('aca400', 'B', 90000)]))).toBe(-1);
  // the target's own return carries no share
  c.expect(r({ id: 'aca400', ret: 'B', side: 'under' }, T([line('aca400', 'B', 1, 50000)], { shareA: 1 }))).toBe(-1);
  c.expect(r({ id: 'aca400', ret: 'A', side: 'under' }, T([line('aca400', 'A', 1, 50000)], { shareA: 0 }))).toBe(-1);
  // over the convertible balance: capped
  c.expect(r({ id: 'aca400', ret: 'H', side: 'under' }, T([line('aca400', 'H', 100000)], { preMagi: 60000, convertible: 25000 }))).toBe(25000);
});

it('convLineTargets: the ceilings under, the ACA floor over, senior and ctc dropped', async () => {
  const w = await world();
  const { convLineTargets } = await w.load('shared/core/withdrawals/conversion-targets.js');
  const lines = [
    line('medicaid', 'H', 20000), line('acaFloor', 'H', 21000), line('senior', 'H', 75000), line('aca400', 'H', 84000),
    line('ctc', 'H', 200000), line('irmaa1', 'B', 210000), line('irmaa5', 'H', 750000),
  ];
  c.expect(convLineTargets(lines, LINE_IDS)).toStrictEqual([
    { id: 'medicaid', ret: 'H', side: 'under' },
    { id: 'acaFloor', ret: 'H', side: 'over' },
    { id: 'aca400', ret: 'H', side: 'under' },
    { id: 'irmaa1', ret: 'B', side: 'under' },
    { id: 'irmaa5', ret: 'H', side: 'under' },
  ]);
  c.expect(convLineTargets([], LINE_IDS)).toStrictEqual([]);
});

it('pickConvTarget: the running best starts at the bracket target, and only a score higher by more than $1 replaces it', async () => {
  const w = await world();
  const { pickConvTarget } = await w.load('shared/core/withdrawals/conversion-targets.js');
  const k = (target, amt, score, dropped = false) => ({ target, c: amt, score, dropped });
  // none, the bracket and b12 all score 0: the bracket stands (no longer the smaller amount, none)
  c.expect(pickConvTarget([k('none', 0, 0), k(null, 5000, 0), k('b12', 9000, 0)])).toBe(1);
  // b12 higher by exactly $1: the bracket stands; by $1.01: b12
  c.expect(pickConvTarget([k('none', 0, 0), k(null, 5000, 0), k('b12', 9000, 1)])).toBe(1);
  c.expect(pickConvTarget([k('none', 0, 0), k(null, 5000, 0), k('b12', 9000, 1.01)])).toBe(2);
  // a dropped bracket entry still starts the best: a tie keeps it, a win by more than $1 replaces it
  c.expect(pickConvTarget([k('none', 0, 0), k(null, 5000, 0, true), k('b12', 9000, 0)])).toBe(1);
  c.expect(pickConvTarget([k('none', 0, 0), k(null, 5000, 0, true), k('b12', 9000, 2)])).toBe(2);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(21);
});
