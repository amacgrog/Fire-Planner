// normalizeMarketScenario and its place in both normalizeState functions (hand-written inputs, hand-computed outputs).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

async function load() {
  const w = await world();
  return { w, norm: (await w.load('shared/core/inputs/market-scenario.js')).normalizeMarketScenario };
}

const C1 = { age: 60, drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, inflation: 0.5, bondReturn: 12 };
const C2 = { ...C1, age: 70 };

it('a valid crash scenario round-trips as a fresh object, list order kept', async () => {
  const { norm } = await load();
  const input = { kind: 'crash', order: 'bucket', crashes: [C1, C2] };
  const out = norm(input);
  expect(out).toStrictEqual(input);
  expect(out).not.toBe(input);
  expect(out.crashes[0]).not.toBe(input.crashes[0]);
});

it('clamps and rounds crash fields', async () => {
  const { norm } = await load();
  const out = norm({
    kind: 'crash',
    crashes: [{ age: 60.4, drop: 100, fallYears: 0, recoverPct: 150, recoverYears: 99, inflation: -40, bondReturn: 80 }],
  });
  expect(out.crashes).toStrictEqual([
    { age: 60, drop: 95, fallYears: 1, recoverPct: 100, recoverYears: 30, inflation: -15, bondReturn: 50 },
  ]);
});

it('drops a row with a field that is not a number; no rows left means off', async () => {
  const { norm } = await load();
  const crashes = (rows) => norm({ kind: 'crash', crashes: rows });
  expect(crashes([{ ...C1, drop: 'x' }, C1]).crashes).toStrictEqual([C1]);
  expect(crashes([{ ...C1, age: NaN }])).toBe(undefined);
  for (const bad of ['', null, true, [], '  ', undefined, Infinity]) expect(crashes([{ ...C1, drop: bad }])).toBe(undefined);
  expect(crashes([{ ...C1, drop: '35' }]).crashes).toStrictEqual([C1]);
  expect(crashes([null, C1]).crashes).toStrictEqual([C1]);
});

it('malformed containers are off', async () => {
  const { norm } = await load();
  expect(norm({ kind: 'crash', crashes: 'x' })).toBe(undefined);
  expect(norm({ kind: 'crash', crashes: {} })).toBe(undefined);
  for (const h of [null, [], 5]) expect(norm({ kind: 'history', history: h })).toBe(undefined);
  expect(norm({ kind: 'history', history: { startYear: 1990, atAge: 60, endAge: 'abc' } })).toBe(undefined);
  expect(norm({ kind: 'history', history: { startYear: 1990, atAge: 'q', endAge: null } })).toBe(undefined);
});

it('keeps at most 10 crashes', async () => {
  const { norm } = await load();
  expect(norm({ kind: 'crash', crashes: Array(12).fill(C1) }).crashes.length).toBe(10);
});

it('order: anything but "standard" becomes "bucket"', async () => {
  const { norm } = await load();
  expect(norm({ kind: 'crash', order: 'zzz', crashes: [C1] }).order).toBe('bucket');
  expect(norm({ kind: 'crash', crashes: [C1] }).order).toBe('bucket');
  expect(norm({ kind: 'crash', order: 'standard', crashes: [C1] }).order).toBe('standard');
});

it('an unknown kind, null or a non-object is off', async () => {
  const { norm } = await load();
  for (const raw of [{ kind: 'x', crashes: [C1] }, null, 'str', 5, undefined, [], {}]) expect(norm(raw)).toBe(undefined);
});

it('history: clamps the start year to the data and normalizes endAge', async () => {
  const { norm } = await load();
  const h = (history) => norm({ kind: 'history', history });
  expect(h({ startYear: 1900, atAge: 52, endAge: '' })).toStrictEqual({
    kind: 'history', order: 'bucket', history: { startYear: 1928, atAge: 52, endAge: null },
  });
  expect(h({ startYear: 2100, atAge: 52 }).history.startYear).toBe(2025);
  expect(h({ startYear: 1990, atAge: 52, endAge: 70.6 }).history.endAge).toBe(71);
  expect(h({ startYear: 1990, atAge: 52, endAge: null }).history.endAge).toBe(null);
});

it('keeps only the active kind', async () => {
  const { norm } = await load();
  const out = norm({ kind: 'crash', crashes: [C1], history: { startYear: 1990, atAge: 60, endAge: null } });
  expect('history' in out).toBe(false);
  const h = norm({ kind: 'history', crashes: [C1], history: { startYear: 1990, atAge: 60, endAge: null } });
  expect('crashes' in h).toBe(false);
});

it('normalizeState: no marketScenario key when off, the normalized one when on', async () => {
  const { w, norm } = await load();
  await w.setState({});
  let store = await w.load('shared/core/store.js');
  expect('marketScenario' in store.state).toBe(false);
  await w.setState({ marketScenario: { kind: 'x' } });
  store = await w.load('shared/core/store.js');
  expect('marketScenario' in store.state).toBe(false);
  const raw = { kind: 'crash', order: 'standard', crashes: [{ ...C1, age: 60.4 }] };
  await w.setState({ marketScenario: raw });
  store = await w.load('shared/core/store.js');
  expect(store.state.marketScenario).toStrictEqual({ kind: 'crash', order: 'standard', crashes: [{ ...C1, age: 60 }] });
  expect(store.state.marketScenario.crashes[0].age).toBe(60);
});

it('normalizeState leaves the JSON of a state without a scenario unchanged', async () => {
  const w = await world();
  const path = w.country === 'us' ? 'us/ui/inputs/normalize-state.js' : 'canada/core/inputs/normalize-state.js';
  const { normalizeState } = await w.load(path);
  expect(JSON.stringify(normalizeState({})).includes('marketScenario')).toBe(false);
});

it("kind 'plan' is the plan's own rates: just the order", async () => {
  const { norm } = await load();
  expect(norm({ kind: 'plan' })).toStrictEqual({ kind: 'plan', order: 'bucket' });
  expect(norm({ kind: 'plan', order: 'standard', crashes: [], history: {} })).toStrictEqual({ kind: 'plan', order: 'standard' });
  expect(norm({ kind: 'plan', order: 'x' })).toStrictEqual({ kind: 'plan', order: 'bucket' });
});
