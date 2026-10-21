import { describe, it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';

describe('world isolation', () => {
  it('a new world starts pristine', async () => {
    const country = inject('country');
    const w1 = await world();
    const store1 = await w1.load('shared/core/store.js');
    const tf1 = await w1.load('shared/core/tax-factors.js');
    store1.assignMode('nominal');
    tf1.assignHistTaxFactors([1]);
    expect(store1.mode).toBe('nominal');
    expect(tf1.histTaxFactors).toStrictEqual([1]);
    if (country === 'us') {
      const ty1 = await w1.load('us/core/tax-year.js');
      ty1.assignCurrentYear(2031);
      expect(ty1.currentYear).toBe(2031);
    }
    const w2 = await world();
    const store2 = await w2.load('shared/core/store.js');
    const tf2 = await w2.load('shared/core/tax-factors.js');
    expect(store2.mode).toBe('real');
    expect(tf2.histTaxFactors).toBe(null);
    if (country === 'us') {
      const ty2 = await w2.load('us/core/tax-year.js');
      expect(ty2.currentYear).toBe(2026);
    }
  });

  it('same world shares instances; a new world does not; a stale world throws', async () => {
    const w1 = await world();
    const a = await w1.load('shared/core/store.js');
    const b = await w1.load('shared/core/store.js');
    expect(a).toBe(b);
    const w2 = await world();
    expect(w2).not.toBe(w1);
    const c = await w2.load('shared/core/store.js');
    expect(c).not.toBe(a);
    await expect(w1.load('shared/core/store.js')).rejects.toThrow();
  });
});
