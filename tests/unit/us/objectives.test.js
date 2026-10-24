// The US objective registry (src/us/core/optimizer/objectives.js): the two objectives, the breakdown, the gain, and that
// the endTaxUS split of afterTaxEndValueUS is byte-identical to the old formula.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { usOptimizer } from '../helpers/us-plan.js';
import { ACA_CLIFF } from '../helpers/multi-lever.js';

const NEW_COUNT = 75;
const c = makeCounter();
const SLOW = 120000;

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const synth = (roth = 100, tax0 = 1000) => ({
  rows: [{ year: 0, tax: tax0, healthcare: 500, rmd: 0 }, { year: 1, tax: 2000, healthcare: 0, rmd: 3000 }],
  depletedAge: null,
  estate: { traditional: 0, roth, taxable: 200, cash: 50, homeEquity: 1000, profile: {}, lastGain: 0, lastTrad: 0 },
});

async function load() {
  const w = await world();
  const m = await w.load('us/core/optimizer/objectives.js');
  return { w, m };
}

it('synthetic sim at inflation 25', async () => {
  const { w, m } = await load();
  await w.setState({ inflation: 25 });
  const ctx = await w.ctx();
  const sim = synth();
  c.expect(m.US_OBJECTIVES.lifetimeCost.value(ctx, sim)).toBe(3100);
  c.expect(m.objectiveBreakdown(ctx, sim)).toStrictEqual({ lifetimeCost: 3100, lifetimeTax: 2600, healthcare: 500, rmds: 2400, endTax: 0, endValue: 1080, depletedAge: null });
  c.expect(m.US_OBJECTIVES.endValue.value(ctx, sim)).toBe(1350);
  c.expect(m.US_OBJECTIVES.endValue.score(ctx, sim)).toBe(1350);
  c.expect(m.US_OBJECTIVES.lifetimeCost.score(ctx, sim)).toBe(-3100);
  c.expect(m.US_OBJECTIVES.endValue.sense).toBe('max');
  c.expect(m.US_OBJECTIVES.lifetimeCost.sense).toBe('min');
  c.expect(m.US_OBJECTIVES.endValue.id).toBe('endValue');
  c.expect(m.US_OBJECTIVES.lifetimeCost.id).toBe('lifetimeCost');
});

it('synthetic sim at inflation 0', async () => {
  const { w, m } = await load();
  await w.setState({ inflation: 0 });
  const ctx = await w.ctx();
  const sim = synth();
  c.expect(m.US_OBJECTIVES.lifetimeCost.value(ctx, sim)).toBe(3500);
  c.expect(m.objectiveBreakdown(ctx, sim).endValue).toBe(1350);
});

it('objectiveById and the default id', async () => {
  const { m } = await load();
  c.expect(m.DEFAULT_OBJECTIVE_ID).toBe('endValue');
  c.expect(m.objectiveById('endValue')).toBe(m.US_OBJECTIVES.endValue);
  c.expect(m.objectiveById('lifetimeCost')).toBe(m.US_OBJECTIVES.lifetimeCost);
  c.expect(() => m.objectiveById('nope')).toThrow('unknown objective: nope');
  c.expect(() => m.objectiveById(undefined)).toThrow('unknown objective: undefined');
  c.expect(() => m.objectiveById('toString')).toThrow('unknown objective: toString');
});

it('gainInTodaysDollars', async () => {
  const { w, m } = await load();
  await w.setState({ inflation: 25 });
  const ctx = await w.ctx();
  c.expect(m.gainInTodaysDollars(m.US_OBJECTIVES.endValue, ctx, synth(350), synth(100))).toBe(200);
  c.expect(m.gainInTodaysDollars(m.US_OBJECTIVES.lifetimeCost, ctx, synth(100, 900), synth(100, 1000))).toBe(100);
});

const IRMAA = {
  ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, stateTax: 'ca', spending: 110000, taxable: 800000, trad401kA: 2500000, rothIraA: 200000,
};
const HOUSEHOLDS = {
  default: {},
  aca: ACA_CLIFF,
  irmaa: IRMAA,
  survivor: { ...IRMAA, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 75 },
  depleting: { retireAgeA: 50, retireAgeB: 50, spending: 120000, taxable: 400000 },
};

for (const [name, patch] of Object.entries(HOUSEHOLDS)) {
  it('rows the UI shows: ' + name, async () => {
    const w = await world();
    await w.setState(patch);
    w.setTaxYear(2026);
    const m = await w.load('us/core/optimizer/objectives.js');
    const { rowCost, rowTax } = await w.load('us/core/projection/row-cost.js');
    const { taxFor } = await w.load('us/core/tax/federal-tax.js');
    const { afterTaxEndValueUS, endTaxUS } = await w.load('us/core/cliff-plan/solver.js');
    const sim = (await usOptimizer(w)).simulate();
    const ctx = await w.ctx();
    const rows = sim.rows;
    const infl = ctx.inputs.inflation / 100;
    if (name === 'depleting') c.expect(sim.depletedAge !== null).toBe(true);
    const cost = rows.reduce((s, r) => s + rowCost(r) / Math.pow(1 + infl, r.year), 0);
    const tax = rows.reduce((s, r) => s + rowTax(r) / Math.pow(1 + infl, r.year), 0);
    const hc = rows.reduce((s, r) => s + (r.taxSettled !== undefined ? r.healthcareSettled : r.healthcare) / Math.pow(1 + infl, r.year), 0);
    const rmd = rows.reduce((s, r) => s + r.rmd / Math.pow(1 + infl, r.year), 0);
    const f = Math.pow(1 + infl, rows[rows.length - 1].year);
    const e = sim.estate;
    const oldTax = e.traditional > 0 ? Math.max(0, 10 * (taxFor(ctx, e.profile, e.lastGain, e.lastTrad + e.traditional / 10) - taxFor(ctx, e.profile, e.lastGain, e.lastTrad))) : 0;
    const end = e.roth + e.taxable + e.cash + e.homeEquity + e.traditional - oldTax;
    c.expect(m.US_OBJECTIVES.lifetimeCost.value(ctx, sim)).toBe(cost);
    c.expect(m.US_OBJECTIVES.endValue.value(ctx, sim)).toBe(end);
    const b = m.objectiveBreakdown(ctx, sim);
    c.expect(b.lifetimeCost).toBe(cost);
    c.expect(b.lifetimeTax).toBe(tax);
    c.expect(b.healthcare).toBe(hc);
    c.expect(b.rmds).toBe(rmd);
    c.expect(b.endValue).toBe(end / f);
    c.expect(b.endTax).toBe(oldTax / f);
    c.expect(b.depletedAge).toBe(sim.depletedAge);
    c.expect(endTaxUS(ctx, sim)).toBe(oldTax);
    c.expect(afterTaxEndValueUS(ctx, sim)).toBe(end);
  }, SLOW);
}
