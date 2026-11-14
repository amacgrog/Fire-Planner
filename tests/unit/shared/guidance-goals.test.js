// The guidance goal tables, the scope rules and the saved guidanceGoals field (dashboard guidance PR 2, task 1).
import { it, expect, inject, vi } from 'vitest';
import { world } from '../helpers/world.js';

const country = inject('country');
const isUS = country === 'us';
const usIt = isUS ? it : it.skip;
const FIELDS_PATH = `${country}/core/inputs/guidance-fields.js`;
const SCOPE = 'shared/core/inputs/guidance-scope.js';

it('defaults carry guidanceGoals: []', async () => {
  const w = await world();
  const { defaults } = await w.load(`${country}/core/inputs/defaults.js`);
  expect(defaults.guidanceGoals).toStrictEqual([]);
});

it('normalizeState keeps known goals in order, once each', async () => {
  const w = await world();
  const s = await w.setState({ guidanceGoals: ['legacy', 'bogus', 'retire', 'retire'] });
  expect(s.guidanceGoals).toStrictEqual(['retire', 'legacy']);
});

it('normalizeState: not a list gives []', async () => {
  const w = await world();
  for (const raw of ['retire', null, {}]) {
    const s = await w.setState({ guidanceGoals: raw });
    expect(s.guidanceGoals).toStrictEqual([]);
  }
});

it('Canada drops aca', async () => {
  const w = await world();
  const s = await w.setState({ guidanceGoals: ['aca', 'house'] });
  expect(s.guidanceGoals).toStrictEqual(isUS ? ['aca', 'house'] : ['house']);
});

it('monteCarloSeed ignores guidanceGoals', async () => {
  const w = await world();
  const s = await w.setState({});
  const { monteCarloSeed } = await w.load('shared/core/projection/simulate.js');
  const { guidanceGoals, ...noKey } = s;
  expect(monteCarloSeed(2026, 500, { ...s, guidanceGoals: ['retire'] })).toBe(monteCarloSeed(2026, 500, noKey));
  expect(monteCarloSeed(2026, 500, { ...noKey, guidanceGoals: [] })).toBe(monteCarloSeed(2026, 500, noKey));
});

usIt('storedPlanFingerprint ignores guidanceGoals', async () => {
  const w = await world();
  // plan-optimizer.js sits in the UI tree: its imports look elements up at load, so give them an empty document.
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  try {
    const { storedPlanFingerprint } = await w.load('us/ui/results/plan-optimizer.js');
    const a = storedPlanFingerprint(await w.setState({}));
    expect(storedPlanFingerprint(await w.setState({ guidanceGoals: ['retire', 'legacy'] }))).toBe(a);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('tables name real fields', async () => {
  const w = await world();
  const { defaults } = await w.load(`${country}/core/inputs/defaults.js`);
  const t = await w.load(FIELDS_PATH);
  const ids = [
    ...t.GOALS.flatMap((g) => [...g.fields, ...g.critical]),
    ...Object.values(t.IMPACT_KIND).flat(),
    ...Object.keys(t.IMPACT_BOUNDS),
    ...t.BASIC_IDS,
    ...t.NO_FIGURE,
    ...t.CHOICE_ESTIMATE_IDS,
  ];
  for (const id of ids) expect(id in defaults, id).toBe(true);
  for (const g of t.GOALS) expect(g.feature === null || typeof defaults[g.feature] === 'boolean', g.key).toBe(true);
  expect(new Set(t.GOAL_KEYS).size).toBe(t.GOAL_KEYS.length);
  const critical = new Set(t.GOALS.flatMap((g) => g.critical));
  for (const id of Object.keys(t.CRITICAL)) expect(critical.has(id), id).toBe(true);
  for (const id of critical) expect(id in t.CRITICAL, id).toBe(true);
});

it('start ages and choice ids: no figure, no kind', async () => {
  const w = await world();
  const t = await w.load(FIELDS_PATH);
  const { impactKind, impactBounds } = await w.load(SCOPE);
  for (const id of t.NO_FIGURE) expect(impactKind(id)).toBe(null);
  expect(impactKind('spending')).toBe('money');
  expect(impactKind('retireAgeA')).toBe('age');
  expect(impactKind('mortgageRate')).toBe('rate');
  expect(impactKind('basisRatio')).toBe('share');
  expect(impactBounds('mortgageYears')).toStrictEqual([1, 40]);
  expect(impactBounds('spending')).toBe(undefined);
});

it('isPartnerBId needs an A twin in the defaults', async () => {
  const w = await world();
  const { isPartnerBId } = await w.load(SCOPE);
  expect(isPartnerBId('retireAgeB')).toBe(true);
  expect(isPartnerBId('retireAgeA')).toBe(false);
  expect(isPartnerBId('spending')).toBe(false);
  expect(isPartnerBId('ZB')).toBe(false);
});

it('scope: no goal means every field', async () => {
  const w = await world();
  const s = await w.setState({ guidanceGoals: [] });
  const { scopeIds } = await w.load(SCOPE);
  expect(scopeIds({ ...s, guidanceGoals: [] })).toBe(null);
});

usIt('scope: convert', async () => {
  const w = await world();
  const s = await w.setState({ guidanceGoals: ['convert'] });
  const { scopeIds } = await w.load(SCOPE);
  const ids = scopeIds(s);
  expect(ids.has('ageA')).toBe(true);
  expect(ids.has('trad401kA')).toBe(true);
  expect(ids.has('stateTax')).toBe(true);
  expect(ids.has('homeValue')).toBe(false);
});

it('scope: single drops the survivor goal and partner B', async () => {
  const w = await world();
  const s = await w.setState({ singlePerson: true, guidanceGoals: ['survivor', 'retire'] });
  const { chosenGoals, goalBroughtIds } = await w.load(SCOPE);
  expect(chosenGoals(s).map((g) => g.key)).toStrictEqual(['retire']);
  expect([...goalBroughtIds(s)].filter((id) => id.endsWith('B'))).toStrictEqual([]);
  expect(s.guidanceGoals).toStrictEqual(['retire', 'survivor']);
});

it('scope: a gated field stays out while its feature is off', async () => {
  const w = await world();
  const { goalBroughtIds } = await w.load(SCOPE);
  const off = await w.setState({ guidanceGoals: ['survivor'], survivorEnabled: false });
  expect(goalBroughtIds(off).has('survivorDeathAge')).toBe(false);
  expect(goalBroughtIds(off).has('lifeExpectancyA')).toBe(true);
  const on = await w.setState({ guidanceGoals: ['survivor'], survivorEnabled: true });
  expect(goalBroughtIds(on).has('survivorDeathAge')).toBe(true);
});

usIt('critical rows follow when', async () => {
  const w = await world();
  const { CRITICAL } = await w.load(FIELDS_PATH);
  const { criticalRows } = await w.load(SCOPE);
  const early = await w.setState({ guidanceGoals: ['retire'], ageA: 40, retireAgeA: 55, rothIraA: 100000 });
  expect(criticalRows(early)).toContainEqual({ id: 'rothIraBasisA', reason: CRITICAL.rothIraBasisA.reason });
  const late = await w.setState({ guidanceGoals: ['retire'], ageA: 40, retireAgeA: 62, rothIraA: 100000 });
  expect(criticalRows(late).some((r) => r.id === 'rothIraBasisA')).toBe(false);
});

it('critical rows: deduplicated in goal order', async () => {
  const w = await world();
  const { criticalRows } = await w.load(SCOPE);
  const s = await w.setState({ guidanceGoals: ['convert', 'legacy'] });
  const ids = criticalRows(s).map((r) => r.id);
  expect(ids).toContain(isUS ? 'stateTax' : 'province');
  expect(new Set(ids).size).toBe(ids.length);
});

it('a goal makes its assumption fields countable', async () => {
  const w = await world();
  await w.setState({ guidanceGoals: [] });
  const est = await w.load('shared/core/inputs/estimates.js');
  expect(est.isEstimateCountable('lifeExpectancyA')).toBe(false);
  await w.setState({ guidanceGoals: ['legacy'] });
  expect(est.isEstimateCountable('lifeExpectancyA')).toBe(true);
});
