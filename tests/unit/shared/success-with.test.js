// The Monte Carlo seed ignores the stored plan, so saving a plan never changes the paths (Batch 5 step 4a).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

it('monteCarloSeed leaves out storedPlan', async () => {
  const w = await world();
  const s = await w.setState({});
  const { monteCarloSeed } = await w.load('shared/core/projection/simulate.js');
  const X = { v: 1, anything: [1, 2] };
  expect(monteCarloSeed(2026, 500, { ...s, storedPlan: X })).toBe(monteCarloSeed(2026, 500, s));
  expect(monteCarloSeed(2026, 500, { ...s, storedPlan: null })).toBe(monteCarloSeed(2026, 500, s));
});
