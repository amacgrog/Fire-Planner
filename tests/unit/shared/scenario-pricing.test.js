// The scenario factor path, the cumFactor a scenario row carries, pricingContextFor, and the objectives' per-row divisor.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const crashAt = (age, o = {}) => ({ kind: 'crash', order: 'bucket', crashes: [{ age, drop: 30, fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 8, bondReturn: 4, ...o }] });

async function setup() {
  const w = await world();
  const store = await w.load('shared/core/store.js');
  await w.setState({ inflation: 2.5 });
  const { runSourceFor, pricingContextFor } = await w.load('shared/core/projection/run-source.js');
  const { scenarioFactorPath } = await w.load('shared/core/projection/scenario-source.js');
  const { runProjection } = await w.load(w.country + '/core/projection/run-projection.js');
  const CRASH = crashAt(store.state.ageA + 2);
  const runOf = async () => {
    const run = runSourceFor(await w.ctx());
    const sim = runProjection(run.ctx, { mode: run.mode, source: run.source, retireAgeA: run.ctx.inputs.retireAgeA, retireAgeB: run.ctx.inputs.retireAgeB });
    return { run, sim };
  };
  return { w, store, CRASH, runSourceFor, pricingContextFor, scenarioFactorPath, runOf };
}

it('factor path matches the run', async () => {
  const S = await setup();
  await S.w.setState({ inflation: 2.5, marketScenario: S.CRASH });
  const { run, sim } = await S.runOf();
  expect(run.ctx.taxFactors.length).toBe(256);
  expect(sim.rows.length > 5).toBe(true);
  for (const r of sim.rows) expect(r.cumFactor).toBe(run.ctx.taxFactors[r.year]);
  expect(S.scenarioFactorPath(run.ctx.inputs)).toStrictEqual(run.ctx.taxFactors);
});

it('hand-computed path', async () => {
  const S = await setup();
  await S.w.setState({ inflation: 2.5, marketScenario: S.CRASH });
  const path = S.scenarioFactorPath((await S.w.ctx()).inputs);
  expect(path[0]).toBe(1);
  expect(path[1]).toBe(1.025);
  expect(path[2]).toBe(1.050625);
  expect(path[3]).toBe(1.1346749999999999);
  expect(path[4]).toBe(1.225449);
});

it('standard rows have no cumFactor, and pricingContextFor leaves a standard ctx alone', async () => {
  const S = await setup();
  const ctx = await S.w.ctx();
  const run = S.runSourceFor(ctx);
  const { runProjection } = await S.w.load(S.w.country + '/core/projection/run-projection.js');
  const sim = runProjection(run.ctx, { mode: run.mode, source: run.source, retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB });
  expect(sim.rows.length > 0).toBe(true);
  for (const row of sim.rows) expect(Object.hasOwn(row, 'cumFactor')).toBe(false);
  expect(S.pricingContextFor(ctx)).toBe(ctx);
});

it('pricing context', async () => {
  const S = await setup();
  await S.w.setState({ inflation: 2.5, marketScenario: S.CRASH });
  const ctx = await S.w.ctx();
  const p = S.pricingContextFor(ctx);
  expect(p !== ctx).toBe(true);
  expect(p.taxFactors).toStrictEqual(S.scenarioFactorPath(ctx.inputs));
  for (const k of Object.keys(ctx)) if (k !== 'taxFactors') expect(p[k]).toBe(ctx[k]);
  expect(Object.keys(p)).toStrictEqual(Object.keys(ctx));
  expect(ctx.taxFactors).toBe(null);
  // a context that already carries its path is returned as itself
  const own = await S.w.ctx({ taxFactors: [1, 1.1] });
  expect(S.pricingContextFor(own)).toBe(own);
  await S.w.setState({ inflation: 2.5 });
  const ownOff = await S.w.ctx({ taxFactors: [1, 1.1] });
  expect(S.pricingContextFor(ownOff)).toBe(ownOff);
});

it('realCost uses the row factor (US)', async () => {
  const S = await setup();
  if (S.w.country !== 'us') return;
  const { US_OBJECTIVES } = await S.w.load('us/core/optimizer/objectives.js');
  const ctx = await S.w.ctx();
  const row = (year, extra = {}) => ({ year, tax: 100, healthcare: 0, ...extra });
  expect(US_OBJECTIVES.lifetimeCost.value(ctx, { rows: [row(0), row(1, { cumFactor: 2 })] })).toBe(150);
  expect(US_OBJECTIVES.lifetimeCost.value(ctx, { rows: [row(0), row(1)] })).toBe(197.5609756097561);
});
