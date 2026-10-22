import { vi, inject } from 'vitest';

// The per-test world: a fresh module graph (vi.resetModules) from which src/ modules are loaded by
// dynamic import. This is the only file under tests/unit/ that names src/ (tests/unit/shared/guard-imports.test.js).
// No loaded module is cached across world() calls.
const TEST_YEAR = 2026;
let generation = 0;
let yearChecked = false;

export async function world() {
  const country = inject('country');
  vi.resetModules();
  const mine = ++generation;
  const cache = new Map();

  const assertCurrent = (what) => {
    if (mine !== generation) throw new Error(what + ': this world is stale (a newer world() was created)');
  };

  const load = async (rel) => {
    assertCurrent('world.load(' + rel + ')');
    if (!cache.has(rel)) {
      cache.set(rel, import(/* @vite-ignore */ new URL('../../../src/' + rel, import.meta.url).href));
    }
    return cache.get(rel);
  };

  const normalizePath = country === 'us' ? 'us/ui/inputs/normalize-state.js' : 'canada/core/inputs/normalize-state.js';
  const taxYear = country === 'us' ? await load('us/core/tax-year.js') : null;

  const w = {
    country,
    load,
    assertCurrent,
    async setState(patch) {
      const { normalizeState } = await load(normalizePath);
      const store = await load('shared/core/store.js');
      store.assignState(normalizeState(patch));
      return store.state;
    },
    setTaxYear(y) {
      assertCurrent('world.setTaxYear');
      if (!taxYear) throw new Error('setTaxYear: Canada has no tax-year setter');
      taxYear.assignCurrentYear(y);
    },
  };

  if (!yearChecked) {
    const { CURRENT_YEAR } = await load('shared/core/projection/year-factors.js');
    if (CURRENT_YEAR !== TEST_YEAR) throw new Error('CURRENT_YEAR is ' + CURRENT_YEAR + ', expected ' + TEST_YEAR + ' (clock not pinned)');
    yearChecked = true;
  }
  return w;
}

// Wraps every function of a helper's public object so it first checks that its world is still the current one.
export function guardWorld(w, obj, name) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'function' ? (...a) => (w.assertCurrent(name + '.' + k), v(...a)) : v;
  }
  return out;
}
