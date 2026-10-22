import { describe, it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { usPlan } from '../helpers/us-plan.js';
import { usContributions } from '../helpers/us-contributions.js';

describe('world isolation', () => {
  it('a new world starts pristine', async () => {
    const country = inject('country');
    const w1 = await world();
    const store1 = await w1.load('shared/core/store.js');
    const prefs1 = await w1.load('shared/core/chart-prefs.js');
    store1.assignMode('nominal');
    prefs1.assignLogScale(true);
    expect(store1.mode).toBe('nominal');
    expect(prefs1.logScale).toBe(true);
    if (country === 'us') {
      const ty1 = await w1.load('us/core/tax-year.js');
      ty1.assignCurrentYear(2031);
      expect(ty1.currentYear).toBe(2031);
    }
    const w2 = await world();
    const store2 = await w2.load('shared/core/store.js');
    const prefs2 = await w2.load('shared/core/chart-prefs.js');
    expect(store2.mode).toBe('real');
    expect(prefs2.logScale).toBe(false);
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

  it('setTaxYear on a stale world throws', async () => {
    const w1 = await world();
    await world();
    expect(() => w1.setTaxYear(2030)).toThrow('stale');
  });

  it('helpers built from a superseded world throw; on the current world they work', async () => {
    const country = inject('country');
    const w1 = await world();
    const e1 = await engine(w1);
    const p1 = country === 'us' ? await usPlan(w1) : null;
    const k1 = country === 'us' ? await usContributions(w1) : null;
    expect(() => w1.assertCurrent('x')).not.toThrow();
    await w1.setState();
    expect(typeof e1.simulate(65, 65).rows.length).toBe('number');
    if (p1) expect(typeof p1.rowFnFor({ type: 'flat' })).toBe('function');
    if (k1) expect(k1.allocatePlanRoom(1000, [0, 0]).left).toBe(1000);
    const w2 = await world();
    expect(() => e1.simulate(65, 65)).toThrow('stale');
    expect(() => e1.runMonteCarlo()).toThrow('stale');
    if (p1) {
      expect(() => p1.rowFnFor({ type: 'flat' })).toThrow('stale');
      expect(() => p1.planTrace()).toThrow('stale');
      expect(() => k1.allocatePlanRoom(1000, [0, 0])).toThrow('stale');
    }
    await w2.setState();
    expect(typeof (await engine(w2)).simulate(65, 65).rows.length).toBe('number');
  });
});
