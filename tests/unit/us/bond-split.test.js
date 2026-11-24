// The retirement bond reserve's traditional/Roth split (bondTradPct, US): fillSplit, refillBondReserve's tradShare and the held engine placement.
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
  taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0,
  traditional: 1000, roth: 1000, cash: 0, home: 0, mortgage: 0, ...o,
});
// The withdrawal object the refill takes; the taxable step is not reached unless a case wants it (it needs a context and profile then).
const wdOf = async (w, b) => ({ bal: b, ctx: await w.ctx(), profile: { wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 55, ageB: 55, singlePerson: true, filing: 'single' }, taxableGainGross: 0, traditionalGross: 0, saleForTax: 0 });

it('fillSplit where Roth can cover the rest: traditional to the want, Roth for the rest, nothing left', async () => {
  const { fillSplit } = await load();
  const b = bal({ traditional: 300, roth: 400 });
  expect(fillSplit(b, 500, 100)).toBe(0);
  expect(b.bondTraditional).toBe(100);
  expect(b.bondRoth).toBe(400);
  expect(b.traditional).toBe(200);
  expect(b.roth).toBe(0);
});

it('refillBondReserve at tradShare 0.8: four parts traditional to one part Roth', async () => {
  const w = await world();
  const { refillBondReserve } = await w.load('shared/core/withdrawals/bond-ladder.js');
  const b = bal();
  refillBondReserve(await wdOf(w, b), 500, { tradShare: 0.8 });
  expect(b.bondTraditional).toBe(400);
  expect(b.bondRoth).toBe(100);
  expect(b.traditional).toBe(600);
  expect(b.roth).toBe(900);
});

it('refillBondReserve at tradShare 0.8 with only 50 of Roth: the overflow goes back to traditional', async () => {
  const w = await world();
  const { refillBondReserve } = await w.load('shared/core/withdrawals/bond-ladder.js');
  const b = bal({ roth: 50 });
  refillBondReserve(await wdOf(w, b), 500, { tradShare: 0.8 });
  expect(b.bondTraditional).toBe(450);
  expect(b.bondRoth).toBe(50);
  expect(b.traditional).toBe(550);
  expect(b.roth).toBe(0);
});

it('refillBondReserve with no retirement money: the taxable last resort is as before', async () => {
  const w = await world();
  w.setTaxYear(2026);
  await w.setState();
  const { refillBondReserve } = await w.load('shared/core/withdrawals/bond-ladder.js');
  const b = bal({ traditional: 0, roth: 0, taxable: 1000, taxableBasis: 1000 });
  refillBondReserve(await wdOf(w, b), 500, { tradShare: 0.8 });
  expect(b.bondTraditional).toBe(0);
  expect(b.bondRoth).toBe(0);
  // The taxable sale is solved to net the ask (the helper's own tolerance, written out): within a thousandth of a dollar.
  expect(Math.abs(b.bondTaxable - 500) <= 1e-3).toBe(true);
  expect(b.taxable > 0 && b.taxable < 1000).toBe(true);
});

it('the default share (1) is the old order: traditional first, then Roth', async () => {
  const w = await world();
  const { refillBondReserve } = await w.load('shared/core/withdrawals/bond-ladder.js');
  const b = bal({ traditional: 300 });
  refillBondReserve(await wdOf(w, b), 500);
  expect(b.bondTraditional).toBe(300);
  expect(b.bondRoth).toBe(200);
});

it('a held year-0 retiree at bondTradPct 80: the buckets keep four parts traditional to one part Roth through the same-year trim', async () => {
  const w = await world();
  w.setTaxYear(2026);
  const st = await w.setState();
  const e = await engine(w);
  const base = JSON.parse(JSON.stringify(st));
  for (const k of Object.keys(st)) delete st[k];
  const patch = {
    singlePerson: true, ageA: 61, retireAgeA: 61, lifeExpectancyA: 85, taxable: 2000000, traditional: 900000, roth: 900000,
    cash: 40000, spending: 70000, bondYears: 5, bondReturn: 0, inflation: 3, stateTax: 'tx', bondStart: 'held', bondTradPct: 80,
  };
  Object.assign(st, base, legacyToAccounts(patch, base));
  const r = e.accountTrace()[0];
  expect(r.bondTraditional > 0 && r.bondRoth > 0).toBe(true);
  expect(r.bondTaxable).toBe(0);
  // The tolerance is written out: the pro rata trim and the equal growth keep the ratio up to rounding.
  expect(Math.abs(r.bondTraditional - 4 * r.bondRoth) <= 1e-9 * r.bondTraditional).toBe(true);
});

// A single retiree plan through the store's own context; returns the runProjection result and the year trace (standard mode).
async function run(patch) {
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
  const result = runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB, trace });
  return { result, trace };
}
const retiree = (over = {}) => ({
  singlePerson: true, ageA: 61, retireAgeA: 61, lifeExpectancyA: 80, taxable: 2000000, traditional: 900000, roth: 900000,
  cash: 40000, spending: 70000, bondYears: 5, bondReturn: 0, inflation: 3, stateTax: 'tx', bondStart: 'held', bondTradPct: 80, ...over,
});

it('bondSplitHeld: 80 with ample Roth, 100 when there is no Roth to hold the other share, null with no reserve', async () => {
  expect((await run(retiree())).result.bondSplitHeld).toBe(80);
  expect((await run(retiree({ roth: 0 }))).result.bondSplitHeld).toBe(100);
  expect((await run(retiree({ bondYears: 0 }))).result.bondSplitHeld).toBe(null);
});

it('bondSplitHeld is the split at the fill, before any draw, for a build plan too (year rotationEndYear)', async () => {
  const { result, trace } = await run(retiree({ ageA: 55, retireAgeA: 60, incomeA: 120000, bondStart: 'build' }));
  expect(result.bondSplitHeld).toBe(80);
  const r = trace[4];
  expect(r.bondTraditional > 0 && r.bondRoth > 0).toBe(true);
  // The build window's fills keep the 80/20 split (equal growth, so the ratio holds up to rounding; the tolerance is written out).
  expect(Math.abs(r.bondTraditional - 4 * r.bondRoth) <= 1e-6 * r.bondTraditional).toBe(true);
  // With no Roth to hold the 20, the build reports the 100 it could fill.
  expect((await run(retiree({ ageA: 55, retireAgeA: 60, incomeA: 120000, bondStart: 'build', roth: 0 }))).result.bondSplitHeld).toBe(100);
});

it('a withdrawal-year refill at 80 places the shortfall four parts traditional to one part Roth', async () => {
  const { trace } = await run(retiree({ bondStart: 'held' }));
  // Inflation lifts the target each year (bondReturn 0), so years 1-3 refill from stocks: the reserve grows and keeps the split.
  expect(trace[3].bondTraditional > trace[0].bondTraditional * 1.05).toBe(true);
  expect(Math.abs(trace[3].bondTraditional - 4 * trace[3].bondRoth) <= 1e-6 * trace[3].bondTraditional).toBe(true);
});

it('no Roth money at 80/20: bondRoth stays 0 every year; with conversions on it rises only once a conversion makes Roth money', async () => {
  const off = await run(retiree({ roth: 0 }));
  // The account balances carry a 0.002 rounding residue of Roth from the legacy conversion (not real money): the tolerance is written out.
  expect(off.trace.every((r) => r.bondRoth < 0.01)).toBe(true);
  const on = await run(retiree({ roth: 0, rothConvEnabled: true, rothConvStartAge: 62, rothConvEndAge: 63 }));
  // No refill or trim moves traditional money into Roth to restore the split: the reserve's Roth stays at the residue until a
  // conversion creates Roth money (year 1 here), and only from then on can the refills hold some (the converted money, grown).
  const firstConv = on.trace.findIndex((r) => r.conversionAmount > 0);
  expect(firstConv).toBe(1);
  expect(on.trace.slice(0, firstConv).every((r) => r.bondRoth < 0.01)).toBe(true);
  expect(on.trace[firstConv].bondRoth > 1000).toBe(true);
});

it('bondTradPct normalizes: a blank, null or non-number is 100, a number is rounded and clamped to 0-100', async () => {
  for (const [given, want] of [['', 100], [null, 100], ['abc', 100], [undefined, 100], [80.4, 80], [-5, 0], [250, 100], ['60', 60]]) {
    const w = await world();
    w.setTaxYear(2026);
    const st = await w.setState({ bondTradPct: given });
    expect(st.bondTradPct).toBe(want);
  }
});
