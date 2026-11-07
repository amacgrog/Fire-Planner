// scenarioYearSource: crash and real-history year sources (hand-computed literals, plain input objects).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const B = { ageA: 50, returnRate: 50, inflation: 0, bondReturn: 4 };
const crash = (o) => ({ age: 50, drop: 50, fallYears: 1, recoverPct: 0, recoverYears: 1, inflation: 0, bondReturn: 4, ...o });
const withCrashes = (base, crashes) => ({ ...base, marketScenario: { kind: 'crash', order: 'bucket', crashes } });
const withHistory = (base, history) => ({ ...base, marketScenario: { kind: 'history', order: 'bucket', history } });

async function run(inputs, n) {
  const w = await world();
  const { scenarioYearSource } = await w.load('shared/core/projection/scenario-source.js');
  const tf = [];
  const src = scenarioYearSource(inputs, tf);
  const out = [];
  for (let y = 0; y < n; y++) {
    out.push(src.yearInputs(y));
    src.endOfYear();
  }
  return { src, tf, out };
}
const col = (out, k) => out.map((o) => o[k]);

it('A: a full recovery lands back on the plan line; plan-rate years are exactly the plan rate', async () => {
  const inputs = withCrashes(B, [crash({ age: 52, drop: 75, fallYears: 2, recoverPct: 100, recoverYears: 2, inflation: 100, bondReturn: 20 })]);
  const { tf, out } = await run(inputs, 7);
  expect(col(out, 'stockReturn')).toStrictEqual([0.5, 0.5, -0.25, -0.25, 2, 2, 0.5]);
  expect(col(out, 'bondReturn')).toStrictEqual([0.04, 0.04, 0.2, 0.2, 0.04, 0.04, 0.04]);
  expect(col(out, 'bondYield')).toStrictEqual([0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04]);
  expect(col(out, 'factor')).toStrictEqual([1, 1, 1, 2, 4, 4, 4]);
  expect(tf).toStrictEqual([1, 1, 1, 2, 4, 4, 4]);
  expect(col(out, 'limitFactor')).toStrictEqual(col(out, 'factor'));
});

it('B: 0% recovery is permanent; the recovery years change nothing', async () => {
  for (const recoverYears of [1, 3, 30]) {
    const inputs = withCrashes({ ...B, returnRate: 0 }, [crash({ recoverYears })]);
    const { out } = await run(inputs, 6);
    expect(col(out, 'stockReturn')).toStrictEqual([-0.5, 0, 0, 0, 0, 0]);
  }
});

it('C: a partial recovery closes that share of the gap and stays there', async () => {
  const inputs = withCrashes({ ...B, returnRate: 0 }, [crash({ drop: 75, recoverPct: 50 })]);
  const { out } = await run(inputs, 4);
  expect(col(out, 'stockReturn')).toStrictEqual([-0.75, 1.5, 0, 0]);
  expect(out.reduce((p, o) => p * (1 + o.stockReturn), 1)).toBe(0.625);
});

it('D: crashes stack and the stock path does not depend on list order', async () => {
  const X = crash({});
  const Y = { ...X, age: 51 };
  const a = await run(withCrashes({ ...B, returnRate: 0 }, [X, Y]), 3);
  const b = await run(withCrashes({ ...B, returnRate: 0 }, [Y, X]), 3);
  expect(col(a.out, 'stockReturn')).toStrictEqual([-0.5, -0.5, 0]);
  expect(col(b.out, 'stockReturn')).toStrictEqual([-0.5, -0.5, 0]);
});

it('D2: in overlapping fall years the later-listed crash sets inflation and bonds', async () => {
  const X = crash({ age: 50, fallYears: 2, inflation: 10, bondReturn: -10, drop: 10 });
  const Y = crash({ age: 51, fallYears: 1, inflation: 20, bondReturn: 5, drop: 10 });
  const a = await run(withCrashes(B, [X, Y]), 3);
  expect(a.out[1].bondReturn).toBe(0.05);
  expect(a.out[2].factor).toBe((1 + 0.1) * (1 + 0.2));
  const b = await run(withCrashes(B, [Y, X]), 3);
  expect(b.out[1].bondReturn).toBe(-0.1);
});

it('E: a crash age already past starts in year 0', async () => {
  const { out } = await run(withCrashes({ ...B, returnRate: 0 }, [crash({ age: 45 })]), 2);
  expect(out[0].stockReturn).toBe(-0.5);
});

const F = { ageA: 50, returnRate: 7, inflation: 0, bondReturn: 4 };

it('F: real history from an age, then the plan rates after the data ends', async () => {
  const { out } = await run(withHistory(F, { startYear: 2008, atAge: 52, endAge: null }), 21);
  for (const y of [0, 1, 20]) {
    expect(out[y].stockReturn).toBe(0.07);
    expect(out[y].bondReturn).toBe(0.04);
    expect(out[y].bondYield).toBe(0.04);
  }
  expect(out[2].stockReturn).toBe(-36.55 / 100);
  expect(out[2].bondReturn).toBe(20.1 / 100);
  expect(out[2].bondYield).toBe(4.1 / 100);
  expect(out[3].stockReturn).toBe(25.94 / 100);
  expect(out[3].bondYield).toBe(2.42 / 100);
  expect(out[3].factor).toBe(1 * (1 + 0.11 / 100));
  expect(out[19].stockReturn).toBe(17.78 / 100);
});

it('G: endAge stops the real years; endAge at or below atAge means none', async () => {
  const a = await run(withHistory(F, { startYear: 2008, atAge: 52, endAge: 53 }), 4);
  expect(a.out[2].stockReturn).toBe(-36.55 / 100);
  expect(a.out[3].stockReturn).toBe(0.07);
  for (const endAge of [52, 40]) {
    const b = await run(withHistory(F, { startYear: 2008, atAge: 52, endAge }), 4);
    expect(b.out[2].stockReturn).toBe(0.07);
  }
});

it('H: a start age already past means the window is underway', async () => {
  const { out } = await run(withHistory(F, { startYear: 2000, atAge: 48, endAge: null }), 1);
  expect(out[0].stockReturn).toBe(-21.97 / 100);
  expect(out[0].bondReturn).toBe(15.12 / 100);
  expect(out[0].bondYield).toBe(5.09 / 100);
});

it('the source has no startYear (rows keep the standard shape)', async () => {
  const { src } = await run(withCrashes(B, [crash({})]), 1);
  expect('startYear' in src).toBe(false);
  expect(src.inflation).toBe(0);
});

it('I: non-binary values: every year after the recovery is exactly the plan rate', async () => {
  const a = await run(withCrashes(F, [crash({ drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, inflation: 0.5, bondReturn: 12 })]), 13);
  for (let y = 6; y <= 12; y++) expect(a.out[y].stockReturn).toBe(0.07);
  const b = await run(withCrashes(F, [crash({ drop: 1, fallYears: 1, recoverPct: 30, recoverYears: 1 })]), 9);
  for (let y = 2; y <= 8; y++) expect(b.out[y].stockReturn).toBe(0.07);
  for (const drop of [1, 5, 10, 20, 35, 50, 65, 80, 95])
    for (const recoverPct of [0, 30, 50, 60, 100])
      for (const fallYears of [1, 2, 3])
        for (const recoverYears of [1, 2, 4, 7]) {
          const { out } = await run(withCrashes(F, [crash({ drop, fallYears, recoverPct, recoverYears })]), fallYears + recoverYears + 3);
          for (let y = fallYears + recoverYears; y < out.length; y++) expect(out[y].stockReturn).toBe(0.07);
        }
});

it('J: three crashes in any order give the identical stock path', async () => {
  const mk = (drop, age) => crash({ drop, age, fallYears: 2, recoverPct: 60, recoverYears: 3 });
  const X = mk(35, 51), Y = mk(20, 52), Z = mk(10, 53);
  const perms = [[X, Y, Z], [X, Z, Y], [Y, X, Z], [Y, Z, X], [Z, X, Y], [Z, Y, X]];
  const paths = [];
  for (const p of perms) paths.push(col((await run(withCrashes(F, p), 14)).out, 'stockReturn'));
  for (const p of paths) expect(p).toStrictEqual(paths[0]);
});

it('K: before the first off-plan year the factor is the standard pow', async () => {
  const { out, tf } = await run(withCrashes({ ...B, inflation: 2.5 }, [crash({ age: 55, inflation: 4 })]), 8);
  for (let y = 0; y <= 5; y++) expect(out[y].factor).toBe(Math.pow(1 + 2.5 / 100, y));
  expect(out[6].factor).toBe(Math.pow(1.025, 5) * (1 + 4 / 100));
  expect(out[7].factor).toBe(Math.pow(1.025, 5) * (1 + 4 / 100) * (1 + 2.5 / 100));
  expect(tf).toStrictEqual(col(out, 'factor'));
});
