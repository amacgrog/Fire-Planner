// runSourceFor, the run choke point: without a market scenario every normal run is today's run (the same context, the
// standard mode and source); with one, a fresh context with its own tax factors, the scenario's mode and the scenario source.
// The historical and Monte Carlo views ignore the scenario (their seed and their cache key leave it out).
import { it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { world } from '../helpers/world.js';

// Task 2 test A's crash (75% over two years, a full recovery over two), two years from now. Its 100% inflation is clamped
// to the normalizer's 30% ceiling, so the literal says 30.
const crashAt = (age, o = {}) => ({ kind: 'crash', order: 'bucket', crashes: [{ age, drop: 75, fallYears: 2, recoverPct: 100, recoverYears: 2, inflation: 30, bondReturn: 20, ...o }] });

async function setup() {
  const w = await world();
  const store = await w.load('shared/core/store.js');
  await w.setState({});
  const CRASH = crashAt(store.state.ageA + 2);
  const { runSourceFor } = await w.load('shared/core/projection/run-source.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { scenarioYearSource, scenarioFactorPath } = await w.load('shared/core/projection/scenario-source.js');
  const { STANDARD_MODE, BUCKET_MODE } = await w.load(w.country + '/core/projection/year-modes.js');
  const { runProjection } = await w.load(w.country + '/core/projection/run-projection.js');
  const runs = await w.load('shared/core/projection/runs.js');
  const sim = await w.load('shared/core/projection/simulate.js');
  return { w, store, CRASH, runSourceFor, standardYearSource, scenarioYearSource, scenarioFactorPath, STANDARD_MODE, BUCKET_MODE, runProjection, runs, sim };
}

it('without a scenario: the same ctx, STANDARD_MODE, a standard source', async () => {
  const S = await setup();
  const ctx = await S.w.ctx();
  expect('marketScenario' in ctx.inputs).toBe(false);
  const r = S.runSourceFor(ctx);
  expect(r.ctx).toBe(ctx);
  expect(r.mode).toBe(S.STANDARD_MODE);
  expect(r.source.yearInputs(3)).toStrictEqual(S.standardYearSource(ctx.inputs).yearInputs(3));
  expect(r.source.inflation).toBe(S.standardYearSource(ctx.inputs).inflation);
});

it('with a scenario: a fresh context with its own taxFactors, the bucket mode by default', async () => {
  const S = await setup();
  await S.w.setState({ marketScenario: S.CRASH });
  const ctx = await S.w.ctx();
  expect(ctx.inputs.marketScenario).toStrictEqual(S.CRASH);
  const r = S.runSourceFor(ctx);
  expect(r.ctx !== ctx).toBe(true);
  expect(r.ctx.taxFactors).toStrictEqual(S.scenarioFactorPath(ctx.inputs));
  expect(Object.keys(r.ctx)).toStrictEqual(Object.keys(ctx));
  for (const k of Object.keys(ctx)) if (k !== 'taxFactors') expect(r.ctx[k]).toBe(ctx[k]);
  expect(r.mode).toBe(S.BUCKET_MODE);
  const r2 = S.runSourceFor(ctx);
  expect(r2.ctx.taxFactors !== r.ctx.taxFactors).toBe(true);
  // the source records into the new context's array, never into the caller's
  r.source.yearInputs(0);
  expect(r.ctx.taxFactors.length).toBe(256);
  expect(r.ctx.taxFactors[0]).toBe(1);
  expect(ctx.taxFactors).toBe(null);
});

it('order "standard" picks STANDARD_MODE', async () => {
  const S = await setup();
  await S.w.setState({ marketScenario: { ...S.CRASH, order: 'standard' } });
  const r = S.runSourceFor(await S.w.ctx());
  expect(r.mode).toBe(S.STANDARD_MODE);
  expect(r.ctx.taxFactors).toStrictEqual(S.scenarioFactorPath(r.ctx.inputs));
});

it('simulateWith on a scenario equals the explicit scenario run', async () => {
  const S = await setup();
  await S.w.setState({ marketScenario: S.CRASH });
  const got = S.runs.simulateWith(await S.w.ctx());
  const c1 = await S.w.ctx(),
    c2 = await S.w.ctx({ taxFactors: S.scenarioFactorPath(c1.inputs) });
  const want = S.runProjection(c2, { mode: S.BUCKET_MODE, source: S.scenarioYearSource(c2.inputs, c2.taxFactors), retireAgeA: c2.inputs.retireAgeA, retireAgeB: c2.inputs.retireAgeB });
  expect(got.rows).toStrictEqual(want.rows);
  expect(got.depletedAge).toBe(want.depletedAge);
  // the account-log run goes through the choke point too
  const logged = S.runs.simulateWithAccountLog(await S.w.ctx());
  expect(logged.sim.rows).toStrictEqual(want.rows);
});

it('a scenario changes the projection; without it simulateWith is unchanged', async () => {
  const S = await setup();
  const off = S.runs.simulateWith(await S.w.ctx());
  const off2 = S.runs.simulateWith(await S.w.ctx());
  expect(off2.rows).toStrictEqual(off.rows);
  await S.w.setState({ marketScenario: S.CRASH });
  const on = S.runs.simulateWith(await S.w.ctx());
  expect(on.rows.length).toBe(off.rows.length);
  expect(on.rows.some((row, i) => row.total !== off.rows[i].total)).toBe(true);
});

it('the Monte Carlo seed and the Monte Carlo result ignore the scenario for a fixed plan', async () => {
  const S = await setup();
  const s = S.store.state;
  expect(S.sim.monteCarloSeed(2026, 100, s)).toBe(S.sim.monteCarloSeed(2026, 100, { ...s, marketScenario: S.CRASH }));
  const cOff = await S.w.ctx();
  const mcOff = S.sim.monteCarloSummaryWith(cOff, 2);
  await S.w.setState({ marketScenario: S.CRASH });
  const cOn = await S.w.ctx();
  expect(cOn.inputs.marketScenario).toStrictEqual(S.CRASH);
  // the same cached object: successKey leaves the scenario out
  expect(S.sim.monteCarloSummaryWith(cOn, 2)).toBe(mcOff);
});

it('with order "standard", the rows before the crash equal the no-scenario rows', async () => {
  const S = await setup();
  const off = S.runs.simulateWith(await S.w.ctx());
  await S.w.setState({ marketScenario: { ...crashAt(S.store.state.ageA + 5, { inflation: 2.5 }), order: 'standard' } });
  const on = S.runs.simulateWith(await S.w.ctx());
  // the scenario's rows also carry cumFactor (the plan's own factor until the crash)
  const first5 = on.rows.slice(0, 5).map((row) => {
    const { cumFactor, ...rest } = row;
    return rest;
  });
  expect(first5).toStrictEqual(off.rows.slice(0, 5));
  expect(on.rows.slice(0, 5).map((row) => row.cumFactor)).toStrictEqual([1, 1.025, 1.050625, 1.0768906249999997, 1.1038128906249995]);
  // and the crash year itself differs
  expect(on.rows[5].total !== off.rows[5].total).toBe(true);
});

// The source files read as text (as tests/unit/helpers/historical-parity.js reads src/): no module but the year sources and the
// choke point calls standardYearSource, so no normal run can skip the scenario.
const srcDir = fileURLToPath(new URL('../../../src/', import.meta.url));
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
it('the choke point stays the choke point', () => {
  const callers = [];
  for (const p of walk(srcDir)) {
    const lines = readFileSync(p, 'utf8').split('\n');
    // a call: the name followed by "(", outside a `//` comment (a definition is `function standardYearSource(`)
    const calls = lines.some((l) => {
      const code = l.replace(/\/\/.*$/, '');
      return /\bstandardYearSource\(/.test(code) && !/\bfunction\s+standardYearSource\(/.test(code);
    });
    if (calls) callers.push(relative(srcDir, p).split(sep).join('/'));
  }
  expect(callers.sort()).toStrictEqual(['shared/core/projection/run-source.js']);
});
