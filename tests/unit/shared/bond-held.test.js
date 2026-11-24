// planBondLadder's year-0 window and bridge target, fillSplit, and placeHeldReserve (a reserve held from the start: a relabel, no tax).
import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const require = createRequire(import.meta.url);
const { legacyToAccounts } = require('../../legacy_balances.js');

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

// The engines (Task 1.3): a year-0 retiree, or a 'held' plan, holds the reserve from the start (placed before year 0's
// growth, a relabel); a 'build' plan retiring later still ramps it over the window. The runner() pattern of
// maintained-reserve.test.js: a single retiree at 61, bondYears 4, bonds 0%.
async function runner() {
  const w = await world();
  const isUS = w.country === 'us';
  const st = await w.setState();
  const e = await engine(w);
  const { scenarioMarketPath } = await w.load('shared/core/projection/scenario-source.js');
  const baseState = JSON.parse(JSON.stringify(st));
  const load = (patch) => {
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, JSON.parse(JSON.stringify(baseState)), isUS ? legacyToAccounts(patch, baseState) : patch);
  };
  const run = (patch) => (load(patch), e.simulateRaw());
  const rowsOf = (res) => res.rows.map((r) => ({ age: r.age, bonds: r.bonds, target: (r.expenses - r.lumpExpense) * 4 }));
  const household = {
    singlePerson: true, ageA: 61, retireAgeA: 61, lifeExpectancyA: 85,
    taxable: 2000000, traditional: 600000, roth: 300000, cash: 40000,
    spending: 70000, bondYears: 4, bondReturn: 0, inflation: 3,
    ...(isUS ? { stateTax: 'tx' } : { province: 'on' }),
  };
  return { isUS, run, rowsOf, household, st, scenarioMarketPath };
}
// Within a millionth of the target (maintained-reserve.test.js's own check).
const atTarget = (r) => Math.abs(r.bonds - r.target) <= 1e-6 * r.target;

it('a year-0 retiree holds the reserve at its maintained target from year 0 (standard mode)', async () => {
  const { run, rowsOf, household } = await runner();
  const rows = rowsOf(run(household));
  expect(atTarget(rows[0])).toBe(true);
  expect(rows.filter((r) => !atTarget(r))).toStrictEqual([]);
});

it('a year-0 retiree under a crash at retirement: the fall hits the stocks only, and no fall year moves stock into bonds', async () => {
  const { run, rowsOf, household, st, scenarioMarketPath } = await runner();
  const crash = { kind: 'crash', order: 'bucket', crashes: [{ age: 61, drop: 50, fallYears: 2, recoverPct: 100, recoverYears: 4, inflation: 0, bondReturn: 0 }] };
  const rows = rowsOf(run({ ...household, marketScenario: crash }));
  // One year's expenses drawn at most (cash pays first): 3 of the 4 reserve years are still there at the end of year 0.
  expect(rows[0].bonds >= rows[0].target * (3 / 4)).toBe(true);
  // The scenario's stock returns, from its own index: the fall years (a negative return) must not raise the bonds.
  const { scenario } = scenarioMarketPath(st);
  const fall = [];
  for (let t = 0; t + 1 < scenario.length; t++) if (scenario[t + 1] < scenario[t]) fall.push(t);
  expect(fall).toStrictEqual([0, 1]);
  const res = run({ ...household, marketScenario: crash });
  // Year 0's bonds against the placed reserve (bonds earn 0%), each later fall year against the year before.
  expect(rows[0].bonds <= res.ladderTarget).toBe(true);
  for (const t of fall) if (t > 0) expect(rows[t].bonds <= rows[t - 1].bonds).toBe(true);
});

it("bondStart 'held', retiring in 10 years: the reserve is placed once and sits untouched through the working years", async () => {
  const { run, household } = await runner();
  const res = run({ ...household, ageA: 51, incomeA: 150000, bondStart: 'held' });
  const before = res.rows.slice(0, 10);
  expect(before.length).toBe(10);
  expect(res.ladderTarget > 0).toBe(true);
  expect(before.filter((r) => r.bonds !== res.ladderTarget).map((r) => [r.age, r.bonds])).toStrictEqual([]);
});

it("bondStart 'build', retiring in 3 years: year 0 holds a third of the ladder target (the ramp)", async () => {
  const { run, household } = await runner();
  const res = run({ ...household, ageA: 58, incomeA: 150000, bondStart: 'build' });
  // The window is years 0-2 (3 years available for 4 bond years): progress (0 - 0 + 1) / 3, the engine's own expression.
  expect(res.rows[0].bonds).toBe(res.ladderTarget * ((0 - 0 + 1) / 3));
});
