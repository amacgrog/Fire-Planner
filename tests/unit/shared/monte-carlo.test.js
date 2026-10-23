// Monte Carlo is seeded from the inputs: the FNV-1a hash, the seed's canonical form, and run-to-run repeatability.
import { it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';

const isUS = inject('country') === 'us';
const SIM = 'shared/core/projection/simulate.js';

async function pathTotals() {
  const w = await world();
  await w.setState(isUS ? { cliffGuardEnabled: false } : {});
  const sim = await w.load(SIM);
  const mc = sim.runMonteCarlo(20);
  return { totals: mc.paths.map((p) => p.rows.map((r) => r.total)), rate: mc.successRate };
}

const reverseKeys = (o) => Object.fromEntries(Object.keys(o).reverse().map((k) => [k, o[k]]));

it('fnv1a32 matches the published test vectors', async () => {
  const w = await world();
  const { fnv1a32 } = await w.load(SIM);
  expect(fnv1a32('')).toBe(2166136261);
  expect(fnv1a32('a')).toBe(3826002220);
  expect(fnv1a32('foobar')).toBe(3214735720);
});

it('the same inputs give the same paths in two worlds', async () => {
  const a = await pathTotals();
  const b = await pathTotals();
  expect(a.totals.length).toBe(20);
  expect(b.totals).toStrictEqual(a.totals);
  expect(b.rate).toBe(a.rate);
});

it('key order does not change the seed', async () => {
  const w = await world();
  const store = await w.load('shared/core/store.js');
  const { monteCarloSeed } = await w.load(SIM);
  const s = await w.setState({});
  store.assignState(reverseKeys(s));
  expect(monteCarloSeed(2026, 20, store.state)).toBe(monteCarloSeed(2026, 20, s));
});

it('key order inside a list row does not change the seed', async () => {
  const w = await world();
  const store = await w.load('shared/core/store.js');
  const { monteCarloSeed } = await w.load(SIM);
  const s = await w.setState({ children: [{ birthYear: 2020 }] });
  expect(s.children.length).toBe(1);
  const r = { ...s, children: s.children.map(reverseKeys) };
  store.assignState(r);
  expect(monteCarloSeed(2026, 20, store.state)).toBe(monteCarloSeed(2026, 20, s));
});

it('dismissed warnings do not change the seed', async () => {
  const w = await world();
  const { monteCarloSeed } = await w.load(SIM);
  const s = await w.setState({});
  const t = { ...s, dismissedEstimates: ['x'], dismissedUnusualAssumptions: ['y'] };
  expect(monteCarloSeed(2026, 20, t)).toBe(monteCarloSeed(2026, 20, s));
});

it('each input changes the seed', async () => {
  const w = await world();
  const { monteCarloSeed } = await w.load(SIM);
  const s = await w.setState({});
  const base = monteCarloSeed(2026, 20, s);
  expect(monteCarloSeed(2026, 20, { ...s, spending: s.spending + 1000 })).not.toBe(base);
  expect(monteCarloSeed(2026, 21, s)).not.toBe(base);
  if (isUS) expect(monteCarloSeed(2027, 20, s)).not.toBe(base);
});

it('the seed is a uint32', async () => {
  const w = await world();
  const { monteCarloSeed } = await w.load(SIM);
  const s = await w.setState({});
  const seed = monteCarloSeed(2026, 20, s);
  expect(Number.isInteger(seed) && seed >= 0 && seed < 4294967296).toBe(true);
});
