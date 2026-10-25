// The Monte Carlo seed ignores the stored plan, so saving a plan never changes the paths (Batch 5 step 4a).
import { it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';

it('monteCarloSeed leaves out storedPlan', async () => {
  const w = await world();
  const s = await w.setState({});
  const { monteCarloSeed } = await w.load('shared/core/projection/simulate.js');
  const X = { v: 1, anything: [1, 2] };
  expect(monteCarloSeed(2026, 500, { ...s, storedPlan: X })).toBe(monteCarloSeed(2026, 500, s));
  expect(monteCarloSeed(2026, 500, { ...s, storedPlan: null })).toBe(monteCarloSeed(2026, 500, s));
});

// Task 6: context-taking historical and Monte Carlo success rates.
const SIM = 'shared/core/projection/simulate.js';
const isUS = inject('country') === 'us';
const usIt = isUS ? it : it.skip;
const CONVERTING = { ageA: 58, ageB: 56, retireAgeA: 58, retireAgeB: 56, incomeA: 0, incomeB: 0, trad401kA: 900000, tradIraB: 300000, taxable: 200000, cash: 40000, spending: 70000, rothConvEnabled: true, rothConvStartAge: 58, rothConvEndAge: 74, cliffGuardEnabled: true };
const CASES = isUS ? [['default', {}], ['converting', CONVERTING]] : [['default', {}]];

for (const [name, patch] of CASES) {
  it('runHistoricalCyclesWith (uncached, with the plan) equals runHistoricalCyclesFresh: ' + name, async () => {
    const w = await world();
    await w.setState(patch);
    const sim = await w.load(SIM);
    const ctx = await w.ctx({ withPlan: true });
    expect(sim.runHistoricalCyclesWith(ctx)).toStrictEqual(sim.runHistoricalCyclesFresh());
  });
  it('monteCarloSummaryWith (uncached, with the plan) matches runMonteCarlo: ' + name, async () => {
    const w = await world();
    await w.setState(patch);
    const sim = await w.load(SIM);
    const ctx = await w.ctx({ withPlan: true });
    const got = sim.monteCarloSummaryWith(ctx, 200);
    const ref = sim.runMonteCarlo(200);
    expect(got.successRate).toBe(ref.successRate);
    expect(got.survived).toBe(ref.paths.filter((p) => !p.depletedAge).length);
    expect(got.pathCount).toBe(200);
    expect(got.projectionYears).toBe(ref.projectionYears);
  });
  it('the store wrappers share the With entries: ' + name, async () => {
    const w = await world();
    await w.setState(patch);
    const sim = await w.load(SIM);
    const ctx = await w.ctx({ withPlan: true });
    expect(sim.runHistoricalCyclesWith(ctx)).toBe(sim.runHistoricalCycles());
    expect(sim.monteCarloSummaryWith(ctx, 20)).toBe(sim.monteCarloSummary(20));
  });
}

usIt('a different plan gives a different result, and the cache keeps both', async () => {
  const w = await world();
  await w.setState(CONVERTING);
  const sim = await w.load(SIM);
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const { storeContext } = await w.load('us/core/projection/store-context.js');
  const auto = await w.ctx({ withPlan: true });
  expect(auto.plan).not.toBe(null);
  const other = storeContext({ planMode: 'apply', plan: makePlan({ bracket: 22, bracketFrom: 22 }) });
  const a = sim.runHistoricalCyclesWith(auto);
  const b = sim.runHistoricalCyclesWith(other);
  expect(JSON.stringify([a.successRate, a.cycles.map((c) => c.depletedAge)])).not.toBe(JSON.stringify([b.successRate, b.cycles.map((c) => c.depletedAge)]));
  expect(sim.runHistoricalCyclesWith(auto)).toBe(a);
  expect(sim.runHistoricalCyclesWith(other)).toBe(b);
  const ma = sim.monteCarloSummaryWith(auto, 20);
  const mb = sim.monteCarloSummaryWith(other, 20);
  expect(sim.monteCarloSummaryWith(auto, 20)).toBe(ma);
  expect(sim.monteCarloSummaryWith(other, 20)).toBe(mb);
});

usIt('the stored plan is not part of the cache key', async () => {
  const w = await world();
  const s = await w.setState(CONVERTING);
  const sim = await w.load(SIM);
  const ctx = await w.ctx({ withPlan: true });
  const a = sim.runHistoricalCyclesWith(ctx);
  const ctx2 = { ...ctx, inputs: { ...s, storedPlan: { v: 1, anything: true } } };
  expect(sim.runHistoricalCyclesWith(ctx2)).toBe(a);
});
